/** Animation preflight and guarded presentation orchestration.
 * Renderer callbacks must check isCurrent immediately before publication.
 * Saved geometry, model identities and views are never written by this module.
 */
import {normalizeSequence,evaluateNormalized} from './animation.mjs';
import {requireMorphAnimation} from './morph-animation-adapter.mjs';
import {resolveExplosion,explosionGeometry,foldTrackPositions} from './explosion.mjs';
import {createMemories,storeMemory} from './model-memories.mjs';
import {animationSourceSignature,foldingPreparationSignature,foldingCacheSignature,verifyGeneralizedFoldFill} from './generalized-fold-qualification.mjs';

const clone=value=>structuredClone(value);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const fail=message=>{throw Error(message);};
const fingerprint=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const sameIdentity=(current,state,model,source)=>current===state&&state.model===model&&(model.fingerprint??null)===source.fingerprint&&(model.id??null)===source.modelId;
function signature(view){const result=JSON.stringify(view);if(typeof result!=='string'||result.length>32*1024*1024)fail('Animation source view exceeds its snapshot resource bound.');return result;}
const frameView=(original,frame)=>{const view={...clone(original),angles:[...frame.angles],sectionOffset:frame.sectionOffset,...(Object.hasOwn(frame,'explosionAmount')?{explosionAmount:frame.explosionAmount}:{}),...(Object.hasOwn(frame,'foldFraction')?{foldFraction:frame.foldFraction}:{}),...(Object.hasOwn(frame,'morphRatio')?{dualMorph:{...clone(original.dualMorph),ratio:frame.morphRatio}}:{})};if(original.sectionOffset!==frame.sectionOffset)delete view.sectionAlignment;return view;};

function verifyNetBinding(model,net){
  if(!net||!fingerprint(model.fingerprint)||net.sourceFingerprint!==model.fingerprint)fail('Folding net source fingerprint does not match the saved model.');
  if(!Number.isFinite(net.scale)||net.scale<=0||!Number.isFinite(net.referenceEdgeLengthMm)||net.referenceEdgeLengthMm<1||net.referenceEdgeLengthMm>1000||net.sourceFaceCount!==model.faces.length||net.faces?.length!==model.faces.length||net.faces.length>250||net.targetVertices?.length!==model.vertices.length||JSON.stringify(net.sourceEdges)!==JSON.stringify(model.edges))fail('Folding net does not cover the ordered source geometry and physical scale.');
  const center=[0,0,0];model.vertices.forEach(point=>point.forEach((value,i)=>center[i]+=value/model.vertices.length));
  const expected=model.vertices.map(point=>point.map((value,i)=>(value-center[i])*net.scale)),tolerance=net.referenceEdgeLengthMm*1e-7;
  for(let id=0;id<expected.length;id++)if(!Array.isArray(net.targetVertices[id])||net.targetVertices[id].length!==3||expected[id].some((value,axis)=>!Number.isFinite(value)||!Number.isFinite(net.targetVertices[id][axis])||Math.abs(value-net.targetVertices[id][axis])>tolerance))fail('Folding target cache differs from the scaled source coordinates.');
  const endpoint=foldTrackPositions(net,1),seen=new Set();
  for(const face of endpoint){
    if(!Number.isInteger(face.id)||face.id<0||face.id>=model.faces.length||seen.has(face.id)||JSON.stringify(face.sourceVertices)!==JSON.stringify(model.faces[face.id]))fail('Folding faces do not retain ordered source vertex incidence.');
    seen.add(face.id);for(let p=0;p<face.points.length;p++)if(face.points[p].some((value,axis)=>Math.abs(value-expected[face.sourceVertices[p]][axis])>tolerance))fail('Folding endpoint fails source coordinate reconstruction.');
  }
}

/** Native cache callbacks receive detached models and {signal,isCurrent}.
 * A missing/stale cache is fetched at most once for this session. The caller
 * supplies authoritative net reconstruction; raw net buffers are not repaired.
 */
