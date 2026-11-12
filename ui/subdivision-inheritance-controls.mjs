import { NumericEntry } from './numeric-entry.mjs';
import { captureNativeSource, verifyNativeSource } from './native-source-binding.mjs';
import { captureContentHistoryPublication } from './element-content-history.mjs';

const canonical = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
const withoutId = (model) => {
  const result = { ...model };
  delete result.id;
  return result;
};
export function inheritanceStateSignature(state) {
  const annotations = state?.view?.elementAnnotations;
  return canonical({
    model: withoutId(state?.model),
    notes: state?.notes ?? '',
    unit: state?.view?.coordinateUnit,
    annotations: annotations ? { ...annotations, source: withoutId(annotations.source), sourceSha256: null } : null,
    detached: state?.view?.elementContentDetached,
    transfer: state?.view?.elementContentTransfer,
  });
}
export function describeInheritance(packet) {
  const r = packet.receipt,
    m = packet.state.model,
    c = r.counts;
  return {
    summary:
      `${c.vertices} vertices · ${c.edges} edges · ${c.faces} faces · ${c.cells} cells. ` +
      `${r.faceColorSourceIds.filter((i) => i !== null).length} faces inherit source RGBA; ${r.detachedColorFaceIds.length} source colors remain in source history only. ` +
      `${r.mappedContent.length} content entries mapped; ${r.detachedContent.length} detached; ${r.retainedArchiveCount} source archives retained. ` +
      r.numericPolicy,
    owners:
      r.sourceFaceIds
        .map(
          (parent, i) =>
            `Face ${i}: ${parent === null ? 'no verified source face' : `source face ${parent}`}; ` +
            (r.faceColorSourceIds[i] === null
              ? 'color unassigned'
              : `color from source face ${r.faceColorSourceIds[i]} (${m.metadata.offColors.faces[i].encoding} [${m.metadata.offColors.faces[i].values.join(', ')}])`)
        )
        .join('\n') +
      '\n' +
      r.detachedContent
        .map((e) => `${e.kind} ${e.sourceIndex}: content detached to its original source archive`)
        .join('\n'),
  };
}

