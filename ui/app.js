import { defaultDocumentView, legacyDocumentView } from './default-look.mjs';
import './default-look.css';
import { ImageCaptureSession, saveReviewedImage } from './image-capture-session.mjs';
import { startupMark, afterModelPaint } from './startup-performance.mjs';
import { FaceSurgeryControls } from './face-surgery-controls.mjs';
import { CellRebuildControls } from './cell-rebuild-controls.mjs';
import { DerivedViewControls, DerivedWork, derivedInputKey, derivedEntityIndex } from './derived-view-controls.mjs';
import { pointRadius } from './geometry-bounds.mjs';
import { organizeNetInspector } from './net-inspector-layout.mjs';
import { NetsFlow } from './nets-flow.mjs';
import './nets-flow.css';
import { organizeInspector, simplifyAnalysis, renderValidation } from './inspector-layout.mjs';
import { clearPrecisionValidation, syncPrecisionContext } from './precision-evidence.mjs';
import { mountConstructGallery } from './construct-gallery.mjs';
import './construct-gallery.css';
import { compileCatalogQuery } from './catalog-query.mjs';
import { CatalogDefaults, catalogBrowseEntries, isDiscoveryCandidate } from './catalog-defaults.mjs';
import { appendNearMissReport } from './near-miss-report.mjs';
import { LibraryPropertyControls, RelatedLibraryControls } from './library-navigation.mjs';
import { LibraryCollections } from './library-collections.mjs';
import { libraryFamilyLabel, libraryProvenance } from './library-visual.mjs';
import { LibraryThumbnails } from './library-thumbnails.mjs';
import './library-visual.css';
import { PolychoronRelationshipControls } from './polychoron-relationships.mjs';
import { UniformFamilyControls } from './uniform-family-controls.mjs';
import { GoursatWythoffControls } from './goursat-wythoff-controls.mjs';
import { CoxeterBuilder, CoxeterPreviewFrame } from './coxeter-builder.mjs';
import './coxeter-builder.css';
import { Learn4D, createLessonWorkspace, mountLearn4DCard } from './learn-4d.mjs';
import './learn-4d.css';
import { SourceReflectionControls } from './source-reflection-controls.mjs';
import { CoincidicRegimentControls } from './coincidic-regiment-controls.mjs';
import { UserGuide } from './user-guide.mjs';
import './style.css';
import { LiveSliders } from './live-sliders.mjs';
import { presentLivePreview } from './live-preview-view.mjs';
import './live-sliders.css';
import './direct-4d.css';
import './canvas-overlays.css';
import { Viewer } from './viewer.js';
import { renderMorphElementContent } from './morph-element-content-renderer.mjs';
import { DualMorphControls } from './dual-morph-controls.mjs';
import { PLANES } from './projection.js';
import { StellationControls } from './stellation.js';
import { StellationDiagramControls } from './stellation-diagram-controls.mjs';
import { NetEditor } from './net-editor.js';
import { CellNetEditor } from './cell-net-editor.js';
import { MeasurementControls } from './measurement-controls.js';
import { SymmetryControls } from './symmetry-controls.js';
import { ElementTypeControls } from './element-type-controls.mjs';
import { AnalysisOverview } from './analysis-overview.mjs';
import './analysis-overview.css';
import { SymmetryOrientationControls } from './symmetry-orientation-controls.mjs';
import { derivedLinks, linkedSelection, sourceSelection } from './linked-selection.mjs';
import { AnimationControls } from './animation-controls.mjs';
import { TimelinePanel } from './timeline-panel.mjs';
import { saveAnimationHistory } from './animation-history.mjs';
import './timeline.css';
import { AnimationRenderer } from './animation-renderer.mjs';
import { syncAnimationV4Inputs } from './animation-v4-view.mjs';
import { ViewportControls } from './viewport-controls.mjs';
import { ProjectionFit } from './projection-fit.mjs';
import { stereographicViewSignature } from './viewer-stereographic-worker.mjs';
import { MemoryControls } from './memory-controls.mjs';
import { prepareMemoryAddition } from './memory-numeric-workflow.mjs';
import { normalizeMemories } from './model-memories.mjs';
import { EntityOrientationControls } from './entity-orientation-controls.mjs';
import { CellFacingControls } from './cell-facing-controls.mjs';
import { HistoryControls } from './history-controls.mjs';
import { ExportControls } from './export-controls.mjs';
import { ExportGoals } from './export-goals.mjs';
import './export-goals.css';
import { derivedExportGeometry } from './interchange-controls.mjs';
import { PresentationControls } from './presentation-controls.mjs';
import { AppearanceControls } from './appearance-controls.mjs';
import { MaterialEffectsControls } from './material-effects-controls.mjs';
import { TourControls } from './tour-controls.mjs';
import { AnimatedTourRenderer } from './animated-tour-renderer.mjs';
import { createAnimatedTourLayerFactory } from './animated-tour-layer.mjs';
import { normalizeTour } from './tour.mjs';
import { FaceEditingControls } from './face-editing-controls.mjs';
import { AutomaticFacetingControls } from './automatic-faceting-controls.mjs';
import { FacetingDiagramControls } from './faceting-diagram-controls.mjs';
import { ElementContentControls } from './element-content-controls.mjs';
import { ElementLabelPresetsControls } from './element-label-presets-controls.mjs';
import { ReinforcementControls, checkedReinforcementSVG } from './reinforcement-controls.mjs';
import { HingeStripControls } from './hinge-strip-controls.mjs';
import { FabricationControls } from './net-fabrication-controls.mjs';
import { CoincidentEdgeControls, checkedAssemblySVG } from './coincident-edge-controls.mjs';
import { GeneralizedDensityControls } from './generalized-density-controls.mjs';
import { InformationPanel } from './information-panel.mjs';
import './information-panel.css';
import { publishBoundedExport } from './bounded-export.mjs';
import { captureContentHistoryPublication } from './element-content-history.mjs';
import { PickingControls } from './picking-controls.mjs';
import { CompoundControls } from './compound-controls.mjs';
import { PerspectiveControls } from './perspective-controls.mjs';
import { SubdivisionControls } from './subdivision-controls.mjs';
import { SubdivisionInheritanceControls } from './subdivision-inheritance-controls.mjs';
import { FaceConwayControls } from './face-conway-controls.mjs';
import { SourceConstructionControls } from './source-construction-controls.mjs';
import { ExpansionControls } from './expansion-controls.mjs';
import { FittingControls } from './fitting-controls.mjs';
import { nearMissText } from './fitting-report.mjs';
import { ExactSectionControls } from './exact-section-controls.mjs';
import { OrdinaryCellSectionWorkflow } from './ordinary-cell-section-workflow.mjs';
import {
  DensitySectionControls,
  DensitySectionWorkflow,
  densitySectionParameters,
  densitySectionDisplay,
} from './density-section-controls.mjs';
import { hasSectionSourceContent, rememberSectionSource, hasEmptySectionSource } from './section-source-content.mjs';
import { IncidenceTruncationControls } from './incidence-truncation-controls.mjs';
import { SphereProjectionControls } from './sphere-projection-controls.mjs';
import { ProjectiveDualControls } from './projective-dual-controls.mjs';
import { SourceZonohedronControls } from './source-zonohedron-controls.mjs';
import { VertexFigureConstructionControls } from './vertex-figure-construction-controls.mjs';
import { MultiViewControls } from './multi-view-controls.mjs';
import { HoverIdentification } from './hover-identification.mjs';
import { entityVertices } from './selection-highlight.mjs';
import { startupView } from './startup-view.mjs';
import { FacePlacementControls } from './face-placement-controls.mjs';
import { CupolaControls } from './cupola-controls.mjs';
import { StarPolygonControls } from './star-polygon-controls.mjs';
import { ProductControls } from './product-controls.mjs';
import { AntiprismControls } from './antiprism-controls.mjs';
import { StepPrismControls } from './step-prism-controls.mjs';
import { Waterman4Controls } from './waterman4-controls.mjs';
import { NobleControls } from './noble-controls.mjs';
import { BasicSolidControls } from './basic-solid-controls.mjs';
import { StephanoidControls } from './stephanoid-controls.mjs';
import { ProjectMetadataControls } from './project-metadata-controls.mjs';
import { TorusControls } from './torus-controls.mjs';
import { PodiaControls } from './podia-controls.mjs';
import { WatermanControls } from './waterman-controls.mjs';
import { SegmentotopeControls } from './segmentotope-controls.mjs';
import { SegmentotopeAnalysisControls } from './segmentotope-analysis-controls.mjs';
import { CrossedSegmentotopeControls } from './crossed-segmentotope-controls.mjs';
import { AugmentationControls } from './augmentation-controls.mjs';
import { generateConstruction, certifyCurrent } from './construction-workflow.mjs';
import { WorkspaceNumericControls } from './workspace-numeric-controls.mjs';
import { verifyNativeSource } from './native-source-binding.mjs';
import { SpringControls } from './spring-controls.mjs';
import {
  prepareHistoryCommit,
  prepareHistoryOpen,
  verifyHistoryPublication,
  preserveHistoryObserver,
} from './history-workflow.mjs';
import { createStatus } from './status.mjs';
import { FriendlyMessages } from './friendly-messages.mjs';
import './friendly-messages.css';
import { ProjectOpening, RecoverySnapshots, ProjectSaving } from './project-workflow.mjs';
import { CatalogLoading } from './catalog-loading.mjs';
import { NativeJobs } from './native-jobs.mjs';
import { ModelReports } from './model-reports.mjs';
import { CatalogDiscovery } from './catalog-discovery.mjs';
import { CorpusReconciliationControls } from './corpus-reconciliation-controls.mjs';
import { SymmetryEvidenceControls } from './symmetry-evidence-controls.mjs';
import './symmetry-evidence.css';
import { ClassificationQualificationControls } from './classification-qualification-controls.mjs';
import { UDualObstructionsControls } from './u-dual-obstructions-controls.mjs';
import './u-dual-obstructions.css';
import './corpus-reconciliation.css';
import './corpus-receipts.css';
import { WorkspaceAvailability } from './workspace-availability.mjs';
import { IntrinsicReportControls } from './intrinsic-report-controls.mjs';
import { DiscoverabilityControls } from './discoverability-controls.mjs';
import './discoverability.css';
import { WelcomeControls } from './welcome-controls.mjs';
import { DesktopFiles, reviewProjectOpen } from './desktop-files.mjs';
import { WELCOME_SAMPLES } from './welcome-samples.mjs';
import { featuredView } from './welcome-state.mjs';
import { ShowcaseControls } from './showcase-controls.mjs';
import { AppChrome } from './app-chrome.mjs';
import './app-chrome.css';
import { AppearanceSheet } from './appearance-sheet.mjs';
import './appearance-sheet.css';
// Keep factory imports after the original dependencies to preserve stylesheet evaluation order.
import { createAppContext } from './app/context.mjs';
import { createStartup } from './app/startup.mjs';
import { createHistoryWiring } from './app/history-wiring.mjs';
import { createPanels } from './app/panels.mjs';
import { createCatalogView } from './app/catalog-view.mjs';
import { createExport } from './app/export.mjs';
import { createWorkspaceRender } from './app/workspace-render.mjs';
startupMark('renderer-script-parsed');
let startupModelRendered = false;

