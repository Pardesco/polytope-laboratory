import test from 'node:test';
import assert from 'node:assert/strict';
import {LivePreviewSession,LiveSliders,LIVE_SLIDERS,snapValue,releaseOnly} from '../ui/live-sliders.mjs';
import {sourceContext,deferred,tick} from './construction-controls-fixture.mjs';
import {presentLivePreview} from '../ui/live-preview-view.mjs';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(){
  const owner=sourceContext(),shown=[],commits=[],messages=[];
  let text='1/3',clears=0;
  const context={...owner,evaluateMany:async texts=>texts.map(t=>t==='1/3'?1/3:Number(t)),
    run:async()=>({model:{...owner.getState().model,name:'preview'},name:'Named shape'}),
    show:m=>shown.push(m),clear:()=>clears++,status:(key,text)=>messages.push(text),
    commit:async(...args)=>{args[3].verifyPublication();commits.push(args);return 'committed';}};
  const build=()=>({op:'truncate',label:'Cut corners',raw:{text},fields:{value:{text,min:0,max:.5}},params:v=>({amount:v.value})});
  return {owner,context,shown,commits,messages,build,session:new LivePreviewSession(context),setText:v=>text=v,get clears(){return clears;}};
}
async function evaluate(f){const job=f.session.begin('cut');f.session.supersede();job.controller=null;job.check=null;await f.session.evaluate(job,f.build,f.session.sequence);return job;}

test('preview evaluates expressions, remains detached, and Apply commits once',async()=>{
  const f=fixture(),before=structuredClone(f.owner.getState());await evaluate(f);
  assert.equal(f.shown.length,1);assert.deepEqual(f.owner.getState(),before);assert.equal(f.commits.length,0);
  assert.equal(await f.session.apply(),'committed');await f.session.apply();
  assert.equal(f.commits.length,1);assert.deepEqual(f.commits[0].slice(0,3),['truncate',{amount:1/3},'Cut corners']);assert.equal(f.session.active,null);
});
test('repeated Apply while history awaits cannot double commit',async()=>{
  const f=fixture(),pending=deferred();await evaluate(f);
  f.context.commit=async(...args)=>{args[3].verifyPublication();f.commits.push(args);return pending.promise;};
  const first=f.session.apply();await f.session.apply();assert.equal(f.commits.length,1);pending.resolve();await first;
});
test('late older responses never overwrite newer previews, even when IPC ignores abort',async()=>{
  const f=fixture(),old=deferred();f.context.run=()=>old.promise;
  const job=f.session.begin('cut'),first=f.session.evaluate(job,f.build,f.session.sequence).catch(e=>e);
  await tick();f.session.supersede();f.setText('.5');job.controller=null;job.check=null;
  f.context.run=async()=>({model:{name:'new',vertices:[[1,2,3]]},name:'New'});
  await f.session.evaluate(job,f.build,f.session.sequence);old.resolve({model:{name:'old',vertices:[[0,0,0]]},name:'Old'});
  await first;await tick();assert.deepEqual(f.shown.map(m=>m.name),['new']);f.session.cancel();
});
test('Cancel aborts work, clears preview and leaves history untouched',async()=>{
  const f=fixture(),pending=deferred();f.context.run=()=>pending.promise;
  const job=f.session.begin('cut'),work=f.session.evaluate(job,f.build,f.session.sequence).catch(e=>e);await tick();
  f.session.cancel();pending.resolve({model:{vertices:[[1,2,3]]},name:'Late'});await work;await tick();
  assert.equal(f.shown.length,0);assert.equal(f.commits.length,0);assert.equal(f.session.active,null);assert.ok(job.controller.signal.aborted);
});
test('new values debounce to one native call and release leaves preview visible',async()=>{
  const f=fixture();let calls=0;f.context.run=async()=>{calls++;return {model:{vertices:[[0,0,0]]},name:'shape'};};
  f.session.queue('cut',f.build);f.setText('.4');f.session.queue('cut',f.build);f.setText('.5');f.session.queue('cut',f.build,{release:true});
  await wait(30);assert.equal(calls,1);assert.equal(f.shown.length,1);assert.ok(f.session.active.ready);assert.equal(f.commits.length,0);f.session.cancel();
});
test('large 4D and large 3D defer native work until release',async()=>{
  const f=fixture();f.owner.getState().model.vertices=Array.from({length:180},()=>[0,0,0]);let calls=0;
  f.context.run=async()=>{calls++;return {model:{vertices:[[0,0,0]]},name:'shape'};};
  f.session.queue('cut',f.build);await wait(85);assert.equal(calls,0);assert.match(f.messages.at(-1),/Release/);
  f.session.queue('cut',f.build,{release:true});await wait(30);assert.equal(calls,1);f.session.cancel();
  assert.equal(releaseOnly({dimension:4,vertices:Array(33),cells:[]}),true);
  assert.equal(releaseOnly({dimension:3,vertices:Array(60)}),false);
});
test('source, export, settings and document changes fence Apply',async()=>{
  for(const change of [f=>f.owner.getState().notes='new',f=>f.owner.getState().model.vertices[0][0]=99,f=>f.owner.swapDocument(),f=>f.owner.setExport(true),f=>f.setText('.2')]){
    const f=fixture();await evaluate(f);change(f);await assert.rejects(f.session.apply(),/changed|export|settings/);assert.equal(f.commits.length,0);f.session.sync();assert.equal(f.session.active,null);
  }
});
test('native failure exposes no applicable result and can be canceled',async()=>{
  const f=fixture();f.context.run=async()=>{throw Error('Unsupported source');};
  f.session.queue('cut',f.build,{release:true});await wait(30);assert.match(f.messages.at(-1),/Unsupported/);await f.session.apply();assert.equal(f.commits.length,0);f.session.cancel();
});
test('named stops snap narrowly and do not invent a dual or bitruncation endpoint',()=>{
  const spec=LIVE_SLIDERS[0],stops=spec.stops.map(([value])=>({value}));
  assert.equal(snapValue(.499,stops,0,.5),.5);assert.equal(snapValue(.331,stops,0,.5),1/3);assert.equal(snapValue(.4,stops,0,.5),.4);
  assert.equal(spec.stops.some(s=>s[1]==='Dual'),false);assert.equal(spec.stops.some(s=>s[1]==='Bitruncated'),false);
});

