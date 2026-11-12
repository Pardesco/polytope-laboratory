import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { Viewer } from '../ui/viewer.js';
import { DualMorphSession, MORPH_SUPPORTED, morphEligible } from '../ui/dual-morph-session.mjs';
import { snubEligible, snubFrameStatus } from '../ui/snub-morph.mjs';
import { morphSourceOwners } from '../ui/dual-morph-picking.mjs';
import { planMorphElementContent } from '../ui/morph-element-content.mjs';
import { renderMorphElementContent } from '../ui/morph-element-content-renderer.mjs';
import { AnimationRenderer } from '../ui/animation-renderer.mjs';
import { AnimationTrackSessions } from '../ui/animation-track-controls.mjs';
import { AnimationControls } from '../ui/animation-controls.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const python = (script, input) =>
  JSON.parse(
    execFileSync('python', ['-B', '-c', script], {
      cwd: root,
      windowsHide: true,
      encoding: 'utf8',
      input: input && JSON.stringify(input),
      timeout: 30000,
      maxBuffer: 16 * 1024 * 1024,
    })
  );
const native = (request) => {
  const result = python(
    'import json,sys;from engine.server import dispatch\ntry: print(json.dumps(dispatch(json.load(sys.stdin))))\nexcept ValueError as error: print(json.dumps({"__native_error":str(error)}))',
    request
  );
  if (result.__native_error) throw Error(result.__native_error);
  return result;
};
const fixture = python(`import json,base64
from pathlib import Path
from engine.generators import regular
from engine import element_annotations as c
p=regular('cube');p['metadata']['coordinateUnits']='mm'
p['metadata']['offColors']={'faces':[{'encoding':'byte','values':[30*i,100,160,127]} for i in range(6)]}
d=c.new_document(p)
for kind in ('vertex','edge','face'): d=c.set_text(d,p,kind,0,kind+' source label')
assets=json.loads(Path('tests/fixtures/element-content-native-fixture.json').read_text(encoding='utf-8'))['descriptor']['assets']
png=c.set_texture(d,p,0,base64.b64decode(next(iter(assets.values()))['base64']))
print(json.dumps({'source':p,'text':d,'png':png}))`);
const settings = {
  version: 1,
  enabled: true,
  method: 'via-snub',
  center: null,
  radius: Math.SQRT2,
  ratio: 0.25,
  duration: 1,
  loop: false,
};
const context = { notes: 'Literal source notes', unit: 'mm' };
const prepare = (model, s = settings) =>
  native({ op: 'prepare-dual-morph', model, params: { settings: s, sourceContext: context } });
const evaluate = (model, prepared, ratio) =>
  native({ op: 'evaluate-dual-morph', model, params: { prepared, ratio, sourceContext: context } });
const sequence = (start = 0, end = 1) => ({
  version: 3,
  duration: 1,
  fps: 2,
  loop: false,
  tracks: { morphRatio: { kind: 'dual-morph', version: 1 } },
  keyframes: [
    { time: 0, angles: [0, 0, 0, 0, 0, 0], sectionOffset: 0, morphRatio: start },
    { time: 1, angles: [90, 0, 0, 0, 0, 0], sectionOffset: 0, morphRatio: end },
  ],
});
const makeCanvas = () => ({
  width: 0,
  height: 0,
  getContext: () => ({
    clearRect() {},
    drawImage() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    measureText: (t) => ({ width: t.length * 7 }),
    fillText() {},
  }),
});
const contentOptions = (state) => ({
  getState: () => state,
  isCurrent: () => true,
  makeCanvas,
  decodeImage: async () => ({ width: 2, height: 2, close() {} }),
  describe: (model, params) => native({ op: 'element-content-describe', model, params }),
});
function environment(png = false) {
  const state = {
    model: structuredClone(fixture.source),
    notes: context.notes,
    view: {
      coordinateUnit: 'mm',
      angles: [0, 0, 0, 0, 0, 0],
      projection: 'orthographic',
      cameraProjection: 'orthographic',
      vertices: true,
      edges: true,
      faces: true,
      surfaceColors: 'source',
      surfaceOpacity: 1,
      cellFacing: 'all',
      cellShrink: 1,
      sectionOffset: 0,
      elementAnnotations: structuredClone(png ? fixture.png : fixture.text),
      dualMorph: structuredClone(settings),
      animation: sequence(png ? 0.25 : 0, png ? 0.75 : 1),
    },
  };
  const v = Object.create(Viewer.prototype);
  v.group = new THREE.Group();
  v.draw = () => {};
  v.stereographicWorkerFactory = () => null;
  v.perspectiveCamera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
  v.orthographicCamera = new THREE.OrthographicCamera(-1.45, 1.45, 1.45, -1.45, 0.01, 1000);
  v.cameraProjection = 'orthographic';
  v.camera = v.orthographicCamera;
  v.orthographicHalfHeight = 1.45;
  v.controls = { target: new THREE.Vector3(), enabled: true, enableDamping: true, update() {} };
  v.bindControls = () => {};
  v.setModel(state.model);
  const run = async (op, params, model) => native({ op, params, model });
  const c = {
    getState: () => state,
    getModel: () => state.model,
    viewer: v,
    run,
    makeContentCanvas: makeCanvas,
    decodeContentImage: contentOptions(state).decodeImage,
    syncPose() {},
    display() {},
  };
  const renderer = new AnimationRenderer(c);
  Object.assign(c, {
    capabilities: () => renderer.capabilities(),
    loadMorph: (m, s, o) => renderer.loadMorph(m, s, o),
    renderTracks: (p, o) => renderer.renderTracks(p, o),
  });
  return { state, v, context: c, tracks: new AnimationTrackSessions(c) };
}

