import { selectStellationCells } from './stellation-cell-controls.mjs';
const selection = (controls) => (controls.context.getConfig().selectedRegions ?? []).slice().sort((a, b) => a - b);
const signature = (controls) => JSON.stringify(selection(controls));
const message =
  'Full-facet connectivity inside the observation box; clipped, unbounded and uncertain regions seed the exterior. Float64, not certified.';

export function installCavityControls(controls) {
  const root = document.createElement('div');
  root.innerHTML = `<button id="stellation-cavity-inspect">Inspect inaccessible cells</button>
    <button id="stellation-cavity-base">Fill inaccessible cells and make base</button>
    <output id="stellation-cavity-status" aria-live="polite">${message}</output>`;
  controls.face('base').before(root);
  const guard = (fn) => (controls.context.guard ? controls.context.guard(fn) : fn);
  controls.panel.querySelector('#stellation-cavity-inspect').onclick = guard(() => inspectCavities(controls));
  controls.panel.querySelector('#stellation-cavity-base').onclick = guard(() => controls.makeBase('fill'));
}

export async function inspectCavities(controls) {
  controls.verify();
  if (controls.busy) throw Error('Finish the current diagram job.');
  const receipt = controls.receipt,
    before = signature(controls),
    controller = new AbortController();
  controls.cavityController = controller;
  controls.cavityReport = null;
  controls.busy = true;
  controls.sync();
  const verify = () => {
    if (controller.signal.aborted) throw Object.assign(Error('Cavity inspection canceled.'), { name: 'AbortError' });
    controls.verify(receipt);
    if (controls.receipt !== receipt || signature(controls) !== before)
      throw Error('Cell selection changed during cavity inspection.');
  };
  try {
    const report = await controls.context.run(
      'stellation-cavity-analysis',
      { arrangement: structuredClone(receipt.arrangement), region_ids: selection(controls) },
      JSON.parse(receipt.owner.modelSignature),
      'Inspect inaccessible stellation cells',
      { signal: controller.signal }
    );
    verify();
    const expected = selectStellationCells(receipt.graph, selection(controls), 'fill'),
      added = expected.filter((i) => !selection(controls).includes(i));
    if (
      report?.algorithmVersion !== '0.1.0' ||
      report.arrangementSha256 !== receipt.graph.arrangementSha256 ||
      report.sourceFingerprint !== receipt.graph.sourceFingerprint ||
      JSON.stringify(report.selectedRegionIds) !== before ||
      JSON.stringify(report.filledRegionIds) !== JSON.stringify(expected) ||
      JSON.stringify(report.cavityRegionIds) !== JSON.stringify(added) ||
      !Number.isFinite(report.addedVolume) ||
      report.addedVolume < 0 ||
      !Number.isFinite(report.partitionVolumeResidual) ||
      report.partitionVolumeResidual < 0 ||
      !Number.isSafeInteger(report.boundaryFacetCounts?.preserve) ||
      !Number.isSafeInteger(report.boundaryFacetCounts?.fill)
    )
      throw Error('Invalid native cavity receipt.');
    controls.cavityReport = { receipt, before, report };
    return report;
  } finally {
    if (controls.cavityController === controller) {
      controls.cavityController = null;
      controls.busy = false;
    }
    controls.sync();
  }
}

export function syncCavityControls(controls) {
  const node = controls.panel.querySelector('#stellation-cavity-status');
  if (!node) return;
  const cached = controls.cavityReport;
  if (!cached || cached.receipt !== controls.receipt || cached.before !== signature(controls)) {
    controls.cavityReport = null;
    node.textContent = message;
    return;
  }
  const report = cached.report,
    ids = report.cavityRegionIds;
  node.textContent = `${ids.length} inaccessible cells${ids.length ? ': ' + ids.map((i) => 'R' + i).join(', ') : ''}. Fill adds ${report.addedVolume.toPrecision(6)} model units³; boundary facets ${report.boundaryFacetCounts.preserve} → ${report.boundaryFacetCounts.fill}. Partition volume residual ${report.partitionVolumeResidual.toExponential(2)}. ${message}`;
}
