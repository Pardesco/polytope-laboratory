/** Independent pre-mount kernels/native snapshots: never compare the mounted
 * worker with another import of its own math/packing implementation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildFaceSurfaces} from '../ui/face-fill.mjs';
import {prepareStereographicWorkerGeometry,computeStereographicWorkerGeometry,stereographicWorkerTransferables,runStereographicWorkerJob} from '../ui/stereographic-worker-geometry.mjs';
import {computeStereographicWorkerGeometry as legacyCompute} from './fixtures/legacy-stereographic-worker-geometry.mjs';
import {HybridStereographicOutputArena,createHybridStereographicOutputArena} from '../ui/stereographic-hybrid-output-arena.mjs';
import {GrowingStereographicOutputArena} from '../ui/stereographic-growing-output-arena.mjs';
import {createHybridStereographicOutputArena as frozenHybrid} from '../development/stereographic-hybrid-output-arena.mjs';
import {GrowingStereographicOutputArena as FrozenGrowing} from '../development/stereographic-growing-output-arena.mjs';
import {decodeStereographicOutput,StereographicWorkerCoordinator} from '../ui/stereographic-worker-protocol.mjs';
import {planStereographicQuality} from '../ui/stereographic-quality.mjs';

const manifest=JSON.parse(fs.readFileSync(new URL('./fixtures/stereographic-native-manifest.json',import.meta.url),'utf8'));
function sameResult(actual,expected){
  assert.deepEqual(Object.keys(actual),Object.keys(expected));assert.deepEqual(Object.keys(actual.geometry),Object.keys(expected.geometry));
  for(const [key,value] of Object.entries(expected.geometry)){
    const current=actual.geometry[key];if(ArrayBuffer.isView(value)){assert.equal(current.constructor,value.constructor);assert.deepEqual(Buffer.from(current.buffer,current.byteOffset,current.byteLength),Buffer.from(value.buffer,value.byteOffset,value.byteLength),key);}else assert.deepEqual(current,value,key);
  }
  for(const key of Object.keys(expected).filter(k=>k!=='geometry'))assert.deepEqual(actual[key],expected[key],key);
}
function fixture(){
  const normalized=[[1,0,0,0],[0,1,0,0],[0,0,1,0]],model={id:'mounted-sphere',fingerprint:'b'.repeat(64),dimension:4,embeddingDimension:4,vertices:normalized.map(p=>[...p]),edges:[[0,1],[1,2],[2,0]],faces:[[0,1,2]],cells:[],metadata:{faceColors:[[1,.2,.3,.4]],units:'mm'}};
  return {model,normalized,edges:model.edges,triangles:[{face:0,vertices:[0,1,2]}],visibility:{vertices:[true,true,true],edges:[true,true,true],faces:[true]}};
}
function nativeInput(model){
  const center=Array(4).fill(0);model.vertices.forEach(p=>p.forEach((x,i)=>center[i]+=x/model.vertices.length));
  const radius=Math.max(...model.vertices.map(p=>Math.hypot(...p.map((x,i)=>x-center[i]))))||1;
  const normalized=model.vertices.map(p=>p.map((x,i)=>(x-center[i])/radius));
  const triangles=buildFaceSurfaces(model).triangles.map(t=>({face:t.face,normalized:t.points.map(p=>p.map((x,i)=>(x-center[i])/radius))}));
  return prepareStereographicWorkerGeometry({model,normalized,edges:model.edges,triangles,visibility:{vertices:Array(model.vertices.length).fill(true),edges:Array(model.edges.length).fill(true),faces:Array(model.faces.length).fill(true)},angles:[0,0,24,0,18,0]});
}
const metadata=arena=>({capacityBytes:arena.capacityBytes,cumulativeAllocatedBytes:arena.cumulativeAllocatedBytes,growthCount:arena.growthCount,segmentCapacity:arena.segmentCapacity,triangleCapacity:arena.triangleCapacity});
function repack(arena,result){
  const g=result.geometry;for(let i=0;i<g.edgeIds.length;i++)arena.appendSegmentCoordinates(g.edgeInstanceIds[i],...g.segments.subarray(i*6,i*6+6));
  for(let i=0;i<g.faceIds.length;i++)arena.appendTriangleCoordinates(g.triangleInstanceIds[i],...g.triangles.subarray(i*9,i*9+9),...g.normals.subarray(i*9,i*9+9));
  const measured=metadata(arena);arena.finish();return measured;
}

for(const source of manifest)for(const phase of ['interaction','fine'])test(`mounted ${source.key} ${phase}: independent native buffers/statuses/arena capacity are exact`,()=>{
  const model=JSON.parse(fs.readFileSync(new URL('./fixtures/'+source.file,import.meta.url),'utf8')),before=JSON.stringify(model),input=nativeInput(model),positions=input.positions.slice(),options={tolerance:phase==='fine'?.004:source.interactionTolerance},expected=legacyCompute(input,options);
  let capacity;const finish=HybridStereographicOutputArena.prototype.finish;
  HybridStereographicOutputArena.prototype.finish=function(){capacity=metadata(this);return finish.call(this);};
  let actual;try{actual=computeStereographicWorkerGeometry(input,options);}finally{HybridStereographicOutputArena.prototype.finish=finish;}
  sameResult(actual,expected);assert.deepEqual(capacity,repack(frozenHybrid(input),expected));assert.equal(JSON.stringify(model),before);assert.deepEqual(input.positions,positions);
  assert.ok(Object.values(actual.geometry).filter(ArrayBuffer.isView).every(a=>a.byteLength===a.buffer.byteLength));decodeStereographicOutput(actual.geometry,input);
  assert.equal(model.fingerprint,source.sourceFingerprint);if(source.key==='cell120')assert.equal(actual.complete,false);
});

test('mounted lowered limits, retained partial output and depth exhaustion match independently frozen refusal semantics',()=>{
  const f=fixture();f.triangles.push({...f.triangles[0]});const input=prepareStereographicWorkerGeometry(f);
  for(const options of [{maxDepth:0},{limits:{segments:1}},{limits:{triangles:1}},{limits:{inputEdges:1,inputTriangles:1}},{maxDepth:2,tolerance:1e-8}]){
    const actual=computeStereographicWorkerGeometry(input,options),expected=legacyCompute(input,options);sameResult(actual,expected);assert.equal(actual.complete,false);assert.ok(actual.geometry.diagnostics.length>0);
  }
});
test('mounted fully clipped pole branches and center/rank omissions preserve explicit truth',()=>{
  const f=fixture();f.normalized=[[.01,0,0,1],[0,.01,0,1],[1,0,0,0]];f.edges=[[0,1]];f.triangles=[];f.visibility.edges=[true];
  let input=prepareStereographicWorkerGeometry(f),actual=computeStereographicWorkerGeometry(input);sameResult(actual,legacyCompute(input));assert.equal(actual.complete,true);assert.deepEqual([...actual.geometry.edgeResolution],[2]);
  f.normalized=[[1,0,0,0],[-1,0,0,0],[0,1,0,0]];f.triangles=[{face:0,vertices:[0,1,2]}];input=prepareStereographicWorkerGeometry(f);actual=computeStereographicWorkerGeometry(input);sameResult(actual,legacyCompute(input));assert.equal(actual.complete,false);assert.equal(actual.omittedTriangles,1);
});
test('mounted empty/no-faces/masked snapshots allocate no unused triangle/edge capacity',()=>{
  for(const mode of ['no-faces','masked','empty']){
    const f=fixture();if(mode!=='masked')f.triangles=[];if(mode==='empty')f.edges=[];if(mode==='masked'){f.visibility.faces=[false];f.visibility.edges.fill(false);}else f.visibility.edges=f.edges.map(()=>true);
    const input=prepareStereographicWorkerGeometry(f),actual=computeStereographicWorkerGeometry(input);sameResult(actual,legacyCompute(input));const arena=createHybridStereographicOutputArena(input);assert.equal(arena.triangleCapacity,0);if(mode!=='no-faces')assert.equal(arena.segmentCapacity,0);
    assert.equal(actual.geometry.triangles.buffer.byteLength,0);
  }
});
test('mounted SO4 frame and incremental rotations transform virtual samples exactly once',()=>{
  const f=fixture();f.matrix=[[0,-1,0,0],[1,0,0,0],[0,0,1,0],[0,0,0,1]];f.angles=[90,0,0,0,0,0];f.triangles.push({face:0,normalized:[[.5,.5,0,0],[.5,0,.5,0],[0,.5,.5,0]]});
  const before=JSON.stringify(f),input=prepareStereographicWorkerGeometry(f),actual=computeStereographicWorkerGeometry(input);sameResult(actual,legacyCompute(input));assert.ok(Math.abs(input.positions[0]+1)<1e-12);assert.ok(Math.abs(input.positions[1])<1e-12);assert.equal(JSON.stringify(f),before);
});
test('mounted repeated edge/face/cell instances retain independent original source ownership',()=>{
  const f=fixture();f.model.faces.push([0,1,2]);f.model.cells=[[0],[1]];f.normalized.push(...f.normalized.map(p=>[...p]));f.edges=[[0,1],[3,4]];f.triangles=[{face:0,cell:0,vertices:[0,1,2]},{face:1,cell:1,vertices:[3,4,5]}];f.visibility={vertices:Array(6).fill(true),edges:[true,true],faces:[true,true]};
  Object.assign(f,{sourceVertexIds:[0,1,2,0,1,2],sourceVertexFaces:[0,0,0,1,1,1],sourceVertexCells:[0,0,0,1,1,1],sourceEdgeIds:[0,0],sourceEdgeFaces:[0,1],sourceEdgeCells:[0,1],sourceTriangleIds:[0,0]});
  const input=prepareStereographicWorkerGeometry(f),actual=computeStereographicWorkerGeometry(input);sameResult(actual,legacyCompute(input));assert.deepEqual([...new Set(actual.geometry.cellIds)],[0,1]);assert.deepEqual([...new Set(actual.geometry.edgeFaces)],[0,1]);
});
test('mounted growth helper matches frozen capacity transitions and never changes source IDs',()=>{
  const input=prepareStereographicWorkerGeometry(fixture()),current=new GrowingStereographicOutputArena(input),reference=new FrozenGrowing(input),values=[1,-0,0,0,1,0,0,0,1,1,-0,0,0,1,0,0,0,1];
  for(let i=0;i<300;i++){current.appendTriangleCoordinates(0,...values);reference.appendTriangleCoordinates(0,...values);}assert.deepEqual(metadata(current),metadata(reference));
  const a=current.finish(),b=reference.finish();for(const key of Object.keys(a))assert.deepEqual(a[key],b[key]);
});
test('mounted worker transfers only decoded exact-size owned buffers, never arena spare capacity or inputs',()=>{
  const f=fixture(),input=prepareStereographicWorkerGeometry(f),quality=planStereographicQuality({cameraProjection:'orthographic',cssHeight:684,orthographicHalfHeight:1.45,zoom:1,phase:'capture'}),job={type:'geometry-job',version:1,jobId:1,token:1,generation:1,sourceKey:JSON.stringify([f.model.id,f.model.fingerprint]),frameKey:'transfer-pose',phase:'capture',quality,geometry:input},result=runStereographicWorkerJob(job);
  assert.equal(result.type,'geometry-result');for(const array of Object.values(result.geometry).filter(ArrayBuffer.isView))assert.equal(array.byteLength,array.buffer.byteLength);
  const bytes=input.positions.byteLength,delivered=structuredClone(result,{transfer:stereographicWorkerTransferables(result)});assert.equal(input.positions.byteLength,bytes);assert.ok(delivered.geometry.triangles.byteLength>0);assert.equal(result.geometry.triangles.byteLength,0);
});

for(const partial of [false,true])test(`mounted real coordinator ${partial?'rejects partial':'accepts complete'} exact capture`,async()=>{
  const f=fixture(),input=prepareStereographicWorkerGeometry(f),owner={model:f.model,sourceKey:JSON.stringify([f.model.id,f.model.fingerprint]),frameKey:'capture-pose',generation:1},quality=planStereographicQuality({cameraProjection:'orthographic',cssHeight:684,orthographicHalfHeight:1.45,zoom:1,phase:'capture'});let listener,published=0;
  const worker={addEventListener(type,fn){if(type==='message')listener=fn;},removeEventListener(){},terminate(){},postMessage(job){queueMicrotask(()=>{const result=computeStereographicWorkerGeometry(job.geometry,partial?{limits:{triangles:1}}:{});listener({data:{type:'geometry-result',version:1,jobId:job.jobId,token:job.token,generation:job.generation,sourceKey:job.sourceKey,frameKey:job.frameKey,phase:job.phase,...result}});});}};
  const coordinator=new StereographicWorkerCoordinator({worker,getOwner:()=>owner,publish:()=>{published++;}});
  try{const promise=coordinator.capture({...owner,phase:'capture',token:1,quality,geometry:input});if(partial){await assert.rejects(promise,/complete geometry/);assert.equal(published,0);}else{assert.equal((await promise).complete,true);assert.equal(published,1);}}finally{coordinator.destroy();}
});
