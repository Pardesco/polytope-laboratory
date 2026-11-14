import test from 'node:test';
import assert from 'node:assert/strict';
import { patchSettings, patchLimits, coverageText, residualRows } from '../ui/hyperbolic-controls.mjs';
import { NumericEntry } from '../ui/numeric-entry.mjs';

for (const key of ['534', '435', '535', '353', 'small-cover'])
  test(`${key}: honest patch clamps and saved settings`, () => {
    const source = { pqr: key === 'small-cover' ? undefined : key.split('').map(Number) };
    assert.equal(patchLimits(source).depth, key === '435' ? 5 : 3);
    assert.deepEqual(patchSettings(source, { radius: 30, depth: 12, mode: 'complete-depth', paused: true }), {
      radius: 2,
      depth: key === '435' ? 5 : 3,
      mode: 'complete-depth',
      paused: true,
    });
    assert.equal(patchSettings(source, { radius: NaN, depth: 1.5 }).radius, 2);
    assert.equal(patchSettings(source, { radius: -1 }).radius, 0);
  });
test('coverage is based on receipts; incomplete balls never claim zero missing cells', () => {
  assert.match(
    coverageText({ mode: 'radius', radius: 2, complete: false, stopReason: 'timeLimit' }),
    /generation limited.*Incomplete observer ball.*time limit reached/
  );
  assert.match(
    coverageText({ mode: 'radius', radius: 2, complete: true, stopReason: 'radiusComplete' }),
    /Complete observer ball/
  );
  assert.doesNotMatch(
    coverageText({ mode: 'radius', radius: 2, complete: true, stopReason: 'radiusComplete' }),
    /generation limited/
  );
  assert.doesNotMatch(
    coverageText({ mode: 'radius', radius: 2, complete: true, stopReason: 'radiusComplete' }),
    /radiusComplete|stop:/
  );
  assert.match(
    coverageText(
      { mode: 'complete-depth', complete: true, completedLayers: [0, 1], stopReason: 'depthComplete' },
      true
    ),
    /generation paused.*adjacency layers 0, 1/
  );
  assert.match(
    coverageText({ complete: true }, false, { capped: true, reasons: ['edge-cap'] }),
    /generation limited.*edge-cap/
  );
});
test('residuals show reported absolute, normalized, scale and gate without repairing failures', () => {
  const rows = residualRows({
    coordinates: 1e-6,
    coordinatesRelative: 1e-13,
    coordinatesScale: 1e4,
    mergeDiscrepancy: 1e-6,
    mergeDiscrepancyRelative: 1e-10,
    mergeDiscrepancyScale: 1e4,
  });
  assert.match(rows[0][1], /abs 1.000e-6.*rel 1.000e-13.*scale 1.000e\+4.*1.000e-12.*PASS/);
  assert.match(rows[1][1], /FAIL/);
});
test('NumericEntry supports a document-kind owner fence and rejects stale hyperbolic edits', async () => {
  const state = { model: { kind: 'hyperbolic-space' } },
    project = {},
    document = {};
  let current = state,
    release,
    published = false;
  const entry = new NumericEntry({
    getState: () => current,
    captureSource: () => ({ state: current, project, document, modelSignature: JSON.stringify(current.model) }),
    verifySource: (owner) => {
      assert.equal(owner.project, project);
      if (owner.state !== current) throw Error('Hyperbolic source changed');
    },
    number: () => new Promise((resolve) => (release = resolve)),
  });
  const job = entry.run({ radius: { text: '1/2', min: 0, max: 2 } }, () => {
    published = true;
  });
  current = { model: { kind: 'hyperbolic-space' } };
  release(0.5);
  await assert.rejects(job, /Hyperbolic source changed/);
  assert.equal(published, false);
});
test('NumericEntry document-kind expressions retain domain validation', async () => {
  const state = { model: { kind: 'hyperbolic-space' } };
  let value;
  const entry = new NumericEntry({
    getState: () => state,
    captureSource: () => ({ state, modelSignature: JSON.stringify(state.model) }),
    verifySource: (owner) => assert.equal(owner.state, state),
    number: async () => 0.5,
  });
  await entry.run({ radius: { text: '1/2', min: 0, max: 2 } }, (values, verify) => {
    verify();
    value = values.radius;
  });
  assert.equal(value, 0.5);
  await assert.rejects(
    entry.run({ layers: { text: '1/2', integer: true, min: 0, max: 3 } }, () => {}),
    /integer domain/
  );
});

test('document-kind numeric entry requires paired ownership hooks', () => {
  assert.throws(() => new NumericEntry({ captureSource() {} }), /paired/);
  assert.throws(() => new NumericEntry({ verifySource() {} }), /paired/);
});
test('diagnostic point normalization correction has no fabricated pass/fail gate', () => {
  const rows = residualRows({ pointCorrection: 1e-10, pointCorrectionRelative: 1e-13, pointCorrectionScale: 1000 });
  assert.match(rows[0][1], /not enforced.*INFO/);
  assert.doesNotMatch(rows[0][1], /FAIL|PASS/);
});
