import test from 'node:test';
import assert from 'node:assert/strict';
import {STEREOGRAPHIC_WORKER_LIMITS,StereographicWorkerCoordinator,validateStereographicInput,decodeStereographicOutput} from '../ui/stereographic-worker-protocol.mjs';
import {planStereographicQuality,stereographicSnapshotKeys,StereographicQualityCoordinator} from '../ui/stereographic-quality.mjs';

// Literal 4-simplex incidence, independent of the tessellator or transport.
function source(){return {id:'simplex',fingerprint:'a'.repeat(64),dimension:4,vertices:[[0,0,0,0],[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]],edges:[[0,1],[0,2],[0,3],[0,4],[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]],faces:[[0,1,2],[0,1,3],[0,1,4],[0,2,3],[0,2,4],[0,3,4],[1,2,3],[1,2,4],[1,3,4],[2,3,4]],cells:[[6,7,8,9],[3,4,5,9],[1,2,5,8],[0,2,4,7],[0,1,3,6]]};}
function input(){return {version:1,sourceCounts:{vertices:5,edges:10,faces:10,cells:5,triangles:1},positions:new Float64Array([0,0,0,0,1,0,0,0,0,1,0,0]),vertexIds:new Uint32Array([0,1,2]),vertexFaces:new Int32Array([0,0,0]),vertexCells:new Int32Array([4,4,4]),vertexVisible:new Uint8Array([1,1,1]),edges:new Uint32Array([0,1]),edgeIds:new Uint32Array([0]),edgeFaces:new Int32Array([0]),edgeCells:new Int32Array([4]),edgeVisible:new Uint8Array([1]),trianglePositions:new Float64Array([0,0,0,0,1,0,0,0,0,1,0,0]),faceIds:new Uint32Array([0]),cellIds:new Int32Array([4]),triangleIds:new Uint32Array([0]),triangleVisible:new Uint8Array([1])};}
function output(i=input()){
  const points=Array.from({length:i.vertexIds.length},(_,n)=>Array.from(i.positions.slice(n*4,n*4+3))).flat(),showEdge=Boolean(i.edgeVisible[0]),showFace=Boolean(i.triangleVisible[0]);
  return {version:1,positions:new Float32Array(points),vertexIds:i.vertexIds.slice(),vertexFaces:i.vertexFaces.slice(),vertexCells:i.vertexCells.slice(),vertexVisible:i.vertexVisible.slice(),segments:new Float32Array(showEdge?[0,0,0,1,0,0]:[]),edgeIds:new Uint32Array(showEdge?[i.edgeIds[0]]:[]),edgeFaces:new Int32Array(showEdge?[i.edgeFaces[0]]:[]),edgeCells:new Int32Array(showEdge?[i.edgeCells[0]]:[]),edgeInstanceIds:new Uint32Array(showEdge?[0]:[]),edgeResolution:new Uint8Array([showEdge?1:0]),triangles:new Float32Array(showFace?[0,0,0,1,0,0,0,1,0]:[]),normals:new Float32Array(showFace?[0,0,1,0,0,1,0,0,1]:[]),faceIds:new Uint32Array(showFace?[i.faceIds[0]]:[]),cellIds:new Int32Array(showFace?[i.cellIds[0]]:[]),triangleIds:new Uint32Array(showFace?[i.triangleIds[0]]:[]),triangleInstanceIds:new Uint32Array(showFace?[0]:[]),triangleResolution:new Uint8Array([showFace?1:0]),diagnostics:[]};
}
class Worker {
  constructor(){this.listeners=new Map();this.jobs=[];this.transfers=[];this.terminated=0;}
  addEventListener(type,fn){const list=this.listeners.get(type)??new Set();list.add(fn);this.listeners.set(type,list);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  postMessage(message,transfer){this.transfers.push(transfer);this.jobs.push(structuredClone(message,{transfer}));}
  terminate(){this.terminated++;}
  emit(type,data){for(const fn of this.listeners.get(type)??[])fn(type==='message'?{data}:data);}
  result(index=0,changes={}){const job=this.jobs[index],geometry=output(job.geometry);this.emit('message',{type:'geometry-result',version:1,jobId:job.jobId,token:job.token,generation:job.generation,sourceKey:job.sourceKey,frameKey:job.frameKey,phase:job.phase,complete:true,exactPose:true,achievedTolerance:job.quality.tolerance,unresolvedEdges:0,unresolvedTriangles:0,omittedEdges:0,omittedTriangles:0,geometry,...changes});return geometry;}
}
const observed=p=>p.then(value=>({value}),error=>({error}));
const tick=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
function setup(options={}){
  const model=source(),worker=new Worker(),keys=stereographicSnapshotKeys({modelId:model.id,sourceFingerprint:model.fingerprint},{angle:0}),owner={model,...keys,generation:0},published=[],timers=new Map();let ticket=0;
  const coordinator=new StereographicWorkerCoordinator({worker,getOwner:()=>owner,publish:(p,g)=>{assert.equal(g.isCurrent(),true);published.push(p);},setTimer:fn=>{timers.set(++ticket,fn);return ticket;},clearTimer:id=>timers.delete(id),...options});
  let token=0;function request(phase='interaction',pose=0,geometry=input()){const frame=stereographicSnapshotKeys({modelId:owner.model.id,sourceFingerprint:owner.model.fingerprint},{angle:pose});Object.assign(owner,frame);const q=planStereographicQuality({phase,cameraProjection:'orthographic',cssHeight:1000,orthographicHalfHeight:2,zoom:1});return {token:++token,...frame,generation:owner.generation,phase,quality:q,model:owner.model,geometry};}
  return {worker,model,owner,published,timers,coordinator,request};
}

test('input is a detached typed snapshot; real transfers never detach caller buffers',async()=>{
  const s=setup(),geometry=input(),before=structuredClone(geometry),promise=s.coordinator.request(s.request('idle',0,geometry));
  assert.deepEqual(geometry,before);assert.equal(geometry.positions.byteLength,96);assert.ok(s.worker.transfers[0].every(b=>b.byteLength===0));
  geometry.positions[0]=99;s.worker.result();const done=await promise;assert.equal(done.geometry.positions[0],0);assert.deepEqual(s.model,source());assert.equal(Object.isFrozen(s.model),false);s.coordinator.destroy();
});
test('descriptor rejects wrong typed classes, strides, finite values, source IDs and masks',()=>{
  const edits=[i=>i.positions=new Float32Array(i.positions),i=>i.positions=new Float64Array(5),i=>i.positions[0]=NaN,i=>i.positions[0]=Infinity,i=>i.positions[0]=1e10,i=>i.vertexIds[0]=5,i=>i.vertexCells[0]=5,i=>i.edgeFaces[0]=10,i=>i.edgeVisible[0]=2,i=>i.edges[0]=3,i=>i.trianglePositions=new Float64Array(11),i=>i.cellIds=new Int32Array(0),i=>i.version=2];
  for(const edit of edits){const i=input();edit(i);assert.throws(()=>validateStereographicInput(i),/Stereographic worker/);}
  assert.throws(()=>validateStereographicInput(input(),{bytes:64}),/byte cap/);assert.throws(()=>validateStereographicInput(input(),{vertices:2}),/integer bound/);assert.throws(()=>validateStereographicInput(input(),{bytes:STEREOGRAPHIC_WORKER_LIMITS.bytes+1}),/lower/);
});
test('shared typed buffers and accessor records cannot enter an owned snapshot',()=>{
  const i=input();i.positions=new Float64Array(new SharedArrayBuffer(96));assert.throws(()=>validateStereographicInput(i),/typed-buffer/);
  const getter=input();Object.defineProperty(getter,'positions',{get:()=>{throw Error('must not run');}});assert.throws(()=>validateStereographicInput(getter),/plain data/);
});
test('output validates all coordinate strides, byte caps, ownership and visibility',()=>{
  const i=validateStereographicInput(input()),edits=[o=>o.positions=new Float32Array(4),o=>o.normals=new Float32Array(0),o=>o.triangles[0]=Infinity,o=>o.edgeIds[0]=3,o=>o.edgeFaces[0]=1,o=>o.edgeCells[0]=0,o=>o.edgeInstanceIds[0]=1,o=>o.triangleInstanceIds[0]=1,o=>o.vertexIds[0]=1,o=>o.vertexFaces[0]=1,o=>o.triangleIds[0]=1,o=>o.diagnostics=['x'.repeat(513)],o=>o.edgeResolution=new Uint8Array(0)];
  for(const edit of edits){const o=output(i);edit(o);assert.throws(()=>decodeStereographicOutput(o,i),/Stereographic worker/);}
  assert.throws(()=>decodeStereographicOutput(output(i),i,{bytes:64}),/byte cap/);
  const masked=input();masked.edgeVisible[0]=0;assert.throws(()=>decodeStereographicOutput(output(i),masked),/masked/);masked.vertexVisible[0]=0;assert.throws(()=>decodeStereographicOutput(output(i),masked),/visibility/);
});
test('per-instance provenance distinguishes repeated explosion instances of the same source edge',()=>{
  const i=input();i.edges=new Uint32Array([0,1,0,1]);i.edgeIds=new Uint32Array([0,0]);i.edgeFaces=new Int32Array([0,1]);i.edgeCells=new Int32Array([4,4]);i.edgeVisible=new Uint8Array([1,1]);const validated=validateStereographicInput(i),o=output(i);o.edgeResolution=new Uint8Array([1,3]);o.diagnostics=['Second instance needs refinement.'];assert.doesNotThrow(()=>decodeStereographicOutput(o,validated));o.edgeInstanceIds[0]=1;assert.throws(()=>decodeStereographicOutput(o,validated),/ownership/);
});
test('input source endpoints, face membership, cell membership and source counts are verified before posting',async()=>{
  for(const edit of [i=>i.edgeIds[0]=1,i=>i.vertexFaces[2]=1,i=>i.vertexCells[0]=0,i=>i.cellIds[0]=0,i=>i.sourceCounts.edges=9]){const s=setup(),i=input();edit(i);const result=await observed(s.coordinator.request(s.request('idle',0,i)));assert.ok(result.error);assert.equal(s.worker.jobs.length,0);s.coordinator.destroy();}
});
test('100 superseded poses coalesce to one active computation and one latest queued computation',async()=>{
  const s=setup(),results=[];for(let n=0;n<100;n++)results.push(observed(s.coordinator.request(s.request('interaction',n))));assert.equal(s.worker.jobs.length,1);assert.equal(s.coordinator.pending.active,1);assert.equal(s.coordinator.pending.queued,100);
  s.worker.result(0);await tick();assert.equal(s.worker.jobs.length,2);assert.equal(s.worker.jobs[1].frameKey,'{"angle":99}');assert.equal(s.published.length,0);s.worker.result(1);const settled=await Promise.all(results);assert.equal(settled.filter(v=>v.error?.name==='AbortError').length,99);assert.equal(settled[99].value.frameKey,'{"angle":99}');assert.equal(s.published.length,1);s.coordinator.destroy();
});
test('unknown job, duplicate and delayed responses cannot publish or satisfy a newer capture',async()=>{
  const s=setup(),first=observed(s.coordinator.request(s.request('idle')));s.worker.emit('message',{jobId:999,positions:'not decoded'});assert.equal(s.published.length,0);s.worker.result();await first;
  const second=s.coordinator.capture(s.request('capture',1));s.worker.result(0);await tick();assert.equal(s.published.length,1);assert.equal(s.coordinator.pending.active,2);s.worker.result(1);const value=await second;assert.equal(value.frameKey,'{"angle":1}');assert.equal(s.published.length,2);s.coordinator.destroy();
});
test('capture resolves only after exact current fine geometry has actually been published',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve),s=setup({publish:async()=>gate}),promise=s.coordinator.capture(s.request('capture'));let resolved=false;promise.then(()=>resolved=true);s.worker.result();await tick();assert.equal(resolved,false);assert.equal(s.coordinator.pickingPublication,null);release();const value=await promise;assert.equal(value.phase,'capture');assert.equal(value.complete,true);assert.equal(s.coordinator.pickingPublication.jobId,value.jobId);s.coordinator.destroy();
});
test('capture rejects coarse tolerance, inexact pose, partial buffers and forged response ownership',async()=>{
  const edits=[{achievedTolerance:.01},{exactPose:false},{complete:false},{phase:'interaction'},{frameKey:'wrong'},{sourceKey:'wrong'},{token:99},{generation:99},{version:2}];
  for(const changes of edits){const s=setup(),p=observed(s.coordinator.capture(s.request('capture')));s.worker.result(0,changes);const done=await p;assert.ok(done.error);assert.equal(s.published.length,0);assert.equal(s.coordinator.pickingPublication,null);s.coordinator.destroy();}
  const s=setup();assert.ok((await observed(s.coordinator.capture(s.request('idle')))).error);assert.equal(s.worker.jobs.length,0);s.coordinator.destroy();
});
test('complete capture cannot silently omit an input primitive, even if its aggregate counters say zero',async()=>{
  const s=setup(),p=observed(s.coordinator.capture(s.request('capture'))),o=output();o.segments=new Float32Array(0);o.edgeIds=new Uint32Array(0);o.edgeFaces=new Int32Array(0);o.edgeCells=new Int32Array(0);o.edgeInstanceIds=new Uint32Array(0);s.worker.result(0,{geometry:o});assert.match((await p).error.message,/missing its geometry/);s.coordinator.destroy();
});
test('resolved algorithm clipping is complete but diagnosed; partial retained primitives cannot be captured',async()=>{
  const s=setup(),p=s.coordinator.capture(s.request('capture')),o=output();o.segments=new Float32Array(0);o.edgeIds=new Uint32Array(0);o.edgeFaces=new Int32Array(0);o.edgeCells=new Int32Array(0);o.edgeInstanceIds=new Uint32Array(0);o.edgeResolution[0]=2;o.diagnostics=['Edge fully outside the projection domain.'];s.worker.result(0,{geometry:o});assert.equal((await p).complete,true);s.coordinator.destroy();
  const t=setup(),partial=observed(t.coordinator.request(t.request('interaction'))),retained=output();retained.edgeResolution[0]=3;retained.diagnostics=['Edge subdivision cap reached; retained segments are partial.'];t.worker.result(0,{complete:false,unresolvedEdges:1,geometry:retained});assert.equal((await partial).value.complete,false);const capture=observed(t.coordinator.capture(t.request('capture',1)));t.worker.result(1,{complete:false,unresolvedEdges:1,geometry:retained});assert.match((await capture).error.message,/complete geometry/);t.coordinator.destroy();
});
test('primitive resolution counters must agree with the actual per-instance statuses',async()=>{
  const s=setup(),p=observed(s.coordinator.request(s.request('interaction'))),o=output();o.edgeResolution[0]=3;o.diagnostics=['Incomplete.'];s.worker.result(0,{complete:false,geometry:o});assert.match((await p).error.message,/completeness counters/);s.coordinator.destroy();
});
test('source object, fingerprint, model ID, pose and generation changes independently fence late results',async()=>{
  const edits=[s=>s.owner.model=structuredClone(s.model),s=>s.model.fingerprint='b'.repeat(64),s=>s.model.id='other',s=>s.owner.frameKey='new-pose',s=>s.owner.generation++];for(const edit of edits){const s=setup(),p=observed(s.coordinator.capture(s.request('capture')));edit(s);s.worker.result();assert.equal((await p).error.name,'AbortError');assert.equal(s.published.length,0);s.coordinator.destroy();}
});
test('source and frame keys are bounded; opaque source key must bind the real native identity',async()=>{
  const edits=[r=>r.sourceKey='not-the-source',r=>r.frameKey='x'.repeat(32769),r=>r.token=0,r=>r.generation=-1,r=>r.model.fingerprint=null,r=>r.quality={...r.quality,wholePrimitiveBound:true},r=>r.quality={...r.quality,tolerance:.1}];for(const edit of edits){const s=setup(),r=s.request();edit(r);assert.ok((await observed(s.coordinator.request(r))).error);assert.equal(s.worker.jobs.length,0);s.coordinator.destroy();}
});
test('original quality identity guard is honored without trusting worker-returned quality',async()=>{
  const model=source(),keys=stereographicSnapshotKeys({modelId:model.id,sourceFingerprint:model.fingerprint},{angle:0}),camera={cameraProjection:'orthographic',cssHeight:1000,orthographicHalfHeight:2};
  const quality=new StereographicQualityCoordinator(),s=setup({isCurrentRequest:r=>quality.isCurrent(r)});Object.assign(s.owner,{model,...keys});const q=quality.capture(keys,camera),p=observed(s.coordinator.capture({...q,model,generation:0,geometry:input()}));quality.capture(keys,camera);s.worker.result();assert.equal((await p).error.name,'AbortError');assert.equal(s.published.length,0);s.coordinator.destroy();quality.destroy();
});
test('capture refuses an unmet sampled pixel budget; perspective retains the explicit unavailable pixel bound',async()=>{
  const s=setup(),r=s.request('capture');r.quality=planStereographicQuality({phase:'capture',cameraProjection:'orthographic',cssHeight:1e12,orthographicHalfHeight:1e-12});assert.equal(r.quality.budgetSatisfied,false);assert.match((await observed(s.coordinator.capture(r))).error.message,/pixel criterion/);s.coordinator.destroy();
  const t=setup(),v=t.request('capture');v.quality=planStereographicQuality({phase:'capture',cameraProjection:'perspective',cssHeight:1000});const p=t.coordinator.capture(v);t.worker.result();assert.equal((await p).quality.pixelBound,'unavailable');assert.equal(t.coordinator.pickingPublication.quality.wholePrimitiveBound,false);t.coordinator.destroy();
});
test('last visible geometry owns picking while a new pose is queued; a new source invalidates picking',async()=>{
  const s=setup(),first=s.coordinator.request(s.request('idle',0));s.worker.result();const initial=await first;const later=observed(s.coordinator.request(s.request('interaction',1)));assert.equal(s.coordinator.pickingPublication.frameKey,initial.frameKey);s.owner.model=source();assert.equal(s.coordinator.pickingPublication,null);s.worker.result(1);assert.equal((await later).error.name,'AbortError');s.coordinator.destroy();
});
test('published arrays, returned arrays and picking snapshots are detached from one another',async()=>{
  const s=setup(),p=s.coordinator.request(s.request('idle'));const raw=s.worker.result(),value=await p;raw.positions[0]=100;s.published[0].geometry.vertexIds[0]=2;value.geometry.positions[0]=99;const pick=s.coordinator.pickingPublication;assert.equal(pick.geometry.positions[0],0);assert.equal(pick.geometry.vertexIds[0],0);pick.geometry.vertexIds[0]=2;assert.equal(s.coordinator.pickingPublication.geometry.vertexIds[0],0);s.coordinator.destroy();
});
test('cancel aborts promises and renderer guards but does not start a second computation before late reply',async()=>{
  let signal,release;const gate=new Promise(resolve=>release=resolve),s=setup({publish:async(_p,g)=>{signal=g.signal;await gate;assert.equal(g.isCurrent(),false);}}),p=observed(s.coordinator.request(s.request('idle')));s.worker.result();await tick();s.coordinator.cancel();assert.equal(signal.aborted,true);assert.equal((await p).error.name,'AbortError');const q=observed(s.coordinator.request(s.request('capture',1)));assert.equal(s.worker.jobs.length,1);release();await tick();assert.equal(s.worker.jobs.length,2);s.coordinator.cancel();assert.equal((await q).error.name,'AbortError');s.worker.result(1);await tick();assert.equal(s.coordinator.pickingPublication,null);s.coordinator.destroy();
});
test('asynchronous publication cannot overwrite newer source ownership after its awaited work',async()=>{
  let release,guard;const gate=new Promise(resolve=>release=resolve),s=setup({publish:async(_p,g)=>{guard=g;await gate;}}),p=observed(s.coordinator.request(s.request('idle')));s.worker.result();await tick();s.owner.generation++;release();assert.equal((await p).error.name,'AbortError');assert.equal(guard.isCurrent(),false);assert.equal(s.coordinator.pickingPublication,null);s.coordinator.destroy();
});
test('worker error rejects active and queued jobs, terminates transport, and prevents silent restart',async()=>{
  const s=setup(),first=observed(s.coordinator.request(s.request('idle'))),second=observed(s.coordinator.request(s.request('capture',1)));s.worker.emit('error',{message:'worker crashed'});assert.equal((await first).error.name,'AbortError');assert.match((await second).error.message,/worker crashed/);assert.equal(s.worker.terminated,1);assert.ok((await observed(s.coordinator.request(s.request('idle',2)))).error);assert.equal(s.worker.jobs.length,1);s.coordinator.destroy();
});
test('message decode failure and postMessage failure reject safely without publishing',async()=>{
  const s=setup(),p=observed(s.coordinator.request(s.request('idle')));s.worker.emit('messageerror',{});assert.match((await p).error.message,/transport failed/);s.coordinator.destroy();
  const worker=new Worker();worker.postMessage=()=>{throw Error('clone failed');};const t=setup({worker}),q=observed(t.coordinator.request(t.request('idle')));assert.match((await q).error.message,/clone failed/);assert.equal(worker.terminated,1);t.coordinator.destroy();
});
test('bounded timeout terminates a hung active worker and rejects the retained latest pose',async()=>{
  const s=setup(),first=observed(s.coordinator.request(s.request('idle'))),latest=observed(s.coordinator.request(s.request('capture',1)));assert.equal(s.timers.size,1);[...s.timers.values()][0]();assert.equal((await first).error.name,'AbortError');assert.match((await latest).error.message,/timed out/);assert.equal(s.worker.terminated,1);assert.deepEqual(s.coordinator.pending,{active:null,queued:null});s.coordinator.destroy();
});
test('destroy rejects all waits, drops picking, removes listeners and ignores future late messages',async()=>{
  const s=setup(),p=observed(s.coordinator.capture(s.request('capture')));s.coordinator.destroy();assert.equal((await p).error.name,'AbortError');assert.equal(s.worker.terminated,1);assert.equal(s.worker.listeners.get('message').size,0);s.worker.result();assert.equal(s.coordinator.pickingPublication,null);assert.match((await observed(s.coordinator.request(s.request()))).error.message,/destroyed/);s.coordinator.destroy();assert.equal(s.worker.terminated,1);
});
test('publication timeout also bounds an unresolved renderer callback and invalidates its late guard',async()=>{
  let release,guard;const gate=new Promise(resolve=>release=resolve),s=setup({publish:async(_p,g)=>{guard=g;await gate;}}),p=observed(s.coordinator.capture(s.request('capture')));s.worker.result();await tick();assert.equal(s.timers.size,1);[...s.timers.values()][0]();assert.match((await p).error.message,/timed out/);assert.equal(guard.signal.aborted,true);assert.equal(guard.isCurrent(),false);release();await tick();assert.equal(s.coordinator.pickingPublication,null);s.coordinator.destroy();
});
test('accessor response envelopes are rejected without executing their getters',async()=>{
  const s=setup(),p=observed(s.coordinator.capture(s.request('capture'))),bad={};let calls=0;Object.defineProperty(bad,'jobId',{get:()=>{calls++;return 1;}});s.worker.emit('message',bad);assert.match((await p).error.message,/plain data/);assert.equal(calls,0);assert.equal(s.published.length,0);s.coordinator.destroy();
});
test('renderer publication errors preserve previous picking and do not publish an unrendered result',async()=>{
  let rejectRender=false;const s=setup({publish:()=>{if(rejectRender)throw Error('GPU allocation failed.');}}),first=s.coordinator.request(s.request('idle'));s.worker.result();const previous=await first;rejectRender=true;const p=observed(s.coordinator.capture(s.request('capture',1)));s.worker.result(1);assert.match((await p).error.message,/GPU allocation/);assert.equal(s.coordinator.pickingPublication.jobId,previous.jobId);rejectRender=false;const next=s.coordinator.capture(s.request('capture',2));s.worker.result(2);assert.equal((await next).frameKey,'{"angle":2}');s.coordinator.destroy();
});
test('clipping metadata remains distinct from resolved primitive status and is bounded on publication',async()=>{
  const s=setup(),p=s.coordinator.capture(s.request('capture'));s.worker.result(0,{clippedSegments:7,clippedTriangles:13});const result=await p;assert.equal(result.clippedSegments,7);assert.equal(result.clippedTriangles,13);assert.equal(s.coordinator.pickingPublication.clippedSegments,7);s.coordinator.destroy();
  for(const changes of [{clippedSegments:-1},{clippedSegments:NaN},{clippedTriangles:.5},{clippedTriangles:Number.MAX_SAFE_INTEGER}]){const t=setup(),q=observed(t.coordinator.capture(t.request('capture')));t.worker.result(0,changes);assert.ok((await q).error);assert.equal(t.coordinator.pickingPublication,null);t.coordinator.destroy();}
  const t=setup(),q=t.coordinator.capture(t.request('capture'));t.worker.result();const omitted=await q;assert.equal(omitted.clippedSegments,0);assert.equal(omitted.clippedTriangles,0);t.coordinator.destroy();
});
test('opt-in interaction throughput publishes complete original poses while a faster producer keeps running',async()=>{
  const publications=[],s=setup({canPublishIntermediate:(original,latest)=>original.family===latest.family,publish:(p,g)=>{assert.equal(g.isCurrent(),true);assert.equal(g.signal.aborted,false);publications.push(p);}}),waits=[];let pose=0;
  for(let batch=0;batch<5;batch++){for(let n=0;n<4;n++){const request=s.request('interaction',pose++);request.family='same';waits.push(observed(s.coordinator.request(request)));}assert.equal(s.worker.jobs.length,batch+1);s.worker.result(batch);await tick();assert.equal(publications.length,batch+1);assert.equal(publications[batch].intermediate,true);assert.ok(JSON.parse(publications[batch].frameKey).angle<pose-1);assert.equal(s.coordinator.pending.queued,null);}
  assert.deepEqual(publications.map(p=>p.jobId),[1,4,8,12,16]);assert.deepEqual(publications.map(p=>JSON.parse(p.frameKey).angle),[0,3,7,11,15]);assert.equal(s.coordinator.pickingPublication.frameKey,'{"angle":15}');s.worker.result(5);const results=await Promise.all(waits);assert.equal(results.filter(v=>v.error?.name==='AbortError').length,19);assert.equal(results[19].value.intermediate,false);assert.equal(publications[5].frameKey,'{"angle":19}');s.coordinator.destroy();
});
test('intermediate opt-in still forbids retired fine/capture or an incompatible latest presentation',async()=>{
  for(const [firstPhase,nextPhase,family] of [['interaction','idle','same'],['interaction','capture','same'],['idle','interaction','same'],['capture','interaction','same'],['interaction','interaction','changed']]){const s=setup({canPublishIntermediate:(a,b)=>a.family===b.family}),a=s.request(firstPhase,0);a.family='same';const p=observed(s.coordinator.request(a)),b=s.request(nextPhase,1);b.family=family;const q=observed(s.coordinator.request(b));s.worker.result(0);await tick();assert.equal(s.published.length,0);assert.equal((await p).error.name,'AbortError');s.worker.result(1);assert.ok((await q).value);s.coordinator.destroy();}
});
test('intermediate opt-in never publishes undocumented partial geometry and does not satisfy capture',async()=>{
  const s=setup({canPublishIntermediate:()=>true}),p=observed(s.coordinator.request(s.request('interaction',0))),q=observed(s.coordinator.request(s.request('interaction',1)));s.worker.result(0,{complete:false});await tick();assert.equal(s.published.length,0);assert.equal((await p).error.name,'AbortError');const capture=observed(s.coordinator.capture(s.request('capture',2)));s.worker.result(1);await tick();assert.equal(s.published.length,0);assert.equal((await q).error.name,'AbortError');s.worker.result(2);assert.equal((await capture).value.intermediate,false);s.coordinator.destroy();
});
function diagnosedPartial(){
  const geometry=output();geometry.segments=new Float32Array([0,0,0,.5,0,0]);geometry.edgeResolution[0]=3;geometry.triangles=new Float32Array(0);geometry.normals=new Float32Array(0);geometry.faceIds=new Uint32Array(0);geometry.cellIds=new Int32Array(0);geometry.triangleIds=new Uint32Array(0);geometry.triangleInstanceIds=new Uint32Array(0);geometry.triangleResolution[0]=4;geometry.diagnostics=['Resource cap omitted one source patch; retained source-edge fragment is unresolved.'];
  return {complete:false,unresolvedEdges:1,omittedTriangles:1,geometry};
}
test('diagnosed partial interaction publishes coherent original-pose fragments while newer angles are queued',async()=>{
  const s=setup({canPublishIntermediate:()=>true}),pending=[];
  for(let batch=0;batch<3;batch++){for(let step=0;step<4;step++)pending.push(observed(s.coordinator.request(s.request('interaction',batch*4+step))));s.worker.result(batch,diagnosedPartial());await tick();const published=s.coordinator.pickingPublication;assert.equal(published.intermediate,true);assert.equal(published.complete,false);assert.equal(published.phase,'interaction');assert.equal(published.geometry.edgeIds[0],0);assert.equal(published.geometry.edgeInstanceIds[0],0);assert.equal(published.geometry.edgeFaces[0],0);assert.equal(published.geometry.edgeCells[0],4);assert.deepEqual([...published.geometry.segments],[0,0,0,.5,0,0]);assert.deepEqual([...published.geometry.edgeResolution],[3]);assert.deepEqual([...published.geometry.triangleResolution],[4]);assert.equal(published.geometry.triangles.length,0);assert.match(published.geometry.diagnostics[0],/cap omitted/);}
  assert.deepEqual(s.published.map(p=>JSON.parse(p.frameKey).angle),[0,3,7]);assert.deepEqual(s.published.map(p=>p.jobId),[1,4,8]);const capture=observed(s.coordinator.capture(s.request('capture',11)));s.worker.result(3,diagnosedPartial());await tick();assert.equal(s.published.length,3,'Queued exact capture fences every earlier interaction result.');s.worker.result(4,diagnosedPartial());assert.match((await capture).error.message,/complete geometry/);assert.equal(s.coordinator.pickingPublication.frameKey,'{"angle":7}');assert.equal((await Promise.all(pending)).every(p=>p.error?.name==='AbortError'),true);assert.deepEqual(s.model,source());s.coordinator.destroy();
});
test('partial intermediate requires truthful primitive counters, provenance and nonblank diagnostics',async()=>{
  const edits=[partial=>partial.unresolvedEdges=0,partial=>partial.omittedTriangles=0,partial=>partial.geometry.diagnostics=[],partial=>partial.geometry.diagnostics=[''],partial=>partial.geometry.diagnostics=['  '],partial=>partial.geometry.edgeIds[0]=1,partial=>partial.geometry.edgeInstanceIds[0]=1,partial=>partial.geometry.edgeResolution[0]=1,partial=>partial.geometry.triangleResolution[0]=1,partial=>partial.geometry.segments[0]=Infinity,partial=>partial.complete=true];
  for(const edit of edits){const s=setup({canPublishIntermediate:()=>true}),p=observed(s.coordinator.request(s.request('interaction',0))),q=observed(s.coordinator.request(s.request('interaction',1))),partial=diagnosedPartial();edit(partial);s.worker.result(0,partial);await tick();assert.equal(s.published.length,0);assert.equal(s.coordinator.pickingPublication,null);assert.equal((await p).error.name,'AbortError');s.worker.result(1);assert.ok((await q).value);s.coordinator.destroy();}
});
test('diagnosed partial intermediate still cannot cross source, family, idle or capture ownership',async()=>{
  for(const scenario of ['family','source','idle','capture']){const s=setup({canPublishIntermediate:(a,b)=>a.family===b.family}),a=s.request('interaction',0);a.family='original';const p=observed(s.coordinator.request(a));if(scenario==='source'){s.owner.model=structuredClone(s.model);s.owner.model.fingerprint='b'.repeat(64);}const b=s.request(scenario==='idle'?'idle':scenario==='capture'?'capture':'interaction',1);b.family=scenario==='family'?'changed':'original';const q=observed(s.coordinator.request(b));s.worker.result(0,diagnosedPartial());await tick();assert.equal(s.published.length,0);assert.equal((await p).error.name,'AbortError');s.worker.result(1);assert.ok((await q).value);s.coordinator.destroy();}
});
test('source mutation and stale original ownership remain fenced even when intermediate predicate always approves',async()=>{
  for(const edit of [s=>s.owner.model=structuredClone(s.model),s=>s.model.id='changed',s=>s.model.fingerprint='b'.repeat(64),s=>s.owner.sourceKey='different']){const s=setup({canPublishIntermediate:()=>true}),p=observed(s.coordinator.request(s.request('interaction',0))),q=observed(s.coordinator.request(s.request('interaction',1)));edit(s);s.worker.result(0);await tick();assert.equal(s.published.length,0);assert.equal((await p).error.name,'AbortError');if(s.worker.jobs.length>1)s.worker.result(1);assert.equal((await q).error.name,'AbortError');s.coordinator.destroy();}
});
test('capture or family changes abort an awaited intermediate renderer publication before committing ownership',async()=>{
  for(const latestPhase of ['capture','interaction']){let release,guard;const gate=new Promise(resolve=>release=resolve),s=setup({canPublishIntermediate:(a,b)=>a.family===b.family,publish:async(_p,g)=>{guard=g;await gate;}}),a=s.request('interaction',0);a.family='old';const p=observed(s.coordinator.request(a)),b=s.request('interaction',1);b.family='old';const q=observed(s.coordinator.request(b));s.worker.result(0);await tick();assert.equal(guard.isCurrent(),true);assert.equal(guard.signal.aborted,false);const c=s.request(latestPhase,2);c.family='new';const next=observed(s.coordinator.request(c));assert.equal(guard.isCurrent(),false);assert.equal(guard.signal.aborted,true);release();await tick();assert.equal(s.coordinator.pickingPublication,null);assert.equal((await p).error.name,'AbortError');assert.equal((await q).error.name,'AbortError');s.coordinator.cancel();assert.equal((await next).error.name,'AbortError');s.worker.result(1);await tick();s.coordinator.destroy();}
});
test('cancel aborts an intermediate publication despite its already rejected producer promise',async()=>{
  let release,guard;const gate=new Promise(resolve=>release=resolve),s=setup({canPublishIntermediate:()=>true,publish:async(_p,g)=>{guard=g;await gate;}}),p=observed(s.coordinator.request(s.request('interaction',0))),q=observed(s.coordinator.request(s.request('interaction',1)));s.worker.result(0);await tick();s.coordinator.cancel();assert.equal(guard.signal.aborted,true);assert.equal(guard.isCurrent(),false);release();await tick();assert.equal(s.coordinator.pickingPublication,null);assert.equal((await p).error.name,'AbortError');assert.equal((await q).error.name,'AbortError');s.coordinator.destroy();
});
test('cancelled fine capture preserves picking and can requeue the identical pose for idle and retry',async()=>{
  const s=setup(),first=s.coordinator.request(s.request('idle',0));s.worker.result(0);const displayed=await first,capture=observed(s.coordinator.capture(s.request('capture',0)));s.coordinator.cancel();assert.equal((await capture).error.name,'AbortError');assert.equal(s.coordinator.pickingPublication.jobId,displayed.jobId);
  const restored=s.coordinator.request(s.request('idle',0));assert.equal(s.worker.jobs.length,2,'Cancelled active computation keeps its slot until its genuine late reply.');assert.ok(s.coordinator.pending.queued);s.worker.result(1);await tick();assert.equal(s.published.length,1,'Cancelled result cannot overwrite preserved picking.');assert.equal(s.worker.jobs.length,3);s.worker.result(2);const fine=await restored;assert.equal(fine.phase,'idle');assert.equal(fine.frameKey,displayed.frameKey);assert.ok(fine.jobId>displayed.jobId);const retry=s.coordinator.capture(s.request('capture',0));s.worker.result(3);const exact=await retry;assert.equal(exact.phase,'capture');assert.equal(exact.complete,true);assert.equal(exact.intermediate,false);assert.equal(s.coordinator.pickingPublication.jobId,exact.jobId);s.coordinator.destroy();
});
