import {defaultDocumentView,legacyDocumentView} from './default-look.mjs';
import './default-look.css';
import {ImageCaptureSession,saveReviewedImage} from './image-capture-session.mjs';
import {startupMark,afterModelPaint} from './startup-performance.mjs';
startupMark('renderer-script-parsed');
let startupModelRendered=false;
import {FaceSurgeryControls} from './face-surgery-controls.mjs';
let faceSurgeryControls=null;
import {DerivedViewControls,DerivedWork,derivedInputKey,derivedEntityIndex} from './derived-view-controls.mjs';
import {pointRadius} from './geometry-bounds.mjs';
import {organizeNetInspector} from './net-inspector-layout.mjs';
import {NetsFlow} from './nets-flow.mjs';
import './nets-flow.css';
import {organizeInspector,simplifyAnalysis,renderValidation} from './inspector-layout.mjs';
import {clearPrecisionValidation,syncPrecisionContext} from './precision-evidence.mjs';
import {mountConstructGallery} from './construct-gallery.mjs';
import './construct-gallery.css';
import {compileCatalogQuery} from './catalog-query.mjs';
import {appendNearMissReport} from './near-miss-report.mjs';
import {LibraryPropertyControls,RelatedLibraryControls} from './library-navigation.mjs';
import {LibraryCollections} from './library-collections.mjs';
import {libraryFamilyLabel,libraryProvenance} from './library-visual.mjs';
import {LibraryThumbnails} from './library-thumbnails.mjs';
import './library-visual.css';
import {PolychoronRelationshipControls} from './polychoron-relationships.mjs';
import {UniformFamilyControls} from './uniform-family-controls.mjs';
import {CoxeterBuilder} from './coxeter-builder.mjs';
import './coxeter-builder.css';
import {Learn4D,createLessonWorkspace,mountLearn4DCard} from './learn-4d.mjs';
import './learn-4d.css';
let learn4D=null;
let coxeterBuilder=null,coxeterPreview=null;
import {SourceReflectionControls} from './source-reflection-controls.mjs';
import {CoincidicRegimentControls} from './coincidic-regiment-controls.mjs';
import {UserGuide} from './user-guide.mjs';
import './style.css';
import {LiveSliders} from './live-sliders.mjs';
import {presentLivePreview} from './live-preview-view.mjs';
import './live-sliders.css';
let liveSliders=null,livePreviewViewer=null,livePreviewHost=null,livePreviewBadge=null;
import './direct-4d.css';
import './canvas-overlays.css';
import { Viewer } from './viewer.js';
import {renderMorphElementContent} from './morph-element-content-renderer.mjs';
import {DualMorphControls} from './dual-morph-controls.mjs';
let dualMorph=null;
import { PLANES } from './projection.js';
import { StellationControls } from './stellation.js';
import {StellationDiagramControls} from './stellation-diagram-controls.mjs';
let stellationCells=null;
import { NetEditor } from './net-editor.js';
import { CellNetEditor } from './cell-net-editor.js';
import { MeasurementControls } from './measurement-controls.js';
import { SymmetryControls } from './symmetry-controls.js';
import {ElementTypeControls} from './element-type-controls.mjs';
import {AnalysisOverview} from './analysis-overview.mjs';
import './analysis-overview.css';
import {SymmetryOrientationControls} from './symmetry-orientation-controls.mjs';
import {derivedLinks,linkedSelection,sourceSelection} from './linked-selection.mjs';
import { AnimationControls } from './animation-controls.mjs';
import { AnimationRenderer } from './animation-renderer.mjs';
import { ViewportControls } from './viewport-controls.mjs';
import { ProjectionFit } from './projection-fit.mjs';
import { stereographicViewSignature } from './viewer-stereographic-worker.mjs';
import { MemoryControls } from './memory-controls.mjs';
import { normalizeMemories } from './model-memories.mjs';
import { EntityOrientationControls } from './entity-orientation-controls.mjs';
import { CellFacingControls } from './cell-facing-controls.mjs';
import { HistoryControls } from './history-controls.mjs';
import { ExportControls } from './export-controls.mjs';
import {ExportGoals} from './export-goals.mjs';
import './export-goals.css';
import {derivedExportGeometry} from './interchange-controls.mjs';
import { PresentationControls } from './presentation-controls.mjs';
import {AppearanceControls} from './appearance-controls.mjs';
import {MaterialEffectsControls} from './material-effects-controls.mjs';
import { TourControls } from './tour-controls.mjs';
import { AnimatedTourRenderer } from './animated-tour-renderer.mjs';
import { createAnimatedTourLayerFactory } from './animated-tour-layer.mjs';
import { normalizeTour } from './tour.mjs';
import { FaceEditingControls } from './face-editing-controls.mjs';
import {AutomaticFacetingControls} from './automatic-faceting-controls.mjs';
import {FacetingDiagramControls} from './faceting-diagram-controls.mjs';
import {ElementContentControls} from './element-content-controls.mjs';
import {ElementLabelPresetsControls} from './element-label-presets-controls.mjs';
let sourceLabelPresets=null;
import {ReinforcementControls,checkedReinforcementSVG} from './reinforcement-controls.mjs';
import {FabricationControls} from './net-fabrication-controls.mjs';
import {CoincidentEdgeControls,checkedAssemblySVG} from './coincident-edge-controls.mjs';
import {GeneralizedDensityControls} from './generalized-density-controls.mjs';
import {InformationPanel} from './information-panel.mjs';
import './information-panel.css';
let informationPanel=null;
import {publishBoundedExport} from './bounded-export.mjs';
let reinforcement=null,coincidentAssembly=null,densityInfo=null;
import {captureContentHistoryPublication} from './element-content-history.mjs';
import { PickingControls } from './picking-controls.mjs';
import { CompoundControls } from './compound-controls.mjs';
import { PerspectiveControls } from './perspective-controls.mjs';
import { SubdivisionControls } from './subdivision-controls.mjs';
import {FaceConwayControls} from './face-conway-controls.mjs';
let faceConwayControls=null;
import { SourceConstructionControls } from './source-construction-controls.mjs';
import {ExpansionControls} from './expansion-controls.mjs';
import {FittingControls} from './fitting-controls.mjs';
import {nearMissText} from './fitting-report.mjs';
import {ExactSectionControls} from './exact-section-controls.mjs';
import {OrdinaryCellSectionWorkflow} from './ordinary-cell-section-workflow.mjs';
import {DensitySectionControls,DensitySectionWorkflow,densitySectionParameters,densitySectionDisplay} from './density-section-controls.mjs';
import {hasSectionSourceContent,rememberSectionSource,hasEmptySectionSource} from './section-source-content.mjs';
import {IncidenceTruncationControls} from './incidence-truncation-controls.mjs';
import {SphereProjectionControls} from './sphere-projection-controls.mjs';
import {ProjectiveDualControls} from './projective-dual-controls.mjs';
let sphereProjectionControls=null,projectiveDualControls=null;
import { SourceZonohedronControls } from './source-zonohedron-controls.mjs';
import {VertexFigureConstructionControls} from './vertex-figure-construction-controls.mjs';
import {MultiViewControls} from './multi-view-controls.mjs';
import {HoverIdentification} from './hover-identification.mjs';
import {entityVertices} from './selection-highlight.mjs';
import {startupView} from './startup-view.mjs';
let multipleViews=null;
let vertexFigureConstruction=null;
import { FacePlacementControls } from './face-placement-controls.mjs';
import { CupolaControls } from './cupola-controls.mjs';
import { StarPolygonControls } from './star-polygon-controls.mjs';
import { ProductControls } from './product-controls.mjs';
import { AntiprismControls } from './antiprism-controls.mjs';
import { StepPrismControls } from './step-prism-controls.mjs';
import {NobleControls} from './noble-controls.mjs';
import {BasicSolidControls} from './basic-solid-controls.mjs';
let basicSolidControls=null;
import {StephanoidControls} from './stephanoid-controls.mjs';
let stephanoidControls=null;
import {ProjectMetadataControls} from './project-metadata-controls.mjs';
import { TorusControls } from './torus-controls.mjs';
import { PodiaControls } from './podia-controls.mjs';
import { WatermanControls } from './waterman-controls.mjs';
import { SegmentotopeControls } from './segmentotope-controls.mjs';
import { SegmentotopeAnalysisControls } from './segmentotope-analysis-controls.mjs';
import { CrossedSegmentotopeControls } from './crossed-segmentotope-controls.mjs';
import { AugmentationControls } from './augmentation-controls.mjs';
import { generateConstruction,certifyCurrent } from './construction-workflow.mjs';
import { WorkspaceNumericControls } from './workspace-numeric-controls.mjs';
import {verifyNativeSource} from './native-source-binding.mjs';
import {SpringControls} from './spring-controls.mjs';
import { prepareHistoryCommit, prepareHistoryOpen, verifyHistoryPublication, preserveHistoryObserver } from './history-workflow.mjs';
import { createStatus } from './status.mjs';
import {FriendlyMessages} from './friendly-messages.mjs';
import './friendly-messages.css';
import { ProjectOpening,RecoverySnapshots,ProjectSaving } from './project-workflow.mjs';
import {CatalogLoading} from './catalog-loading.mjs';
import {NativeJobs} from './native-jobs.mjs';
import {ModelReports} from './model-reports.mjs';
import {CatalogDiscovery} from './catalog-discovery.mjs';
import {WorkspaceAvailability} from './workspace-availability.mjs';
import {IntrinsicReportControls} from './intrinsic-report-controls.mjs';
import {DiscoverabilityControls} from './discoverability-controls.mjs';
import './discoverability.css';
import {WelcomeControls} from './welcome-controls.mjs';
import {DesktopFiles,reviewProjectOpen} from './desktop-files.mjs';
import {WELCOME_SAMPLES} from './welcome-samples.mjs';
import {featuredView} from './welcome-state.mjs';
import {ShowcaseControls} from './showcase-controls.mjs';
import {AppChrome} from './app-chrome.mjs';
import './app-chrome.css';
import {AppearanceSheet} from './appearance-sheet.mjs';
import './appearance-sheet.css';
let appearanceSheet=null;
let welcome=null;

const $=id=>document.getElementById(id),api=window.polytope;
const userGuide=new UserGuide($('help-dialog'));
const friendlyMessages=new FriendlyMessages(document);
const status=createStatus(text=>friendlyMessages.publish(text));
const clone=x=>structuredClone(x),uid=()=>crypto.randomUUID();
const defaults=d=>defaultDocumentView(d);
let project={format:'polytope-laboratory',version:1,active:0,documents:[]};
let catalog=[],external=[],linkedLibraries=[],filter='all',derivedModel=null,derivedResult=null,net=null,derivedSequence=0;
let presentationLibraryEntries=[];
let tourPreviewDocument=null,tourExporting=false;
let dirty=false,revision=0,lastFrame=performance.now(),toastTimer=null,viewportControls,derivedControls,projectionFit,segmentotopeControls,segmentotopeAnalysis,augmentationControls,geodesicControls,convexCoreControls,expansionControls,fittingControls,exactSectionControls,incidenceTruncationControls,facePlacementControls,sourceZonohedronControls,springControls;
const nativeJobs=new NativeJobs({id:uid,now:()=>performance.now(),start:label=>status.defer(friendlyMessages.job(label)),format:(label,options)=>friendlyMessages.job(label,options),complete:(owner,text,job)=>{if(!status.settle(owner)||!status.complete(owner,text))return false;friendlyMessages.completed(job);return true;},settle:owner=>status.settle(owner),cancel:id=>api.cancel(id),change:()=>{syncCancelAvailability();friendlyMessages.syncJobs(nativeJobs.pending);}});
const running=nativeJobs.pending;
let initialModelAllowed=true;
let catalogLoader,catalogDiscovery;
const doc=()=>project.documents[project.active],state=()=>doc()?.states[doc().cursor],model=()=>state()?.model;
const reports=new ModelReports({getProject:()=>project,getDocument:doc,getState:state});
const derivedWork=new DerivedWork();
const projectOpening=new ProjectOpening();
let imageCapture=null;
const workspaceAvailability=new WorkspaceAvailability({getState:state,getDocument:doc,getGroups:()=>document.querySelectorAll('[data-needs-model]'),getHint:()=>$('empty-workspace-message'),publish:value=>api?.setWorkspaceAvailability?.(value)?.catch(()=>{}),notify:setStatus});
let analysisDetailsOpen=false,validationDetailsOpen=false;
let polychoronRelationships=null;
const base=new Viewer($('base-canvas'),(index,count,kind='vertex')=>{ $('selection-kind').value=kind;$('selection-id').value=index;selectEntity();if(count>1)setStatus(`${count} source ${kind} candidates near this point. Click again to cycle them.`); });
const derived=new Viewer($('derived-canvas'),(index,count,kind='vertex')=>{const linked=sourceSelection(derivedLinks(model(),derivedResult,state().view.derivedMode,state().view.entity),kind,index);if(linked)selectEntityType(linked.kind,linked.ids,'Linked '+linked.kind);});
derived.onLinkedSelection=syncDerivedSelection;
base.onPickDiagnostic=message=>{if(message)setStatus(message);};
base.onCaptureDiagnostic=setStatus;
base.onDisplay=diagnostic=>{displayDiagnostic(diagnostic);projectionFit?.notify();};
base.onCamera=value=>{if(animation.exporting||tourExporting)return;projectionFit?.cancel();if(state()){state().view.camera=value;if(viewportControls)viewportControls.orientation.value='free';markViewDirty();}};
derived.onCamera=value=>{if(animation.exporting||tourExporting)return;if(state()){state().view.derivedCamera=value;markViewDirty();}};

