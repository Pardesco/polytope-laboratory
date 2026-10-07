import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareStereographicWorkerGeometry,computeStereographicWorkerGeometry,runStereographicWorkerJob,stereographicWorkerTransferables} from '../ui/stereographic-worker-geometry.mjs';
import {stereoDisplayGeometry} from '../ui/viewer-stereographic.mjs';
import {StereographicWorkerCoordinator,decodeStereographicOutput} from '../ui/stereographic-worker-protocol.mjs';
import {planStereographicQuality,stereographicSnapshotKeys} from '../ui/stereographic-quality.mjs';

const HASH='c'.repeat(64),FRAME=[[0,-1,0,0],[1,0,0,0],[0,0,1,0],[0,0,0,1]];
function fixture(){
  const normalized=[[1,0,0,0],[0,1,0,0],[0,0,1,0]];
  const model={id:'literal-sphere',fingerprint:HASH,dimension:4,embeddingDimension:4,vertices:normalized.map(p=>[...p]),edges:[[0,1],[1,2],[2,0]],faces:[[0,1,2]],cells:[]};
  return {model,normalized,edges:model.edges,triangles:[{face:0,vertices:[0,1,2]}],visibility:{vertices:[true,true,true],edges:[true,true,true],faces:[true]}};
}
const float32=values=>new Float32Array(values);
const synchronous=(f,options={})=>stereoDisplayGeometry(f.normalized,f.edges,f.triangles,f.visibility,f.matrix??null,f.angles??[],options);
const packedSegments=result=>float32(result.edges.flatMap(e=>[...e.a,...e.b]));
const packedTriangles=result=>float32(result.triangles.flatMap(t=>t.points.flat()));
const packedNormals=result=>float32(result.triangles.flatMap(t=>t.normals.flat()));
const close=(a,b,epsilon=2e-7)=>{assert.equal(a.length,b.length);a.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<epsilon,`${a} != ${b}`));};
function job(input,phase='capture'){
  const quality=planStereographicQuality({cameraProjection:'orthographic',cssHeight:684,orthographicHalfHeight:1.45,zoom:1,phase});
  return {type:'geometry-job',version:1,jobId:1,token:2,generation:3,sourceKey:JSON.stringify(['literal-sphere',HASH]),frameKey:'literal-frame',phase,quality,geometry:input};
}

test('worker flattening exactly matches synchronous circular arcs and analytic smooth sphere normals',()=>{
  const f=fixture(),before=JSON.stringify(f),input=prepareStereographicWorkerGeometry(f),result=computeStereographicWorkerGeometry(input),sync=synchronous(f);
  assert.equal(result.complete,true);assert.equal(result.exactPose,true);assert.equal(result.achievedTolerance,.004);
  assert.deepEqual(result.geometry.segments,packedSegments(sync));assert.deepEqual(result.geometry.triangles,packedTriangles(sync));assert.deepEqual(result.geometry.normals,packedNormals(sync));
  assert.deepEqual([...result.geometry.edgeResolution],[1,1,1]);assert.deepEqual([...result.geometry.triangleResolution],[1]);
  for(let i=0;i<result.geometry.segments.length;i+=3)assert.ok(Math.abs(Math.hypot(...result.geometry.segments.slice(i,i+3))-1)<1e-7);
  for(let i=0;i<result.geometry.triangles.length;i+=3)close([...result.geometry.normals.slice(i,i+3)],[...result.geometry.triangles.slice(i,i+3)]);
  assert.deepEqual([...new Set(result.geometry.edgeIds)],[0,1,2]);assert.deepEqual([...new Set(result.geometry.faceIds)],[0]);assert.equal(JSON.stringify(f),before);
});

test('indexed and virtual crossings share one posed Float64 frame and six-angle transform',()=>{
  const f=fixture();f.matrix=FRAME;f.angles=[90,0,0,0,0,0];f.triangles.push({face:0,normalized:[[.5,.5,0,0],[.5,0,.5,0],[0,.5,.5,0]]});
  const input=prepareStereographicWorkerGeometry(f),result=computeStereographicWorkerGeometry(input),sync=synchronous(f);
  close([...input.positions.slice(0,4)],[-1,0,0,0],1e-12);close([...result.geometry.positions.slice(0,3)],[-1,0,0]);
  assert.deepEqual(result.geometry.segments,packedSegments(sync));assert.deepEqual(result.geometry.triangles,packedTriangles(sync));assert.deepEqual(result.geometry.normals,packedNormals(sync));
  assert.deepEqual([...new Set(result.geometry.triangleIds)],[0,1]);assert.ok(result.geometry.triangleInstanceIds.some(id=>id===1));
});

