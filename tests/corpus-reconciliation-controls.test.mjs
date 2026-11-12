import { readAppSource } from './helpers/app-source.mjs';
import { matchSource, doesNotMatchSource } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { CorpusReconciliationControls, coverageLabel } from '../ui/corpus-reconciliation-controls.mjs';
const require = createRequire(import.meta.url);

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
const group = (id = 'regular4') => ({
  id,
  label: id === 'regular4' ? 'Regular 4D polychora' : 'Uniform polychora',
  required: id === 'regular4' ? 16 : 2191,
  qualifiedIdentities: 0,
  mappedIdentities: id === 'regular4' ? 16 : 0,
});
const realization = (key = 'tesseract', status = 'mapped-unverified') => ({
  id: 'native:' + key,
  name: key,
  catalogKey: key,
  source: 'native',
  status,
  coordinateSet: { id: 'coordinates:' + key, comparison: 'No equality inferred.' },
  topology: { id: 'incidence:' + key, comparison: 'Full ordered incidence.' },
  classification: { status: 'source-asserted', label: 'Regular' },
  license: { status: 'unverified' },
});
const identity = (id = 'regular4:tes') => ({
  id,
  name: 'Tesseract',
  status: 'mapped-unverified',
  identityEvidence: { basis: 'Explicit identity table.' },
  realizations: [realization(), realization('mirror')],
  blockers: ['Classification review pending.'],
});
const data = () => ({
  groups: [group(), group('uniform4')],
  identities: [identity()],
  sources: [{ id: 'native', actualCount: 45, status: 'native-current', license: { status: 'unverified' } }],
  externalInventories: [
    { id: 'drive', entryCount: 3064, status: 'inventory-snapshot-external', licenseStatus: 'unverified' },
  ],
  blockers: ['Baseline roster missing.'],
  candidateGroups: [],
});
function fixture(read = async () => data()) {
  const document = { createElement: (tag) => new Node(tag) },
    before = new Node('div'),
    calls = [],
    opened = [];
  const control = new CorpusReconciliationControls({
    document,
    before,
    run: async (...args) => {
      calls.push(args);
      return read(...args);
    },
    open: (entry) => opened.push(entry),
  });
  return { control, before, calls, opened };
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const content = (node) => [node.textContent ?? '', ...node.children.map(content)].join('\n');

test('coverage labels use qualified named identities and unknown denominators honestly', () => {
  assert.match(coverageLabel(group('uniform4')), /0 \/ 2,191 qualified; 0 named source matches/);
  assert.match(coverageLabel({ ...group(), required: null }), /0 \/ unknown total/);
});

test('coverage is mounted in the ordinary Library, collapsed and lazy', async () => {
  const f = fixture();
  assert.equal(f.before.beforeNode.id, 'library-corpus');
  assert.equal(f.calls.length, 0);
  assert.equal(f.control.root.attributes['data-expert'], undefined);
  assert.equal(Boolean(f.control.root.open), false);
  f.control.root.open = true;
  await f.control.root.ontoggle();
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].slice(0, 3), ['corpus-reconciliation', { group: 'regular4' }, null]);
  assert.ok(f.calls[0][4].signal instanceof AbortSignal);
  await f.control.root.ontoggle();
  assert.equal(f.calls.length, 1);
  assert.match(content(f.control.summary), /3,064 inventoried files/);
  assert.match(content(f.control.summary), /Baseline roster missing/);
});

test('named identity view retains separate realization, coordinate, topology and review evidence', async () => {
  const f = fixture();
  await f.control.load();
  assert.equal(f.control.identity.value, 'regular4:tes');
  assert.equal(f.control.realization.children.length, 2);
  assert.match(content(f.control.detail), /Coordinates: coordinates:tesseract/);
  assert.match(content(f.control.detail), /Topology: incidence:tesseract/);
  assert.match(content(f.control.detail), /source-asserted/);
  assert.match(content(f.control.detail), /Classification review pending/);
  f.control.openButton.onclick();
  assert.deepEqual(f.opened, [{ key: 'tesseract', name: 'tesseract' }]);
  f.control.realization.value = 'native:mirror';
  f.control.realization.onchange();
  f.control.openButton.onclick();
  assert.equal(f.opened.at(-1).key, 'mirror');
});

