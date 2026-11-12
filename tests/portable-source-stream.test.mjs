import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { portableContentSource, verifyContentDescriptor, pythonFloatHex } from '../ui/element-content-source.mjs';

const root = fileURLToPath(new URL('../', import.meta.url)),
  encoder = new TextEncoder();
const fixture = JSON.parse(
  await readFile(new URL('./fixtures/element-content-native-fixture.json', import.meta.url), 'utf8')
);

test('streamed portable bytes agree with native Python for varied complete models', () => {
  let seed = 0x20261025;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const atoms = [
    null,
    true,
    false,
    -0,
    1,
    1.25,
    1e-9,
    1e21,
    Number.MIN_VALUE,
    Number.MAX_VALUE,
    '',
    '\t\n"\\',
    'é漢😀\u2028',
  ];
  function value(depth = 0) {
    if (depth >= 4 || next() % 3 === 0) return atoms[next() % atoms.length];
    const children = Array.from({ length: next() % 5 }, () => value(depth + 1));
    if (next() % 2) return children;
    const record = Object.create(null);
    for (let i = 0; i < children.length; i++)
      Object.defineProperty(record, ['2', '10', '__proto__', '😀', '\ue000'][i], {
        value: children[i],
        enumerable: true,
      });
    return record;
  }
  const models = Array.from({ length: 96 }, () => {
    const source = structuredClone(fixture.source);
    source.metadata.streamProbe = value();
    return source;
  });
  const expected = JSON.parse(
    execFileSync(
      process.env.POLYTOPE_PYTHON || 'python',
      [
        '-B',
        '-c',
        "import json,sys;from engine.element_annotations import _source;print(json.dumps([_source(m).decode('utf-8') for m in json.load(sys.stdin)],ensure_ascii=True))",
      ],
      {
        cwd: root,
        input: JSON.stringify(models),
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, PYTHONUTF8: '1', OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
      }
    )
  );
  for (let i = 0; i < models.length; i++)
    assert.equal(portableContentSource(models[i]), expected[i], `Complete model ${i}`);
});

for (const text of ['ASCII\x00\t"\\', '\u007f\u0080\u07ff\u0800漢😀\u2028', '😀'.repeat(9000), 'é'.repeat(17000)])
  test(`exact UTF-8 byte/character caps survive streaming (${text.length} code units)`, () => {
    const model = { '😀': text },
      portable = portableContentSource(model),
      jsonBytes = encoder.encode(JSON.stringify(model)).length,
      portableBytes = encoder.encode(portable).length,
      chars = 2 + text.length;
    assert.equal(
      portableContentSource(model, { maxJsonBytes: jsonBytes, maxPortableBytes: portableBytes, maxChars: chars }),
      portable
    );
    assert.throws(() => portableContentSource(model, { maxJsonBytes: jsonBytes - 1 }), /Original source exceeds/);
    assert.throws(
      () => portableContentSource(model, { maxPortableBytes: portableBytes - 1 }),
      /Portable encoding exceeds/
    );
    assert.throws(() => portableContentSource(model, { maxChars: chars - 1 }), /Unicode bounds/);
  });

test('byte rejection stops before visiting a later source branch', () => {
  const model = { a: 'x'.repeat(1000), z: {} };
  let reads = 0;
  Object.defineProperty(model.z, 'get', {
    enumerable: true,
    get() {
      reads++;
      throw Error('Must not run');
    },
  });
  assert.throws(() => portableContentSource(model, { maxPortableBytes: 100 }), /Portable encoding exceeds/);
  assert.equal(reads, 0);
});

test('node/depth limits keep their exact eligibility, with impossible wide arrays refused before enumeration', () => {
  const allowed = new Array(249999).fill(null);
  assert.ok(portableContentSource(allowed).startsWith('["array",['));
  let enumerations = 0;
  const impossible = new Proxy(new Array(250000), {
    ownKeys() {
      enumerations++;
      throw Error('Enumeration must not run');
    },
  });
  assert.throws(() => portableContentSource(impossible), /work bound/);
  assert.equal(enumerations, 0);
  let depth64 = 0;
  for (let i = 0; i < 64; i++) depth64 = [depth64];
  assert.ok(portableContentSource(depth64));
  assert.throws(() => portableContentSource([depth64]), /work bound/);
});