let cellRebuildControls = null;
let faceSurgeryControls = null;

let learn4D = null;
let coxeterBuilder = null,
  coxeterPreview = null;

let liveSliders = null,
  livePreviewViewer = null,
  livePreviewHost = null,
  livePreviewBadge = null;

let dualMorph = null;

let stellationCells = null;

let sourceLabelPresets = null;

let informationPanel = null;

let reinforcement = null,
  coincidentAssembly = null,
  densityInfo = null;

let faceConwayControls = null;

let sphereProjectionControls = null,
  projectiveDualControls = null;

let multipleViews = null;
let vertexFigureConstruction = null;

let basicSolidControls = null;

let stephanoidControls = null;

let appearanceSheet = null;
let welcome = null;

const appContext = createAppContext(
  {
    $: () => $,
    acceptLinkedLibrary: () => acceptLinkedLibrary,
    actions: () => actions,
    activateDocument: () => activateDocument,
    addDocument: () => addDocument,
    addMemoryStates: () => addMemoryStates,
    analysisOverview: () => analysisOverview,
    animation: () => animation,
    animationRenderer: () => animationRenderer,
    antiprismControls: () => antiprismControls,
    api: () => api,
    appChrome: () => appChrome,
    appearanceControls: () => appearanceControls,
    appearanceSheet: () => appearanceSheet,
    auditFilter: () => auditFilter,
    augmentationControls: () => augmentationControls,
    automaticFaceting: () => automaticFaceting,
    availableDerivedModel: () => availableDerivedModel,
    base: () => base,
    basicSolidControls: () => basicSolidControls,
    cancelDialogNet: () => cancelDialogNet,
    catalog: () => catalog,
    catalogDefaults: () => catalogDefaults,
    catalogDiscovery: () => catalogDiscovery,
    catalogLoader: () => catalogLoader,
    catalogLoadingStatus: () => catalogLoadingStatus,
    catalogRetry: () => catalogRetry,
    cellFacing: () => cellFacing,
    cellNetEditor: () => cellNetEditor,
    cellNetOption: () => cellNetOption,
    cellRebuildControls: () => cellRebuildControls,
    classificationQualification: () => classificationQualification,
    clone: () => clone,
    coincidentAssembly: () => coincidentAssembly,
    coincidicRegimentControls: () => coincidicRegimentControls,
    commitOperation: () => commitOperation,
    compoundControls: () => compoundControls,
    constructGallery: () => constructGallery,
    convexCoreControls: () => convexCoreControls,
    corpusReconciliation: () => corpusReconciliation,
    coxeterBuilder: () => coxeterBuilder,
    coxeterPreview: () => coxeterPreview,
    coxeterPreviewFrame: () => coxeterPreviewFrame,
    coxeterPreviewHost: () => coxeterPreviewHost,
    coxeterPreviewLabel: () => coxeterPreviewLabel,
    createTourRenderer: () => createTourRenderer,
    crossedSegmentotopeControls: () => crossedSegmentotopeControls,
    cupolaControls: () => cupolaControls,
    defaults: () => defaults,
    densityInfo: () => densityInfo,
    densitySectionControls: () => densitySectionControls,
    densitySections: () => densitySections,
    derived: () => derived,
    derivedControls: () => derivedControls,
    derivedModel: () => derivedModel,
    derivedResult: () => derivedResult,
    derivedSequence: () => derivedSequence,
    derivedWork: () => derivedWork,
    describeSelection: () => describeSelection,
    desktopFiles: () => desktopFiles,
    diagramPreview: () => diagramPreview,
    dirty: () => dirty,
    discoverability: () => discoverability,
    discoveryPanel: () => discoveryPanel,
    discoveryStatus: () => discoveryStatus,
    displayBase: () => displayBase,
    displayDiagnostic: () => displayDiagnostic,
    displayPose: () => displayPose,
    doc: () => doc,
    dualMorph: () => dualMorph,
    editNotes: () => editNotes,
    el: () => el,
    elementContent: () => elementContent,
    elementTypes: () => elementTypes,
    entityOrientation: () => entityOrientation,
    error: () => error,
    exactSectionControls: () => exactSectionControls,
    expansionControls: () => expansionControls,
    exportControls: () => exportControls,
    external: () => external,
    faceConwayControls: () => faceConwayControls,
    faceEditing: () => faceEditing,
    faceOption: () => faceOption,
    facePlacementControls: () => facePlacementControls,
    faceSurgeryControls: () => faceSurgeryControls,
    facetingDiagram: () => facetingDiagram,
    facetingPreview: () => facetingPreview,
    filter: () => filter,
    fittingControls: () => fittingControls,
    format: () => format,
    friendlyMessages: () => friendlyMessages,
    geodesicControls: () => geodesicControls,
    goursatWythoffControls: () => goursatWythoffControls,
    guard: () => guard,
    historyControls: () => historyControls,
    hoverIdentification: () => hoverIdentification,
    imageCapture: () => imageCapture,
    incidenceDualOption: () => incidenceDualOption,
    incidenceTruncationControls: () => incidenceTruncationControls,
    informationPanel: () => informationPanel,
    initialDocumentState: () => initialDocumentState,
    initialModelAllowed: () => initialModelAllowed,
    inspectLibraryEntry: () => inspectLibraryEntry,
    inspectedLibraryEntry: () => inspectedLibraryEntry,
    intrinsicReports: () => intrinsicReports,
    lastFrame: () => lastFrame,
    learn4D: () => learn4D,
    libraryPreviewJobs: () => libraryPreviewJobs,
    libraryProperties: () => libraryProperties,
    libraryThumbnails: () => libraryThumbnails,
    libraryVisual: () => libraryVisual,
    linkedLibraries: () => linkedLibraries,
    livePreviewBadge: () => livePreviewBadge,
    livePreviewHost: () => livePreviewHost,
    livePreviewViewer: () => livePreviewViewer,
    liveSliders: () => liveSliders,
    markDirty: () => markDirty,
    markPlaybackDirty: () => markPlaybackDirty,
    markViewDirty: () => markViewDirty,
    materialEffectsControls: () => materialEffectsControls,
    measurementControls: () => measurementControls,
    memories: () => memories,
    model: () => model,
    multipleViews: () => multipleViews,
    nativeJobs: () => nativeJobs,
    net: () => net,
    netEditBusy: () => netEditBusy,
    netEditor: () => netEditor,
    nobleControls: () => nobleControls,
    number: () => number,
    numericContext: () => numericContext,
    openCoxeterBuilderButton: () => openCoxeterBuilderButton,
    ordinaryCellSections: () => ordinaryCellSections,
    orientSelection: () => orientSelection,
    pdfButton: () => pdfButton,
    perspectiveControls: () => perspectiveControls,
    pickingControls: () => pickingControls,
    podiaControls: () => podiaControls,
    polychoronRelationships: () => polychoronRelationships,
    presentationControls: () => presentationControls,
    presentationLibraryEntries: () => presentationLibraryEntries,
    productControls: () => productControls,
    project: () => project,
    projectMetadata: () => projectMetadata,
    projectOpening: () => projectOpening,
    projectSaving: () => projectSaving,
    projectionFit: () => projectionFit,
    projectiveDualControls: () => projectiveDualControls,
    rawNumbers: () => rawNumbers,
    readCatalogEntry: () => readCatalogEntry,
    reciprocal: () => reciprocal,
    recoverySnapshots: () => recoverySnapshots,
    refreshAnalysis: () => refreshAnalysis,
    refreshDerived: () => refreshDerived,
    regular4dButton: () => regular4dButton,
    regular4dResult: () => regular4dResult,
    reinforcement: () => reinforcement,
    relatedLibrary: () => relatedLibrary,
    rememberValidationDetails: () => rememberValidationDetails,
    renderCatalog: () => renderCatalog,
    renderHistory: () => renderHistory,
    renderLinkedLibraries: () => renderLinkedLibraries,
    renderTabs: () => renderTabs,
    renderWorkspace: () => renderWorkspace,
    reportCurrent: () => reportCurrent,
    reportMessage: () => reportMessage,
    reports: () => reports,
    restoreMemoryState: () => restoreMemoryState,
    revision: () => revision,
    run: () => run,
    running: () => running,
    segmentotopeAnalysis: () => segmentotopeAnalysis,
    segmentotopeControls: () => segmentotopeControls,
    selectEntity: () => selectEntity,
    selectEntityType: () => selectEntityType,
    selectionSummary: () => selectionSummary,
    serialize: () => serialize,
    setStatus: () => setStatus,
    showTourEvent: () => showTourEvent,
    showcase: () => showcase,
    sourceConstructionContext: () => sourceConstructionContext,
    sourceLabelPresets: () => sourceLabelPresets,
    sourceReflectionControls: () => sourceReflectionControls,
    sourceZonohedronControls: () => sourceZonohedronControls,
    sphereProjectionControls: () => sphereProjectionControls,
    springControls: () => springControls,
    starPolygonControls: () => starPolygonControls,
    startupModelRendered: () => startupModelRendered,
    state: () => state,
    status: () => status,
    stellation: () => stellation,
    stellationCells: () => stellationCells,
    stellationOption: () => stellationOption,
    stepPrismControls: () => stepPrismControls,
    stephanoidControls: () => stephanoidControls,
    subdivisionControls: () => subdivisionControls,
    symmetryControls: () => symmetryControls,
    symmetryEvidence: () => symmetryEvidence,
    symmetryOrientation: () => symmetryOrientation,
    syncCancelAvailability: () => syncCancelAvailability,
    syncCatalogSelection: () => syncCatalogSelection,
    syncDerivedSelection: () => syncDerivedSelection,
    syncRotationPose: () => syncRotationPose,
    timelinePanel: () => timelinePanel,
    toastTimer: () => toastTimer,
    torusControls: () => torusControls,
    tourExporting: () => tourExporting,
    tourPreviewDocument: () => tourPreviewDocument,
    tours: () => tours,
    uDualObstructions: () => uDualObstructions,
    uid: () => uid,
    uniformFamilyControls: () => uniformFamilyControls,
    unitControls: () => unitControls,
    userGuide: () => userGuide,
    validationDetailsOpen: () => validationDetailsOpen,
    vertexFigureConstruction: () => vertexFigureConstruction,
    viewportControls: () => viewportControls,
    watermanControls: () => watermanControls,
    welcome: () => welcome,
    workspaceAvailability: () => workspaceAvailability,
    workspaceNumeric: () => workspaceNumeric,
  },
  {
    analysisOverview: (value) => (analysisOverview = value),
    animation: (value) => (animation = value),
    animationRenderer: (value) => (animationRenderer = value),
    antiprismControls: (value) => (antiprismControls = value),
    appChrome: (value) => (appChrome = value),
    appearanceControls: (value) => (appearanceControls = value),
    appearanceSheet: (value) => (appearanceSheet = value),
    auditFilter: (value) => (auditFilter = value),
    augmentationControls: (value) => (augmentationControls = value),
    automaticFaceting: (value) => (automaticFaceting = value),
    basicSolidControls: (value) => (basicSolidControls = value),
    cancelDialogNet: (value) => (cancelDialogNet = value),
    catalog: (value) => (catalog = value),
    catalogDefaults: (value) => (catalogDefaults = value),
    catalogDiscovery: (value) => (catalogDiscovery = value),
    catalogLoader: (value) => (catalogLoader = value),
    catalogLoadingStatus: (value) => (catalogLoadingStatus = value),
    catalogRetry: (value) => (catalogRetry = value),
    cellFacing: (value) => (cellFacing = value),
    cellNetEditor: (value) => (cellNetEditor = value),
    cellNetOption: (value) => (cellNetOption = value),
    cellRebuildControls: (value) => (cellRebuildControls = value),
    classificationQualification: (value) => (classificationQualification = value),
    coincidentAssembly: (value) => (coincidentAssembly = value),
    coincidicRegimentControls: (value) => (coincidicRegimentControls = value),
    compoundControls: (value) => (compoundControls = value),
    constructGallery: (value) => (constructGallery = value),
    convexCoreControls: (value) => (convexCoreControls = value),
    corpusReconciliation: (value) => (corpusReconciliation = value),
    coxeterBuilder: (value) => (coxeterBuilder = value),
    coxeterPreview: (value) => (coxeterPreview = value),
    coxeterPreviewFrame: (value) => (coxeterPreviewFrame = value),
    coxeterPreviewHost: (value) => (coxeterPreviewHost = value),
    coxeterPreviewLabel: (value) => (coxeterPreviewLabel = value),
    crossedSegmentotopeControls: (value) => (crossedSegmentotopeControls = value),
    cupolaControls: (value) => (cupolaControls = value),
    densityInfo: (value) => (densityInfo = value),
    densitySectionControls: (value) => (densitySectionControls = value),
    densitySections: (value) => (densitySections = value),
    derivedControls: (value) => (derivedControls = value),
    derivedModel: (value) => (derivedModel = value),
    derivedResult: (value) => (derivedResult = value),
    derivedSequence: (value) => (derivedSequence = value),
    desktopFiles: (value) => (desktopFiles = value),
    diagramPreview: (value) => (diagramPreview = value),
    dirty: (value) => (dirty = value),
    discoverability: (value) => (discoverability = value),
    discoveryPanel: (value) => (discoveryPanel = value),
    discoveryStatus: (value) => (discoveryStatus = value),
    dualMorph: (value) => (dualMorph = value),
    elementContent: (value) => (elementContent = value),
    elementTypes: (value) => (elementTypes = value),
    entityOrientation: (value) => (entityOrientation = value),
    exactSectionControls: (value) => (exactSectionControls = value),
    expansionControls: (value) => (expansionControls = value),
    exportControls: (value) => (exportControls = value),
    external: (value) => (external = value),
    faceConwayControls: (value) => (faceConwayControls = value),
    faceEditing: (value) => (faceEditing = value),
    faceOption: (value) => (faceOption = value),
    facePlacementControls: (value) => (facePlacementControls = value),
    faceSurgeryControls: (value) => (faceSurgeryControls = value),
    facetingDiagram: (value) => (facetingDiagram = value),
    facetingPreview: (value) => (facetingPreview = value),
    filter: (value) => (filter = value),
    fittingControls: (value) => (fittingControls = value),
    geodesicControls: (value) => (geodesicControls = value),
    goursatWythoffControls: (value) => (goursatWythoffControls = value),
    historyControls: (value) => (historyControls = value),
    hoverIdentification: (value) => (hoverIdentification = value),
    imageCapture: (value) => (imageCapture = value),
    incidenceDualOption: (value) => (incidenceDualOption = value),
    incidenceTruncationControls: (value) => (incidenceTruncationControls = value),
    informationPanel: (value) => (informationPanel = value),
    initialModelAllowed: (value) => (initialModelAllowed = value),
    inspectedLibraryEntry: (value) => (inspectedLibraryEntry = value),
    intrinsicReports: (value) => (intrinsicReports = value),
    lastFrame: (value) => (lastFrame = value),
    learn4D: (value) => (learn4D = value),
    libraryPreviewJobs: (value) => (libraryPreviewJobs = value),
    libraryProperties: (value) => (libraryProperties = value),
    libraryThumbnails: (value) => (libraryThumbnails = value),
    libraryVisual: (value) => (libraryVisual = value),
    linkedLibraries: (value) => (linkedLibraries = value),
    livePreviewBadge: (value) => (livePreviewBadge = value),
    livePreviewHost: (value) => (livePreviewHost = value),
    livePreviewViewer: (value) => (livePreviewViewer = value),
    liveSliders: (value) => (liveSliders = value),
    materialEffectsControls: (value) => (materialEffectsControls = value),
    measurementControls: (value) => (measurementControls = value),
    memories: (value) => (memories = value),
    multipleViews: (value) => (multipleViews = value),
    net: (value) => (net = value),
    netEditBusy: (value) => (netEditBusy = value),
    netEditor: (value) => (netEditor = value),
    nobleControls: (value) => (nobleControls = value),
    openCoxeterBuilderButton: (value) => (openCoxeterBuilderButton = value),
    ordinaryCellSections: (value) => (ordinaryCellSections = value),
    pdfButton: (value) => (pdfButton = value),
    perspectiveControls: (value) => (perspectiveControls = value),
    pickingControls: (value) => (pickingControls = value),
    podiaControls: (value) => (podiaControls = value),
    polychoronRelationships: (value) => (polychoronRelationships = value),
    presentationControls: (value) => (presentationControls = value),
    presentationLibraryEntries: (value) => (presentationLibraryEntries = value),
    productControls: (value) => (productControls = value),
    project: (value) => (project = value),
    projectMetadata: (value) => (projectMetadata = value),
    projectSaving: (value) => (projectSaving = value),
    projectionFit: (value) => (projectionFit = value),
    projectiveDualControls: (value) => (projectiveDualControls = value),
    reciprocal: (value) => (reciprocal = value),
    recoverySnapshots: (value) => (recoverySnapshots = value),
    regular4dButton: (value) => (regular4dButton = value),
    regular4dResult: (value) => (regular4dResult = value),
    reinforcement: (value) => (reinforcement = value),
    relatedLibrary: (value) => (relatedLibrary = value),
    revision: (value) => (revision = value),
    segmentotopeAnalysis: (value) => (segmentotopeAnalysis = value),
    segmentotopeControls: (value) => (segmentotopeControls = value),
    sourceConstructionContext: (value) => (sourceConstructionContext = value),
    sourceLabelPresets: (value) => (sourceLabelPresets = value),
    sourceReflectionControls: (value) => (sourceReflectionControls = value),
    sourceZonohedronControls: (value) => (sourceZonohedronControls = value),
    sphereProjectionControls: (value) => (sphereProjectionControls = value),
    springControls: (value) => (springControls = value),
    starPolygonControls: (value) => (starPolygonControls = value),
    startupModelRendered: (value) => (startupModelRendered = value),
    stellation: (value) => (stellation = value),
    stellationCells: (value) => (stellationCells = value),
    stellationOption: (value) => (stellationOption = value),
    stepPrismControls: (value) => (stepPrismControls = value),
    stephanoidControls: (value) => (stephanoidControls = value),
    subdivisionControls: (value) => (subdivisionControls = value),
    symmetryControls: (value) => (symmetryControls = value),
    symmetryEvidence: (value) => (symmetryEvidence = value),
    symmetryOrientation: (value) => (symmetryOrientation = value),
    timelinePanel: (value) => (timelinePanel = value),
    toastTimer: (value) => (toastTimer = value),
    torusControls: (value) => (torusControls = value),
    tourExporting: (value) => (tourExporting = value),
    tourPreviewDocument: (value) => (tourPreviewDocument = value),
    tours: (value) => (tours = value),
    uDualObstructions: (value) => (uDualObstructions = value),
    uniformFamilyControls: (value) => (uniformFamilyControls = value),
    unitControls: (value) => (unitControls = value),
    validationDetailsOpen: (value) => (validationDetailsOpen = value),
    vertexFigureConstruction: (value) => (vertexFigureConstruction = value),
    viewportControls: (value) => (viewportControls = value),
    watermanControls: (value) => (watermanControls = value),
    welcome: (value) => (welcome = value),
    workspaceNumeric: (value) => (workspaceNumeric = value),
  }
);
const startup = createStartup(appContext);
const { frame } = startup;
const historyWiring = createHistoryWiring(appContext);
const {
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
} = historyWiring;
const panels = createPanels(appContext);
const {
  availableDerivedModel,
  derivedStateSnapshot,
  promoteDerivedView,
  syncCancelAvailability,
  cancelDerivedPresentation,
  derivedAvailabilityChanged,
  constructDocument,
} = panels;
const catalogView = createCatalogView(appContext);
const {
  syncCatalogSelection,
  renderCatalog,
  renderLinkedLibraries,
  acceptLinkedLibrary,
  syncCatalogDiscovery,
  syncCatalogLoading,
  readCatalogEntry,
  inspectLibraryEntry,
} = catalogView;
const exportWiring = createExport(appContext);
const { openGeometryExport, printNet, exportDialogNet } = exportWiring;
const workspaceRender = createWorkspaceRender(appContext);
const { displayPose, displayBase, displayDiagnostic, renderWorkspace } = workspaceRender;
const $ = (id) => document.getElementById(id),
  api = window.polytope;
