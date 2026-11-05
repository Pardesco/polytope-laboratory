import test from 'node:test';
import assert from 'node:assert/strict';
import {NetEditor} from '../ui/net-editor.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t){
  const previous=globalThis.document;globalThis.document={createElement:()=>({value:'',textContent:''})};t.after(()=>{globalThis.document=previous;});
  const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',dataset:{},classList:{toggle(){}},replaceChildren(){},append(){}});return nodes.get(id);};
  let state={model:{id:'source',fingerprint:'source-fp'},view:{derivedMode:'net',net:{root:0,length:25,tabs:false,component:0,display:'fold',fraction:0}}};
  const status=[],pending=[],viewer={net:null,model:null,elementContentDiagnostic:null,setNet(net){this.net=net;this.model={id:net.id};},setFold(){},setDisplay(){},restoreCamera(){},clear(){this.net=null;this.model=null;}};
  const editor=Object.assign(Object.create(NetEditor.prototype),{sequence:0,getState:()=>state,$:get,viewer,playing:false,tabControls:{show(){}},updateActions(){},
    context:{renderElementContent:()=>{const work=deferred();pending.push(work);return work.promise;}},setStatus:message=>status.push(message)});
  const net=id=>({id,root:0,faces:[{}],components:[{root:0,faces:[0]}],hinges:[],referenceEdgeLengthMm:25,tabs:false,overlapPairs:[],tabOverlapPairs:[],foldValidation:{maxEndpointErrorMm:0,toleranceMm:1e-6}});
  return {editor,viewer,status,pending,net,get,get state(){return state;},set state(next){state=next;}};
}

test('only the latest fold content failure may update diagnostic/status',async t=>{
  const f=fixture(t);f.editor.show(f.net('old'));f.editor.show(f.net('new'));
  f.pending[0].reject(Error('Old PNG'));await flush();assert.deepEqual(f.status,[]);assert.equal(f.viewer.elementContentDiagnostic,null);
  f.pending[1].reject(Error('Current PNG'));await flush();assert.deepEqual(f.status,['Current PNG']);assert.equal(f.viewer.elementContentDiagnostic,'Current PNG');
});

for(const change of ['same-net-show','state','source-model','viewer-model','viewer-net','mode','display','cancel-sequence'])test(`late fold diagnostics are ignored after ${change}`,async t=>{
  const f=fixture(t),net=f.net('same');f.editor.show(net);
  if(change==='same-net-show'){f.editor.show(net);f.pending[1].resolve({ready:true});}
  if(change==='state')f.state={...f.state,view:{...f.state.view}};
  if(change==='source-model')f.state.model={...f.state.model,id:'new-source'};
  if(change==='viewer-model')f.viewer.model={id:'new-view'};
  if(change==='viewer-net')f.viewer.net={...net};
  if(change==='mode')f.state.view.derivedMode='section';
  if(change==='display')f.state.view.net.display='layout';
  if(change==='cancel-sequence')f.editor.sequence++;
  f.pending[0].reject(Error('Stale decode failure'));await flush();assert.deepEqual(f.status,[]);assert.equal(f.viewer.elementContentDiagnostic,null);
});

test('canceled fold content stays silent and successful content is unchanged',async t=>{
  const f=fixture(t);f.editor.show(f.net('one'));f.pending[0].reject(Object.assign(Error('Canceled'),{name:'AbortError'}));await flush();
  assert.deepEqual(f.status,[]);assert.equal(f.viewer.elementContentDiagnostic,null);
  f.editor.show(f.net('two'));f.pending[1].resolve({ready:true});await f.editor.contentReady;
  assert.equal(f.viewer.net.id,'two');assert.deepEqual(f.status,[]);
});