function markDirty(){faceConwayControls?.sync();netEditor?.updateActions();cellNetEditor?.updateActions();sourceReflectionControls?.sync();coincidicRegimentControls?.sync();basicSolidControls?.sync();dualMorph?.sync();tours?.invalidatePreview();dirty=true;revision++;projectOpening.sync();imageCapture?.sync();api.setDirty(true).catch(()=>{});segmentotopeControls?.sync();segmentotopeAnalysis?.sync();augmentationControls?.sync();geodesicControls?.sync();convexCoreControls?.sync();expansionControls?.sync();fittingControls?.sync();exactSectionControls?.sync();incidenceTruncationControls?.sync();sphereProjectionControls?.sync();projectiveDualControls?.sync();facePlacementControls?.sync();sourceZonohedronControls?.sync();vertexFigureConstruction?.sync();multipleViews?.sync();springControls?.sync();automaticFaceting?.sync();facetingDiagram?.sync();elementContent?.sync();sourceLabelPresets?.sync();stellationCells?.sync();reinforcement?.sync();coincidentAssembly?.sync();densityInfo?.sync();}
function setStatus(text){return status.set(text);}
// Playback changes saved view values too. Count them without synchronizing
// every construction panel or sending a dirty IPC message on each frame.
function markPlaybackDirty(){revision++;projectOpening.sync();imageCapture?.sync();if(!dirty){dirty=true;api.setDirty(true).catch(()=>{});renderTabs();}}
function markViewDirty(){markPlaybackDirty();tours?.invalidatePreview();}
function editNotes(){
  const source=state();if(!source)return;
  if(animation.exporting||tourExporting){$('notes').value=source.notes||'';return;}
  const notes=$('notes').value;if(notes===(source.notes??''))return;
  source.notes=notes;markViewDirty();
  // Morph sources include notes; retire an obsolete prepared source without
  // scanning every unrelated construction panel for each text input event.
  dualMorph?.sync();
  liveSliders?.sync();
}
function error(e){if(e?.name==='AbortError')return;setStatus(friendlyMessages.error(e));}
function guard(fn){return async(...args)=>{try{return await fn(...args);}catch(e){error(e);}};}
// Numeric commits disable their panel while an expression is checked. When Tab or a
// click was moving focus into a field of that panel, the move is lost; restore it
// as soon as the target is enabled again, unless the user has focused elsewhere.
let focusIntent=null;
document.addEventListener('focusout',event=>{focusIntent=event.relatedTarget instanceof HTMLElement?{node:event.relatedTarget,at:performance.now()}:null;},true);
document.addEventListener('focusin',event=>{if(focusIntent&&event.target!==focusIntent.node)focusIntent=null;},true);
new MutationObserver(()=>{
  const intent=focusIntent;if(!intent)return;
  if(intent.node.isConnected&&!intent.node.disabled&&document.activeElement===document.body&&performance.now()-intent.at<10000){focusIntent=null;intent.node.focus();}
  else if(performance.now()-intent.at>=10000)focusIntent=null;
}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['disabled']});
async function run(op,params={},source=null,label=op,{signal}={}){
  return nativeJobs.run(id=>api.engine({op,params,model:source},id),label,{signal});
}
async function number(expression,options={}){const result=await run('expression',{expression},null,'Evaluate expression',options);return result.value;}
async function evaluateMany(expressions,{mode='real',signal}={}){const result=await run('expression-batch',{expressions:[...expressions],mode},null,'Evaluate numeric inputs',{signal});return result.values;}
const evaluateBatch=(expressions,options={})=>evaluateMany(expressions,{...options,mode:'real'});
const evaluateRationalBatch=(expressions,options={})=>evaluateMany(expressions,{...options,mode:'rational'});
const numericContext={getState:state,getDocument:doc,getProject:()=>project,isExporting:()=>(animation.exporting||tourExporting),guard,number,evaluateMany,evaluateBatch,evaluateRationalBatch};
const rawNumbers=text=>text.trim().split(/[\s,;]+/).filter(Boolean).map(s=>{const n=Number(s);if(!Number.isFinite(n))throw new Error('Use finite numeric coordinates separated by commas.');return n;});
function safeIndex(value,count){const n=Number(value);if(!Number.isInteger(n)||n<0||n>=count)throw new Error(`Choose an integer index in 0–${Math.max(0,count-1)}.`);return n;}
function format(x){if(x===null||x===undefined)return 'unavailable';return typeof x==='number'?Number(x.toPrecision(8)).toLocaleString('en-US',{maximumSignificantDigits:8}):String(x);}
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function stat(container,label,value){const row=el('div',undefined,'stat-row');row.append(el('span',label),el('b',value));container.append(row);}
const stellation=new StellationControls({...numericContext,commit:commitOperation,getDocument:doc,getProject:()=>project,isExporting:()=>Boolean(stellationCells?.context.isExporting?.()),getState:state,getModel:model,toggleDiagram:async id=>{if(!stellationCells?.receipt)await stellationCells.evaluate();stellationCells.apply('toggle',id);},run,number,rawNumbers,guard,markDirty,refresh:refreshDerived,api,setStatus});
// A deliberate net edit ends the introductory startup spin (docs/VIEWER_UX.md); user playback still blocks edits.
const netEditBusy=()=>{if(viewportControls?.startupRotation)viewportControls.stop();return animation.playing||viewportControls?.playing||tours?.playing;};
const netEditor=new NetEditor({getState:state,getModel:model,getProject:()=>project,getDocument:doc,commit:commitOperation,number,isExporting:()=>(animation.exporting||tourExporting),isBusy:netEditBusy,run,guard,markDirty,refresh:refreshDerived,viewer:derived,assemblyViewer:base,api,setStatus,onExportActivity:syncCancelAvailability,renderElementContent:options=>elementContent.refresh(derived,options)});
const cellNetEditor=new CellNetEditor({getState:state,getModel:model,getProject:()=>project,getDocument:doc,number,isExporting:()=>(animation.exporting||tourExporting),isBusy:netEditBusy,run,guard,markDirty,refresh:refreshDerived,viewer:derived,onSourceSelection:(kind,index,dirty)=>{$('selection-kind').value=kind;$('selection-id').value=index;selectEntity(dirty);}});
const measurementControls=new MeasurementControls({...numericContext,getState:state,getModel:model,run,guard,markDirty,refresh:refreshDerived,number,rawNumbers,format});
const symmetryControls=new SymmetryControls({...numericContext,getState:state,run,guard,markDirty,viewer:base,format});
const analysisOverview=new AnalysisOverview({document,getState:state,getDocument:doc,getEntries:()=>catalog});
const elementTypes=new ElementTypeControls({beforeAnalysis:afterModelPaint,getState:state,run,guard,markDirty,viewer:base,display:displayBase,isExporting:()=>(animation.exporting||tourExporting),select:selectEntityType,onTypes:(model,result)=>analysisOverview.sync(model,result),getEvidencePanel:()=>$('analysis-type-evidence')});
const animationRenderer=new AnimationRenderer({getState:state,viewer:base,netViewer:derived,run,onMorphPose:(frame,prepared)=>dualMorph?.adoptAnimationPose(frame,prepared),display:()=>{displayBase();viewportControls?.sync();},syncPose:view=>{syncRotationPose();$('section-depth').value=view.sectionOffset;$('section-offset').value=view.sectionOffset;$('derived-mode').value=view.derivedMode;},refreshDerived:options=>refreshDerived({throwOnError:true,preserveLayout:true,...options}),refreshSection:options=>refreshDerived({throwOnError:true,...options}),showNet:pose=>{++derivedSequence;derivedModel=null;derivedResult=null;net=pose.foldNet;$('promote').disabled=true;$('net-preview').hidden=true;$('derived-canvas').hidden=false;$('derived-mode').value='net';$('derived-status').textContent='Rigid face-net fold: '+format(pose.frame.foldFraction);viewportControls?.sync();}});
const animation=new AnimationControls({...numericContext,getState:state,getModel:model,isExporting:()=>tourExporting,viewer:base,sectionViewer:derived,netViewer:derived,capabilities:()=>animationRenderer.capabilities(),loadPlanes:(m,o)=>animationRenderer.loadPlanes(m,o),loadNet:(m,o)=>animationRenderer.loadNet(m,o),loadMorph:(m,s,o)=>animationRenderer.loadMorph(m,s,o),renderTracks:(p,o)=>animationRenderer.renderTracks(p,o),clearTracks:()=>animationRenderer.clearTracks(),display:displayBase,refreshSection:()=>{const source=state(),generation=animation.generation;const current=()=>state()===source&&animation.generation===generation&&!tourExporting;return refreshDerived({throwOnError:true,isCurrent:current,exportOwner:animation.exporting?()=>animation.exporting&&current():undefined});},markDirty,api,setStatus,guard,stopLegacy:()=>{dualMorph?.cancel();viewportControls?.stop();},onExportStateChange:()=>{polychoronRelationships?.sync();uniformFamilyControls?.sync();relatedLibrary?.sync();faceSurgeryControls?.sync();projectOpening.sync();imageCapture?.sync();catalogLoader?.sync();derivedControls?.onExportStateChange();netEditor.onExportStateChange();cellNetEditor.onExportStateChange();sourceReflectionControls?.sync();coincidicRegimentControls?.sync();dualMorph?.sync();animation.update();projectionFit?.cancel();viewportControls?.sync();memories?.sync();entityOrientation?.sync();cellFacing?.sync();historyControls?.sync();presentationControls?.sync();appearanceControls?.sync();materialEffectsControls?.sync();tours?.sync();faceEditing?.sync();automaticFaceting?.sync();facetingDiagram?.sync();pickingControls?.sync();compoundControls?.sync();perspectiveControls?.sync();subdivisionControls?.sync();faceConwayControls?.sync();cupolaControls?.sync();starPolygonControls?.sync();productControls?.sync();antiprismControls?.sync();stepPrismControls?.sync();nobleControls?.sync();stephanoidControls?.sync();basicSolidControls?.sync();torusControls?.sync();podiaControls?.sync();watermanControls?.sync();crossedSegmentotopeControls?.sync();augmentationControls?.sync();geodesicControls?.sync();convexCoreControls?.sync();expansionControls?.sync();fittingControls?.sync();exactSectionControls?.sync();incidenceTruncationControls?.sync();sphereProjectionControls?.sync();projectiveDualControls?.sync();facePlacementControls?.sync();sourceZonohedronControls?.sync();vertexFigureConstruction?.sync();multipleViews?.sync();springControls?.sync();segmentotopeControls?.sync();segmentotopeAnalysis?.sync();elementContent?.sync();sourceLabelPresets?.sync();stellationCells?.sync();reinforcement?.sync();coincidentAssembly?.sync();densityInfo?.sync();projectMetadata?.sync();},showSection:()=>{state().view.viewportLayout='split';viewportControls?.sync();},syncPose:view=>{syncRotationPose();$('section-depth').value=view.sectionOffset;$('section-offset').value=view.sectionOffset;$('derived-mode').value=view.derivedMode;}});
dualMorph=new DualMorphControls({...numericContext,mappedContent:true,
  prepare:(m,settings,sourceContext,o)=>run('prepare-dual-morph',{settings,sourceContext},m,'Prepare dual morph',o),
  evaluate:(m,prepared,ratio,sourceContext,o)=>run('evaluate-dual-morph',{prepared,ratio,sourceContext},m,'Evaluate dual morph',o),
  render:async(frame,o)=>{const current=state();return displayDiagnostic(await renderMorphElementContent(base,frame,current,{...o,getState:state,describe:(m,p,options)=>run('element-content-describe',p,m,'Prepare moving morph content',options)}));},
  clear:()=>{if(base.morphFrame){base.clearMorph(model(),state().view);elementContent.refresh().catch(error);}},
  prepareCapture:o=>base.prepareCapture(o),markDirty,onState:()=>{dualMorph?.sync();animation.update();},onError:error,
  stopOther:()=>{viewportControls?.stop();animation.pause();tours?.closePreview();}
});
base.onMorphPick=(owners,kind,index)=>{
  const selected=owners.find(o=>o.kind===kind)||owners[0];
  if(!selected){setStatus('Morph primitive has no single source entity.');return;}
  $('selection-kind').value=selected.kind;$('selection-id').value=selected.id;selectEntity(true);
  setStatus('Morph '+kind+' '+index+' -> '+owners.map(o=>o.kind+' '+o.id).join(', '));
};
function availableDerivedModel(){return derivedControls?.pending?null:derivedModel;}
function derivedStateSnapshot(){
  const m=availableDerivedModel(),s=state();if(!m||!s)return null;
  return initialDocumentState(m,'Derived '+s.view.derivedMode,s);
}
function promoteDerivedView(){
  if(animation.exporting||tourExporting)throw new Error('Finish animation export before promoting a derived result.');
  const snapshot=derivedStateSnapshot();if(!snapshot)throw new Error('Evaluate a current derived result before promoting it.');
  if(project.documents.length>=100)throw new Error('Close a document before promoting another result.');
  if(state().view.derivedMode==='cell-section')return ordinaryCellSections.promote(derivedResult);
  if(state().view.derivedMode==='section'&&state().view.densitySection?.enabled)return densitySections.promote(derivedResult);
  return addDocument(clone(snapshot.model),'Promote derived view',{documentContext:snapshot});
}
function syncCancelAvailability(){$('cancel').hidden=!nativeJobs.pending.size&&!derivedControls?.timer&&!derivedControls?.pending&&!derivedWork.active&&!netEditor?.exports?.busy&&!imageCapture?.busy;}
function cancelDerivedPresentation(){
  const pending=Boolean(derivedControls?.timer||derivedControls?.pending||derivedWork.active);
  if(!pending){syncCancelAvailability();return false;}
  densitySectionControls.show(null);
  ++derivedSequence;derivedWork.cancel();derivedModel=null;derivedResult=null;net=null;derived.clear();
  $('promote').disabled=true;$('derived-status').textContent='Derived evaluation canceled. Evaluate the current inputs to retry.';
  derivedControls?.cancelEvaluation();syncCancelAvailability();return true;
}
function derivedAvailabilityChanged({pending=false}={}){
  memories.sync();
  if(!exportControls.dialog.open)return;
  const available=exportControls.context?.getDerived?exportControls.context.getDerived():availableDerivedModel();exportControls.source.options[1].disabled=!available;
  if(exportControls.source.value!=='derived')return;
  if(pending||derivedControls?.pending||derivedWork.active){
    exportControls.session.cancel();exportControls.preview.textContent='Wait for the derived result before exporting it.';exportControls.preview.dataset.status='preparing';exportControls.sync();
  }else if(!available){
    exportControls.session.cancel();exportControls.preview.textContent='No current derived result is available. Evaluate it again or choose Model.';exportControls.preview.dataset.status='error';exportControls.sync();
  }else exportControls.refresh();
}
const memories=new MemoryControls({getProject:()=>project,getState:state,getSource:target=>({documentId:doc().id,modelId:(target==='derived'?availableDerivedModel():model())?.id,...target==='derived'?{derivedMode:state().view.derivedMode}:{}}),getDerivedState:derivedStateSnapshot,restoreState:restoreMemoryState,addStates:addMemoryStates,markDirty,setStatus,guard,isExporting:()=>(animation.exporting||tourExporting)});
const tours=new TourControls({...numericContext,run,getProject:()=>project,getState:state,showEvent:showTourEvent,createRenderer:createTourRenderer,api,onExportStateChange:value=>{tourExporting=value;animation.context.onExportStateChange();},markDirty,guard,isExporting:()=>(animation.exporting||tourExporting),stopOther:()=>{dualMorph?.pause();viewportControls?.stop();animation.pause();},importTour:api.importTour,exportTour:api.exportTour,setStatus});
viewportControls=new ViewportControls({...numericContext,getInput:$,getState:state,getModel:model,base,derived,display:displayBase,displayPose,markDirty,markPoseDirty:markViewDirty,isExporting:()=>(animation.exporting||tourExporting),stopTrack:()=>animation.pause(),syncPose:syncRotationPose,refreshDerived,cancelProjectionFit:()=>projectionFit?.cancel(),requestProjectionFit:()=>projectionFit?.request(),syncDerivedControls:()=>derivedControls?.sync()});
projectionFit=new ProjectionFit({
  getOwner:()=>{const current=state();if(!current||(animation.exporting||tourExporting)||animation.playing||viewportControls.playing)return null;
    return {project,document:doc(),state:current,model:current.model,fingerprint:current.model.fingerprint,
      pose:stereographicViewSignature(current.view),camera:JSON.stringify([base.cameraState(),base.aspect])};},
  isReady:()=>{if(state()?.view.projection!=='stereographic'||model()?.dimension!==4||base.stereographicWorkerUnavailable)return true;
    const worker=base.stereographicWorker,published=worker?.published,snapshot=worker?.snapshot;
    return Boolean(published&&snapshot&&published.publication.phase==='idle'
      &&published.publication.frameKey===snapshot.keys.frameKey&&published.publication.sourceKey===snapshot.keys.sourceKey
      &&snapshot.model===model()&&snapshot.viewSignature===stereographicViewSignature(state().view)
      &&!worker.transport.pending.active&&!worker.transport.pending.queued);},
  fit:()=>base.fit(),persist:()=>{state().view.camera=base.cameraState();markDirty();},
  onError:failure=>error(failure)
});
const entityOrientation=new EntityOrientationControls({...numericContext,getTarget:()=>({kind:$('selection-kind').value,index:$('selection-id').value,measurementA:{kind:state().view.measurements?.aKind??null,ids:state().view.measurements?.aIds??null},frame:state().view.orientationFrame??null}),getState:state,isExporting:()=>(animation.exporting||tourExporting),guard,apply:orientSelection,clear:()=>{viewportControls.stop();animation.pause();delete state().view.orientationFrame;state().view.angles=Array(6).fill(0);syncRotationPose();displayBase();markDirty();}});
const symmetryOrientation=new SymmetryOrientationControls({...numericContext,run,guard,viewer:base,markDirty,display:displayBase,syncPose:syncRotationPose,stop:()=>{viewportControls.stop();animation.pause();}});
const cellFacing=new CellFacingControls({...numericContext,evaluate:(m,options)=>run('cell-facing',{},m,'Evaluate source cell planes',options),getCounts:()=>base.facingCounts,display:displayBase,markDirty});
const historyControls=new HistoryControls({getState:state,getDocument:doc,isExporting:()=>(animation.exporting||tourExporting),guard,replay:()=>openRecipeDocument('recipe-replay'),branch:params=>openRecipeDocument('recipe-branch',params)});
let cancelDialogNet=null;
const exportControls=new ExportControls({...numericContext,getViewer:source=>source==='derived'?derived:base,prepareView:(m,p,o)=>run('prepare-view-export',p,m,'Prepare displayed geometry',o),preparePrintable:(m,p,o)=>run('prepare-printable-export',p,m,'Prepare printable model',o),onClose:()=>cancelDialogNet?.(),getProject:()=>project,getDocument:doc,getState:state,getDerived:()=>derivedExportGeometry(availableDerivedModel(),derived,net,{pending:Boolean(derivedControls?.pending||derivedWork.active),mode:state()?.view.derivedMode}),getNet:()=>net,isExporting:()=>(animation.exporting||tourExporting),describe:(m,o)=>run('export-options',{},m,'Check export formats',o),prepare:(m,p,o)=>run('prepare-export',p,m,'Prepare geometry export',o),api,setStatus});
const presentationControls=new PresentationControls({...numericContext,getState:state,isExporting:()=>(animation.exporting||tourExporting),guard,display:displayBase,markDirty});
const appearanceControls=new AppearanceControls({...numericContext,getState:state,isExporting:()=>(animation.exporting||tourExporting),guard,display:displayBase,markDirty});
const materialEffectsControls=new MaterialEffectsControls({...numericContext,getState:state,isExporting:()=>(animation.exporting||tourExporting),guard,display:displayBase,markDirty});
const faceEditing=new FaceEditingControls({...numericContext,getState:state,isExporting:()=>(animation.exporting||tourExporting),guard,number,analyze:async(m,p,{signal,verifyPublication}={})=>{verifyPublication?.();const result=await run('face-coincidences',p,m,'Inspect coincident faces',{signal});verifyPublication?.();return result;},commit:commitOperation});
let facetingPreview;
let diagramPreview;
const automaticFaceting=new AutomaticFacetingControls({...numericContext,read:async(op,p,m,{signal,verifyPublication})=>{verifyPublication();const result=await run(op,p,m,'Automatic facets',{signal});verifyPublication();return result;},commit:commitOperation,preview:async(m,{verifyPublication})=>{verifyPublication();const container=$('facet-preview');container.hidden=false;facetingPreview??=new Viewer(container);facetingPreview.setModel(m);facetingPreview.setDisplay({...defaults(3),surfaceColors:'source',vertices:false});facetingPreview.fit();},clearPreview:()=>facetingPreview?.clear()});
const facetingDiagram=new FacetingDiagramControls({...numericContext,
  prepareCatalogue:async()=>{automaticFaceting.node('symmetry-mode').value='all';automaticFaceting.node('actions').value='';await automaticFaceting.apply('candidates');},
  cancelPreparation:()=>automaticFaceting.cancel(),
  catalogue:()=>{if(!automaticFaceting.catalogue)throw Error('Build a candidate pool first.');verifyNativeSource(numericContext,automaticFaceting.catalogueOwner);if(automaticFaceting.generationSignature()!==automaticFaceting.catalogueForm)throw Error('Candidate source actions or bounds changed. Rebuild first.');return automaticFaceting.catalogue;},
  selectedResult:()=>automaticFaceting.selected(),searchSignature:()=>JSON.stringify({fields:automaticFaceting.signature(),result:automaticFaceting.node('result').value}),
  read:automaticFaceting.context.read,commit:commitOperation,
  preview:async(m,{verifyPublication})=>{verifyPublication();const container=$('faceting-diagram-preview');container.hidden=false;diagramPreview??=new Viewer(container);diagramPreview.setModel(m);diagramPreview.setDisplay({...defaults(3),surfaceColors:'source',vertices:false});diagramPreview.fit();},
  clearPreview:()=>{diagramPreview?.clear();$('faceting-diagram-preview').hidden=true;},
  save:async(value,{signal,verifyPublication})=>{verifyPublication();if(signal.aborted)throw Object.assign(Error('Diagram save canceled.'),{name:'AbortError'});state().view.facetingDiagram=value;markDirty();}
});
const pickingControls=new PickingControls({getState:state,isExporting:()=>(animation.exporting||tourExporting),guard,display:displayBase,markDirty});
const elementContent=new ElementContentControls({...numericContext,commit:commitOperation,viewer:base,
  selection:()=>({kind:$('selection-kind').value,index:Number($('selection-id').value)}),
  visibleTargets:kind=>{
    if(base.model!==model()||!base.publishedPickState)throw Error('Wait for the current source presentation.');
    const {visibility,view}=base.publishedPickState,enabled=kind==='vertex'?view.vertices===true:kind==='edge'?view.edges!==false:view.faces!==false;
    if(!enabled)return [];
    if(kind==='cell')return [...visibility.activeCells];
    return visibility[{vertex:'vertices',edge:'edges',face:'faces'}[kind]].flatMap((shown,i)=>shown?[i]:[]);
  },
  describe:async(m,p,{signal,verifyPublication})=>{verifyPublication();const result=await run('element-content-describe',p,m,'Prepare element content',{signal});verifyPublication();return result;},
  render:async(viewer,descriptor,{sourceSnapshot,signal,verifyPublication})=>{
    verifyPublication?.();if(typeof viewer.setElementContent!=='function'){if(descriptor)throw Error('Element content renderer is not available.');return {ready:true};}
    const result=await viewer.setElementContent(descriptor,{sourceModel:sourceSnapshot,signal,isCurrent:()=>{try{verifyPublication?.();return true;}catch{return false;}}});verifyPublication?.();return result;
  }
});
reinforcement=new ReinforcementControls({...numericContext,
  mount:{after:panel=>$('net-panel').append(panel)},
  getNetParameters:()=>{
    const s=state(),c=netEditor.config(s),saved=s.netHistory?.sourceFingerprint===s.model.fingerprint?s.netHistory.states[s.netHistory.cursor]:null;
    const layout=s.netLayout?.sourceFingerprint===s.model.fingerprint?s.netLayout:null;
    const candidate=layout??saved,matching=candidate?.root===c.root&&(candidate.referenceEdgeLengthMm??candidate.edge_length_mm)===c.length&&candidate.tabs===c.tabs;
    return {root:c.root,edge_length_mm:c.length,tabs:c.tabs,...matching?{hinges:clone(candidate.hinges),placements:clone(candidate.placements??[])}:s.netSeparate?{hinges:[]}: {}};
  },
  getPaperParameters:()=>{
    const p=state().view.netPrint??{paper:'a4',orientation:'portrait',width_mm:210,height_mm:297,margin_mm:10};
    let [width,height]=p.paper==='custom'?[p.width_mm,p.height_mm]:({a4:[210,297],a3:[297,420],letter:[215.9,279.4],legal:[215.9,355.6]}[p.paper]??[p.width_mm,p.height_mm]);
    if(p.orientation==='landscape'&&width<height||p.orientation!=='landscape'&&width>height)[width,height]=[height,width];
    return {width_mm:width,height_mm:height,margin_mm:p.margin_mm};
  },
  read:async(op,p,m,o)=>{o.verifyPublication();const result=await run(op,p,m,'Prepare internal support panels',o);o.verifyPublication();return result;},
  preview:async(svg,o)=>{o.verifyPublication();const root=checkedReinforcementSVG(svg);o.verifyPublication();$('reinforcement-chart').replaceChildren(document.importNode(root,true));$('reinforcement-chart').hidden=false;},
  clearPreview:()=>{$('reinforcement-chart')?.replaceChildren();if($('reinforcement-chart'))$('reinforcement-chart').hidden=true;},
  save:async(value,o)=>{o.verifyPublication();if(o.signal.aborted)throw Object.assign(Error('Supporting panel save canceled.'),{name:'AbortError'});state().view.netReinforcement=value;markDirty();},
  export:(format,text,o)=>publishBoundedExport(api,format,text,o),
  exportPdf:(pages,o)=>publishBoundedExport(api,'pdf',pages,o)
});
reinforcement.fabrication=new FabricationControls(reinforcement.context);
coincidentAssembly=new CoincidentEdgeControls({...numericContext,
  mount:{after:panel=>$('net-panel').append(panel)},
  read:async(op,p,m,o)=>{o.verifyPublication();const result=await run(op,p,m,'Prepare four-face source assembly',o);o.verifyPublication();return result;},
  preview:async(svg,result,o)=>{o.verifyPublication();const root=checkedAssemblySVG(svg);root.style.width='100%';root.style.height='auto';o.verifyPublication();$('assembly-chart').replaceChildren(document.importNode(root,true));$('assembly-chart').hidden=false;},
  clearPreview:()=>{$('assembly-chart')?.replaceChildren();if($('assembly-chart'))$('assembly-chart').hidden=true;},
  getPaperParameters:()=>{const p=state().view.netPrint??{paper:'a4',orientation:'portrait',margin_mm:10,gap_mm:5};return Object.fromEntries(['paper','orientation','width_mm','height_mm','margin_mm','gap_mm','allow_rotation'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));},
  export:(format,text,o)=>publishBoundedExport(api,format,text,{...o,defaultName:'Source edge assembly'}),
  exportPdf:(pages,o)=>publishBoundedExport(api,'pdf',pages,{...o,defaultName:'Source edge assembly'})
});
densityInfo=new GeneralizedDensityControls({...numericContext,format,
  mount:{after:panel=>$('entity-measure-controls').after(panel)},
  read:async(op,p,m,o)=>{o.verifyPublication();const result=await run(op,p,m,'Generalized source density information',o);o.verifyPublication();return result;},
  export:(format,text,o)=>publishBoundedExport(api,format,text,{...o,defaultName:'Generalized density evidence'})
});
informationPanel=new InformationPanel({...numericContext,run,api});
$('cancel').addEventListener('click',()=>informationPanel?.cancel());
// Descriptor/asset readiness precedes capture; missing requested content is never
// treated as an empty overlay while an asynchronous native read is in flight.
for(const viewer of [base,derived]){
  const capture=viewer.prepareCapture.bind(viewer);
  viewer.prepareCapture=async(options={})=>{
    if(viewer===base)await elementContent.prepareCapture(options);
    else if(viewer.net||viewer.cellNet||hasSectionSourceContent(viewer.model)||hasEmptySectionSource(viewer))await elementContent.refresh(viewer,{...options,referenceEdgeMm:viewer.net?.referenceEdgeLengthMm??25});
    else if(state()?.view.elementAnnotations?.entries.length)throw Error('Element content mapping to this derived presentation is not supported.');
    return capture(options);
  };
}
sourceLabelPresets=new ElementLabelPresetsControls({...numericContext,getState:state,getDocument:doc,getProject:()=>project,isExporting:()=>(animation.exporting||tourExporting),guard,run,commit:commitOperation,visibleTargets:kind=>elementContent.context.visibleTargets(kind)});
stellationCells=new StellationDiagramControls({...numericContext,commit:commitOperation,markDirty,getState:state,getDocument:doc,getProject:()=>project,getConfig:()=>stellation.config(),isExporting:()=>(animation.exporting||tourExporting),guard,run,applySelection:ids=>{const s=state();s.view.derivedMode='stellation';stellation.config(s).display='solid';$('derived-mode').value='stellation';$('stellation-display').value='solid';markDirty();refreshDerived();},saveSvg:(svg,name)=>api.saveSvg(svg,name)});
const compoundControls=new CompoundControls({...numericContext,getEntries:()=>catalog,generate:(kind,params,options)=>constructDocument(kind,params,'Uniform compound',options),getState:state,isExporting:()=>(animation.exporting||tourExporting),guard,commit:commitOperation});
const perspectiveControls=new PerspectiveControls({...numericContext,getState:state,isExporting:()=>(animation.exporting||tourExporting),guard,display:displayBase,markDirty,requestProjectionFit:()=>viewportControls.frameModel()});
const subdivisionControls=new SubdivisionControls({...numericContext,getState:state,isExporting:()=>(animation.exporting||tourExporting),guard,commit:commitOperation});
const sourceConstructionContext={...numericContext,getState:state,getDocument:doc,getProject:()=>project,isExporting:()=>(animation.exporting||tourExporting),guard,number,commit:commitOperation};
faceConwayControls=new FaceConwayControls({...sourceConstructionContext,run});
const sourceReflectionControls=new SourceReflectionControls(sourceConstructionContext);
const coincidicRegimentControls=new CoincidicRegimentControls({...sourceConstructionContext,setStatus,restoreState:restoreMemoryState,onSelect:(kind,index)=>{$('selection-kind').value=kind;$('selection-id').value=index;return selectEntity(true);},navigateDocument:id=>{const index=project.documents.findIndex(d=>d.id===id);if(index<0)throw Error('Comparison source document is no longer open.');project.active=index;markDirty();renderWorkspace();}});
geodesicControls=new SourceConstructionControls(sourceConstructionContext,'geodesic');
convexCoreControls=new SourceConstructionControls(sourceConstructionContext,'core');
expansionControls=new ExpansionControls(sourceConstructionContext);
fittingControls=new FittingControls({...sourceConstructionContext,preview:async(op,params,{sourceSnapshot,signal,verifyPublication})=>{verifyPublication();const result=await run(op,params,sourceSnapshot,'Preview geometry fit',{signal});verifyPublication();return result;}});
exactSectionControls=new ExactSectionControls({...sourceConstructionContext,preview:async(op,params,{sourceSnapshot,signal,verifyPublication})=>{verifyPublication();const result=await run(op,params,sourceSnapshot,'Compute exact surface section',{signal});verifyPublication();return result;}});
incidenceTruncationControls=new IncidenceTruncationControls({...sourceConstructionContext,preview:async(op,params,{sourceSnapshot,signal,verifyPublication})=>{verifyPublication();const result=await run(op,params,sourceSnapshot,'Compute source edge cut',{signal});verifyPublication();return result;}});
sphereProjectionControls=new SphereProjectionControls(sourceConstructionContext);
projectiveDualControls=new ProjectiveDualControls({...sourceConstructionContext,run,markDirty,setStatus,saveImage:(data,name,options)=>saveReviewedImage(api,data,name,options),onSelect:(kind,index)=>{$('selection-kind').value=kind;$('selection-id').value=index;selectEntity(true);}});
sourceZonohedronControls=new SourceZonohedronControls(sourceConstructionContext,{anchor:'convex-core-settings'});
vertexFigureConstruction=new VertexFigureConstructionControls({...sourceConstructionContext,run,addDocument});
const hoverIdentification=new HoverIdentification({viewer:base,blocked:()=>!state()||animation.playing||viewportControls.playing||viewportControls.drag||viewportControls.direct4D?.active||tours?.playing||dualMorph?.playing||netEditor.playing||animation.exporting||tourExporting||imageCapture?.busy,describe:result=>{const hit=result.sourceOwners?.find(o=>o.kind===result.picked.kind)??(base.publishedPickState?.morphFrame?null:result.picked);return hit?describeSelection(model(),hit.kind,hit.id,entityVertices(model(),hit.kind,[hit.id]),state().view.coordinateUnit):'';}});
multipleViews=new MultiViewControls({...numericContext,Viewer,isPlaying:()=>animation.playing||viewportControls.playing||tours?.playing||dualMorph?.playing,describeSelection:(m,hit,unit)=>describeSelection(m,hit.kind,hit.id,entityVertices(m,hit.kind,[hit.id]),unit),getState:state,getSource:model,getProject:()=>project,getDocument:doc,isExporting:()=>(animation.exporting||tourExporting),guard,markDirty,setStatus,saveImage:(data,name,options)=>saveReviewedImage(api,data,name,options),describeContent:(m,p,o)=>run('element-content-describe',p,m,'Prepare multiple-view content',o),onSelect:(index,count,kind)=>{$('selection-kind').value=kind;$('selection-id').value=index;selectEntity();}});
springControls=new SpringControls({...sourceConstructionContext,preview:async(op,params,{sourceSnapshot,signal,verifyPublication})=>{verifyPublication();const result=await run(op,params,sourceSnapshot,'Preview spring relaxation',{signal});verifyPublication();return result;}},{anchor:'convex-core-settings'});
const cupolaControls=new CupolaControls({...numericContext,guard,number,isExporting:()=>(animation.exporting||tourExporting),generate:(params,options)=>constructDocument('cupola',params,'Generate cupola',options)});
const starPolygonControls=new StarPolygonControls({...numericContext,guard,number,isExporting:()=>(animation.exporting||tourExporting),generate:(params,options)=>constructDocument('regular-star-polygon',params,'Generate regular polygon',options)});
const productControls=new ProductControls({...numericContext,guard,number,getState:state,commit:commitOperation,isExporting:()=>(animation.exporting||tourExporting),generate:(params,options)=>constructDocument('polygon-product',params,'Polygon product',options)});
const antiprismControls=new AntiprismControls({...numericContext,guard,number,getState:state,commit:commitOperation,isExporting:()=>(animation.exporting||tourExporting),generate:(kind,params,options)=>constructDocument(kind,params,kind==='antiduoprism'?'Generate antiduoprism':'Generate rational antiprism',options)});
const uniformFamilyControls=new UniformFamilyControls({...numericContext,guard,getState:state,isExporting:()=>animation.exporting||tourExporting,generate:(kind,params,options)=>constructDocument(kind,params,'Uniform prism family',options)});
$('cancel').addEventListener('click',()=>uniformFamilyControls.cancel());
const stepPrismControls=new StepPrismControls({...numericContext,guard,number,isExporting:()=>(animation.exporting||tourExporting),generate:(kind,params,options)=>constructDocument(kind,params,'Generate step prism',options)});
const nobleControls=new NobleControls({...numericContext,guard,isExporting:()=>(animation.exporting||tourExporting),generate:(kind,params,options)=>constructDocument(kind,params,'Generate noble disphenoid',options)});
stephanoidControls=new StephanoidControls({...numericContext,guard,isExporting:()=>(animation.exporting||tourExporting),generate:(kind,params,options)=>constructDocument(kind,params,'Generate stephanoid',options)});
basicSolidControls=new BasicSolidControls({...numericContext,guard,isExporting:()=>(animation.exporting||tourExporting),generate:(kind,params,options)=>constructDocument(kind,params,'Generate '+kind,options)});
const projectMetadata=new ProjectMetadataControls({...numericContext,markDirty,refresh:()=>{analysisOverview.sync();renderTabs();$('model-name').textContent=state().view.documentMetadata?.title?.trim()||model().name;}});
const torusControls=new TorusControls({...numericContext,guard,number,getProject:()=>project,isExporting:()=>(animation.exporting||tourExporting),generate:(kind,params,options)=>constructDocument(kind,params,'Generate torus',options)});
const podiaControls=new PodiaControls({...numericContext,guard,number,getProject:()=>project,isExporting:()=>(animation.exporting||tourExporting),generate:(kind,params,options)=>constructDocument(kind,params,kind==='rational-podium'?'Generate podium':'Generate antipodium',options)});
const watermanControls=new WatermanControls({...numericContext,guard,isExporting:()=>(animation.exporting||tourExporting),generate:(kind,params,options)=>constructDocument(kind,params,'Generate Waterman hull',options)});
segmentotopeControls=new SegmentotopeControls({...numericContext,guard,number,getState:state,getProject:()=>project,getMemories:()=>project.memories,isExporting:()=>(animation.exporting||tourExporting),commit:commitOperation});
segmentotopeAnalysis=new SegmentotopeAnalysisControls({guard,getState:state,isExporting:()=>(animation.exporting||tourExporting),analyze:(m,p)=>run('analyze-strict-segmentotope',p,m,'Check strict predicates')});
const crossedSegmentotopeControls=new CrossedSegmentotopeControls({...numericContext,guard,number,getProject:()=>project,isExporting:()=>(animation.exporting||tourExporting),generate:(kind,params,options)=>constructDocument(kind,params,'Generate crossed antiprism product',options)});
augmentationControls=new AugmentationControls({guard,number,getState:state,getDocument:doc,getProject:()=>project,getWorkspace:()=>project,getMemories:()=>project.memories,isExporting:()=>(animation.exporting||tourExporting),commit:commitOperation});
faceSurgeryControls=new FaceSurgeryControls({...sourceConstructionContext,selection:()=>({kind:$('selection-kind').value,index:Number($('selection-id').value)})});
facePlacementControls=new FacePlacementControls({guard,number,getState:state,getDocument:doc,getProject:()=>project,getMemories:()=>project.memories,isExporting:()=>(animation.exporting||tourExporting),commit:commitOperation});
function constructDocument(kind,params,label,options){return generateConstruction({getProject:()=>project,isExporting:()=>(animation.exporting||tourExporting),run,addDocument},kind,params,label,options);}
const ordinaryCellSections=new OrdinaryCellSectionWorkflow({...sourceConstructionContext,run,publishHistory:result=>{project.documents.push({...result,id:uid(),name:'Ordinary cell section'});project.active=project.documents.length-1;markDirty();renderWorkspace();}});
const densitySections=new DensitySectionWorkflow({...sourceConstructionContext,run,publishHistory:result=>{project.documents.push({...result,id:uid(),name:'Filled density section'});project.active=project.documents.length-1;markDirty();renderWorkspace();}});
const densitySectionControls=new DensitySectionControls({...numericContext,guard,markDirty,refreshDerived,isPending:()=>Boolean(derivedControls?.pending||derivedWork.active),showSection:()=>{state().view.viewportLayout='split';$('derived-mode').value='section';viewportControls?.sync();}});
const workspaceNumeric=new WorkspaceNumericControls({...numericContext,getInput:$,commit:commitOperation,generate:constructDocument,run,addDocument,markDirty,refreshDerived});
const coxeterPreviewHost=el('div');coxeterPreviewHost.id='coxeter-builder-preview';coxeterPreviewHost.hidden=true;$('base-canvas').parentElement.append(coxeterPreviewHost);
const coxeterPreviewLabel=el('span','Unsaved shape preview · drag to explore','coxeter-preview-label');coxeterPreviewHost.append(coxeterPreviewLabel);
coxeterBuilder=new CoxeterBuilder({...numericContext,run,stop:()=>{welcome?.close();viewportControls.stop();animation.pause();},
  preview:(m,{isCurrent})=>{if(!isCurrent())return;coxeterPreviewHost.hidden=false;coxeterPreview??=new Viewer(coxeterPreviewHost);coxeterPreview.resize();coxeterPreview.setModel(m);coxeterPreview.setDisplay(initialDocumentState(m,'Shape preview').view);coxeterPreview.fit();},
  clearPreview:()=>{coxeterPreviewHost.hidden=true;coxeterPreview?.clear();},
  commit:(params,name,options)=>state()?commitOperation('generate',{kind:'coxeter-builder',...params},name,options):constructDocument('coxeter-builder',params,name,options)});
