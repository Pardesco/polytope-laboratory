import test from 'node:test';
import assert from 'node:assert/strict';
import {CatalogLoading,CATALOG_LOADING_LIMITS} from '../ui/catalog-loading.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({empty=false}={}){
  let project={documents:empty?[]:[{model:{name:'original'}}],active:0},exporting=false;const calls=[],publications=[],changes=[];
  const state=()=>project.documents[project.active];
  const loader=new CatalogLoading({getProject:()=>project,getState:state,isExporting:()=>exporting,
    read:(entry,{signal})=>new Promise((resolve,reject)=>calls.push({entry,signal,resolve,reject})),
    publish:(model,entry,options)=>{project.documents.push({model});if(options.activate)project.active=project.documents.length-1;publications.push({model,entry,...options});},
    onChange:()=>changes.push([...loader.pending.keys()])});
  return {loader,calls,publications,changes,state,get project(){return project;},replace:()=>{project={documents:[{model:{name:'replacement'}}],active:0};},export:value=>{exporting=value;}};
}
test('distinct out-of-order results each publish, with the latest request retaining focus and immutable entry keys',async()=>{
  const f=fixture(),entry={key:'cube',name:'Cube'},a=f.loader.open(entry),b=f.loader.open({key:'octahedron',name:'Octahedron'});entry.key='changed';await tick();
  assert.equal(f.calls[0].entry.key,'cube');f.calls[1].resolve({name:'Octahedron'});await b;f.calls[0].resolve({name:'Cube'});await a;
  assert.equal(f.project.documents.length,3);assert.equal(f.state().model.name,'Octahedron');assert.deepEqual(f.publications.map(p=>p.activate),[true,false]);assert.equal(f.loader.pending.size,0);
});
test('one native request and one document serve duplicate pending clicks; retry after completion starts another request',async()=>{
  const f=fixture(),a=f.loader.open({key:'cube'}),b=f.loader.open({key:'cube'});assert.strictEqual(a,b);await tick();assert.equal(f.calls.length,1);
  f.calls[0].resolve({name:'Cube'});await a;assert.equal(f.publications.length,1);
  const c=f.loader.open({key:'cube'});await tick();assert.equal(f.calls.length,2);f.calls[1].resolve({name:'Second cube'});await c;assert.equal(f.publications.length,2);
});
test('Cancel resolves promptly and signals native cancellation even if old IPC never settles; new same-key requests remain owned',async()=>{
  const f=fixture(),old=f.loader.open({key:'cube'});await tick();f.loader.cancel();assert.equal(await old,null);assert.equal(f.calls[0].signal.aborted,true);assert.equal(f.loader.pending.size,0);
  const retry=f.loader.open({key:'cube'});await tick();f.calls[0].resolve({name:'stale'});await tick();assert.equal(f.loader.pending.size,1);assert.equal(f.publications.length,0);
  f.calls[1].resolve({name:'current'});await retry;assert.equal(f.state().model.name,'current');
});
test('project replacement discards a completed native reply and sync aborts a still-pending read',async()=>{
  for(const sync of [false,true]){const f=fixture(),job=f.loader.open({key:'cube'});await tick();f.replace();if(sync){f.loader.sync();assert.equal(f.calls[0].signal.aborted,true);}
    f.calls[0].resolve({name:'late'});assert.equal(await job,null);assert.equal(f.publications.length,0);assert.equal(f.state().model.name,'replacement');}
});
test('an immediate same-key request in a replacement project cannot coalesce with the obsolete project request',async()=>{
  const f=fixture(),old=f.loader.open({key:'cube'});await tick();f.replace();const next=f.loader.open({key:'cube'});await tick();
  assert.notStrictEqual(old,next);assert.equal(await old,null);assert.equal(f.calls[0].signal.aborted,true);assert.equal(f.calls.length,2);
  f.calls[1].resolve({name:'new project cube'});await next;assert.equal(f.state().model.name,'new project cube');
});
test('export refuses initial loads, aborts pending work on sync and rejects stale publication even without sync',async()=>{
  const f=fixture();f.export(true);await assert.rejects(f.loader.open({key:'cube'}),/export/);assert.equal(f.calls.length,0);f.export(false);
  const a=f.loader.open({key:'cube'});await tick();f.export(true);f.loader.sync();assert.equal(await a,null);assert.equal(f.calls[0].signal.aborted,true);f.calls[0].resolve({name:'late'});
  f.export(false);const b=f.loader.open({key:'cube'});await tick();f.export(true);f.calls[1].resolve({name:'also late'});assert.equal(await b,null);assert.equal(f.publications.length,0);
});
test('manual navigation and changed history state preserve focus while an independent model still opens',async()=>{
  for(const change of [f=>f.loader.navigationChanged(),f=>{f.project.documents[0]={model:{name:'history result'}};}]){
    const f=fixture(),before=f.state(),job=f.loader.open({key:'cube'});await tick();change(f);f.calls[0].resolve({name:'Cube'});await job;
    assert.equal(f.publications[0].activate,false);assert.equal(f.project.active,0);assert.equal(f.project.documents.length,2);assert.equal(before.model.name,'original');}
});
test('the first result fills an initially empty workspace and the latest pending request can subsequently take focus',async()=>{
  for(const order of [[0,1],[1,0]]){const f=fixture({empty:true}),a=f.loader.open({key:'a'}),b=f.loader.open({key:'b'});await tick();
    f.calls[order[0]].resolve({name:order[0]?'B':'A'});await tick();assert.equal(f.project.documents.length,1);
    f.calls[order[1]].resolve({name:order[1]?'B':'A'});await Promise.all([a,b]);assert.equal(f.state().model.name,'B');}
});
test('bounded pending loads, document limits and invalid entries refuse before submitting native work',async()=>{
  const f=fixture(),jobs=Array.from({length:CATALOG_LOADING_LIMITS.pending},(_,i)=>f.loader.open({key:String(i)}));
  await assert.rejects(f.loader.open({key:'excess'}),/current model loads/);await tick();assert.equal(f.calls.length,CATALOG_LOADING_LIMITS.pending);f.loader.cancel();await Promise.all(jobs);
  f.project.documents=Array.from({length:100},()=>({model:{}}));await assert.rejects(f.loader.open({key:'cube'}),/100/);
  for(const entry of [null,{}, {key:1},{key:''},{key:'x'.repeat(4097)}])await assert.rejects(f.loader.open(entry),/catalog model/);
});
test('read errors release loading state; a failed earlier request does not remove a newer pending one',async()=>{
  const f=fixture(),bad=f.loader.open({key:'bad'}),ok=f.loader.open({key:'ok'});await tick();f.calls[0].reject(Error('Importer refused this geometry'));
  await assert.rejects(bad,/Importer refused/);assert.equal(f.loader.pending.size,1);f.calls[1].resolve({name:'valid'});await ok;assert.equal(f.state().model.name,'valid');
  const late=f.loader.open({key:'late'});await tick();f.loader.cancel();f.calls[2].reject(Error('late refusal'));assert.equal(await late,null);await tick();assert.equal(f.loader.pending.size,0);
});
