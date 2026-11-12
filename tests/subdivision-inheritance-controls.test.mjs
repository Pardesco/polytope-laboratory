import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SubdivisionInheritanceControls,
  inheritanceStateSignature,
  describeInheritance,
} from '../ui/subdivision-inheritance-controls.mjs';
import { numericControlFixture, deferred, flush } from './numeric-control-fixture.mjs';
import { FaceConwayControls } from '../ui/face-conway-controls.mjs';

function fixture(input = { kind: 'faces', method: 'kis', height: '1/2' }) {
  const f = numericControlFixture(SubdivisionInheritanceControls.prototype, {
    'inheritance-kind': 'faces',
    'preview-subdivision-inheritance': '',
    'adopt-subdivision-inheritance': '',
    'cancel-subdivision-inheritance': '',
    'subdivision-inheritance-status': '',
    'subdivision-inheritance-owners': '',
  });
  f.input = input;
  f.control.target = () => ({ ...f.input });
  f.requests = [];
  f.context.run = async (op, params, model, label, options) => {
    f.requests.push({ op, params, model, label, options });
    const state = structuredClone(f.state);
    state.model.id = 'preview-id';
    state.model.validation = { passed: true };
    return {
      state,
      receipt: {
        scenarioId: 'con-08-subdivision-inheritance',
        operation: params.operation,
        parameters: params.parameters,
        counts: { vertices: 4, edges: 6, faces: 4, cells: 0 },
        sourceFaceIds: [0, 1, 2, 3],
        faceColorSourceIds: [0, null, null, null],
        detachedColorFaceIds: [],
        mappedContent: [],
        detachedContent: [{ kind: 'face', sourceIndex: 0 }],
        retainedArchiveCount: 1,
        numericPolicy: 'Float64 approximate. Literal refinement does not assert equal edges or regular faces.',
      },
    };
  };
  f.context.commit = async (op, params, label, options) => {
    options.verifyPublication();
    f.calls.push([op, params, label]);
    f.options.push(options);
    const state = structuredClone(f.control.previewData.packet.state);
    state.model.id = 'adopt-id';
    const result = { states: [state], cursor: 0 };
    options.verifyResult?.(result);
    return result;
  };
  return f;
}

test('preview uses a detached document and NumericEntry; adoption recomputes and compares native state', async () => {
  const f = fixture();
  await f.control.apply();
  assert.equal(f.calls.length, 0);
  assert.equal(f.requests[0].op, 'subdivision-inheritance-preview');
  assert.notEqual(f.requests[0].params.document, f.document);
  assert.deepEqual(f.requests[0].params.parameters, { method: 'kis', height: 0.5 });
  assert.equal(f.requests[0].model, null);
  assert.ok(f.requests[0].options.signal);
  assert.equal(f.nodes['adopt-subdivision-inheritance'].disabled, false);
  await f.control.apply(true);
  assert.deepEqual(f.calls[0].slice(0, 2), ['subdivide-faces', { method: 'kis', height: 0.5 }]);
  assert.match(f.nodes['subdivision-inheritance-status'].textContent, /source RGBA.*detached.*Float64 approximate/);
  assert.match(
    f.nodes['subdivision-inheritance-owners'].textContent,
    /Face 0: source face 0; color from source face 0/
  );
});

test('Conway and literal edge selection reuse existing native options and expression domains', async () => {
  for (const [input, operation, parameters] of [
    [{ kind: 'conway', notation: ' k ', height: '1/2' }, 'conway', { notation: 'k', height: 0.5 }],
    [{ kind: 'conway', notation: 'a', height: '' }, 'conway', { notation: 'a' }],
    [{ kind: 'edges', divisions: '2+3', ids: '3, 1; 0' }, 'subdivide-edges', { divisions: 5, edge_ids: [3, 1, 0] }],
    [{ kind: 'edges', divisions: '1', ids: '' }, 'subdivide-edges', { divisions: 1 }],
    [{ kind: 'faces', method: 'centroid', height: 'bogus ignored' }, 'subdivide-faces', { method: 'centroid' }],
  ]) {
    const f = fixture(input);
    await f.control.apply();
    assert.equal(f.requests[0].params.operation, operation);
    assert.deepEqual(f.requests[0].params.parameters, parameters);
  }
  for (const ids of ['sqrt(4)', '-1', '1.0']) {
    const f = fixture({ kind: 'edges', divisions: '2', ids });
    await assert.rejects(f.control.apply(), /literal/);
    assert.equal(f.requests.length, 0);
  }
  const f = fixture({ kind: 'edges', divisions: '3/2', ids: '' });
  await assert.rejects(f.control.apply(), /integer domain/);
});

