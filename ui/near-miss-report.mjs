export function nearMissCatalogText(model) {
  const metadata = model?.metadata,
    e = metadata?.nearMissRealization,
    m = e?.metrics;
  if (
    metadata?.nearMiss !== true ||
    !model.fingerprint ||
    e?.resultFingerprint !== model.fingerprint ||
    ![
      'maximumEdgeDeviationPercent',
      'maximumFaceEdgeDeviationPercent',
      'maximumFaceAngleDeviationDegrees',
      'maximumPlanarity',
    ].every((k) => Number.isFinite(m?.[k]) && m[k] >= 0)
  )
    return '';
  return `Approximate near miss: edges within ${m.maximumEdgeDeviationPercent.toFixed(3)}% of the global mean; face edges within ${m.maximumFaceEdgeDeviationPercent.toFixed(3)}% of each face mean; angles within ${m.maximumFaceAngleDeviationDegrees.toFixed(3)}° of regular polygons; planarity ${m.maximumPlanarity.toExponential(2)} × mean edge. ${metadata.faceConfiguration}. Symmetry ${metadata.symmetryGroup}, order ${metadata.symmetryOrder} (numerical). Faces are not all regular; no exact or globally optimal realization is claimed.`;
}

export function appendNearMissReport(document, parent, model) {
  const text = nearMissCatalogText(model);
  if (!text) return;
  const row = document.createElement('p');
  row.id = 'near-miss-catalog';
  row.textContent = text;
  parent.append(row);
  const details = document.createElement('details');
  details.id = 'near-miss-catalog-evidence';
  const summary = document.createElement('summary');
  summary.textContent = 'Near-miss construction and references';
  details.append(summary);
  const e = model.metadata.nearMissRealization,
    note = document.createElement('p');
  note.textContent = e.construction + ' ' + e.numericContract;
  details.append(note);
  if (e.publishedComparison) {
    const comparison = document.createElement('p'),
      p = e.publishedComparison;
    comparison.textContent =
      `Published ${p.entry}: total edge error ${p.published.aggregateEdgeErrorUnitEdge} (unit edges), total angle error ${p.published.aggregateAngleDeviationDegrees}°. ` +
      (p.passed === true
        ? `Independent reference: ${p.referenceMeasured.aggregateEdgeErrorUnitEdge.toFixed(4)} and ${p.referenceMeasured.aggregateAngleDeviationDegrees.toFixed(3)}°, within ±${p.absoluteTolerance.aggregateEdgeErrorUnitEdge} and ±${p.absoluteTolerance.aggregateAngleDeviationDegrees}°. `
        : '') +
      p.scope;
    details.append(comparison);
  }
  for (const reference of e.references ?? []) {
    if (typeof reference !== 'string' || !reference.startsWith('https://')) continue;
    const source = document.createElement('p');
    source.textContent = 'Reference: ' + reference;
    details.append(source);
  }
  parent.append(details);
}
