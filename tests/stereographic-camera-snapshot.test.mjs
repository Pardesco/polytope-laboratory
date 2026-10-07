import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {captureStereographicCamera} from '../ui/stereographic-camera-snapshot.mjs';
import {boundStereographicEndpoint} from '../ui/stereographic-endpoint-bound.mjs';
import {nextFloatDown} from '../ui/stereographic-arc-bound.mjs';

const close=(a,b,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
function observer(kind='perspective',width=947,height=613){
  const camera=kind==='perspective'?new THREE.PerspectiveCamera(38,width/height,.01,1000):new THREE.OrthographicCamera(-1.45*width/height,1.45*width/height,1.45,-1.45,.01,1000);
  camera.position.set(3,2,5);camera.up.set(.3,1,.1);camera.lookAt(.1,.2,-.1);camera.updateMatrixWorld();camera.updateProjectionMatrix();return camera;
}
function coordinates(point,snapshot){
  const d=snapshot.descriptor,q=d.worldToCamera.map(row=>row[3]+point.reduce((sum,x,i)=>sum+x*row[i],0)),depth=d.projection==='perspective'?q[2]:1;
  return {screen:[d.scaleX*q[0]/depth+snapshot.cssOffset[0],-d.scaleY*q[1]/depth+snapshot.cssOffset[1]],depth:q[2]};
}
function actual(point,camera,group,width,height){
  const p=new THREE.Vector3(...point).applyMatrix4(group),view=p.clone().applyMatrix4(camera.matrixWorldInverse),ndc=p.project(camera);
  return {screen:[(ndc.x+1)*width/2,(1-ndc.y)*height/2],depth:-view.z,ndc:ndc.toArray()};
}
const points=[[0,0,0],[.3,.4,.2],[-.2,.6,-.5],[1,-1,2]];

test('actual orthographic/perspective CSS coordinates and positive camera depth match Three for literal points',()=>{
  const width=947,height=613,identity=new THREE.Matrix4();
  for(const kind of ['orthographic','perspective']){
    const camera=observer(kind,width,height),snapshot=captureStereographicCamera({camera,cssWidth:width,cssHeight:height});assert.equal(snapshot.supported,true);
    for(const point of points){const ours=coordinates(point,snapshot),reference=actual(point,camera,identity,width,height);ours.screen.forEach((x,i)=>close(x,reference.screen[i]));close(ours.depth,reference.depth);assert.ok(ours.depth>0);}
    assert.equal(snapshot.gpuArithmeticIncluded,false);assert.equal(snapshot.idealTransformRoundingIncluded,false);assert.match(snapshot.clipConvention,/positive camera depth=-z/);
  }
});

test('V*G composition retains nonuniform scale, reflection, shear and translation without refitting',()=>{
  const width=900,height=600,camera=observer('perspective',width,height),group=new THREE.Matrix4().set(2,.3,0,.4,0,.7,.2,-.3,0,0,-1.2,.2,0,0,0,1),snapshot=captureStereographicCamera({camera,cssWidth:width,cssHeight:height,groupMatrixWorld:group});
  assert.equal(snapshot.supported,true);assert.deepEqual(snapshot.composedMatrix,new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse,group).elements);
  for(const point of points){const ours=coordinates(point,snapshot),reference=actual(point,camera,group,width,height);ours.screen.forEach((x,i)=>close(x,reference.screen[i]));close(ours.depth,reference.depth);}
});

test('off-axis perspective film/view offsets and orthographic view offsets are retained as constant CSS offsets',()=>{
  const width=947,height=613;
  for(const kind of ['orthographic','perspective']){
    const camera=observer(kind,width,height);camera.zoom=1.7;camera.setViewOffset(1200,900,93,117,width,height);
    if(kind==='perspective')camera.filmOffset=2;
    camera.updateProjectionMatrix();const snapshot=captureStereographicCamera({camera,cssWidth:width,cssHeight:height});assert.equal(snapshot.supported,true);
    assert.ok(snapshot.ndcPrincipalOffset.some(x=>x!==0));
    for(const point of points){const ours=coordinates(point,snapshot),reference=actual(point,camera,new THREE.Matrix4(),width,height);ours.screen.forEach((x,i)=>close(x,reference.screen[i]));}
  }
});

