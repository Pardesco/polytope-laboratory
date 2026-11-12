import { readAppSource } from './helpers/app-source.mjs';
import { matchSource } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { UDualObstructionsControls } from '../ui/u-dual-obstructions-controls.mjs';
const require = createRequire(import.meta.url);
class Node {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.value = '';
    this.attributes = {};
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  before(node) {
    this.beforeNode = node;
  }
  setAttribute(k, v) {
    this.attributes[k] = v;
  }
}
const provider = JSON.parse(
  readFileSync(new URL('../engine/catalog_data/u_dual_obstructions/manifest.json', import.meta.url))
);
const data = () => ({
  sourcePinsCurrent: true,
  finiteModelsAdded: 0,
  entries: provider.entries.map((row) => ({ ...structuredClone(row), status: 'recorded-unchecked' })),
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
  const control = new UDualObstructionsControls({
    document: { createElement: (tag) => new Node(tag) },
    before,
    run: async (...args) => {
      calls.push(args);
      return read(...args);
    },
    open: (entry) => opened.push(entry),
  });
  return { control, before, calls, opened };
}

test('ordinary Library panel is collapsed, lazy and outside Expert mode', async () => {
  const f = fixture();
  assert.equal(f.before.beforeNode.id, 'library-u-dual-obstructions');
  assert.equal(f.calls.length, 0);
  assert.equal(Boolean(f.control.root.open), false);
  assert.equal(f.control.root.attributes['data-expert'], undefined);
  assert.equal(f.control.select.attributes['aria-label'], 'Named U-dual');
  assert.equal(f.control.source.disabled, true);
  f.control.root.open = true;
  await f.control.root.ontoggle();
  await f.control.root.ontoggle();
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].slice(0, 3), ['u-dual-obstructions', {}, null]);
  assert.ok(f.calls[0][4].signal instanceof AbortSignal);
  assert.match(f.control.summary.textContent, /13 named source reports; 0 finite models added/);
});

test('all thirteen named sources stay accessible through the existing catalog document loader', async () => {
  const f = fixture();
  await f.control.load();
  for (const row of provider.entries) {
    f.control.select.value = row.id;
    f.control.select.onchange();
    await f.control.source.onclick();
    assert.deepEqual(f.opened.at(-1), { key: row.sourceKey, name: row.sourceName });
    assert.match(content(f.control.detail), /coordinatesSha256/);
    assert.match(content(f.control.detail), /incidenceSha256/);
  }
  assert.equal(f.opened.length, 13);
  assert.equal(f.control.generated, undefined);
});

test('U75 shows both obstruction classes and zero-based source face IDs', async () => {
  const f = fixture();
  await f.control.load();
  f.control.select.value = 'dual3:U75';
  f.control.select.onchange();
  const text = content(f.control.detail);
  assert.match(text, /60 source face planes/);
  assert.match(text, /62 pairs/);
  assert.match(text, /Face IDs start at 0/);
  assert.match(text, /genus 29/);
  assert.match(text, /source vertex mean and radius 1/);
});

test('current verification exposes plane witnesses separately from recorded evidence', async () => {
  const f = fixture(async (_op, p) =>
    p.verify
      ? {
          entry: { ...data().entries[0], status: 'obstruction-confirmed' },
          verification: { ...data().entries[0].receipt },
          witnesses: { planes: [{ sourceFace: 8, kind: 'ideal-numerical' }] },
        }
      : data()
  );
  await f.control.load();
  await f.control.recheck();
  assert.deepEqual(f.calls[1][1], { id: 'dual3:U3', verify: true });
  assert.match(content(f.control.detail), /"sourceFace": 8/);
  assert.match(f.control.status.textContent, /Current check: obstruction-confirmed/);
  assert.match(f.control.status.textContent, /no finite model or release qualification/);
});

