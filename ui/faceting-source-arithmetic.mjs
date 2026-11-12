export function sourceArithmeticText(receipt) {
  const domain = receipt.candidateDomain,
    group = receipt.sourceSymmetry;
  return (
    `${receipt.status}: supplied-coordinate arithmetic. ` +
    `${domain.planes} planes; ${domain.cycles} cycles; ${domain.sourceFaceCyclesPresent}/${receipt.sourceFaces.length} source face cycles present. ` +
    (group.complete
      ? `${group.order} exact source actions (${group.properOrder} proper). `
      : 'Full source group unresolved. ') +
    `${receipt.nonplanarSourceFaceIds.length} source faces fail exact planarity; maximum approximate anchor-plane distance ${receipt.maximumAnchorPlaneDistanceApprox}. ` +
    receipt.diagnostics.join(' ') +
    ' ' +
    receipt.searchScope
  );
}
