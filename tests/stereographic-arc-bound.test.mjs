import test from 'node:test';
import assert from 'node:assert/strict';
import {boundStereographicArc,nextFloatUp,nextFloatDown} from '../ui/stereographic-arc-bound.mjs';
import {stereographicEdge,stereographicPoint} from '../ui/stereographic.mjs';
import {rotate} from '../ui/projection.js';
import {applyDisplayFrame} from '../ui/display-frame.mjs';
import * as THREE from 'three';

const X=[1,0,0,0],Y=[0,1,0,0];
const orthographic={projection:'orthographic',worldToCamera:[[1,0,0,0],[0,1,0,0],[0,0,-1,5]],scaleX:200,scaleY:200,near:.01,far:1000};
const point=(a,b,t)=>{const p=a.map((x,i)=>(1-t)*x+t*b[i]),r=Math.hypot(...p);return p.slice(0,3).map(x=>x/(r-p[3]));};
const observe=(p,camera)=>{const q=camera.worldToCamera.map(row=>row[3]+p.reduce((s,x,i)=>s+x*row[i],0)),depth=camera.projection==='perspective'?q[2]:1;return [camera.scaleX*q[0]/depth,camera.scaleY*q[1]/depth];};
function distance(p,a,b){const d=b.map((x,i)=>x-a[i]),s=d.reduce((v,x)=>v+x*x,0),t=s?Math.max(0,Math.min(1,d.reduce((v,x,i)=>v+x*(p[i]-a[i]),0)/s)):0;return Math.hypot(...p.map((x,i)=>x-a[i]-t*d[i]));}
function sampledError(input,count=2000){
  const t0=input.t0??0,t1=input.t1??1,a=observe(point(input.a,input.b,t0),input.camera),b=observe(point(input.a,input.b,t1),input.camera);let error=0;
  for(let i=0;i<=count;i++){const t=t0+(t1-t0)*i/count;error=Math.max(error,distance(observe(point(input.a,input.b,t),input.camera),a,b));}return error;
}
const close=(a,b,t=1e-10)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);

