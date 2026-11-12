import { readAppSource } from './helpers/app-source.mjs';
import {
  sourceRange,
  sourceFunction,
  matchAllSource,
  sourceStatement,
  includesSource,
  sourceNodes,
} from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { Viewer } from '../ui/viewer.js';
import { ViewportControls } from '../ui/viewport-controls.mjs';
import { ElementContentControls } from '../ui/element-content-controls.mjs';
import { fakeRenderer } from './helpers/fake-renderer.mjs';
import { resolveExplosion, explosionGeometry } from '../ui/explosion.mjs';
import { runStereographicWorkerJob, stereographicWorkerTransferables } from '../ui/stereographic-worker-geometry.mjs';

const cases = JSON.parse(
  await readFile(new URL('./fixtures/element-content-native-cases.json', import.meta.url), 'utf8')
);
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
    measureText(t) {
      return { width: t.length * 7 };
    },
    fillText() {},
  }),
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
class HeldWorker {
  constructor() {
    this.jobs = [];
    this.listeners = new Map();
  }
  addEventListener(t, fn) {
    this.listeners.set(t, fn);
  }
  removeEventListener(t) {
    this.listeners.delete(t);
  }
  postMessage(job, buffers) {
    this.jobs.push(structuredClone(job, { transfer: buffers }));
  }
  reply() {
    const result = runStereographicWorkerJob(this.jobs.shift());
    assert.equal(result.type, 'geometry-result', result.message);
    this.listeners.get('message')?.({
      data: structuredClone(result, { transfer: stereographicWorkerTransferables(result) }),
    });
  }
  terminate() {}
}
async function drain(v) {
  for (let i = 0; i < 16; i++) {
    if (v.worker.jobs.length) v.worker.reply();
    await new Promise((resolve) => setImmediate(resolve));
    if (!v.worker.jobs.length && !v.stereographicWorker.transport.pending.active) return;
  }
  assert.fail('Worker must drain.');
}
function fixture({ empty = false, mode = 'orthographic', worker = false } = {}) {
  const f = structuredClone(mode === 'exploded' ? cases.net : cases.fourD);
  // Add a source-bound billboard alongside the native face sheet, using its
  // already compiled text runs and the literal native vertex anchor.
  f.descriptor.entries.push({
    ...structuredClone(f.descriptor.entries[0]),
    kind: 'vertex',
    index: 0,
    sourceVertexIds: [0],
    anchor: [...f.source.vertices[0]],
    texture: null,
  });
  const counts = { walks: 0, describes: 0, publications: 0 },
    trap = { enabled: false };
  const guarded = (model) =>
    new Proxy(model, {
      ownKeys(target) {
        // S3 geometry preparation checks the root record's data properties. It does
        // not recursively visit the source. Leave that existing geometry check on;
        // this trap detects the annotation capture/portable/memory source walkers.
        const stack = new Error().stack;
        if (stack.includes('at record (') && stack.includes('stereographic-worker-geometry.mjs:'))
          return Reflect.ownKeys(target);
        counts.walks++;
        if (trap.enabled) throw Error('Unexpected full source enumeration');
        return Reflect.ownKeys(target);
      },
    });
  let state = {
    model: guarded(f.source),
    notes: 'Retain source notes',
    view: {
      angles: [9, 7, 4, 3, 2, 1],
      projection: mode === 'perspective' ? 'perspective' : mode === 'stereographic' ? 'stereographic' : 'orthographic',
      faces: true,
      edges: true,
      vertices: true,
      ...(mode === 'stereo' ? { stereoMode: 'anaglyph', cameraProjection: 'perspective' } : {}),
      elementAnnotations: {
        version: 1,
        entries: empty ? [] : [{ kind: 'face', index: 0, text: { markup: 'Caption' } }],
        assets: {},
      },
    },
  };
  let document = { id: 'pose-document', cursor: 0, states: [state] };
  const project = { active: 0, documents: [document] };
  const v = Object.create(Viewer.prototype);
  v.group = new THREE.Group();
  v.setModel(state.model);
  v.cameraProjection = 'orthographic';
  v.orthographicHalfHeight = 2;
  v.camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 1000);
  v.orthographicCamera = v.camera;
  v.perspectiveCamera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
  v.camera.position.set(0, 0, 6);
  v.camera.lookAt(0, 0, 0);
  v.camera.updateMatrixWorld();
  v.controls = { target: new THREE.Vector3(), update() {} };
  v.renderer = fakeRenderer();
  if (mode === 'stereo') {
    v.perspectiveCamera.position.copy(v.camera.position);
    v.camera = v.perspectiveCamera;
    v.cameraProjection = 'perspective';
  }
  v.worker = worker ? new HeldWorker() : null;
  v.stereographicWorkerFactory = () => v.worker;
  v.stereographicWorkerClock = { now: () => 0, setTimer: () => 1, clearTimer() {} };
  if (mode === 'exploded') {
    const resolved = resolveExplosion(f.source, { direction: 'radial' });
    assert.equal(resolved.supported, true);
    v.setExplosion(explosionGeometry(resolved, 0.4));
  }
  const context = {
    getState: () => state,
    getDocument: () => document,
    getProject: () => project,
    isExporting: () => false,
    viewer: v,
    describe: async (source, params, options) => {
      options.verifyPublication();
      counts.describes++;
      if (empty) return { entries: [] };
      const descriptor = structuredClone(f.descriptor),
        markup = params.document.entries[0].text.markup;
      descriptor.entries[0].text.markup = markup;
      descriptor.entries[0].runs = [{ ...descriptor.entries[0].runs[0], text: markup }];
      return descriptor;
    },
    render: async (viewer, descriptor, { sourceSnapshot, signal, verifyPublication }) => {
      verifyPublication?.();
      counts.publications++;
      const result = await viewer.setElementContent(descriptor, {
        sourceModel: sourceSnapshot ? guarded(sourceSnapshot) : undefined,
        signal,
        makeCanvas,
        decodeImage: async () => ({ width: 2, height: 2, close() {} }),
        isCurrent: () => {
          try {
            verifyPublication?.();
            return true;
          } catch {
            return false;
          }
        },
      });
      verifyPublication?.();
      return result;
    },
  };
  const control = Object.assign(Object.create(ElementContentControls.prototype), { context, jobs: new Map() });
  return {
    f,
    v,
    control,
    context,
    counts,
    trap,
    get state() {
      return state;
    },
    set state(s) {
      state = s;
      document.states[document.cursor] = s;
    },
    get document() {
      return document;
    },
    set document(d) {
      document = d;
      project.documents[0] = d;
    },
  };
}
const display = (f, poseOnly = false) => f.control.display(f.v, { poseOnly }).pending;
const mesh = (v) => v.elementContentLayer.group.children.find((o) => o.isMesh);
const positions = (v) => Array.from(mesh(v).geometry.attributes.position.array);

