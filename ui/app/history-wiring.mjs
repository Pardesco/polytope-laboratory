import { defaultDocumentView, legacyDocumentView } from '../default-look.mjs';
import { normalizeMemories } from '../model-memories.mjs';
import { HistoryControls } from '../history-controls.mjs';
import { normalizeTour } from '../tour.mjs';
import { captureContentHistoryPublication } from '../element-content-history.mjs';
import {
  prepareHistoryCommit,
  prepareHistoryOpen,
  verifyHistoryPublication,
  preserveHistoryObserver,
} from '../history-workflow.mjs';
import { ProjectOpening, RecoverySnapshots, ProjectSaving } from '../project-workflow.mjs';
import { DesktopFiles, reviewProjectOpen } from '../desktop-files.mjs';
export function createHistoryWiring(ctx) {
  function renderTabs() {
    const { $, el, renderWorkspace, markDirty, guard } = ctx;

    $('document-tabs').replaceChildren();
    ctx.project.documents.forEach((d, i) => {
      const button = el(
        'button',
        (d.states[d.cursor].view.documentMetadata?.title?.trim() || d.states[d.cursor].model.name) +
          (i === ctx.project.active && ctx.dirty ? ' •' : '')
      );
      if (i === ctx.project.active) button.classList.add('active');
      button.onclick = () => {
        ctx.catalogLoader?.navigationChanged();
        ctx.project.active = i;
        renderWorkspace();
        markDirty();
      };
      $('document-tabs').append(button);
      if (ctx.project.documents.length > 1) {
        const close = el('span', '×', 'tab-close');
        close.title = 'Close document';
        close.setAttribute('aria-label', 'Close ' + button.textContent);
        close.onclick = guard((event) => {
          event.stopPropagation();
          closeDocument(i);
        });
        button.append(close);
        button.onauxclick = guard((event) => {
          if (event.button === 1) {
            event.preventDefault();
            closeDocument(i);
          }
        });
      }
    });
  }
  function activateDocument(index) {
    const { renderWorkspace, markDirty } = ctx;

    if (index === ctx.project.active) return;
    ctx.catalogLoader?.navigationChanged();
    ctx.project.active = index;
    renderWorkspace();
    markDirty();
  }
  function closeDocument(index) {
    const { animation, markDirty, renderWorkspace, el, guard, $ } = ctx;

    if (animation.exporting || ctx.tourExporting) throw new Error('Finish animation export before closing a document.');
    const closed = ctx.project.documents[index];
    if (!closed || ctx.project.documents.length < 2) return;
    const wasActive = index === ctx.project.active,
      owner = ctx.project;
    ctx.catalogLoader?.navigationChanged();
    ctx.project.documents.splice(index, 1);
    if (ctx.project.active > index || ctx.project.active >= ctx.project.documents.length) ctx.project.active--;
    markDirty();
    if (wasActive) renderWorkspace();
    else renderTabs();
    const name =
        closed.states[closed.cursor].view.documentMetadata?.title?.trim() || closed.states[closed.cursor].model.name,
      undo = el('button', 'Undo', 'toast-action');
    undo.onclick = guard(() => {
      clearTimeout(ctx.toastTimer);
      $('toast').hidden = true;
      if (ctx.project !== owner || ctx.project.documents.includes(closed)) return;
      if (animation.exporting || ctx.tourExporting)
        throw new Error('Finish animation export before reopening a document.');
      if (ctx.project.documents.length >= 100)
        throw new Error('The project already contains the maximum of 100 documents.');
      const at = Math.min(index, ctx.project.documents.length);
      ctx.project.documents.splice(at, 0, closed);
      if (ctx.project.active >= at) ctx.project.active++;
      activateDocument(at);
      markDirty();
    });
    $('toast').replaceChildren('Closed ' + name + '. ', undo);
    $('toast').hidden = false;
    clearTimeout(ctx.toastTimer);
    ctx.toastTimer = setTimeout(() => ($('toast').hidden = true), 9000);
  }
  function renderHistory() {
    const { $, doc, el, markDirty, renderWorkspace, historyControls, workspaceAvailability } = ctx;

    $('history-list').replaceChildren();
    doc().states.forEach((s, i) => {
      const button = el('button', `${i + 1} ${s.label || s.model.provenance?.operation || 'model'}`);
      if (i === doc().cursor) button.classList.add('active');
      button.onclick = () => {
        ctx.catalogLoader?.navigationChanged();
        doc().cursor = i;
        markDirty();
        renderWorkspace();
      };
      $('history-list').append(button);
    });
    historyControls.sync();
    $('undo').disabled = doc().cursor === 0;
    $('redo').disabled = doc().cursor === doc().states.length - 1;
    workspaceAvailability.sync();
  }
  function initialDocumentState(m, label, documentContext = null) {
    const { defaults, clone } = ctx;

    const view = defaults(m.dimension);
    view.coordinateUnit = ['model', 'mm', 'cm', 'm', 'in', 'ft'].includes(m.metadata?.coordinateUnits)
      ? m.metadata.coordinateUnits
      : { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' }[m.metadata?.dxf?.insunits] || 'model';
    view.fillRule = m.metadata?.fillRule || view.fillRule;
    if (['generalized-complex', 'surface-section'].includes(m.interpretation) && m.faces.length)
      view.derivedMode = 'face';
    if (m.interpretation === 'surface-section' && !m.faces.length) view.derivedMode = 'section-evidence';
    if (m.metadata?.family === 'Kepler-Poinsot') view.derivedMode = 'incidence-dual';
    if (m.metadata?.dxf) {
      view.faces = m.faces.length > 0;
      const incident = new Set(m.edges.flat());
      view.vertices = m.vertices.some((_, i) => !incident.has(i));
      view.presentation = view.faces ? 'solid' : 'wireframe';
    }
    const importedMetadata = m.metadata?.documentMetadata;
    if (
      importedMetadata &&
      typeof importedMetadata === 'object' &&
      !Array.isArray(importedMetadata) &&
      ['title', 'author', 'reference', 'description'].every(
        (key) => importedMetadata[key] === undefined || typeof importedMetadata[key] === 'string'
      )
    )
      view.documentMetadata = clone(importedMetadata);
    let notes = typeof m.metadata?.documentNotes === 'string' ? m.metadata.documentNotes : '';
    if (documentContext) {
      // Carry document attributes without copying source-bound poses/content.
      const unit = documentContext.view.coordinateUnit ?? documentContext.model?.metadata?.coordinateUnits ?? 'model';
      view.coordinateUnit = ['model', 'mm', 'cm', 'm', 'in', 'ft'].includes(unit) ? unit : 'model';
      view.fillRule = documentContext.view.fillRule || 'nonzero';
      view.surfaceColors = documentContext.view.surfaceColors || 'source';
      const metadata = documentContext.view.documentMetadata;
      if (metadata === undefined) delete view.documentMetadata;
      else view.documentMetadata = clone(metadata);
      notes = documentContext.notes || '';
    }
    return { model: m, view, label, notes };
  }
  function addDocument(m, label = 'Generate', { activate = true, catalog = false, documentContext = null } = {}) {
    const { $, uid, markDirty, renderWorkspace } = ctx;

    if (ctx.project.documents.length >= 100)
      throw new Error('The project already contains the maximum of 100 documents.');
    const next = initialDocumentState(m, label, documentContext);
    if (!catalog) ctx.catalogLoader?.navigationChanged();
    clearTimeout(ctx.toastTimer);
    $('toast').hidden = true;
    ctx.project.documents.push({ id: uid(), cursor: 0, states: [next] });
    if (activate) ctx.project.active = ctx.project.documents.length - 1;
    markDirty();
    if (activate) renderWorkspace();
    else renderTabs();
    if (activate && catalog) ctx.viewportControls?.opened(m);
    return next;
  }
  async function commitOperation(op, params, label, { verifyPublication, verifyResult, signal } = {}) {
    const { doc, state, animation, run, $, markDirty, renderWorkspace } = ctx;

    const context = {
      getProject: () => ctx.project,
      getDocument: doc,
      getState: state,
      isExporting: () => animation.exporting || ctx.tourExporting,
      run: (op, params, source, label) => run(op, params, source, label, { signal }),
      verifyPublication: () => {
        if (signal?.aborted) throw new Error('Construction cancelled.');
        verifyPublication?.();
      },
    };
    const prepared = await prepareHistoryCommit(context, op, params, label);
    const index = verifyHistoryPublication(context, prepared);
    verifyResult?.(prepared.result);
    preserveHistoryObserver(prepared);
    ctx.project.documents[index] = prepared.result;
    clearTimeout(ctx.toastTimer);
    $('toast').hidden = true;
    markDirty();
    if (index === ctx.project.active) renderWorkspace();
    else renderTabs();
    return prepared.result;
  }
  async function openRecipeDocument(op, parameters) {
    const { doc, state, animation, run, markDirty, renderWorkspace } = ctx;

    const context = {
      getProject: () => ctx.project,
      getDocument: doc,
      getState: state,
      isExporting: () => animation.exporting || ctx.tourExporting,
      run,
    };
    context.verifyPublication = captureContentHistoryPublication(context);
    const prepared = await prepareHistoryOpen(context, op, parameters);
    prepared.result.states.forEach((s) => {
      s.view = { ...legacyDocumentView(s.model.dimension), ...s.view };
    });
    verifyHistoryPublication(context, prepared, { opening: true });
    ctx.project.documents.push(prepared.result);
    ctx.project.active = ctx.project.documents.length - 1;
    markDirty();
    renderWorkspace();
  }
  function serialize() {
    const { clone } = ctx;

    return clone({ ...ctx.project, savedAt: new Date().toISOString() });
  }
  function adopt(p) {
    const { api, renderWorkspace } = ctx;

    if (!p?.documents?.length) throw new Error('Project contains no documents.');
    const bank = normalizeMemories(p.memories),
      tourBank = normalizeTour(p.tour);
    ctx.catalogLoader?.cancel();
    ctx.project = p;
    ctx.project.memories = bank;
    ctx.project.tour = tourBank;
    ctx.tourPreviewDocument = null;
    ctx.project.documents.forEach((d) =>
      d.states.forEach((s) => {
        s.view = { ...legacyDocumentView(s.model.dimension), ...s.view };
      })
    );
    ctx.dirty = false;
    ctx.revision++;
    api.setDirty(false);
    renderWorkspace();
  }
  async function open(requestId) {
    const { animation, projectOpening, status, nativeJobs, api, setStatus } = ctx;

    if (typeof requestId !== 'string') requestId = null;
    ctx.welcome?.close();
    ctx.welcome?.walkthrough.stop();
    if (animation.exporting || ctx.tourExporting)
      throw new Error('Finish or cancel animation export before opening a project.');
    ctx.initialModelAllowed = false;
    ctx.catalogLoader.cancel();
    ctx.viewportControls.stop();
    animation.pause();
    let statusOwner;
    return projectOpening.open({
      onStale: () =>
        status.complete(statusOwner, 'File loading canceled because the workspace or export state changed.'),
      getProject: () => ctx.project,
      getRevision: () => ctx.revision,
      isExporting: () => animation.exporting || ctx.tourExporting,
      load: async ({ signal }) =>
        reviewProjectOpen(
          await nativeJobs.run(
            (id) => (requestId ? api.openRequested(requestId, id) : api.open(id)),
            'Open project or geometry',
            { signal, onStatusOwner: (owner) => (statusOwner = owner) }
          ),
          ctx.dirty,
          () => api.confirmProjectOpen()
        ),
      publish: (result) => {
        if (result.project) adopt(result.project);
        else
          addDocument(
            result.model,
            'Import ' +
              (result.model.metadata?.dxf ? 'DXF' : result.path.toLowerCase().endsWith('.json') ? 'JSON' : 'OFF')
          );
        setStatus('Opened ' + result.path);
      },
    });
  }
  function save() {
    const { projectSaving } = ctx;

    return projectSaving.save();
  }
  async function recover() {
    const { animation, projectOpening, status, nativeJobs, api, markDirty, setStatus } = ctx;

    ctx.welcome?.close();
    ctx.welcome?.walkthrough.stop();
    if (animation.exporting || ctx.tourExporting)
      throw new Error('Finish or cancel animation export before recovering a project.');
    ctx.initialModelAllowed = false;
    ctx.catalogLoader.cancel();
    ctx.viewportControls.stop();
    animation.pause();
    let statusOwner;
    const result = await projectOpening.open({
      onStale: () =>
        status.complete(statusOwner, 'File loading canceled because the workspace or export state changed.'),
      getProject: () => ctx.project,
      getRevision: () => ctx.revision,
      isExporting: () => animation.exporting || ctx.tourExporting,
      load: ({ signal }) =>
        nativeJobs.run((id) => api.recover(id), 'Recover autosave', {
          signal,
          onStatusOwner: (owner) => (statusOwner = owner),
        }),
      publish: (result) => {
        adopt(result.project);
        markDirty();
        setStatus(
          (result.recoveryWarning ? result.recoveryWarning + ' ' : 'Recovered autosave. ') +
            'Save it as a project to keep it.'
        );
      },
    });
    if (!result) throw new Error('No autosave snapshot is available.');
  }
  function historyStep(delta) {
    const { doc, markDirty, renderWorkspace } = ctx;

    if (!doc()) return;
    const next = doc().cursor + delta;
    if (next < 0 || next >= doc().states.length) return;
    ctx.catalogLoader?.navigationChanged();
    doc().cursor = next;
    markDirty();
    renderWorkspace();
  }
  return {
    renderTabs,
    activateDocument,
    closeDocument,
    renderHistory,
    initialDocumentState,
    addDocument,
    commitOperation,
    openRecipeDocument,
    serialize,
    adopt,
    open,
    save,
    recover,
    historyStep,
    mountSaving() {
      const { animation, api, setStatus, status, $ } = ctx;
      const projectSaving = new ProjectSaving({
        getProject: () => ctx.project,
        getRevision: () => ctx.revision,
        isExporting: () => animation.exporting || ctx.tourExporting,
        snapshot: serialize,
        write: (value) => api.save(value),
        start: () => setStatus('Saving project…'),
        complete: (owner, text) => status.complete(owner, text),
        onBusy: (value) => {
          $('save').disabled = value;
        },
        onSaved: ({ current }) => {
          ctx.dirty = !current;
          api.setDirty(ctx.dirty).catch(() => {});
          renderTabs();
        },
      });
      ctx.projectSaving = projectSaving;
    },
    mountHistory() {
      const { run, state, doc, animation, guard } = ctx;
      const historyControls = new HistoryControls({
        run,
        getState: state,
        getDocument: doc,
        isExporting: () => animation.exporting || ctx.tourExporting,
        guard,
        replay: () => openRecipeDocument('recipe-replay'),
        branch: (params) => openRecipeDocument('recipe-branch', params),
      });
      ctx.historyControls = historyControls;
    },
  };
}