test('repeated source instances preserve distinct face owners and exact per-instance cap resolution',()=>{
  const f=fixture();f.model.faces.push([0,1,2]);f.normalized.push(...f.normalized.map(p=>[...p]));f.edges=[[0,1],[3,4]];f.triangles=[{face:0,vertices:[0,1,2]},{face:1,vertices:[3,4,5]}];
  f.visibility={vertices:Array(6).fill(true),edges:[true,true],faces:[true,true]};
  Object.assign(f,{sourceVertexIds:[0,1,2,0,1,2],sourceVertexFaces:[0,0,0,1,1,1],sourceEdgeIds:[0,0],sourceEdgeFaces:[0,1],sourceTriangleIds:[0,0]});
  const input=prepareStereographicWorkerGeometry(f),full=computeStereographicWorkerGeometry(input),bounded=computeStereographicWorkerGeometry(input,{limits:{inputEdges:1,inputTriangles:1}});
  assert.equal(full.complete,true);assert.deepEqual([...new Set(full.geometry.edgeInstanceIds)],[0,1]);assert.deepEqual([...new Set(full.geometry.edgeFaces)],[0,1]);assert.deepEqual([...new Set(full.geometry.triangleInstanceIds)],[0,1]);
  assert.deepEqual([...bounded.geometry.edgeResolution],[1,4]);assert.deepEqual([...bounded.geometry.triangleResolution],[1,4]);assert.equal(bounded.omittedEdges,1);assert.equal(bounded.omittedTriangles,1);assert.equal(bounded.complete,false);
  assert.deepEqual([...new Set(bounded.geometry.edgeInstanceIds)],[0]);decodeStereographicOutput(bounded.geometry,input);
});

test('display masks retain source vertex slots and omit invisible curve/patch instances without counting failure',()=>{
  const f=fixture();f.visibility.vertices=[false,true,true];f.visibility.edges=[false,true,false];f.visibility.faces=[false];
  const input=prepareStereographicWorkerGeometry(f),result=computeStereographicWorkerGeometry(input);
  assert.equal(result.geometry.positions.length,9);assert.deepEqual([...result.geometry.vertexIds],[0,1,2]);assert.deepEqual([...result.geometry.vertexVisible],[0,1,1]);
  assert.deepEqual([...result.geometry.edgeResolution],[0,1,0]);assert.deepEqual([...result.geometry.triangleResolution],[0]);assert.deepEqual([...new Set(result.geometry.edgeIds)],[1]);assert.equal(result.complete,true);assert.equal(result.omittedTriangles,0);
});

test('fully resolved pole cutoff is complete, while center-crossing undefined geometry is explicitly omitted',()=>{
  const f=fixture();f.normalized=[[.01,0,0,1],[0,.01,0,1],[1,0,0,0]];f.edges=[[0,1]];f.triangles=[];f.visibility={vertices:[true,true,true],edges:[true],faces:[true]};
  const pole=computeStereographicWorkerGeometry(prepareStereographicWorkerGeometry(f));assert.equal(pole.complete,true);assert.deepEqual([...pole.geometry.vertexVisible],[0,0,1]);assert.deepEqual([...pole.geometry.edgeResolution],[2]);assert.ok(pole.geometry.diagnostics.some(d=>d.includes('pole')));assert.equal(pole.geometry.segments.length,0);
  f.normalized=[[1,0,0,0],[-1,0,0,0],[0,1,0,0]];f.triangles=[{face:0,vertices:[0,1,2]}];
  const undefinedImage=computeStereographicWorkerGeometry(prepareStereographicWorkerGeometry(f));assert.equal(undefinedImage.complete,false);assert.deepEqual([...undefinedImage.geometry.edgeResolution],[4]);assert.deepEqual([...undefinedImage.geometry.triangleResolution],[4]);assert.equal(undefinedImage.omittedEdges,1);assert.equal(undefinedImage.omittedTriangles,1);assert.ok(undefinedImage.geometry.diagnostics.some(d=>d.includes('source center')));
});

