/** Evaluated native morph packets for each time sample; no source baking. */
import {morphEligible} from './dual-morph-session.mjs';
import {renderMorphElementContent} from './morph-element-content-renderer.mjs';
import {planMorphElementContent} from './morph-element-content.mjs';
const clone=structuredClone,abort=message=>Object.assign(Error(message),{name:'AbortError'});
const ownership=state=>JSON.stringify([state.model,state.notes??'',state.documentMetadata??null,state.view.coordinateUnit??state.model.metadata?.coordinateUnits??'model']);
const fields=['sourceModelId','sourceFingerprint','sourceAttributesSha256','sourceContextSha256','descriptorSha256'];
export function validateMorphAnimationFrame(frame,prepared,ratio){
  if(!frame?.model||frame.ratio!==ratio||frame.method!==prepared.settings.method||frame.certified!==false||!frame.binding||Object.keys(frame.binding).length!==fields.length||fields.some(k=>frame.binding[k]!==prepared[k]))throw Error('Native animated morph frame does not match its prepared source, method, attributes, context or ratio.');
  return frame;
}
export function requireMorphAnimation(state,sequence=state?.view?.animation,operation='Animation'){
  if(state?.view?.dualMorph?.enabled===true&&!sequence?.tracks?.morphRatio)throw Error(`${operation} requires an explicit dual-morph ratio track for an enabled morph. Add the ratio track or reset the morph; saved settings are retained.`);
  if(sequence?.tracks?.morphRatio){
    if(state?.view?.dualMorph?.enabled!==true)throw Error('Apply a supported dual morph before using its saved ratio track.');
    if(sequence.tracks.fold||sequence.tracks.explosion)throw Error('Dual-morph ratio tracks cannot combine with rigid folding or explosion; those mathematical adapters are unavailable.');
  }
}
export async function prepareMorphAnimation(state,sequence,run,{signal,isCurrent=()=>true}={}){
  requireMorphAnimation(state,sequence);const settings=clone(state.view.dualMorph),source=clone(state.model),sourceContext={notes:state.notes??'',unit:state.view.coordinateUnit??source.metadata?.coordinateUnits??'model'};
  const owner=ownership(state),model=state.model;
  const check=()=>{if(signal?.aborted||!isCurrent()||state.model!==model||ownership(state)!==owner)throw abort('Animated morph preparation canceled or source changed.');};check();
  if(!morphEligible(source,settings.method))throw Error('The saved morph method/source dimension is unavailable for animation.');
  if(state.view.hiddenCells?.length||state.view.isolatedCell!=null||state.view.cellFacing&&state.view.cellFacing!=='all'||(state.view.cellShrink??1)!==1||state.view.explosionAmount>0)throw Error('Reveal source cells and reset shrink/explosion before dual-morph animation.');
  if(state.view.viewportLayout==='split'&&state.view.derivedMode==='section')throw Error('Morph tour comparison with a source section is unavailable. Use a single Base model view; evaluated morph sections require their own adapter.');
  if(sequence.keyframes.some(frame=>frame.sectionOffset!==sequence.keyframes[0].sectionOffset))throw Error('A changing cross-section of morph geometry needs a separate evaluated-frame section adapter. Keep section depth fixed for morph export.');
  const options={signal,isCurrent},prepared=await run('prepare-dual-morph',{settings,sourceContext},source,'Prepare animated dual morph',options);check();
  if(prepared.sourceModelId!==source.id||prepared.sourceFingerprint!==source.fingerprint||prepared.settings.method!==settings.method)throw Error('Native animated morph preparation belongs to another source.');
  let descriptor=null;
  if(state.view.elementAnnotations?.entries?.length){
    descriptor=await run('element-content-describe',{document:clone(state.view.elementAnnotations),reference_edge_mm:25},source,'Preflight animated morph content',options);check();
    const requested=e=>({kind:e.kind,index:e.index,text:e.text,texture:e.texture});
    if(JSON.stringify(descriptor?.entries?.map(requested))!==JSON.stringify(state.view.elementAnnotations.entries.map(requested)))throw Error('Native animated morph descriptor changed requested source content.');
  }
  // Rank-changing PNG endpoints are refused before output staging or live pose
  // mutation. Keyframe owner maps are also checked; each rendered intermediate
  // pose still passes the complete atomic content renderer.
  for(const ratio of new Set([sequence.keyframes[0].morphRatio,sequence.keyframes.at(-1).morphRatio,...descriptor?sequence.keyframes.map(f=>f.morphRatio):[]])){
    const frame=await run('evaluate-dual-morph',{prepared,ratio,sourceContext},source,'Preflight morph endpoint',options);check();validateMorphAnimationFrame(frame,prepared,ratio);
    if(descriptor)planMorphElementContent(source,frame,descriptor.entries);
  }
  return {prepared,sourceContext,descriptor,sourceOwnership:owner};
}

export async function renderMorphAnimationPose(context,pose,{signal,isCurrent=()=>true}={}){
  const state=context.getState(),viewer=context.viewer,packet=pose.morphAnimation,ratio=pose.frame.morphRatio;
  const camera=typeof viewer.cameraState==='function'?JSON.stringify(viewer.cameraState()):null;
  const check=()=>{if(signal?.aborted||!isCurrent()||context.getState()!==state||state.model.id!==pose.source.modelId||state.model.fingerprint!==pose.source.fingerprint||ownership(state)!==packet.sourceOwnership||camera!==null&&JSON.stringify(viewer.cameraState())!==camera)throw abort('Animated morph source, camera or presentation changed.');};check();
  const frame=await context.run('evaluate-dual-morph',{prepared:clone(packet.prepared),ratio,sourceContext:clone(packet.sourceContext)},clone(state.model),'Evaluate animation morph ratio',{signal,isCurrent:()=>{try{check();return true;}catch{return false;}}});check();validateMorphAnimationFrame(frame,packet.prepared,ratio);
  const candidate={...state,view:clone(pose.view)};
  const current=()=>{try{check();return true;}catch{return false;}};
  // Prepare pixels and source-corner mappings against a detached presentation
  // view. The real saved view is committed only after atomic geometry adoption.
  const status=await renderMorphElementContent(viewer,frame,candidate,{signal,isCurrent:current,getState:()=>current()?candidate:null,
    describe:packet.descriptor?async()=>clone(packet.descriptor):(m,p,o)=>context.run('element-content-describe',p,m,'Prepare animated morph content',o),
    makeCanvas:context.makeContentCanvas,decodeImage:context.decodeContentImage});check();
  if(status?.elementContentDiagnostic)throw Error(status.elementContentDiagnostic);
  state.view=clone(candidate.view);context.onMorphPose?.(frame,packet.prepared);context.syncPose?.(state.view);
  viewer.draw();return frame;
}
