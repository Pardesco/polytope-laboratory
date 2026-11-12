import { NumericEntry } from './numeric-entry.mjs';
import { explainAvailability } from './availability-copy.mjs';
export class WatermanControls {
  constructor(context) {
    this.context = context;
    this.busy = false;
    const panel = document.createElement('details');
    panel.id = 'waterman-settings';
    panel.innerHTML =
      '<summary>Waterman (SC / FCC / BCC)</summary><label>Sphere <select id="waterman-mode"><option value="exact-sphere">Exact origin and squared radius</option><option value="author-root">Centered root N (r² = 2N)</option></select></label><label id="waterman-root-row" hidden>Root N <input id="waterman-root" value="5" type="text" maxlength="512"></label><label id="waterman-radius-row">Squared radius <input id="waterman-radius-squared" value="10" maxlength="512" placeholder="Exact rational expression"></label><label id="waterman-x-row">Origin X <input id="waterman-x" value="0" maxlength="512"></label><label id="waterman-y-row">Origin Y <input id="waterman-y" value="0" maxlength="512"></label><label id="waterman-z-row">Origin Z <input id="waterman-z" value="0" maxlength="512"></label><button id="generate-waterman">Generate Waterman hull</button>';
    panel.insertAdjacentHTML(
      'beforeend',
      '<label>Lattice <select id="waterman-lattice"><option>FCC</option><option>SC</option><option>BCC</option></select></label><label>Origin preset <select id="waterman-origin"><option value="custom">Custom coordinates</option><option value="0,0,0">0, 0, 0</option><option value="1/2,1/2,1/2">1/2, 1/2, 1/2</option><option value="1,0,0">1, 0, 0</option><option value="1,1,1">1, 1, 1</option></select></label><div id="waterman-sequence-controls"><details id="waterman-sequence-settings"><summary>Waterman sequence (radius navigation)</summary><label>Sequence <select id="waterman-sequence"><option value="increment">Fixed squared-radius increment</option><option value="occupied-shell">Occupied lattice shells (3D)</option></select></label><label>Squared-radius increment <input id="waterman-increment" value="2" maxlength="512"></label><div class="button-row"><button id="waterman-previous">Previous radius</button><button id="waterman-next">Next radius</button></div><p class="muted">SC: all integer sites; FCC: even coordinate sum; BCC: equal coordinate parity. These lattice units differ. Occupied shells use the nearest strict squared-distance threshold at this origin; the increment is unused. Fixed increments can repeat a hull; occupied shells can repeat topology or fail to span 3D. Root mode keeps unit root steps. No benchmark sequence numbering is assumed.</p><output id="waterman-sequence-status" aria-live="polite"></output></details></div>'
    );
    const anchor = document.getElementById('podia-settings');
    if (!anchor) throw Error('Waterman controls require a construction controls anchor.');
    anchor.after(panel);
    this.panel = panel;
    panel.querySelector('#waterman-mode').onchange = () => this.sync();
    panel.querySelector('#waterman-sequence').onchange = () => this.sync();
    panel.querySelector('#waterman-origin').onchange = () => {
      const value = panel.querySelector('#waterman-origin').value;
      if (value !== 'custom')
        value.split(',').forEach((text, i) => (panel.querySelector('#waterman-' + ['x', 'y', 'z'][i]).value = text));
    };
    for (const [id, direction] of [
      ['previous', -1],
      ['next', 1],
    ])
      panel.querySelector('#waterman-' + id).onclick = context.guard(() => this.generate(direction));
    panel.querySelector('#generate-waterman').onclick = context.guard(() => this.generate());
    this.sync();
  }
  inputs() {
    const mode = this.panel.querySelector('#waterman-mode').value;
    if (mode === 'author-root') return { mode, root: this.panel.querySelector('#waterman-root').value };
    if (mode !== 'exact-sphere') throw Error('Choose an exact sphere or centered author root.');
    const lattice = this.panel.querySelector('#waterman-lattice').value;
    if (!['FCC', 'SC', 'BCC'].includes(lattice)) throw Error('Choose FCC, SC or BCC.');
    const sequence = this.panel.querySelector('#waterman-sequence')?.value ?? 'increment';
    if (!['increment', 'occupied-shell'].includes(sequence)) throw Error('Choose fixed increments or occupied shells.');
    return {
      mode,
      lattice,
      sequence,
      increment: this.panel.querySelector('#waterman-increment').value,
      radius_squared: this.panel.querySelector('#waterman-radius-squared').value,
      center: ['x', 'y', 'z'].map((axis) => this.panel.querySelector('#waterman-' + axis).value),
    };
  }
  async generate(direction = 0) {
    if (this.context.isExporting?.()) throw Error('Finish animation export before constructing geometry.');
    if (this.busy || this.fourD?.busy) throw Error('Finish the current Waterman construction first.');
    if (![0, -1, 1].includes(direction)) throw Error('Choose previous, generate or next.');
    const input = this.inputs(),
      root = input.mode === 'author-root',
      shell = !root && input.sequence === 'occupied-shell' && direction !== 0,
      fields = {};
    let resolved;
    if (root)
      fields.root = {
        text: direction ? `(${input.root})+(${direction})` : input.root,
        mode: 'rational',
        integer: true,
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
      };
    else {
      fields.radius_squared = {
        text:
          direction && !shell ? `(${input.radius_squared})+(${direction})*(${input.increment})` : input.radius_squared,
        mode: 'rational',
        min: 0,
        exclusiveMin: !shell,
      };
      if (direction && !shell)
        fields.increment = { text: input.increment, mode: 'rational', min: 0, exclusiveMin: true };
      ['x', 'y', 'z'].forEach((axis, i) => {
        fields[axis] = { text: input.center[i], mode: 'rational' };
      });
    }
    const entry = new NumericEntry({ ...this.context, getTarget: () => this.inputs() });
    this.numericEntry = entry;
    this.busy = true;
    this.sync();
    try {
      const result = await entry.run(
        fields,
        (values, verify, { signal, source }) => {
          const parameters = root
            ? { root: Number(values.root) }
            : { radius_squared: values.radius_squared, center: [values.x, values.y, values.z] };
          resolved = root ? values.root : values.radius_squared;
          if (!root && (shell || input.lattice !== 'FCC')) parameters.lattice = input.lattice;
          if (shell) Object.assign(parameters, { direction, convention: 'waterman-occupied-shell-v1' });
          verify();
          return this.context.generate(
            root
              ? 'waterman-root'
              : shell
                ? 'waterman-shell'
                : input.lattice === 'FCC'
                  ? 'waterman-fcc'
                  : 'waterman-lattice',
            parameters,
            { verifyPublication: verify, signal, sourceSnapshot: source, expressionInputs: input }
          );
        },
        {
          validate: (values) => {
            if (!root && Object.values(values).some((value) => value.length > 256))
              throw Error('Waterman exact rational results exceed the native 256-character bound.');
          },
        }
      );
      if (direction && JSON.stringify(this.inputs()) === JSON.stringify(input)) {
        this.panel.querySelector(root ? '#waterman-root' : '#waterman-radius-squared').value = shell
          ? result.metadata.watermanSequence.radiusSquared
          : resolved;
        const status = this.panel.querySelector('#waterman-sequence-status');
        if (status) {
          const info = result.metadata?.watermanSequence,
            r = info?.hullResiduals;
          status.textContent = shell
            ? `Last occupied shell r^2 = ${info.radiusSquared}; ${info.shellCoordinates.length} boundary sites. Numerical support residual ${Math.max(r.maximumOutsideSupportResidual, r.maximumFacetPlanarityResidual).toExponential(2)}.`
            : root
              ? 'Centered FCC root sequence.'
              : 'Fixed squared-radius increment.';
        }
      }
      return result;
    } finally {
      if (this.numericEntry === entry) this.numericEntry = null;
      this.busy = false;
      this.sync();
    }
  }
  cancel() {
    this.numericEntry?.cancel();
    this.fourD?.cancel();
  }
  sync() {
    const root = this.panel.querySelector('#waterman-mode').value === 'author-root',
      disabled = this.busy || Boolean(this.fourD?.busy) || Boolean(this.context.isExporting?.());
    for (const node of this.panel.querySelectorAll('input,select,button'))
      if (
        !['waterman-sequence', 'waterman-increment'].includes(node.id) &&
        !this.fourD?.panel.contains(node) &&
        node.disabled !== disabled
      )
        node.disabled = disabled;
    const sequence = this.panel.querySelector('#waterman-sequence');
    for (const id of ['lattice', 'origin', 'increment', 'sequence']) {
      const node = this.panel.querySelector('#waterman-' + id),
        value = disabled || root || (id === 'increment' && sequence?.value === 'occupied-shell');
      if (node && node.disabled !== value) node.disabled = value;
    }
    this.panel.querySelector('#waterman-root-row').hidden = !root;
    this.panel.querySelector('#waterman-root').disabled = disabled || !root;
    for (const id of ['radius', 'x', 'y', 'z']) this.panel.querySelector('#waterman-' + id + '-row').hidden = root;
    for (const id of ['radius-squared', 'x', 'y', 'z'])
      this.panel.querySelector('#waterman-' + id).disabled = disabled || root;
    const reason =
      this.busy || this.fourD?.busy
        ? 'Finish or cancel the current construction.'
        : this.context.isExporting?.()
          ? 'Finish or cancel export first.'
          : 'Centered root mode uses FCC, origin (0, 0, 0) and unit root steps.';
    explainAvailability(this.panel, reason, {
      'waterman-root': disabled ? reason : 'Choose Centered root N to edit the root.',
    });
    this.fourD?.sync();
  }
}
