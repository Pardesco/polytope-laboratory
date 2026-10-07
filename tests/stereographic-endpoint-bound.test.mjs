import test from 'node:test';
import assert from 'node:assert/strict';
import {boundStereographicEndpoint} from '../ui/stereographic-endpoint-bound.mjs';
import * as THREE from 'three';

const camera={projection:'orthographic',worldToCamera:[[1,0,0,0],[0,1,0,0],[0,0,-1,5]],scaleX:200,scaleY:200,near:.01,far:1000};
const point=(a,b,t)=>{const p=a.map((x,i)=>(1-t)*x+t*b[i]),r=Math.hypot(...p);return p.slice(0,3).map(x=>x/(r-p[3]));};
const screen=(p,c)=>{const q=c.worldToCamera.map(row=>row[3]+p.reduce((sum,x,i)=>sum+x*row[i],0)),d=c.projection==='perspective'?q[2]:1;return [c.scaleX*q[0]/d,c.scaleY*q[1]/d];};

test('mathematical endpoint and packed screen positions are enclosed with nonzero displacement',()=>{
  const input={a:[.7,.2,.15,.1],b:[.1,.8,-.3,-.2],t:.23,camera:{...camera,scaleX:1e6,scaleY:1e6}},result=boundStereographicEndpoint(input);
  assert.equal(result.supported,true);assert.ok(result.positions instanceof Float32Array);assert.ok(result.errorBoundPixels>0);
  const world=point(input.a,input.b,input.t),actual=screen(world,input.camera),packed=screen(Array.from(result.positions),input.camera);
  for(let i=0;i<3;i++)assert.ok(result.mathematicalWorldBounds[i][0]<=world[i]&&world[i]<=result.mathematicalWorldBounds[i][1]);
  for(let i=0;i<2;i++){
    assert.ok(result.mathematicalScreenBounds[i][0]<=actual[i]&&actual[i]<=result.mathematicalScreenBounds[i][1]);
    assert.ok(result.packedScreenBounds[i][0]<=packed[i]&&packed[i]<=result.packedScreenBounds[i][1]);
  }
  assert.ok(Math.hypot(...actual.map((x,i)=>x-packed[i]))<=result.errorBoundPixels);
  assert.equal(result.endpointQuantizationIncluded,true);assert.equal(result.gpuArithmeticIncluded,false);assert.equal(result.wholePatchBound,false);
});

test('perspective positive-depth quotient and oblique camera have finite screen enclosures',()=>{
  const c={...camera,projection:'perspective',worldToCamera:[[.8,-.6,0,.2],[.6,.8,0,-.1],[0,0,-1,3]],scaleX:450,scaleY:350};
  for(const t of [0,.173,.5,.999,1]){
    const a=[1,0,.2,.1],b=[0,1,-.4,-.1],result=boundStereographicEndpoint({a,b,t,camera:c});assert.equal(result.supported,true);
    const actual=screen(point(a,b,t),c),packed=screen(Array.from(result.positions),c);assert.ok(Math.hypot(...actual.map((x,i)=>x-packed[i]))<=result.errorBoundPixels);
    assert.ok(result.mathematicalDepthBounds[0]>=c.near&&result.packedDepthBounds[0]>=c.near);
  }
});

test('Float32 rounding across near/far must refuse rather than certify a visible endpoint',()=>{
  const a=[.6,0,.8,0],base={...camera,projection:'perspective',worldToCamera:[[1,0,0,0],[0,1,0,0],[0,0,-1,1]],near:.199999995};
  const near=boundStereographicEndpoint({a,b:[...a],t:0,camera:base});assert.equal(near.supported,false);assert.match(near.diagnostics[0].message,/near\/far/);assert.equal(near.positions,null);
  const far=boundStereographicEndpoint({a,b:[...a],t:0,camera:{...base,worldToCamera:[[1,0,0,0],[0,1,0,0],[0,0,1,1]],near:.01,far:1.800000005}});
  assert.equal(far.supported,false);assert.match(far.diagnostics[0].message,/near\/far/);
});

test('pole, ambiguous source and extreme-scale coordinate loss keep explicit refusal',()=>{
  for(const [a,b] of [[[0,0,0,1],[0,0,0,1]],[[1,0,0,0],[-1,0,0,0]],[[2,Number.MIN_VALUE,0,0],[0,2,0,0]]]){
    const result=boundStereographicEndpoint({a,b,t:.5,camera});assert.equal(result.supported,false);assert.equal(result.errorBoundPixels,null);assert.equal(result.positions,null);assert.ok(result.diagnostics.length);
  }
});

test('constant representable endpoint still encloses arithmetic error; no source buffers are frozen or detached',()=>{
  const a=new Float64Array([1,0,0,0]),b=new Float64Array([1,0,0,0]),input={a,b,t:0,camera:structuredClone(camera)},before=structuredClone(input),result=boundStereographicEndpoint(input);
  assert.equal(result.supported,true);assert.deepEqual(Array.from(result.positions),[1,0,0]);assert.deepEqual(input,before);assert.equal(a.byteLength,32);assert.equal(Object.isFrozen(input.camera),false);
  assert.equal(Object.isFrozen(result),true);result.positions[0]=7;assert.equal(a[0],1);assert.equal(result.source.a[0],1);
  assert.equal(result.gpuArithmeticIncluded,false);assert.equal(result.rasterizationIncluded,false);
});

