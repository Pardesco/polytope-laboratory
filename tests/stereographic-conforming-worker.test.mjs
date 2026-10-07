import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareStereographicWorkerGeometry as prepare,computeStereographicWorkerGeometry as compute,runStereographicWorkerJob,stereographicWorkerTransferables} from '../ui/stereographic-worker-geometry.mjs';
import {validateStereographicInput,StereographicWorkerCoordinator} from '../ui/stereographic-worker-protocol.mjs';
import {buildFaceSurfaces} from '../ui/face-fill.mjs';
import {cellFaceInstances} from '../ui/entity-presentation.mjs';
const HASH='c'.repeat(64),NONE=0xffffffff;
function quad(){
  const normalized=[[-1,-1,.4,-.3],[1,-1,.4,-.3],[1,1,.4,-.3],[-1,1,.4,-.3]];
  const model={id:'independent-quad',fingerprint:HASH,dimension:4,embeddingDimension:4,vertices:normalized,edges:[[0,1],[1,2],[2,3],[3,0]],faces:[[0,1,2,3]],cells:[]};
  return {model,normalized,edges:model.edges,triangles:[{face:0,vertices:[0,1,2]},{face:0,vertices:[0,2,3]}],visibility:{vertices:[1,1,1,1],edges:[1,1,1,1],faces:[1]},angles:[21,9,33,15,39,6]};
}
function native(key,shrink=1){
  const manifest=JSON.parse(fs.readFileSync(new URL('./fixtures/stereographic-native-manifest.json',import.meta.url))),entry=manifest.find(x=>x.key===key);
  const model=JSON.parse(fs.readFileSync(new URL('./fixtures/'+entry.file,import.meta.url))),center=[0,0,0,0];
  model.vertices.forEach(p=>p.forEach((x,k)=>center[k]+=x/model.vertices.length));
  const radius=Math.max(...model.vertices.map(p=>Math.hypot(...p.map((x,k)=>x-center[k]))));
  const normalized=model.vertices.map(p=>p.map((x,k)=>(x-center[k])/radius)),filled=buildFaceSurfaces(model);
  const triangles=cellFaceInstances(model,filled.triangles,model.cells.map((_,i)=>i),shrink).triangles.map(t=>({...t,normalized:t.points.map(p=>p.map((x,k)=>(x-center[k])/radius))}));
  return {model,normalized,edges:model.edges,triangles,visibility:{vertices:model.vertices.map(()=>0),edges:model.edges.map(()=>0),faces:model.faces.map(()=>1)}};
}
test('opt-in adds detached corner/source lineage and retains legacy preparation exactly',()=>{
  const f=quad(),before=JSON.stringify(f),old=prepare(f),input=prepare({...f,conformingSurfaces:true});
  assert.equal(old.triangleCornerIds,undefined);assert.deepEqual([...input.triangleCornerIds],[0,1,2,0,2,3]);assert.deepEqual([...input.triangleSourceVertexIds],[0,1,2,0,2,3]);
  for(const k of Object.keys(old))assert.deepEqual(input[k],old[k]);
  const copy=validateStereographicInput(input);copy.triangleCornerIds[0]=99;assert.equal(input.triangleCornerIds[0],0);assert.equal(JSON.stringify(f),before);
});
test('native shared-corner records reject mismatched poses/domains and malformed optional fields',()=>{
  const input=prepare({...quad(),conformingSurfaces:true});
  for(const mutate of [g=>g.trianglePositions[12]+=1,g=>g.triangleSourceVertexIds[3]=1,g=>g.triangleCornerIds[1]=0,g=>g.triangleCornerIds[0]=NONE,g=>delete g.triangleSourceVertexIds,g=>g.triangleCornerIds=new Uint32Array(2)]){
    const g=structuredClone(input);mutate(g);assert.throws(()=>validateStereographicInput(g));
  }
});
test('actual opt-in worker keeps original arcs and complete smooth patch owners',()=>{
  const f=quad(),legacy=compute(prepare(f)),fixed=compute(prepare({...f,conformingSurfaces:true}));
  assert.equal(fixed.complete,true);assert.deepEqual(fixed.geometry.positions,legacy.geometry.positions);assert.deepEqual(fixed.geometry.segments,legacy.geometry.segments);assert.deepEqual(fixed.geometry.edgeIds,legacy.geometry.edgeIds);
  assert.deepEqual([...new Set(fixed.geometry.triangleInstanceIds)],[0,1]);assert.deepEqual([...fixed.geometry.triangleResolution],[1,1]);
  for(let i=0;i<fixed.geometry.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...fixed.geometry.normals.subarray(i,i+3))-1)<2e-7);
});
test('shrunk cell corners share within each cell and never alias coincident independent owners',()=>{
  const f=quad();f.model.cells=[[0],[0]];
  const triangles=[0,1].flatMap(cell=>f.triangles.map(t=>({face:0,cell,sourceVertices:t.vertices,normalized:t.vertices.map(i=>f.normalized[i])})));
  const g=prepare({...f,triangles,conformingSurfaces:true});
  assert.deepEqual([...g.triangleCornerIds],[0,1,2,0,2,3,4,5,6,4,6,7]);
  const r=compute(g);assert.equal(r.complete,true);assert.deepEqual([...new Set(r.geometry.cellIds)],[0,1]);
  const forged=structuredClone(g);for(let i=6;i<12;i++)forged.triangleCornerIds[i]-=4;assert.throws(()=>validateStereographicInput(forged),/domain/);
});
test('virtual triangles lacking proven corners are explicitly omitted and cannot complete capture',()=>{
  const f=quad();f.triangles=[{face:0,normalized:f.triangles[0].vertices.map(i=>f.normalized[i])}];
  const g=prepare({...f,conformingSurfaces:true});assert.deepEqual([...g.triangleCornerIds],[NONE,NONE,NONE]);
  const r=compute(g);assert.equal(r.complete,false);assert.equal(r.omittedTriangles,1);assert.deepEqual([...r.geometry.triangleResolution],[4]);assert.match(r.geometry.diagnostics.join(' '),/virtual/);
});
test('declared virtual corners restore shared surfaces without claiming native vertex incidence',()=>{
  const f=quad();f.triangles=f.triangles.map(t=>({face:t.face,normalized:t.vertices.map(i=>f.normalized[i]),presentationCornerIds:t.vertices}));
  const g=prepare({...f,conformingSurfaces:true});assert.deepEqual([...g.triangleCornerIds],[0,1,2,0,2,3]);assert.ok(g.triangleSourceVertexIds.every(id=>id===NONE));assert.equal(compute(g).complete,true);
  const forged=structuredClone(g);forged.faceIds[1]=1;forged.sourceCounts.faces=2;assert.throws(()=>validateStereographicInput(forged),/domain/);
  f.triangles[0].presentationCornerIds=[0,0,2];assert.throws(()=>prepare({...f,conformingSurfaces:true}),/distinct/);
});
test('actual capture coordinator rejects complete-flag forgery for conforming fully clipped geometry',async()=>{
  const normalized=[[.08,0,0,1],[0,.08,0,1],[-.08,-.08,0,1]],model={id:'pole',fingerprint:HASH,dimension:4,vertices:normalized,edges:[[0,1],[1,2],[2,0]],faces:[[0,1,2]],cells:[]};
  const geometry=prepare({model,normalized,edges:[],triangles:[{face:0,vertices:[0,1,2]}],visibility:{vertices:[0,0,0],edges:[],faces:[1]},conformingSurfaces:true});
  const jobs=[],listeners=new Set(),worker={addEventListener:(type,fn)=>{if(type==='message')listeners.add(fn);},removeEventListener:(type,fn)=>listeners.delete(fn),postMessage:(value)=>jobs.push(value),terminate:()=>{}},owner={model,sourceKey:JSON.stringify([model.id,HASH]),frameKey:'pole-frame',generation:1};let published=0;
  const c=new StereographicWorkerCoordinator({worker,getOwner:()=>owner,publish:()=>{published++;}}),quality={phase:'capture',tolerance:.004,poleEpsilon:.02,pixelBound:'unavailable',criterion:'adaptive-sampled-world-error',wholePrimitiveBound:false,budgetSatisfied:null};
  const p=c.capture({...owner,token:1,phase:'capture',quality,geometry});const rejection=assert.rejects(p,/excluded pole/);
  const result=runStereographicWorkerJob(jobs[0]);assert.equal(result.complete,false);assert.equal(result.clippedTriangles,1);assert.deepEqual([...result.geometry.triangleResolution],[2]);result.complete=true;
  for(const listener of listeners)listener({data:result});await rejection;assert.equal(published,0);c.destroy();
});
test('source cap and mesh cap refuse initial complete request atomically rather than source-prefix geometry',()=>{
  const g=prepare({...quad(),conformingSurfaces:true}),r=compute(g,{limits:{triangles:1}});
  assert.equal(r.geometry.triangles.length,0);assert.deepEqual([...r.geometry.triangleResolution],[4,4]);assert.equal(r.omittedTriangles,2);assert.equal(r.complete,false);
  const lower=compute(g,{limits:{inputTriangles:1}});assert.deepEqual([...lower.geometry.triangleResolution],[4,4]);assert.equal(lower.geometry.triangles.length,0);
  assert.throws(()=>compute(g,{limits:{inputTriangles:8193}}),/lower/);
});
test('depth exhaustion retains only qualified last-conforming leaves and explicit unresolved slots',()=>{
  const g=prepare({...quad(),conformingSurfaces:true}),r=compute(g,{maxDepth:0});
  assert.equal(r.complete,false);assert.deepEqual([...r.geometry.triangleResolution],[3,3]);assert.equal(r.geometry.triangles.length,0);assert.match(r.geometry.diagnostics.join(' '),/last conforming mesh/);
});
test('all actual tesseract fan triangles qualify fine capture without source/pose mutation',()=>{
  const f=native('tesseract'),before=JSON.stringify(f),r=compute(prepare({...f,conformingSurfaces:true}));
  assert.equal(f.triangles.length,48);assert.equal(r.complete,true);assert.equal(r.geometry.triangles.length/9,16464);assert.equal(JSON.stringify(f),before);
});
for(const [key,shrink,expected] of [['cell600',1,1200],['cell120',1,2160],['cell120',.6,4320]])test(`full ${key} shrink ${shrink} is registered without truncation and every visible slot has a truthful status`,()=>{
  const f=native(key,shrink),g=prepare({...f,conformingSurfaces:true}),r=compute(g,{tolerance:.032,limits:{triangles:12000}});
  assert.equal(f.triangles.length,expected);assert.equal(g.triangleCornerIds.length,expected*3);assert.ok(g.triangleCornerIds.every(id=>id!==NONE));
  assert.equal(r.geometry.triangleResolution.length,expected);assert.ok(r.geometry.triangleResolution.every(s=>s===1||s===2||s===3));assert.ok(r.geometry.triangles.length>0);assert.ok(r.geometry.triangles.length/9<=12000);
  assert.equal(r.unresolvedTriangles,[...r.geometry.triangleResolution].filter(s=>s===3).length);assert.equal(r.complete,false);
});
test('optional topology survives actual job envelopes and transferable ownership without detaching source input',()=>{
  const g=prepare({...quad(),conformingSurfaces:true}),quality={phase:'capture',tolerance:.004,poleEpsilon:.02,criterion:'adaptive-sampled-world-error',wholePrimitiveBound:false};
  const result=runStereographicWorkerJob({type:'geometry-job',version:1,jobId:1,token:2,generation:3,sourceKey:'native',frameKey:'pose',phase:'capture',quality,geometry:g});
  assert.equal(result.type,'geometry-result');assert.equal(result.complete,true);
  const transfer=stereographicWorkerTransferables(result),copy=structuredClone(result,{transfer});assert.ok(copy.geometry.normals.length);assert.equal(result.geometry.normals.byteLength,0);assert.equal(g.triangleCornerIds.length,6);
});
