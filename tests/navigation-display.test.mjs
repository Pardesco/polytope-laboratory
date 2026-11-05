import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {navigationDisplayHarness,displayBuffers} from './helpers/navigation-display.mjs';
import {runStereographicWorkerJob,stereographicWorkerTransferables} from '../ui/stereographic-worker-geometry.mjs';

const source=await readFile(new URL('../ui/app.js',import.meta.url),'utf8');
const cases=JSON.parse(await readFile(new URL('./fixtures/element-content-native-cases.json',import.meta.url),'utf8'));
const state=(name='fourD',projection='orthographic')=>({model:structuredClone(cases[name].source),notes:'Navigation notes',view:{angles:[9,7,4,3,2,1],projection,faces:true,edges:true,vertices:true,sectionNormal:name==='fourD'?[0,0,0,1]:[0,0,1],sectionOffset:0,derivedMode:'section',elementAnnotations:{version:1,entries:[{kind:'face',index:0,text:{markup:'Caption'}}],assets:{}}}});
const contentPositions=f=>f.v.elementContentLayer?.group.children.filter(o=>o.isMesh).map(o=>Array.from(o.geometry.attributes.position.array));
const ids=(model,kind)=>kind==='vertex'?[0]:kind==='cell'?[...new Set(model.cells[0].flatMap(face=>model.faces[face]))]:model[{edge:'edges',face:'faces'}[kind]][0];

for(const name of ['net','fourD'])for(const projection of ['orthographic','perspective'])for(const kind of name==='net'?['vertex','edge','face']:['vertex','edge','face','cell'])test(`${name} ${projection}: saved ${kind} selection needs one complete display`,async()=>{
  const saved=state(name,projection);saved.view.entitySelection={kind,index:0};
  const plain=structuredClone(saved);delete plain.view.entitySelection;
  const f=navigationDisplayHarness(source,saved,{descriptor:cases[name].descriptor}),reference=navigationDisplayHarness(source,plain,{descriptor:cases[name].descriptor});
  try{
    f.scope.renderWorkspace();reference.scope.renderWorkspace();await f.settle();await reference.settle();
    reference.v.select(ids(plain.model,kind));
    assert.equal(f.counts.displays,1);assert.equal(f.counts.describes,1);assert.equal(f.counts.dirty,0);
    assert.deepEqual(displayBuffers(f.v),displayBuffers(reference.v));assert.deepEqual(contentPositions(f),contentPositions(reference));
    assert.equal(f.get('selection-kind').value,kind);assert.equal(Number(f.get('selection-id').value),0);
    const info=JSON.parse(f.get('selection-info').textContent);assert.equal(info.kind,kind);assert.deepEqual(info.vertices,ids(saved.model,kind));
    // Every construction sync performed by the full display sees the restored
    // selection rather than an input left over from the previous document.
    for(const item of f.counts.syncs.filter(item=>item.name==='perspectiveControls'||item.name==='facePlacementControls'))assert.equal(item.selection,kind);
    assert.equal(f.counts.errors.length,0);assert.equal(f.v.elementContentLayer.diagnostic,null);
  }finally{f.close();reference.close();}
});

for(const selection of [undefined,{kind:'face',index:-1},{kind:'face',index:.5},{kind:'cell',index:999},{kind:'unknown',index:0}])test(`missing/invalid saved selection remains empty: ${JSON.stringify(selection)}`,async()=>{
  const saved=state();saved.view.entitySelection=selection;
  const f=navigationDisplayHarness(source,saved,{descriptor:cases.fourD.descriptor});
  try{f.scope.renderWorkspace();await f.settle();assert.equal(f.counts.displays,1);assert.equal(f.v.selected.length,0);assert.equal(f.v.highlightGeometry.attributes.position.count,0);assert.equal(f.get('selection-kind').value,'vertex');assert.equal(f.counts.dirty,0);}finally{f.close();}
});

test('interactive selection still displays and verifies changed literal content',async()=>{
  const saved=state();saved.view.entitySelection={kind:'face',index:0};
  const f=navigationDisplayHarness(source,saved,{describe:async(_model,params)=>{
    const descriptor=structuredClone(cases.fourD.descriptor),markup=params.document.entries[0].text.markup;
    descriptor.entries[0].text.markup=markup;descriptor.entries[0].runs=[{...descriptor.entries[0].runs[0],text:markup}];return descriptor;
  }});
  try{
    f.scope.renderWorkspace();await f.settle();const descriptions=f.counts.describes;
    saved.view.elementAnnotations.entries[0].text.markup='Edited text';f.get('selection-kind').value='edge';f.get('selection-id').value='1';
    f.scope.selectEntity();await f.settle();assert.equal(f.counts.displays,2);assert.equal(f.counts.describes,descriptions+1);
    assert.equal(saved.view.entitySelection.kind,'edge');assert.equal(saved.view.entitySelection.index,1);assert.equal(f.counts.dirty,1);
    const highlight=Array.from(f.v.highlightGeometry.attributes.position.array);f.scope.viewportControls.canEdit=()=>false;f.scope.viewportControls.restoreSelectionInputs=()=>{};
    f.get('selection-id').value='2';f.scope.selectEntity();assert.equal(f.counts.displays,2);assert.deepEqual(Array.from(f.v.highlightGeometry.attributes.position.array),highlight);
  }finally{f.close();}
});

