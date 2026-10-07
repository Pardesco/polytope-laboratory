import {catalogMatches} from './catalog-query.mjs';
import {SourceReflectionControls} from './source-reflection-controls.mjs';
import {CoincidicRegimentControls} from './coincidic-regiment-controls.mjs';
import {UserGuide} from './user-guide.mjs';
import './style.css';
import { Viewer } from './viewer.js';
import {renderMorphElementContent} from './morph-element-content-renderer.mjs';
import {DualMorphControls} from './dual-morph-controls.mjs';
let dualMorph=null;
import { PLANES } from './projection.js';
import { StellationControls } from './stellation.js';
import {StellationCellControls} from './stellation-cell-controls.mjs';
let stellationCells=null;
import { NetEditor } from './net-editor.js';
import { CellNetEditor } from './cell-net-editor.js';
import { MeasurementControls } from './measurement-controls.js';
import { SymmetryControls } from './symmetry-controls.js';
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
import {CoincidentEdgeControls,checkedAssemblySVG} from './coincident-edge-controls.mjs';
import {GeneralizedDensityControls} from './generalized-density-controls.mjs';
import {publishBoundedExport} from './bounded-export.mjs';
let reinforcement=null,coincidentAssembly=null,densityInfo=null;
import {captureContentHistoryPublication} from './element-content-history.mjs';
import { PickingControls } from './picking-controls.mjs';
import { CompoundControls } from './compound-controls.mjs';
import { PerspectiveControls } from './perspective-controls.mjs';
import { SubdivisionControls } from './subdivision-controls.mjs';
import { SourceConstructionControls } from './source-construction-controls.mjs';
import {ExpansionControls} from './expansion-controls.mjs';
import {FittingControls} from './fitting-controls.mjs';
import {ExactSectionControls} from './exact-section-controls.mjs';
import {OrdinaryCellSectionWorkflow} from './ordinary-cell-section-workflow.mjs';
import {hasSectionSourceContent,rememberSectionSource,hasEmptySectionSource} from './section-source-content.mjs';
import {IncidenceTruncationControls} from './incidence-truncation-controls.mjs';
import {SphereProjectionControls} from './sphere-projection-controls.mjs';
import {ProjectiveDualControls} from './projective-dual-controls.mjs';
let sphereProjectionControls=null,projectiveDualControls=null;
import { SourceZonohedronControls } from './source-zonohedron-controls.mjs';
import {VertexFigureConstructionControls} from './vertex-figure-construction-controls.mjs';
import {MultiViewControls} from './multi-view-controls.mjs';
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
import { generateConstruction } from './construction-workflow.mjs';
import { WorkspaceNumericControls } from './workspace-numeric-controls.mjs';
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
import {SpringControls} from './spring-controls.mjs';
import { prepareHistoryCommit, prepareHistoryOpen, verifyHistoryPublication, preserveHistoryObserver } from './history-workflow.mjs';
import { createStatus } from './status.mjs';
import { openWorkspace } from './project-workflow.mjs';

const $=id=>document.getElementById(id),api=window.polytope;
const userGuide=new UserGuide($('help-dialog'));
const status=createStatus(text=>{$('status').textContent=text;});
const clone=x=>structuredClone(x),uid=()=>crypto.randomUUID();
const defaults=d=>({angles:d===4?[0,0,24,0,18,0]:Array(6).fill(0),projection:'orthographic',cameraProjection:'orthographic',viewportLayout:'single',pickKind:'edge',presentation:d===4?'translucent':'solid',faces:true,edges:true,vertices:false,fillRule:'nonzero',surfaceOpacity:d===4?.22:1,surfaceColors:'source',hiddenCells:[],isolatedCell:null,rotationPlane:d===4?2:1,rotationSpeed:12,derivedMode:d<3?'dual':'section',sectionNormal:Array(d).fill(0).map((_,i)=>i===d-1?1:0),sectionOffset:0,entity:0});
let project={format:'polytope-laboratory',version:1,active:0,documents:[]};
let catalog=[],external=[],linkedLibraries=[],filter='all',derivedModel=null,derivedResult=null,net=null,derivedSequence=0,analysisSequence=0;
let tourPreviewDocument=null,tourExporting=false;
let dirty=false,revision=0,lastFrame=performance.now(),toastTimer=null,measurementSequence=0,viewportControls,projectionFit,segmentotopeControls,segmentotopeAnalysis,augmentationControls,geodesicControls,convexCoreControls,expansionControls,fittingControls,exactSectionControls,incidenceTruncationControls,facePlacementControls,sourceZonohedronControls,springControls;
const running=new Map();
const doc=()=>project.documents[project.active],state=()=>doc()?.states[doc().cursor],model=()=>state()?.model;
const base=new Viewer($('base-canvas'),(index,count,kind='vertex')=>{ $('selection-kind').value=kind;$('selection-id').value=index;selectEntity();if(count>1)setStatus(`${count} source ${kind} candidates near this point. Click again to cycle them.`); });
const derived=new Viewer($('derived-canvas'),index=>{if(derivedResult?.sourceReferences?.[index]){const refs=derivedResult.sourceReferences[index];const edge=refs.find(r=>r.edge!==undefined)?.edge;if(edge!==undefined){$('selection-kind').value='edge';$('selection-id').value=edge;selectEntity();}}});
base.onPickDiagnostic=message=>{if(message)setStatus(message);};
base.onDisplay=diagnostic=>{displayDiagnostic(diagnostic);projectionFit?.notify();};
base.onCamera=value=>{projectionFit?.cancel();if(state()){state().view.camera=value;if(viewportControls)viewportControls.orientation.value='free';markDirty();}};
derived.onCamera=value=>{if(state()){state().view.derivedCamera=value;markDirty();}};

