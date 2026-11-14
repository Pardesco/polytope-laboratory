import {
  HyperbolicControls,
  patchSettings,
  coverageText,
  diagnosticRows,
  residualRows,
} from './hyperbolic-controls.mjs';
import { HyperbolicViewer } from './hyperbolic-viewer.mjs';
import { validatePatchPage } from './hyperbolic-worker.mjs';
import { IDENTITY } from './hyperbolic-math.mjs';
import { saveReviewedImage } from './image-capture-session.mjs';

export const isHyperbolic = (model) => model?.kind === 'hyperbolic-space';
export const HYPERBOLIC_PRESETS = [
  ['534', 'Order-4 dodecahedral honeycomb {5,3,4}', 'Dodecahedra, four around each edge', [5, 3, 4]],
  ['435', 'Order-5 cubic honeycomb {4,3,5}', 'Cubes, five around each edge', [4, 3, 5]],
  ['535', 'Order-5 dodecahedral honeycomb {5,3,5}', 'Dodecahedra, five around each edge', [5, 3, 5]],
  ['353', 'Order-3 icosahedral honeycomb {3,5,3}', 'Icosahedra, three around each edge', [3, 5, 3]],
  ['small-cover', 'Dodecahedral small cover', 'Closed space with eight cells', null],
].map(([key, name, subtitle, pqr]) => ({
  key,
  name,
  subtitle,
  source: pqr ? { type: 'honeycomb', pqr, rings: [1, 0, 0, 0] } : { type: 'manifold', key: 'small-cover-v1' },
}));
export const hyperbolicBudget = (source) => ({ pageSize: 128, candidatesPerPage: 4096 });
export const hyperbolicView = (model) => ({
  hyperbolicModel: 'poincare',
  hyperbolicLod: 'normal',
  mode: 'overview',
  observerMatrix: [...IDENTITY],
  anchor: structuredClone(model.anchor),
});
export function projectSnapshot(project) {
  const copy = structuredClone(project);
  let mixed = false;
  for (const doc of copy.documents)
    for (const state of doc.states)
      if (isHyperbolic(state.model)) {
        mixed = true;
        delete state.model.anchorPatch.nextCursor;
      }
  copy.version = mixed ? 2 : 1;
  return copy;
}
export function retainPage(model, page, anchor) {
  const patch = structuredClone(page);
  delete patch.nextCursor;
  if (new TextEncoder().encode(JSON.stringify(patch)).byteLength > 1024 * 1024)
    throw Error('Anchor snapshot exceeds 1 MiB.');
  model.anchorPatch = patch;
  model.anchor = structuredClone(anchor ?? page.anchor);
}

export function applyHyperbolicNeighborUpdates(neighbors, page) {
  for (const row of page.neighbors) neighbors.set(`${row.cell}:${row.face}`, row);
  if (neighbors.size > 81920) throw Error('Hyperbolic neighbor cache exceeds its cell/face bound.');
  return neighbors;
}

// Native patch rebasing returns observer-centered geometry. The engine walks
// face transitions in its bounded local chart; B = Cold maps the new oriented
// observer frame into the old anchor. Both kinds restore Cnew = identity.
export async function rebaseHyperbolic(run, model, request) {
  const page = await run(
    'hyperbolic-patch',
    {
      source: model.source,
      budget: hyperbolicBudget(model.source),
      ...(request.patchOptions && {
        radius: request.patchOptions.radius,
        depth: request.patchOptions.depth,
        mode: request.patchOptions.mode,
      }),
      epoch: request.epoch + 1,
      anchor: request.home ? {} : (request.anchor ?? model.anchor),
      ...(request.home ? {} : { rebase: request.observerMatrix }),
    },
    model,
    'Move hyperbolic anchor',
    { signal: request.signal }
  );
  const pages = [page];
  let cursor = page.nextCursor;
  while (cursor && pages.length < 128) {
    const next = await run(
      'hyperbolic-patch',
      {
        source: model.source,
        budget: hyperbolicBudget(model.source),
        ...(request.patchOptions && {
          radius: request.patchOptions.radius,
          depth: request.patchOptions.depth,
          mode: request.patchOptions.mode,
        }),
        epoch: request.epoch + 1,
        anchor: page.anchor,
        cursor,
      },
      model,
      'Prepare nearby hyperbolic ball',
      { signal: request.signal }
    );
    pages.push(next);
    cursor = next.nextCursor;
  }
  if (cursor) throw Error('Nearby hyperbolic ball exceeded its page limit.');
  return {
    patch: page,
    pages,
    anchor: page.anchor,
    observerMatrix: [...IDENTITY],
    anchorTransform: request.observerMatrix,
  };
}

