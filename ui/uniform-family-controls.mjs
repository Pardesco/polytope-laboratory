import { NumericEntry } from './numeric-entry.mjs';
export class UniformFamilyControls {
  constructor(context) {
    this.context = context;
    this.busy = false;
    const panel = document.createElement('details');
    panel.id = 'uniform-family-settings';
    panel.innerHTML =
      '<summary>Uniform prism families</summary><label>Family <select id="uniform-family"><option value="duoprism">4D duoprism</option><option value="antiprism-prism">4D antiprismatic prism</option><option value="prism">3D prism</option><option value="antiprism">3D antiprism</option></select></label><label>Polygon sides n <input id="uniform-family-n" value="5"></label><label>Second polygon m <input id="uniform-family-m" value="5"></label><button id="generate-uniform-family" class="wide">Create uniform model</button><p class="muted">Equal edge lengths and regular convex faces. Counts 3–200; duoprisms at most 4,000 vertices. Numerical coordinates.</p>';
    document.getElementById('antiprism-settings').after(panel);
    this.panel = panel;
    panel.querySelector('#uniform-family').onchange = () => this.sync();
    panel.querySelector('#generate-uniform-family').onclick = context.guard(() => this.generate());
    this.sync();
  }
  read() {
    return Object.fromEntries(
      ['uniform-family', 'uniform-family-n', 'uniform-family-m'].map((id) => [
        id,
        this.panel.querySelector('#' + id).value,
      ])
    );
  }
  async generate() {
    if (this.busy) throw Error('Finish the current uniform family construction first.');
    if (this.context.isExporting?.()) throw Error('Finish export before constructing geometry.');
    const target = this.read(),
      family = target['uniform-family'];
    if (!['duoprism', 'antiprism-prism', 'prism', 'antiprism'].includes(family))
      throw Error('Choose a supported uniform family.');
    const fields = { n: { text: target['uniform-family-n'], integer: true, min: 3, max: 200 } };
    if (family === 'duoprism') fields.m = { text: target['uniform-family-m'], integer: true, min: 3, max: 200 };
    const numeric = new NumericEntry({ ...this.context, getTarget: () => this.read() });
    this.numericEntry = numeric;
    this.busy = true;
    this.sync();
    try {
      return await numeric.run(fields, ({ n, m = 5 }, verify, { signal, source }) => {
        if (family === 'duoprism' && n * m > 4000) throw Error('Uniform duoprism limit is 4,000 product vertices.');
        verify();
        return this.context.generate(
          'uniform-family',
          { family, n, m },
          { signal, sourceSnapshot: source, verifyPublication: verify }
        );
      });
    } finally {
      if (this.numericEntry === numeric) this.numericEntry = null;
      this.busy = false;
      this.sync();
    }
  }
  cancel() {
    this.numericEntry?.cancel();
  }
  sync() {
    const disabled = this.busy || Boolean(this.context.isExporting?.());
    for (const node of this.panel.querySelectorAll('input,select,button')) node.disabled = disabled;
    this.panel.querySelector('#uniform-family-m').disabled =
      disabled || this.panel.querySelector('#uniform-family').value !== 'duoprism';
  }
}
