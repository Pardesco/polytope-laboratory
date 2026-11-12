/** Metric/content preflight; native preparation checks support and full incidence. */
export function h3SnubEligible(model) {
  const { vertices: v, edges: e, faces: f, cells: c = [] } = model ?? {},
    n = v?.length;
  if (
    model?.dimension !== 3 ||
    (model.embeddingDimension ?? 3) !== 3 ||
    model.interpretation !== 'convex-polytope' ||
    !Array.isArray(v) ||
    !Array.isArray(e) ||
    !Array.isArray(f) ||
    ![12, 20].includes(n) ||
    e.length !== 30 ||
    f.length !== (n === 20 ? 12 : 20) ||
    !Array.isArray(c) ||
    c.length
  )
    return false;
  if (!v.every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite))) return false;
  const center = [0, 1, 2].map((k) => v.reduce((s, p) => s + p[k], 0) / n),
    cloud = v.map((p) => p.map((x, k) => x - center[k])),
    radius = Math.max(...cloud.map((p) => Math.hypot(...p)));
  if (!(radius > 0) || !Number.isFinite(radius)) return false;
  const unit = cloud.map((p) => p.map((x) => x / radius)),
    phi = (1 + Math.sqrt(5)) / 2,
    reference = [];
  if (n === 20) for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) reference.push([x, y, z]);
  for (const a of [-1, 1])
    for (const b of [-1, 1])
      reference.push(
        ...(n === 12
          ? [
              [0, a, b * phi],
              [a, b * phi, 0],
              [b * phi, 0, a],
            ]
          : [
              [0, a / phi, b * phi],
              [a / phi, b * phi, 0],
              [b * phi, 0, a / phi],
            ])
      );
  const norm = Math.hypot(...reference[0]),
    distance = (a, b) => Math.hypot(...a.map((x, k) => x - b[k]));
  const expected = reference.map((p) => distance(p, reference[0]) / norm).sort((a, b) => a - b),
    distances = unit.map((a) => unit.map((b) => distance(a, b)));
  if (
    !distances.every((row) =>
      row
        .slice()
        .sort((a, b) => a - b)
        .every((x, k) => Math.abs(x - expected[k]) < 1e-8)
    )
  )
    return false;
  const edgeKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`),
    edges = new Set();
  for (const pair of e) {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      !pair.every((i) => Number.isInteger(i) && i >= 0 && i < n) ||
      Math.abs(distances[pair[0]][pair[1]] - expected[1]) >= 1e-8
    )
      return false;
    edges.add(edgeKey(...pair));
  }
  if (edges.size !== 30) return false;
  const faces = new Set();
  for (const face of f) {
    if (
      !Array.isArray(face) ||
      face.length !== (n === 20 ? 5 : 3) ||
      new Set(face).size !== face.length ||
      !face.every((i) => Number.isInteger(i) && i >= 0 && i < n) ||
      !face.every((a, k) => edges.has(edgeKey(a, face[(k + 1) % face.length])))
    )
      return false;
    faces.add(
      face
        .slice()
        .sort((a, b) => a - b)
        .join(',')
    );
  }
  return faces.size === f.length;
}
