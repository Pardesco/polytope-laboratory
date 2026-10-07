import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {captureHomogeneousStereographicCamera as capture} from '../development/stereographic-homogeneous-camera.mjs';
import {tessellateHomogeneousStereographicArc as tess} from '../development/stereographic-homogeneous-arc-tessellation.mjs';
import {nextFloatUp} from '../ui/stereographic-arc-bound.mjs';

function camera(kind='orthographic',width=800,height=600){
  const c=kind==='perspective'?new THREE.PerspectiveCamera(38,width/height,.01,100):new THREE.OrthographicCamera(-2,2,1.5,-1.5,.01,100);
  c.position.z=5;c.updateMatrixWorld();return {c,s:capture({camera:c,cssWidth:width,cssHeight:height})};
}
const edge={a:[1,0,0,0],b:[0,1,0,0]};
function coverage(r){
  const spans=[...r.omissions,...r.clippedIntervals].map(x=>[x.t0,x.t1]);
  for(let i=0;i<r.segments;i++)spans.push([r.parameterIntervals[2*i],r.parameterIntervals[2*i+1]]);
  spans.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);assert.equal(spans[0][0],r.rawParameterInterval[0]);assert.equal(spans.at(-1)[1],r.rawParameterInterval[1]);
  for(let i=1;i<spans.length;i++)assert.equal(spans[i][0],spans[i-1][1]);
}
const world=(a,b,t)=>{const p=a.map((x,i)=>x+t*(b[i]-x)),r=Math.hypot(...p);return p.slice(0,3).map(x=>x/(r-p[3]));};
const css=(c,p,width,height)=>{const q=new THREE.Vector3(...p).project(c);return [(1+q.x)*width/2,(1-q.y)*height/2];};

test('equatorial circular arcs retain all raw intervals below the whole-curve plus packed endpoint criterion',()=>{
  const {s,c}=camera(),r=tess(s,{...edge,tolerancePixels:1,sourceEdgeId:7,sourceInstanceId:19,sourceFaceId:5,sourceCellId:3});assert.equal(r.complete,true);assert.ok(r.segments>1);coverage(r);
  for(let i=0;i<r.segments;i++){
    assert.ok(r.errorBoundsPixels[i]<=1);assert.ok(r.errorBoundsPixels[i]>=r.curveErrorBoundsPixels[i]+r.endpointErrorBoundsPixels[i]);
    const t0=r.parameterIntervals[2*i],t1=r.parameterIntervals[2*i+1],p0=css(c,Array.from(r.positions.subarray(6*i,6*i+3)),800,600),p1=css(c,Array.from(r.positions.subarray(6*i+3,6*i+6)),800,600);
    // Independent exact circle sagitta is below the analytic interval bound.
    const angle=t=>Math.atan2(t,1-t),sagitta=200*(1-Math.cos((angle(t1)-angle(t0))/2));assert.ok(sagitta<=r.curveErrorBoundsPixels[i]);
    // Samples supplement (never establish) the analytic whole-interval proof.
    for(const u of [.125,.371,.5,.875]){const p=css(c,world(edge.a,edge.b,t0+(t1-t0)*u),800,600),error=Math.hypot(...p.map((x,k)=>x-((1-u)*p0[k]+u*p1[k])));assert.ok(error<=r.errorBoundsPixels[i]+1e-9);}
  }
  assert.equal(r.sourceEdgeId,7);assert.equal(r.sourceInstanceId,19);assert.equal(r.sourceFaceId,5);assert.equal(r.sourceCellId,3);assert.equal(r.cpuSequentialRoundingIncluded,false);assert.equal(r.wholePatchBound,false);
});

test('rolled off-axis non-unit homogeneous camera with affine group supports the same stored descriptor and raw path',()=>{
  const c=new THREE.PerspectiveCamera(38,947/613,.01,1000);c.position.set(3,2,5);c.up.set(.3,1,.1);c.lookAt(.1,.2,-.1);c.zoom=1.3;c.setViewOffset(1200,900,93,117,947,613);c.filmOffset=2;c.updateMatrixWorld();c.updateProjectionMatrix();
  const g=new THREE.Matrix4().set(1.2,.2,0,.3,0,.8,.1,-.2,0,0,1.1,.1,0,0,0,nextFloatUp(1)),s=capture({camera:c,cssWidth:947,cssHeight:613,groupMatrixWorld:g}),input={a:[2,0,.2,.1],b:[0,1,-.4,-.1],t0:.125,t1:.75,tolerancePixels:.7},r=tess(s,input);assert.equal(r.complete,true);coverage(r);assert.equal(r.cameraSignature,s.signature);
  const binding=JSON.parse(r.sourceBinding);assert.deepEqual(binding.a,input.a);assert.deepEqual(binding.rawParameterInterval,[.125,.75]);assert.ok(r.segments>1);assert.ok(Array.from(r.errorBoundsPixels).every(x=>x<=.7));assert.equal(r.coefficientNormalizationEnclosed,true);
});

test('unequal endpoint radii keep raw t ownership and deterministic output instead of angular interpolation',()=>{
  const {s}=camera(),input={a:[2,0,0,0],b:[0,1,0,0],t0:.25,t1:.75,tolerancePixels:2},a=tess(s,input),b=tess(s,input);assert.equal(a.complete,true);assert.deepEqual(a,b);coverage(a);
  const at=Array.from(a.positions.subarray(0,3)),actual=world(input.a,input.b,.25);assert.ok(Math.hypot(...at.map((x,i)=>x-actual[i]))<1e-7);assert.ok(Math.abs(actual[0]-Math.cos(Math.PI/8))>.05);
});

