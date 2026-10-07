/** Two live source-bound previews, absolute saved animation, and guarded fine
 * canvas composition. Native v2 envelopes and app activation are external.
 * This renderer never publishes transformed geometry into a project model.
 */
import * as THREE from 'three';
import {compositeAppearanceBackground} from './viewer-appearance.mjs';
import {prepareAnimatedTourTimeline,evaluateAnimatedTour} from './animated-tour-timeline.mjs';
import {createSequence} from './animation.mjs';
import {prepareAnimationAdapters} from './animation-adapters.mjs';
import {AnimationRenderer} from './animation-renderer.mjs';
import {requireTrackCapabilities} from './animation-track-controls.mjs';
import {resolveExplosion,explosionGeometry} from './explosion.mjs';
import {createMemories,storeMemory} from './model-memories.mjs';
import {requireNoEnabledDualMorph,requireNoTourDualMorph} from './dual-morph-combinations.mjs';

export const ANIMATED_TOUR_RENDER_LIMITS=Object.freeze({layers:2,width:4096,height:4096,pixels:16777216,cacheBytes:128*1024*1024});
const clone=structuredClone,abort=message=>Object.assign(Error(message),{name:'AbortError'}),encoder=new TextEncoder();
const bytes=value=>encoder.encode(JSON.stringify(value)).length;
const sourceSignature=state=>JSON.stringify(state);
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const identity={translation:[0,0,0],angles:Array(6).fill(0),scale:1,opacity:1,explosionFactor:1};
function size(canvas){
  const {width,height}=canvas??{};
  if(!Number.isInteger(width)||width<1||width>ANIMATED_TOUR_RENDER_LIMITS.width||!Number.isInteger(height)||height<1||height>ANIMATED_TOUR_RENDER_LIMITS.height||width*height>ANIMATED_TOUR_RENDER_LIMITS.pixels)throw Error('Animated tour canvas exceeds its bounded 4096-pixel dimensions.');
  return {width,height};
}
/** Ordered SO(3) presentation rotations after the model's SO(4)/projection.
 * Transition spin uses XZ (negative camera Y rotation), matching rotate(). */
export function animatedTourPresentationMatrix(pose){
  if(!pose||pose.translation?.length!==3||pose.angles?.length!==6||![...pose.translation,...pose.angles,pose.scale].every(Number.isFinite)||pose.scale<0||pose.scale>1||[2,4,5].some(i=>pose.angles[i]!==0))throw Error('Tour presentation requires finite 3D translation/rotation and scale in [0,1]; 4D postprojection spin is unsupported.');
  const radians=Math.PI/180,r=new THREE.Matrix4();
  r.premultiply(new THREE.Matrix4().makeRotationZ(pose.angles[0]*radians));
  r.premultiply(new THREE.Matrix4().makeRotationY(-pose.angles[1]*radians));
  r.premultiply(new THREE.Matrix4().makeRotationX(pose.angles[3]*radians));
  r.multiply(new THREE.Matrix4().makeScale(pose.scale,pose.scale,pose.scale));
  r.setPosition(...pose.translation);return r;
}
function setPresentation(viewer,pose){
  if(!viewer?.group?.isObject3D)throw Error('A tour layer requires the actual Three viewer presentation group.');
  viewer.group.matrixAutoUpdate=false;viewer.group.matrix.copy(animatedTourPresentationMatrix(pose));viewer.group.matrixWorldNeedsUpdate=true;viewer.group.updateMatrixWorld(true);
}
function explosionNeeds(timeline){
  const factors=new Map();
  for(const interval of timeline.intervals)if(interval.kind==='transition')for(const time of [interval.start,interval.start+interval.duration*.5]){
    for(const layer of evaluateAnimatedTour(timeline,time).layers)if(layer.transitionPose.explosionFactor>1)factors.set(layer.index,true);
  }
  const result=new Map();let used=0;
  for(const index of factors.keys()){
    const event=timeline.tour.events[index],tracks=event.state.view.animation?.tracks;
    if(tracks?.fold)throw Error('Explosive tour transitions with rigid folding need a separate net-entity adapter; the saved event is retained.');
    if(tracks?.explosion&&tracks.explosion.direction!=='radial')throw Error('A normal explosion track cannot be silently combined with a radial tour transition.');
    const resolved=resolveExplosion(event.state.model,{direction:'radial'});if(!resolved.supported)throw Error(resolved.diagnostic);
    used+=bytes(resolved);if(used>ANIMATED_TOUR_RENDER_LIMITS.cacheBytes)throw Error('Tour explosion preparation exceeds its 128 MiB cache bound.');result.set(index,resolved);
  }
  // Check full declared factor, even if playback has not reached its maximum.
  for(const interval of timeline.intervals)if(interval.kind==='transition'){
    const transition=timeline.tour.events[interval.index].transition;
    const methods=transition.method==='combination'?transition.components:[transition.method];
    for(const [index,affected] of [[interval.index,methods.some(m=>m.includes('explode'))],[interval.nextIndex,methods.some(m=>m.includes('implode'))]])if(affected){
      const animation=timeline.tour.events[index].state.view.animation;
      const initial=animation?.tracks?.explosion?Math.max(...animation.keyframes.map(k=>k.explosionAmount)):0;
      if((1+initial)*transition.explosionSize-1>10)throw Error('Combined radial tour explosion exceeds the existing amount-10 renderer bound.');
    }
  }
  return result;
}

