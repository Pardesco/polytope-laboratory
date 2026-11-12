import { readAppSource } from './helpers/app-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { hiddenElements, setElementsHidden, setComponentHidden } from '../ui/element-visibility.mjs';
import { cellVisibility } from '../ui/cell-visibility.mjs';
import { capturePrintableDisplay } from '../ui/printable-export.mjs';
import { navigationDisplayHarness } from './helpers/navigation-display.mjs';
import { MultiViewControls } from '../ui/multi-view-controls.mjs';
import { ElementTypeControls } from '../ui/element-type-controls.mjs';
import { visibilityDOM } from './helpers/visibility-dom.mjs';
import { resolveExplosion, explosionGeometry } from '../ui/explosion.mjs';
const fixtures = JSON.parse(
  execFileSync(
    'python',
    [
      '-c',
      `import json
from engine.generators import regular
from engine.compounds import add_models
from engine.element_types import element_types
a=regular('cube');b=regular('tesseract')
print(json.dumps([a,b,add_models(a,a),element_types(a)]))`,
    ],
    { encoding: 'utf8' }
  )
);
const app = readAppSource();
const state = (i = 0, projection = 'orthographic') => ({
  model: structuredClone(fixtures[i]),
  notes: '',
  view: {
    angles: [0, 0, 0, 0, 0, 0],
    projection,
    faces: true,
    edges: true,
    vertices: true,
    sectionNormal: [0, 0, 0, 1],
    sectionOffset: 0,
    derivedMode: 'section',
  },
});

test('type/individual ID masks persist, compose and ignore another source fingerprint', () => {
  const s = state(),
    before = JSON.stringify(s.model);
  setElementsHidden(s.model, s.view, 'face', [0, 1]);
  setElementsHidden(s.model, s.view, 'edge', [2]);
  setElementsHidden(s.model, s.view, 'face', [0], false);
  const restored = JSON.parse(JSON.stringify(s));
  assert.deepEqual(hiddenElements(restored.model, restored.view.elementVisibility).faces, [1]);
  assert.deepEqual(hiddenElements(restored.model, restored.view.elementVisibility).edges, [2]);
  assert.equal(JSON.stringify(s.model), before);
  assert.deepEqual(hiddenElements(fixtures[1], s.view.elementVisibility).faces, []);
  assert.throws(() => setElementsHidden(s.model, s.view, 'face', [-1]), /existing/);
});

test('component visibility uses all four source maps without modifying either component', () => {
  const s = state(2),
    before = JSON.stringify(s.model),
    component = s.model.components[0];
  setComponentHidden(s.model, s.view, component, true);
  const mask = cellVisibility(s.model, [], null, s.view.elementVisibility);
  for (const field of ['vertices', 'edges', 'faces']) {
    assert.ok(component.maps[field].every((id) => !mask[field][id]));
    assert.ok(s.model.components[1].maps[field].every((id) => mask[field][id]));
  }
  setComponentHidden(s.model, s.view, component, false);
  assert.ok(cellVisibility(s.model, [], null, s.view.elementVisibility).faces.every(Boolean));
  assert.equal(JSON.stringify(s.model), before);
});

for (const projection of ['orthographic', 'perspective', 'stereographic'])
  test(`${projection} hidden cell is absent from capture triangles, pick owners and printable panels`, async () => {
    const s = state(1, projection);
    s.view.cellShrink = 0.8;
    setElementsHidden(s.model, s.view, 'cell', [0]);
    setElementsHidden(s.model, s.view, 'face', [s.model.cells[1][0]]);
    const h = navigationDisplayHarness(app, s);
    try {
      h.scope.renderWorkspace();
      await h.settle();
      const v = h.v;
      assert.ok(!v.visibility.activeCells.includes(0));
      await v.prepareGeometryCapture({ isCurrent: () => true });
      const published = v.publishedPickState,
        triangles = published.packedDisplay
          ? published.pickingTriangles
          : published.renderTriangles || published.triangles;
      assert.ok(triangles.length > 0);
      assert.ok(triangles.every((t) => t.cell !== 0 && t.face !== s.model.cells[1][0]));
      const capture = capturePrintableDisplay(v, s.model, 'panels');
      assert.ok(capture.face_ids.every((f) => f !== s.model.cells[1][0]));
      s.view.pickKind = 'cell';
      h.scope.displayBase();
      v.camera.updateMatrixWorld();
      for (let x = 30; x < 400; x += 40)
        for (let y = 30; y < 300; y += 40) assert.notEqual(v.pickAt(x, y, { hover: true }).picked?.id, 0);
    } finally {
      h.close();
    }
  });

