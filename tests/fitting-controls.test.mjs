import test from 'node:test';
import assert from 'node:assert/strict';
import { FittingControls } from '../ui/fitting-controls.mjs';

function fixture(satisfied = true) {
  const inputs = { mode: 'equal-areas', target: '', faces: '', evaluations: '60', residual: '1e-7', solver: '1e-11' };
  const nodes = Object.fromEntries(
    Object.entries(inputs).map(([key, value]) => ['fitting-' + key, { value, disabled: false }])
  );
  for (const id of ['preview-fitting', 'adopt-fitting', 'cancel-fitting', 'accept-fitting-near-miss', 'fitting-result'])
    nodes[id] = { checked: false, disabled: false, textContent: '' };
  for (const id of ['regular-faces', 'planar-faces', 'equal-edges', 'equal-areas', 'keep-symmetry', 'fix-scale'])
    nodes['fitting-' + id] = { checked: id === 'fix-scale', disabled: false };
  nodes['make-faces-regular'] = { disabled: false };
  const state = {
    model: {
      id: 'source',
      dimension: 3,
      embeddingDimension: 3,
      interpretation: 'convex-polytope',
      vertices: [
        [1, 1, 1],
        [1, -1, -1],
        [-1, 1, -1],
        [-1, -1, 1],
      ],
      edges: [
        [0, 1],
        [0, 2],
        [0, 3],
        [1, 2],
        [1, 3],
        [2, 3],
      ],
      faces: [
        [0, 1, 2],
        [0, 1, 3],
        [0, 2, 3],
        [1, 2, 3],
      ],
      cells: [],
      metadata: { coordinateUnits: 'mm', offColors: { faces: [{ encoding: 'byte', values: [20, 40, 80, 127] }] } },
    },
    view: { coordinateUnit: 'mm' },
    notes: 'Keep notes',
  };
  const doc = { id: 'doc', cursor: 0, states: [state] },
    project = { id: 'project', active: 0, documents: [doc] },
    calls = [];
  const packet = {
    status: satisfied ? 'constraints-satisfied' : 'work-limit',
    model: structuredClone(state.model),
    evidence: {
      sourceModelId: 'source',
      requestedConstraintsSatisfied: satisfied,
      geometricValidity: { passed: true, diagnostics: [] },
      residuals: { maximum: satisfied ? 0 : 0.2, rms: 0.1, maximumPlanarity: 0 },
      solverTermination: { evaluations: 1 },
    },
  };
  const context = {
    getState: () => state,
    getDocument: () => doc,
    getProject: () => project,
    isExporting: () => Boolean(context.exporting),
    evaluateMany: async (texts) => texts.map(Number),
    preview: async (op, params, options) => {
      options.verifyPublication();
      calls.push(['preview', op, params, options]);
      return structuredClone(packet);
    },
    commit: async (op, params, label, options) => {
      options.verifyPublication();
      calls.push(['commit', op, params, options]);
      return 'adopted';
    },
  };
  const panel = { querySelector: (s) => nodes[s.slice(1)], querySelectorAll: () => Object.values(nodes) };
  const controls = Object.assign(Object.create(FittingControls.prototype), {
    context,
    panel,
    busy: false,
    previewData: null,
  });
  controls.sync();
  return { nodes, state, doc, context, packet, calls, controls };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('all three fitting modes use guarded native expressions and explicit unresolved adoption', async () => {
  for (const mode of ['regular-faces', 'equal-edges', 'equal-areas']) {
    const f = fixture();
    f.nodes['fitting-mode'].value = mode;
    if (mode === 'regular-faces') f.nodes['fitting-faces'].value = '[0,2]';
    await f.controls.preview();
    assert.equal(f.calls[0][1], 'geometry-fit-preview');
    assert.equal(f.calls[0][2].mode, mode);
    if (mode === 'regular-faces') assert.deepEqual(f.calls[0][2].face_ids, [0, 2]);
    assert.equal(await f.controls.adopt(), 'adopted');
    assert.equal(f.calls[1][1], 'geometry-fit');
    assert.equal(f.calls[1][2].adoption, 'constraints-satisfied');
  }
  const f = fixture(false);
  await f.controls.preview();
  assert.equal(f.nodes['adopt-fitting'].disabled, true);
  await assert.rejects(f.controls.adopt(), /Explicitly accept/);
  f.nodes['accept-fitting-near-miss'].checked = true;
  f.controls.sync();
  assert.equal(await f.controls.adopt(), 'adopted');
  assert.equal(f.calls[1][2].adoption, 'valid-near-miss');
});

test('held native preview refuses changed notes, history, controls and cancellation', async () => {
  for (const change of [
    (f) => (f.state.notes = 'Changed'),
    (f) => (f.doc.operationHistory = { edited: true }),
    (f) => (f.nodes['fitting-mode'].value = 'equal-edges'),
    (f) => f.controls.cancel(),
  ]) {
    const f = fixture();
    let resolve;
    f.context.preview = () => new Promise((r) => (resolve = r));
    const pending = f.controls.preview();
    await tick();
    change(f);
    resolve(f.packet);
    await assert.rejects(pending, /changed|canceled/);
    assert.equal(f.controls.previewData, null);
    assert.equal(f.controls.busy, false);
  }
});

test('invalid fitted geometry and changed incidence cannot be adopted', async () => {
  const f = fixture();
  f.packet.model = null;
  f.packet.status = 'invalid-realization';
  f.packet.evidence.geometricValidity = { passed: false, diagnostics: ['Nonplanar face.'] };
  await f.controls.preview();
  assert.equal(f.nodes['adopt-fitting'].disabled, true);
  await assert.rejects(f.controls.adopt(), /Invalid/);
  const g = fixture();
  g.packet.model.faces[0].reverse();
  await assert.rejects(g.controls.preview(), /literal source incidence/);
  assert.equal(g.controls.previewData, null);
});

test('primary Make faces regular commits only a current satisfied result through history', async () => {
  const f = fixture();
  assert.equal(await f.controls.makeRegular(), 'adopted');
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls[0][2].objectives, ['regular-faces']);
  assert.equal(f.calls[1][1], 'geometry-fit');
  assert.equal(f.calls[1][2].fix_scale, true);
  const unresolved = fixture(false);
  await unresolved.controls.makeRegular();
  assert.equal(unresolved.calls.length, 1);
  assert.equal(unresolved.nodes['adopt-fitting'].disabled, true);
  assert.match(unresolved.nodes['fitting-result'].textContent, /Not converged.*tolerance not met/);
});

