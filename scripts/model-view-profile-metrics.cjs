// V8 sampling time is not OS CPU utilization or isolated GPU time.
const assert = require('node:assert/strict');
function quantile(values, p) {
  assert.ok(values.length);
  const sorted = [...values].sort((a, b) => a - b),
    index = (sorted.length - 1) * p,
    lo = Math.floor(index);
  return sorted[lo] + (sorted[Math.ceil(index)] - sorted[lo]) * (index - lo);
}
function distribution(values) {
  return {
    samples: values,
    median: quantile(values, 0.5),
    q1: quantile(values, 0.25),
    q3: quantile(values, 0.75),
    iqr: quantile(values, 0.75) - quantile(values, 0.25),
  };
}
function cpuTime(cpu) {
  assert.equal(cpu.samples.length, cpu.timeDeltas.length);
  const nodes = new Map(cpu.nodes.map((n) => [n.id, n]));
  let sampledTotalMs = 0,
    sampledIdleMs = 0;
  cpu.samples.forEach((id, i) => {
    const ms = cpu.timeDeltas[i] / 1000;
    sampledTotalMs += ms;
    if (nodes.get(id).callFrame.functionName === '(idle)') sampledIdleMs += ms;
  });
  return { sampledTotalMs, sampledIdleMs, sampledNonIdleMs: sampledTotalMs - sampledIdleMs };
}
function navigationMetrics(result) {
  const rows = result.navigations ?? [];
  if (!result.navigationRequested) {
    assert.equal(rows.length, 0, 'Unrequested navigation samples');
    return null;
  }
  const keys = ['cell120', 'cell600', 'miratope-grand-hexacosichoron'];
  assert.equal(rows.length, 12, 'Require four complete three-document navigation passes');
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    assert.equal(row.key, keys[i % 3]);
    assert.equal(row.pass, Math.floor(i / 3));
    assert.equal(row.notesPreserved, true);
    assert.match(row.sourceSha256, /^[0-9a-f]{64}$/);
    assert.ok(Number.isFinite(row.firstDrawObservedMs) && row.firstDrawObservedMs >= 0);
    assert.ok(Number.isFinite(row.settledObservedMs) && row.settledObservedMs >= row.firstDrawObservedMs);
    assert.equal(row.sourceSha256, rows[i % 3].sourceSha256, 'Revisited source changed');
  }
  return Object.fromEntries(
    keys.map((key) => [
      key,
      Object.fromEntries(
        ['firstDrawObservedMs', 'settledObservedMs'].map((field) => [
          field,
          distribution(rows.filter((row) => row.key === key).map((row) => row[field])),
        ])
      ),
    ])
  );
}
function navigationComparison(samples, versions) {
  assert.ok(
    samples.every((sample) => Boolean(sample.navigation) === Boolean(samples[0].navigation)),
    'Do not mix profiles with and without document revisits'
  );
  if (!samples[0].navigation) return null;
  const keys = Object.keys(samples[0].navigation);
  return {
    sampleUnit: 'per-run median across four revisits',
    groups: Object.fromEntries(
      keys.map((key) => [
        key,
        Object.fromEntries(
          versions.map((version) => {
            const runs = samples.filter((sample) => sample.version === version);
            assert.ok(runs.length);
            return [
              version,
              Object.fromEntries(
                ['firstDrawObservedMs', 'settledObservedMs'].map((field) => [
                  field,
                  distribution(runs.map((run) => run.navigation[key][field].median)),
                ])
              ),
            ];
          })
        ),
      ])
    ),
  };
}
module.exports = { quantile, distribution, cpuTime, navigationMetrics, navigationComparison };
