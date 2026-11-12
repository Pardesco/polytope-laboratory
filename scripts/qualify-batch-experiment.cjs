// Exercise the installed engine without Electron, Python, or the source working directory.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const EXPECTED = {
  tetrahedron: [4, 6, 4, 0],
  cube: [8, 12, 6, 0],
  '5-cell': [5, 10, 10, 5],
  tesseract: [16, 32, 24, 8],
};

function checkReport(report) {
  assert.equal(report.complete, true);
  assert.equal(report.successful, true);
  assert.deepEqual(report.totals, { pass: 4 });
  for (const row of report.models) {
    assert.deepEqual(
      ['vertices', 'edges', 'faces', 'cells'].map((k) => row.analysis.counts[k]),
      EXPECTED[row.id]
    );
    assert.equal(row.analysis.validation.passed, true);
    for (const key of ['sourceModelSha256', 'sourceRecordSha256']) assert.match(row[key], /^[a-f0-9]{64}$/);
  }
  const cube = report.models.find((r) => r.id === 'cube'),
    tess = report.models.find((r) => r.id === 'tesseract');
  assert.ok(Math.abs(cube.analysis.measure.content - 8) < 1e-10);
  assert.ok(Math.abs(tess.analysis.measure.content - 16) < 1e-10);
  assert.match(report.runtime.sourceSha256, /^[a-f0-9]{64}$/);
  assert.match(report.runtime.sourceFiles['engine/batch_experiment.py'], /^[a-f0-9]{64}$/);
  assert.ok(report.runtime.appVersion);
  assert.ok(report.runtime.numpy);
  assert.ok(report.runtime.scipy);
}

function compareReports(source, frozen) {
  checkReport(source);
  checkReport(frozen);
  for (const key of ['appVersion', 'sourceSha256', 'numpy', 'scipy'])
    assert.equal(source.runtime[key], frozen.runtime[key]);
  assert.deepEqual(
    source.models.map((r) => ({ id: r.id, model: r.sourceModelSha256, analysis: r.analysis })),
    frozen.models.map((r) => ({ id: r.id, model: r.sourceModelSha256, analysis: r.analysis }))
  );
}

