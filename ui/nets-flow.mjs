import { currentFaceNet } from './net-presentation.mjs';
import { organizePrecisionEvidence } from './precision-evidence.mjs';

const edgeKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
function closedFaces(model) {
  const counts = new Map();
  for (const face of model.faces ?? [])
    for (let i = 0; i < face.length; i++) {
      const key = edgeKey(face[i], face[(i + 1) % face.length]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  return counts.size > 0 && counts.size === model.edges?.length && [...counts.values()].every((n) => n === 2);
}
function simpleFace(model, face) {
  const points = face.map((i) => model.vertices[i]);
  if (points.some((p) => !p)) return false;
  const relative = points.map((p) => p.map((x, i) => x - points[0][i])),
    dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const scale = Math.max(...relative.map((p) => Math.hypot(...p)));
  if (!scale) return false;
  const q = relative.map((p) => p.map((x) => x / scale)),
    first = q.find((p) => Math.hypot(...p) > 1e-8);
  if (!first) return false;
  const u = first.map((x) => x / Math.hypot(...first)),
    rest = q.map((p) => p.map((x, i) => x - dot(p, u) * u[i]));
  const second = rest.find((p) => Math.hypot(...p) > 1e-8);
  if (!second) return false;
  const v = second.map((x) => x / Math.hypot(...second)),
    flat = q.map((p) => [dot(p, u), dot(p, v)]);
  if (q.some((p, j) => Math.hypot(...p.map((x, i) => x - flat[j][0] * u[i] - flat[j][1] * v[i])) > 1e-8)) return false;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const on = (a, b, c) =>
    Math.abs(cross(a, b, c)) < 1e-10 &&
    c.every((x, i) => x >= Math.min(a[i], b[i]) - 1e-10 && x <= Math.max(a[i], b[i]) + 1e-10);
  for (let i = 0; i < flat.length; i++)
    for (let j = i + 1; j < flat.length; j++) {
      if (Math.hypot(...flat[i].map((x, k) => x - flat[j][k])) < 1e-10) return false;
      if (j === i + 1 || (i === 0 && j === flat.length - 1)) continue;
      const a = flat[i],
        b = flat[(i + 1) % flat.length],
        c = flat[j],
        d = flat[(j + 1) % flat.length];
      if (
        (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
        on(a, b, c) ||
        on(a, b, d) ||
        on(c, d, a) ||
        on(c, d, b)
      )
        return false;
    }
  return true;
}
/** Cheap UI preflight only; native operations still validate geometry and residuals. */
export function netTypeAvailability(model) {
  if (!model) return { faces: 'Open a model first.', cells: 'Open a model first.', surface: 'Open a model first.' };
  const faces = model.faces ?? [],
    cells = model.cells ?? [],
    three = model.dimension === 3,
    four = model.dimension === 4;
  const valid = model.validation?.passed !== false;
  const ordinary = model.interpretation === 'convex-polytope';
  const faceLimit =
    faces.length > 250 ||
    (!ordinary && (faces.some((f) => f.length > 128) || faces.reduce((s, f) => s + f.length, 0) > 4000));
  const closed = three && !faceLimit && closedFaces(model);
  const faceReason = !three
    ? 'Choose a 3D model to unfold faces.'
    : !valid
      ? 'Repair the model checks first.'
      : faceLimit
        ? 'Face nets support up to 250 faces; generalized shells also have boundary limits.'
        : !closed
          ? 'Faces need a closed shell with two faces at every edge.'
          : !ordinary && faces.some((f) => !simpleFace(model, f))
            ? 'Crossing or nonplanar faces: try the visible surface paper model.'
            : '';
  const counts = new Map();
  if (four && cells.length <= 1024)
    for (const cell of cells) for (const face of cell) counts.set(face, (counts.get(face) ?? 0) + 1);
  const cellReason = !four
    ? 'Choose a 4D model to unfold its cells.'
    : !valid
      ? 'Repair the model checks first.'
      : !cells.length
        ? 'This model has no 3D cells.'
        : cells.length > 1024
          ? 'Whole-cell nets support up to 1,024 cells.'
          : counts.size !== faces.length || [...counts.values()].some((n) => n !== 2)
            ? 'Cells need a closed shell with two cells at every face.'
            : '';
  const surfaceReason = !three
    ? 'Choose a 3D star or compound.'
    : !valid
      ? 'Repair the model checks first.'
      : ordinary
        ? 'Use Unfold faces for this convex model.'
        : model.metadata?.visibleSurface
          ? 'Paper surface is ready. Choose Unfold faces next.'
          : (model.embeddingDimension ?? 3) !== 3
            ? 'Visible surfaces require three source coordinates.'
            : faces.length < 4 || faces.length > 100 || faces.reduce((s, f) => s + f.length, 0) > 1200
              ? 'Visible surfaces support 4–100 faces and up to 1,200 boundary vertices.'
              : !closedFaces(model)
                ? 'A paper surface needs closed two-face source edges.'
                : '';
  return { faces: faceReason, cells: cellReason, surface: surfaceReason };
}
export function netTypeGroups(model, availability = netTypeAvailability(model)) {
  const order = model?.dimension === 4 ? ['cells', 'faces', 'surface'] : ['faces', 'surface', 'cells'];
  return {
    available: order.filter((key) => !availability[key]),
    unavailable: order.filter((key) => availability[key]),
  };
}
export function otherNetReason(model, keys, availability) {
  if (!model) return 'Open a model first.';
  const reasons = keys.map((key) =>
    model.dimension === 4 && key !== 'cells'
      ? 'Needs a 3D model'
      : model.dimension === 3 && key === 'cells'
        ? 'Needs a 4D model'
        : availability[key]
  );
  return [...new Set(reasons)].join(' · ');
}
function element(doc, tag, id, text, className) {
  const node = doc.createElement(tag);
  if (id) node.id = id;
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function details(doc, id, title, nodes) {
  const node = element(doc, 'details', id, null, 'inspector-group');
  node.append(element(doc, 'summary', null, title), ...nodes.filter(Boolean));
  return node;
}
function move(doc, host, ids) {
  for (const id of ids) {
    const node = doc.getElementById(id);
    if (node) host.append(node);
  }
}
function rename(doc, id, text) {
  const node = doc.getElementById(id);
  if (node) node.textContent = text;
}

export function organizeAdvanced(doc) {
  const panel = doc.getElementById('evidence-panel');
  if (!panel || doc.getElementById('advanced-intro')) return;
  const nodes = [...panel.children],
    exact = nodes.findIndex((n) => n.className === 'panel-title' && n.textContent === 'Exact rational hull'),
    info = nodes.findIndex((n) => n.className === 'panel-title' && n.textContent === 'Numeric contract');
  if (exact < 0 || info < 0) return;
  const checks = element(doc, 'section', 'advanced-checks', null, 'advanced-section');
  checks.append(element(doc, 'h2', null, 'Checks'), ...nodes.slice(0, exact).filter((n) => n.className !== 'rule'));
  const symmetry = details(doc, 'advanced-symmetry-checks', 'Symmetry checks', []);
  symmetry.setAttribute('data-expert', '');
  symmetry.append(
    ...nodes.filter((n) => ['symmetry-controls', 'symmetry', 'symmetry-result', 'symmetry-inspection'].includes(n.id))
  );
  checks.append(symmetry);
  const arithmetic = details(
    doc,
    'advanced-exact-arithmetic',
    'Exact arithmetic',
    nodes.slice(exact + 1, info).filter((n) => n.className !== 'rule')
  );
  arithmetic.setAttribute('data-expert', '');
  const information = element(doc, 'section', 'advanced-model-information', null, 'advanced-section');
  information.append(
    element(doc, 'h2', null, 'Model information'),
    element(
      doc,
      'p',
      null,
      'Calculations use numerical coordinates unless an exact certificate is supplied. Display and measurements remain numerical.',
      'muted'
    ),
    ...nodes.slice(info + 1)
  );
  const names = [
    'Rational hull limits and certificates',
    'Numerical precision and tolerances',
    'Imported faces and supported operations',
  ];
  let index = 0;
  for (const node of [...arithmetic.querySelectorAll('details'), ...information.querySelectorAll('details')]) {
    const summary = node.querySelector('summary');
    if (summary?.textContent.trim() === 'Method notes')
      summary.textContent = names[index++] ?? 'Calculation method and limits';
    node.setAttribute('data-expert', '');
  }
  doc.getElementById('symmetry-result')?.setAttribute('data-expert', '');
  panel.replaceChildren(
    element(
      doc,
      'p',
      'advanced-intro',
      'Inspect model checks, calculation limits and exact arithmetic tools.',
      'muted'
    ),
    checks,
    arithmetic,
    information
  );
  rename(doc, 'validate', 'Check model again');
  organizePrecisionEvidence(doc);
}

export class NetsFlow {
  constructor(doc, { faceEditor, cellEditor, fabrication }) {
    Object.assign(this, { doc, faceEditor, cellEditor, fabrication });
    this.mount();
    faceEditor.flow = this;
    cellEditor.flow = this;
    faceEditor.visibleSurface.flow = this;
    fabrication.flow = this;
    this.sync();
  }
  mount() {
    const doc = this.doc,
      node = (id) => doc.getElementById(id),
      field = (id) => node(id)?.closest('label') ?? node(id),
      panel = node('net-panel');
    const step = (number, title) => {
      const section = element(doc, 'section', `nets-step-${number}`, null, 'nets-step');
      section.setAttribute('aria-labelledby', `nets-step-${number}-title`);
      const heading = element(doc, 'h2', `nets-step-${number}-title`);
      heading.append(element(doc, 'span', null, String(number), 'nets-step-number'), element(doc, 'span', null, title));
      section.append(heading);
      return section;
    };
    const choose = step(1, 'Choose net type'),
      arrange = step(2, 'Arrange'),
      output = step(3, 'Print or export');
    panel.append(choose, arrange, output);
    this.availableTypes = element(doc, 'div', 'nets-available-types');
    this.otherTypes = details(doc, 'nets-other-types', 'Other net types', []);
    this.otherTypes.open = false;
    this.otherSummary = this.otherTypes.querySelector('summary');
    this.otherLabel = element(doc, 'span');
    this.otherSummary.replaceChildren(this.otherLabel);
    choose.append(this.availableTypes, this.otherTypes);
    this.cards = {};
    for (const [key, id, title, copy] of [
      ['faces', 'net-rebuild', 'Unfold faces', 'Lay the faces of a 3D model flat.'],
      ['cells', 'cell-net-build', 'Unfold 4D cells', 'Arrange intact 3D cells in the preview.'],
      [
        'surface',
        'net-visible-surface',
        'Paper model of the visible surface',
        'First create the outside of a star or compound.',
      ],
    ]) {
      const card = element(doc, 'div', `nets-type-${key}`, null, 'nets-type-card'),
        button = node(id),
        reason = element(doc, 'p', `nets-type-${key}-reason`, null, 'nets-type-reason');
      const heading = element(doc, 'h3', `nets-type-${key}-title`, title);
      button.textContent =
        key === 'cells' ? 'Generate cell net' : key === 'faces' ? 'Generate face net' : 'Create paper surface';
      button.className = 'wide nets-type-action';
      button.setAttribute('aria-describedby', reason.id);
      card.append(heading, button, element(doc, 'p', null, copy, 'muted'), reason);
      this.availableTypes.append(card);
      this.cards[key] = { card, button, reason, heading, title };
    }
    this.cards.faces.card.append(field('net-length'), node('net-generation-settings'));
    this.cards.cells.card.append(node('cell-net-generation-settings'));
    this.cards.surface.card.append(
      details(doc, 'nets-surface-options', 'Visible surface options', [node('net-visible-surface-settings')])
    );
    field('net-length').firstChild.textContent = 'Edge length ';
    node('net-length').title = 'Printed length in millimeters of source edge 0; all other edges scale proportionally.';
    field('net-root').firstChild.textContent = 'Starting face ';
    field('cell-net-root').firstChild.textContent = 'Starting cell ';
    const face = node('face-net-controls'),
      cell = node('cell-net-controls');
    const paper = node('net-paper-settings');
    paper.querySelector('summary').textContent = 'Page and paper options';
    const actions = node('net-export-actions');
    actions.className = 'nets-output-actions';
    this.print = element(doc, 'button', 'net-print', 'Print');
    this.print.onclick = this.faceEditor.guard(() =>
      this.faceEditor.exports.run('print', { packed: Boolean(this.faceEditor.getState()?.netPages) })
    );
    this.dxf = element(doc, 'button', 'net-export-dxf', 'DXF');
    this.dxf.title = 'Separate flat face outlines in millimeters (no glue tabs).';
    this.dxf.onclick = this.fabrication.context.guard(() => this.fabrication.apply('measure-dxf'));
    actions.prepend(this.print, node('net-export-pdf'));
    actions.append(this.dxf);
    rename(doc, 'net-export-pdf', 'PDF');
    rename(doc, 'net-export-svg', 'SVG');
    const assembly = details(doc, 'nets-numbering-options', 'Numbering and assembly sheet', [
      node('net-assembly-controls'),
    ]);
    move(doc, paper, ['net-tab-settings']);
    paper.prepend(field('net-tabs'));
    const foldNote = element(
      doc,
      'p',
      null,
      'Short dashes mark valley folds and glue tabs; dash-dot lines mark mountain folds, viewed from the printed side. Print at 100% scale.',
      'muted'
    );
    paper.append(foldNote);
    output.append(
      actions,
      element(doc, 'p', 'nets-output-note', null, 'muted'),
      node('net-pack'),
      node('net-paper-status'),
      node('net-page-prev').parentElement,
      node('net-packed-pdf'),
      node('net-packed-svg'),
      paper
    );
    if (node('net-fabrication-settings')) output.append(node('net-fabrication-settings'));
    for (const id of ['net-reinforcement-settings', 'coincident-edge-assembly']) {
      const group = node(id);
      if (group) {
        group.classList.add('inspector-group');
        group.setAttribute('data-expert', '');
        output.append(group);
      }
    }
    for (const id of ['net-checks-settings', 'cell-net-checks-settings']) node(id)?.setAttribute('data-expert', '');
    for (const root of [face, cell]) {
      const title = [...root.children].find((n) => n.className === 'panel-title');
      if (title) title.remove();
    }
    node('net-rearrange').after(assembly);
    arrange.append(
      element(doc, 'p', null, 'Review the preview, check overlaps, then adjust pieces if needed.', 'muted'),
      face,
      cell
    );
    panel.replaceChildren(choose, arrange, output);
    for (const group of panel.querySelectorAll('details'))
      group.addEventListener('focusin', (event) => {
        if (event.target.tagName !== 'SUMMARY') group.open = true;
      });
    organizeAdvanced(doc);
  }
  sync() {
    const state = this.faceEditor.getState(),
      model = state?.model;
    if (this.source !== model || !this.availability) {
      this.source = model;
      this.availability = netTypeAvailability(model);
      this.otherTypes.open = false;
    }
    const groups = netTypeGroups(model, this.availability);
    for (const key of [...groups.available, ...groups.unavailable]) {
      const host = this.availability[key] ? this.otherTypes : this.availableTypes,
        card = this.cards[key].card;
      if (card.parentElement !== host) host.append(card);
    }
    this.otherTypes.hidden = !groups.unavailable.length;
    this.otherLabel.textContent = `Other net types (${groups.unavailable.length})`;
    this.otherSummary.title = otherNetReason(model, groups.unavailable, this.availability);
    const blocked = Boolean(
      model &&
        (this.faceEditor.context.isExporting?.() || this.faceEditor.exports.busy || this.faceEditor.visibleSurface.busy)
    );
    for (const [key, { card, button, reason, heading, title }] of Object.entries(this.cards)) {
      const message =
        this.availability[key] ||
        (blocked
          ? 'Finish or cancel the active export or surface construction.'
          : 'Ready. The native engine checks the geometry when you start.');
      const name = model?.name || 'this model';
      heading.textContent = !this.availability[key]
        ? key === 'cells'
          ? `Unfold ${name}’s cells`
          : key === 'faces'
            ? `Unfold ${name}’s faces`
            : `Paper model of ${name}’s visible surface`
        : title;
      button.disabled = Boolean(this.availability[key] || blocked);
      button.title = message;
      reason.textContent = message;
      reason.hidden = false;
      card.dataset.available = String(!button.disabled);
    }
    const ready = currentFaceNet(state);
    this.print.disabled = !ready || blocked;
    for (const id of ['net-length', 'net-root'])
      this.doc.getElementById(id).disabled = model?.dimension !== 3 || blocked;
    this.doc.getElementById('cell-net-root').disabled = model?.dimension !== 4 || blocked;
    this.dxf.disabled = !ready || blocked || this.fabrication.session.busy || this.fabrication.context.isExporting();
    this.doc.getElementById('nets-output-note').textContent =
      model?.dimension === 4
        ? 'Whole-cell nets are 3D previews. For paper output, extract a 3D cell or face model, then unfold its faces.'
        : model?.metadata?.visibleSurface
          ? 'Paper surface created. Choose Unfold faces, then review and pack the layout.'
          : 'Pack and preview to fit whole pieces to paper. PDF and SVG export the current net; DXF exports separate face outlines without tabs.';
  }
}
