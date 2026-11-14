import { NumericEntry } from './numeric-entry.mjs';
import * as THREE from 'three';
import { geodesicPoint, transform } from './hyperbolic-math.mjs';

export const patchLimits = (source) => ({ radius: 2, depth: source?.pqr?.join('') === '435' ? 5 : 3 });
export function patchSettings(source, value = {}) {
  const limits = patchLimits(source);
  return {
    radius: Number.isFinite(value.radius) ? Math.max(0, Math.min(limits.radius, value.radius)) : 2,
    depth: Number.isInteger(value.depth) ? Math.max(0, Math.min(limits.depth, value.depth)) : 3,
    mode: value.mode === 'complete-depth' ? 'complete-depth' : 'radius',
    paused: value.paused === true,
  };
}
const STOP_REASONS = {
  candidateLimit: 'candidate limit reached',
  cellLimit: '4,096-cell limit reached',
  cursorLimit: 'resume checkpoint too large',
  memoryLimit: 'memory limit reached',
  pageLimit: 'more pages pending',
  timeLimit: 'time limit reached',
  wordLimit: 'address limit reached',
};
export function coverageText(coverage, paused = false, quality) {
  const complete = coverage?.complete === true;
  const reason = coverage?.stopReason;
  const stop =
    complete || reason === 'radiusComplete' || reason === 'depthComplete'
      ? ''
      : ` · ${STOP_REASONS[reason] ?? (reason ? 'stopped: ' + reason : 'stop reason not reported')}`;
  const extent =
    coverage?.mode === 'radius'
      ? `${complete ? 'Complete' : 'Incomplete'} observer ball R=${coverage.radius} (at generation pose)`
      : `${complete ? 'Complete' : 'Incomplete'} adjacency layers ${coverage?.completedLayers?.join(', ') ?? 'not reported'}`;
  return `${paused ? 'Finite patch; generation paused' : !complete || quality?.capped ? 'Finite patch; generation limited' : 'Finite patch'}. ${extent}${stop}${quality?.capped ? ' · display capped: ' + quality.reasons.join(', ') : ''}.`;
}
const names = {
  '5,3': 'Dodecahedron',
  '4,3': 'Cube',
  '3,5': 'Icosahedron',
  '3,4': 'Octahedron',
};
const shape = (p, q) => `${names[[p, q].join(',')] ?? 'Regular polyhedron'} {${p},${q}}`;
const number = (x) => (typeof x === 'number' ? (x === 0 ? '0' : x.toExponential(3)) : 'not reported');
export function diagnosticRows(model, coverage, count) {
  const a = model.analysisReceipt ?? {},
    manifold = model.source.type === 'manifold';
  const pqr = manifold ? [5, 3, 4] : model.source.pqr;
  const template = model.anchorPatch.templates[0];
  const dot = (x, y) => -x[0] * y[0] + x.slice(1).reduce((s, v, i) => s + v * y[i + 1], 0);
  const [u, v] = template.edges[0].map((i) => template.vertices[i]);
  const edge = a.edgeLength ?? Math.acosh(Math.max(1, -dot(u, v)));
  const adjacent = template.faces
    .map((face, i) =>
      template.faces
        .slice(i + 1)
        .map((other, j) => (face.filter((v) => other.includes(v)).length === 2 ? [i, i + j + 1] : null))
    )
    .flat()
    .filter(Boolean);
  const angle =
    a.cellDihedral ??
    adjacent.reduce(
      (sum, [i, j]) => sum + Math.acos(Math.max(-1, Math.min(1, -dot(template.facePlanes[i], template.facePlanes[j])))),
      0
    ) / adjacent.length;
  const rows = [
    ['Cell', shape(pqr[0], pqr[1])],
    ['Vertex figure', shape(pqr[1], pqr[2])],
    ['Cells per edge', String(a.cellsPerEdge ?? pqr[2])],
    ['Edge length (float64 approximation)', `${edge.toPrecision(8)} hyperbolic units`],
    [
      'Dihedral angle (float64 approximation)',
      `${angle.toPrecision(8)} rad · ${((angle * 180) / Math.PI).toPrecision(7)}°`,
    ],
    [
      'Visible cell instances',
      `${count} loaded${coverage?.acceptedCells !== undefined ? ' / ' + coverage.acceptedCells + ' accepted' : ''} (before display caps)`,
    ],
    ['Coverage', coverageText(coverage)],
    ['Generation observer (t, x, y, z)', coverage?.observer?.map((x) => x.toPrecision(6)).join(', ') ?? 'not reported'],
    [
      'Cells missing within R',
      coverage?.mode === 'radius' && coverage.complete === true ? '0' : 'Unknown; no complete observer-ball receipt',
    ],
  ];
  if (manifold) {
    const c = a.counts;
    rows.push(
      ['Quotient (V,E,F,C)', c ? `(${c.vertices}, ${c.edges}, ${c.faces}, ${c.cells})` : 'not reported'],
      ['Euler characteristic χ', String(a.eulerCharacteristic ?? 'not reported')],
      ['Orientable', a.orientable === true ? 'Yes' : a.orientable === false ? 'No' : 'not reported'],
      [
        'H1 (integer chains)',
        a.H1
          ? `b1 = ${a.H1.freeRank}; torsion ${a.H1.torsion.length && a.H1.torsion.every((n) => n === a.H1.torsion[0]) ? '(Z/' + a.H1.torsion[0] + ')^' + a.H1.torsion.length : a.H1.torsion.map((n) => 'Z/' + n).join(' + ') || 'none'}. ${a.H1.verified ? 'Engine cellular and triangulation constructions agree; independent coset verification is a development report.' : 'Unverified'}`
          : 'not reported',
      ],
      ['Volume (coarse published reference)', '≈ 8 × 4.3062 = 34.4496; Vesnin Table 1, not certified']
    );
  } else rows.push(['Infinite total volume / Euler characteristic', 'Not reported']);
  return rows;
}
export function residualRows(residuals = {}, { generators = false } = {}) {
  const rows = [];
  for (const [key, absolute] of Object.entries(residuals)) {
    if (typeof absolute !== 'number' || /Relative$|Scale$/.test(key)) continue;
    const relative = residuals[key + 'Relative'],
      scale = residuals[key + 'Scale'];
    const spread = /spread/i.test(key);
    if (!generators && relative === undefined && !spread) continue;
    const gate = key === 'pointCorrection' ? null : spread ? 1e-7 : 1e-12;
    const value = relative ?? absolute;
    rows.push([
      {
        coordinates: 'Developed vertex metric',
        gram: 'Mirror Gram matrix',
        hyperboloid: 'Seed hyperboloid metric',
        reflectionMetric: 'Reflection metric',
        reflectionSquare: 'Reflection squared',
        coxeter: 'Coxeter relations',
        transformMetric: 'Developed transform metric',
        mergeDiscrepancy: 'Cell merge discrepancy',
        neighborDiscrepancy: 'Neighbor correspondence',
        matrixReconstruction: 'Word reconstruction',
        edgeRelativeSpread: 'Relative edge-length spread',
        pointCorrection: 'Point normalization correction',
      }[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2'),
      `abs ${number(absolute)} · rel ${number(value)} · scale ${number(scale ?? 1)} · gate ${gate === null ? 'not enforced (diagnostic)' : number(gate)} · ${gate === null ? 'INFO' : value <= gate ? 'PASS' : 'FAIL'}${relative !== undefined ? ' (metric scale²; correspondence scale)' : ' (unit scale)'}`,
    ]);
  }
  return rows;
}
export class HyperbolicControls {
  constructor(owner) {
    this.owner = owner;
    const c = owner.ctx;
    this.node = document.createElement('details');
    this.node.id = 'hyperbolic-patch-controls';
    this.node.innerHTML =
      '<summary>Patch</summary><div class="hyperbolic-patch-fields"><label>Coverage <select id="hyperbolic-patch-mode"><option value="radius">Observer ball</option><option value="complete-depth">Cell layers</option></select></label><label>Visible radius <input id="hyperbolic-radius" type="text" inputmode="decimal" value="2" aria-label="Visible radius"></label><label>Cell layers <input id="hyperbolic-layers" type="text" inputmode="numeric" value="3" aria-label="Cell layers"></label><p id="hyperbolic-patch-limits"></p><button id="hyperbolic-patch-apply">Apply patch</button><label><input id="hyperbolic-pause" type="checkbox"> Pause generation</label></div>';
    owner.controls.append(this.node);
    this.entry = new NumericEntry({
      getState: () => c.state(),
      getTarget: () => this.fields(),
      captureSource: () => ({
        state: c.state(),
        project: c.project,
        modelSignature: JSON.stringify(c.model()),
        view: JSON.stringify(c.state().view.hyperbolicPatch),
      }),
      verifySource: (source) => {
        if (
          c.state() !== source.state ||
          c.project !== source.project ||
          JSON.stringify(c.model()) !== source.modelSignature ||
          JSON.stringify(c.state().view.hyperbolicPatch) !== source.view
        )
          throw Error('Hyperbolic source or patch changed. Repeat the edit.');
      },
      number: (text, { signal }) => c.number(text, { signal }),
      isExporting: () => c.animation.exporting || c.tourExporting || owner.capturing,
    });
    c.$('hyperbolic-patch-apply').onclick = c.guard(() => this.apply());
    c.$('hyperbolic-pause').onchange = c.guard(async () => {
      const paused = c.$('hyperbolic-pause').checked;
      owner.persist({ hyperbolicPatch: { ...owner.patchOptions(), paused } });
      if (paused) {
        owner.controller?.abort();
        owner.viewer.rebaseController?.abort();
        owner.viewer.exitExplore();
        owner.persist(owner.viewer.getView());
      } else await owner.refreshPatch();
      this.sync();
      owner.renderAnalysis();
    });
  }
  fields() {
    return ['hyperbolic-radius', 'hyperbolic-layers', 'hyperbolic-patch-mode'].map((id) => this.owner.ctx.$(id).value);
  }
  async apply() {
    const o = this.owner,
      c = o.ctx,
      limits = patchLimits(c.model().source),
      fields = this.fields();
    await this.entry.run(
      {
        radius: { text: fields[0], min: 0, max: limits.radius },
        depth: { text: fields[1], min: 0, max: limits.depth, integer: true },
      },
      async (values, verify) => {
        verify();
        o.persist({ hyperbolicPatch: { ...o.patchOptions(), ...values, mode: fields[2] } });
      }
    );
    if (!o.patchOptions().paused) await o.refreshPatch();
    this.sync({ fields: true });
    o.renderAnalysis();
  }
  sync({ fields = false } = {}) {
    const o = this.owner;
    if (!o.owner) return;
    const c = o.ctx,
      options = o.patchOptions(),
      limits = patchLimits(c.model().source);
    if (fields) {
      c.$('hyperbolic-radius').value = String(options.radius);
      c.$('hyperbolic-layers').value = String(options.depth);
      c.$('hyperbolic-patch-mode').value = options.mode;
    }
    c.$('hyperbolic-pause').checked = options.paused;
    c.$('hyperbolic-explore').disabled = options.paused || this.owner.returningHome === true;
    c.$('hyperbolic-patch-limits').textContent =
      `Radius 0–${limits.radius}; layers 0–${limits.depth}. Choose observer ball or adjacency layers; layer mode does not certify a ball.`;
    c.$('hyperbolic-navigation-help').textContent =
      o.viewer?.mode === 'explore'
        ? 'Exploring in Klein · WASD: move · arrows / drag: look · Escape: overview'
        : 'Explore inside → WASD: move · arrows / drag: look · Escape: overview';
  }
  highlight() {
    this.clearHighlight();
    const viewer = this.owner.viewer,
      page = viewer.pages[0],
      cell = page.instances[0];
    if (!cell) return;
    const t = page.templates.find((t) => String(t.id) === String(cell.type)) ?? page.templates[0];
    const points = t.vertices.map((v) => transform(cell.matrix, v)),
      samples = [];
    for (const [a, b] of t.edges)
      for (let k = 0; k < 24; k++)
        samples.push(
          ...geodesicPoint(points[a], points[b], k / 24),
          ...geodesicPoint(points[a], points[b], (k + 1) / 24)
        );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('hyperboloid', new THREE.Float32BufferAttribute(samples, 4));
    const colors = new Float32Array((samples.length / 4) * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([1, 0.76, 0.28], i);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(Array.from({ length: samples.length / 4 }, (_, i) => i));
    const material = viewer.material.clone();
    material.uniforms = viewer.material.uniforms;
    material.depthTest = false;
    this.highlighted = new THREE.LineSegments(geometry, material);
    this.highlighted.frustumCulled = false;
    this.highlighted.renderOrder = 2;
    viewer.scene.add(this.highlighted);
    this.owner.host.dataset.highlightedCell = String(cell.id);
    viewer.invalidate();
  }
  clearHighlight() {
    if (this.owner.host) delete this.owner.host.dataset.highlightedCell;
    if (this.highlighted) {
      this.highlighted.removeFromParent();
      this.highlighted.geometry.dispose();
      this.highlighted.material.dispose();
      this.highlighted = null;
    }
  }
  cancel() {
    this.entry.cancel();
    this.clearHighlight();
  }
}
