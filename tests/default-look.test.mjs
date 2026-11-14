import { readAppSource } from './helpers/app-source.mjs';
import { matchSource, matchAllSource } from './helpers/source-match.mjs';
import { prismColorClasses } from '../ui/prism-color-classes.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { defaultDocumentView, legacyDocumentView } from '../ui/default-look.mjs';
import { PRISM_PALETTE, PRISM_FALLBACK, PRISM_LIMITS, prismPrimitives } from '../ui/prism-look.mjs';
import { stylePreset } from '../ui/style-presets.mjs';
import { mountStyleControls } from '../ui/style-controls.mjs';
import { rememberElementTypes, getElementTypes, elementTypeColor } from '../ui/element-types.mjs';
import { applyBackground } from '../ui/viewer-background.mjs';
import { compositeAppearanceBackground, applyViewerAppearance } from '../ui/viewer-appearance.mjs';
import { stereographicViewSignature } from '../ui/viewer-stereographic-worker.mjs';
import { packSurfaceColors } from '../ui/packed-surface-colors.mjs';
import { cpuViewer, seedBenchmarkTypes } from '../scripts/dense-model-benchmark.mjs';
const cases = JSON.parse(
  execFileSync(
    'python',
    [
      '-B',
      '-c',
      `import json
from engine.generators import regular
from engine.operations import truncate
from engine.element_types import element_types
models=[regular('cuboctahedron'),truncate(regular('simplex4'),.5)]
print(json.dumps([{'model':m,'types':element_types(m)} for m in models]))`,
    ],
    { encoding: 'utf8' }
  )
);
const rgb = (hex) => new THREE.Color(hex).toArray();
function closeRGB(actual, expected) {
  expected.forEach((value, i) => assert.ok(Math.abs(actual[i] - value) < 1e-7));
}

for (const dimension of [3, 4])
  test(`${dimension}D new documents start in Prism with dimension-specific type colors and opacity`, () => {
    const a = defaultDocumentView(dimension),
      b = defaultDocumentView(dimension);
    assert.equal(a.appearance.style, 'prism');
    assert.equal(a.appearance.backgroundMode, 'radial');
    assert.equal(a.surfaceColors, dimension === 4 ? 'cell-type' : 'face-type');
    assert.equal(a.surfaceOpacity, dimension === 4 ? 0.28 : 1);
    assert.equal(a.edgeStyle, 'cylinder');
    assert.equal(a.vertexStyle, 'sphere');
    assert.equal(a.vertices, true);
    a.appearance.keyDirection[0] = 99;
    a.angles[0] = 99;
    assert.notEqual(b.appearance.keyDirection[0], 99);
    assert.notEqual(b.angles[0], 99);
  });