test('outward adjacent floats include signed zero, subnormals, exponent boundaries and overflow',()=>{
  assert.equal(nextFloatUp(0),Number.MIN_VALUE);assert.equal(nextFloatUp(-0),Number.MIN_VALUE);assert.equal(nextFloatDown(0),-Number.MIN_VALUE);
  assert.equal(nextFloatDown(Number.MIN_VALUE),0);assert.ok(Object.is(nextFloatUp(-Number.MIN_VALUE),-0));
  assert.equal(nextFloatUp(1),1+2**-52);assert.equal(nextFloatDown(1),1-2**-53);assert.equal(nextFloatUp(-1),-1+2**-53);assert.equal(nextFloatDown(-1),-1-2**-52);
  assert.equal(nextFloatUp(Number.MAX_VALUE),Infinity);assert.equal(nextFloatDown(-Number.MAX_VALUE),-Infinity);assert.equal(nextFloatDown(Infinity),Number.MAX_VALUE);assert.equal(nextFloatUp(-Infinity),-Number.MAX_VALUE);assert.throws(()=>nextFloatUp(NaN),/NaN/);
});
test('independent quarter-circle sagitta is bounded for the entire raw interval',()=>{
  const result=boundStereographicArc({a:X,b:Y,camera:orthographic}),sagitta=200*(1-Math.SQRT1_2);
  assert.equal(result.supported,true);assert.equal(result.wholeEdgeIntervalBound,true);assert.equal(result.wholePatchBound,false);assert.equal(result.endpointQuantizationIncluded,false);assert.ok(result.errorBoundPixels>=sagitta);assert.ok(result.errorBoundPixels<2000,'Conservativeness should remain finite and quantifiable');
  close(sampledError({a:X,b:Y,camera:orthographic}),sagitta);assert.deepEqual(result.poleDenominatorBounds,[1,1]);assert.ok(result.scaledRawRadiusBounds[0]<=Math.SQRT1_2);assert.ok(result.scaledRawRadiusBounds[1]>=1);
});
test('a short equal-radius circular subarc has the independent chord sagitta',()=>{
  const angle=Math.PI/8,a=[Math.cos(angle),-Math.sin(angle),0,0],b=[Math.cos(angle),Math.sin(angle),0,0],input={a,b,camera:orthographic},bound=boundStereographicArc(input),sagitta=200*(1-Math.cos(angle));
  assert.equal(bound.supported,true);assert.ok(bound.errorBoundPixels>=sagitta);close(sampledError(input),sagitta,1e-8);
});
test('original parameter ranges survive unequal endpoint radii and existing display transforms',()=>{
  const matrix=[[1,0,0,0],[0,0,0,-1],[0,0,1,0],[0,1,0,0]],angles=[11,7,28,19,-13,4];
  const a=rotate(applyDisplayFrame([3,0,0,0],matrix),angles),b=rotate(applyDisplayFrame([0,.7,0,0],matrix),angles);
  const input={a,b,t0:.125,t1:.375,camera:orthographic},bound=boundStereographicArc(input);assert.equal(bound.supported,true);assert.deepEqual(bound.rawParameterInterval,[.125,.375]);assert.ok(bound.errorBoundPixels>=sampledError(input));
  // Algebraically identical radial formula; independent evaluations round in
  // different orders, which is separate from the mathematical curve bound.
  for(const t of [.125,.211,.375])point(a,b,t).forEach((x,i)=>close(x,stereographicPoint(a.map((v,j)=>(1-t)*v+t*b[j])).point[i],1e-13));
});
test('existing adaptive output intervals qualify against the whole-interval bound without changing the curve',()=>{
  const edge=stereographicEdge(X,Y,{tolerance:.001});let largest=0;
  for(const segment of edge.segments){const input={a:X,b:Y,t0:segment.t0,t1:segment.t1,camera:orthographic},bound=boundStereographicArc(input);assert.equal(bound.supported,true);assert.ok(sampledError(input,100)<=bound.errorBoundPixels);largest=Math.max(largest,bound.errorBoundPixels);assert.deepEqual(bound.rawParameterInterval,[segment.t0,segment.t1]);}
  assert.ok(largest<2,'Report conservative qualification separately from the existing .2px sampled criterion');
});
test('oblique orthographic camera bounds every checked off-midpoint point and zoom/aspect scaling',()=>{
  const r2=Math.SQRT1_2,r6=1/Math.sqrt(6),r3=1/Math.sqrt(3),camera={...orthographic,worldToCamera:[[r2,-r2,0,.3],[r6,r6,-2*r6,-.2],[-r3,-r3,-r3,5]],scaleX:270,scaleY:180};
  const input={a:[1,.2,-.1,.25],b:[-.15,.8,.3,-.2],t0:.2,t1:.6,camera},result=boundStereographicArc(input);assert.equal(result.supported,true);assert.ok(result.errorBoundPixels>=sampledError(input));
  const doubled=boundStereographicArc({...input,camera:{...camera,scaleX:540,scaleY:360}});close(doubled.errorBoundPixels/result.errorBoundPixels,2,1e-12);
});
test('perspective positive depth uses actual affine view rows and both quotient derivative terms',()=>{
  const camera={...orthographic,projection:'perspective',worldToCamera:[[.8,-.6,0,.2],[.6,.8,0,-.1],[0,0,-1,3]],scaleX:450,scaleY:350},input={a:[1,0,.2,.1],b:[0,1,-.4,-.1],t0:.25,t1:.6,camera},result=boundStereographicArc(input);
  assert.equal(result.supported,true);assert.ok(result.depthBounds[0]>.01);assert.ok(result.errorBoundPixels>=sampledError(input));assert.ok(result.derivativeBounds.pixelSecond.every(x=>Number.isFinite(x)&&x>=0));
});
test('oblique perspective camera qualifies a finite-depth circle but rejects a near-plane crossing',()=>{
  const camera={...orthographic,projection:'perspective',worldToCamera:[[0,1,0,0],[0,0,1,0],[-1,0,0,.4]]},cross=boundStereographicArc({a:X,b:Y,camera});assert.equal(cross.supported,false);assert.equal(cross.status,'needs-subdivision');assert.equal(cross.errorBoundPixels,null);assert.match(cross.diagnostics[0].message,/depth/);
  const behind=boundStereographicArc({a:X,b:Y,t0:0,t1:.02,camera});assert.equal(behind.status,'clipped');
  const input={a:X,b:Y,t0:.97,t1:1,camera},safe=boundStereographicArc(input);assert.equal(safe.supported,true);assert.ok(safe.errorBoundPixels>=sampledError(input));assert.ok(safe.depthBounds[0]>=camera.near);
});
test('observer far clipping is diagnosed even when a perspective pixel expression would be finite',()=>{
  const camera={...orthographic,projection:'perspective',far:4};assert.equal(boundStereographicArc({a:X,b:Y,camera}).status,'clipped');
  const crossed={...orthographic,worldToCamera:[[1,0,0,0],[0,1,0,0],[1,0,0,3]],far:3.5};assert.equal(boundStereographicArc({a:X,b:Y,camera:crossed}).status,'needs-subdivision');
});
test('finite endpoints around the pole cannot hide an interior pole crossing',()=>{
  const a=[.5,0,0,Math.sqrt(3)/2],b=[-.5,0,0,Math.sqrt(3)/2],result=boundStereographicArc({a,b,camera:orthographic});assert.equal(result.supported,false);assert.equal(result.status,'needs-subdivision');assert.ok(result.poleDenominatorBounds[0]<=0);assert.equal(result.wholeEdgeIntervalBound,false);
  const safeInput={a,b,t0:0,t1:.05,camera:orthographic},safe=boundStereographicArc(safeInput);assert.equal(safe.supported,true);assert.ok(safe.errorBoundPixels>=sampledError(safeInput));
});
test('an interval entirely in the pole cutoff is classified clipped with no fabricated finite error',()=>{
  const result=boundStereographicArc({a:[.01,0,0,1],b:[0,.01,0,1],camera:orthographic});assert.equal(result.status,'clipped');assert.equal(result.errorBoundPixels,null);assert.equal(result.supported,false);assert.ok(result.poleDenominatorBounds[1]<.02);
});
test('pole extremum near the raw endpoint is enclosed even when midpoint/quarter probes miss the cap',()=>{
  const w=Math.sqrt(3)/2,a=[7*.5,0,0,7*w],b=[-.3*.5,0,0,.3*w],r=boundStereographicArc({a,b,camera:orthographic});
  for(const t of [0,.25,.5,.75,1])assert.equal(stereographicPoint(a.map((x,i)=>(1-t)*x+t*b[i])).clipped,false);
  assert.equal(stereographicPoint(a.map((x,i)=>(1-7/7.3)*x+(7/7.3)*b[i])).clipped,true);
  assert.equal(r.status,'needs-subdivision');assert.ok(r.poleDenominatorBounds[0]<=0);assert.equal(r.errorBoundPixels,null);
});
test('perspective +depth convention and an interior depth minimum prevent false finite-chord qualification',()=>{
  // Depth=.8-x: quarter-circle endpoints are finite, while x reaches its
  // maximum at raw midpoint for the symmetric -45°..45° arc.
  const a=[Math.SQRT1_2,-Math.SQRT1_2,0,0],b=[Math.SQRT1_2,Math.SQRT1_2,0,0],camera={...orthographic,projection:'perspective',worldToCamera:[[0,1,0,0],[0,0,1,0],[-1,0,0,.8]]};
  const r=boundStereographicArc({a,b,camera});assert.equal(r.status,'needs-subdivision');assert.ok(r.depthBounds[0]<0);assert.ok(r.depthBounds[1]>.01);
  assert.ok(.8-point(a,b,0)[0]>.01);assert.ok(.8-point(a,b,1)[0]>.01);assert.ok(.8-point(a,b,.5)[0]<0);
});
test('source-center/antipodal convention rejects even an isolated fragment of the ambiguous original edge',()=>{
  for(const input of [{a:X,b:[-1,0,0,0]},{a:[0,0,0,0],b:Y},{a:[0,0,0,0],b:[0,0,0,0]},{a:X,b:[-1,0,0,0],t0:.1,t1:.2}]){const r=boundStereographicArc({...input,camera:orthographic});assert.equal(r.status,'unsupported');assert.equal(r.diagnostics[0].code,'source-center');}
});
test('power-of-two normalization preserves source scale invariance and refuses loss/overflow',()=>{
  const unit=boundStereographicArc({a:X,b:Y,camera:orthographic});for(const scale of [2**-500,2**500]){const r=boundStereographicArc({a:X.map(x=>x*scale),b:Y.map(x=>x*scale),camera:orthographic});assert.equal(r.supported,true);assert.equal(r.errorBoundPixels,unit.errorBoundPixels);}
  const lost=boundStereographicArc({a:[2**1000,Number.MIN_VALUE,0,0],b:[0,2**1000,0,0],camera:orthographic});assert.equal(lost.status,'unsupported');assert.match(lost.diagnostics[0].message,/loses/);
  const huge=boundStereographicArc({a:X,b:Y,camera:{...orthographic,scaleX:Number.MAX_VALUE,scaleY:Number.MAX_VALUE}});assert.equal(huge.status,'unsupported');assert.equal(huge.errorBoundPixels,null);
});
test('constant endpoints and zero-length parameter intervals produce zero error while keeping clipping checks',()=>{
  assert.equal(boundStereographicArc({a:X,b:X,camera:orthographic}).errorBoundPixels,0);assert.equal(boundStereographicArc({a:X,b:Y,t0:.5,t1:.5,camera:orthographic}).errorBoundPixels,0);
  assert.equal(boundStereographicArc({a:[0,0,0,1],b:[0,0,0,1],t0:.5,t1:.5,camera:orthographic}).status,'clipped');
});
test('owned result is detached/frozen; caller coordinates/camera remain mutable and source incidence unaltered',()=>{
  const input={a:new Float64Array(X),b:[...Y],camera:structuredClone(orthographic)},before=structuredClone(input),r=boundStereographicArc(input);assert.deepEqual(input,before);assert.equal(Object.isFrozen(input.camera),false);assert.equal(Object.isFrozen(input.b),false);assert.equal(Object.isFrozen(r),true);assert.equal(Object.isFrozen(r.source.a),true);input.a[0]=9;input.camera.worldToCamera[0][0]=3;assert.equal(r.source.a[0],1);assert.equal(r.camera.worldToCamera[0][0],1);
});
test('malformed coordinates/domains/camera depth conventions reject explicitly',()=>{
  for(const changed of [{a:[1,0,0]},{b:[1,0,0,NaN]},{t0:-.1},{t1:2},{t0:.8,t1:.2},{poleEpsilon:0},{camera:{...orthographic,scaleX:0}},{camera:{...orthographic,projection:'perspective',near:0}},{camera:{...orthographic,far:.005}},{camera:{...orthographic,worldToCamera:[[1,0,0,0]]}}])assert.throws(()=>boundStereographicArc({a:X,b:Y,camera:orthographic,...changed}),/finite|interval|cutoff|Camera|camera|clipping/);
});
test('source coordinate accessors reject before executing caller code',()=>{
  const a=[1,0,0,0];let reads=0;Object.defineProperty(a,0,{get(){reads++;return 1;},enumerable:true});assert.throws(()=>boundStereographicArc({a,b:Y,camera:orthographic}),/accessors/);assert.equal(reads,0);
});

