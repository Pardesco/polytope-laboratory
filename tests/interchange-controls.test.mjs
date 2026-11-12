import { readAppSource } from './helpers/app-source.mjs';
import { matchSource } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Viewer } from '../ui/viewer.js';
import { rememberElementTypes, TYPE_PALETTE } from '../ui/element-types.mjs';
import {
  captureInterchangeDisplay,
  interchangeDisplaySignature,
  derivedExportGeometry,
  InterchangeExportControls,
  DISPLAY_FORMATS,
} from '../ui/interchange-controls.mjs';
import { GeometryExportSession } from '../ui/geometry-export-session.mjs';
import { numericControlFixture, deferred, flush } from './numeric-control-fixture.mjs';

const models = JSON.parse(
  execFileSync(
    'python',
    [
      '-c',
      "import json;from engine.generators import regular;from engine.operations import section,dual,vertex_figure;from engine.generalized_nets import unfold_source;from engine.cell_nets import cell_net;print(json.dumps(dict(cube=regular('cube'),tesseract=regular('tesseract'),section=section(regular('tesseract'))['model'],dual=dual(regular('cube')),figure=vertex_figure(regular('tesseract'))['model'],net=unfold_source(regular('cube')),cellNet=cell_net(regular('tesseract')))))",
    ],
    { encoding: 'utf8' }
  )
);
function viewer(model) {
  const v = Object.create(Viewer.prototype);
  v.group = new THREE.Group();
  v.setModel(model);
  v.setDisplay({
    projection: 'perspective',
    angles: [0, 0, 24, 0, 18, 0],
    faces: true,
    edges: true,
    vertices: true,
    surfaceColors: 'source',
    surfaceOpacity: 0.8,
  });
  return v;
}
function native(model, params) {
  return JSON.parse(
    execFileSync(
      'python',
      ['-c', 'import json,sys;from engine.server import dispatch;print(json.dumps(dispatch(json.load(sys.stdin))))'],
      { input: JSON.stringify({ op: 'prepare-view-export', model, params }), encoding: 'utf8' }
    )
  );
}
for (const [name, count, lines] of [
  ['cube', 12, 12],
  ['tesseract', 48, 32],
])
  test(name + ' actual Viewer buffers export colored projected GLB through native dispatch', () => {
    const model = structuredClone(models[name]);
    model.metadata.offColors = { faces: model.faces.map(() => ({ encoding: 'byte', values: [64, 128, 255, 128] })) };
    const v = viewer(model),
      before = JSON.stringify(model),
      snapshot = captureInterchangeDisplay(v, model);
    assert.equal(snapshot.triangles.length, count);
    assert.equal(snapshot.edges.length, lines);
    assert.equal(snapshot.nodes.length, model.vertices.length);
    const source = v.surfaceGeometry.attributes.color;
    assert.deepEqual(snapshot.colors[0].slice(0, 3), Array.from(source.array.slice(0, 3)));
    assert.ok(Math.abs(snapshot.colors[0][3] - (128 / 255) * 0.8) < 1e-6);
    const result = native(model, {
        display: snapshot,
        size_m: 0.25,
        document_metadata: { title: 'Projected ' + name },
      }),
      bytes = Buffer.from(result.text, 'base64');
    assert.equal(bytes.readUInt32LE(0), 0x46546c67);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    assert.equal(doc.asset.extras.title, 'Projected ' + name);
    assert.equal(result.report.triangleCount, count);
    assert.equal(result.report.lineCount, lines);
    assert.ok(result.report.encodedSizeResidualMeters < 1e-7);
    assert.equal(JSON.stringify(model), before);
    const old = snapshot.colors[0][0];
    source.array[0] = 0.99;
    assert.equal(snapshot.colors[0][0], old);
    v.clear();
  });

test('visibility flags and zero edge placeholders are honored; color changes invalidate review', () => {
  const model = models.cube,
    v = viewer(model);
  v.setDisplay({ ...v.view, vertices: false, edges: false });
  const snapshot = captureInterchangeDisplay(v, model);
  assert.equal(snapshot.nodes.length, 0);
  assert.equal(snapshot.edges.length, 0);
  const signature = interchangeDisplaySignature(v);
  v.surfaceGeometry.attributes.color.needsUpdate = true;
  assert.notEqual(interchangeDisplaySignature(v), signature);
  v.setDisplay({ ...v.view, edges: true, hiddenEdges: [0] });
  v.edgeGeometry.attributes.position.array.fill(0, 0, 6);
  assert.equal(captureInterchangeDisplay(v, model).edges.length, 11);
  v.clear();
});

