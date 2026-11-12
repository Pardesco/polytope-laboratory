import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Viewer } from '../ui/viewer.js';
import { DualMorphSession, morphEligible } from '../ui/dual-morph-session.mjs';
import { DualMorphControls } from '../ui/dual-morph-controls.mjs';
import { morphSourceOwners } from '../ui/dual-morph-picking.mjs';
import { planMorphElementContent } from '../ui/morph-element-content.mjs';
import { renderMorphElementContent } from '../ui/morph-element-content-renderer.mjs';
import { AnimationRenderer } from '../ui/animation-renderer.mjs';
import { AnimationTrackSessions } from '../ui/animation-track-controls.mjs';
import { AnimationControls } from '../ui/animation-controls.mjs';
import { portableContentSource } from '../ui/element-content-source.mjs';

const fixtures = JSON.parse(
  execFileSync(
    'python',
    [
      '-B',
      '-c',
      `import json,base64
from pathlib import Path
from engine.generators import regular
from engine import element_annotations as c
out={}
assets=json.loads(Path('tests/fixtures/element-content-native-fixture.json').read_text(encoding='utf-8'))['descriptor']['assets']
for key in ('cell120','cell600'):
 p=regular(key);p['metadata']['coordinateUnits']='mm'
 p['metadata']['offColors']={kind:[{'encoding':'byte','values':[40,80,160,127]} for _ in p[kind]] for kind in ('faces','cells')}
 d=c.new_document(p)
 d['entries']=[{'kind':kind,'index':0,'texture':None,'text':{'markup':kind+' source label','placement':{'offsetMm':[0,0],'rotationDeg':0,'lineHeightMm':4}}} for kind in ('vertex','edge','face','cell')]
 c.validate_document(d,p)
 png=c.set_texture(d,p,0,base64.b64decode(next(iter(assets.values()))['base64']))
 out[key]={'source':p,'text':d,'png':png}
print(json.dumps(out))`,
    ],
    { windowsHide: true, encoding: 'utf8', maxBuffer: 4 * 1024 ** 2, timeout: 900000 }
  )
);
const engine = spawn('python', ['-B', '-u', 'engine/server.py'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  }),
  pending = new Map();
let next = 0,
  stderr = '';
engine.stderr.on('data', (data) => (stderr += data));
engine.stdin.on('error', (error) => {
  for (const job of pending.values()) job.reject(error);
  pending.clear();
});
const lines = createInterface({ input: engine.stdout });
lines.on('line', (line) => {
  const response = JSON.parse(line),
    job = pending.get(response.id);
  if (!job) return;
  pending.delete(response.id);
  response.ok ? job.resolve(response.result) : job.reject(Error(response.error));
});
engine.on('exit', () => {
  for (const job of pending.values()) job.reject(Error('Native worker exited: ' + stderr));
  pending.clear();
});
const native = (request) =>
  new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    engine.stdin.write(JSON.stringify({ ...request, id }) + '\n');
  });
after(() => {
  lines.close();
  engine.kill();
  assert.equal(stderr, '');
});
const sourceContext = { notes: 'Literal source notes', unit: 'mm' },
  settings = (method) => ({
    version: 1,
    enabled: true,
    method,
    center: null,
    radius: 1,
    ratio: 0.25,
    duration: 1,
    loop: false,
  });
const prepare = (model, s) => native({ op: 'prepare-dual-morph', model, params: { settings: s, sourceContext } });
const evaluate = (model, prepared, ratio) =>
  native({ op: 'evaluate-dual-morph', model, params: { prepared, ratio, sourceContext } });
