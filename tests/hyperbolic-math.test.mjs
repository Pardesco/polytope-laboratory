import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {
  IDENTITY,
  lorentzInner,
  boost,
  rotation,
  multiply,
  transform,
  lorentzInverse,
  frameDiagnostics,
  assertObserver,
  lorentzGramSchmidt,
  advanceObserver,
  observerDisplacement,
  projectPoint,
  geodesicPoint,
  sampleGeodesic,
  conformalTubeRadius,
  screenPoint,
  pointSegmentDistance,
  clipBallSegment,
  geodesicOutsideFrustum,
  hyperbolicSegmentCount,
  shaderProjectPoint,
  measureHyperbolicDisplayError,
} from '../ui/hyperbolic-math.mjs';

const close = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b} (tolerance ${eps})`);
const vectorClose = (a, b, eps = 1e-12) => a.forEach((x, i) => close(x, b[i], eps));
const lift = (p) => {
  const q = p.reduce((s, x) => s + x * x, 0);
  return [(1 + q) / (1 - q), ...p.map((x) => (2 * x) / (1 - q))];
};

test('time-first boosts preserve the Lorentz metric, distance, orientation and future sheet', () => {
  for (const distance of [-1, -0.2, 0, 0.7, 1]) {
    const m = boost([2, 3, -4], distance),
      point = transform(m, [1, 0, 0, 0]);
    close(lorentzInner(point, point), -1);
    close(point[0], Math.cosh(distance));
    close(observerDisplacement(m), Math.abs(distance));
    assert.equal(frameDiagnostics(m).valid, true);
    vectorClose(multiply(lorentzInverse(m), m), IDENTITY);
  }
  assert.throws(() => boost([0, 0, 0], 1), /nonzero/);
  assert.throws(() => boost([1, 0, 0], Infinity), /finite/);
});
test('spatial rotations and noncommuting boosts compose in the observer local frame', () => {
  vectorClose(transform(rotation([0, 1, 0], Math.PI / 2), [1, 1, 0, 0]), [1, 0, 0, -1]);
  const a = boost([1, 0, 0], 0.4),
    b = boost([0, 1, 0], 0.3);
  assert.notDeepEqual(multiply(a, b), multiply(b, a));
  assert.equal(frameDiagnostics(multiply(a, b)).valid, true);
  assert.throws(() => rotation([0, 0, 0], 1), /nonzero/);
});
test('observer checks reject improper, past, nonfinite and non-Lorentz frames', () => {
  for (const index of [0, 5]) {
    const m = [...IDENTITY];
    m[index] = -1;
    assert.throws(() => assertObserver(m), /future, proper/);
    assert.throws(() => lorentzGramSchmidt(m), /nonfuture or nonproper/);
  }
  const m = [...IDENTITY];
  m[4] = NaN;
  assert.equal(frameDiagnostics(m).valid, false);
  const skew = [...IDENTITY];
  skew[1] = 0.1;
  assert.throws(() => assertObserver(skew));
});
test('timelike-first Gram–Schmidt repairs metric drift and periodic repair runs at step 128', () => {
  const m = multiply(boost([1, 2, 3], 0.6), rotation([1, 1, 0], 0.3));
  m[5] += 1e-8;
  assert.ok(frameDiagnostics(m).metricResidual > 1e-10);
  const repaired = lorentzGramSchmidt(m);
  assert.equal(frameDiagnostics(repaired).valid, true);
  assert.equal(advanceObserver(IDENTITY, boost([1, 0, 0], 0.001), 127).corrected, false);
  assert.equal(advanceObserver(IDENTITY, boost([1, 0, 0], 0.001), 128).corrected, true);
  const drift = [...IDENTITY];
  drift[5] += 1e-10;
  assert.equal(advanceObserver(drift, IDENTITY, 3).corrected, true);
});
test('thousands of bounded navigation steps keep measured residuals under 1e-10', () => {
  let m = [...IDENTITY],
    worst = 0;
  for (let i = 1; i <= 4096; i++) {
    const result = advanceObserver(
      m,
      multiply(boost([1, 0, 0], i % 2 ? 0.001 : -0.001), rotation([0, 1, 0], 0.001)),
      i
    );
    m = result.matrix;
    worst = Math.max(worst, result.metricResidual);
  }
  assert.ok(worst < 1e-10, `measured metric residual ${worst}`);
});
test('Poincaré and Klein projections match elementary axis values', () => {
  const x = [Math.cosh(0.8), Math.sinh(0.8), 0, 0];
  vectorClose(projectPoint(x), [Math.tanh(0.4), 0, 0]);
  vectorClose(projectPoint(x, 'klein'), [Math.tanh(0.8), 0, 0]);
  assert.throws(() => projectPoint(x, 'half-space'), /Poincaré/);
  close(conformalTubeRadius(0.02, [0.3, 0.4, 0]), 0.0075);
});
test('sinh interpolation stays on the hyperboloid with uniform hyperbolic parameter', () => {
  const a = [1, 0, 0, 0],
    b = [Math.cosh(1.2), Math.sinh(1.2), 0, 0];
  for (const u of [0, 0.1, 0.5, 0.9, 1])
    vectorClose(geodesicPoint(a, b, u), [Math.cosh(1.2 * u), Math.sinh(1.2 * u), 0, 0]);
  vectorClose(geodesicPoint(a, a, 0.5), a);
  assert.throws(() => geodesicPoint(a, b, 2), /\[0,1\]/);
});
test('adaptive Poincaré sampling bounds an independently parametrized circle to one pixel', () => {
  const a = lift([-0.6, 0.4, 0]),
    b = lift([0.6, 0.4, 0]),
    options = { width: 1920, height: 1080 };
  const sampled = sampleGeodesic(a, b, options),
    center = 1.9,
    radius = Math.sqrt(center * center - 1);
  assert.ok(sampled.points.length > 2);
  assert.equal(sampled.qualityCapped, false);
  assert.ok(sampled.maxDeviationPx <= 1);
  const screens = sampled.points.map((p) => screenPoint(p, options));
  const start = Math.atan2(0.4 - center, -0.6),
    end = Math.atan2(0.4 - center, 0.6);
  for (let i = 0; i <= 2000; i++) {
    const angle = start + ((end - start) * i) / 2000,
      p = [radius * Math.cos(angle), center + radius * Math.sin(angle), 0];
    const screen = screenPoint(p, options),
      error = Math.min(...screens.slice(1).map((q, k) => pointSegmentDistance(screen, screens[k], q)));
    assert.ok(error <= 1.000001, `independent circle error ${error}px`);
  }
  close(projectPoint(geodesicPoint(a, b, 0.5))[1], center - radius);
});
test('perspective screen-space sampling and clipping are bounded, Klein edges remain straight', () => {
  const a = lift([-0.5, 0.4, -0.3]),
    b = lift([0.5, 0.4, 0.3]);
  const options = { width: 1920, height: 1080, screenMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, -1, 3] };
  const sampled = sampleGeodesic(a, b, options),
    screens = sampled.points.map((p) => screenPoint(p, options));
  assert.equal(sampled.qualityCapped, false);
  for (let i = 0; i <= 1000; i++) {
    const p = screenPoint(projectPoint(geodesicPoint(a, b, i / 1000)), options);
    assert.ok(Math.min(...screens.slice(1).map((q, k) => pointSegmentDistance(p, screens[k], q))) <= 1.00001);
  }
  assert.equal(sampleGeodesic(a, b, { ...options, model: 'klein' }).points.length, 2);
  const clip = clipBallSegment([-2, 0, 0], [2, 0, 0], IDENTITY);
  vectorClose(clip[0], [-1, 0, 0]);
  vectorClose(clip[1], [1, 0, 0]);
  assert.equal(clipBallSegment([2, 0, 0], [3, 0, 0], IDENTITY), null);
});
test('sampling caps are explicit and do not claim a one-pixel bound', () => {
  const result = sampleGeodesic(lift([-0.6, 0.4, 0]), lift([0.6, 0.4, 0]), {
    width: 1920,
    height: 1080,
    maxSegments: 1,
  });
  assert.equal(result.qualityCapped, true);
  assert.equal(result.points.length, 2);
  assert.ok(result.maxDeviationPx > 1);
  assert.throws(() => sampleGeodesic([1, 0, 0, 0], [1, 0, 0, 0], { maxSegments: 0 }), /limits/);
});

test('control-hull frustum culling keeps a curved arc that enters the viewport between outside endpoints', () => {
  const a = lift([-0.6, 0.4, 0]),
    b = lift([0.6, 0.4, 0]);
  // Narrow y window [0.27,0.31]: both endpoints lie outside, the circular arc enters.
  const matrix = [1, 0, 0, 0, 0, 50, 0, -14.5, 0, 0, 1, 0, 0, 0, 0, 1];
  assert.equal(geodesicOutsideFrustum(a, b, 'poincare', matrix), false);
  assert.equal(geodesicOutsideFrustum(a, b, 'klein', matrix), true);
  assert.equal(geodesicOutsideFrustum(lift([0.1, 0.7, 0]), lift([0.2, 0.7, 0]), 'poincare', matrix), true);
});

test('static sampling tiers depend on hyperbolic length and model, never the observer', () => {
  assert.equal(hyperbolicSegmentCount(1, { lod: 'coarse' }).segments, 2);
  assert.equal(hyperbolicSegmentCount(1, { lod: 'normal' }).segments, 4);
  assert.equal(hyperbolicSegmentCount(1, { lod: 'fine' }).segments, 7);
  assert.equal(hyperbolicSegmentCount(1, { model: 'klein' }).segments, 1);
  assert.equal(hyperbolicSegmentCount(100).capped, true);
  assert.throws(() => hyperbolicSegmentCount(1, { lod: 'automatic' }), /LOD/);
});

test('shader-equivalence: float32 formula stays within the reported default-radius precision envelope', (t) => {
  const fixture = JSON.parse(
    fs.readFileSync(new URL('./fixtures/hyperbolic/regular-display-templates.json', import.meta.url))
  );
  const samples = [],
    directions = Array.from({ length: 12 }, (_, i) => {
      const z = 1 - (2 * (i + 0.5)) / 12,
        r = Math.sqrt(1 - z * z),
        a = i * 2.399963229728653;
      return [r * Math.cos(a), r * Math.sin(a), z];
    });
  let maxRadius = 0;
  for (const template of fixture.templates)
    for (const radius of [0, 1, 2, 3])
      for (const direction of radius ? directions : [[1, 0, 0]]) {
        const matrix = multiply(boost(direction, radius), rotation([1, 2, 3], 0.37));
        for (const [i, j] of template.edges) {
          const a = template.vertices[i],
            b = template.vertices[j],
            length = Math.acosh(-lorentzInner(a, b));
          const { segments } = hyperbolicSegmentCount(length);
          for (let k = 0; k <= segments; k++) {
            const x = transform(matrix, geodesicPoint(a, b, k / segments));
            samples.push(...x);
            maxRadius = Math.max(maxRadius, Math.acosh(x[0]));
          }
        }
      }
  const observers = [
    IDENTITY,
    ...[0.5, 0.99].flatMap((distance) =>
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
        [1, 2, 3],
      ].map((direction) => multiply(boost(direction, distance), rotation([1, 1, 0], 0.2)))
    ),
  ];
  // Include points close to each observer, where perspective magnifies rounding.
  for (const observer of observers)
    for (const distance of [0.0041, 0.008, 0.02, 0.1])
      for (const direction of directions) {
        const near = transform(observer, transform(boost(direction, distance), [1, 0, 0, 0]));
        samples.push(...near);
      }
  const packed = new Float64Array(samples),
    before = new Float64Array(packed),
    results = {};
  const camera = new THREE.PerspectiveCamera(50, 1920 / 1080, 0.002, 20);
  for (const mode of ['overview', 'explore']) {
    camera.position.set(...(mode === 'overview' ? [2, 1.3, 3] : [0, 0, 0]));
    if (mode === 'overview') camera.lookAt(0, 0, 0);
    else camera.quaternion.identity();
    camera.updateMatrixWorld();
    const rowMajor = (m) => m.clone().transpose().toArray();
    const screenMatrix = rowMajor(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    );
    for (const model of ['poincare', 'klein']) {
      const result = { maxBallError: 0, maxPixelError: 0, float64Residual: 0, visibleSamples: 0 };
      for (const observer of observers) {
        const report = measureHyperbolicDisplayError(packed, {
          inverse: mode === 'explore' ? lorentzInverse(observer) : IDENTITY,
          model,
          screenMatrix,
          viewMatrix: rowMajor(camera.matrixWorldInverse),
          projectionMatrix: rowMajor(camera.projectionMatrix),
        });
        for (const key of ['maxBallError', 'maxPixelError', 'float64Residual'])
          result[key] = Math.max(result[key], report[key]);
        result.visibleSamples += report.visibleSamples;
      }
      assert.ok(result.maxBallError <= 2e-5, JSON.stringify(result));
      assert.ok(result.maxPixelError <= 0.5, JSON.stringify(result));
      assert.ok(result.float64Residual < 1e-8);
      assert.ok(result.visibleSamples > 0);
      results[mode + '-' + model] = result;
    }
  }
  assert.deepEqual(packed, before);
  const axis = [Math.cosh(0.8), Math.sinh(0.8), 0, 0];
  vectorClose(shaderProjectPoint(axis, IDENTITY, 'poincare'), [Math.tanh(0.4), 0, 0], 1e-7);
  t.diagnostic(
    'Float32 shader precision at 1920x1080: ' +
      JSON.stringify({
        source:
          'four regular templates; cell centers radius 0..3; observer radius 0..0.99; 12 directions; near-eye probes',
        samples: packed.length / 4,
        maxAnchorRadius: maxRadius,
        results,
      })
  );
});

test('fixed normal LOD reports approximation error separately from float32 precision', (t) => {
  const fixture = JSON.parse(
    fs.readFileSync(new URL('./fixtures/hyperbolic/regular-display-templates.json', import.meta.url))
  );
  const camera = new THREE.PerspectiveCamera(50, 1920 / 1080, 0.002, 20);
  camera.position.set(2, 1.3, 3);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const screenMatrix = new THREE.Matrix4()
    .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    .transpose()
    .toArray();
  const screen = { screenMatrix, width: 1920, height: 1080 },
    results = {};
  for (const model of ['poincare', 'klein']) {
    let maxBallDeviation = 0,
      maxPixelDeviation = 0,
      probes = 0;
    for (const template of fixture.templates)
      for (const radius of [0, 1, 2, 3])
        for (let direction = 0; direction < 12; direction++) {
          const y = 1 - (2 * (direction + 0.5)) / 12,
            r = Math.sqrt(1 - y * y),
            angle = direction * 2.399963229728653,
            matrix = boost([r * Math.cos(angle), y, r * Math.sin(angle)], radius);
          for (const [i, j] of template.edges) {
            const a = transform(matrix, template.vertices[i]),
              b = transform(matrix, template.vertices[j]);
            const { segments } = hyperbolicSegmentCount(Math.acosh(Math.max(1, -lorentzInner(a, b))), { model });
            for (let segment = 0; segment < segments; segment++) {
              const p = projectPoint(geodesicPoint(a, b, segment / segments), model),
                q = projectPoint(geodesicPoint(a, b, (segment + 1) / segments), model);
              const sp = screenPoint(p, screen),
                sq = screenPoint(q, screen);
              for (let probe = 1; probe < 8; probe++) {
                const point = projectPoint(geodesicPoint(a, b, (segment + probe / 8) / segments), model),
                  s = screenPoint(point, screen);
                maxBallDeviation = Math.max(maxBallDeviation, pointSegmentDistance(point, p, q));
                maxPixelDeviation = Math.max(maxPixelDeviation, pointSegmentDistance(s, sp, sq));
                probes++;
              }
            }
          }
        }
    assert.ok(Number.isFinite(maxBallDeviation) && Number.isFinite(maxPixelDeviation));
    if (model === 'klein') assert.ok(maxBallDeviation < 1e-10);
    results[model] = { maxBallDeviation, maxPixelDeviation, probes };
  }
  t.diagnostic(
    'Normal LOD chord error, four presets, center radii 0..3, default overview, 1920x1080: ' + JSON.stringify(results)
  );
});