test('face and native element-type palettes are copied from linear displayed colors', () => {
  const model = structuredClone(models.cube),
    v = viewer(model);
  rememberElementTypes(model, {
    available: true,
    types: {
      face: [
        { typeId: 0, ids: [0, 2, 4] },
        { typeId: 1, ids: [1, 3, 5] },
      ],
    },
  });
  v.setDisplay({ ...v.view, surfaceColors: 'face-type', surfaceOpacity: 1 });
  const snapshot = captureInterchangeDisplay(v, model),
    expected = new THREE.Color(TYPE_PALETTE[0]).toArray();
  snapshot.colors[0].slice(0, 3).forEach((x, i) => assert.ok(Math.abs(x - expected[i]) < 1e-6));
  const old = interchangeDisplaySignature(v);
  v.setDisplay({ ...v.view, surfaceColors: 'face' });
  assert.notEqual(interchangeDisplaySignature(v), old);
  assert.notDeepEqual(captureInterchangeDisplay(v, model).colors[0], snapshot.colors[0]);
  v.clear();
});

test('source components assign every face, edge and point to their GLB child node', () => {
  const model = structuredClone(models.cube),
    other = structuredClone(models.cube),
    offset = model.vertices.length;
  other.vertices = other.vertices.map((p) => p.map((x, i) => x + (i === 0 ? 4 : 0)));
  for (const key of ['vertices', 'edges', 'faces']) {
    const ids = model[key].map((_, i) => i);
    model.components ??= [];
    if (key === 'vertices')
      model.components = [
        { name: 'Left', maps: {} },
        { name: 'Right', maps: {} },
      ];
    model.components[0].maps[key] = ids;
    model.components[1].maps[key] = other[key].map((_, i) => i + model[key].length);
  }
  model.vertices.push(...other.vertices);
  model.edges.push(...other.edges.map((e) => e.map((v) => v + offset)));
  model.faces.push(...other.faces.map((f) => f.map((v) => v + offset)));
  delete model.facetEquations;
  delete model.facetVertices;
  model.interpretation = 'generalized-complex';
  const v = viewer(model),
    snapshot = captureInterchangeDisplay(v, model);
  assert.equal(snapshot.triangles_components.filter((x) => x === 1).length, 12);
  assert.equal(snapshot.edges_components.filter((x) => x === 1).length, 12);
  assert.equal(snapshot.nodes_components.filter((x) => x === 1).length, 8);
  const result = native(model, { display: snapshot }),
    bytes = Buffer.from(result.text, 'base64');
  const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.deepEqual(
    doc.nodes.slice(1).map((n) => n.name),
    ['Left', 'Right']
  );
  v.clear();
});

test('section, dual and vertex figure reuse the selected derived model and every display format', () => {
  for (const name of ['section', 'dual', 'figure']) {
    const model = models[name],
      v = viewer(model);
    assert.strictEqual(derivedExportGeometry(model, v, null), model);
    const snapshot = captureInterchangeDisplay(v, model);
    assert.ok(snapshot.triangles.length > 0);
    const script =
      "import json,sys;from engine.interchange import prepare_view_export,VIEW_FORMATS;x=json.load(sys.stdin);print(json.dumps([prepare_view_export(x['model'],x['display'],format=f)['report']['triangleCount'] for f in VIEW_FORMATS]))";
    const counts = JSON.parse(
      execFileSync('python', ['-c', script], { encoding: 'utf8', input: JSON.stringify({ model, display: snapshot }) })
    );
    assert.deepEqual(
      counts,
      DISPLAY_FORMATS.map(() => snapshot.triangles.length)
    );
    v.clear();
  }
});

test('flat and folded net layout adapters remain stable and export their actual face placement', () => {
  const net = models.net,
    v = Object.create(Viewer.prototype);
  v.group = new THREE.Group();
  const flat = derivedExportGeometry(null, v, net);
  assert.strictEqual(derivedExportGeometry(null, v, net), flat);
  assert.equal(flat.faces.length, net.faces.length);
  assert.equal(captureInterchangeDisplay(v, flat).triangles.length, 12);
  v.setNet(net);
  v.setFold(0.5);
  const folded = derivedExportGeometry(null, v, net);
  assert.notStrictEqual(folded, flat);
  const snapshot = captureInterchangeDisplay(v, folded);
  assert.equal(snapshot.triangles.length, 12);
  assert.ok(snapshot.triangles.some((t) => t.some((p) => Math.abs(p[2]) > 0.001)));
  assert.equal(native(folded, { display: snapshot }).report.triangleCount, 12);
  assert.equal(derivedExportGeometry(null, v, net, { pending: true }), null);
  v.clear();
});

