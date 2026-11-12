import { h3SnubEligible } from './snub-morph-h3.mjs';
/** A source-content gate; native preparation independently validates incidence. */
export function snubEligible(model) {
  if ([12, 20].includes(model?.vertices?.length)) return h3SnubEligible(model);
  if (model?.dimension !== 3 || (model.embeddingDimension ?? 3) !== 3 || model.interpretation !== 'convex-polytope')
    return false;
  const { vertices: v, edges: e, faces: f, cells: c = [] } = model;
  if (
    !Array.isArray(v) ||
    v.length !== 8 ||
    !Array.isArray(e) ||
    e.length !== 12 ||
    !Array.isArray(f) ||
    f.length !== 6 ||
    !Array.isArray(c) ||
    c.length
  )
    return false;
  if (!v.every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite))) return false;
  const a = Math.abs(v[0][0]);
  if (!(a > 0) || !v.every((p) => p.every((x) => Math.abs(x) === a))) return false;
  if (new Set(v.map((p) => p.join(','))).size !== 8) return false;
  const edgeKey = (x, y) => [x, y].sort((a, b) => a - b).join(','),
    expected = new Set();
  for (let i = 0; i < 8; i++)
    for (let j = i + 1; j < 8; j++) if (v[i].filter((x, k) => x !== v[j][k]).length === 1) expected.add(edgeKey(i, j));
  const edges = new Set();
  for (const pair of e) {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      !pair.every((i) => Number.isInteger(i) && i >= 0 && i < 8) ||
      !expected.has(edgeKey(...pair))
    )
      return false;
    edges.add(edgeKey(...pair));
  }
  if (edges.size !== 12) return false;
  const planes = new Set();
  for (const face of f) {
    if (
      !Array.isArray(face) ||
      face.length !== 4 ||
      new Set(face).size !== 4 ||
      !face.every((i) => Number.isInteger(i) && i >= 0 && i < 8)
    )
      return false;
    if (!face.every((x, k) => edges.has(edgeKey(x, face[(k + 1) % 4])))) return false;
    const axis = [0, 1, 2].find((k) => face.every((i) => v[i][k] === v[face[0]][k]));
    if (axis === undefined) return false;
    planes.add(axis + ':' + v[face[0]][axis]);
  }
  return planes.size === 6;
}

export const SNUB_HELP =
  'Via-snub: centered axis-aligned Cube (uniform ratio ≈0.456311), or regular Dodecahedron / Icosahedron (uniform ratio 0.5, either direction and orientation). H3 polarity uses the geometric center. Exact endpoint parameters 0 and 1; numerical interiors 0.001–0.999. Open endpoint collars refuse without snapping. Approximate declared paths; other sources and 4D unavailable.';
export function snubFrameStatus(frame) {
  const r = frame?.normalizedResiduals;
  return r
    ? ` · normalized planarity ${r.planarity.toExponential(1)} · support violation ${r.supportViolation.toExponential(1)} · strict gap ${r.minimumStrictSupportGap.toExponential(1)}`
    : '';
}
