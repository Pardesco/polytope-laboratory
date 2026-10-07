import test from 'node:test';
import assert from 'node:assert/strict';
import {AnimationControls} from '../ui/animation-controls.mjs';
import {createSequence} from '../ui/animation.mjs';
import {WebmFrameCounter} from '../ui/webm-frames.mjs';

const observed=promise=>promise.then(value=>({value}),error=>({error}));
async function until(predicate){const deadline=Date.now()+2500;while(Date.now()<deadline){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('Expected export stage was never reached.');}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function fixture({target='base',prepareCapture,fps=1,duration=.1}={}){
  const view={angles:[0,0,0,0,0,0],sectionOffset:0,derivedMode:'section',cameraProjection:'orthographic',coordinateUnit:'mm',custom:{retained:true}},sequence=createSequence(view,duration,fps);sequence.keyframes[1].angles[0]=90;view.animation=sequence;
  const source={model:{id:'literal-source',fingerprint:'a'.repeat(64),dimension:3,name:'Cube',metadata:{coordinateUnits:'mm',offColors:{faces:[{encoding:'byte',values:[12,90,200,127]}]}}},notes:'Untouched source notes',view},initial=structuredClone(source),events=[],images=[],writes=[],controller=Object.create(AnimationControls.prototype);let state=source;
  const makeViewer=name=>({name,controls:{enabled:true,enableDamping:true,update:()=>events.push(`${name}:controls`)},renderer:{domElement:{width:320,height:240,captureStream:()=>{}}},setDisplay:()=>events.push(`${name}:display`),draw:()=>events.push(`${name}:draw`),image:()=>{events.push(`${name}:image`);images.push({name,angle:source.view.angles[0]});return `image:${name}:${source.view.angles[0]}`;},...(prepareCapture?{prepareCapture:guards=>{events.push(`${name}:prepare`);return prepareCapture(guards,name);}}:{})});
  const viewer=makeViewer('base'),sectionViewer=makeViewer('section');
  const context={getState:()=>state,getModel:()=>state?.model,viewer,sectionViewer,display:()=>events.push('display'),syncPose:()=>{},refreshSection:async()=>events.push('section:refresh'),setStatus:message=>events.push(message),api:{animationBegin:async()=>{events.push('native:begin');return {id:'owned-session'};},animationWrite:async(id,index,data)=>{assert.equal(id,'owned-session');events.push('native:write');writes.push({index,data});},animationFinish:async id=>{assert.equal(id,'owned-session');events.push('native:finish');return {path:'selected-export'};},animationAbort:async id=>{assert.equal(id,'owned-session');events.push('native:abort');}}};
  Object.assign(controller,{context,time:.04,generation:0,playing:false,exporting:false,trackSessions:{interrupt:()=>{}},nodes:{target:{value:target},progress:{textContent:''}},configure:()=>{},update:()=>{}});
  return {controller,source,initial,events,images,writes,viewer,sectionViewer,context,setState:next=>state=next};
}

test('PNG waits for exact preparation of every pose before image or native frame write',async()=>{
  const waits=[],s=fixture({prepareCapture:guards=>{const gate=deferred();waits.push({gate,guards});return gate.promise;}}),exported=s.controller.export('png');
  await until(()=>waits.length===1);assert.equal(s.images.length,0);assert.equal(s.writes.length,0);assert.equal(waits[0].guards.isCurrent(),true);assert.equal(waits[0].guards.signal.aborted,false);waits[0].gate.resolve();
  await until(()=>waits.length===2);assert.deepEqual(s.images,[{name:'base',angle:0}]);assert.equal(s.writes.length,1);assert.equal(waits[1].guards.isCurrent(),true);waits[1].gate.resolve();await exported;
  assert.deepEqual(s.images,[{name:'base',angle:0},{name:'base',angle:90}]);assert.equal(s.writes.length,2);assert.ok(s.events.indexOf('base:prepare')<s.events.indexOf('base:image'));assert.ok(s.events.includes('native:finish'));assert.ok(!s.events.includes('native:abort'));assert.deepEqual(s.source,s.initial);assert.equal(s.controller.time,.04);assert.equal(waits[1].guards.signal.aborted,true);assert.equal(waits[1].guards.isCurrent(),false);assert.equal(s.viewer.controls.enabled,true);assert.equal(s.controller.exporting,false);
});
test('section PNG prepares the selected derived viewer after section refresh',async()=>{
  const names=[],s=fixture({target:'section',prepareCapture:async(guards,name)=>{assert.equal(guards.isCurrent(),true);names.push(name);}});await s.controller.export('png');assert.deepEqual(names,['section','section']);assert.equal(s.images.every(i=>i.name==='section'),true);assert.ok(s.events.indexOf('section:refresh')<s.events.indexOf('section:prepare'));assert.deepEqual(s.source,s.initial);
});
test('legacy synchronous viewers without prepareCapture retain PNG export behavior',async()=>{
  const s=fixture();await s.controller.export('png');assert.equal(s.writes.length,2);assert.ok(s.events.includes('native:finish'));assert.deepEqual(s.source,s.initial);
});
test('user cancellation aborts pending preparation before native staging cleanup and captures no pixels',async()=>{
  let guard;const s=fixture({prepareCapture:g=>{guard=g;return new Promise((_resolve,reject)=>g.signal.addEventListener('abort',()=>{s.events.push('capture:aborted');reject(new Error('Capture cancelled.'));},{once:true}));}}),exported=s.controller.export('png');await until(()=>guard);s.controller.cancel();await exported;
  assert.equal(guard.signal.aborted,true);assert.equal(guard.isCurrent(),false);assert.equal(s.images.length,0);assert.equal(s.writes.length,0);assert.ok(s.events.indexOf('capture:aborted')<s.events.indexOf('native:abort'));assert.ok(!s.events.includes('native:finish'));assert.deepEqual(s.source,s.initial);assert.equal(s.controller.exporting,false);
});
test('a legacy preparation callback ignoring cancellation is fenced after await and cleanup waits for it',async()=>{
  const gate=deferred();let guard;const s=fixture({prepareCapture:g=>{guard=g;return gate.promise;}}),exported=s.controller.export('png');await until(()=>guard);s.controller.cancel();assert.equal(guard.isCurrent(),false);assert.ok(!s.events.includes('native:abort'));gate.resolve();await exported;assert.equal(s.images.length,0);assert.equal(s.writes.length,0);assert.ok(s.events.includes('native:abort'));
});
test('native source replacement during preparation rejects stale capture without restoring over the new document',async()=>{
  const gate=deferred();let guard;const s=fixture({prepareCapture:g=>{guard=g;return gate.promise;}}),exported=observed(s.controller.export('png'));await until(()=>guard);const replacement={model:{id:'new-source',fingerprint:'b'.repeat(64),dimension:3},view:{angles:[9,8,7,6,5,4],sentinel:'new view'}},before=structuredClone(replacement);s.setState(replacement);assert.equal(guard.isCurrent(),false);gate.resolve();const result=await exported;
  assert.match(result.error.message,/cancelled/);assert.equal(s.images.length,0);assert.equal(s.writes.length,0);assert.deepEqual(replacement,before);assert.ok(s.events.includes('native:abort'));assert.ok(!s.events.includes('native:finish'));
});
test('external view edits and native fingerprint changes are independently fenced around preparation',async()=>{
  for(const mutate of [s=>s.source.view.cameraProjection='perspective',s=>s.source.model.fingerprint='c'.repeat(64)]){const gate=deferred();let guard;const s=fixture({prepareCapture:g=>{guard=g;return gate.promise;}}),exported=observed(s.controller.export('png'));await until(()=>guard);mutate(s);const changed=structuredClone(s.source);assert.equal(guard.isCurrent(),false);gate.resolve();assert.ok((await exported).error);assert.equal(s.images.length,0);assert.deepEqual(s.source,changed);assert.ok(s.events.includes('native:abort'));}
});
test('incomplete or stale viewer preparation errors abort staging and retain the original view',async()=>{
  for(const reason of ['Exact pose became stale.','Subdivision cap left incomplete geometry.']){const s=fixture({prepareCapture:async()=>{throw Error(reason);}}),result=await observed(s.controller.export('png'));assert.equal(result.error.message,reason);assert.equal(s.images.length,0);assert.equal(s.writes.length,0);assert.ok(s.events.includes('native:abort'));assert.ok(!s.events.includes('native:finish'));assert.deepEqual(s.source,s.initial);assert.equal(s.controller.exporting,false);}
});


function videoEnvironment(t,copy,{beforeOutput,onEncode}={}){
  const names=['document','VideoEncoder','VideoFrame'],previous=names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]);
  const frames=[],events=[];let encoder,captureCanvas;
  class Frame{
    constructor(canvas,options){this.pose=canvas.pose;Object.assign(this,options);this.closed=false;frames.push(this);events.push(['snapshot',this.pose]);}
    close(){this.closed=true;}
  }
  class Encoder{
    static async isConfigSupported(){return {supported:true};}
    constructor(callbacks){encoder=this;this.callbacks=callbacks;this.queue=[];this.state='unconfigured';}
    configure(){this.state='configured';}
    encode(frame,options){assert.equal(frame.closed,false);this.queue.push({pose:frame.pose,timestamp:frame.timestamp,key:options.keyFrame});onEncode?.(frame);}
    async flush(){await new Promise(resolve=>setImmediate(resolve));if(this.state==='closed')return;
      for(const frame of this.queue.splice(0)){beforeOutput?.(frame,captureCanvas);const bytes=Uint8Array.of(Math.round(frame.pose));
        this.callbacks.output({timestamp:frame.timestamp,type:frame.key?'key':'delta',byteLength:1,copyTo:target=>target.set(bytes)});}
    }
    close(){this.state='closed';this.queue=[];events.push(['encoder:closed']);}
  }
  globalThis.VideoEncoder=Encoder;globalThis.VideoFrame=Frame;
  globalThis.document={createElement:name=>{assert.equal(name,'canvas');const canvas=captureCanvas={width:0,height:0,pose:null};
    canvas.getContext=()=>({drawImage(){canvas.pose=copy();events.push(['copied',canvas.pose]);}});return canvas;}};
  t.after(()=>{for(const [name,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];});
  return {frames,events,get encoder(){return encoder;}};
}
function frameCount(writes){const counter=new WebmFrameCounter();for(const write of writes)counter.feed(write.data);return counter.frames;}