test('ninth method enables only complete canonical cubes, regardless of catalog label', () => {
  assert.ok(MORPH_SUPPORTED.includes('via-snub'));
  assert.equal(snubEligible(fixture.source), true);
  assert.equal(morphEligible({ ...fixture.source, id: 'unlabelled-user-source' }, 'via-snub'), true);
  for (const change of [
    (p) => (p.vertices[0][0] = 2),
    (p) => p.faces[0].splice(1, 1),
    (p) => (p.edges[0] = p.edges[1]),
    (p) => (p.vertices = p.vertices.map(([x, y, z]) => [x + 0.1, y, z])),
    (p) => (p.interpretation = 'generalized-complex'),
    (p) => (p.dimension = 4),
  ]) {
    const p = structuredClone(fixture.source);
    change(p);
    assert.equal(morphEligible(p, 'via-snub'), false);
  }
  assert.equal(snubEligible(null), false);
});

test('source owners drive actual Viewer text/PNG, endpoint rank changes and literal RGBA', async () => {
  const e = environment(true),
    prepared = prepare(e.state.model),
    source = structuredClone(e.state.model);
  try {
    for (const ratio of [0.001, 0.25, 0.5, 0.75, 0.999]) {
      const frame = evaluate(source, prepared, ratio);
      await renderMorphElementContent(e.v, frame, e.state, contentOptions(e.state));
      assert.equal(e.v.morphFrame.ratio, ratio);
      assert.equal(e.v.model.faces.length, 38);
      assert.ok(e.v.elementContentLayer.group.children.some((o) => o.isMesh && o.userData.sourceFace === 0));
      assert.ok(e.v.elementContentLayer.group.children.some((o) => o.isSprite && o.userData.sourceKind === 'edge'));
      assert.equal((await e.v.prepareCapture()).elementContent.ready, true);
      for (const [kind, field] of [
        ['vertex', 'vertices'],
        ['edge', 'edges'],
        ['face', 'faces'],
      ])
        for (let i = 0; i < frame.model[field].length; i++) assert.ok(morphSourceOwners(frame, kind, i).length);
      assert.match(snubFrameStatus(frame), /planarity.*support violation.*strict gap/);
    }
    const end = evaluate(source, prepared, 1),
      descriptor = await contentOptions(e.state).describe(source, { document: fixture.png, reference_edge_mm: 25 });
    assert.throws(() => planMorphElementContent(source, end, descriptor.entries), /PNG has no output face/);
    e.state.view.elementAnnotations = structuredClone(fixture.text);
    await renderMorphElementContent(e.v, end, e.state, contentOptions(e.state));
    const plan = planMorphElementContent(
      source,
      end,
      (await contentOptions(e.state).describe(source, { document: fixture.text, reference_edge_mm: 25 })).entries
    );
    assert.equal(plan.labels.get('vertex:0')[0].outputRank, 2);
    assert.equal(plan.labels.get('face:0')[0].outputRank, 0);
    assert.deepEqual(e.state.model, source);
  } finally {
    e.v.clear();
  }
});

