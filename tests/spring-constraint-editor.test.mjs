import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NumericEntry } from '../ui/numeric-entry.mjs';
import { SpringConstraintEditor, springConstraintArrays, springPinIds } from '../ui/spring-constraint-editor.mjs';

const cases = JSON.parse(readFileSync(new URL('./fixtures/r8_spring_constraints.json', import.meta.url), 'utf8'));
function fixture() {
  const state = { model: structuredClone(cases.tetra), view: {}, notes: 'Source' },
    doc = { id: 'doc', states: [state], cursor: 0 },
    project = { documents: [doc], active: 0 };
  const defaults = {
    'spring-pair-a': '2',
    'spring-pair-b': '3',
    'spring-pair-length': '5/3',
    'spring-pair-weight': '3',
    'spring-pin-ids': '0, 2',
    'spring-constraints': '{}',
    'spring-constraint-list': '',
  };
  const nodes = Object.fromEntries(
    Object.entries(defaults).map(([id, value]) => [id, { value, disabled: false, textContent: '' }])
  );
  nodes['preview-spring'] = { disabled: false };
  let exporting = false;
  const context = {
    getState: () => state,
    getDocument: () => doc,
    getProject: () => project,
    isExporting: () => exporting,
    evaluateMany: async (expressions) => expressions.map((s) => (s === '5/3' ? 5 / 3 : Number(s))),
  };
  const host = {
    context,
    busy: false,
    destroyed: false,
    node: (id) => nodes[id],
    fields: () => [['spring-constraints', nodes['spring-constraints'].value]],
    history: () => JSON.stringify(doc.operationHistory ?? null),
    sync() {
      this.syncs = (this.syncs ?? 0) + 1;
    },
  };
  const editor = Object.assign(Object.create(SpringConstraintEditor.prototype), {
    host,
    busy: false,
    root: { querySelector: (s) => nodes[s.slice(1)], querySelectorAll: () => [] },
  });
  editor.numeric = new NumericEntry({
    ...context,
    isBusy: () => host.busy,
    getTarget: () => [host.fields(), Object.entries(nodes).map(([id, n]) => [id, n.value ?? ''])],
  });
  return { editor, nodes, context, host, state, doc, project, setExport: (value) => (exporting = value) };
}

