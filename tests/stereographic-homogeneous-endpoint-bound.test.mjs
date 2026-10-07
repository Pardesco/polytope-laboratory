import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {captureHomogeneousStereographicCamera as capture} from '../development/stereographic-homogeneous-camera.mjs';
import {boundHomogeneousStereographicEndpoint as bound,copyHomogeneousPackedPositions as copy} from '../development/stereographic-homogeneous-endpoint-bound.mjs';
import {nextFloatDown,nextFloatUp} from '../ui/stereographic-arc-bound.mjs';

// Independent exact rational oracle: stored binary64 V/G/P coefficients are
// composed as BigInt fractions, not using production interval arithmetic.
const bits=new DataView(new ArrayBuffer(8)),gcd=(a,b)=>{a=a<0n?-a:a;while(b){const t=a%b;a=b;b=t;}return a;};
function Q(n,d=1n){if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return {n:n/g,d:d/g};}
function real(x){if(x===0)return Q(0n);bits.setFloat64(0,x);const b=bits.getBigUint64(0),e=Number((b>>52n)&2047n),m=(b&0xfffffffffffffn)+(e?1n<<52n:0n),p=e?e-1075:-1074,s=b>>63n?-1n:1n;return p<0?Q(s*m,1n<<BigInt(-p)):Q(s*(m<<BigInt(p)));}
const add=(a,b)=>Q(a.n*b.d+b.n*a.d,a.d*b.d),mul=(a,b)=>Q(a.n*b.n,a.d*b.d),div=(a,b)=>Q(a.n*b.d,a.d*b.n),neg=a=>Q(-a.n,a.d),sub=(a,b)=>add(a,neg(b)),sum=x=>x.reduce(add,Q(0n)),cmp=(a,b)=>a.n*b.d-b.n*a.d;
function enclosed(interval,q){assert.ok(cmp(real(interval[0]),q)<=0&&cmp(q,real(interval[1]))<=0,`Exact rational outside ${interval}`);}
function oracle(s,world){
  const multiply=(m,v)=>[0,1,2,3].map(r=>sum(v.map((x,i)=>mul(real(m[r+4*i]),x))));
  const v=multiply(s.inverseViewMatrix,multiply(s.groupMatrixWorld,[...world,Q(1n)])),clip=multiply(s.projectionMatrix,v),ndc=clip.map(x=>div(x,clip[3]));
  return [div(mul(real(s.cssSize[0]),add(Q(1n),ndc[0])),Q(2n)),div(mul(real(s.cssSize[1]),sub(Q(1n),ndc[1])),Q(2n))];
}
function observer(kind='perspective'){
  const c=kind==='perspective'?new THREE.PerspectiveCamera(38,947/613,.01,1000):new THREE.OrthographicCamera(-2,2,1.5,-1.5,.01,1000);
  c.position.set(3,2,5);c.up.set(.3,1,.1);c.lookAt(.1,.2,-.1);c.zoom=1.3;c.setViewOffset(1200,900,93,117,947,613);if(kind==='perspective')c.filmOffset=2;c.updateMatrixWorld();c.updateProjectionMatrix();return c;
}
const snapshot=(camera,group=null,width=947,height=613)=>capture({camera,groupMatrixWorld:group,cssWidth:width,cssHeight:height});
const source={a:[3,4,0,0],b:[4,0,0,3]};

