import { NumericEntry } from './numeric-entry.mjs';
import { explainAvailability } from './availability-copy.mjs';

const fields = [
  'face-method',
  'face-height',
  'conway-notation',
  'conway-height',
  'zone-fold',
  'zone-axis-ids',
  'zone-length',
  'zone-directions',
];
export function axisIds(text) {
  if (!text.trim()) return null;
  if (!/^\d+(?:[\s,]+\d+)*$/.test(text.trim()))
    throw Error('Axis IDs must be literal integers separated by commas; blank selects all of type.');
  const ids = text
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (ids.length > 32 || new Set(ids).size !== ids.length || ids.some((i) => !Number.isSafeInteger(i)))
    throw Error('Choose at most 32 distinct literal axis IDs.');
  return ids;
}
export class FaceConwayControls {
  constructor(context) {
    this.context = context;
    this.busy = false;
    const panel = document.createElement('details');
    panel.id = 'face-conway-settings';
    panel.innerHTML = `<summary>Face subdivision and Conway operators</summary>
      <label>Face subdivision <select id="face-method"><option value="centroid">Centroid fan (triangles)</option><option value="kis">Kis (face pyramids)</option><option value="midpoint">Midpoint (4 triangles / n quads)</option></select></label>
      <label>Kis height (source units) <input id="face-height" value="0.5" maxlength="512"></label>
      <button id="subdivide-faces">Subdivide faces</button>
      <p>Simple convex planar faces only. Star faces are refused. Use Project vertices onto sphere after refinement.</p>
      <label>Conway notation <input id="conway-notation" value="tI" maxlength="33" title="Right to left; optional seed T/C/O/D/I. Without a seed, use the current model."></label>
      <button id="conway-apply">Apply notation</button>
      <div id="conway-actions">${[
        ['d', 'Dual'],
        ['a', 'Ambo'],
        ['k', 'Kis'],
        ['t', 'Truncate'],
        ['j', 'Join'],
        ['e', 'Expand'],
      ]
        .map(([op, label]) => `<button id="conway-${op}" data-conway="${op}">${label} (${op})</button>`)
        .join('')}</div>
      <details><summary>Conway kis height</summary><label>Height (blank: automatic convex height) <input id="conway-height" maxlength="512"></label><p>Convex 3D only; rightmost operator runs first. Truncate uses a ⅓ edge cut; join = dad; expand = aa. These realizations need not have equal edges. Gyro/snub and automatic canonicalization are unavailable; use the existing fitting controls separately.</p></details>
      <details id="zone-extension-settings"><summary>Symmetry-axis zones and zone addition</summary>
        <label>Rotation axis type <select id="zone-fold"><option value="2">2-fold</option><option value="3" selected>3-fold</option><option value="5">5-fold</option></select></label>
        <button id="zone-inspect-axes">Inspect all axes of type</button>
        <label>Axis IDs (blank: all of type) <input id="zone-axis-ids" maxlength="128"></label>
        <label>Zone segment length <input id="zone-length" value="1" maxlength="512"></label>
        <button id="zone-from-axes">Construct from axes</button>
        <label>New directions (one XYZ expression triple per line) <textarea id="zone-directions" rows="3" maxlength="25000">1,1,1</textarea></label>
        <button id="zone-add">Add zones to current zonohedron</button>
        <p>Adds centered segments by Minkowski sum. Existing zone lengths and position are retained; parallel additions lengthen a zone.</p>
      </details>
      <button id="face-conway-cancel" hidden>Cancel construction</button><output id="face-conway-status" aria-live="polite" style="white-space:pre-line"></output>`;
    document.getElementById('truncate').after(panel);
    this.panel = panel;
    for (const [id, action] of [
      ['subdivide-faces', 'faces'],
      ['conway-apply', 'notation'],
      ['zone-inspect-axes', 'inspect'],
      ['zone-from-axes', 'axes'],
      ['zone-add', 'add'],
    ])
      this.node(id).onclick = context.guard(() => this.apply(action));
    for (const button of panel.querySelectorAll('[data-conway]'))
      button.onclick = context.guard(() => this.apply(button.dataset.conway));
    this.node('face-conway-cancel').onclick = () => this.cancel();
    this.sync();
  }
  node(id) {
    return this.panel.querySelector('#' + id);
  }
  fields() {
    return Object.fromEntries(fields.map((id) => [id, this.node(id).value]));
  }
  async apply(action) {
    if (this.busy || this.context.isExporting()) throw Error('Finish or cancel the current construction/export first.');
    const input = this.fields(),
      spec = {};
    let op,
      params = {},
      label;
    if (action === 'faces') {
      op = 'subdivide-faces';
      params.method = input['face-method'];
      label = 'Subdivide faces';
      if (params.method === 'kis') spec.height = { text: input['face-height'], min: 0, max: 1e6 };
    } else if (action === 'inspect' || action === 'axes') {
      op = action === 'inspect' ? 'symmetry-axes' : 'axis-zonohedron';
      label = 'Symmetry-axis zones';
      spec.fold = { text: input['zone-fold'], integer: true, min: 2, max: 5 };
      if (action === 'axes') {
        params.axis_ids = axisIds(input['zone-axis-ids']);
        spec.edge_length = { text: input['zone-length'], min: 1e-6, max: 1e6 };
      }
    } else if (action === 'add') {
      op = 'add-zones';
      label = 'Add zones';
      const rows = input['zone-directions'].trim().split(/\n+/);
      if (rows.length > 16 || !rows[0]) throw Error('Enter 1..16 XYZ direction triples, one per line.');
      rows.forEach((text, i) => (spec['direction' + i] = { text, kind: 'vector', length: 3, min: -1e100, max: 1e100 }));
      spec.edge_length = { text: input['zone-length'], min: 1e-6, max: 1e6 };
    } else {
      op = 'conway';
      label = 'Conway operators';
      params.notation = action === 'notation' ? input['conway-notation'].trim() : action;
      if (!/^[daktje]*[TCODI]?$/.test(params.notation) || !params.notation)
        throw Error('Use d/a/k/t/j/e with an optional T/C/O/D/I seed, for example tI.');
      if (params.notation.includes('k') && input['conway-height'].trim())
        spec.height = { text: input['conway-height'], min: 0, exclusiveMin: true, max: 1e6 };
    }
    if (!Object.keys(spec).length) spec.defaults = { text: '0', min: 0, max: 0 };
    const entry = new NumericEntry({ ...this.context, getTarget: () => this.fields() });
    this.entry = entry;
    this.busy = true;
    this.sync();
    try {
      return await entry.run(spec, async (values, verify, { signal, source }) => {
        values = { ...values };
        delete values.defaults;
        if (action === 'add') {
          params.directions = Object.keys(values)
            .filter((key) => key.startsWith('direction'))
            .map((key) => values[key]);
          values = { edge_length: values.edge_length };
        }
        params = { ...params, ...values };
        verify();
        if (action === 'inspect') {
          const result = await this.context.run(op, params, source, label, { signal });
          verify();
          this.node('face-conway-status').textContent =
            `${result.count} axes; residual ${result.maximumAxisResidual.toExponential(3)}\n` +
            result.axes.map((axis, i) => `${i}: ${axis.map((x) => x.toPrecision(6)).join(', ')}`).join('\n');
          return result;
        }
        const result = await this.context.commit(op, params, label, {
          signal,
          verifyPublication: verify,
          sourceSnapshot: source,
          expressionInputs: input,
        });
        this.node('face-conway-status').textContent = 'Construction added to history.';
        return result;
      });
    } finally {
      if (this.entry === entry) this.entry = null;
      this.busy = false;
      this.sync();
    }
  }
  cancel() {
    this.entry?.cancel();
    this.inheritance?.cancel();
  }
  sync() {
    const blocked = this.busy || this.context.isExporting(),
      source = this.context.getState()?.model;
    for (const node of this.panel.querySelectorAll('input,textarea,select,button')) node.disabled = blocked;
    for (const node of this.panel.querySelectorAll('button')) node.disabled ||= source?.dimension !== 3;
    const cancel = this.node('face-conway-cancel');
    cancel.hidden = !this.busy;
    cancel.disabled = !this.busy;
    explainAvailability(
      this.panel,
      this.busy
        ? 'Finish or cancel the current construction.'
        : this.context.isExporting()
          ? 'Finish animation export before construction.'
          : 'Choose a single 3D source model.',
      { 'face-conway-cancel': 'No construction is running.' }
    );
    this.inheritance?.sync();
  }
}