window.openCoxeterBuilder=guard(()=>coxeterBuilder.show());
const openCoxeterBuilderButton=el('button','Shape builder · Coxeter diagrams','wide accent');openCoxeterBuilderButton.id='open-coxeter-builder';openCoxeterBuilderButton.onclick=window.openCoxeterBuilder;$('coxeter-family').before(openCoxeterBuilderButton);
$('cancel').addEventListener('click',()=>coxeterBuilder.close());
derivedControls=new DerivedViewControls({...numericContext,getInput:$,getDerived:()=>derivedModel,markDirty,refreshDerived,
  syncDensity:()=>densitySectionControls.sync(),
  syncViewport:()=>viewportControls.sync(),applyPlane:next=>workspaceNumeric.section(next),cancelPlane:()=>workspaceNumeric.cancel(),
  onAvailabilityChange:derivedAvailabilityChanged,onActivityChange:syncCancelAvailability,
  invalidate:()=>{++derivedSequence;derivedWork.cancel();derivedModel=null;derivedResult=null;net=null;$('promote').disabled=true;$('derived-status').textContent='Updating derived view...';derivedAvailabilityChanged({pending:true});},
  promote:promoteDerivedView});
function syncRotationPose(){const v=state()?.view;if(v)PLANES.forEach((_,i)=>{if($('plane-'+i)){$('plane-'+i).value=v.angles[i]||0;$('plane-output-'+i).textContent=format(v.angles[i]||0)+'°';}});}
const unitControls=el('div');unitControls.innerHTML='<label>Coordinate units <select id="model-unit"><option value="model">Model units</option><option>mm</option><option>cm</option><option>m</option><option>in</option><option>ft</option></select></label><label>Reference edge <input id="reference-edge" type="number" min="0" value="0" step="1"></label><label>Desired edge length <input id="reference-length" value="1"></label><button id="scale-reference">Scale to reference</button>';
$('scale').after(unitControls);
$('model-unit').onchange=()=>{state().view.coordinateUnit=$('model-unit').value;markDirty();};
$('scale-reference').onclick=guard(()=>workspaceNumeric.referenceScale());
const auditFilter=el('select');auditFilter.id='library-audit-filter';auditFilter.setAttribute('aria-label','Filter library validation status');
for(const [value,label] of [['all','All validation statuses'],['passed','Passed'],['rejected','Rejected'],['untested','Untested'],['stale','Stale evidence'],['reference','Independent references']])auditFilter.append(new Option(label,value));
$('library-family').after(auditFilter);
const libraryProperties=new LibraryPropertyControls({document,after:auditFilter,change:()=>renderCatalog()});
const relatedLibrary=new RelatedLibraryControls({document,after:$('analysis'),getModel:model,getEntries:()=>catalog,guard,isExporting:()=>animation.exporting||tourExporting,open:entry=>catalogLoader.open(entry)});
polychoronRelationships=new PolychoronRelationshipControls({document,after:$('analysis'),getState:state,getEntries:()=>catalog,open:entry=>catalogLoader.open(entry),run,guard,isExporting:()=>animation.exporting||tourExporting});
let inspectedLibraryEntry=null;
const catalogLoadingStatus=el('output',undefined,'muted');catalogLoadingStatus.id='catalog-loading-status';catalogLoadingStatus.setAttribute('role','status');catalogLoadingStatus.setAttribute('aria-live','polite');$('catalog').before(catalogLoadingStatus);
const discoveryPanel=el('div',undefined,'catalog-discovery'),discoveryStatus=el('output',undefined,'muted'),catalogRetry=el('button','Load Library','wide');
discoveryStatus.id='catalog-discovery-status';discoveryStatus.setAttribute('role','status');catalogRetry.id='catalog-retry';discoveryPanel.append(discoveryStatus,catalogRetry);$('catalog').before(discoveryPanel);
function syncCatalogDiscovery(){
  const status=catalogDiscovery?.state??'loading';discoveryPanel.hidden=status==='ready';catalogRetry.hidden=status==='loading';catalogRetry.disabled=animation.exporting||tourExporting;
  discoveryStatus.textContent=status==='loading'?'Loading Library…':status==='error'?'Library could not load.':status==='canceled'?'Library loading canceled.':'Load the model Library.';
  catalogRetry.textContent=status==='error'?'Retry Library':'Load Library';$('catalog').setAttribute('aria-busy',String(status==='loading'));
}
function syncCatalogLoading(){
  syncCatalogDiscovery();
  const pending=catalogLoader?.pending||new Map(),exporting=animation.exporting||tourExporting;
  const names=[...pending.values()].map(job=>job.entry.name);
  catalogLoadingStatus.textContent=pending.size?'Opening '+(pending.size===1?(names[0].length>80?names[0].slice(0,79)+'…':names[0]):pending.size+' models')+'…':'';catalogLoadingStatus.title=names.join('\n');
  catalogLoadingStatus.hidden=!pending.size;
  for(const button of $('catalog').querySelectorAll('[data-key]')){
    const busy=[...pending.values()].some(job=>job.entry.key===button.dataset.key);
    button.disabled=button.dataset.catalogDisabled==='true'||busy||exporting;button.setAttribute('aria-busy',String(busy));
    let note=button.querySelector('.catalog-loading-note');if(busy&&!note){note=el('small','Opening…','catalog-loading-note');button.append(note);}else if(!busy)note?.remove();
  }
  $('library-open-anyway').disabled=exporting||[...pending.values()].some(job=>job.entry.key===inspectedLibraryEntry?.key);
  $('new').disabled=exporting;
}
const libraryPreviewJobs=new NativeJobs({id:uid,now:()=>performance.now(),start:()=>null,complete:()=>{},cancel:id=>api.cancel(id)});
async function readCatalogEntry(entry,{signal,background=false}){
  return (background?libraryPreviewJobs:nativeJobs).run(async id=>entry.external?(await api.libraryModel(entry.key,id)).model:api.engine({op:'generate',params:{kind:'regular',key:entry.key},model:null},id),'Open '+entry.name,{signal});
}
catalogLoader=new CatalogLoading({getProject:()=>project,getState:state,isExporting:()=>animation.exporting||tourExporting,
  read:readCatalogEntry,publish:(m,entry,{activate})=>addDocument(m,entry.external?'Import OFF':'Generate',{activate,catalog:true}),onChange:syncCatalogLoading});
