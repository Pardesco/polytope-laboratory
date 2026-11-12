import { readAppSource } from './helpers/app-source.mjs';
import { sourceStrings, sourceRange } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { prismColorClasses, forgetPrismColorClasses, PRISM_CLASS_LIMITS } from '../ui/prism-color-classes.mjs';
import { defaultDocumentView } from '../ui/default-look.mjs';
import { stylePreset } from '../ui/style-presets.mjs';
import { rememberElementTypes, elementTypeColor } from '../ui/element-types.mjs';
import { packSurfaceColors } from '../ui/packed-surface-colors.mjs';
import { cpuViewer } from '../scripts/dense-model-benchmark.mjs';
const cases = JSON.parse(
  execFileSync(
    'python',
    [
      '-B',
      '-c',
      `import json
from engine.generators import regular
from engine.element_types import element_types
keys=['cube','icosahedron','tetrahedron','tesseract','cell24','cell120','great-stellated-dodecahedron','simplex4']
models={key:regular(key) for key in keys}
print(json.dumps({key:{'model':m,'types':element_types(m)} for key,m in models.items()}))`,
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  )
);
const mode = (model) => (model.dimension === 3 ? 'face-type' : 'cell-type');
const groups = (result) =>
  Array.from({ length: result.classCount }, (_, id) => result.ids.flatMap((value, i) => (value === id ? [i] : [])));
function centroid(model, entity) {
  const ids =
    model.dimension === 3
      ? model.faces[entity]
      : [...new Set(model.cells[entity].flatMap((face) => model.faces[face]))];
  return Array.from({ length: model.dimension }, (_, k) =>
    ids.reduce((sum, id) => sum + model.vertices[id][k] / ids.length, 0)
  );
}

for (const [name, count] of [
  ['cube', 3],
  ['icosahedron', 10],
  ['great-stellated-dodecahedron', 6],
  ['tesseract', 4],
  ['cell24', 12],
  ['cell120', 60],
])
  test(`${name} has ${count} deterministic opposite/parallel classes with equal colors on each pair`, () => {
    const { model, types } = cases[name],
      before = JSON.stringify(model),
      result = prismColorClasses(model, types, mode(model));
    assert.equal(result.classCount, count);
    assert.equal(new Set(result.colors).size, Math.min(count, 8));
    assert.ok(result.maxResidual < 1e-6);
    const center = Array.from({ length: model.dimension }, (_, k) =>
      model.vertices.reduce((sum, p) => sum + p[k] / model.vertices.length, 0)
    );
    for (const [a, b, ...rest] of groups(result)) {
      assert.equal(rest.length, 0);
      assert.ok(Number.isInteger(b));
      assert.equal(result.colors[a], result.colors[b]);
      const ca = centroid(model, a),
        cb = centroid(model, b);
      assert.ok(Math.hypot(...ca.map((x, k) => x + cb[k] - 2 * center[k])) < 1e-6);
    }
    assert.deepEqual(prismColorClasses(JSON.parse(before), types, mode(model)), result);
    assert.equal(JSON.stringify(model), before);
  });

for (const [name, count] of [
  ['tetrahedron', 4],
  ['simplex4', 5],
])
  test(`${name} retains a separate color class for each non-opposite entity`, () => {
    const { model, types } = cases[name],
      result = prismColorClasses(model, types, mode(model));
    assert.equal(result.classCount, count);
    assert.ok(groups(result).every((row) => row.length === 1));
    assert.equal(new Set(result.colors).size, count);
  });

test('three or more native type classes retain their existing palette and other color modes are untouched', () => {
  const model = cases.cube.model,
    types = { available: true, types: { face: [{}, {}, {}] }, maps: { face: [0, 1, 2, 0, 1, 2] } };
  assert.equal(prismColorClasses(model, types, 'face-type'), null);
  assert.equal(prismColorClasses(model, null, 'source'), null);
  assert.equal(prismColorClasses(model, null, 'face'), null);
  const v = cpuViewer(model);
  rememberElementTypes(model, {
    available: true,
    types: { face: [0, 1, 2].map((typeId) => ({ typeId, ids: [typeId, typeId + 3] })) },
  });
  try {
    v.setDisplay(stylePreset('dark-gallery', { ...defaultDocumentView(3), surfaceColors: 'face-type' }));
    const t = v.triangles[0],
      expected = new THREE.Color(elementTypeColor(types, 'face-type', t.face));
    expected.toArray().forEach((x, i) => assert.ok(Math.abs(v.surfaceGeometry.attributes.color.array[i] - x) < 1e-7));
  } finally {
    v.clear();
  }
});

test('pending/unavailable types use a geometric display partition without claiming native orbit availability', () => {
  const { model } = cases.cell120,
    result = prismColorClasses(model, { available: false }, 'cell-type');
  assert.equal(result.classCount, 60);
  assert.equal(result.scheme, 'opposite-cells');
  assert.equal(result.unpaired, 0);
});

test('colors stay unchanged across projection, rotation, visibility and literal project copies', () => {
  const { model, types } = cases.tesseract;
  rememberElementTypes(model, types);
  const v = cpuViewer(model),
    view = defaultDocumentView(4);
  try {
    v.setDisplay(view);
    const before = v.surfaceGeometry.attributes.color.array.slice();
    v.setDisplay({ ...view, angles: [17, 9, 24, 6, 11, 3] });
    assert.deepEqual(v.surfaceGeometry.attributes.color.array, before);
    const classes = prismColorClasses(model, types, 'cell-type');
    v.setDisplay({ ...view, isolatedCell: 3 });
    assert.equal(prismColorClasses(model, types, 'cell-type'), classes);
    assert.equal(new Set(classes.colors).size, 4);
    v.setDisplay(view);
    assert.deepEqual(v.surfaceGeometry.attributes.color.array, before);
    const copy = JSON.parse(JSON.stringify(model));
    assert.deepEqual(prismColorClasses(copy, types, 'cell-type'), classes);
  } finally {
    v.clear();
  }
});

test('ordinary and packed explicit/fallback cell owners use identical opposite-pair colors', () => {
  const { model, types } = cases.cell24;
  rememberElementTypes(model, types);
  const v = cpuViewer(model),
    view = defaultDocumentView(4);
  v.setDisplay(view);
  try {
    const packed = {
      owner: {
        modelId: model.id,
        fingerprint: model.fingerprint,
        sourceKey: JSON.stringify([model.id, model.fingerprint]),
      },
      sourceCounts: Object.fromEntries(['vertices', 'edges', 'faces', 'cells'].map((k) => [k, model[k].length])),
      faceIds: Uint32Array.from(v.triangles.map((t) => t.face)),
      cellIds: new Int32Array(v.triangles.length).fill(-1),
    };
    assert.deepEqual(
      packSurfaceColors(model, packed, v.visibility, 'cell-type', { view }).colors,
      v.surfaceGeometry.attributes.color.array
    );
    packed.cellIds.fill(0);
    const actual = packSurfaceColors(model, packed, v.visibility, 'cell-type', { view }).colors,
      expected = new THREE.Color(prismColorClasses(model, types, 'cell-type').colors[0]);
    expected.toArray().forEach((x, i) => assert.ok(Math.abs(actual[i] - x) < 1e-7));
  } finally {
    v.clear();
  }
});

test('unsupported dimensions/resource bounds refuse the geometric scheme and degenerate faces remain separate', () => {
  const model = cases.cube.model;
  assert.equal(prismColorClasses({ ...model, embeddingDimension: 4 }, null, 'face-type'), null);
  assert.equal(
    prismColorClasses({ ...model, vertices: Array(PRISM_CLASS_LIMITS.vertices + 1) }, null, 'face-type'),
    null
  );
  const bad = {
      ...model,
      faces: [
        [0, 0, 0],
        [1, 1, 1],
      ],
    },
    result = prismColorClasses(bad, null, 'face-type');
  assert.equal(result.unclassified, 2);
  assert.deepEqual(result.ids, [0, 1]);
  const first = prismColorClasses(model, null, 'face-type');
  forgetPrismColorClasses(model);
  assert.notEqual(prismColorClasses(model, null, 'face-type'), first);
});

test('Prism notes go to the Appearance drawer while actual presentation warnings stay in the viewport', () => {
  const app = readAppSource(),
    code = sourceRange(app, 'displayDiagnostic', 'renderWorkspace'),
    nodes = new Map(),
    get = (id) => {
      if (!nodes.has(id)) nodes.set(id, { dataset: {}, textContent: '' });
      return nodes.get(id);
    };
  const sync = { sync() {} },
    scope = {
      $: get,
      base: {},
      model: () => ({ cells: [] }),
      cellFacing: sync,
      presentationControls: sync,
      appearanceControls: sync,
      appearanceSheet: sync,
      materialEffectsControls: sync,
      pickingControls: sync,
    };
  const display = new Function('scope', `const ctx=scope;with(scope){${code};return displayDiagnostic;}`)(scope);
  display({
    presentationDiagnostic: 'Surface resource warning',
    prismDiagnostic: 'Prism hides vertex markers on dense displays.',
  });
  assert.equal(get('view-diagnostic').textContent, 'Surface resource warning');
  assert.match(get('prism-density-note').textContent, /Prism hides/);
  display({});
  assert.equal(get('prism-density-note').textContent, '');
  const controls = readFileSync(new URL('../ui/style-controls.mjs', import.meta.url), 'utf8');
  assert.ok(sourceStrings(controls).some((text) => /id="prism-density-note" data-expert/.test(text)));
});