const userGuide = new UserGuide($('help-dialog'));
const friendlyMessages = new FriendlyMessages(document);
const status = createStatus((text) => friendlyMessages.publish(text));
const clone = (x) => structuredClone(x),
  uid = () => crypto.randomUUID();
const defaults = (d) => defaultDocumentView(d);
let project = { format: 'polytope-laboratory', version: 1, active: 0, documents: [] };
let catalog = [],
  external = [],
  linkedLibraries = [],
  filter = 'all',
  derivedModel = null,
  derivedResult = null,
  net = null,
  derivedSequence = 0;
let presentationLibraryEntries = [];
let tourPreviewDocument = null,
  tourExporting = false;
let dirty = false,
  revision = 0,
  lastFrame = performance.now(),
  toastTimer = null,
  viewportControls,
  derivedControls,
  projectionFit,
  segmentotopeControls,
  segmentotopeAnalysis,
  augmentationControls,
  geodesicControls,
  convexCoreControls,
  expansionControls,
  fittingControls,
  exactSectionControls,
  incidenceTruncationControls,
  facePlacementControls,
  sourceZonohedronControls,
  springControls;
const nativeJobs = new NativeJobs({
  id: uid,
  now: () => performance.now(),
  start: (label) => status.defer(friendlyMessages.job(label)),
  format: (label, options) => friendlyMessages.job(label, options),
  complete: (owner, text, job) => {
    if (!status.settle(owner) || !status.complete(owner, text)) return false;
    friendlyMessages.completed(job);
    return true;
  },
  settle: (owner) => status.settle(owner),
  cancel: (id) => api.cancel(id),
  change: () => {
    syncCancelAvailability();
    friendlyMessages.syncJobs(nativeJobs.pending);
  },
});
const running = nativeJobs.pending;
let initialModelAllowed = true;
let catalogLoader, catalogDiscovery;
const doc = () => project.documents[project.active],
  state = () => doc()?.states[doc().cursor],
  model = () => state()?.model;