test('planar and combined objectives include symmetry and scale preferences in native parameters', async () => {
  const f = fixture();
  f.nodes['fitting-mode'].value = 'planar-faces';
  f.nodes['fitting-equal-edges'].checked = true;
  f.nodes['fitting-keep-symmetry'].checked = true;
  await f.controls.preview();
  assert.deepEqual(f.calls[0][2].objectives, ['planar-faces', 'equal-edges']);
  assert.equal(f.calls[0][2].keep_symmetry, true);
  assert.equal(f.calls[0][2].fix_scale, true);
  f.nodes['fitting-fix-scale'].checked = false;
  f.controls.sync();
  assert.equal(f.nodes['adopt-fitting'].disabled, true);
  assert.equal(f.controls.previewData, null);
  const g = fixture();
  g.nodes['fitting-mode'].value = 'equal-edges';
  g.nodes['fitting-fix-scale'].checked = false;
  g.nodes['fitting-target'].value = '3';
  await g.controls.preview();
  assert.equal(g.calls[0][2].target, 3);
});

test('checkbox edits and export beginning during native preview prevent adoption', async () => {
  for (const change of [(f) => (f.nodes['fitting-equal-areas'].checked = true), (f) => (f.context.exporting = true)]) {
    const f = fixture();
    let resolve;
    f.context.preview = () => new Promise((r) => (resolve = r));
    const pending = f.controls.preview();
    await tick();
    change(f);
    resolve(f.packet);
    await assert.rejects(pending, /changed|export/);
    assert.equal(f.controls.previewData, null);
    assert.equal(f.calls.length, 0);
    assert.equal(f.controls.busy, false);
  }
});

test('successful own history publication retains its result readout during app control sync', async () => {
  const f = fixture();
  await f.controls.preview();
  f.context.commit = async (op, params, label, options) => {
    options.verifyPublication();
    f.doc.cursor = 1;
    f.controls.sync();
    return 'published';
  };
  assert.equal(await f.controls.adopt(), 'published');
  assert.match(f.nodes['fitting-result'].textContent, /tolerance met/);
  assert.doesNotMatch(f.nodes['fitting-result'].textContent, /Source or controls changed/);
});
