import { readAppSource } from './helpers/app-source.mjs';
import { matchSource, doesNotMatchSource } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  CorpusReceiptControls,
  emptyReceiptBundle,
  parseReceiptText,
  RECEIPT_BYTES,
} from '../ui/corpus-receipt-controls.mjs';
import { CorpusReconciliationControls } from '../ui/corpus-reconciliation-controls.mjs';

class Node {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.value = '';
    this.attributes = {};
  }
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }
  before(node) {
    this.beforeNode = node;
  }
  setAttribute(key, value) {
    this.attributes[key] = value;
  }
}
const document = { createElement: (tag) => new Node(tag) };
const content = (node) => [node.textContent ?? '', ...node.children.map(content)].join('\n');
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { resolve, promise };
};
const report = (status = 'accepted') => ({
  receipts: [
    {
      id: 'u1',
      status,
      qualified: false,
      blockers: ['Missing trusted human review: license.'],
      pins: { coordinatesSha256: 'coords', topologySha256: 'topology' },
    },
  ],
  groups: [
    { label: 'Uniform polyhedra', required: 75, qualifiedIdentities: 0 },
    { label: 'Specialized', required: null, qualifiedIdentities: 0 },
  ],
  trustedReviewers: 0,
  blockers: ['No trusted human reviewer is registered.'],
  scope: 'Accepted evidence is not review.',
});
function fixture(read = async () => report()) {
  const root = new Node('div'),
    calls = [],
    selection = { identity: 'uniform3:U1', realization: 'antiprism:antiprism-u1', available: true };
  const control = new CorpusReceiptControls({
    document,
    root,
    run: async (...args) => {
      calls.push(args);
      return read(...args);
    },
    getSelection: () => selection,
  });
  return { root, calls, control, selection };
}

test('r8-corpus-ui-common: receipt gates mount within ordinary Corpus coverage, collapsed and lazy', () => {
  const corpus = new CorpusReconciliationControls({
    document,
    before: new Node('div'),
    run: () => {
      throw Error('must be lazy');
    },
    open: () => {},
  });
  assert.equal(corpus.root.children.at(-1).id, 'corpus-receipts');
  assert.equal(corpus.receipts.root.attributes['data-expert'], undefined);
  assert.equal(Boolean(corpus.receipts.root.open), false);
  assert.equal(corpus.receipts.prepare.disabled, true);
  const app = readAppSource();
  matchSource(app, /corpusReconciliation\.receipts\.api=api/);
  matchSource(app, /import '\.\/corpus-receipts.css'/);
});

test('r8-corpus-ui-prepare: selected source produces editable evidence without changing project history', async () => {
  const bundle = emptyReceiptBundle(),
    f = fixture(async () => ({ bundle }));
  await f.control.prepareSelected();
  assert.deepEqual(f.calls[0].slice(0, 3), [
    'corpus-receipts',
    { action: 'prepare', identity: 'uniform3:U1', realization: 'antiprism:antiprism-u1' },
    null,
  ]);
  assert.ok(f.calls[0][4].signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(f.control.input.value), bundle);
  assert.match(f.control.status.textContent, /review remain pending/);
  const source = readFileSync(new URL('../ui/corpus-receipt-controls.mjs', import.meta.url), 'utf8');
  doesNotMatchSource(source, /commitOperation|markDirty|MutationObserver|localStorage/);
});

test('r8-corpus-ui-evidence: accepted, rejected and stale stay distinct from identity qualification', async () => {
  for (const status of ['accepted', 'rejected', 'stale']) {
    const f = fixture(async () => report(status));
    f.control.input.value = JSON.stringify(emptyReceiptBundle());
    await f.control.evaluate();
    assert.match(f.control.status.textContent, new RegExp(`1 ${status}`));
    assert.match(f.control.status.textContent, /0 trusted reviewers/);
    assert.match(content(f.control.result), /0 \/ 75 qualified baseline identities/);
    assert.match(content(f.control.result), /unknown total/);
    assert.match(content(f.control.result), /Missing trusted human review: license/);
    assert.match(content(f.control.result), /coordinatesSha256/);
    assert.match(content(f.control.result), /topologySha256/);
    assert.match(content(f.control.result), /baseline pending/);
  }
});

test('r8-corpus-ui-unselected: candidates and unavailable sources cannot prepare named evidence', async () => {
  const f = fixture();
  f.selection.available = false;
  f.control.sync();
  assert.equal(f.control.prepare.disabled, true);
  await f.control.prepareSelected();
  assert.equal(f.calls.length, 0);
  assert.equal(f.control.check.disabled, false);
});

test('r8-corpus-ui-superseded: selection changes and JSON edits revoke pending requests', async () => {
  for (const cancel of [(c) => c.cancel(), (c) => c.input.oninput()]) {
    const hold = deferred(),
      f = fixture(() => hold.promise);
    const pending = f.control.evaluate();
    cancel(f.control);
    hold.resolve(report());
    await pending;
    assert.equal(f.calls[0][4].signal.aborted, true);
    assert.equal(f.control.result.children.length, 0);
    assert.equal(f.control.check.disabled, false);
  }
});