export class AnimatedTourRenderer{
  constructor({tour,timeline,loop=false,canvas,createCanvas=()=>document.createElement('canvas'),createLayer,getOwner,onPresent=()=>{},onDiagnostic=()=>{}}){
    if(typeof createLayer!=='function'||typeof getOwner!=='function')throw Error('Animated tours require independent layer factories and source/project ownership.');
    this.timeline=timeline??prepareAnimatedTourTimeline(tour,{loop});evaluateAnimatedTour(this.timeline,0);requireNoTourDualMorph(this.timeline);
    this.size=size(canvas);this.canvas=canvas;this.pixels=canvas.getContext('2d',{alpha:false});if(!this.pixels)throw Error('Tour output needs a 2D composition canvas.');
    this.scratch=createCanvas();if(this.scratch===canvas)throw Error('Tour staging and visible canvases must be independent.');Object.assign(this.scratch,this.size);this.scratchPixels=this.scratch.getContext('2d',{alpha:false});if(!this.scratchPixels)throw Error('Tour staging canvas is unavailable.');
    this.createLayer=createLayer;this.getOwner=getOwner;const captured=getOwner();this.owner={project:captured?.project,tour:captured?.tour,sourceState:captured?.sourceState,
      document:captured?.document,documentId:captured?.document?.id,states:captured?.document?.states,cursor:captured?.document?.cursor};if(!this.owner.project||!this.owner.sourceState)throw Error('Tour source ownership requires project and sourceState identities.');
    this.ownerSignature=sourceSignature(this.owner.sourceState);if(bytes(this.owner.sourceState)>32*1024*1024)throw Error('Tour source ownership snapshot exceeds 32 MiB.');
    this.onPresent=onPresent;this.onDiagnostic=message=>{try{onDiagnostic(message);}catch{}};this.explosions=explosionNeeds(this.timeline);this.caches=new Map();this.cacheBytes=0;this.slots=[];this.generation=0;this.active=null;this.queued=null;this.closed=false;this.published=null;
  }
  ownerCurrent(){const n=this.getOwner();return !this.closed&&!this.closing&&n?.project===this.owner.project&&n.tour===this.owner.tour&&n.sourceState===this.owner.sourceState&&sourceSignature(n.sourceState)===this.ownerSignature&&
    (!this.owner.document||n.document===this.owner.document&&n.document.id===this.owner.documentId&&n.document.states===this.owner.states&&n.document.cursor===this.owner.cursor);}
  check(job){if(!this.ownerCurrent()||job.controller.signal.aborted||job.token!==this.generation||this.canvas.width!==this.size.width||this.canvas.height!==this.size.height)throw abort('Tour project/source/view, requested pose or canvas size changed.');}
  /** A producer can queue only one latest pose; retired requests reject. Fine
   * publications remain strict. Callers use elapsed time, never frame counters. */
  apply(time,{signal}={}){
    if(this.closed||!this.ownerCurrent()||signal?.aborted)return Promise.reject(abort('Tour renderer is no longer current.'));
    const frame=evaluateAnimatedTour(this.timeline,time),controller=new AbortController(),token=++this.generation;
    this.active?.controller.abort();if(this.queued){this.queued.controller.abort();this.queued.reject(abort('Tour pose superseded.'));this.queued.removeAbort?.();}
    return new Promise((resolve,reject)=>{
      const job={frame,controller,token,resolve,reject},cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});job.removeAbort=()=>signal?.removeEventListener('abort',cancel);
      this.queued=job;this.pump();
    });
  }
  async slot(index,job){
    let actor=this.slots[index];if(actor)return actor;
    actor={slot:index,state:null,eventIndex:null,session:null};
    const context=await this.createLayer({slot:index,getState:()=>actor.state,width:this.size.width,height:this.size.height,isCurrent:()=>this.ownerCurrent()});try{this.check(job);}catch(error){context?.dispose?.();throw error;}
    if(!context?.viewer||!context?.netViewer||typeof context.run!=='function'||typeof context.dispose!=='function'||typeof context.viewer.prepareCapture!=='function'||typeof context.netViewer.prepareCapture!=='function')throw Error('Tour layers require independent base/derived viewers, fine capture, native jobs and disposal.');
    actor.context=context;actor.viewer=context.viewer;actor.netViewer=context.netViewer;
    if(actor.viewer===actor.netViewer||this.slots.some(other=>[other?.viewer,other?.netViewer].some(v=>v===actor.viewer||v===actor.netViewer||v?.renderer.domElement===actor.viewer.renderer.domElement||v?.renderer.domElement===actor.netViewer.renderer.domElement)))throw Error('Outgoing/incoming and base/derived tour layers must not share viewers or source canvases.');
    actor.controls=[actor.viewer,actor.netViewer].map(v=>({viewer:v,controls:v.controls,enabled:v.controls?.enabled,damping:v.controls?.enableDamping}));
    for(const {viewer,controls} of actor.controls){viewer.renderer.setClearColor?.(0x15191f,0);if(controls){controls.enabled=false;controls.enableDamping=false;}}
    const options={...context,getState:()=>actor.state,viewer:actor.viewer,netViewer:actor.netViewer,
      display:()=>actor.viewer.setDisplay(actor.state.view),
      run:async(op,params,model,label,o={})=>{if(o.signal?.aborted||o.isCurrent?.()===false||!this.ownerCurrent())throw abort('Tour native preparation cancelled.');const result=await context.run(op,params,model,label,o);if(o.signal?.aborted||o.isCurrent?.()===false||!this.ownerCurrent())throw abort('Tour native result is stale.');return result;},
      refreshSection:o=>context.refreshSection?context.refreshSection(o):Promise.reject(Error('Tour section renderer is unavailable.')),
      refreshDerived:o=>context.refreshDerived?context.refreshDerived(o):Promise.reject(Error('Tour derived renderer is unavailable.'))};
    actor.renderer=new AnimationRenderer(options);this.slots[index]=actor;return actor;
  }
  async install(actor,layer,job){
    requireNoEnabledDualMorph(layer.state,'Animated tour layer');
    if(actor.eventIndex===layer.index&&actor.session)return;
    actor.session?.destroy();actor.session=null;actor.renderer.clearTracks();this.check(job);
    actor.state=clone(layer.state);actor.eventIndex=layer.index;
    const guards={signal:job.controller.signal,isCurrent:()=>{try{this.check(job);return true;}catch{return false;}}};
    await actor.context.prepareLayout?.(actor.state.view,guards);this.check(job);actor.viewer.setModel(actor.state.model);
    actor.viewer.restoreCamera(actor.state.view.camera??{position:[3.2,2.2,4.5],target:[0,0,0],projection:actor.state.view.cameraProjection||'orthographic',zoom:1,up:[0,1,0],orthographicHalfHeight:1.45});
    const sequence=layer.animation?.sequence??createSequence(actor.state.view,1,1);
    requireTrackCapabilities(sequence,{capabilities:()=>actor.renderer.capabilities(),renderTracks:()=>{}});
    if(actor.state.view.viewportLayout==='split'&&!sequence.tracks?.fold){if(!actor.context.refreshDerived)throw Error('Tour saved comparison layout needs a derived renderer.');await actor.context.refreshDerived(guards);this.check(job);}
    const fetch=kind=>async(model,o)=>{
      this.check(job);const key=JSON.stringify([layer.index,kind]);if(this.caches.has(key))return clone(this.caches.get(key));
      const options={signal:job.controller.signal,isCurrent:()=>o.isCurrent()&&guards.isCurrent()};
      const result=await actor.renderer[kind==='planes'?'loadPlanes':'loadNet'](model,options);this.check(job);
      const saved=storeMemory(createMemories(),1,{model:layer.state.model,view:{},tourCache:result}).slots[0].state.tourCache,n=bytes(saved);
      if(this.cacheBytes+n>ANIMATED_TOUR_RENDER_LIMITS.cacheBytes)throw Error('Tour native caches exceed the 128 MiB bound.');
      this.caches.set(key,saved);this.cacheBytes+=n;return clone(saved);
    };
    actor.session=await prepareAnimationAdapters({state:actor.state,sequence,getState:()=>actor.state,
      loadPlanes:fetch('planes'),loadNet:fetch('net')});this.check(job);
  }
  async renderLayer(actor,layer,job){
    await this.install(actor,layer,job);this.check(job);
    const originalModel=actor.state.model,modelSignature=sourceSignature(layer.state.model),notes=layer.state.notes;
    const sourceCurrent=()=>actor.state.model===originalModel&&actor.viewer.model===originalModel&&sourceSignature(originalModel)===modelSignature&&actor.state.notes===notes;
    const time=layer.animation?.time??0;
    await actor.session.apply(time,async(pose,guards)=>{
      const isCurrent=()=>sourceCurrent()&&guards.isCurrent()&&this.ownerCurrent()&&job.token===this.generation&&!job.controller.signal.aborted;
      if(!isCurrent())throw abort('Tour animation pose is stale.');
      const factor=layer.transitionPose.explosionFactor;
      if(factor>1){const radial=this.explosions.get(layer.index);if(!radial)throw Error('Radial transition was not preflighted.');const amount=(1+(pose.frame.explosionAmount??0))*factor-1;pose={...pose,baseExplosion:explosionGeometry(radial,amount)};}
      await actor.renderer.renderTracks(pose,{signal:guards.signal,isCurrent});this.check(job);
    },{signal:job.controller.signal});this.check(job);
    // Folding qualifies a split layout even if the captured event began single.
    // Resize the real sources before fine geometry uses camera/CSS metrics.
    await actor.context.prepareLayout?.(actor.state.view,{signal:job.controller.signal,isCurrent:()=>sourceCurrent()&&this.ownerCurrent()&&job.token===this.generation&&!job.controller.signal.aborted});this.check(job);
    for(const viewer of [actor.viewer,actor.netViewer])setPresentation(viewer,layer.transitionPose);
    const viewers=actor.state.view.viewportLayout==='split'?[actor.viewer,actor.netViewer]:[actor.viewer];
    const signatures=viewers.map(v=>({viewer:v,view:sourceSignature(v.view),camera:v.camera?JSON.stringify(v.cameraState()):null,matrix:v.group.matrix.toArray()}));
    const isCurrent=()=>{try{this.check(job);return sourceCurrent()&&signatures.every(s=>s.view===sourceSignature(s.viewer.view)&&s.camera===(s.viewer.camera?JSON.stringify(s.viewer.cameraState()):null)&&s.matrix.every((x,i)=>Object.is(x,s.viewer.group.matrix.elements[i])));}catch{return false;}};
    for(const viewer of viewers){this.check(job);const result=await viewer.prepareCapture({signal:job.controller.signal,isCurrent});this.check(job);if(result?.complete!==true)throw Error('Tour capture requires complete fine current-pose geometry.');if(!isCurrent())throw abort('Tour layer changed after fine preparation.');viewer.draw();}
    return {actor,layer,viewers,isCurrent};
  }
  compose(rendered,job){
    this.check(job);const ctx=this.scratchPixels,{width,height}=this.size;ctx.save();
    try{ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';compositeAppearanceBackground(ctx,width,height,rendered);
      for(const r of rendered){if(!r.isCurrent())throw abort('Tour layer publication is stale.');ctx.globalAlpha=r.layer.transitionPose.opacity;
        const paneWidth=width/r.viewers.length;r.viewers.forEach((v,i)=>{size(v.renderer.domElement);ctx.drawImage(v.renderer.domElement,i*paneWidth,0,paneWidth,height);});}
    }finally{ctx.restore();}
    this.check(job);for(const r of rendered)if(!r.isCurrent())throw abort('Tour capture changed before composite publication.');
    this.pixels.save();try{this.pixels.globalAlpha=1;this.pixels.globalCompositeOperation='copy';this.pixels.drawImage(this.scratch,0,0);}finally{this.pixels.restore();}
    const published=Object.freeze({time:job.frame.time,phase:job.frame.phase,ended:job.frame.ended,complete:true,token:job.token,
      layers:Object.freeze(rendered.map(r=>Object.freeze({eventId:r.layer.eventId,role:r.layer.role,model:r.layer.state.model,notes:r.layer.state.notes??'',view:freeze(clone(r.actor.state.view)),transitionPose:r.layer.transitionPose}))),canvas:this.canvas});
    this.published=published;this.publishedGuards=rendered.map(r=>r.isCurrent);try{this.onPresent(published);}catch(error){this.onDiagnostic(error.message);}return published;
  }
  async pump(){
    if(this.active||!this.queued)return;const job=this.queued;this.queued=null;this.active=job;
    try{this.check(job);const rendered=[];for(let index=0;index<job.frame.layers.length;index++){const actor=await this.slot(index,job);rendered.push(await this.renderLayer(actor,job.frame.layers[index],job));}job.resolve(this.compose(rendered,job));}
    catch(error){job.reject(error);}finally{job.removeAbort();if(this.active===job)this.active=null;this.pump();}
  }
  current(publication=this.published){return this.ownerCurrent()&&publication===this.published&&publication?.token===this.generation&&!this.active&&!this.queued&&this.publishedGuards?.every(isCurrent=>isCurrent());}
  image(publication=this.published){if(!this.current(publication))throw abort('Tour composite is no longer the exact prepared pose.');return this.canvas.toDataURL('image/png');}
  cancel(){this.generation++;this.active?.controller.abort();if(this.queued){this.queued.reject(abort('Tour renderer cancelled.'));this.queued.removeAbort();this.queued=null;}}
  async close(){
    this.closing=true;this.cancel();while(this.active)await new Promise(resolve=>setTimeout(resolve,0));this.closed=true;
    for(const actor of this.slots){if(!actor)continue;try{if(actor.session){await actor.session.restore((pose,o)=>{if(!o.isCurrent())throw abort('Retired tour preview view changed.');actor.state.view=clone(pose.view);actor.renderer.clearTracks();});}}catch(error){this.onDiagnostic(error.message);}finally{actor.session?.destroy();
      for(const {viewer,controls,enabled,damping} of actor.controls){setPresentation(viewer,identity);if(viewer.controls===controls&&controls){controls.enabled=enabled;controls.enableDamping=damping;}}
      actor.context.dispose();}}
    this.slots=[];this.explosions.clear();this.caches.clear();this.cacheBytes=0;
  }
}
