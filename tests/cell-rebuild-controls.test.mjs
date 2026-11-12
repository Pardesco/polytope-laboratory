import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  CellRebuildControls,
  cellRebuildParams,
  cellRebuildSignature,
  checkCellRebuildPreview,
} from '../ui/cell-rebuild-controls.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/r8_cell_rebuild.json', import.meta.url), 'utf8'));
const native = spawnSync('python', ['-B', 'engine/server.py'], {
  input:
    JSON.stringify({
      id: 1,
      op: 'rebuild-coplanar-cells-preview',
      model: fixture.model,
      params: { cell_ids: fixture.cellIds, color_policy: 'require-equal' },
    }) + '\n',
  encoding: 'utf8',
  windowsHide: true,
});
assert.equal(native.status, 0);
const packet = JSON.parse(native.stdout).result;
test('read-only cell preview reuses warm imports while cell adoption stays isolated', () => {
  const { REUSABLE_OPERATIONS } = createRequire(import.meta.url)('../desktop/engine-pool.cjs');
  assert.equal(REUSABLE_OPERATIONS.has('rebuild-coplanar-cells-preview'), true);
  assert.equal(REUSABLE_OPERATIONS.has('rebuild-coplanar-cells'), false);
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
function setup() {
  const nodes = Object.fromEntries(
    [
      'cell-rebuild-ids',
      'cell-rebuild-color',
      'cell-rebuild-preview',
      'cell-rebuild-adopt',
      'cell-rebuild-cancel',
      'cell-rebuild-result',
      'cell-rebuild-owners',
    ].map((id) => [id, { value: '', disabled: false, hidden: false, textContent: '' }])
  );
  nodes['cell-rebuild-ids'].value = '8, 6';
  nodes['cell-rebuild-color'].value = 'require-equal';
  const state = { model: structuredClone(fixture.model), view: { coordinateUnit: 'mm' }, notes: 'Owner notes' };
  const document = { id: 'doc', states: [state], cursor: 0 };
  let project = { active: 0, documents: [document] },
    exporting = false;
  const calls = [],
    context = {
      getState: () => state,
      getDocument: () => document,
      getProject: () => project,
      isExporting: () => exporting,
      guard: (fn) => fn,
      run: async (...args) => {
        calls.push(['run', ...args]);
        return structuredClone(packet);
      },
      commit: async (op, params, label, options) => {
        options.verifyPublication();
        const result = { states: [{ model: structuredClone(packet.model) }], cursor: 0 };
        options.verifyResult(result);
        calls.push(['commit', op, params, label, options]);
        return result;
      },
    };
  const panel = {
    querySelector: (s) => nodes[s.slice(1)],
    querySelectorAll: () => Object.values(nodes),
    addEventListener() {},
  };
  const controls = Object.assign(Object.create(CellRebuildControls.prototype), {
    context,
    panel,
    busy: false,
    preview: null,
  });
  controls.sync();
  return {
    controls,
    nodes,
    state,
    document,
    calls,
    context,
    setProject: (p) => (project = p),
    setExport: (v) => (exporting = v),
  };
}

test('literal cell selectors normalize order and refuse expressions, duplicates and unsupported policies', () => {
  assert.deepEqual(cellRebuildParams({ ids: '8; 6', color: 'first-source' }), {
    cell_ids: [6, 8],
    color_policy: 'first-source',
  });
  for (const ids of ['', '6', '6,6', '6,8,9', '6,1+7', '6.0,8', '-1,8', '6,9007199254740992'])
    assert.throws(() => cellRebuildParams({ ids, color: 'require-equal' }));
  assert.throws(() => cellRebuildParams({ ids: '6,8', color: 'average' }));
});

test('read-only preview describes actual owners and residuals; adopt verifies before history publication', async () => {
  const f = setup(),
    before = structuredClone(f.state);
  await f.controls.apply();
  assert.deepEqual(f.state, before);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][1], 'rebuild-coplanar-cells-preview');
  assert.equal(f.nodes['cell-rebuild-adopt'].disabled, false);
  assert.match(
    f.nodes['cell-rebuild-result'].textContent,
    /Cells 6, 8 → cell 6.*content.*residual.*Float64 approximate/
  );
  assert.match(f.nodes['cell-rebuild-owners'].textContent, /Cell 6: source cells 6, 8; color source cell 6/);
  assert.match(f.nodes['cell-rebuild-owners'].textContent, /Face 0: source face 0; cycle and color unchanged/);
  await f.controls.apply(true);
  assert.equal(f.calls[1][1], 'rebuild-coplanar-cells');
  assert.deepEqual(f.calls[1][2], { cell_ids: [6, 8], color_policy: 'require-equal' });
});

