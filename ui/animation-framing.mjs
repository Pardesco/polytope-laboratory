// SPDX-License-Identifier: GPL-3.0-only
import {sequenceFrameTimes} from './animation.mjs';
import {captureAnimationView} from './animation-track-controls.mjs';
import {requireMorphAnimation} from './morph-animation-adapter.mjs';

/** Bound the actual displayed geometry at export times, including endpoints.
 * Only an explicit user action publishes the resulting camera. */
export function frameBounds(limit=2_000_000){
  const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];let count=0;
  return {
    add(points){
      for(const p of points){
        if(!p||p.length!==3||!Array.from(p).every(Number.isFinite))throw Error('Animation framing encountered a nonfinite display point.');
        if(++count>limit)throw Error('Animation framing exceeds the two-million-point work limit. Reduce the duration or frame rate.');
        for(let axis=0;axis<3;axis++){low[axis]=Math.min(low[axis],p[axis]);high[axis]=Math.max(high[axis],p[axis]);}
      }
    },
    corners(){if(!count)throw Error('The selected animation view has no visible geometry to fit.');return Array.from({length:8},(_,i)=>low.map((x,axis)=>i&(1<<axis)?high[axis]:x));},
    get count(){return count;}
  };
}

export async function fitAnimationFrames(animation){
  const context=animation.context;
  animation.assertNoExternalExport();requireMorphAnimation(context.getState(),animation.sequence(),'Animation framing');
  if(animation.exporting||animation.editing)throw Error('Finish or cancel the current animation action first.');
  await animation.configure();context.stopLegacy?.();animation.pause();
  const source=context.getState(),sequence=animation.sequence(),generation=animation.generation,target=animation.nodes.target.value;
  if(sequence.tracks?.morphRatio&&target!=='base')throw Error('Dual-morph framing requires Base model capture.');
  if(target==='section'&&source.model.dimension<3)throw Error('Section framing requires a 3D or 4D model.');
  if(target==='net'&&!sequence.tracks?.fold)throw Error('Face-net framing requires a qualified rigid folding track.');
  if(target==='section'&&sequence.tracks?.fold)throw Error('Choose Face net or Base model to frame a folding sequence.');
  const viewer=target==='net'?(context.netViewer||context.sectionViewer):target==='section'?context.sectionViewer:context.viewer;
  if(!viewer||typeof viewer.observationCloud!=='function'||typeof viewer.fit!=='function')throw Error('The selected viewer cannot frame animation geometry.');
  const signature=()=>JSON.stringify(Object.fromEntries(Object.entries(source).filter(([key])=>key!=='view'))),sourceSignature=signature();
  const times=sequenceFrameTimes(sequence),originalTime=animation.time,snapshot=captureAnimationView(source,context.getState),bounds=frameBounds();
  const cameras=[...new Set([context.viewer,context.sectionViewer,context.netViewer].filter(Boolean))].map(v=>({viewer:v,
    camera:structuredClone(v.cameraState()),expected:JSON.stringify(v.cameraState()),controls:v.controls,enabled:v.controls?.enabled,damping:v.controls?.enableDamping}));
  const camerasCurrent=()=>cameras.every(item=>JSON.stringify(item.viewer.cameraState())===item.expected);
  const acceptCameras=()=>{for(const item of cameras)item.expected=JSON.stringify(item.viewer.cameraState());};
  const controller=new AbortController();animation.exportController=controller;animation.exportView=snapshot;
  animation.exporting=true;animation.exportAbort=false;animation.update();context.onExportStateChange?.();
  let trackSession=null,completed=false,restored=false,corners;
  const check=()=>{
    animation.assertActive(source,generation);
    if(animation.exportAbort||controller.signal.aborted||animation.exportController!==controller||!animation.exporting)throw Error('Animation framing cancelled.');
    if(!snapshot.current()||signature()!==sourceSignature||!camerasCurrent())throw Error('Animation source, view or camera changed; framing cancelled.');
  };
  try{
    for(const item of cameras)if(item.controls){item.controls.update();item.controls.enabled=false;item.controls.enableDamping=false;}
    acceptCameras();check();
    if(target==='section'){if(source.view.derivedMode!=='cell-section')source.view.derivedMode='section';snapshot.accept();}
    if(sequence.version>=2){trackSession=await animation.trackSessions.prepare(sequence);check();}
    for(let index=0;index<times.length;index++){
      check();await animation.apply(sequence,times[index],source,generation,{forceSection:target==='section'});
      // The fold/section renderer may initialize its own derived camera.
      acceptCameras();check();await animation.prepareCapture(viewer,check,controller.signal);check();
      bounds.add(viewer.observationCloud());
      animation.nodes.progress.textContent=`Framing ${index+1} / ${times.length}`;
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    check();corners=bounds.corners();completed=true;
  }finally{
    const owned=context.getState()===source&&signature()===sourceSignature&&snapshot.current()&&camerasCurrent();
    controller.abort();if(animation.exportController===controller)animation.exportController=null;
    let tracksRestored=!trackSession;
    if(trackSession){try{await trackSession.restore(context.renderTracks);snapshot.accept();tracksRestored=true;}catch(error){context.setStatus?.(error.message);}finally{trackSession.destroy();}}
    animation.exportView=null;
    if(owned&&tracksRestored&&signature()===sourceSignature&&snapshot.restore()){
      animation.time=originalTime;context.display?.();context.viewer.setDisplay(source.view);context.syncPose?.(source.view);
      if(['section','cell-section'].includes(source.view.derivedMode))await context.refreshSection().catch(error=>context.setStatus?.(error.message));
      // Pose sampling must not silently leave its camera behind on any viewer.
      if(context.getState()===source&&signature()===sourceSignature&&snapshot.current()){
        for(const item of cameras)item.viewer.restoreCamera(item.camera);
        context.viewer.draw();context.sectionViewer?.draw();restored=true;
      }
    }
    for(const item of cameras)if(item.viewer.controls===item.controls&&item.controls){item.controls.enabled=item.enabled;item.controls.enableDamping=item.damping;}
    animation.exporting=false;animation.update();context.onExportStateChange?.();
  }
  if(!completed||!restored||context.getState()!==source||signature()!==sourceSignature||!snapshot.current())throw Error('Animation framing was cancelled; the fitted camera was not saved.');
  // fit() preserves the user's camera direction, up vector and projection.
  const camera=viewer.fit(1.2,corners);source.view[target==='base'?'camera':'derivedCamera']=structuredClone(camera);
  viewer.draw();context.markDirty?.();animation.update();
  const message=`Fitted ${times.length} export frames. The original pose is restored.`;
  animation.nodes.progress.textContent=message;context.setStatus?.(message);
  return {frames:times.length,points:bounds.count,camera};
}