test('pin ID and JSON adapters refuse unsupported grammar without interpretation', () => {
  assert.deepEqual(springPinIds('0, 2,3', 4), [0, 2, 3]);
  for (const ids of ['0,0', '4', '-1', '1/2', '1+1', '1 2', '', '0,'.repeat(1025)])
    assert.throws(() => springPinIds(ids, 4));
  for (const value of [
    'null',
    '[]',
    '{"pins":1}',
    '{"grammar":"stella"}',
    '{"edge_lengths":[1e400]}',
    '{bad}',
    'x'.repeat(1024 * 1024 + 1),
  ])
    assert.throws(() => springConstraintArrays(value));
  assert.deepEqual(springConstraintArrays('{"pins":[],"edge_lengths":[1,2]}'), { pins: [], edge_lengths: [1, 2] });
});
test('NumericEntry adds expression distances in order, keeps conflicting pairs and preserves manual arrays', async () => {
  const f = fixture();
  f.nodes['spring-constraints'].value = '{"edge_weights":[1,2,3,4,5,6],"face_steps":[1,1,1,1]}';
  await f.editor.addPair();
  await f.editor.addPair();
  const arrays = JSON.parse(f.nodes['spring-constraints'].value);
  assert.deepEqual(arrays.extra_springs, Array(2).fill({ vertices: [2, 3], length: 5 / 3, weight: 3 }));
  assert.deepEqual(arrays.edge_weights, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(arrays.face_steps, [1, 1, 1, 1]);
  assert.equal(f.doc.cursor, 0);
  assert.equal(f.doc.states.length, 1);
  assert.equal(f.host.syncs, 6);
});
test('pin editor copies source positions and units exactly, refuses duplicate pins and keeps other arrays on removal', () => {
  const f = fixture(),
    before = structuredClone(f.project);
  f.editor.pin();
  const arrays = JSON.parse(f.nodes['spring-constraints'].value);
  assert.deepEqual(arrays.pins, [
    { vertex: 0, position: [1, 1, 1] },
    { vertex: 2, position: [-1, 1, -1] },
  ]);
  assert.throws(() => f.editor.pin(), /already pinned/);
  assert.deepEqual(f.project, before);
  f.editor.edit((a) => {
    a.extra_springs = [{ vertices: [0, 1], length: 1, weight: 2 }];
    delete a.pins;
  });
  assert.deepEqual(JSON.parse(f.nodes['spring-constraints'].value), {
    extra_springs: [{ vertices: [0, 1], length: 1, weight: 2 }],
  });
});
test('invalid self pairs, fractional IDs, weights and lengths cannot alter arrays', async () => {
  for (const [id, value] of [
    ['spring-pair-a', '1.5'],
    ['spring-pair-a', '4'],
    ['spring-pair-a', '3'],
    ['spring-pair-length', '0'],
    ['spring-pair-weight', '0'],
  ]) {
    const f = fixture();
    f.nodes[id].value = value;
    await assert.rejects(() => f.editor.addPair());
    assert.equal(f.nodes['spring-constraints'].value, '{}');
    assert.equal(f.editor.busy, false);
  }
});
test('in-flight numeric edits fence source, history, export, existing arrays and draft fields', async () => {
  for (const change of [
    (f) => (f.state.model.metadata.coordinateUnits = 'cm'),
    (f) => (f.doc.operationHistory = { changed: true }),
    (f) => f.setExport(true),
    (f) => (f.nodes['spring-constraints'].value = '{"pins":[]}'),
    (f) => (f.nodes['spring-pair-weight'].value = '4'),
  ]) {
    const f = fixture();
    let resolve;
    f.context.evaluateMany = () => new Promise((r) => (resolve = r));
    f.editor.numeric.context.evaluateMany = f.context.evaluateMany;
    const running = f.editor.addPair();
    change(f);
    const before = f.nodes['spring-constraints'].value;
    resolve([2, 3, 5 / 3, 3]);
    await assert.rejects(running);
    assert.equal(f.nodes['spring-constraints'].value, before);
    assert.equal(f.editor.busy, false);
  }
});
test('cancel and busy/export gates leave constraints unchanged and allow retry', async () => {
  const f = fixture();
  let resolve;
  f.editor.numeric.context.evaluateMany = () => new Promise((r) => (resolve = r));
  const running = f.editor.addPair();
  assert.equal(f.editor.cancel(), true);
  await assert.rejects(running, /canceled/);
  resolve([2, 3, 5 / 3, 3]);
  assert.equal(f.nodes['spring-constraints'].value, '{}');
  f.editor.numeric.context.evaluateMany = f.context.evaluateMany;
  f.setExport(true);
  assert.throws(() => f.editor.pin(), /Finish/);
  await assert.rejects(() => f.editor.addPair(), /Finish/);
  f.setExport(false);
  f.host.busy = true;
  assert.throws(() => f.editor.pin(), /Finish/);
  f.host.busy = false;
  await f.editor.addPair();
  assert.equal(JSON.parse(f.nodes['spring-constraints'].value).extra_springs.length, 1);
});
test('malformed constraint rows remain solver-owned diagnostics and cannot break panel sync', () => {
  const f = fixture();
  f.nodes['spring-remove-pair'] = {};
  f.nodes['spring-clear-pins'] = {};
  f.nodes['spring-constraints'].value = '{"extra_springs":[null,{"vertices":{"join":1}}],"pins":[null]}';
  assert.doesNotThrow(() => f.editor.sync(false, true));
  assert.match(f.nodes['spring-constraint-list'].textContent, /vertices \?/);
  f.nodes['spring-constraints'].value =
    '{"extra_springs":[{"vertices":[{},{}],"length":{"toString":null},"weight":{}}],"pins":[{"vertex":{"toString":null}}]}';
  assert.doesNotThrow(() => f.editor.sync(false, true));
  assert.match(f.nodes['spring-constraint-list'].textContent, /target \?; weight \?/);
});
test('constraint summary and availability writers are idempotent', () => {
  const f = fixture();
  let writes = 0;
  const watched = (id, disabled) => {
    const node = { id };
    let current = disabled;
    Object.defineProperty(node, 'disabled', {
      get: () => current,
      set: (value) => {
        current = value;
        writes++;
      },
    });
    return node;
  };
  const remove = watched('spring-remove-pair', true),
    clear = watched('spring-clear-pins', true),
    add = watched('spring-add-pair', false);
  f.editor.root.querySelectorAll = () => [remove, clear, add];
  let text = 'No supplemental distances or pins.';
  Object.defineProperty(f.nodes['spring-constraint-list'], 'textContent', {
    get: () => text,
    set: (value) => {
      text = value;
      writes++;
    },
  });
  f.editor.sync(false, true);
  f.editor.sync(false, true);
  assert.equal(writes, 0);
  f.editor.sync(true, true);
  assert.equal(writes, 1);
  f.editor.sync(true, true);
  assert.equal(writes, 1);
});
