import { ModelReports } from './model-reports.mjs';
const abort = () => Object.assign(Error('Cell-facing calculation canceled or superseded.'), { name: 'AbortError' });
export class CellFacingControls {
  constructor(context) {
    this.context = context;
    this.busy = false;
    this.root = document.createElement('div');
    this.root.id = 'cell-facing-controls';
    this.root.innerHTML =
      '<label>4D cells <select id="cell-facing"><option value="all">All directions</option><option value="hide-front">Hide front</option><option value="hide-back">Hide back</option><option value="front">Front only</option><option value="back">Back only</option></select></label><output id="cell-facing-result"></output>';
    document.getElementById('cell-visibility-controls').after(this.root);
    this.select = this.root.querySelector('select');
    this.output = this.root.querySelector('output');
    this.select.onchange = context.guard(() => this.change());
    this.sync();
  }
  sync() {
    const state = this.context.getState();
    if (this.job && (this.job.state !== state || this.context.isExporting())) {
      this.reports.invalidate();
      this.job = null;
      this.busy = false;
    }
    this.root.hidden = state?.model.dimension !== 4 || !state?.model.cells?.length;
    const supported = state?.model.interpretation === 'convex-polytope';
    this.select.disabled = this.busy || this.context.isExporting() || !supported;
    this.select.title = supported
      ? 'Facing is relative to the 4D projection observer. Grazing cells remain in Hide front/back.'
      : 'Generalized cells require explicit orientation semantics; use source cell Hide/Isolate.';
    this.select.value = this.job?.mode ?? (state?.view.cellFacing || 'all');
    const counts = this.context.getCounts();
    this.output.textContent = this.busy
      ? 'Preparing source cell planes…'
      : counts
        ? `${counts.front} front / ${counts.back} back / ${counts.grazing} grazing`
        : '';
  }
  cancel() {
    this.reports?.invalidate();
    this.job = null;
    this.busy = false;
    this.sync();
  }
  async change() {
    if (this.busy || this.context.isExporting()) {
      this.sync();
      throw new Error('Finish or cancel the current operation before changing cell facing.');
    }
    const state = this.context.getState(),
      mode = this.select.value;
    if (!state) throw new Error('Open a source model first.');
    if (!['all', 'hide-front', 'hide-back', 'front', 'back'].includes(mode)) {
      this.sync();
      throw Error('Choose an available cell-facing mode.');
    }
    this.reports ??= new ModelReports(this.context);
    const ticket = this.reports.begin(['facing'], {
        getTarget: () => [this.select.value, state.view.cellFacing ?? 'all'],
      }),
      job = { state, mode, ticket };
    this.job = job;
    this.busy = true;
    this.sync();
    const verify = () => {
      if (this.job !== job || ticket.signal.aborted) throw abort();
      if (this.context.isExporting() || !this.reports.current(ticket, 'facing'))
        throw Error('The source, cell-facing mode or export state changed while cell planes were evaluated.');
    };
    try {
      let cache = state.view.cellFacingCache;
      verify();
      if (mode !== 'all' && (!cache || cache.sourceFingerprint !== state.model.fingerprint))
        cache = await this.context.evaluate(JSON.parse(ticket.signature), { signal: ticket.signal });
      verify();
      state.view.cellFacing = mode;
      if (cache) state.view.cellFacingCache = cache;
      this.context.display();
      this.context.markDirty();
    } finally {
      if (this.job === job) {
        this.job = null;
        this.busy = false;
        this.reports.invalidate();
        this.sync();
      }
    }
  }
}