const sequence = () => ({
  version: 3,
  duration: 1,
  fps: 2,
  loop: false,
  tracks: { morphRatio: { kind: 'dual-morph', version: 1 } },
  keyframes: [
    { time: 0, angles: [0, 0, 0, 0, 0, 0], sectionOffset: 0, morphRatio: 0 },
    { time: 1, angles: [45, 0, 0, 0, 0, 0], sectionOffset: 0, morphRatio: 1 },
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
const describe = (model, params) => native({ op: 'element-content-describe', model, params });
const contentOptions = (state) => ({
  getState: () => state,
  makeCanvas,
  decodeImage: async () => ({ width: 2, height: 2, close() {} }),
  describe,
});
function environment(key, method, png = false) {
  const f = fixtures[key],
    state = {
      model: structuredClone(f.source),
      notes: sourceContext.notes,
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
        elementAnnotations: structuredClone(png ? f.png : f.text),
        dualMorph: settings(method),
        animation: sequence(),
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
  const context = {
    getState: () => state,
    getModel: () => state.model,
    viewer: v,
    run,
    makeContentCanvas: makeCanvas,
    decodeContentImage: contentOptions(state).decodeImage,
    syncPose() {},
    display() {},
  };
  const renderer = new AnimationRenderer(context);
  Object.assign(context, {
    capabilities: () => renderer.capabilities(),
    loadMorph: (m, s, o) => renderer.loadMorph(m, s, o),
    renderTracks: (p, o) => renderer.renderTracks(p, o),
  });
  return { state, v, context, tracks: new AnimationTrackSessions(context) };
}

for (const key of ['cell120', 'cell600'])
  for (const method of ['expansion', 'tilting-quads'])
    test(
      `${key} ${method}: native endpoints/interiors render all owners and literal source colors`,
      { timeout: 900000 },
      async () => {
        const e = environment(key, method),
          before = structuredClone(e.state.model),
          p = await prepare(before, settings(method));
        try {
          assert.equal(morphEligible(before, method), true);
          assert.equal(morphEligible(before, 'tilting-triangles'), false);
          for (const ratio of [0, 0.37, 0.63, 1]) {
            const frame = await evaluate(before, p, ratio);
            await renderMorphElementContent(e.v, frame, e.state, contentOptions(e.state));
            assert.equal(e.v.morphFrame.ratio, ratio);
            assert.ok(e.v.surfaceGeometry.attributes.position.count > 0);
            assert.equal((await e.v.prepareCapture()).elementContent.ready, true);
            assert.ok(e.v.elementContentLayer.group.children.some((o) => o.isSprite));
            for (const [kind, field] of [
              ['vertex', 'vertices'],
              ['edge', 'edges'],
              ['face', 'faces'],
              ['cell', 'cells'],
            ])
              for (let i = 0; i < frame.model[field].length; i++) {
                const owners = morphSourceOwners(frame, kind, i);
                assert.ok(owners.length);
                for (const owner of owners)
                  assert.ok(
                    before[{ vertex: 'vertices', edge: 'edges', face: 'faces', cell: 'cells' }[owner.kind]][owner.id]
                  );
              }
            assert.deepEqual(e.state.model, before);
          }
          e.v.clearMorph(e.state.model, e.state.view);
          assert.strictEqual(e.v.model, e.state.model);
        } finally {
          e.tracks.reset();
          e.v.clear();
        }
      }
    );

for (const key of ['cell120', 'cell600'])
  test(
    `${key} affine PNG sheets follow only source-face caps; reciprocal collapse refuses`,
    { timeout: 900000 },
    async () => {
      const e = environment(key, 'expansion', true),
        p = await prepare(e.state.model, settings('expansion'));
      try {
        const frame = await evaluate(e.state.model, p, 0.37),
          descriptor = await describe(e.state.model, {
            document: e.state.view.elementAnnotations,
            reference_edge_mm: 25,
          });
        const plan = planMorphElementContent(e.state.model, frame, descriptor.entries);
        assert.equal(plan.sheets.get(0).size, 2);
        const prior = frame.sourceMaps.faces[0].sourceSheetFace;
        assert.throws(
          () =>
            plan.checked(() => {
              frame.sourceMaps.faces[0].sourceSheetFace = 999999;
            }),
          /changed/
        );
        frame.sourceMaps.faces[0].sourceSheetFace = prior;
        plan.check();
        assert.throws(() => plan.checked(() => Promise.resolve()), /synchronous/);
        await renderMorphElementContent(e.v, frame, e.state, contentOptions(e.state));
        const meshes = e.v.elementContentLayer.group.children.filter((o) => o.isMesh && o.userData.sourceFace === 0),
          published = e.v.publishedPickState;
        const rendered = new Set(
          meshes.flatMap((mesh) =>
            Array.from(
              mesh.userData.sourcePatchIndices,
              (i) =>
                (published.packedDisplay
                  ? published.packedDisplay.patchOwnerAt(i)
                  : (published.renderTriangles || published.triangles)[i]
                ).face
            )
          )
        );
        assert.deepEqual(rendered, new Set(plan.sheets.get(0).keys()));
        assert.ok(meshes.reduce((n, mesh) => n + mesh.geometry.attributes.position.count, 0) > 0);
        assert.equal((await e.v.prepareCapture()).elementContent.ready, true);
        const end = await evaluate(e.state.model, p, 1);
        assert.throws(() => planMorphElementContent(e.state.model, end, descriptor.entries), /PNG has no output face/);
        const tilted = await evaluate(e.state.model, await prepare(e.state.model, settings('tilting-quads')), 0.37);
        assert.throws(
          () => planMorphElementContent(e.state.model, tilted, descriptor.entries),
          /PNG.*correspondence|PNG.*source cycle|PNG has no output face|PNG corners/
        );
      } finally {
        e.v.clear();
      }
    }
  );

test(
  'large 4D session replays, resets, restores saved source and rejects changed notes',
  { timeout: 900000 },
  async () => {
    const e = environment('cell120', 'expansion'),
      document = { id: 'source', cursor: 0, states: [e.state] },
      project = { active: 0, documents: [document] },
      before = structuredClone(e.state.model);
    let time = 0,
      callbacks = [],
      dirty = 0;
    const c = {
      mappedContent: true,
      getState: () => e.state,
      getDocument: () => document,
      getProject: () => project,
      isExporting: () => false,
      prepare,
      evaluate,
      render: (frame, options) =>
        renderMorphElementContent(e.v, frame, e.state, { ...contentOptions(e.state), ...options }),
      clear: () => e.v.clearMorph(e.state.model, e.state.view),
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
      await session.configure(settings('expansion'));
      await session.seek(1);
      session.play();
      time = 500;
      callbacks.shift()();
      while (session.active) await new Promise((r) => setTimeout(r, 10));
      assert.equal(e.state.view.dualMorph.ratio, 0.5);
      time = 1000;
      callbacks.shift()();
      while (session.active) await new Promise((r) => setTimeout(r, 10));
      assert.equal(e.state.view.dualMorph.ratio, 1);
      assert.equal(session.playing, false);
      session.reset();
      assert.equal(e.state.view.dualMorph.enabled, false);
      assert.strictEqual(e.v.model, e.state.model);
      await session.configure(settings('expansion'));
      const saved = await native({
        op: 'validate-project',
        params: { project: { format: 'polytope-laboratory', version: 1, ...project } },
      });
      const reopened = saved.documents[0].states[0],
        canonical = JSON.parse(JSON.stringify(before));
      assert.deepEqual(reopened.model, canonical);
      assert.deepEqual(reopened.view.elementAnnotations, JSON.parse(JSON.stringify(e.state.view.elementAnnotations)));
      session.invalidate();
      Object.assign(e.state, reopened);
      await session.restoreSaved();
      assert.equal(e.v.morphFrame.ratio, 0.25);
      assert.deepEqual(e.state.model, canonical);
      assert.equal(document.states.length, 1);
      assert.ok(dirty >= 5);
      e.state.notes = 'edited';
      await assert.rejects(async () => session.seek(0.5), /changed/);
    } finally {
      session.invalidate();
      e.v.clear();
    }
  }
);

for (const key of ['cell120', 'cell600'])
  for (const method of ['expansion', 'tilting-quads'])
    test(`${key} ${method}: mathematical-time PNG staging and source restoration`, { timeout: 900000 }, async () => {
      const e = environment(key, method),
        before = structuredClone(e.state.view),
        images = [];
      let finished = 0;
      e.v.image = () => JSON.stringify([e.v.morphFrame.ratio, e.v.model.vertices, e.v.model.cells.length]);
      const api = {
        animationBegin: async () => ({ id: 'large4d' }),
        animationWrite: async (id, n, image) => images.push(JSON.parse(image)),
        animationFinish: async () => {
          finished++;
          return { path: 'frames' };
        },
        animationAbort: async () => {},
      };
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
      try {
        await c.export('png');
        assert.equal(finished, 1);
        assert.deepEqual(
          images.map((x) => x[0]),
          [0, 0.5, 1]
        );
        assert.equal(new Set(images.map(JSON.stringify)).size, 3);
        assert.deepEqual(e.state.view, before);
        assert.equal(e.v.morphFrame.ratio, 0.25);
      } finally {
        e.tracks.reset();
        e.v.clear();
      }
    });

test('nine-method inventory binds all 117 native rows and retains every other explicit refusal', () => {
  const report = JSON.parse(readFileSync(new URL('./fixtures/morph_method_inventory_r8.json', import.meta.url))),
    baseline = JSON.parse(readFileSync(new URL('./fixtures/morph_method_inventory_r7.json', import.meta.url)));
  assert.equal(report.scenario, 'anim-02-method-domain-inventory-r8');
  assert.equal(report.rows.length, 117);
  assert.equal(report.rows.filter((r) => r.status === 'sampled').length, 70);
  assert.equal(report.rows.filter((r) => r.status === 'refused').length, 47);
  for (const row of report.rows) {
    const old = baseline.rows.find((r) => r.source === row.source && r.method === row.method),
      closed = ['cell120', 'cell600'].includes(row.source) && ['expansion', 'tilting-quads'].includes(row.method);
    assert.equal(row.status, closed ? 'sampled' : old.status);
    if (closed) {
      assert.equal(old.status, 'refused');
      assert.deepEqual(
        row.samples.map((s) => s.ratio),
        [0, 0.25, 0.5, 0.75, 1]
      );
      assert.equal(row.certified, false);
    } else if (row.status === 'refused') assert.ok(row.reason.length);
  }
});

test('mounted-controller sync retains Reset after an exported 4D ratio track', { timeout: 900000 }, async () => {
  const e = environment('cell120', 'expansion');
  e.state.model = await native({ op: 'generate', params: { kind: 'regular', key: 'tesseract' } });
  e.state.model.metadata.coordinateUnits = 'mm';
  e.state.view.elementAnnotations = null;
  e.v.setModel(e.state.model);
  const document = { id: 'source', cursor: 0, states: [e.state] },
    project = { active: 0, documents: [document] };
  let session, c;
  const sync = () => session?.sync();
  session = new DualMorphControls(
    {
      mappedContent: true,
      getState: () => e.state,
      getDocument: () => document,
      getProject: () => project,
      isExporting: () => c?.exporting ?? false,
      prepare,
      evaluate,
      render: (frame, options) => e.v.setMorphFrame(frame, e.state.model, e.state.view, options),
      clear: () => e.v.clearMorph(e.state.model, e.state.view),
      markDirty: sync,
      onState: sync,
    },
    { mount: false }
  );
  e.context.onMorphPose = (frame, prepared) => session.adoptAnimationPose(frame, prepared);
  const api = {
    animationBegin: async () => ({ id: 'sync' }),
    animationWrite: async () => {},
    animationFinish: async () => ({ path: 'frames' }),
    animationAbort: async () => {},
  };
  c = Object.create(AnimationControls.prototype);
  Object.assign(c, {
    context: { ...e.context, api, stopLegacy: () => session.cancel(), onExportStateChange: sync, display: sync },
    nodes: { target: { value: 'base' }, progress: {} },
    generation: 0,
    time: 0,
    playing: false,
    exporting: false,
    editing: false,
    trackSessions: e.tracks,
    configure: async () => {
      sync();
    },
    update: sync,
  });
  e.v.image = () => String(e.v.morphFrame.ratio);
  try {
    await session.configure(settings('expansion'));
    await c.export('png');
    assert.ok(session.prepared);
    session.checked();
    session.reset();
    assert.strictEqual(e.v.model, e.state.model);
    assert.equal(e.state.view.dualMorph.enabled, false);
  } finally {
    session.invalidate();
    e.tracks.reset();
    e.v.clear();
  }
});

test('expanded display signature budget leaves ordinary source bounds and JSON validation intact', () => {
  const wide = Array(250000).fill(0);
  assert.throws(() => portableContentSource(wide), /work bound/);
  for (const maxVisits of [0, 1000001, Infinity, 1.5])
    assert.throws(() => portableContentSource({}, { maxVisits }), /visit bound/);
  assert.throws(() => portableContentSource([NaN], { maxVisits: 1000000 }), /finite/);
  const accessor = {};
  Object.defineProperty(accessor, 'x', {
    enumerable: true,
    get() {
      assert.fail('Accessor ran.');
    },
  });
  assert.throws(() => portableContentSource(accessor, { maxVisits: 1000000 }), /ordinary data/);
  assert.throws(() => portableContentSource(Array(3), { maxVisits: 1000000 }), /dense/);
});
