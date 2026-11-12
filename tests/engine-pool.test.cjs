const test = require('node:test'),
  assert = require('node:assert/strict'),
  { EventEmitter } = require('node:events');
const { EnginePool } = require('../desktop/engine-pool.cjs');
function harness(options = {}) {
  const processes = [],
    jobs = new Map();
  const pool = new EnginePool({
    jobs,
    idleTimeoutMs: 10000,
    ...options,
    spawnWorker: () => {
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.stdin = new EventEmitter();
      proc.stdout.setEncoding = proc.stderr.setEncoding = () => {};
      proc.sent = [];
      proc.killed = false;
      proc.stdin.write = (text) => proc.sent.push(JSON.parse(text));
      proc.kill = () => {
        proc.killed = true;
      };
      proc.reply = (value, { id = proc.sent.at(-1).id, ok = true } = {}) =>
        proc.stdout.emit('data', JSON.stringify({ id, ok, ...(ok ? { result: value } : { error: value }) }) + '\n');
      processes.push(proc);
      return proc;
    },
  });
  return { pool, jobs, processes };
}
test('frequent calculations reuse one worker and each result belongs to its request', async () => {
  const h = harness();
  try {
    let request = h.pool.run({ op: 'dual' }, 'first');
    h.processes[0].reply({ vertices: 14 });
    assert.deepEqual(await request, { vertices: 14 });
    request = h.pool.run({ op: 'evaluate-dual-morph' }, 'second');
    assert.equal(h.processes.length, 1);
    h.processes[0].reply({ ratio: 0.5 });
    assert.deepEqual(await request, { ratio: 0.5 });
    assert.equal(h.jobs.size, 0);
  } finally {
    h.pool.dispose();
  }
});

test('diagram rebuilds and faceting searches reuse a warm read-only worker', async () => {
  const h = harness();
  try {
    for (const [i, op] of ['facet-candidates', 'facet-diagram', 'facet-search', 'facet-diagram'].entries()) {
      const job = h.pool.run({ op, params: { i } }, 'facet-' + i);
      assert.equal(h.processes.length, 1);
      h.processes[0].reply({ i });
      assert.deepEqual(await job, { i });
    }
  } finally {
    h.pool.dispose();
  }
});