test('pan, orbit, zoom, CSS dimensions, group and clip changes each change the full stable ownership signature',()=>{
  const camera=observer(),input={camera,cssWidth:947,cssHeight:613},initial=captureStereographicCamera(input);
  assert.equal(initial.signature,captureStereographicCamera(input).signature);
  const variants=[];
  const pan=camera.clone();pan.position.x+=1;pan.updateMatrixWorld();variants.push(captureStereographicCamera({...input,camera:pan}));
  const orbit=camera.clone();orbit.position.set(7,-2,3);orbit.lookAt(0,0,0);orbit.updateMatrixWorld();variants.push(captureStereographicCamera({...input,camera:orbit}));
  const zoom=camera.clone();zoom.zoom=2;zoom.updateProjectionMatrix();variants.push(captureStereographicCamera({...input,camera:zoom}));
  variants.push(captureStereographicCamera({...input,cssWidth:1000}),captureStereographicCamera({...input,cssHeight:700}));
  variants.push(captureStereographicCamera({...input,groupMatrixWorld:new THREE.Matrix4().makeTranslation(.1,.2,.3)}));
  const far=camera.clone();far.far=2000;far.updateProjectionMatrix();variants.push(captureStereographicCamera({...input,camera:far}));
  assert.ok(variants.every(s=>s.signature!==initial.signature));
  // View matrix rounding may yield a non-unit homogeneous row for a particular
  // orbit; that is diagnosed, rather than silently normalized into new rows.
  assert.ok(variants.every(s=>s.supported||s.diagnostics[0].code==='non-affine-transform'));
});

test('CSS pixel scales use actual projection coefficients and ignore physical/device pixel dimensions',()=>{
  const camera=observer('orthographic',300,900);camera.zoom=2;camera.updateProjectionMatrix();
  const a=captureStereographicCamera({camera,cssWidth:300,cssHeight:900}),b=captureStereographicCamera({camera,cssWidth:600,cssHeight:1800});assert.equal(a.supported,true);
  close(a.descriptor.scaleX,900*2/(2*1.45));close(a.descriptor.scaleY,a.descriptor.scaleX);close(b.descriptor.scaleX/a.descriptor.scaleX,2);close(b.descriptor.scaleY/a.descriptor.scaleY,2);
});

test('actual WebGL projection-depth clipping agrees away from conservatively enclosed boundary strips',()=>{
  for(const kind of ['orthographic','perspective']){
    const camera=observer(kind);camera.position.set(0,0,5);camera.up.set(0,1,0);camera.lookAt(0,0,0);camera.updateMatrixWorld();const snapshot=captureStereographicCamera({camera,cssWidth:947,cssHeight:613});assert.equal(snapshot.supported,true);
    assert.ok(snapshot.descriptor.near>=camera.near);assert.ok(snapshot.descriptor.far<=camera.far);
    assert.ok(snapshot.descriptor.near>=snapshot.projectionDepthPlanes.near[1]);assert.ok(snapshot.descriptor.far<=snapshot.projectionDepthPlanes.far[0]);
    for(const [depth,visible] of [[.005,false],[.02,true],[20,true],[900,true],[1100,false]]){
      const point=new THREE.Vector3(0,0,-depth).applyMatrix4(camera.matrixWorld).toArray(),ours=coordinates(point,snapshot),reference=actual(point,camera,new THREE.Matrix4(),947,613);
      assert.equal(ours.depth>=snapshot.descriptor.near&&ours.depth<=snapshot.descriptor.far,visible);assert.equal(reference.ndc[2]>=-1&&reference.ndc[2]<=1,visible);
    }
  }
});

test('snapshot descriptor feeds the endpoint bound including affine group and actual rolled observer coordinates',()=>{
  const camera=observer();camera.up.set(.3,1,.1);camera.lookAt(.1,.2,-.1);camera.updateMatrixWorld();const group=new THREE.Matrix4().makeScale(1.2,.8,1.1),snapshot=captureStereographicCamera({camera,cssWidth:947,cssHeight:613,groupMatrixWorld:group});assert.equal(snapshot.supported,true);
  const a=[.7,.2,.15,.1],b=[.1,.8,-.3,-.2],result=boundStereographicEndpoint({a,b,t:.371,camera:snapshot.descriptor});assert.equal(result.supported,true);
  const raw=a.map((x,i)=>(1-.371)*x+.371*b[i]),r=Math.hypot(...raw),world=raw.slice(0,3).map(x=>x/(r-raw[3]));
  const expected=actual(world,camera,group,947,613).screen,packed=actual(Array.from(result.positions),camera,group,947,613).screen;
  assert.ok(Math.hypot(...expected.map((x,i)=>x-packed[i]))<=result.errorBoundPixels);
});

test('projection skew, oblique depth, unusual homogeneous forms and axis flips diagnose unsupported',()=>{
  for(const [index,value] of [[4,.1],[1,.1],[2,.1],[6,.1],[3,.1],[11,1],[0,-2]]){
    const camera=observer();camera.projectionMatrix.elements[index]=value;
    const snapshot=captureStereographicCamera({camera,cssWidth:947,cssHeight:613});assert.equal(snapshot.supported,false);assert.equal(snapshot.descriptor,null);assert.equal(snapshot.diagnostics[0].code,'projection-form');
  }
  const ortho=observer('orthographic');ortho.projectionMatrix.elements[8]=.1;assert.equal(captureStereographicCamera({camera:ortho,cssWidth:947,cssHeight:613}).supported,false);
});

