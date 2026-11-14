import { ImageCaptureSession, saveReviewedImage } from '../image-capture-session.mjs';
import { ExportControls } from '../export-controls.mjs';
import { ExportGoals } from '../export-goals.mjs';
import { derivedExportGeometry } from '../interchange-controls.mjs';
export function createExport(ctx) {
  function openGeometryExport() {
    if (ctx.model()?.kind === 'hyperbolic-space') {
      ctx.setStatus(
        'Hyperbolic space supports PNG pictures and native projects. Geometry export uses Euclidean coordinates.'
      );
      return;
    }
    const { animation, derivedWork, state, tours, refreshDerived, error, exportControls } = ctx;

    if (animation.exporting || ctx.tourExporting) throw new Error('Finish animation export before exporting geometry.');
    const finishPausedSection =
      animation.playing && derivedWork.active && ['section', 'cell-section'].includes(state()?.view.derivedMode);
    // Keep the reviewed source/derived result stable while the modal is open.
    ctx.viewportControls.stop();
    animation.pause();
    tours.pause();
    ctx.dualMorph?.pause();
    // Pausing revokes the in-flight animation frame. Reevaluate its now-frozen
    // applied plane under ordinary ownership so Derived can become available.
    if (finishPausedSection) refreshDerived().catch(error);
    return exportControls.open();
  }
  function printNet() {
    if (ctx.model()?.kind === 'hyperbolic-space') {
      ctx.setStatus('Nets are available for Euclidean documents.');
      return;
    }
    const { animation, netEditor, state } = ctx;

    if (animation.exporting || ctx.tourExporting) throw Error('Finish animation export before printing a net.');
    netEditor.cancelDrag();
    return netEditor.exports.run('print', { packed: state()?.view.net?.display === 'pages' });
  }
  async function exportDialogNet(format) {
    const { netEditor, $, exportControls } = ctx;

    if (netEditor.exports.busy) throw Error('Finish the current net export first.');
    const dialog = $('export-dialog'),
      scope = exportControls.scope,
      current = () => dialog.open && exportControls.scope === scope,
      cancel = () => netEditor.exports.cancel();
    ctx.cancelDialogNet = cancel;
    try {
      const result = await netEditor.export(format, { isCurrent: current });
      if (result && current()) exportControls.close();
      return result;
    } catch (error) {
      if (error.name === 'AbortError' || !current()) return null;
      throw error;
    } finally {
      if (ctx.cancelDialogNet === cancel) ctx.cancelDialogNet = null;
    }
  }
  return {
    openGeometryExport,
    printNet,
    exportDialogNet,
    mountExportControls() {
      const {
        numericContext,
        derived,
        base,
        run,
        doc,
        state,
        availableDerivedModel,
        derivedWork,
        animation,
        api,
        setStatus,
      } = ctx;
      const exportControls = new ExportControls({
        ...numericContext,
        getViewer: (source) => (source === 'derived' ? derived : base),
        prepareView: (m, p, o) => run('prepare-view-export', p, m, 'Prepare displayed geometry', o),
        preparePrintable: (m, p, o) => run('prepare-printable-export', p, m, 'Prepare printable model', o),
        onClose: () => ctx.cancelDialogNet?.(),
        getProject: () => ctx.project,
        getDocument: doc,
        getState: state,
        getDerived: () =>
          derivedExportGeometry(availableDerivedModel(), derived, ctx.net, {
            pending: Boolean(ctx.derivedControls?.pending || derivedWork.active),
            mode: state()?.view.derivedMode,
          }),
        getNet: () => ctx.net,
        isExporting: () => animation.exporting || ctx.tourExporting,
        describe: (m, o) => run('export-options', {}, m, 'Check export formats', o),
        prepare: (m, p, o) => run('prepare-export', p, m, 'Prepare geometry export', o),
        api,
        setStatus,
      });
      ctx.exportControls = exportControls;
    },
    mountImageCapture() {
      const { doc, state, animation, base, api, tours, $, setStatus, syncCancelAvailability } = ctx;
      ctx.imageCapture = new ImageCaptureSession({
        getProject: () => ctx.project,
        getDocument: doc,
        getState: state,
        isExporting: () => animation.exporting || ctx.tourExporting,
        viewer: base,
        api,
        stop: () => {
          ctx.viewportControls.stop();
          animation.pause();
          tours.pause();
          ctx.dualMorph?.pause();
        },
        getDisplay: () => ({
          camera: base.cameraState(),
          width: base.renderer.domElement.width,
          height: base.renderer.domElement.height,
        }),
        prepare: async (options) => {
          if (state().view.dualMorph?.enabled) await ctx.dualMorph.prepareCapture(options);
          if (!options.isCurrent()) throw Object.assign(Error('Image capture source changed.'), { name: 'AbortError' });
          await base.prepareCapture(options);
        },
        getOptions: () => ({
          transparent: $('png-transparent').checked,
          scale: Number($('png-scale').value),
          size: $('png-size').value,
          framing: $('png-framing').value,
          margin: Number($('png-margin').value),
          supersample: Number($('png-supersample').value),
        }),
        image: (options) => base.image(options),
        onSaved: (result) => {
          if (result) setStatus('Saved ' + result.path);
        },
        onState: () => {
          $('image').disabled = ctx.imageCapture.busy || !state() || animation.exporting || ctx.tourExporting;
          syncCancelAvailability();
        },
      });
    },
    wireExport() {
      const { $, exportControls, guard, el } = ctx;
      $('close-export').onclick = () => exportControls.close();
      $('confirm-export').onclick = guard(() => exportControls.confirm());
      $('export-net').onclick = guard(() => exportDialogNet('svg'));
      const pdfButton = el('button', 'Export current net as PDF', 'wide');
      ctx.pdfButton = pdfButton;
      pdfButton.id = 'export-net-pdf';
      $('export-dialog').append(pdfButton);
      pdfButton.onclick = guard(() => exportDialogNet('pdf'));
    },
    mountExportGoals() {
      const { exportControls, guard, actions } = ctx;
      exportControls.goals = new ExportGoals(exportControls, {
        guard,
        picture: () => actions.image(),
        reveal: (node) => ctx.discoverability.reveal(node),
      });
      for (const [label, goal] of [
        ['Export for 3D printing', 'print'],
        ['Make a paper model', 'paper'],
        ['Save picture', 'picture'],
        ['Export video', 'video'],
        ['Export to Blender or CAD', 'software'],
        ['Export model data', 'geometry'],
      ])
        actions[label] = async () => {
          await actions.export();
          return exportControls.goals.choose(goal);
        };
    },
  };
}