test('actual app pose display skips construction-panel work while retaining content and diagnostic updates', async () => {
  const source = readAppSource();
  const code =
    sourceRange(source, 'displayBase', 'displayDiagnostic') +
    sourceRange(source, 'syncDerivedSelection', 'selectionSummary');
  const names = [...new Set([...matchAllSource(code, /\b(\w+)(?:\?\.|\.)sync\(\)/g)].map((match) => match[1]))];
  assert.ok(names.length >= 25, 'Exercise the actual construction panel synchronization list');
  const f = fixture(),
    syncs = [],
    diagnostics = [];
  let pending;
  const content = {
    display: (...args) => {
      const result = f.control.display(...args);
      pending = result.pending;
      return result;
    },
    node: () => ({ dataset: {} }),
  };
  const scope = {
    state: () => f.state,
    elementContent: content,
    base: f.v,
    derived: { model: null },
    coxeterBuilder: null,
    displayDiagnostic: (value) => diagnostics.push(value),
    syncDerivedSelection() {},
  };
  for (const name of names) scope[name] = { sync: () => syncs.push(name) };
  try {
    runInNewContext(code, Object.assign(scope, { ctx: scope }));
    scope.displayBase();
    await pending;
    assert.equal(syncs.length, names.length);
    syncs.length = 0;
    const descriptions = f.counts.describes;
    for (let i = 0; i < 10; i++) {
      f.state.view.angles[2] += 2;
      scope.displayBase({ poseOnly: true });
    }
    assert.equal(syncs.length, 0);
    assert.equal(diagnostics.length, 11);
    assert.equal(f.counts.describes, descriptions);
    scope.displayBase();
    await pending;
    assert.equal(syncs.length, names.length);
  } finally {
    f.v.clear();
  }
});

