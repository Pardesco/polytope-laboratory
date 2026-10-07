/** Capability-qualified tracks and stable-source native preflight sessions. */
import {normalizeSequence,withSequenceTracks} from './animation.mjs';
import {prepareAnimationAdapters} from './animation-adapters.mjs';
import {foldingCacheSignature} from './generalized-fold-qualification.mjs';

export function requireTrackCapabilities(sequence,context){
  const normalized=normalizeSequence(sequence);if(normalized.version===1)return normalized;
  const capabilities=typeof context.capabilities==='function'?context.capabilities():context.capabilities;
  const missing=Object.keys(normalized.tracks).filter(name=>capabilities?.[name]!==true);
  if(missing.length||typeof context.renderTracks!=='function')throw Error(`Saved ${missing.length?missing.join(', '):'animation'} tracks require renderer adapters that are not available. The saved sequence is retained.`);
  return normalized;
}

export function createTrackSweep(sequence,kind,{direction='normal',amount=1}={}){
  const original=normalizeSequence(sequence),tracks={...original.tracks};
  if(kind==='explosion')tracks.explosion={direction};else if(kind==='fold')tracks.fold={kind:'face-net'};else throw Error('Choose an explosion or rigid face-net track.');
  const result=withSequenceTracks(original,tracks),field=kind==='explosion'?'explosionAmount':'foldFraction';
  if(!Number.isFinite(amount)||amount<0||amount>(kind==='explosion'?10:1))throw Error('Track endpoint is outside its supported range.');
  result.keyframes=result.keyframes.map(frame=>({...frame,[field]:frame.time===0?0:frame.time===result.duration?amount:amount*(frame.time/result.duration)}));
  return normalizeSequence(result);
}

export class AnimationTrackSessions{
  constructor(context){this.context=context;this.cache={};this.session=null;this.controller=null;this.revision=0;}
  identify(sequence){
    const normalized=requireTrackCapabilities(sequence,this.context),source=this.context.getState();if(!source)throw Error('Open a model before animating.');
    const model=source.model,key=JSON.stringify([normalized,normalized.tracks?.fold?foldingCacheSignature(source):null]),fingerprint=model.fingerprint??null;
    if(source!==this.source||model!==this.model||key!==this.key||fingerprint!==this.fingerprint){this.reset();this.source=source;this.model=model;this.key=key;this.fingerprint=fingerprint;}
    return {normalized,source};
  }
  interrupt(){this.revision++;this.controller?.abort();this.controller=null;this.session?.destroy();this.session=null;}
  reset(){this.interrupt();this.cache={};this.source=null;this.model=null;this.key=null;this.fingerprint=null;}
  async prepare(sequence,{preflight=false}={}){
    const {normalized,source}=this.identify(sequence);
    if(normalized.version===1)return null;
    if(!preflight&&this.session){try{this.session.evaluate(0);return this.session;}catch{this.interrupt();}}
    else this.interrupt();
    const revision=this.revision,controller=new AbortController();this.controller=controller;
    const fetch=kind=>async(model,guards)=>{
      if(Object.hasOwn(this.cache,kind))return structuredClone(this.cache[kind]);
      const callback=this.context[kind==='planes'?'loadPlanes':'loadNet'];if(typeof callback!=='function')throw Error(`Native ${kind} preflight is unavailable.`);
      const result=await callback(model,guards);
      if(!guards.isCurrent()||controller.signal.aborted||revision!==this.revision)throw Error('Animation preparation cancelled.');
      this.cache[kind]=structuredClone(result);return result;
    };
    try{
      const session=await prepareAnimationAdapters({state:source,sequence:normalized,getState:this.context.getState,loadPlanes:fetch('planes'),loadNet:fetch('net'),signal:controller.signal});
      if(controller.signal.aborted||revision!==this.revision){session.destroy();throw Error('Animation preparation cancelled.');}
      if(preflight){session.destroy();if(this.controller===controller)this.controller=null;return null;}
      this.session=session;return session;
    }catch(error){if(revision===this.revision){this.cache={};if(this.controller===controller)this.controller=null;}throw error;}
  }
  async apply(sequence,time,isCurrent=()=>true){
    const session=await this.prepare(sequence);if(!session)throw Error('Presentation adapters require active tracks.');
    if(!isCurrent())throw Error('Animation cancelled.');
    return session.apply(time,async(pose,guards)=>{await this.context.renderTracks(pose,{signal:guards.signal,isCurrent:()=>isCurrent()&&guards.isCurrent()});if(!isCurrent())throw Error('Animation cancelled.');});
  }
}

/** Full-view ownership for legacy exports. Restoration never mutates an old
 * document or overwrites an external camera/settings edit. */
export function captureAnimationView(source,getState){
  const model=source.model,id=model.id??null,fingerprint=model.fingerprint??null,original=structuredClone(source.view);
  let expected=JSON.stringify(source.view);
  const current=()=>getState()===source&&source.model===model&&(model.id??null)===id&&(model.fingerprint??null)===fingerprint&&JSON.stringify(source.view)===expected;
  return {original,current,accept(){expected=JSON.stringify(source.view);},restore(){if(!current())return false;source.view=structuredClone(original);expected=JSON.stringify(source.view);return true;}};
}