test('endpoint input domain and camera validation follow the frozen raw-path contract',()=>{
  for(const extra of [{t:-1},{t:1.1},{t:NaN},{camera:{...camera,scaleX:0}},{a:[1,0,0]}])assert.throws(()=>boundStereographicEndpoint({a:[1,0,0,0],b:[0,1,0,0],camera,...extra}));
});

test('supplied Float32 bytes receive their own bound and are detached from caller storage',()=>{
  const a=[.7,.2,.15,.1],packedPosition=new Float32Array([1,2,3]),before=packedPosition.slice(),result=boundStereographicEndpoint({a,b:a,t:0,camera,packedPosition});
  assert.equal(result.supported,true);assert.equal(result.suppliedPackedPosition,true);assert.deepEqual(result.positions,before);assert.notEqual(result.positions,packedPosition);
  const actual=screen(point(a,a,0),camera),chosen=screen(Array.from(packedPosition),camera);assert.ok(Math.hypot(...actual.map((x,i)=>x-chosen[i]))<=result.errorBoundPixels);
  packedPosition[0]=9;assert.equal(result.positions[0],1);assert.equal(result.source.a[0],.7);
});

test('supplied packed endpoints must pass their own clipping gate rather than relying on mathematical source depth',()=>{
  const a=[1,0,0,0],c={...camera,projection:'perspective'},result=boundStereographicEndpoint({a,b:a,t:0,camera:c,packedPosition:new Float32Array([1,0,6])});
  assert.equal(result.supported,false);assert.match(result.diagnostics[0].message,/near\/far/);assert.equal(result.positions,null);
  for(const packedPosition of [[1,0,0],new Float64Array([1,0,0]),new Float32Array(2),new Float32Array([Infinity,0,0])])assert.throws(()=>boundStereographicEndpoint({a,b:a,camera,packedPosition}),/Float32|finite/);
  if(typeof SharedArrayBuffer!=='undefined')assert.throws(()=>boundStereographicEndpoint({a,b:a,camera,packedPosition:new Float32Array(new SharedArrayBuffer(12))}),/privately owned/);
});

test('actual rolled off-axis Three perspective camera projection cancels constant principal-point offsets',()=>{
  const width=947,height=613,c=new THREE.PerspectiveCamera(38,width/height,.01,1000);c.zoom=1.7;c.position.set(3,-2,5);c.up.set(.3,1,.1);c.lookAt(.1,.2,-.1);c.setViewOffset(1200,900,93,117,width,height);c.updateMatrixWorld();c.updateProjectionMatrix();
  const e=c.matrixWorldInverse.elements,p=c.projectionMatrix.elements,descriptor={projection:'perspective',worldToCamera:[[e[0],e[4],e[8],e[12]],[e[1],e[5],e[9],e[13]],[-e[2],-e[6],-e[10],-e[14]]],scaleX:width*p[0]/2,scaleY:height*p[5]/2,near:c.near,far:c.far};
  const a=[.7,.2,.15,.1],b=[.1,.8,-.3,-.2],result=boundStereographicEndpoint({a,b,t:.371,camera:descriptor});assert.equal(result.supported,true);
  const world=point(a,b,.371),packed=Array.from(result.positions),toCSS=v=>{const q=new THREE.Vector3(...v).project(c);return [(q.x+1)*width/2,(1-q.y)*height/2];},screenA=toCSS(world),screenB=toCSS(packed);
  assert.ok(Math.hypot(...screenA.map((x,i)=>x-screenB[i]))<=result.errorBoundPixels);
  const affineA=screen(world,descriptor),affineB=screen(packed,descriptor);for(let i=0;i<2;i++)assert.ok(Math.abs(Math.abs(screenA[i]-screenB[i])-Math.abs(affineA[i]-affineB[i]))<1e-10);
  assert.equal(result.gpuArithmeticIncluded,false);
});

test('packed endpoint subclasses, custom methods, resizable and detached buffers refuse before copying',()=>{
  let calls=0;class Foreign extends Float32Array{slice(){calls++;throw Error('Subclass copy executed');}}
  const foreign=new Foreign([1,0,0]),custom=new Float32Array([1,0,0]);custom.slice=()=>{calls++;throw Error('Custom copy executed');};
  for(const packedPosition of [foreign,custom,new Float32Array(new ArrayBuffer(12,{maxByteLength:24}))])assert.throws(()=>boundStereographicEndpoint({a:[1,0,0,0],b:[1,0,0,0],camera,packedPosition}),/privately owned/);
  assert.equal(calls,0);const detached=new Float32Array([1,0,0]);structuredClone(detached.buffer,{transfer:[detached.buffer]});
  assert.throws(()=>boundStereographicEndpoint({a:[1,0,0,0],b:[1,0,0,0],camera,packedPosition:detached}),/detached/);
  class ForeignBuffer extends ArrayBuffer{}
  assert.throws(()=>boundStereographicEndpoint({a:[1,0,0,0],b:[1,0,0,0],camera,packedPosition:new Float32Array(new ForeignBuffer(12))}),/privately owned/);
});
