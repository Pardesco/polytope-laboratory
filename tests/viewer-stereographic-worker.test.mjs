import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {runStereographicWorkerJob,stereographicWorkerTransferables} from '../ui/stereographic-worker-geometry.mjs';
import {explosionGeometry,resolveExplosion} from '../ui/explosion.mjs';

const HASH='d'.repeat(64),tick=()=>new Promise(resolve=>setImmediate(resolve));
function source(){return {id:'literal-worker-sphere',dimension:4,embeddingDimension:4,interpretation:'generalized-complex',fingerprint:HASH,vertices:[[1,0,0,0],[-1,0,0,0],[0,1,0,0],[0,-1,0,0],[0,0,1,0],[0,0,-1,0],[0,0,0,1],[0,0,0,-1]],edges:[[0,2],[2,4],[4,0]],faces:[[0,2,4]],cells:[],metadata:{offColors:{faces:[{encoding:'byte',values:[200,100,50,128]}]}}};}
class HeldWorker{
  constructor(){this.listeners=new Map();this.jobs=[];this.terminated=false;}
  addEventListener(type,fn){this.listeners.set(type,fn);}
  removeEventListener(type){this.listeners.delete(type);}
  postMessage(job,buffers){this.jobs.push(structuredClone(job,{transfer:buffers}));}
  reply(transform=result=>result){const job=this.jobs.shift();assert.ok(job,'worker has queued a job');const result=transform(runStereographicWorkerJob(job));this.listeners.get('message')?.({data:structuredClone(result,{transfer:stereographicWorkerTransferables(result)})});return result;}
  terminate(){this.terminated=true;}
}
function viewer(model=source()){
  const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.setModel(model);
  v.cameraProjection='orthographic';v.orthographicHalfHeight=2;v.camera=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);v.orthographicCamera=v.camera;v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);v.camera.position.set(0,0,5);v.camera.lookAt(0,0,0);v.camera.updateMatrixWorld();
  v.controls={target:new THREE.Vector3(),update(){}};v.renderer={domElement:{getBoundingClientRect:()=>({width:400,height:400})},render(){}};
  const worker=new HeldWorker();v.stereographicWorkerFactory=()=>worker;let time=0,id=0;const timers=new Map();v.stereographicWorkerClock={now:()=>time,setTimer:(fn,delay)=>{timers.set(++id,{fn,deadline:time+delay});return id;},clearTimer:id=>timers.delete(id)};
  v.advance=ms=>{time+=ms;for(const [key,t] of [...timers])if(t.deadline<=time){timers.delete(key);t.fn();}};
  v.worker=worker;v.statuses=[];v.onDisplay=status=>v.statuses.push(status);v.picks=[];v.onPick=(...args)=>v.picks.push(args);return v;
}
const buffers=v=>Object.fromEntries(['pointGeometry','edgeGeometry','surfaceGeometry','highlightGeometry'].map(k=>[k,[...v[k].getAttribute('position').array]]));
async function drain(v){for(let n=0;n<10;n++){if(v.worker.jobs.length)v.worker.reply();await tick();if(!v.worker.jobs.length&&!v.stereographicWorker?.transport.pending.active)return;}assert.fail('worker did not drain');}
async function capture(v,options){const promise=v.prepareCapture(options);await drain(v);return promise;}