test('uncertain near-zero stationary coefficients retain an enclosing pole range',()=>{
  // Radial scaling makes F0=F1=0 mathematically; enclosing arithmetic makes
  // their cancellation uncertain. Tiny prepared-coordinate perturbations
  // must not turn that uncertainty into an optimistic endpoint-only range.
  for(const b of [[2,0,0,.25],[2,0,0,nextFloatUp(.25)],[nextFloatUp(2),0,0,.25]]){
    const input={a:[1,0,0,.125],b,camera:orthographic},result=boundStereographicArc(input);
    assert.equal(result.supported,true);
    for(let i=0;i<=200;i++){
      const t=i/200,p=input.a.map((x,j)=>(1-t)*x+t*b[j]),delta=1-p[3]/Math.hypot(...p);
      assert.ok(result.poleDenominatorBounds[0]<=delta&&delta<=result.poleDenominatorBounds[1]);
    }
    assert.ok(result.errorBoundPixels>=sampledError(input));
  }
});

test('stationary pole extrema on or outside a fragment boundary stay enclosed',()=>{
  const a=[.5,0,0,.75],b=[-.5,0,0,.75];
  for(const [t0,t1] of [[0,.3],[.7,1],[.2,.5],[.5,.8],[nextFloatDown(.5),nextFloatUp(.5)]]){
    const result=boundStereographicArc({a,b,t0,t1,camera:orthographic});
    assert.ok(result.poleDenominatorBounds);
    for(let i=0;i<=100;i++){
      const t=t0+(t1-t0)*i/100,p=a.map((x,j)=>(1-t)*x+t*b[j]),delta=1-p[3]/Math.hypot(...p);
      assert.ok(result.poleDenominatorBounds[0]<=delta&&delta<=result.poleDenominatorBounds[1]);
    }
    if(t0<=.5&&t1>=.5){assert.equal(result.supported,false);assert.ok(result.poleDenominatorBounds[0]<=0);}
  }
});

