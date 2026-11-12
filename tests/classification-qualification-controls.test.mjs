import { readAppSource } from './helpers/app-source.mjs';
import { matchSource } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ClassificationQualificationControls } from '../ui/classification-qualification-controls.mjs';
const require = createRequire(import.meta.url);
class Node {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.value = '';
    this.attributes = {};
  }
  append(...rows) {
    this.children.push(...rows);
  }
  replaceChildren(...rows) {
    this.children = [];
    this.append(...rows);
  }
  before(row) {
    this.beforeNode = row;
  }
  setAttribute(k, v) {
    this.attributes[k] = v;
  }
}
const data = () => ({
  tranche: '3d',
  label: '3D identities',
  scope: 'Numerical receipts only.',
  sourcePinsCurrent: true,
  unresolved: ['Source gaps remain.'],
  entries: [
    {
      id: 'dual3:U13',
      kind: 'dual',
      name: 'Dual of U13',
      sourceKey: 'antiprism-u13',
      generatedKey: 'generated-dual-u13',
      identityBasis: 'Pinned U identity.',
      recordedStatus: 'numerical-pass',
      status: 'recorded-unchecked',
      references: ['manifest.json'],
      receipt: { status: 'numerical-pass', source: { coordinatesSha256: 'coordinates', incidenceSha256: 'incidence' } },
    },
    {
      id: 'dual3:U3',
      kind: 'dual',
      name: 'Dual of U3',
      sourceKey: 'antiprism-u3',
      generatedKey: 'generated-dual-u3',
      identityBasis: 'Hemi source retained.',
      recordedStatus: 'unresolved',
      status: 'unresolved',
      references: [],
      receipt: { status: 'unresolved', reason: 'Center-plane singularity.' },
    },
    {
      id: 'fissary:affic',
      kind: 'missing-source',
      name: 'affic',
      identityBasis: 'Source assertion only.',
      recordedStatus: 'missing-source',
      status: 'missing-source',
      sourceHypotheses: { fissary: true, chirality: 'unresolved' },
      references: [],
      receipt: { status: 'missing-source', reason: 'No pinned source geometry.' },
    },
  ],
});
const content = (node) => [node.textContent ?? '', ...node.children.map(content)].join('\n');
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => (resolve = yes));
  return { promise, resolve };
};
function fixture(read = async () => data()) {
  const before = new Node('div'),
    calls = [],
    opened = [];
  const control = new ClassificationQualificationControls({
    document: { createElement: (tag) => new Node(tag) },
    before,
    run: async (...args) => {
      calls.push(args);
      return read(...args);
    },
    open: (row) => opened.push(row),
  });
  return { control, before, calls, opened };
}
test('ordinary Library controls mount collapsed, lazy, labeled and outside Expert mode', async () => {
  const f = fixture();
  assert.equal(f.before.beforeNode.id, 'library-classification');
  assert.equal(f.calls.length, 0);
  assert.equal(Boolean(f.control.root.open), false);
  assert.equal(f.control.root.attributes['data-expert'], undefined);
  assert.equal(f.control.tranche.attributes['aria-label'], 'Classification tranche');
  assert.equal(f.control.source.disabled, true);
  f.control.root.open = true;
  await f.control.root.ontoggle();
  await f.control.root.ontoggle();
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].slice(0, 3), ['classification-qualification', { tranche: '3d' }, null]);
  assert.ok(f.calls[0][4].signal instanceof AbortSignal);
  assert.match(content(f.control.summary), /1 recorded numerical passes; 2 unresolved/);
});
test('selected generated identity opens through the existing catalog loader and retains separate bindings', async () => {
  const f = fixture();
  await f.control.load();
  assert.equal(f.control.select.value, 'dual3:U13');
  assert.match(content(f.control.detail), /coordinatesSha256/);
  assert.match(content(f.control.detail), /incidenceSha256/);
  assert.match(content(f.control.detail), /not a supplied source/);
  await f.control.source.onclick();
  await f.control.generated.onclick();
  assert.deepEqual(f.opened, [
    { key: 'antiprism-u13', name: 'Dual of U13' },
    { key: 'generated-dual-u13', name: 'Dual of U13 (generated)' },
  ]);
});
test('singular duals keep source access and explicit reasons without opening a finite substitute', async () => {
  const f = fixture();
  await f.control.load();
  f.control.select.value = 'dual3:U3';
  f.control.select.onchange();
  assert.equal(f.control.generated.disabled, true);
  assert.equal(f.control.source.disabled, false);
  assert.equal(f.control.verify.disabled, false);
  await f.control.generated.onclick();
  assert.equal(f.opened.length, 0);
  assert.match(content(f.control.detail), /singularity/);
});
test('missing fissary geometry keeps hypotheses visible and disables geometry actions', async () => {
  const f = fixture();
  await f.control.load();
  f.control.select.value = 'fissary:affic';
  f.control.select.onchange();
  assert.match(content(f.control.detail), /"chirality":"unresolved"/);
  assert.equal(f.control.generated.disabled, true);
  assert.equal(f.control.source.disabled, true);
  assert.equal(f.control.verify.disabled, true);
  await f.control.source.onclick();
  await f.control.recheck();
  assert.equal(f.opened.length, 0);
  assert.equal(f.calls.length, 1);
});
test('named regiment keeps related-model navigation common and discloses the comparison scale', async () => {
  const d = data();
  d.entries = [
    {
      ...d.entries[0],
      kind: 'regiment',
      otherKey: 'cross4',
      otherName: '16-cell',
      comparisonScaleDefinition: '1/sqrt(2)',
    },
  ];
  const f = fixture(async () => d);
  await f.control.load();
  assert.equal(f.control.related.disabled, false);
  assert.match(content(f.control.detail), /1\/sqrt\(2\)/);
  await f.control.related.onclick();
  assert.deepEqual(f.opened, [{ key: 'cross4', name: '16-cell' }]);
});
test('current verification is distinct from recorded evidence and never promotes release qualification', async () => {
  const f = fixture(async (_op, params) =>
    params.verify
      ? {
          entry: { ...data().entries[0], status: 'numerical-pass' },
          verification: { status: 'numerical-pass', certified: false, maximumPolarityResidual: 1e-14 },
        }
      : data()
  );
  await f.control.load();
  await f.control.recheck();
  assert.deepEqual(f.calls[1][1], { tranche: '3d', id: 'dual3:U13', verify: true });
  assert.match(content(f.control.detail), /maximumPolarityResidual/);
  assert.match(f.control.status.textContent, /Current check: numerical-pass/);
  assert.match(f.control.status.textContent, /No release qualification/);
});
test('failed current source verification revokes the generated-model action', async () => {
  const f = fixture(async (_op, p) =>
    p.verify
      ? {
          entry: { ...data().entries[0], status: 'unresolved' },
          verification: { status: 'unresolved', reason: 'source geometry changed' },
        }
      : data()
  );
  await f.control.load();
  await f.control.recheck();
  assert.equal(f.control.generated.disabled, true);
  await f.control.generated.onclick();
  assert.equal(f.opened.length, 0);
  assert.match(f.control.status.textContent, /geometry changed/);
});
test('stale provider pins disable source and generated actions with a clear regeneration message', async () => {
  const f = fixture(async () => ({ ...data(), sourcePinsCurrent: false }));
  await f.control.load();
  assert.equal(f.control.generated.disabled, true);
  assert.equal(f.control.source.disabled, true);
  assert.equal(f.control.verify.disabled, true);
  assert.match(f.control.status.textContent, /Provider metadata changed/);
  await f.control.source.onclick();
  assert.equal(f.opened.length, 0);
});
test('selection changes abort held verification and discard late evidence', async () => {
  const gate = deferred(),
    f = fixture(async (_op, p) => (p.verify ? gate.promise : data()));
  await f.control.load();
  const held = f.control.recheck();
  f.control.select.value = 'fissary:affic';
  f.control.select.onchange();
  gate.resolve({ entry: { status: 'numerical-pass' }, verification: { status: 'numerical-pass' } });
  await held;
  assert.equal(f.calls[1][4].signal.aborted, true);
  assert.equal(f.control.selected().id, 'fissary:affic');
  assert.doesNotMatch(content(f.control.detail), /classification-verification/);
  assert.equal(f.control.source.disabled, true);
});
test('tranche changes and global cancellation discard stale lists and unlock controls', async () => {
  const first = deferred(),
    second = deferred();
  let n = 0;
  const f = fixture(() => (++n === 1 ? first.promise : second.promise));
  const held = f.control.load();
  f.control.tranche.value = '4d';
  const latest = f.control.load();
  second.resolve({ ...data(), tranche: '4d', label: '4D identities' });
  await latest;
  first.resolve(data());
  await held;
  assert.equal(f.calls[0][4].signal.aborted, true);
  assert.equal(f.control.data.tranche, '4d');
  f.control.cancel();
  assert.equal(f.control.root.attributes['aria-busy'], 'false');
});
test('native failures show a local retryable status', async () => {
  let fail = true;
  const f = fixture(async () => {
    if (fail) throw Error('provider missing');
    return data();
  });
  await assert.rejects(f.control.load(), /provider missing/);
  assert.match(f.control.status.textContent, /Classification review failed/);
  fail = false;
  await f.control.load();
  assert.equal(f.control.generated.disabled, false);
});
test('native JSON-lines qualification is allowlisted, reusable and mounted through catalog history patterns', () => {
  const { REUSABLE_OPERATIONS } = require('../desktop/engine-pool.cjs');
  assert.ok(REUSABLE_OPERATIONS.has('classification-qualification'));
  const response = spawnSync('python', ['-B', '-m', 'engine.server'], {
    cwd: new URL('..', import.meta.url),
    windowsHide: true,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 4 * 1024 * 1024,
    input:
      JSON.stringify({
        op: 'classification-qualification',
        id: 1,
        params: { tranche: '4d', id: 'regiment:koho-cross4', verify: true },
      }) + '\n',
  });
  assert.equal(response.status, 0, response.stderr);
  const result = JSON.parse(response.stdout.trim());
  assert.equal(result.ok, true, result.error);
  assert.equal(result.result.verification.status, 'numerical-pass');
  assert.equal(result.result.verification.comparison.sameFaceArrangement, false);
  const app = readAppSource();
  matchSource(
    app,
    /new ClassificationQualificationControls\(\{document,before:\$\('(?:ctx\.)?catalog'\),run,guard,open:entry=>(?:ctx\.)?catalogLoader.open\(entry\)\}\)/
  );
  matchSource(app, /classificationQualification.cancel\(\)/);
});
