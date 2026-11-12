import test from 'node:test';
import assert from 'node:assert/strict';
import { NetEditor } from '../ui/net-editor.js';
import { CellNetEditor } from '../ui/cell-net-editor.js';
import { ExpressionEntry } from '../ui/expression-entry.mjs';
import { numericControlFixture, deferred } from './numeric-control-fixture.mjs';

function fixture(cell) {
  const f = numericControlFixture(Object.prototype, {}),
    s = f.state,
    m = s.model;
  m.fingerprint = 'generation-source';
  if (cell) {
    m.dimension = 4;
    m.embeddingDimension = 4;
    m.vertices = m.vertices.map((v) => [...v, 0]);
    m.cells = [[0, 1, 2, 3]];
  }
  const key = cell ? 'cellNetLayout' : 'netLayout',
    bank = cell ? 'cellNetHistory' : 'netHistory',
    edges = cell ? 'connections' : 'hinges';
  s.view[cell ? 'cellNet' : 'net'] = cell
    ? { root: 0, shrink: 1 }
    : { root: 0, length: 25, tabs: true, display: 'layout' };
  const params = cell
    ? { root: 0, connections: [2], placements: [{ root: 0, translation: [4, 5, 6] }] }
    : { root: 0, edge_length_mm: 25, tabs: true, hinges: [2], placements: [{ root: 0, translation: [4, 5] }] };
  s[bank] = { sourceId: m.id, sourceFingerprint: m.fingerprint, cursor: 0, states: [structuredClone(params)] };
  const context = { ...f.context, getModel: () => m, number: async (text) => Number(text) },
    nodes = new Map(),
    calls = [];
  const generate = (p) => ({
    sourceId: m.id,
    sourceFingerprint: m.fingerprint,
    root: p.root,
    ...(cell
      ? {}
      : {
          referenceEdgeLengthMm: p.edge_length_mm,
          tabs: p.tabs,
          printSource: { metadata: structuredClone(m.metadata) },
        }),
    [edges]: p[edges] ?? [0, 1, 2],
    placements: p.placements ?? [],
  });
  const editor = Object.assign(Object.create(cell ? CellNetEditor.prototype : NetEditor.prototype), {
    context,
    ...context,
    sequence: 0,
    $: (id) => {
      if (!nodes.has(id)) nodes.set(id, { value: id === 'net-length' ? '25' : '0', checked: true });
      return nodes.get(id);
    },
    run: async (op, p) => {
      calls.push(p);
      return generate(p);
    },
    markDirty() {},
    updateActions() {},
    activate() {},
  });
  editor.expressionEntry = new ExpressionEntry(context);
  editor.refresh = () => editor.evaluate(m, s);
  return { ...f, s, m, key, bank, edges, editor, calls, generate };
}

for (const cell of [false, true]) {
  const label = cell ? 'whole-cell' : 'face';
  test(label + ' derived cancellation passes its signal and refuses late layout/history writes', async () => {
    const f = fixture(cell),
      hold = deferred(),
      controller = new AbortController(),
      before = structuredClone(f.s);
    let passedSignal;
    f.editor.run = async (_op, _params, _model, _label, options) => {
      passedSignal = options.signal;
      return hold.promise;
    };
    const pending = f.editor.evaluate(f.m, f.s, { signal: controller.signal });
    assert.equal(passedSignal, controller.signal);
    controller.abort();
    hold.resolve(f.generate({ root: 0, edge_length_mm: 25, tabs: true }));
    assert.deepEqual(await pending, { stale: true });
    assert.deepEqual(f.s, before);
  });
  test(label + ' already canceled derived requests start no native work', async () => {
    const f = fixture(cell),
      controller = new AbortController();
    controller.abort();
    assert.deepEqual(await f.editor.evaluate(f.m, f.s, { signal: controller.signal }), { stale: true });
    assert.equal(f.calls.length, 0);
  });
  test(label + ' explicit separation/reset supersede saved edits and append reversible history', async () => {
    const f = fixture(cell),
      original = structuredClone(f.s[f.bank]);
    await f.editor.build(true);
    assert.deepEqual(f.calls[0][f.edges], []);
    assert.deepEqual(f.s[f.key][f.edges], []);
    assert.equal(f.s[f.bank].cursor, 1);
    assert.deepEqual(f.s[f.bank].states[0], original.states[0]);
    assert.equal(f.editor.buildRequest, null);
    await f.editor.restore(-1);
    assert.deepEqual(f.s[f.key].placements, original.states[0].placements);
    await f.editor.restore(1);
    assert.deepEqual(f.s[f.key][f.edges], []);
    await f.editor.build(false);
    assert.equal(f.edges in f.calls.at(-1), false);
    assert.deepEqual(f.s[f.key][f.edges], [0, 1, 2]);
    assert.equal(f.s[f.bank].cursor, 2);
    await f.editor.restore(-1);
    assert.deepEqual(f.s[f.key][f.edges], []);
    await f.editor.restore(1);
    assert.deepEqual(f.s[f.key][f.edges], [0, 1, 2]);
  });
  test(label + ' automatic reconstruction retains current saved placement and redo states', async () => {
    const f = fixture(cell);
    f.s[f.bank].states.push({ ...structuredClone(f.s[f.bank].states[0]), [f.edges]: [] });
    const bank = structuredClone(f.s[f.bank]);
    await f.editor.evaluate(f.m, f.s);
    assert.deepEqual(f.calls[0][f.edges], [2]);
    assert.deepEqual(f.s[f.key].placements, bank.states[0].placements);
    assert.deepEqual(f.s[f.bank], bank);
  });
  test(label + ' superseded generation cannot consume a newer request or append stale history', async () => {
    const f = fixture(cell),
      first = deferred(),
      second = deferred();
    let i = 0;
    f.editor.run = async (op, p) => {
      f.calls.push(p);
      await (i++ === 0 ? first.promise : second.promise);
      return f.generate(p);
    };
    // Allow the second explicit command while the first native generation is pending.
    const a = f.editor.build(true);
    await new Promise((resolve) => setImmediate(resolve));
    if (!cell) f.editor.expressionEntry = new ExpressionEntry(f.editor.context);
    const b = f.editor.build(false);
    await new Promise((resolve) => setImmediate(resolve));
    const latest = f.editor.buildRequest;
    first.resolve();
    assert.deepEqual(await a, { stale: true });
    assert.equal(f.editor.buildRequest, latest);
    assert.equal(f.s[f.bank].cursor, 0);
    assert.equal(f.s[f.key], null);
    second.resolve();
    await b;
    assert.equal(f.editor.buildRequest, null);
    assert.equal(f.s[f.bank].cursor, 1);
    assert.deepEqual(f.s[f.key][f.edges], [0, 1, 2]);
  });
  test(label + ' failed explicit generation keeps history and permits a fresh reset attempt', async () => {
    const f = fixture(cell),
      before = structuredClone(f.s[f.bank]);
    f.editor.run = async () => {
      throw Error('Native refusal');
    };
    await assert.rejects(
      Promise.resolve().then(() => f.editor.build(true)),
      /Native refusal/
    );
    assert.deepEqual(f.s[f.bank], before);
    f.editor.run = async (op, p) => f.generate(p);
    await f.editor.build(false);
    assert.deepEqual(f.s[f.key][f.edges], [0, 1, 2]);
    assert.equal(f.s[f.bank].cursor, 1);
  });
}