test('source, project, history, notes, units, colors and settings fence prepared previews', async () => {
  for (const mutate of [
    (f) => (f.state.model.vertices[0][0] = 99),
    (f) => (f.state.model.metadata.changed = true),
    (f) => (f.state.notes = 'Changed'),
    (f) => (f.state.view.coordinateUnit = 'cm'),
    (f) => (f.document.states = [f.state]),
    (f) => (f.document.operationHistory = { changed: true }),
    (f) => f.setProject({}),
    (f) => (f.nodes['cell-rebuild-ids'].value = '0, 2'),
    (f) => (f.nodes['cell-rebuild-color'].value = 'first-source'),
    (f) => (f.state.view.documentMetadata = { title: 'Changed' }),
    (f) => (f.state.view.elementContentDetached = []),
    (f) => f.setExport(true),
  ]) {
    const f = setup();
    await f.controls.apply();
    mutate(f);
    f.controls.sync();
    assert.equal(f.nodes['cell-rebuild-adopt'].disabled, true);
    await assert.rejects(() => f.controls.apply(true));
    assert.equal(f.calls.filter((c) => c[0] === 'commit').length, 0);
  }
});

test('late responses and cancellation cannot publish a preview or a changed history result', async () => {
  for (const stage of ['preview', 'adopt'])
    for (const cancel of [true, false]) {
      const f = setup(),
        pending = deferred();
      let published = false;
      if (stage === 'preview')
        f.context.run = async () => {
          await pending.promise;
          return structuredClone(packet);
        };
      else {
        await f.controls.apply();
        f.context.commit = async (op, p, label, options) => {
          await pending.promise;
          options.verifyPublication();
          published = true;
        };
      }
      const work = f.controls.apply(stage === 'adopt');
      if (cancel) f.controls.cancel();
      else f.state.notes = 'Changed';
      pending.resolve();
      await assert.rejects(work);
      assert.equal(published, false);
      assert.equal(f.controls.preview, null);
      assert.equal(f.nodes['cell-rebuild-adopt'].disabled, true);
      assert.equal(f.controls.busy, false);
    }
});

test('native geometry, color, content-owner and numeric disagreement refuse adoption', async () => {
  for (const mutate of [
    (m) => (m.vertices[0][0] = 99),
    (m) => (m.metadata.offColors.cells[6] = null),
    (m) => (m.metadata.cellRebuild.joinedCellContent = 2),
    (m) => (m.numeric.certified = true),
  ]) {
    const f = setup();
    await f.controls.apply();
    let published = false;
    f.context.commit = async (op, p, l, options) => {
      const m = structuredClone(packet.model);
      mutate(m);
      options.verifyPublication();
      options.verifyResult({ states: [{ model: m }], cursor: 0 });
      published = true;
    };
    await assert.rejects(() => f.controls.apply(true), /differs from the preview/);
    assert.equal(published, false);
    assert.equal(f.controls.preview, null);
  }
});

test('malformed receipts refuse and signature ignores only volatile result identity', () => {
  const params = { cell_ids: [6, 8], color_policy: 'require-equal' };
  assert.equal(checkCellRebuildPreview(packet, params), packet);
  for (const mutate of [
    (p) => (p.construction.joinedCellContent = 0),
    (p) => (p.model.validation.passed = false),
    (p) => (p.model.provenance.parameters.cell_ids = [0, 1]),
    (p) => (p.construction.cellSources = []),
  ]) {
    const p = structuredClone(packet);
    mutate(p);
    assert.throws(() => checkCellRebuildPreview(p, params), /malformed/);
  }
  const copy = structuredClone(packet.model);
  copy.id = 'changed';
  assert.equal(cellRebuildSignature(copy), cellRebuildSignature(packet.model));
});

test('constructor mounts a common disclosure, handlers and explicit cancellation', () => {
  const f = setup(),
    previous = globalThis.document;
  let mounted;
  globalThis.document = {
    createElement: () => f.controls.panel,
    getElementById: (id) => {
      assert.equal(id, 'face-editing-settings');
      return { after: (p) => (mounted = p) };
    },
  };
  try {
    const c = new CellRebuildControls(f.context);
    assert.equal(mounted, c.panel);
    assert.match(c.panel.innerHTML, /Coplanar cells/);
    assert.doesNotMatch(c.panel.innerHTML, /data-expert/);
    assert.equal(typeof f.nodes['cell-rebuild-preview'].onclick, 'function');
    assert.equal(typeof f.nodes['cell-rebuild-adopt'].onclick, 'function');
  } finally {
    globalThis.document = previous;
  }
});
