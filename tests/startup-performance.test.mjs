import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {startupMark,afterModelPaint} from '../ui/startup-performance.mjs';
import {deferredMedia,recordRenderedVideo,recordRenderedGif} from '../ui/deferred-media.mjs';
import profile from '../desktop/startup-profile.cjs';
import {timingRows} from '../scripts/startup-profile.cjs';
import {ElementTypeControls} from '../ui/element-type-controls.mjs';
import {readFile} from 'node:fs/promises';

test('startup marks record a milestone once',()=>{
  const entries=new Map(),clock={getEntriesByName:key=>entries.has(key)?[entries.get(key)]:[],mark:key=>entries.set(key,1)};
  startupMark('first-model-rendered',clock);startupMark('first-model-rendered',clock);
  assert.equal(entries.size,1);assert.ok(entries.has('polytope:first-model-rendered'));
});

test('secondary work yields through two frames and clears its bounded fallback',async()=>{
  const frames=[],cleared=[];let timeout,done=false;
  const promise=afterModelPaint({frame:fn=>frames.push(fn),timer:(fn,ms)=>{assert.equal(ms,100);timeout=fn;return 7;},clear:id=>cleared.push(id)}).then(()=>done=true);
  assert.equal(done,false);frames.shift()();await Promise.resolve();assert.equal(done,false);
  frames.shift()();await promise;assert.equal(done,true);assert.deepEqual(cleared,[7]);timeout();assert.deepEqual(cleared,[7]);
});

test('occluded or unavailable frame callbacks cannot strand work',async()=>{
  const frames=[];let timeout;
  const promise=afterModelPaint({frame:fn=>frames.push(fn),timer:fn=>{timeout=fn;return 1;},clear:()=>{}});
  timeout();await promise;frames.shift()();assert.equal(frames.length,0);
});

test('deferred encoder loads coalesce, preserve options and check cancellation after import',async()=>{
  let loads=0,calls=0,checks=0,resolve;
  const encode=deferredMedia(()=>{loads++;return new Promise(r=>resolve=r);},'encode');
  const options={check:()=>checks++,value:42},one=encode(options),two=encode(options);
  resolve({encode:arg=>{assert.equal(arg,options);calls++;return arg.value;}});
  assert.deepEqual(await Promise.all([one,two]),[42,42]);assert.equal(loads,1);assert.equal(checks,2);assert.equal(calls,2);
  await assert.rejects(encode({check:()=>{throw Error('canceled');}}),/canceled/);assert.equal(calls,2);
});

test('failed encoder imports can be retried',async()=>{
  let attempts=0;const encode=deferredMedia(async()=>{if(++attempts===1)throw Error('load failed');return {encode:()=>3};},'encode');
  await assert.rejects(encode({}),/load failed/);assert.equal(await encode({}),3);assert.equal(attempts,2);
});

test('real split export modules preserve the cancellation boundary',async()=>{
  for(const record of [recordRenderedVideo,recordRenderedGif])await assert.rejects(record({check:()=>{throw Error('canceled before encoding');}}),/canceled before encoding/);
});

test('native profile flag and split stderr readiness never touch engine stdout',()=>{
  let now=100;const enabled=profile.createStartupProfile(true,()=>now++),disabled=profile.createStartupProfile(false);
  enabled.mark('window-created');enabled.mark('window-created');disabled.mark('window-created');
  assert.equal(enabled.marks.length,1);assert.deepEqual(disabled.marks,[]);
  const proc={stderr:new EventEmitter()};profile.watchEngineReady(proc,enabled);
  proc.stderr.emit('data','POLYTOPE_ENGINE_');proc.stderr.emit('data','READY\n');
  assert.deepEqual(enabled.marks.at(-1),{name:'engine-ready',epochMs:101});assert.equal(proc.stderr.listenerCount('data'),0);
  profile.watchEngineReady(proc,disabled);assert.equal(proc.stderr.listenerCount('data'),0);
});

test('profile table combines native and renderer clocks chronologically',()=>{
  assert.deepEqual(timingRows(100,[{name:'electron-ready',epochMs:110}],{timeOrigin:105,marks:[{name:'polytope:first-model-rendered',startTime:20}]}),[
    {stage:'electron-ready','from launch (ms)':10,'since previous (ms)':10},
    {stage:'first-model-rendered','from launch (ms)':25,'since previous (ms)':15}]);
});

test('element types show a placeholder and cancel safely while waiting for first paint',async()=>{
  const panel={textContent:'',replaceChildren(){this.textContent='';}},source={model:{dimension:3,vertices:[],edges:[],faces:[],cells:[]},view:{}};
  let resume,runs=0;const control=Object.assign(Object.create(ElementTypeControls.prototype),{panel,sequence:0,context:{getState:()=>source,beforeAnalysis:()=>new Promise(resolve=>resume=resolve),run:()=>runs++}});
  const pending=control.refresh();assert.match(panel.textContent,/Finding element types/);assert.equal(runs,0);
  control.cancelNumeric();resume();await pending;assert.equal(runs,0);assert.match(panel.textContent,/canceled/);
});

test('mounted renderer retains control creation and defers only export backends',async()=>{
  const [app,animation,tour]=await Promise.all(['ui/app.js','ui/animation-controls.mjs','ui/animated-tour-export.mjs'].map(file=>readFile(new URL('../'+file,import.meta.url),'utf8')));
  assert.ok(app.includes('beforeAnalysis:afterModelPaint'));
  assert.ok(app.indexOf("reportMessage('analysis'")<app.indexOf('await afterModelPaint()'));
  assert.ok(app.includes("base.draw();if(!startupModelRendered&&base.model)"));
  for(const source of [animation,tour]){assert.ok(source.includes("from './deferred-media.mjs'"));assert.ok(!source.includes("from './video-recorder.mjs'"));}
});

test('actual analysis prelude shows placeholders and Cancel prevents work queued behind paint',async()=>{
  const app=await readFile(new URL('../ui/app.js',import.meta.url),'utf8');
  const start=app.indexOf('async function refreshAnalysis(){'),end=app.indexOf('  try{',start);
  const prelude=app.slice(start,end)+'return "continue";}';
  let release,listener,aborted=false;const messages=new Map();
  const ticket={model:{},controller:{abort:()=>aborted=true},signal:{get aborted(){return aborted;}}};
  const scope={polychoronRelationships:null,informationPanel:null,relatedLibrary:{sync(){}},analysisOverview:{sync(){}},
    reports:{begin:()=>ticket,current:()=>true,owns:()=>true},analysisDetailsOpen:false,rememberValidationDetails(){},
    $:id=>id==='cancel'?{addEventListener:(_event,fn)=>listener=fn,removeEventListener:(_event,fn)=>{assert.equal(fn,listener);listener=null;}}:null,
    reportMessage:(id,text)=>messages.set(id,text),afterModelPaint:()=>new Promise(resolve=>release=resolve),startupMark(){throw Error('Canceled analysis must not start.');}};
  const refresh=new Function('scope',`with(scope){${prelude};return refreshAnalysis;}`)(scope);
  const pending=refresh();assert.match(messages.get('analysis'),/Analyzing/);assert.match(messages.get('evidence'),/Checking/);
  listener();release();await pending;assert.match(messages.get('analysis'),/canceled/);assert.match(messages.get('evidence'),/canceled/);assert.equal(listener,null);
});
