import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { Viewer } from '../ui/viewer.js';
import { createMaterialEffectOwner } from '../ui/viewer-material-effects.mjs';

const data = JSON.parse(
  execFileSync(
    'python',
    [
      '-B',
      '-c',
      `import json
from engine.generators import regular
from engine.server import dispatch
out={}
for key in ('tesseract','cell120'):
 source=regular(key)
 packets=[dispatch({'op':'section','model':source,'params':{'normal':[.2,.3,.4,1],'offset':depth}}) for depth in (0,.05,.1,.15,.2,10)]
 out[key]={'source':source,'packets':packets}
source=out['tesseract']['source']
out['ordinary']=[dispatch({'op':'section','model':source,'params':{'normal':[0,0,0,1],'offset':depth,'section_domain':'ordinary-cells'}}) for depth in (0,.5,1,10)]
print(json.dumps(out))`,
    ],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      windowsHide: true,
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
    }
  )
);
const names = ['lines', 'points', 'surface', 'highlight'];
const view = {
  angles: [0, 0, 0, 0, 0, 0],
  projection: 'orthographic',
  faces: true,
  edges: true,
  vertices: true,
  surfaceColors: 'source',
  surfaceOpacity: 0.65,
};
function viewer() {
  const value = Object.create(Viewer.prototype);
  value.group = new THREE.Group();
  return value;
}
function buffers(value) {
  return Object.fromEntries(
    ['pointGeometry', 'edgeGeometry', 'surfaceGeometry', 'highlightGeometry'].map((key) => [
      key,
      Object.fromEntries(
        Object.entries(value[key].attributes).map(([name, attribute]) => [
          name,
          { itemSize: attribute.itemSize, array: [...attribute.array] },
        ])
      ),
    ])
  );
}
function appearance(value) {
  return Object.fromEntries(
    names.map((name) => {
      const material = value[name].material;
      return [
        name,
        {
          visible: value[name].visible,
          color: material.color.getHex(),
          specular: material.specular?.getHex(),
          shininess: material.shininess,
          flatShading: material.flatShading,
          opacity: material.opacity,
          transparent: material.transparent,
          depthWrite: material.depthWrite,
          vertexColors: material.vertexColors,
          size: material.size,
        },
      ];
    })
  );
}
function fresh(model, display = view) {
  const value = viewer();
  value.setModel(model);
  if (model) value.setDisplay(display);
  return value;
}

test('native changing 120-cell and tesseract cuts retain materials but rebuild all buffers and picking like a fresh viewer', () => {
  for (const { source, packets } of Object.values(data).filter((item) => item.source)) {
    const value = viewer(),
      before = structuredClone(source);
    let materials, previous;
    for (const { model } of packets.filter((packet) => packet.model)) {
      const oldGeometry = value.surfaceGeometry;
      let disposed = false;
      oldGeometry?.addEventListener('dispose', () => (disposed = true));
      value.setSectionModel(model, source);
      value.setDisplay(view);
      const reference = fresh(model);
      if (materials) {
        names.forEach((name, index) => assert.strictEqual(value[name].material, materials[index]));
        assert.equal(disposed, true);
        assert.notStrictEqual(value.surfaceGeometry, oldGeometry);
        assert.notStrictEqual(value.publishedPickState, previous);
      }
      materials = names.map((name) => value[name].material);
      previous = value.publishedPickState;
      assert.deepEqual(buffers(value), buffers(reference));
      assert.deepEqual(appearance(value), appearance(reference));
      assert.deepEqual(value.publishedPickState, reference.publishedPickState);
      assert.deepEqual(source, before);
      reference.clear();
    }
    value.clear();
  }
});

test('ordinary-cell cuts, boundary rank and empty sections rebuild their literal result without retaining empty materials', () => {
  const value = viewer(),
    source = data.tesseract.source;
  for (const packet of data.ordinary) {
    const materials = value.model ? names.map((name) => value[name].material) : [],
      disposed = [];
    materials.forEach((material, index) => material.addEventListener('dispose', () => disposed.push(index)));
    value.setSectionModel(packet.model, source, { mode: 'cell-section' });
    assert.strictEqual(value.model, packet.model);
    if (packet.model) {
      value.setDisplay(view);
      const reference = fresh(packet.model);
      assert.deepEqual(buffers(value), buffers(reference));
      reference.clear();
      assert.deepEqual(disposed, []);
    } else {
      assert.deepEqual(disposed.toSorted(), [0, 1, 2, 3]);
      assert.equal(value.group.children.length, 0);
      assert.equal(value.publishedPickState, null);
      assert.equal(value.sectionMaterialSource, null);
    }
  }
});

