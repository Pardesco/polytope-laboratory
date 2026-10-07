import {NumericEntry} from './numeric-entry.mjs';
import {requireNoEnabledDualMorph} from './dual-morph-combinations.mjs';
import {createSequence,normalizeSequence,evaluateNormalized,sequenceFrameTimes,setSequenceKeyframe,resizeSequence,withSequenceTracks} from './animation.mjs';
import {recordRenderedVideo} from './video-recorder.mjs';
import {requireTrackCapabilities,createTrackSweep,AnimationTrackSessions,captureAnimationView} from './animation-track-controls.mjs';

const PLANES=['XY','XZ','XW','YZ','YW','ZW'];
const AXES=[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
function canceled(){return new Error('Animation cancelled.');}

export class AnimationControls {
  constructor(context){
    this.context=context;this.time=0;this.generation=0;this.playing=false;this.exporting=false;this.trackSessions=new AnimationTrackSessions(context);
    this.container=context.container||document.getElementById('animation-controls');
    if(!this.container)throw new Error('Animation controls require a container.');
    this.container.innerHTML=`<div class="panel-title">ANIMATION SEQUENCE</div>
      <label>Duration (seconds) <input id="animation-duration" type="text" maxlength="512" value="8"></label>
      <label>Frames per second <input id="animation-fps" type="text" maxlength="512" value="24"></label>
      <label><input id="animation-loop" type="checkbox"> Loop playback</label>
      <label>Rotation plane <select id="animation-plane"></select></label>
      <label>Turns <input id="animation-turns" type="text" maxlength="512" value="1"></label>
      <button id="animation-rotation" class="wide">Create rotation from current view</button>
      <div class="button-row"><button id="animation-section">Create section depth sweep</button><button id="animation-keyframe">Record current pose at time</button></div>
      <div id="animation-track-options">
        <label>Explosion direction <select id="animation-explosion-direction"><option value="normal">Outward normals</option><option value="radial">Entity centroids (radial)</option></select></label>
        <label>Explosion endpoint <input id="animation-explosion-endpoint" type="text" maxlength="512" value="1"></label>
        <div class="button-row"><button id="animation-explosion">Add explosion track</button><button id="animation-fold">Add rigid face-net fold</button></div>
        <label>Explosion pose <input id="animation-explosion-pose" type="range" min="0" max="10" step="0.001" value="0"></label>
        <label>Fold pose <input id="animation-fold-pose" type="range" min="0" max="1" step="0.001" value="0"></label>
      </div>
      <label>Time <input id="animation-time" type="range" min="0" max="8" step="0.001" value="0"></label>
      <output id="animation-position">0.000 / 8.000 s</output>
      <div class="button-row"><button id="animation-play">Play</button><button id="animation-start">Go to start</button><button id="animation-end">Go to end</button></div>
      <label>Capture view <select id="animation-target"><option value="base">Base model</option><option value="section">Section</option><option value="net">Face net</option></select></label>
      <div class="button-row"><button id="animation-png">Export PNG frames</button><button id="animation-webm">Export WebM video</button></div>
      <button id="animation-cancel" class="wide" hidden>Cancel animation export</button>
      <p class="muted">PNG and WebM include both endpoint poses.</p>
      <output id="animation-progress"></output>`;
    this.nodes=Object.fromEntries([...this.container.querySelectorAll('[id]')].map(node=>[node.id.replace('animation-',''),node]));
    PLANES.forEach((label,index)=>this.nodes.plane.add(new Option(label,String(index))));
    const wrap=fn=>context.guard?context.guard(fn):async(...args)=>{try{return await fn(...args);}catch(error){context.setStatus?.(error.message);}};
    this.nodes.duration.onchange=wrap(()=>this.configure());this.nodes.fps.onchange=wrap(()=>this.configure());this.nodes.loop.onchange=wrap(()=>this.configure());
    this.nodes.rotation.onclick=wrap(()=>this.rotation());this.nodes.section.onclick=wrap(()=>this.section());this.nodes.keyframe.onclick=wrap(()=>this.record());
    this.nodes.explosion.onclick=wrap(()=>this.addTrack('explosion'));this.nodes.fold.onclick=wrap(()=>this.addTrack('fold'));
    this.nodes['explosion-pose'].oninput=wrap(()=>this.trackPose('explosionAmount',Number(this.nodes['explosion-pose'].value)));
    this.nodes['fold-pose'].oninput=wrap(()=>this.trackPose('foldFraction',Number(this.nodes['fold-pose'].value)));
    this.nodes.play.onclick=wrap(()=>this.playing?this.pause():this.play());
    this.nodes.start.onclick=wrap(()=>this.scrub(0));this.nodes.end.onclick=wrap(()=>this.scrub(this.sequence().duration));
    this.nodes.time.oninput=wrap(()=>this.scrub(Number(this.nodes.time.value)));
    this.nodes.png.onclick=wrap(()=>this.export('png'));this.nodes.webm.onclick=wrap(()=>this.export('webm'));this.nodes.cancel.onclick=()=>this.cancel();
    this.sync();
  }
  sequence(){const source=this.context.getState();if(!source)throw new Error('Open a model before creating an animation.');return requireTrackCapabilities(source.view.animation||createSequence(source.view),this.context);}
  // This optional callback describes OTHER exporters; it must exclude this
  // controller's own exporting flag so internal apply/cleanup remains usable.
  externalExporting(){return Boolean(this.context.isExporting?.());}
  assertNoExternalExport(){if(this.externalExporting())throw new Error('Finish or cancel the other export before changing animations.');}
  save(sequence){this.assertNoExternalExport();this.trackSessions?.interrupt();this.context.getState().view.animation=normalizeSequence(sequence);this.context.markDirty?.();this.update();}
  numericInputs(extra=[]){
    const keys=['duration','fps','loop',...extra];
    return Object.fromEntries(keys.map(key=>[key,key==='loop'?Boolean(this.nodes.loop.checked):String(this.nodes[key].value)]));
  }
  async numericAction(extra,fields,publish){
    this.assertNoExternalExport();
    if(this.exporting||this.editing)throw Error('Finish or cancel the current animation action first.');
    const inputs=this.numericInputs(extra);this.editing=true;this.pause();const source=this.context.getState(),generation=this.generation,
      original=source?.view.animation,signature=JSON.stringify(original),time=this.time;
    const current=()=>{this.assertActive(source,generation);if(this.time!==time||source.view.animation!==original||JSON.stringify(source.view.animation)!==signature)throw Error('The animation sequence or time changed. Repeat the edit.');};
    const entry=this.numericEntry=new NumericEntry({...this.context,
      isExporting:()=>this.exporting||this.externalExporting(),
      getTarget:()=>this.numericInputs(extra)});
    // Each action owns its exact form, not whichever form a previous edit used.
    entry.context.getTarget=()=>this.numericInputs(extra);
    this.editing=true;this.update();
    try{return await entry.run({duration:{text:inputs.duration,min:0,exclusiveMin:true,max:300},fps:{text:inputs.fps,min:1,max:60,integer:true},...fields(inputs)},
      async(values,verify,options)=>{const check=()=>{verify();current();};check();return publish(values,check,options);});}
    finally{this.editing=false;this.update();}
  }
  configuredSequence(values){
    let sequence=this.sequence();
    if(values.duration!==sequence.duration)sequence=resizeSequence(sequence,values.duration);
    return normalizeSequence({...sequence,fps:values.fps,loop:this.nodes.loop.checked});
  }
  async configure(){return this.numericAction([],()=>({}),values=>{
    const sequence=this.configuredSequence(values);this.save(sequence);this.time=Math.min(this.time,sequence.duration);this.update();
    return sequence;
  });}
  async rotation(){return this.numericAction(['turns','plane'],inputs=>({turns:{text:inputs.turns}}),values=>{
    const state=this.context.getState(),old=this.configuredSequence(values),index=Number(this.nodes.plane.value);
    if(!Number.isInteger(index)||index<0||index>=PLANES.length||AXES[index][1]>=(state.model.embeddingDimension||state.model.dimension))throw Error('Choose a rotation plane supported by the source dimension.');
    let sequence=createSequence(state.view,old.duration,old.fps);
    sequence.loop=this.nodes.loop.checked;sequence.keyframes[1].angles=[...sequence.keyframes[0].angles];sequence.keyframes[1].angles[index]+=values.turns*360;
    if(old.version===2){sequence=withSequenceTracks(sequence,old.tracks,state.view);sequence.keyframes=old.keyframes.map(frame=>({...frame,angles:sequence.keyframes[0].angles.map((angle,axis)=>angle+(axis===index?values.turns*360*frame.time/old.duration:0))}));}
    sequence=normalizeSequence(sequence);this.time=0;this.save(sequence);this.context.setStatus?.('Rotation sequence saved with start and end keyframes.');
  });}
  async section(){return this.numericAction([],()=>({}),values=>{
    const state=this.context.getState(),model=this.context.getModel();
    if(model.dimension<3)throw new Error('Section sweeps require a 3D or 4D model.');
    const normal=state.view.sectionNormal,length=Math.hypot(...normal);
    if(!length||normal.length!==model.dimension||normal.some(value=>!Number.isFinite(value)))throw new Error('Set a finite, nonzero section normal first.');
    let low=Infinity,high=-Infinity;
    for(const vertex of model.vertices){const depth=vertex.reduce((sum,value,index)=>sum+value*normal[index]/length,0);low=Math.min(low,depth);high=Math.max(high,depth);}
    const old=this.configuredSequence(values);let sequence=createSequence(state.view,old.duration,old.fps);
    sequence.loop=this.nodes.loop.checked;sequence.keyframes[1].angles=[...sequence.keyframes[0].angles];sequence.keyframes[0].sectionOffset=low;sequence.keyframes[1].sectionOffset=high;
    if(old.version===2){sequence=withSequenceTracks(sequence,old.tracks,state.view);sequence.keyframes=old.keyframes.map(frame=>({...frame,angles:[...sequence.keyframes[0].angles],sectionOffset:low+(high-low)*frame.time/old.duration}));}
    sequence=normalizeSequence(sequence);this.time=0;state.view.derivedMode='section';this.context.showSection?.();this.nodes.target.value='section';this.save(sequence);this.context.setStatus?.('Section sweep saved from the lowest to highest source vertex depth.');
  });}
  async record(){return this.numericAction([],()=>({}),values=>{
    const sequence=setSequenceKeyframe(this.configuredSequence(values),Math.min(this.time,values.duration),this.context.getState().view);
    this.time=Math.min(this.time,values.duration);this.save(sequence);this.context.setStatus?.(`Recorded pose at ${this.time.toFixed(3)} s (${sequence.keyframes.length} keyframes).`);
  });}
  async addTrack(kind){requireNoEnabledDualMorph(this.context.getState(),'Animation track');return this.numericAction(['explosion-direction',...(kind==='fold'?[]:['explosion-endpoint'])],inputs=>kind==='fold'?{}:{amount:{text:inputs['explosion-endpoint'],min:0,max:10}},async(values,check)=>{
    const candidate=createTrackSweep(this.configuredSequence(values),kind,{direction:this.nodes['explosion-direction'].value,amount:kind==='fold'?1:values.amount});
    this.context.stopLegacy?.();await this.trackSessions.prepare(candidate,{preflight:true});check();
    this.time=0;this.save(candidate);if(kind==='fold'){this.context.showNet?.();this.nodes.target.value='net';}
    this.context.setStatus?.(`${kind==='fold'?'Rigid face-net folding':'Explosion'} track saved after source preflight.`);this.update();
  });}
  async trackPose(field,value){
    this.assertNoExternalExport();requireNoEnabledDualMorph(this.context.getState(),'Animation track');
    if(this.editing)throw Error('Finish the numeric animation edit first.');if(this.exporting)return;this.pause();const source=this.context.getState(),generation=this.generation,sequence=this.sequence();
    if(sequence.version!==2||!Object.hasOwn(sequence.keyframes[0],field))throw new Error('Add this track before adjusting its pose.');
    const candidate=setSequenceKeyframe(sequence,this.time,{...source.view,[field]:value});
    await this.trackSessions.prepare(candidate,{preflight:true});this.assertActive(source,generation);this.save(candidate);
    await this.apply(candidate,this.time,source,generation);this.context.markDirty?.();
  }
  sync(){
    const current=this.context.getState();if(current!==this.source){this.cancel();this.trackSessions.reset();this.source=current;this.time=0;if(current?.view.animation?.tracks?.fold)this.nodes.target.value='net';}
    this.update();
  }
  update(){
    const state=this.context.getState();this.container.hidden=!state;if(!state)return;
    let sequence;try{sequence=this.sequence();}catch(error){this.nodes.progress.textContent=error.message;for(const node of this.container.querySelectorAll('button,input,select'))node.disabled=true;this.nodes.cancel.disabled=false;this.nodes.cancel.hidden=!(this.exporting||this.editing);return;}
    if(!this.editing){if(globalThis.document?.activeElement!==this.nodes.duration)this.nodes.duration.value=sequence.duration;if(globalThis.document?.activeElement!==this.nodes.fps)this.nodes.fps.value=sequence.fps;this.nodes.loop.checked=sequence.loop;}this.nodes.time.max=sequence.duration;this.nodes.time.value=this.time;
    this.nodes.position.textContent=`${this.time.toFixed(3)} / ${sequence.duration.toFixed(3)} s · ${sequence.keyframes.length} keyframes`;
    this.nodes.play.textContent=this.playing?'Pause':'Play';this.nodes.cancel.hidden=!(this.exporting||this.editing);this.nodes.cancel.textContent=this.editing?'Cancel numeric edit':'Cancel animation export';
    const dimension=this.context.getModel()?.embeddingDimension||this.context.getModel()?.dimension||3;
    for(const option of this.nodes.plane.options)option.disabled=AXES[Number(option.value)][1]>=dimension;
    if(this.nodes.plane.selectedOptions[0]?.disabled)this.nodes.plane.value='0';
    this.nodes.section.disabled=dimension<3;
    for(const name of ['duration','fps','loop','rotation','section','keyframe','play','start','end','time','png','webm','target','turns','plane','explosion','fold','explosion-direction','explosion-endpoint','explosion-pose','fold-pose'])if(this.editing||this.exporting||this.externalExporting())this.nodes[name].disabled=true;else this.nodes[name].disabled=name==='section'&&dimension<3;
    const caps=typeof this.context.capabilities==='function'?this.context.capabilities():this.context.capabilities;
    this.nodes['track-options'].hidden=!caps?.explosion&&!caps?.fold;this.nodes.explosion.disabled||=caps?.explosion!==true;this.nodes.fold.disabled||=caps?.fold!==true;
    this.nodes['explosion-pose'].disabled||=!sequence.tracks?.explosion;this.nodes['fold-pose'].disabled||=!sequence.tracks?.fold;
    this.nodes['explosion-pose'].value=state.view.explosionAmount??0;this.nodes['fold-pose'].value=state.view.foldFraction??state.view.net?.fraction??0;
    this.nodes.target.querySelector('option[value="net"]').disabled=!sequence.tracks?.fold||!this.context.netViewer&&!this.context.sectionViewer;
    if(state.view.dualMorph?.enabled===true){for(const name of ['play','start','end','time','png','webm','explosion','fold','explosion-pose','fold-pose'])this.nodes[name].disabled=true;this.nodes.progress.textContent='Reset the dual morph before animation playback or export; combined tracks are unavailable.';}
  }
  assertActive(source,generation){this.assertNoExternalExport();if(this.generation!==generation || this.context.getState()!==source)throw canceled();}
  async apply(sequence,time,source,generation,{forceSection=false}={}){
    this.assertActive(source,generation);requireNoEnabledDualMorph(source,'Animation pose');
    if(sequence.version===2){await this.trackSessions.apply(sequence,time,()=>!this.externalExporting()&&this.generation===generation&&this.context.getState()===source&&(!this.exporting||!this.exportAbort));this.assertActive(source,generation);this.exportView?.accept();this.time=Math.max(0,Math.min(sequence.duration,time));this.update();return;}
    if(this.exportView&&!this.exportView.current())throw new Error('Animation source view changed; publication cancelled.');
    const frame=evaluateNormalized(sequence,time),view=source.view,changed=view.sectionOffset!==frame.sectionOffset;
    view.angles=frame.angles;view.sectionOffset=frame.sectionOffset;if(changed)delete view.sectionAlignment;
    this.context.display?.();this.context.viewer.setDisplay(view);this.context.syncPose?.(view);this.time=frame.time;this.update();
    this.exportView?.accept();
    if(view.derivedMode==='section' && (changed||forceSection)){
      await this.context.refreshSection();this.assertActive(source,generation);
      if(this.exportView&&!this.exportView.current())throw new Error('Animation source view changed; publication cancelled.');
    }
    this.context.viewer.draw();if(view.derivedMode==='section')this.context.sectionViewer?.draw();
  }
  pause(){if(this.playing)this.context.markDirty?.();this.playing=false;this.generation++;this.trackSessions?.interrupt();if(this.raf)cancelAnimationFrame(this.raf);this.raf=null;this.update();}
  cancelNumeric(){this.numericEntry?.cancel();}
  cancel(){this.cancelNumeric();this.exportAbort=true;this.exportController?.abort();this.pause();if(this.exportRecorder&&this.exportRecorder.state!=='inactive')this.exportRecorder.stop();}
  async prepareCapture(viewer,check,signal=this.exportController?.signal){
    const assertCurrent=()=>{check();if(signal?.aborted)throw canceled();};
    assertCurrent();
    // Legacy viewers are synchronous. Worker-backed viewers must publish the
    // exact fine pose before either image() or canvas pixel copying can run.
    if(typeof viewer.prepareCapture==='function')await viewer.prepareCapture({signal,isCurrent:()=>{try{assertCurrent();return true;}catch{return false;}}});
    assertCurrent();
  }
  async scrub(time){
    this.assertNoExternalExport();requireNoEnabledDualMorph(this.context.getState(),'Animation pose');
    if(this.editing)throw Error('Finish the numeric animation edit first.');if(this.exporting)return;this.pause();this.exportAbort=false;this.context.stopLegacy?.();const generation=this.generation,source=this.context.getState();
    try{await this.apply(this.sequence(),time,source,generation,{forceSection:source.view.derivedMode==='section'});this.context.markDirty?.();}catch(error){if(this.generation===generation)throw error;}
  }
  play(){
    this.assertNoExternalExport();requireNoEnabledDualMorph(this.context.getState(),'Animation playback');
    if(this.editing)throw Error('Finish the numeric animation edit first.');if(this.exporting)return;this.exportAbort=false;this.context.stopLegacy?.();const sequence=this.sequence(),source=this.context.getState();
    if(!source.view.animation)this.save(sequence);
    this.pause();this.playing=true;const generation=this.generation;
    if(this.time>=sequence.duration)this.time=0;
    const initial=this.time,started=performance.now();this.update();
    const frame=async now=>{
      if(!this.playing||generation!==this.generation)return;
      let time=initial+(now-started)/1000;if(sequence.loop)time%=sequence.duration;else time=Math.min(time,sequence.duration);
      try{await this.apply(sequence,time,source,generation);}catch(error){if(generation===this.generation){this.pause();this.context.setStatus?.(error.message);}return;}
      if(!this.playing||generation!==this.generation)return;
      if(time>=sequence.duration&&!sequence.loop){this.pause();this.context.markDirty?.();return;}
      this.raf=requestAnimationFrame(frame);
    };
    this.raf=requestAnimationFrame(frame);
  }
  async export(format){
    this.assertNoExternalExport();requireNoEnabledDualMorph(this.context.getState(),'Animation export');
    if(this.exporting)throw new Error('An animation export is already running.');
    await this.configure();this.context.stopLegacy?.();this.pause();
    const source=this.context.getState(),sequence=this.sequence(),generation=this.generation,target=this.nodes.target.value;
    if(target==='section'&&source.model.dimension<3)throw new Error('Section export requires a 3D or 4D model.');
    if(target==='net'&&!sequence.tracks?.fold)throw new Error('Face-net capture requires a qualified rigid folding track.');
    if(target==='section'&&sequence.tracks?.fold)throw new Error('A folding sequence displays a face net. Choose Face net or Base model for capture.');
    const viewer=target==='net'?(this.context.netViewer||this.context.sectionViewer):target==='section'?this.context.sectionViewer:this.context.viewer;
    if(!viewer)throw new Error('The requested capture view is unavailable.');
    const times=sequenceFrameTimes(sequence),originalTime=this.time,snapshot=captureAnimationView(source,this.context.getState);
    const controller=new AbortController();this.exportController=controller;this.exportView=snapshot;
    this.exporting=true;this.exportAbort=false;this.update();this.context.onExportStateChange?.();let session=null;
    const controlSnapshot=[...new Set([this.context.viewer,this.context.sectionViewer,this.context.netViewer].filter(Boolean))].map(item=>({viewer:item,controls:item.controls,enabled:item.controls?.enabled,damping:item.controls?.enableDamping}));
    let trackSession=null;
    try{
      if(format==='webm'&&(typeof VideoEncoder!=='function'||typeof VideoEncoder.isConfigSupported!=='function'||typeof VideoFrame!=='function'))throw new Error('Explicit-pose WebCodecs video encoding is unavailable. Export PNG frames instead.');
      if(target==='section'){source.view.derivedMode='section';snapshot.accept();}
      if(sequence.version===2){trackSession=await this.trackSessions.prepare(sequence);this.assertActive(source,generation);}
      session=await this.context.api.animationBegin({format,name:source.model.name,fps:sequence.fps,frameCount:times.length,duration:sequence.duration});
      if(!session)return;
      this.assertActive(source,generation);
      for(const item of controlSnapshot)if(item.viewer.controls){item.viewer.controls.update();item.viewer.controls.enabled=false;item.viewer.controls.enableDamping=false;}
      const check=()=>{this.assertActive(source,generation);if(this.exportAbort||controller.signal.aborted||this.exportController!==controller||!this.exporting)throw canceled();if(!snapshot.current())throw new Error('Animation source view changed; export cancelled.');};
      if(format==='png'){
        for(let index=0;index<times.length;index++){
          check();await this.apply(sequence,times[index],source,generation,{forceSection:target==='section'});check();
          await this.prepareCapture(viewer,check,controller.signal);const image=viewer.image();check();
          await this.context.api.animationWrite(session.id,index,image);check();
          this.nodes.progress.textContent=`Frame ${index+1} / ${times.length}`;
          // Yield so cancellation and document switches can interrupt long jobs.
          await delay(0);
        }
      }else await this.recordVideo(viewer,sequence,times,source,generation,session.id,check,target);
      check();const result=await this.context.api.animationFinish(session.id);session=null;
      this.nodes.progress.textContent=`Exported ${result.path}`;this.context.setStatus?.(`Exported animation ${result.path}`);
    }catch(error){if(this.exportAbort||generation!==this.generation)this.nodes.progress.textContent='Animation export cancelled.';else throw error;}
    finally{
      // Fence any deferred renderer work before discarding native staging.
      controller.abort();if(this.exportController===controller)this.exportController=null;
      if(session)await this.context.api.animationAbort(session.id).catch(error=>this.context.setStatus?.(error.message));
      let tracksRestored=!trackSession;
      if(trackSession){try{await trackSession.restore(this.context.renderTracks);snapshot.accept();tracksRestored=true;}catch(error){this.context.setStatus?.(error.message);}finally{trackSession.destroy();}}
      this.exportView=null;
      if(tracksRestored&&snapshot.restore()){
        this.time=originalTime;this.context.display?.();this.context.viewer.setDisplay(source.view);this.context.syncPose?.(source.view);
        if(source.view.derivedMode==='section')await this.context.refreshSection().catch(error=>this.context.setStatus?.(error.message));
        this.context.viewer.draw();this.context.sectionViewer?.draw();
      }
      for(const item of controlSnapshot)if(item.viewer.controls===item.controls&&item.controls){item.controls.enabled=item.enabled;item.controls.enableDamping=item.damping;}
      this.exporting=false;this.exportRecorder=null;this.update();this.context.onExportStateChange?.();
    }
  }
  async recordVideo(viewer,sequence,times,source,generation,id,check,target){
    // A dedicated 2D capture surface gets a fresh pixel copy even when the
    // WebGL viewport has been scrolled offscreen or its window is occluded.
    const displayed=viewer.renderer.domElement,capture=document.createElement('canvas');capture.width=displayed.width;capture.height=displayed.height;
    const pixels=capture.getContext('2d',{alpha:false});if(!pixels)throw new Error('Video capture surface could not be created.');
    const copy=async()=>{await this.prepareCapture(viewer,check);viewer.draw();check();pixels.drawImage(displayed,0,0,capture.width,capture.height);check();};
    await recordRenderedVideo({canvas:capture,fps:sequence.fps,frameCount:times.length,frameTimes:times,check,
      renderFrame:async index=>{await this.apply(sequence,times[index],source,generation,{forceSection:target==='section'});check();await copy();},
      writeChunk:(index,data)=>this.context.api.animationWrite(id,index,data),onRecorder:recorder=>{this.exportRecorder=recorder;},
      progress:value=>{this.nodes.progress.textContent=typeof value==='string'?value:`Recording frame ${value} / ${times.length}`;}});
  }
}