const reports = new ModelReports({ getProject: () => project, getDocument: doc, getState: state });
const derivedWork = new DerivedWork();
const projectOpening = new ProjectOpening();
let imageCapture = null;
const workspaceAvailability = new WorkspaceAvailability({
  getState: state,
  getDocument: doc,
  getGroups: () => document.querySelectorAll('[data-needs-model]'),
  getHint: () => $('empty-workspace-message'),
  publish: (value) => api?.setWorkspaceAvailability?.(value)?.catch(() => {}),
  notify: setStatus,
});
let analysisDetailsOpen = false,
  validationDetailsOpen = false;
let polychoronRelationships = null;
const base = new Viewer($('base-canvas'), (index, count, kind = 'vertex') => {
  $('selection-kind').value = kind;
  $('selection-id').value = index;
  selectEntity();
  if (count > 1) setStatus(`${count} source ${kind} candidates near this point. Click again to cycle them.`);
});
const derived = new Viewer($('derived-canvas'), (index, count, kind = 'vertex') => {
  const linked = sourceSelection(
    derivedLinks(model(), derivedResult, state().view.derivedMode, state().view.entity),
    kind,
    index
  );
  if (linked) selectEntityType(linked.kind, linked.ids, 'Linked ' + linked.kind);
});
derived.onLinkedSelection = syncDerivedSelection;
base.onPickDiagnostic = (message) => {
  if (message) setStatus(message);
};
base.onCaptureDiagnostic = setStatus;
base.onDisplay = (diagnostic) => {
  displayDiagnostic(diagnostic);
  projectionFit?.notify();
};
base.onCamera = (value) => {
  if (animation.exporting || tourExporting) return;
  projectionFit?.cancel();
  if (state()) {
    state().view.camera = value;
    if (viewportControls) viewportControls.orientation.value = 'free';
    markViewDirty();
  }
};
derived.onCamera = (value) => {
  if (animation.exporting || tourExporting) return;
  if (state()) {
    state().view.derivedCamera = value;
    markViewDirty();
  }
};

function markDirty() {
  cellRebuildControls?.sync();
  faceConwayControls?.sync();
  netEditor?.updateActions();
  cellNetEditor?.updateActions();
  sourceReflectionControls?.sync();
  coincidicRegimentControls?.sync();
  basicSolidControls?.sync();
  dualMorph?.sync();
  tours?.invalidatePreview();
  dirty = true;
  revision++;
  projectOpening.sync();
  imageCapture?.sync();
  api.setDirty(true).catch(() => {});
  segmentotopeControls?.sync();
  segmentotopeAnalysis?.sync();
  augmentationControls?.sync();
  geodesicControls?.sync();
  convexCoreControls?.sync();
  expansionControls?.sync();
  fittingControls?.sync();
  exactSectionControls?.sync();
  incidenceTruncationControls?.sync();
  sphereProjectionControls?.sync();
  projectiveDualControls?.sync();
  facePlacementControls?.sync();
  sourceZonohedronControls?.sync();
  vertexFigureConstruction?.sync();
  multipleViews?.sync();
  springControls?.sync();
  automaticFaceting?.sync();
  facetingDiagram?.sync();
  elementContent?.sync();
  sourceLabelPresets?.sync();
  stellationCells?.sync();
  reinforcement?.sync();
  coincidentAssembly?.sync();
  densityInfo?.sync();
}
function setStatus(text) {
  return status.set(text);
}
// Playback changes saved view values too. Count them without synchronizing
// every construction panel or sending a dirty IPC message on each frame.
function markPlaybackDirty({ presentationOnly = false } = {}) {
  revision++;
  projectOpening.sync();
  imageCapture?.sync();
  if (!dirty && !presentationOnly) {
    dirty = true;
    api.setDirty(true).catch(() => {});
    renderTabs();
  }
}
function markViewDirty() {
  markPlaybackDirty();
  tours?.invalidatePreview();
}
function editNotes() {
  const source = state();
  if (!source) return;
  if (animation.exporting || tourExporting) {
    $('notes').value = source.notes || '';
    return;
  }
  const notes = $('notes').value;
  if (notes === (source.notes ?? '')) return;
  source.notes = notes;
  markViewDirty();
  // Morph sources include notes; retire an obsolete prepared source without
  // scanning every unrelated construction panel for each text input event.
  dualMorph?.sync();
  liveSliders?.sync();
}
function error(e) {
  if (e?.name === 'AbortError') return;
  setStatus(friendlyMessages.error(e));
}
function guard(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      error(e);
    }
  };
}
// Numeric commits disable their panel while an expression is checked. When Tab or a
// click was moving focus into a field of that panel, the move is lost; restore it
// as soon as the target is enabled again, unless the user has focused elsewhere.
let focusIntent = null;
document.addEventListener(
  'focusout',
  (event) => {
    focusIntent =
      event.relatedTarget instanceof HTMLElement ? { node: event.relatedTarget, at: performance.now() } : null;
  },
  true
);
document.addEventListener(
  'focusin',
  (event) => {
    if (focusIntent && event.target !== focusIntent.node) focusIntent = null;
  },
  true
);
new MutationObserver(() => {
  const intent = focusIntent;
  if (!intent) return;
  if (
    intent.node.isConnected &&
    !intent.node.disabled &&
    document.activeElement === document.body &&
    performance.now() - intent.at < 10000
  ) {
    focusIntent = null;
    intent.node.focus();
  } else if (performance.now() - intent.at >= 10000) focusIntent = null;
}).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['disabled'] });
async function run(op, params = {}, source = null, label = op, { signal } = {}) {
  return nativeJobs.run((id) => api.engine({ op, params, model: source }, id), label, { signal });
}
async function number(expression, options = {}) {
  const result = await run('expression', { expression }, null, 'Evaluate expression', options);
  return result.value;
}
async function evaluateMany(expressions, { mode = 'real', signal } = {}) {
  const result = await run(
    'expression-batch',
    { expressions: [...expressions], mode },
    null,
    'Evaluate numeric inputs',
    { signal }
  );
  return result.values;
}
const evaluateBatch = (expressions, options = {}) => evaluateMany(expressions, { ...options, mode: 'real' });
const evaluateRationalBatch = (expressions, options = {}) =>
  evaluateMany(expressions, { ...options, mode: 'rational' });
