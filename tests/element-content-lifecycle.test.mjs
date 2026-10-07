import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {NetEditor} from '../ui/net-editor.js';
import {AnimationRenderer} from '../ui/animation-renderer.mjs';
import {attachElementContentCapture,prepareElementContent} from '../ui/element-content-lifecycle.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function native(request){return new Promise((resolve,reject)=>{
  const child=spawn(process.env.POLYTOPE_PYTHON||'python',['-B','-u','engine/server.py'],{cwd:ROOT,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='',errors='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>errors+=d);child.on('error',reject);
  child.on('close',code=>{try{if(code)throw Error(errors);const reply=JSON.parse(output);if(!reply.ok)throw Error(reply.error);resolve(reply.result);}catch(error){reject(error);}});
  child.stdin.end(JSON.stringify(request)+'\n');
});}
async function fixture(){
  const model=await native({op:'generate',params:{kind:'regular',key:'cube'}});
  let document={id:'net-content-lifecycle',cursor:0,states:[{model,view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0],net:{root:0,length:37,tabs:true,display:'fold',fraction:.5}},notes:'Literal notes'}]};
  document=await native({op:'recipe-run',params:{document,operation:'element-content',parameters:{action:'text',kind:'face',index:0,markup:'Current caption'}}});
  const state=document.states[document.cursor],project={documents:[document]},calls=[];
  const context={getState:()=>state,getModel:()=>state.model,getProject:()=>project,getDocument:()=>document,isBusy:()=>false,isExporting:()=>false,
    run:async(op,params,model)=>{calls.push({op,params});return native({op,params,model});}};
  const editor=Object.assign(Object.create(NetEditor.prototype),context,{context,sequence:0,playing:false,markDirty:()=>{},refresh:()=>{},activate:()=>{},$:()=>({value:''})});
  return {state,context,editor,calls};
}
function viewer(model){return {model,net:null,cellNet:null,elementContentLayer:null,captures:0,
  async setElementContent(descriptor,options){if(options?.signal?.aborted||options?.isCurrent?.()===false)throw Error('Stale render');this.elementContentLayer=descriptor?{descriptor}:null;return {ready:true};},
  async prepareCapture(options){assert.notEqual(options?.isCurrent?.(),false);this.captures++;return {complete:true};}};}

test('native NetEditor generation and layout undo use current source content at unchanged E0',async()=>{
  const f=await fixture();let net=await f.editor.evaluate(f.state.model,f.state);
  assert.equal(net.referenceEdgeLengthMm,37);assert.match(net.svg,/Current caption/);
  await f.editor.edit('move-component',{component:net.components[0].root,translation:[10,5]});
  assert.equal(f.state.netHistory.cursor,1);
  const next=await native({op:'recipe-run',params:{document:f.context.getDocument(),operation:'element-content',parameters:{action:'text',kind:'face',index:0,markup:'Latest caption'}}});
  // Keep the actual source and layout history; only current annotation is replaced.
  f.state.view.elementAnnotations=next.states.at(-1).view.elementAnnotations;
  const previousLayout=structuredClone(f.state.netLayout),cursor=f.state.netHistory.cursor;
  f.state.netLayout=null;f.state.netPages=null;
  await f.editor.evaluate(f.state.model,f.state);
  assert.deepEqual(f.state.netLayout.hinges,previousLayout.hinges);assert.deepEqual(f.state.netLayout.placements,previousLayout.placements);
  assert.equal(f.state.netHistory.cursor,cursor,'Content-only SVG regeneration is not a new geometry layout edit.');
  await f.editor.restore(-1);
  assert.match(f.state.netLayout.svg,/Latest caption/);assert.doesNotMatch(f.state.netLayout.svg,/Current caption/);
  assert.equal(f.state.netLayout.referenceEdgeLengthMm,37);
  assert.equal(f.calls.at(-1).params.element_annotations.entries[0].text.markup,'Latest caption');
});

test('held net generation refuses source content changes without publishing cache/history',async()=>{
  const f=await fixture(),entered=deferred(),held=deferred(),run=f.editor.run;
  f.editor.run=async(...args)=>{entered.resolve();await held.promise;return run(...args);};
  const pending=f.editor.evaluate(f.state.model,f.state);await entered.promise;f.state.view.elementAnnotations.entries[0].text.markup='Changed while pending';held.resolve();
  assert.deepEqual(await pending,{stale:true});assert.equal(f.state.netLayout,undefined);assert.equal(f.state.netHistory,undefined);
});

test('held physical packing refuses changed notes and retains the already generated net',async()=>{
  const f=await fixture();await f.editor.evaluate(f.state.model,f.state);f.state.view.net.display='pages';
  const net=f.state.netLayout,entered=deferred(),held=deferred(),run=f.editor.run;
  f.editor.run=async(op,...args)=>{if(op==='net-pack'){entered.resolve();await held.promise;}return run(op,...args);};
  const pending=f.editor.evaluate(f.state.model,f.state);await entered.promise;f.state.notes='Changed notes';held.resolve();
  assert.deepEqual(await pending,{stale:true});assert.equal(f.state.netLayout,net);assert.equal(f.state.netPages,null);
});

test('offscreen capture waits descriptor once, then re-prepares after Viewer clear or net replacement',async()=>{
  const f=await fixture(),v=viewer(f.state.model),entered=deferred(),held=deferred();let reads=0;
  const describe=async(model,params)=>{reads++;entered.resolve();await held.promise;return native({op:'element-content-describe',model,params});};
  const detach=attachElementContentCapture(v,{getState:()=>f.state,describe});
  const first=v.prepareCapture(),second=v.prepareCapture();await entered.promise;assert.equal(v.captures,0);assert.equal(reads,1);held.resolve();await Promise.all([first,second]);assert.equal(v.captures,2);
  v.elementContentLayer=null;await v.prepareCapture();assert.equal(reads,2);assert.equal(v.captures,3);
  detach();assert.equal(v.elementContentLayer?.descriptor.entries[0].text.markup,'Current caption');
});

test('offscreen source RGBA changes during native describe and cancellation cannot capture',async()=>{
  const f=await fixture(),v=viewer(f.state.model),entered=deferred(),held=deferred();
  const detach=attachElementContentCapture(v,{getState:()=>f.state,describe:async()=>{entered.resolve();await held.promise;return {};}});
  const capture=v.prepareCapture();await entered.promise;f.state.model.faceColors=[[.1,.2,.3,.4]];const rejected=assert.rejects(capture,/changed|canceled/);held.resolve();await rejected;assert.equal(v.captures,0);detach();
  const controller=new AbortController();controller.abort();await assert.rejects(prepareElementContent(v,f.state,{signal:controller.signal}),/changed|canceled/);
});

test('unmapped derived tour content refuses explicitly; empty content clears stale assets',async()=>{
  const f=await fixture(),v=viewer(f.state.model);v.elementContentLayer={old:true};
  await assert.rejects(prepareElementContent(v,f.state,{canMap:false}),/no verified mapping/);assert.equal(v.elementContentLayer,null);assert.equal(v.captures,0);
  f.state.view.elementAnnotations=null;await prepareElementContent(v,f.state,{canMap:false});assert.equal(v.elementContentLayer,null);
});

test('AnimationRenderer folding native input includes current source annotation',async()=>{
  const f=await fixture(),renderer=new AnimationRenderer({...f.context});
  const net=await renderer.loadNet(f.state.model);assert.match(net.svg,/Current caption/);assert.equal(net.referenceEdgeLengthMm,37);
});
