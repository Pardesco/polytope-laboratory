export const FITTING_DOMAIN_COPY =
  'Convex 3D/4D, or 2–8 disjoint convex 3D boundary components; at most 64 vertices. Connected nonconvex/star boundaries are unsupported. Component fits preserve each vertex centroid; Keep symmetry is unavailable.';

export function eligibleFittingSource(m) {
  if (
    ![3, 4].includes(m?.dimension) ||
    (m.embeddingDimension ?? m.dimension) !== m.dimension ||
    !Array.isArray(m.vertices) ||
    m.vertices.length > 64
  )
    return false;
  if (m.interpretation === 'convex-polytope') return true;
  if (m.interpretation !== 'generalized-complex' || m.dimension !== 3 || m.cells?.length || !Array.isArray(m.edges))
    return false;
  const graph = m.vertices.map(() => new Set());
  for (const e of m.edges) {
    if (
      !Array.isArray(e) ||
      e.length !== 2 ||
      e.some((v) => !Number.isInteger(v) || v < 0 || v >= graph.length) ||
      e[0] === e[1]
    )
      return false;
    graph[e[0]].add(e[1]);
    graph[e[1]].add(e[0]);
  }
  const remaining = new Set(graph.keys());
  let count = 0;
  while (remaining.size) {
    const first = remaining.values().next().value,
      todo = [first];
    remaining.delete(first);
    let size = 0;
    while (todo.length) {
      const v = todo.pop();
      size++;
      for (const w of graph[v]) if (remaining.delete(w)) todo.push(w);
    }
    if (size < 4 || ++count > 8) return false;
  }
  return count >= 2;
}
