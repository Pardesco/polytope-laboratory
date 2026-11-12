import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { Viewer } from '../ui/viewer.js';
import { morphEligible } from '../ui/dual-morph-session.mjs';
import { normalizeTransition } from '../ui/transitions.mjs';
import {
  prepareAnimatedTourTimeline,
  evaluateAnimatedTour,
  animatedTourFrameTimes,
} from '../ui/animated-tour-timeline.mjs';
import { AnimatedTourRenderer } from '../ui/animated-tour-renderer.mjs';
import { AnimatedTourExporter } from '../ui/animated-tour-export.mjs';
import { recordRenderedVideo } from '../ui/video-recorder.mjs';
import { WebmFrameCounter } from '../ui/webm-frames.mjs';

const root = fileURLToPath(new URL('../', import.meta.url)),
  tick = () => new Promise((r) => setImmediate(r));
const native = (script, input) =>
  JSON.parse(
    execFileSync('python', ['-B', '-c', script], {
      cwd: root,
      input: input && JSON.stringify(input),
      windowsHide: true,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
      maxBuffer: 32 * 1024 * 1024,
    })
  );
const fixture = native(`import json
from engine.generators import regular
from engine.operations import dual
from engine.server import dispatch
p=regular('cube');t=regular('tesseract')
frames={};context={'unit':'model','notes':''}
for method in ('sizing','truncation'):
 settings={'version':1,'enabled':True,'method':method,'center':None,'radius':2**.5,'ratio':0,'duration':1,'loop':False}
 prepared=dispatch({'op':'prepare-dual-morph','model':t,'params':{'settings':settings,'sourceContext':context}})
 frames[method]=[dispatch({'op':'evaluate-dual-morph','model':t,'params':{'prepared':prepared,'ratio':ratio,'sourceContext':context}}) for ratio in (0,.25,.5,.75,1)]
print(json.dumps({'cube':p,'octa':dual(p,radius=1.25),'tesseract':t,'cell16':dual(t,radius=1.25),'frames':frames}))`);
const run = async (op, params, model) =>
  native('import sys,json;from engine.server import dispatch;print(json.dumps(dispatch(json.load(sys.stdin))))', {
    op,
    params,
    model,
  });
const state = (model) => ({
  model: structuredClone(model),
  notes: 'Retained tour notes',
  view: {
    angles: Array(6).fill(0),
    sectionOffset: 0,
    viewportLayout: 'single',
    projection: 'orthographic',
    cameraProjection: 'orthographic',
    faces: true,
    edges: true,
    vertices: true,
    surfaceOpacity: 1,
    cellShrink: 1,
    cellFacing: 'all',
  },
});
function bank(key = 'cube', target = key === 'cube' ? 'octa' : 'cell16') {
  return {
    version: 2,
    cursor: 0,
    events: [
      {
        id: 'p',
        duration: 1,
        state: state(fixture[key]),
        transition: { method: 'morph-to-dual', duration: 1, easing: 'linear' },
      },
      { id: 'q', duration: 1, state: state(fixture[target]), transition: { method: 'instant' } },
    ],
  };
}

function codec(canvas) {
  const snapshots = [],
    writes = [];
  class Frame {
    constructor(canvas, options) {
      Object.assign(this, options, { pose: canvas.pose });
      snapshots.push(this);
    }
    close() {
      this.closed = true;
    }
  }
  class Encoder {
    static async isConfigSupported() {
      return { supported: true };
    }
    constructor(callbacks) {
      this.callbacks = callbacks;
      this.queue = [];
    }
    configure() {}
    encode(frame, { keyFrame }) {
      assert.ok(!frame.closed);
      this.queue.push({ timestamp: frame.timestamp, pose: frame.pose, type: keyFrame ? 'key' : 'delta' });
    }
    async flush() {
      await tick();
      for (const frame of this.queue.splice(0)) {
        const data = new TextEncoder().encode(String(frame.pose));
        this.callbacks.output({
          timestamp: frame.timestamp,
          type: frame.type,
          byteLength: data.length,
          copyTo: (target) => target.set(data),
        });
      }
    }
    close() {}
  }
  return {
    snapshots,
    writes,
    args: {
      canvas,
      Frame,
      Encoder,
      pollInterval: 1,
      wait: tick,
      writeChunk: async (index, data) => {
        await tick();
        writes.push({ index, data: data.slice() });
      },
    },
  };
}

test('4D sizing and truncation eligibility is convex-only and retains unsupported method guards', () => {
  for (const method of ['sizing', 'truncation', 'expansion', 'tilting-quads'])
    assert.equal(morphEligible(fixture.tesseract, method), true);
  for (const method of ['augmentation', 'tilting-triangles', 'tilting-to-compound', 'tilting-to-rectify', 'via-snub'])
    assert.equal(morphEligible(fixture.tesseract, method), false);
  for (const method of ['sizing', 'truncation'])
    assert.equal(morphEligible({ ...fixture.tesseract, interpretation: 'generalized-complex' }, method), false);
});