catalogDiscovery=new CatalogDiscovery({read:options=>run('catalog',{},null,'Load local catalog',options),publish:entries=>{catalog=entries;startupMark('catalog-loaded');renderCatalog();},change:syncCatalogDiscovery});
const libraryThumbnails=new LibraryThumbnails({document,read:readCatalogEntry,isIdle:()=>!nativeJobs.pending.size&&!animation.exporting&&!tourExporting&&!document.hidden&&!welcome?.panel?.matches(':not([hidden])')});
const libraryVisual=new LibraryCollections({document,guard,thumbnails:libraryThumbnails,change:()=>renderCatalog(),resetFilters:()=>{
  $('search').value='';$('library-family').value='all';auditFilter.value='all';filter='all';
  for(const select of libraryProperties.selects.values())select.value='all';
  document.querySelectorAll('[data-filter]').forEach(button=>button.classList.toggle('active',button.dataset.filter==='all'));
}});
catalogRetry.onclick=guard(()=>catalogDiscovery.load());
function inspectLibraryEntry(entry){
  inspectedLibraryEntry=entry;
  $('library-source-info').textContent=JSON.stringify({path:entry.key,relativePath:entry.relativePath,counts:entry.counts,auditStatus:entry.auditStatus||'untested',diagnostic:entry.auditDiagnostic||entry.diagnostic,errors:entry.auditErrors,warnings:entry.auditWarnings,sourceHash:entry.sourceHash},null,2);
  $('library-repair-copy').disabled=!entry.supported;syncCatalogLoading();$('library-dialog').showModal();
}
const cellNetOption=el('option','4D cell net');cellNetOption.value='cell-net';$('derived-mode').append(cellNetOption);
const incidenceDualOption=el('option','Incidence dual (3D / 4D)');incidenceDualOption.value='incidence-dual';$('derived-mode').append(incidenceDualOption);
const faceOption=el('option','Source face');faceOption.value='face';$('derived-mode').append(faceOption);
const reciprocal=document.createElement('div');reciprocal.innerHTML='<label>Reciprocation center <input id="incidence-dual-center" placeholder="Vertex mean, or 3 / 4 coordinates"></label><label>Reciprocation radius <input id="incidence-dual-radius" value="1"></label><button id="make-incidence-dual" class="wide">Construct 3D / 4D incidence dual</button><p class="muted">Preserves ordered links and complete cells, including finite star incidence. Requires closed local boundaries. Face or cell planes through the center, coincident reciprocal identities and unresolved links are diagnosed. Convex polar dual remains a separate operation.</p>';$('make-dual').after(reciprocal);
$('make-incidence-dual').onclick=guard(()=>workspaceNumeric.incidenceDual());
const stellationOption=el('option','3D stellation');stellationOption.value='stellation';$('derived-mode').append(stellationOption);