for (const make of [
  () => {
    const a = new Array(2);
    a[1] = 1;
    a.extra = 2;
    return a;
  },
  () => Object.assign(new Array(1), { extra: 1 }),
  () => Object.assign([1], { extra: 2 }),
  () => {
    const a = [1];
    Object.defineProperty(a, '0', { enumerable: false });
    a.extra = 2;
    return a;
  },
])
  test('holes and custom enumerable properties cannot masquerade as dense arrays', () => {
    assert.throws(() => portableContentSource(make()), /dense data/);
  });

test('data descriptors reject hidden/visible accessors without invoking them', () => {
  for (const array of [false, true])
    for (const enumerable of [false, true]) {
      let reads = 0;
      const value = array ? [1] : { a: 1 };
      Object.defineProperty(value, array ? '0' : 'hidden', {
        enumerable,
        get() {
          reads++;
          return 1;
        },
      });
      assert.throws(() => portableContentSource(value), array ? /dense data/ : /ordinary data/);
      assert.equal(reads, 0);
    }
});

test('aliases remain data, while cycles, invalid Unicode and unsupported values are refused', () => {
  const shared = { value: [true, false, null, 1.5] },
    aliases = [shared, shared];
  assert.equal(portableContentSource(aliases), portableContentSource(structuredClone(aliases)));
  const cycle = [];
  cycle.push(cycle);
  for (const invalid of [
    cycle,
    '\ud800',
    '\udfff',
    { a: '\ud800' },
    undefined,
    1n,
    Symbol('x'),
    NaN,
    Infinity,
    -Infinity,
    new Date(),
    new Uint8Array([1]),
    { a: undefined },
    { a: () => 1 },
    { [Symbol('key')]: 1 },
  ])
    assert.throws(() => portableContentSource(invalid));
});

test('bounded per-call scalar spellings distinguish types, fractions and cache boundaries across mutations', () => {
  const values = [0, -0, 1, 2047, 2048, 2047.5, 2047.9999999999998, -1, '1', true, null];
  const source = { fingerprint: 'unchanged claim', values: [...values, ...values] };
  const first = portableContentSource(source),
    portable = JSON.parse(first),
    entry = portable[1].find(([key]) => key === 'values')[1][1];
  const expected = values.map((value) =>
    typeof value === 'number' ? ['number', pythonFloatHex(value)] : ['scalar', value]
  );
  assert.deepEqual(entry, [...expected, ...expected]);
  source.values[2] = 2;
  const changed = portableContentSource(source);
  assert.notEqual(changed, first);
  source.values[2] = 1;
  assert.equal(portableContentSource(source), first);
});

test('scalar spelling lookup never consumes an inherited array property', () => {
  const previous = Object.getOwnPropertyDescriptor(Array.prototype, '2047');
  try {
    Object.defineProperty(Array.prototype, '2047', {
      value: 'incorrect inherited spelling',
      writable: true,
      configurable: true,
    });
    assert.equal(portableContentSource([2047]), `["array",[["number","${pythonFloatHex(2047)}"]]]`);
  } finally {
    if (previous) Object.defineProperty(Array.prototype, '2047', previous);
    else delete Array.prototype[2047];
  }
});

test('full literal mutations still invalidate a native descriptor and its completed binding', async () => {
  const source = structuredClone(fixture.source),
    binding = await verifyContentDescriptor(source, fixture.descriptor);
  source.metadata.streamProbe = { nested: [1, 2, 3] };
  assert.throws(() => binding.check(), { name: 'AbortError' });
  await assert.rejects(verifyContentDescriptor(source, fixture.descriptor), /mismatch/);
  delete source.metadata.streamProbe;
  binding.check();
  source.vertices[0][0] += 0.001;
  assert.throws(() => binding.check(), { name: 'AbortError' });
});
