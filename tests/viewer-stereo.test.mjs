import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ViewerStereo,stereoMode} from '../ui/viewer-stereo.mjs';
function fixture(){
  const calls=[],renderer={autoClear:true,getSize:v=>v.set(800,400),setViewport:(...v)=>calls.push(['viewport',...v]),setScissorTest:v=>calls.push(['scissorTest',v]),setScissor(){},clear(){},render:(_,camera)=>calls.push(['render',camera])};
  const camera=new THREE.PerspectiveCamera(38,2,.01,1000);camera.position.set(0,0,5);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  return {calls,renderer,camera,stereo:new ViewerStereo(renderer)};
}
test('parallel/cross-eyed rendering uses opposite physical eyes and restores the viewport',()=>{
  const f=fixture(),scene=new THREE.Scene();f.stereo.render(scene,f.camera,'parallel');
  const eyes=f.calls.filter(c=>c[0]==='render').map(c=>c[1]);assert.equal(eyes.length,2);assert.ok(eyes[0].matrixWorld.elements[12]<eyes[1].matrixWorld.elements[12]);
  assert.deepEqual(f.calls.at(-1),['viewport',0,0,800,400]);assert.equal(f.renderer.autoClear,true);
  assert.equal(f.stereo.pick(f.camera,'parallel',600,800).camera,eyes[1]);assert.equal(f.stereo.pick(f.camera,'cross-eyed',600,800).camera,eyes[0]);
  assert.equal(f.stereo.pick(f.camera,'parallel',600,800).x,200);
});
test('stereo projects depth with binocular disparity and refuses unknown display modes',()=>{
  const f=fixture(),[left,right]=f.stereo.eyes(f.camera),p=new THREE.Vector3(.2,.1,1);
  assert.notEqual(p.clone().project(left).x,p.clone().project(right).x);
  assert.equal(stereoMode({stereoMode:'unknown'}),'none');assert.equal(stereoMode({stereoMode:'anaglyph'}),'anaglyph');
});
