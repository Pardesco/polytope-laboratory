import test from 'node:test';
import assert from 'node:assert/strict';
import { HistoryControls } from '../ui/history-controls.mjs';

function fixture() {
  const node = { id: 'selected', op: 'polygon-prism', algorithmVersion: '0.1.0' },
    state = { operationNode: 'selected' };
  let document = { operationHistory: { version: 1, nodes: [node] }, states: [state], cursor: 0 },
    exporting = false,
    resolve,
    reject;
  const calls = [],
    controls = Object.create(HistoryControls.prototype);
  Object.assign(controls, {
    check: {},
    replay: {},
    branch: {},
    support: {},
    context: {
      getDocument: () => document,
      getState: () => document.states[document.cursor],
      isExporting: () => exporting,
      run: (...args) => {
        calls.push(args);
        return new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        });
      },
    },
  });
  return {
    controls,
    calls,
    node,
    state,
    document,
    setDocument: (value) => (document = value),
    setExport: (value) => (exporting = value),
    finish: (report) => resolve(report),
    fail: () => reject(Error('Native validation failed')),
  };
}

test('History checks native support with detached graph and never calls it verified replay', async () => {
  const f = fixture();
  f.controls.sync();
  assert.match(f.controls.support.textContent, /polygon-prism\/0.1.0/);
  const pending = f.controls.checkSupport();
  assert.equal(f.controls.check.disabled, true);
  assert.equal(f.controls.replay.disabled, true);
  const [op, params, model] = f.calls[0];
  assert.equal(op, 'history-support');
  assert.equal(model, null);
  assert.equal(params.target, 'selected');
  assert.notEqual(params.history, f.document.operationHistory);
  assert.deepEqual(params.history, f.document.operationHistory);
  f.finish({
    canReplay: true,
    canBranch: true,
    verified: false,
    message: 'Retained algorithm version available. Replay must still verify geometry and content.',
  });
  await pending;
  assert.equal(f.controls.replay.disabled, false);
  assert.equal(f.controls.branch.disabled, false);
  assert.match(f.controls.support.textContent, /must still verify/);
});

test('snapshot-only native report disables replay and branch while preserving the selected snapshot', async () => {
  const f = fixture(),
    before = structuredClone(f.document),
    pending = f.controls.checkSupport();
  f.finish({
    canReplay: false,
    canBranch: false,
    message: 'Unsupported algorithm; retained snapshot remains readable.',
  });
  await pending;
  assert.equal(f.controls.replay.disabled, true);
  assert.equal(f.controls.branch.disabled, true);
  assert.deepEqual(f.document, before);
  assert.match(f.controls.support.textContent, /snapshot remains readable/);
});

test('late support result cannot publish into a different document or history selection', async () => {
  for (const change of [
    (f) => f.setDocument({ states: [{}], cursor: 0 }),
    (f) => (f.document.states[0] = { operationNode: 'other' }),
  ]) {
    const f = fixture(),
      pending = f.controls.checkSupport();
    change(f);
    f.finish({ message: 'STALE REPORT', canReplay: true });
    await pending;
    assert.doesNotMatch(f.controls.support.textContent, /STALE/);
    assert.equal(f.controls.replay.disabled, true);
    assert.equal(f.controls.checking, null);
  }
});

test('native failure releases the checking guard and permits a retry', async () => {
  const f = fixture(),
    pending = f.controls.checkSupport();
  f.fail();
  await assert.rejects(pending, /Native validation failed/);
  assert.equal(f.controls.checking, null);
  assert.equal(f.controls.check.disabled, false);
  const retry = f.controls.checkSupport();
  f.finish({ canReplay: true, canBranch: true, message: 'Available; not verified.' });
  await retry;
  assert.equal(f.calls.length, 2);
});

test('snapshot-only documents and export locks never start a support computation', async () => {
  const f = fixture();
  f.setDocument({ states: [{}], cursor: 0 });
  f.controls.sync();
  assert.equal(f.controls.check.disabled, true);
  assert.match(f.controls.support.textContent, /No recorded operations/);
  await f.controls.checkSupport();
  assert.equal(f.calls.length, 0);
  f.setDocument(f.document);
  f.setExport(true);
  await assert.rejects(() => f.controls.checkSupport(), /export/);
  assert.equal(f.calls.length, 0);
});
test('vertex-figure constructions expose parameter branching through the registered history operation', () => {
  const f = fixture();
  f.node.op = 'construct-from-vertex-figure';
  f.controls.sync();
  assert.equal(f.controls.branch.disabled, false);
  assert.equal(f.controls.replay.disabled, false);
});

test('repeated History synchronization writes no unchanged disabled attributes or status text', () => {
  const f = fixture();
  let writes = 0;
  for (const node of [f.controls.check, f.controls.replay, f.controls.branch]) {
    let value;
    Object.defineProperty(node, 'disabled', {
      get: () => value,
      set: (next) => {
        value = next;
        writes++;
      },
    });
  }
  let message;
  Object.defineProperty(f.controls.support, 'textContent', {
    get: () => message,
    set: (next) => {
      message = next;
      writes++;
    },
  });
  f.controls.sync();
  assert.equal(writes, 4);
  f.controls.sync();
  assert.equal(writes, 4);
});
