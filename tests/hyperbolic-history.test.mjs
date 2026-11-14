import { createHistoryWiring } from '../ui/app/history-wiring.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectSnapshot, hyperbolicView } from '../ui/hyperbolic-document.mjs';
import { prepareHistoryCommit, verifyHistoryPublication } from '../ui/history-workflow.mjs';
const hyper = () => ({
  kind: 'hyperbolic-space',
  dimension: 3,
  anchor: { word: [] },
  anchorPatch: { nextCursor: { frontier: [] } },
});
const doc = (model) => ({ cursor: 0, states: [{ model, view: {} }] });
test('polytope-only snapshot remains byte-identical; mixed projects use v2 and strip cursors', () => {
  const v1 = { version: 1, documents: [doc({ dimension: 4, vertices: [[0, 0, 0, 0]] })] };
  assert.equal(JSON.stringify(projectSnapshot(v1)), JSON.stringify(v1));
  const mixed = structuredClone(v1);
  mixed.documents.push(doc(hyper()));
  const snapshot = projectSnapshot(mixed);
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.documents[1].states[0].model.anchorPatch.nextCursor, undefined);
  assert.ok(mixed.documents[1].states[0].model.anchorPatch.nextCursor);
  snapshot.documents.pop();
  assert.equal(projectSnapshot(snapshot).version, 1);
});
test('hyperbolic source edits use native recipe workflow and reject late document switching', async () => {
  const document = doc(hyper()),
    project = { documents: [document] };
  let selected = document;
  const context = {
    getProject: () => project,
    getDocument: () => selected,
    getState: () => selected.states[selected.cursor],
    isExporting: () => false,
    run: async (op, p) => {
      assert.equal(op, 'recipe-run');
      assert.equal(p.operation, 'hyperbolic-create');
      return structuredClone(p.document);
    },
  };
  document.states[0].view = hyperbolicView(document.states[0].model);
  const prepared = await prepareHistoryCommit(
    context,
    'hyperbolic-create',
    { source: { type: 'honeycomb' } },
    'Create hyperbolic space'
  );
  assert.equal(verifyHistoryPublication(context, prepared), 0);
  document.cursor = 1;
  document.states.push({ model: hyper(), view: {} });
  assert.throws(() => verifyHistoryPublication(context, prepared), /changed/);
});

test('new hyperbolic documents use one atomic recipe request and fence source navigation/export', async () => {
  for (const change of ['none', 'source', 'export']) {
    const initial = { model: { dimension: 4 }, view: {} },
      project = { active: 0, documents: [{ cursor: 0, states: [initial] }] },
      animation = { exporting: false };
    let selected = initial,
      resolve,
      calls = 0,
      draws = 0;
    const result = { id: 'new', cursor: 0, states: [{ model: hyper(), view: {} }] };
    const ctx = {
      project,
      animation,
      state: () => selected,
      run: (op, params, model, label, options) => {
        calls++;
        assert.equal(op, 'recipe-run');
        assert.equal(params.document, null);
        assert.equal(params.operation, 'hyperbolic-create');
        assert.equal(model, null);
        assert.ok(options.onTiming);
        return new Promise((done) => {
          resolve = done;
        });
      },
      markDirty() {},
      renderWorkspace() {
        draws++;
      },
    };
    const wiring = createHistoryWiring(ctx);
    const pending = wiring.commitOperation(
      'hyperbolic-create',
      { source: { type: 'honeycomb', pqr: [5, 3, 4] } },
      'Open',
      { newDocument: true, onTiming() {} }
    );
    if (change === 'source') selected = { ...initial };
    if (change === 'export') animation.exporting = true;
    resolve(result);
    if (change === 'none') {
      assert.equal(await pending, result);
      assert.equal(project.documents[1], result);
      assert.equal(draws, 1);
    } else {
      await assert.rejects(pending, /superseded|export/i);
      assert.equal(project.documents.length, 1);
      assert.equal(draws, 0);
    }
    assert.equal(calls, 1);
  }
});