test('exact exponent selection covers finite maximum and subnormal scales without changing the raw path',()=>{
  const unit=boundStereographicArc({a:X,b:Y,camera:orthographic});
  for(const scale of [Number.MIN_VALUE,2**-1022,2**1023]){
    const result=boundStereographicArc({a:X.map(x=>x*scale),b:Y.map(x=>x*scale),camera:orthographic});
    assert.equal(result.supported,true);assert.equal(result.powerOfTwoScale,scale);assert.equal(result.errorBoundPixels,unit.errorBoundPixels);
  }
  const maximum=boundStereographicArc({a:[Number.MAX_VALUE,0,0,0],b:[0,Number.MAX_VALUE,0,0],camera:orthographic});
  assert.equal(maximum.supported,true);assert.equal(maximum.powerOfTwoScale,2**1023);assert.ok(maximum.errorBoundPixels>=200*(1-Math.SQRT1_2));
  // An odd subnormal divided by two loses a bit despite a finite nonzero
  // quotient. The endpoint snapshot must be rejected, never silently changed.
  const lost=boundStereographicArc({a:[2,3*Number.MIN_VALUE,0,0],b:[0,2,0,0],camera:orthographic});
  assert.equal(lost.supported,false);assert.match(lost.diagnostics[0].message,/loses/);
});

