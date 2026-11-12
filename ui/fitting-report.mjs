export function nearMissText(deviation) {
  if (!deviation || deviation.unavailable) return '';
  const keys = [
    'maximumEdgeDeviationPercent',
    'maximumFaceEdgeDeviationPercent',
    'maximumFaceAngleDeviationDegrees',
    'maximumPlanarity',
  ];
  if (keys.some((key) => !Number.isFinite(deviation[key]))) return '';
  return `${deviation.nearlyRegularFaces ? 'Nearly regular faces' : 'Face deviations'} (numerical): edge ${deviation.maximumEdgeDeviationPercent.toPrecision(3)}% max from global mean; face edges ${deviation.maximumFaceEdgeDeviationPercent.toPrecision(3)}% max from face mean; angles ${deviation.maximumFaceAngleDeviationDegrees.toPrecision(3)}° max; planarity ${deviation.maximumPlanarity.toExponential(2)} × mean edge. No catalog classification inferred.`;
}

export function fittingResultText(packet) {
  const e = packet.evidence,
    r = e.residuals,
    lines = [
      `${(e.converged ?? (e.solverTermination.success && e.requestedConstraintsSatisfied)) ? 'Converged' : 'Not converged'} · ${e.requestedConstraintsSatisfied ? 'tolerance met' : 'tolerance not met'}`,
    ];
  for (const [key, value] of Object.entries(e.conditions ?? {}))
    lines.push(
      `${key}: max ${value.before.maximum.toExponential(3)} → ${value.after.maximum.toExponential(3)}; RMS ${value.before.rms.toExponential(3)} → ${value.after.rms.toExponential(3)}`
    );
  if (!e.conditions)
    lines.push(
      `Max ${r.maximum.toExponential(3)} · RMS ${r.rms.toExponential(3)} · planarity ${r.maximumPlanarity.toExponential(3)}`
    );
  lines.push(`${packet.status} · ${e.solverTermination.evaluations ?? 'unavailable'} evaluations`);
  if (e.solverTermination.message) lines.push(e.solverTermination.message);
  if (e.symmetry?.complete) lines.push(`Preserved source symmetry: order ${e.symmetry.order} (numerical).`);
  if (e.generalizedComponents) {
    const g = e.generalizedComponents,
      q = g.qualification;
    lines.push(`Disjoint convex boundaries: ${g.maps.length} components; vertex centroids preserved.`);
    if (q?.separations?.length)
      lines.push(
        `Minimum separating-plane gap: ${Math.min(...q.separations.map((s) => s.gapMeanEdgeUnits)).toExponential(3)} × source mean edge (numerical).`
      );
  }
  if (e.parameters?.face_ids)
    lines.push(
      `Regular-face objective: source faces ${e.parameters.face_ids.join(', ')}; edge/area objectives remain global.`
    );
  if (!packet.model) lines.push('Invalid fitted boundary: ' + e.geometricValidity.diagnostics.join(' '));
  lines.push('Numerical residuals only; uniformity and near-miss classification are not established.');
  return lines.join('\n');
}
