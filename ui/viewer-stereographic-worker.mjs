/** Viewer bridge: last published geometry stays coherent while a newer pose
 * computes. One active worker and one latest queued snapshot are owned by the
 * transport coordinator. Capture awaits a complete fine publication.
 */
import {StereographicQualityCoordinator,stereographicSnapshotKeys} from './stereographic-quality.mjs';
import {StereographicWorkerCoordinator} from './stereographic-worker-protocol.mjs';
import {typedStereographicPublication} from './viewer-stereographic-typed.mjs';

export function createStereographicWorker(){
  if(typeof Worker==='undefined')return null;
  return new Worker(new URL('./stereographic-worker.mjs',import.meta.url),{type:'module'});
}
const abort=message=>Object.assign(Error(message),{name:'AbortError'});

/** Only fields that affect this renderer's source pose, masks or primitives.
 * The native cache is separately validated; its source binding is included.
 */
export function stereographicViewSignature(view){
  const fields=['projection','angles','fillRule','hiddenCells','isolatedCell','cellFacing','cellShrink','faces','edges','vertices','vertexStyle','edgeStyle','vertexRadius','edgeRadius','surfaceColors','surfaceOpacity','edgeOpacity','vertexSize','pickKind'];
  const selected={};for(const key of fields)selected[key]=view?.[key]??null;
  selected.angles=view?.angles||[];selected.hiddenCells=view?.hiddenCells||[];
  selected.frame=view?.orientationFrame?{matrix:view.orientationFrame.matrix??null,sourceFingerprint:view.orientationFrame.sourceFingerprint??null}:null;
  selected.cache=view?.cellFacingCache?{sourceFingerprint:view.cellFacingCache.sourceFingerprint??null,algorithmVersion:view.cellFacingCache.algorithmVersion??null}:null;
  return JSON.stringify(selected);
}

export class ViewerStereographicWorker {
  constructor({worker,getModel,publish,onDiagnostic=()=>{},onStatus=()=>{},onTiming=()=>{},qualityOptions={},clock={}}){
    this.getModel=getModel;this.publish=publish;this.onDiagnostic=onDiagnostic;this.onStatus=onStatus;this.generation=0;this.snapshot=null;this.published=null;this.captureGuard=null;this.snapshotsByToken=new Map();
    this.quality=new StereographicQualityCoordinator({...clock,qualityOptions,onRequest:request=>this.submit(request)});
    this.transport=new StereographicWorkerCoordinator({worker,getOwner:()=>({model:this.getModel(),sourceKey:this.snapshot?.keys.sourceKey,frameKey:this.snapshot?.keys.frameKey,generation:this.generation}),isCurrentRequest:request=>this.quality.isCurrent(request),canPublishIntermediate:(original,latest)=>{
      const old=this.snapshotsByToken.get(original.token),next=this.snapshotsByToken.get(latest.token);return Boolean(old&&next&&old.model===next.model&&old.family===next.family);
    },publish:(publication,guard)=>{
      const capture=this.captureGuard?.token===publication.token?this.captureGuard:null;
      const isCurrent=()=>guard.isCurrent()&&(!capture||!capture.signal?.aborted&&capture.isCurrent());
      if(!isCurrent())throw abort('Stereographic publication no longer belongs to the requested capture.');
      const snapshot=this.snapshotsByToken.get(publication.token);if(!snapshot)throw abort('Stereographic presentation snapshot was retired.');
      const started=performance.now(),geometry=typedStereographicPublication(publication,snapshot,isCurrent),prepared=performance.now();
      this.publish(publication,geometry,snapshot,{isCurrent,signal:guard.signal});
      if(!isCurrent())throw abort('Stereographic publication was superseded.');
      this.published={publication,snapshot};this.onStatus(publication);
      // Optional instrumentation must never invalidate a successful display.
      try{onTiming(Object.freeze({stage:'typed-publication',jobId:publication.jobId,phase:publication.phase,patches:geometry.packed.counts.patches,segments:geometry.packed.counts.segments,validationAndBoundsMs:prepared-started,rendererMs:performance.now()-prepared}));}catch{}
    }});
  }
  update(snapshot){
    const keys=stereographicSnapshotKeys({modelId:snapshot.model.id??null,sourceFingerprint:snapshot.model.fingerprint},{...snapshot.descriptor,camera:snapshot.camera});
    const changed=!this.snapshot||this.snapshot.model!==snapshot.model||this.snapshot.keys.sourceKey!==keys.sourceKey||this.snapshot.keys.frameKey!==keys.frameKey;
    if(!changed){
      // Capture abort cancels quality ownership but deliberately retains the
      // presentation snapshot and visible buffers. Restoring that same pose
      // must establish fresh ownership instead of remaining in capture limbo.
      if(!this.quality.request){
        this.generation++;this.snapshot={...snapshot,keys,family:this.snapshot.family};this.captureGuard=null;this.diagnostic=null;
        this.quality.interact(keys,snapshot.camera);return true;
      }
      return false;
    }
    const familyDescriptor={...snapshot.descriptor};delete familyDescriptor.angles;
    const view=JSON.parse(snapshot.viewSignature);delete view.angles;
    const family=stereographicSnapshotKeys({modelId:snapshot.model.id??null,sourceFingerprint:snapshot.model.fingerprint},{...familyDescriptor,view,camera:snapshot.camera}).frameKey;
    this.generation++;this.snapshot={...snapshot,keys,family};this.captureGuard=null;this.diagnostic=null;
    this.quality.interact(keys,snapshot.camera);return true;
  }
  submit(qualityRequest){
    const snapshot=this.snapshot,request={...qualityRequest,model:snapshot.model,generation:this.generation,geometry:snapshot.input};
    this.snapshotsByToken.set(qualityRequest.token,snapshot);
    const activeToken=this.transport.active?.meta.token;for(const token of this.snapshotsByToken.keys())if(token!==qualityRequest.token&&token!==activeToken)this.snapshotsByToken.delete(token);
    this.request=qualityRequest;this.promise=qualityRequest.phase==='capture'?this.transport.capture(request):this.transport.request(request);
    this.promise.catch(error=>{
      if(error.name==='AbortError'||!this.quality.isCurrent(qualityRequest))return;
      this.diagnostic=error.message;this.onDiagnostic(error.message);
    });
  }
  async capture({signal,isCurrent=()=>true}={}){
    if(!this.snapshot||signal?.aborted||!isCurrent())throw abort('Stereographic capture is no longer current.');
    const snapshot=this.snapshot,generation=this.generation;
    this.captureGuard={token:this.quality.generation+1,signal,isCurrent};
    const request=this.quality.capture(snapshot.keys,snapshot.camera);
    const cancel=()=>{if(this.quality.isCurrent(request)){this.quality.cancel();this.transport.cancel();}};
    signal?.addEventListener('abort',cancel,{once:true});
    try{
      const publication=await this.promise;
      if(signal?.aborted||!isCurrent()||this.snapshot!==snapshot||this.generation!==generation||!this.quality.isCurrent(request)||this.getModel()!==snapshot.model)throw abort('Stereographic capture source or pose changed.');
      return publication;
    }finally{signal?.removeEventListener('abort',cancel);if(this.captureGuard?.token===request.token)this.captureGuard=null;}
  }
  cancel(){this.quality.cancel();this.transport.cancel();this.snapshot=null;this.captureGuard=null;this.snapshotsByToken.clear();this.generation++;}
  destroy(){this.quality.destroy();this.transport.destroy();this.snapshot=null;this.published=null;this.captureGuard=null;this.snapshotsByToken.clear();this.generation++;}
}
