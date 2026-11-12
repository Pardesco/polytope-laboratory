import { NumericEntry } from './numeric-entry.mjs';
import { explainAvailability } from './availability-copy.mjs';

export class AddDualControls {
  constructor(context, { mount = true } = {}) {
    this.context = context;
    this.busy = false;
    this.entry = new NumericEntry({ ...context, getTarget: () => this.fields() });
    if (!mount) return;
    const panel = document.createElement('div');
    panel.id = 'add-dual-controls';
    panel.innerHTML =
      '<button id="add-dual" class="wide">Add Dual</button><details id="add-dual-options"><summary>Add Dual sizing</summary><label>Dual size <select id="add-dual-sizing"><option value="contact">Meet at edge midpoints / 4D ridges</option><option value="reciprocal">Use reciprocation center and radius</option></select></label><p class="muted">Automatic: checked common edge-midpoint sphere in 3D; sphere at the vertex mean tangent to all polygonal ridges in 4D. Explicit sizing uses the center/radius under Dual center and radius. Components remain separate, with blue primal and orange dual default colors.</p></details>';
    document.getElementById('make-dual').after(panel);
    this.panel = panel;
    panel.querySelector('#add-dual').onclick = context.guard(() => this.apply());
  }
  fields() {
    return {
      sizing: document.getElementById('add-dual-sizing').value,
      center: document.getElementById('incidence-dual-center').value,
      radius: document.getElementById('incidence-dual-radius').value,
    };
  }
  async apply() {
    if (this.busy || this.context.isExporting()) throw Error('Finish current preparation/export before adding a dual.');
    const state = this.context.getState();
    if (![3, 4].includes(state?.model.dimension)) throw Error('Add Dual requires 3D or 4D geometry.');
    const raw = this.fields();
    this.busy = true;
    this.sync();
    try {
      if (raw.sizing === 'contact')
        return await this.context.commit('add-dual', { sizing: 'contact' }, 'Add Dual (edge / ridge contact)');
      const fields = { radius: { text: raw.radius, min: 0, exclusiveMin: true } };
      if (raw.center.trim()) fields.center = { text: raw.center, kind: 'vector', length: state.model.dimension };
      return await this.entry.run(fields, async (values, verify, { signal }) => {
        verify();
        return this.context.commit(
          'add-dual',
          { sizing: 'reciprocal', center: values.center ?? null, radius: values.radius },
          'Add Dual (reciprocation)',
          { signal, verifyPublication: verify }
        );
      });
    } finally {
      this.busy = false;
      this.sync();
    }
  }
  cancel() {
    this.entry.cancel();
  }
  sync() {
    if (!this.panel) return;
    const m = this.context.getState()?.model;
    this.panel.querySelector('#add-dual').disabled =
      this.busy || this.context.isExporting() || ![3, 4].includes(m?.dimension);
    this.panel.querySelector('#add-dual-sizing').disabled = this.busy || this.context.isExporting();
    explainAvailability(
      this.panel,
      this.busy
        ? 'Finish or cancel the current construction.'
        : this.context.isExporting()
          ? 'Finish animation export before editing the model.'
          : 'Choose a 3D or 4D source model.'
    );
  }
}