test('stale near/far metadata, reversed depth and WebGPU projection are never repaired or called supported',()=>{
  for(const action of [c=>c.near=.02,c=>{c.projectionMatrix.makePerspective(-.01,.01,.01,-.01,c.near,c.far,THREE.WebGLCoordinateSystem,true);},c=>{c.coordinateSystem=THREE.WebGPUCoordinateSystem;c.updateProjectionMatrix();}]){
    const camera=observer();action(camera);const before=camera.projectionMatrix.elements.slice(),snapshot=captureStereographicCamera({camera,cssWidth:947,cssHeight:613});
    assert.equal(snapshot.supported,false);assert.equal(snapshot.diagnostics[0].code,'projection-depth');assert.deepEqual(camera.projectionMatrix.elements,before);
  }
});

test('non-affine group and non-unit camera homogeneous rows refuse without epsilon clamping',()=>{
  const camera=observer(),group=new THREE.Matrix4();group.elements[3]=.01;
  assert.equal(captureStereographicCamera({camera,cssWidth:947,cssHeight:613,groupMatrixWorld:group}).diagnostics[0].code,'non-affine-transform');
  camera.matrixWorldInverse.elements[15]=nextFloatDown(1);
  const snapshot=captureStereographicCamera({camera,cssWidth:947,cssHeight:613});assert.equal(snapshot.supported,false);assert.equal(snapshot.inverseViewMatrix[15],nextFloatDown(1));
  const actualCamera=observer();actualCamera.position.set(4,5,6);actualCamera.up.set(.3,1,.1);actualCamera.lookAt(.1,.2,-.1);actualCamera.updateMatrixWorld();
  if(actualCamera.matrixWorldInverse.elements[15]!==1)assert.equal(captureStereographicCamera({camera:actualCamera,cssWidth:947,cssHeight:613}).supported,false);
});

test('camera/group/CSS snapshots are detached frozen records, while Three objects and matrices stay mutable',()=>{
  const camera=observer(),group=new THREE.Matrix4(),before=camera.matrixWorldInverse.elements.slice(),snapshot=captureStereographicCamera({camera,cssWidth:947,cssHeight:613,groupMatrixWorld:group});
  assert.equal(snapshot.supported,true);assert.equal(Object.isFrozen(snapshot),true);assert.equal(Object.isFrozen(snapshot.descriptor.worldToCamera[0]),true);
  assert.equal(Object.isFrozen(camera),false);assert.equal(Object.isFrozen(camera.matrixWorldInverse.elements),false);assert.deepEqual(camera.matrixWorldInverse.elements,before);
  camera.matrixWorldInverse.elements[12]=99;group.elements[0]=2;assert.deepEqual(snapshot.inverseViewMatrix,before);assert.equal(snapshot.groupMatrixWorld[0],1);
});

test('malformed or nonfinite inputs reject; finite overflow and unresolved clip arithmetic diagnose unsupported',()=>{
  for(const changed of [{cssWidth:0},{cssHeight:NaN},{groupMatrixWorld:[1,2]},{camera:{...observer(),projectionMatrix:new THREE.Matrix4().multiplyScalar(Infinity)}}])assert.throws(()=>captureStereographicCamera({camera:observer(),cssWidth:947,cssHeight:613,...changed}));
  const camera=observer();assert.equal(captureStereographicCamera({camera,cssWidth:Number.MAX_VALUE,cssHeight:613}).supported,false);
  const far=observer();far.far=1e100;far.updateProjectionMatrix();assert.equal(captureStereographicCamera({camera:far,cssWidth:947,cssHeight:613}).diagnostics[0].code,'clip-arithmetic');
  const values=new THREE.Matrix4().elements.slice();let read=0;Object.defineProperty(values,0,{get(){read++;return 1;},enumerable:true});assert.throws(()=>captureStereographicCamera({camera,cssWidth:947,cssHeight:613,groupMatrixWorld:values}),/accessors/);assert.equal(read,0);
});

test('matrix coefficient snapshots are bounded and never invoke caller iteration or copy methods',()=>{
  const camera=observer(),input={camera,cssWidth:947,cssHeight:613},values=new THREE.Matrix4().elements.slice();let called=0;
  values[Symbol.iterator]=()=>{called++;throw Error('Unexpected caller iterator.');};
  assert.equal(captureStereographicCamera({...input,groupMatrixWorld:values}).supported,true);assert.equal(called,0);
  const oversized=new Float64Array(100000);assert.throws(()=>captureStereographicCamera({...input,groupMatrixWorld:oversized}),/16 finite/);
  class CustomMatrix extends Float64Array{[Symbol.iterator](){called++;throw Error('Unexpected typed iterator.');}}
  assert.throws(()=>captureStereographicCamera({...input,groupMatrixWorld:new CustomMatrix(16)}),/16 finite/);assert.equal(called,0);
  const resizable=new Float64Array(new ArrayBuffer(128,{maxByteLength:256}));assert.throws(()=>captureStereographicCamera({...input,groupMatrixWorld:resizable}),/nonresizable/);
  const detached=new Float32Array(16);structuredClone(detached.buffer,{transfer:[detached.buffer]});assert.throws(()=>captureStereographicCamera({...input,groupMatrixWorld:detached}),/detached/);
});
