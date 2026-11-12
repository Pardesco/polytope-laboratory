import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { AddDualControls } from '../ui/add-dual-controls.mjs';
import { catalogMatches } from '../ui/catalog-query.mjs';
import { prepareHistoryCommit, verifyHistoryPublication } from '../ui/history-workflow.mjs';

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
function fixture() {
  const state = {
      model: {
        id: 'cube',
        name: 'Cube',
        dimension: 3,
        embeddingDimension: 3,
        vertices: [
          [-1, -1, -1],
          [1, -1, -1],
          [1, 1, -1],
          [-1, 1, -1],
          [-1, -1, 1],
          [1, -1, 1],
          [1, 1, 1],
          [-1, 1, 1],
        ],
        edges: [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 0],
          [4, 5],
          [5, 6],
          [6, 7],
          [7, 4],
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
        metadata: {},
      },
      view: {},
      notes: 'Keep',
    },
    doc = { id: 'test', cursor: 0, states: [state] },
    project = { active: 0, documents: [doc] },
    calls = [];
  let exporting = false;
  const context = {
    getState: () => doc.states[doc.cursor],
    getDocument: () => doc,
    getProject: () => project,
    isExporting: () => exporting,
    guard: (fn) => fn,
    evaluate: async (parts) => parts.map(Number),
    evaluateBatch: (parts) => context.evaluate(parts),
    commit: async (op, params, label, options = {}) => {
      options.verifyPublication?.();
      calls.push({ op, params, label, options });
      return 'committed';
    },
  };
  const controls = new AddDualControls(context, { mount: false }),
    fields = { sizing: 'contact', center: '', radius: '1' };
  controls.fields = () => ({ ...fields });
  return { state, doc, project, calls, context, controls, fields, setExport: (value) => (exporting = value) };
}

test('common Add Dual action uses the native recipe/history commit', async () => {
  const f = fixture();
  assert.equal(await f.controls.apply(), 'committed');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].op, 'add-dual');
  assert.deepEqual(f.calls[0].params, { sizing: 'contact' });
  assert.equal(f.controls.busy, false);
});

test('explicit sizing parses the existing center/radius expressions atomically', async () => {
  const f = fixture(),
    evaluated = [];
  Object.assign(f.fields, { sizing: 'reciprocal', center: '0; 0; 0', radius: 'sqrt(2)' });
  f.context.evaluate = async (parts) => {
    evaluated.push(...parts);
    return parts.map((t) => (t === 'sqrt(2)' ? Math.sqrt(2) : Number(t)));
  };
  await f.controls.apply();
  assert.deepEqual(evaluated, ['sqrt(2)', '0', '0', '0']);
  assert.deepEqual(f.calls[0].params, { sizing: 'reciprocal', center: [0, 0, 0], radius: Math.sqrt(2) });
  assert.ok(f.calls[0].options.signal instanceof AbortSignal);
});

test('4D explicit center accepts four coordinates and blank uses the engine default', async () => {
  const f = fixture();
  f.state.model.dimension = f.state.model.embeddingDimension = 4;
  f.state.model.vertices = f.state.model.vertices.map((p) => [...p, 0]);
  Object.assign(f.fields, { sizing: 'reciprocal', center: '1,2,3,4' });
  await f.controls.apply();
  assert.deepEqual(f.calls[0].params.center, [1, 2, 3, 4]);
  f.fields.center = '';
  await f.controls.apply();
  assert.equal(f.calls[1].params.center, null);
});

test('export and unsupported source dimensions refuse before committing', async () => {
  const f = fixture();
  f.setExport(true);
  await assert.rejects(f.controls.apply(), /export/);
  f.setExport(false);
  f.state.model.dimension = 2;
  await assert.rejects(f.controls.apply(), /3D or 4D/);
  assert.equal(f.calls.length, 0);
});

test('edited fields, source mutation and cancellation invalidate pending numeric work', async () => {
  for (const change of [
    (f) => (f.fields.radius = '3'),
    (f) => (f.state.model.metadata.changed = true),
    (f) => f.controls.cancel(),
  ]) {
    const f = fixture(),
      pending = deferred();
    f.fields.sizing = 'reciprocal';
    f.context.evaluate = () => pending.promise;
    const work = f.controls.apply();
    change(f);
    pending.resolve([1]);
    await assert.rejects(work, /changed|cancel/i);
    assert.equal(f.calls.length, 0);
    assert.equal(f.controls.busy, false);
  }
});

test('mount exposes a common action and collapsed advanced sizing', () => {
  const previous = globalThis.document,
    button = {},
    sizing = {},
    inserted = [];
  globalThis.document = {
    createElement: () => ({
      querySelector: (id) => (id === '#add-dual' ? button : sizing),
      querySelectorAll: () => [button, sizing],
    }),
    getElementById: (id) =>
      id === 'make-dual'
        ? { after: (node) => inserted.push(node) }
        : { value: id === 'add-dual-sizing' ? 'contact' : '1' },
  };
  try {
    const f = fixture(),
      controls = new AddDualControls(f.context);
    assert.equal(inserted[0].id, 'add-dual-controls');
    assert.match(inserted[0].innerHTML, /<details id="add-dual-options">/);
    assert.doesNotMatch(inserted[0].innerHTML, /<details[^>]* open/);
    assert.equal(typeof button.onclick, 'function');
    controls.sync();
    assert.equal(button.disabled, false);
    f.setExport(true);
    controls.sync();
    assert.equal(button.disabled, true);
  } finally {
    globalThis.document = previous;
  }
});

const records = JSON.parse(
  execFileSync(
    'python',
    [
      '-B',
      '-c',
      'import json; from engine.compound_catalog import compound_catalog; print(json.dumps(compound_catalog()))',
    ],
    { encoding: 'utf8', windowsHide: true }
  )
);
test('library family searches find UC numbers, names and component counts', () => {
  assert.equal(records.length, 36);
  for (const r of records) assert.equal(r.family, r.dimension === 4 ? '4D compounds' : 'Compounds');
  assert.deepEqual(
    records.filter((r) => catalogMatches(r, 'UC5')).map((r) => r.ucNumber),
    [5, 5]
  );
  assert.ok(records.filter((r) => r.ucNumber === 5).every((r) => catalogMatches(r, '"UC 5"')));
  assert.ok(records.some((r) => catalogMatches(r, 'stella octangula')));
  assert.ok(records.some((r) => catalogMatches(r, 'five tetrahedra components=5')));
  assert.ok(records.some((r) => catalogMatches(r, 'UC62')));
});

test('history publication fences reject Add Dual results when the source cursor moves', async () => {
  const f = fixture(),
    pending = deferred();
  f.context.run = (op, args) => {
    assert.equal(op, 'recipe-run');
    assert.equal(args.operation, 'add-dual');
    return pending.promise;
  };
  const work = prepareHistoryCommit(f.context, 'add-dual', { sizing: 'contact' }, 'Add Dual');
  f.doc.states.push(structuredClone(f.state));
  f.doc.cursor = 1;
  pending.resolve({ cursor: 0, states: [] });
  await assert.rejects(work, /Source history changed/);
  f.doc.cursor = 0;
  f.context.run = async () => ({ states: [], cursor: 0 });
  const prepared = await prepareHistoryCommit(f.context, 'add-dual', {}, 'Add Dual');
  f.setExport(true);
  assert.throws(() => verifyHistoryPublication(f.context, prepared), /export/);
});