const numericContext = {
  getState: state,
  getDocument: doc,
  getProject: () => project,
  isExporting: () => animation.exporting || tourExporting,
  guard,
  number,
  evaluateMany,
  evaluateBatch,
  evaluateRationalBatch,
};
const rawNumbers = (text) =>
  text
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((s) => {
      const n = Number(s);
      if (!Number.isFinite(n)) throw new Error('Use finite numeric coordinates separated by commas.');
      return n;
    });
function safeIndex(value, count) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n >= count)
    throw new Error(`Choose an integer index in 0–${Math.max(0, count - 1)}.`);
  return n;
}
function format(x) {
  if (x === null || x === undefined) return 'unavailable';
  return typeof x === 'number'
    ? Number(x.toPrecision(8)).toLocaleString('en-US', { maximumSignificantDigits: 8 })
    : String(x);
}
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function stat(container, label, value) {
  const row = el('div', undefined, 'stat-row');
  row.append(el('span', label), el('b', value));
  container.append(row);
}
let stellation,
  netEditBusy,
  netEditor,
  cellNetEditor,
  measurementControls,
  symmetryControls,
  analysisOverview,
  elementTypes,
  animationRenderer,
  animation,
  memories,
  tours,
  entityOrientation,
  symmetryOrientation,
  cellFacing;
panels.mountPrimary();

let historyControls;
historyWiring.mountHistory();
let cancelDialogNet = null;
let exportControls;
exportWiring.mountExportControls();
let presentationControls,
  appearanceControls,
  materialEffectsControls,
  faceEditing,
  facetingPreview,
  diagramPreview,
  automaticFaceting,
  facetingDiagram,
  pickingControls,
  elementContent,
  compoundControls,
  perspectiveControls,
  subdivisionControls,
  sourceConstructionContext,
  sourceReflectionControls,
  coincidicRegimentControls,
  hoverIdentification,
  cupolaControls,
  starPolygonControls,
  productControls,
  antiprismControls,
  uniformFamilyControls,
  goursatWythoffControls,
  stepPrismControls,
  nobleControls,
  projectMetadata,
  torusControls,
  podiaControls,
  watermanControls,
  crossedSegmentotopeControls,
  ordinaryCellSections,
  densitySections,
  densitySectionControls,
  workspaceNumeric,
  coxeterPreviewHost,
  coxeterPreviewLabel,
  coxeterPreviewFrame,
  openCoxeterBuilderButton;
panels.mountSecondary();

function syncRotationPose() {
  const v = state()?.view;
  if (v)
    PLANES.forEach((_, i) => {
      if ($('plane-' + i)) {
        $('plane-' + i).value = v.angles[i] || 0;
        $('plane-output-' + i).textContent = format(v.angles[i] || 0) + '°';
      }
    });
}
let unitControls;
panels.mountUnits();

let auditFilter,
  libraryProperties,
  relatedLibrary,
  inspectedLibraryEntry,
  catalogLoadingStatus,
  discoveryPanel,
  discoveryStatus,
  catalogRetry,
  libraryPreviewJobs,
  corpusReconciliation,
  symmetryEvidence,
  classificationQualification,
  uDualObstructions,
  libraryThumbnails,
  libraryVisual,
  catalogDefaults;
catalogView.mountCatalog();

let cellNetOption, incidenceDualOption, faceOption, reciprocal, stellationOption;
panels.mountDerivedChoices();