test('session restore/replay and source ownership reuse existing publication fences', async () => {
  const e = environment(),
    document = { id: 'source', cursor: 0, states: [e.state] },
    project = { active: 0, documents: [document] },
    before = structuredClone(e.state.model);
  let dirty = 0,
    renders = 0,
    time = 0,
    callbacks = [];
  const c = {
    mappedContent: true,
    getState: () => e.state,
    getDocument: () => document,
    getProject: () => project,
    isExporting: () => false,
    prepare: async (m, s) => prepare(m, s),
    evaluate: async (m, p, t) => evaluate(m, p, t),
    render: async () => {
      renders++;
    },
    markDirty: () => dirty++,
    clock: {
      now: () => time,
      request: (fn) => {
        callbacks.push(fn);
        return callbacks.length;
      },
      cancel: () => {
        callbacks = [];
      },
    },
  };
  const session = new DualMorphSession(c);
  try {
    await session.configure(settings, { matchSourceRadius: true });
    assert.equal(session.prepared.settings.center.join(','), '0,0,0');
    const matchingRadius = session.prepared.settings.radius;
    assert.ok(matchingRadius > 0);
    for (const ratio of [0, 0.5, 1]) await session.seek(ratio);
    assert.equal(e.state.view.dualMorph.ratio, 1);
    assert.equal(session.frame.endpointIdentity, 'literal-polar');
    await session.restoreSaved();
    await session.seek(0.5);
    assert.equal(e.state.view.dualMorph.radius, matchingRadius);
    const saved = native({
        op: 'validate-project',
        params: { project: { format: 'polytope-laboratory', version: 1, ...project } },
      }),
      restored = saved.documents[0].states[0];
    assert.deepEqual(restored.model, JSON.parse(JSON.stringify(before)));
    assert.deepEqual(restored.view.dualMorph, e.state.view.dualMorph);
    assert.deepEqual(
      evaluate(restored.model, prepare(restored.model, restored.view.dualMorph), 0.5).model,
      session.frame.model
    );
    await session.seek(1);
    session.play();
    time = 500;
    callbacks.shift()();
    while (session.active) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(e.state.view.dualMorph.ratio, 0.5);
    time = 1000;
    callbacks.shift()();
    while (session.active) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(e.state.view.dualMorph.ratio, 1);
    assert.equal(session.playing, false);
    assert.ok(dirty >= 6);
    const prior = renders;
    e.state.notes = 'changed';
    await assert.rejects(async () => session.seek(0.75), /changed/);
    assert.equal(renders, prior);
  } finally {
    session.invalidate();
    e.v.clear();
  }
});

function exportControls(e, api) {
  const c = Object.create(AnimationControls.prototype);
  Object.assign(c, {
    context: { ...e.context, api },
    nodes: { target: { value: 'base' }, progress: {} },
    generation: 0,
    time: 0.2,
    playing: false,
    exporting: false,
    editing: false,
    trackSessions: e.tracks,
    configure: async () => {},
    update() {},
  });
  return c;
}
test('mathematical-time PNG export evaluates via-snub at endpoints/interior and restores source pose', async () => {
  const e = environment(),
    before = structuredClone(e.state.view),
    images = [];
  let begun = 0,
    finished = 0;
  e.v.image = () => JSON.stringify([e.v.morphFrame.ratio, e.v.model.vertices, e.v.model.faces]);
  const api = {
    animationBegin: async () => {
      begun++;
      return { id: 'snub' };
    },
    animationWrite: async (id, n, image) => images.push(JSON.parse(image)),
    animationFinish: async () => {
      finished++;
      return { path: 'frames' };
    },
    animationAbort: async () => {},
  };
  try {
    await exportControls(e, api).export('png');
    assert.equal(begun, 1);
    assert.equal(finished, 1);
    assert.deepEqual(
      images.map((p) => p[0]),
      [0, 0.5, 1]
    );
    assert.deepEqual(
      images.map((p) => p[1].length),
      [8, 24, 6]
    );
    assert.equal(new Set(images.map(JSON.stringify)).size, 3);
    assert.deepEqual(e.state.view, before);
    assert.equal(e.v.morphFrame.ratio, 0.25);
  } finally {
    e.tracks.reset();
    e.v.clear();
  }
});

test('interior PNG sheets export; collapsed-sheet endpoints and numerical collars refuse', async () => {
  const e = environment(true),
    before = structuredClone(e.state.view);
  let written = 0;
  e.v.image = () => String(e.v.morphFrame.ratio);
  const api = {
    animationBegin: async () => ({ id: 'snub' }),
    animationWrite: async () => {
      written++;
    },
    animationFinish: async () => ({ path: 'frames' }),
    animationAbort: async () => {},
  };
  try {
    await exportControls(e, api).export('png');
    assert.equal(written, 3);
    assert.deepEqual(e.state.view, before);
    for (const seq of [sequence(0, 1), sequence(0, 0.0005)]) {
      e.state.view.animation = seq;
      let begun = false;
      await assert.rejects(
        exportControls(e, {
          animationBegin: async () => {
            begun = true;
          },
        }).export('png'),
        /PNG has no output face|unresolved/
      );
      assert.equal(begun, false);
    }
  } finally {
    e.tracks.reset();
    e.v.clear();
  }
});