test('fixed outer packed endpoints preserve actual shared bytes and copied source ownership',()=>{
  const {s}=camera(),a=new Float64Array([1,0,0,0]),b=new Float64Array([0,1,0,0]),fixed=new Float32Array([1.0001,0,0,0,1.0001,0]),r=tess(s,{a,b,packedEndpoints:fixed,tolerancePixels:1});assert.equal(r.complete,true);assert.equal(r.fixedPackedEndpointsIncluded,true);
  assert.deepEqual(Array.from(r.positions.subarray(0,3)),Array.from(fixed.subarray(0,3)));assert.deepEqual(Array.from(r.positions.subarray(-3)),Array.from(fixed.subarray(3)));assert.ok(r.endpointErrorBoundsPixels[0]>.01);
  fixed[0]=99;a[0]=7;assert.notEqual(r.positions[0],99);assert.equal(r.source.a[0],1);assert.equal(a.byteLength,32);assert.equal(Object.isFrozen(a),false);r.positions[0]=11;assert.equal(r.source.a[0],1);
});

test('pole and near-plane intervals are accounted explicitly, never bridged by retained chords',()=>{
  const {s}=camera(),pole=tess(s,{a:[1,0,0,0],b:[0,0,0,1],maxDepth:8,maxVisits:511,tolerancePixels:1});assert.equal(pole.complete,false);assert.ok(pole.clippedIntervals.length);assert.ok(pole.omissions.length);coverage(pole);
  assert.ok(pole.omissions.some(x=>/pole/.test(x.code)));for(let i=0;i<pole.segments;i++)assert.ok(pole.parameterIntervals[2*i+1]<1);
  const c=new THREE.PerspectiveCamera(60,1,.4,10);c.position.z=1;c.updateMatrixWorld();const near=capture({camera:c,cssWidth:800,cssHeight:600}),r=tess(near,{a:[1,0,0,0],b:[0,0,1,0],maxDepth:8,maxVisits:511});assert.equal(r.complete,false);assert.ok(r.clippedIntervals.length);assert.ok(r.omissions.length);coverage(r);
  assert.ok(r.omissions.some(x=>/depth/.test(x.code)));
});

test('whole-clipped and undefined source-center cases have zero geometry and honest distinct completeness',()=>{
  const {s}=camera(),clipped=tess(s,{a:[0,0,0,1],b:[0,0,0,1]});assert.equal(clipped.segments,0);assert.equal(clipped.complete,true);assert.equal(clipped.omissions.length,0);assert.equal(clipped.clippedIntervals.length,1);coverage(clipped);
  const center=tess(s,{a:[1,0,0,0],b:[-1,0,0,0]});assert.equal(center.segments,0);assert.equal(center.complete,false);assert.equal(center.omissions[0].code,'source-center');coverage(center);
  const point=tess(s,{...edge,t0:.5,t1:.5});assert.equal(point.complete,true);assert.equal(point.segments,1);assert.equal(point.curveErrorBoundsPixels[0],0);coverage(point);
});

test('segment/visit/depth caps and endpoint quantization floors are partial with complete ownership accounting',()=>{
  const {s}=camera();for(const opts of [{maxSegments:1},{maxVisits:1},{maxDepth:0},{tolerancePixels:1e-12,maxDepth:3,maxVisits:31}]){const r=tess(s,{...edge,sourceEdgeId:44,sourceInstanceId:88,...opts});assert.equal(r.complete,false);assert.ok(r.omissions.length);coverage(r);assert.ok(r.endpointCachePeak<=r.endpointCacheLimit);assert.ok(r.visits<=(opts.maxVisits??8191));for(const x of r.omissions){assert.equal(x.sourceEdgeId,44);assert.equal(x.sourceInstanceId,88);}}
});

test('camera/source/endpoint malformed data and resource requests refuse without source mutation',()=>{
  const {s}=camera();for(const opts of [{maxVisits:262145},{maxSegments:65537},{maxDepth:33},{tolerancePixels:0},{sourceEdgeId:-1},{sourceFaceId:1.5},{t0:.8,t1:.2},{packedEndpoints:new Float32Array(3)}])assert.throws(()=>tess(s,{...edge,...opts}));
  assert.throws(()=>tess({...s},edge),/owned immutable/);class Foreign extends Float32Array{}assert.throws(()=>tess(s,{...edge,packedEndpoints:new Foreign(6)}),/ordinary Float32/);
  assert.throws(()=>tess(s,{...edge,t0:.5,t1:.5,packedEndpoints:new Float32Array([1,0,0,0,1,0])}),/identical/);
  let calls=0;const accessor={...edge};Object.defineProperty(accessor,'packedEndpoints',{get(){calls++;throw Error('invoked');}});assert.throws(()=>tess(s,accessor),/own data/);assert.equal(calls,0);
});

test('small and capped dense CPU-only batches expose finite work counts, not a rendering performance claim',t=>{
  const {s}=camera('perspective'),begin=performance.now();let segments=0,visits=0,partial=0;
  for(let i=0;i<24;i++){const r=tess(s,{a:[1,0,0,0],b:[0,1,.05*i,.1],maxSegments:8,maxVisits:31,maxDepth:8,tolerancePixels:.5});segments+=r.segments;visits+=r.visits;partial+=!r.complete;assert.ok(r.segments<=8);assert.ok(r.visits<=31);}
  assert.ok(partial>0);t.diagnostic(JSON.stringify({cases:24,segments,visits,partial,cpuMilliseconds:performance.now()-begin,scope:'headless prototype work; no GPU/window/FPS qualification'}));
});