function syncCatalogSelection(){
  const key=model()?.metadata?.key;
  for(const button of $('catalog').querySelectorAll('.catalog-entry'))button.classList.toggle('active',button.dataset.key===key);
}
function renderCatalog(){
  const query=$('search').value.toLowerCase().trim(),matches=compileCatalogQuery(query),entries=[...catalog,...external];
  libraryProperties.update(entries);relatedLibrary.sync();compoundControls.uniforms.sync();
  const familySelect=$('library-family'),selectedFamily=familySelect.value;
  const families=[...new Set(entries.map(e=>e.family||'Linked OFF'))].sort();
  familySelect.replaceChildren(new Option('All families','all'),...families.map(f=>new Option(f,f)));
  familySelect.value=families.includes(selectedFamily)?selectedFamily:'all';
  const available=entries.filter(e=>(filter==='all'||String(e.dimension)===filter)&&(familySelect.value==='all'||(e.family||'Linked OFF')===familySelect.value)&&(auditFilter.value==='all'||(e.external?(e.auditStatus||'untested'):'reference')===auditFilter.value)&&libraryProperties.matches(e)&&matches(e));
  const filtered=available.filter(e=>libraryVisual.matches(e));
  libraryVisual.updateCount(filtered.length);
  presentationLibraryEntries=filtered;
  $('catalog').replaceChildren();
  libraryVisual.prepare(entries,{query,filtered:available,filtersActive:familySelect.value!=='all'});
  // Window the external listing; full name search still covers every record.
  filtered.slice(0,250).forEach(entry=>{
    const button=el('button',undefined,'catalog-entry');button.dataset.key=entry.key;
    button.disabled=entry.external&&entry.supported===false;
    button.dataset.catalogDisabled=String(Boolean(button.disabled));
    button.title=entry.external?[entry.relativePath,entry.diagnostic||'Header indexed; geometry is checked when opened.',entry.counts?'V / E / F / C: '+entry.counts.join(' / '):'',libraryProvenance(entry)].filter(Boolean).join('\n'):[entry.name,entry.catalogStatus,libraryProvenance(entry),entry.chiralityStatus,entry.uniformSnubVariant?.labelBasis,entry.classificationVerified===false?'Classification unverified':''].filter(Boolean).join('\n');
    if(entry.key===model()?.metadata?.key)button.classList.add('active');
    button.append(el('span',entry.dimension?entry.dimension+'D':'OFF','dim'),el('span',entry.name,'entry-name'),el('small',[entry.symbol,libraryFamilyLabel(entry)].filter(Boolean).join(' · ')));
    if(entry.external&&entry.supported===false)button.append(el('small',entry.diagnostic||'Unsupported OFF file','muted'));
    if(entry.external){const status=entry.auditStatus||'untested';button.append(el('small',status+(entry.auditDiagnostic?' · '+entry.auditDiagnostic:''),'audit-badge audit-'+status));}
    button.onclick=guard(()=>{
      if(entry.external&&entry.auditStatus==='rejected'){inspectLibraryEntry(entry);return;}
      // An unmodified copy that is already open is reused instead of adding a duplicate tab.
      const open=project.documents.findIndex(d=>d.states.length===1&&d.states[0].model?.metadata?.key===entry.key);
      if(open>=0&&!(animation.exporting||tourExporting))return activateDocument(open);
      return catalogLoader.open(entry);
    });
    button.oncontextmenu=event=>{if(entry.external){event.preventDefault();inspectLibraryEntry(entry);}};
    libraryVisual.decorate(button,entry);
    $('catalog').append(button);
  });
  if(filtered.length>250)$('catalog').append(el('p','Showing 250 matches. Refine search to find any indexed entry.','muted'));
  if(!filtered.length&&(entries.length||catalogDiscovery?.state==='ready'))$('catalog').append(el('p','No matching models. Try another family or search.','muted'));
  catalogLoader?.sync();
}
function renderLinkedLibraries(){
  $('linked-libraries').replaceChildren();
  for(const library of linkedLibraries){
    const row=el('div',undefined,'linked-library'),label=el('small',library.path.split(/[\\/]/).filter(Boolean).pop(),'muted');label.title=library.path;
    const remove=el('button','Remove');remove.title='Unlink folder; source files remain unchanged';
    remove.onclick=guard(async()=>{await api.unlinkLibrary(library.path);linkedLibraries=linkedLibraries.filter(l=>l.path!==library.path);external=[...new Map(linkedLibraries.flatMap(l=>l.entries).map(e=>[e.key,e])).values()];renderLinkedLibraries();renderCatalog();setStatus('Unlinked '+library.path);});
    const audit=el('button','Audit');audit.title='Attach an importer audit or compact evidence index';audit.onclick=guard(async()=>{const updated=await api.attachLibraryAudit(library.path);if(updated){acceptLinkedLibrary(updated);setStatus('Attached audit evidence to '+library.path);}});
    const verify=el('button','Verify');verify.disabled=!library.auditPath;verify.title='Recheck source hashes against attached audit evidence';verify.onclick=guard(async()=>{setStatus('Verifying source hashes…');const updated=await api.verifyLibraryAudit(library.path);acceptLinkedLibrary(updated);setStatus('Source hashes verified for '+library.path);});
    row.append(label,remove,audit,verify);$('linked-libraries').append(row);
    if(library.error)$('linked-libraries').append(el('small',library.error,'muted'));
    if(library.auditError)$('linked-libraries').append(el('small','Audit unavailable: '+library.auditError,'muted'));
  }
}
function acceptLinkedLibrary(library){
  linkedLibraries=linkedLibraries.filter(l=>l.path!==library.path);linkedLibraries.push(library);
  external=[...new Map(linkedLibraries.flatMap(l=>l.entries).map(e=>[e.key,e])).values()];renderLinkedLibraries();renderCatalog();
}
function renderTabs(){
  $('document-tabs').replaceChildren();
  project.documents.forEach((d,i)=>{
    const button=el('button',(d.states[d.cursor].view.documentMetadata?.title?.trim()||d.states[d.cursor].model.name)+(i===project.active&&dirty?' •':''));if(i===project.active)button.classList.add('active');
    button.onclick=()=>{catalogLoader?.navigationChanged();project.active=i;renderWorkspace();markDirty();};$('document-tabs').append(button);
    if(project.documents.length>1){
      const close=el('span','×','tab-close');close.title='Close document';close.setAttribute('aria-label','Close '+button.textContent);
      close.onclick=guard(event=>{event.stopPropagation();closeDocument(i);});button.append(close);
      button.onauxclick=guard(event=>{if(event.button===1){event.preventDefault();closeDocument(i);}});
    }
  });
}
function activateDocument(index){if(index===project.active)return;catalogLoader?.navigationChanged();project.active=index;renderWorkspace();markDirty();}
function closeDocument(index){
  if(animation.exporting||tourExporting)throw new Error('Finish animation export before closing a document.');
  const closed=project.documents[index];if(!closed||project.documents.length<2)return;
  const wasActive=index===project.active,owner=project;catalogLoader?.navigationChanged();
  project.documents.splice(index,1);
  if(project.active>index||project.active>=project.documents.length)project.active--;
  markDirty();if(wasActive)renderWorkspace();else renderTabs();
  const name=closed.states[closed.cursor].view.documentMetadata?.title?.trim()||closed.states[closed.cursor].model.name,undo=el('button','Undo','toast-action');
  undo.onclick=guard(()=>{
    clearTimeout(toastTimer);$('toast').hidden=true;
    if(project!==owner||project.documents.includes(closed))return;
    if(animation.exporting||tourExporting)throw new Error('Finish animation export before reopening a document.');
    if(project.documents.length>=100)throw new Error('The project already contains the maximum of 100 documents.');
    const at=Math.min(index,project.documents.length);project.documents.splice(at,0,closed);if(project.active>=at)project.active++;activateDocument(at);markDirty();
  });
  $('toast').replaceChildren('Closed '+name+'. ',undo);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,9000);
}
function renderHistory(){
  $('history-list').replaceChildren();doc().states.forEach((s,i)=>{const button=el('button',`${i+1} ${s.label||s.model.provenance?.operation||'model'}`);if(i===doc().cursor)button.classList.add('active');button.onclick=()=>{catalogLoader?.navigationChanged();doc().cursor=i;markDirty();renderWorkspace();};$('history-list').append(button);});
  historyControls.sync();
  $('undo').disabled=doc().cursor===0;$('redo').disabled=doc().cursor===doc().states.length-1;
  workspaceAvailability.sync();
}
function initialDocumentState(m,label,documentContext=null){
  const view=defaults(m.dimension);view.coordinateUnit=['model','mm','cm','m','in','ft'].includes(m.metadata?.coordinateUnits)?m.metadata.coordinateUnits:({1:'in',2:'ft',4:'mm',5:'cm',6:'m'}[m.metadata?.dxf?.insunits]||'model');view.fillRule=m.metadata?.fillRule||view.fillRule;if(['generalized-complex','surface-section'].includes(m.interpretation)&&m.faces.length)view.derivedMode='face';if(m.interpretation==='surface-section'&&!m.faces.length)view.derivedMode='section-evidence';if(m.metadata?.family==='Kepler-Poinsot')view.derivedMode='incidence-dual';
  if(m.metadata?.dxf){view.faces=m.faces.length>0;const incident=new Set(m.edges.flat());view.vertices=m.vertices.some((_,i)=>!incident.has(i));view.presentation=view.faces?'solid':'wireframe';}
  const importedMetadata=m.metadata?.documentMetadata;
  if(importedMetadata&&typeof importedMetadata==='object'&&!Array.isArray(importedMetadata)&&['title','author','reference','description'].every(key=>importedMetadata[key]===undefined||typeof importedMetadata[key]==='string'))view.documentMetadata=clone(importedMetadata);
  let notes=typeof m.metadata?.documentNotes==='string'?m.metadata.documentNotes:'';
  if(documentContext){
    // Carry document attributes without copying source-bound poses/content.
    const unit=documentContext.view.coordinateUnit??documentContext.model?.metadata?.coordinateUnits??'model';
    view.coordinateUnit=['model','mm','cm','m','in','ft'].includes(unit)?unit:'model';
    view.fillRule=documentContext.view.fillRule||'nonzero';view.surfaceColors=documentContext.view.surfaceColors||'source';
    const metadata=documentContext.view.documentMetadata;
    if(metadata===undefined)delete view.documentMetadata;else view.documentMetadata=clone(metadata);
    notes=documentContext.notes||'';
  }
  return {model:m,view,label,notes};
}
function addDocument(m,label='Generate',{activate=true,catalog=false,documentContext=null}={}){
  if(project.documents.length>=100)throw new Error('The project already contains the maximum of 100 documents.');
  const next=initialDocumentState(m,label,documentContext);
  if(!catalog)catalogLoader?.navigationChanged();
  clearTimeout(toastTimer);$('toast').hidden=true;
  project.documents.push({id:uid(),cursor:0,states:[next]});if(activate)project.active=project.documents.length-1;markDirty();if(activate)renderWorkspace();else renderTabs();
  if(activate&&catalog)viewportControls?.opened(m);
  return next;
}
async function commitOperation(op,params,label,{verifyPublication,signal}={}){
  const context={getProject:()=>project,getDocument:doc,getState:state,isExporting:()=>(animation.exporting||tourExporting),run:(op,params,source,label)=>run(op,params,source,label,{signal}),verifyPublication:()=>{if(signal?.aborted)throw new Error('Construction cancelled.');verifyPublication?.();}};
  const prepared=await prepareHistoryCommit(context,op,params,label);
  const index=verifyHistoryPublication(context,prepared);
  preserveHistoryObserver(prepared);project.documents[index]=prepared.result;
  clearTimeout(toastTimer);$('toast').hidden=true;
  markDirty();if(index===project.active)renderWorkspace();else renderTabs();
  return prepared.result;
}
async function openRecipeDocument(op,parameters){
  const context={getProject:()=>project,getDocument:doc,getState:state,isExporting:()=>(animation.exporting||tourExporting),run};
  context.verifyPublication=captureContentHistoryPublication(context);
  const prepared=await prepareHistoryOpen(context,op,parameters);
  verifyHistoryPublication(context,prepared,{opening:true});
  project.documents.push(prepared.result);project.active=project.documents.length-1;markDirty();renderWorkspace();
}

