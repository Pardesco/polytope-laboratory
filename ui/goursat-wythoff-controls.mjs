import tranche from '../engine/catalog_data/goursat_wythoff/tranche.json' with { type: 'json' };
import schwarz from '../engine/catalog_data/goursat_wythoff/schwarz.json' with { type: 'json' };
import { captureNativeSource, verifyNativeSource } from './native-source-binding.mjs';

export const GOURSAT_FIXTURES = tranche.entries;
export const SCHWARZ_FIXTURES = schwarz.entries;
const FIXTURES = [...GOURSAT_FIXTURES, ...SCHWARZ_FIXTURES];
export class GoursatWythoffControls {
  constructor(context) {
    this.context = context;
    this.busy = false;
    const panel = document.createElement('details');
    panel.id = 'goursat-wythoff-settings';
    panel.innerHTML =
      '<summary>Goursat / Schwarz Wythoff shapes</summary><p class="muted">Generate 79 checked B4/F4/H4 star polychora or 63 Schwarz-triangle polyhedra from their reflection definitions.</p><label>Wythoff shape <select id="goursat-wythoff-choice"></select></label><button id="generate-goursat-wythoff" class="wide">Create verified Wythoff shape</button><output id="goursat-wythoff-result" role="status" aria-live="polite"></output><details><summary>Construction evidence and next queue</summary><p>Float64, approximate. Root-group order, independent boundary counts, equal edges, face/cell flatness, ordered reflection actions and local links are checked before publication. Crossing faces keep their literal cycles; no star solid interior or exact certificate is inferred.</p><pre id="goursat-wythoff-evidence"></pre><p id="goursat-wythoff-queue"></p></details>';
    document.getElementById('uniform-family-settings').after(panel);
    this.panel = panel;
    const select = panel.querySelector('#goursat-wythoff-choice');
    for (const row of FIXTURES) {
      const option = document.createElement('option');
      option.value = row.key;
      option.textContent = `${row.dimension === 3 ? '3D' : '4D'} · ${row.name} (${row.bowers ?? 'U' + row.uniformNumber}) · ${row.symbol}`;
      select.append(option);
    }
    panel.querySelector('#goursat-wythoff-queue').textContent =
      `Next queue: ${tranche.queue.length} unregistered [3,3,5/2] ring masks and ${schwarz.queue.length} snub/exceptional U entries outside the triangle-reflection generator. All 79 registered native 4D rows now have this qualification. No new baseline identity is inferred.`;
    panel.querySelector('#generate-goursat-wythoff').onclick = context.guard(() => this.generate());
    this.sync();
  }
  async generate() {
    if (this.busy) throw Error('Finish the current Goursat construction first.');
    if (this.context.isExporting?.()) throw Error('Finish export before constructing geometry.');
    const key = this.panel.querySelector('#goursat-wythoff-choice').value;
    if (!FIXTURES.some((row) => row.key === key)) throw Error('Choose a registered Goursat or Schwarz Wythoff shape.');
    const owner = captureNativeSource(this.context),
      controller = new AbortController();
    this.controller = controller;
    this.busy = true;
    this.sync();
    const verify = () => {
      if (controller.signal.aborted)
        throw Object.assign(Error('Goursat construction canceled.'), { name: 'AbortError' });
      verifyNativeSource(this.context, owner);
      if (this.panel.querySelector('#goursat-wythoff-choice').value !== key)
        throw Error('Star choice changed. Repeat the construction.');
    };
    const output = this.panel.querySelector('#goursat-wythoff-result');
    output.textContent = 'Checking the finite reflection construction…';
    try {
      const model = await this.context.generate(
        'regular',
        { key },
        { signal: controller.signal, verifyPublication: verify }
      );
      if (!controller.signal.aborted) {
        output.textContent = `Last generated: ${model.name}. V/E/F/C ${['vertices', 'edges', 'faces', 'cells'].map((k) => model[k].length).join('/')}; numerical checks passed.`;
        this.panel.querySelector('#goursat-wythoff-evidence').textContent = JSON.stringify(
          {
            construction: model.provenance.goursatQualification ?? model.provenance.schwarzQualification,
            verification: model.metadata.goursatVerification ?? model.metadata.schwarzVerification,
          },
          null,
          2
        );
      }
      return model;
    } catch (error) {
      output.textContent = controller.signal.aborted
        ? 'Construction canceled.'
        : 'Construction failed: ' + error.message;
      throw error;
    } finally {
      if (this.controller === controller) this.controller = null;
      this.busy = false;
      this.sync();
    }
  }
  cancel() {
    this.controller?.abort();
  }
  sync() {
    for (const node of this.panel.querySelectorAll('select,button'))
      node.disabled = this.busy || Boolean(this.context.isExporting?.());
  }
}

export function appendGeneratedTranches(control, data) {
  for (const tranche of data.generatedTranches ?? []) {
    const root = control.make('details', 'corpus-' + tranche.id);
    root.append(
      control.make('summary', null, `${tranche.label}: ${tranche.registeredGeneratedIdentities} generated identities`)
    );
    root.append(
      control.make('p', null, tranche.scope),
      control.make('p', null, `Definition manifest SHA-256: ${tranche.manifestSha256}`)
    );
    for (const row of tranche.entries) {
      const button = control.make('button', null, `${row.name} · ${row.coxeterDynkinSymbol}`);
      button.type = 'button';
      button.disabled = !row.definitionCurrent;
      button.onclick = control.guard(() => control.open({ key: row.key, name: row.name }));
      root.append(
        button,
        control.make('p', null, `${row.identity} (${row.status}); definition SHA-256 ${row.definitionSha256}`)
      );
    }
    const queue = control.make('details');
    queue.append(control.make('summary', null, `Next queue: ${tranche.queue.length} unqualified definitions`));
    for (const row of tranche.queue) queue.append(control.make('p', null, `${row.symbol}: ${row.reason}`));
    root.append(queue);
    control.summary.append(root);
  }
}