test('retained partial arcs at a global segment cap agree with synchronous output and cannot claim completion',()=>{
  const f=fixture(),input=prepareStereographicWorkerGeometry(f),limits={segments:1},result=computeStereographicWorkerGeometry(input,{limits}),sync=synchronous(f,{limits:{segments:1,triangles:100000,inputTriangles:2000,inputEdges:30000}});
  assert.equal(result.complete,false);assert.deepEqual(result.geometry.segments,packedSegments(sync));assert.deepEqual([...result.geometry.edgeResolution],[3,4,4]);assert.equal(result.unresolvedEdges,1);assert.equal(result.omittedEdges,2);assert.ok(result.geometry.segments.length>0);decodeStereographicOutput(result.geometry,input);
});

test('retained partial patches and omitted later inputs honor the original global triangle cap',()=>{
  const f=fixture();f.triangles.push({...f.triangles[0]});const input=prepareStereographicWorkerGeometry(f),limits={triangles:1,inputTriangles:2,inputEdges:30000,segments:60000},result=computeStereographicWorkerGeometry(input,{limits:{triangles:1}}),sync=synchronous(f,{limits});
  assert.deepEqual(result.geometry.triangles,packedTriangles(sync));assert.deepEqual([...result.geometry.triangleResolution],[3,4]);assert.equal(result.unresolvedTriangles,1);assert.equal(result.omittedTriangles,1);assert.equal(result.complete,false);assert.equal(result.geometry.triangleInstanceIds[0],0);
});

test('subdivision depth exhaustion produces explicit unresolved slots without a straight fallback',()=>{
  const f=fixture(),result=computeStereographicWorkerGeometry(prepareStereographicWorkerGeometry(f),{maxDepth:0});
  assert.equal(result.geometry.segments.length,0);assert.equal(result.geometry.triangles.length,0);assert.deepEqual([...result.geometry.edgeResolution],[3,3,3]);assert.deepEqual([...result.geometry.triangleResolution],[3]);assert.equal(result.complete,false);assert.ok(result.geometry.diagnostics.every(d=>d.includes('bound')));
});

test('preparation owns source-coordinate, ID and mask buffers without freezing or detaching caller data',()=>{
  const f=fixture(),input=prepareStereographicWorkerGeometry(f),snapshot=[...input.positions],ids=[...input.edgeIds],before=input.positions.byteLength;
  f.normalized[0][0]=9;f.visibility.edges[0]=false;f.model.faces[0].reverse();assert.deepEqual([...input.positions],snapshot);assert.deepEqual([...input.edgeIds],ids);assert.equal(input.edgeVisible[0],1);
  const output=computeStereographicWorkerGeometry(input);output.geometry.positions[0]=99;assert.deepEqual([...input.positions],snapshot);assert.equal(input.positions.byteLength,before);assert.equal(Object.isFrozen(f.model),false);
});

