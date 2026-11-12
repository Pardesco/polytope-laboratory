// Real source-worker startup/steady-state comparison; never launches Electron.
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { EnginePool } = require('../desktop/engine-pool.cjs');
const root = path.resolve(__dirname, '..'),
  python = process.env.POLYTOPE_PYTHON || 'python';
const env = {
  ...process.env,
  PYTHONUTF8: '1',
  PYTHONIOENCODING: 'utf-8',
  OPENBLAS_NUM_THREADS: '1',
  OMP_NUM_THREADS: '1',
};
const output = fs.mkdtempSync(path.join(root, 'artifacts', 'inspection-protocol-'));
const hash = (data) => createHash('sha256').update(data).digest('hex');
const result = {
  passed: false,
  scope:
    'Python JSON-lines requests through EnginePool; source workers, no Electron IPC/rendering/packaged qualification',
  platform: os.platform() + ' ' + os.release(),
  samples: [],
  inputs: {},
};
let sequence = 0,
  spawnCount = 0;
function pool() {
  return new EnginePool({
    maxWorkers: 1,
    spawnWorker: () => {
      spawnCount++;
      return spawn(python, ['-B', '-u', path.join(root, 'engine', 'server.py')], {
        cwd: root,
        windowsHide: true,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    },
  });
}
async function invoke(worker, request) {
  const start = performance.now();
  try {
    return { ok: true, value: await worker.run(request, 'inspection-' + ++sequence), ms: performance.now() - start };
  } catch (error) {
    return { ok: false, error: error.message, ms: performance.now() - start };
  }
}
function summary(values) {
  const sorted = [...values].sort((a, b) => a - b),
    q = (p) => sorted[Math.floor((sorted.length - 1) * p)];
  return { medianMs: q(0.5), iqrMs: q(0.75) - q(0.25) };
}
(async () => {
  const payload = execFileSync(
    python,
    [
      '-B',
      '-c',
      [
        'import json,sys',
        'from copy import deepcopy',
        'from engine.generators import regular',
        'from engine.element_annotations import new_document,set_text',
        "m=regular('cube')",
        "d=set_text(new_document(m),m,'face',0,'Source face')",
        "changed=deepcopy(m);changed['vertices'][0][0]+=.25",
        "requests=[{'op':'measure','model':m,'params':{'kind':'distance','indices':[0,1]}},{'op':'entity-info','model':m,'params':{'entity':{'kind':'face','index':0}}},{'op':'element-content-describe','model':m,'params':{'document':d}},{'op':'measure','model':changed,'params':{'kind':'distance','indices':[0,1]}},{'op':'measure','model':m,'params':{'kind':'distance','indices':[0,9999]}}]",
        "print(json.dumps({'requests':requests,'python':sys.version}))",
      ].join('\n'),
    ],
    { cwd: root, windowsHide: true, env, encoding: 'utf8' }
  );
  const { requests, python: version } = JSON.parse(payload);
  result.python = version;
  result.inputs.requestSha256 = hash(payload);
  for (const file of [
    'desktop/engine-pool.cjs',
    'engine/server.py',
    'engine/operations.py',
    'engine/measurements.py',
    'engine/element_content_workflow.py',
    'scripts/profile-inspection-protocol.cjs',
  ])
    result.inputs[file] = hash(fs.readFileSync(path.join(root, file)));
  const warm = pool();
  try {
    const priming = await invoke(warm, { op: 'expression', params: { expression: '1' } });
    assert.equal(priming.ok, true);
    result.primingMs = priming.ms;
    const expected = new Map();
    for (let run = 0; run < 5; run++)
      for (const [index, request] of requests.entries()) {
        for (const mode of run % 2 ? ['warm', 'cold'] : ['cold', 'warm']) {
          const worker = mode === 'warm' ? warm : pool();
          let observation;
          try {
            observation = await invoke(worker, request);
          } finally {
            if (mode === 'cold') worker.dispose();
          }
          const { ms, ...report } = observation;
          if (!expected.has(index)) expected.set(index, report);
          else assert.deepEqual(report, expected.get(index));
          assert.equal(report.ok, index !== 4);
          result.samples.push({ run, index, op: request.op, mode, ms, ok: report.ok });
        }
      }
    assert.notDeepEqual(expected.get(0), expected.get(3), 'edited coordinates must change the measured result');
    result.comparisons = requests.map((request, index) => ({
      index,
      op: request.op,
      cold: summary(result.samples.filter((s) => s.index === index && s.mode === 'cold').map((s) => s.ms)),
      warm: summary(result.samples.filter((s) => s.index === index && s.mode === 'warm').map((s) => s.ms)),
    }));
    result.passed = true;
  } finally {
    warm.dispose();
  }
})()
  .catch((error) => {
    result.error = error.stack;
    process.exitCode = 1;
  })
  .finally(() => {
    result.spawnCount = spawnCount;
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(
      JSON.stringify(
        { output, passed: result.passed, spawnCount, comparisons: result.comparisons, error: result.error },
        null,
        2
      )
    );
  });