function markDirty(){sourceReflectionControls?.sync();coincidicRegimentControls?.sync();basicSolidControls?.sync();dualMorph?.sync();tours?.invalidatePreview();dirty=true;revision++;api.setDirty(true).catch(()=>{});segmentotopeControls?.sync();segmentotopeAnalysis?.sync();augmentationControls?.sync();geodesicControls?.sync();convexCoreControls?.sync();expansionControls?.sync();fittingControls?.sync();exactSectionControls?.sync();incidenceTruncationControls?.sync();sphereProjectionControls?.sync();projectiveDualControls?.sync();facePlacementControls?.sync();sourceZonohedronControls?.sync();vertexFigureConstruction?.sync();multipleViews?.sync();springControls?.sync();automaticFaceting?.sync();facetingDiagram?.sync();elementContent?.sync();sourceLabelPresets?.sync();stellationCells?.sync();reinforcement?.sync();coincidentAssembly?.sync();densityInfo?.sync();}
function setStatus(text){return status.set(text);}
function error(e){const message=e?.message||String(e);setStatus(message);$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,9000);}
function guard(fn){return async(...args)=>{try{return await fn(...args);}catch(e){error(e);}};}
async function run(op,params={},source=null,label=op,{signal}={}){
  if(signal?.aborted)throw new Error('Animation preparation cancelled.');
  const id=uid(),start=performance.now();running.set(id,{label,start});const statusOwner=setStatus(label+'…');$('cancel').hidden=false;
  const abort=()=>api.cancel(id).catch(()=>{});signal?.addEventListener('abort',abort,{once:true});
  try{const result=await api.engine({op,params,model:source},id);status.complete(statusOwner,`${label} completed in ${((performance.now()-start)/1000).toFixed(2)} s`);return result;}
  finally{signal?.removeEventListener('abort',abort);running.delete(id);$('cancel').hidden=!running.size;}
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
const stellation=new StellationControls({...numericContext,getState:state,getModel:model,run,number,rawNumbers,guard,markDirty,refresh:refreshDerived,api,setStatus});
const netEditor=new NetEditor({getState:state,getModel:model,getProject:()=>project,getDocument:doc,number,isExporting:()=>(animation.exporting||tourExporting),isBusy:()=>animation.playing||viewportControls?.playing||tours?.playing,run,guard,markDirty,refresh:refreshDerived,viewer:derived,api,setStatus,renderElementContent:options=>elementContent.refresh(derived,options)});
const cellNetEditor=new CellNetEditor({getState:state,getModel:model,getProject:()=>project,getDocument:doc,number,isExporting:()=>(animation.exporting||tourExporting),isBusy:()=>animation.playing||viewportControls?.playing||tours?.playing,run,guard,markDirty,refresh:refreshDerived,viewer:derived,onSourceSelection:(kind,index,dirty)=>{$('selection-kind').value=kind;$('selection-id').value=index;selectEntity(dirty);}});
const measurementControls=new MeasurementControls({...numericContext,getState:state,getModel:model,run,guard,markDirty,refresh:refreshDerived,number,rawNumbers,format});
const symmetryControls=new SymmetryControls({...numericContext,getState:state,run,guard,markDirty,viewer:base,format});
const animationRenderer=new AnimationRenderer({getState:state,viewer:base,netViewer:derived,run,onMorphPose:(frame,prepared)=>dualMorph?.adoptAnimationPose(frame,prepared),display:()=>{displayBase();viewportControls?.sync();},syncPose:view=>{syncRotationPose();$('section-depth').value=view.sectionOffset;$('section-offset').value=view.sectionOffset;$('derived-mode').value=view.derivedMode;},refreshDerived:options=>refreshDerived({throwOnError:true,preserveLayout:true,...options}),refreshSection:options=>refreshDerived({throwOnError:true,...options}),showNet:pose=>{++derivedSequence;derivedModel=null;derivedResult=null;net=pose.foldNet;$('promote').disabled=true;$('net-preview').hidden=true;$('derived-canvas').hidden=false;$('derived-mode').value='net';$('derived-status').textContent='Rigid face-net fold: '+format(pose.frame.foldFraction);viewportControls?.sync();}});
const animation=new AnimationControls({...numericContext,getState:state,getModel:model,isExporting:()=>tourExporting,viewer:base,sectionViewer:derived,netViewer:derived,capabilities:()=>animationRenderer.capabilities(),loadPlanes:(m,o)=>animationRenderer.loadPlanes(m,o),loadNet:(m,o)=>animationRenderer.loadNet(m,o),loadMorph:(m,s,o)=>animationRenderer.loadMorph(m,s,o),renderTracks:(p,o)=>animationRenderer.renderTracks(p,o),clearTracks:()=>animationRenderer.clearTracks(),display:displayBase,refreshSection:()=>{const source=state(),generation=animation.generation;const current=()=>state()===source&&animation.generation===generation&&!tourExporting;return refreshDerived({throwOnError:true,isCurrent:current,exportOwner:animation.exporting?()=>animation.exporting&&current():undefined});},markDirty,api,setStatus,guard,stopLegacy:()=>{dualMorph?.cancel();viewportControls?.stop();},onExportStateChange:()=>{sourceReflectionControls?.sync();coincidicRegimentControls?.sync();dualMorph?.sync();animation.update();projectionFit?.cancel();viewportControls?.sync();memories?.sync();entityOrientation?.sync();cellFacing?.sync();historyControls?.sync();presentationControls?.sync();appearanceControls?.sync();materialEffectsControls?.sync();tours?.sync();faceEditing?.sync();automaticFaceting?.sync();facetingDiagram?.sync();pickingControls?.sync();compoundControls?.sync();perspectiveControls?.sync();subdivisionControls?.sync();cupolaControls?.sync();starPolygonControls?.sync();productControls?.sync();antiprismControls?.sync();stepPrismControls?.sync();nobleControls?.sync();stephanoidControls?.sync();basicSolidControls?.sync();torusControls?.sync();podiaControls?.sync();watermanControls?.sync();crossedSegmentotopeControls?.sync();augmentationControls?.sync();geodesicControls?.sync();convexCoreControls?.sync();expansionControls?.sync();fittingControls?.sync();exactSectionControls?.sync();incidenceTruncationControls?.sync();sphereProjectionControls?.sync();projectiveDualControls?.sync();facePlacementControls?.sync();sourceZonohedronControls?.sync();vertexFigureConstruction?.sync();multipleViews?.sync();springControls?.sync();segmentotopeControls?.sync();segmentotopeAnalysis?.sync();elementContent?.sync();sourceLabelPresets?.sync();stellationCells?.sync();reinforcement?.sync();coincidentAssembly?.sync();densityInfo?.sync();projectMetadata?.sync();},showSection:()=>{state().view.viewportLayout='split';viewportControls?.sync();},syncPose:view=>{syncRotationPose();$('section-depth').value=view.sectionOffset;$('section-offset').value=view.sectionOffset;$('derived-mode').value=view.derivedMode;}});
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
const memories=new MemoryControls({getProject:()=>project,getState:state,getSource:target=>({documentId:doc().id,modelId:(target==='derived'?derivedModel:model())?.id,...target==='derived'?{derivedMode:state().view.derivedMode}:{}}),getDerivedState:()=>derivedModel?{model:derivedModel,view:{...defaults(derivedModel.dimension),fillRule:state().view.fillRule||'nonzero',surfaceColors:state().view.surfaceColors||'source'},notes:state().notes||'',label:'Derived '+state().view.derivedMode}:null,restoreState:restoreMemoryState,addStates:addMemoryStates,markDirty,setStatus,guard,isExporting:()=>(animation.exporting||tourExporting)});
const tours=new TourControls({...numericContext,getProject:()=>project,getState:state,showEvent:showTourEvent,createRenderer:createTourRenderer,api,onExportStateChange:value=>{tourExporting=value;animation.context.onExportStateChange();},markDirty,guard,isExporting:()=>(animation.exporting||tourExporting),stopOther:()=>{dualMorph?.pause();viewportControls?.stop();animation.pause();},importTour:api.importTour,exportTour:api.exportTour,setStatus});
viewportControls=new ViewportControls({...numericContext,getState:state,getModel:model,base,derived,display:displayBase,markDirty,isExporting:()=>(animation.exporting||tourExporting),stopTrack:()=>animation.pause(),syncPose:syncRotationPose,refreshDerived,cancelProjectionFit:()=>projectionFit?.cancel()});
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
const cellFacing=new CellFacingControls({getState:state,isExporting:()=>(animation.exporting||tourExporting),guard,evaluate:m=>run('cell-facing',{},m,'Evaluate source cell planes'),getCounts:()=>base.facingCounts,display:displayBase,markDirty});
const historyControls=new HistoryControls({getState:state,getDocument:doc,isExporting:()=>(animation.exporting||tourExporting),guard,replay:()=>openRecipeDocument('recipe-replay'),branch:params=>openRecipeDocument('recipe-branch',params)});
const exportControls=new ExportControls({getState:state,getDerived:()=>derivedModel,isExporting:()=>(animation.exporting||tourExporting),prepare:(m,p)=>run('prepare-export',p,m,'Prepare geometry export'),export:api.export,setStatus});
const presentationControls=new PresentationControls({...numericContext,getState:state,isExporting:()=>(animation.exporting||tourExporting),guard,display:displayBase,markDirty});
const appearanceControls=new AppearanceControls({...numericContext,getState:state,isExporting:()=>(animation.exporting||tourExporting),guard,display:displayBase,markDirty});
const materialEffectsControls=new MaterialEffectsControls({...numericContext,getState:state,isExporting:()=>(animation.exporting||tourExporting),guard,display:displayBase,markDirty});
const faceEditing=new FaceEditingControls({...numericContext,getState:state,isExporting:()=>(animation.exporting||tourExporting),guard,number,analyze:async(m,p,{signal,verifyPublication}={})=>{verifyPublication?.();const result=await run('face-coincidences',p,m,'Inspect coincident faces',{signal});verifyPublication?.();return result;},commit:commitOperation});
let facetingPreview;
const automaticFaceting=new AutomaticFacetingControls({...numericContext,read:async(op,p,m,{signal,verifyPublication})=>{verifyPublication();const result=await run(op,p,m,'Automatic facets',{signal});verifyPublication();return result;},commit:commitOperation,preview:async(m,{verifyPublication})=>{verifyPublication();const container=$('facet-preview');container.hidden=false;facetingPreview??=new Viewer(container);facetingPreview.setModel(m);facetingPreview.setDisplay({...defaults(3),surfaceColors:'source',vertices:false});facetingPreview.fit();},clearPreview:()=>facetingPreview?.clear()});
const facetingDiagram=new FacetingDiagramControls({...numericContext,
  catalogue:()=>{if(!automaticFaceting.catalogue)throw Error('Build a candidate pool first.');verifyNativeSource(numericContext,automaticFaceting.catalogueOwner);if(automaticFaceting.generationSignature()!==automaticFaceting.catalogueForm)throw Error('Candidate source actions or bounds changed. Rebuild first.');return automaticFaceting.catalogue;},
  selectedResult:()=>automaticFaceting.selected(),searchSignature:()=>JSON.stringify({fields:automaticFaceting.signature(),result:automaticFaceting.node('result').value}),
  read:automaticFaceting.context.read,commit:commitOperation,preview:automaticFaceting.context.preview,
  clearPreview:()=>{automaticFaceting.clearPreview();},
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
stellationCells=new StellationCellControls({...numericContext,getState:state,getDocument:doc,getProject:()=>project,getConfig:()=>stellation.config(),isExporting:()=>(animation.exporting||tourExporting),guard,run,applySelection:ids=>{const s=state();s.view.derivedMode='stellation';stellation.config(s).display='solid';$('derived-mode').value='stellation';$('stellation-display').value='solid';markDirty();refreshDerived();},saveSvg:(svg,name)=>api.saveSvg(svg,name)});
const compoundControls=new CompoundControls({getState:state,isExporting:()=>(animation.exporting||tourExporting),guard,commit:commitOperation});
const perspectiveControls=new PerspectiveControls({...numericContext,getState:state,isExporting:()=>(animation.exporting||tourExporting),guard,display:displayBase,markDirty});
const subdivisionControls=new SubdivisionControls({...numericContext,getState:state,isExporting:()=>(animation.exporting||tourExporting),guard,commit:commitOperation});
const sourceConstructionContext={...numericContext,getState:state,getDocument:doc,getProject:()=>project,isExporting:()=>(animation.exporting||tourExporting),guard,number,commit:commitOperation};
const sourceReflectionControls=new SourceReflectionControls(sourceConstructionContext);
const coincidicRegimentControls=new CoincidicRegimentControls({...sourceConstructionContext,setStatus,restoreState:restoreMemoryState,onSelect:(kind,index)=>{$('selection-kind').value=kind;$('selection-id').value=index;return selectEntity(true);},navigateDocument:id=>{const index=project.documents.findIndex(d=>d.id===id);if(index<0)throw Error('Comparison source document is no longer open.');project.active=index;markDirty();renderWorkspace();}});
geodesicControls=new SourceConstructionControls(sourceConstructionContext,'geodesic');
convexCoreControls=new SourceConstructionControls(sourceConstructionContext,'core');
expansionControls=new ExpansionControls(sourceConstructionContext);
fittingControls=new FittingControls({...sourceConstructionContext,preview:async(op,params,{sourceSnapshot,signal,verifyPublication})=>{verifyPublication();const result=await run(op,params,sourceSnapshot,'Preview geometry fit',{signal});verifyPublication();return result;}});
exactSectionControls=new ExactSectionControls({...sourceConstructionContext,preview:async(op,params,{sourceSnapshot,signal,verifyPublication})=>{verifyPublication();const result=await run(op,params,sourceSnapshot,'Compute exact surface section',{signal});verifyPublication();return result;}});
incidenceTruncationControls=new IncidenceTruncationControls({...sourceConstructionContext,preview:async(op,params,{sourceSnapshot,signal,verifyPublication})=>{verifyPublication();const result=await run(op,params,sourceSnapshot,'Compute source edge cut',{signal});verifyPublication();return result;}});
sphereProjectionControls=new SphereProjectionControls(sourceConstructionContext);
projectiveDualControls=new ProjectiveDualControls({...sourceConstructionContext,run,markDirty,setStatus,saveImage:data=>api.saveImage(data),onSelect:(kind,index)=>{$('selection-kind').value=kind;$('selection-id').value=index;selectEntity(true);}});
sourceZonohedronControls=new SourceZonohedronControls(sourceConstructionContext,{anchor:'convex-core-settings'});
vertexFigureConstruction=new VertexFigureConstructionControls({...sourceConstructionContext,run,addDocument});
multipleViews=new MultiViewControls({...numericContext,Viewer,getState:state,getSource:model,getProject:()=>project,getDocument:doc,isExporting:()=>(animation.exporting||tourExporting),guard,markDirty,setStatus,saveImage:data=>api.saveImage(data),describeContent:(m,p,o)=>run('element-content-describe',p,m,'Prepare multiple-view content',o),onSelect:(index,count,kind)=>{$('selection-kind').value=kind;$('selection-id').value=index;selectEntity();}});
springControls=new SpringControls({...sourceConstructionContext,preview:async(op,params,{sourceSnapshot,signal,verifyPublication})=>{verifyPublication();const result=await run(op,params,sourceSnapshot,'Preview spring relaxation',{signal});verifyPublication();return result;}},{anchor:'convex-core-settings'});
const cupolaControls=new CupolaControls({...numericContext,guard,number,isExporting:()=>(animation.exporting||tourExporting),generate:(params,options)=>constructDocument('cupola',params,'Generate cupola',options)});
const starPolygonControls=new StarPolygonControls({...numericContext,guard,number,isExporting:()=>(animation.exporting||tourExporting),generate:(params,options)=>constructDocument('regular-star-polygon',params,'Generate regular polygon',options)});
const productControls=new ProductControls({...numericContext,guard,number,getState:state,commit:commitOperation,isExporting:()=>(animation.exporting||tourExporting),generate:(params,options)=>constructDocument('polygon-product',params,'Polygon product',options)});
const antiprismControls=new AntiprismControls({...numericContext,guard,number,getState:state,commit:commitOperation,isExporting:()=>(animation.exporting||tourExporting),generate:(kind,params,options)=>constructDocument(kind,params,kind==='antiduoprism'?'Generate antiduoprism':'Generate rational antiprism',options)});
const stepPrismControls=new StepPrismControls({...numericContext,guard,number,isExporting:()=>(animation.exporting||tourExporting),generate:(kind,params,options)=>constructDocument(kind,params,'Generate step prism',options)});
const nobleControls=new NobleControls({...numericContext,guard,isExporting:()=>(animation.exporting||tourExporting),generate:(kind,params,options)=>constructDocument(kind,params,'Generate noble disphenoid',options)});
stephanoidControls=new StephanoidControls({...numericContext,guard,isExporting:()=>(animation.exporting||tourExporting),generate:(kind,params,options)=>constructDocument(kind,params,'Generate stephanoid',options)});
basicSolidControls=new BasicSolidControls({...numericContext,guard,isExporting:()=>(animation.exporting||tourExporting),generate:(kind,params,options)=>constructDocument(kind,params,'Generate '+kind,options)});
const projectMetadata=new ProjectMetadataControls({...numericContext,markDirty,refresh:()=>{renderTabs();$('model-name').textContent=state().view.documentMetadata?.title?.trim()||model().name;}});
const torusControls=new TorusControls({...numericContext,guard,number,getProject:()=>project,isExporting:()=>(animation.exporting||tourExporting),generate:(kind,params,options)=>constructDocument(kind,params,'Generate torus',options)});
const podiaControls=new PodiaControls({...numericContext,guard,number,getProject:()=>project,isExporting:()=>(animation.exporting||tourExporting),generate:(kind,params,options)=>constructDocument(kind,params,kind==='rational-podium'?'Generate podium':'Generate antipodium',options)});
const watermanControls=new WatermanControls({...numericContext,guard,isExporting:()=>(animation.exporting||tourExporting),generate:(kind,params,options)=>constructDocument(kind,params,'Generate Waterman hull',options)});
segmentotopeControls=new SegmentotopeControls({...numericContext,guard,number,getState:state,getProject:()=>project,getMemories:()=>project.memories,isExporting:()=>(animation.exporting||tourExporting),commit:commitOperation});
segmentotopeAnalysis=new SegmentotopeAnalysisControls({guard,getState:state,isExporting:()=>(animation.exporting||tourExporting),analyze:(m,p)=>run('analyze-strict-segmentotope',p,m,'Check strict predicates')});
const crossedSegmentotopeControls=new CrossedSegmentotopeControls({...numericContext,guard,number,getProject:()=>project,isExporting:()=>(animation.exporting||tourExporting),generate:(kind,params,options)=>constructDocument(kind,params,'Generate crossed antiprism product',options)});
augmentationControls=new AugmentationControls({guard,number,getState:state,getDocument:doc,getProject:()=>project,getWorkspace:()=>project,getMemories:()=>project.memories,isExporting:()=>(animation.exporting||tourExporting),commit:commitOperation});
facePlacementControls=new FacePlacementControls({guard,number,getState:state,getDocument:doc,getProject:()=>project,getMemories:()=>project.memories,isExporting:()=>(animation.exporting||tourExporting),commit:commitOperation});
function constructDocument(kind,params,label,options){return generateConstruction({getProject:()=>project,isExporting:()=>(animation.exporting||tourExporting),run,addDocument},kind,params,label,options);}
const ordinaryCellSections=new OrdinaryCellSectionWorkflow({...sourceConstructionContext,run,publishHistory:result=>{project.documents.push({...result,id:uid(),name:'Ordinary cell section'});project.active=project.documents.length-1;markDirty();renderWorkspace();}});
const workspaceNumeric=new WorkspaceNumericControls({...numericContext,getInput:$,commit:commitOperation,generate:constructDocument,run,addDocument,markDirty,refreshDerived});
function syncRotationPose(){const v=state()?.view;if(v)PLANES.forEach((_,i)=>{if($('plane-'+i)){$('plane-'+i).value=v.angles[i]||0;$('plane-output-'+i).textContent=format(v.angles[i]||0)+'°';}});}
const unitControls=el('div');unitControls.innerHTML='<label>Coordinate units <select id="model-unit"><option value="model">Model units</option><option>mm</option><option>cm</option><option>m</option><option>in</option><option>ft</option></select></label><label>Reference edge <input id="reference-edge" type="number" min="0" value="0" step="1"></label><label>Desired edge length <input id="reference-length" value="1"></label><button id="scale-reference">Scale to reference</button>';
$('scale').after(unitControls);
$('model-unit').onchange=()=>{state().view.coordinateUnit=$('model-unit').value;markDirty();};
$('scale-reference').onclick=guard(()=>workspaceNumeric.referenceScale());
const auditFilter=el('select');auditFilter.id='library-audit-filter';auditFilter.setAttribute('aria-label','Filter library validation status');
for(const [value,label] of [['all','All validation statuses'],['passed','Passed'],['rejected','Rejected'],['untested','Untested'],['stale','Stale evidence'],['reference','Independent references']])auditFilter.append(new Option(label,value));
$('library-family').after(auditFilter);
let inspectedLibraryEntry=null;
function inspectLibraryEntry(entry){
  inspectedLibraryEntry=entry;
  $('library-source-info').textContent=JSON.stringify({path:entry.key,relativePath:entry.relativePath,counts:entry.counts,auditStatus:entry.auditStatus||'untested',diagnostic:entry.auditDiagnostic||entry.diagnostic,errors:entry.auditErrors,warnings:entry.auditWarnings,sourceHash:entry.sourceHash},null,2);
  $('library-repair-copy').disabled=!entry.supported;$('library-dialog').showModal();
}
const cellNetOption=el('option','4D CELL NET');cellNetOption.value='cell-net';$('derived-mode').append(cellNetOption);
const incidenceDualOption=el('option','3D / 4D INCIDENCE DUAL');incidenceDualOption.value='incidence-dual';$('derived-mode').append(incidenceDualOption);
const faceOption=el('option','FACE');faceOption.value='face';$('derived-mode').append(faceOption);
const reciprocal=document.createElement('div');reciprocal.innerHTML='<label>Reciprocation center <input id="incidence-dual-center" placeholder="Vertex mean, or 3 / 4 coordinates"></label><label>Reciprocation radius <input id="incidence-dual-radius" value="1"></label><button id="make-incidence-dual" class="wide">Construct 3D / 4D incidence dual</button><p class="muted">Preserves ordered links and complete cells, including finite star incidence. Requires closed local boundaries. Face or cell planes through the center, coincident reciprocal identities and unresolved links are diagnosed. Convex polar dual remains a separate operation.</p>';$('make-dual').after(reciprocal);
$('make-incidence-dual').onclick=guard(()=>workspaceNumeric.incidenceDual());
const stellationOption=el('option','3D STELLATION');stellationOption.value='stellation';$('derived-mode').append(stellationOption);

function renderCatalog(){
  const query=$('search').value.toLowerCase().trim(),entries=[...catalog,...external];
  const familySelect=$('library-family'),selectedFamily=familySelect.value;
  const families=[...new Set(entries.map(e=>e.family||'Linked OFF'))].sort();
  familySelect.replaceChildren(new Option('All families','all'),...families.map(f=>new Option(f,f)));
  familySelect.value=families.includes(selectedFamily)?selectedFamily:'all';
  const filtered=entries.filter(e=>(filter==='all'||String(e.dimension)===filter)&&(familySelect.value==='all'||(e.family||'Linked OFF')===familySelect.value)&&(auditFilter.value==='all'||(e.external?(e.auditStatus||'untested'):'reference')===auditFilter.value)&&catalogMatches(e,query));
  $('library-count').textContent=filtered.length;
  $('catalog').replaceChildren();
  // Window the external listing; full name search still covers every record.
  filtered.slice(0,250).forEach(entry=>{
    const button=el('button',undefined,'catalog-entry');button.dataset.key=entry.key;
    button.disabled=entry.external&&entry.supported===false;
    button.title=entry.external?[entry.relativePath,entry.diagnostic||'Header indexed; geometry is checked when opened.',entry.counts?'V / E / F / C: '+entry.counts.join(' / '):''].filter(Boolean).join('\n'):[entry.name,entry.catalogStatus,entry.sourceClassification,entry.chiralityStatus,entry.uniformSnubVariant?.labelBasis,entry.classificationVerified===false?'Classification unverified':''].filter(Boolean).join('\n');
    if(entry.key===model()?.metadata?.key)button.classList.add('active');
    button.append(el('span',entry.dimension?entry.dimension+'D':'OFF','dim'),el('span',entry.name,'entry-name'),el('small',[entry.symbol,entry.family].filter(Boolean).join(' · ')));
    if(entry.external&&entry.supported===false)button.append(el('small',entry.diagnostic||'Unsupported OFF file','muted'));
    if(entry.external){const status=entry.auditStatus||'untested';button.append(el('small',status+(entry.auditDiagnostic?' · '+entry.auditDiagnostic:''),'audit-badge audit-'+status));}
    button.onclick=guard(async()=>{if(entry.external&&entry.auditStatus==='rejected'){inspectLibraryEntry(entry);return;}let result;if(entry.external)result=(await api.libraryModel(entry.key)).model;else result=await run('generate',{kind:'regular',key:entry.key},null,'Generate '+entry.name);addDocument(result);});
    button.oncontextmenu=event=>{if(entry.external){event.preventDefault();inspectLibraryEntry(entry);}};
    $('catalog').append(button);
  });
  if(filtered.length>250)$('catalog').append(el('p','Showing 250 matches. Refine search to find any indexed entry.','muted'));
  if(!filtered.length)$('catalog').append(el('p','No matching models. Try another family or search.','muted'));
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
    button.onclick=()=>{project.active=i;renderWorkspace();markDirty();};$('document-tabs').append(button);
  });
}
function renderHistory(){
  $('history-list').replaceChildren();doc().states.forEach((s,i)=>{const button=el('button',`${i+1} ${s.label||s.model.provenance?.operation||'model'}`);if(i===doc().cursor)button.classList.add('active');button.onclick=()=>{doc().cursor=i;markDirty();renderWorkspace();};$('history-list').append(button);});
  historyControls.sync();
  $('undo').disabled=doc().cursor===0;$('redo').disabled=doc().cursor===doc().states.length-1;
}
function addDocument(m,label='Generate'){
  const view=defaults(m.dimension);view.coordinateUnit=['model','mm','cm','m','in','ft'].includes(m.metadata?.coordinateUnits)?m.metadata.coordinateUnits:({1:'in',2:'ft',4:'mm',5:'cm',6:'m'}[m.metadata?.dxf?.insunits]||'model');view.fillRule=m.metadata?.fillRule||view.fillRule;if(['generalized-complex','surface-section'].includes(m.interpretation)&&m.faces.length)view.derivedMode='face';if(m.interpretation==='surface-section'&&!m.faces.length)view.derivedMode='section-evidence';if(m.metadata?.family==='Kepler-Poinsot')view.derivedMode='incidence-dual';
  if(m.metadata?.dxf){view.faces=m.faces.length>0;const incident=new Set(m.edges.flat());view.vertices=m.vertices.some((_,i)=>!incident.has(i));view.presentation=view.faces?'solid':'wireframe';}
  const importedMetadata=m.metadata?.documentMetadata;
  if(importedMetadata&&typeof importedMetadata==='object'&&!Array.isArray(importedMetadata)&&['title','author','reference','description'].every(key=>importedMetadata[key]===undefined||typeof importedMetadata[key]==='string'))view.documentMetadata=clone(importedMetadata);
  const notes=typeof m.metadata?.documentNotes==='string'?m.metadata.documentNotes:'';
  clearTimeout(toastTimer);$('toast').hidden=true;
  project.documents.push({id:uid(),cursor:0,states:[{model:m,view,label,notes}]});project.active=project.documents.length-1;markDirty();renderWorkspace();
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

function displayBase(){
  const s=state();if(!s)return;
  sourceReflectionControls?.sync();coincidicRegimentControls?.sync();perspectiveControls.sync();subdivisionControls.sync();productControls.sync();antiprismControls.sync();stepPrismControls.sync();nobleControls.sync();torusControls.sync();podiaControls.sync();watermanControls.sync();crossedSegmentotopeControls.sync();augmentationControls.sync();geodesicControls.sync();convexCoreControls.sync();expansionControls.sync();fittingControls.sync();exactSectionControls.sync();incidenceTruncationControls.sync();sphereProjectionControls?.sync();projectiveDualControls?.sync();facePlacementControls.sync();sourceZonohedronControls.sync();vertexFigureConstruction?.sync();multipleViews?.sync();segmentotopeControls.sync();segmentotopeAnalysis.sync();
  displayDiagnostic(base.setDisplay(s.view));
  if(derived.model&&(derived.view?.appearance!==s.view.appearance||derived.view?.materialEffects!==s.view.materialEffects))derived.setDisplay({...derived.view,appearance:s.view.appearance,materialEffects:s.view.materialEffects});
  elementContent.refresh().catch(e=>{if(state()===s){elementContent.node('status').textContent=e.message;elementContent.node('status').dataset.status='presentation-refused';}});
}
function displayDiagnostic(diagnostic){
  const messages=[];if(base.appearanceEffectsDiagnostic)messages.push(base.appearanceEffectsDiagnostic);if(diagnostic?.clippedEdges)messages.push(`${diagnostic.clippedEdges} edges clipped by projection limits`);
  if(diagnostic?.orientationDiagnostic)messages.push(diagnostic.orientationDiagnostic);
  if(diagnostic?.facingDiagnostic)messages.push(diagnostic.facingDiagnostic);
  if(diagnostic?.presentationDiagnostic)messages.push(diagnostic.presentationDiagnostic);
  if(diagnostic?.stereographicDiagnostic)messages.push(diagnostic.stereographicDiagnostic);
  if(diagnostic?.perspectiveDiagnostic)messages.push(diagnostic.perspectiveDiagnostic);
  if(diagnostic?.explosionDiagnostic)messages.push(diagnostic.explosionDiagnostic);
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
}
function renderWorkspace(){
  dualMorph?.invalidate();
  automaticFaceting.invalidate();facetingDiagram.invalidate();
  elementContent.invalidate();reinforcement?.invalidate();coincidentAssembly?.invalidate();densityInfo?.invalidate();
  projectionFit?.cancel();
  const m=model(),v=state()?.view;if(!m)return;
  animationRenderer.clearTracks();
  viewportControls.stop();
  animation.sync();
  measurementSequence++;$('measurement-result').textContent='';
  $('model-name').textContent=v.documentMetadata?.title?.trim()||m.name;$('model-family').textContent=(m.metadata?.family||m.interpretation).toUpperCase();$('dimension-badge').textContent=m.dimension+'D';
  $('numeric-badge').textContent=m.numeric?.mode==='rational-exact'?'RATIONAL':'FLOAT64 · APPROX';
  $('model-unit').value=v.coordinateUnit||'model';
  regular4dButton.hidden=!m.metadata?.regular4dIdentity;regular4dResult.textContent='';for(const key of ['status','key','flags'])delete regular4dResult.dataset[key];
  $('notes').value=state().notes||'';$('projection').value=v.projection;$('faces-visible').checked=v.faces;$('vertices-visible').checked=v.vertices;
  $('face-fill-rule').value=v.fillRule||'nonzero';$('surface-opacity').value=v.surfaceOpacity??(m.dimension===4?.12:.28);$('surface-colors').value=v.surfaceColors||'source';$('cell-visibility-controls').hidden=!m.cells?.length;$('visible-cell-id').max=Math.max(0,(m.cells?.length||0)-1);$('visible-cell-id').value=v.isolatedCell??0;
  $('projection').disabled=m.dimension!==4;
  $('rotation-controls').hidden=m.dimension<3;$('derived-mode').value=v.derivedMode;$('section-normal').value=v.sectionNormal.join(', ');$('section-depth').value=v.sectionOffset;$('section-offset').value=v.sectionOffset;$('entity-id').value=v.entity||0;
  const radii=m.vertices.map(p=>Math.hypot(...p)),radius=Math.max(...radii,1)*1.15;$('section-offset').min=-radius;$('section-offset').max=radius;$('section-offset').step=radius/250;
  PLANES.forEach((_,i)=>{$('plane-'+i).value=v.angles[i]||0;$('plane-output-'+i).textContent=format(v.angles[i]||0)+'°';});
  base.setModel(m);base.restoreCamera(v.camera);displayBase();
  PLANES.forEach(([,axis],i)=>{$('plane-'+i).parentElement.hidden=axis>=m.dimension;});viewportControls.sync();
  for(const option of $('selection-kind').options)option.disabled=!m[{vertex:'vertices',edge:'edges',face:'faces',cell:'cells'}[option.value]]?.length;
  const selection=v.entitySelection,selectedCount=m[{vertex:'vertices',edge:'edges',face:'faces',cell:'cells'}[selection?.kind]]?.length;
  if(selection&&Number.isInteger(selection.index)&&selection.index>=0&&selection.index<selectedCount){$('selection-kind').value=selection.kind;$('selection-id').value=selection.index;selectEntity(false);}
  else{$('selection-kind').value='vertex';$('selection-id').value=0;$('selection-info').textContent='Click a projected vertex or select a source entity by index.';}
  $('counts-strip').replaceChildren();['vertices','edges','faces','cells'].forEach(k=>{if(k==='cells'&&m.dimension!==4)return;const block=el('div',undefined,'count-block');block.append(el('strong',format(m[k]?.length||0)),el('small',k.toUpperCase()));$('counts-strip').append(block);});
  stellation.sync();netEditor.sync();cellNetEditor.sync();measurementControls.sync();symmetryControls.sync();memories.sync();entityOrientation.sync();tours.sync();faceEditing.sync();automaticFaceting.sync();facetingDiagram.sync();elementContent.sync();sourceLabelPresets?.sync();stellationCells?.sync();reinforcement?.sync();coincidentAssembly?.sync();densityInfo?.sync();projectMetadata.sync();compoundControls.sync();renderTabs();renderHistory();renderCatalog();refreshAnalysis();refreshDerived();
  const restoredSource=state();(state().view.dualMorph?.enabled?dualMorph.restoreSaved():animationRenderer.restoreSavedExplosion()).catch(e=>{if(state()===restoredSource)error(e);});
}
async function refreshAnalysis(){
  const m=model(),sequence=++analysisSequence;
  try{
    const a=await run('analyze',{},m,'Analyze incidence');if(sequence!==analysisSequence)return;
    $('analysis').replaceChildren();stat($('analysis'),'Interpretation',m.interpretation);stat($('analysis'),'Symbol',m.metadata?.symbol||'—');
    stat($('analysis'),'Edge length range',format(a.edgeLength.min)+' – '+format(a.edgeLength.max));stat($('analysis'),'Vertex radii about mean',format(a.vertexRadius.min)+' – '+format(a.vertexRadius.max));
    if(m.metadata?.enantiomorph)stat($('analysis'),'Enantiomorph (coordinate convention)',m.metadata.enantiomorph);
    if(m.metadata?.topologicalGenus!==undefined)stat($('analysis'),'Surface genus',m.metadata.topologicalGenus);
    if(m.metadata?.watermanFcc){
      const evidence=m.metadata.watermanFcc,current=evidence.sourceModelId===m.id&&evidence.sourceFingerprint===m.fingerprint;
      stat($('analysis'),'FCC input sites',format(evidence.selectedPointCount));
      stat($('analysis'),'FCC ball membership',current&&evidence.selectionCertificate?.certified===true?'Exact rational selection':'Historical source only');
      stat($('analysis'),'Nonextreme input sites',format(evidence.nonextremeSelectedPointIds?.length));
    }
    if(m.metadata?.dualOf)stat($('analysis'),'Reference primal',m.metadata.dualOf);
    if(m.metadata?.coxeterFamily&&m.metadata?.rings)stat($('analysis'),'Coxeter construction',m.metadata.coxeterFamily+' '+m.metadata.rings.join(''));
    if(m.metadata?.linkedRelativePath)stat($('analysis'),'Source catalog file',m.metadata.linkedRelativePath);
    stat($('analysis'),m.interpretation==='convex-polytope'||m.metadata?.fillSemantics==='ordinary-convex-faces'?'Face areas, min / max':'Algebraic cycle areas',format(a.faceArea.min)+' / '+format(a.faceArea.max));
    if(a.measure){stat($('analysis'),`${m.dimension}D content`,format(a.measure.content)+` u${['','','²','³','⁴'][m.dimension]}`);stat($('analysis'),`${m.dimension-1}D boundary measure`,format(a.measure.boundaryMeasure));}
    if(a.dihedral)stat($('analysis'),'Convex interior dihedrals',format(a.dihedral.min)+' – '+format(a.dihedral.max)+'°');
    stat($('analysis'),'Face side counts',Object.entries(a.faceTypes).map(([n,c])=>`${c} × ${n}`).join(', '));stat($('analysis'),'Euler V − E + F − C',a.validation.eulerCharacteristic);
    $('evidence').replaceChildren(el('p',a.validation.passed?'Listed structural checks passed':'Validation failed','badge'));$('evidence').append(el('p',a.validation.checks.join(' · '),'muted'),el('pre',JSON.stringify({numeric:m.numeric,certificate:m.certificate,provenance:m.provenance,warnings:a.validation.warnings},null,2),'code-box'));
  }catch(e){if(sequence===analysisSequence)error(e);}
}
async function refreshDerived({throwOnError=false,isCurrent,signal,preserveLayout=false,exportOwner}={}){
  const m=model(),v=state()?.view;if(!m)return;
  const source=state(),current=()=>state()===source&&source.model===m&&!signal?.aborted&&isCurrent?.()!==false;
  if(!current())throw new Error('Derived presentation cancelled.');
  const deriveRun=(op,params,source,label)=>run(op,params,source,label,{signal});
  if(!preserveLayout&&['net','cell-net','stellation'].includes(v.derivedMode)&&v.viewportLayout!=='split')v.viewportLayout='split';viewportControls?.sync();
  const sequence=++derivedSequence;derivedModel=null;derivedResult=null;net=null;$('promote').disabled=true;$('net-preview').hidden=true;$('derived-canvas').hidden=false;$('derived-status').textContent='Computing '+v.derivedMode+'…';
  const mode=v.derivedMode;
  try{
    let result;
    if(mode==='section-evidence'){
      if(m.interpretation!=='surface-section')throw new Error('Section evidence is available on promoted surface intersections.');
      derived.clear();$('derived-canvas').hidden=true;$('net-preview').hidden=false;
      const embedding=m.metadata?.sectionEmbedding;
      $('net-preview').replaceChildren(el('p','These curves intersect the ordered source faces. They preserve disconnected boundaries without assigning a solid interior.'),el('p',`${m.vertices.length} vertices · ${m.edges.length} segments · ${m.faces.length} coplanar faces`),el('p',embedding?`Source plane: ${embedding.normal.map(format).join(', ')} · depth ${format(embedding.offset)}`:'Source plane unavailable'),el('p',`Face fill: ${m.metadata?.fillRule||'nonzero'}. Source vertex and edge references are retained in the saved geometry.`));
      $('derived-status').textContent='Source surface intersection evidence';return {status:'surface-intersection',model:m};
    }
    if(mode==='section')result=await deriveRun('section',{normal:v.sectionNormal,offset:v.sectionOffset,fill_rule:v.fillRule||'nonzero'},m,'Evaluate section');
    else if(mode==='cell-section')result=await ordinaryCellSections.evaluate({normal:v.sectionNormal,offset:v.sectionOffset,fill_rule:v.fillRule||'nonzero'},{signal,isCurrent:current,exportOwner});
    else if(mode==='dual')result={model:await deriveRun('dual',{},m,'Evaluate dual')};
    else if(mode==='incidence-dual')result={model:await deriveRun('incidence-dual',{},m,'Evaluate incidence dual')};
    else if(mode==='vertex-figure')result=await deriveRun('vertex-figure',{vertex:safeIndex($('entity-id').value,m.vertices.length)},m,'Evaluate vertex figure');
    else if(mode==='cell')result={model:await deriveRun('cell',{kind:m.dimension===4?'cell':'face',index:safeIndex($('entity-id').value,m.dimension===4?m.cells.length:m.faces.length)},m,'Extract entity')};
    else if(mode==='face')result={model:await deriveRun('cell',{kind:'face',index:safeIndex($('entity-id').value,m.faces.length)},m,'Extract ordered source face')};
    else if(mode==='net')result=await netEditor.evaluate(m,state());
    else if(mode==='cell-net')result=await cellNetEditor.evaluate(m,state());
    else if(mode==='stellation')result=await stellation.evaluate(m,state());
    if(sequence!==derivedSequence||result?.stale||!current()){if(throwOnError)throw new Error('Section source changed while evaluating the animation frame.');return;}
    if(mode==='stellation'&&result.diagram){
      derivedModel=result.model;derived.clear();$('derived-canvas').hidden=true;$('net-preview').hidden=false;$('net-preview').replaceChildren(result.diagram);$('promote').disabled=!derivedModel;$('derived-status').textContent=result.status;
    }else if(mode==='net'){
      net=result;await netEditor.show(net);
    }else if(mode==='cell-net'){
      $('net-preview').hidden=true;$('derived-canvas').hidden=false;cellNetEditor.show(result);
    }else{
      derivedResult=result;derivedModel=result.model;
      derived.setModel(derivedModel);rememberSectionSource(derived,result,m);derived.restoreCamera(v.derivedCamera);if(derivedModel)derived.setDisplay({angles:Array(6).fill(0),projection:'orthographic',cameraProjection:v.cameraProjection,faces:true,vertices:v.vertices,edges:v.edges,fillRule:v.fillRule||'nonzero',surfaceOpacity:v.surfaceOpacity,surfaceColors:v.surfaceColors,appearance:v.appearance,materialEffects:v.materialEffects});
      if(mode==='cell-section'&&(derivedModel||hasEmptySectionSource(derived)))await elementContent.refresh(derived,{signal,isCurrent:current});
      $('promote').disabled=!derivedModel;
      $('derived-status').textContent=mode==='stellation'?result.status:derivedModel?`${derivedModel.vertices.length} vertices · ${derivedModel.edges.length} edges · ${derivedModel.faces.length} faces · intrinsic ${derivedModel.dimension}D`:result.status==='empty'?'Empty intersection':`Tangent / degenerate intersection · affine dimension ${result.affineDimension}`;
    }
    if(result?.model?.interpretation==='surface-section')$('derived-status').textContent=`Surface intersection · ${result.model.vertices.length} vertices · ${result.model.edges.length} segments · ${v.fillRule||'nonzero'} face fill`;
    memories.sync();return result;
  }catch(e){if(sequence===derivedSequence&&current()){derived.clear();$('derived-status').textContent=e.message;memories.sync();}if(throwOnError)throw e;}
}
function selectEntity(persist=true){
  const m=model(),kind=$('selection-kind').value,field={vertex:'vertices',edge:'edges',face:'faces',cell:'cells'}[kind],index=safeIndex($('selection-id').value,m[field].length);
  let ids;if(kind==='vertex')ids=[index];else if(kind==='cell')ids=[...new Set(m.cells[index].flatMap(f=>m.faces[f]))];else ids=m[field][index];
  base.select(ids);displayBase();
  $('selection-info').textContent=JSON.stringify({kind,index,vertices:ids,...kind==='vertex'?{coordinates:m.vertices[index]}:{},...kind==='cell'?{faces:m.cells[index]}:{}},null,2);
  if(persist){state().view.entitySelection={kind,index};markDirty();}
}
function serialize(){return clone({...project,savedAt:new Date().toISOString()});}
function adopt(p){if(!p?.documents?.length)throw new Error('Project contains no documents.');const bank=normalizeMemories(p.memories),tourBank=normalizeTour(p.tour);project=p;project.memories=bank;project.tour=tourBank;tourPreviewDocument=null;project.documents.forEach(d=>d.states.forEach(s=>{s.view={...defaults(s.model.dimension),...s.view};}));dirty=false;revision++;api.setDirty(false);renderWorkspace();}
async function restoreMemoryState(snapshot,label){
  if((animation.exporting||tourExporting))throw new Error('Finish or cancel animation export before opening a model memory.');
  const sourceProject=project,sourceState=state();if(project.documents.length>=100)throw new Error('The project already contains the maximum of 100 documents.');
  const detached=clone(snapshot);if(detached.operationNode){detached.sourceOperationNode=detached.operationNode;delete detached.operationNode;}
  const result=await run('validate-project',{project:{format:'polytope-laboratory',version:1,active:0,documents:[{cursor:0,states:[detached]}]}},null,'Validate model memory');
  if(project!==sourceProject||state()!==sourceState)throw new Error('Source document changed while the model memory was validated.');
  const restored=result.documents[0].states[0];restored.label=label;restored.view={...defaults(restored.model.dimension),...restored.view};
  project.documents.push({id:uid(),cursor:0,states:[restored]});project.active=project.documents.length-1;markDirty();renderWorkspace();return restored;
}
async function showTourEvent(snapshot,label,controls={}){
  if((animation.exporting||tourExporting))throw new Error('Finish animation export before opening a tour event.');
  const sourceProject=project,sourceState=state(),detached=clone(snapshot);if(detached.operationNode){detached.sourceOperationNode=detached.operationNode;delete detached.operationNode;}
  const result=await run('validate-project',{project:{format:'polytope-laboratory',version:1,active:0,documents:[{cursor:0,states:[detached]}]}},null,'Validate tour event');
  if(project!==sourceProject||state()!==sourceState||controls.signal?.aborted||(controls.isCurrent&&!controls.isCurrent()))return;
  const restored=result.documents[0].states[0];restored.label=label;restored.view={...defaults(restored.model.dimension),...restored.view};
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
async function addMemoryStates(current,stored,label){
  const originalProject=project,originalState=state();if((animation.exporting||tourExporting))throw new Error('Finish or cancel animation export before adding models.');if(project.documents.length>=100)throw new Error('The project already contains the maximum of 100 documents.');
  const result=await run('compound-add',{other:stored.model},current.model,'Add stored model');
  if(project!==originalProject||state()!==originalState)throw new Error('Source document changed while the compound was calculated.');
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
async function open(){
  if((animation.exporting||tourExporting))throw new Error('Finish or cancel animation export before opening a project.');
  viewportControls.stop();animation.pause();
  return openWorkspace({getProject:()=>project,getRevision:()=>revision,isExporting:()=>(animation.exporting||tourExporting),load:api.open,publish:result=>{
    if(result.project)adopt(result.project);else addDocument(result.model,'Import '+(result.model.metadata?.dxf?'DXF':result.path.toLowerCase().endsWith('.json')?'JSON':'OFF'));
    setStatus('Opened '+result.path);
  }});
}
async function save(){
  if((animation.exporting||tourExporting))throw new Error('Finish or cancel animation export before saving the project.');
  const savedProject=project,savedRevision=revision,statusOwner=setStatus('Saving project…'),result=await api.save(serialize());
  if(!result)return;
  if(project===savedProject){dirty=revision!==savedRevision;api.setDirty(dirty);renderTabs();}
  status.complete(statusOwner,'Saved '+result.path);
}
async function recover(){
  if((animation.exporting||tourExporting))throw new Error('Finish or cancel animation export before recovering a project.');
  viewportControls.stop();animation.pause();
  const result=await openWorkspace({getProject:()=>project,getRevision:()=>revision,isExporting:()=>(animation.exporting||tourExporting),load:api.recover,publish:result=>{
    adopt(result.project);markDirty();setStatus('Recovered autosave. Save it as a project to keep it.');
  }});
  if(!result)throw new Error('No autosave snapshot is available.');
}
function historyStep(delta){if(!doc())return;const next=doc().cursor+delta;if(next<0||next>=doc().states.length)return;doc().cursor=next;markDirty();renderWorkspace();}
const actions={new:async()=>addDocument(await run('generate',{kind:'regular',key:'tesseract'},null,'Generate tesseract')),open,save,recover,undo:()=>historyStep(-1),redo:()=>historyStep(1),reset:()=>{projectionFit?.cancel();base.reset();derived.reset();state().view.camera=base.cameraState();state().view.derivedCamera=derived.cameraState();markDirty();},fullscreen:()=>api.fullscreen(),image:async()=>{if((animation.exporting||tourExporting))throw new Error('Finish animation export before capturing an image.');viewportControls.stop();animation.pause();if(state().view.dualMorph?.enabled)await dualMorph.prepareCapture();const source=state(),sourceModel=model(),view=JSON.stringify(source.view),isCurrent=()=>state()===source&&model()===sourceModel&&JSON.stringify(source.view)===view;if(base.prepareCapture)await base.prepareCapture({isCurrent});if(!isCurrent())throw new Error('View changed while preparing the image. Capture it again.');const result=await api.saveImage(base.image());if(result)setStatus('Saved '+result.path);},help:()=>userGuide.show(),export:()=>exportControls.open(),print:()=>{if(!net)throw new Error('Choose a 3D face net to print.');return state().view.net?.display==='pages'&&state().netPages?api.printPackedNets(state().netPages.pages.map(p=>p.svg)):api.print(net.svg);}};
Object.entries(actions).forEach(([id,fn])=>{if($(id))$(id).onclick=guard(fn);});
api.onAction(name=>actions[name]&&guard(actions[name])());
$('close-help').onclick=()=>$('help-dialog').close();$('close-export').onclick=()=>$('export-dialog').close();
$('confirm-export').onclick=guard(()=>exportControls.confirm());
$('export-net').onclick=guard(async()=>{if(!net)throw new Error('Choose the 3D face net derived view first.');const result=await api.saveSvg(net.svg);if(result){$('export-dialog').close();setStatus('Exported calibrated net '+result.path);}});
const pdfButton=el('button','Export current net as PDF','wide');pdfButton.id='export-net-pdf';$('export-dialog').append(pdfButton);pdfButton.onclick=guard(async()=>{if(!net)throw new Error('Choose a 3D face net derived view first.');const result=await api.saveNetPdf(net.svg);if(result){$('export-dialog').close();setStatus('Exported calibrated net PDF '+result.path);}});
$('search').oninput=renderCatalog;$('library-family').onchange=renderCatalog;document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderCatalog();});
auditFilter.onchange=renderCatalog;
$('close-library-dialog').onclick=()=>$('library-dialog').close();
$('library-open-anyway').onclick=guard(async()=>{const result=await api.libraryModel(inspectedLibraryEntry.key);$('library-dialog').close();addDocument(result.model,'Import OFF');});
$('library-repair-copy').onclick=guard(async()=>{const result=await api.repairLibraryCopy(inspectedLibraryEntry.key);if(result){setStatus('Saved validated edge-count copy '+result.path);$('library-dialog').close();}});
['face-fill-rule','surface-colors','surface-opacity'].forEach(id=>$(id).onchange=()=>{const v=state().view;v.fillRule=$('face-fill-rule').value;v.surfaceColors=$('surface-colors').value;v.surfaceOpacity=Number($('surface-opacity').value);v.presentation=!v.faces?'wireframe':v.surfaceOpacity<1?'translucent':'solid';displayBase();viewportControls.sync();markDirty();if(id==='face-fill-rule')refreshDerived();});
$('isolate-cell').onclick=guard(()=>{state().view.isolatedCell=safeIndex($('visible-cell-id').value,model().cells.length);state().view.hiddenCells=[];displayBase();markDirty();});
$('hide-cell').onclick=guard(()=>{const id=safeIndex($('visible-cell-id').value,model().cells.length);state().view.hiddenCells=[...new Set([...(state().view.hiddenCells||[]),id])];displayBase();markDirty();});
$('show-all-cells').onclick=()=>{state().view.hiddenCells=[];state().view.isolatedCell=null;displayBase();markDirty();};
document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-panel]').forEach(x=>x.classList.toggle('active',x===b));['info','construct','evidence','net'].forEach(p=>$(p+'-panel').hidden=p!==b.dataset.panel);});
PLANES.forEach(([a,b,label],i)=>{const row=el('div',undefined,'plane'),input=el('input');input.id='plane-'+i;input.type='range';input.min=-180;input.max=180;input.step=0.1;input.value=0;input.setAttribute('aria-label',label+' rotation');const output=el('output','0°');output.id='plane-output-'+i;row.append(el('label',label),input,output);$('planes').append(row);input.oninput=()=>{state().view.angles[i]=Number(input.value);output.textContent=format(Number(input.value))+'°';displayBase();markDirty();};});
['projection','faces-visible','vertices-visible'].forEach(id=>$(id).onchange=()=>{if(id==='projection')projectionFit?.cancel();const v=state().view;v.projection=$('projection').value;v.faces=$('faces-visible').checked;v.vertices=$('vertices-visible').checked;v.presentation=!v.faces?'wireframe':v.surfaceOpacity<1?'translucent':'solid';displayBase();viewportControls.sync();markDirty();if(id==='projection')projectionFit?.request();});
$('derived-mode').onchange=()=>{state().view.derivedMode=$('derived-mode').value;markDirty();refreshDerived();};
$('promote').onclick=guard(()=>{if(!derivedModel)return;if(state().view.derivedMode==='cell-section')return ordinaryCellSections.promote(derivedResult);addDocument(clone(derivedModel),'Promote derived view');});
$('apply-section').onclick=guard(()=>workspaceNumeric.section());
let sectionDebounce;
$('section-offset').oninput=()=>{$('section-depth').value=$('section-offset').value;state().view.sectionOffset=Number($('section-offset').value);delete state().view.sectionAlignment;markDirty();clearTimeout(sectionDebounce);sectionDebounce=setTimeout(refreshDerived,200);};
$('entity-id').onchange=()=>{state().view.entity=Number($('entity-id').value);markDirty();refreshDerived();};
$('section-events').onclick=guard(()=>workspaceNumeric.section(true));
$('select-entity').onclick=guard(selectEntity);$('notes').oninput=()=>{state().notes=$('notes').value;markDirty();};
$('measure').onclick=guard(async()=>{const source=state(),sequence=++measurementSequence,result=await run('measure',{kind:$('measurement-kind').value,indices:rawNumbers($('measurement-ids').value)},source.model,'Measure intrinsic geometry');if(state()===source&&measurementSequence===sequence)$('measurement-result').textContent=format(result.value)+' '+result.units;});
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
regular4dButton.onclick=guard(async()=>{
  const owner=captureNativeSource(numericContext),source=model(),key=source.metadata?.key;
  const receipt=await run('regular4d-validate',{key},source,'Verify regular 4D identity');verifyNativeSource(numericContext,owner);
  regular4dResult.textContent=`${receipt.reachedFlags} / ${receipt.flagCount} flags; numerical regularity verified (float64).`;
  regular4dResult.dataset.status=receipt.status;regular4dResult.dataset.key=key;regular4dResult.dataset.flags=String(receipt.reachedFlags);
});
$('validate').onclick=guard(async()=>{const result=await run('validate',{},model(),'Validate incidence');$('evidence').append(el('pre',JSON.stringify(result,null,2),'code-box'));});
$('rational-hull').onclick=guard(()=>workspaceNumeric.hull(true));
$('certify-current').onclick=guard(async()=>{if(model().interpretation!=='convex-polytope')throw new Error('Certification supports convex hull sources only.');const points=model().vertices.map(p=>p.map(String));addDocument(await run('rational-hull',{points,name:'Rational input hull of '+model().name},null,'Certify supplied decimal hull'),'Certify decimal input');});
$('rational-dual').onclick=guard(()=>commitOperation('rational-dual',{},'Exact rational polar dual'));
$('link-library').onclick=guard(async()=>{const result=await api.library();if(!result)return;acceptLinkedLibrary(result);const supported=result.entries.filter(e=>e.supported!==false).length;setStatus(`Indexed ${result.entries.length} OFF files from ${result.path}; ${supported} have supported headers. Geometry is checked when opened.`);});
$('cancel').onclick=guard(async()=>{sourceReflectionControls.cancel();coincidicRegimentControls.cancel();ordinaryCellSections.cancel();stellationCells?.cancel();basicSolidControls?.cancel();stephanoidControls?.cancel();sourceLabelPresets?.cancel();multipleViews?.close();projectiveDualControls?.cancel();dualMorph?.cancel();elementContent.invalidate();reinforcement?.cancel();coincidentAssembly?.cancel();densityInfo?.cancel();netEditor.sequence++;cellNetEditor.sequence++;workspaceNumeric.cancel();entityOrientation.cancelNumeric?.();viewportControls.cancelNumeric?.();springControls?.cancel();presentationControls?.cancelNumeric();appearanceControls?.cancelNumeric();materialEffectsControls?.cancelNumeric();perspectiveControls?.cancelNumeric();measurementControls?.cancelNumeric?.();symmetryControls?.cancelNumeric?.();stellation?.cancelNumeric?.();animation?.cancelNumeric?.();tours?.cancelNumeric?.();for(const control of [sphereProjectionControls,vertexFigureConstruction,geodesicControls,convexCoreControls,expansionControls,fittingControls,exactSectionControls,incidenceTruncationControls,sourceZonohedronControls,subdivisionControls,cupolaControls,stepPrismControls,nobleControls,torusControls,watermanControls,productControls,antiprismControls,faceEditing,automaticFaceting,facetingDiagram,segmentotopeControls,starPolygonControls,podiaControls,crossedSegmentotopeControls]){control?.cancel?.();control?.cancelNumeric?.();}const ids=[...running.keys()];await Promise.all(ids.map(id=>api.cancel(id)));setStatus('Cancelled active computation.');});
setInterval(guard(async()=>{if(!dirty||!project.documents.length||(animation.exporting||tourExporting))return;const savedRevision=revision;await api.autosave(serialize());$('autosave-status').textContent='Recovery snapshot '+new Date().toLocaleTimeString();if(savedRevision!==revision)$('autosave-status').textContent+=' · newer changes pending';}),30000);
function frame(now){const dt=Math.min((now-lastFrame)/1000,0.1);lastFrame=now;if(viewportControls.tick(dt))dirty=true;
  netEditor.tick(dt);base.draw();derived.draw();if(facetingPreview&&!$('facet-preview').hidden)facetingPreview.draw();if(running.size){const job=[...running.values()][0];$('job-time').textContent=((now-job.start)/1000).toFixed(1)+' s';}else $('job-time').textContent='';requestAnimationFrame(frame);}
requestAnimationFrame(frame);
guard(async()=>{if(!api)throw new Error('Open this workspace with the desktop launcher.');catalog=await run('catalog',{},null,'Load local catalog');const m=await run('generate',{kind:'regular',key:'tesseract'},null,'Generate tesseract');addDocument(m);dirty=false;api.setDirty(false);try{const restored=await api.libraries();for(const library of restored.libraries)acceptLinkedLibrary(library);for(const failure of restored.errors)linkedLibraries.push({...failure,entries:[]});renderLinkedLibraries();if(restored.errors.length)setStatus('Some linked folders are unavailable. See the library panel.');}catch(e){error(e);}const recovery=await api.recoveryInfo();if(recovery)setStatus('Recovery snapshot available from '+new Date(recovery.modified).toLocaleString()+'. Use File → Recover autosave.');})();
