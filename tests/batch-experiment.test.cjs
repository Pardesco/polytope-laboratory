const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { checkReport, compareReports, invoke } = require('../scripts/qualify-batch-experiment.cjs');
const root = path.resolve(__dirname, '..');
test('frozen build pins source/version manifest and retains CLI entry', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['engine:bundle'], /python scripts\/prepare-experiment-runtime\.py &&/);
  assert.match(pkg.scripts['engine:bundle'], /--add-data "experiment-runtime\.json;\."/);
  assert.match(
    fs.readFileSync(path.join(root, 'engine/server.py'), 'utf8'),
    /from engine\.cli import main as cli_main/
  );
});
test('qualification rejects incomplete or mathematically incorrect sample report', () => {
  assert.throws(() => checkReport({ complete: false, successful: false, totals: { pass: 3 } }));
  assert.throws(() =>
    checkReport({
      complete: true,
      successful: true,
      totals: { pass: 4 },
      models: [{ id: 'cube', analysis: { counts: { vertices: 9, edges: 12, faces: 6, cells: 0 } } }],
    })
  );
});
test('process harness retains failure exit and framed output', async () => {
  const result = await invoke(process.execPath, ['-e', 'console.log(JSON.stringify({ok:false}));process.exitCode=7']);
  assert.equal(result.code, 7);
  assert.deepEqual(JSON.parse(result.stdout), { ok: false });
});
test('comparison retains geometry and analysis equality while accepting per-run UUID record hashes', () => {
  const expected = {
    tetrahedron: [4, 6, 4, 0],
    cube: [8, 12, 6, 0],
    '5-cell': [5, 10, 10, 5],
    tesseract: [16, 32, 24, 8],
  };
  const source = {
    complete: true,
    successful: true,
    totals: { pass: 4 },
    runtime: {
      appVersion: '1',
      sourceSha256: 'a'.repeat(64),
      sourceFiles: { 'engine/batch_experiment.py': 'a'.repeat(64) },
      numpy: '1',
      scipy: '1',
    },
    models: Object.entries(expected).map(([id, counts]) => ({
      id,
      sourceModelSha256: 'b'.repeat(64),
      sourceRecordSha256: 'c'.repeat(64),
      analysis: {
        counts: Object.fromEntries(['vertices', 'edges', 'faces', 'cells'].map((k, i) => [k, counts[i]])),
        validation: { passed: true },
        measure: { content: id === 'cube' ? 8 : 16 },
      },
    })),
  };
  const frozen = structuredClone(source);
  for (const row of frozen.models) row.sourceRecordSha256 = 'd'.repeat(64);
  compareReports(source, frozen);
  frozen.models[0].sourceModelSha256 = 'e'.repeat(64);
  assert.throws(() => compareReports(source, frozen));
});