function domFixture(){
  const handlers={},nodes={},owner=sourceContext();owner.getState().model.interpretation='convex-polytope';
  function node(id=''){
    return {id,value:'1',disabled:false,children:[],classList:{add(){}},setAttribute(){},addEventListener(type,fn){this[type]=fn;},closest(){return this.label??=node();},after(child){this.children.push(child);},append(...children){this.children.push(...children);},replaceChildren(){this.children=[];},
      set innerHTML(value){this.parts={};for(const key of ['input','output','.live-slider-stops','#'+this.id+'-apply','#'+this.id+'-cancel'])this.parts[key]=node();},
      querySelector(key){return this.parts[key];},querySelectorAll(){return this.parts['.live-slider-stops'].children;}};
  }
  nodes['model-scale']=node('model-scale');
  const doc={getElementById:id=>nodes[id],createElement:()=>node(),addEventListener:(key,fn)=>handlers[key]=fn};
  const commits=[],context={...owner,guard:fn=>fn,evaluateMany:async texts=>texts.map(Number),run:async()=>({model:{vertices:[[0,0,0]]},name:'Scaled'}),show(){},clear(){},commit:async(...args)=>{args[3].verifyPublication();commits.push(args);}};
  return {controls:new LiveSliders(context,{document:doc}),nodes,handlers,commits};
}
test('mounted slider syncs the typed field, Enter applies and Escape cancels',async()=>{
  const f=domFixture(),row=f.controls.rows.get('model-scale');row.range.value='2';row.range.onchange();await wait(30);
  assert.equal(f.nodes['model-scale'].value,'2');assert.equal(row.apply.disabled,false);
  let prevented=false;await row.root.onkeydown({key:'Enter',preventDefault(){prevented=true;},stopPropagation(){}});
  assert.equal(prevented,true);assert.equal(f.commits.length,1);assert.deepEqual(f.commits[0][1],{scale:2});
  row.range.value='1.5';row.range.onchange();f.handlers.keydown({key:'Escape',preventDefault(){}});await wait(20);assert.equal(f.controls.session.active,null);assert.equal(f.commits.length,1);
});
test('typed expressions and native domain beyond the slider window stay available',()=>{
  const f=domFixture(),spec=LIVE_SLIDERS.find(s=>s.id==='model-scale');f.nodes['model-scale'].value='-sqrt(4)';
  const built=f.controls.build(spec);assert.equal(built.fields.value.text,'-sqrt(4)');assert.equal(built.fields.value.nonzero,true);assert.equal(built.fields.value.min,-1e100);
});
test('typing after a completed preview replaces its canceled request and Enter can apply',async()=>{
  const f=domFixture(),input=f.nodes['model-scale'],row=f.controls.rows.get('model-scale');
  row.range.value='2';row.range.onchange();await wait(30);assert.ok(f.controls.session.active.ready);
  input.value='1.25';input.input();input.change();await wait(30);
  assert.equal(row.range.value,1.25);assert.ok(f.controls.session.active.ready);
  await row.apply.onclick();assert.deepEqual(f.commits[0][1],{scale:1.25});
});
test('preview rendering keeps a fixed source scale and strips source-bound masks without editing the view',()=>{
  const calls=[],view={angles:[0,0,0],elementVisibility:{faces:[0]},entitySelection:{index:0},dualMorph:{enabled:true},orientationFrame:{sourceFingerprint:'old'},surfaceColors:'source'};
  const before=structuredClone(view),camera={zoom:2},source={center:[1,2,3],radius:5,cameraState:()=>camera};
  const viewer={setModel:(...args)=>calls.push(args),setDisplay:display=>calls.push(display),restoreCamera:value=>calls.push(value)};
  presentLivePreview(viewer,source,{vertices:[[10,20,30]]},view,{first:true});
  assert.deepEqual(calls[0][1].normalization,{center:[1,2,3],radius:5});assert.equal(calls[0][1].deferDisplay,true);
  assert.equal(calls[1].elementVisibility,undefined);assert.equal(calls[1].dualMorph,undefined);assert.equal(calls[1].surfaceColors,'source');assert.equal(calls[2],camera);assert.deepEqual(view,before);
  calls.length=0;presentLivePreview(viewer,source,{vertices:[[20,40,60]]},view);assert.equal(calls.length,2);assert.equal(calls[0][1].normalization.radius,5);
});
test('Enter in a fresh typed field waits for preview and commits once without a second keypress',async()=>{
  const f=domFixture(),input=f.nodes['model-scale'];input.value='1.4';
  await input.keydown({key:'Enter',preventDefault(){}});await wait(35);
  assert.equal(f.commits.length,1);assert.deepEqual(f.commits[0][1],{scale:1.4});assert.equal(f.controls.session.active,null);
});
test('Enter on a focused Cancel or named-stop button keeps native button activation',()=>{
  const f=domFixture(),row=f.controls.rows.get('model-scale');
  row.root.onkeydown({key:'Enter',target:{tagName:'BUTTON'},preventDefault(){assert.fail('Button Enter must remain native');},stopPropagation(){}});
  assert.equal(f.commits.length,0);
});
