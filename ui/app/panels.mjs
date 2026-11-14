import { ImageCaptureSession, saveReviewedImage } from '../image-capture-session.mjs';
import { startupMark, afterModelPaint } from '../startup-performance.mjs';
import { FaceSurgeryControls } from '../face-surgery-controls.mjs';
import { CellRebuildControls } from '../cell-rebuild-controls.mjs';
import { DerivedViewControls, DerivedWork, derivedInputKey, derivedEntityIndex } from '../derived-view-controls.mjs';
import { SectionToolbar } from '../section-toolbar.mjs';
import '../section-toolbar.css';
import { organizeNetInspector } from '../net-inspector-layout.mjs';
import { NetsFlow } from '../nets-flow.mjs';
import { organizeInspector, simplifyAnalysis, renderValidation } from '../inspector-layout.mjs';
import { mountConstructGallery } from '../construct-gallery.mjs';
import { UniformFamilyControls } from '../uniform-family-controls.mjs';
import { GoursatWythoffControls } from '../goursat-wythoff-controls.mjs';
import { CoxeterBuilder, CoxeterPreviewFrame } from '../coxeter-builder.mjs';
import { Learn4D, createLessonWorkspace, mountLearn4DCard } from '../learn-4d.mjs';
import { SourceReflectionControls } from '../source-reflection-controls.mjs';
import { CoincidicRegimentControls } from '../coincidic-regiment-controls.mjs';
import { LiveSliders } from '../live-sliders.mjs';
import { presentLivePreview } from '../live-preview-view.mjs';
import { Viewer } from '../viewer.js';
import { renderMorphElementContent } from '../morph-element-content-renderer.mjs';
import { DualMorphControls } from '../dual-morph-controls.mjs';
import { PLANES } from '../projection.js';
import { StellationControls } from '../stellation.js';
import { StellationDiagramControls } from '../stellation-diagram-controls.mjs';
import { NetEditor } from '../net-editor.js';
import { CellNetEditor } from '../cell-net-editor.js';
import { MeasurementControls } from '../measurement-controls.js';
import { SymmetryControls } from '../symmetry-controls.js';
import { ElementTypeControls } from '../element-type-controls.mjs';
import { AnalysisOverview } from '../analysis-overview.mjs';
import { SymmetryOrientationControls } from '../symmetry-orientation-controls.mjs';
import { AnimationControls } from '../animation-controls.mjs';
import { TimelinePanel } from '../timeline-panel.mjs';
import { saveAnimationHistory } from '../animation-history.mjs';
import { AnimationRenderer } from '../animation-renderer.mjs';
import { syncAnimationV4Inputs } from '../animation-v4-view.mjs';
import { ViewportControls } from '../viewport-controls.mjs';
import { ProjectionFit } from '../projection-fit.mjs';
import { stereographicViewSignature } from '../viewer-stereographic-worker.mjs';
import { MemoryControls } from '../memory-controls.mjs';
import { EntityOrientationControls } from '../entity-orientation-controls.mjs';
import { CellFacingControls } from '../cell-facing-controls.mjs';
import { PresentationControls } from '../presentation-controls.mjs';
import { AppearanceControls } from '../appearance-controls.mjs';
import { MaterialEffectsControls } from '../material-effects-controls.mjs';
import { TourControls } from '../tour-controls.mjs';
import { FaceEditingControls } from '../face-editing-controls.mjs';
import { AutomaticFacetingControls } from '../automatic-faceting-controls.mjs';
import { FacetingDiagramControls } from '../faceting-diagram-controls.mjs';
import { ElementContentControls } from '../element-content-controls.mjs';
import { ElementLabelPresetsControls } from '../element-label-presets-controls.mjs';
import { ReinforcementControls, checkedReinforcementSVG } from '../reinforcement-controls.mjs';
import { HingeStripControls } from '../hinge-strip-controls.mjs';
import { FabricationControls } from '../net-fabrication-controls.mjs';
import { CoincidentEdgeControls, checkedAssemblySVG } from '../coincident-edge-controls.mjs';
import { GeneralizedDensityControls } from '../generalized-density-controls.mjs';
import { InformationPanel } from '../information-panel.mjs';
import { publishBoundedExport } from '../bounded-export.mjs';
import { PickingControls } from '../picking-controls.mjs';
import { CompoundControls } from '../compound-controls.mjs';
import { PerspectiveControls } from '../perspective-controls.mjs';
import { SubdivisionControls } from '../subdivision-controls.mjs';
import { SubdivisionInheritanceControls } from '../subdivision-inheritance-controls.mjs';
import { FaceConwayControls } from '../face-conway-controls.mjs';
import { SourceConstructionControls } from '../source-construction-controls.mjs';
import { ExpansionControls } from '../expansion-controls.mjs';
import { FittingControls } from '../fitting-controls.mjs';
import { ExactSectionControls } from '../exact-section-controls.mjs';
import { OrdinaryCellSectionWorkflow } from '../ordinary-cell-section-workflow.mjs';
import {
  DensitySectionControls,
  DensitySectionWorkflow,
  densitySectionParameters,
  densitySectionDisplay,
} from '../density-section-controls.mjs';
import { hasSectionSourceContent, rememberSectionSource, hasEmptySectionSource } from '../section-source-content.mjs';
import { IncidenceTruncationControls } from '../incidence-truncation-controls.mjs';
import { SphereProjectionControls } from '../sphere-projection-controls.mjs';
import { ProjectiveDualControls } from '../projective-dual-controls.mjs';
import { SourceZonohedronControls } from '../source-zonohedron-controls.mjs';
import { VertexFigureConstructionControls } from '../vertex-figure-construction-controls.mjs';
import { MultiViewControls } from '../multi-view-controls.mjs';
import { HoverIdentification } from '../hover-identification.mjs';
import { entityVertices } from '../selection-highlight.mjs';
import { FacePlacementControls } from '../face-placement-controls.mjs';
import { CupolaControls } from '../cupola-controls.mjs';
import { StarPolygonControls } from '../star-polygon-controls.mjs';
import { ProductControls } from '../product-controls.mjs';
import { AntiprismControls } from '../antiprism-controls.mjs';
import { StepPrismControls } from '../step-prism-controls.mjs';
import { Waterman4Controls } from '../waterman4-controls.mjs';
import { NobleControls } from '../noble-controls.mjs';
import { BasicSolidControls } from '../basic-solid-controls.mjs';
import { StephanoidControls } from '../stephanoid-controls.mjs';
import { ProjectMetadataControls } from '../project-metadata-controls.mjs';
import { TorusControls } from '../torus-controls.mjs';
import { PodiaControls } from '../podia-controls.mjs';
import { WatermanControls } from '../waterman-controls.mjs';
import { SegmentotopeControls } from '../segmentotope-controls.mjs';
import { SegmentotopeAnalysisControls } from '../segmentotope-analysis-controls.mjs';
import { CrossedSegmentotopeControls } from '../crossed-segmentotope-controls.mjs';
import { AugmentationControls } from '../augmentation-controls.mjs';
import { generateConstruction, certifyCurrent } from '../construction-workflow.mjs';
import { WorkspaceNumericControls } from '../workspace-numeric-controls.mjs';
import { verifyNativeSource } from '../native-source-binding.mjs';
import { SpringControls } from '../spring-controls.mjs';
import { IntrinsicReportControls } from '../intrinsic-report-controls.mjs';
import { DiscoverabilityControls } from '../discoverability-controls.mjs';
import { WelcomeControls } from '../welcome-controls.mjs';
import { DesktopFiles, reviewProjectOpen } from '../desktop-files.mjs';
import { WELCOME_SAMPLES } from '../welcome-samples.mjs';
import { featuredView } from '../welcome-state.mjs';
import { AppChrome } from '../app-chrome.mjs';
import { AppearanceSheet } from '../appearance-sheet.mjs';
export function createPanels(ctx) {
  function availableDerivedModel() {
    return ctx.derivedControls?.pending ? null : ctx.derivedModel;
  }
  function derivedStateSnapshot() {
    const { state, initialDocumentState } = ctx;

    const m = availableDerivedModel(),
      s = state();
    if (!m || !s) return null;
    return initialDocumentState(m, 'Derived ' + s.view.derivedMode, s);
  }
  function promoteDerivedView() {
    const { animation, state, ordinaryCellSections, densitySections, addDocument, clone } = ctx;

    if (animation.exporting || ctx.tourExporting)
      throw new Error('Finish animation export before promoting a derived result.');
    const snapshot = derivedStateSnapshot();
    if (!snapshot) throw new Error('Evaluate a current derived result before promoting it.');
    if (ctx.project.documents.length >= 100) throw new Error('Close a document before promoting another result.');
    if (state().view.derivedMode === 'cell-section') return ordinaryCellSections.promote(ctx.derivedResult);
    if (state().view.derivedMode === 'section' && state().view.densitySection?.enabled)
      return densitySections.promote(ctx.derivedResult);
    return addDocument(clone(snapshot.model), 'Promote derived view', { documentContext: snapshot });
  }
  function syncCancelAvailability() {
    const { $, nativeJobs, derivedWork, netEditor } = ctx;

    $('cancel').hidden =
      !nativeJobs.pending.size &&
      !ctx.derivedControls?.timer &&
      !ctx.derivedControls?.pending &&
      !derivedWork.active &&
      !netEditor?.exports?.busy &&
      !ctx.imageCapture?.busy;
  }
  function cancelDerivedPresentation() {
    const { derivedWork, densitySectionControls, derived, $ } = ctx;

    const pending = Boolean(ctx.derivedControls?.timer || ctx.derivedControls?.pending || derivedWork.active);
    if (!pending) {
      syncCancelAvailability();
      return false;
    }
    densitySectionControls.show(null);
    ++ctx.derivedSequence;
    derivedWork.cancel();
    ctx.derivedModel = null;
    ctx.derivedResult = null;
    ctx.net = null;
    derived.clear();
    $('promote').disabled = true;
    $('derived-status').textContent = 'Derived evaluation canceled. Evaluate the current inputs to retry.';
    ctx.derivedControls?.cancelEvaluation();
    ctx.sectionToolbar?.status('Section update canceled. Choose Update section to retry.');
    syncCancelAvailability();
    return true;
  }
  function derivedAvailabilityChanged({ pending = false } = {}) {
    const { memories, exportControls, derivedWork } = ctx;

    memories.sync();
    if (!exportControls.dialog.open) return;
    const available = exportControls.context?.getDerived
      ? exportControls.context.getDerived()
      : availableDerivedModel();
    exportControls.source.options[1].disabled = !available;
    if (exportControls.source.value !== 'derived') return;
    if (pending || ctx.derivedControls?.pending || derivedWork.active) {
      exportControls.session.cancel();
      exportControls.preview.textContent = 'Wait for the derived result before exporting it.';
      exportControls.preview.dataset.status = 'preparing';
      exportControls.sync();
    } else if (!available) {
      exportControls.session.cancel();
      exportControls.preview.textContent = 'No current derived result is available. Evaluate it again or choose Model.';
      exportControls.preview.dataset.status = 'error';
      exportControls.sync();
    } else exportControls.refresh();
  }
  function constructDocument(kind, params, label, options) {
    const { animation, run, addDocument } = ctx;

    return generateConstruction(
      { getProject: () => ctx.project, isExporting: () => animation.exporting || ctx.tourExporting, run, addDocument },
      kind,
      params,
      label,
      options
    );
  }
  return {
    availableDerivedModel,
    derivedStateSnapshot,
    promoteDerivedView,
    syncCancelAvailability,
    cancelDerivedPresentation,
    derivedAvailabilityChanged,
    constructDocument,
    mountPrimary() {
      const {
        numericContext,
        doc,
        state,
        model,
        run,
        number,
        rawNumbers,
        guard,
        markDirty,
        api,
        setStatus,
        base,
        derived,
        $,
        format,
        projectOpening,
        error,
        markViewDirty,
      } = ctx;
      const stellation = new StellationControls({
        ...numericContext,
        commit: ctx.commitOperation,
        getDocument: doc,
        getProject: () => ctx.project,
        isExporting: () => Boolean(ctx.stellationCells?.context.isExporting?.()),
        getState: state,
        getModel: model,
        toggleDiagram: async (id) => {
          if (!ctx.stellationCells?.receipt) await ctx.stellationCells.evaluate();
          ctx.stellationCells.apply('toggle', id);
        },
        run,
        number,
        rawNumbers,
        guard,
        markDirty,
        refresh: ctx.refreshDerived,
        api,
        setStatus,
      });
      ctx.stellation = stellation;
      // A deliberate net edit ends the introductory startup spin (docs/VIEWER_UX.md); user playback still blocks edits.
      const netEditBusy = () => {
        if (ctx.viewportControls?.startupRotation) ctx.viewportControls.stop();
        return animation.playing || ctx.viewportControls?.playing || tours?.playing;
      };
      ctx.netEditBusy = netEditBusy;
      const netEditor = new NetEditor({
        getState: state,
        getModel: model,
        getProject: () => ctx.project,
        getDocument: doc,
        commit: ctx.commitOperation,
        number,
        isExporting: () => animation.exporting || ctx.tourExporting,
        isBusy: netEditBusy,
        run,
        guard,
        markDirty,
        refresh: ctx.refreshDerived,
        prepareLayout: () => {
          base.resize();
          derived.resize();
        },
        viewer: derived,
        assemblyViewer: base,
        api,
        setStatus,
        onExportActivity: syncCancelAvailability,
        renderElementContent: (options) => ctx.elementContent.refresh(derived, options),
      });
      ctx.netEditor = netEditor;
      const cellNetEditor = new CellNetEditor({
        getState: state,
        getModel: model,
        getProject: () => ctx.project,
        getDocument: doc,
        number,
        isExporting: () => animation.exporting || ctx.tourExporting,
        isBusy: netEditBusy,
        run,
        guard,
        markDirty,
        refresh: ctx.refreshDerived,
        prepareLayout: () => {
          base.resize();
          derived.resize();
        },
        viewer: derived,
        onSourceSelection: (kind, index, dirty) => {
          $('selection-kind').value = kind;
          $('selection-id').value = index;
          ctx.selectEntity(dirty);
        },
      });
      ctx.cellNetEditor = cellNetEditor;
      const measurementControls = new MeasurementControls({
        ...numericContext,
        getState: state,
        getModel: model,
        run,
        guard,
        markDirty,
        refresh: ctx.refreshDerived,
        number,
        rawNumbers,
        format,
      });
      ctx.measurementControls = measurementControls;
      const symmetryControls = new SymmetryControls({
        ...numericContext,
        getState: state,
        run,
        guard,
        markDirty,
        viewer: base,
        format,
      });
      ctx.symmetryControls = symmetryControls;
      const analysisOverview = new AnalysisOverview({
        document,
        getState: state,
        getDocument: doc,
        getEntries: () => ctx.catalog,
      });
      ctx.analysisOverview = analysisOverview;
      const elementTypes = new ElementTypeControls({
        beforeAnalysis: afterModelPaint,
        getState: state,
        run,
        guard,
        markDirty,
        viewer: base,
        display: ctx.displayBase,
        isExporting: () => animation.exporting || ctx.tourExporting,
        select: ctx.selectEntityType,
        onTypes: (model, result) => analysisOverview.sync(model, result),
        getEvidencePanel: () => $('analysis-type-evidence'),
      });
      ctx.elementTypes = elementTypes;
      const animationRenderer = new AnimationRenderer({
        getState: state,
        viewer: base,
        netViewer: derived,
        run,
        onMorphPose: (frame, prepared) => ctx.dualMorph?.adoptAnimationPose(frame, prepared),
        display: () => {
          ctx.displayBase();
          ctx.viewportControls?.sync();
        },
        syncPose: (view) => {
          syncAnimationV4Inputs(view);
          ctx.syncRotationPose();
          $('section-depth').value = view.sectionOffset;
          $('section-offset').value = view.sectionOffset;
          $('derived-mode').value = view.derivedMode;
        },
        refreshDerived: (options) => ctx.refreshDerived({ throwOnError: true, preserveLayout: true, ...options }),
        refreshSection: (options) => ctx.refreshDerived({ throwOnError: true, ...options }),
        showNet: (pose) => {
          ++ctx.derivedSequence;
          ctx.derivedModel = null;
          ctx.derivedResult = null;
          ctx.net = pose.foldNet;
          $('promote').disabled = true;
          $('net-preview').hidden = true;
          $('derived-canvas').hidden = false;
          $('derived-mode').value = 'net';
          $('derived-status').textContent = 'Rigid face-net fold: ' + format(pose.frame.foldFraction);
          ctx.viewportControls?.sync();
        },
      });
      ctx.animationRenderer = animationRenderer;
      const animation = new AnimationControls({
        ...numericContext,
        getState: state,
        getModel: model,
        isExporting: () => ctx.tourExporting,
        viewer: base,
        sectionViewer: derived,
        netViewer: derived,
        capabilities: () => animationRenderer.capabilities(),
        loadPlanes: (m, o) => animationRenderer.loadPlanes(m, o),
        loadNet: (m, o) => animationRenderer.loadNet(m, o),
        loadMorph: (m, s, o) => animationRenderer.loadMorph(m, s, o),
        renderTracks: (p, o) => animationRenderer.renderTracks(p, o),
        clearTracks: () => animationRenderer.clearTracks(),
        display: ctx.displayBase,
        refreshSection: () => {
          const source = state(),
            generation = animation.generation;
          const current = () => state() === source && animation.generation === generation && !ctx.tourExporting;
          return ctx.refreshDerived({
            throwOnError: true,
            isCurrent: current,
            exportOwner: animation.exporting ? () => animation.exporting && current() : undefined,
          });
        },
        markDirty,
        api,
        setStatus,
        guard,
        stopLegacy: () => {
          ctx.dualMorph?.cancel();
          ctx.viewportControls?.stop();
        },
        onExportStateChange: () => {
          ctx.cellRebuildControls?.sync();
          ctx.polychoronRelationships?.sync();
          ctx.uniformFamilyControls?.sync();
          ctx.goursatWythoffControls?.sync();
          ctx.relatedLibrary?.sync();
          ctx.faceSurgeryControls?.sync();
          projectOpening.sync();
          ctx.imageCapture?.sync();
          ctx.catalogLoader?.sync();
          ctx.derivedControls?.onExportStateChange();
          netEditor.onExportStateChange();
          cellNetEditor.onExportStateChange();
          ctx.sourceReflectionControls?.sync();
          ctx.coincidicRegimentControls?.sync();
          ctx.dualMorph?.sync();
          animation.update();
          ctx.projectionFit?.cancel();
          ctx.viewportControls?.sync();
          memories?.sync();
          entityOrientation?.sync();
          cellFacing?.sync();
          ctx.historyControls?.sync();
          ctx.presentationControls?.sync();
          ctx.appearanceControls?.sync();
          ctx.materialEffectsControls?.sync();
          tours?.sync();
          ctx.faceEditing?.sync();
          ctx.automaticFaceting?.sync();
          ctx.facetingDiagram?.sync();
          ctx.pickingControls?.sync();
          ctx.compoundControls?.sync();
          ctx.perspectiveControls?.sync();
          ctx.subdivisionControls?.sync();
          ctx.faceConwayControls?.sync();
          ctx.cupolaControls?.sync();
          ctx.starPolygonControls?.sync();
          ctx.productControls?.sync();
          ctx.antiprismControls?.sync();
          ctx.stepPrismControls?.sync();
          ctx.nobleControls?.sync();
          ctx.stephanoidControls?.sync();
          ctx.basicSolidControls?.sync();
          ctx.torusControls?.sync();
          ctx.podiaControls?.sync();
          ctx.watermanControls?.sync();
          ctx.crossedSegmentotopeControls?.sync();
          ctx.augmentationControls?.sync();
          ctx.geodesicControls?.sync();
          ctx.convexCoreControls?.sync();
          ctx.expansionControls?.sync();
          ctx.fittingControls?.sync();
          ctx.exactSectionControls?.sync();
          ctx.incidenceTruncationControls?.sync();
          ctx.sphereProjectionControls?.sync();
          ctx.projectiveDualControls?.sync();
          ctx.facePlacementControls?.sync();
          ctx.sourceZonohedronControls?.sync();
          ctx.vertexFigureConstruction?.sync();
          ctx.multipleViews?.sync();
          ctx.springControls?.sync();
          ctx.segmentotopeControls?.sync();
          ctx.segmentotopeAnalysis?.sync();
          ctx.elementContent?.sync();
          ctx.sourceLabelPresets?.sync();
          ctx.stellationCells?.sync();
          ctx.reinforcement?.sync();
          ctx.coincidentAssembly?.sync();
          ctx.densityInfo?.sync();
          ctx.projectMetadata?.sync();
        },
        showSection: () => {
          state().view.viewportLayout = 'split';
          ctx.viewportControls?.sync();
        },
        syncPose: (view) => {
          syncAnimationV4Inputs(view);
          ctx.syncRotationPose();
          $('section-depth').value = view.sectionOffset;
          $('section-offset').value = view.sectionOffset;
          $('derived-mode').value = view.derivedMode;
        },
      });
      ctx.animation = animation;
      ctx.dualMorph = new DualMorphControls({
        ...numericContext,
        mappedContent: true,
        prepare: (m, settings, sourceContext, o) =>
          run('prepare-dual-morph', { settings, sourceContext }, m, 'Prepare dual morph', o),
        evaluate: (m, prepared, ratio, sourceContext, o) =>
          run('evaluate-dual-morph', { prepared, ratio, sourceContext }, m, 'Evaluate dual morph', o),
        render: async (frame, o) => {
          const current = state();
          return ctx.displayDiagnostic(
            await renderMorphElementContent(base, frame, current, {
              ...o,
              getState: state,
              describe: (m, p, options) =>
                run('element-content-describe', p, m, 'Prepare moving morph content', options),
            })
          );
        },
        clear: () => {
          if (base.morphFrame) {
            base.clearMorph(model(), state().view);
            ctx.elementContent.refresh().catch(error);
          }
        },
        prepareCapture: (o) => base.prepareCapture(o),
        markDirty,
        onState: () => {
          ctx.dualMorph?.sync();
          animation.update();
        },
        onError: error,
        stopOther: () => {
          ctx.viewportControls?.stop();
          animation.pause();
          tours?.closePreview();
        },
      });
      base.onMorphPick = (owners, kind, index) => {
        const selected = owners.find((o) => o.kind === kind) || owners[0];
        if (!selected) {
          setStatus('Morph primitive has no single source entity.');
          return;
        }
        $('selection-kind').value = selected.kind;
        $('selection-id').value = selected.id;
        ctx.selectEntity(true);
        setStatus('Morph ' + kind + ' ' + index + ' -> ' + owners.map((o) => o.kind + ' ' + o.id).join(', '));
      };
      const memories = new MemoryControls({
        ...numericContext,
        getProject: () => ctx.project,
        getState: state,
        getSource: (target) => ({
          documentId: doc().id,
          modelId: (target === 'derived' ? availableDerivedModel() : model())?.id,
          ...(target === 'derived' ? { derivedMode: state().view.derivedMode } : {}),
        }),
        getDerivedState: derivedStateSnapshot,
        restoreState: ctx.restoreMemoryState,
        addStates: ctx.addMemoryStates,
        markDirty,
        setStatus,
        guard,
        isExporting: () => animation.exporting || ctx.tourExporting,
      });
      ctx.memories = memories;
      const tours = new TourControls({
        ...numericContext,
        run,
        getProject: () => ctx.project,
        getState: state,
        showEvent: ctx.showTourEvent,
        createRenderer: ctx.createTourRenderer,
        api,
        onExportStateChange: (value) => {
          ctx.tourExporting = value;
          animation.context.onExportStateChange();
        },
        markDirty,
        guard,
        isExporting: () => animation.exporting || ctx.tourExporting,
        stopOther: () => {
          ctx.dualMorph?.pause();
          ctx.viewportControls?.stop();
          animation.pause();
        },
        importTour: api.importTour,
        exportTour: api.exportTour,
        setStatus,
      });
      ctx.tours = tours;
      ctx.viewportControls = new ViewportControls({
        ...numericContext,
        getInput: $,
        getState: state,
        getModel: model,
        base,
        derived,
        display: ctx.displayBase,
        displayPose: ctx.displayPose,
        markDirty,
        markPoseDirty: markViewDirty,
        isExporting: () => animation.exporting || ctx.tourExporting,
        stopTrack: () => animation.pause(),
        syncPose: ctx.syncRotationPose,
        refreshDerived: ctx.refreshDerived,
        cancelProjectionFit: () => ctx.projectionFit?.cancel(),
        requestProjectionFit: () => ctx.projectionFit?.request(),
        syncDerivedControls: () => ctx.derivedControls?.sync(),
      });
      ctx.projectionFit = new ProjectionFit({
        getOwner: () => {
          const current = state();
          if (!current || animation.exporting || ctx.tourExporting || animation.playing || ctx.viewportControls.playing)
            return null;
          return {
            project: ctx.project,
            document: doc(),
            state: current,
            model: current.model,
            fingerprint: current.model.fingerprint,
            pose: stereographicViewSignature(current.view),
            camera: JSON.stringify([base.cameraState(), base.aspect]),
          };
        },
        isReady: () => {
          if (
            state()?.view.projection !== 'stereographic' ||
            model()?.dimension !== 4 ||
            base.stereographicWorkerUnavailable
          )
            return true;
          const worker = base.stereographicWorker,
            published = worker?.published,
            snapshot = worker?.snapshot;
          return Boolean(
            published &&
              snapshot &&
              published.publication.phase === 'idle' &&
              published.publication.frameKey === snapshot.keys.frameKey &&
              published.publication.sourceKey === snapshot.keys.sourceKey &&
              snapshot.model === model() &&
              snapshot.viewSignature === stereographicViewSignature(state().view) &&
              !worker.transport.pending.active &&
              !worker.transport.pending.queued
          );
        },
        fit: () => base.fit(),
        persist: () => {
          state().view.camera = base.cameraState();
          markDirty();
        },
        onError: (failure) => error(failure),
      });
      const entityOrientation = new EntityOrientationControls({
        ...numericContext,
        getTarget: () => ({
          kind: $('selection-kind').value,
          index: $('selection-id').value,
          measurementA: {
            kind: state().view.measurements?.aKind ?? null,
            ids: state().view.measurements?.aIds ?? null,
          },
          frame: state().view.orientationFrame ?? null,
        }),
        getState: state,
        isExporting: () => animation.exporting || ctx.tourExporting,
        guard,
        apply: ctx.orientSelection,
        clear: () => {
          ctx.viewportControls.stop();
          animation.pause();
          delete state().view.orientationFrame;
          state().view.angles = Array(6).fill(0);
          ctx.syncRotationPose();
          ctx.displayBase();
          markDirty();
        },
      });
      ctx.entityOrientation = entityOrientation;
      const symmetryOrientation = new SymmetryOrientationControls({
        ...numericContext,
        run,
        guard,
        viewer: base,
        markDirty,
        display: ctx.displayBase,
        syncPose: ctx.syncRotationPose,
        stop: () => {
          ctx.viewportControls.stop();
          animation.pause();
        },
      });
      ctx.symmetryOrientation = symmetryOrientation;
      const cellFacing = new CellFacingControls({
        ...numericContext,
        evaluate: (m, options) => run('cell-facing', {}, m, 'Evaluate source cell planes', options),
        getCounts: () => base.facingCounts,
        display: ctx.displayBase,
        markDirty,
      });
      ctx.cellFacing = cellFacing;
    },
    mountSecondary() {
      const {
        numericContext,
        state,
        animation,
        guard,
        markDirty,
        run,
        number,
        $,
        defaults,
        base,
        model,
        netEditor,
        clone,
        api,
        format,
        derived,
        doc,
        stellation,
        setStatus,
        tours,
        analysisOverview,
        uid,
        derivedWork,
        el,
      } = ctx;
      const presentationControls = new PresentationControls({
        ...numericContext,
        getState: state,
        isExporting: () => animation.exporting || ctx.tourExporting,
        guard,
        display: ctx.displayBase,
        markDirty,
      });
      ctx.presentationControls = presentationControls;
      const appearanceControls = new AppearanceControls({
        ...numericContext,
        getState: state,
        isExporting: () => animation.exporting || ctx.tourExporting,
        guard,
        display: ctx.displayBase,
        markDirty,
      });
      ctx.appearanceControls = appearanceControls;
      const materialEffectsControls = new MaterialEffectsControls({
        ...numericContext,
        run,
        getState: state,
        isExporting: () => animation.exporting || ctx.tourExporting,
        guard,
        display: ctx.displayBase,
        markDirty,
      });
      ctx.materialEffectsControls = materialEffectsControls;
      const faceEditing = new FaceEditingControls({
        ...numericContext,
        getState: state,
        isExporting: () => animation.exporting || ctx.tourExporting,
        guard,
        number,
        analyze: async (m, p, { signal, verifyPublication } = {}) => {
          verifyPublication?.();
          const result = await run('face-coincidences', p, m, 'Inspect coincident faces', { signal });
          verifyPublication?.();
          return result;
        },
        commit: ctx.commitOperation,
      });
      ctx.faceEditing = faceEditing;

      const automaticFaceting = new AutomaticFacetingControls({
        ...numericContext,
        read: async (op, p, m, { signal, verifyPublication }) => {
          verifyPublication();
          const result = await run(op, p, m, 'Automatic facets', { signal });
          verifyPublication();
          return result;
        },
        commit: ctx.commitOperation,
        preview: async (m, { verifyPublication }) => {
          verifyPublication();
          const container = $('facet-preview');
          container.hidden = false;
          ctx.facetingPreview ??= new Viewer(container);
          ctx.facetingPreview.setModel(m);
          ctx.facetingPreview.setDisplay({ ...defaults(3), surfaceColors: 'source', vertices: false });
          ctx.facetingPreview.fit();
        },
        clearPreview: () => ctx.facetingPreview?.clear(),
      });
      ctx.automaticFaceting = automaticFaceting;
      const facetingDiagram = new FacetingDiagramControls({
        ...numericContext,
        prepareCatalogue: async () => {
          automaticFaceting.node('symmetry-mode').value = 'all';
          automaticFaceting.node('actions').value = '';
          await automaticFaceting.apply('candidates');
        },
        cancelPreparation: () => automaticFaceting.cancel(),
        catalogue: () => {
          if (!automaticFaceting.catalogue) throw Error('Build a candidate pool first.');
          verifyNativeSource(numericContext, automaticFaceting.catalogueOwner);
          if (automaticFaceting.generationSignature() !== automaticFaceting.catalogueForm)
            throw Error('Candidate source actions or bounds changed. Rebuild first.');
          return automaticFaceting.catalogue;
        },
        selectedResult: () => automaticFaceting.selected(),
        searchSignature: () =>
          JSON.stringify({ fields: automaticFaceting.signature(), result: automaticFaceting.node('result').value }),
        read: automaticFaceting.context.read,
        commit: ctx.commitOperation,
        preview: async (m, { verifyPublication }) => {
          verifyPublication();
          const container = $('faceting-diagram-preview');
          container.hidden = false;
          ctx.diagramPreview ??= new Viewer(container);
          ctx.diagramPreview.setModel(m);
          ctx.diagramPreview.setDisplay({ ...defaults(3), surfaceColors: 'source', vertices: false });
          ctx.diagramPreview.fit();
        },
        clearPreview: () => {
          ctx.diagramPreview?.clear();
          $('faceting-diagram-preview').hidden = true;
        },
        save: async (value, { signal, verifyPublication }) => {
          verifyPublication();
          if (signal.aborted) throw Object.assign(Error('Diagram save canceled.'), { name: 'AbortError' });
          state().view.facetingDiagram = value;
          markDirty();
        },
      });
      ctx.facetingDiagram = facetingDiagram;
      const pickingControls = new PickingControls({
        getState: state,
        isExporting: () => animation.exporting || ctx.tourExporting,
        guard,
        display: ctx.displayBase,
        markDirty,
      });
      ctx.pickingControls = pickingControls;
      const elementContent = new ElementContentControls({
        ...numericContext,
        commit: ctx.commitOperation,
        viewer: base,
        selection: () => ({ kind: $('selection-kind').value, index: Number($('selection-id').value) }),
        visibleTargets: (kind) => {
          if (base.model !== model() || !base.publishedPickState)
            throw Error('Wait for the current source presentation.');
          const { visibility, view } = base.publishedPickState,
            enabled =
              kind === 'vertex'
                ? view.vertices === true
                : kind === 'edge'
                  ? view.edges !== false
                  : view.faces !== false;
          if (!enabled) return [];
          if (kind === 'cell') return [...visibility.activeCells];
          return visibility[{ vertex: 'vertices', edge: 'edges', face: 'faces' }[kind]].flatMap((shown, i) =>
            shown ? [i] : []
          );
        },
        describe: async (m, p, { signal, verifyPublication }) => {
          verifyPublication();
          const result = await run('element-content-describe', p, m, 'Prepare element content', { signal });
          verifyPublication();
          return result;
        },
        render: async (viewer, descriptor, { sourceSnapshot, signal, verifyPublication }) => {
          verifyPublication?.();
          if (typeof viewer.setElementContent !== 'function') {
            if (descriptor) throw Error('Element content renderer is not available.');
            return { ready: true };
          }
          const result = await viewer.setElementContent(descriptor, {
            sourceModel: sourceSnapshot,
            signal,
            isCurrent: () => {
              try {
                verifyPublication?.();
                return true;
              } catch {
                return false;
              }
            },
          });
          verifyPublication?.();
          return result;
        },
      });
      ctx.elementContent = elementContent;
      ctx.reinforcement = new ReinforcementControls({
        ...numericContext,
        mount: { after: (panel) => $('net-panel').append(panel) },
        getNetParameters: () => {
          const s = state(),
            c = netEditor.config(s),
            saved =
              s.netHistory?.sourceFingerprint === s.model.fingerprint ? s.netHistory.states[s.netHistory.cursor] : null;
          const layout = s.netLayout?.sourceFingerprint === s.model.fingerprint ? s.netLayout : null;
          const candidate = layout ?? saved,
            matching =
              candidate?.root === c.root &&
              (candidate.referenceEdgeLengthMm ?? candidate.edge_length_mm) === c.length &&
              candidate.tabs === c.tabs;
          return {
            root: c.root,
            edge_length_mm: c.length,
            tabs: c.tabs,
            ...(matching
              ? { hinges: clone(candidate.hinges), placements: clone(candidate.placements ?? []) }
              : s.netSeparate
                ? { hinges: [] }
                : {}),
          };
        },
        getPaperParameters: () => {
          const p = state().view.netPrint ?? {
            paper: 'a4',
            orientation: 'portrait',
            width_mm: 210,
            height_mm: 297,
            margin_mm: 10,
          };
          let [width, height] =
            p.paper === 'custom'
              ? [p.width_mm, p.height_mm]
              : ({ a4: [210, 297], a3: [297, 420], letter: [215.9, 279.4], legal: [215.9, 355.6] }[p.paper] ?? [
                  p.width_mm,
                  p.height_mm,
                ]);
          if ((p.orientation === 'landscape' && width < height) || (p.orientation !== 'landscape' && width > height))
            [width, height] = [height, width];
          return { width_mm: width, height_mm: height, margin_mm: p.margin_mm };
        },
        read: async (op, p, m, o) => {
          o.verifyPublication();
          const result = await run(op, p, m, 'Prepare internal support panels', o);
          o.verifyPublication();
          return result;
        },
        preview: async (svg, o) => {
          o.verifyPublication();
          const root = checkedReinforcementSVG(svg);
          o.verifyPublication();
          $('reinforcement-chart').replaceChildren(document.importNode(root, true));
          $('reinforcement-chart').hidden = false;
        },
        clearPreview: () => {
          $('reinforcement-chart')?.replaceChildren();
          if ($('reinforcement-chart')) $('reinforcement-chart').hidden = true;
        },
        save: async (value, o) => {
          o.verifyPublication();
          if (o.signal.aborted) throw Object.assign(Error('Supporting panel save canceled.'), { name: 'AbortError' });
          state().view.netReinforcement = value;
          markDirty();
        },
        export: (format, text, o) => publishBoundedExport(api, format, text, o),
        exportPdf: (pages, o) => publishBoundedExport(api, 'pdf', pages, o),
      });
      ctx.reinforcement.fabrication = new FabricationControls(ctx.reinforcement.context);
      ctx.reinforcement.fabrication.allowance = new HingeStripControls({
        ...ctx.reinforcement.context,
        mount: { after: (panel) => ctx.reinforcement.fabrication.node('presets').append(panel) },
      });
      ctx.coincidentAssembly = new CoincidentEdgeControls({
        ...numericContext,
        mount: { after: (panel) => $('net-panel').append(panel) },
        read: async (op, p, m, o) => {
          o.verifyPublication();
          const result = await run(op, p, m, 'Prepare four-face source assembly', o);
          o.verifyPublication();
          return result;
        },
        preview: async (svg, result, o) => {
          o.verifyPublication();
          const root = checkedAssemblySVG(svg);
          root.style.width = '100%';
          root.style.height = 'auto';
          o.verifyPublication();
          $('assembly-chart').replaceChildren(document.importNode(root, true));
          $('assembly-chart').hidden = false;
        },
        clearPreview: () => {
          $('assembly-chart')?.replaceChildren();
          if ($('assembly-chart')) $('assembly-chart').hidden = true;
        },
        getPaperParameters: () => {
          const p = state().view.netPrint ?? { paper: 'a4', orientation: 'portrait', margin_mm: 10, gap_mm: 5 };
          return Object.fromEntries(
            ['paper', 'orientation', 'width_mm', 'height_mm', 'margin_mm', 'gap_mm', 'allow_rotation']
              .filter((k) => p[k] !== undefined)
              .map((k) => [k, p[k]])
          );
        },
        export: (format, text, o) =>
          publishBoundedExport(api, format, text, { ...o, defaultName: 'Source edge assembly' }),
        exportPdf: (pages, o) => publishBoundedExport(api, 'pdf', pages, { ...o, defaultName: 'Source edge assembly' }),
      });
      ctx.densityInfo = new GeneralizedDensityControls({
        ...numericContext,
        format,
        mount: { after: (panel) => $('entity-measure-controls').after(panel) },
        read: async (op, p, m, o) => {
          o.verifyPublication();
          const result = await run(op, p, m, 'Generalized source density information', o);
          o.verifyPublication();
          return result;
        },
        export: (format, text, o) =>
          publishBoundedExport(api, format, text, { ...o, defaultName: 'Generalized density evidence' }),
      });
      ctx.informationPanel = new InformationPanel({ ...numericContext, run, api });
      $('cancel').addEventListener('click', () => ctx.informationPanel?.cancel());
      // Descriptor/asset readiness precedes capture; missing requested content is never
      // treated as an empty overlay while an asynchronous native read is in flight.
      for (const viewer of [base, derived]) {
        const capture = viewer.prepareCapture.bind(viewer);
        viewer.prepareCapture = async (options = {}) => {
          if (viewer === base) await elementContent.prepareCapture(options);
          else if (
            viewer.net ||
            viewer.cellNet ||
            hasSectionSourceContent(viewer.model) ||
            hasEmptySectionSource(viewer)
          )
            await elementContent.refresh(viewer, {
              ...options,
              referenceEdgeMm: viewer.net?.referenceEdgeLengthMm ?? 25,
            });
          else if (state()?.view.elementAnnotations?.entries.length)
            throw Error('Element content mapping to this derived presentation is not supported.');
          return capture(options);
        };
      }
      ctx.sourceLabelPresets = new ElementLabelPresetsControls({
        ...numericContext,
        getState: state,
        getDocument: doc,
        getProject: () => ctx.project,
        isExporting: () => animation.exporting || ctx.tourExporting,
        guard,
        run,
        commit: ctx.commitOperation,
        visibleTargets: (kind) => elementContent.context.visibleTargets(kind),
      });
      ctx.stellationCells = new StellationDiagramControls({
        ...numericContext,
        commit: ctx.commitOperation,
        markDirty,
        getState: state,
        getDocument: doc,
        getProject: () => ctx.project,
        getConfig: () => stellation.config(),
        isExporting: () => animation.exporting || ctx.tourExporting,
        guard,
        run,
        applySelection: (ids) => {
          const s = state();
          s.view.derivedMode = 'stellation';
          stellation.config(s).display = 'solid';
          $('derived-mode').value = 'stellation';
          $('stellation-display').value = 'solid';
          markDirty();
          ctx.refreshDerived();
        },
        saveSvg: (svg, name) => api.saveSvg(svg, name),
      });
      const compoundControls = new CompoundControls({
        ...numericContext,
        getEntries: () => ctx.catalog,
        generate: (kind, params, options) => constructDocument(kind, params, 'Uniform compound', options),
        getState: state,
        isExporting: () => animation.exporting || ctx.tourExporting,
        guard,
        commit: ctx.commitOperation,
      });
      ctx.compoundControls = compoundControls;
      const perspectiveControls = new PerspectiveControls({
        ...numericContext,
        getState: state,
        isExporting: () => animation.exporting || ctx.tourExporting,
        guard,
        display: ctx.displayBase,
        markDirty,
        requestProjectionFit: () => ctx.viewportControls.frameModel(),
      });
      ctx.perspectiveControls = perspectiveControls;
      const subdivisionControls = new SubdivisionControls({
        ...numericContext,
        getState: state,
        isExporting: () => animation.exporting || ctx.tourExporting,
        guard,
        commit: ctx.commitOperation,
      });
      ctx.subdivisionControls = subdivisionControls;
      const sourceConstructionContext = {
        ...numericContext,
        getState: state,
        getDocument: doc,
        getProject: () => ctx.project,
        isExporting: () => animation.exporting || ctx.tourExporting,
        guard,
        number,
        commit: ctx.commitOperation,
      };
      ctx.sourceConstructionContext = sourceConstructionContext;
      ctx.faceConwayControls = new FaceConwayControls({ ...sourceConstructionContext, run });
      ctx.faceConwayControls.inheritance = new SubdivisionInheritanceControls({
        ...sourceConstructionContext,
        run,
        isBusy: () => ctx.faceConwayControls.busy,
      });
      ctx.cellRebuildControls = new CellRebuildControls({ ...sourceConstructionContext, run });
      const sourceReflectionControls = new SourceReflectionControls(sourceConstructionContext);
      ctx.sourceReflectionControls = sourceReflectionControls;
      const coincidicRegimentControls = new CoincidicRegimentControls({
        ...sourceConstructionContext,
        setStatus,
        restoreState: ctx.restoreMemoryState,
        onSelect: (kind, index) => {
          $('selection-kind').value = kind;
          $('selection-id').value = index;
          return ctx.selectEntity(true);
        },
        navigateDocument: (id) => {
          const index = ctx.project.documents.findIndex((d) => d.id === id);
          if (index < 0) throw Error('Comparison source document is no longer open.');
          ctx.project.active = index;
          markDirty();
          ctx.renderWorkspace();
        },
      });
      ctx.coincidicRegimentControls = coincidicRegimentControls;
      ctx.geodesicControls = new SourceConstructionControls(sourceConstructionContext, 'geodesic');
      ctx.convexCoreControls = new SourceConstructionControls(sourceConstructionContext, 'core');
      ctx.expansionControls = new ExpansionControls(sourceConstructionContext);
      ctx.fittingControls = new FittingControls({
        ...sourceConstructionContext,
        preview: async (op, params, { sourceSnapshot, signal, verifyPublication }) => {
          verifyPublication();
          const result = await run(op, params, sourceSnapshot, 'Preview geometry fit', { signal });
          verifyPublication();
          return result;
        },
      });
      ctx.exactSectionControls = new ExactSectionControls({
        ...sourceConstructionContext,
        preview: async (op, params, { sourceSnapshot, signal, verifyPublication }) => {
          verifyPublication();
          const result = await run(op, params, sourceSnapshot, 'Compute exact surface section', { signal });
          verifyPublication();
          return result;
        },
      });
      ctx.incidenceTruncationControls = new IncidenceTruncationControls({
        ...sourceConstructionContext,
        preview: async (op, params, { sourceSnapshot, signal, verifyPublication }) => {
          verifyPublication();
          const result = await run(op, params, sourceSnapshot, 'Compute source edge cut', { signal });
          verifyPublication();
          return result;
        },
      });
      ctx.sphereProjectionControls = new SphereProjectionControls(sourceConstructionContext);
      ctx.projectiveDualControls = new ProjectiveDualControls({
        ...sourceConstructionContext,
        run,
        markDirty,
        setStatus,
        saveImage: (data, name, options) => saveReviewedImage(api, data, name, options),
        onSelect: (kind, index) => {
          $('selection-kind').value = kind;
          $('selection-id').value = index;
          ctx.selectEntity(true);
        },
      });
      ctx.sourceZonohedronControls = new SourceZonohedronControls(sourceConstructionContext, {
        anchor: 'convex-core-settings',
      });
      ctx.vertexFigureConstruction = new VertexFigureConstructionControls({
        ...sourceConstructionContext,
        run,
        addDocument: ctx.addDocument,
      });
      const hoverIdentification = new HoverIdentification({
        viewer: base,
        blocked: () =>
          !state() ||
          animation.playing ||
          ctx.viewportControls.playing ||
          ctx.viewportControls.drag ||
          ctx.viewportControls.direct4D?.active ||
          tours?.playing ||
          ctx.dualMorph?.playing ||
          netEditor.playing ||
          animation.exporting ||
          ctx.tourExporting ||
          ctx.imageCapture?.busy,
        describe: (result) => {
          const hit =
            result.sourceOwners?.find((o) => o.kind === result.picked.kind) ??
            (base.publishedPickState?.morphFrame ? null : result.picked);
          return hit
            ? ctx.describeSelection(
                model(),
                hit.kind,
                hit.id,
                entityVertices(model(), hit.kind, [hit.id]),
                state().view.coordinateUnit
              )
            : '';
        },
      });
      ctx.hoverIdentification = hoverIdentification;
      ctx.multipleViews = new MultiViewControls({
        ...numericContext,
        Viewer,
        isPlaying: () => animation.playing || ctx.viewportControls.playing || tours?.playing || ctx.dualMorph?.playing,
        describeSelection: (m, hit, unit) =>
          ctx.describeSelection(m, hit.kind, hit.id, entityVertices(m, hit.kind, [hit.id]), unit),
        getState: state,
        getSource: model,
        getProject: () => ctx.project,
        getDocument: doc,
        isExporting: () => animation.exporting || ctx.tourExporting,
        guard,
        markDirty,
        setStatus,
        saveImage: (data, name, options) => saveReviewedImage(api, data, name, options),
        describeContent: (m, p, o) => run('element-content-describe', p, m, 'Prepare multiple-view content', o),
        onSelect: (index, count, kind) => {
          $('selection-kind').value = kind;
          $('selection-id').value = index;
          ctx.selectEntity();
        },
      });
      ctx.springControls = new SpringControls(
        {
          ...sourceConstructionContext,
          preview: async (op, params, { sourceSnapshot, signal, verifyPublication }) => {
            verifyPublication();
            const result = await run(op, params, sourceSnapshot, 'Preview spring relaxation', { signal });
            verifyPublication();
            return result;
          },
        },
        { anchor: 'convex-core-settings' }
      );
      const cupolaControls = new CupolaControls({
        ...numericContext,
        guard,
        number,
        isExporting: () => animation.exporting || ctx.tourExporting,
        generate: (params, options) => constructDocument('cupola', params, 'Generate cupola', options),
      });
      ctx.cupolaControls = cupolaControls;
      const starPolygonControls = new StarPolygonControls({
        ...numericContext,
        guard,
        number,
        isExporting: () => animation.exporting || ctx.tourExporting,
        generate: (params, options) =>
          constructDocument('regular-star-polygon', params, 'Generate regular polygon', options),
      });
      ctx.starPolygonControls = starPolygonControls;
      const productControls = new ProductControls({
        ...numericContext,
        guard,
        number,
        getState: state,
        commit: ctx.commitOperation,
        isExporting: () => animation.exporting || ctx.tourExporting,
        generate: (params, options) => constructDocument('polygon-product', params, 'Polygon product', options),
      });
      ctx.productControls = productControls;
      const antiprismControls = new AntiprismControls({
        ...numericContext,
        guard,
        number,
        getState: state,
        commit: ctx.commitOperation,
        isExporting: () => animation.exporting || ctx.tourExporting,
        generate: (kind, params, options) =>
          constructDocument(
            kind,
            params,
            kind === 'antiduoprism' ? 'Generate antiduoprism' : 'Generate rational antiprism',
            options
          ),
      });
      ctx.antiprismControls = antiprismControls;
      const uniformFamilyControls = new UniformFamilyControls({
        ...numericContext,
        guard,
        getState: state,
        isExporting: () => animation.exporting || ctx.tourExporting,
        generate: (kind, params, options) => constructDocument(kind, params, 'Uniform prism family', options),
      });
      ctx.uniformFamilyControls = uniformFamilyControls;
      const goursatWythoffControls = new GoursatWythoffControls({
        ...numericContext,
        generate: (kind, params, options) => constructDocument(kind, params, 'Goursat star Wythoff', options),
      });
      ctx.goursatWythoffControls = goursatWythoffControls;
      $('cancel').addEventListener('click', () => goursatWythoffControls.cancel());
      $('cancel').addEventListener('click', () => uniformFamilyControls.cancel());
      const stepPrismControls = new StepPrismControls({
        ...numericContext,
        guard,
        number,
        isExporting: () => animation.exporting || ctx.tourExporting,
        generate: (kind, params, options) => constructDocument(kind, params, 'Generate step prism', options),
      });
      ctx.stepPrismControls = stepPrismControls;
      const nobleControls = new NobleControls({
        ...numericContext,
        guard,
        isExporting: () => animation.exporting || ctx.tourExporting,
        generate: (kind, params, options) => constructDocument(kind, params, 'Generate noble disphenoid', options),
      });
      ctx.nobleControls = nobleControls;
      ctx.stephanoidControls = new StephanoidControls({
        ...numericContext,
        guard,
        isExporting: () => animation.exporting || ctx.tourExporting,
        generate: (kind, params, options) => constructDocument(kind, params, 'Generate stephanoid', options),
      });
      ctx.basicSolidControls = new BasicSolidControls({
        ...numericContext,
        guard,
        isExporting: () => animation.exporting || ctx.tourExporting,
        generate: (kind, params, options) => constructDocument(kind, params, 'Generate ' + kind, options),
      });
      const projectMetadata = new ProjectMetadataControls({
        ...numericContext,
        markDirty,
        refresh: () => {
          analysisOverview.sync();
          ctx.renderTabs();
          $('model-name').textContent = state().view.documentMetadata?.title?.trim() || model().name;
        },
      });
      ctx.projectMetadata = projectMetadata;
      const torusControls = new TorusControls({
        ...numericContext,
        guard,
        number,
        getProject: () => ctx.project,
        isExporting: () => animation.exporting || ctx.tourExporting,
        generate: (kind, params, options) => constructDocument(kind, params, 'Generate torus', options),
      });
      ctx.torusControls = torusControls;
      const podiaControls = new PodiaControls({
        ...numericContext,
        guard,
        number,
        getProject: () => ctx.project,
        isExporting: () => animation.exporting || ctx.tourExporting,
        generate: (kind, params, options) =>
          constructDocument(
            kind,
            params,
            kind === 'rational-podium' ? 'Generate podium' : 'Generate antipodium',
            options
          ),
      });
      ctx.podiaControls = podiaControls;
      const watermanControls = new WatermanControls({
        ...numericContext,
        guard,
        isExporting: () => animation.exporting || ctx.tourExporting,
        generate: (kind, params, options) => constructDocument(kind, params, 'Generate Waterman hull', options),
      });
      ctx.watermanControls = watermanControls;
      watermanControls.fourD = new Waterman4Controls(
        {
          ...numericContext,
          guard,
          isBusy: () => watermanControls.busy,
          onBusyChange: () => watermanControls.sync(),
          isExporting: () => animation.exporting || ctx.tourExporting,
          generate: (kind, params, options) => constructDocument(kind, params, 'Generate 4D Waterman hull', options),
        },
        watermanControls.panel
      );
      ctx.segmentotopeControls = new SegmentotopeControls({
        ...numericContext,
        guard,
        number,
        getState: state,
        getProject: () => ctx.project,
        getMemories: () => ctx.project.memories,
        isExporting: () => animation.exporting || ctx.tourExporting,
        commit: ctx.commitOperation,
      });
      ctx.segmentotopeAnalysis = new SegmentotopeAnalysisControls({
        guard,
        getState: state,
        isExporting: () => animation.exporting || ctx.tourExporting,
        analyze: (m, p) => run('analyze-strict-segmentotope', p, m, 'Check strict predicates'),
      });
      const crossedSegmentotopeControls = new CrossedSegmentotopeControls({
        ...numericContext,
        guard,
        number,
        getProject: () => ctx.project,
        isExporting: () => animation.exporting || ctx.tourExporting,
        generate: (kind, params, options) =>
          constructDocument(kind, params, 'Generate crossed antiprism product', options),
      });
      ctx.crossedSegmentotopeControls = crossedSegmentotopeControls;
      ctx.augmentationControls = new AugmentationControls({
        guard,
        number,
        getState: state,
        getDocument: doc,
        getProject: () => ctx.project,
        getWorkspace: () => ctx.project,
        getMemories: () => ctx.project.memories,
        isExporting: () => animation.exporting || ctx.tourExporting,
        commit: ctx.commitOperation,
      });
      ctx.faceSurgeryControls = new FaceSurgeryControls({
        ...sourceConstructionContext,
        preview: async (op, params, { sourceSnapshot, signal, verifyPublication }) => {
          verifyPublication();
          const result = await run(op, params, sourceSnapshot, 'Preview face surgery', { signal });
          verifyPublication();
          return result;
        },
        selection: () => ({ kind: $('selection-kind').value, index: Number($('selection-id').value) }),
      });
      ctx.facePlacementControls = new FacePlacementControls({
        guard,
        number,
        getState: state,
        getDocument: doc,
        getProject: () => ctx.project,
        getMemories: () => ctx.project.memories,
        isExporting: () => animation.exporting || ctx.tourExporting,
        commit: ctx.commitOperation,
      });
      const ordinaryCellSections = new OrdinaryCellSectionWorkflow({
        ...sourceConstructionContext,
        run,
        publishHistory: (result) => {
          ctx.project.documents.push({ ...result, id: uid(), name: 'Ordinary cell section' });
          ctx.project.active = ctx.project.documents.length - 1;
          markDirty();
          ctx.renderWorkspace();
        },
      });
      ctx.ordinaryCellSections = ordinaryCellSections;
      const densitySections = new DensitySectionWorkflow({
        ...sourceConstructionContext,
        run,
        publishHistory: (result) => {
          ctx.project.documents.push({ ...result, id: uid(), name: 'Filled density section' });
          ctx.project.active = ctx.project.documents.length - 1;
          markDirty();
          ctx.renderWorkspace();
        },
      });
      ctx.densitySections = densitySections;
      const densitySectionControls = new DensitySectionControls({
        ...numericContext,
        guard,
        markDirty,
        refreshDerived: ctx.refreshDerived,
        isPending: () => Boolean(ctx.derivedControls?.pending || derivedWork.active),
        showSection: () => {
          state().view.viewportLayout = 'split';
          $('derived-mode').value = state().view.derivedMode;
          ctx.viewportControls?.sync();
        },
      });
      ctx.densitySectionControls = densitySectionControls;
      const workspaceNumeric = new WorkspaceNumericControls({
        ...numericContext,
        getInput: $,
        commit: ctx.commitOperation,
        generate: constructDocument,
        run,
        addDocument: ctx.addDocument,
        markDirty,
        refreshDerived: ctx.refreshDerived,
      });
      ctx.workspaceNumeric = workspaceNumeric;
      const coxeterPreviewHost = el('div');
      ctx.coxeterPreviewHost = coxeterPreviewHost;
      coxeterPreviewHost.id = 'coxeter-builder-preview';
      coxeterPreviewHost.hidden = true;
      $('base-canvas').parentElement.append(coxeterPreviewHost);
      const coxeterPreviewLabel = el('span', 'Unsaved shape preview · drag to explore', 'coxeter-preview-label');
      ctx.coxeterPreviewLabel = coxeterPreviewLabel;
      coxeterPreviewHost.append(coxeterPreviewLabel);
      ctx.coxeterBuilder = new CoxeterBuilder({
        ...numericContext,
        run,
        stop: () => {
          ctx.welcome?.close();
          ctx.viewportControls.stop();
          animation.pause();
        },
        preview: (m, { isCurrent }) => {
          if (!isCurrent()) return;
          coxeterPreviewHost.dataset.dimension = String(m.dimension);
          coxeterPreviewLabel.textContent = m.name + ' · symmetry preview';
          coxeterPreviewHost.hidden = false;
          coxeterPreviewFrame.sync();
          ctx.coxeterPreview ??= new Viewer(coxeterPreviewFrame.surface);
          ctx.coxeterPreview.resize();
          ctx.coxeterPreview.setModel(m);
          ctx.coxeterPreview.setDisplay(ctx.initialDocumentState(m, 'Shape preview').view);
          ctx.coxeterPreview.fit();
        },
        clearPreview: () => {
          coxeterPreviewHost.hidden = true;
          ctx.coxeterPreview?.clear();
          coxeterPreviewFrame.reset();
        },
        commit: (params, name, options) =>
          state()
            ? ctx.commitOperation('generate', { kind: 'coxeter-builder', ...params }, name, options)
            : constructDocument('coxeter-builder', params, name, options),
      });
      const coxeterPreviewFrame = new CoxeterPreviewFrame(
        coxeterPreviewHost,
        () => ctx.coxeterBuilder.panel,
        () => ctx.coxeterPreview
      );
      ctx.coxeterPreviewFrame = coxeterPreviewFrame;
      window.openCoxeterBuilder = guard(() => ctx.coxeterBuilder.show());
      const openCoxeterBuilderButton = el('button', 'Shape builder · Coxeter diagrams', 'wide accent');
      ctx.openCoxeterBuilderButton = openCoxeterBuilderButton;
      openCoxeterBuilderButton.id = 'open-coxeter-builder';
      openCoxeterBuilderButton.onclick = window.openCoxeterBuilder;
      $('coxeter-family').before(openCoxeterBuilderButton);
      $('cancel').addEventListener('click', () => ctx.coxeterBuilder.close());
      ctx.derivedControls = new DerivedViewControls({
        ...numericContext,
        getInput: $,
        getDerived: () => ctx.derivedModel,
        markDirty,
        refreshDerived: ctx.refreshDerived,
        syncDensity: () => densitySectionControls.sync(),
        syncViewport: () => ctx.viewportControls.sync(),
        applyPlane: (next) => workspaceNumeric.section(next),
        cancelPlane: () => workspaceNumeric.cancel(),
        onAvailabilityChange: derivedAvailabilityChanged,
        onActivityChange: syncCancelAvailability,
        onSync: () => ctx.sectionToolbar?.sync(),
        onSliceStatus: (text) => ctx.sectionToolbar?.status(text),
        onSliceComplete: (result) => ctx.sectionToolbar?.complete(result),
        invalidate: () => {
          ++ctx.derivedSequence;
          derivedWork.cancel();
          ctx.derivedModel = null;
          ctx.derivedResult = null;
          ctx.net = null;
          $('promote').disabled = true;
          $('derived-status').textContent = 'Updating derived view...';
          derivedAvailabilityChanged({ pending: true });
        },
        promote: promoteDerivedView,
      });
    },
    mountUnits() {
      const { el, $, state, markDirty, guard, workspaceNumeric } = ctx;
      const unitControls = el('div');
      ctx.unitControls = unitControls;
      unitControls.innerHTML =
        '<label>Coordinate units <select id="model-unit"><option value="model">Model units</option><option>mm</option><option>cm</option><option>m</option><option>in</option><option>ft</option></select></label><label>Reference edge <input id="reference-edge" type="number" min="0" value="0" step="1"></label><label>Desired edge length <input id="reference-length" value="1"></label><button id="scale-reference">Scale to reference</button>';
      $('scale').after(unitControls);
      $('model-unit').onchange = () => {
        state().view.coordinateUnit = $('model-unit').value;
        markDirty();
      };
      $('scale-reference').onclick = guard(() => workspaceNumeric.referenceScale());
    },
    mountDerivedChoices() {
      const { el, $, guard, workspaceNumeric } = ctx;
      const cellNetOption = el('option', '4D cell net');
      ctx.cellNetOption = cellNetOption;
      cellNetOption.value = 'cell-net';
      $('derived-mode').append(cellNetOption);
      const incidenceDualOption = el('option', 'Incidence dual (3D / 4D)');
      ctx.incidenceDualOption = incidenceDualOption;
      incidenceDualOption.value = 'incidence-dual';
      $('derived-mode').append(incidenceDualOption);
      const faceOption = el('option', 'Source face');
      ctx.faceOption = faceOption;
      faceOption.value = 'face';
      $('derived-mode').append(faceOption);
      const reciprocal = document.createElement('div');
      ctx.reciprocal = reciprocal;
      reciprocal.innerHTML =
        '<label>Reciprocation center <input id="incidence-dual-center" placeholder="Vertex mean, or 3 / 4 coordinates"></label><label>Reciprocation radius <input id="incidence-dual-radius" value="1"></label><button id="make-incidence-dual" class="wide">Construct 3D / 4D incidence dual</button><p class="muted">Preserves ordered links and complete cells, including finite star incidence. Requires closed local boundaries. Face or cell planes through the center, coincident reciprocal identities and unresolved links are diagnosed. Convex polar dual remains a separate operation.</p>';
      $('make-dual').after(reciprocal);
      $('make-incidence-dual').onclick = guard(() => workspaceNumeric.incidenceDual());
      const stellationOption = el('option', '3D stellation');
      ctx.stellationOption = stellationOption;
      stellationOption.value = 'stellation';
      $('derived-mode').append(stellationOption);
    },
    mountInspector() {
      const {
        $,
        openCoxeterBuilderButton,
        model,
        userGuide,
        numericContext,
        run,
        commitOperation,
        animation,
        el,
        base,
        defaults,
        state,
        netEditor,
        cellNetEditor,
        guard,
        selectEntity,
        editNotes,
        workspaceNumeric,
        rawNumbers,
        format,
        reports,
        rememberValidationDetails,
        reportMessage,
        reportCurrent,
        addDocument,
      } = ctx;
      organizeInspector(document);
      $('construct-panel').prepend(openCoxeterBuilderButton);
      const constructGallery = mountConstructGallery(document, { getModel: model, guide: userGuide });
      ctx.constructGallery = constructGallery;
      ctx.sectionToolbar = new SectionToolbar({
        getState: state,
        getDocument: () => ctx.doc(),
        controls: ctx.derivedControls,
        guard: ctx.guard,
        isExporting: () => ctx.animation.exporting || ctx.tourExporting,
        stop: () => {
          ctx.welcome?.close();
          ctx.coxeterBuilder?.close();
          ctx.viewportControls.stop();
          ctx.viewportControls.overlays?.dismissAll('section');
          ctx.animation.pause();
        },
      });
      organizeNetInspector(document);
      ctx.liveSliders = new LiveSliders({
        ...numericContext,
        run,
        commit: commitOperation,
        stop: () => {
          ctx.viewportControls.stop();
          animation.pause();
          ctx.dualMorph?.pause();
        },
        show: (m) => {
          if (!ctx.livePreviewHost) {
            ctx.livePreviewHost = el('div', undefined, 'live-preview-canvas');
            ctx.livePreviewHost.id = 'live-preview-canvas';
            ctx.livePreviewHost.hidden = true;
            $('base-canvas').parentElement.append(ctx.livePreviewHost);
            ctx.livePreviewBadge = el('div', undefined, 'live-preview-badge');
            ctx.livePreviewBadge.id = 'live-preview-badge';
            const close = el('button', 'Cancel preview');
            close.id = 'live-preview-cancel';
            close.onclick = () => ctx.liveSliders.cancel();
            ctx.livePreviewBadge.append('Explore · unsaved preview ', close);
            $('base-canvas').parentElement.append(ctx.livePreviewBadge);
            ctx.livePreviewViewer = new Viewer(ctx.livePreviewHost);
          }
          const first = ctx.livePreviewHost.hidden;
          ctx.livePreviewHost.hidden = false;
          ctx.livePreviewBadge.hidden = false;
          presentLivePreview(ctx.livePreviewViewer, base, m, { ...defaults(m.dimension), ...state().view }, { first });
        },
        clear: () => {
          if (ctx.livePreviewHost) {
            ctx.livePreviewHost.hidden = true;
            ctx.livePreviewBadge.hidden = true;
            ctx.livePreviewViewer.clear();
          }
        },
      });
      new NetsFlow(document, {
        faceEditor: netEditor,
        cellEditor: cellNetEditor,
        fabrication: ctx.reinforcement.fabrication,
      });
      document.querySelectorAll('[data-panel]').forEach(
        (b) =>
          (b.onclick = () => {
            document.querySelectorAll('[data-panel]').forEach((x) => {
              x.classList.toggle('active', x === b);
              x.setAttribute('aria-pressed', String(x === b));
            });
            $('inspector-region').scrollTop = 0;
            ['info', 'construct', 'evidence', 'net'].forEach((p) => ($(p + '-panel').hidden = p !== b.dataset.panel));
          })
      );
      PLANES.forEach(([a, b, label], i) => {
        const row = el('div', undefined, 'plane'),
          input = el('input');
        input.id = 'plane-' + i;
        input.type = 'range';
        input.min = -180;
        input.max = 180;
        input.step = 0.1;
        input.value = 0;
        input.setAttribute('aria-label', label + ' rotation');
        const output = el('output', '0°');
        output.id = 'plane-output-' + i;
        row.append(el('label', label), input, output);
        $('planes').append(row);
        input.oninput = guard(() => ctx.viewportControls.setAngle(i, input.value));
      });
      ['projection', 'faces-visible', 'vertices-visible'].forEach(
        (id) =>
          ($(id).onchange = guard(() =>
            ctx.viewportControls.setDisplayOption(id, id === 'projection' ? $(id).value : $(id).checked)
          ))
      );
      $('select-entity').onclick = guard(selectEntity);
      $('notes').oninput = editNotes;
      $('measure').onclick = guard(() => intrinsicReports.measure());
      $('make-dual').onclick = guard(() => commitOperation('dual', {}, 'Polar dual'));
      $('truncate').onclick = guard(() =>
        workspaceNumeric.operation('truncate', 'truncation', 'Edge-cut truncation', { min: 0, max: 0.5 }, 'amount')
      );
      $('extrude').onclick = guard(() =>
        workspaceNumeric.operation(
          'extrude',
          'extrusion-height',
          'Prism extrusion',
          { min: 0, exclusiveMin: true },
          'height'
        )
      );
      $('scale').onclick = guard(() =>
        workspaceNumeric.operation('transform', 'model-scale', 'Intrinsic scale', {}, 'scale')
      );
      $('mirror').onclick = guard(() => {
        const d = model().dimension,
          matrix = Array.from({ length: d }, (_, i) =>
            Array.from({ length: d }, (_, j) => (i === j ? (i === 0 ? -1 : 1) : 0))
          );
        return commitOperation('transform', { matrix }, 'Coordinate reflection');
      });
      $('generate').onclick = guard(() => workspaceNumeric.generator());
      $('build-hull').onclick = guard(() => workspaceNumeric.hull());
      $('coxeter-family').onchange = () => {
        const d = Number($('coxeter-family').value.slice(-1));
        $('coxeter-rings').value = '1' + '0'.repeat(d - 1);
      };
      $('wythoff').onclick = guard(() => workspaceNumeric.wythoff());
      $('copy-facets').onclick = () => {
        $('facet-cycles').value = model()
          .faces.map((f) => f.join(', '))
          .join('\n');
      };
      $('facet').onclick = guard(() =>
        commitOperation(
          'facet',
          { faces: $('facet-cycles').value.trim().split(/\n+/).map(rawNumbers) },
          'Manual faceting'
        )
      );
      $('evaluate').onclick = guard(async () => {
        const result = await run('expression', { expression: $('expression').value }, null, 'Evaluate expression');
        $('expression-result').textContent = result.exactRational
          ? `${result.exactRational} = ${format(result.value)} · rational exact`
          : `${format(result.value)} · float64 approximate`;
      });
      const regular4dButton = el('button', 'Verify regular 4D identity', 'wide');
      ctx.regular4dButton = regular4dButton;
      regular4dButton.id = 'validate-regular4d';
      const regular4dResult = el('output');
      ctx.regular4dResult = regular4dResult;
      regular4dResult.id = 'regular4d-validation-result';
      $('validate').after(regular4dButton, regular4dResult);
      const intrinsicReports = new IntrinsicReportControls({
        ...numericContext,
        getInput: $,
        reports,
        run,
        rawNumbers,
        format,
      });
      ctx.intrinsicReports = intrinsicReports;
      regular4dButton.onclick = guard(() => intrinsicReports.identity());
      $('validate').onclick = guard(async () => {
        const ticket = reports.begin(['validation']);
        rememberValidationDetails();
        reportMessage('evidence', 'Checking current model…');
        try {
          const result = await run('validate', {}, ticket.model, 'Validate incidence', { signal: ticket.signal });
          if (reportCurrent(ticket, 'validation', 'evidence'))
            renderValidation(document, ticket.model, result, { open: ctx.validationDetailsOpen });
        } catch (e) {
          if (reportCurrent(ticket, 'validation', 'evidence')) {
            reportMessage(
              'evidence',
              e.name === 'AbortError'
                ? 'Validation canceled. Check again when ready.'
                : 'Validation could not finish. Try again.'
            );
            throw e;
          }
        }
      });
      $('rational-hull').onclick = guard(() => workspaceNumeric.hull(true));
      $('certify-current').onclick = guard(() => certifyCurrent({ ...numericContext, run, addDocument }));
      $('rational-dual').onclick = guard(() => commitOperation('rational-dual', {}, 'Exact rational polar dual'));
    },
    mountWorkspacePanels() {
      const {
        actions,
        userGuide,
        guard,
        state,
        doc,
        animation,
        inspectLibraryEntry,
        activateDocument,
        api,
        renderHistory,
        tours,
        setStatus,
        exportControls,
        presentationControls,
        displayBase,
        markDirty,
        base,
        derived,
        markViewDirty,
        libraryVisual,
        readCatalogEntry,
        $,
        model,
        renderWorkspace,
        restoreMemoryState,
        densitySections,
        densitySectionControls,
        projectOpening,
        projectSaving,
        error,
        run,
        uid,
        renderTabs,
        showcase,
        netEditor,
        running,
        libraryPreviewJobs,
        initialDocumentState,
        refreshDerived,
        syncRotationPose,
        friendlyMessages,
        compoundControls,
        intrinsicReports,
        cellFacing,
        nativeJobs,
        sourceReflectionControls,
        coincidicRegimentControls,
        ordinaryCellSections,
        elementContent,
        cellNetEditor,
        workspaceNumeric,
        entityOrientation,
        symmetryOrientation,
        appearanceControls,
        materialEffectsControls,
        perspectiveControls,
        measurementControls,
        symmetryControls,
        elementTypes,
        stellation,
        subdivisionControls,
        cupolaControls,
        stepPrismControls,
        nobleControls,
        torusControls,
        watermanControls,
        productControls,
        antiprismControls,
        faceEditing,
        automaticFaceting,
        facetingDiagram,
        starPolygonControls,
        podiaControls,
        crossedSegmentotopeControls,
      } = ctx;
      const discoverability = new DiscoverabilityControls({
        actions,
        guide: userGuide,
        guard,
        library: () => [...ctx.catalog, ...ctx.external],
        actionReason: (id) => {
          if (['save', 'undo', 'redo', 'reset', 'image', 'export', 'print'].includes(id) && !state()?.model)
            return 'Open a model first.';
          if (id === 'undo' && doc()?.cursor === 0) return 'Already at the first history step.';
          if (id === 'redo' && doc()?.cursor === doc()?.states.length - 1) return 'Already at the last history step.';
          return '';
        },
        libraryReason: () => (animation.exporting || ctx.tourExporting ? 'Finish export before opening a model.' : ''),
        openLibrary: (entry) => {
          if (entry.external && entry.auditStatus === 'rejected') return inspectLibraryEntry(entry);
          const open = ctx.project.documents.findIndex(
            (d) => d.states.length === 1 && d.states[0].model?.metadata?.key === entry.key
          );
          return open >= 0 ? activateDocument(open) : ctx.catalogLoader.open(entry);
        },
      });
      ctx.discoverability = discoverability;
      const appChrome = new AppChrome({ guide: userGuide, api });
      ctx.appChrome = appChrome;
      animation.context.saveSequence = (sequence) => {
        if (ctx.dualMorph.commitAnimationHistory(() => saveAnimationHistory(doc(), state(), sequence))) renderHistory();
      };
      const timelinePanel = new TimelinePanel({
        animation,
        tours,
        getState: state,
        guard,
        setStatus,
        getKeyframeOwner: () => ({ project: ctx.project, document: doc(), state: state() }),
        restoreKeyframeOwner: (owner) => {
          if (owner?.project === ctx.project && doc()?.id === ctx.tourPreviewDocument) {
            const index = ctx.project.documents.indexOf(owner.document);
            if (index >= 0) activateDocument(index);
          }
          return state() === owner?.state;
        },
        exportVideo: async (mode) => {
          await actions.export();
          await exportControls.goals.choose('video');
          exportControls.goals.mediaSource = mode === 'tour' ? 'tour' : 'animation';
          exportControls.goals.renderFields();
          exportControls.goals.remember();
          exportControls.goals.sync();
        },
      });
      ctx.timelinePanel = timelinePanel;
      ctx.viewportControls.overlays?.configure({ reveal: (node) => discoverability.reveal(node) });
      ctx.appearanceSheet = new AppearanceSheet({
        getState: state,
        isExporting: () => animation.exporting || ctx.tourExporting,
        radiusBusy: () => Boolean(presentationControls.numericEntry),
        guard,
        display: displayBase,
        markDirty,
        refit: () => {
          if (!state()) return;
          base.resize();
          derived.resize();
          base.fit();
          state().view.camera = base.cameraState();
          if (state().view.viewportLayout === 'split') {
            derived.fit();
            state().view.derivedCamera = derived.cameraState();
          }
          markViewDirty();
        },
      });
      presentationControls.onRadiusEdit = () => ctx.appearanceSheet.sync();
      libraryVisual.mountOverflow();
      ctx.welcome = new WelcomeControls({
        guard,
        setStatus,
        showWhatsNew: () => actions.whatsnew(),
        samples: WELCOME_SAMPLES,
        refreshRecent: () => desktopFiles.refresh(),
        reveal: (node) => discoverability.reveal(node),
        readPreview: readCatalogEntry,
        explore: () => {
          if (document.body.classList.contains('library-hidden')) $('toggle-library').click();
          libraryVisual.goHome();
        },
        openFile: () => actions.open(),
        openFeatured: async (entry, { motion = false, split = false } = {}) => {
          const m = await ctx.catalogLoader.open(entry);
          if (!m || model() !== m) return null;
          Object.assign(state().view, featuredView(m.dimension), split ? { viewportLayout: 'split' } : {});
          markViewDirty();
          renderWorkspace();
          if (motion) ctx.viewportControls.startStartupRotation();
          return m;
        },
        openSample: (sample) => restoreMemoryState(JSON.parse(sample.source).documents[0].states[0], sample.title),
      });
      $('cancel').addEventListener('click', () => {
        densitySections.cancelActive();
        densitySectionControls.cancel();
      });
      const desktopFiles = new DesktopFiles({
        api,
        open: (token) => actions.open(token),
        isOpening: () => projectOpening.busy || projectSaving.busy,
        notify: setStatus,
        onError: error,
        host: $('welcome-primary'),
      });
      ctx.desktopFiles = desktopFiles;
      ctx.learn4D = new Learn4D(
        createLessonWorkspace({
          document,
          getProject: () => ctx.project,
          getDocument: doc,
          getState: state,
          run,
          uid,
          isExporting: () => animation.exporting || ctx.tourExporting,
          getDirty: () => ctx.dirty,
          setDirty: (value) => {
            ctx.dirty = value;
            api.setDirty(value).catch(() => {});
            renderTabs();
          },
          assertAvailable: () => {
            if (
              animation.exporting ||
              ctx.tourExporting ||
              showcase.busy ||
              projectOpening.busy ||
              projectSaving.busy ||
              ctx.imageCapture?.busy ||
              netEditor.exports.busy
            )
              throw Error('Finish the current task, then open Learn 4D.');
            if (
              animation.playing ||
              tours.playing ||
              tours.showing ||
              tours.busy ||
              ctx.dualMorph?.playing ||
              netEditor.playing
            )
              throw Error('Pause the current animation, then open Learn 4D.');
          },
          hasBackgroundWork: () =>
            running.size ||
            ctx.catalogLoader.pending.size ||
            ctx.catalogDiscovery.pending ||
            libraryPreviewJobs.pending.size,
          dismissWelcome: () => {
            ctx.welcome?.close();
            ctx.welcome?.walkthrough.stop();
          },
          refitLayout: () => {
            if (!state()) return;
            base.resize();
            derived.resize();
            $('fit-view').click();
          },
          stop: () => {
            ctx.welcome?.close();
            ctx.welcome?.walkthrough.stop();
            ctx.coxeterBuilder?.close();
            ctx.viewportControls.stop();
            animation.pause();
            tours.pause();
            ctx.dualMorph?.pause();
            netEditor.playing = false;
          },
          isRotating: () => ctx.viewportControls.playing,
          resumeRotation: () => {
            ctx.viewportControls.playing = true;
            ctx.viewportControls.syncPlaying();
          },
          initialState: initialDocumentState,
          markDirty,
          markViewDirty,
          viewport: ctx.viewportControls,
          refreshDerived,
          render: () => {
            renderWorkspace();
            if (!state()) {
              base.clear();
              derived.clear();
              $('model-name').textContent = 'Choose a model';
              renderTabs();
            }
          },
          updateSectionInputs: () => {
            const v = state().view;
            $('section-normal').value = v.sectionNormal.join(', ');
            $('section-depth').value = v.sectionOffset;
            $('section-offset').value = v.sectionOffset;
            $('derived-mode').value = v.derivedMode;
          },
          updateView: () => {
            displayBase();
            syncRotationPose();
            ctx.viewportControls.restoreDisplayInputs();
            ctx.viewportControls.sync();
          },
          fit: ({ baseOnly = false } = {}) => {
            base.resize();
            base.fit();
            state().view.camera = base.cameraState();
            if (!baseOnly && state().view.viewportLayout === 'split') {
              derived.resize();
              derived.fit();
              state().view.derivedCamera = derived.cameraState();
            }
          },
        })
      );
      window.openLearn4D = guard(() => actions.learn4d());
      mountLearn4DCard(document, window.openLearn4D);
      $('cancel').addEventListener('click', () => {
        ctx.learn4D?.cancel();
      });
      friendlyMessages.observeAvailability(() => ({
        hasModel: !!model(),
        dimension: model()?.dimension,
        cells: model()?.cells?.length || 0,
        exporting: animation.exporting || ctx.tourExporting,
        saving: projectSaving.busy,
        canUndo: doc()?.cursor > 0,
        canRedo: doc()?.cursor < doc()?.states.length - 1,
      }));
      $('cancel').onclick = guard(async () => {
        ctx.polychoronRelationships?.cancel();
        compoundControls.cancel();
        cancelDerivedPresentation();
        intrinsicReports.cancel();
        cellFacing.cancel();
        netEditor.exports.cancel();
        netEditor.cancelDrag();
        ctx.imageCapture?.cancel();
        ctx.initialModelAllowed = false;
        ctx.catalogDiscovery.cancel();
        nativeJobs.cancel();
        ctx.catalogLoader.cancel();
        sourceReflectionControls.cancel();
        coincidicRegimentControls.cancel();
        ordinaryCellSections.cancelActive();
        ctx.stellationCells?.cancel();
        ctx.basicSolidControls?.cancel();
        ctx.stephanoidControls?.cancel();
        ctx.sourceLabelPresets?.cancel();
        ctx.multipleViews?.close();
        ctx.projectiveDualControls?.cancel();
        ctx.dualMorph?.cancel();
        elementContent.invalidate();
        ctx.reinforcement?.cancel();
        ctx.coincidentAssembly?.cancel();
        ctx.densityInfo?.cancel();
        netEditor.sequence++;
        cellNetEditor.sequence++;
        workspaceNumeric.cancel();
        entityOrientation.cancelNumeric?.();
        symmetryOrientation.cancelNumeric();
        ctx.viewportControls.cancelNumeric?.();
        ctx.springControls?.cancel();
        presentationControls?.cancelNumeric();
        appearanceControls?.cancelNumeric();
        materialEffectsControls?.cancelNumeric();
        perspectiveControls?.cancelNumeric();
        measurementControls?.cancelNumeric?.();
        symmetryControls?.cancelNumeric?.();
        elementTypes.cancelNumeric();
        stellation?.cancelNumeric?.();
        animation?.cancelNumeric?.();
        tours?.cancelNumeric?.();
        for (const control of [
          ctx.faceConwayControls,
          ctx.cellRebuildControls,
          ctx.sphereProjectionControls,
          ctx.vertexFigureConstruction,
          ctx.geodesicControls,
          ctx.convexCoreControls,
          ctx.expansionControls,
          ctx.fittingControls,
          ctx.exactSectionControls,
          ctx.incidenceTruncationControls,
          ctx.sourceZonohedronControls,
          subdivisionControls,
          cupolaControls,
          stepPrismControls,
          nobleControls,
          torusControls,
          watermanControls,
          productControls,
          antiprismControls,
          faceEditing,
          automaticFaceting,
          facetingDiagram,
          ctx.segmentotopeControls,
          starPolygonControls,
          podiaControls,
          crossedSegmentotopeControls,
        ]) {
          control?.cancel?.();
          control?.cancelNumeric?.();
        }
        setStatus('Cancelled active computation.');
      });
    },
  };
}
