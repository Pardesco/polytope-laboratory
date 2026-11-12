import { contentSignature, contentParameters } from './element-content-lifecycle.mjs';
import { NetTabControls } from './net-tab-controls.mjs';
import { NetColorPrintingControls } from './net-color-printing-controls.mjs';
import { ExpressionEntry, captureExpressionOwner, verifyExpressionOwner } from './expression-entry.mjs';
import { faceNetSummary, currentFaceNet } from './net-presentation.mjs';
import { NetExportSession } from './net-export-session.mjs';
import { VisibleSurfaceControls } from './visible-surface-controls.mjs';
import { NetAssemblyControls } from './net-assembly-controls.mjs';
import { assemblyParts, numberNetSvg } from './net-assembly.mjs';

export class NetEditor {
  constructor(context) {
    const { getState, getModel, run, guard, markDirty, refresh, viewer, api, setStatus } = context;
    Object.assign(this, { getState, getModel, run, guard, markDirty, refresh, viewer, api, setStatus });
    this.context = context;
    this.expressionEntry = new ExpressionEntry(context);
    this.sequence = 0;
    this.playing = false;
    this.exports = new NetExportSession({
      ...context,
      onState: () => {
        this.updateActions();
        context.onExportActivity?.();
      },
    });
    const inspector = document.querySelector('.inspector');
    const tab = document.createElement('button');
    tab.dataset.panel = 'net';
    tab.textContent = 'Nets';
    inspector.querySelector('.inspector-tabs').append(tab);
    const root = document.createElement('div');
    root.id = 'net-panel';
    root.className = 'inspector-panel';
    root.hidden = true;
    root.innerHTML =
      '<div class="panel-title">RIGID FACE NETS</div><label>Root face <input id="net-root" type="number" min="0" value="0"></label><label>Reference E0 <span><input id="net-length" type="number" min="1" max="1000" value="25"> mm</span></label><label><input id="net-tabs" type="checkbox" checked> Include glue tabs</label><button id="net-rebuild" class="wide accent">Generate / reset net</button><label>View <select id="net-display"><option value="layout">2D layout</option><option value="fold">3D folding</option></select></label><label>Mouse action <select id="net-action"><option value="move">Move connected piece</option><option value="edge">Cut / join edge</option></select></label><div id="net-summary" class="code-box">Choose a closed 3D shell with simple planar faces. Use Visible surface for stars and compounds.</div><label>Source edge <input id="net-edge" type="number" min="0" value="0"></label><button id="net-toggle-edge" class="wide">Cut / join source edge</button><label>Connected piece <select id="net-component"></select></label><label>Move X / Y <span><input id="net-move-x" value="0" aria-label="Net translation X"><input id="net-move-y" value="0" aria-label="Net translation Y"> mm</span></label><label>Rotate piece <input id="net-angle" value="0" aria-label="Net rotation degrees"></label><button id="net-move" class="wide">Apply piece placement</button><div class="rule"></div><div class="panel-title">FOLDING PREVIEW</div><label>Fold <input id="net-fold" type="range" min="0" max="1" step="0.001" value="0"></label><output id="net-fold-value">0%</output><button id="net-play" class="wide">Animate folding</button><div id="net-fold-evidence" class="muted"></div><p class="muted">Drag a face to move its connected piece. Cuts retain matching source IDs; joins attach pieces at the chosen edge. Cut an existing hinge before making a join that would close a cycle. Folding keeps faces rigid; collisions during folding are not checked.</p>';
    inspector.append(root);
    this.$ = (id) => document.getElementById(id);
    const history = document.createElement('div');
    history.className = 'net-history';
    history.innerHTML = '<button id="net-undo">Undo net edit</button><button id="net-redo">Redo net edit</button>';
    root.insertBefore(history, this.$('net-summary'));
    this.$('net-undo').onclick = guard(() => this.restore(-1));
    this.$('net-redo').onclick = guard(() => this.restore(1));
    const separate = document.createElement('button');
    separate.id = 'net-separate';
    separate.className = 'wide';
    separate.textContent = 'Start with separate faces';
    this.$('net-rebuild').after(separate);
    separate.onclick = guard(() => this.build(true));
    const pagesOption = document.createElement('option');
    pagesOption.value = 'pages';
    pagesOption.textContent = 'Packed paper pages';
    this.$('net-display').append(pagesOption);
    const paper = document.createElement('div');
    paper.innerHTML =
      '<div class="rule"></div><div class="panel-title">PAPER PACKING / PREVIEW</div><label>Paper <select id="net-paper"><option value="a4">A4</option><option value="letter">US Letter</option><option value="a3">A3</option><option value="legal">US Legal</option><option value="custom">Custom</option></select></label><label>Orientation <select id="net-paper-orientation"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label><label id="net-custom-size" hidden>Width / height <span><input id="net-paper-width" value="210"><input id="net-paper-height" value="297"> mm</span></label><label>Margin / gap <span><input id="net-paper-margin" value="10"><input id="net-paper-gap" value="5"> mm</span></label><button id="net-pack" class="wide">Pack and preview at current scale</button><div class="net-history"><button id="net-page-prev">Previous page</button><button id="net-page-next">Next page</button></div><div id="net-paper-status" class="muted"></div><button id="net-packed-pdf" class="wide">Export all packed pages as PDF</button><button id="net-packed-svg" class="wide">Export current paper page SVG</button><p class="muted">Packing preserves E0 and keeps connected pieces intact. Change E0, cuts or paper size if a piece will not fit. No automatic scale change is applied.</p>';
    root.append(paper);
    this.$('net-paper').onchange = () => {
      this.$('net-custom-size').hidden = this.$('net-paper').value !== 'custom';
    };
    this.$('net-pack').onclick = guard(() => this.pack());
    this.$('net-page-prev').onclick = guard(() => this.changePage(-1));
    this.$('net-page-next').onclick = guard(() => this.changePage(1));
    this.$('net-packed-pdf').onclick = guard(() => this.export('pdf', { packed: true }));
    this.$('net-packed-svg').onclick = guard(() => this.export('svg', { packed: true, currentPage: true }));
    this.$('net-rebuild').onclick = guard(() => this.build(false));
    this.$('net-display').onchange = guard(() => this.setDisplay(this.$('net-display').value));
    this.$('net-action').onchange = guard(() => this.setAction(this.$('net-action').value));
    this.$('net-tabs').onchange = guard(() => this.edit('set-tabs', { tabs: this.$('net-tabs').checked }));
    this.$('net-toggle-edge').onclick = guard(() =>
      this.edit('toggle-edge', { edge: this.index('net-edge', 'source edge') })
    );
    this.$('net-component').onchange = guard(() => this.selectComponent(this.index('net-component', 'component ID')));
    this.$('net-move').onclick = guard(() => this.move());
    this.$('net-fold').oninput = guard(() => this.fold(Number(this.$('net-fold').value)));
    this.$('net-play').onclick = guard(() => this.toggleFold());
    for (const id of [
      'net-length',
      'net-move-x',
      'net-move-y',
      'net-angle',
      'net-paper-width',
      'net-paper-height',
      'net-paper-margin',
      'net-paper-gap',
    ]) {
      this.$(id).type = 'text';
      this.$(id).inputMode = 'text';
    }
    this.tabControls = new NetTabControls(this, root);
    this.colorPrinting = new NetColorPrintingControls(this, paper);
    this.assembly = new NetAssemblyControls(this, root, paper);
    const output = document.createElement('div');
    output.id = 'net-export-actions';
    output.className = 'net-history';
    output.innerHTML =
      '<button id="net-export-svg">Export net SVG</button><button id="net-export-pdf">Export net PDF</button>';
    paper.append(output);
    this.$('net-export-svg').onclick = guard(() => this.export('svg'));
    this.$('net-export-pdf').onclick = guard(() => this.export('pdf'));
    this.updateActions();
    this.visibleSurface = new VisibleSurfaceControls(context, root);
    document.getElementById('cancel')?.addEventListener('click', () => this.visibleSurface.cancel());
  }
  updateActions() {
    this.visibleSurface?.sync();
    if (this.exports?.busy) this.cancelDrag();
    const state = this.getState(),
      ready = currentFaceNet(state),
      packed = ready && Boolean(state.netPages),
      blocked = Boolean(state && (this.context.isExporting?.() || this.exports?.busy));
    for (const id of ['net-rearrange', 'net-assembly-svg', 'net-piece-color', 'net-assembly-include']) {
      const n = this.$(id);
      if (n) n.disabled = blocked || !ready;
    }
    for (const id of [
      'net-toggle-edge',
      'net-move',
      'net-pack',
      'net-fold',
      'net-play',
      'net-component',
      'net-action',
      'net-display',
      'net-tab-default-apply',
      'net-tab-edge-apply',
      'net-export-svg',
      'net-export-pdf',
    ]) {
      const n = this.$(id);
      if (n) n.disabled = blocked || !ready;
    }
    for (const id of ['net-packed-pdf', 'net-packed-svg']) {
      const n = this.$(id);
      if (n) n.disabled = blocked || !packed;
    }
    const history = state?.netHistory;
    for (const [id, available] of [
      ['net-undo', ready && history?.cursor > 0],
      ['net-redo', ready && history?.cursor < history?.states.length - 1],
    ]) {
      const n = this.$(id);
      if (n) n.disabled = blocked || !available;
    }
    for (const id of ['net-rebuild', 'net-separate']) {
      const n = this.$(id);
      if (n) n.disabled = blocked || state?.model.dimension !== 3;
    }
    for (const id of ['net-root', 'net-length', 'net-tabs']) {
      const n = this.$(id);
      if (n) n.disabled = blocked;
    }
    for (const [id, available] of [
      ['net-page-prev', packed && state.view.net.page > 0],
      ['net-page-next', packed && (state.view.net.page || 0) < state.netPages.pageCount - 1],
    ]) {
      const n = this.$(id);
      if (n) n.disabled = blocked || !available;
    }
    this.flow?.sync();
  }
  requireEditable() {
    if (this.context.isExporting?.()) throw Error('Finish animation export before changing the net view.');
  }
  cancelDrag() {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    drag.group.removeAttribute('transform');
    if (drag.svg?.hasPointerCapture?.(drag.pointerId)) drag.svg.releasePointerCapture(drag.pointerId);
  }
  currentDrag(drag, { content = false } = {}) {
    // Pointer motion checks identity cheaply; full print/content checks run at
    // release before the existing native edit publication checks.
    const state = this.getState();
    return (
      this.drag === drag &&
      state === drag.state &&
      state.model === drag.model &&
      state.netLayout === drag.net &&
      this.sequence === drag.sequence &&
      state.view.derivedMode === 'net' &&
      state.view.net?.display === 'layout' &&
      state.view.net.action === drag.mode &&
      (!content || currentFaceNet(state)) &&
      !this.context.isExporting?.() &&
      !this.exports?.busy
    );
  }
  onExportStateChange() {
    if (this.context.isExporting?.()) {
      this.playing = false;
      this.cancelDrag();
    }
    const c = this.getState()?.view.net;
    if (c) {
      this.$('net-display').value = c.display;
      this.$('net-action').value = c.action;
      this.$('net-component').value = c.component;
    }
    this.updateActions();
  }
  setDisplay(value) {
    this.requireEditable();
    if (!['layout', 'fold', 'pages'].includes(value)) throw Error('Choose a supported net view.');
    this.config().display = value;
    this.playing = false;
    this.activate();
    this.markDirty();
    return this.refresh();
  }
  setAction(value) {
    this.requireEditable();
    if (!['move', 'edge', 'tabs'].includes(value)) throw Error('Choose a supported net mouse action.');
    this.config().action = value;
    this.markDirty();
  }
  selectComponent(value) {
    this.requireEditable();
    if (!this.getState().netLayout?.components.some((c) => c.root === value))
      throw Error('Choose an available net component.');
    this.config().component = value;
    this.highlight();
    this.markDirty();
  }
  async export(format, options) {
    this.cancelDrag();
    const result = await this.exports.run(format, options);
    if (result)
      this.setStatus(
        options?.packed
          ? format === 'pdf'
            ? 'Exported packed net PDF ' + result.path
            : 'Exported paper page ' + result.path
          : format === 'pdf'
            ? 'Exported calibrated net PDF ' + result.path
            : 'Exported calibrated net ' + result.path
      );
    return result;
  }
  fold(value) {
    if (this.context.isExporting?.()) throw Error('Finish animation export before changing the net fold.');
    if (!currentFaceNet(this.getState())) throw Error('Generate a current 3D face net before folding it.');
    if (!Number.isFinite(value) || value < 0 || value > 1) throw Error('Use a fold fraction between 0 and 1.');
    const wasNet = this.getState().view.derivedMode === 'net',
      c = this.config();
    c.fraction = value;
    c.display = 'fold';
    this.$('net-display').value = 'fold';
    this.playing = false;
    this.activate();
    this.markDirty();
    return wasNet ? this.show(this.getState().netLayout) : this.refresh();
  }
  toggleFold() {
    if (this.context.isExporting?.()) throw Error('Finish animation export before changing the net fold.');
    if (!currentFaceNet(this.getState())) throw Error('Generate a current 3D face net before folding it.');
    const c = this.config();
    c.display = 'fold';
    this.$('net-display').value = 'fold';
    this.activate();
    this.playing = !this.playing;
    this.direction = c.fraction >= 1 ? -1 : 1;
    this.markDirty();
    return this.refresh();
  }
  index(id, label) {
    const text = this.$(id).value.trim(),
      value = Number(text);
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(value)) throw Error(`Use a literal nonnegative integer ${label}.`);
    return value;
  }
  async build(separate) {
    const root = this.index('net-root', 'root face'),
      tabs = this.$('net-tabs').checked;
    if (root >= this.getModel().faces.length) throw Error('Root face is outside this source model.');
    return this.expressionEntry.run({ length: this.$('net-length').value }, ({ length }, verify, owner) => {
      if (length < 1 || length > 1000) throw Error('Reference E0 must be between 1 and 1,000 mm.');
      verify();
      const s = owner.state,
        c = this.config(s);
      c.root = root;
      c.length = length;
      c.tabs = tabs;
      this.playing = false;
      this.buildRequest = { state: s, model: s.model, root, length, tabs, separate };
      s.netLayout = null;
      s.netPages = null;
      s.netSeparate = separate;
      this.activate();
      this.markDirty();
      return this.refresh();
    });
  }
  async pack() {
    const paper = this.$('net-paper').value,
      orientation = this.$('net-paper-orientation').value,
      colorPrinting = this.colorPrinting.parameters();
    if (!['a4', 'a3', 'letter', 'legal', 'custom'].includes(paper) || !['portrait', 'landscape'].includes(orientation))
      throw Error('Choose a supported paper and orientation.');
    const fields = { margin_mm: this.$('net-paper-margin').value, gap_mm: this.$('net-paper-gap').value };
    // Hidden custom sizes are not inputs to a preset paper operation.
    if (paper === 'custom') {
      fields.width_mm = this.$('net-paper-width').value;
      fields.height_mm = this.$('net-paper-height').value;
    }
    return this.expressionEntry.run(fields, (values, verify, owner) => {
      const [width, height] =
        paper === 'custom'
          ? [values.width_mm, values.height_mm]
          : { a4: [210, 297], a3: [297, 420], letter: [215.9, 279.4], legal: [215.9, 355.6] }[paper];
      if (
        width < 20 ||
        width > 2000 ||
        height < 20 ||
        height > 2000 ||
        values.margin_mm < 0 ||
        values.margin_mm >= Math.min(width, height) / 2 ||
        values.gap_mm < 0 ||
        values.gap_mm > 100
      )
        throw Error('Use paper dimensions in 20–2,000 mm, margins below half the page size, and gaps in 0–100 mm.');
      verify();
      const s = owner.state;
      s.view.netPrint = {
        paper,
        orientation,
        width_mm: width,
        height_mm: height,
        ...values,
        allow_rotation: true,
        ...colorPrinting,
      };
      s.netPages = null;
      const c = this.config(s);
      c.display = 'pages';
      c.page = 0;
      this.$('net-display').value = 'pages';
      this.activate();
      this.markDirty();
      return this.refresh();
    });
  }
  async move() {
    const component = this.index('net-component', 'component ID');
    return this.expressionEntry.run(
      { translation: [this.$('net-move-x').value, this.$('net-move-y').value], angle: this.$('net-angle').value },
      (values, verify, owner) =>
        this.edit('move-component', { component, ...values }, { verifyPublication: verify, owner })
    );
  }
  config(s = this.getState()) {
    const c = (s.view.net ||= {
      root: 0,
      length: 25,
      tabs: true,
      display: 'layout',
      fraction: 0,
      action: 'move',
      component: 0,
    });
    if (
      c.tabOptions &&
      (c.tabOptions.sourceId !== s.model.id || c.tabOptions.sourceFingerprint !== s.model.fingerprint)
    )
      delete c.tabOptions;
    return c;
  }
  activate() {
    const s = this.getState();
    s.view.derivedMode = 'net';
    this.$('derived-mode').value = 'net';
  }
  sync() {
    this.assembly?.sync();
    this.cancelDrag();
    this.sequence++;
    this.buildRequest = null;
    this.playing = false;
    this.$('net-play').textContent = 'Animate folding';
    const s = this.getState();
    if (!s) return;
    const c = this.config(s);
    this.$('net-root').value = c.root;
    this.$('net-length').value = c.length;
    this.$('net-tabs').checked = c.tabs;
    this.$('net-display').value = c.display;
    this.$('net-action').value = c.action;
    this.$('net-fold').value = c.fraction;
    this.$('net-fold-value').textContent = Math.round(c.fraction * 100) + '%';
    this.$('net-summary').textContent =
      'Choose a closed 3D shell with simple planar faces. Use Visible surface for stars and compounds.';
    this.$('net-component').replaceChildren();
    this.$('net-fold-evidence').textContent = '';
    const paper = s.view.netPrint || {
      paper: 'a4',
      orientation: 'portrait',
      width_mm: 210,
      height_mm: 297,
      margin_mm: 10,
      gap_mm: 5,
    };
    for (const [id, key] of Object.entries({
      'net-paper': 'paper',
      'net-paper-orientation': 'orientation',
      'net-paper-width': 'width_mm',
      'net-paper-height': 'height_mm',
      'net-paper-margin': 'margin_mm',
      'net-paper-gap': 'gap_mm',
    }))
      this.$(id).value = paper[key];
    this.$('net-custom-size').hidden = paper.paper !== 'custom';
    this.$('net-paper-status').textContent = '';
    this.tabControls.show();
    this.colorPrinting.sync();
    this.updateActions();
  }
  async evaluate(model, state, { signal, isCurrent } = {}) {
    if (signal?.aborted || isCurrent?.() === false) return { stale: true };
    this.context.prepareLayout?.();
    const sequence = ++this.sequence,
      c = structuredClone(this.config(state)),
      saved =
        state.netHistory?.sourceFingerprint === model.fingerprint
          ? state.netHistory.states[state.netHistory.cursor]
          : null,
      owner = captureExpressionOwner({ ...this.context, isBusy: () => false, isExporting: () => false }),
      signature = contentSignature(state),
      request = this.buildRequest;
    const explicit =
      request?.state === state &&
      request.model === model &&
      request.root === c.root &&
      request.length === c.length &&
      request.tabs === c.tabs;
    let net = state.netLayout;
    const contentRestore =
      !explicit &&
      !net &&
      saved?.root === c.root &&
      saved.edge_length_mm === c.length &&
      saved.tabs === c.tabs &&
      JSON.stringify(saved.tab_options ?? null) === JSON.stringify(c.tabOptions ?? null);
    const current = () =>
      !signal?.aborted &&
      isCurrent?.() !== false &&
      sequence === this.sequence &&
      this.buildRequest === request &&
      this.getState() === state &&
      contentSignature(state) === signature;
    const verify = () =>
      verifyExpressionOwner({ ...this.context, isBusy: () => false, isExporting: () => false }, owner);
    if (
      !net ||
      JSON.stringify(net.printSource?.metadata?.offColors?.faces ?? null) !==
        JSON.stringify(model.metadata?.offColors?.faces ?? null) ||
      net.sourceFingerprint !== model.fingerprint ||
      net.root !== c.root ||
      net.referenceEdgeLengthMm !== c.length ||
      net.tabs !== c.tabs ||
      JSON.stringify(net.tabOptions ?? null) !== JSON.stringify(c.tabOptions ?? null) ||
      JSON.stringify(net.elementAnnotations ?? null) !== JSON.stringify(state.view.elementAnnotations ?? null)
    ) {
      net = await this.run(
        'net',
        {
          root: c.root,
          edge_length_mm: c.length,
          tabs: c.tabs,
          ...(c.tabOptions ? { tab_options: structuredClone(c.tabOptions) } : {}),
          ...(explicit
            ? request.separate
              ? { hinges: [] }
              : {}
            : net?.sourceFingerprint === model.fingerprint && net.root === c.root
              ? { hinges: structuredClone(net.hinges), placements: structuredClone(net.placements ?? []) }
              : contentRestore
                ? { hinges: structuredClone(saved.hinges), placements: structuredClone(saved.placements ?? []) }
                : state.netSeparate
                  ? { hinges: [] }
                  : {}),
          ...contentParameters(state),
        },
        model,
        'Generate rigid face net',
        { signal }
      );
      if (!current()) return { stale: true };
      verify();
      state.netLayout = net;
      state.netPages = null;
      if (net.visibleSurface && net.tabOptions) this.config(state).tabOptions = structuredClone(net.tabOptions);
      if (!contentRestore) this.remember(state, net);
      this.markDirty();
    }
    if (c.display === 'pages' && !state.netPages) {
      const packOwner = captureExpressionOwner({ ...this.context, isBusy: () => false, isExporting: () => false });
      const packed = await this.run(
        'net-pack',
        { net, ...(state.view.netPrint || {}) },
        model,
        'Pack physical paper pages',
        { signal }
      );
      if (!current() || state.netLayout !== net) return { stale: true };
      verifyExpressionOwner({ ...this.context, isBusy: () => false, isExporting: () => false }, packOwner);
      state.netPages = packed;
      this.markDirty();
    }
    if (explicit && this.buildRequest === request) this.buildRequest = null;
    return net;
  }
  async edit(action, params, { verifyPublication, owner } = {}) {
    owner ??= captureExpressionOwner(this.context);
    verifyPublication ??= () => verifyExpressionOwner(this.context, owner);
    verifyPublication();
    const s = this.getState(),
      net = s.netLayout;
    if (!net) throw new Error('Generate a 3D face net before editing it.');
    if (JSON.stringify(net.elementAnnotations ?? null) !== JSON.stringify(s.view.elementAnnotations ?? null))
      throw Error('Source content changed; refresh the net before editing it.');
    const sequence = ++this.sequence;
    this.playing = false;
    const result = await this.run('net-edit', { net, action, ...params }, this.getModel(), 'Edit net ' + action);
    verifyPublication();
    if (this.getState() !== s || s.netLayout !== net || this.sequence !== sequence) return;
    if (action === 'arrange-pieces') this.config(s).display = 'layout';
    s.netLayout = result;
    s.netPages = null;
    this.remember(s, result);
    this.config(s).tabs = result.tabs;
    this.config(s).tabOptions = result.tabOptions ? structuredClone(result.tabOptions) : undefined;
    this.activate();
    this.markDirty();
    this.refresh();
  }
  remember(state, net) {
    if (state.netHistory?.sourceFingerprint && state.netHistory.sourceFingerprint !== net.sourceFingerprint)
      state.netHistory = null;
    const history = (state.netHistory ||= { cursor: -1, states: [] });
    history.sourceFingerprint = net.sourceFingerprint;
    history.states.splice(history.cursor + 1);
    history.states.push({
      root: net.root,
      edge_length_mm: net.referenceEdgeLengthMm,
      tabs: net.tabs,
      ...(net.tabOptions ? { tab_options: structuredClone(net.tabOptions) } : {}),
      hinges: structuredClone(net.hinges),
      placements: structuredClone(net.placements),
    });
    if (history.states.length > 100) history.states.shift();
    history.cursor = history.states.length - 1;
  }
  async restore(delta) {
    const state = this.getState(),
      history = state.netHistory,
      target = history?.cursor + delta;
    if (!history || target < 0 || target >= history.states.length) return;
    const owner = captureExpressionOwner(this.context),
      sequence = ++this.sequence,
      result = await this.run(
        'net',
        { ...structuredClone(history.states[target]), ...contentParameters(state) },
        this.getModel(),
        'Restore net layout'
      );
    verifyExpressionOwner(this.context, owner);
    if (this.getState() !== state || sequence !== this.sequence) return;
    history.cursor = target;
    state.netLayout = result;
    state.netPages = null;
    const c = this.config(state);
    c.root = result.root;
    c.length = result.referenceEdgeLengthMm;
    c.tabs = result.tabs;
    c.tabOptions = result.tabOptions ? structuredClone(result.tabOptions) : undefined;
    this.playing = false;
    this.activate();
    this.markDirty();
    this.refresh();
  }
  show(net) {
    this.cancelDrag();
    const c = this.config();
    this.net = net;
    this.tabControls.show(net);
    this.$('net-summary').textContent = faceNetSummary(net);
    if (net.labelDiagnostics?.belowReadableSize)
      this.$('net-summary').textContent +=
        `\n${net.labelDiagnostics.belowReadableSize} edge labels below 1.2 mm text height. Increase Edge 0 length for readable printing.`;
    if (this.$('net-domain')) this.$('net-domain').textContent = net.domain ?? '';
    this.$('net-summary').dataset.overlap = String(Boolean(net.overlapPairs.length || net.tabOverlapPairs.length));
    this.$('net-tabs').checked = net.tabs;
    const select = this.$('net-component');
    select.replaceChildren();
    this.$('net-root').value = net.root;
    this.$('net-length').value = net.referenceEdgeLengthMm;
    const history = this.getState().netHistory;
    this.$('net-undo').disabled = !history || history.cursor <= 0;
    this.$('net-redo').disabled = !history || history.cursor >= history.states.length - 1;
    this.$('net-summary').dataset.edit = history?.cursor ?? 0;
    if (!net.components.some((item) => item.root === c.component)) c.component = net.components[0].root;
    const numbers = new Map([...net.components].sort((a, b) => a.root - b.root).map((item, i) => [item.root, i + 1]));
    for (const item of net.components) {
      const option = document.createElement('option');
      option.value = item.root;
      option.textContent = `P${numbers.get(item.root)} / F${item.root}: ${item.faces.length} faces`;
      select.append(option);
    }
    select.value = c.component;
    this.$('net-fold-evidence').textContent =
      `Full fold checked: endpoint error ${net.foldValidation.maxEndpointErrorMm.toExponential(2)} mm; tolerance ${net.foldValidation.toleranceMm.toExponential(1)} mm. Face rigidity and hinge joins checked. Collision checking is pending.`;
    this.$('net-preview').classList.toggle('packed-page', c.display === 'pages');
    if (c.display === 'pages') {
      this.showPage();
    } else if (c.display === 'fold') {
      this.$('net-preview').hidden = true;
      this.$('derived-canvas').hidden = false;
      if (this.viewer.net !== net) {
        this.viewer.setNet(net);
        this.viewer.restoreCamera(this.getState().view.derivedCamera);
      }
      this.viewer.setFold(c.fraction);
      this.viewer.setDisplay({
        ...this.viewer.view,
        appearance: this.getState().view.appearance,
        materialEffects: this.getState().view.materialEffects,
      });
      this.foldStatus();
      const owner = {},
        source = this.getState(),
        sourceModel = source.model,
        viewerModel = this.viewer.model,
        sequence = this.sequence;
      this.contentOwner = owner;
      this.contentReady = this.context.renderElementContent?.({ referenceEdgeMm: net.referenceEdgeLengthMm });
      this.contentReady?.catch((error) => {
        if (
          error.name === 'AbortError' ||
          this.contentOwner !== owner ||
          this.sequence !== sequence ||
          this.getState() !== source ||
          source.model !== sourceModel ||
          source.view.derivedMode !== 'net' ||
          this.config(source).display !== 'fold' ||
          this.viewer.model !== viewerModel ||
          this.viewer.net !== net
        )
          return;
        this.viewer.elementContentDiagnostic = error.message;
        this.setStatus(error.message);
      });
    } else {
      this.viewer.clear();
      this.$('derived-canvas').hidden = true;
      const preview = this.$('net-preview');
      preview.hidden = false;
      preview.innerHTML = numberNetSvg(net.svg, assemblyParts(net), this.getState().view.netAssembly?.color);
      this.attach(preview.querySelector('svg'));
      this.highlight();
      this.$('derived-status').textContent =
        `${net.faces.length} faces · ${net.components.length} piece${net.components.length === 1 ? '' : 's'} · E0 = ${net.referenceEdgeLengthMm} mm${net.hasOverlap ? ' · face overlaps' : ''}${net.hasTabOverlap ? ' · tab overlaps' : ''}`;
    }
    this.$('net-play').textContent = this.playing ? 'Pause folding' : 'Animate folding';
    this.$('net-fold').value = c.fraction;
    this.$('net-fold-value').textContent = Math.round(c.fraction * 100) + '%';
    this.updateActions();
  }
  changePage(delta) {
    this.requireEditable();
    const packed = this.getState().netPages;
    if (!packed) return;
    if (!Number.isSafeInteger(delta)) throw Error('Use a literal integer page step.');
    const c = this.config();
    c.page = Math.max(0, Math.min(packed.pageCount - 1, (c.page || 0) + delta));
    c.display = 'pages';
    this.$('net-display').value = 'pages';
    this.activate();
    this.markDirty();
    this.showPage();
  }
  showPage() {
    const packed = this.getState().netPages;
    if (!packed) return;
    const c = this.config();
    c.page = Math.max(0, Math.min(packed.pageCount - 1, c.page || 0));
    const page = packed.pages[c.page];
    this.viewer.clear();
    this.$('derived-canvas').hidden = true;
    const preview = this.$('net-preview');
    preview.hidden = false;
    preview.innerHTML = numberNetSvg(
      page.svg,
      assemblyParts(this.getState().netLayout, packed),
      this.getState().view.netAssembly?.color
    );
    this.$('net-page-prev').disabled = c.page === 0;
    this.$('net-page-next').disabled = c.page === packed.pageCount - 1;
    this.$('net-paper-status').textContent =
      `Page ${c.page + 1} of ${packed.pageCount} · ${page.widthMm} × ${page.heightMm} mm · E0 = ${packed.referenceEdgeLengthMm} mm · 100% source scale${page.paperColorLabel ? ' / ' + page.paperColorLabel : ''}${packed.colorPrinting?.crossColorCuts.length ? ' / ' + packed.colorPrinting.crossColorCuts.length + ' detached print cuts' : ''}`;
    const net = this.getState().netLayout,
      faces = net?.overlapPairs.length ?? 0,
      tabs = net?.tabOverlapPairs.length ?? 0;
    if (faces || tabs)
      this.$('net-paper-status').textContent +=
        ` · ${faces} face overlap pairs · ${tabs} tab overlap pairs. Review before printing.`;
    this.$('derived-status').textContent = this.$('net-paper-status').textContent;
    this.updateActions();
  }
  highlight() {
    if (this.net?.visibleSurface && this.net?.printSource) {
      const c = this.config();
      for (const group of this.$('net-preview').querySelectorAll('[data-net-face]')) {
        const polygon = group.querySelector('polygon');
        polygon.setAttribute('stroke', Number(group.dataset.component) === c.component ? '#359da6' : 'none');
        polygon.setAttribute('stroke-width', '0.5');
      }
      return;
    }
    const c = this.config();
    for (const group of this.$('net-preview').querySelectorAll('[data-net-face]'))
      group
        .querySelector('polygon')
        .setAttribute('fill', Number(group.dataset.component) === c.component ? '#c4e9df' : '#e6f5f0');
  }
  attach(svg) {
    const surface = {},
      source = this.getState(),
      model = source?.model,
      net = source?.netLayout,
      sequence = this.sequence;
    this.dragSurface = surface;
    const local = (e) => {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
      return [p.x, p.y];
    };
    svg.onpointerdown = (e) => {
      if (this.context.isExporting?.() || this.exports?.busy || this.drag) return;
      const state = this.getState();
      if (
        this.dragSurface !== surface ||
        state !== source ||
        state?.model !== model ||
        state?.netLayout !== net ||
        this.sequence !== sequence ||
        !currentFaceNet(state) ||
        state.view.derivedMode !== 'net' ||
        state.view.net.display !== 'layout'
      )
        return;
      const face = e.target.closest('[data-net-face]');
      if (!face) return;
      e.preventDefault();
      const c = this.config();
      c.component = Number(face.dataset.component);
      this.$('net-component').value = c.component;
      this.highlight();
      const edge = e.target.closest('[data-net-edge]');
      if (edge) {
        this.$('net-edge').value = edge.dataset.netEdge;
        this.tabControls.show();
      }
      this.drag = {
        svg,
        pointerId: e.pointerId,
        group: face.closest('[data-net-component]'),
        component: c.component,
        start: local(e),
        delta: [0, 0],
        edge: edge ? Number(edge.dataset.netEdge) : null,
        mode: c.action,
        state,
        model: state.model,
        net: state.netLayout,
        sequence: this.sequence,
      };
      svg.setPointerCapture(e.pointerId);
    };
    svg.onpointermove = (e) => {
      const d = this.drag;
      if (!d || d.svg !== svg || d.pointerId !== e.pointerId) return;
      if (!this.currentDrag(d)) {
        this.cancelDrag();
        return;
      }
      const p = local(e);
      d.delta = p.map((x, i) => x - d.start[i]);
      if (d.mode === 'move') d.group.setAttribute('transform', `translate(${d.delta.join(' ')})`);
    };
    svg.onpointerup = this.guard(async (e) => {
      const d = this.drag;
      if (!d || d.svg !== svg || d.pointerId !== e.pointerId) return;
      const current = this.currentDrag(d, { content: true });
      this.cancelDrag();
      if (!current) return;
      if (d.mode === 'edge' && d.edge !== null) await this.edit('toggle-edge', { edge: d.edge });
      else if (d.mode === 'move' && Math.hypot(...d.delta) > 0.01)
        await this.edit('move-component', { component: d.component, translation: d.delta });
    });
    const cancel = (e) => {
      if (this.drag?.svg === svg && this.drag.pointerId === e.pointerId) this.cancelDrag();
    };
    svg.onpointercancel = cancel;
    svg.onlostpointercapture = cancel;
  }
  foldStatus() {
    const c = this.config();
    this.$('derived-status').textContent =
      `Rigid net fold ${Math.round(c.fraction * 100)}% · ${this.net.components.length} piece${this.net.components.length === 1 ? '' : 's'}${c.fraction === 1 ? ' · source endpoint reconstructed' : ''}`;
    this.$('net-fold').value = c.fraction;
    this.$('net-fold-value').textContent = Math.round(c.fraction * 100) + '%';
  }
  tick(dt) {
    if (this.context.isExporting?.()) {
      this.playing = false;
      return;
    }
    if (!this.playing || this.getState()?.view.derivedMode !== 'net' || !this.viewer.net) {
      if (this.playing && this.getState()?.view.derivedMode !== 'net') this.playing = false;
      return;
    }
    const c = this.config();
    c.fraction += (dt * this.direction) / 4;
    if (c.fraction >= 1) {
      c.fraction = 1;
      this.direction = -1;
    } else if (c.fraction <= 0) {
      c.fraction = 0;
      this.direction = 1;
    }
    this.viewer.setFold(c.fraction);
    this.foldStatus();
    return true;
  }
}