test('morph-to-dual is an explicit single-layer absolute-time transition with exact endpoint boundary', () => {
  const saved = bank(),
    original = structuredClone(saved),
    plan = prepareAnimatedTourTimeline(saved);
  assert.equal(plan.duration, 3);
  assert.equal(evaluateAnimatedTour(plan, 0.5).layers[0].state.view.dualMorph, undefined);
  for (const [time, ratio] of [
    [1, 0],
    [1.25, 0.25],
    [1.5, 0.5],
    [1.75, 0.75],
  ]) {
    const frame = evaluateAnimatedTour(plan, time);
    assert.equal(frame.layers.length, 1);
    assert.equal(frame.layers[0].animation.frame.morphRatio, ratio);
    assert.equal(frame.layers[0].transitionPose.opacity, 1);
    assert.equal(frame.layers[0].dualTarget.fingerprint, fixture.octa.fingerprint);
  }
  assert.equal(evaluateAnimatedTour(plan, 2).layers[0].modelFingerprint, fixture.octa.fingerprint);
  evaluateAnimatedTour(plan, 2.5);
  assert.equal(evaluateAnimatedTour(plan, 1.25).layers[0].animation.frame.morphRatio, 0.25);
  assert.deepEqual(saved, original);
});

test('morph-to-dual starts at the actual terminal phase of a looping event animation', () => {
  const saved = bank();
  saved.events[0].duration = 1.25;
  saved.events[0].state.view.animation = {
    version: 1,
    duration: 1,
    fps: 4,
    loop: true,
    keyframes: [
      { time: 0, angles: Array(6).fill(0), sectionOffset: 0 },
      { time: 1, angles: [360, 0, 0, 0, 0, 0], sectionOffset: 0 },
    ],
  };
  const frame = evaluateAnimatedTour(prepareAnimatedTourTimeline(saved), 1.25);
  assert.equal(frame.layers[0].animation.frame.angles[0], 90);
  assert.equal(frame.layers[0].animation.frame.morphRatio, 0);
});

test('invalid dual event pairs, unsupported track combinations, and combination component use refuse before playback', () => {
  assert.throws(() => prepareAnimatedTourTimeline(bank('cube', 'cell16')), /next event.*native dual/);
  const altered = bank();
  altered.events[1].state.model.provenance.sourceFingerprint = '0'.repeat(64);
  assert.throws(() => prepareAnimatedTourTimeline(altered), /native dual/);
  const enabled = bank();
  enabled.events[0].state.view.dualMorph = { enabled: true };
  assert.throws(() => prepareAnimatedTourTimeline(enabled), /Reset/);
  assert.throws(
    () => normalizeTransition({ method: 'combination', components: ['morph-to-dual', 'sideways'] }),
    /supported components/
  );
});

test('offline frame scheduler and VP8 writer preserve exactly N poses and timestamps across arbitrary slow rendering', async () => {
  const times = [0, 0.125, 0.25, 0.26],
    outputs = [];
  for (const delay of [0, 140]) {
    const canvas = { width: 32, height: 24, pose: null },
      h = codec(canvas),
      requested = [];
    const result = await recordRenderedVideo({
      ...h.args,
      fps: 8,
      frameCount: times.length,
      frameTimes: times,
      renderFrame: async (index) => {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        requested.push(times[index]);
        canvas.pose = times[index];
      },
    });
    assert.deepEqual(requested, times);
    assert.deepEqual(result.sourceTimes, times);
    assert.deepEqual(result.timestamps, [0, 125000, 250000, 260000]);
    assert.equal(result.encodedFrames, 4);
    assert.equal(result.submittedFrames, 4);
    assert.ok(h.snapshots.every((f) => f.closed));
    assert.deepEqual(
      h.snapshots.map((f) => f.pose),
      times
    );
    assert.deepEqual(
      h.snapshots.map((f) => f.duration),
      [125000, 125000, 10000, 125000]
    );
    const counter = new WebmFrameCounter();
    for (const chunk of h.writes) counter.feed(chunk.data);
    assert.equal(counter.frames, 4);
    outputs.push(h.writes.map((chunk) => Array.from(chunk.data)));
  }
  assert.deepEqual(outputs[0], outputs[1]);
});