test('legacy sparse views retain their original look and saved custom styles win over restore defaults', () => {
  const legacy = legacyDocumentView(4);
  assert.equal(legacy.appearance, undefined);
  assert.equal(legacy.vertices, false);
  assert.equal(legacy.surfaceColors, 'source');
  const saved = stylePreset('glass', { surfaceColors: 'face', angles: [1, 2, 3, 4, 5, 6] });
  saved.appearance.background = '#123456';
  assert.deepEqual({ ...legacyDocumentView(3), ...saved }.appearance, saved.appearance);
  const app = readAppSource();
  assert.equal(
    [
      ...matchAllSource(
        app,
        /s\.view=isHyperbolic\(s\.model\)\?\{\.\.\.hyperbolicView\(s\.model\),\.\.\.s\.view\}:\{\.\.\.legacyDocumentView\(s\.model\.dimension\),\.\.\.s\.view\}/g
      ),
    ].length,
    2
  );
  assert.equal([...matchAllSource(app, /restored\.view=\{\.\.\.legacyDocumentView/g)].length, 2);
});

test('Prism palette is bounded, separated and leaves the established palette available', () => {
  assert.equal(PRISM_PALETTE.length, 8);
  assert.equal(new Set(PRISM_PALETTE).size, 8);
  const types = { available: true, maps: { face: [0, 1, 7, 8] } };
  assert.equal(elementTypeColor(types, 'face-type', 0, undefined, PRISM_PALETTE), PRISM_FALLBACK);
  assert.equal(elementTypeColor(types, 'face-type', 3, undefined, PRISM_PALETTE), PRISM_FALLBACK);
  assert.notEqual(elementTypeColor(types, 'face-type', 0), PRISM_FALLBACK);
});

for (const entry of cases)
  test(`${entry.model.dimension}D real source colors retain parallel/opposite colors as native analysis completes`, async () => {
    const model = structuredClone(entry.model);
    model.name += ' Prism upgrade';
    const v = cpuViewer(model),
      view = defaultDocumentView(model.dimension);
    try {
      v.setDisplay(view);
      assert.ok(new Set(v.surfaceGeometry.attributes.color.array).size > 4);
      assert.equal((await v.prepareGeometryCapture()).complete, true);
      rememberElementTypes(model, entry.types);
      v.setDisplay(view);
      const types = getElementTypes(model),
        colors = v.surfaceGeometry.attributes.color.array,
        classes = prismColorClasses(model, types, view.surfaceColors);
      for (const [i, t] of v.triangles.entries()) {
        const owner = v.visibility.faceOwners[t.face]?.find((c) => v.visibility.activeCellSet.has(c));
        closeRGB(
          colors.subarray(i * 12, i * 12 + 3),
          rgb(
            classes?.colors[view.surfaceColors === 'face-type' ? t.face : owner] ??
              elementTypeColor(types, view.surfaceColors, t.face, owner, PRISM_PALETTE)
          )
        );
      }
      assert.ok(v.edgeCylinders.visible);
      assert.equal(v.edgeCylinders.count, model.edges.length);
      assert.ok(v.vertexSpheres.visible);
      const before = colors.slice();
      await v.prepareGeometryCapture();
      assert.deepEqual(v.surfaceGeometry.attributes.color.array, before);
      v.setDisplay({ ...view, appearance: { ...view.appearance, style: 'dark-gallery' } });
      assert.notDeepEqual(v.surfaceGeometry.attributes.color.array, before);
    } finally {
      v.clear();
    }
  });

test('Prism handles unavailable types and source replacement without retaining old orbit colors', async () => {
  const model = structuredClone(cases[0].model);
  model.name += ' unavailable';
  const v = cpuViewer(model),
    view = defaultDocumentView(3);
  try {
    seedBenchmarkTypes(model);
    v.setDisplay(view);
    assert.ok(v.surfaceColorTypes.available);
    model.vertices[0][0] += 0.001;
    await v.prepareGeometryCapture();
    assert.equal(v.surfaceColorTypes, undefined);
    closeRGB(v.surfaceGeometry.attributes.color.array, rgb(PRISM_FALLBACK));
    v.setModel({ ...model, name: 'another Prism source' });
    v.setDisplay(view);
    assert.equal(v.surfaceColorTypes, undefined);
  } finally {
    v.clear();
  }
});

test('packed stereographic patches use the same Prism palette and unavailable-type fallback', () => {
  const { model, types } = cases[1];
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
      sourceCounts: Object.fromEntries(['vertices', 'edges', 'faces', 'cells'].map((key) => [key, model[key].length])),
      faceIds: Uint32Array.from(v.triangles.map((t) => t.face)),
      cellIds: new Int32Array(v.triangles.length).fill(-1),
    };
    assert.deepEqual(
      packSurfaceColors(model, packed, v.visibility, 'cell-type', { view }).colors,
      v.surfaceGeometry.attributes.color.array
    );
    const uncached = { ...model, name: 'Prism packed fallback' };
    packed.owner = { ...packed.owner };
    const fallback = packSurfaceColors(uncached, packed, v.visibility, 'cell-type', { view }).colors;
    closeRGB(fallback, rgb(PRISM_FALLBACK));
    assert.equal(fallback[3], 1);
  } finally {
    v.clear();
  }
});

test('Prism primitive thresholds use displayed counts, retain every edge and leave expert cylinder styles unchanged', () => {
  const view = defaultDocumentView(4);
  assert.equal(
    prismPrimitives(view, { edges: PRISM_LIMITS.edges, vertices: PRISM_LIMITS.vertices }).edgeFallback,
    false
  );
  assert.equal(prismPrimitives(view, { edges: 513, vertices: 20 }).edgeFallback, false);
  assert.equal(prismPrimitives(view, { edges: 513, vertices: 20 }).quadEdges, true);
  assert.equal(prismPrimitives(view, { edges: 10001, vertices: 20 }).edgeFallback, true);
  assert.equal(prismPrimitives(view, { edges: 513, vertices: 20 }).vertexFallback, true);
  assert.equal(prismPrimitives(stylePreset('neon'), { edges: 513 }).edgeFallback, false);
  const model = structuredClone(cases[0].model);
  model.edges = Array.from({ length: 513 }, (_, i) => model.edges[i % model.edges.length]);
  const v = cpuViewer(model);
  try {
    v.setDisplay(defaultDocumentView(3));
    assert.equal(v.lines.visible, false);
    assert.equal(v.prismEdges.visible, true);
    assert.equal(v.points.visible, false);
    assert.equal(v.edgeGeometry.attributes.position.count, 1026);
    assert.deepEqual(v.primitiveCounts, { spheres: 0, cylinders: 0, collapsedEdges: 0 });
    v.setDisplay(stylePreset('neon'));
    assert.equal(v.edgeCylinders.visible, true);
    assert.equal(v.edgeCylinders.count, 513);
  } finally {
    v.clear();
  }
});