test('hiding every face removes all surface/edge/vertex capture inputs and all pick candidates', async () => {
  const s = state();
  setElementsHidden(
    s.model,
    s.view,
    'face',
    s.model.faces.map((_, i) => i)
  );
  const h = navigationDisplayHarness(app, s);
  try {
    h.scope.renderWorkspace();
    await h.settle();
    const v = h.v,
      capture = capturePrintableDisplay(v, s.model, 'panels');
    assert.deepEqual(capture.nodes, []);
    assert.deepEqual(capture.edges, []);
    assert.deepEqual(capture.triangles, []);
    assert.equal(capture.solid_eligible, false);
    for (const kind of ['vertex', 'edge', 'face']) {
      s.view.pickKind = kind;
      h.scope.displayBase();
      assert.equal(v.pickAt(200, 150, { hover: true }).candidates, 0);
    }
  } finally {
    h.close();
  }
});

test('individual hidden vertex and edge cannot be picked or printed', async () => {
  const s = state();
  setElementsHidden(s.model, s.view, 'vertex', [0]);
  setElementsHidden(s.model, s.view, 'edge', [0]);
  const h = navigationDisplayHarness(app, s);
  try {
    h.scope.renderWorkspace();
    await h.settle();
    const v = h.v;
    assert.equal(v.visibility.vertices[0], false);
    assert.equal(v.visibility.edges[0], false);
    const p = new THREE.Vector3(...v.projected[0].point).project(v.camera);
    s.view.pickKind = 'vertex';
    h.scope.displayBase();
    const r = v.renderer.domElement.getBoundingClientRect();
    assert.notEqual(v.pickAt(((p.x + 1) * r.width) / 2, ((1 - p.y) * r.height) / 2, { hover: true }).picked?.id, 0);
    assert.equal(capturePrintableDisplay(v, s.model).nodes.length, s.model.vertices.length - 1);
    assert.equal(capturePrintableDisplay(v, s.model).edges.length, s.model.edges.length - 1);
  } finally {
    h.close();
  }
});

test('exploded display instances honor hidden source vertex and edge IDs', async () => {
  const s = state(),
    h = navigationDisplayHarness(app, s);
  setElementsHidden(s.model, s.view, 'vertex', [0]);
  setElementsHidden(s.model, s.view, 'edge', [0]);
  try {
    h.scope.renderWorkspace();
    await h.settle();
    const v = h.v;
    v.setExplosion(explosionGeometry(resolveExplosion(s.model), 0.7));
    h.scope.displayBase();
    assert.ok(v.explosionDisplay);
    for (const record of v.explosionDisplay.vertices)
      if (record.sourceVertex === 0) assert.equal(v.instanceVisibility.vertices[record.instance], false);
    for (const record of v.explosionDisplay.edges)
      if (record.sourceEdge === 0) assert.equal(v.instanceVisibility.edges[record.instance], false);
  } finally {
    h.close();
  }
});

test('mounted type eyes, selected-element actions and compound buttons update the saved view', async () => {
  const dom = visibilityDOM(),
    s = state();
  let dirty = 0,
    displays = 0,
    exporting = false;
  try {
    const context = {
      getState: () => s,
      run: async () => fixtures[3],
      guard: (f) => f,
      isExporting: () => exporting,
      markDirty: () => dirty++,
      display: () => displays++,
      viewer: {},
      select: (kind, ids) => (s.view.entitySelection = { kind, ids, index: ids[0] }),
    };
    const controls = new ElementTypeControls(context);
    await controls.refresh();
    const find = (id) => controls.panel.querySelector('#' + id);
    find('element-type-eye-face-0').onclick();
    assert.equal(s.view.elementVisibility.hidden.faces.length, 6);
    assert.equal(dirty, 1);
    assert.equal(displays, 1);
    find('element-show-all').onclick();
    assert.equal(s.view.elementVisibility, undefined);
    find('element-type-face-0').onclick();
    find('element-hide-selected').onclick();
    assert.equal(s.view.elementVisibility.hidden.faces.length, 6);
    exporting = true;
    assert.throws(() => find('element-show-all').onclick(), /Finish export/);
    exporting = false;
    s.model = structuredClone(fixtures[2]);
    controls.render(s.model, { available: false, status: 'Classification unavailable' });
    find('element-component-eye-0').onclick();
    assert.equal(s.view.elementVisibility.hidden.faces.length, 6);
    assert.equal(s.view.elementVisibility.hidden.vertices.length, 8);
  } finally {
    dom.restore();
  }
});

test('multi-view tiles share type IDs and live visibility settings', () => {
  const source = state(),
    calls = [],
    session = {
      owner: { state: source },
      state: structuredClone(source),
      views: [0, 1, 2].map(() => ({
        view: {},
        viewer: {
          setDisplay(v) {
            calls.push(structuredClone(v));
          },
          selectEntities(kind, ids) {
            this.selection = { kind, ids };
          },
        },
      })),
    };
  const controls = Object.create(MultiViewControls.prototype);
  source.view.entitySelection = { kind: 'face', index: 0, ids: [0, 2], typeLabel: 'face type' };
  controls.syncSelection(session);
  assert.ok(session.views.every((r) => JSON.stringify(r.viewer.selection.ids) === '[0,2]'));
  setElementsHidden(source.model, source.view, 'face', [0, 2]);
  controls.syncVisibility(session);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((v) => v.elementVisibility.hidden.faces.length === 2));
});