test('pose panel optimization cannot authorize stale annotation content in the actual app display path', async () => {
  const source = readAppSource();
  const code =
    sourceRange(source, 'displayBase', 'displayDiagnostic') +
    sourceRange(source, 'syncDerivedSelection', 'selectionSummary');
  const f = fixture();
  let pending;
  const content = {
    display: (...args) => {
      const result = f.control.display(...args);
      pending = result.pending;
      return result;
    },
    node: () => ({ dataset: {} }),
  };
  const scope = {
    state: () => f.state,
    elementContent: content,
    base: f.v,
    derived: { model: null },
    coxeterBuilder: null,
    displayDiagnostic() {},
    syncDerivedSelection() {},
  };
  for (const match of matchAllSource(code, /\b(\w+)(?:\?\.|\.)sync\(\)/g)) scope[match[1]] = { sync() {} };
  try {
    runInNewContext(code, Object.assign(scope, { ctx: scope }));
    scope.displayBase();
    await pending;
    const descriptions = f.counts.describes;
    f.state.view.elementAnnotations.entries[0].text.markup = 'Edited literal text';
    scope.displayBase({ poseOnly: true });
    await pending;
    assert.equal(f.counts.describes, descriptions + 1);
  } finally {
    f.v.clear();
  }
});

test('warmed pose ownership does not stringify notes, annotations or the non-pose view', async () => {
  const f = fixture(),
    stringify = JSON.stringify;
  try {
    // Include native annotation source/assets plus a large opaque image payload.
    // The descriptor fixture still supplies the actual decoded 2x2 PNG.
    f.state.view.elementAnnotations.source = structuredClone(f.f.source);
    f.state.view.elementAnnotations.assets = { png: { mime: 'image/png', base64: 'A'.repeat(4 * 1024 * 1024) } };
    await display(f);
    const annotations = f.state.view.elementAnnotations,
      describes = f.counts.describes;
    JSON.stringify = (value, ...args) => {
      if (value === annotations || value === f.state.notes || value?.elementAnnotations === annotations)
        throw Error('Pose ownership serialized display content');
      return stringify(value, ...args);
    };
    for (let i = 0; i < 5; i++) {
      f.state.view.angles[2] += 3;
      assert.equal((await display(f, true)).poseOnly, true);
    }
    assert.equal(f.counts.describes, describes);
  } finally {
    JSON.stringify = stringify;
    f.v.clear();
  }
});

for (const change of [
  'placement',
  'asset-bytes',
  'asset-metadata',
  'annotation-source',
  'nested-view',
  'property-add',
  'property-delete',
])
  test(`literal pose ownership detects ${change} mutation`, async () => {
    const f = fixture();
    try {
      const annotations = f.state.view.elementAnnotations;
      annotations.entries[0].text.placement = { offsetMm: [0, 0] };
      annotations.assets = { png: { base64: 'AAAA', width: 2 } };
      annotations.source = structuredClone(f.f.source);
      f.state.view.camera = { position: [0, 0, 6] };
      await display(f);
      if (change === 'placement') annotations.entries[0].text.placement.offsetMm[0] = 1;
      if (change === 'asset-bytes') annotations.assets.png.base64 = 'BBBB';
      if (change === 'asset-metadata') annotations.assets.png.width = 3;
      if (change === 'annotation-source') annotations.source.vertices[0][0] += 0.125;
      if (change === 'nested-view') f.state.view.camera.position[0] = 1;
      if (change === 'property-add') f.state.view.extraSetting = false;
      if (change === 'property-delete') delete f.state.view.vertices;
      let full = 0;
      const refresh = f.control.refresh.bind(f.control);
      f.control.refresh = (...args) => {
        full++;
        return refresh(...args);
      };
      assert.notEqual((await display(f, true)).poseOnly, true);
      assert.equal(full, 1);
    } finally {
      f.v.clear();
    }
  });