function displayPose(){return displayBase({poseOnly:true});}
function displayBase({poseOnly=false}={}){
  if(!poseOnly&&coxeterBuilder?.panel.open&&!coxeterBuilder.committing)coxeterBuilder.close();
  const s=state();if(!s)return;
  // Explicit pose-only callers change angles. Source/settings edits, navigation,
  // busy-state changes and export transitions retain their full control sync.
  if(!poseOnly){
    liveSliders?.sync();
    symmetryOrientation?.sync();
    faceSurgeryControls?.sync();
    sourceReflectionControls?.sync();coincidicRegimentControls?.sync();perspectiveControls.sync();subdivisionControls.sync();faceConwayControls?.sync();productControls.sync();antiprismControls.sync();stepPrismControls.sync();nobleControls.sync();torusControls.sync();podiaControls.sync();watermanControls.sync();crossedSegmentotopeControls.sync();augmentationControls.sync();geodesicControls.sync();convexCoreControls.sync();expansionControls.sync();fittingControls.sync();exactSectionControls.sync();incidenceTruncationControls.sync();sphereProjectionControls?.sync();projectiveDualControls?.sync();facePlacementControls.sync();sourceZonohedronControls.sync();vertexFigureConstruction?.sync();multipleViews?.sync();segmentotopeControls.sync();segmentotopeAnalysis.sync();
  }
  const contentDisplay=elementContent.display(base,{poseOnly});
  if(!poseOnly)syncDerivedSelection();
  displayDiagnostic(contentDisplay.diagnostic);
  if(derived.model&&(derived.view?.appearance!==s.view.appearance||derived.view?.materialEffects!==s.view.materialEffects))derived.setDisplay({...derived.view,appearance:s.view.appearance,materialEffects:s.view.materialEffects});
  contentDisplay.pending.catch(e=>{if(e.name!=='AbortError'&&state()===s){elementContent.node('status').textContent=e.message;elementContent.node('status').dataset.status='presentation-refused';}});
}
function displayDiagnostic(diagnostic){
  const prismNote=$('prism-density-note');if(prismNote)prismNote.textContent=diagnostic?.prismDiagnostic||'';
  const messages=[];if(base.appearanceEffectsDiagnostic)messages.push(base.appearanceEffectsDiagnostic);if(diagnostic?.clippedEdges)messages.push(`${diagnostic.clippedEdges} edges clipped by projection limits`);
  if(diagnostic?.orientationDiagnostic)messages.push(diagnostic.orientationDiagnostic);
  if(diagnostic?.facingDiagnostic)messages.push(diagnostic.facingDiagnostic);
  if(diagnostic?.presentationDiagnostic)messages.push(diagnostic.presentationDiagnostic);
  if(diagnostic?.stereographicDiagnostic)messages.push(diagnostic.stereographicDiagnostic);
  if(diagnostic?.perspectiveDiagnostic)messages.push(diagnostic.perspectiveDiagnostic);
  if(diagnostic?.explosionDiagnostic)messages.push(diagnostic.explosionDiagnostic);
  if(base.selectionHighlightDiagnostic)messages.push(base.selectionHighlightDiagnostic);
  if(diagnostic?.suppressedFaces)messages.push(`${diagnostic.suppressedFaces} faces omitted from surface fill; unsupported or resource limit`);
  $('view-diagnostic').textContent=messages.join(' · ');$('view-diagnostic').dataset.triangles=diagnostic?.filledTriangles||0;
  const projectionData=$('view-diagnostic').dataset;
  projectionData.stereographicFrameKey=diagnostic?.stereographicDisplayedFrameKey||'';
  projectionData.stereographicPhase=diagnostic?.stereographicQuality?.phase||'';
  projectionData.stereographicTolerance=diagnostic?.stereographicQuality?.tolerance??'';
  projectionData.stereographicPending=String(Boolean(diagnostic?.stereographicPending));
  $('view-diagnostic').title=model()?.interpretation==='generalized-complex'?'Source face surface fill; no solid interior is inferred.':'';
  $('cell-visibility-summary').textContent=model()?.cells?.length?`${base.visibility?.activeCells.length||0} / ${model().cells.length} visible`:'';
  cellFacing?.sync();presentationControls?.sync();appearanceControls?.sync();materialEffectsControls?.sync();pickingControls?.sync();
  appearanceSheet?.sync();
}
function renderWorkspace(){
  learn4D?.sync();
  liveSliders?.cancel();
  coxeterBuilder?.close();
  welcome?.close();
  imageCapture?.sync();
  workspaceAvailability.sync();
  reports.invalidate();
  derivedWork.cancel();
  dualMorph?.invalidate();
  automaticFaceting.invalidate();facetingDiagram.invalidate();
  elementContent.invalidate();reinforcement?.invalidate();coincidentAssembly?.invalidate();densityInfo?.invalidate();
  projectionFit?.cancel();
  const m=model(),v=state()?.view;if(!m)return;$('inspector-region').scrollTop=0;
  animationRenderer.clearTracks();
  viewportControls.stop();
  animation.sync();
  intrinsicReports.reset();
  $('model-name').textContent=v.documentMetadata?.title?.trim()||m.name;$('model-family').textContent=(m.metadata?.family||m.interpretation).toUpperCase();$('dimension-badge').textContent=m.dimension+'D';
  syncPrecisionContext(document,m);
  $('model-unit').value=v.coordinateUnit||'model';
  regular4dButton.hidden=!m.metadata?.regular4dIdentity;
  $('notes').value=state().notes||'';$('projection').value=v.projection;$('faces-visible').checked=v.faces;$('vertices-visible').checked=v.vertices;
  $('face-fill-rule').value=v.fillRule||'nonzero';$('surface-opacity').value=v.surfaceOpacity??(m.dimension===4?.12:.28);$('surface-colors').value=v.surfaceColors||'source';$('cell-visibility-controls').hidden=!m.cells?.length;$('visible-cell-id').max=Math.max(0,(m.cells?.length||0)-1);$('visible-cell-id').value=v.isolatedCell??0;
  $('projection').disabled=m.dimension!==4;
  $('rotation-controls').hidden=m.dimension<3;$('derived-mode').value=v.derivedMode;$('section-normal').value=v.sectionNormal.join(', ');$('section-depth').value=v.sectionOffset;$('section-offset').value=v.sectionOffset;$('entity-id').value=v.entity||0;
  const radius=pointRadius(m.vertices,null,1)*1.15;$('section-offset').min=-radius;$('section-offset').max=radius;$('section-offset').step=radius/250;
  PLANES.forEach((_,i)=>{$('plane-'+i).value=v.angles[i]||0;$('plane-output-'+i).textContent=format(v.angles[i]||0)+'°';});
  base.setModel(m,{deferDisplay:true});base.restoreCamera(v.camera);
  for(const option of $('selection-kind').options)option.disabled=!m[{vertex:'vertices',edge:'edges',face:'faces',cell:'cells'}[option.value]]?.length;
  const selection=v.entitySelection,selectedCount=m[{vertex:'vertices',edge:'edges',face:'faces',cell:'cells'}[selection?.kind]]?.length;
  if(selection?.ids?.length&&selection.ids.every(i=>Number.isInteger(i)&&i>=0&&i<selectedCount)){selectEntityType(selection.kind,selection.ids,selection.typeLabel,{persist:false,display:false});}
  else if(Number.isInteger(selectedCount)&&Array.isArray(selection?.indices)&&selection.indices.every(id=>Number.isInteger(id)&&id>=0&&id<selectedCount)){
    base.selectEntities(selection.kind,selection.indices);$('selection-kind').value=selection.kind;$('selection-id').value=selection.indices[0]??0;
    $('selection-info').textContent=JSON.stringify({kind:selection.kind,indices:selection.indices,vertices:base.selected},null,2);selectionSummary().textContent=`${selection.indices.length} source ${selection.kind} elements selected`;
  }else if(selection&&Number.isInteger(selection.index)&&selection.index>=0&&selection.index<selectedCount){$('selection-kind').value=selection.kind;$('selection-id').value=selection.index;selectEntity(false,{display:false});}
  else{$('selection-kind').value='vertex';$('selection-id').value=0;$('selection-info').textContent='Click a projected vertex or select a source entity by index.';selectionSummary().textContent='Click the model to pick a vertex, edge or face.';}
  // Restore source selection before the one full display. That display prepares
  // highlight positions, picking and annotations together in the saved pose.
  displayBase();
  elementTypes.sync();
  PLANES.forEach(([,axis],i)=>{$('plane-'+i).parentElement.hidden=axis>=m.dimension;});viewportControls.sync();
  $('counts-strip').replaceChildren();['vertices','edges','faces','cells'].forEach(k=>{if(k==='cells'&&m.dimension!==4)return;const block=el('div',undefined,'count-block');block.append(el('strong',format(m[k]?.length||0)),el('small',k.toUpperCase()));$('counts-strip').append(block);});
  stellation.sync();netEditor.sync();cellNetEditor.sync();measurementControls.sync();symmetryControls.sync();memories.sync();entityOrientation.sync();tours.sync();faceEditing.sync();automaticFaceting.sync();facetingDiagram.sync();elementContent.sync();sourceLabelPresets?.sync();stellationCells?.sync();reinforcement?.sync();coincidentAssembly?.sync();densityInfo?.sync();projectMetadata.sync();compoundControls.sync();renderTabs();renderHistory();syncCatalogSelection();catalogLoader?.sync();refreshAnalysis();refreshDerived();
  const restoredSource=state();(state().view.dualMorph?.enabled?dualMorph.restoreSaved():animationRenderer.restoreSavedExplosion()).catch(e=>{if(state()===restoredSource)error(e);});
  constructGallery?.sync();
}
function reportMessage(id,text){if(id==='evidence')clearPrecisionValidation(document);const message=el('p',text,'muted');message.setAttribute('role','status');$(id).replaceChildren(message);}
function rememberValidationDetails(){validationDetailsOpen=$('validation-details')?.open??validationDetailsOpen;}
function reportCurrent(ticket,channel,id){
  if(reports.current(ticket,channel))return true;
  if(reports.owns(ticket,channel))reportMessage(id,'The source changed. Check the current model again.');
  return false;
}
async function refreshAnalysis(){
  analysisOverview.sync();
  polychoronRelationships?.sync();
  informationPanel?.invalidate();
  if(informationPanel?.panel.open&&!informationPanel.busy)guard(()=>informationPanel.refresh())();
  relatedLibrary.sync();
  const ticket=reports.begin(['analysis','validation']),m=ticket.model;
  analysisDetailsOpen=$('analysis-details')?.open??analysisDetailsOpen;rememberValidationDetails();
  reportMessage('analysis','Analyzing current model…');reportMessage('evidence','Checking current model…');
  const cancelPaint=()=>ticket.controller.abort();$('cancel').addEventListener('click',cancelPaint,{once:true});
  await afterModelPaint();$('cancel').removeEventListener('click',cancelPaint);
  if(!reports.current(ticket,'analysis'))return;
  if(ticket.signal.aborted){reportMessage('analysis','Analysis canceled. Select the model again to retry.');if(reports.owns(ticket,'validation'))reportMessage('evidence','Check canceled. Select the model again to retry.');return;}
  startupMark('analysis-started');
  try{
    const [a,deviation]=await Promise.all([run('analyze',{},m,'Analyze incidence',{signal:ticket.signal}),[3,4].includes(m.dimension)&&m.interpretation==='convex-polytope'&&m.vertices.length<=64?run('geometry-fit-deviation',{},m,'Measure face deviations',{signal:ticket.signal}).catch(()=>null):null]);
    const analysisCurrent=reportCurrent(ticket,'analysis','analysis'),validationCurrent=reportCurrent(ticket,'validation','evidence');if(!analysisCurrent)return;
    $('analysis').replaceChildren();stat($('analysis'),'Interpretation',m.interpretation);stat($('analysis'),'Symbol',m.metadata?.symbol||'—');
    stat($('analysis'),'Edge length range',format(a.edgeLength.min)+' – '+format(a.edgeLength.max));stat($('analysis'),'Vertex radii about mean',format(a.vertexRadius.min)+' – '+format(a.vertexRadius.max));
    if(m.metadata?.enantiomorph)stat($('analysis'),'Enantiomorph (coordinate convention)',m.metadata.enantiomorph);
    if(m.metadata?.topologicalGenus!==undefined)stat($('analysis'),'Surface genus',m.metadata.topologicalGenus);
    if(m.metadata?.faceSurgery?.resultFingerprint===m.fingerprint&&m.metadata?.faceSurgery?.measureEvidence?.enclosedVolume!==undefined)stat($('analysis'),'Enclosed boundary volume (approx.)',format(m.metadata.faceSurgery.measureEvidence.enclosedVolume));
    if(m.metadata?.watermanFcc||m.metadata?.watermanBall){
      const evidence=m.metadata.watermanFcc??m.metadata.watermanBall,lattice=m.metadata.watermanFcc?'FCC':evidence.lattice??'Waterman',current=evidence.sourceModelId===m.id&&evidence.sourceFingerprint===m.fingerprint;
      stat($('analysis'),lattice+' input sites',format(evidence.selectedPointCount));
      stat($('analysis'),lattice+' ball membership',current&&evidence.selectionCertificate?.certified===true?'Exact rational selection':'Historical source only');
      stat($('analysis'),'Nonextreme input sites',format(evidence.nonextremeSelectedPointIds?.length));
    }
    if(m.components?.length)stat($('analysis'),'Components',m.components.length);
    if(m.metadata?.uniformCompound?.sourceFingerprint===m.fingerprint){const e=m.metadata;stat($('analysis'),'Uniform compound','UC'+e.ucNumber+' · '+e.componentPolyhedron);stat($('analysis'),'Compound symmetry',e.symmetryGroup+' · '+e.chirality);if(e.uniformCompound.parameters.angleDegrees!==undefined)stat($('analysis'),'Compound angle θ',e.uniformCompound.parameters.angleDegrees+'°');}
    if(m.metadata?.addDual){const e=m.metadata.addDual;stat($('analysis'),'Dual sizing',e.definition);if(e.crossingResidual!==undefined)stat($('analysis'),'Dual contact residual (source units)',format(e.crossingResidual));}
    if(m.metadata?.dualOf)stat($('analysis'),'Reference primal',m.metadata.dualOf);
    if(m.metadata?.coxeterFamily&&m.metadata?.rings)stat($('analysis'),'Coxeter construction',m.metadata.coxeterFamily+' '+m.metadata.rings.join(''));
    if(m.metadata?.linkedRelativePath)stat($('analysis'),'Source catalog file',m.metadata.linkedRelativePath);
    const source=libraryProvenance(m.metadata??{});if(source)stat($('analysis'),'Source provenance',source);
    stat($('analysis'),m.interpretation==='convex-polytope'||m.metadata?.fillSemantics==='ordinary-convex-faces'?'Face areas, min / max':'Algebraic cycle areas',format(a.faceArea.min)+' / '+format(a.faceArea.max));
    if(a.measure){stat($('analysis'),m.dimension===3?'Volume':`${m.dimension}D content`,format(a.measure.content)+` u${['','','²','³','⁴'][m.dimension]}`);stat($('analysis'),`${m.dimension-1}D boundary measure`,format(a.measure.boundaryMeasure));}
    if(a.dihedral)stat($('analysis'),'Convex interior dihedrals',format(a.dihedral.min)+' – '+format(a.dihedral.max)+'°');
    stat($('analysis'),'Face side counts',Object.entries(a.faceTypes).map(([n,c])=>`${c} × ${n}`).join(', '));stat($('analysis'),'Euler V − E + F − C',a.validation.eulerCharacteristic);
    simplifyAnalysis(document,{open:analysisDetailsOpen});if(validationCurrent)renderValidation(document,m,a.validation,{open:validationDetailsOpen});
    const deviationText=nearMissText(deviation);if(deviationText){const row=document.createElement('p');row.id='near-miss-deviation';row.textContent=deviationText;$('analysis').append(row);}
    appendNearMissReport(document,$('analysis'),m);
    startupMark('analysis-done');
  }catch(e){
    if(reportCurrent(ticket,'analysis','analysis')){reportMessage('analysis',e.name==='AbortError'?'Analysis canceled. Select the model again to retry.':'Analysis could not finish. Select the model again to retry.');error(e);}
    if(reportCurrent(ticket,'validation','evidence'))reportMessage('evidence','Check the current model with Validate incidence.');
  }
}
async function refreshDerived({throwOnError=false,isCurrent,signal,preserveLayout=false,exportOwner}={}){
  const m=model(),v=state()?.view;if(!m)return;
  const source=state(),inputKey=derivedInputKey(v),current=()=>state()===source&&source.model===m&&source.view===v&&derivedInputKey(v)===inputKey&&!signal?.aborted&&isCurrent?.()!==false;
  if(!current())throw new Error('Derived presentation cancelled.');
  const work=derivedWork.begin(signal);signal=work.signal;
  const deriveRun=(op,params,source,label)=>run(op,params,source,label,{signal});
  if(!preserveLayout&&['net','cell-net','stellation'].includes(v.derivedMode)&&v.viewportLayout!=='split')v.viewportLayout='split';viewportControls?.sync();
  densitySectionControls.sync();densitySectionControls.show(null);
  const sequence=++derivedSequence;derivedModel=null;derivedResult=null;net=null;$('promote').disabled=true;$('net-preview').hidden=true;$('derived-canvas').hidden=false;$('derived-status').textContent='Computing '+v.derivedMode+'…';
  const mode=v.derivedMode;
  try{
    derivedAvailabilityChanged({pending:true});
    syncCancelAvailability();
    let result;
    if(mode==='section-evidence'){
      if(m.interpretation!=='surface-section')throw new Error('Section evidence is available on promoted surface intersections.');
      derived.clear();$('derived-canvas').hidden=true;$('net-preview').hidden=false;
      const embedding=m.metadata?.sectionEmbedding;
      $('net-preview').replaceChildren(el('p','These curves intersect the ordered source faces. They preserve disconnected boundaries without assigning a solid interior.'),el('p',`${m.vertices.length} vertices · ${m.edges.length} segments · ${m.faces.length} coplanar faces`),el('p',embedding?`Source plane: ${embedding.normal.map(format).join(', ')} · depth ${format(embedding.offset)}`:'Source plane unavailable'),el('p',`Face fill: ${m.metadata?.fillRule||'nonzero'}. Source vertex and edge references are retained in the saved geometry.`));
      $('derived-status').textContent='Source surface intersection evidence';return {status:'surface-intersection',model:m};
    }
    if(mode==='section')result=v.densitySection?.enabled?await densitySections.evaluate({signal,isCurrent:current,exportOwner}):await deriveRun('section',densitySectionParameters(v),m,'Evaluate section');
    else if(mode==='cell-section')result=await ordinaryCellSections.evaluate({normal:v.sectionNormal,offset:v.sectionOffset,fill_rule:v.fillRule||'nonzero'},{signal,isCurrent:current,exportOwner});
    else if(mode==='dual')result={model:await deriveRun('dual',{},m,'Evaluate dual')};
    else if(mode==='incidence-dual')result={model:await deriveRun('incidence-dual',{},m,'Evaluate incidence dual')};
    else if(mode==='vertex-figure')result=await deriveRun('vertex-figure',{vertex:derivedEntityIndex(String(v.entity??0),m.vertices.length),mode:v.vertexFigureMode||'slicing',placement:v.vertexFigurePlacement||'midpoint'},m,'Evaluate vertex figure');
    else if(mode==='cell')result={model:await deriveRun('cell',{kind:m.dimension===4?'cell':'face',index:derivedEntityIndex(String(v.entity??0),m.dimension===4?m.cells.length:m.faces.length)},m,'Extract entity')};
    else if(mode==='face')result={model:await deriveRun('cell',{kind:'face',index:derivedEntityIndex(String(v.entity??0),m.faces.length)},m,'Extract ordered source face')};
    else if(mode==='net')result=await netEditor.evaluate(m,state(),{signal,isCurrent:current});
    else if(mode==='cell-net')result=await cellNetEditor.evaluate(m,state(),{signal,isCurrent:current});
    else if(mode==='stellation')result=await stellation.evaluate(m,state(),{signal,isCurrent:current});
    if(sequence!==derivedSequence||result?.stale||!current()){if(throwOnError)throw new Error('Section source changed while evaluating the animation frame.');return;}
    if(mode==='stellation'&&result.diagram){
      derivedModel=result.model;derived.clear();$('derived-canvas').hidden=true;$('net-preview').hidden=false;$('net-preview').replaceChildren(result.diagram);$('promote').disabled=!derivedModel;$('derived-status').textContent=result.status;
    }else if(mode==='net'){
      net=result;await netEditor.show(net);
      if(sequence!==derivedSequence||!current()){if(throwOnError)throw new Error('Derived source changed while preparing the presentation.');return;}
    }else if(mode==='cell-net'){
      $('net-preview').hidden=true;$('derived-canvas').hidden=false;cellNetEditor.show(result);
    }else{
      const preparedModel=result.model;
      if(mode==='section'||mode==='cell-section')derived.setSectionModel(preparedModel,m,{mode,deferDisplay:true});else derived.setModel(preparedModel,{deferDisplay:true});
      rememberSectionSource(derived,result,m);derived.restoreCamera(v.derivedCamera);if(preparedModel)derived.setDisplay({angles:Array(6).fill(0),projection:'orthographic',cameraProjection:v.cameraProjection,faces:true,vertices:v.vertices,edges:v.edges,fillRule:v.fillRule||'nonzero',surfaceOpacity:v.surfaceOpacity,surfaceColors:v.surfaceColors,appearance:v.appearance,materialEffects:v.materialEffects});
      if(preparedModel?.metadata?.densitySection)derived.setDisplay({...derived.view,...densitySectionDisplay(preparedModel)});
      if(mode==='cell-section'&&(preparedModel||hasEmptySectionSource(derived)))await elementContent.refresh(derived,{signal,isCurrent:current});
      if(sequence!==derivedSequence||!current()){if(throwOnError)throw new Error('Derived source changed while preparing the presentation.');return;}
      // Publish the geometry/result pair only after every presentation await
      // has completed for this request. Failed/stale content owns no actions.
      derivedResult=result;derivedModel=preparedModel;
      derived.onLinkedSelection?.();
      $('promote').disabled=!derivedModel;
      $('derived-status').textContent=mode==='stellation'?result.status:derivedModel?`${derivedModel.vertices.length} vertices · ${derivedModel.edges.length} edges · ${derivedModel.faces.length} faces · intrinsic ${derivedModel.dimension}D`:result.status==='empty'?'Empty intersection':`Tangent / degenerate intersection · affine dimension ${result.affineDimension}`;
    }
    if(result?.model?.interpretation==='surface-section')$('derived-status').textContent=`Surface intersection · ${result.model.vertices.length} vertices · ${result.model.edges.length} segments · ${v.fillRule||'nonzero'} face fill`;
    densitySectionControls.show(result);
    return result;
  }catch(e){if(sequence===derivedSequence&&current()){derivedModel=null;derivedResult=null;net=null;derived.clear();densitySectionControls.show(null);$('derived-status').textContent=e.message;}if(throwOnError)throw e;}finally{derivedWork.finish(work);if(sequence===derivedSequence){derivedControls?.sync();densitySectionControls.sync();derivedAvailabilityChanged();}syncCancelAvailability();}
}
function selectEntity(persist=true,{display=true}={}){
  if(persist&&!viewportControls.canEdit()){viewportControls.restoreSelectionInputs();return;}
  const m=model(),kind=$('selection-kind').value,field={vertex:'vertices',edge:'edges',face:'faces',cell:'cells'}[kind],index=safeIndex($('selection-id').value,m[field].length);
  let ids;if(kind==='vertex')ids=[index];else if(kind==='cell')ids=[...new Set(m.cells[index].flatMap(f=>m.faces[f]))];else ids=m[field][index];
  base.selectEntities(kind,[index]);if(display)displayBase();
  $('selection-info').textContent=JSON.stringify({kind,index,vertices:ids,...kind==='vertex'?{coordinates:m.vertices[index]}:{},...kind==='cell'?{faces:m.cells[index]}:{}},null,2);
  selectionSummary().textContent=describeSelection(m,kind,index,ids,state().view.coordinateUnit);
  if(persist){state().view.entitySelection={kind,index};markDirty();}
  syncDerivedSelection();
}
function selectEntityType(kind,indices,typeLabel,{persist=true,display=true}={}){
  if(persist&&!viewportControls.canEdit()){viewportControls.restoreSelectionInputs();return;}
  const m=model(),field={vertex:'vertices',edge:'edges',face:'faces',cell:'cells'}[kind];
  if(!field||!Array.isArray(indices)||!indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=m[field].length))throw Error('Choose existing source elements.');
  const ids=[...new Set(indices)],vertices=[...new Set(ids.flatMap(i=>kind==='vertex'?[i]:kind==='cell'?m.cells[i].flatMap(f=>m.faces[f]):m[field][i]))];
  $('selection-kind').value=kind;$('selection-id').value=ids[0];base.select(vertices);base.selectEntitySet(kind,ids);if(display)displayBase();
  selectionSummary().textContent=`${typeLabel||kind+' type'} · ${ids.length} selected ${field}`;
  $('selection-info').textContent=JSON.stringify({kind,ids,vertices},null,2);
  if(persist){state().view.entitySelection={kind,index:ids[0],ids,typeLabel:String(typeLabel||kind+' type').slice(0,256)};markDirty();}
  syncDerivedSelection();
}
function syncDerivedSelection(){
  if(!derived.model)return;
  const pickKind=state().view.pickKind||'vertex';if(derived.view?.pickKind!==pickKind)derived.setDisplay({...derived.view,pickKind});
  const mapped=linkedSelection(derivedLinks(model(),derivedResult,state().view.derivedMode,state().view.entity),state().view.entitySelection);
  derived.selectEntities(mapped?.kind??'vertex',mapped?.indices??[]);
}
function selectionSummary(){
  let node=$('selection-summary');if(node)return node;
  node=el('p',undefined,'selection-summary');node.id='selection-summary';node.setAttribute('aria-live','polite');($('selection-details')??$('selection-info')).before(node);return node;
}
// Plain-language readout of the picked entity; full evidence stays in the details.
function describeSelection(m,kind,index,ids,unit){
  const u=!unit||unit==='model'?'u':unit,p=i=>m.vertices[i],dist=(a,b)=>Math.hypot(...p(a).map((x,k)=>x-p(b)[k]));
  if(kind==='vertex')return `Vertex ${index} · (${p(index).map(format).join(', ')})`;
  if(kind==='edge')return `Edge ${index} · length ${format(dist(ids[0],ids[1]))} ${u} · vertices ${ids[0]}–${ids[1]}`;
  if(kind==='face'){
    const n=ids.length,perimeter=ids.reduce((sum,v,i)=>sum+dist(v,ids[(i+1)%n]),0),d=p(ids[0]).length;
    // Planar polygon area in any dimension: norm of the summed bivector of consecutive vertices.
    const c=Array(d).fill(0);ids.forEach(v=>p(v).forEach((x,k)=>{c[k]+=x/n;}));const B=new Map();
    ids.forEach((v,i)=>{const a=p(v).map((x,k)=>x-c[k]),b=p(ids[(i+1)%n]).map((x,k)=>x-c[k]);for(let j=0;j<d;j++)for(let k=j+1;k<d;k++)B.set(j*d+k,(B.get(j*d+k)??0)+a[j]*b[k]-a[k]*b[j]);});
    const area=Math.sqrt([...B.values()].reduce((sum,x)=>sum+x*x,0))/2,convex=m.interpretation==='convex-polytope'||m.metadata?.fillSemantics==='ordinary-convex-faces';
    return `Face ${index} · ${n}-gon · perimeter ${format(perimeter)} ${u}`+(convex?` · area ${format(area)} ${u}²`:'');
  }
  return `Cell ${index} · ${m.cells[index].length} faces · ${ids.length} vertices`;
}
function serialize(){return clone({...project,savedAt:new Date().toISOString()});}
function adopt(p){if(!p?.documents?.length)throw new Error('Project contains no documents.');const bank=normalizeMemories(p.memories),tourBank=normalizeTour(p.tour);catalogLoader?.cancel();project=p;project.memories=bank;project.tour=tourBank;tourPreviewDocument=null;project.documents.forEach(d=>d.states.forEach(s=>{s.view={...legacyDocumentView(s.model.dimension),...s.view};}));dirty=false;revision++;api.setDirty(false);renderWorkspace();}
async function restoreMemoryState(snapshot,label,{signal,verifyPublication,onPublication}={}){
  if((animation.exporting||tourExporting))throw new Error('Finish or cancel animation export before opening a model memory.');
  const sourceProject=project,sourceState=state();if(project.documents.length>=100)throw new Error('The project already contains the maximum of 100 documents.');
  const detached=clone(snapshot);if(detached.operationNode){detached.sourceOperationNode=detached.operationNode;delete detached.operationNode;}
  const result=await run('validate-project',{project:{format:'polytope-laboratory',version:1,active:0,documents:[{cursor:0,states:[detached]}]}},null,'Validate model memory',{signal});
  if(signal?.aborted)throw Object.assign(Error('Model memory opening canceled.'),{name:'AbortError'});
  if((animation.exporting||tourExporting))throw new Error('Finish or cancel animation export before opening a model memory.');
  if(project!==sourceProject||state()!==sourceState)throw new Error('Source document changed while the model memory was validated.');
  if(project.documents.length>=100)throw new Error('The project already contains the maximum of 100 documents.');
  verifyPublication?.();
  const restored=result.documents[0].states[0];restored.label=label;restored.view={...legacyDocumentView(restored.model.dimension),...restored.view};
  project.documents.push({id:uid(),cursor:0,states:[restored]});project.active=project.documents.length-1;onPublication?.();markDirty();renderWorkspace();return restored;
}
async function showTourEvent(snapshot,label,controls={}){
  if((animation.exporting||tourExporting))throw new Error('Finish animation export before opening a tour event.');
  if(controls.signal?.aborted||controls.isCurrent?.()===false)throw Object.assign(Error('Tour event opening canceled.'),{name:'AbortError'});
  const sourceProject=project,sourceState=state(),detached=clone(snapshot);if(detached.operationNode){detached.sourceOperationNode=detached.operationNode;delete detached.operationNode;}
  const result=await run('validate-project',{project:{format:'polytope-laboratory',version:1,active:0,documents:[{cursor:0,states:[detached]}]}},null,'Validate tour event',{signal:controls.signal});
  if((animation.exporting||tourExporting)||project!==sourceProject||state()!==sourceState||controls.signal?.aborted||(controls.isCurrent&&!controls.isCurrent()))throw Object.assign(Error('Tour event opening canceled.'),{name:'AbortError'});
  controls.verifyPublication?.();
  const restored=result.documents[0].states[0];restored.label=label;restored.view={...legacyDocumentView(restored.model.dimension),...restored.view};
  let index=project.documents.findIndex(d=>d.id===tourPreviewDocument);
  if(index<0){if(project.documents.length>=100)throw new Error('Close a document before opening a tour preview.');tourPreviewDocument=uid();index=project.documents.length;project.documents.push({id:tourPreviewDocument,cursor:0,states:[restored]});}
  else project.documents[index]={id:tourPreviewDocument,cursor:0,states:[restored]};
  project.active=index;markDirty();renderWorkspace();return restored;
}
function createTourRenderer(tour,{loop=false}={}){
  const sourceState=state(),views=$('views'),bounds=views.getBoundingClientRect();
  const width=Math.floor(bounds.width),height=Math.floor(bounds.height);
  if(width<1||height<1||width>4096||height>4096)throw Error('Tour preview needs a viewport within 4096 pixels per dimension.');
  const overlay=document.createElement('div');overlay.id='animated-tour-preview';
  Object.assign(overlay.style,{position:'absolute',inset:'0',zIndex:'5',background:'#15191f'});
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  Object.assign(canvas.style,{width:'100%',height:'100%',display:'block'});overlay.append(canvas);views.append(overlay);
  const host=document.createElement('div');document.body.append(host);
  let renderer,observer;
  try{
    renderer=new AnimatedTourRenderer({tour,loop,canvas,getOwner:()=>({project,tour:project.tour,sourceState:state(),document:doc()}),
      createLayer:createAnimatedTourLayerFactory({host,run}),onDiagnostic:setStatus});
    const close=renderer.close.bind(renderer);renderer.close=async()=>{overlay.remove();observer?.disconnect();try{await close();}finally{host.remove();}};
    observer=new ResizeObserver(()=>{const next=views.getBoundingClientRect();if(Math.floor(next.width)!==width||Math.floor(next.height)!==height){tours.pause();tours.retireRenderer();setStatus('Tour preview closed after viewport resize.');}});observer.observe(views);
    return renderer;
  }catch(error){overlay.remove();host.remove();observer?.disconnect();throw error;}
}
async function addMemoryStates(current,stored,label,{signal,verifyPublication}={}){
  const originalProject=project,originalState=state();if((animation.exporting||tourExporting))throw new Error('Finish or cancel animation export before adding models.');if(project.documents.length>=100)throw new Error('The project already contains the maximum of 100 documents.');
  const result=await run('compound-add',{other:stored.model},current.model,'Add stored model',{signal});
  if(signal?.aborted)throw Object.assign(Error('Model addition canceled.'),{name:'AbortError'});
  if((animation.exporting||tourExporting))throw new Error('Finish or cancel animation export before adding models.');
  if(project!==originalProject||state()!==originalState)throw new Error('Source document changed while the compound was calculated.');
  if(project.documents.length>=100)throw new Error('The project already contains the maximum of 100 documents.');
  verifyPublication?.();
  addDocument(result,label);return result;
}
async function orientSelection(mode,source,direction,{signal,verifyPublication,sourceSnapshot}={}){
  verifyPublication?.();viewportControls.stop();animation.pause();const current=state(),cameraSignature=JSON.stringify(current.view.camera),anglesSignature=JSON.stringify(current.view.angles);let entity;
  if(source==='measurement'){
    const settings=current.view.measurements,kind=settings.aKind,ids=rawNumbers(settings.aIds);
    entity=['line','plane','hyperplane'].includes(kind)?{kind,vertices:ids}:{kind,index:ids[0]};
  }else entity={kind:$('selection-kind').value,index:Number($('selection-id').value)};
  const frame=await run('entity-orientation',{entity,mode,...direction?{direction}:{}},sourceSnapshot??current.model,'Orient selected '+entity.kind,{signal});
  verifyPublication?.();
  if(signal?.aborted)throw Object.assign(new Error('Orientation edit canceled.'),{name:'AbortError'});
  if(state()!==current)throw new Error('Source document changed while orientation was calculated.');
  const observerMoved=JSON.stringify(current.view.camera)!==cameraSignature;
  current.view.orientationFrame=frame;if(JSON.stringify(current.view.angles)===anglesSignature)current.view.angles=Array(6).fill(0);syncRotationPose();displayBase();
  if(!observerMoved){base.fit();current.view.camera=base.cameraState();}
  entityOrientation.sync();markDirty();return frame;
}
async function open(requestId){
  if(typeof requestId!=='string')requestId=null;
  welcome?.close();welcome?.walkthrough.stop();
  if((animation.exporting||tourExporting))throw new Error('Finish or cancel animation export before opening a project.');
  initialModelAllowed=false;
  catalogLoader.cancel();
  viewportControls.stop();animation.pause();
  let statusOwner;
  return projectOpening.open({onStale:()=>status.complete(statusOwner,'File loading canceled because the workspace or export state changed.'),getProject:()=>project,getRevision:()=>revision,isExporting:()=>(animation.exporting||tourExporting),load:async({signal})=>reviewProjectOpen(await nativeJobs.run(id=>requestId?api.openRequested(requestId,id):api.open(id),'Open project or geometry',{signal,onStatusOwner:owner=>statusOwner=owner}),dirty,()=>api.confirmProjectOpen()),publish:result=>{
    if(result.project)adopt(result.project);else addDocument(result.model,'Import '+(result.model.metadata?.dxf?'DXF':result.path.toLowerCase().endsWith('.json')?'JSON':'OFF'));
    setStatus('Opened '+result.path);
  }});
}
const projectSaving=new ProjectSaving({getProject:()=>project,getRevision:()=>revision,isExporting:()=>(animation.exporting||tourExporting),
  snapshot:serialize,write:value=>api.save(value),start:()=>setStatus('Saving project…'),complete:(owner,text)=>status.complete(owner,text),
  onBusy:value=>{$('save').disabled=value;},onSaved:({current})=>{dirty=!current;api.setDirty(dirty).catch(()=>{});renderTabs();}});