export async function prepareAnimationAdapters({state,sequence,getState=()=>state,loadPlanes,loadNet,loadMorph,signal}={}){
  if(!state?.model||!state.view)fail('Animation adapters require saved model and view state.');
  if(signal?.aborted)fail('Animation preparation cancelled.');
  const model=state.model;
  const saved=storeMemory(createMemories(),1,state).slots[0].state;
  if(saved.model.id!=null&&typeof saved.model.id!=='string'||saved.model.fingerprint!=null&&!fingerprint(saved.model.fingerprint))fail('Animation source identity is malformed.');
  const source=freeze({modelId:saved.model.id??null,fingerprint:saved.model.fingerprint??null,dimension:saved.model.dimension,embeddingDimension:saved.model.embeddingDimension??saved.model.dimension});
  const initialSignature=signature(saved.view),sourceSignature=animationSourceSignature(saved),netSignature=foldingPreparationSignature(saved),normalized=freeze(normalizeSequence(sequence??saved.view.animation));
  const foldSignature=normalized.tracks?.fold?foldingCacheSignature(saved):null;
  const owned=()=>sameIdentity(getState(),state,model,source)&&animationSourceSignature(state)===sourceSignature;
  const netOwned=()=>foldSignature===null||foldingCacheSignature(state)===foldSignature;
  const current=()=>!signal?.aborted&&owned()&&signature(state.view)===initialSignature&&foldingPreparationSignature(state)===netSignature;
  const check=()=>{if(!current())fail('Animation preparation cancelled: source state or view changed.');};
  check();
  // The immutable memory snapshot core supplies existing finite JSON/depth/item
  // and 32MiB state ownership bounds without touching project memory slots.
  requireMorphAnimation(saved,normalized);let morphAnimation=null;
  if(normalized.tracks?.morphRatio){if(typeof loadMorph!=='function')fail('Native dual-morph animation preparation is unavailable.');check();morphAnimation=await loadMorph(clone(saved.model),normalized,{signal,isCurrent:current});check();morphAnimation=freeze(storeMemory(createMemories(),1,{model:saved.model,view:{morphAnimation}}).slots[0].state.view.morphAnimation);}
  let explosion=null,net=null;
  if(normalized.tracks?.explosion){
    const direction=normalized.tracks.explosion.direction;
    explosion=resolveExplosion(saved.model,{direction,planeCache:saved.view.cellFacingCache});
    if(!explosion.supported&&saved.model.dimension===4&&direction==='normal'&&typeof loadPlanes==='function'){
      check();const cache=await loadPlanes(clone(saved.model),{signal,isCurrent:current});check();
      explosion=resolveExplosion(saved.model,{direction,planeCache:cache});
    }
    if(!explosion.supported)fail(explosion.diagnostic);
  }
  if(normalized.tracks?.fold){
    if(saved.model.dimension!==3||(saved.model.embeddingDimension??3)!==3)fail('Folding track requires an intrinsic 3D source; partial 4D cell-net folding is unavailable.');
    const generalized=saved.model.interpretation!=='convex-polytope';
    if(generalized&&typeof loadNet!=='function')fail('Generalized folding requires authoritative native source-shell reconstruction.');
    const matches=value=>{try{verifyNetBinding(saved.model,value);return true;}catch{return false;}};
    net=saved.netLayout;
    if((generalized||!matches(net))&&typeof loadNet==='function'){check();net=await loadNet(clone(saved.model),{signal,isCurrent:current});check();}
    if(!matches(net))verifyNetBinding(saved.model,net);
    // Ownership/resource checks also cover a newly returned native descriptor.
    net=storeMemory(createMemories(),1,{model:saved.model,view:{},netLayout:net}).slots[0].state.netLayout;
    verifyNetBinding(saved.model,net);
    if(generalized)verifyGeneralizedFoldFill(saved.model,net);
  }
  check();
  const originalView=saved.view,originalFrame=freeze({time:0,angles:Array.from({length:6},(_,i)=>originalView.angles?.[i]??0),sectionOffset:originalView.sectionOffset??0,...(explosion?{explosionAmount:originalView.explosionAmount??0}:{}),...(net?{foldFraction:originalView.foldFraction??originalView.net?.fraction??0}:{}),...(morphAnimation?{morphRatio:originalView.dualMorph.ratio}:{})});
  const geometry=(frame,view,restoring=false)=>({source,frame:clone(frame),view:net&&!restoring?{...clone(view),derivedMode:'net',viewportLayout:'split',net:{...clone(view.net??{}),display:'fold',fraction:frame.foldFraction}}:clone(view),restoring,...(explosion?{baseExplosion:explosionGeometry(explosion,frame.explosionAmount)}:{}),...(net?{foldNet:net,foldFaces:foldTrackPositions(net,frame.foldFraction),foldSourceFingerprint:net.sourceFingerprint}:{} ),...(morphAnimation?{morphAnimation}:{})});
  // Check original presentation now, before a renderer or export session starts.
  geometry(originalFrame,originalView,true);
  let expectedSignature=initialSignature,cancelled=false,generation=0,active=null,pendingViews=null;
  const unchanged=()=>owned()&&netOwned()&&(signature(state.view)===expectedSignature||active&&pendingViews?.includes(signature(state.view)));
  const sourceCheck=()=>{if(!owned())fail('Animation source changed; presentation publication is cancelled.');};
  const available=()=>{sourceCheck();if(cancelled||signal?.aborted)fail('Animation cancelled.');if(!unchanged())fail('Animation source view changed; presentation publication is cancelled.');};
  const abortActive=()=>{if(active&&owned()&&pendingViews?.includes(signature(state.view)))expectedSignature=signature(state.view);active?.abort();active=null;pendingViews=null;generation++;};
  const session={
    source,sequence:normalized,
    evaluate(time){available();const frame=evaluateNormalized(normalized,time);return geometry(frame,frameView(originalView,frame));},
    async apply(time,renderPose,options={}){
      available();if(typeof renderPose!=='function')fail('Animation requires an actual presentation renderer callback.');
      const pose=session.evaluate(time);return publish(pose,renderPose,options.signal,false);
    },
    async restore(renderPose,options={}){
      sourceCheck();if(!unchanged())fail('Animation source view changed; restoration skipped.');
      if(typeof renderPose!=='function')fail('Animation restoration requires a presentation renderer callback.');
      return publish(geometry(originalFrame,originalView,true),renderPose,options.signal,true);
    },
    cancel(){cancelled=true;abortActive();},
    destroy(){session.cancel();signal?.removeEventListener('abort',onAbort);}
  };
  async function publish(pose,renderPose,localSignal,restoring){
    if(localSignal?.aborted)fail('Animation cancelled.');
    abortActive();const token=generation,controller=new AbortController();active=controller;
    const before=expectedSignature,target=signature(pose.view);
    pendingViews=[before,target];
    const isCurrent=()=>token===generation&&!controller.signal.aborted&&owned()&&(restoring||netOwned())&&(restoring||!cancelled&&!signal?.aborted)&&[before,target].includes(signature(state.view));
    const abort=()=>controller.abort();localSignal?.addEventListener('abort',abort,{once:true});
    try{
      await renderPose(pose,{signal:controller.signal,isCurrent});
      if(!isCurrent())fail('Animation publication cancelled: source, view or generation changed.');
      expectedSignature=signature(state.view);return pose;
    }catch(error){if(isCurrent())expectedSignature=signature(state.view);throw error;
    }finally{localSignal?.removeEventListener('abort',abort);if(active===controller){active=null;pendingViews=null;}}
  }
  const onAbort=()=>session.cancel();signal?.addEventListener('abort',onAbort,{once:true});
  return Object.freeze(session);
}