test('face surgery previews reuse imports while supplying independent source/color requests', async () => {
  const h = harness();
  try {
    for (const [i, policy] of ['base', 'piece', 'none'].entries()) {
      const request = { op: 'face-surgery-preview', model: { id: 'source-' + i }, params: { side_colors: policy } };
      const job = h.pool.run(request, 'surgery-' + i);
      assert.equal(h.processes.length, 1);
      assert.deepEqual(h.processes[0].sent.at(-1).params, request.params);
      h.processes[0].reply({ policy });
      assert.deepEqual(await job, { policy });
    }
  } finally {
    h.pool.dispose();
  }
});
test('inspection, derived entity and annotation queries share warm imports with independent full requests', async () => {
  const h = harness();
  try {
    const operations = [
      'vertex-figure-candidates',
      'measure',
      'entity-measure',
      'entity-info',
      'dihedral',
      'align-section',
      'entity-orientation',
      'cell-facing',
      'vertex-figure',
      'cell',
      'element-content-describe',
      'stellation-cell-graph',
      'stellation-diagram-data',
      'stellation-cavity-analysis',
      'stellation-supported-enumerate',
      'arrangement-diagram',
      'stellation-enumerate',
      'arrangement',
      'stellation-union',
      'geometry-fit-deviation',
    ];
    for (const [index, op] of operations.entries()) {
      const model = { id: 'same-id', fingerprint: 'same-claim', vertices: [[index, 0, 0]] },
        params = { index };
      const promise = h.pool.run({ op, model, params }, String(index));
      assert.equal(h.processes.length, 1);
      assert.deepEqual(h.processes[0].sent.at(-1), { op, model, params, id: String(index) });
      h.processes[0].reply({ owner: index });
      assert.deepEqual(await promise, { owner: index });
    }
  } finally {
    h.pool.dispose();
  }
});
test('section requests reuse bounded workers across distinct planes and a native refusal', async () => {
  const h = harness();
  try {
    let job = h.pool.run({ op: 'section', params: { offset: 0 } }, 'plane-zero');
    h.processes[0].reply({ status: 'full-dimensional' });
    assert.equal((await job).status, 'full-dimensional');
    job = h.pool.run({ op: 'section', params: { normal: [0, 0, 0, 0] } }, 'bad-normal');
    assert.equal(h.processes.length, 1);
    h.processes[0].reply('Nonzero normal required', { ok: false });
    await assert.rejects(job, /Nonzero/);
    job = h.pool.run({ op: 'section', params: { offset: 100 } }, 'empty-plane');
    assert.equal(h.processes.length, 1);
    h.processes[0].reply({ status: 'empty', model: null });
    assert.equal((await job).status, 'empty');
    assert.equal(h.jobs.size, 0);
  } finally {
    h.pool.dispose();
  }
});
test('file operations stay isolated and do not reuse a pure calculation worker', async () => {
  const h = harness({ maxWorkers: 1 });
  let request = h.pool.run({ op: 'expression' }, 'warm');
  h.processes[0].reply(2);
  await request;
  request = h.pool.run({ op: 'save' }, 'save');
  assert.equal(h.processes[0].killed, true);
  assert.equal(h.processes.length, 2);
  h.processes[1].reply({ path: 'project' });
  await request;
  assert.equal(h.processes[1].killed, true);
  assert.equal(h.pool.workers.size, 0);
});
test('cancellation kills only its active worker and cannot publish a late frame', async () => {
  const h = harness();
  try {
    const canceled = h.pool.run({ op: 'evaluate-dual-morph' }, 'cancel'),
      other = h.pool.run({ op: 'dual' }, 'other');
    assert.equal(h.pool.cancel('cancel'), true);
    await assert.rejects(canceled, /cancelled/);
    h.processes[0].reply('late');
    h.processes[1].reply('good');
    assert.equal(await other, 'good');
    assert.equal(h.processes[1].killed, false);
    const next = h.pool.run({ op: 'analyze' }, 'next');
    h.processes[1].reply('new');
    assert.equal(await next, 'new');
    assert.equal(h.processes.length, 2);
  } finally {
    h.pool.dispose();
  }
});
test('wrong response IDs and additional frames retire the worker', async () => {
  for (const payload of ['wrong-id', 'extra-frame']) {
    const h = harness();
    const p = h.pool.run({ op: 'dual' }, 'wanted');
    const text =
      JSON.stringify({ id: payload === 'wrong-id' ? 'other' : 'wanted', ok: true, result: 1 }) +
      '\n' +
      (payload === 'extra-frame' ? '{}\n' : '');
    h.processes[0].stdout.emit('data', text);
    await assert.rejects(p, /Invalid engine response/);
    assert.equal(h.processes[0].killed, true);
    assert.equal(h.jobs.size, 0);
  }
});
test('split Unicode response packets are accumulated until a complete line', async () => {
  const h = harness();
  try {
    const p = h.pool.run({ op: 'analyze' }, 'unicode'),
      proc = h.processes[0];
    proc.stdout.emit('data', '{"id":"unicode","ok":true,');
    proc.stdout.emit('data', '"result":"φ"}\n');
    assert.equal(await p, 'φ');
  } finally {
    h.pool.dispose();
  }
});
test('a normal geometry refusal leaves a healthy worker reusable', async () => {
  const h = harness();
  try {
    let p = h.pool.run({ op: 'dual' }, 'refused');
    h.processes[0].reply('Unsupported geometry', { ok: false });
    await assert.rejects(p, /Unsupported geometry/);
    p = h.pool.run({ op: 'expression' }, 'valid');
    h.processes[0].reply(3);
    assert.equal(await p, 3);
    assert.equal(h.processes.length, 1);
  } finally {
    h.pool.dispose();
  }
});
test('worker exit and spawn failure reject without consuming permanent capacity', async () => {
  const h = harness();
  let p = h.pool.run({ op: 'dual' }, 'exit');
  h.processes[0].emit('exit', 1);
  await assert.rejects(p, /exited/);
  assert.equal(h.pool.workers.size, 0);
  p = h.pool.run({ op: 'dual' }, 'restart');
  h.processes[1].reply(1);
  await p;
  h.pool.dispose();
  const failed = new EnginePool({
    spawnWorker: () => {
      throw Error('missing Python');
    },
  });
  await assert.rejects(failed.run({ op: 'dual' }, 'fail'), /missing Python/);
  assert.equal(failed.jobs.size, 0);
});
test('duplicate IDs and worker capacity are bounded', async () => {
  const h = harness({ maxWorkers: 1 });
  const p = h.pool.run({ op: 'dual' }, 'active');
  await assert.rejects(h.pool.run({ op: 'dual' }, 'active'), /Duplicate/);
  await assert.rejects(h.pool.run({ op: 'dual' }, 'another'), /busy/);
  h.processes[0].reply(1);
  await p;
  h.pool.dispose();
});
test('timeouts, output limits and shutdown kill active processes', async () => {
  const timed = harness({ timeoutMs: 5 });
  await assert.rejects(timed.pool.run({ op: 'dual' }, 'slow'), /resource limit/);
  assert.equal(timed.processes[0].killed, true);
  const bounded = harness({ maxBytes: 80 }),
    p = bounded.pool.run({ op: 'dual' }, 'big');
  bounded.processes[0].stdout.emit('data', 'φ'.repeat(41));
  await assert.rejects(p, /output exceeds/);
  assert.equal(bounded.processes[0].killed, true);
  const closed = harness(),
    active = closed.pool.run({ op: 'dual' }, 'close');
  closed.pool.dispose();
  await assert.rejects(active, /shutting down/);
  await assert.rejects(closed.pool.run({ op: 'dual' }, 'late'), /shutting down/);
  assert.equal(closed.jobs.size, 0);
});
