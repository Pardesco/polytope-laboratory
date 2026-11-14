export const J = Object.freeze([-1, 1, 1, 1]);
export const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
export const lorentzInner = (a, b) => -a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

export function finiteVector(v, size) {
  return (Array.isArray(v) || ArrayBuffer.isView(v)) && v.length === size && Array.from(v).every(Number.isFinite);
}
export function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) out[4 * i + j] += a[4 * i + k] * b[4 * k + j];
  return out;
}
export function transform(m, x) {
  return [0, 1, 2, 3].map((i) => m[4 * i] * x[0] + m[4 * i + 1] * x[1] + m[4 * i + 2] * x[2] + m[4 * i + 3] * x[3]);
}
export function lorentzInverse(m) {
  return Array.from({ length: 16 }, (_, k) => J[k >> 2] * J[k % 4] * m[(k % 4) * 4 + (k >> 2)]);
}
export function determinant(m) {
  let sum = 0;
  for (let a = 0; a < 4; a++)
    for (let b = 0; b < 4; b++)
      for (let c = 0; c < 4; c++)
        for (let d = 0; d < 4; d++) {
          const p = [a, b, c, d];
          if (new Set(p).size !== 4) continue;
          let sign = 1;
          for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (p[i] > p[j]) sign = -sign;
          sum += sign * m[a] * m[4 + b] * m[8 + c] * m[12 + d];
        }
  return sum;
}
export function frameDiagnostics(m, tolerance = 1e-12) {
  if (!finiteVector(m, 16))
    return { valid: false, metricResidual: Infinity, determinant: NaN, future: false, proper: false };
  let metricResidual = 0;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let value = 0;
      for (let k = 0; k < 4; k++) value += J[k] * m[4 * k + i] * m[4 * k + j];
      metricResidual = Math.max(metricResidual, Math.abs(value - (i === j ? J[i] : 0)));
    }
  const det = determinant(m),
    future = m[0] > 0,
    proper = det > 0;
  return {
    valid: metricResidual <= tolerance && Math.abs(det - 1) <= 4 * tolerance && future && proper,
    metricResidual,
    determinant: det,
    future,
    proper,
  };
}
export function assertObserver(m, tolerance = 1e-8) {
  const report = frameDiagnostics(m, tolerance);
  if (Math.max(...Array.from(m, Math.abs)) > 1e4 || !report.valid)
    throw new RangeError('Observer must be a finite future, proper Lorentz frame (SO+(3,1)).');
  return report;
}
export function boost(direction, distance) {
  if (!finiteVector(direction, 3) || !Number.isFinite(distance) || Math.abs(distance) > 20)
    throw new RangeError('Boost requires a finite direction and distance of at most 20.');
  const length = Math.hypot(...direction);
  if (!length) {
    if (distance === 0) return [...IDENTITY];
    throw new RangeError('Boost direction must be nonzero.');
  }
  const n = direction.map((x) => x / length),
    c = Math.cosh(distance),
    s = Math.sinh(distance),
    m = [...IDENTITY];
  m[0] = c;
  for (let i = 0; i < 3; i++) {
    m[i + 1] = m[4 * (i + 1)] = s * n[i];
    for (let j = 0; j < 3; j++) m[4 * (i + 1) + j + 1] = (i === j ? 1 : 0) + (c - 1) * n[i] * n[j];
  }
  return m;
}
export function rotation(axis, angle) {
  if (!finiteVector(axis, 3) || !Number.isFinite(angle) || !Math.hypot(...axis))
    throw new RangeError('Rotation requires a nonzero finite axis and finite angle.');
  const [x, y, z] = axis.map((v) => v / Math.hypot(...axis)),
    c = Math.cos(angle),
    s = Math.sin(angle),
    t = 1 - c;
  return [
    1,
    0,
    0,
    0,
    0,
    t * x * x + c,
    t * x * y - s * z,
    t * x * z + s * y,
    0,
    t * x * y + s * z,
    t * y * y + c,
    t * y * z - s * x,
    0,
    t * x * z - s * y,
    t * y * z + s * x,
    t * z * z + c,
  ];
}
export function lorentzGramSchmidt(m) {
  if (!finiteVector(m, 16) || m[0] <= 0 || determinant(m) <= 0)
    throw new RangeError('Cannot repair a nonfuture or nonproper observer.');
  const columns = [];
  for (let j = 0; j < 4; j++) {
    let v = [m[j], m[4 + j], m[8 + j], m[12 + j]];
    for (let i = 0; i < j; i++) {
      const factor = lorentzInner(v, columns[i]) * J[i];
      v = v.map((x, k) => x - factor * columns[i][k]);
    }
    const norm = lorentzInner(v, v);
    if (!Number.isFinite(norm) || J[j] * norm <= 1e-20) throw new RangeError('Degenerate Lorentz frame.');
    columns.push(v.map((x) => x / Math.sqrt(Math.abs(norm))));
  }
  const result = Array.from({ length: 16 }, (_, k) => columns[k % 4][k >> 2]);
  assertObserver(result, 1e-12);
  return result;
}
export function advanceObserver(observer, delta, steps = 1) {
  assertObserver(observer);
  assertObserver(delta);
  let matrix = multiply(observer, delta);
  const report = frameDiagnostics(matrix);
  if (!report.future || !report.proper) throw new RangeError('Observer left the future proper Lorentz component.');
  const corrected = steps % 128 === 0 || report.metricResidual > 1e-12;
  if (corrected) matrix = lorentzGramSchmidt(matrix);
  assertObserver(matrix);
  return { matrix, corrected, ...frameDiagnostics(matrix) };
}
export const observerDisplacement = (m) => Math.acosh(Math.max(1, m[0]));