test('rolled off-axis cameras enclose exact stored-coefficient ideal and actual Float32 endpoint displacement',()=>{
  for(const kind of ['orthographic','perspective']){
    const group=new THREE.Matrix4().set(1.2,.2,0,.3,0,.8,.1,-.2,0,0,1.1,.1,0,0,0,nextFloatUp(1)),s=snapshot(observer(kind),group);
    for(const t of [0,1]){
      const ideal=t===0?[Q(3n,5n),Q(4n,5n),Q(0n)]:[Q(2n),Q(0n),Q(0n)],bytes=t===0?new Float32Array([.6,.8,0]):new Float32Array([2,0,0]),r=bound(s,{...source,t,packedPosition:bytes});
      assert.equal(r.supported,true);const projected=oracle(s,ideal),packed=oracle(s,Array.from(bytes,real));
      projected.forEach((x,i)=>{enclosed(r.mathematicalScreenBounds[i],x);enclosed(r.packedScreenBounds[i],packed[i]);enclosed(r.screenDifferenceBounds[i],sub(x,packed[i]));});
      const squared=sum(projected.map((x,i)=>mul(sub(x,packed[i]),sub(x,packed[i]))));assert.ok(cmp(squared,mul(real(r.errorBoundPixels),real(r.errorBoundPixels)))<=0);
      assert.equal(r.cameraSignature,s.signature);assert.equal(r.cpuSequentialRoundingIncluded,false);assert.equal(r.gpuArithmeticIncluded,false);assert.equal(r.wholePatchBound,false);
    }
  }
});

test('ordinary inverse-rounded homogeneous cameras are unchanged and the actual packed byte error is nonzero',()=>{
  const c=observer();c.up.set(0,1,0);c.lookAt(0,0,0);c.updateMatrixWorld();assert.notEqual(c.matrixWorldInverse.elements[15],1);const before=c.matrixWorldInverse.elements.slice(),s=snapshot(c),r=bound(s,{...source,t:0});
  assert.equal(r.supported,true);assert.ok(r.errorBoundPixels>0);assert.deepEqual(c.matrixWorldInverse.elements,before);assert.deepEqual(Array.from(r.positions),[Math.fround(.6),Math.fround(.8),0]);
  assert.equal(r.storedMatrixCompositionEnclosed,true);assert.equal(r.coefficientNormalizationEnclosed,true);
});

test('nonuniform CSS changes and principal offsets remain in the same stored camera signature',()=>{
  const c=observer('orthographic'),s=snapshot(c),r=bound(s,{...source,t:0}),twice=bound(snapshot(c,null,1894,1226),{...source,t:0});assert.equal(r.supported,true);assert.equal(twice.supported,true);
  assert.ok(Math.abs(twice.errorBoundPixels/(2*r.errorBoundPixels)-1)<1e-5);assert.notEqual(s.signature,twice.cameraSignature);
  const wide=bound(snapshot(c,null,4000,11),{...source,t:0});assert.equal(wide.supported,true);assert.notDeepEqual(wide.mathematicalScreenBounds,r.mathematicalScreenBounds);
});

test('supplied endpoints can differ from mathematical rounding; copied bytes and original raw interval bind the proof',()=>{
  const s=snapshot(observer()),packedPosition=new Float32Array([1,2,3]),a=source.a.slice(),r=bound(s,{a,b:source.b,t:.25,t0:.125,t1:.75,packedPosition});assert.equal(r.supported,true);assert.ok(r.errorBoundPixels>10);
  assert.deepEqual(r.rawParameterInterval,[.125,.75]);assert.deepEqual(JSON.parse(r.sourceBinding).rawParameterInterval,[.125,.75]);assert.equal(JSON.parse(r.endpointBinding).t,.25);
  assert.notEqual(r.positions,packedPosition);packedPosition[0]=100;a[0]=99;assert.equal(r.positions[0],1);assert.equal(r.source.a[0],3);assert.equal(Object.isFrozen(a),false);assert.equal(Object.isFrozen(r),true);
  r.positions[0]=7;assert.equal(r.source.a[0],3);assert.equal(r.endpointQuantizationIncluded,true);
});

