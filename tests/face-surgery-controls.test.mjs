import test from 'node:test';
import assert from 'node:assert/strict';
import { FaceSurgeryControls } from '../ui/face-surgery-controls.mjs';

const cube = () => ({
  id: 'cube',
  name: 'Cube',
  dimension: 3,
  embeddingDimension: 3,
  interpretation: 'generalized-complex',
  vertices: [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ],
  edges: [
    [0, 1],
    [1, 2],
    [2, 3],
    [0, 3],
    [4, 5],
    [5, 6],
    [6, 7],
    [4, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ],
  faces: [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ],
  cells: [],
  numeric: { certified: false },
  metadata: { coordinateUnits: 'mm' },
});
function fixture() {
  const values = {
    'surgery-piece': 'pyramid',
    'surgery-height': '1/4',
    'surgery-scale': '1',
    'surgery-twist': '0',
    'surgery-library-key': 'cube',
    'surgery-addition-face': '0',
    'surgery-inset': '1/2',
    'surgery-excavate': '',
    'surgery-blend': '',
    'surgery-all': '',
    'apply-face-surgery': '',
    'drill-face-surgery': '',
    'cancel-face-surgery': '',
    'surgery-selection': '',
    'surgery-target-filter': 'congruent',
    'surgery-side-colors': 'piece',
    'preview-face-surgery': '',
    'adopt-face-surgery': '',
    'surgery-preview-result': '',
    'surgery-preview-owners': '',
  };
  const nodes = Object.fromEntries(
    Object.entries(values).map(([id, value]) => [id, { value, disabled: false, checked: id === 'surgery-blend' }])
  );
  const state = { model: cube(), view: { coordinateUnit: 'mm' }, notes: 'Source notes' },
    doc = { id: 'doc', states: [state], cursor: 0 };
  const memory = {
    state: { model: { ...cube(), id: 'addition' }, view: { coordinateUnit: 'mm' }, notes: 'Memory' },
    source: { documentId: 'stored', modelId: 'addition' },
  };
  let project = { documents: [doc], active: 0, memories: { version: 1, slots: [memory, ...Array(8).fill(null)] } },
    exporting = false;
  let selection = { kind: 'face', index: 1 };
  const calls = [];
  const context = {
    getProject: () => project,
    getDocument: () => project.documents[project.active],
    getState: () => context.getDocument().states[context.getDocument().cursor],
    selection: () => ({ ...selection }),
    isExporting: () => exporting,
    guard: (fn) => fn,
    evaluateMany: async (expressions) => {
      calls.push(['expressions', ...expressions]);
      return expressions.map((t) => ({ '1/4': 0.25, '1/2': 0.5, 'sqrt(4)': 2 })[t] ?? Number(t));
    },
    commit: async (...args) => {
      args[3].verifyPublication();
      calls.push(['commit', ...args]);
      return { committed: true };
    },
  };
  const panel = { querySelector: (s) => nodes[s.slice(1)], querySelectorAll: () => Object.values(nodes) };
  const controls = Object.assign(Object.create(FaceSurgeryControls.prototype), { context, panel, busy: false });
  controls.sync();
  return {
    controls,
    context,
    nodes,
    calls,
    state,
    doc,
    memory,
    get project() {
      return project;
    },
    setSelection: (s) => (selection = s),
    setProject: (p) => (project = p),
    setExport: (v) => (exporting = v),
  };
}
const commit = (f) => f.calls.find((c) => c[0] === 'commit');
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { resolve, promise };
};
const flush = () => new Promise((r) => setImmediate(r));

test('selected face, inward toggle, all-of-type and native expressions enter one history operation', async () => {
  const f = fixture();
  f.nodes['surgery-excavate'].checked = true;
  f.nodes['surgery-all'].checked = true;
  f.nodes['surgery-twist'].value = 'sqrt(4)';
  assert.deepEqual(await f.controls.construct(), { committed: true });
  assert.deepEqual(commit(f).slice(0, 4), [
    'commit',
    'face-surgery',
    {
      mode: 'excavate',
      all_of_type: true,
      face_id: 1,
      piece: 'pyramid',
      blend: true,
      height: 0.25,
      scale: 1,
      cycle_offset: 2,
    },
    'Excavate faces',
  ]);
  assert.ok(commit(f)[4].signal instanceof AbortSignal);
  assert.equal(f.controls.busy, false);
});