test('held full refresh cannot certify content mutated in place while it was awaiting publication', async () => {
  const f = fixture(),
    gate = deferred(),
    entered = deferred();
  try {
    const describe = f.context.describe;
    f.context.describe = async (...args) => {
      entered.resolve();
      await gate.promise;
      return describe(...args);
    };
    const pending = display(f),
      rejected = assert.rejects(pending, /changed/i);
    await entered.promise;
    f.state.view.elementAnnotations.entries[0].text.markup = 'Edited in flight';
    gate.resolve();
    await rejected;
    assert.equal(f.control.displayOwners.get(f.v).owner, undefined);
    f.context.describe = describe;
    assert.notEqual((await display(f, true)).poseOnly, true);
    assert.equal(f.v.elementContentLayer.descriptor.entries[0].text.markup, 'Edited in flight');
  } finally {
    gate.resolve();
    f.v.clear();
  }
});

test('queued stereographic pose rechecks literal annotation ownership before publishing', async () => {
  const f = fixture({ mode: 'stereographic', worker: true });
  try {
    await display(f);
    await drain(f.v);
    f.state.view.angles[2] = 8;
    assert.equal((await display(f, true)).poseOnly, true);
    f.state.view.elementAnnotations.entries[0].text.markup = 'Changed while worker pending';
    await drain(f.v);
    assert.match(f.v.elementContentDiagnostic, /changed|ownership/i);
    assert.equal(f.v.elementContentLayer.group.children.length, 0);
    await display(f);
    await drain(f.v);
    assert.equal(f.v.elementContentDiagnostic, null);
    assert.equal(f.v.elementContentLayer.descriptor.entries[0].text.markup, 'Changed while worker pending');
  } finally {
    f.v.clear();
  }
});

for (const empty of [false, true])
  test(`${empty ? 'explicit empty' : 'annotated'} document: N pose displays never capture/enumerate source`, async () => {
    const f = fixture({ empty });
    try {
      await display(f);
      const before = JSON.stringify(f.state),
        describes = f.counts.describes,
        publications = f.counts.publications,
        layer = f.v.elementContentLayer;
      let rebuilds = 0;
      if (layer) {
        const rebuild = layer.rebuild.bind(layer);
        layer.rebuild = (...args) => {
          rebuilds++;
          return rebuild(...args);
        };
      }
      const first = layer ? positions(f.v) : null;
      f.counts.walks = 0;
      f.trap.enabled = true;
      for (let i = 1; i <= 6; i++) {
        f.state.view.angles[2] = i * 3;
        const result = await display(f, true);
        assert.equal(result.poseOnly, true);
        assert.equal(f.v.elementContentDiagnostic, null);
      }
      assert.equal(f.counts.walks, 0);
      assert.equal(f.counts.describes, describes);
      assert.equal(f.counts.publications, publications);
      if (layer) {
        assert.equal(rebuilds, 6);
        assert.notDeepEqual(positions(f.v), first);
      } else assert.deepEqual(f.state.view.elementAnnotations, { version: 1, entries: [], assets: {} });
      f.trap.enabled = false;
      const after = JSON.parse(before);
      after.view.angles = f.state.view.angles;
      assert.deepEqual(JSON.parse(JSON.stringify(f.state)), after);
    } finally {
      f.trap.enabled = false;
      f.v.clear();
    }
  });

for (const mode of ['orthographic', 'perspective', 'stereographic', 'stereo', 'exploded'])
  test(`pose labels follow published geometry in ${mode}`, async () => {
    const f = fixture({ mode });
    try {
      await display(f);
      const first = positions(f.v),
        oldSprite = f.v.elementContentLayer.group.children.find((o) => o.isSprite)?.position.toArray();
      f.counts.walks = 0;
      f.trap.enabled = true;
      for (let i = 1; i <= 3; i++) {
        f.state.view.angles[0] = i * 4;
        f.state.view.angles[2] = i * 2;
        await display(f, true);
        assert.equal(f.v.elementContentDiagnostic, null);
        const overlay = mesh(f.v),
          array = f.v.surfaceGeometry.attributes.position.array,
          expected = [];
        const pub = f.v.publishedPickState;
        for (let patch = 0; patch < array.length / 9; patch++) {
          const owner = pub.packedDisplay
            ? pub.packedDisplay.patchOwnerAt(patch)
            : (pub.renderTriangles || pub.triangles)[patch];
          if (owner.face === 0) expected.push(...array.subarray(patch * 9, patch * 9 + 9));
        }
        assert.deepEqual(Array.from(overlay.geometry.attributes.position.array), expected);
        assert.ok(
          Array.from(overlay.geometry.attributes.uv.array).every(
            (x) => Number.isFinite(x) && x >= -3e-5 && x <= 1 + 3e-5
          )
        );
      }
      assert.notDeepEqual(positions(f.v), first);
      if (oldSprite)
        assert.notDeepEqual(
          f.v.elementContentLayer.group.children.find((o) => o.isSprite).position.toArray(),
          oldSprite
        );
      assert.equal(f.counts.walks, 0);
    } finally {
      f.trap.enabled = false;
      f.v.clear();
    }
  });

