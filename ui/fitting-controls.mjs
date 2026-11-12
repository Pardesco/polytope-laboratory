import { NumericEntry } from './numeric-entry.mjs';
import { captureNativeSource, verifyNativeSource } from './native-source-binding.mjs';
import { fittingResultText } from './fitting-report.mjs';
import { explainAvailability } from './availability-copy.mjs';
import { eligibleFittingSource as eligible, FITTING_DOMAIN_COPY } from './fitting-domain.mjs';

const ids = ['mode', 'target', 'faces', 'evaluations', 'residual', 'solver'];
const conditions = ['regular-faces', 'planar-faces', 'equal-edges', 'equal-areas'];
const checks = [...conditions, 'keep-symmetry', 'fix-scale'];
const wait = (promise, signal) =>
  new Promise((resolve, reject) => {
    const canceled = () => {
      signal.removeEventListener('abort', canceled);
      reject(Object.assign(Error('Geometry fitting canceled.'), { name: 'AbortError' }));
    };
    if (signal.aborted) return canceled();
    signal.addEventListener('abort', canceled, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener('abort', canceled);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', canceled);
        reject(error);
      }
    );
  });

export class FittingControls {
  constructor(context, { anchor = 'expansion-settings' } = {}) {
    this.context = context;
    this.busy = false;
    this.previewData = null;
    const panel = document.createElement('section');
    panel.id = 'fitting-settings';
    panel.innerHTML =
      '<p class="panel-title">Fit geometric conditions</p><button id="make-faces-regular" class="wide accent">Make faces regular</button><details id="fitting-options"><summary>Fitting options</summary><label>Primary condition <select id="fitting-mode"><option value="regular-faces">Regular faces</option><option value="planar-faces">Planar faces</option><option value="equal-edges">Equal edge lengths</option><option value="equal-areas">Equal face areas</option></select></label><p class="muted">Also enforce (combine with primary condition):</p>' +
      conditions
        .map(
          (key) =>
            `<label><input id="fitting-${key}" type="checkbox">${{ 'regular-faces': 'Regular faces', 'planar-faces': 'Planar faces', 'equal-edges': 'Equal edge lengths', 'equal-areas': 'Equal face areas' }[key]}</label>`
        )
        .join('') +
      '<label><input id="fitting-keep-symmetry" type="checkbox">Keep current geometric symmetry</label><label><input id="fitting-fix-scale" type="checkbox" checked>Fix scale (preserve source mean edge)</label><label>Target length / area (Fix scale off; one condition) <input id="fitting-target" maxlength="512"></label><label>Regular face IDs (blank: all; JSON array) <input id="fitting-faces" placeholder="[0, 2]" maxlength="4096"></label><label>Max evaluations <input id="fitting-evaluations" value="100" maxlength="512"></label><label>Residual tolerance <input id="fitting-residual" value="1e-7" maxlength="512"></label><label>Solver tolerance <input id="fitting-solver" value="1e-11" maxlength="512"></label><button id="preview-fitting">Solve preview</button></details><output id="fitting-result" style="white-space:pre-line" aria-live="polite"></output><label><input id="accept-fitting-near-miss" type="checkbox">Accept a valid candidate with unresolved targets</label><button id="adopt-fitting" disabled>Adopt fitted model</button><button id="cancel-fitting" hidden>Cancel fit</button>';
    const domain = document.createElement('p');
    domain.id = 'fitting-source-domain';
    domain.className = 'muted';
    domain.textContent = FITTING_DOMAIN_COPY;
    panel.querySelector('#fitting-options summary').after(domain);
    document.getElementById(anchor).after(panel);
    this.panel = panel;
    panel.querySelector('#preview-fitting').onclick = context.guard(() => this.preview());
    panel.querySelector('#adopt-fitting').onclick = context.guard(() => this.adopt());
    panel.querySelector('#cancel-fitting').onclick = () => this.cancel();
    this.node('make-faces-regular').onclick = context.guard(() => this.makeRegular());
    for (const id of ids) this.node('fitting-' + id).onchange = () => this.sync();
    for (const id of checks) this.node('fitting-' + id).onchange = () => this.sync();
    this.node('accept-fitting-near-miss').onchange = () => this.sync();
    this.sync();
  }
  node(id) {
    return this.panel.querySelector('#' + id);
  }
  fields() {
    return {
      ...Object.fromEntries(ids.map((id) => [id, this.node('fitting-' + id).value])),
      ...Object.fromEntries(checks.map((id) => [id, Boolean(this.node('fitting-' + id)?.checked)])),
    };
  }
  history() {
    return JSON.stringify(this.context.getDocument()?.operationHistory ?? null);
  }
  validPreview() {
    const cached = this.previewData;
    if (!cached) return false;
    verifyNativeSource(this.context, cached.owner);
    if (this.history() !== cached.history || JSON.stringify(this.fields()) !== cached.fields)
      throw Error('Fitting source history or controls changed. Solve a new preview.');
    return true;
  }
  async execute(adopting) {
    if (this.busy) throw Error('Finish or cancel the current fit first.');
    if (!eligible(this.context.getState()?.model)) throw Error(FITTING_DOMAIN_COPY);
    if (adopting && !this.validPreview()) throw Error('Solve a current preview before adoption.');
    const cached = this.previewData,
      owner = captureNativeSource(this.context),
      history = this.history(),
      input = this.fields();
    const accepted = Boolean(this.node('accept-fitting-near-miss').checked);
    if (adopting && (!cached.packet.model || !cached.packet.evidence.geometricValidity.passed))
      throw Error('Invalid fitted candidates cannot be adopted.');
    if (adopting && !cached.packet.evidence.requestedConstraintsSatisfied && !accepted)
      throw Error('Explicitly accept the valid candidate with unresolved targets.');
    if (!conditions.includes(input.mode)) throw Error('Choose a geometric fitting condition.');
    const objectives = [...new Set([input.mode, ...conditions.filter((key) => input[key])])];
    let face_ids = null;
    if (objectives.includes('regular-faces') && input.faces.trim()) {
      try {
        face_ids = JSON.parse(input.faces);
      } catch {
        throw Error('Enter regular face IDs as a JSON array.');
      }
      if (
        !Array.isArray(face_ids) ||
        !face_ids.length ||
        face_ids.some((i) => !Number.isInteger(i) || i < 0 || i >= this.context.getState().model.faces.length) ||
        new Set(face_ids).size !== face_ids.length
      )
        throw Error('Choose distinct literal source face IDs.');
    }
    const fields = {
      max_evaluations: { text: input.evaluations, integer: true, min: 1, max: 400 },
      residual_tolerance: { text: input.residual, min: 1e-10, max: 1e-3 },
      solver_tolerance: { text: input.solver, min: 1e-13, max: 1e-3 },
    };
    if (
      !input['fix-scale'] &&
      objectives.length === 1 &&
      ['equal-edges', 'equal-areas'].includes(input.mode) &&
      input.target.trim()
    )
      fields.target = { text: input.target, min: 1e-100, max: 1e100 };
    const read = () => ({
      fields: this.fields(),
      accepted: adopting ? Boolean(this.node('accept-fitting-near-miss').checked) : false,
    });
    const entry = new NumericEntry({ ...this.context, getTarget: read });
    this.numericEntry = entry;
    this.busy = true;
    if (!adopting) this.previewData = null;
    this.sync();
    try {
      return await entry.run(fields, async (values, verify, { signal, source }) => {
        const check = () => {
          verify();
          if (this.history() !== history) throw Error('Fitting source history changed. Repeat the solve.');
        };
        const params = {
          mode: input.mode,
          objectives,
          fix_scale: input['fix-scale'],
          keep_symmetry: input['keep-symmetry'],
          ...values,
          face_ids,
        };
        check();
        if (adopting) {
          this.previewData = null;
          const result = await wait(
            this.context.commit(
              'geometry-fit',
              { ...params, adoption: accepted ? 'valid-near-miss' : 'constraints-satisfied' },
              'Fit geometric conditions',
              { signal, verifyPublication: check, sourceSnapshot: source, expressionInputs: input }
            ),
            signal
          );
          this.show(cached.packet);
          return result;
        }
        const packet = await wait(
          this.context.preview('geometry-fit-preview', params, {
            signal,
            verifyPublication: check,
            sourceSnapshot: source,
          }),
          signal
        );
        check();
        if (
          !packet?.evidence ||
          typeof packet.evidence.requestedConstraintsSatisfied !== 'boolean' ||
          typeof packet.evidence.geometricValidity?.passed !== 'boolean' ||
          packet.evidence.sourceModelId !== source.id ||
          !Number.isFinite(packet.evidence.residuals?.maximum) ||
          !Number.isFinite(packet.evidence.residuals?.rms) ||
          Boolean(packet.model) !== packet.evidence.geometricValidity.passed
        )
          throw Error('Native fitting preview is malformed.');
        if (
          packet.model &&
          ['edges', 'faces', 'cells'].some((key) => JSON.stringify(packet.model[key]) !== JSON.stringify(source[key]))
        )
          throw Error('Fitting preview changed literal source incidence.');
        this.previewData = { owner, history, fields: JSON.stringify(input), packet };
        this.show(packet);
        return packet;
      });
    } finally {
      if (this.numericEntry === entry) this.numericEntry = null;
      this.busy = false;
      this.sync();
    }
  }
  preview() {
    return this.execute(false);
  }
  adopt() {
    return this.execute(true);
  }
  async makeRegular() {
    if (this.busy) throw Error('Finish or cancel the current fit first.');
    this.node('fitting-mode').value = 'regular-faces';
    const packet = await this.preview();
    if (packet.model && packet.evidence.requestedConstraintsSatisfied) return this.adopt();
    return packet;
  }
  show(packet) {
    this.node('fitting-result').textContent = fittingResultText(packet);
  }
  cancel() {
    this.numericEntry?.cancel();
  }
  sync() {
    const blocked = this.busy || Boolean(this.context.isExporting?.());
    for (const node of this.panel.querySelectorAll('input,select,button')) node.disabled = blocked;
    this.node('preview-fitting').disabled = blocked || !eligible(this.context.getState()?.model);
    if (this.node('make-faces-regular'))
      this.node('make-faces-regular').disabled = blocked || !eligible(this.context.getState()?.model);
    const input = this.fields(),
      objectives = [...new Set([input.mode, ...conditions.filter((key) => input[key])])];
    this.node('fitting-target').disabled =
      blocked || input['fix-scale'] || objectives.length !== 1 || !['equal-edges', 'equal-areas'].includes(input.mode);
    this.node('fitting-faces').disabled = blocked || !objectives.includes('regular-faces');
    let current = false;
    try {
      current = this.validPreview();
    } catch {
      this.previewData = null;
      this.node('fitting-result').textContent = 'Source or controls changed; solve a new preview.';
    }
    const valid = current && Boolean(this.previewData.packet.model),
      unresolved = valid && !this.previewData.packet.evidence.requestedConstraintsSatisfied;
    this.node('adopt-fitting').disabled =
      blocked || !valid || (unresolved && !this.node('accept-fitting-near-miss').checked);
    this.node('accept-fitting-near-miss').disabled = blocked || !unresolved;
    this.node('cancel-fitting').hidden = !this.busy;
    this.node('cancel-fitting').disabled = !this.busy;
    explainAvailability(
      this.panel,
      blocked ? 'Finish or cancel the current fit/export.' : FITTING_DOMAIN_COPY,
      blocked
        ? {}
        : {
            'adopt-fitting':
              'Solve a valid preview first. Accept unresolved targets explicitly before adopting a near miss.',
            'fitting-target': 'Turn off Fix scale and choose one equal-edge or equal-area condition.',
            'fitting-faces': 'Include the Regular faces condition to choose face IDs.',
            'accept-fitting-near-miss': 'Available when a valid preview has unresolved targets.',
            'cancel-fitting': 'No fit is running.',
          }
    );
  }
}
