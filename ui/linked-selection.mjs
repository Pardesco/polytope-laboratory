import { selectionElements } from './element-visibility.mjs';
const fields = { vertex: 'vertices', edge: 'edges', face: 'faces', cell: 'cells' };
const vertices = (m, kind, id) =>
  kind === 'vertex'
    ? [id]
    : kind === 'cell'
      ? [...new Set(m.cells[id].flatMap((f) => m.faces[f]))]
      : m[fields[kind]][id];
export function derivedLinks(source, result, mode, entity) {
  const target = result?.model;
  if (!target) return null;
  if (result.sourceId && result.sourceId !== source.id) return null;
  if (
    ['dual', 'incidence-dual'].includes(mode) &&
    target.provenance?.sourceFingerprint &&
    target.provenance.sourceFingerprint !== source.fingerprint
  )
    return null;
  const stored = target.metadata?.viewLinks;
  if (stored?.sourceFingerprint === source.fingerprint) return stored.entities;
  if (mode === 'incidence-dual' && source.dimension === 3) {
    const meta = target.metadata ?? {};
    if (meta.dualSourceFaceIds && meta.dualSourceVertexIds)
      return {
        vertex: meta.dualSourceFaceIds.map((id) => ({ kind: 'face', id })),
        face: meta.dualSourceVertexIds.map((id) => ({ kind: 'vertex', id })),
      };
  }
  if (!['section', 'cell-section', 'vertex-figure'].includes(mode) || !result.sourceReferences) return null;
  const size = (m) => Object.values(fields).reduce((sum, k) => sum + (m[k]?.length ?? 0), 0);
  if (size(source) * size(target) > 1000000) return null;
  const refs = result.sourceReferences;
  const link = (sourceKind, targetKind) => {
    const sets = (source[fields[sourceKind]] ?? []).map((_, id) => new Set(vertices(source, sourceKind, id)));
    return (target[fields[targetKind]] ?? []).map((_, id) => {
      const targetVertices = vertices(target, targetKind, id);
      const ids = sets.flatMap((set, i) =>
        targetVertices.every((v) =>
          (refs[v] ?? []).some(
            (r) =>
              (r.vertex !== undefined && set.has(r.vertex)) ||
              (r.edge !== undefined && source.edges[r.edge]?.every((x) => set.has(x)))
          )
        )
          ? [i]
          : []
      );
      return ids.length ? { kind: sourceKind, id: ids[0], ids } : null;
    });
  };
  return {
    vertex: link('edge', 'vertex'),
    edge: link('face', 'edge'),
    face: link(source.dimension === 4 ? 'cell' : 'face', 'face'),
    ...(mode === 'vertex-figure' ? { figureVertex: entity } : {}),
  };
}
export function linkedSelection(links, selection) {
  if (!links || !selection) return null;
  const ids = new Set(selectionElements(selection));
  if (selection.kind === 'vertex' && ids.has(links.figureVertex))
    return { kind: 'vertex', indices: links.vertex.map((_, i) => i) };
  const matched = Object.entries(links)
    .filter(([, rows]) => Array.isArray(rows))
    .map(([kind, rows]) => ({
      kind,
      indices: rows.flatMap((row, i) =>
        row?.kind === selection.kind && (row.ids ?? [row.id]).some((id) => ids.has(id)) ? [i] : []
      ),
    }))
    .filter((row) => row.indices.length);
  return matched.sort((a, b) => Object.keys(fields).indexOf(b.kind) - Object.keys(fields).indexOf(a.kind))[0] ?? null;
}
export function sourceSelection(links, kind, id) {
  const row = links?.[kind]?.[id];
  return row ? { kind: row.kind, ids: row.ids ?? [row.id] } : null;
}