test('actual Viewer queues S3 without changing visible buffers, then publishes all geometry/styles/colors together',async()=>{
  const model=source(),before=JSON.stringify(model),v=viewer(model),previous=buffers(v),view={projection:'stereographic',faces:true,vertices:true,vertexStyle:'sphere',edgeStyle:'cylinder',surfaceColors:'source',surfaceOpacity:1,pickKind:'edge'};
  const pending=v.setDisplay(view);assert.equal(pending.stereographicPending,true);assert.equal(v.worker.jobs.length,1);assert.deepEqual(buffers(v),previous);assert.equal(v.stereographicGeometry,null);
  v.worker.reply();await tick();assert.ok(v.stereographicGeometry.edges.length>3);assert.ok(v.renderTriangles.length>10);assert.equal(v.vertexSpheres.count,7);assert.equal(v.edgeCylinders.count,v.stereographicGeometry.edges.length);
  assert.equal(v.surface.material.transparent,true);assert.equal(v.surface.material.depthWrite,false);assert.ok(Math.abs(v.surfaceGeometry.getAttribute('color').array[3]-128/255)<1e-7);assert.equal(v.statuses.at(-1).stereographicPending,false);assert.equal(v.statuses.at(-1).stereographicQuality.phase,'interaction');assert.equal(JSON.stringify(model),before);v.clear();
});

test('pending new rotations preserve published picks/highlights and late superseded worker replies cannot mix poses',async()=>{
  const v=viewer();v.setDisplay({projection:'stereographic',vertices:true,pickKind:'edge'});await drain(v);v.select([0]);const previous=buffers(v),published=v.publishedPickState;
  const mid=Math.SQRT1_2;assert.equal(v.pickAt(200+100*mid,200-100*mid).picked.id,0);
  v.setDisplay({projection:'stereographic',angles:[90,0,0,0,0,0],vertices:true,pickKind:'edge'});assert.deepEqual(buffers(v),previous);assert.equal(v.publishedPickState,published);assert.equal(v.pickAt(200+100*mid,200-100*mid).picked.id,0);
  v.setDisplay({projection:'stereographic',angles:[180,0,0,0,0,0],vertices:true,pickKind:'edge'});assert.equal(v.worker.jobs.length,1);v.worker.reply();await tick();assert.equal(v.publishedPickState.view.angles[0],90);assert.equal(v.view.angles[0],180);assert.equal(v.worker.jobs.length,1);assert.equal(v.statuses.at(-1).stereographicPending,true);
  v.worker.reply();await tick();assert.notDeepEqual([...v.edgeGeometry.getAttribute('position').array],previous.edgeGeometry);assert.equal(v.publishedPickState.view.angles[0],180);assert.equal(v.pickAt(200+100*mid,200-100*mid).picked,null);assert.equal(v.pickAt(200-100*mid,200+100*mid).picked.id,0);assert.ok(Math.abs(v.highlightGeometry.getAttribute('position').array[0]+1)<1e-6);v.clear();
});

test('16ms spin producer and 35ms worker publish moving coherent intermediate frames with a bounded queue',async()=>{
  const v=viewer(),show=angle=>v.setDisplay({projection:'stereographic',angles:[angle,0,0,0,0,0],vertices:true,pickKind:'edge'}),angles=[];
  v.select([0]);show(0);
  for(const [first,second] of [[5,10],[15,20],[25,30]]){
    v.advance(16);show(first);v.advance(16);show(second);assert.equal(v.worker.jobs.length,1);assert.ok(v.stereographicWorker.transport.pending.queued);
    v.advance(3);v.worker.reply();await tick();const angle=v.publishedPickState.view.angles[0];angles.push(angle);assert.equal(v.view.angles[0],second);assert.equal(v.statuses.at(-1).stereographicPending,true);
    const points=v.pointGeometry.getAttribute('position').array,highlight=v.highlightGeometry.getAttribute('position').array,edges=v.edgeGeometry.getAttribute('position').array;
    assert.ok(Math.abs(points[0]-Math.cos(angle*Math.PI/180))<1e-6);assert.ok(Math.abs(points[1]-Math.sin(angle*Math.PI/180))<1e-6);assert.deepEqual([...highlight],[...points.slice(0,3)]);assert.deepEqual([...edges.slice(0,3)],[...points.slice(0,3)]);
    const phi=(45+angle)*Math.PI/180;assert.equal(v.pickAt(200+100*Math.cos(phi),200-100*Math.sin(phi)).picked.id,0);assert.ok(v.stereographicWorker.snapshotsByToken.size<=2);
  }
  assert.deepEqual(angles,[0,10,20]);v.advance(120);await drain(v);assert.equal(v.publishedPickState.view.angles[0],30);assert.equal(v.statuses.at(-1).stereographicQuality.phase,'idle');assert.equal(v.statuses.at(-1).stereographicPending,false);v.clear();
});