test('invalid dimensions, matrices, coordinates, incidence and resource settings fail before publication',()=>{
  const f=fixture();assert.throws(()=>prepareStereographicWorkerGeometry({...f,model:{...f.model,dimension:3}}),/4D/);
  assert.throws(()=>prepareStereographicWorkerGeometry({...f,matrix:[[ -1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]}),/determinant/);
  assert.throws(()=>prepareStereographicWorkerGeometry({...f,normalized:[[NaN,0,0,0],...f.normalized.slice(1)]}),/finite/);
  assert.throws(()=>prepareStereographicWorkerGeometry({...f,edges:[[0,999]]}),/endpoint/);
  assert.throws(()=>prepareStereographicWorkerGeometry({...f,triangles:[{face:999,vertices:[0,1,2]}]}),/face/);
  assert.throws(()=>prepareStereographicWorkerGeometry({...f,sourceEdgeIds:[.5,1,2]}),/integer/);
  const input=prepareStereographicWorkerGeometry(f);for(const options of [{tolerance:0},{tolerance:.1},{maxDepth:9},{poleEpsilon:.03},{limits:{triangles:100001}},{limits:{unknown:1}}])assert.throws(()=>computeStereographicWorkerGeometry(input,options),/bounds|tolerance|limits|caps/i);
  input.positions[0]=Infinity;assert.throws(()=>computeStereographicWorkerGeometry(input),/finite/);
});

test('malicious getters and sparse coordinate/mask arrays are rejected without executing accessors',()=>{
  const f=fixture();let visits=0;const options={...f};Object.defineProperty(options,'matrix',{get(){visits++;return FRAME;}});assert.throws(()=>prepareStereographicWorkerGeometry(options),/data record/);
  const point=[1,0,0,0];Object.defineProperty(point,0,{get(){visits++;return 1;}});assert.throws(()=>prepareStereographicWorkerGeometry({...f,normalized:[point,...f.normalized.slice(1)]}),/dense/);
  const mask=[true,true,true];delete mask[1];assert.throws(()=>prepareStereographicWorkerGeometry({...f,visibility:{...f.visibility,edges:mask}}),/dense/);assert.equal(visits,0);
});

test('job envelopes preserve complete ownership and return bounded errors without caller-buffer transfer',()=>{
  const f=fixture(),input=prepareStereographicWorkerGeometry(f),request=job(input),result=runStereographicWorkerJob(request);
  assert.equal(result.type,'geometry-result');for(const key of ['jobId','token','generation','sourceKey','frameKey','phase'])assert.equal(result[key],request[key]);assert.equal(result.complete,true);assert.equal(result.achievedTolerance,request.quality.tolerance);
  const transfers=stereographicWorkerTransferables(result);assert.equal(new Set(transfers).size,transfers.length);assert.ok(transfers.every(b=>b instanceof ArrayBuffer));const inputLength=input.positions.byteLength;
  const delivered=structuredClone(result,{transfer:transfers});assert.equal(input.positions.byteLength,inputLength);assert.equal(result.geometry.positions.byteLength,0);assert.ok(delivered.geometry.triangles.byteLength>0);
  input.positions[0]=Infinity;const error=runStereographicWorkerJob({...request,geometry:input});assert.equal(error.type,'geometry-error');assert.match(error.message,/finite/);assert.equal(error.sourceKey,request.sourceKey);assert.deepEqual(stereographicWorkerTransferables(error),[]);
  assert.throws(()=>runStereographicWorkerJob({...request,sourceKey:''}),/ownership/);
});

class LoopbackWorker{
  constructor(){this.listeners=new Map();this.terminated=false;}
  addEventListener(type,fn){this.listeners.set(type,fn);}
  removeEventListener(type){this.listeners.delete(type);}
  postMessage(message,transfer){const owned=structuredClone(message,{transfer});queueMicrotask(()=>{if(this.terminated)return;const result=runStereographicWorkerJob(owned);this.listeners.get('message')?.({data:structuredClone(result,{transfer:stereographicWorkerTransferables(result)})});});}
  terminate(){this.terminated=true;}
}

test('actual pure core interoperates with worker coordinator capture ownership and detached transport',async()=>{
  const f=fixture(),input=prepareStereographicWorkerGeometry(f),keys=stereographicSnapshotKeys({modelId:f.model.id,sourceFingerprint:HASH},{angles:[]}),request={...job(input),...keys,model:f.model};
  const owner={model:f.model,...keys,generation:request.generation},published=[];
  const bridge=new StereographicWorkerCoordinator({worker:new LoopbackWorker(),getOwner:()=>owner,publish:(geometry,guard)=>{assert.equal(guard.isCurrent(),true);published.push(geometry);}});
  const bytes=input.positions.byteLength,result=await bridge.capture(request);
  assert.equal(result.complete,true);assert.equal(published.length,1);assert.equal(result.geometry.triangleResolution[0],1);assert.equal(input.positions.byteLength,bytes);assert.deepEqual(result.geometry.segments,published[0].geometry.segments);assert.equal(bridge.pickingPublication.model,f.model);bridge.destroy();
});

test('exact capture rejects undefined center images rather than publishing a qualified empty fallback',async()=>{
  const f=fixture();f.normalized[1]=[-1,0,0,0];const input=prepareStereographicWorkerGeometry(f),request={...job(input),model:f.model},owner={model:f.model,sourceKey:request.sourceKey,frameKey:request.frameKey,generation:request.generation};let publications=0;
  const bridge=new StereographicWorkerCoordinator({worker:new LoopbackWorker(),getOwner:()=>owner,publish:()=>{publications++;}});
  await assert.rejects(bridge.capture(request),/complete geometry/);assert.equal(publications,0);bridge.destroy();
});
