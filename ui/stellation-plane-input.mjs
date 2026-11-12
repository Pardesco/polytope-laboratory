import { NumericEntry } from './numeric-entry.mjs';

export function mountPlaneInput(c) {
  const panel = document.createElement('details');
  panel.id = 'stellation-arbitrary-settings';
  panel.innerHTML = `<summary>Arbitrary planes and observation bounds</summary>
    <p class="muted">Enter 1–32 rows: nx, ny, nz, offset for n·x + offset = 0. Expressions are accepted. The negative side has sign +1. Bounds are in source coordinates; a convex 3D model supplies the reference and symmetry group.</p>
    <label>Plane equations <textarea id="stellation-arbitrary-planes" rows="6" maxlength="16384" aria-label="Arbitrary plane equations"></textarea></label>
    <label>Minimum XYZ <input id="stellation-bounds-min" value="-2, -2, -2"></label>
    <label>Maximum XYZ <input id="stellation-bounds-max" value="2, 2, 2"></label>
    <label>Region limit <input id="stellation-region-limit" value="2048"></label>
    <button id="stellation-evaluate-arbitrary" class="wide">Evaluate arbitrary-plane arrangement</button>
    <p class="muted">This replaces the facial planes. Use Evaluate facial-plane arrangement to return. Completion is numerical and limited to this observation box; the region limit stops incomplete work.</p>`;
  c.$('stellation-evaluate').after(panel);
  c.$('stellation-evaluate-arbitrary').onclick = c.guard(() => editPlaneInput(c));
  syncPlaneInput(c);
}
export function syncPlaneInput(c) {
  if (!c.getState?.()) return;
  const config = c.config(),
    text = config.arbitraryPlaneText ?? '1, 0, 0, 0\n0, 1, 0, 0\n0, 0, 1, 0';
  c.$('stellation-arbitrary-planes').value = text;
  c.$('stellation-bounds-min').value = config.arbitraryBoundsText?.[0] ?? '-2, -2, -2';
  c.$('stellation-bounds-max').value = config.arbitraryBoundsText?.[1] ?? '2, 2, 2';
  c.$('stellation-region-limit').value = config.maxRegions ?? 2048;
  c.$('stellation-seed').disabled = config.planeMode === 'arbitrary';
  c.$('stellation-include-seed').disabled = config.planeMode === 'arbitrary' || config.searchCriteria === 'miller';
}
export function planeInputTarget(c) {
  return [
    'stellation-arbitrary-planes',
    'stellation-bounds-min',
    'stellation-bounds-max',
    'stellation-region-limit',
  ].map((id) => c.$(id).value);
}
export async function editPlaneInput(c) {
  if (c.numericEntry?.busy) throw Error('Finish or cancel the current numeric edit first.');
  const text = planeInputTarget(c),
    rows = text[0]
      .trim()
      .split(/\r?\n/)
      .filter((row) => row.trim());
  if (!rows.length || rows.length > 32 || text[0].length > 16384)
    throw Error('Supply 1–32 plane rows, at most 16,384 characters.');
  if (c.getModel().dimension !== 3) throw Error('Arbitrary-plane editing requires a convex 3D reference model.');
  const entry = new NumericEntry({
    ...c.context,
    getTarget: () => {
      const s = c.getState(),
        v = s.view.stellation ?? {};
      return [
        planeInputTarget(c),
        JSON.stringify([
          v.boxScale,
          v.planeIds,
          v.planeMode,
          v.arbitraryPlanes,
          v.arbitraryBounds,
          v.maxRegions,
          v.selectedRegions,
          v.diagramPlane,
          v.display,
        ]),
        s.view.derivedMode ?? null,
      ];
    },
  });
  c.numericEntry = entry;
  try {
    return await entry.run(
      {
        planes: { kind: 'rows', text: rows.join('\n'), length: 4 },
        low: { kind: 'vector', text: text[1], length: 3 },
        high: { kind: 'vector', text: text[2], length: 3 },
        limit: { text: text[3], integer: true, min: 1, max: 2048 },
      },
      ({ planes, low, high, limit }, verify) => {
        verify();
        if (planes.some((row) => Math.hypot(...row.slice(0, 3)) === 0)) throw Error('Plane normals must be nonzero.');
        if (low.some((value, i) => value >= high[i]))
          throw Error('Observation bounds must have positive extents in every axis.');
        const state = c.getState();
        Object.assign(c.config(state), {
          planeMode: 'arbitrary',
          arbitraryPlanes: planes,
          arbitraryBounds: [low, high],
          arbitraryPlaneText: text[0],
          arbitraryBoundsText: text.slice(1, 3),
          maxRegions: limit,
          selectedRegions: null,
          diagramPlane: 0,
          display: 'diagram',
          searchSymmetry: 'none',
          searchCriteria: 'custom',
          searchGeneratorIds: '',
          searchIncludeSeed: false,
        });
        state.view.derivedMode = 'stellation';
        c.$('derived-mode').value = 'stellation';
        c.$('stellation-display').value = 'diagram';
        c.$('stellation-plane').value = 0;
        c.$('stellation-symmetry').value = 'none';
        c.$('stellation-criteria').value = 'custom';
        c.$('stellation-generator-ids').value = '';
        c.$('stellation-include-seed').checked = false;
        c.searchSequence++;
        state.stellationSearch = null;
        c.renderSearch(null);
        syncPlaneInput(c);
        c.markDirty();
        c.refresh();
        return planes;
      }
    );
  } finally {
    if (c.numericEntry === entry) c.numericEntry = null;
  }
}
