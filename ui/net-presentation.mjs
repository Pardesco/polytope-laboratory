export function literalNetIndex(text, count, label) {
  if (!Number.isSafeInteger(count) || count < 1) throw Error('The source has no available ' + label + ' indices.');
  const literal = typeof text === 'string' ? text.trim() : '';
  const value = Number(literal);
  if (!/^\d+$/.test(literal) || !Number.isSafeInteger(value) || value < 0 || value >= count)
    throw Error(`Choose a literal ${label} index from 0 to ${Math.max(0, count - 1)}.`);
  return value;
}
export function faceNetSummary(net) {
  const pieces = net.components.length,
    faces = net.overlapPairs.length,
    tabs = net.tabOverlapPairs.length;
  return (
    (net.visibleSurface ? 'Assembled from the outer surface.\n' : '') +
    `${net.faces.length} faces in ${pieces} connected piece${pieces === 1 ? '' : 's'}\n${net.hinges.length} hinges · E0 = ${net.referenceEdgeLengthMm} mm\n` +
    (faces || tabs
      ? `${faces} face overlap pairs · ${tabs} tab overlap pairs. Check the layout before printing.`
      : 'No face or tab overlaps in the flat layout.')
  );
}
export function cellNetSummary(net) {
  return `${net.cells.length} complete cells · ${net.components.length} connected pieces\n${net.connections.length} face connections\nCell intersections not checked.`;
}
export function cellNetChecks(net) {
  return `Rigidity error ${net.validation.maxRigidDistanceError.toExponential(2)} · face gap ${net.validation.maxConnectedFaceGap.toExponential(2)} model units\n${net.domain ?? ''}`;
}
export function currentFaceNet(state) {
  const net = state?.netLayout,
    c = state?.view.net,
    model = state?.model;
  return Boolean(
    net &&
      c &&
      model &&
      net.sourceFingerprint === model.fingerprint &&
      (!net.sourceId || net.sourceId === model.id) &&
      net.root === c.root &&
      net.referenceEdgeLengthMm === c.length &&
      net.tabs === c.tabs &&
      JSON.stringify(net.tabOptions ?? null) === JSON.stringify(c.tabOptions ?? null) &&
      JSON.stringify(net.elementAnnotations ?? null) === JSON.stringify(state.view.elementAnnotations ?? null) &&
      JSON.stringify(net.printSource?.metadata?.offColors?.faces ?? null) ===
        JSON.stringify(model.metadata?.offColors?.faces ?? null)
  );
}

export function netOverlapTargets(net) {
  const faces = new Set((net?.overlapPairs ?? []).flat()),
    tabs = new Set();
  for (const pair of net?.tabOverlapPairs ?? []) {
    tabs.add(pair.edge);
    if (pair.otherTabEdge !== undefined) tabs.add(pair.otherTabEdge);
    if (pair.face !== undefined) faces.add(pair.face);
  }
  for (const tab of net?.tabRecords ?? []) if (tabs.has(tab.edge)) faces.add(tab.face);
  return { faces, tabs };
}

export function highlightNetOverlaps(preview, net, visible) {
  const { faces, tabs } = netOverlapTargets(net);
  for (const node of preview?.querySelectorAll('[data-net-face], [data-net-tab]') ?? []) {
    const affected =
      node.dataset.netTab !== undefined
        ? tabs.has(Number(node.dataset.netTab))
        : faces.has(Number(node.dataset.netFace));
    node.classList.toggle('net-overlap-mark', Boolean(visible && affected));
  }
}

export function paperPrintAppearance(page) {
  const polygons = [
      ...(page.svg ?? '').matchAll(/<(?:\w+:)?g\b[^>]*data-net-face="[^"]*"[^>]*>[\s\S]*?<(?:\w+:)?polygon\b([^>]*)>/g),
    ],
    filled = polygons.filter(([, attributes]) => {
      const fill = attributes.match(/\bfill="([^"]*)"/)?.[1],
        opacity = attributes.match(/\bfill-opacity="([^"]*)"/)?.[1];
      return fill && !['none', 'transparent'].includes(fill) && (opacity === undefined || Number(opacity) > 0);
    }).length;
  return filled
    ? filled === polygons.length
      ? 'Filled face colors'
      : 'Filled and outline faces'
    : 'Outline faces (no face color fill)';
}

export function paperPageCaption(packed, page, index) {
  return `Page ${index + 1} of ${packed.pageCount} · ${page.widthMm} × ${page.heightMm} mm · E0 = ${packed.referenceEdgeLengthMm} mm · Print at 100% · ${paperPrintAppearance(page)}${packed.colorPrinting?.effectiveMode === 'separate' && page.paperColorLabel ? ' · Paper batch: ' + page.paperColorLabel : ''}${packed.colorPrinting?.crossColorCuts?.length ? ' · ' + packed.colorPrinting.crossColorCuts.length + ' detached print cuts' : ''}`;
}