export function projectPoint(x, model = 'poincare') {
  if (model !== 'poincare' && model !== 'klein') throw new RangeError('Use the Poincaré ball or Klein model.');
  if (!finiteVector(x, 4) || x[0] <= 0) throw new RangeError('Projection requires a finite future hyperboloid point.');
  const denominator = x[0] + (model === 'poincare' ? 1 : 0);
  return [x[1] / denominator, x[2] / denominator, x[3] / denominator];
}
export function geodesicPoint(a, b, u) {
  if (!Number.isFinite(u) || u < 0 || u > 1) throw new RangeError('Geodesic parameter must lie in [0,1].');
  const distance = Math.acosh(Math.max(1, -lorentzInner(a, b)));
  if (u === 0) return [...a];
  if (u === 1) return [...b];
  if (distance < 1e-7) {
    const v = a.map((x, i) => (1 - u) * x + u * b[i]),
      norm = Math.sqrt(-lorentzInner(v, v));
    return v.map((x) => x / norm);
  }
  const denominator = Math.sinh(distance),
    p = Math.sinh((1 - u) * distance) / denominator,
    q = Math.sinh(u * distance) / denominator;
  return a.map((x, i) => p * x + q * b[i]);
}
export function conformalTubeRadius(rho, p) {
  if (!Number.isFinite(rho) || rho < 0 || !finiteVector(p, 3)) throw new RangeError('Invalid tube radius or point.');
  return (rho * Math.max(0, 1 - p.reduce((s, x) => s + x * x, 0))) / 2;
}

export const HYPERBOLIC_LOD = Object.freeze({ coarse: 0.6, normal: 0.3, fine: 0.15 });
export function hyperbolicSegmentCount(length, { model = 'poincare', lod = 'normal' } = {}) {
  if (!Number.isFinite(length) || length < 0 || !Object.hasOwn(HYPERBOLIC_LOD, lod))
    throw new RangeError('Invalid hyperbolic edge length or LOD tier.');
  if (!['poincare', 'klein'].includes(model)) throw new RangeError('Use the Poincaré ball or Klein model.');
  const requested = model === 'klein' ? 1 : Math.max(2, Math.ceil(length / HYPERBOLIC_LOD[lod]));
  return { segments: Math.min(64, requested), capped: requested > 64 };
}