function reportMessage(id, text) {
  if (id === 'evidence') clearPrecisionValidation(document);
  const message = el('p', text, 'muted');
  message.setAttribute('role', 'status');
  $(id).replaceChildren(message);
}
function rememberValidationDetails() {
  validationDetailsOpen = $('validation-details')?.open ?? validationDetailsOpen;
}
function reportCurrent(ticket, channel, id) {
  if (reports.current(ticket, channel)) return true;
  if (reports.owns(ticket, channel)) reportMessage(id, 'The source changed. Check the current model again.');
  return false;
}
async function refreshAnalysis() {
  analysisOverview.sync();
  polychoronRelationships?.sync();
  informationPanel?.invalidate();
  if (informationPanel?.panel.open && !informationPanel.busy) guard(() => informationPanel.refresh())();
  relatedLibrary.sync();
  const ticket = reports.begin(['analysis', 'validation']),
    m = ticket.model;
  analysisDetailsOpen = $('analysis-details')?.open ?? analysisDetailsOpen;
  rememberValidationDetails();
  reportMessage('analysis', 'Analyzing current model…');
  reportMessage('evidence', 'Checking current model…');
  const cancelPaint = () => ticket.controller.abort();
  $('cancel').addEventListener('click', cancelPaint, { once: true });
  await afterModelPaint();
  $('cancel').removeEventListener('click', cancelPaint);
  if (!reports.current(ticket, 'analysis')) return;
  if (ticket.signal.aborted) {
    reportMessage('analysis', 'Analysis canceled. Select the model again to retry.');
    if (reports.owns(ticket, 'validation'))
      reportMessage('evidence', 'Check canceled. Select the model again to retry.');
    return;
  }
  startupMark('analysis-started');
  try {
    const [a, deviation] = await Promise.all([
      run('analyze', {}, m, 'Analyze incidence', { signal: ticket.signal }),
      [3, 4].includes(m.dimension) && m.interpretation === 'convex-polytope' && m.vertices.length <= 64
        ? run('geometry-fit-deviation', {}, m, 'Measure face deviations', { signal: ticket.signal }).catch(() => null)
        : null,
    ]);
    const analysisCurrent = reportCurrent(ticket, 'analysis', 'analysis'),
      validationCurrent = reportCurrent(ticket, 'validation', 'evidence');
    if (!analysisCurrent) return;
    $('analysis').replaceChildren();
    stat($('analysis'), 'Interpretation', m.interpretation);
    stat($('analysis'), 'Symbol', m.metadata?.symbol || '—');
    stat($('analysis'), 'Edge length range', format(a.edgeLength.min) + ' – ' + format(a.edgeLength.max));
    stat($('analysis'), 'Vertex radii about mean', format(a.vertexRadius.min) + ' – ' + format(a.vertexRadius.max));
    if (m.metadata?.enantiomorph) stat($('analysis'), 'Enantiomorph (coordinate convention)', m.metadata.enantiomorph);
    if (m.metadata?.topologicalGenus !== undefined) stat($('analysis'), 'Surface genus', m.metadata.topologicalGenus);
    if (
      m.metadata?.faceSurgery?.resultFingerprint === m.fingerprint &&
      m.metadata?.faceSurgery?.measureEvidence?.enclosedVolume !== undefined
    )
      stat(
        $('analysis'),
        'Enclosed boundary volume (approx.)',
        format(m.metadata.faceSurgery.measureEvidence.enclosedVolume)
      );
    if (m.metadata?.watermanFcc || m.metadata?.watermanBall) {
      const evidence = m.metadata.watermanFcc ?? m.metadata.watermanBall,
        lattice = m.metadata.watermanFcc ? 'FCC' : (evidence.lattice ?? 'Waterman'),
        current = evidence.sourceModelId === m.id && evidence.sourceFingerprint === m.fingerprint;
      stat($('analysis'), lattice + ' input sites', format(evidence.selectedPointCount));
      stat(
        $('analysis'),
        lattice + ' ball membership',
        current && evidence.selectionCertificate?.certified === true
          ? 'Exact rational selection'
          : 'Historical source only'
      );
      stat($('analysis'), 'Nonextreme input sites', format(evidence.nonextremeSelectedPointIds?.length));
    }
    if (m.components?.length) stat($('analysis'), 'Components', m.components.length);
    if (m.metadata?.uniformCompound?.sourceFingerprint === m.fingerprint) {
      const e = m.metadata;
      stat($('analysis'), 'Uniform compound', 'UC' + e.ucNumber + ' · ' + e.componentPolyhedron);
      stat($('analysis'), 'Compound symmetry', e.symmetryGroup + ' · ' + e.chirality);
      if (e.uniformCompound.parameters.angleDegrees !== undefined)
        stat($('analysis'), 'Compound angle θ', e.uniformCompound.parameters.angleDegrees + '°');
    }
    if (m.metadata?.addDual) {
      const e = m.metadata.addDual;
      stat($('analysis'), 'Dual sizing', e.definition);
      if (e.crossingResidual !== undefined)
        stat($('analysis'), 'Dual contact residual (source units)', format(e.crossingResidual));
    }
    if (m.metadata?.dualOf) stat($('analysis'), 'Reference primal', m.metadata.dualOf);
    if (m.metadata?.coxeterFamily && m.metadata?.rings)
      stat($('analysis'), 'Coxeter construction', m.metadata.coxeterFamily + ' ' + m.metadata.rings.join(''));
    if (m.metadata?.linkedRelativePath) stat($('analysis'), 'Source catalog file', m.metadata.linkedRelativePath);
    const source = libraryProvenance(m.metadata ?? {});
    if (source) stat($('analysis'), 'Source provenance', source);
    stat(
      $('analysis'),
      m.interpretation === 'convex-polytope' || m.metadata?.fillSemantics === 'ordinary-convex-faces'
        ? 'Face areas, min / max'
        : 'Algebraic cycle areas',
      format(a.faceArea.min) + ' / ' + format(a.faceArea.max)
    );
    if (a.measure) {
      stat(
        $('analysis'),
        m.dimension === 3 ? 'Volume' : `${m.dimension}D content`,
        format(a.measure.content) + ` u${['', '', '²', '³', '⁴'][m.dimension]}`
      );
      stat($('analysis'), `${m.dimension - 1}D boundary measure`, format(a.measure.boundaryMeasure));
    }
    if (a.dihedral)
      stat($('analysis'), 'Convex interior dihedrals', format(a.dihedral.min) + ' – ' + format(a.dihedral.max) + '°');
    stat(
      $('analysis'),
      'Face side counts',
      Object.entries(a.faceTypes)
        .map(([n, c]) => `${c} × ${n}`)
        .join(', ')
    );
    stat($('analysis'), 'Euler V − E + F − C', a.validation.eulerCharacteristic);
    simplifyAnalysis(document, { open: analysisDetailsOpen });
    if (validationCurrent) renderValidation(document, m, a.validation, { open: validationDetailsOpen });
    const deviationText = nearMissText(deviation);
    if (deviationText) {
      const row = document.createElement('p');
      row.id = 'near-miss-deviation';
      row.textContent = deviationText;
      $('analysis').append(row);
    }
    appendNearMissReport(document, $('analysis'), m);
    startupMark('analysis-done');
  } catch (e) {
    if (reportCurrent(ticket, 'analysis', 'analysis')) {
      reportMessage(
        'analysis',
        e.name === 'AbortError'
          ? 'Analysis canceled. Select the model again to retry.'
          : 'Analysis could not finish. Select the model again to retry.'
      );
      error(e);
    }
    if (reportCurrent(ticket, 'validation', 'evidence'))
      reportMessage('evidence', 'Check the current model with Validate incidence.');
  }
}
async function refreshDerived({ throwOnError = false, isCurrent, signal, preserveLayout = false, exportOwner } = {}) {
  const m = model(),
    v = state()?.view;
  if (!m) return;
  const source = state(),
    inputKey = derivedInputKey(v),
    current = () =>
      state() === source &&
      source.model === m &&
      source.view === v &&
      derivedInputKey(v) === inputKey &&
      !signal?.aborted &&
      isCurrent?.() !== false;
  if (!current()) throw new Error('Derived presentation cancelled.');
  const work = derivedWork.begin(signal);
  signal = work.signal;
  const deriveRun = (op, params, source, label) => run(op, params, source, label, { signal });
  if (!preserveLayout && ['net', 'cell-net', 'stellation'].includes(v.derivedMode) && v.viewportLayout !== 'split')
    v.viewportLayout = 'split';
  viewportControls?.sync();
  densitySectionControls.sync();
  densitySectionControls.show(null);
  const sequence = ++derivedSequence;
  derivedModel = null;
  derivedResult = null;
  net = null;
  $('promote').disabled = true;
  $('net-preview').hidden = true;
  $('derived-canvas').hidden = false;
  $('derived-status').textContent = 'Computing ' + v.derivedMode + '…';
  const mode = v.derivedMode;
  try {
    derivedAvailabilityChanged({ pending: true });
    syncCancelAvailability();
    let result;
    if (mode === 'section-evidence') {
      if (m.interpretation !== 'surface-section')
        throw new Error('Section evidence is available on promoted surface intersections.');
      derived.clear();
      $('derived-canvas').hidden = true;
      $('net-preview').hidden = false;
      const embedding = m.metadata?.sectionEmbedding;
      $('net-preview').replaceChildren(
        el(
          'p',
          'These curves intersect the ordered source faces. They preserve disconnected boundaries without assigning a solid interior.'
        ),
        el('p', `${m.vertices.length} vertices · ${m.edges.length} segments · ${m.faces.length} coplanar faces`),
        el(
          'p',
          embedding
            ? `Source plane: ${embedding.normal.map(format).join(', ')} · depth ${format(embedding.offset)}`
            : 'Source plane unavailable'
        ),
        el(
          'p',
          `Face fill: ${m.metadata?.fillRule || 'nonzero'}. Source vertex and edge references are retained in the saved geometry.`
        )
      );
      $('derived-status').textContent = 'Source surface intersection evidence';
      return { status: 'surface-intersection', model: m };
    }
    if (mode === 'section')
      result = v.densitySection?.enabled
        ? await densitySections.evaluate({ signal, isCurrent: current, exportOwner })
        : await deriveRun('section', densitySectionParameters(v), m, 'Evaluate section');
    else if (mode === 'cell-section')
      result = await ordinaryCellSections.evaluate(
        { normal: v.sectionNormal, offset: v.sectionOffset, fill_rule: v.fillRule || 'nonzero' },
        { signal, isCurrent: current, exportOwner }
      );
    else if (mode === 'dual') result = { model: await deriveRun('dual', {}, m, 'Evaluate dual') };
    else if (mode === 'incidence-dual')
      result = { model: await deriveRun('incidence-dual', {}, m, 'Evaluate incidence dual') };
    else if (mode === 'vertex-figure')
      result = await deriveRun(
        'vertex-figure',
        {
          vertex: derivedEntityIndex(String(v.entity ?? 0), m.vertices.length),
          mode: v.vertexFigureMode || 'slicing',
          placement: v.vertexFigurePlacement || 'midpoint',
        },
        m,
        'Evaluate vertex figure'
      );
    else if (mode === 'cell')
      result = {
        model: await deriveRun(
          'cell',
          {
            kind: m.dimension === 4 ? 'cell' : 'face',
            index: derivedEntityIndex(String(v.entity ?? 0), m.dimension === 4 ? m.cells.length : m.faces.length),
          },
          m,
          'Extract entity'
        ),
      };
    else if (mode === 'face')
      result = {
        model: await deriveRun(
          'cell',
          { kind: 'face', index: derivedEntityIndex(String(v.entity ?? 0), m.faces.length) },
          m,
          'Extract ordered source face'
        ),
      };
    else if (mode === 'net') result = await netEditor.evaluate(m, state(), { signal, isCurrent: current });
    else if (mode === 'cell-net') result = await cellNetEditor.evaluate(m, state(), { signal, isCurrent: current });
    else if (mode === 'stellation') result = await stellation.evaluate(m, state(), { signal, isCurrent: current });
    if (sequence !== derivedSequence || result?.stale || !current()) {
      if (throwOnError) throw new Error('Section source changed while evaluating the animation frame.');
      return;
    }
    if (mode === 'stellation' && result.diagram) {
      derivedModel = result.model;
      derived.clear();
      $('derived-canvas').hidden = true;
      $('net-preview').hidden = false;
      $('net-preview').replaceChildren(result.diagram);
      $('promote').disabled = !derivedModel;
      $('derived-status').textContent = result.status;
    } else if (mode === 'net') {
      net = result;
      await netEditor.show(net);
      if (sequence !== derivedSequence || !current()) {
        if (throwOnError) throw new Error('Derived source changed while preparing the presentation.');
        return;
      }
    } else if (mode === 'cell-net') {
      $('net-preview').hidden = true;
      $('derived-canvas').hidden = false;
      cellNetEditor.show(result);
    } else {
      const preparedModel = result.model;
      if (mode === 'section' || mode === 'cell-section')
        derived.setSectionModel(preparedModel, m, { mode, deferDisplay: true });
      else derived.setModel(preparedModel, { deferDisplay: true });
      rememberSectionSource(derived, result, m);
      derived.restoreCamera(v.derivedCamera);
      if (preparedModel)
        derived.setDisplay({
          angles: Array(6).fill(0),
          projection: 'orthographic',
          cameraProjection: v.cameraProjection,
          faces: true,
          vertices: v.vertices,
          edges: v.edges,
          fillRule: v.fillRule || 'nonzero',
          surfaceOpacity: v.surfaceOpacity,
          surfaceColors: v.surfaceColors,
          appearance: v.appearance,
          materialEffects: v.materialEffects,
        });
      if (preparedModel?.metadata?.densitySection)
        derived.setDisplay({ ...derived.view, ...densitySectionDisplay(preparedModel) });
      if (mode === 'cell-section' && (preparedModel || hasEmptySectionSource(derived)))
        await elementContent.refresh(derived, { signal, isCurrent: current });
      if (sequence !== derivedSequence || !current()) {
        if (throwOnError) throw new Error('Derived source changed while preparing the presentation.');
        return;
      }
      // Publish the geometry/result pair only after every presentation await
      // has completed for this request. Failed/stale content owns no actions.
      derivedResult = result;
      derivedModel = preparedModel;
      derived.onLinkedSelection?.();
      $('promote').disabled = !derivedModel;
      $('derived-status').textContent =
        mode === 'stellation'
          ? result.status
          : derivedModel
            ? `${derivedModel.vertices.length} vertices · ${derivedModel.edges.length} edges · ${derivedModel.faces.length} faces · intrinsic ${derivedModel.dimension}D`
            : result.status === 'empty'
              ? 'Empty intersection'
              : `Tangent / degenerate intersection · affine dimension ${result.affineDimension}`;
    }
    if (result?.model?.interpretation === 'surface-section')
      $('derived-status').textContent =
        `Surface intersection · ${result.model.vertices.length} vertices · ${result.model.edges.length} segments · ${v.fillRule || 'nonzero'} face fill`;
    densitySectionControls.show(result);
    return result;
  } catch (e) {
    if (sequence === derivedSequence && current()) {
      derivedModel = null;
      derivedResult = null;
      net = null;
      derived.clear();
      densitySectionControls.showFailure(e);
      $('derived-status').textContent = e.message;
    }
    if (throwOnError) throw e;
  } finally {
    derivedWork.finish(work);
    if (sequence === derivedSequence) {
      derivedControls?.sync();
      densitySectionControls.sync();
      derivedAvailabilityChanged();
    }
    syncCancelAvailability();
  }
}
function selectEntity(persist = true, { display = true } = {}) {
  if (persist && !viewportControls.canEdit()) {
    viewportControls.restoreSelectionInputs();
    return;
  }
  const m = model(),
    kind = $('selection-kind').value,
    field = { vertex: 'vertices', edge: 'edges', face: 'faces', cell: 'cells' }[kind],
    index = safeIndex($('selection-id').value, m[field].length);
  let ids;
  if (kind === 'vertex') ids = [index];
  else if (kind === 'cell') ids = [...new Set(m.cells[index].flatMap((f) => m.faces[f]))];
  else ids = m[field][index];
  base.selectEntities(kind, [index]);
  if (display) displayBase();
  $('selection-info').textContent = JSON.stringify(
    {
      kind,
      index,
      vertices: ids,
      ...(kind === 'vertex' ? { coordinates: m.vertices[index] } : {}),
      ...(kind === 'cell' ? { faces: m.cells[index] } : {}),
    },
    null,
    2
  );
  selectionSummary().textContent = describeSelection(m, kind, index, ids, state().view.coordinateUnit);
  if (persist) {
    state().view.entitySelection = { kind, index };
    markDirty();
  }
  syncDerivedSelection();
}
function selectEntityType(kind, indices, typeLabel, { persist = true, display = true } = {}) {
  if (persist && !viewportControls.canEdit()) {
    viewportControls.restoreSelectionInputs();
    return;
  }
  const m = model(),
    field = { vertex: 'vertices', edge: 'edges', face: 'faces', cell: 'cells' }[kind];
  if (
    !field ||
    !Array.isArray(indices) ||
    !indices.length ||
    indices.some((i) => !Number.isInteger(i) || i < 0 || i >= m[field].length)
  )
    throw Error('Choose existing source elements.');
  const ids = [...new Set(indices)],
    vertices = [
      ...new Set(
        ids.flatMap((i) =>
          kind === 'vertex' ? [i] : kind === 'cell' ? m.cells[i].flatMap((f) => m.faces[f]) : m[field][i]
        )
      ),
    ];
  $('selection-kind').value = kind;
  $('selection-id').value = ids[0];
  base.select(vertices);
  base.selectEntitySet(kind, ids);
  if (display) displayBase();
  selectionSummary().textContent = `${typeLabel || kind + ' type'} · ${ids.length} selected ${field}`;
  $('selection-info').textContent = JSON.stringify({ kind, ids, vertices }, null, 2);
  if (persist) {
    state().view.entitySelection = {
      kind,
      index: ids[0],
      ids,
      typeLabel: String(typeLabel || kind + ' type').slice(0, 256),
    };
    markDirty();
  }
  syncDerivedSelection();
}
function syncDerivedSelection() {
  if (!derived.model) return;
  const pickKind = state().view.pickKind || 'vertex';
  if (derived.view?.pickKind !== pickKind) derived.setDisplay({ ...derived.view, pickKind });
  const mapped = linkedSelection(
    derivedLinks(model(), derivedResult, state().view.derivedMode, state().view.entity),
    state().view.entitySelection
  );
  derived.selectEntities(mapped?.kind ?? 'vertex', mapped?.indices ?? []);
}
function selectionSummary() {
  let node = $('selection-summary');
  if (node) return node;
  node = el('p', undefined, 'selection-summary');
  node.id = 'selection-summary';
  node.setAttribute('aria-live', 'polite');
  ($('selection-details') ?? $('selection-info')).before(node);
  return node;
}
// Plain-language readout of the picked entity; full evidence stays in the details.
function describeSelection(m, kind, index, ids, unit) {
  const u = !unit || unit === 'model' ? 'u' : unit,
    p = (i) => m.vertices[i],
    dist = (a, b) => Math.hypot(...p(a).map((x, k) => x - p(b)[k]));
  if (kind === 'vertex') return `Vertex ${index} · (${p(index).map(format).join(', ')})`;
  if (kind === 'edge')
    return `Edge ${index} · length ${format(dist(ids[0], ids[1]))} ${u} · vertices ${ids[0]}–${ids[1]}`;
  if (kind === 'face') {
    const n = ids.length,
      perimeter = ids.reduce((sum, v, i) => sum + dist(v, ids[(i + 1) % n]), 0),
      d = p(ids[0]).length;
    // Planar polygon area in any dimension: norm of the summed bivector of consecutive vertices.
    const c = Array(d).fill(0);
    ids.forEach((v) =>
      p(v).forEach((x, k) => {
        c[k] += x / n;
      })
    );
    const B = new Map();
    ids.forEach((v, i) => {
      const a = p(v).map((x, k) => x - c[k]),
        b = p(ids[(i + 1) % n]).map((x, k) => x - c[k]);
      for (let j = 0; j < d; j++)
        for (let k = j + 1; k < d; k++) B.set(j * d + k, (B.get(j * d + k) ?? 0) + a[j] * b[k] - a[k] * b[j]);
    });
    const area = Math.sqrt([...B.values()].reduce((sum, x) => sum + x * x, 0)) / 2,
      convex = m.interpretation === 'convex-polytope' || m.metadata?.fillSemantics === 'ordinary-convex-faces';
    return (
      `Face ${index} · ${n}-gon · perimeter ${format(perimeter)} ${u}` + (convex ? ` · area ${format(area)} ${u}²` : '')
    );
  }
  return `Cell ${index} · ${m.cells[index].length} faces · ${ids.length} vertices`;
}

