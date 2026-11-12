import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  createSequence,
  normalizeSequence,
  evaluateSequence,
  evaluateNormalized,
  withSequenceTracks,
  setSequenceKeyframe,
  resizeSequence,
  sequenceFrameTimes,
} from '../ui/animation.mjs';
import { cameraOrbitFromView, applyAnimationV4Frame } from '../ui/animation-v4-view.mjs';
import { sequenceLanes } from '../ui/animation-track-registry.mjs';
import { prepareAnimationAdapters } from '../ui/animation-adapters.mjs';
import { AnimationRenderer } from '../ui/animation-renderer.mjs';
import { AnimationControls } from '../ui/animation-controls.mjs';
import { AnimationTrackSessions } from '../ui/animation-track-controls.mjs';
import { Viewer } from '../ui/viewer.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
const tracks = { camera: {}, projection: {}, opacity: {}, sectionNormal: {} };
const view = () => ({
  angles: [10, 20, 30, 40, 50, 60],
  sectionOffset: 0,
  sectionNormal: [0, 0, 0, 1],
  projection: 'perspective',
  perspectiveDistance4D: 3,
  surfaceOpacity: 0.8,
  cameraProjection: 'perspective',
  camera: {
    position: [1, 2, 8],
    target: [1, 2, 3],
    projection: 'perspective',
    zoom: 1,
    up: [0, 1, 0],
    orthographicHalfHeight: 1.45,
  },
});
function sequence() {
  const value = withSequenceTracks(createSequence(view(), 2, 4), tracks, view());
  Object.assign(value.keyframes[1], {
    camera: { azimuth: 360, elevation: 60, distance: 9 },
    projection: 7,
    opacity: 0,
    sectionNormal: [0, 0, 1, 0],
  });
  return value;
}

test('v1-v3 copied legacy fixtures normalize and JSON roundtrip without migration', () => {
  const fixtures = JSON.parse(readFileSync(new URL('./fixtures/animation-v1-v3.json', import.meta.url)));
  for (const fixture of fixtures) {
    const before = structuredClone(fixture);
    assert.deepEqual(normalizeSequence(fixture), fixture);
    assert.deepEqual(normalizeSequence(JSON.parse(JSON.stringify(fixture))), fixture);
    assert.deepEqual(evaluateSequence(fixture, 0), fixture.keyframes[0]);
    assert.deepEqual(evaluateSequence(fixture, fixture.duration), fixture.keyframes[1]);
    const frame = evaluateSequence(fixture, fixture.duration / 2);
    assert.equal(frame.angles[0], 190);
    assert.equal(frame.sectionOffset, 0);
    for (const key of ['explosionAmount', 'foldFraction', 'morphRatio'])
      if (Object.hasOwn(fixture.keyframes[0], key)) assert.equal(frame[key], 0.5);
    for (const key of Object.keys(tracks)) assert.ok(!Object.hasOwn(frame, key));
    assert.deepEqual(fixture, before);
  }
});

test('v4 requires a new track and legacy versions still reject all v4 fields', () => {
  assert.throws(
    () => normalizeSequence({ ...createSequence(), version: 4, tracks: { fold: { kind: 'face-net' } } }),
    /Version 4/
  );
  for (const version of [1, 2, 3])
    assert.throws(() => normalizeSequence({ ...sequence(), version }), /tracks|unsupported|version/i);
  for (const key of Object.keys(tracks)) assert.equal(withSequenceTracks(createSequence(), { [key]: {} }).version, 4);
});

test('camera spherical coordinates interpolate directly through full turns and preserve target', () => {
  const s = sequence(),
    frame = evaluateSequence(s, 1);
  assert.deepEqual(frame.camera, { azimuth: 180, elevation: 30, distance: 7 });
  const pose = applyAnimationV4Frame(structuredClone(view()), frame);
  close(pose.camera.position[0], 1);
  close(pose.camera.position[1], 5.5);
  close(pose.camera.position[2], 3 - (7 * Math.sqrt(3)) / 2);
  assert.deepEqual(pose.camera.target, [1, 2, 3]);
  close(cameraOrbitFromView(view()).distance, 5);
});

