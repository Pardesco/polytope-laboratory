import { readAppSource, readDesktopSource } from './helpers/app-source.mjs';
import { matchSource } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { rememberElementTypes, getElementTypes, elementTypeColor } from '../ui/element-types.mjs';
import { ElementTypeControls } from '../ui/element-type-controls.mjs';
import { packSurfaceColors } from '../ui/packed-surface-colors.mjs';
import { navigationDisplayHarness } from './helpers/navigation-display.mjs';
import { ViewportControls } from '../ui/viewport-controls.mjs';
import { REUSABLE_OPERATIONS } from '../desktop/engine-pool.cjs';
import { runStereographicWorkerJob, stereographicWorkerTransferables } from '../ui/stereographic-worker-geometry.mjs';

const fixtures = JSON.parse(
  execFileSync(
    'python',
    [
      '-c',
      `import json
from engine.generators import regular
from engine.operations import truncate
from engine.element_types import element_types
models=[regular('cuboctahedron'),regular('tesseract'),truncate(regular('simplex4'),.5)]
print(json.dumps([{'model':m,'types':element_types(m)} for m in models]))`,
    ],
    { encoding: 'utf8' }
  )
);
const app = readAppSource();
const view = () => ({
  angles: [12, 7, 4, 9, 2, 3],
  projection: 'orthographic',
  faces: true,
  edges: true,
  vertices: true,
  sectionNormal: [0, 0, 0, 1],
  sectionOffset: 0,
  derivedMode: 'section',
  surfaceColors: 'face-type',
});
const saved = (i) => ({ model: structuredClone(fixtures[i].model), view: view(), notes: '' });

test('read-only type dispatch is available to the desktop and reuses warm workers', async () => {
  assert.ok(REUSABLE_OPERATIONS.has('element-types'));
  const main = readDesktopSource();
  matchSource(main, /allowed.add\('element-types'\)/);
});

test('source cache survives a saved JSON copy and refuses a mutated literal with the same claimed identity', () => {
  const { model, types } = fixtures[0];
  rememberElementTypes(model, types);
  const copy = JSON.parse(JSON.stringify(model));
  assert.ok(getElementTypes(copy).available);
  copy.vertices[0][0] += 0.1;
  assert.equal(getElementTypes(copy), undefined);
  assert.equal(elementTypeColor(null, 'face-type', 0), null);
});

for (const mode of ['face-type', 'cell-type'])
  test(`saved ${mode} preference is accepted through the real viewport control`, () => {
    const state = saved(1),
      control = Object.create(ViewportControls.prototype);
    let dirty = 0,
      display = 0;
    Object.assign(control, {
      context: {
        getState: () => state,
        getModel: () => state.model,
        display: () => display++,
        markDirty: () => dirty++,
      },
      canEdit: () => true,
      restoreDisplayInputs() {},
      sync() {},
    });
    control.setDisplayOption('surface-colors', mode);
    assert.equal(display, 1);
    assert.equal(dirty, 1);
    assert.equal(JSON.parse(JSON.stringify(state)).view.surfaceColors, mode);
  });

for (const projection of ['orthographic', 'perspective', 'stereographic'])
  for (const index of [0, 1, 2])
    test(`${projection} ${index === 0 ? '3D face' : index === 1 ? '4D face' : '4D cell'} colors follow actual orbits`, async () => {
      const state = saved(index),
        { types } = fixtures[index];
      rememberElementTypes(state.model, types);
      const mode = index === 2 ? 'cell-type' : 'face-type';
      Object.assign(state.view, {
        projection: index === 0 ? 'orthographic' : projection,
        surfaceColors: mode,
        cameraProjection: index === 0 && projection === 'perspective' ? 'perspective' : 'orthographic',
      });
      const h = navigationDisplayHarness(app, state);
      try {
        h.scope.renderWorkspace();
        await h.settle();
        const v = h.v,
          triangles = v.renderTriangles || v.triangles,
          packed = v.stereographicGeometry?.packed,
          colors = v.surfaceGeometry.getAttribute('color').array,
          seen = new Set();
        for (let i = 0; i < triangles.length; i++) {
          const face = packed ? packed.faceIds[i] : triangles[i].face,
            cell = packed ? (packed.cellIds[i] < 0 ? undefined : packed.cellIds[i]) : triangles[i].cell;
          const owner = cell ?? v.visibility.faceOwners[face]?.find((c) => v.visibility.activeCellSet.has(c));
          const hex = elementTypeColor(getElementTypes(state.model), mode, face, owner),
            expected = new THREE.Color(hex).toArray();
          expected.forEach((x, j) => assert.ok(Math.abs(colors[i * 12 + j] - x) < 1e-7));
          seen.add(hex);
        }
        assert.equal(seen.size, index === 1 ? 1 : 2);
        assert.equal(h.counts.errors.length, 0);
        if (index === 2) {
          state.view.isolatedCell = 0;
          h.scope.displayBase();
          assert.ok(v.visibility.activeCellSet.has(0));
        }
      } finally {
        h.close();
      }
    });