test('WebM awaits each exact fine pose once before immutable copy and drains both explicit timestamp endpoints',async t=>{
  const waits=[],copies=[],s=fixture({fps:10,prepareCapture:guards=>{const gate=deferred();waits.push({gate,guards});return gate.promise;}}),
    env=videoEnvironment(t,()=>{const pose=s.source.view.angles[0];copies.push(pose);return pose;}),exported=s.controller.export('webm');
  await until(()=>waits.length===1);assert.deepEqual(copies,[]);assert.equal(env.frames.length,0);assert.equal(frameCount(s.writes),0);waits[0].gate.resolve();
  await until(()=>waits.length===2);assert.deepEqual(copies,[0]);assert.equal(frameCount(s.writes),1);waits[1].gate.resolve();await exported;
  assert.deepEqual(copies,[0,90]);assert.deepEqual(env.frames.map(f=>[f.pose,f.timestamp,f.duration]),[[0,0,100000],[90,100000,100000]]);
  assert.ok(env.frames.every(f=>f.closed));assert.equal(frameCount(s.writes),2);assert.ok(s.events.includes('native:finish'));assert.equal(env.encoder.state,'closed');
  assert.equal(s.controller.exportRecorder,null);assert.deepEqual(s.source,s.initial);assert.equal(s.controller.time,.04);
});
test('WebM uses literal fractional final time and preserves immutable poses despite a later canvas change',async t=>{
  const s=fixture({duration:.13,fps:24}),copies=[],env=videoEnvironment(t,()=>{const pose=s.source.view.angles[0];copies.push(pose);return pose;},{beforeOutput:(_frame,canvas)=>canvas.pose=999});
  // Display/canvas state may change after VideoFrame construction, but the
  // queued frame owns its captured pose, including the independently timed end.
  await s.controller.export('webm');assert.equal(env.frames.length,5);
  assert.deepEqual(env.frames.map(f=>f.timestamp),[0,41667,83333,125000,130000]);
  assert.deepEqual(env.frames.map(f=>f.duration),[41667,41666,41667,5000,41667]);
  assert.equal(env.frames[0].pose,0);assert.equal(env.frames.at(-1).pose,90);
  assert.deepEqual(env.frames.map(f=>f.pose),copies);assert.equal(frameCount(s.writes),5);assert.deepEqual(s.source,s.initial);
});
test('cancelled WebM preparation closes the encoder, submits no pixels and aborts its owned header staging',async t=>{
  let guard;const s=fixture({prepareCapture:g=>{guard=g;return new Promise((_resolve,reject)=>g.signal.addEventListener('abort',()=>reject(Error('Cancelled preparation.')),{once:true}));}}),copies=[],
    env=videoEnvironment(t,()=>copies.push('copy')),exported=s.controller.export('webm');await until(()=>guard);s.controller.cancel();await exported;
  assert.deepEqual(copies,[]);assert.equal(env.frames.length,0);assert.equal(frameCount(s.writes),0);assert.equal(env.encoder.state,'closed');assert.ok(s.events.includes('native:abort'));
  assert.ok(!s.events.includes('native:finish'));assert.deepEqual(s.source,s.initial);assert.equal(s.viewer.controls.enabled,true);assert.equal(s.controller.exporting,false);
});
test('WebM stale view after fine preparation is rechecked before pixel copy and immutable frame creation',async t=>{
  const gate=deferred();let guard;const s=fixture({prepareCapture:g=>{guard=g;return gate.promise;}}),copies=[],env=videoEnvironment(t,()=>copies.push('copy')),
    exported=observed(s.controller.export('webm'));await until(()=>guard);s.source.view.cameraProjection='perspective';gate.resolve();
  assert.match((await exported).error.message,/view changed/);assert.deepEqual(copies,[]);assert.equal(env.frames.length,0);assert.equal(frameCount(s.writes),0);
  assert.equal(env.encoder.state,'closed');assert.equal(s.source.view.cameraProjection,'perspective');assert.ok(s.events.includes('native:abort'));
});
test('cancellation during delayed flush prevents native finish and retains source/view and control ownership',async t=>{
  const s=fixture({fps:10}),env=videoEnvironment(t,()=>s.source.view.angles[0],{onEncode:frame=>{if(frame.pose===90)s.controller.cancel();}});
  await s.controller.export('webm');assert.deepEqual(env.frames.map(f=>f.pose),[0,90]);assert.ok(env.frames.every(f=>f.closed));assert.equal(frameCount(s.writes),1);
  assert.ok(s.events.includes('native:abort'));assert.ok(!s.events.includes('native:finish'));assert.deepEqual(s.source,s.initial);assert.equal(s.viewer.controls.enabled,true);assert.equal(s.viewer.controls.enableDamping,true);
});
test('legacy MediaRecorder alone cannot bypass the actual WebCodecs capability fence',async t=>{
  const keys=['VideoEncoder','VideoFrame','MediaRecorder'],previous=keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]);
  globalThis.VideoEncoder=undefined;globalThis.VideoFrame=undefined;globalThis.MediaRecorder=class {};
  t.after(()=>{for(const [key,value] of previous)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];});
  const s=fixture();await assert.rejects(s.controller.export('webm'),/WebCodecs.*unavailable/);assert.ok(!s.events.includes('native:begin'));assert.equal(s.writes.length,0);assert.deepEqual(s.source,s.initial);assert.equal(s.controller.exporting,false);
});
