import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {MemoryControls} from '../ui/memory-controls.mjs';
import {TourControls} from '../ui/tour-controls.mjs';
import {NativeJobs} from '../ui/native-jobs.mjs';
import {createMemories,storeMemory,retrieveMemory} from '../ui/model-memories.mjs';
import {createTour,addTourEvent} from '../ui/tour.mjs';

const app=await readFile(new URL('../ui/app.js',import.meta.url),'utf8');
const restoreCode=app.slice(app.indexOf('async function restoreMemoryState('),app.indexOf('function createTourRenderer('));
const addCode=app.slice(app.indexOf('async function addMemoryStates('),app.indexOf('async function orientSelection('));
const snapshot=(name='Source')=>({model:{name,dimension:3,interpretation:'convex-polytope',vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],edges:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]],cells:[]},view:{angles:[0,0,0,0,0,0]},notes:'Keep notes'});
const drain=()=>new Promise(resolve=>setImmediate(resolve));

function fixture(){
  const source=snapshot(),stored=snapshot('Stored'),calls=[],canceled=[],publications=[];
  let id=0;
  const scope={project:{active:0,documents:[{id:'source-document',cursor:0,states:[source]}],memories:storeMemory(createMemories(),1,stored),tour:addTourEvent(createTour(),stored,2,'stored-event')},
    tourExporting:false,tourPreviewDocument:null,animation:{exporting:false},clone:structuredClone,
    uid:()=>`document-${++id}`,legacyDocumentView:()=>({projection:'orthographic'}),Error};
  scope.state=()=>scope.project.documents[scope.project.active]?.states[scope.project.documents[scope.project.active].cursor];
  scope.markDirty=()=>publications.push(structuredClone(scope.project));scope.renderWorkspace=()=>{};
  scope.addDocument=(model,label)=>{scope.project.documents.push({id:scope.uid(),cursor:0,states:[{model,view:{},label}]});scope.project.active=scope.project.documents.length-1;scope.markDirty();};
  const jobs=new NativeJobs({id:()=>`job-${++id}`,now:()=>0,start:()=>null,complete:()=>{},cancel:id=>canceled.push(id)});
  scope.run=(op,params,model,label,options)=>jobs.run(jobId=>new Promise((resolve,reject)=>calls.push({op,params,model,jobId,options,resolve,reject})),label,options);
  runInNewContext(restoreCode+addCode,scope);
  const controls=Object.assign(Object.create(MemoryControls.prototype),{busy:false,nodes:{slot:{value:'1'},source:{value:'base'}},sync(){}});
  controls.context={getProject:()=>scope.project,getState:scope.state,isExporting:()=>scope.animation.exporting||scope.tourExporting,
    getSource:()=>({documentId:'source-document'}),restoreState:scope.restoreMemoryState,addStates:scope.addMemoryStates,markDirty:scope.markDirty,setStatus(){}};
  const finish=(call=calls.at(-1))=>call.resolve(call.op==='validate-project'?structuredClone(call.params.project):snapshot('Compound').model);
  return {scope,controls,calls,canceled,publications,jobs,stored,source,finish};
}

for(const action of ['open','swap','add'])for(const exporter of ['animation','tour'])test(`${action} memory cannot publish after ${exporter} export starts during native work`,async()=>{
  const f=fixture(),before=f.scope.project.memories,pending=f.controls[action](1);
  await drain();assert.equal(f.calls.length,1);
  if(exporter==='animation')f.scope.animation.exporting=true;else f.scope.tourExporting=true;
  f.finish();await assert.rejects(pending,/animation export/);
  assert.equal(f.scope.project.documents.length,1);assert.equal(f.scope.state(),f.source);
  assert.equal(f.scope.project.memories,before);assert.equal(f.publications.length,0);assert.equal(f.controls.busy,false);
});

for(const action of ['open','swap','add'])test(`${action} memory rechecks document capacity after a background load`,async()=>{
  const f=fixture(),before=f.scope.project.memories,pending=f.controls[action](1);await drain();
  while(f.scope.project.documents.length<100)f.scope.project.documents.push({id:`background-${f.scope.project.documents.length}`,cursor:0,states:[snapshot('Background')]});
  f.finish();await assert.rejects(pending,/100 documents/);assert.equal(f.scope.project.documents.length,100);
  assert.equal(f.scope.state(),f.source);assert.equal(f.scope.project.memories,before);assert.equal(f.publications.length,0);
});

for(const action of ['swap','add'])test(`${action} memory rejects a changed bank before document publication`,async()=>{
  const f=fixture(),pending=f.controls[action](1);await drain();
  const changed=f.scope.project.memories=storeMemory(f.scope.project.memories,1,snapshot('Replacement'));
  f.finish();await assert.rejects(pending,/memories changed/);assert.equal(f.scope.project.documents.length,1);
  assert.equal(f.scope.project.memories,changed);assert.equal(f.publications.length,0);
});

for(const action of ['open','swap','add'])for(const change of ['project','document'])test(`${action} memory rejects ${change} replacement during native work`,async()=>{
  const f=fixture(),before=f.scope.project.memories,pending=f.controls[action](1);await drain();
  if(change==='project')f.scope.project={...f.scope.project,documents:[{id:'replacement',cursor:0,states:[snapshot('Replacement')]}]};
  else f.scope.project.documents[0].states[0]=snapshot('Replacement');
  f.finish();await assert.rejects(pending,/Source document changed/);assert.equal(f.scope.project.documents.length,1);
  assert.equal(f.scope.project.memories,before);assert.equal(f.publications.length,0);
});