// Set selections render through the shared selection-highlight layers (edges: lines; faces/cells: fill).
const layer = (v, kind) => (kind === 'edge' ? v.selectionLines : v.selectionFill);
const layerCount = (v, kind) =>
  kind === 'edge'
    ? v.selectionLines.geometry.getAttribute('instanceStart').count
    : v.selectionFill.geometry.getAttribute('position').count;
for (const kind of ['vertex', 'edge', 'face', 'cell'])
  test(`saved ${kind} type restores the complete selection and geometry overlay`, async () => {
    const state = saved(2),
      orbit = fixtures[2].types.types[kind][0];
    state.view.entitySelection = { kind, index: orbit.ids[0], ids: orbit.ids, typeLabel: kind + ' type 1' };
    const h = navigationDisplayHarness(app, JSON.parse(JSON.stringify(state)));
    try {
      h.scope.renderWorkspace();
      await h.settle();
      assert.match(h.get('selection-summary').textContent, /type 1/);
      assert.equal(h.counts.dirty, 0);
      const info = JSON.parse(h.get('selection-info').textContent);
      assert.deepEqual(info.ids, orbit.ids);
      if (kind !== 'vertex') {
        assert.ok(layerCount(h.v, kind) > 0);
        assert.deepEqual(h.v.selectedEntities.indices, orbit.ids);
        h.scope.state().view.angles = [9, 8, 7, 6, 5, 4];
        h.scope.displayBase();
        assert.ok(layer(h.v, kind).visible);
        h.get('selection-kind').value = 'vertex';
        h.get('selection-id').value = '0';
        h.scope.selectEntity();
        assert.equal(h.v.selectedEntities.kind, 'vertex');
        assert.equal(layer(h.v, kind).visible, false);
      }
    } finally {
      h.close();
    }
  });

test('packed face and cell palettes agree with the ordinary colors including explicit and hidden owners', () => {
  const { model, types } = fixtures[2];
  rememberElementTypes(model, types);
  const faceOwners = model.faces.map((_, f) => model.cells.flatMap((c, i) => (c.includes(f) ? [i] : [])));
  const packed = {
    owner: {
      modelId: model.id,
      fingerprint: model.fingerprint,
      sourceKey: JSON.stringify([model.id, model.fingerprint]),
    },
    sourceCounts: Object.fromEntries(['vertices', 'edges', 'faces', 'cells'].map((k) => [k, model[k].length])),
    faceIds: Uint32Array.from(model.faces.map((_, i) => i)),
    cellIds: new Int32Array(model.faces.length).fill(-1),
  };
  const visibility = { faceOwners, activeCellSet: new Set([0, 1]) };
  for (const mode of ['face-type', 'cell-type']) {
    const actual = packSurfaceColors(model, packed, visibility, mode).colors;
    for (let i = 0; i < model.faces.length; i++) {
      const owner = faceOwners[i].find((c) => visibility.activeCellSet.has(c)),
        hex = elementTypeColor(getElementTypes(model), mode, i, owner),
        expected = new THREE.Color(hex ?? 0x9aaec3).toArray();
      expected.forEach((x, j) => assert.ok(Math.abs(actual[i * 12 + j] - x) < 1e-7));
    }
  }
});

test('capture refuses pending/unavailable type colors and applies newly computed colors before export', async () => {
  const state = saved(0);
  state.model.name = 'capture uncached source';
  const h = navigationDisplayHarness(app, state);
  try {
    h.scope.renderWorkspace();
    await h.settle();
    await assert.rejects(h.v.prepareGeometryCapture(), /Element type colors/);
    rememberElementTypes(state.model, fixtures[0].types);
    const result = await h.v.prepareGeometryCapture();
    assert.equal(result.complete, true);
    assert.strictEqual(h.v.surfaceColorTypes, getElementTypes(state.model));
  } finally {
    h.close();
  }
});

test('asynchronous stereographic viewer republishes type colors when native classification completes after its first neutral frame', async () => {
  const worker = {
    jobs: [],
    listeners: new Map(),
    addEventListener(type, fn) {
      this.listeners.set(type, fn);
    },
    removeEventListener(type) {
      this.listeners.delete(type);
    },
    postMessage(job, buffers) {
      this.jobs.push(structuredClone(job, { transfer: buffers }));
    },
    terminate() {
      this.jobs.length = 0;
    },
  };
  const state = saved(2);
  state.model.name = 'asynchronous type readiness';
  state.view.projection = 'stereographic';
  state.view.surfaceColors = 'cell-type';
  const orbit = fixtures[2].types.types.cell[0];
  state.view.entitySelection = { kind: 'cell', index: orbit.ids[0], ids: orbit.ids, typeLabel: 'cell type 1' };
  const h = navigationDisplayHarness(app, state, { workerFactory: () => worker });
  const drain = async () => {
    for (let i = 0; i < 20; i++) {
      if (worker.jobs.length) {
        const result = runStereographicWorkerJob(worker.jobs.shift());
        assert.equal(result.type, 'geometry-result', result.message);
        worker.listeners.get('message')?.({
          data: structuredClone(result, { transfer: stereographicWorkerTransferables(result) }),
        });
      }
      await new Promise((resolve) => setImmediate(resolve));
      if (!worker.jobs.length && !h.v.stereographicWorker.transport.pending.active) return;
    }
    assert.fail('worker did not finish');
  };
  try {
    h.scope.renderWorkspace();
    await drain();
    await h.settle();
    assert.ok(h.v.publishedPickState.packedDisplay);
    assert.equal(h.v.surfaceColorTypes, undefined);
    rememberElementTypes(state.model, fixtures[2].types);
    h.scope.displayBase();
    assert.ok(worker.jobs.length > 0);
    await drain();
    assert.strictEqual(h.v.surfaceColorTypes, getElementTypes(state.model));
    assert.ok(layerCount(h.v, 'cell') > 0);
    const colors = h.v.surfaceGeometry.getAttribute('color').array;
    assert.ok(
      new Set(Array.from({ length: colors.length / 12 }, (_, i) => colors.slice(i * 12, i * 12 + 3).join(','))).size > 1
    );
  } finally {
    h.close();
  }
});

