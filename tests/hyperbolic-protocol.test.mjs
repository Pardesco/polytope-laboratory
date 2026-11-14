import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyHyperbolicNeighborUpdates,
  HyperbolicDocument,
  HYPERBOLIC_PRESETS,
  retainPage,
  rebaseHyperbolic,
  hyperbolicView,
} from '../ui/hyperbolic-document.mjs';
import { IDENTITY, boost } from '../ui/hyperbolic-math.mjs';
import { allowed } from '../desktop/engine-allowlist.cjs';
import { REUSABLE_OPERATIONS } from '../desktop/engine-pool.cjs';

test('all four regular templates and pinned quotient are exposed without uniform rings', () => {
  assert.equal(HYPERBOLIC_PRESETS.length, 5);
  for (const p of HYPERBOLIC_PRESETS.slice(0, 4)) assert.deepEqual(p.source.rings, [1, 0, 0, 0]);
  assert.equal(HYPERBOLIC_PRESETS[4].source.key, 'small-cover-v1');
  for (const op of ['create', 'patch', 'analyze', 'validate']) assert.ok(allowed.has('hyperbolic-' + op));
  for (const op of ['patch', 'analyze', 'validate']) assert.ok(REUSABLE_OPERATIONS.has('hyperbolic-' + op));
});
test('rebase uses the same patch op, correct frame direction, signal and address', async () => {
  const anchor = { word: [1, 2], localFrame: [...IDENTITY] },
    model = { source: HYPERBOLIC_PRESETS[0].source, anchor };
  const controller = new AbortController(),
    observer = boost([1, 0, 0], 1.01);
  let called;
  const page = { anchor: { word: [1, 2, 3], localFrame: observer } };
  const result = await rebaseHyperbolic(
    async (...args) => {
      called = args;
      return page;
    },
    model,
    { anchor, epoch: 2, observerMatrix: observer, signal: controller.signal }
  );
  assert.equal(called[0], 'hyperbolic-patch');
  assert.deepEqual(called[1].rebase, observer);
  assert.equal(called[1].epoch, 3);
  assert.equal(called[4].signal, controller.signal);
  assert.deepEqual(result.anchorTransform, observer);
  assert.deepEqual(result.observerMatrix, IDENTITY);
  assert.equal(result.patch, page);
});
test('retained snapshots strip continuation without mutating disposable pages', () => {
  const page = { instances: [], nextCursor: { untrusted: true }, anchor: { word: [] } },
    model = {};
  retainPage(model, page);
  assert.equal(model.anchorPatch.nextCursor, undefined);
  assert.ok(page.nextCursor);
  assert.deepEqual(hyperbolicView(model).observerMatrix, IDENTITY);
  assert.throws(() => retainPage(model, { text: 'a'.repeat(1024 * 1024) }), /1 MiB/);
});

test('neighbor pages replace explicit frontier rows and retain full template correspondence', () => {
  const neighbors = new Map(),
    first = { cell: 0, face: 2, toCell: null, vertexPermutation: null },
    update = { cell: 0, face: 2, toCell: 1, vertexPermutation: [3, 2, 1, 0] };
  applyHyperbolicNeighborUpdates(neighbors, { neighbors: [first] });
  applyHyperbolicNeighborUpdates(neighbors, { neighbors: [update] });
  assert.equal(neighbors.size, 1);
  assert.equal(neighbors.get('0:2'), update);
  assert.deepEqual(update.vertexPermutation, [3, 2, 1, 0]);
  assert.equal(first.toCell, null);
});

test('progressive regeneration retains its first page, validates every page and refuses stale bindings', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/hyperbolic/three-cubes.json', import.meta.url), 'utf8'));
  const controller = Object.create(HyperbolicDocument.prototype),
    calls = [];
  controller.viewer = {
    binding: { ...fixture, revision: 7 },
    pages: [{ ...fixture, instances: [fixture.instances[0]] }],
    setPatch: (page, options) => {
      calls.push({ page, options });
      return true;
    },
  };
  assert.equal(controller.appendPage(fixture), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].page.instances.length, fixture.instances.length - 1);
  assert.deepEqual(calls[0].options, { append: true, revision: 7 });
  assert.equal(controller.viewer.pages[0].instances.length, 1);
  assert.equal(controller.appendPage({ ...fixture, epoch: fixture.epoch + 1 }), false);
  assert.equal(calls.length, 1);
  const bad = structuredClone(fixture);
  bad.instances[0].matrix[0] = NaN;
  assert.throws(() => controller.appendPage(bad), /Lorentz/);
});

test('a refused cursor restarts paging from a clean matching generation', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/hyperbolic/three-cubes.json', import.meta.url), 'utf8'));
  const controller = Object.create(HyperbolicDocument.prototype),
    calls = [];
  const source = { model: { source: HYPERBOLIC_PRESETS[0].source, anchor: { word: [] } } };
  controller.ctx = {
    state: () => source,
    run: async (_op, params) => {
      calls.push(params);
      if (params.cursor) throw Error('Cursor checkpoint refused after cache restart.');
      return { ...fixture, nextCursor: null };
    },
  };
  controller.viewer = {
    binding: { ...fixture, revision: 7 },
    pages: [{ ...fixture, instances: [fixture.instances[0]] }],
    setPatch(page) {
      this.pages = [page];
      return true;
    },
  };
  controller.neighbors = new Map();
  controller.waitForDisplay = async () => true;
  await controller.continuePages({ ...fixture, nextCursor: { stale: true } }, source, new AbortController());
  assert.equal(calls.length, 2);
  assert.equal(calls[1].cursor, undefined);
  assert.equal(controller.viewer.pages.length, 1);
  assert.equal(controller.viewer.pages[0].instances.length, fixture.instances.length);
});

test('Return to center requests the document starting cell, independently of the current address', async () => {
  let params;
  const model = { source: HYPERBOLIC_PRESETS[0].source, anchor: { word: [1, 2] } };
  await rebaseHyperbolic(
    async (_op, value) => {
      params = value;
      return { anchor: { word: [] } };
    },
    model,
    { home: true, epoch: 8, anchor: { word: [1, 2, 3] }, observerMatrix: boost([1, 0, 0], 0.8) }
  );
  assert.deepEqual(params.anchor, {});
  assert.equal(params.rebase, undefined);
});
