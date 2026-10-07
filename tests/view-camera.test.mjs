import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {fitView} from '../ui/view-camera.mjs';

const cube=Array.from({length:8},(_,i)=>[i&1?1:-1,i&2?1:-1,i&4?1:-1]);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function cameraFor(fit,aspect,orthographic){
  const camera=orthographic?new THREE.OrthographicCamera(-fit.halfHeight*aspect,fit.halfHeight*aspect,fit.halfHeight,-fit.halfHeight,.01,1000):new THREE.PerspectiveCamera(38,aspect,.01,1000);
  camera.position.fromArray(fit.center).addScaledVector(new THREE.Vector3(...fit.direction),fit.distance);
  camera.up.fromArray(fit.up);camera.lookAt(new THREE.Vector3(...fit.center));camera.updateMatrixWorld();return camera;
}
test('orthographic fitting contains the projected cloud for narrow and wide viewports',()=>{
  for(const aspect of [.4,1,2.5])for(const direction of [[1,1,1],[1,0,0],[0,1,0],[0,0,1]]){
    const fit=fitView(cube,{aspect,direction,up:direction[1]===1&&direction[0]===0?[0,0,-1]:[0,1,0]});
    const camera=cameraFor(fit,aspect,true);
    for(const point of cube){const p=new THREE.Vector3(...point).project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1&&Math.abs(p.z)<1);}
  }
});
test('perspective fitting conservatively includes all source points at both aspect extremes',()=>{
  for(const aspect of [.4,2.5]){
    const fit=fitView(cube,{aspect}),camera=cameraFor(fit,aspect,false);
    for(const point of cube){const p=new THREE.Vector3(...point).project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1&&Math.abs(p.z)<1);}
  }
});
test('parallel equal edges retain equal screen lengths only in orthographic observation',()=>{
  const points=[[-1,0,-1],[1,0,-1],[-1,0,1],[1,0,1]],fit=fitView(points,{direction:[0,0,1]});
  const lengths=camera=>{const p=points.map(point=>new THREE.Vector3(...point).project(camera));return [p[0].distanceTo(p[1]),p[2].distanceTo(p[3])];};
  const orthographic=lengths(cameraFor(fit,1,true));near(orthographic[0],orthographic[1]);
  const perspective=lengths(cameraFor(fit,1,false));assert.ok(perspective[1]>perspective[0]*1.1);
});
test('camera fit retains translation and does not change source positions',()=>{
  const shifted=cube.map(point=>point.map((x,i)=>x+[7,-4,2][i])),before=JSON.stringify(shifted),fit=fitView(shifted);
  fit.center.forEach((x,i)=>near(x,[7,-4,2][i]));assert.equal(JSON.stringify(shifted),before);
  assert.equal(fitView([]),null);assert.throws(()=>fitView(cube,{aspect:0}),/parameters/);
});