test('source replacement with a claimed identical fingerprint, mode changes and intervening nonsections dispose old materials', () => {
  const value = viewer(),
    source = data.tesseract.source,
    model = data.tesseract.packets[0].model;
  value.setSectionModel(model, source);
  for (const [nextSource, mode, intervene] of [
    [structuredClone(source), 'section', false],
    [source, 'cell-section', false],
    [source, 'section', true],
  ]) {
    const old = names.map((name) => value[name].material),
      disposed = [];
    old.forEach((material, index) => material.addEventListener('dispose', () => disposed.push(index)));
    if (intervene) value.setModel(model);
    value.setSectionModel(model, nextSource, { mode });
    names.forEach((name, index) => assert.notStrictEqual(value[name].material, old[index]));
    assert.deepEqual(disposed.toSorted(), [0, 1, 2, 3]);
  }
  assert.throws(() => value.setSectionModel(model, source, { mode: 'net' }), /Unsupported/);
  value.clear();
});

test('same-owner mutated result colors, topology, visibility and appearance match fresh buffers and material state', () => {
  const source = structuredClone(data.tesseract.source),
    value = viewer(),
    before = structuredClone(source);
  value.setSectionModel(data.tesseract.packets[0].model, source);
  value.select([0]);
  const material = value.surface.material;
  for (const [index, rgba] of [
    [1, [255, 30, 10, 70]],
    [2, [20, 180, 255, 255]],
  ]) {
    const model = structuredClone(data.tesseract.packets[index].model);
    model.metadata.offColors = { faces: model.faces.map(() => ({ encoding: 'byte', values: rgba })) };
    const display = {
      ...view,
      surfaceOpacity: 1,
      vertices: index === 2,
      edges: index !== 2,
      appearance: { tint: '#ffd6a8', specular: '#806040', shininess: 70, edgeColor: '#123456', vertexColor: '#abcdef' },
    };
    // Same JavaScript source identity cannot authorize geometry/data reuse.
    source.metadata.coordinateUnits = index === 1 ? 'cm' : 'mm';
    value.setSectionModel(model, source);
    value.setDisplay(display);
    const reference = fresh(model, display);
    assert.strictEqual(value.surface.material, material);
    assert.deepEqual(buffers(value), buffers(reference));
    assert.deepEqual(appearance(value), appearance(reference));
    assert.deepEqual(value.selected, []);
    assert.equal(value.surfaceVertexAlpha, index === 1);
    assert.equal(value.surface.material.depthWrite, index === 2);
    reference.clear();
  }
  delete source.metadata.coordinateUnits;
  assert.deepEqual(source, before);
  value.clear();
});

test('pending studio environment belongs to the old result and is disposed even when section materials survive', async () => {
  const { source, packets } = data.tesseract,
    value = viewer();
  value.setSectionModel(packets[0].model, source);
  value.setDisplay(view);
  let loaded,
    disposed = 0;
  const texture = new THREE.CubeTexture();
  texture.addEventListener('dispose', () => disposed++);
  const owner = createMaterialEffectOwner(value, {
    loadCube: (_urls, onLoad) => {
      loaded = onLoad;
      return texture;
    },
  });
  value.materialEffectsOwner = owner;
  value.surface.material.envMap = texture;
  const material = value.surface.material;
  value.setSectionModel(packets[1].model, source);
  assert.strictEqual(value.surface.material, material);
  await assert.rejects(owner.ready, { name: 'AbortError' });
  assert.equal(owner.disposed, true);
  assert.equal(disposed, 1);
  assert.equal(material.envMap, null);
  assert.equal(value.materialEffectsOwner, null);
  loaded(texture);
  assert.equal(disposed, 1);
  assert.equal(material.envMap, null);
  value.clear();
});

test('empty model disposes retained materials once and a subsequent section starts with new materials', () => {
  const value = viewer(),
    { source, packets } = data.tesseract;
  value.setSectionModel(packets[0].model, source);
  const materials = names.map((name) => value[name].material),
    disposed = [];
  materials.forEach((material, index) => material.addEventListener('dispose', () => disposed.push(index)));
  value.setModel(null, { reuseMaterials: true });
  assert.deepEqual(disposed.toSorted(), [0, 1, 2, 3]);
  value.clear();
  assert.equal(disposed.length, 4);
  value.setSectionModel(packets[0].model, source);
  names.forEach((name, index) => assert.notStrictEqual(value[name].material, materials[index]));
  value.clear();
});