test('a new primitive-style family forbids an obsolete interaction frame from replacing visible geometry',async()=>{
  const v=viewer(),previous=buffers(v);v.setDisplay({projection:'stereographic',angles:[0,0,0,0,0,0],vertices:true,vertexStyle:'point'});v.setDisplay({projection:'stereographic',angles:[10,0,0,0,0,0],vertices:true,vertexStyle:'sphere'});
  v.worker.reply();await tick();assert.deepEqual(buffers(v),previous);assert.equal(v.vertexSpheres,null);await drain(v);assert.equal(v.publishedPickState.view.vertexStyle,'sphere');assert.equal(v.vertexSpheres.count,7);v.clear();
});

test('idle refinement uses pixel-derived fine quality and updates normals from the same publication',async()=>{
  const v=viewer();v.setDisplay({projection:'stereographic'});await drain(v);const coarse=v.renderTriangles.length;v.advance(120);assert.equal(v.worker.jobs.length,1);assert.equal(v.worker.jobs[0].phase,'idle');assert.ok(v.worker.jobs[0].quality.tolerance<=.004);await drain(v);
  assert.ok(v.renderTriangles.length>coarse);assert.equal(v.surfaceGeometry.getAttribute('normal').count,v.surfaceGeometry.getAttribute('position').count);assert.equal(v.statuses.at(-1).stereographicQuality.phase,'idle');v.clear();
});

test('unchanged already-published pose does not report a phantom pending job or alter its visible fitting cloud',async()=>{
  const v=viewer(),view={projection:'stereographic',vertices:true};v.setDisplay(view);await drain(v);v.advance(120);await drain(v);const previous=buffers(v),cloud=v.observationCloud();
  const status=v.setDisplay(view);assert.equal(status.stereographicPending,false);assert.equal(v.worker.jobs.length,0);assert.deepEqual(buffers(v),previous);assert.deepEqual(v.observationCloud(),cloud);v.clear();
});

test('capture supersedes coarse interaction, awaits exact fine buffers and rejects owner changes',async()=>{
  const v=viewer();v.setDisplay({projection:'stereographic',vertices:true});const capturing=v.prepareCapture();let done=false;capturing.then(()=>{done=true;});await tick();assert.equal(done,false);v.worker.reply();await tick();assert.equal(done,false);assert.equal(v.worker.jobs[0].phase,'capture');v.worker.reply();await tick();const result=await capturing;
  assert.equal(result.complete,true);assert.equal(result.quality.phase,'capture');assert.equal(v.stereographicWorker.transport.pickingPublication.phase,'capture');
  let current=true;const stale=v.prepareCapture({isCurrent:()=>current});const rejected=assert.rejects(stale,error=>error.name==='AbortError');current=false;await drain(v);await rejected;v.clear();
});

test('aborted capture rejects promptly and cannot publish pending buffers',async()=>{
  const v=viewer();v.setDisplay({projection:'stereographic'});await drain(v);const previous=buffers(v),controller=new AbortController(),promise=v.prepareCapture({signal:controller.signal}),rejected=assert.rejects(promise,/Cancelled|current|cancel/i);controller.abort();await rejected;await drain(v);assert.deepEqual(buffers(v),previous);v.clear();
});