test('radial background is brighter centrally, cached and transparent for PNG then restored', () => {
  let alpha = 1;
  const v = {
      scene: new THREE.Scene(),
      renderer: { getClearAlpha: () => alpha, setClearColor: (_color, a) => (alpha = a) },
    },
    options = defaultDocumentView(3).appearance;
  applyBackground(v, options);
  const texture = v.scene.background;
  assert.equal(texture.image.width, 256);
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
  const data = texture.image.data;
  assert.ok(data[(148 * 256 + 122) * 4] > data[0]);
  applyBackground(v, options);
  assert.equal(v.scene.background, texture);
  let disposed = 0;
  texture.addEventListener('dispose', () => disposed++);
  applyBackground(v, { ...options, backgroundMode: 'transparent' });
  assert.equal(v.scene.background, null);
  assert.equal(alpha, 0);
  assert.equal(disposed, 1);
  applyBackground(v, options);
  assert.equal(alpha, 1);
  assert.ok(v.scene.background);
  v.appearanceGradient.dispose();
});

test('tour and media compositing use the same normalized radial spotlight and saved colors', () => {
  const stops = [],
    scales = [],
    fills = [],
    gradient = { addColorStop: (...v) => stops.push(v) },
    context = {
      save() {},
      restore() {},
      scale: (...v) => scales.push(v),
      createRadialGradient: (...v) => {
        assert.deepEqual(v, [0.48, 0.42, 0, 0.48, 0.42, 0.78]);
        return gradient;
      },
      fillRect() {
        fills.push(this.fillStyle);
      },
    };
  const layers = [{ layer: { transitionPose: { opacity: 1 } }, actor: { state: { view: defaultDocumentView(4) } } }];
  compositeAppearanceBackground(context, 1600, 900, layers);
  compositeAppearanceBackground(context, 1600, 900, layers);
  assert.deepEqual(scales, [[1600, 900]]);
  assert.deepEqual(stops, [
    [0, '#202c43'],
    [1, '#090f1c'],
  ]);
  assert.equal(fills[1], gradient);
  assert.equal(context.globalAlpha, 1);
});

test('Prism tone mapping is shared by the viewer and capture while old styles retain their mapping', () => {
  const v = { renderer: { getClearAlpha: () => 1, setClearColor() {} } };
  applyViewerAppearance(v, defaultDocumentView(3));
  assert.equal(v.renderer.toneMapping, THREE.ACESFilmicToneMapping);
  assert.equal(v.renderer.toneMappingExposure, 1);
  applyViewerAppearance(v, stylePreset('paper'));
  assert.equal(v.renderer.toneMapping, THREE.NoToneMapping);
});

test('worker presentation identity changes when switching Prism palette or primitive policy', () => {
  const view = defaultDocumentView(4);
  assert.notEqual(
    stereographicViewSignature(view),
    stereographicViewSignature({ ...view, appearance: { ...view.appearance, style: 'glass' } })
  );
});

test('mounted Prism picker applies 4D defaults, synchronizes visible choices, marks dirty and respects export lock', () => {
  const picker = {},
    reset = {},
    nodes = Object.fromEntries(
      ['faces-visible', 'vertices-visible', 'surface-opacity', 'surface-colors', 'render-style'].map((id) => [id, {}])
    );
  let mounted,
    dirty = 0,
    exporting = false;
  const panel = { querySelector: (selector) => (selector === 'select' ? picker : reset) },
    previous = globalThis.document,
    state = { model: { dimension: 4 }, view: legacyDocumentView(4) };
  globalThis.document = {
    createElement: () => panel,
    querySelector: () => ({ prepend: (value) => (mounted = value) }),
    getElementById: (id) => nodes[id],
  };
  try {
    const controls = mountStyleControls({
      guard: (fn) => fn,
      getState: () => state,
      isExporting: () => exporting,
      display() {},
      markDirty() {
        dirty++;
      },
    });
    picker.value = 'prism';
    picker.onchange();
    assert.equal(mounted.id, 'style-settings');
    assert.equal(state.view.surfaceColors, 'cell-type');
    assert.equal(nodes['surface-colors'].value, 'cell-type');
    assert.equal(nodes['render-style'].value, 'translucent');
    assert.equal(dirty, 1);
    state.view.appearance.background = '#000000';
    reset.onclick();
    assert.equal(state.view.appearance.background, '#202c43');
    exporting = true;
    controls.sync();
    assert.equal(reset.disabled, true);
    assert.throws(() => reset.onclick(), /export/);
  } finally {
    globalThis.document = previous;
  }
});
