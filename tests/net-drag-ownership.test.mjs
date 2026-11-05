import test from 'node:test';
import assert from 'node:assert/strict';
import {NetEditor} from '../ui/net-editor.js';
import {numericControlFixture,deferred,flush} from './numeric-control-fixture.mjs';

function fixture(t){
  const previous=globalThis.DOMPoint;globalThis.DOMPoint=class{constructor(x,y){this.x=x;this.y=y;}matrixTransform(){return this;}};
  t.after(()=>{if(previous===undefined)delete globalThis.DOMPoint;else globalThis.DOMPoint=previous;});
  const f=numericControlFixture(Object.prototype,{}),state=f.state,nodes=new Map(),calls=[],attributes=new Map(),captures=new Set();
  state.model.fingerprint='drag-source';state.view.derivedMode='net';
  state.view.net={root:0,length:25,tabs:true,display:'layout',action:'move',component:0};
  state.netLayout={sourceId:state.model.id,sourceFingerprint:state.model.fingerprint,root:0,referenceEdgeLengthMm:25,tabs:true,
    printSource:{metadata:structuredClone(state.model.metadata)},hinges:[0,1],placements:[],components:[{root:0}]};
  const group={setAttribute:(key,value)=>attributes.set(key,value),removeAttribute:key=>attributes.delete(key)};
  const face={dataset:{component:'0'},closest:()=>group},edge={dataset:{netEdge:'2'}};
  const svg={getScreenCTM:()=>({inverse:()=>({})}),setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),
    releasePointerCapture:id=>{captures.delete(id);svg.onlostpointercapture?.({pointerId:id});}};
  const editor=Object.assign(Object.create(NetEditor.prototype),{context:f.context,getState:f.context.getState,getModel:()=>state.model,sequence:0,guard:fn=>fn,
    exports:{busy:false,run:async()=>{calls.push('export');return null;}},$:id=>{if(!nodes.has(id))nodes.set(id,{replaceChildren(){}});return nodes.get(id);},
    highlight(){},tabControls:{show(){}},markDirty:()=>calls.push('dirty'),activate(){},refresh:()=>calls.push('refresh'),setStatus(){},
    run:async(op,params)=>{calls.push([op,params]);return {...structuredClone(params.net),placements:[{root:0,translation:params.translation}]};}});
  editor.attach(svg);
  const event=(x=0,y=0,pointerId=7)=>({clientX:x,clientY:y,pointerId,preventDefault(){},target:{closest:selector=>selector==='[data-net-face]'?face:edge}});
  const start=()=>{svg.onpointerdown(event());svg.onpointermove(event(12,5));};
  return {...f,editor,svg,group,attributes,captures,calls,event,start};
}

test('failed native movement rolls back the preview before awaiting and retains the saved layout/history',async t=>{
  const f=fixture(t),gate=deferred(),before=structuredClone(f.state);f.editor.run=()=>gate.promise;
  f.start();assert.equal(f.attributes.get('transform'),'translate(12 5)');
  const pending=f.svg.onpointerup(f.event(12,5));assert.equal(f.attributes.has('transform'),false);assert.equal(f.captures.size,0);assert.equal(f.editor.drag,null);
  gate.reject(Error('Native movement refused'));await assert.rejects(pending,/refused/);
  assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);
});

test('successful drag publishes one native move and one reversible history entry',async t=>{
  const f=fixture(t);f.start();await f.svg.onpointerup(f.event(12,5));
  assert.equal(f.calls[0][0],'net-edit');assert.equal(f.calls[0][1].action,'move-component');assert.deepEqual(f.calls[0][1].translation,[12,5]);
  assert.deepEqual(f.state.netLayout.placements,[{root:0,translation:[12,5]}]);assert.equal(f.state.netHistory.cursor,0);assert.equal(f.state.netHistory.states.length,1);
  assert.equal(f.attributes.has('transform'),false);assert.equal(f.captures.size,0);
});

for(const change of ['layout','source','sequence','display','mode','action','scale','content','animation-export','net-export'])test(`a drag cannot edit after ${change} changes`,async t=>{
  const f=fixture(t);f.start();
  if(change==='layout')f.state.netLayout=structuredClone(f.state.netLayout);
  if(change==='source')f.state.model=structuredClone(f.state.model);
  if(change==='sequence')f.editor.sequence++;
  if(change==='display')f.state.view.net.display='pages';
  if(change==='mode')f.state.view.derivedMode='section';
  if(change==='action')f.state.view.net.action='edge';
  if(change==='scale')f.state.view.net.length=50;
  if(change==='content')f.state.view.elementAnnotations={entries:[]};
  if(change==='animation-export')f.setExport(true);
  if(change==='net-export')f.editor.exports.busy=true;
  const before=structuredClone(f.state);await f.svg.onpointerup(f.event(12,5));
  assert.deepEqual(f.calls,[]);assert.deepEqual(f.state,before);assert.equal(f.attributes.has('transform'),false);assert.equal(f.captures.size,0);
});