// Reference for the display shader: inputs, uniform and every arithmetic step
// are rounded to float32. Authoritative points/observer remain untouched.
export function shaderTransform(matrix, point) {
  const f = Math.fround,
    x = Array.from(point, f),
    q = [];
  for (let i = 0; i < 4; i++) {
    let sum = f(f(matrix[4 * i]) * x[0]);
    for (let j = 1; j < 4; j++) sum = f(sum + f(f(matrix[4 * i + j]) * x[j]));
    q.push(sum);
  }
  return q;
}
export function shaderProjectPoint(point, inverse = IDENTITY, model = 'poincare') {
  if (!['poincare', 'klein'].includes(model)) throw new RangeError('Use the Poincaré ball or Klein model.');
  const f = Math.fround,
    q = shaderTransform(inverse, point);
  const denominator = f(q[0] + (model === 'poincare' ? 1 : 0));
  return [f(q[1] / denominator), f(q[2] / denominator), f(q[3] / denominator)];
}

export function measureHyperbolicDisplayError(
  points,
  {
    inverse = IDENTITY,
    model = 'poincare',
    screenMatrix,
    viewMatrix,
    projectionMatrix,
    width = 1920,
    height = 1080,
  } = {}
) {
  assertObserver(inverse);
  if (points.length % 4) throw new RangeError('Expected time-first hyperboloid samples.');
  let maxBallError = 0,
    maxPixelError = 0,
    visibleSamples = 0,
    residual = 0;
  for (let i = 0; i < points.length; i += 4) {
    const x = Array.from(points.slice(i, i + 4)),
      expected = projectPoint(transform(inverse, x), model),
      actual = shaderProjectPoint(x, inverse, model);
    residual = Math.max(residual, Math.abs(lorentzInner(x, x) + 1));
    maxBallError = Math.max(maxBallError, Math.hypot(...actual.map((v, k) => v - expected[k])));
    if (screenMatrix) {
      const clip = transform(screenMatrix, [...expected, 1]);
      if (clip[3] <= 0 || [0, 1, 2].some((k) => Math.abs(clip[k]) > clip[3])) continue;
    }
    const a = screenPoint(expected, { screenMatrix, width, height });
    let b = screenPoint(actual, { screenMatrix, width, height });
    if (viewMatrix && projectionMatrix) {
      const q = shaderTransform(projectionMatrix, shaderTransform(viewMatrix, [...actual, 1]));
      b = q[3] > 0 ? [((q[0] / q[3] + 1) * width) / 2, ((1 - q[1] / q[3]) * height) / 2] : null;
    }
    if (!a || !b) continue;
    visibleSamples++;
    maxPixelError = Math.max(maxPixelError, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  return { maxBallError, maxPixelError, visibleSamples, float64Residual: residual, width, height };
}

export function screenPoint(p, { screenMatrix, width = 1, height = 1 } = {}) {
  if (!screenMatrix) return [((p[0] + 1) * width) / 2, ((1 - p[1]) * height) / 2];
  const q = transform(screenMatrix, [...p, 1]);
  if (q[3] <= 1e-12) return null;
  return [((q[0] / q[3] + 1) * width) / 2, ((1 - q[1] / q[3]) * height) / 2];
}
export function pointSegmentDistance(p, a, b) {
  const v = b.map((x, i) => x - a[i]),
    norm = v.reduce((s, x) => s + x * x, 0);
  const u = norm ? Math.max(0, Math.min(1, v.reduce((s, x, i) => s + x * (p[i] - a[i]), 0) / norm)) : 0;
  return Math.hypot(...p.map((x, i) => x - a[i] - u * v[i]));
}

// A Poincaré geodesic is a positive rational quadratic. Its projected control
// polygon bounds screen deviation whenever its clip weights have one sign.
function poincareControls(a, b) {
  const middle = geodesicPoint(a, b, 0.5),
    halfCosh = Math.sqrt(Math.max(1, (1 - lorentzInner(a, b)) / 2));
  const controls = [
    [a[1], a[2], a[3], a[0] + 1],
    [middle[1], middle[2], middle[3], middle[0] + halfCosh],
    [b[1], b[2], b[3], b[0] + 1],
  ];
  return controls;
}
export function geodesicOutsideFrustum(a, b, model, screenMatrix) {
  if (!screenMatrix) return false;
  const controls =
    model === 'klein' ? [projectPoint(a, model), projectPoint(b, model)].map((p) => [...p, 1]) : poincareControls(a, b);
  const clip = controls.map((p) => transform(screenMatrix, p));
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [-1, 1]) if (clip.every((q) => q[3] + sign * q[axis] < 0)) return true;
  return false;
}
function deviationBound(a, b, options) {
  const controls = poincareControls(a, b);
  const clip = options.screenMatrix ? controls.map((p) => transform(options.screenMatrix, p)) : controls;
  if (clip.every((q) => q[3] < -1e-12)) return { bound: 0, invisible: true };
  if (clip.some((q) => q[3] <= 1e-12)) return { bound: Infinity };
  const screen = clip.map((q) => [((q[0] / q[3] + 1) * options.width) / 2, ((1 - q[1] / q[3]) * options.height) / 2]);
  return { bound: pointSegmentDistance(screen[1], screen[0], screen[2]) };
}
export function sampleGeodesic(a, b, options = {}) {
  const settings = {
    model: 'poincare',
    width: 1,
    height: 1,
    tolerancePx: 1,
    maxDepth: 24,
    maxSegments: 4096,
    ...options,
  };
  const { model, tolerancePx, maxDepth, maxSegments } = settings;
  if (
    !Number.isFinite(tolerancePx) ||
    tolerancePx <= 0 ||
    !Number.isInteger(maxSegments) ||
    maxSegments < 1 ||
    !Number.isInteger(maxDepth) ||
    maxDepth < 0 ||
    maxDepth > 30 ||
    !Number.isFinite(settings.width) ||
    settings.width <= 0 ||
    !Number.isFinite(settings.height) ||
    settings.height <= 0 ||
    (settings.screenMatrix && !finiteVector(settings.screenMatrix, 16))
  )
    throw new RangeError('Invalid geodesic sampling limits or screen transform.');
  const first = projectPoint(a, model),
    last = projectPoint(b, model);
  if (model === 'klein') return { points: [first, last], qualityCapped: false, maxDeviationPx: 0 };
  const points = [first],
    stack = [{ a, b, depth: 0 }];
  let qualityCapped = false,
    maxDeviationPx = 0;
  while (stack.length) {
    const item = stack.pop(),
      { bound } = deviationBound(item.a, item.b, settings);
    if (bound <= tolerancePx || item.depth >= maxDepth || points.length + stack.length >= maxSegments) {
      qualityCapped ||= bound > tolerancePx;
      maxDeviationPx = Math.max(maxDeviationPx, bound);
      points.push(projectPoint(item.b, model));
    } else {
      const mid = geodesicPoint(item.a, item.b, 0.5);
      stack.push({ a: mid, b: item.b, depth: item.depth + 1 }, { a: item.a, b: mid, depth: item.depth + 1 });
    }
  }
  return { points, qualityCapped, maxDeviationPx };
}

export function clipBallSegment(a, b, screenMatrix) {
  if (!screenMatrix) return [a, b];
  const q = [a, b].map((p) => transform(screenMatrix, [...p, 1]));
  let lo = 0,
    hi = 1;
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [-1, 1]) {
      const f = q[0][3] + sign * q[0][axis],
        g = q[1][3] + sign * q[1][axis];
      if (f < 0 && g < 0) return null;
      if (f < 0) lo = Math.max(lo, f / (f - g));
      if (g < 0) hi = Math.min(hi, f / (f - g));
    }
  return lo <= hi ? [lo, hi].map((u) => a.map((x, i) => x + u * (b[i] - x))) : null;
}