test('r8-corpus-ui-parent-selection: corpus selection cancels receipt validation', async () => {
  const hold = deferred(),
    calls = [];
  const corpus = new CorpusReconciliationControls({
    document,
    before: new Node('div'),
    run: (...args) => {
      calls.push(args);
      return hold.promise;
    },
    open: () => {},
  });
  const pending = corpus.receipts.evaluate();
  corpus.identity.onchange();
  hold.resolve(report());
  await pending;
  assert.equal(calls[0][4].signal.aborted, true);
  assert.equal(corpus.receipts.result.children.length, 0);
});

test('r8-corpus-ui-import: portable JSON imports are bounded and remain session evidence', async () => {
  const f = fixture();
  f.control.file.files = [{ size: 100, text: async () => JSON.stringify(emptyReceiptBundle()) }];
  await f.control.importFile();
  assert.deepEqual(JSON.parse(f.control.input.value), emptyReceiptBundle());
  assert.equal(f.calls.length, 0);
  assert.match(f.control.status.textContent, /session/);
  assert.equal(f.control.file.value, '');
  f.control.file.files = [
    {
      size: RECEIPT_BYTES + 1,
      text: () => {
        throw Error('must not read');
      },
    },
  ];
  await assert.rejects(f.control.importFile(), /2 MiB/);
  assert.match(f.control.status.textContent, /Receipt import failed/);
});

test('r8-corpus-ui-import-race: an obsolete file read cannot overwrite current evidence', async () => {
  const hold = deferred(),
    f = fixture();
  f.control.file.files = [{ size: 100, text: () => hold.promise }];
  const pending = f.control.importFile();
  f.control.input.value = 'newer';
  f.control.input.oninput();
  hold.resolve('{}');
  await pending;
  assert.equal(f.control.input.value, 'newer');
});

test('r8-corpus-ui-invalid-json: invalid and oversized JSON never reach native dispatch', () => {
  assert.deepEqual(parseReceiptText(' '), emptyReceiptBundle());
  assert.throws(() => parseReceiptText('['));
  assert.throws(() => parseReceiptText('é'.repeat(RECEIPT_BYTES)), /2 MiB/);
  const f = fixture();
  f.control.input.value = '[';
  assert.throws(() => f.control.evaluate());
  assert.equal(f.calls.length, 0);
  assert.match(f.control.status.textContent, /Invalid receipt JSON/);
});

test('r8-corpus-ui-error: failed gate checks restore retryable controls', async () => {
  const f = fixture(async () => {
    throw Error('source changed');
  });
  await assert.rejects(f.control.evaluate(), /source changed/);
  assert.match(f.control.status.textContent, /Receipt check failed/);
  assert.equal(f.control.check.disabled, false);
  assert.equal(f.control.prepare.disabled, false);
});

test('r8-corpus-ui-save: evidence uses bounded native JSON export and preserves literal content', async () => {
  const f = fixture(),
    writes = [],
    raw = JSON.stringify(emptyReceiptBundle(), null, 2);
  f.control.input.value = raw;
  f.control.api = {
    beginTextExport: async (params) => {
      assert.equal(params.format, 'json');
      return { id: 'ticket' };
    },
    writeTextExport: async (...args) => {
      writes.push(args);
      return { path: 'receipts.json' };
    },
    abortTextExport: async () => {},
  };
  await f.control.export();
  assert.deepEqual(writes, [['ticket', raw]]);
  assert.match(f.control.status.textContent, /review approvals are maintained separately/);
});

test('r8-corpus-ui-save-race: edited JSON cancels a pending destination and prevents writing', async () => {
  const f = fixture(),
    hold = deferred(),
    writes = [],
    aborts = [];
  f.control.input.value = JSON.stringify(emptyReceiptBundle());
  f.control.api = {
    beginTextExport: () => hold.promise,
    writeTextExport: async (...args) => writes.push(args),
    abortTextExport: async (id) => aborts.push(id),
  };
  const pending = f.control.export();
  f.control.input.value = 'edited';
  f.control.input.oninput();
  hold.resolve({ id: 'ticket' });
  await pending;
  assert.equal(writes.length, 0);
  assert.deepEqual(aborts, ['ticket']);
});

test('r8-corpus-native-dispatch: read-only op is reusable, allowlisted and returns zero baseline qualification', () => {
  const require = createRequire(import.meta.url);
  assert.ok(require('../desktop/engine-pool.cjs').REUSABLE_OPERATIONS.has('corpus-receipts'));
  const result = spawnSync('python', ['-m', 'engine.server'], {
    cwd: new URL('..', import.meta.url),
    input:
      JSON.stringify({ id: 'receipt-test', op: 'corpus-receipts', params: { bundle: emptyReceiptBundle() } }) + '\n',
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60000,
  });
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout.trim());
  assert.equal(response.ok, true, response.error);
  assert.equal(response.result.trustedReviewers, 0);
  assert.ok(response.result.groups.every((g) => g.qualifiedIdentities === 0));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts['test:features'], /tests\/corpus-receipt-controls.test.mjs/);
  for (const name of ['corpus_receipts.py', 'corpus_reconciliation.py', 'catalog_audit.py'])
    assert.ok(pkg.scripts['engine:bundle'].includes(`../engine/${name};engine`));
});
