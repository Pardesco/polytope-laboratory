import { startupMark, afterModelPaint } from '../startup-performance.mjs';
import { startupView } from '../startup-view.mjs';
import { ProjectOpening, RecoverySnapshots, ProjectSaving } from '../project-workflow.mjs';
export function createStartup(ctx) {
  function frame(now) {
    const {
      showcase,
      netEditor,
      animation,
      markPlaybackDirty,
      coxeterPreviewHost,
      hoverIdentification,
      base,
      state,
      $,
      derived,
      running,
    } = ctx;

    const dt = Math.min((now - ctx.lastFrame) / 1000, 0.1);
    ctx.lastFrame = now;
    if (showcase.busy) {
      requestAnimationFrame(frame);
      return;
    }
    const rotated = ctx.viewportControls.tick(dt),
      folded = netEditor.tick(dt);
    // The startup showcase turn is presentation only; it must not make a fresh document look edited.
    if (rotated || folded || animation.playing)
      markPlaybackDirty({ presentationOnly: !folded && !animation.playing && ctx.viewportControls.startupRotation });
    ctx.learn4D?.sync();
    if (ctx.livePreviewHost && !ctx.livePreviewHost.hidden) ctx.livePreviewViewer.draw();
    ctx.coxeterBuilder?.sync();
    if (ctx.coxeterPreview && !coxeterPreviewHost.hidden) ctx.coxeterPreview.draw();
    hoverIdentification.sync();
    base.draw();
    if (!ctx.startupModelRendered && base.model) {
      ctx.startupModelRendered = true;
      startupMark('first-model-rendered');
    }
    if (state()?.view.viewportLayout === 'split' && !$('derived-canvas').hidden) derived.draw();
    if (ctx.facetingPreview && !$('facet-preview').hidden) ctx.facetingPreview.draw();
    if (ctx.diagramPreview && !$('faceting-diagram-preview').hidden) ctx.diagramPreview.draw();
    if (running.size) {
      const job = [...running.values()][0];
      $('job-time').textContent = ((now - job.start) / 1000).toFixed(1) + ' s';
    } else $('job-time').textContent = '';
    requestAnimationFrame(frame);
  }
  return {
    frame,
    startRecovery() {
      const { animation, serialize, api, $, guard } = ctx;
      const recoverySnapshots = new RecoverySnapshots({
        getProject: () => ctx.project,
        getRevision: () => ctx.revision,
        shouldSave: () =>
          ctx.dirty &&
          ctx.project.documents.length > 0 &&
          !(animation.exporting || ctx.tourExporting) &&
          !ctx.learn4D?.session,
        snapshot: serialize,
        write: (value) => api.autosave(value),
        onSaved: ({ current }) => {
          $('autosave-status').textContent =
            'Recovery snapshot ' + new Date().toLocaleTimeString() + (current ? '' : ' · newer changes pending');
        },
      });
      ctx.recoverySnapshots = recoverySnapshots;
      setInterval(
        guard(() => recoverySnapshots.save()),
        30000
      );
    },
    start() {
      const {
        workspaceAvailability,
        guard,
        api,
        appChrome,
        libraryThumbnails,
        desktopFiles,
        error,
        renderCatalog,
        model,
        doc,
        state,
        $,
        displayBase,
        acceptLinkedLibrary,
        renderLinkedLibraries,
        setStatus,
      } = ctx;
      requestAnimationFrame(frame);
      workspaceAvailability.sync();
      guard(async () => {
        if (!api) throw new Error('Open this workspace with the desktop launcher.');
        const startup = (await api.startupInfo?.()) ?? { hidden: false };
        appChrome.startup(startup);
        ctx.viewportControls.overlays?.enable(!startup.hidden);
        ctx.welcome.hiddenMode = startup.hidden === true;
        libraryThumbnails.configure({ hidden: startup.hidden === true });
        await desktopFiles.start();
        await ctx.catalogDiscovery.load().catch(error);
        renderCatalog();
        const initialProject = ctx.project,
          initialRevision = ctx.revision,
          m =
            ctx.catalogDiscovery.state === 'ready' &&
            ctx.initialModelAllowed &&
            ctx.catalogLoader.sequence === 0 &&
            !ctx.project.documents.length
              ? await ctx.catalogLoader.open({ key: 'tesseract', name: 'Tesseract' })
              : null;
        if (
          m &&
          ctx.project === initialProject &&
          ctx.project.documents.length === 1 &&
          model() === m &&
          doc().states.length === 1 &&
          doc().cursor === 0 &&
          !state().view.entitySelection
        ) {
          Object.assign(state().view, startupView(state().view));
          $('projection').value = state().view.projection;
          $('projection').value = state().view.projection;
          displayBase();
          ctx.viewportControls.sync();
          ctx.viewportControls.startStartupRotation();
          ctx.dirty = false;
          api.setDirty(false);
          ctx.renderTabs();
        }
        if (!ctx.project.documents.length) $('model-name').textContent = 'Choose a model';
        try {
          const restored = await api.libraries();
          for (const library of restored.libraries) acceptLinkedLibrary(library);
          for (const failure of restored.errors) ctx.linkedLibraries.push({ ...failure, entries: [] });
          renderLinkedLibraries();
          if (restored.errors.length) setStatus('Some linked folders are unavailable. See the library panel.');
        } catch (e) {
          error(e);
        }
        const recovery = await api.recoveryInfo();
        if (recovery)
          setStatus(
            'Recovery snapshot available from ' +
              new Date(recovery.modified).toLocaleString() +
              '. Use File → Recover autosave.'
          );
        ctx.welcome.auto({
          hidden: startup.hidden,
          recoveryAvailable: !!recovery,
          opened:
            !ctx.initialModelAllowed ||
            ctx.project !== initialProject ||
            (m ? model() !== m || ctx.project.documents.length !== 1 : !!ctx.project.documents.length),
        });
      })();
    },
  };
}
