const canonical = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
export const surgeryParameters = canonical;
export function surgeryResultSignature(model) {
  return canonical({
    geometry: Object.fromEntries(
      ['dimension', 'embeddingDimension', 'interpretation', 'vertices', 'edges', 'faces', 'cells'].map((k) => [
        k,
        model?.[k],
      ])
    ),
    colors: model?.metadata?.offColors,
    construction: model?.metadata?.faceSurgery,
    numeric: model?.numeric,
  });
}
export function checkSurgeryPreview(packet, params) {
  const m = packet?.model,
    info = packet?.construction;
  if (
    !m?.validation?.passed ||
    m.dimension !== 3 ||
    m.embeddingDimension !== 3 ||
    m.numeric?.certified !== false ||
    !info ||
    info.mode !== params.mode ||
    canonical(info) !== canonical(m.metadata?.faceSurgery) ||
    m.provenance?.operation !== 'face-surgery' ||
    canonical(m.provenance.parameters) !== canonical(params)
  )
    throw Error('Native surgery preview or ownership receipt is malformed.');
  if (
    ['augment', 'excavate'].includes(params.mode) &&
    (!Array.isArray(info.faceOrigins) ||
      info.faceOrigins.length !== m.faces.length ||
      !Number.isFinite(info.maximumMatchResidual) ||
      info.maximumMatchResidual < 0 ||
      !Number.isFinite(info.matchTolerance) ||
      info.matchTolerance <= 0 ||
      info.maximumMatchResidual > info.matchTolerance)
  )
    throw Error('Native surgery preview has missing face owners or an unsupported match residual.');
  return packet;
}
export function describeSurgeryPreview(packet) {
  const { model: m, construction: info } = packet;
  const targets = info.removedBaseFaces?.join(', ');
  const residual = info.maximumMatchResidual;
  const summary =
    `${m.vertices.length} vertices · ${m.edges.length} edges · ${m.faces.length} faces. ` +
    (targets ? `Target face IDs: ${targets}. ` : '') +
    (Number.isFinite(residual)
      ? `Maximum face-match residual ${residual.toExponential(3)} source units (tolerance ${info.matchTolerance.toExponential(3)}). `
      : '') +
    `Float64 approximate. ${info.coplanarFaceReduction ?? 0} coplanar faces removed by blending.`;
  const owners = (info.faceOrigins ?? [])
    .map((group, i) => {
      const color = m.metadata?.offColors?.faces?.[i];
      return (
        `Face ${i}: ` +
        group
          .map(
            (owner) =>
              `${owner.source} face ${owner.faceId}${owner.attachmentFaceId === undefined ? '' : ` at base face ${owner.attachmentFaceId}`}; color ${owner.colorSource ? `${owner.colorSource.source} face ${owner.colorSource.faceId}` : 'unassigned'}`
          )
          .join(' + ') +
        ` · ${color ? `${color.encoding} ${color.values.length === 4 ? 'RGBA' : 'RGB'} [${color.values.join(', ')}]` : 'unassigned'}`
      );
    })
    .join('\n');
  return { summary, owners };
}