test('stale pointer motion rolls back immediately and cannot regain authority on pointerup',async t=>{
  const f=fixture(t);f.start();f.state.netLayout=structuredClone(f.state.netLayout);f.svg.onpointermove(f.event(25,30));
  assert.equal(f.attributes.has('transform'),false);assert.equal(f.editor.drag,null);await f.svg.onpointerup(f.event(25,30));assert.deepEqual(f.calls,[]);
});

test('another pointer cannot replace, move, release or cancel the active gesture',async t=>{
  const f=fixture(t);f.start();const drag=f.editor.drag;
  f.svg.onpointerdown(f.event(2,3,8));f.svg.onpointermove(f.event(99,99,8));f.svg.onpointercancel(f.event(0,0,8));await f.svg.onpointerup(f.event(0,0,8));
  assert.strictEqual(f.editor.drag,drag);assert.deepEqual(drag.delta,[12,5]);assert.deepEqual([...f.captures],[7]);
  await f.svg.onpointerup(f.event(12,5));assert.equal(f.calls.filter(c=>Array.isArray(c)).length,1);
});

for(const name of ['onpointercancel','onlostpointercapture'])test(`${name} rolls back without publishing`,t=>{
  const f=fixture(t);f.start();f.svg[name](f.event());assert.equal(f.attributes.has('transform'),false);assert.equal(f.editor.drag,null);assert.equal(f.captures.size,0);assert.deepEqual(f.calls,[]);
});

test('net export drops an uncommitted preview before reviewing output and blocks new pointer gestures',async t=>{
  const f=fixture(t);f.start();f.editor.exports.run=async()=>{assert.equal(f.attributes.has('transform'),false);assert.equal(f.captures.size,0);return null;};
  await f.editor.export('svg');assert.equal(f.editor.drag,null);assert.deepEqual(f.calls,[]);
  f.editor.exports.busy=true;f.svg.onpointerdown(f.event());assert.equal(f.editor.drag,null);assert.equal(f.captures.size,0);
});

test('an edit that becomes stale during native work cannot restore its provisional preview or publish',async t=>{
  const f=fixture(t),gate=deferred();f.editor.run=()=>gate.promise;f.start();const original=f.state.netLayout,pending=f.svg.onpointerup(f.event(12,5));await flush();
  f.state.netLayout=structuredClone(original);const replacement=f.state.netLayout;gate.resolve({...original,placements:[{root:0,translation:[12,5]}]});
  await assert.rejects(pending,/changed/);assert.strictEqual(f.state.netLayout,replacement);assert.equal(f.state.netHistory,undefined);assert.equal(f.attributes.has('transform'),false);
});

test('workspace synchronization cancels the gesture and releases pointer capture without saving a move',async t=>{
  const f=fixture(t);f.editor.colorPrinting={sync(){}};f.start();f.editor.sync();
  assert.equal(f.editor.drag,null);assert.equal(f.captures.size,0);assert.equal(f.attributes.has('transform'),false);
  await f.svg.onpointerup(f.event(12,5));assert.deepEqual(f.calls,[]);assert.equal(f.state.netHistory,undefined);
});

test('pointer motion does not serialize annotation payloads on every event',t=>{
  const f=fixture(t);f.start();const original=JSON.stringify;let serializations=0;
  try{
    JSON.stringify=function(...args){serializations++;return original.apply(this,args);};
    for(let i=0;i<100;i++)f.svg.onpointermove(f.event(i,i));
  }finally{JSON.stringify=original;f.editor.cancelDrag();}
  assert.equal(serializations,0);
});

for(const change of ['layout','source','sequence','surface'])test(`obsolete SVG ignores pointer start after ${change} replacement`,t=>{
  const f=fixture(t);
  if(change==='layout')f.state.netLayout=structuredClone(f.state.netLayout);
  if(change==='source')f.state.model=structuredClone(f.state.model);
  if(change==='sequence')f.editor.sequence++;
  if(change==='surface')f.editor.attach({...f.svg});
  f.svg.onpointerdown(f.event());assert.equal(f.editor.drag,undefined);assert.equal(f.captures.size,0);assert.deepEqual(f.calls,[]);
});