test('numerical audit uses the selected identity and realization without replacing a document', async () => {
  const f = fixture(async (_op, params) =>
    params.verify ? { audit: { status: 'pass', qualified: false, checks: { incidence: { status: 'pass' } } } } : data()
  );
  await f.control.load();
  await f.control.verify();
  assert.deepEqual(f.calls[1][1], { identity: 'regular4:tes', realization: 'native:tesseract', verify: true });
  assert.match(f.control.status.textContent, /Numerical audit: pass.*qualification remains pending/);
  assert.match(content(f.control.detail), /"qualified": false/);
  assert.equal(f.opened.length, 0);
});

test('unmatched duals and stale realizations cannot be opened or numerically audited', async () => {
  for (const stale of [true, false]) {
    const d = data();
    d.identities[0].realizations = stale ? [realization('tesseract', 'stale-or-missing')] : [];
    const f = fixture(async () => d);
    await f.control.load();
    assert.equal(f.control.audit.disabled, true);
    assert.equal(f.control.openButton.disabled, true);
    await f.control.verify();
    assert.equal(f.calls.length, 1);
    if (!stale) assert.match(f.control.status.textContent, /general dual operation does not satisfy/);
  }
});

test('4D groups display every candidate name without increasing coverage', async () => {
  const d = data();
  d.identities = [];
  d.candidateGroups = [
    {
      id: 'star4',
      basis: 'No canonical baseline identity mapping.',
      records: [
        { name: 'Candidate A', key: 'a', status: 'unverified', identityStatus: 'unmatched' },
        { name: 'Candidate B', key: 'b', status: 'unsupported', identityStatus: 'unmatched' },
      ],
    },
  ];
  const f = fixture(async () => d);
  f.control.group.value = 'uniform4';
  await f.control.load();
  assert.match(content(f.control.detail), /2 unmatched source realizations/);
  assert.match(content(f.control.detail), /Candidate A/);
  assert.match(content(f.control.detail), /Candidate B/);
  assert.match(content(f.control.summary), /0 \/ 2,191 qualified/);
  assert.equal(f.control.audit.disabled, true);
});

test('superseded group loads abort and discard late results', async () => {
  const first = deferred(),
    second = deferred();
  let n = 0;
  const f = fixture(() => (++n === 1 ? first.promise : second.promise));
  const pending = f.control.load();
  f.control.group.value = 'uniform4';
  const latest = f.control.load();
  assert.equal(f.calls[0][4].signal.aborted, true);
  const newer = data();
  newer.identities = [];
  second.resolve(newer);
  await latest;
  first.resolve(data());
  await pending;
  assert.equal(f.control.group.value, 'uniform4');
  assert.equal(f.control.identity.value, '');
});

test('identity changes cancel a pending audit before publication', async () => {
  const hold = deferred(),
    f = fixture(async (_op, params) => (params.verify ? hold.promise : data()));
  await f.control.load();
  const pending = f.control.verify();
  f.control.identity.onchange();
  hold.resolve({ audit: { status: 'pass' } });
  await pending;
  assert.equal(f.calls[1][4].signal.aborted, true);
  assert.doesNotMatch(content(f.control.detail), /"status": "pass"/);
});

test('failed requests show retryable local status and restore controls', async () => {
  let fail = true;
  const f = fixture(async () => {
    if (fail) throw Error('missing manifest');
    return data();
  });
  await assert.rejects(f.control.load(), /missing manifest/);
  assert.match(f.control.status.textContent, /Corpus review failed/);
  assert.equal(f.control.refresh.disabled, false);
  fail = false;
  await f.control.load();
  assert.equal(f.control.loaded, true);
});

test('native JSON-lines dispatch is allowed, reusable and mounted without history mutations', () => {
  const { REUSABLE_OPERATIONS } = require('../desktop/engine-pool.cjs');
  assert.ok(REUSABLE_OPERATIONS.has('corpus-reconciliation'));
  const result = spawnSync('python', ['-m', 'engine.server'], {
    cwd: new URL('..', import.meta.url),
    input:
      JSON.stringify({
        id: 'corpus-test',
        op: 'corpus-reconciliation',
        params: { identity: 'uniform3:U1', verify: true },
      }) + '\n',
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout.trim());
  assert.equal(response.ok, true, response.error);
  assert.equal(response.result.audit.status, 'pass');
  assert.equal(response.result.identity.qualified, false);
  const app = readAppSource();
  matchSource(
    app,
    /new CorpusReconciliationControls\(\{document,before:\$\('(?:ctx\.)?catalog'\),run,guard,open:entry=>(?:ctx\.)?catalogLoader.open\(entry\)\}\)/
  );
  const source = readFileSync(new URL('../ui/corpus-reconciliation-controls.mjs', import.meta.url), 'utf8');
  doesNotMatchSource(source, /commitOperation|markDirty|MutationObserver/);
});