test('section normal slerp follows the oriented great circle, including negative dot products', () => {
  const s = sequence(),
    middle = evaluateSequence(s, 1).sectionNormal;
  close(middle[2], Math.SQRT1_2);
  close(middle[3], Math.SQRT1_2);
  close(Math.hypot(...middle), 1);
  s.keyframes[1].sectionNormal = [0, 0, Math.sqrt(3) / 2, -0.5];
  const n = evaluateSequence(s, 1).sectionNormal;
  close(n[2], Math.sqrt(3) / 2);
  close(n[3], 0.5);
  s.keyframes[1].sectionNormal = [0, 0, 1e-7, 1];
  close(Math.hypot(...evaluateSequence(s, 1).sectionNormal), 1);
});

test('normalization detaches frames, normalizes nonzero normals and refuses antipodes before playback', () => {
  const s = sequence();
  s.keyframes[0].sectionNormal = [0, 0, 0, 4];
  const checked = normalizeSequence(s);
  assert.deepEqual(checked.keyframes[0].sectionNormal, [0, 0, 0, 1]);
  for (const normal of [
    [0, 0, 0, -1],
    [0, 0, 1e-6, -1],
  ]) {
    const bad = structuredClone(s);
    bad.keyframes[1].sectionNormal = normal;
    assert.throws(() => normalizeSequence(bad), /antipodal.*intermediate normal/);
  }
  s.keyframes[1].sectionNormal = [0, 0, 0, -1];
  s.keyframes.splice(1, 0, { ...structuredClone(s.keyframes[0]), time: 1, sectionNormal: [0, 0, 1, 0] });
  assert.equal(normalizeSequence(s).keyframes.length, 3);
});

test('bounded finite values, unknown fields, sparse arrays and accessors refuse without invoking getters', () => {
  for (const [field, values] of [
    ['projection', [0, -1, 101, Infinity, true]],
    ['opacity', [-0.1, 1.1, NaN, '1']],
    [
      'sectionNormal',
      [
        [0, 0, 0, 0],
        [0, 0, 1],
        [0, 0, 0, Infinity],
      ],
    ],
  ])
    for (const value of values) {
      const s = sequence();
      s.keyframes[0][field] = value;
      assert.throws(() => normalizeSequence(s));
    }
  for (const [field, value] of [
    ['azimuth', 1e6 + 1],
    ['elevation', 91],
    ['distance', 0],
    ['distance', 1e6 + 1],
  ]) {
    const s = sequence();
    s.keyframes[0].camera[field] = value;
    assert.throws(() => normalizeSequence(s));
  }
  const s = sequence();
  s.tracks.camera = { roll: true };
  assert.throws(() => normalizeSequence(s), /unsupported/);
  const sparse = sequence();
  delete sparse.keyframes[0].sectionNormal[1];
  assert.throws(() => normalizeSequence(sparse), /holes/);
  const accessor = sequence();
  let calls = 0;
  Object.defineProperty(accessor.keyframes[0].camera, 'azimuth', {
    get() {
      calls++;
      return 0;
    },
  });
  assert.throws(() => normalizeSequence(accessor), /accessors/);
  assert.equal(calls, 0);
});

test('v4 evaluation is deterministic under reordered seeks and never aliases saved objects', () => {
  const s = normalizeSequence(sequence()),
    before = structuredClone(s),
    expected = sequenceFrameTimes(s).map((t) => evaluateNormalized(s, t));
  for (const t of [2, 0, 0.7, 1, 1.99, -4, 99]) evaluateNormalized(s, t);
  assert.deepEqual(
    sequenceFrameTimes(s).map((t) => evaluateNormalized(s, t)),
    expected
  );
  assert.deepEqual(s, before);
  for (const t of [0, 1, 2]) {
    const frame = evaluateNormalized(s, t);
    frame.camera.distance = 999;
    frame.sectionNormal[0] = 999;
    frame.angles[0] = 999;
    assert.deepEqual(s, before);
  }
  assert.deepEqual(normalizeSequence(JSON.parse(JSON.stringify(s))), s);
});

