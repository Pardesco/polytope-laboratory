import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {computeStereographicWorkerGeometry as copied,prepareStereographicWorkerGeometry as prepare,runStereographicWorkerJob} from '../ui/stereographic-worker-geometry.mjs';
import {computeDenseStereographicPacket as frozenOracle} from '../development/dense-stereographic-packet.mjs';
import {conformingNativeFixture} from '../development/conforming-worker-fixtures.mjs';
import {StereographicWorkerCoordinator} from '../ui/stereographic-worker-protocol.mjs';
import {planStereographicQuality,stereographicSnapshotKeys} from '../ui/stereographic-quality.mjs';
function fixture(key='tesseract',shrink=1){
  const f=conformingNativeFixture(key,{scope:'all',shrink}),{center,radius}=f.recipe.normalization,input=prepare({model:f.model,normalized:f.model.vertices.map(p=>p.map((x,k)=>(x-center[k])/radius)),edges:f.model.edges,triangles:f.actualTriangles,angles:[9,0,24,0,18,0],visibility:{vertices:f.model.vertices.map(()=>0),edges:f.model.edges.map(()=>1),faces:f.model.faces.map(()=>1)},conformingSurfaces:true});
  return {...f,input};
}
class NodeBrowserWorker{
  constructor(){this.listeners=new Set();this.posts=0;this.node=new Worker(new URL('./stereographic-dense-worker-entry.mjs',import.meta.url));this.ready=new Promise((resolve,reject)=>{this.node.once('error',reject);this.node.on('message',data=>{if(data.type==='worker-ready')resolve();else for(const listener of this.listeners)listener({data});});});}
  addEventListener(type,listener){if(type==='message')this.listeners.add(listener);}
  removeEventListener(type,listener){if(type==='message')this.listeners.delete(listener);}
  postMessage(value,transfer){this.posts++;this.node.postMessage(value,transfer);}
  terminate(){return this.node.terminate();}
}
const quality=phase=>planStereographicQuality({phase,cameraProjection:'orthographic',cssHeight:900,orthographicHalfHeight:5,zoom:1});
function request(f,phase='capture',token=1){const keys=stereographicSnapshotKeys({modelId:f.model.id,sourceFingerprint:f.model.fingerprint},{angles:[9,0,24,0,18,0]});return {model:f.model,geometry:f.input,generation:1,token,phase,quality:quality(phase),...keys};}
for(const key of ['tesseract','cell600','cell120'])test(`copied actual ${key} worker/fallback bytes equal frozen direct packet oracle`,()=>{
  const f=fixture(key),before=JSON.stringify(f.model),options={tolerance:.004},actual=copied(f.input,options),expected=frozenOracle(f.input,options);
  for(const field of Object.keys(actual.geometry)){
    if(field==='diagnostics'){
      const normalize=notes=>notes.map(note=>note.startsWith('Stereographic conforming refinement stopped at ')?'Last conforming mesh stopped at '+note.slice('Stereographic conforming refinement stopped at '.length).replace('; last conforming mesh retained.','.'):note);
      assert.deepEqual(normalize(actual.geometry[field]),expected.geometry[field]);
    }else assert.deepEqual(actual.geometry[field],expected.geometry[field]);
  }
  for(const field of ['complete','exactPose','achievedTolerance','unresolvedEdges','omittedEdges','unresolvedTriangles','omittedTriangles','clippedSegments','clippedTriangles'])assert.equal(actual[field],expected[field]);
  const r=request(f),job=runStereographicWorkerJob({type:'geometry-job',version:1,jobId:1,...r});assert.equal(job.type,'geometry-result');assert.equal(job.frameKey,r.frameKey);assert.equal(job.sourceKey,r.sourceKey);assert.deepEqual(job.geometry.triangles,actual.geometry.triangles);assert.equal(JSON.stringify(f.model),before);
});
test('real transferred worker entry and unchanged coordinator capture publish complete current source only',async()=>{
  const f=fixture(),r=request(f),worker=new NodeBrowserWorker();await worker.ready;let owner={model:f.model,sourceKey:r.sourceKey,frameKey:r.frameKey,generation:1};const pubs=[];
  const coordinator=new StereographicWorkerCoordinator({worker,getOwner:()=>owner,publish:(p,guard)=>{assert.ok(guard.isCurrent());pubs.push(p);}});
  try{
    const result=await coordinator.capture(r);assert.ok(result.complete);assert.equal(pubs.length,1);assert.ok(result.geometry.triangles.byteLength>0);assert.ok(f.input.trianglePositions.byteLength>0);assert.ok(result.workerComputeMs===undefined||Number.isFinite(result.workerComputeMs));
    const pending=coordinator.capture({...r,token:2});owner={...owner,frameKey:'replacement-frame'};await assert.rejects(pending);assert.equal(pubs.length,1);
  }finally{coordinator.destroy();await worker.terminate();}
});
test('real dense worker partial result preserves buffers and rejects exact capture rather than resolving false completion',async()=>{
  const f=fixture('cell600'),r=request(f),worker=new NodeBrowserWorker();await worker.ready;const pubs=[],owner={model:f.model,sourceKey:r.sourceKey,frameKey:r.frameKey,generation:1},c=new StereographicWorkerCoordinator({worker,getOwner:()=>owner,publish:p=>pubs.push(p)});
  try{await assert.rejects(c.capture(r),/complete geometry/);assert.equal(pubs.length,0);assert.ok(f.input.positions.byteLength>0);}finally{c.destroy();await worker.terminate();}
});
test('validated routing rejects accessor topology without executing malicious getters',()=>{
  const f=fixture();let executed=false;const input={...f.input};Object.defineProperty(input,'triangleCornerIds',{get(){executed=true;throw Error('getter ran');},enumerable:true});assert.throws(()=>copied(input));assert.equal(executed,false);
});