test('stale provider disables opening and checking but keeps recorded witnesses reviewable', async () => {
  const f = fixture(async () => ({ ...data(), sourcePinsCurrent: false }));
  await f.control.load();
  assert.equal(f.control.source.disabled, true);
  assert.equal(f.control.verify.disabled, true);
  assert.match(f.control.status.textContent, /pins changed or are missing/);
  assert.match(content(f.control.detail), /plane/);
  await f.control.source.onclick();
  await f.control.recheck();
  assert.equal(f.opened.length, 0);
  assert.equal(f.calls.length, 1);
});

test('changed source binding revokes opening without claiming a current obstruction', async () => {
  const f = fixture(async (_op, p) =>
    p.verify
      ? {
          entry: { ...data().entries[0], status: 'unresolved' },
          verification: { status: 'unresolved', reason: 'source binding changed' },
        }
      : data()
  );
  await f.control.load();
  await f.control.recheck();
  assert.equal(f.control.source.disabled, true);
  await f.control.source.onclick();
  assert.equal(f.opened.length, 0);
  assert.match(f.control.status.textContent, /unresolved.*binding changed/);
});

test('changing selection aborts verification and discards stale plane witnesses', async () => {
  const gate = deferred(),
    f = fixture(async (_op, p) => (p.verify ? gate.promise : data()));
  await f.control.load();
  const held = f.control.recheck();
  f.control.select.value = 'dual3:U75';
  f.control.select.onchange();
  gate.resolve({
    entry: { status: 'obstruction-confirmed' },
    verification: { status: 'obstruction-confirmed', reason: 'stale marker' },
  });
  await held;
  assert.equal(f.calls[1][4].signal.aborted, true);
  assert.equal(f.control.selected().id, 'dual3:U75');
  assert.doesNotMatch(content(f.control.detail), /stale marker/);
  assert.match(content(f.control.detail), /62 pairs/);
});

test('latest refresh wins and global cancellation keeps a retry available', async () => {
  const first = deferred(),
    second = deferred();
  let n = 0;
  const f = fixture(() => (++n === 1 ? first.promise : second.promise));
  const held = f.control.load(),
    latest = f.control.load();
  second.resolve(data());
  await latest;
  first.resolve({ ...data(), entries: [] });
  await held;
  assert.equal(f.control.data.entries.length, 13);
  assert.equal(f.calls[0][4].signal.aborted, true);
  f.control.cancel();
  assert.equal(f.control.root.attributes['aria-busy'], 'false');
});

test('native errors remain local, unlock controls and allow refresh', async () => {
  let fail = true;
  const f = fixture(async () => {
    if (fail) throw Error('missing provider');
    return data();
  });
  await assert.rejects(f.control.load(), /missing provider/);
  assert.match(f.control.status.textContent, /Dual diagnostics failed/);
  assert.equal(f.control.root.attributes['aria-busy'], 'false');
  fail = false;
  await f.control.load();
  assert.equal(f.control.verify.disabled, false);
});

test('native JSON-lines diagnostics are allowlisted, reusable and mounted with cancellation', () => {
  const { REUSABLE_OPERATIONS } = require('../desktop/engine-pool.cjs');
  assert.ok(REUSABLE_OPERATIONS.has('u-dual-obstructions'));
  const response = spawnSync('python', ['-B', '-m', 'engine.server'], {
    cwd: new URL('..', import.meta.url),
    windowsHide: true,
    encoding: 'utf8',
    timeout: 60000,
    input: JSON.stringify({ op: 'u-dual-obstructions', id: 17, params: { id: 'dual3:U75', verify: true } }) + '\n',
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(response.status, 0, response.stderr);
  const result = JSON.parse(response.stdout.trim());
  assert.equal(result.ok, true, result.error);
  assert.equal(result.result.verification.coincidentPlaneGroups.length, 62);
  assert.equal(result.result.witnesses.planes.length, 124);
  const app = readAppSource();
  matchSource(
    app,
    /new UDualObstructionsControls\(\{document,before:\$\('(?:ctx\.)?catalog'\),run,guard,open:entry=>(?:ctx\.)?catalogLoader.open\(entry\)\}\)/
  );
  matchSource(app, /uDualObstructions.cancel\(\)/);
  assert.match(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    /tests\/u-dual-obstructions-controls.test.mjs/
  );
});