for (const change of [
  'model',
  'source',
  'state',
  'document',
  'annotations',
  'annotation-in-place',
  'net',
  'cellNet',
  'projection',
  'opacity',
  'notes',
  'unit',
  'cursor',
])
  test(`pose after ${change} change falls through to validated refresh`, async () => {
    const f = fixture();
    try {
      await display(f);
      f.counts.walks = 0;
      if (change === 'model') f.v.setModel(f.state.model);
      if (change === 'source') {
        f.state.model = structuredClone(f.f.source);
        f.v.setModel(f.state.model);
      }
      if (change === 'state') f.state = { ...f.state };
      if (change === 'document') f.document = { ...f.document };
      if (change === 'annotations') f.state.view.elementAnnotations = structuredClone(f.state.view.elementAnnotations);
      if (change === 'annotation-in-place') f.state.view.elementAnnotations.entries[0].text.markup = 'Edited';
      if (change === 'net' || change === 'cellNet') f.v[change] = { newOwner: true };
      if (change === 'projection') f.state.view.projection = 'perspective';
      if (change === 'opacity') f.state.view.surfaceOpacity = 0.4;
      if (change === 'notes') f.state.notes = 'Changed';
      if (change === 'unit') f.state.view.coordinateUnit = 'mm';
      if (change === 'cursor') {
        f.document.states.push(f.state);
        f.document.cursor = 1;
      }
      const refresh = f.control.refresh.bind(f.control);
      let full = 0;
      f.control.refresh = (...args) => {
        full++;
        return refresh(...args);
      };
      // A synthetic net is only an ownership probe; refuse it before geometry use.
      if (change === 'net' || change === 'cellNet') {
        const set = f.v.setDisplay.bind(f.v);
        f.v.setDisplay = (view, opts) => {
          f.v[change] = null;
          return set(view, opts);
        };
      }
      const pending = display(f, true);
      await pending;
      assert.equal(full, 1);
      assert.ok(f.counts.walks > 0);
    } finally {
      f.v.clear();
    }
  });

test('pending and failed refreshes cannot authorize a pose skip; retired edits remain AbortError', async () => {
  const f = fixture(),
    gate = deferred(),
    entered = deferred();
  try {
    await display(f);
    const describe = f.context.describe;
    f.state.view.elementAnnotations = structuredClone(f.state.view.elementAnnotations);
    f.state.view.elementAnnotations.entries[0].text.markup = 'Held edit';
    f.context.describe = async () => {
      entered.resolve();
      return gate.promise;
    };
    const old = display(f, true),
      retired = assert.rejects(old, { name: 'AbortError' });
    await entered.promise;
    assert.equal(f.control.displayOwners.get(f.v).owner, undefined);
    f.state.view.angles[2] = 10;
    const pendingPose = display(f, true),
      retiredPose = assert.rejects(pendingPose, { name: 'AbortError' });
    await new Promise((resolve) => setImmediate(resolve));
    f.state.view.elementAnnotations = structuredClone(f.state.view.elementAnnotations);
    f.state.view.elementAnnotations.entries[0].text.markup = 'New caption';
    f.context.describe = describe;
    await display(f, true);
    gate.reject(Error('Obsolete descriptor failure'));
    await retired;
    await retiredPose;
    assert.equal(f.v.elementContentDiagnostic, null);
    assert.equal(f.v.elementContentLayer.descriptor.entries[0].text.markup, 'New caption');
    const result = await display(f, true);
    assert.equal(result.poseOnly, true);
    f.context.describe = async () => {
      throw Error('Current invalid content');
    };
    f.state.view.elementAnnotations.entries[0].text.markup = 'Invalid';
    await assert.rejects(display(f, true), /Current invalid/);
    assert.equal(f.control.displayOwners.get(f.v).owner, undefined);
  } finally {
    f.v.clear();
  }
});