async function restoreMemoryState(snapshot, label, { signal, verifyPublication, onPublication } = {}) {
  if (animation.exporting || tourExporting)
    throw new Error('Finish or cancel animation export before opening a model memory.');
  const sourceProject = project,
    sourceState = state();
  if (project.documents.length >= 100) throw new Error('The project already contains the maximum of 100 documents.');
  const detached = clone(snapshot);
  if (detached.operationNode) {
    detached.sourceOperationNode = detached.operationNode;
    delete detached.operationNode;
  }
  const result = await run(
    'validate-project',
    {
      project: { format: 'polytope-laboratory', version: 1, active: 0, documents: [{ cursor: 0, states: [detached] }] },
    },
    null,
    'Validate model memory',
    { signal }
  );
  if (signal?.aborted) throw Object.assign(Error('Model memory opening canceled.'), { name: 'AbortError' });
  if (animation.exporting || tourExporting)
    throw new Error('Finish or cancel animation export before opening a model memory.');
  if (project !== sourceProject || state() !== sourceState)
    throw new Error('Source document changed while the model memory was validated.');
  if (project.documents.length >= 100) throw new Error('The project already contains the maximum of 100 documents.');
  verifyPublication?.();
  const restored = result.documents[0].states[0];
  restored.label = label;
  restored.view = { ...legacyDocumentView(restored.model.dimension), ...restored.view };
  project.documents.push({ id: uid(), cursor: 0, states: [restored] });
  project.active = project.documents.length - 1;
  onPublication?.();
  markDirty();
  renderWorkspace();
  return restored;
}
async function showTourEvent(snapshot, label, controls = {}) {
  if (animation.exporting || tourExporting) throw new Error('Finish animation export before opening a tour event.');
  if (controls.signal?.aborted || controls.isCurrent?.() === false)
    throw Object.assign(Error('Tour event opening canceled.'), { name: 'AbortError' });
  const sourceProject = project,
    sourceState = state(),
    detached = clone(snapshot);
  if (detached.operationNode) {
    detached.sourceOperationNode = detached.operationNode;
    delete detached.operationNode;
  }
  const result = await run(
    'validate-project',
    {
      project: { format: 'polytope-laboratory', version: 1, active: 0, documents: [{ cursor: 0, states: [detached] }] },
    },
    null,
    'Validate tour event',
    { signal: controls.signal }
  );
  if (
    animation.exporting ||
    tourExporting ||
    project !== sourceProject ||
    state() !== sourceState ||
    controls.signal?.aborted ||
    (controls.isCurrent && !controls.isCurrent())
  )
    throw Object.assign(Error('Tour event opening canceled.'), { name: 'AbortError' });
  controls.verifyPublication?.();
  const restored = result.documents[0].states[0];
  restored.label = label;
  restored.view = { ...legacyDocumentView(restored.model.dimension), ...restored.view };
  let index = project.documents.findIndex((d) => d.id === tourPreviewDocument);
  if (index < 0) {
    if (project.documents.length >= 100) throw new Error('Close a document before opening a tour preview.');
    tourPreviewDocument = uid();
    index = project.documents.length;
    project.documents.push({ id: tourPreviewDocument, cursor: 0, states: [restored] });
  } else project.documents[index] = { id: tourPreviewDocument, cursor: 0, states: [restored] };
  project.active = index;
  markDirty();
  renderWorkspace();
  return restored;
}
function createTourRenderer(tour, { loop = false } = {}) {
  const sourceState = state(),
    views = $('views'),
    bounds = views.getBoundingClientRect();
  const width = Math.floor(bounds.width),
    height = Math.floor(bounds.height);
  if (width < 1 || height < 1 || width > 4096 || height > 4096)
    throw Error('Tour preview needs a viewport within 4096 pixels per dimension.');
  const overlay = document.createElement('div');
  overlay.id = 'animated-tour-preview';
  Object.assign(overlay.style, { position: 'absolute', inset: '0', zIndex: '5', background: '#15191f' });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });
  overlay.append(canvas);
  views.append(overlay);
  const host = document.createElement('div');
  document.body.append(host);
  let renderer, observer;
  try {
    renderer = new AnimatedTourRenderer({
      tour,
      loop,
      canvas,
      getOwner: () => ({ project, tour: project.tour, sourceState: state(), document: doc() }),
      createLayer: createAnimatedTourLayerFactory({ host, run }),
      onDiagnostic: setStatus,
    });
    const close = renderer.close.bind(renderer);
    renderer.close = async () => {
      overlay.remove();
      observer?.disconnect();
      try {
        await close();
      } finally {
        host.remove();
      }
    };
    observer = new ResizeObserver(() => {
      const next = views.getBoundingClientRect();
      if (Math.floor(next.width) !== width || Math.floor(next.height) !== height) {
        tours.pause();
        tours.retireRenderer();
        setStatus('Tour preview closed after viewport resize.');
      }
    });
    observer.observe(views);
    return renderer;
  } catch (error) {
    overlay.remove();
    host.remove();
    observer?.disconnect();
    throw error;
  }
}
async function addMemoryStates(current, stored, label, { signal, verifyPublication, ...options } = {}) {
  const originalProject = project,
    originalState = state();
  if (animation.exporting || tourExporting) throw new Error('Finish or cancel animation export before adding models.');
  if (project.documents.length >= 100) throw new Error('The project already contains the maximum of 100 documents.');
  const result = await prepareMemoryAddition(run, current, stored, label, { ...options, signal, verifyPublication });
  if (signal?.aborted) throw Object.assign(Error('Model addition canceled.'), { name: 'AbortError' });
  if (animation.exporting || tourExporting) throw new Error('Finish or cancel animation export before adding models.');
  if (project !== originalProject || state() !== originalState)
    throw new Error('Source document changed while the compound was calculated.');
  if (project.documents.length >= 100) throw new Error('The project already contains the maximum of 100 documents.');
  verifyPublication?.();
  project.documents.push(result);
  project.active = project.documents.length - 1;
  markDirty();
  renderWorkspace();
  return result;
}
async function orientSelection(mode, source, direction, { signal, verifyPublication, sourceSnapshot } = {}) {
  verifyPublication?.();
  viewportControls.stop();
  animation.pause();
  const current = state(),
    cameraSignature = JSON.stringify(current.view.camera),
    anglesSignature = JSON.stringify(current.view.angles);
  let entity;
  if (source === 'measurement') {
    const settings = current.view.measurements,
      kind = settings.aKind,
      ids = rawNumbers(settings.aIds);
    entity = ['line', 'plane', 'hyperplane'].includes(kind) ? { kind, vertices: ids } : { kind, index: ids[0] };
  } else entity = { kind: $('selection-kind').value, index: Number($('selection-id').value) };
  const frame = await run(
    'entity-orientation',
    { entity, mode, ...(direction ? { direction } : {}) },
    sourceSnapshot ?? current.model,
    'Orient selected ' + entity.kind,
    { signal }
  );
  verifyPublication?.();
  if (signal?.aborted) throw Object.assign(new Error('Orientation edit canceled.'), { name: 'AbortError' });
  if (state() !== current) throw new Error('Source document changed while orientation was calculated.');
  const observerMoved = JSON.stringify(current.view.camera) !== cameraSignature;
  current.view.orientationFrame = frame;
  if (JSON.stringify(current.view.angles) === anglesSignature) current.view.angles = Array(6).fill(0);
  syncRotationPose();
  displayBase();
  if (!observerMoved) {
    base.fit();
    current.view.camera = base.cameraState();
  }
  entityOrientation.sync();
  markDirty();
  return frame;
}