test('preview and adoption bind colors, content, archives, notes, units, settings, history and active source', async () => {
  const changes = [
    (f) => (f.state.model.metadata.offColors.faces[0].values[3] = 0.1),
    (f) => (f.state.notes = 'late'),
    (f) => (f.state.view.coordinateUnit = 'cm'),
    (f) => (f.state.view.elementAnnotations = { late: true }),
    (f) => (f.state.view.elementContentDetached = [{ late: true }]),
    (f) => (f.input.height = '3'),
    (f) => (f.document.operationHistory = { late: true }),
    (f) => f.setProject({ documents: [], active: 0 }),
    (f) => f.setExport(true),
  ];
  for (const change of changes) {
    const f = fixture();
    await f.control.apply();
    change(f);
    await assert.rejects(f.control.apply(true));
    assert.equal(f.calls.length, 0);
    const g = fixture(),
      hold = deferred(),
      base = g.context.run;
    g.context.run = async (...args) => {
      const packet = await base(...args);
      await hold.promise;
      return packet;
    };
    const pending = g.control.apply();
    await flush();
    change(g);
    hold.resolve();
    await assert.rejects(pending);
    assert.equal(g.control.previewData, null);
  }
});

test('a late color or content change after native adoption await blocks publication', async () => {
  for (const change of [(f) => (f.state.notes = 'late'), (f) => (f.state.view.elementAnnotations = { late: true })]) {
    const f = fixture();
    await f.control.apply();
    const hold = deferred();
    let published = false;
    f.context.commit = async (op, params, label, options) => {
      await hold.promise;
      options.verifyPublication();
      published = true;
    };
    const pending = f.control.apply(true);
    await flush();
    change(f);
    hold.resolve();
    await assert.rejects(pending);
    assert.equal(published, false);
  }
});

test('geometry, RGBA, units, archive or active-content disagreement rejects native adoption', async () => {
  for (const change of [
    (s) => (s.model.vertices[0][0] = 0.1),
    (s) => (s.model.metadata.offColors.faces[0].values[3] = 0.1),
    (s) => (s.view.coordinateUnit = 'cm'),
    (s) => (s.view.elementContentDetached = [{ forged: true }]),
    (s) => (s.view.elementAnnotations = { entries: [{ text: 'forged' }] }),
  ]) {
    const f = fixture();
    await f.control.apply();
    f.context.commit = async (op, p, l, options) => {
      const state = structuredClone(f.control.previewData.packet.state);
      change(state);
      options.verifyResult({ states: [state], cursor: 0 });
    };
    await assert.rejects(f.control.apply(true), /differed from the preview/);
    assert.equal(f.control.previewData, null);
    assert.equal(f.nodes['adopt-subdivision-inheritance'].disabled, true);
  }
});

test('observer pose stays independent while cancel and export refuse publication', async () => {
  const f = fixture();
  await f.control.apply();
  f.state.view.angles[0] = 42;
  f.state.view.camera = { position: [2, 3, 4] };
  await f.control.apply(true);
  const g = fixture(),
    hold = deferred();
  g.context.run = () => hold.promise;
  const pending = g.control.apply();
  await flush();
  await assert.rejects(g.control.apply(), /current preview/);
  g.control.cancel();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(g.control.previewData, null);
  assert.equal(g.control.busy, false);
  g.setExport(true);
  await assert.rejects(g.control.apply(), /export/);
  hold.resolve();
});

test('state comparison tolerates only volatile result IDs and annotation-source hash; preserves all owned payloads', () => {
  const a = {
    model: { id: 'a', vertices: [[0]], metadata: { offColors: { faces: [null] } } },
    view: {
      coordinateUnit: 'mm',
      elementAnnotations: { source: { id: 'a', vertices: [[0]] }, sourceSha256: 'first', entries: [], assets: {} },
    },
    notes: 'n',
  };
  const b = structuredClone(a);
  b.model.id = 'b';
  b.view.elementAnnotations.source.id = 'b';
  b.view.elementAnnotations.sourceSha256 = 'second';
  assert.equal(inheritanceStateSignature(a), inheritanceStateSignature(b));
  b.view.elementAnnotations.assets.image = 'forged';
  assert.notEqual(inheritanceStateSignature(a), inheritanceStateSignature(b));
});

test('unmapped face and alpha-zero RGBA remain visible in owner copy', async () => {
  const f = fixture();
  const packet = await f.control.apply();
  packet.receipt.sourceFaceIds[1] = null;
  packet.state.model.metadata.offColors.faces[0].values[3] = 0;
  const text = describeInheritance(packet);
  assert.match(text.owners, /Face 1: no verified source face; color unassigned/);
  assert.match(text.owners, /0.6, 0\]/);
});

test('parent construction activity blocks preview and parent sync preserves child adoption availability', async () => {
  const f = fixture();
  f.context.isBusy = () => true;
  f.control.sync();
  assert.equal(f.nodes['preview-subdivision-inheritance'].disabled, true);
  await assert.rejects(f.control.apply(), /current preview/);
  assert.equal(f.requests.length, 0);
  const parent = numericControlFixture(FaceConwayControls.prototype, {
    'face-conway-cancel': '',
    'adopt-subdivision-inheritance': '',
  });
  parent.control.inheritance = {
    sync() {
      parent.nodes['adopt-subdivision-inheritance'].disabled = true;
    },
  };
  parent.control.sync();
  assert.equal(parent.nodes['adopt-subdivision-inheritance'].disabled, true);
});