test('non-pose displays and capture retain literal checks for in-place source mutation', async () => {
  for (const operation of ['display', 'capture']) {
    const f = fixture();
    try {
      await display(f);
      f.state.view.angles[2] = 12;
      await display(f, true);
      // Neither ID, counts nor fingerprint changes.
      f.state.model.vertices[0][0] += 0.125;
      if (operation === 'capture') await assert.rejects(f.v.prepareCapture(), /changed|ownership/i);
      else {
        f.v.setDisplay(f.state.view);
        assert.match(f.v.elementContentDiagnostic, /changed|ownership/i);
        assert.equal(f.v.elementContentLayer.group.children.length, 0);
      }
    } finally {
      f.v.clear();
    }
  }
});

test('capture verifies a mutated bound snapshot even after safe pose rebuilds', async () => {
  const f = fixture();
  try {
    await display(f);
    f.state.view.angles[2] = 12;
    await display(f, true);
    f.v.elementContentLayer.sourceModel.vertices[0][0] += 0.125;
    await assert.rejects(f.v.prepareCapture(), /changed/i);
  } finally {
    f.v.clear();
  }
});

test('materials survive N pose rebuilds without construction and are disposed exactly once', async () => {
  const f = fixture();
  try {
    await display(f);
    const layer = f.v.elementContentLayer,
      records = [...layer.textures.values()],
      materials = records.flatMap((r) => [r.faceMaterial, r.spriteMaterial].filter(Boolean));
    assert.ok(materials.some((m) => m.isMeshBasicMaterial));
    assert.ok(materials.some((m) => m.isSpriteMaterial));
    const disposed = new Map(materials.map((m) => [m, 0]));
    for (const m of materials) m.addEventListener('dispose', () => disposed.set(m, disposed.get(m) + 1));
    const before = new THREE.Material();
    for (let i = 1; i <= 6; i++) {
      f.state.view.angles[2] = i * 3;
      await display(f, true);
      for (const child of layer.group.children) assert.ok(materials.includes(child.material));
    }
    const after = new THREE.Material();
    assert.equal(after.id - before.id, 1, 'No material constructor may run across the pose rebuilds');
    assert.ok([...disposed.values()].every((n) => n === 0));
    before.dispose();
    after.dispose();
    layer.destroy();
    layer.destroy();
    assert.ok([...disposed.values()].every((n) => n === 1));
  } finally {
    f.v.clear();
  }
});

test('texture record replacement retires materials before their texture; rebuilt owners/colors/opacity stay current', async () => {
  const f = fixture();
  try {
    await display(f);
    const layer = f.v.elementContentLayer,
      [key, old] = [...layer.textures].find(([, r]) => r.faceMaterial),
      oldMaterial = old.faceMaterial,
      events = [];
    oldMaterial.addEventListener('dispose', () => events.push('material'));
    old.texture.addEventListener('dispose', () => events.push('texture'));
    const replacement = { ...old, texture: old.texture.clone(), faceMaterial: null, spriteMaterial: null };
    layer.setTextureRecord(key, replacement);
    assert.deepEqual(events, ['material', 'texture']);
    assert.equal(layer.group.children.length, 0);
    f.state.view.surfaceOpacity = 0.37;
    f.v.setDisplay(f.state.view);
    const overlay = mesh(f.v);
    assert.notStrictEqual(overlay.material, oldMaterial);
    assert.strictEqual(overlay.material.map, replacement.texture);
    assert.equal(overlay.material.opacity, 0.37);
    assert.equal(overlay.userData.sourceId, f.state.model.id);
    assert.equal(overlay.userData.sourceFace, 0);
    assert.ok(overlay.userData.sourcePatchIndices.length);
    const color = overlay.geometry.attributes.color.array;
    assert.ok(Array.from(color).every(Number.isFinite));
    layer.destroy();
    assert.deepEqual(events, ['material', 'texture']);
  } finally {
    f.v.clear();
  }
});

