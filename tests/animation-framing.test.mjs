// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {AnimationControls} from '../ui/animation-controls.mjs';
import {AnimationRenderer} from '../ui/animation-renderer.mjs';
import {AnimationTrackSessions,createTrackSweep} from '../ui/animation-track-controls.mjs';
import {createSequence,sequenceFrameTimes} from '../ui/animation.mjs';
import {frameBounds,fitAnimationFrames} from '../ui/animation-framing.mjs';

const fixture=JSON.parse(execFileSync('python',['-B','-c',"import json;from engine.generators import regular;from engine.nets import unfold;m=regular('cube');print(json.dumps({'model':m,'net':unfold(m,tabs=False)}))"],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',windowsHide:true}));
function viewer(model){
  const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.stereographicWorkerFactory=()=>null;
  v.perspectiveCamera=new THREE.PerspectiveCamera(38,.7,.01,1000);v.orthographicCamera=new THREE.OrthographicCamera(-1,1,1,-1,.01,1000);
  v.cameraProjection='orthographic';v.camera=v.orthographicCamera;v.camera.position.set(3,2,4);v.orthographicHalfHeight=1;v.aspect=.7;
  v.controls={target:new THREE.Vector3(),enabled:true,enableDamping:true,update(){}};
  v.bindControls=()=>{v.camera.lookAt(v.controls.target);v.camera.updateMatrixWorld();};v.draw=()=>v.bindControls();v.setModel(model);return v;
}
function environment(){
  const state={model:structuredClone(fixture.model),notes:'Source notes',view:{angles:[0,0,0,0,0,0],projection:'orthographic',sectionOffset:0,derivedMode:'net',net:{root:0,length:25,tabs:false,fraction:0}},netLayout:structuredClone(fixture.net)};
  state.view.animation=createTrackSweep(createSequence(state.view,1,4),'fold');state.view.animation.keyframes[1].angles[0]=130;
  const base=viewer(state.model),derived=viewer(state.model);derived.setNet(state.netLayout);derived.setFold(0);derived.setDisplay(state.view);derived.fit();
  state.view.camera=base.cameraState();state.view.derivedCamera=derived.cameraState();let dirty=0;
  const context={getState:()=>state,getModel:()=>state.model,viewer:base,netViewer:derived,sectionViewer:derived,run:async()=>{throw Error('Unexpected native fetch');},display:()=>base.setDisplay(state.view),syncPose(){},refreshDerived:async()=>{derived.setNet(state.netLayout);derived.setFold(state.view.net.fraction);derived.setDisplay(state.view);},markDirty:()=>dirty++};
  const renderer=new AnimationRenderer(context);Object.assign(context,{capabilities:()=>renderer.capabilities(),renderTracks:(...args)=>renderer.renderTracks(...args)});
  const c=Object.assign(Object.create(AnimationControls.prototype),{context,trackSessions:new AnimationTrackSessions(context),time:.2,generation:0,playing:false,exporting:false,editing:false,nodes:{target:{value:'net'},progress:{}},configure:async()=>{},update(){}});
  return {state,base,derived,context,renderer,c,get dirty(){return dirty;},close(){c.trackSessions.reset();base.clear();derived.clear();}};
}
test('explicit framing contains all actual rigid-net export poses and restores source, time, camera direction and control state',async()=>{
  const e=environment(),source=structuredClone(e.state),originalCamera=e.derived.cameraState(),direction=new THREE.Vector3(...originalCamera.position).sub(new THREE.Vector3(...originalCamera.target)).normalize();
  try{
    const result=await fitAnimationFrames(e.c);assert.equal(result.frames,5);assert.equal(e.c.time,.2);assert.equal(e.dirty,1);
    assert.deepEqual(e.state.model,source.model);assert.deepEqual(e.state.notes,source.notes);assert.deepEqual(e.state.netLayout,source.netLayout);
    const {derivedCamera,...view}=e.state.view;const {derivedCamera:old,...before}=source.view;assert.deepEqual(view,before);
    assert.equal(derivedCamera.projection,old.projection);assert.equal(e.derived.controls.enabled,true);assert.equal(e.derived.controls.enableDamping,true);
    const afterDirection=new THREE.Vector3(...derivedCamera.position).sub(new THREE.Vector3(...derivedCamera.target)).normalize();assert.ok(direction.distanceTo(afterDirection)<1e-12);
    for(const time of sequenceFrameTimes(e.state.view.animation)){
      await e.c.apply(e.state.view.animation,time,e.state,e.c.generation);e.derived.draw();
      for(const point of e.derived.observationCloud()){const p=new THREE.Vector3(...point).project(e.derived.camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1&&Math.abs(p.z)<1,JSON.stringify({time,p:p.toArray()}));}
    }
  }finally{e.close();}
});
test('cancelled framing restores pose and camera without committing a partial fit',async()=>{
  const e=environment(),saved=structuredClone(e.state),camera=e.derived.cameraState(),capture=e.derived.prepareCapture.bind(e.derived);let calls=0;
  e.derived.prepareCapture=async options=>{const result=await capture(options);if(++calls===2)e.c.cancel();return result;};
  try{await assert.rejects(fitAnimationFrames(e.c),/cancelled/);assert.deepEqual(e.state,saved);assert.deepEqual(e.derived.cameraState(),camera);assert.equal(e.dirty,0);assert.equal(e.c.exporting,false);assert.equal(e.derived.controls.enabled,true);}finally{e.close();}
});
test('source or external camera edits during capture survive framing failure',async()=>{
  for(const kind of ['notes','camera']){
    const e=environment();e.derived.prepareCapture=async()=>{if(kind==='notes')e.state.notes='New notes';else{e.derived.camera.position.x=29;e.state.view.derivedCamera=e.derived.cameraState();}};
    try{await assert.rejects(fitAnimationFrames(e.c),/changed/);assert.equal(e.dirty,0);if(kind==='notes')assert.equal(e.state.notes,'New notes');else{assert.equal(e.state.view.derivedCamera.position[0],29);assert.equal(e.derived.camera.position.x,29);}}finally{e.close();}
  }
});
test('framing bounds rejects empty, nonfinite and excessive clouds before camera publication',()=>{
  assert.throws(()=>frameBounds().corners(),/no visible geometry/);assert.throws(()=>frameBounds().add([[Infinity,0,0]]),/nonfinite/);
  const b=frameBounds(2);b.add([[0,0,0],[1,2,3]]);assert.equal(b.corners().length,8);assert.throws(()=>b.add([[1,1,1]]),/work limit/);
});