test('actual ideal and packed endpoints each pass stored-depth clipping; near rounding never bridges',()=>{
  const c=new THREE.PerspectiveCamera(60,1,.199999995,1000);c.position.set(0,0,1);c.updateMatrixWorld();const s=snapshot(c),a=[.6,0,.8,0],r=bound(s,{a,b:a,t:0});assert.equal(r.supported,false);assert.equal(r.positions,null);assert.ok(['clipped','needs-subdivision'].includes(r.status));
  const ordinary=snapshot(observer()),bad=bound(ordinary,{...source,t:0,packedPosition:new Float32Array([3,2,100])});assert.equal(bad.supported,false);assert.equal(bad.positions,null);assert.equal(bad.errorBoundPixels,null);
  const boundary=new THREE.PerspectiveCamera(60,1,1,3);boundary.updateMatrixWorld();boundary.matrixWorldInverse.elements[15]=nextFloatDown(1);const edge=[0,0,-1,0],near=bound(snapshot(boundary),{a:edge,b:edge,t:0});assert.equal(near.supported,false);assert.equal(near.status,'needs-subdivision');
  const farCamera=new THREE.PerspectiveCamera(60,1,.01,1.800000005);farCamera.position.z=-1;farCamera.lookAt(0,0,0);farCamera.updateMatrixWorld();const far=bound(snapshot(farCamera),{a,b:a,t:0});assert.equal(far.supported,false);assert.equal(far.positions,null);assert.ok(['clipped','needs-subdivision'].includes(far.status));
});

test('pole, source-center, power-scale loss and source/camera ownership refusals stay explicit',()=>{
  const s=snapshot(observer());for(const [a,b,t] of [[[0,0,0,1],[0,0,0,1],0],[[1,0,0,0],[-1,0,0,0],.5],[[2,Number.MIN_VALUE,0,0],[0,2,0,0],0]]){const r=bound(s,{a,b,t});assert.equal(r.supported,false);assert.equal(r.errorBoundPixels,null);assert.ok(r.diagnostics.length);}
  assert.throws(()=>bound({...s},{...source}),/owned immutable/);assert.throws(()=>bound(s,{...source,t:.5,t0:.75,t1:1}),/raw interval/);
});

test('ordinary subarray storage is copied; shared, resizable, detached, subclasses and custom accessors are refused without callbacks',()=>{
  const backing=new Float32Array([99,.6,.8,0,99]),view=backing.subarray(1,4),owned=copy(view);assert.deepEqual(owned,new Float32Array([.6,.8,0]));assert.notEqual(owned.buffer,backing.buffer);assert.equal(backing.byteLength,20);
  let calls=0;class Foreign extends Float32Array{slice(){calls++;throw Error('invoked');}}
  class ForeignBuffer extends ArrayBuffer{}
  const custom=new Float32Array(3);Object.defineProperty(custom,'buffer',{get(){calls++;throw Error('invoked');}});
  const buffer=new ArrayBuffer(12);Object.defineProperty(buffer,'resizable',{get(){calls++;throw Error('invoked');}});
  const inputs=[new Foreign(3),custom,new Float32Array(buffer),new Float32Array(new ForeignBuffer(12)),new Float32Array(100000),new Float32Array([Infinity,0,0]),[1,2,3],new Float64Array(3)];
  if(typeof SharedArrayBuffer!=='undefined')inputs.push(new Float32Array(new SharedArrayBuffer(12)));
  if(Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'resizable'))inputs.push(new Float32Array(new ArrayBuffer(12,{maxByteLength:24})));
  for(const value of inputs)assert.throws(()=>copy(value),/Float32|ordinary|exactly|custom|finite/);assert.equal(calls,0);
  const detached=new Float32Array(3);structuredClone(detached.buffer,{transfer:[detached.buffer]});assert.throws(()=>copy(detached),/detached/);
  assert.throws(()=>copy(new Float32Array(3),100000),/three or six/);
});

test('endpoint record accessors cannot execute while selecting prepared source or actual packed bytes',()=>{
  const s=snapshot(observer());let calls=0;
  for(const field of ['a','packedPosition','t']){const input={...source};Object.defineProperty(input,field,{get(){calls++;throw Error('invoked');}});assert.throws(()=>bound(s,input),/own data/);}
  assert.equal(calls,0);
});