test('aborted fine capture at the restored identical pose restarts idle refinement and allows a fresh capture retry',async()=>{
  const v=viewer(),view={projection:'stereographic',vertices:true,pickKind:'edge'};v.setDisplay(view);await drain(v);v.advance(120);await drain(v);
  const previous=buffers(v),published=v.publishedPickState,controller=new AbortController(),promise=v.prepareCapture({signal:controller.signal}),rejected=assert.rejects(promise,error=>error.name==='AbortError');
  assert.equal(v.worker.jobs[0].phase,'capture');const cancelledToken=v.worker.jobs[0].token;controller.abort();await rejected;
  const pending=v.setDisplay(view);assert.equal(pending.stereographicPending,true);assert.deepEqual(buffers(v),previous);assert.equal(v.publishedPickState,published);assert.equal(v.stereographicWorker.quality.request.phase,'interaction');assert.ok(v.stereographicWorker.quality.request.token>cancelledToken);
  // The held cancelled result cannot publish, but releases the bounded queue.
  v.worker.reply();await tick();assert.deepEqual(buffers(v),previous);assert.equal(v.worker.jobs[0].phase,'interaction');await drain(v);v.advance(120);await drain(v);
  assert.equal(v.statuses.at(-1).stereographicPending,false);assert.equal(v.statuses.at(-1).stereographicQuality.phase,'idle');assert.equal(v.stereographicWorker.transport.pickingPublication.phase,'idle');
  const result=await capture(v);assert.equal(result.complete,true);assert.equal(result.quality.phase,'capture');assert.equal(v.stereographicWorker.transport.pickingPublication.phase,'capture');v.clear();
});

test('in-place desired angle edits during a worker wait invalidate publication without needing a redraw call',async()=>{
  const v=viewer(),view={projection:'stereographic',angles:[0,0,0,0,0,0]};v.setDisplay(view);const previous=buffers(v),capture=v.prepareCapture(),rejected=assert.rejects(capture,error=>error.name==='AbortError');
  view.angles[0]=90;await drain(v);await rejected;assert.deepEqual(buffers(v),previous);assert.equal(v.stereographicGeometry,null);v.clear();
});

test('source switch destroys old worker ownership and never installs old source triangles or picking IDs',async()=>{
  const v=viewer(),oldWorker=v.worker;v.setDisplay({projection:'stereographic'});const other=source();other.id='other';other.fingerprint='e'.repeat(64);v.setModel(other);const baseline=buffers(v);assert.equal(oldWorker.terminated,true);assert.equal(v.stereographicWorker,null);oldWorker.reply();await tick();assert.deepEqual(buffers(v),baseline);assert.equal(v.model,other);assert.equal(v.publishedPickState.renderTriangles,null);v.clear();
});

test('return to ordinary perspective cancels S3 publication and keeps existing near clipping path',async()=>{
  const v=viewer();v.setDisplay({projection:'stereographic'});const status=v.setDisplay({projection:'perspective',perspectiveDistance4D:.6,perspectiveNear4D:.08});const baseline=buffers(v);assert.equal(status.perspectiveCounts.distance,.6);assert.equal(v.stereographicGeometry,null);v.worker.reply();await tick();assert.deepEqual(buffers(v),baseline);assert.equal(v.view.projection,'perspective');v.clear();
});

test('zoom/resize changes quality generation, draw stays nonblocking, observer changes invalidate an awaited capture',async()=>{
  const v=viewer();v.setDisplay({projection:'stereographic'});await drain(v);const oldTolerance=v.statuses.at(-1).stereographicQuality.tolerance;v.camera.zoom=2;const previous=buffers(v);v.draw();assert.equal(v.worker.jobs.length,1);assert.ok(v.worker.jobs[0].quality.tolerance<oldTolerance);assert.deepEqual(buffers(v),previous);await drain(v);
  const promise=v.prepareCapture(),rejected=assert.rejects(promise,/pose changed/);v.camera.position.x=1;await drain(v);await rejected;v.clear();
});

