import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';

function fixture(){
  const viewer=Object.create(Viewer.prototype),rendered=[];
  viewer.scene=new THREE.Scene();viewer.camera=new THREE.OrthographicCamera();viewer.view={};
  viewer.camera.position.set(2.125962398523315,1.4764675844724962,3.0065096781360583);
  viewer.cameraProjection='orthographic';viewer.orthographicHalfHeight=1.2828067078407845;
  viewer.controls={enabled:false,target:new THREE.Vector3(),updates:0,update(){this.updates++;viewer.camera.position.x+=1e-15;}};
  viewer.renderer={render:()=>rendered.push(structuredClone(viewer.cameraState()))};
  return {viewer,rendered};
}

test('drawing a frozen capture camera retains its exact pose while still rendering every requested frame',()=>{
  const {viewer,rendered}=fixture(),before=viewer.cameraState();
  for(let i=0;i<5;i++)viewer.draw();
  assert.equal(viewer.controls.updates,0);assert.deepEqual(viewer.cameraState(),before);
  assert.equal(rendered.length,5);for(const frame of rendered)assert.deepEqual(frame,before);
});

test('reenabling observation resumes control updates before rendering',()=>{
  const {viewer,rendered}=fixture();viewer.draw();const frozen=viewer.cameraState();
  viewer.controls.enabled=true;viewer.draw();
  assert.equal(viewer.controls.updates,1);assert.notDeepEqual(viewer.cameraState(),frozen);
  assert.deepEqual(rendered.at(-1),viewer.cameraState());
  viewer.controls.enabled=false;const resumed=viewer.cameraState();viewer.draw();
  assert.deepEqual(viewer.cameraState(),resumed);assert.equal(viewer.controls.updates,1);
});

test('frozen stereo observation still draws through its stereo renderer without moving the source camera',()=>{
  const {viewer}=fixture(),calls=[];viewer.view.stereoMode='parallel';
  viewer.stereoRenderer={render:(...args)=>calls.push(args)};const before=viewer.cameraState();viewer.draw();
  assert.equal(viewer.controls.updates,0);assert.equal(calls.length,1);assert.deepEqual(calls[0],[viewer.scene,viewer.camera,'parallel']);
  assert.deepEqual(viewer.cameraState(),before);
});