let projectSaving;
historyWiring.mountSaving();

exportWiring.mountImageCapture();

const showcase = new ShowcaseControls({
  ...numericContext,
  api,
  run,
  setStatus,
  read: readCatalogEntry,
  libraryEntries: () => [...presentationLibraryEntries],
  viewForModel: (m) => ({
    ...defaults(m.dimension),
    ...featuredView(m.dimension),
    ...Object.fromEntries(
      [
        'appearance',
        'materialEffects',
        'faces',
        'edges',
        'vertices',
        'surfaceOpacity',
        'edgeOpacity',
        'edgeStyle',
        'edgeRadius',
        'vertexStyle',
        'vertexRadius',
      ]
        .filter((key) => state().view[key] !== undefined)
        .map((key) => [key, clone(state().view[key])])
    ),
  }),
  assertAvailable: () => {
    if (running.size || projectOpening.busy || projectSaving.busy || imageCapture?.busy || netEditor.exports.busy)
      throw Error('Finish the active computation or file action before presenting.');
    if (animation.playing || tours.playing || dualMorph?.playing || netEditor.playing)
      throw Error('Pause animation, tour, morph or folding playback before presenting.');
  },
  suspend: () => {
    const source = state(),
      playing = viewportControls.playing,
      startup = viewportControls.startupRotation;
    viewportControls.stop();
    return () => {
      if (state() !== source) return;
      viewportControls.playing = playing;
      viewportControls.startupRotation = startup;
      viewportControls.syncPlaying();
    };
  },
  lock: (value) => {
    tourExporting = value;
    animation.context.onExportStateChange();
  },
});

const actions = {
  presentation: () => showcase.enter(),
  new: () => catalogLoader.open({ key: 'tesseract', name: 'Tesseract' }),
  open,
  save,
  recover,
  undo: () => historyStep(-1),
  redo: () => historyStep(1),
  reset: () => viewportControls.resetView(),
  fullscreen: () => api.fullscreen(),
  image: () => imageCapture.run(),
  help: () => userGuide.show(),
  export: openGeometryExport,
  print: printNet,
};
actions.learn4d = () => learn4D.open();
actions.commands = () => discoverability.show();
actions.shortcuts = () => discoverability.showShortcuts();
actions.welcome = () => welcome.show();
actions.whatsnew = () => {
  welcome?.close();
  userGuide.show('whats-new');
};
for (const id of ['about', 'quit', 'copy', 'paste', 'selectAll', 'zoomIn', 'zoomOut', 'resetZoom'])
  actions[id] = () => api.discoveryMenu(id);
for (const [id, fn] of Object.entries(actions))
  actions[id] = (...args) => {
    if (showcase.busy && id !== 'presentation') return;
    return workspaceAvailability.run(id, () => fn(...args));
  };
for (const id of ['image', 'export', 'print', 'presentation']) {
  const action = actions[id];
  actions[id] = (...args) => {
    coxeterBuilder?.close();
    return action(...args);
  };
}
for (const id of ['save', 'open', 'recover', 'presentation']) {
  const action = actions[id];
  actions[id] = (...args) => {
    learn4D?.close();
    return action(...args);
  };
}
Object.entries(actions).forEach(([id, fn]) => {
  if ($(id)) $(id).onclick = guard(fn);
});
api.onAction((name) => actions[name] && guard(actions[name])());
$('close-help').onclick = () => $('help-dialog').close();
let pdfButton;
exportWiring.wireExport();

catalogView.wireCatalog();

['face-fill-rule', 'surface-colors', 'surface-opacity'].forEach(
  (id) => ($(id).onchange = guard(() => viewportControls.setDisplayOption(id, $(id).value)))
);
$('isolate-cell').onclick = guard(() => viewportControls.setCellVisibility('isolate', $('visible-cell-id').value));
$('hide-cell').onclick = guard(() => viewportControls.setCellVisibility('hide', $('visible-cell-id').value));
$('show-all-cells').onclick = guard(() => viewportControls.setCellVisibility('all'));
let constructGallery, regular4dButton, regular4dResult, intrinsicReports;
panels.mountInspector();

catalogView.wireLinkedLibrary();
actions['Shape builder'] = window.openCoxeterBuilder;
exportWiring.mountExportGoals();

let discoverability, appChrome, timelinePanel, desktopFiles;
panels.mountWorkspacePanels();

let recoverySnapshots;
startup.startRecovery();

startup.start();