test('partial worker result can display diagnosed geometry but exact capture refuses it',async()=>{
  const v=viewer();v.setDisplay({projection:'stereographic'});v.worker.reply(result=>{const g=result.geometry;g.edgeResolution[0]=3;result.unresolvedEdges=1;result.complete=false;g.diagnostics=[...g.diagnostics,'Fixture subdivision bound omitted unresolved portions.'];return result;});await tick();assert.match(v.stereographicDiagnostic,/Fixture/);assert.ok(v.stereographicGeometry.edges.length);
  const promise=v.prepareCapture(),rejected=assert.rejects(promise,/complete geometry/);v.worker.reply(result=>{result.geometry.edgeResolution[0]=3;result.unresolvedEdges=1;result.complete=false;result.geometry.diagnostics=[...result.geometry.diagnostics,'Fixture subdivision bound.'];return result;});await tick();await rejected;v.clear();
});

test('missing Worker uses diagnosed synchronous S3, and synchronous capture still refuses undefined radial images',async()=>{
  const v=viewer();v.stereographicWorkerFactory=()=>null;const status=v.setDisplay({projection:'stereographic'});assert.match(status.stereographicDiagnostic,/worker unavailable/i);assert.ok(v.renderTriangles.length>10);const result=await v.prepareCapture();assert.equal(result.complete,true);assert.equal(result.quality.phase,'capture');
  const malformed=source();malformed.edges.push([0,1]);v.setModel(malformed);v.setDisplay({projection:'stereographic'});await assert.rejects(v.prepareCapture(),/complete stereographic/);v.clear();
});

function tesseract(){
  const vertices=Array.from({length:16},(_,v)=>Array.from({length:4},(_,a)=>v>>a&1?1:-1)),edges=[],faces=[],cells=[];
  for(let v=0;v<16;v++)for(let a=0;a<4;a++)if(!(v>>a&1))edges.push([v,v|1<<a]);
  for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)for(let v=0;v<16;v++)if(!(v>>a&1)&&!(v>>b&1))faces.push([v,v|1<<a,v|1<<a|1<<b,v|1<<b]);
  for(let a=0;a<4;a++)for(const sign of [-1,1])cells.push(faces.flatMap((f,id)=>f.every(v=>vertices[v][a]===sign)?[id]:[]));
  return {id:'tesseract',fingerprint:HASH,dimension:4,embeddingDimension:4,interpretation:'convex-polytope',vertices,edges,faces,cells};
}

test('actual nonzero 4D explosion/shrink/styles and isolated cell preserve repeated source instance ownership',async()=>{
  const model=tesseract(),v=viewer(model),pose=explosionGeometry(resolveExplosion(model,{direction:'radial'}),.2),view={projection:'stereographic',isolatedCell:0,cellShrink:.6,vertices:true,vertexStyle:'sphere',edgeStyle:'cylinder',pickKind:'cell'},before=JSON.stringify({model,pose,view});
  assert.equal(v.setExplosion(pose).applied,true);v.setDisplay(view);await drain(v);const g=v.stereographicWorker.transport.pickingPublication.geometry;
  assert.ok(g.cellIds.length>0);assert.ok([...g.cellIds].every(id=>id===0));assert.ok([...g.edgeCells].every(id=>id===0));assert.equal(new Set(g.vertexIds.filter((id,i)=>g.vertexVisible[i])).size,8);assert.equal(v.vertexSpheres.count,8);assert.ok(v.edgeCylinders.count>12);
  assert.equal(v.publishedPickState.explosionDisplay.sourceModel,model);assert.equal(v.effectiveCellShrink,.6);assert.equal(v.projected.length,16);assert.equal(v.instanceProjected.length,64);assert.equal(JSON.stringify({model,pose,view}),before);
  const cloud=v.observationCloud();v.setDisplay(view);assert.deepEqual(v.observationCloud(),cloud);assert.equal(v.worker.jobs.length,0);
  const result=await capture(v);assert.equal(result.complete,true);assert.equal(result.quality.phase,'capture');v.clear();
});