test('record captures the current view, keeps azimuth winding and retains absent properties', () => {
  let s = sequence();
  const v = view();
  Object.assign(v, { perspectiveDistance4D: 5, surfaceOpacity: 0.3, sectionNormal: [1, 0, 0, 0] });
  v.camera.position = [6, 2, 3];
  s = setSequenceKeyframe(s, 1, v);
  const f = s.keyframes[1];
  assert.equal(f.camera.azimuth, 90);
  assert.equal(f.camera.distance, 5);
  assert.equal(f.projection, 5);
  assert.equal(f.opacity, 0.3);
  assert.deepEqual(f.sectionNormal, [1, 0, 0, 0]);
  const unchanged = setSequenceKeyframe(s, 2, { angles: v.angles, sectionOffset: 0 });
  assert.deepEqual(unchanged.keyframes[2].camera, s.keyframes[2].camera);
  const winding = setSequenceKeyframe(sequence(), 2, view());
  close(winding.keyframes[1].camera.azimuth, 360);
});

test('track enable/remove and duration changes retain every existing track and keyframe', () => {
  const s = sequence(),
    base = withSequenceTracks(s, {});
  assert.equal(base.version, 1);
  const enabled = withSequenceTracks(base, tracks, view());
  assert.equal(enabled.keyframes[0].opacity, 0.8);
  assert.deepEqual(withSequenceTracks(s, tracks), normalizeSequence(s));
  const longer = resizeSequence(setSequenceKeyframe(s, 1, view()), 4);
  assert.equal(longer.keyframes[1].time, 2);
  assert.equal(longer.keyframes[2].camera.azimuth, 360);
  const morph = withSequenceTracks(s, { morphRatio: { kind: 'dual-morph', version: 1 } });
  assert.equal(morph.version, 3);
});

test('registered lanes use stored fields and correctly detect a constant camera record', () => {
  const s = withSequenceTracks(createSequence(), tracks),
    lanes = sequenceLanes(s);
  for (const key of Object.keys(tracks)) {
    const lane = lanes.find((l) => l.key === key);
    assert.ok(lane?.subtitle);
    assert.equal(lane.varies, false);
    assert.equal(typeof lane.format(s.keyframes[0][key]), 'string');
  }
  s.keyframes[1].camera.azimuth = 360;
  assert.equal(sequenceLanes(s).find((l) => l.key === 'camera').varies, true);
});

