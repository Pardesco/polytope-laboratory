import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotDisplayValue, matchesDisplayValue } from '../ui/element-content-display-owner.mjs';

test('snapshots detach nested mutable records and arrays while retaining immutable strings', () => {
  const image = 'A'.repeat(4 * 1024 * 1024),
    value = { entries: [{ placement: [0, 1], markup: 'Caption' }], assets: { png: { base64: image } } };
  const snapshot = snapshotDisplayValue(value);
  assert.equal(matchesDisplayValue(value, snapshot), true);
  assert.notStrictEqual(snapshot.entries, value.entries);
  assert.notStrictEqual(snapshot.assets.png, value.assets.png);
  assert.strictEqual(snapshot.assets.png.base64, image);
  value.entries[0].placement[1] = 2;
  assert.equal(matchesDisplayValue(value, snapshot), false);
  assert.equal(snapshot.entries[0].placement[1], 1);
});

for (const [name, change] of [
  [
    'nested value',
    (v) => {
      v.entries[0].markup = 'Edited';
    },
  ],
  [
    'added property',
    (v) => {
      v.assets.png.width = 2;
    },
  ],
  [
    'removed property',
    (v) => {
      delete v.assets.png.base64;
    },
  ],
  [
    'array order',
    (v) => {
      v.entries.reverse();
    },
  ],
  [
    'array length',
    (v) => {
      v.entries.length = 1;
    },
  ],
  [
    'type',
    (v) => {
      v.enabled = 1;
    },
  ],
  [
    'PNG bytes',
    (v) => {
      v.assets.png.base64 = 'BBBB';
    },
  ],
  [
    'property order',
    (v) => {
      const first = v.entries;
      delete v.entries;
      v.entries = first;
    },
  ],
])
  test(`snapshot comparison detects ${name} changes in place`, () => {
    const value = {
      entries: [{ markup: 'First' }, { markup: 'Second' }],
      assets: { png: { base64: 'AAAA' } },
      enabled: true,
    };
    const snapshot = snapshotDisplayValue(value);
    change(value);
    assert.equal(matchesDisplayValue(value, snapshot), false);
  });

test('absent, null, empty documents, sparse arrays and prototype-like keys remain distinct', () => {
  for (const value of [
    undefined,
    null,
    { entries: [], assets: {} },
    [undefined],
    new Array(2),
    JSON.parse('{"__proto__":{"markup":"Safe"},"constructor":0}'),
  ]) {
    const snapshot = snapshotDisplayValue(value);
    assert.equal(matchesDisplayValue(value, snapshot), true);
  }
  assert.equal(matchesDisplayValue(null, snapshotDisplayValue(undefined)), false);
  assert.equal(matchesDisplayValue([undefined, undefined], snapshotDisplayValue(new Array(2))), false);
  assert.equal(matchesDisplayValue({}, snapshotDisplayValue({ absent: undefined })), false);
});

test('unsupported or executable values conservatively refuse pose reuse without invoking accessors', () => {
  const cycle = {};
  cycle.self = cycle;
  let calls = 0;
  const getter = {
      get markup() {
        calls++;
        return 'Caption';
      },
    },
    custom = {
      toJSON() {
        calls++;
        return {};
      },
    };
  for (const value of [cycle, getter, custom, new Date(), new Map(), NaN, Infinity, 1n, () => {}, Symbol('x')]) {
    const snapshot = snapshotDisplayValue(value);
    assert.equal(matchesDisplayValue(value, snapshot), false);
  }
  assert.equal(calls, 0);
});