test('drill uses selected face and inset only, with explicit prism and single-pair domain', async () => {
  const f = fixture();
  f.nodes['surgery-piece'].value = 'prism';
  await f.controls.construct('drill');
  assert.deepEqual(commit(f)[2], { mode: 'drill', all_of_type: false, face_id: 1, piece: 'prism', inset: 0.5 });
  assert.deepEqual(f.calls[0], ['expressions', '1/2']);
  for (const change of [
    (f) => (f.nodes['surgery-all'].checked = true),
    (f) => (f.nodes['surgery-piece'].value = 'antiprism'),
    (f) => f.setSelection({ kind: 'vertex', index: 0 }),
  ]) {
    const f = fixture();
    f.nodes['surgery-piece'].value = 'prism';
    change(f);
    await assert.rejects(() => f.controls.construct('drill'), /For Drill/);
    assert.equal(commit(f), undefined);
  }
});

test('model memory on all vertices passes a detached source through history', async () => {
  const f = fixture();
  f.nodes['surgery-piece'].value = 'memory:1';
  f.nodes['surgery-all'].checked = true;
  f.setSelection({ kind: 'vertex', index: 2 });
  await f.controls.construct();
  const p = commit(f)[2];
  assert.equal(p.mode, 'vertices');
  assert.equal(p.vertex_id, 2);
  assert.equal(p.all_of_type, true);
  assert.equal(p.piece, 'model');
  assert.deepEqual(p.addition, f.memory.state.model);
  assert.notEqual(p.addition, f.memory.state.model);
  assert.equal(p.cycle_offset, undefined);
  assert.equal(p.addition_face_id, 0);
});

test('library key and explicit source face support model placement', async () => {
  const f = fixture();
  f.nodes['surgery-piece'].value = 'library';
  f.nodes['surgery-library-key'].value = 'tetrahedron';
  f.nodes['surgery-addition-face'].value = '2';
  await f.controls.construct();
  assert.equal(commit(f)[2].library_key, 'tetrahedron');
  assert.equal(commit(f)[2].addition_face_id, 2);
});

test('empty memories and mismatched memory display units refuse before native publication', async () => {
  for (const kind of ['empty', 'units']) {
    const f = fixture();
    f.nodes['surgery-piece'].value = 'memory:1';
    if (kind === 'empty') f.project.memories.slots[0] = null;
    else f.memory.state.view.coordinateUnit = 'cm';
    await assert.rejects(() => f.controls.construct());
    assert.equal(commit(f), undefined);
    assert.equal(f.controls.busy, false);
  }
});

test('vertex selection requires a model source and cannot excavate', async () => {
  const f = fixture();
  f.setSelection({ kind: 'vertex', index: 0 });
  await assert.rejects(() => f.controls.construct(), /requires.*model/);
  f.nodes['surgery-piece'].value = 'library';
  f.nodes['surgery-excavate'].checked = true;
  await assert.rejects(() => f.controls.construct(), /Clear Excavate/);
  assert.equal(commit(f), undefined);
});

test('numeric domains and literal addition face IDs reject invalid entries', async () => {
  for (const [field, value] of [
    ['surgery-height', '0'],
    ['surgery-scale', '-1'],
    ['surgery-twist', '4'],
    ['surgery-twist', '1/2'],
    ['surgery-height', 'NaN'],
  ]) {
    const f = fixture();
    f.nodes[field].value = value;
    await assert.rejects(() => f.controls.construct());
    assert.equal(commit(f), undefined);
  }
  const f = fixture();
  f.nodes['surgery-piece'].value = 'library';
  f.nodes['surgery-addition-face'].value = '1/2';
  await assert.rejects(() => f.controls.construct(), /literal/);
  assert.equal(f.calls.length, 0);
});

test('source geometry, attributes, units, notes and project ownership fenced after numeric await', async () => {
  for (const change of [
    (f) => (f.state.model.vertices[0][0] = 2),
    (f) => (f.state.model.metadata.test = 'changed'),
    (f) => (f.state.notes = 'changed'),
    (f) => (f.state.view.coordinateUnit = 'cm'),
    (f) => (f.doc.states = [...f.doc.states]),
    (f) => f.setProject({ ...f.project }),
  ]) {
    const f = fixture(),
      pending = deferred();
    f.context.evaluateMany = () => pending.promise;
    const running = f.controls.construct();
    change(f);
    pending.resolve([0.25, 1, 0]);
    await assert.rejects(running, /changed/);
    assert.equal(commit(f), undefined);
    assert.equal(f.controls.busy, false);
  }
});