function model() {
  return {
    id: 'v4-simplex',
    fingerprint: 'a'.repeat(64),
    dimension: 4,
    embeddingDimension: 4,
    vertices: [
      [0, 0, 0, 0],
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ],
    edges: [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [1, 2],
      [1, 3],
      [1, 4],
      [2, 3],
      [2, 4],
      [3, 4],
    ],
    faces: [
      [0, 1, 2],
      [0, 1, 3],
      [0, 1, 4],
      [0, 2, 3],
      [0, 2, 4],
      [0, 3, 4],
      [1, 2, 3],
      [1, 2, 4],
      [1, 3, 4],
      [2, 3, 4],
    ],
    cells: [
      [0, 1, 3, 6],
      [0, 2, 4, 7],
      [1, 2, 5, 8],
      [3, 4, 5, 9],
      [6, 7, 8, 9],
    ],
    interpretation: 'convex-polytope',
  };
}
function environment() {
  const state = { model: model(), view: { ...view(), derivedMode: 'section', animation: sequence() } },
    viewer = Object.create(Viewer.prototype),
    samples = [],
    sections = [];
  Object.assign(viewer, {
    group: new THREE.Group(),
    perspectiveCamera: new THREE.PerspectiveCamera(38, 1, 0.01, 1000),
    orthographicCamera: new THREE.OrthographicCamera(-1.45, 1.45, 1.45, -1.45, 0.01, 1000),
    cameraProjection: 'perspective',
    orthographicHalfHeight: 1.45,
    controls: { target: new THREE.Vector3(), enabled: true, enableDamping: true, update() {} },
    stereographicWorkerFactory: () => null,
  });
  viewer.camera = viewer.perspectiveCamera;
  viewer.bindControls = () => viewer.camera.lookAt(viewer.controls.target);
  viewer.setModel(state.model);
  viewer.restoreCamera(state.view.camera);
  viewer.renderer = { domElement: { width: 16, height: 16 }, setClearColor() {} };
  viewer.draw = () => {};
  viewer.image = () =>
    JSON.stringify({
      camera: viewer.cameraState(),
      opacity: viewer.surface.material.opacity,
      points: viewer.projected.map((p) => p.point),
    });
  const context = {
    getState: () => state,
    getModel: () => state.model,
    viewer,
    netViewer: { draw() {} },
    display: () => viewer.setDisplay(state.view),
    refreshSection: async () => sections.push([...state.view.sectionNormal]),
    refreshDerived: async () => {},
    syncPose() {},
    setStatus() {},
  };
  const renderer = new AnimationRenderer(context);
  Object.assign(context, {
    capabilities: () => renderer.capabilities(),
    renderTracks: async (p, o) => {
      await renderer.renderTracks(p, o);
      if (!p.restoring) samples.push({ frame: p.frame, image: viewer.image() });
    },
  });
  const sessions = new AnimationTrackSessions(context);
  return { state, viewer, renderer, context, sessions, samples, sections };
}

test('actual Three geometry, observer camera and face material receive evaluated poses; normals refresh sections', async () => {
  const e = environment(),
    before = structuredClone(e.state),
    camera = e.viewer.cameraState(),
    session = await e.sessions.prepare(e.state.view.animation);
  await session.apply(0, e.context.renderTracks);
  const start = e.viewer.projected.map((p) => [...p.point]);
  await session.apply(1, e.context.renderTracks);
  assert.notDeepEqual(
    e.viewer.projected.map((p) => p.point),
    start
  );
  close(e.viewer.surface.material.opacity, 0.4);
  close(e.viewer.camera.position.y, 5.5);
  assert.equal(e.viewer.perspectiveSettings.distance, 5);
  assert.equal(e.sections.length, 1);
  const first = e.viewer.image();
  await session.apply(2, e.context.renderTracks);
  await session.apply(1, e.context.renderTracks);
  assert.equal(e.viewer.image(), first);
  session.cancel();
  await session.restore(e.context.renderTracks);
  assert.deepEqual(e.state, before);
  assert.deepEqual(e.viewer.cameraState(), camera);
  e.sessions.reset();
});

test('normal-only motion at fixed depth refreshes the section and clears stale alignment', async () => {
  const e = environment();
  e.state.view.animation = withSequenceTracks(e.state.view.animation, { sectionNormal: {} });
  e.state.view.animation.keyframes[1].angles = [...e.state.view.animation.keyframes[0].angles];
  e.state.view.sectionAlignment = { stale: true };
  const session = await e.sessions.prepare(e.state.view.animation);
  await session.apply(1, e.context.renderTracks);
  assert.equal(e.sections.length, 1);
  assert.equal(e.state.view.sectionAlignment, undefined);
  e.sessions.reset();
});

test('preflight refuses invalid projection/normal domains before mutating saved state', async () => {
  for (const change of [
    (s) => (s.model.dimension = 3),
    (s) => (s.view.projection = 'orthographic'),
    (s) => (s.view.perspectiveNear4D = 4),
  ]) {
    const e = environment();
    change(e.state);
    const before = structuredClone(e.state);
    await assert.rejects(() => prepareAnimationAdapters({ state: e.state }), /4D|eye distance/);
    assert.deepEqual(e.state, before);
  }
});