function actualCameraDescriptor(camera,width,height){
  camera.updateMatrixWorld();camera.updateProjectionMatrix();const e=camera.matrixWorldInverse.elements,p=camera.projectionMatrix.elements;
  return {projection:camera.isPerspectiveCamera?'perspective':'orthographic',worldToCamera:[[e[0],e[4],e[8],e[12]],[e[1],e[5],e[9],e[13]],[-e[2],-e[6],-e[10],-e[14]]],scaleX:width*p[0]/2,scaleY:height*p[5]/2,near:camera.near,far:camera.far};
}
test('actual Three camera matrices use positive eye depth and CSS scales across aspect and zoom',()=>{
  for(const [width,height,zoom] of [[900,600,1],[300,900,2],[2048,512,.5]])for(const projection of ['orthographic','perspective']){
    const halfHeight=1.45,aspect=width/height,camera=projection==='orthographic'?new THREE.OrthographicCamera(-halfHeight*aspect,halfHeight*aspect,halfHeight,-halfHeight,.01,1000):new THREE.PerspectiveCamera(38,aspect,.01,1000);
    camera.zoom=zoom;camera.position.set(3,2,5);camera.lookAt(0,0,0);const descriptor=actualCameraDescriptor(camera,width,height);
    if(projection==='orthographic'){close(descriptor.scaleX,height*zoom/(2*halfHeight),1e-10);close(descriptor.scaleY,descriptor.scaleX,1e-10);}
    const input={a:X,b:Y,t0:.2,t1:.4,camera:descriptor},result=boundStereographicArc(input);assert.equal(result.supported,true);assert.ok(result.errorBoundPixels>=sampledError(input));
    for(const t of [.2,.271,.4]){
      const world=point(X,Y,t),screen=observe(world,descriptor),ndc=new THREE.Vector3(...world).project(camera);
      close(screen[0]+width/2,(ndc.x+1)*width/2,1e-10);close(height/2-screen[1],(1-ndc.y)*height/2,1e-10);
      assert.ok(new THREE.Vector3(...world).applyMatrix4(camera.matrixWorldInverse).z<0);
    }
    // Drawing-buffer dimensions at devicePixelRatio=2 are not CSS pixels.
    const devicePixels=boundStereographicArc({...input,camera:actualCameraDescriptor(camera,2*width,2*height)});
    close(devicePixels.errorBoundPixels/result.errorBoundPixels,2,1e-12);
  }
});