test('selection and input changes fenced through numeric and native awaits', async () => {
  for (const stage of ['expression', 'native'])
    for (const change of [
      (f) => f.setSelection({ kind: 'face', index: 2 }),
      (f) => (f.nodes['surgery-all'].checked = true),
      (f) => (f.nodes['surgery-height'].value = '99'),
    ]) {
      const f = fixture(),
        pending = deferred();
      let published = false;
      if (stage === 'expression') f.context.evaluateMany = () => pending.promise;
      else
        f.context.commit = async (op, p, label, options) => {
          await pending.promise;
          options.verifyPublication();
          published = true;
        };
      const running = f.controls.construct();
      await flush();
      change(f);
      pending.resolve(stage === 'expression' ? [0.25, 1, 0] : null);
      await assert.rejects(running, /changed/);
      assert.equal(published, false);
      assert.equal(f.controls.busy, false);
    }
});

test('chosen memory mutation fenced after native await', async () => {
  const f = fixture(),
    pending = deferred();
  f.nodes['surgery-piece'].value = 'memory:1';
  let published = false;
  f.context.commit = async (op, p, label, options) => {
    await pending.promise;
    options.verifyPublication();
    published = true;
  };
  const running = f.controls.construct();
  await flush();
  f.memory.state.model.vertices[0][0] = 0.1;
  pending.resolve();
  await assert.rejects(running, /memory changed/);
  assert.equal(published, false);
});

test('cancellation aborts expressions and restores controls', async () => {
  const f = fixture();
  f.context.evaluateMany = () => new Promise(() => {});
  const running = f.controls.construct();
  f.controls.entry.cancel();
  await assert.rejects(running, { name: 'AbortError' });
  assert.equal(commit(f), undefined);
  assert.equal(f.controls.busy, false);
  assert.equal(f.nodes['cancel-face-surgery'].hidden, true);
});

test('export prevents native calls', async () => {
  const f = fixture();
  f.setExport(true);
  await assert.rejects(() => f.controls.construct(), /export/);
  assert.equal(f.calls.length, 0);
});

test('constructor mounts the compact disclosure and binds guarded construction and cancellation', () => {
  const f = fixture();
  let mounted = null;
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => f.controls.panel,
    getElementById: (id) => {
      assert.equal(id, 'augmentation-settings');
      return { after: (panel) => (mounted = panel) };
    },
  };
  try {
    const controls = new FaceSurgeryControls(f.context);
    assert.equal(mounted, controls.panel);
    assert.match(controls.panel.innerHTML, /Augment \/ excavate/);
    assert.match(controls.panel.innerHTML, /surgery-excavate/);
    assert.match(controls.panel.innerHTML, /drill-face-surgery/);
    assert.equal(typeof f.nodes['apply-face-surgery'].onclick, 'function');
    assert.equal(typeof f.nodes['cancel-face-surgery'].onclick, 'function');
    assert.equal(typeof f.nodes['preview-face-surgery'].onclick, 'function');
    assert.equal(typeof f.nodes['adopt-face-surgery'].onclick, 'function');
  } finally {
    globalThis.document = previous;
  }
});

function previewFixture() {
  const f = fixture();
  let packet;
  f.context.preview = async (op, params, options) => {
    options.verifyPublication();
    assert.equal(op, 'face-surgery-preview');
    const m = structuredClone(f.state.model),
      info = {
        mode: params.mode,
        maximumMatchResidual: 0,
        matchTolerance: 1e-8,
        faceOrigins: m.faces.map((_, i) => [{ source: 'base', faceId: i, colorSource: { source: 'base', faceId: i } }]),
      };
    m.metadata.faceSurgery = info;
    m.validation = { passed: true };
    m.provenance = { operation: 'face-surgery', parameters: structuredClone(params) };
    return (packet = { model: m, construction: structuredClone(info) });
  };
  f.context.commit = async (op, params, label, options) => {
    options.verifyPublication();
    const result = { states: [{ model: structuredClone(packet.model) }], cursor: 0 };
    options.verifyResult?.(result);
    f.calls.push(['commit', op, params, label, options]);
    return result;
  };
  return f;
}

test('same-color congruent targets and base/cleared side colors enter the existing history operation', async () => {
  for (const policy of ['base', 'none']) {
    const f = fixture();
    f.nodes['surgery-all'].checked = true;
    f.nodes['surgery-target-filter'].value = 'same-color';
    f.nodes['surgery-side-colors'].value = policy;
    await f.controls.construct();
    assert.equal(commit(f)[2].target_filter, 'same-color');
    assert.equal(commit(f)[2].side_colors, policy);
  }
  const f = fixture();
  f.nodes['surgery-target-filter'].value = 'same-color';
  await f.controls.construct();
  assert.equal(commit(f)[2].target_filter, undefined);
});

