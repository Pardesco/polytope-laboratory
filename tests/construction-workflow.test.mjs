import test from 'node:test';
import assert from 'node:assert/strict';
import { generateConstruction, certifyCurrent } from '../ui/construction-workflow.mjs';

function fixture() {
  let project = { documents: [] },
    exporting = false,
    resolve,
    reject;
  const calls = [],
    result = { id: 'new-model' };
  const context = {
    getProject: () => project,
    isExporting: () => exporting,
    run: (...args) => {
      calls.push(args);
      return new Promise((a, b) => {
        resolve = a;
        reject = b;
      });
    },
    addDocument: (...args) => calls.push(['add', ...args]),
  };
  return {
    context,
    calls,
    result,
    replace: () => (project = { documents: [] }),
    export: () => (exporting = true),
    finish: () => resolve(result),
    fail: () => reject(Error('native refusal')),
  };
}

test('successful native construction publishes once with its requested kind and evaluated parameters', async () => {
  const f = fixture(),
    pending = generateConstruction(
      f.context,
      'polygon-product',
      { kind: 'wrong', left: { symbol: '5/2', radius: 1 } },
      'Product'
    );
  assert.deepEqual(f.calls, [
    ['generate', { kind: 'polygon-product', left: { symbol: '5/2', radius: 1 } }, null, 'Product'],
  ]);
  f.finish();
  assert.equal(await pending, f.result);
  assert.deepEqual(f.calls[1], ['add', f.result, 'Product']);
});
test('replacing the workspace while native generation runs discards the completed result', async () => {
  const f = fixture(),
    pending = generateConstruction(f.context, 'cupola', { n: 5 }, 'Cupola');
  f.replace();
  f.finish();
  await assert.rejects(pending, /Workspace changed/);
  assert.equal(f.calls.length, 1);
});
test('export beginning during native construction prevents publication into its locked source', async () => {
  const f = fixture(),
    pending = generateConstruction(f.context, 'regular-star-polygon', { symbol: '6/2' }, 'Polygon');
  f.export();
  f.finish();
  await assert.rejects(pending, /export began/);
  assert.equal(f.calls.length, 1);
});
test('an already active export prevents native work and a native refusal adds no document', async () => {
  const busy = fixture();
  busy.export();
  await assert.rejects(generateConstruction(busy.context, 'cupola', {}, 'Cupola'), /Finish animation export/);
  assert.deepEqual(busy.calls, []);
  const f = fixture(),
    pending = generateConstruction(f.context, 'polygon-product', {}, 'Product');
  f.fail();
  await assert.rejects(pending, /native refusal/);
  assert.equal(f.calls.length, 1);
});
test('source/target publication guard covers both native request and completed document', async () => {
  const f = fixture();
  let current = true,
    checks = 0;
  const verifyPublication = () => {
    checks++;
    if (!current) throw Error('Source attributes changed');
  };
  const pending = generateConstruction(f.context, 'cupola', { n: 5 }, 'Cupola', { verifyPublication });
  assert.equal(checks, 1);
  current = false;
  f.finish();
  await assert.rejects(pending, /Source attributes changed/);
  assert.equal(checks, 2);
  assert.equal(f.calls.length, 1);
});
test('cancel signal reaches native work and prevents an ignored cancellation from publishing', async () => {
  const f = fixture(),
    controller = new AbortController();
  const pending = generateConstruction(f.context, 'cupola', { n: 5 }, 'Cupola', { signal: controller.signal });
  assert.equal(f.calls[0][4].signal, controller.signal);
  controller.abort();
  f.finish();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(f.calls.length, 1);
  const already = fixture();
  await assert.rejects(generateConstruction(already.context, 'cupola', {}, 'Cupola', { signal: controller.signal }), {
    name: 'AbortError',
  });
  assert.equal(already.calls.length, 0);
});

function certification() {
  const model = {
    id: 'cube',
    name: 'Cube',
    dimension: 3,
    embeddingDimension: 3,
    interpretation: 'convex-polytope',
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
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
    metadata: {},
  };
  let state = { model, notes: 'original', view: { coordinateUnit: 'mm', camera: { distance: 2 } } },
    document = { id: 'source', cursor: 0, states: [state] },
    project = { documents: [document] },
    exporting = false,
    resolve;
  const calls = [],
    context = {
      getProject: () => project,
      getState: () => state,
      getDocument: () => document,
      isExporting: () => exporting,
      run: (...args) => {
        calls.push(args);
        return new Promise((r) => (resolve = r));
      },
      addDocument: (...args) => calls.push(['add', ...args]),
    };
  return {
    context,
    calls,
    state,
    project,
    finish: () => resolve({ exact: true }),
    replace: () => (project = { documents: [] }),
    switch: () => {
      state = { ...state };
      document = { id: 'other', cursor: 0, states: [state] };
      project.documents.push(document);
    },
    export: () => (exporting = true),
  };
}
test('exact certification sends the captured decimal coordinates and permits observer motion', async () => {
  const f = certification(),
    pending = certifyCurrent(f.context);
  f.state.view.camera.distance = 10;
  f.finish();
  assert.deepEqual(await pending, { exact: true });
  assert.deepEqual(f.calls[0], [
    'rational-hull',
    {
      points: [
        ['0', '0', '0'],
        ['1', '0', '0'],
        ['0', '1', '0'],
        ['0', '0', '1'],
      ],
      name: 'Rational input hull of Cube',
    },
    null,
    'Certify supplied decimal hull',
  ]);
  assert.deepEqual(f.calls[1], ['add', { exact: true }, 'Certify decimal input']);
});
test('certification refuses changed project, selection, source, notes, units or export ownership', async () => {
  for (const change of [
    (f) => f.replace(),
    (f) => f.switch(),
    (f) => (f.state.model.vertices[0][0] = 2),
    (f) => (f.state.notes = 'changed'),
    (f) => (f.state.view.coordinateUnit = 'cm'),
    (f) => f.export(),
  ]) {
    const f = certification(),
      pending = certifyCurrent(f.context);
    change(f);
    f.finish();
    await assert.rejects(pending);
    assert.equal(f.calls.length, 1);
  }
});
test('certification checks the document cap before native work and again before publication', async () => {
  const f = certification();
  f.project.documents.length = 100;
  await assert.rejects(certifyCurrent(f.context), /Close a document/);
  assert.equal(f.calls.length, 0);
  const later = certification(),
    pending = certifyCurrent(later.context);
  later.project.documents.length = 100;
  later.finish();
  await assert.rejects(pending, /Close a document/);
  assert.equal(later.calls.length, 1);
});