test('rapid navigation cannot publish a late annotation from the previous model',async()=>{
  const held=[],f=navigationDisplayHarness(source,state('net'),{describe:(model,params,options)=>new Promise(resolve=>held.push({model,params,options,resolve}))});
  try{
    f.scope.state().view.entitySelection={kind:'face',index:0};f.scope.renderWorkspace();await new Promise(resolve=>setImmediate(resolve));assert.equal(held.length,1);
    const next=state();next.view.entitySelection={kind:'cell',index:0};f.scope.doc().states.push(next);f.scope.doc().cursor=1;f.scope.renderWorkspace();
    await new Promise(resolve=>setImmediate(resolve));assert.equal(held.length,2);assert.equal(held[0].options.signal.aborted,true);
    held[1].resolve(cases.fourD.descriptor);held[0].resolve(cases.net.descriptor);await f.settle();
    assert.equal(f.counts.displays,2);assert.equal(f.v.model,next.model);assert.equal(f.counts.errors.length,0);
    assert.deepEqual(f.v.selected,ids(next.model,'cell'));assert.ok(contentPositions(f).length);assert.equal(f.v.elementContentLayer.diagnostic,null);
  }finally{f.close();}
});

test('restored highlight leaves actual source picking at the same screen point unchanged',async()=>{
  const saved=state();saved.view.pickKind='vertex';saved.view.entitySelection={kind:'cell',index:0};
  const plain=structuredClone(saved);delete plain.view.entitySelection;
  const f=navigationDisplayHarness(source,saved,{descriptor:cases.fourD.descriptor}),reference=navigationDisplayHarness(source,plain,{descriptor:cases.fourD.descriptor});
  try{
    f.scope.renderWorkspace();reference.scope.renderWorkspace();await f.settle();await reference.settle();
    const ndc=new THREE.Vector3(...f.v.projected[0].point).project(f.v.camera),x=(ndc.x+1)*450,y=(1-ndc.y)*450;
    const result=f.v.pickAt(x,y),expected=reference.v.pickAt(x,y);
    assert.ok(result.picked);assert.deepEqual(result,expected);assert.equal(result.picked.id,0);
    assert.equal(f.counts.displays,1);
  }finally{f.close();reference.close();}
});

class HeldWorker{
  constructor(){this.jobs=[];this.listeners=new Map();}
  addEventListener(type,fn){this.listeners.set(type,fn);}removeEventListener(type){this.listeners.delete(type);}
  postMessage(job,buffers){this.jobs.push(structuredClone(job,{transfer:buffers}));}
  reply(){const result=runStereographicWorkerJob(this.jobs.shift());assert.equal(result.type,'geometry-result',result.message);this.listeners.get('message')?.({data:structuredClone(result,{transfer:stereographicWorkerTransferables(result)})});}
  terminate(){this.jobs.length=0;}
}
async function drainWorker(f,worker){
  for(let i=0;i<20;i++){if(worker.jobs.length)worker.reply();await new Promise(resolve=>setImmediate(resolve));if(!worker.jobs.length&&!f.v.stereographicWorker.transport.pending.active)return;}
  assert.fail('Worker must finish');
}

test('asynchronous packed stereographic publication retains the restored highlight and pick ownership',async()=>{
  const saved=state('fourD','stereographic');saved.view.entitySelection={kind:'face',index:0};
  const plain=structuredClone(saved);delete plain.view.entitySelection;
  const workers=[new HeldWorker(),new HeldWorker()];
  const f=navigationDisplayHarness(source,saved,{descriptor:cases.fourD.descriptor,workerFactory:()=>workers[0]}),reference=navigationDisplayHarness(source,plain,{descriptor:cases.fourD.descriptor,workerFactory:()=>workers[1]});
  try{
    f.scope.renderWorkspace();reference.scope.renderWorkspace();await drainWorker(f,workers[0]);await drainWorker(reference,workers[1]);await f.settle();await reference.settle();
    reference.v.select(ids(plain.model,'face'));assert.equal(f.counts.displays,1);assert.deepEqual(displayBuffers(f.v),displayBuffers(reference.v));
    assert.ok(f.v.publishedPickState.packedDisplay);assert.ok(contentPositions(f).length);assert.deepEqual(contentPositions(f),contentPositions(reference));
  }finally{f.close();reference.close();}
});
