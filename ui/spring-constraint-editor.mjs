import { NumericEntry } from './numeric-entry.mjs';
import { captureNativeSource, verifyNativeSource } from './native-source-binding.mjs';

const keys = new Set(['edge_lengths', 'edge_weights', 'face_steps', 'face_weights', 'extra_springs', 'pins']);
const fields = ['spring-pair-a', 'spring-pair-b', 'spring-pair-length', 'spring-pair-weight', 'spring-pin-ids'];
const fail = (message) => {
  throw Error(message);
};
export function springConstraintArrays(text) {
  if (new TextEncoder().encode(text).length > 1024 * 1024) fail('Spring constraints exceed 1 MiB.');
  let result;
  try {
    result = JSON.parse(text, (_key, value) => {
      if (typeof value === 'number' && !Number.isFinite(value)) fail('Nonfinite constraint value.');
      return value;
    });
  } catch {
    fail('Enter finite valid constraint-array JSON before editing constraints.');
  }
  if (
    !result ||
    typeof result !== 'object' ||
    Array.isArray(result) ||
    Object.keys(result).some((k) => !keys.has(k)) ||
    Object.values(result).some((v) => !Array.isArray(v))
  )
    fail('Spring constraints require supported arrays only.');
  return result;
}
export function springPinIds(text, count) {
  if (typeof text !== 'string' || text.length > 2048 || !/^\d{1,3}(?:\s*,\s*\d{1,3})*$/.test(text.trim()))
    fail('Enter comma-separated literal source vertex IDs.');
  const ids = text.trim().split(',').map(Number);
  if (ids.length > 256 || new Set(ids).size !== ids.length || ids.some((v) => v >= count))
    fail('Pin IDs must be distinct source vertices in range.');
  return ids;
}
export class SpringConstraintEditor {
  constructor(host) {
    this.host = host;
    this.busy = false;
    const root = document.createElement('details');
    root.id = 'spring-constraint-editor';
    root.dataset.guideTopic = 'specialized';
    root.innerHTML = `<summary>Distance constraints and pins</summary>
      <p>Vertex IDs refer to the current source. Distances and positions use source units. Repeated pairs remain separate constraints.</p>
      <label>First vertex ID <input id="spring-pair-a" value="0" maxlength="512"></label>
      <label>Second vertex ID <input id="spring-pair-b" value="1" maxlength="512"></label>
      <label>Distance <input id="spring-pair-length" value="1" maxlength="512"></label>
      <label>Weight <input id="spring-pair-weight" value="1" maxlength="512"></label>
      <button id="spring-add-pair">Add distance constraint</button>
      <label>Pin vertex IDs <input id="spring-pin-ids" value="0" maxlength="2048" title="Comma-separated literal source vertex IDs; positions are copied from the current source."></label>
      <button id="spring-add-pins">Pin at source positions</button>
      <output id="spring-constraint-list" style="white-space:pre-line" aria-live="polite"></output>
      <button id="spring-remove-pair">Remove last distance constraint</button>
      <button id="spring-clear-pins">Remove all pins</button>`;
    host.node('spring-constraints').closest('details').before(root);
    this.root = root;
    this.numeric = new NumericEntry({
      ...host.context,
      isBusy: () => host.busy,
      getTarget: () => [host.fields(), fields.map((id) => this.node(id).value)],
    });
    const guarded = (fn) => (host.context.guard ? host.context.guard(fn) : fn);
    for (const [id, fn] of [
      ['spring-add-pair', () => this.addPair()],
      ['spring-add-pins', () => this.pin()],
      [
        'spring-remove-pair',
        () =>
          this.edit((arrays) => {
            arrays.extra_springs?.pop();
          }),
      ],
      [
        'spring-clear-pins',
        () =>
          this.edit((arrays) => {
            delete arrays.pins;
          }),
      ],
    ])
      this.node(id).onclick = guarded(fn);
  }
  node(id) {
    return this.root.querySelector('#' + id);
  }
  available() {
    if (this.busy || this.host.busy || this.host.destroyed || this.host.context.isExporting?.())
      fail('Finish or cancel spring work and export before editing constraints.');
    if (this.host.node('preview-spring').disabled)
      fail('Choose a closed XYZ 3D spring source before editing constraints.');
  }
  write(arrays) {
    const text = JSON.stringify(arrays);
    springConstraintArrays(text);
    this.host.node('spring-constraints').value = text;
    this.host.sync();
  }
  edit(change) {
    this.available();
    const owner = captureNativeSource(this.host.context),
      arrays = springConstraintArrays(this.host.node('spring-constraints').value);
    change(arrays, JSON.parse(owner.modelSignature));
    verifyNativeSource(this.host.context, owner);
    this.write(arrays);
  }
  pin() {
    this.edit((arrays, source) => {
      const ids = springPinIds(this.node('spring-pin-ids').value, source.vertices.length),
        pins = arrays.pins ?? [];
      if (pins.some((row) => !row || typeof row !== 'object'))
        fail('Correct invalid pin records in constraint JSON first.');
      if (pins.some((row) => ids.includes(row.vertex)))
        fail('A selected vertex is already pinned; remove pins or edit the JSON first.');
      arrays.pins = [...pins, ...ids.map((vertex) => ({ vertex, position: source.vertices[vertex].slice() }))];
    });
  }
  async addPair() {
    this.available();
    const arrays = springConstraintArrays(this.host.node('spring-constraints').value),
      history = this.host.history();
    if ((arrays.extra_springs?.length ?? 0) >= 8192) fail('Spring supplemental constraint bound exceeded.');
    const count = this.host.context.getState().model.vertices.length;
    this.busy = true;
    this.host.sync();
    try {
      return await this.numeric.run(
        {
          first: { text: this.node('spring-pair-a').value, min: 0, max: count - 1, integer: true },
          second: { text: this.node('spring-pair-b').value, min: 0, max: count - 1, integer: true },
          length: { text: this.node('spring-pair-length').value, min: 1e-100, max: 1e100 },
          weight: { text: this.node('spring-pair-weight').value, min: 1e-12, max: 1e12 },
        },
        (values, verify) => {
          verify();
          if (this.host.history() !== history) fail('Spring source history changed; repeat the constraint edit.');
          if (values.first === values.second) fail('A distance constraint needs two distinct source vertices.');
          arrays.extra_springs = [
            ...(arrays.extra_springs ?? []),
            { vertices: [values.first, values.second], length: values.length, weight: values.weight },
          ];
          this.write(arrays);
        }
      );
    } finally {
      this.busy = false;
      this.host.sync();
    }
  }
  sync(blocked, eligible) {
    const arrays = (() => {
      try {
        return springConstraintArrays(this.host.node('spring-constraints').value);
      } catch {
        return null;
      }
    })();
    const extras = arrays?.extra_springs ?? [],
      pins = arrays?.pins ?? [];
    const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : '?');
    const lines = extras
      .slice(0, 8)
      .map(
        (row, i) =>
          `Distance ${i}: vertices ${Array.isArray(row?.vertices) && row.vertices.length === 2 && row.vertices.every(Number.isInteger) ? row.vertices.join(', ') : '?'}; target ${number(row?.length)}; weight ${number(row?.weight)}`
      );
    if (extras.length > 8) lines.push(`… ${extras.length - 8} more distance constraints (see JSON)`);
    if (pins.length)
      lines.push(
        `Pinned vertices: ${pins
          .slice(0, 32)
          .map((row) => number(row?.vertex))
          .join(', ')}${pins.length > 32 ? ' …' : ''}`
      );
    const text = arrays
      ? lines.join('\n') || 'No supplemental distances or pins.'
      : 'Constraint JSON is invalid; correct it before editing.';
    const output = this.node('spring-constraint-list');
    if (output.textContent !== text) output.textContent = text;
    const disabled = (node, value) => {
      if (node.disabled !== value) node.disabled = value;
    };
    for (const node of this.root.querySelectorAll('button,input'))
      disabled(
        node,
        blocked ||
          !eligible ||
          (node.id === 'spring-remove-pair' && !extras.length) ||
          (node.id === 'spring-clear-pins' && !pins.length)
      );
  }
  cancel() {
    if (!this.busy) return false;
    this.numeric.cancel();
    return true;
  }
  destroy() {
    this.numeric.destroy();
  }
}