test('cell net export uses the displayed shrunk cell faces and component hierarchy', () => {
  const v = Object.create(Viewer.prototype);
  v.group = new THREE.Group();
  v.setCellNet(models.cellNet, 0.8);
  const model = derivedExportGeometry(null, v, null, { mode: 'cell-net' }),
    snapshot = captureInterchangeDisplay(v, model);
  assert.equal(snapshot.triangles.length, 96);
  assert.equal(snapshot.triangles_components.length, 96);
  const result = native(model, { display: snapshot });
  assert.equal(result.report.triangleCount, 96);
  assert.equal(result.report.coordinateDomain, 'displayed 3D geometry');
  v.clear();
});

function controlFixture() {
  const f = numericControlFixture(InterchangeExportControls.prototype, {}),
    v = viewer(f.state.model);
  f.control.kind = { value: 'displayed' };
  f.control.size = { value: '1/2' };
  f.context.getGeometry = () => f.state.model;
  f.context.getViewer = () => v;
  f.context.prepareView = async (m, p) => {
    f.calls.push([m, p]);
    return native(m, p);
  };
  return { ...f, v };
}
test('NumericEntry resolves physical size and capture uses the live geometry owner despite detached native input', async () => {
  const f = controlFixture();
  const result = await f.control.prepare(
    structuredClone(f.state.model),
    { format: 'glb', source_unit: 'mm', target_unit: 'm' },
    { signal: new AbortController().signal }
  );
  assert.equal(result.report.sizeMeters, 0.5);
  assert.equal(f.expressionCalls.length, 1);
  assert.equal(f.calls[0][1].display.triangles.length, 4);
  f.v.clear();
});

test('a held native preparation refuses changed display colors', async () => {
  const f = controlFixture(),
    gate = deferred();
  f.context.prepareView = () => gate.promise;
  const pending = f.control.prepare(
    structuredClone(f.state.model),
    { format: 'glb', source_unit: 'mm', target_unit: 'm' },
    { signal: new AbortController().signal }
  );
  await flush();
  f.v.surfaceGeometry.attributes.color.needsUpdate = true;
  gate.resolve({ text: 'old', report: {} });
  await assert.rejects(pending, /colors or pose changed/);
  f.v.clear();
});

test('reviewed GLB and material pairs use the existing publisher and reject changes during the destination chooser', async () => {
  for (const format of ['glb', 'obj']) {
    const f = numericControlFixture(Object.prototype, {}),
      events = [],
      selection = { format, source: 'derived', unit: 'm', displayed: { enabled: true } },
      gate = deferred();
    let pose = 'a';
    Object.assign(f.context, {
      getGeometry: () => models.section,
      getSelection: () => selection,
      getDisplaySignature: () => pose,
      describe: async () => ({ formats: [{ format, available: true }] }),
      prepare: async (m, p) => ({
        text: format === 'glb' ? btoa('glTF\0binary') : 'obj',
        ...(format === 'obj' ? { materials: 'mtl' } : {}),
        report: {
          sourceUnit: p.source_unit,
          targetUnit: p.target_unit,
          losses: [],
          encoding: format === 'glb' ? 'base64' : 'utf8',
        },
      }),
      api: {
        beginGeometryExport: async () => ({ id: 'ticket' }),
        writeGeometryExport: async (id, payload) => {
          events.push(payload);
          return { path: 'out.' + format };
        },
        abortGeometryExport: async (id) => events.push(['abort', id]),
      },
    });
    const session = new GeometryExportSession(f.context);
    await session.prepare();
    await session.confirm();
    if (format === 'glb') assert.equal(new TextDecoder().decode(events[0]), 'glTF\0binary');
    else assert.deepEqual(events[0], { obj: 'obj', mtl: 'mtl' });
    f.context.api.beginGeometryExport = () => gate.promise;
    const pending = session.confirm();
    await flush();
    pose = 'b';
    gate.resolve({ id: 'late' });
    await assert.rejects(pending, /changed/);
    assert.deepEqual(events.at(-1), ['abort', 'late']);
  }
});

test('new controls, native dispatch, warm worker and bounded profile are mounted in the application', () => {
  const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  matchSource(read('ui/export-controls.mjs'), /new InterchangeExportControls/);
  matchSource(readAppSource(), /prepareView:.*prepare-view-export/);
  matchSource(readAppSource(), /getDerived:\(\)=>derivedExportGeometry/);
  matchSource(read('desktop/engine-pool.cjs'), /add\('prepare-view-export'\)/);
  matchSource(read('desktop/geometry-export.cjs'), /'glb','x3d'/);
});
