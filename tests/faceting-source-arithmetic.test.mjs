import { readDesktopSource } from './helpers/app-source.mjs';
import { includesSource } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { sourceArithmeticText } from '../ui/faceting-source-arithmetic.mjs';

const receipt = {
  status: 'complete',
  candidateDomain: { planes: 807, cycles: 1473, sourceFaceCyclesPresent: 0 },
  sourceFaces: Array(12).fill({}),
  sourceSymmetry: { complete: true, order: 24, properOrder: 12 },
  nonplanarSourceFaceIds: Array.from({ length: 12 }, (_, i) => i),
  maximumAnchorPlaneDistanceApprox: 1e-16,
  diagnostics: ['No coordinates were snapped or replaced.'],
  searchScope: 'Candidate and action inspection only; no subset search or faceting count.',
};

test('arithmetic copy separates exact planarity, approximate residuals and finite search scope', () => {
  const text = sourceArithmeticText(receipt);
  assert.match(text, /807 planes; 1473 cycles; 0\/12 source face cycles present/);
  assert.match(text, /24 exact source actions \(12 proper\)/);
  assert.match(text, /12 source faces fail exact planarity/);
  assert.match(text, /approximate anchor-plane distance 1e-16/);
  assert.match(text, /no subset search or faceting count/);
});

test('incomplete source symmetry never displays a full group order', () => {
  const limited = { ...receipt, status: 'resource-limited', sourceSymmetry: { complete: false, order: null } };
  assert.match(sourceArithmeticText(limited), /^resource-limited/);
  assert.match(sourceArithmeticText(limited), /Full source group unresolved/);
  assert.doesNotMatch(sourceArithmeticText(limited), /null exact source actions/);
});

test('read-only arithmetic operation is allowed and reuses native workers', () => {
  const main = readDesktopSource();
  assert.ok(includesSource(main, "allowed.add('facet-source-arithmetic')"));
  const require = createRequire(import.meta.url),
    { REUSABLE_OPERATIONS } = require('../desktop/engine-pool.cjs');
  assert.ok(REUSABLE_OPERATIONS.has('facet-source-arithmetic'));
});