test('asynchronous stereographic publication uses the guarded pose path and rejects an expired guard', async () => {
  const f = fixture({ mode: 'stereographic', worker: true });
  try {
    await display(f);
    await drain(f.v);
    const first = positions(f.v);
    f.counts.walks = 0;
    f.trap.enabled = true;
    f.state.view.angles[2] = 8;
    await display(f, true);
    await drain(f.v);
    assert.equal(f.counts.walks, 0);
    assert.equal(f.v.elementContentDiagnostic, null);
    assert.notDeepEqual(positions(f.v), first);
    f.trap.enabled = false;
    f.state.view.angles[2] = 16;
    await display(f, true);
    f.state.model.vertices[0][0] += 0.125;
    // A non-pose display clears the fast-path callback before worker publication.
    f.v.setDisplay(f.state.view);
    await drain(f.v);
    assert.match(f.v.elementContentDiagnostic, /changed|ownership/i);
  } finally {
    f.trap.enabled = false;
    f.v.clear();
  }
});

test('Rotate ticks request the pose path and presentation changes keep the full path', async () => {
  const f = fixture(),
    calls = [];
  try {
    await display(f);
    const controls = Object.assign(Object.create(ViewportControls.prototype), {
      playing: true,
      context: {
        getState: () => f.state,
        getModel: () => f.state.model,
        isExporting: () => false,
        displayPose: () => {
          calls.push('pose');
        },
        display: () => {
          calls.push('full');
        },
        syncPose: () => calls.push('sync'),
        refreshDerived() {},
        markDirty() {},
      },
    });
    const before = f.state.view.angles[2];
    assert.equal(controls.tick(0.1), true);
    assert.notEqual(f.state.view.angles[2], before);
    assert.deepEqual(calls, ['pose', 'sync']);
    const previous = globalThis.document;
    globalThis.document = { getElementById: () => ({}) };
    try {
      controls.setPresentation('solid');
    } finally {
      globalThis.document = previous;
    }
    assert.deepEqual(calls, ['pose', 'sync', 'full']);
  } finally {
    f.v.clear();
  }
});

test('invalidation and cancelled jobs revoke completed pose ownership', async () => {
  for (const cancel of ['invalidate', 'signal']) {
    const f = fixture();
    try {
      await display(f);
      const old = f.control.displayOwners.get(f.v);
      if (cancel === 'invalidate') {
        f.control.sync = () => {};
        f.control.invalidate();
      } else f.control.jobs.get(f.v).controller.abort();
      f.state.view.angles[2] = 13;
      const result = await display(f, true);
      assert.notEqual(result.poseOnly, true);
      assert.notStrictEqual(f.control.displayOwners.get(f.v), old);
    } finally {
      f.v.clear();
    }
  }
});

test('an initially hidden face has its retained material before rotation reveals it', async () => {
  const f = fixture();
  try {
    f.state.view.angles = Array(6).fill(0);
    await display(f);
    const layer = f.v.elementContentLayer,
      face = [...layer.textures.values()].find((r) => r.entry.kind === 'face');
    assert.ok(face.faceMaterial);
    assert.equal(mesh(f.v), undefined);
    const before = new THREE.Material();
    f.state.view.angles = [9, 7, 4, 3, 2, 1];
    await display(f, true);
    const after = new THREE.Material();
    assert.ok(mesh(f.v));
    assert.strictEqual(mesh(f.v).material, face.faceMaterial);
    assert.equal(after.id - before.id, 1);
    before.dispose();
    after.dispose();
  } finally {
    f.v.clear();
  }
});