function save(){return projectSaving.save();}
async function recover(){
  welcome?.close();welcome?.walkthrough.stop();
  if((animation.exporting||tourExporting))throw new Error('Finish or cancel animation export before recovering a project.');
  initialModelAllowed=false;
  catalogLoader.cancel();
  viewportControls.stop();animation.pause();
  let statusOwner;
  const result=await projectOpening.open({onStale:()=>status.complete(statusOwner,'File loading canceled because the workspace or export state changed.'),getProject:()=>project,getRevision:()=>revision,isExporting:()=>(animation.exporting||tourExporting),load:({signal})=>nativeJobs.run(id=>api.recover(id),'Recover autosave',{signal,onStatusOwner:owner=>statusOwner=owner}),publish:result=>{
    adopt(result.project);markDirty();setStatus((result.recoveryWarning?result.recoveryWarning+' ':'Recovered autosave. ')+'Save it as a project to keep it.');
  }});
  if(!result)throw new Error('No autosave snapshot is available.');
}
function historyStep(delta){if(!doc())return;const next=doc().cursor+delta;if(next<0||next>=doc().states.length)return;catalogLoader?.navigationChanged();doc().cursor=next;markDirty();renderWorkspace();}
imageCapture=new ImageCaptureSession({getProject:()=>project,getDocument:doc,getState:state,isExporting:()=>(animation.exporting||tourExporting),viewer:base,api,
  stop:()=>{viewportControls.stop();animation.pause();tours.pause();dualMorph?.pause();},
  getDisplay:()=>({camera:base.cameraState(),width:base.renderer.domElement.width,height:base.renderer.domElement.height}),
  prepare:async options=>{if(state().view.dualMorph?.enabled)await dualMorph.prepareCapture(options);if(!options.isCurrent())throw Object.assign(Error('Image capture source changed.'),{name:'AbortError'});await base.prepareCapture(options);},
  getOptions:()=>({transparent:$('png-transparent').checked,scale:Number($('png-scale').value),size:$('png-size').value,framing:$('png-framing').value,margin:Number($('png-margin').value),supersample:Number($('png-supersample').value)}),
  image:options=>base.image(options),onSaved:result=>{if(result)setStatus('Saved '+result.path);},
  onState:()=>{$('image').disabled=imageCapture.busy||!state()||animation.exporting||tourExporting;syncCancelAvailability();}});
function openGeometryExport(){
  if(animation.exporting||tourExporting)throw new Error('Finish animation export before exporting geometry.');
  const finishPausedSection=animation.playing&&derivedWork.active&&['section','cell-section'].includes(state()?.view.derivedMode);
  // Keep the reviewed source/derived result stable while the modal is open.
  viewportControls.stop();animation.pause();tours.pause();dualMorph?.pause();
  // Pausing revokes the in-flight animation frame. Reevaluate its now-frozen
  // applied plane under ordinary ownership so Derived can become available.
  if(finishPausedSection)refreshDerived().catch(error);
  return exportControls.open();
}
const showcase=new ShowcaseControls({...numericContext,api,run,setStatus,read:readCatalogEntry,libraryEntries:()=>[...presentationLibraryEntries],
  viewForModel:m=>({...defaults(m.dimension),...featuredView(m.dimension),...Object.fromEntries(['appearance','materialEffects','faces','edges','vertices','surfaceOpacity','edgeOpacity','edgeStyle','edgeRadius','vertexStyle','vertexRadius'].filter(key=>state().view[key]!==undefined).map(key=>[key,clone(state().view[key])]))}),
  assertAvailable:()=>{if(running.size||projectOpening.busy||projectSaving.busy||imageCapture?.busy||netEditor.exports.busy)throw Error('Finish the active computation or file action before presenting.');if(animation.playing||tours.playing||dualMorph?.playing||netEditor.playing)throw Error('Pause animation, tour, morph or folding playback before presenting.');},
  suspend:()=>{const source=state(),playing=viewportControls.playing,startup=viewportControls.startupRotation;viewportControls.stop();return ()=>{if(state()!==source)return;viewportControls.playing=playing;viewportControls.startupRotation=startup;viewportControls.syncPlaying();};},
  lock:value=>{tourExporting=value;animation.context.onExportStateChange();}});