test('Float32 endpoint error is a separate nonzero term even for a constant mathematical arc',()=>{
  const a=[.7,.2,.15,.1],camera={...orthographic,scaleX:1e6,scaleY:1e6},input={a,b:[...a],camera},result=boundStereographicArc(input),endpoint=point(a,a,0),quantized=Array.from(new Float32Array(endpoint)),screen=observe(endpoint,camera),gpuEndpoint=observe(quantized,camera),endpointError=Math.hypot(...screen.map((x,i)=>x-gpuEndpoint[i]));
  assert.equal(result.supported,true);assert.equal(result.errorBoundPixels,0);assert.equal(result.endpointQuantizationIncluded,false);assert.ok(endpointError>.001,'A zero mathematical chord error does not certify Float32 endpoint positions');
  // This comparison is CPU camera arithmetic only; it does not account for
  // GPU matrices/uniforms/rasterization or add quantization to the module API.
  close(distance(screen,gpuEndpoint,gpuEndpoint),endpointError,1e-10);
});

test('separate endpoint screen perturbations cover chord displacement for orthographic and perspective observers',()=>{
  for(const projection of ['orthographic','perspective']){
    const camera={...orthographic,projection,scaleX:700000,scaleY:400000},input={a:[.7,.2,.15,.1],b:[.1,.8,-.3,-.2],t0:.23,t1:.24,camera},result=boundStereographicArc(input);assert.equal(result.supported,true);
    const endpoints=[input.t0,input.t1].map(t=>point(input.a,input.b,t)),screens=endpoints.map(p=>observe(p,camera)),quantized=endpoints.map(p=>observe(Array.from(new Float32Array(p)),camera)),endpointError=Math.max(...screens.map((p,j)=>Math.hypot(...p.map((x,i)=>x-quantized[j][i]))));
    assert.ok(endpointError>0);
    // For any two endpoint pairs, matching convex combinations differ by at
    // most the largest endpoint perturbation. Thus the SCREEN chord's set
    // displacement is bounded separately; perspective depth must stay safe.
    for(let i=0;i<=100;i++){
      const weight=i/100,p=screens[0].map((x,j)=>(1-weight)*x+weight*screens[1][j]);assert.ok(distance(p,...quantized)<=endpointError+1e-9);
      const t=input.t0+(input.t1-input.t0)*weight;assert.ok(distance(observe(point(input.a,input.b,t),camera),...quantized)<=result.errorBoundPixels+endpointError);
    }
    assert.equal(result.endpointQuantizationIncluded,false);
  }
});

test('Float32 endpoint rounding can cross the observer near plane despite a safe Float64 source interval',()=>{
  const a=[.6,0,.8,0],camera={...orthographic,projection:'perspective',worldToCamera:[[1,0,0,0],[0,1,0,0],[0,0,-1,1]],near:.199999995},result=boundStereographicArc({a,b:[...a],camera});
  assert.equal(result.supported,true);assert.ok(result.depthBounds[0]>camera.near);
  const endpoint=point(a,a,0),quantized=Array.from(new Float32Array(endpoint)),quantizedDepth=1-quantized[2];assert.ok(quantizedDepth<camera.near);assert.equal(result.endpointQuantizationIncluded,false);
});