test('preview is read-only, displays owners and residuals, and adoption checks the prepared result', async () => {
  const f = previewFixture(),
    before = structuredClone(f.state);
  await f.controls.construct(undefined, { preview: true });
  assert.equal(commit(f), undefined);
  assert.deepEqual(f.state, before);
  assert.equal(f.nodes['adopt-face-surgery'].disabled, false);
  assert.match(f.nodes['surgery-preview-result'].textContent, /residual.*Float64 approximate/);
  assert.match(f.nodes['surgery-preview-owners'].textContent, /Face 0: base face 0; color base face 0/);
  await f.controls.construct(undefined, { adopting: true });
  assert.equal(typeof commit(f)[4].verifyResult, 'function');
});

test('stale previews refuse changes to source attributes, history, settings, selection, notes, units or chosen memory', async () => {
  for (const change of [
    (f) => (f.state.model.metadata.changed = true),
    (f) => (f.doc.operationHistory = { changed: true }),
    (f) => (f.nodes['surgery-side-colors'].value = 'base'),
    (f) => (f.nodes['surgery-height'].value = '.5'),
    (f) => f.setSelection({ kind: 'face', index: 2 }),
    (f) => (f.state.notes = 'Changed'),
    (f) => (f.state.view.coordinateUnit = 'cm'),
    (f) => (f.memory.state.model.metadata.changed = true),
  ]) {
    const f = previewFixture();
    f.nodes['surgery-piece'].value = 'memory:1';
    await f.controls.construct(undefined, { preview: true });
    change(f);
    await assert.rejects(() => f.controls.construct(undefined, { adopting: true }), /changed/);
    assert.equal(commit(f), undefined);
    f.controls.sync();
    assert.equal(f.nodes['adopt-face-surgery'].disabled, true);
    assert.equal(f.nodes['surgery-preview-owners'].textContent, '');
  }
});

test('late preview publication refuses selection and history changes and cancellation', async () => {
  for (const change of [
    (f) => f.setSelection({ kind: 'face', index: 2 }),
    (f) => (f.doc.operationHistory = { changed: true }),
    (f) => f.controls.entry.cancel(),
  ]) {
    const f = previewFixture(),
      pending = deferred(),
      compute = f.context.preview;
    f.context.preview = async (...args) => {
      const result = await compute(...args);
      await pending.promise;
      return result;
    };
    const work = f.controls.construct(undefined, { preview: true });
    await flush();
    change(f);
    pending.resolve();
    await assert.rejects(work);
    assert.equal(f.controls.previewData, null);
    assert.equal(f.nodes['adopt-face-surgery'].disabled, true);
  }
});

test('adoption refuses native geometry, color or receipt disagreement before publication', async () => {
  for (const change of [
    (m) => (m.vertices[0][0] = 99),
    (m) => (m.metadata.offColors = { faces: [] }),
    (m) => (m.metadata.faceSurgery.maximumMatchResidual = 1),
    (m) => (m.numeric.certified = true),
  ]) {
    const f = previewFixture();
    const packet = await f.controls.construct(undefined, { preview: true });
    let published = false;
    f.context.commit = async (op, params, label, options) => {
      const m = structuredClone(packet.model);
      change(m);
      options.verifyPublication();
      options.verifyResult({ states: [{ model: m }], cursor: 0 });
      published = true;
    };
    await assert.rejects(() => f.controls.construct(undefined, { adopting: true }), /differs from the preview/);
    assert.equal(published, false);
    assert.equal(f.nodes['adopt-face-surgery'].disabled, true);
    assert.equal(f.nodes['surgery-preview-owners'].textContent, '');
  }
});

test('malformed native preview and changed numeric re-evaluation cannot be adopted', async () => {
  const f = previewFixture(),
    compute = f.context.preview;
  f.context.preview = async (...args) => {
    const p = await compute(...args);
    p.construction.maximumMatchResidual = 5;
    return p;
  };
  await assert.rejects(() => f.controls.construct(undefined, { preview: true }), /malformed/);
  assert.equal(f.controls.previewData, null);
  f.context.preview = compute;
  await f.controls.construct(undefined, { preview: true });
  f.context.evaluateMany = async () => [0.5, 1, 0];
  await assert.rejects(
    () => f.controls.construct(undefined, { adopting: true }),
    /Evaluated surgery parameters changed/
  );
  assert.equal(commit(f), undefined);
});