function printNet(){
  if(animation.exporting||tourExporting)throw Error('Finish animation export before printing a net.');
  netEditor.cancelDrag();return netEditor.exports.run('print',{packed:state()?.view.net?.display==='pages'});
}
const actions={presentation:()=>showcase.enter(),new:()=>catalogLoader.open({key:'tesseract',name:'Tesseract'}),open,save,recover,undo:()=>historyStep(-1),redo:()=>historyStep(1),reset:()=>viewportControls.resetView(),fullscreen:()=>api.fullscreen(),image:()=>imageCapture.run(),help:()=>userGuide.show(),export:openGeometryExport,print:printNet};
actions.learn4d=()=>learn4D.open();
actions.commands=()=>discoverability.show();actions.shortcuts=()=>discoverability.showShortcuts();
actions.welcome=()=>welcome.show();
actions.whatsnew=()=>{welcome?.close();userGuide.show('whats-new');};
for(const id of ['about','quit','copy','paste','selectAll','zoomIn','zoomOut','resetZoom'])actions[id]=()=>api.discoveryMenu(id);
for(const [id,fn] of Object.entries(actions))actions[id]=(...args)=>{if(showcase.busy&&id!=='presentation')return;return workspaceAvailability.run(id,()=>fn(...args));};
for(const id of ['image','export','print','presentation']){const action=actions[id];actions[id]=(...args)=>{coxeterBuilder?.close();return action(...args);};}
for(const id of ['save','open','recover','presentation']){const action=actions[id];actions[id]=(...args)=>{learn4D?.close();return action(...args);};}
Object.entries(actions).forEach(([id,fn])=>{if($(id))$(id).onclick=guard(fn);});
api.onAction(name=>actions[name]&&guard(actions[name])());
$('close-help').onclick=()=>$('help-dialog').close();$('close-export').onclick=()=>exportControls.close();
$('confirm-export').onclick=guard(()=>exportControls.confirm());
async function exportDialogNet(format){
  if(netEditor.exports.busy)throw Error('Finish the current net export first.');
  const dialog=$('export-dialog'),scope=exportControls.scope,current=()=>dialog.open&&exportControls.scope===scope,cancel=()=>netEditor.exports.cancel();cancelDialogNet=cancel;
  try{const result=await netEditor.export(format,{isCurrent:current});if(result&&current())exportControls.close();return result;}catch(error){if(error.name==='AbortError'||!current())return null;throw error;}finally{if(cancelDialogNet===cancel)cancelDialogNet=null;}
}
$('export-net').onclick=guard(()=>exportDialogNet('svg'));
const pdfButton=el('button','Export current net as PDF','wide');pdfButton.id='export-net-pdf';$('export-dialog').append(pdfButton);pdfButton.onclick=guard(()=>exportDialogNet('pdf'));
$('search').oninput=()=>{if(libraryVisual.collection&&$('search').value.trim()){libraryVisual.collection=null;libraryVisual.showAll=true;}renderCatalog();};$('library-family').onchange=renderCatalog;document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderCatalog();});
auditFilter.onchange=renderCatalog;
$('close-library-dialog').onclick=()=>$('library-dialog').close();
$('library-open-anyway').onclick=guard(()=>{const entry=inspectedLibraryEntry;$('library-dialog').close();return catalogLoader.open(entry);});
$('library-repair-copy').onclick=guard(async()=>{const result=await api.repairLibraryCopy(inspectedLibraryEntry.key);if(result){setStatus('Saved validated edge-count copy '+result.path);$('library-dialog').close();}});
['face-fill-rule','surface-colors','surface-opacity'].forEach(id=>$(id).onchange=guard(()=>viewportControls.setDisplayOption(id,$(id).value)));
$('isolate-cell').onclick=guard(()=>viewportControls.setCellVisibility('isolate',$('visible-cell-id').value));
$('hide-cell').onclick=guard(()=>viewportControls.setCellVisibility('hide',$('visible-cell-id').value));
$('show-all-cells').onclick=guard(()=>viewportControls.setCellVisibility('all'));
organizeInspector(document);
$('construct-panel').prepend(openCoxeterBuilderButton);
const constructGallery=mountConstructGallery(document,{getModel:model,guide:userGuide});
organizeNetInspector(document);
liveSliders=new LiveSliders({...numericContext,run,commit:commitOperation,
  stop:()=>{viewportControls.stop();animation.pause();dualMorph?.pause();},
  show:m=>{
    if(!livePreviewHost){
      livePreviewHost=el('div',undefined,'live-preview-canvas');livePreviewHost.id='live-preview-canvas';livePreviewHost.hidden=true;$('base-canvas').parentElement.append(livePreviewHost);
      livePreviewBadge=el('div',undefined,'live-preview-badge');livePreviewBadge.id='live-preview-badge';
      const close=el('button','Cancel preview');close.id='live-preview-cancel';close.onclick=()=>liveSliders.cancel();livePreviewBadge.append('Explore · unsaved preview ',close);$('base-canvas').parentElement.append(livePreviewBadge);
      livePreviewViewer=new Viewer(livePreviewHost);
    }
    const first=livePreviewHost.hidden;livePreviewHost.hidden=false;livePreviewBadge.hidden=false;
    presentLivePreview(livePreviewViewer,base,m,{...defaults(m.dimension),...state().view},{first});
  },
  clear:()=>{if(livePreviewHost){livePreviewHost.hidden=true;livePreviewBadge.hidden=true;livePreviewViewer.clear();}}
});
new NetsFlow(document,{faceEditor:netEditor,cellEditor:cellNetEditor,fabrication:reinforcement.fabrication});
document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-panel]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});$('inspector-region').scrollTop=0;['info','construct','evidence','net'].forEach(p=>$(p+'-panel').hidden=p!==b.dataset.panel);});
PLANES.forEach(([a,b,label],i)=>{const row=el('div',undefined,'plane'),input=el('input');input.id='plane-'+i;input.type='range';input.min=-180;input.max=180;input.step=0.1;input.value=0;input.setAttribute('aria-label',label+' rotation');const output=el('output','0°');output.id='plane-output-'+i;row.append(el('label',label),input,output);$('planes').append(row);input.oninput=guard(()=>viewportControls.setAngle(i,input.value));});
['projection','faces-visible','vertices-visible'].forEach(id=>$(id).onchange=guard(()=>viewportControls.setDisplayOption(id,id==='projection'?$(id).value:$(id).checked)));
$('select-entity').onclick=guard(selectEntity);$('notes').oninput=editNotes;
$('measure').onclick=guard(()=>intrinsicReports.measure());
$('make-dual').onclick=guard(()=>commitOperation('dual',{},'Polar dual'));
$('truncate').onclick=guard(()=>workspaceNumeric.operation('truncate','truncation','Edge-cut truncation',{min:0,max:.5},'amount'));
$('extrude').onclick=guard(()=>workspaceNumeric.operation('extrude','extrusion-height','Prism extrusion',{min:0,exclusiveMin:true},'height'));
$('scale').onclick=guard(()=>workspaceNumeric.operation('transform','model-scale','Intrinsic scale',{},'scale'));
$('mirror').onclick=guard(()=>{const d=model().dimension,matrix=Array.from({length:d},(_,i)=>Array.from({length:d},(_,j)=>i===j?(i===0?-1:1):0));return commitOperation('transform',{matrix},'Coordinate reflection');});
$('generate').onclick=guard(()=>workspaceNumeric.generator());
$('build-hull').onclick=guard(()=>workspaceNumeric.hull());
$('coxeter-family').onchange=()=>{const d=Number($('coxeter-family').value.slice(-1));$('coxeter-rings').value='1'+'0'.repeat(d-1);};
$('wythoff').onclick=guard(()=>workspaceNumeric.wythoff());
$('copy-facets').onclick=()=>{$('facet-cycles').value=model().faces.map(f=>f.join(', ')).join('\n');};
$('facet').onclick=guard(()=>commitOperation('facet',{faces:$('facet-cycles').value.trim().split(/\n+/).map(rawNumbers)},'Manual faceting'));
$('evaluate').onclick=guard(async()=>{const result=await run('expression',{expression:$('expression').value},null,'Evaluate expression');$('expression-result').textContent=result.exactRational?`${result.exactRational} = ${format(result.value)} · rational exact`:`${format(result.value)} · float64 approximate`;});
const regular4dButton=el('button','Verify regular 4D identity','wide');regular4dButton.id='validate-regular4d';
const regular4dResult=el('output');regular4dResult.id='regular4d-validation-result';$('validate').after(regular4dButton,regular4dResult);
const intrinsicReports=new IntrinsicReportControls({...numericContext,getInput:$,reports,run,rawNumbers,format});
regular4dButton.onclick=guard(()=>intrinsicReports.identity());
$('validate').onclick=guard(async()=>{
  const ticket=reports.begin(['validation']);rememberValidationDetails();reportMessage('evidence','Checking current model…');
  try{const result=await run('validate',{},ticket.model,'Validate incidence',{signal:ticket.signal});if(reportCurrent(ticket,'validation','evidence'))renderValidation(document,ticket.model,result,{open:validationDetailsOpen});}
  catch(e){if(reportCurrent(ticket,'validation','evidence')){reportMessage('evidence',e.name==='AbortError'?'Validation canceled. Check again when ready.':'Validation could not finish. Try again.');throw e;}}
});
$('rational-hull').onclick=guard(()=>workspaceNumeric.hull(true));
$('certify-current').onclick=guard(()=>certifyCurrent({...numericContext,run,addDocument}));
$('rational-dual').onclick=guard(()=>commitOperation('rational-dual',{},'Exact rational polar dual'));
$('link-library').onclick=guard(async()=>{const result=await api.library();if(!result)return;acceptLinkedLibrary(result);const supported=result.entries.filter(e=>e.supported!==false).length;setStatus(`Indexed ${result.entries.length} OFF files from ${result.path}; ${supported} have supported headers. Geometry is checked when opened.`);});
actions['Shape builder']=window.openCoxeterBuilder;
exportControls.goals=new ExportGoals(exportControls,{guard,picture:()=>actions.image(),reveal:node=>discoverability.reveal(node)});
for(const [label,goal] of [['Export for 3D printing','print'],['Make a paper model','paper'],['Save picture','picture'],['Export video','video'],['Export to Blender or CAD','software'],['Export model data','geometry']])actions[label]=async()=>{await actions.export();return exportControls.goals.choose(goal);};
const discoverability=new DiscoverabilityControls({actions,guide:userGuide,guard,library:()=>[...catalog,...external],
  actionReason:id=>{if(['save','undo','redo','reset','image','export','print'].includes(id)&&!state()?.model)return 'Open a model first.';if(id==='undo'&&doc()?.cursor===0)return 'Already at the first history step.';if(id==='redo'&&doc()?.cursor===doc()?.states.length-1)return 'Already at the last history step.';return '';},
  libraryReason:()=>animation.exporting||tourExporting?'Finish export before opening a model.':'',openLibrary:entry=>{if(entry.external&&entry.auditStatus==='rejected')return inspectLibraryEntry(entry);const open=project.documents.findIndex(d=>d.states.length===1&&d.states[0].model?.metadata?.key===entry.key);return open>=0?activateDocument(open):catalogLoader.open(entry);}});
const appChrome=new AppChrome({guide:userGuide,api});
viewportControls.overlays?.configure({reveal:node=>discoverability.reveal(node)});
appearanceSheet=new AppearanceSheet({getState:state,isExporting:()=>(animation.exporting||tourExporting),radiusBusy:()=>Boolean(presentationControls.numericEntry),guard,display:displayBase,markDirty,
  refit:()=>{if(!state())return;base.resize();derived.resize();base.fit();state().view.camera=base.cameraState();if(state().view.viewportLayout==='split'){derived.fit();state().view.derivedCamera=derived.cameraState();}markViewDirty();}});
presentationControls.onRadiusEdit=()=>appearanceSheet.sync();
libraryVisual.mountOverflow();
welcome=new WelcomeControls({guard,setStatus,showWhatsNew:()=>actions.whatsnew(),samples:WELCOME_SAMPLES,refreshRecent:()=>desktopFiles.refresh(),reveal:node=>discoverability.reveal(node),readPreview:readCatalogEntry,
  explore:()=>{if(document.body.classList.contains('library-hidden'))$('toggle-library').click();libraryVisual.goHome();},
  openFile:()=>actions.open(),
  openFeatured:async(entry,{motion=false,split=false}={})=>{const m=await catalogLoader.open(entry);if(!m||model()!==m)return null;Object.assign(state().view,featuredView(m.dimension),split?{viewportLayout:'split'}:{});markViewDirty();renderWorkspace();if(motion)viewportControls.startStartupRotation();return m;},
  openSample:sample=>restoreMemoryState(JSON.parse(sample.source).documents[0].states[0],sample.title)});
$('cancel').addEventListener('click',()=>{densitySections.cancelActive();densitySectionControls.cancel();});
const desktopFiles=new DesktopFiles({api,open:token=>actions.open(token),isOpening:()=>projectOpening.busy||projectSaving.busy,notify:setStatus,onError:error,host:$('welcome-primary')});
learn4D=new Learn4D(createLessonWorkspace({document,getProject:()=>project,getDocument:doc,getState:state,run,uid,
  isExporting:()=>(animation.exporting||tourExporting),getDirty:()=>dirty,setDirty:value=>{dirty=value;api.setDirty(value).catch(()=>{});renderTabs();},
  assertAvailable:()=>{if(animation.exporting||tourExporting||showcase.busy||projectOpening.busy||projectSaving.busy||imageCapture?.busy||netEditor.exports.busy)throw Error('Finish the current task, then open Learn 4D.');if(animation.playing||tours.playing||tours.showing||tours.busy||dualMorph?.playing||netEditor.playing)throw Error('Pause the current animation, then open Learn 4D.');},
  hasBackgroundWork:()=>running.size||catalogLoader.pending.size||catalogDiscovery.pending||libraryPreviewJobs.pending.size,
  dismissWelcome:()=>{welcome?.close();welcome?.walkthrough.stop();},
  refitLayout:()=>{if(!state())return;base.resize();derived.resize();$('fit-view').click();},
  stop:()=>{welcome?.close();welcome?.walkthrough.stop();coxeterBuilder?.close();viewportControls.stop();animation.pause();tours.pause();dualMorph?.pause();netEditor.playing=false;},
  isRotating:()=>viewportControls.playing,resumeRotation:()=>{viewportControls.playing=true;viewportControls.syncPlaying();},
  initialState:initialDocumentState,markDirty,markViewDirty,viewport:viewportControls,refreshDerived,
  render:()=>{renderWorkspace();if(!state()){base.clear();derived.clear();$('model-name').textContent='Choose a model';renderTabs();}},
  updateSectionInputs:()=>{const v=state().view;$('section-normal').value=v.sectionNormal.join(', ');$('section-depth').value=v.sectionOffset;$('section-offset').value=v.sectionOffset;$('derived-mode').value=v.derivedMode;},
  updateView:()=>{displayBase();syncRotationPose();viewportControls.restoreDisplayInputs();viewportControls.sync();},
  fit:({baseOnly=false}={})=>{base.resize();base.fit();state().view.camera=base.cameraState();if(!baseOnly&&state().view.viewportLayout==='split'){derived.resize();derived.fit();state().view.derivedCamera=derived.cameraState();}}
}));
window.openLearn4D=guard(()=>actions.learn4d());
mountLearn4DCard(document,window.openLearn4D);
$('cancel').addEventListener('click',()=>{learn4D?.cancel();});
friendlyMessages.observeAvailability(()=>({hasModel:!!model(),dimension:model()?.dimension,cells:model()?.cells?.length||0,exporting:animation.exporting||tourExporting,saving:projectSaving.busy,canUndo:doc()?.cursor>0,canRedo:doc()?.cursor<doc()?.states.length-1}));
$('cancel').onclick=guard(async()=>{polychoronRelationships?.cancel();compoundControls.cancel();cancelDerivedPresentation();intrinsicReports.cancel();cellFacing.cancel();netEditor.exports.cancel();netEditor.cancelDrag();imageCapture?.cancel();initialModelAllowed=false;catalogDiscovery.cancel();nativeJobs.cancel();catalogLoader.cancel();sourceReflectionControls.cancel();coincidicRegimentControls.cancel();ordinaryCellSections.cancelActive();stellationCells?.cancel();basicSolidControls?.cancel();stephanoidControls?.cancel();sourceLabelPresets?.cancel();multipleViews?.close();projectiveDualControls?.cancel();dualMorph?.cancel();elementContent.invalidate();reinforcement?.cancel();coincidentAssembly?.cancel();densityInfo?.cancel();netEditor.sequence++;cellNetEditor.sequence++;workspaceNumeric.cancel();entityOrientation.cancelNumeric?.();symmetryOrientation.cancelNumeric();viewportControls.cancelNumeric?.();springControls?.cancel();presentationControls?.cancelNumeric();appearanceControls?.cancelNumeric();materialEffectsControls?.cancelNumeric();perspectiveControls?.cancelNumeric();measurementControls?.cancelNumeric?.();symmetryControls?.cancelNumeric?.();elementTypes.cancelNumeric();stellation?.cancelNumeric?.();animation?.cancelNumeric?.();tours?.cancelNumeric?.();for(const control of [faceConwayControls,sphereProjectionControls,vertexFigureConstruction,geodesicControls,convexCoreControls,expansionControls,fittingControls,exactSectionControls,incidenceTruncationControls,sourceZonohedronControls,subdivisionControls,cupolaControls,stepPrismControls,nobleControls,torusControls,watermanControls,productControls,antiprismControls,faceEditing,automaticFaceting,facetingDiagram,segmentotopeControls,starPolygonControls,podiaControls,crossedSegmentotopeControls]){control?.cancel?.();control?.cancelNumeric?.();}setStatus('Cancelled active computation.');});
const recoverySnapshots=new RecoverySnapshots({getProject:()=>project,getRevision:()=>revision,
  shouldSave:()=>dirty&&project.documents.length>0&&!(animation.exporting||tourExporting)&&!learn4D?.session,snapshot:serialize,write:value=>api.autosave(value),
  onSaved:({current})=>{$('autosave-status').textContent='Recovery snapshot '+new Date().toLocaleTimeString()+(current?'':' · newer changes pending');}});
setInterval(guard(()=>recoverySnapshots.save()),30000);
function frame(now){const dt=Math.min((now-lastFrame)/1000,0.1);lastFrame=now;if(showcase.busy){requestAnimationFrame(frame);return;}const rotated=viewportControls.tick(dt),folded=netEditor.tick(dt);if(rotated||folded||animation.playing)markPlaybackDirty();
  learn4D?.sync();
  if(livePreviewHost&&!livePreviewHost.hidden)livePreviewViewer.draw();
  coxeterBuilder?.sync();if(coxeterPreview&&!coxeterPreviewHost.hidden)coxeterPreview.draw();
  hoverIdentification.sync();base.draw();if(!startupModelRendered&&base.model){startupModelRendered=true;startupMark('first-model-rendered');}if(state()?.view.viewportLayout==='split'&&!$('derived-canvas').hidden)derived.draw();if(facetingPreview&&!$('facet-preview').hidden)facetingPreview.draw();if(diagramPreview&&!$('faceting-diagram-preview').hidden)diagramPreview.draw();if(running.size){const job=[...running.values()][0];$('job-time').textContent=((now-job.start)/1000).toFixed(1)+' s';}else $('job-time').textContent='';requestAnimationFrame(frame);}
requestAnimationFrame(frame);
workspaceAvailability.sync();
guard(async()=>{if(!api)throw new Error('Open this workspace with the desktop launcher.');const startup=await api.startupInfo?.()??{hidden:false};appChrome.startup(startup);viewportControls.overlays?.enable(!startup.hidden);welcome.hiddenMode=startup.hidden===true;libraryThumbnails.configure({hidden:startup.hidden===true});await desktopFiles.start();await catalogDiscovery.load().catch(error);renderCatalog();const initialProject=project,initialRevision=revision,m=catalogDiscovery.state==='ready'&&initialModelAllowed&&catalogLoader.sequence===0&&!project.documents.length?await catalogLoader.open({key:'tesseract',name:'Tesseract'}):null;if(m&&project===initialProject&&project.documents.length===1&&model()===m&&doc().states.length===1&&doc().cursor===0&&!state().view.entitySelection){Object.assign(state().view,startupView(state().view));$('projection').value=state().view.projection;$('projection').value=state().view.projection;displayBase();viewportControls.sync();viewportControls.startStartupRotation();dirty=false;api.setDirty(false);}if(!project.documents.length)$('model-name').textContent='Choose a model';try{const restored=await api.libraries();for(const library of restored.libraries)acceptLinkedLibrary(library);for(const failure of restored.errors)linkedLibraries.push({...failure,entries:[]});renderLinkedLibraries();if(restored.errors.length)setStatus('Some linked folders are unavailable. See the library panel.');}catch(e){error(e);}const recovery=await api.recoveryInfo();if(recovery)setStatus('Recovery snapshot available from '+new Date(recovery.modified).toLocaleString()+'. Use File → Recover autosave.');welcome.auto({hidden:startup.hidden,recoveryAvailable:!!recovery,opened:!initialModelAllowed||project!==initialProject||(m?model()!==m||project.documents.length!==1:!!project.documents.length)});})();