function invoke(engine, args, { cwd, env, input = '' } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(engine, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '',
      stderr = '',
      bytes = 0;
    const timer = setTimeout(() => {
      child.kill();
      reject(Error('Qualification exceeded 180 seconds.'));
    }, 180000);
    const collect = (key) => (chunk) => {
      bytes += chunk.length;
      if (bytes > 4 * 1024 * 1024) {
        child.kill();
        reject(Error('Qualification output exceeds 4 MiB.'));
      }
      if (key === 'out') stdout += chunk;
      else stderr += chunk;
    };
    child.stdout.on('data', collect('out'));
    child.stderr.on('data', collect('err'));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function qualify(engine, output, sourceReport) {
  engine = path.resolve(engine);
  output = path.resolve(output);
  await fs.mkdir(output, { recursive: true });
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'polytope-batch-'));
  const env = {
    ...process.env,
    PATH: [
      path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'),
      process.env.SystemRoot || 'C:\\Windows',
    ].join(path.delimiter),
  };
  delete env.PYTHONHOME;
  delete env.PYTHONPATH;
  delete env.VIRTUAL_ENV;
  try {
    const sample = path.join(output, 'sample');
    let result = await invoke(engine, ['--cli', 'experiment', '--output', sample], { cwd, env });
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const report = JSON.parse(await fs.readFile(path.join(sample, 'report.json'), 'utf8'));
    checkReport(report);
    if (sourceReport) compareReports(JSON.parse(await fs.readFile(sourceReport, 'utf8')), report);
    assert.equal(report.runtime.frozen, true);
    assert.equal(
      report.runtime.executableSha256,
      crypto
        .createHash('sha256')
        .update(await fs.readFile(engine))
        .digest('hex')
    );
    const checkpoint = await fs.readFile(path.join(sample, 'checkpoint.jsonl'), 'utf8');
    result = await invoke(engine, ['--cli', 'experiment', '--output', sample, '--resume'], { cwd, env });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(await fs.readFile(path.join(sample, 'checkpoint.jsonl'), 'utf8'), checkpoint);
    result = await invoke(engine, [], {
      cwd,
      env,
      input:
        '{"id":"first","op":"expression","params":{"expression":"1+2"}}\n{"id":"bad","op":"missing-operation"}\n{"id":"last","op":"generate","params":{"kind":"regular","key":"cube"}}\n',
    });
    assert.equal(result.code, 0, result.stderr);
    const replies = result.stdout
      .trim()
      .split(/\r?\n/)
      .map((s) => JSON.parse(s));
    assert.deepEqual(
      replies.map((r) => r.id),
      ['first', 'bad', 'last']
    );
    assert.equal(replies[0].ok, true);
    assert.equal(replies[1].ok, false);
    assert.equal(replies[2].ok, true);
    const cancel = path.join(output, 'cancel.flag');
    await fs.writeFile(cancel, 'cancel');
    const cancelled = path.join(output, 'cancelled');
    result = await invoke(engine, ['--cli', 'experiment', '--output', cancelled, '--cancel-file', cancel], {
      cwd,
      env,
    });
    // Windows process exit values retain the explicit CLI code 130.
    assert.equal(result.code, 130, result.stderr);
    await fs.unlink(cancel);
    const interrupted = JSON.parse(await fs.readFile(path.join(cancelled, 'report.json'), 'utf8'));
    assert.deepEqual(interrupted.totals, { cancelled: 4 });
    assert.equal(interrupted.complete, false);
    result = await invoke(engine, ['--cli', 'experiment', '--output', cancelled, '--resume'], { cwd, env });
    assert.equal(result.code, 0, result.stderr);
    const resumed = JSON.parse(await fs.readFile(path.join(cancelled, 'report.json'), 'utf8'));
    checkReport(resumed);
    assert.equal(resumed.attempts.length, 8);
    const badSpec = path.join(output, 'failure-spec.json');
    await fs.writeFile(
      badSpec,
      JSON.stringify({
        schemaVersion: 1,
        id: 'failure-continuation',
        models: [
          { id: 'bad', key: 'missing-key' },
          { id: 'cube', key: 'cube' },
        ],
      })
    );
    result = await invoke(engine, ['--cli', 'experiment', badSpec, '--output', path.join(output, 'failure')], {
      cwd,
      env,
    });
    assert.equal(result.code, 1, result.stderr);
    const failure = JSON.parse(await fs.readFile(path.join(output, 'failure', 'report.json'), 'utf8'));
    assert.deepEqual(failure.totals, { fail: 1, pass: 1 });
    assert.equal(failure.models[0].failure.phase, 'generate');
    const receipt = {
      schemaVersion: 1,
      qualified: true,
      engineSha256: report.runtime.executableSha256,
      sourceSha256: report.runtime.sourceSha256,
      appVersion: report.runtime.appVersion,
      pythonAvailableOnPath: false,
      sourceDirectoryUsed: false,
      sourceComparison: !!sourceReport,
      models: report.models.map((r) => ({
        id: r.id,
        sourceModelSha256: r.sourceModelSha256,
        sourceRecordSha256: r.sourceRecordSha256,
        counts: r.analysis.counts,
        content: r.analysis.measure.content,
        validationPassed: r.analysis.validation.passed,
      })),
      scenarios: ['BATCH-01', 'BATCH-02', 'BATCH-03', 'BATCH-04', 'BATCH-05'],
      platform: process.platform,
      arch: process.arch,
    };
    await fs.writeFile(path.join(output, 'qualification.json'), JSON.stringify(receipt, null, 2) + '\n');
    return receipt;
  } finally {
    await fs.rmdir(cwd);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2),
    value = (name) => args[args.indexOf(name) + 1];
  if (!args.includes('--engine') || !args.includes('--output')) {
    console.error(
      'Usage: node scripts/qualify-batch-experiment.cjs --engine <resources/engine/polytope-engine.exe> --output <fresh-directory>'
    );
    process.exitCode = 2;
  } else
    qualify(
      value('--engine'),
      value('--output'),
      args.includes('--source-report') ? value('--source-report') : undefined
    )
      .then((r) => console.log(JSON.stringify(r)))
      .catch((e) => {
        console.error(e);
        process.exitCode = 1;
      });
}
module.exports = { checkReport, compareReports, qualify, invoke };