export class HyperbolicDocument {
  constructor(ctx, { Viewer = HyperbolicViewer } = {}) {
    this.ctx = ctx;
    this.Viewer = Viewer;
    this.hidden = new Map();
    this.owner = null;
    this.sequence = 0;
    this.openingTimings = new Map();
    this.mount();
  }
  isActive() {
    return isHyperbolic(this.ctx.model());
  }
  make(tag, id, text) {
    const node = document.createElement(tag);
    if (id) node.id = id;
    if (text) node.textContent = text;
    return node;
  }
  mount() {
    const c = this.ctx;
    const library = this.make('details', 'hyperbolic-library');
    library.className = 'hyperbolic-library';
    library.append(this.make('summary', null, 'Hyperbolic space'));
    for (const entry of HYPERBOLIC_PRESETS) {
      const button = this.make('button', 'hyperbolic-open-' + entry.key);
      button.className = 'wide';
      button.append(this.make('span', null, entry.name), this.make('small', null, entry.subtitle));
      button.onclick = c.guard(async () => {
        button.disabled = true;
        try {
          await this.open(entry);
        } finally {
          button.disabled = false;
        }
      });
      library.append(button);
    }
    c.$('catalog').before(library);
    this.controls = this.make('div', 'hyperbolic-controls');
    this.controls.hidden = true;
    this.controls.className = 'hyperbolic-controls';
    const label = this.make('label', null, 'View ');
    const select = this.make('select', 'hyperbolic-model');
    select.setAttribute('aria-label', 'Hyperbolic display model');
    for (const [value, text] of [
      ['poincare', 'Poincaré ball'],
      ['klein', 'Klein model'],
    ]) {
      const option = this.make('option', null, text);
      option.value = value;
      select.append(option);
    }
    label.append(select);
    this.controls.append(label);
    select.onchange = c.guard(() => {
      this.viewer.setProjection(select.value);
      this.persist(this.viewer.getView());
    });
    for (const [id, text, action] of [
      [
        'hyperbolic-home',
        'Return to center',
        async () => {
          const explore = c.$('hyperbolic-explore'),
            viewer = this.viewer;
          explore.disabled = true;
          this.returningHome = true;
          try {
            this.persist({ hyperbolicPatch: { ...this.patchOptions(), paused: false } });
            this.patchControls.sync();
            await viewer.home();
            if (this.viewer === viewer) this.persist(viewer.getView());
          } finally {
            this.returningHome = false;
            this.patchControls.sync();
          }
        },
      ],
      [
        'hyperbolic-explore',
        'Explore inside',
        () => {
          this.patchControls.clearHighlight();
          this.viewer.enterExplore();
          this.viewer.canvas.focus();
          this.persist(this.viewer.getView());
        },
      ],
    ]) {
      const button = this.make('button', id, text);
      button.onclick = c.guard(action);
      this.controls.append(button);
    }
    this.controls.append(
      this.make('span', 'hyperbolic-navigation-help', 'Move: WASD / arrows · Look: drag · Escape: overview')
    );
    document.querySelector('.workspace .view-toolbar').prepend(this.controls);
    this.patchControls = new HyperbolicControls(this);
    this.analysis = this.make('section', 'hyperbolic-analysis');
    this.analysis.hidden = true;
    c.$('info-panel').prepend(this.analysis);
    this.host = this.make('div', 'hyperbolic-canvas');
    this.host.className = 'canvas';
    this.host.hidden = true;
    c.$('base-canvas').after(this.host);
  }
  async open(entry) {
    const c = this.ctx,
      project = c.project,
      active = c.state(),
      seq = ++this.sequence;
    if (c.animation.exporting || c.tourExporting)
      throw Error('Finish animation export before opening hyperbolic space.');
    if (project.documents.length >= 100) throw Error('Close a document before opening another.');
    c.catalogLoader?.navigationChanged();
    const current = () => {
      if (c.project !== project || c.state() !== active || seq !== this.sequence)
        throw Error('Hyperbolic opening superseded by workspace navigation.');
    };
    const profile = { key: entry.key, startedAt: performance.now(), requests: [], autosaveCount: 0, snapshotMs: 0 };
    this.pendingOpening = profile;
    this.openingTimings.set(entry.key, profile);
    const params = { source: entry.source, budget: hyperbolicBudget(entry.source) };
    try {
      await c.commitOperation('hyperbolic-create', params, entry.name, {
        newDocument: true,
        verifyPublication: current,
        onTiming: (measurement) => profile.requests.push(measurement),
      });
    } finally {
      if (this.pendingOpening === profile) this.pendingOpening = null;
    }
  }
  conceal(node) {
    if (!node || this.hidden.has(node)) return;
    this.hidden.set(node, node.hidden);
    node.hidden = true;
  }
  render() {
    const c = this.ctx,
      source = c.state();
    if (!isHyperbolic(source?.model)) {
      this.leave();
      return false;
    }
    if (this.owner === source) return true;
    this.leave();
    this.profile = this.pendingOpening;
    this.pendingOpening = null;
    const mountedAt = performance.now();
    if (this.profile)
      this.profile.historyPublicationMs =
        mountedAt -
        this.profile.startedAt -
        this.profile.requests.reduce((n, request) => n + request.wallMs + request.measurementJsonMs, 0);
    this.owner = source;
    this.neighbors = new Map();
    this.quality = null;
    this.latestResiduals = source.model.anchorPatch.residuals;
    this.latestCoverage = source.model.anchorPatch.coverage;
    applyHyperbolicNeighborUpdates(this.neighbors, source.model.anchorPatch);
    delete this.host.dataset.ready;
    delete this.host.dataset.openingTiming;
    c.animation.pause();
    c.viewportControls.stop();
    c.viewportControls.direct4D?.sync();
    c.viewportControls.overlays?.sync();
    c.derivedWork.cancel();
    c.reports.invalidate();
    c.dualMorph?.invalidate();
    c.elementContent?.invalidate();
    c.projectionFit?.cancel();
    this.controls.hidden = false;
    this.analysis.hidden = false;
    this.host.hidden = false;
    document.body.dataset.documentKind = 'hyperbolic-space';
    c.$('model-name').textContent = source.view.documentMetadata?.title || source.model.name;
    c.$('model-family').textContent = 'HYPERBOLIC SPACE';
    c.$('dimension-badge').textContent = 'H³';
    c.$('hyperbolic-model').value = source.view.hyperbolicModel ?? 'poincare';
    c.$('views').dataset.layout = 'single';
    for (const selector of [
      '#direct-4d-gizmo',
      '#direct-4d-hint',
      '#canvas-hint-slot',
      '#section-toolbar',
      '#view-options',
      '.appearance-sheet-slot',
      '#open-surface-settings',
      '#base-canvas',
      '.viewport.derived',
      '.section-controls',
      '.workspace-shelf > details:not(#history-settings)',
      '.view-toolbar .toolbar-group:not(.view-actions)',
      '#auto-rotate',
      '#fit-view',
      '#reset',
      '#png-settings',
      '#counts-strip',
      '#pick-source',
      '.viewport-hover',
    ]) {
      for (const node of document.querySelectorAll(selector)) this.conceal(node);
    }
    for (const id of ['info-panel', 'construct-panel', 'net-panel', 'evidence-panel']) {
      const panel = c.$(id);
      if (!panel) continue;
      for (const child of [...panel.children]) if (child !== this.analysis) this.conceal(child);
      if (id !== 'info-panel') {
        const note = this.make(
          'p',
          null,
          'This tool uses Euclidean geometry. Explore this space here, save a picture, or save the native project.'
        );
        note.dataset.hyperbolicDomainNote = '';
        panel.prepend(note);
        if (id === 'construct-panel') {
          const sections = this.make(
            'p',
            'hyperbolic-sections-note',
            'Sections: hyperbolic sections are not supported. Use Explore inside to inspect this space.'
          );
          sections.dataset.hyperbolicDomainNote = '';
          panel.append(sections);
        }
      }
    }
    c.$('view-diagnostic').textContent =
      'Finite patch; generation limited. Cells have equal hyperbolic size; this view makes distant cells look smaller.';
    this.viewer = new this.Viewer(this.host, {
      onQuality: (quality) => {
        this.quality = quality;
        this.renderAnalysis();
        this.host.dataset.preparedCells = String(this.viewer.pages.reduce((n, page) => n + page.instances.length, 0));
        if (this.profile && !this.profile.firstGeometryMs) {
          this.profile.workerPrepMs = quality.prepTimeMs;
          this.profile.preparationWallMs = performance.now() - this.profile.preparationStartedAt;
        }
      },
      onFirstGeometry: ({ renderMs, instances }) => {
        this.host.dataset.ready = 'true';
        if (this.profile) {
          this.profile.renderMs = renderMs;
          this.profile.firstInstances = instances;
          this.profile.firstGeometryMs = performance.now() - this.profile.startedAt;
          this.host.dataset.openingTiming = JSON.stringify(this.profile);
        }
      },
      onDiagnostic: (text) => {
        if (c.state() === source) {
          this.navigationDiagnostic = text;
          this.renderCaption();
        }
      },
      onViewChange: (view) => this.persist(view),
      onRebase: (request) => {
        if (this.patchOptions().paused && !request.home) throw Error('Generation is paused; resume in Patch.');
        this.controller?.abort();
        this.patchControls.clearHighlight();
        return rebaseHyperbolic(c.run, source.model, { ...request, patchOptions: this.patchOptions() });
      },
      onRebased: (view, { pages }) => {
        if (c.state() !== source) return;
        this.neighbors.clear();
        for (const page of pages) applyHyperbolicNeighborUpdates(this.neighbors, page);
        this.latestCoverage = pages.at(-1).coverage;
        this.latestResiduals = pages.at(-1).residuals;
        this.quality = null;
        retainPage(source.model, pages[0], view.anchor);
        this.persist(view);
        this.renderAnalysis();
        const controller = new AbortController();
        this.controller = controller;
        void this.continuePages(pages.at(-1), source, controller).catch((error) => {
          if (!controller.signal.aborted) c.setStatus(error.message);
        });
      },
    });
    if (this.profile) this.profile.preparationStartedAt = performance.now();
    this.viewer.setModel(source.model, { view: source.view, revision: c.revision });
    this.patchControls.sync({ fields: true });
    this.patchControls.highlight();
    this.renderAnalysis();
    c.renderTabs();
    c.renderHistory();
    c.workspaceAvailability.sync();
    if (this.profile) this.profile.mountMs = performance.now() - mountedAt;
    void this.regenerate(source);
    return true;
  }
  async regenerate(source) {
    if (this.patchOptions().paused) return;
    const c = this.ctx;
    const controller = new AbortController();
    this.controller = controller;
    try {
      if (!(await this.waitForDisplay(source, controller.signal))) return;
      await c.run(
        'hyperbolic-validate',
        { source: source.model.source, descriptor: source.model },
        source.model,
        'Validate retained hyperbolic geometry',
        { signal: controller.signal }
      );
      const page = await c.run(
        'hyperbolic-patch',
        {
          source: source.model.source,
          anchor: source.model.anchor,
          epoch: source.model.anchorPatch.epoch,
          budget: hyperbolicBudget(source.model.source),
          ...this.requestOptions(),
        },
        source.model,
        'Regenerate hyperbolic patch',
        { signal: controller.signal }
      );
      if (this.owner !== source || c.state() !== source || controller.signal.aborted) return;
      if (!this.appendPage(page)) return;
      this.neighbors.clear();
      applyHyperbolicNeighborUpdates(this.neighbors, page);
      this.latestCoverage = page.coverage;
      this.latestResiduals = page.residuals;
      retainPage(source.model, page, source.model.anchor);
      this.renderAnalysis();
      if (await this.waitForDisplay(source, controller.signal)) await this.continuePages(page, source, controller);
    } catch (error) {
      if (!controller.signal.aborted && this.owner === source) c.setStatus(error.message);
    }
  }
  async continuePages(page, source, controller) {
    const c = this.ctx,
      viewer = this.viewer,
      binding = { ...viewer.binding };
    let cursor = page.nextCursor,
      restarted = false;
    for (let pages = 0; cursor && pages < 128; pages++) {
      if (
        controller.signal.aborted ||
        this.patchOptions().paused ||
        c.state() !== source ||
        this.viewer !== viewer ||
        viewer.binding.epoch !== binding.epoch ||
        viewer.binding.anchorHash !== binding.anchorHash
      )
        return;
      let next;
      try {
        next = await c.run(
          'hyperbolic-patch',
          {
            source: source.model.source,
            anchor: source.model.anchor,
            epoch: binding.epoch,
            budget: hyperbolicBudget(source.model.source),
            ...this.requestOptions(),
            cursor,
          },
          source.model,
          'Develop hyperbolic patch',
          { signal: controller.signal }
        );
      } catch (error) {
        if (controller.signal.aborted || restarted || !/cursor|checkpoint/i.test(error.message)) throw error;
        restarted = true;
        cursor = null;
        next = await c.run(
          'hyperbolic-patch',
          {
            source: source.model.source,
            anchor: source.model.anchor,
            epoch: binding.epoch,
            budget: hyperbolicBudget(source.model.source),
            ...this.requestOptions(),
          },
          source.model,
          'Restart hyperbolic paging',
          { signal: controller.signal }
        );
        if (
          controller.signal.aborted ||
          c.state() !== source ||
          this.viewer !== viewer ||
          viewer.binding.epoch !== binding.epoch ||
          viewer.binding.anchorHash !== binding.anchorHash
        )
          return;
        viewer.setPatch(next, { revision: binding.revision });
        this.neighbors.clear();
      }
      if (controller.signal.aborted || c.state() !== source || this.viewer !== viewer) return;
      if (!this.appendPage(next)) return;
      applyHyperbolicNeighborUpdates(this.neighbors, next);
      this.latestCoverage = next.coverage;
      this.latestResiduals = next.residuals;
      this.renderAnalysis();
      cursor = next.nextCursor;
      this.nextCursor = cursor;
      if (!(await this.waitForDisplay(source, controller.signal))) return;
    }
  }
  appendPage(page) {
    validatePatchPage(page);
    const binding = this.viewer.binding;
    if (
      page.sourceHash !== binding.sourceHash ||
      page.anchorHash !== binding.anchorHash ||
      page.epoch !== binding.epoch
    )
      return false;
    const known = new Map(this.viewer.pages.flatMap((page) => page.instances.map((cell) => [cell.id, cell])));
    for (const cell of page.instances) {
      const old = known.get(cell.id);
      if (
        old &&
        (old.type !== cell.type ||
          JSON.stringify(old.word) !== JSON.stringify(cell.word) ||
          old.quotientState !== cell.quotientState)
      )
        throw Error('Regenerated hyperbolic cell identity mismatch.');
    }
    const instances = page.instances.filter((cell) => !known.has(cell.id));
    if (!instances.length) return true;
    return this.viewer.setPatch({ ...page, instances }, { append: true, revision: this.viewer.binding.revision });
  }
  async waitForDisplay(source, signal) {
    const viewer = this.viewer,
      deadline = performance.now() + 10000;
    while (!signal.aborted && this.owner === source && this.viewer === viewer) {
      if (viewer.firstGeometryRendered && !viewer.preparationDirty && !viewer.activeJob && !viewer.queuedJob)
        return true;
      if (performance.now() > deadline) throw Error('Hyperbolic page preparation timed out.');
      await new Promise(requestAnimationFrame);
    }
    return false;
  }
  recordSnapshot(ms) {
    if (this.pendingOpening && !this.pendingOpening.firstGeometryMs) this.pendingOpening.snapshotMs += ms;
    if (this.profile && !this.profile.firstGeometryMs) this.profile.snapshotMs += ms;
  }
  async measureAutosave(work) {
    const profile = this.pendingOpening ?? this.profile;
    if (!profile || profile.firstGeometryMs) return work();
    profile.autosaveCount++;
    const started = performance.now();
    try {
      return await work();
    } finally {
      profile.autosaveMs = (profile.autosaveMs || 0) + performance.now() - started;
    }
  }
  persist(view) {
    if (this.ctx.state() !== this.owner) return;
    this.owner.view = { ...this.owner.view, ...structuredClone(view) };
    this.ctx.markDirty();
    this.patchControls.sync();
  }
  patchOptions() {
    return patchSettings(this.owner?.model.source, this.owner?.view.hyperbolicPatch);
  }
  requestOptions() {
    const { radius, depth, mode } = this.patchOptions();
    return { radius, depth, mode };
  }
  async refreshPatch() {
    this.controller?.abort();
    this.navigationDiagnostic = null;
    const viewer = this.viewer;
    viewer.rebaseController?.abort();
    // Wait for an in-flight atomic swap to observe cancellation before replacing it.
    while (viewer.rebasePending && !viewer.disposed) await new Promise(requestAnimationFrame);
    if (this.viewer !== viewer || viewer.disposed) return;
    if (!(await viewer.requestRebase())) throw Error(viewer.lastDiagnostic ?? 'Patch regeneration canceled.');
  }
  renderCaption() {
    if (!this.owner) return;
    const small = this.owner.model.source.type === 'manifold';
    this.ctx.$('view-diagnostic').textContent =
      'Cells have equal hyperbolic size; this view makes distant cells look smaller. ' +
      (small ? 'Colours identify the eight cells; repeated lifts show one closed space. ' : '') +
      coverageText(this.latestCoverage, this.patchOptions().paused, this.quality) +
      (this.navigationDiagnostic ? ' ' + this.navigationDiagnostic : '');
    this.patchControls.sync();
  }
  renderAnalysis() {
    if (!this.owner) return;
    const m = this.owner.model,
      coverage = this.latestCoverage ?? m.anchorPatch.coverage,
      open = this.analysis.querySelector('#hyperbolic-diagnostics')?.open ?? false;
    this.analysis.replaceChildren(
      this.make('h3', null, m.name),
      this.make('p', null, 'Curvature \u22121 \u00b7 float64 approximate coordinates \u00b7 finite wireframe patch'),
      this.make('p', 'hyperbolic-coverage', coverageText(coverage, this.patchOptions().paused, this.quality))
    );
    const count = this.viewer?.pages.reduce((n, p) => n + p.instances.length, 0) ?? m.anchorPatch.instances.length;
    const rows = diagnosticRows(m, coverage, count);
    const addRows = (parent, values) => {
      const list = this.make('dl');
      for (const [label, value] of values) list.append(this.make('dt', null, label), this.make('dd', null, value));
      parent.append(list);
    };
    addRows(this.analysis, rows.slice(0, 3));
    const diagnostics = this.make('details', 'hyperbolic-diagnostics');
    diagnostics.open = open;
    const summary = this.make('summary', null, 'Hyperbolic diagnostics');
    const help = this.make('button', null, '?');
    help.className = 'group-help';
    help.type = 'button';
    help.setAttribute('aria-label', 'Help: Hyperbolic diagnostics');
    help.onclick = (event) => {
      event.preventDefault();
      this.ctx.userGuide?.show?.('hyperbolic-space');
    };
    summary.append(help);
    diagnostics.append(summary);
    addRows(diagnostics, rows.slice(3));
    diagnostics.append(this.make('h4', null, 'Measured residuals'));
    diagnostics.append(
      this.make(
        'p',
        null,
        'Absolute and relative maxima may occur at different entities. Scale is the maximum recorded scale; gates apply to each normalized residual.'
      )
    );
    addRows(diagnostics, residualRows(m.analysisReceipt?.residuals, { generators: true }));
    addRows(diagnostics, residualRows(this.latestResiduals ?? m.anchorPatch.residuals));
    if (this.quality)
      addRows(diagnostics, [
        [
          'Display quality',
          this.quality.capped ? 'Limited: ' + this.quality.reasons.join(', ') : 'No display cap reported',
        ],
        ['Edges / segments', `${this.quality.uniqueEdges} / ${this.quality.segments}`],
      ]);
    const copy = this.make('button', 'hyperbolic-copy-receipt', 'Copy receipt (JSON)');
    copy.onclick = this.ctx.guard(async () => {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            analysis: m.analysisReceipt,
            coverage,
            residuals: this.latestResiduals ?? m.anchorPatch.residuals,
            displayQuality: this.quality,
          },
          null,
          2
        )
      );
      copy.textContent = 'Receipt copied';
    });
    diagnostics.append(copy);
    this.analysis.append(diagnostics);
    this.renderCaption();
  }
  leave() {
    this.patchControls?.cancel();
    this.navigationDiagnostic = null;
    this.controller?.abort();
    this.controller = null;
    this.viewer?.dispose();
    this.viewer = null;
    this.owner = null;
    this.profile = null;
    for (const [node, hidden] of this.hidden) node.hidden = hidden;
    this.hidden.clear();
    document.querySelectorAll('[data-hyperbolic-domain-note]').forEach((node) => node.remove());
    this.controls.hidden = true;
    this.analysis.hidden = true;
    this.host.hidden = true;
    delete document.body.dataset.documentKind;
  }
  async screenshot() {
    const c = this.ctx,
      source = c.state(),
      viewer = this.viewer;
    if (!viewer) throw Error('No hyperbolic view is mounted.');
    const signature = JSON.stringify(source.view);
    const verify = () => {
      if (c.state() !== source || this.viewer !== viewer || JSON.stringify(source.view) !== signature)
        throw Error('View changed during image capture.');
    };
    if (this.capturing) throw Error('Finish the current picture first.');
    this.capturing = true;
    this.controller?.abort();
    viewer.keys.clear();
    viewer.releasePointer();
    const enabled = viewer.controls.enabled;
    viewer.controls.enabled = false;
    try {
      const deadline = performance.now() + 10000;
      while (!viewer.published || viewer.preparationDirty || viewer.activeJob || viewer.queuedJob) {
        verify();
        if (performance.now() > deadline) throw Error('Picture preparation timed out; try a smaller patch.');
        viewer.draw();
        await new Promise(requestAnimationFrame);
      }
      verify();
      viewer.draw();
      return await saveReviewedImage(c.api, viewer.canvas.toDataURL('image/png'), 'Hyperbolic-space.png', { verify });
    } finally {
      this.capturing = false;
      if (!viewer.disposed) viewer.controls.enabled = enabled;
    }
  }
}