test('tour offline exporter uses the same exact frame pipeline and cancels without finishing staging', async () => {
  for (const cancel of [false, true]) {
    const tour = bank();
    tour.events[0].transition = { method: 'instant' };
    tour.events[0].duration = 0.13;
    tour.events[1].duration = 0.13;
    const timeline = prepareAnimatedTourTimeline(tour),
      times = animatedTourFrameTimes(timeline, 8),
      canvas = { width: 32, height: 24 },
      h = codec(canvas),
      applied = [];
    let completed = false,
      aborted = false,
      cancelled = false;
    const renderer = {
      timeline,
      canvas,
      published: null,
      ownerCurrent: () => true,
      cancel() {
        cancelled = true;
      },
      current: (p) => p.complete,
      async apply(time) {
        await tick();
        await tick();
        canvas.pose = time;
        applied.push(time);
        return { time, complete: true };
      },
    };
    const exporter = new AnimatedTourExporter({
      renderer,
      api: {
        animationBegin: async () => ({ id: 'offline' }),
        animationWrite: (id, index, data) => h.args.writeChunk(index, data),
        animationFinish: async () => {
          completed = true;
          return { path: 'tour.webm' };
        },
        animationAbort: async () => {
          aborted = true;
        },
      },
      recordVideo: (options) => recordRenderedVideo({ ...h.args, ...options }),
      onProgress: (p) => {
        if (cancel && p.progress === 2) exporter.cancel();
      },
    });
    if (cancel) {
      await assert.rejects(exporter.export('webm', { fps: 8 }), /cancelled/);
      assert.equal(completed, false);
      assert.equal(aborted, true);
      assert.equal(h.snapshots.length, 2);
    } else {
      await exporter.export('webm', { fps: 8 });
      assert.equal(completed, true);
      assert.equal(aborted, false);
      assert.deepEqual(applied, times);
      assert.deepEqual(
        h.snapshots.map((f) => f.timestamp),
        [0, 125000, 250000, 260000]
      );
    }
    assert.equal(exporter.exporting, false);
    assert.equal(cancelled, true);
  }
});

function canvas() {
  const c = { width: 240, height: 160, pose: null };
  c.getContext = () => ({
    save() {},
    restore() {},
    fillRect() {},
    drawImage(source) {
      c.pose = source.pose;
    },
  });
  return c;
}
function viewer() {
  const v = Object.create(Viewer.prototype);
  v.group = new THREE.Group();
  v.stereographicWorkerFactory = () => null;
  v.perspectiveCamera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
  v.orthographicCamera = new THREE.OrthographicCamera(-1.45, 1.45, 1.45, -1.45, 0.01, 1000);
  v.cameraProjection = 'orthographic';
  v.camera = v.orthographicCamera;
  v.orthographicHalfHeight = 1.45;
  v.controls = { target: new THREE.Vector3(), enabled: true, enableDamping: true, update() {} };
  v.bindControls = () => {};
  v.renderer = { domElement: canvas(), setClearColor() {} };
  v.draw = () => {
    v.renderer.domElement.pose = v.morphFrame?.ratio ?? 'base';
  };
  return v;
}

test('4D native sizing and truncation rebuild actual Viewer buffers at every pose while retaining the observer', async () => {
  const source = fixture.tesseract,
    before = structuredClone(source),
    view = state(source).view,
    v = viewer();
  v.setModel(source);
  v.setDisplay(view);
  const camera = v.camera,
    cameraState = v.cameraState();
  try {
    for (const method of ['sizing', 'truncation'])
      for (const frame of fixture.frames[method]) {
        v.setMorphFrame(frame, source, view);
        assert.equal(v.morphFrame.ratio, frame.ratio);
        assert.equal(v.pointGeometry.attributes.position.count, frame.model.vertices.length);
        assert.deepEqual(v.model.cells, frame.model.cells);
        assert.equal(v.camera, camera);
        assert.deepEqual(v.cameraState(), cameraState);
        assert.equal((await v.prepareCapture()).complete, true);
      }
    assert.deepEqual(source, before);
  } finally {
    v.clear();
  }
});

for (const key of ['cube', 'tesseract'])
  test(`live ${key} tour transition adopts actual native morph geometry and refuses a forged target`, async () => {
    const tour = bank(key),
      original = structuredClone(tour),
      sourceState = state(fixture[key]),
      project = {},
      actors = [],
      requests = [];
    const renderer = new AnimatedTourRenderer({
      tour,
      canvas: canvas(),
      createCanvas: canvas,
      getOwner: () => ({ tour, project, sourceState }),
      createLayer: ({ getState }) => {
        const v = viewer(),
          n = viewer();
        actors.push(v);
        return {
          viewer: v,
          netViewer: n,
          run: async (...args) => {
            requests.push(args[0]);
            return run(...args);
          },
          prepareLayout: async () => {},
          display: () => v.setDisplay(getState().view),
          syncPose() {},
          dispose() {
            v.clear();
            n.clear();
          },
        };
      },
    });
    try {
      await renderer.apply(1.25);
      assert.equal(actors[0].morphFrame.ratio, 0.25);
      const vertices = structuredClone(actors[0].model.vertices);
      await renderer.apply(1.75);
      assert.equal(actors[0].morphFrame.ratio, 0.75);
      assert.notDeepEqual(actors[0].model.vertices, vertices);
      await renderer.apply(1.25);
      assert.deepEqual(actors[0].model.vertices, vertices);
      assert.equal(requests.filter((op) => op === 'verify-dual-tour').length, 1);
      await renderer.apply(0.5);
      assert.equal(actors[0].morphFrame, null);
      await renderer.apply(1.5);
      assert.equal(actors[0].morphFrame.ratio, 0.5);
      assert.deepEqual(tour, original);
      assert.deepEqual(sourceState, state(fixture[key]));
    } finally {
      await renderer.close();
    }
    const forged = bank(key);
    forged.events[1].state.model.vertices[0][0] += 0.01;
    await assert.rejects(
      run('verify-dual-tour', { target: forged.events[1].state.model }, forged.events[0].state.model)
    );
  });