test('camera restore retains the real observer when its snapshot was absent from the saved view', async () => {
  const e = environment();
  delete e.state.view.camera;
  const before = structuredClone(e.state.view),
    camera = e.viewer.cameraState(),
    session = await e.sessions.prepare(e.state.view.animation);
  await session.apply(1, e.context.renderTracks);
  await session.restore(e.context.renderTracks);
  assert.deepEqual(e.state.view, before);
  assert.deepEqual(e.viewer.cameraState(), camera);
  e.sessions.reset();
});

for (const format of ['png', 'webm', 'gif', 'mp4'])
  test(`${format} export shares deterministic v4 poses and restores view/camera on success and cancel`, async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'VideoEncoder'),
      frameDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'VideoFrame');
    globalThis.VideoEncoder = class {
      static isConfigSupported() {}
    };
    globalThis.VideoFrame = class {};
    try {
      for (const cancel of [false, true]) {
        const e = environment(),
          saved = structuredClone(e.state),
          camera = e.viewer.cameraState(),
          exports = [];
        let aborted = 0,
          controls;
        Object.assign(e.context, {
          api: {
            animationBegin: async () => ({ id: 'v4' }),
            animationWrite: async (_id, _index, data) => {
              exports.push(data);
              if (cancel) controls.cancel();
            },
            animationFinish: async () => ({ path: 'v4 export' }),
            animationAbort: async () => {
              aborted++;
            },
          },
        });
        controls = Object.assign(Object.create(AnimationControls.prototype), {
          context: e.context,
          trackSessions: e.sessions,
          time: 0.25,
          generation: 0,
          exporting: false,
          playing: false,
          update() {},
          configure: async () => {},
          nodes: { target: { value: 'base' }, progress: {} },
        });
        controls.recordVideo = async (v, s, times, source, generation, id, check, _target, options) => {
          assert.equal(options.framing, 'viewport');
          for (let i = 0; i < times.length; i++) {
            check();
            await controls.apply(s, times[i], source, generation);
            check();
            await e.context.api.animationWrite(id, i, v.image());
          }
        };
        await controls.export(format);
        assert.deepEqual(e.state, saved);
        assert.deepEqual(e.viewer.cameraState(), camera);
        assert.equal(controls.time, 0.25);
        assert.equal(e.viewer.controls.enabled, true);
        assert.equal(aborted, cancel ? 1 : 0);
        if (cancel) assert.equal(exports.length, 1);
        else {
          const first = [...exports];
          exports.length = 0;
          await controls.export(format);
          assert.deepEqual(exports, first);
          assert.equal(exports.length, 9);
        }
        e.sessions.reset();
      }
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'VideoEncoder', descriptor);
      else delete globalThis.VideoEncoder;
      if (frameDescriptor) Object.defineProperty(globalThis, 'VideoFrame', frameDescriptor);
      else delete globalThis.VideoFrame;
    }
  });

test('addTrack camera recipe starts at the current camera and preserves existing tracks', async () => {
  const e = environment();
  e.state.view.animation = withSequenceTracks(e.state.view.animation, { opacity: {} });
  e.viewer.camera.position.set(6, 2, 3);
  const controls = Object.assign(Object.create(AnimationControls.prototype), {
    context: e.context,
    trackSessions: e.sessions,
    nodes: { loop: { checked: false } },
    update() {},
    save: AnimationControls.prototype.save,
    time: 1,
  });
  controls.numericAction = async (_keys, _fields, publish) => publish({ duration: 2, fps: 4 }, () => {});
  await controls.addTrack('camera');
  const s = e.state.view.animation;
  assert.equal(s.keyframes[0].camera.azimuth, 90);
  assert.equal(s.keyframes[1].camera.azimuth, 450);
  assert.equal(s.keyframes[0].opacity, 0.8);
  e.sessions.reset();
});