test('all six actual app plane-slider handlers request pose display', async () => {
  const source = readAppSource(),
    line = sourceStatement(
      source,
      (n, text) =>
        n.type === 'ExpressionStatement' &&
        n.expression.callee?.object?.name === 'PLANES' &&
        includesSource(text, "input.id='plane-'+i")
    );
  assert.ok(line, 'Find the actual slider setup');
  const state = { model: { dimension: 4 }, view: { angles: Array(6).fill(0) } },
    created = [],
    calls = [];
  const el = (kind) => {
    const node = { kind, setAttribute() {}, append() {} };
    created.push(node);
    return node;
  };
  const viewport = Object.assign(Object.create(ViewportControls.prototype), {
    stop() {},
    context: {
      getState: () => state,
      getModel: () => state.model,
      isExporting: () => false,
      displayPose: () => calls.push('pose'),
      syncPose() {},
      markPoseDirty: () => calls.push('dirty'),
      markDirty() {
        throw Error('Unnecessary full panel synchronization');
      },
    },
  });
  runInNewContext(line, {
    ctx: { viewportControls: viewport },
    PLANES: Array.from({ length: 6 }, (_, i) => [0, 1, String(i)]),
    el,
    $: () => ({ append() {} }),
    guard: (fn) => fn,
    viewportControls: viewport,
  });
  const inputs = created.filter((node) => node.kind === 'input');
  assert.equal(inputs.length, 6);
  inputs.forEach((input, i) => {
    input.value = String(10 + i);
    input.oninput();
    assert.equal(state.view.angles[i], 10 + i);
  });
  assert.deepEqual(calls, Array.from({ length: 6 }, () => ['pose', 'dirty']).flat());
});

test('manual angle changes stop competing playback and reject export, unavailable-plane and empty-workspace edits', () => {
  let exporting = false,
    state = { model: { dimension: 3 }, view: { angles: Array(6).fill(0) } };
  const calls = [];
  const viewport = Object.assign(Object.create(ViewportControls.prototype), {
    playing: true,
    stop() {
      this.playing = false;
    },
    context: {
      getState: () => state,
      getModel: () => state?.model,
      isExporting: () => exporting,
      stopTrack: () => calls.push('pause-track'),
      cancelProjectionFit: () => calls.push('cancel-fit'),
      displayPose: () => calls.push('pose'),
      syncPose: () => calls.push('sync'),
      markPoseDirty: () => calls.push('dirty'),
    },
  });
  viewport.setAngle(1, '27.5');
  assert.equal(state.view.angles[1], 27.5);
  assert.equal(viewport.playing, false);
  assert.deepEqual(calls, ['cancel-fit', 'pause-track', 'pose', 'sync', 'dirty']);
  calls.length = 0;
  const before = structuredClone(state);
  exporting = true;
  assert.throws(() => viewport.setAngle(1, '18'), /export/);
  assert.deepEqual(state, before);
  assert.deepEqual(calls, ['sync']);
  exporting = false;
  for (const [index, text] of [
    [2, '18'],
    [6, '18'],
    [-1, '18'],
    [0, ''],
    [0, 'NaN'],
    [0, '181'],
  ]) {
    assert.throws(() => viewport.setAngle(index, text), /available rotation/);
    assert.deepEqual(state, before);
  }
  state = null;
  assert.throws(() => viewport.setAngle(0, '12'), /Choose a model/);
});

test('actual 4D drag handler changes only angles and requests pose display', async () => {
  const source = await readFile(new URL('../ui/viewport-controls.mjs', import.meta.url), 'utf8'),
    match = sourceNodes(
      source,
      (n) =>
        n.type === 'CallExpression' &&
        n.callee.object?.name === 'canvas' &&
        n.callee.property?.name === 'addEventListener' &&
        n.arguments[0]?.value === 'pointermove'
    );
  assert.equal(match.length, 1, 'Find the actual pointer handler');
  const state = { model: { id: 'retained' }, notes: 'retain', view: { angles: Array(6).fill(0), faces: true } },
    before = structuredClone(state),
    calls = [];
  const controls = Object.assign(Object.create(ViewportControls.prototype), {
    drag: { source: state, pointer: 1, x: 0, y: 0, angles: [...state.view.angles] },
    context: {
      getState: () => state,
      isExporting: () => false,
      displayPose: () => calls.push('pose'),
      display: () => calls.push('full'),
      syncPose: () => calls.push('sync'),
      markPoseDirty: () => calls.push('dirty'),
    },
  });
  const handler = new Function(
    'event',
    source.slice(match[0].arguments[1].body.start + 1, match[0].arguments[1].body.end - 1)
  );
  handler.call(controls, {
    pointerId: 1,
    clientX: 10,
    clientY: 10,
    stopImmediatePropagation() {},
    preventDefault() {},
  });
  before.view.angles[2] = 3.5;
  before.view.angles[4] = -3.5;
  assert.deepEqual(state, before);
  assert.deepEqual(calls, ['pose', 'sync', 'dirty']);
});
