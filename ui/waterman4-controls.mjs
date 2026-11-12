import { NumericEntry, exactRational } from './numeric-entry.mjs';

const write = (node, key, value) => {
  if (node[key] !== value) node[key] = value;
};
export class Waterman4Controls {
  constructor(context, host) {
    this.context = context;
    this.busy = false;
    const panel = document.createElement('details');
    panel.id = 'waterman4-settings';
    panel.innerHTML = `<summary>Waterman polychora — 4D lattice balls</summary>
      <label>Lattice <select id="waterman4-lattice"><option value="D4">D₄ — even coordinate sum</option><option value="Z4">Z⁴ — all integer sites</option></select></label>
      <label>Squared radius <input id="waterman4-radius" value="2" maxlength="512"></label>
      <button id="generate-waterman4">Generate 4D Waterman hull</button>
      <details id="waterman4-sequence-settings"><summary>Origin and squared-radius sequence</summary>
        <label>Origin X, Y, Z, W <input id="waterman4-center" value="0, 0, 0, 0" maxlength="2054"></label>
        <label>Squared-radius increment <input id="waterman4-increment" value="1" maxlength="512"></label>
        <div class="button-row"><button id="waterman4-previous">Previous radius</button><button id="waterman4-next">Next radius</button></div>
        <p class="muted">Adds or subtracts the positive increment from r², keeping the origin and lattice. Repeated hulls are retained. No numbered-root convention is assumed.</p>
      </details>
      <output id="waterman4-status" aria-live="polite"></output>
      <p class="muted">Exact rational site selection; numerical 4D convex hull. Z⁴ and D₄ only. At most 256 selected sites, 128 hull vertices and 65,536 inspected sites; 0 &lt; r² ≤ 64; origin coordinates within ±1000. Each rational uses at most 256 bits, with a 512-bit common origin denominator. A full 4D hull is required. These are explicit lattice definitions; benchmark defaults remain unverified.</p>`;
    host.append(panel);
    this.panel = panel;
    this.node('generate').onclick = context.guard(() => this.generate());
    for (const [key, direction] of [
      ['previous', -1],
      ['next', 1],
    ])
      this.node(key).onclick = context.guard(() => this.generate(direction));
    this.sync();
  }
  node(key) {
    return this.panel.querySelector(key === 'generate' ? '#generate-waterman4' : '#waterman4-' + key);
  }
  inputs() {
    return Object.fromEntries(['lattice', 'radius', 'center', 'increment'].map((key) => [key, this.node(key).value]));
  }
  async generate(direction = 0) {
    if (this.busy || this.context.isBusy?.()) throw Error('Finish the current Waterman construction first.');
    if (this.context.isExporting?.()) throw Error('Finish animation export before constructing geometry.');
    if (![0, -1, 1].includes(direction)) throw Error('Choose previous, generate or next.');
    const input = this.inputs();
    if (!['Z4', 'D4'].includes(input.lattice)) throw Error('Choose Z4 or D4.');
    const fields = {
      radius_squared: {
        text: direction ? `(${input.radius})+(${direction})*(${input.increment})` : input.radius,
        mode: 'rational',
        min: 0,
        exclusiveMin: true,
        max: 64,
      },
      center: { kind: 'vector', length: 4, text: input.center, mode: 'rational', min: -1000, max: 1000 },
    };
    if (direction) fields.increment = { text: input.increment, mode: 'rational', min: 0, exclusiveMin: true };
    const entry = new NumericEntry({ ...this.context, getTarget: () => this.inputs() });
    this.entry = entry;
    this.busy = true;
    this.sync();
    this.context.onBusyChange?.();
    let resolved;
    try {
      const result = await entry.run(
        fields,
        (values, verify, { signal, source }) => {
          resolved = values.radius_squared;
          verify();
          return this.context.generate(
            'waterman-4d',
            { radius_squared: resolved, center: values.center, lattice: input.lattice },
            { verifyPublication: verify, signal, sourceSnapshot: source, expressionInputs: input }
          );
        },
        {
          validate: (values) => {
            for (const value of [values.radius_squared, ...values.center, ...(direction ? [values.increment] : [])]) {
              const { numerator, denominator } = exactRational(value);
              if (
                value.length > 256 ||
                (numerator < 0n ? -numerator : numerator).toString(2).length > 256 ||
                denominator.toString(2).length > 256
              )
                throw Error('4D Waterman rational values exceed the native 256-bit/character bound.');
            }
          },
        }
      );
      if (JSON.stringify(this.inputs()) === JSON.stringify(input)) {
        if (direction) write(this.node('radius'), 'value', resolved);
        const info = result.metadata.waterman4,
          r = info.hullResiduals;
        write(
          this.node('status'),
          'textContent',
          `${info.selectedPointCount} sites → ${result.vertices.length} hull vertices. Numerical support residual ${Math.max(r.maximumOutsideSupportResidual, r.maximumFacetPlanarityResidual).toExponential(2)}.`
        );
      }
      return result;
    } finally {
      if (this.entry === entry) this.entry = null;
      this.busy = false;
      this.sync();
      this.context.onBusyChange?.();
    }
  }
  cancel() {
    this.entry?.cancel();
  }
  sync() {
    const disabled = this.busy || Boolean(this.context.isBusy?.()) || Boolean(this.context.isExporting?.());
    for (const node of this.panel.querySelectorAll('input,select,button')) write(node, 'disabled', disabled);
  }
}
