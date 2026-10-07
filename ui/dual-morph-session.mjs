import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
const abort = message => Object.assign(Error(message), {name:'AbortError'});
const clone = value => structuredClone(value);
const signature = value => JSON.stringify(value ?? null);
export const MORPH_INVENTORY=Object.freeze(['sizing','truncation','augmentation','expansion','tilting-quads','tilting-triangles','tilting-to-compound','tilting-to-rectify','via-snub']);
export const MORPH_SUPPORTED=Object.freeze(['sizing','truncation','augmentation','expansion','tilting-quads','tilting-triangles','tilting-to-compound','tilting-to-rectify']);
export const morphEligible=(model,method)=>MORPH_SUPPORTED.includes(method)&&(model?.interpretation==='convex-polytope'||model?.interpretation==='generalized-complex'&&(model.dimension===3&&['sizing','expansion'].includes(method)||model.dimension===4&&method==='expansion'))&&(model.embeddingDimension??model.dimension)===model.dimension&&([3,4].includes(model.dimension))&&(model.dimension===3||['expansion','tilting-quads'].includes(method));

/** One active native job + one latest pending pose. Exact seeks never resolve
 * with a superseded pose; playback may publish complete earlier poses in order.
 * View observer fields remain independent; only dualMorph is written. */
export class DualMorphSession{
  constructor(context){this.context=context;this.generation=0;this.jobId=0;this.prepared=null;this.owner=null;this.expected='null';this.active=null;this.queued=null;this.playing=false;this.frameHandle=null;this.numericEntry=null;}
  blocked(){if(this.context.isExporting?.())throw Error('Finish export before editing or playing a dual morph.');}
  qualifiedView(view){if(view.elementAnnotations?.entries?.length&&!this.context.mappedContent)throw Error('Remove the source text/PNG annotations before dual morphing, or reset the dual morph to show them; mapped morph content is not yet qualified.');if(view.hiddenCells?.length||view.isolatedCell!=null||view.cellFacing&&view.cellFacing!=='all'||(view.cellShrink??1)!==1||view.explosionAmount>0)throw Error('Reveal all cells and reset shrink/explosion before dual morphing; combined source masks/tracks are not yet qualified.');}
  checked(owner=this.owner,expected=this.expected){this.blocked();if(!owner)throw Error('Prepare a supported dual morph first.');verifyNativeSource(this.context,owner);this.qualifiedView(owner.state.view);if(this.context.mappedContent&&owner.contentSignature!==signature(owner.state.view.elementAnnotations))throw abort('Morph source element annotations changed.');if(signature(owner.state.view.dualMorph)!==expected)throw abort('Morph method, center, radius, ratio, or playback settings changed.');}
  guard(owner,expected,token,controller,verify){return()=>{if(token!==this.generation||controller.signal.aborted)throw abort('Dual morph canceled.');verify?.();this.checked(owner,expected);};}
  sourceContext(owner){return {notes:owner.notes??'',unit:owner.unit};}
  async configure(settings,{signal,verifyPublication}={}){
    if(this.configuration)throw Error('Finish the current morph preparation first.');
    this.blocked();if(settings?.enabled!==true)throw Error('Enable the candidate morph before preparing its display.');if(!morphEligible(this.context.getState()?.model,settings.method))throw Error('This morph method/dimension is unavailable; saved settings are retained.');
    const state=this.context.getState(),view=state.view;
    this.qualifiedView(view);
    this.context.stopOther?.();
    this.pause();this.active?.controller.abort();if(this.queued)this.queued.reject(abort('Morph preparation changed.'));this.queued=null;
    const owner=captureNativeSource(this.context),before=signature(owner.state.view.dualMorph),token=++this.generation,controller=new AbortController();
    owner.contentSignature=signature(owner.state.view.elementAnnotations);this.configuration=controller;const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)controller.abort();
    const verify=this.guard(owner,before,token,controller,verifyPublication),isCurrent=()=>{try{verify();return true;}catch{return false;}};
    this.context.onState?.();
    try{
      verify();const source=JSON.parse(owner.modelSignature),sourceContext=this.sourceContext(owner);
      const prepared=await this.context.prepare(source,clone(settings),sourceContext,{signal:controller.signal,isCurrent});verify();
      const frame=await this.context.evaluate(source,prepared,settings.ratio,sourceContext,{signal:controller.signal,isCurrent});verify();
      this.validateFrame(frame,prepared,settings.ratio);
      await this.context.render(frame,{signal:controller.signal,isCurrent});verify();
      this.owner=owner;this.prepared=clone(prepared);owner.state.view.dualMorph=clone(frame.settings);this.expected=signature(owner.state.view.dualMorph);
      this.context.markDirty?.();this.context.onState?.();return frame;
    }finally{signal?.removeEventListener('abort',cancel);if(this.configuration===controller)this.configuration=null;this.context.onState?.();}
  }
  validateFrame(frame,prepared,ratio){
    const fields=['sourceModelId','sourceFingerprint','sourceAttributesSha256','sourceContextSha256','descriptorSha256'];
    if(!frame?.model||frame.ratio!==ratio||frame.method!==prepared.settings.method||frame.certified!==false||!frame.binding||Object.keys(frame.binding).length!==fields.length||fields.some(k=>frame.binding[k]!==prepared[k]))
      throw Error('Native morph frame identity/ratio/attributes do not match its preparation.');
  }
  seek(ratio,{exact=true,signal}={}){
    this.blocked();if(typeof ratio!=='number'||!Number.isFinite(ratio)||ratio<0||ratio>1)throw Error('Morph ratio must lie in [0,1].');
    if(signal?.aborted)throw abort('Morph pose canceled.');
    if(!this.prepared)throw Error('Prepare a supported dual morph first.');this.checked();
    const id=++this.jobId;
    return new Promise((resolve,reject)=>{
      if(this.queued){this.queued.cleanup();this.queued.reject(abort('Morph pose superseded.'));}
      const job={ratio,exact,id,resolve,reject,cleanup:()=>signal?.removeEventListener('abort',cancel)};
      const cancel=()=>{if(this.active?.job===job)this.active.controller.abort();if(this.queued===job)this.queued=null;job.cleanup();reject(abort('Morph pose canceled.'));};
      signal?.addEventListener('abort',cancel,{once:true});this.queued=job;this.pump();
    });
  }
  async pump(){
    if(this.active||!this.queued)return;const job=this.queued;this.queued=null;const controller=new AbortController(),token=this.generation;
    this.active={job,controller};const owner=this.owner,prepared=this.prepared;
    const isCurrent=()=>{try{this.checked(owner);return token===this.generation&&!controller.signal.aborted&&(!job.exact||job.id===this.jobId);}catch{return false;}};
    try{
      if(!isCurrent())throw abort('Morph pose is stale.');
      const frame=await this.context.evaluate(JSON.parse(owner.modelSignature),prepared,job.ratio,this.sourceContext(owner),{signal:controller.signal,isCurrent});
      if(!isCurrent())throw abort('Morph pose canceled/superseded.');this.validateFrame(frame,prepared,job.ratio);
      await this.context.render(frame,{signal:controller.signal,isCurrent});if(!isCurrent())throw abort('Morph source/settings changed before publication.');
      owner.state.view.dualMorph=clone(frame.settings);this.expected=signature(owner.state.view.dualMorph);this.context.markDirty?.();job.resolve(frame);
    }catch(error){job.reject(error);if(error.name!=='AbortError'){this.pause();this.context.onError?.(error);}}
    finally{job.cleanup();if(this.active?.controller===controller)this.active=null;this.context.onState?.();this.pump();}
  }
  play(){
    this.blocked();this.checked();if(!this.prepared)throw Error('Prepare a morph first.');if(this.playing)return;
    this.context.stopOther?.();this.playing=true;const start=this.now(),initial=this.owner.state.view.dualMorph.ratio,duration=this.owner.state.view.dualMorph.duration,loop=this.owner.state.view.dualMorph.loop;
    const step=()=>{
      if(!this.playing)return;
      try{this.checked();const elapsed=Math.max(0,(this.now()-start)/1000),value=initial+elapsed/duration,ratio=loop?value-Math.floor(value):Math.min(1,value);
        this.seek(ratio,{exact:false}).catch(error=>{if(error.name!=='AbortError')this.context.onError?.(error);});
        if(!loop&&value>=1){this.playing=false;this.context.onState?.();return;}
        this.frameHandle=this.raf(step);
      }catch(error){this.pause();this.context.onError?.(error);}
    };this.frameHandle=this.raf(step);this.context.onState?.();
  }
  now(){return this.context.clock?.now?.()??performance.now();}
  raf(fn){return this.context.clock?.request?.(fn)??requestAnimationFrame(fn);}
  pause(){this.playing=false;if(this.frameHandle!=null)(this.context.clock?.cancel??cancelAnimationFrame)(this.frameHandle);this.frameHandle=null;this.active?.controller.abort();if(this.queued){this.queued.cleanup();this.queued.reject(abort('Morph paused.'));this.queued=null;}this.context.onState?.();}
  cancel(){this.pause();this.generation++;this.configuration?.abort();this.active?.controller.abort();if(this.queued)this.queued.reject(abort('Morph canceled.'));this.queued=null;this.numericEntry?.cancel();}
  invalidate(){this.prepared=null;this.owner=null;this.cancel();if(!this.context.isExporting?.())this.context.clear?.();this.context.onState?.();}
  reset(){this.blocked();this.checked();this.cancel();const state=this.context.getState();state.view.dualMorph={...clone(state.view.dualMorph),enabled:false,ratio:0};this.expected=signature(state.view.dualMorph);this.context.clear?.();this.context.markDirty?.();this.context.onState?.();}
  adoptAnimationPose(frame,prepared){
    const owner=this.owner,state=this.context.getState();if(!owner||!this.prepared)return false;
    const document=this.context.getDocument(),unit=state?.view?.coordinateUnit??state?.model?.metadata?.coordinateUnits??'model';
    if(state!==owner.state||this.context.getProject()!==owner.project||document!==owner.document||document?.states!==owner.states||document?.cursor!==owner.cursor||JSON.stringify(state.model)!==owner.modelSignature||(state.notes??'')!==(owner.notes??'')||unit!==owner.unit)throw abort('Animation morph adoption belongs to a changed source.');
    this.validateFrame(frame,prepared,frame.ratio);if(prepared.sourceAttributesSha256!==this.prepared.sourceAttributesSha256||prepared.sourceContextSha256!==this.prepared.sourceContextSha256||prepared.descriptorSha256!==this.prepared.descriptorSha256)throw abort('Animation morph attributes or context changed.');
    this.prepared=clone(prepared);this.expected=signature(state.view.dualMorph);return true;
  }
  async restoreSaved(){const saved=this.context.getState()?.view.dualMorph;if(!saved?.enabled)return null;return this.configure(clone(saved));}
  async prepareCapture({signal}={}){
    if(!this.prepared||!this.owner)throw Error('Wait for saved dual morph reconstruction before capture.');
    this.pause();this.checked();const ratio=this.context.getState().view.dualMorph.ratio;await this.seek(ratio,{exact:true,signal});this.checked();
    const isCurrent=()=>{try{this.checked();return !signal?.aborted&&this.context.getState().view.dualMorph.ratio===ratio;}catch{return false;}};
    await this.context.prepareCapture?.({signal,isCurrent});if(!isCurrent())throw abort('Morph capture pose/source changed.');
  }
}