export class SubdivisionInheritanceControls {
  constructor(context) {
    this.context = context;
    this.busy = false;
    this.previewData = null;
    this.panel = document.createElement('section');
    this.panel.id = 'subdivision-inheritance-controls';
    this.panel.innerHTML = `<h3>Subdivision inheritance</h3>
      <label>Preview settings from <select id="inheritance-kind"><option value="faces">Face subdivision above</option><option value="conway">Conway notation above</option><option value="edges">Edge subdivision panel</option></select></label>
      <p>Uses the current method, height or notation; edge mode uses Segments per edge and Source edge IDs. Repeat an adopted step for another refinement level. Labels and textures are archived with their source, without automatic replication onto child faces.</p>
      <button id="preview-subdivision-inheritance">Preview inheritance</button>
      <button id="adopt-subdivision-inheritance" disabled>Adopt preview</button>
      <button id="cancel-subdivision-inheritance" hidden>Cancel preview</button>
      <output id="subdivision-inheritance-status" aria-live="polite"></output>
      <details><summary>Face, color and content owners</summary><pre id="subdivision-inheritance-owners" class="code-box"></pre></details>`;
    document.getElementById('face-conway-settings').append(this.panel);
    this.node('preview-subdivision-inheritance').onclick = context.guard(() => this.apply());
    this.node('adopt-subdivision-inheritance').onclick = context.guard(() => this.apply(true));
    this.node('cancel-subdivision-inheritance').onclick = () => this.cancel();
    for (const id of [
      'face-method',
      'face-height',
      'conway-notation',
      'conway-height',
      'edge-divisions',
      'subdivision-edge-ids',
    ])
      for (const event of ['input', 'change']) document.getElementById(id).addEventListener(event, () => this.sync());
    this.node('inheritance-kind').onchange = () => this.sync();
    this.sync();
  }
  node(id) {
    return this.panel.querySelector('#' + id);
  }
  target() {
    const value = (id) => document.getElementById(id).value;
    const kind = this.node('inheritance-kind').value;
    if (kind === 'faces') return { kind, method: value('face-method'), height: value('face-height') };
    if (kind === 'conway') return { kind, notation: value('conway-notation'), height: value('conway-height') };
    if (kind === 'edges') return { kind, divisions: value('edge-divisions'), ids: value('subdivision-edge-ids') };
    throw Error('Choose a supported refinement preview.');
  }
  history() {
    return canonical(this.context.getDocument()?.operationHistory ?? null);
  }
  clear(message = '') {
    this.previewData = null;
    this.node('subdivision-inheritance-status').textContent = message;
    this.node('subdivision-inheritance-owners').textContent = '';
  }
  verifyPreview() {
    const cached = this.previewData;
    if (!cached) return false;
    verifyNativeSource(this.context, cached.owner);
    cached.content();
    if (cached.target !== canonical(this.target()) || cached.history !== this.history())
      throw Error('Refinement settings or history changed; preview again.');
    return true;
  }
  async apply(adopting = false) {
    if (this.busy || this.context.isBusy?.() || this.context.isExporting())
      throw Error('Finish or cancel the current preview/export first.');
    if (adopting && !this.verifyPreview()) throw Error('Compute a current inheritance preview first.');
    const cached = adopting ? this.previewData : null,
      input = this.target(),
      spec = {};
    let operation, parameters;
    if (input.kind === 'faces') {
      operation = 'subdivide-faces';
      parameters = { method: input.method };
      if (input.method === 'kis') spec.height = { text: input.height, min: 0, max: 1e6 };
    } else if (input.kind === 'conway') {
      operation = 'conway';
      parameters = { notation: input.notation.trim() };
      if (parameters.notation.includes('k') && input.height.trim())
        spec.height = { text: input.height, min: 0, exclusiveMin: true, max: 1e6 };
    } else {
      operation = 'subdivide-edges';
      parameters = {};
      spec.divisions = { text: input.divisions, integer: true, min: 1, max: 128 };
      if (input.ids.trim()) {
        const tokens = input.ids.trim().split(/[\s,;]+/);
        if (tokens.some((x) => !/^\d+$/.test(x) || !Number.isSafeInteger(Number(x))))
          throw Error('Source edge IDs must be literal nonnegative integers.');
        parameters.edge_ids = tokens.map(Number);
      }
    }
    if (!Object.keys(spec).length) spec.defaults = { text: '0', min: 0, max: 0 };
    const owner = captureNativeSource(this.context),
      content = captureContentHistoryPublication(this.context),
      history = this.history();
    const entry = new NumericEntry({ ...this.context, getTarget: () => this.target() });
    this.entry = entry;
    if (!adopting) this.clear();
    this.busy = true;
    this.sync();
    try {
      return await entry.run(spec, async (values, verify, { signal }) => {
        const verifyPublication = () => {
          verify();
          content();
          if (history !== this.history()) throw Error('Source operation history changed; preview again.');
        };
        values = { ...values };
        delete values.defaults;
        parameters = { ...parameters, ...values };
        verifyPublication();
        if (cached) {
          if (canonical(parameters) !== cached.parameters)
            throw Error('Evaluated refinement parameters changed; preview again.');
          return this.context.commit(operation, parameters, 'Adopt refinement preview', {
            signal,
            verifyPublication,
            verifyResult: (result) => {
              if (
                inheritanceStateSignature(result.states[result.cursor]) !==
                inheritanceStateSignature(cached.packet.state)
              ) {
                this.clear('Native result disagreed with preview; preview again.');
                throw Error('Native refinement geometry, colors or content differed from the preview.');
              }
            },
          });
        }
        const packet = await this.context.run(
          'subdivision-inheritance-preview',
          { document: structuredClone(this.context.getDocument()), operation, parameters },
          null,
          'Preview subdivision inheritance',
          { signal }
        );
        verifyPublication();
        const r = packet?.receipt,
          m = packet?.state?.model;
        if (
          !m?.validation?.passed ||
          r?.scenarioId !== 'con-08-subdivision-inheritance' ||
          r.operation !== operation ||
          canonical(r.parameters) !== canonical(parameters) ||
          r.sourceFaceIds?.length !== m.faces.length ||
          r.faceColorSourceIds?.length !== m.faces.length
        )
          throw Error('Malformed native subdivision inheritance preview.');
        this.previewData = {
          owner,
          content,
          history,
          target: canonical(input),
          parameters: canonical(parameters),
          packet,
        };
        const text = describeInheritance(packet);
        this.node('subdivision-inheritance-status').textContent = text.summary;
        this.node('subdivision-inheritance-owners').textContent = text.owners;
        return packet;
      });
    } finally {
      this.busy = false;
      this.entry = null;
      this.sync();
    }
  }
  cancel() {
    this.entry?.cancel();
  }
  sync() {
    const blocked = this.busy || this.context.isBusy?.() || this.context.isExporting();
    for (const node of this.panel.querySelectorAll('select,button')) node.disabled = blocked;
    this.node('preview-subdivision-inheritance').disabled ||= !this.context.getState();
    let valid = false;
    try {
      valid = this.verifyPreview();
    } catch {
      this.clear('Source, content or settings changed; preview again.');
    }
    this.node('adopt-subdivision-inheritance').disabled = blocked || !valid;
    this.node('cancel-subdivision-inheritance').hidden = !this.busy;
    this.node('cancel-subdivision-inheritance').disabled = !this.busy;
  }
}