test('actual memory swap commits document and slot before dirty/render observers and an export microtask',async()=>{
  const f=fixture(),before=structuredClone(f.source),mark=f.scope.markDirty;
  f.scope.markDirty=()=>{mark();queueMicrotask(()=>{f.scope.animation.exporting=true;});};
  const pending=f.controls.swap(1);await drain();f.finish();
  await pending;assert.equal(f.publications.length,1);assert.equal(f.scope.project.documents.length,2);
  assert.equal(f.scope.state().model.name,'Stored');assert.deepEqual(retrieveMemory(f.scope.project.memories,1),before);
  assert.equal(f.publications[0].documents[1].states[0].model.name,'Stored');
  assert.deepEqual(retrieveMemory(f.publications[0].memories,1),before);
});

test('memory validation failure preserves document and slot, and a later retry succeeds',async()=>{
  const f=fixture(),before=f.scope.project.memories,pending=f.controls.swap(1);await drain();f.calls[0].reject(Error('Independent validation failed'));
  await assert.rejects(pending,/Independent validation/);assert.equal(f.scope.project.memories,before);assert.equal(f.scope.project.documents.length,1);
  const retry=f.controls.swap(1);await drain();f.finish();await retry;assert.equal(f.scope.project.documents.length,2);assert.equal(f.publications.length,1);
});

for(const operation of ['restoreMemoryState','addMemoryStates'])test(`${operation} forwards cancellation and rejects an ignored late native result`,async()=>{
  const f=fixture(),controller=new AbortController();
  const pending=operation==='restoreMemoryState'?f.scope[operation](f.stored,'Restore',{signal:controller.signal}):f.scope[operation](f.source,f.stored,'Add',{signal:controller.signal});
  await drain();assert.equal(f.calls[0].options.signal,controller.signal);controller.abort();
  await assert.rejects(pending,{name:'AbortError'});assert.equal(f.canceled.length,1);assert.equal(f.jobs.pending.size,0);
  f.finish();await drain();assert.equal(f.scope.project.documents.length,1);assert.equal(f.publications.length,0);
});

function tourFixture(f){
  const controls=Object.assign(Object.create(TourControls.prototype),{context:{getProject:()=>f.scope.project,getState:f.scope.state,isExporting:()=>f.scope.animation.exporting||f.scope.tourExporting,
    showEvent:f.scope.showTourEvent,markDirty:f.scope.markDirty},generation:0,showing:false,playing:false,nodes:{play:{}},sync(){}});
  return {controls,sample:{event:f.scope.project.tour.events[0],index:0}};
}

test('pausing an actual tour event cancels NativeJobs promptly and ignores a late response',async()=>{
  const f=fixture(),t=tourFixture(f),pending=t.controls.show(t.sample,0,true);await drain();
  t.controls.pause();await assert.rejects(pending,{name:'AbortError'});assert.equal(f.canceled.length,1);
  assert.equal(t.controls.showing,false);assert.equal(f.jobs.pending.size,0);f.finish();await drain();
  assert.equal(f.scope.project.documents.length,1);assert.equal(f.publications.length,0);
});

for(const change of ['export','tour','navigation'])test(`tour event cannot publish after ${change} changes during validation`,async()=>{
  const f=fixture(),t=tourFixture(f),pending=t.controls.show(t.sample,0,true);await drain();
  if(change==='export')f.scope.animation.exporting=true;
  if(change==='tour')f.scope.project.tour=addTourEvent(f.scope.project.tour,snapshot('New'),2,'new');
  if(change==='navigation')f.scope.project.documents[0].states[0]=snapshot('Different');
  f.finish();if(change==='tour')await assert.rejects(pending,/Tour changed/);else await assert.rejects(pending,{name:'AbortError'});
  assert.equal(f.scope.project.documents.length,1);assert.equal(f.publications.length,0);assert.equal(t.controls.showing,false);
});

test('valid tour events reuse one preview document and keep complete validated state',async()=>{
  const f=fixture();
  for(let i=0;i<2;i++){
    const pending=f.scope.showTourEvent(f.stored,'Tour '+i,{isCurrent:()=>true});await drain();f.finish();await pending;
    assert.equal(f.scope.project.documents.length,2);assert.equal(f.scope.state().model.name,'Stored');
    assert.equal(f.scope.state().notes,f.stored.notes);
  }
  assert.equal(f.publications.length,2);
});

test('tour preview rechecks capacity without replacing a background document',async()=>{
  const f=fixture(),pending=f.scope.showTourEvent(f.stored,'Tour',{isCurrent:()=>true});await drain();
  while(f.scope.project.documents.length<100)f.scope.project.documents.push({id:`background-${f.scope.project.documents.length}`,cursor:0,states:[snapshot('Background')]});
  f.finish();await assert.rejects(pending,/Close a document/);assert.equal(f.scope.project.documents.length,100);
  assert.equal(f.scope.state(),f.source);assert.equal(f.publications.length,0);
});

test('an already canceled tour event starts no native work',async()=>{
  const f=fixture(),controller=new AbortController();controller.abort();
  await assert.rejects(f.scope.showTourEvent(f.stored,'Tour',{signal:controller.signal}),{name:'AbortError'});
  assert.equal(f.calls.length,0);assert.equal(f.jobs.pending.size,0);assert.equal(f.publications.length,0);
});

test('tour import cannot publish after another exporter starts during its chooser/read',async()=>{
  const f=fixture(),t=tourFixture(f),before=f.scope.project.tour;let release;
  t.controls.context.importTour=()=>new Promise(resolve=>{release=resolve;});
  const pending=t.controls.merge();f.scope.animation.exporting=true;release(addTourEvent(createTour(),snapshot('Imported'),2,'imported'));
  await assert.rejects(pending,/animation export/);assert.equal(f.scope.project.tour,before);
  assert.equal(f.publications.length,0);assert.equal(t.controls.busy,false);
});