for (const projection of ['orthographic', 'perspective', 'stereographic'])
  test(`${projection} edge and cell set overlays track projected source IDs, visibility and buffer reuse`, async () => {
    for (const kind of ['edge', 'cell']) {
      const state = saved(2),
        orbit = fixtures[2].types.types[kind][0];
      Object.assign(state.view, { projection, edgeStyle: 'cylinder' });
      state.view.entitySelection = { kind, index: orbit.ids[0], ids: orbit.ids, typeLabel: kind + ' type 1' };
      const h = navigationDisplayHarness(app, state);
      try {
        h.scope.renderWorkspace();
        await h.settle();
        assert.ok(layer(h.v, kind).visible);
        assert.ok(layerCount(h.v, kind) > 0);
        h.scope.displayBase();
        assert.ok(layer(h.v, kind).visible);
        assert.ok(layerCount(h.v, kind) > 0);
        if (kind !== 'edge') {
          state.view.isolatedCell = orbit.ids[0];
          state.view.cellShrink = 0.8;
          h.scope.displayBase();
          assert.ok(layer(h.v, kind).visible);
        }
      } finally {
        h.close();
      }
    }
  });

class Node {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this._text = '';
  }
  set textContent(value) {
    this._text = value;
    this.children = [];
  }
  get textContent() {
    return this._text + this.children.map((n) => n.textContent).join(' ');
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this._text = '';
    this.children = nodes;
  }
  get firstElementChild() {
    return this.children[0];
  }
  after() {}
}
function controlHarness(state, run) {
  globalThis.document = { createElement: (tag) => new Node(tag), getElementById: () => new Node('div') };
  const selected = [],
    control = new ElementTypeControls({
      getState: () => state.current,
      guard: (f) => f,
      run,
      isExporting: () => false,
      viewer: {},
      display() {},
      select: (...args) => selected.push(args),
    });
  return { control, selected };
}
const all = (node) => [node, ...node.children.flatMap(all)];
test('compact Analysis type buttons dispatch complete native orbit IDs and show components/transitivity', async () => {
  const state = { current: saved(0) },
    h = controlHarness(state, async () => fixtures[0].types);
  try {
    await h.control.refresh();
    assert.match(h.control.panel.textContent, /Faces 14 · 2 types/);
    assert.match(h.control.panel.textContent, /1 connected component/);
    assert.match(h.control.panel.textContent, /isogonal/);
    const button = all(h.control.panel).find((n) => n.id === 'element-type-face-1');
    button.onclick();
    assert.equal(h.selected[0][0], 'face');
    assert.deepEqual(h.selected[0][1], fixtures[0].types.types.face[1].ids);
    state.current = saved(1);
    assert.throws(() => button.onclick(), /source changed/);
    assert.equal(h.selected.length, 1);
  } finally {
    delete globalThis.document;
  }
});
test('late results cannot publish after source navigation, literal changes or cancellation', async () => {
  for (const action of ['navigate', 'mutate', 'cancel']) {
    const state = { current: saved(0) };
    state.current.model.name = 'uncached ' + action;
    let finish;
    const h = controlHarness(
      state,
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    try {
      const pending = h.control.refresh();
      if (action === 'navigate') state.current = saved(1);
      else if (action === 'mutate') state.current.model.vertices[0][0] += 0.1;
      else h.control.cancelNumeric();
      finish(fixtures[0].types);
      await pending;
      assert.equal(all(h.control.panel).filter((n) => n.tagName === 'BUTTON').length, 0);
      if (action === 'cancel') assert.match(h.control.panel.textContent, /canceled/);
    } finally {
      delete globalThis.document;
    }
  }
});
test('bounded unavailable response is visible without fabricated orbit buttons', async () => {
  const state = { current: saved(0) };
  state.current.model.name = 'unavailable test';
  const h = controlHarness(state, async () => ({ available: false, status: 'Unavailable: frame-limit' }));
  try {
    await h.control.refresh();
    assert.match(h.control.panel.textContent, /Unavailable: frame-limit/);
    assert.equal(all(h.control.panel).filter((n) => n.tagName === 'BUTTON').length, 0);
  } finally {
    delete globalThis.document;
  }
});
