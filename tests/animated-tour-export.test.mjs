import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {AnimatedTourExporter} from '../ui/animated-tour-export.mjs';
import {prepareAnimatedTourTimeline,evaluateAnimatedTour} from '../ui/animated-tour-timeline.mjs';
import {recordRenderedVideo} from '../ui/video-recorder.mjs';
import {WebmFrameCounter} from '../ui/webm-frames.mjs';
const require=createRequire(import.meta.url),{validateExportOptions}=require('../desktop/animation-export.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve)),gate=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve};};
async function until(fn){for(let n=0;n<100;n++){if(fn())return;await tick();}assert.fail('Expected export stage was not reached.');}
function model(id){return {id,name:id,dimension:3,embeddingDimension:3,interpretation:'generalized-complex',vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],edges:[[0,1],[1,2],[0,2],[0,3],[1,3],[2,3]],faces:[[0,2,1],[0,1,3],[1,2,3],[0,3,2]],cells:[],metadata:{coordinateUnits:'mm',offColors:{faces:[{encoding:'byte',values:[30,80,200,127]},null,null,null],cells:[]}}};}
function sequence(angle){return {version:1,duration:.1,fps:10,loop:false,keyframes:[{time:0,angles:Array(6).fill(0),sectionOffset:0},{time:.1,angles:[angle,0,0,0,0,0],sectionOffset:0}]};}
function bank(){return {version:2,cursor:0,events:[{id:'a',duration:.1,transition:{method:'sideways',duration:.2,easing:'linear',distance:2},state:{model:model('a'),notes:'Notes a',view:{coordinateUnit:'mm',animation:sequence(90)}}},{id:'b',duration:.1,transition:{method:'instant'},state:{model:model('b'),notes:'Notes b',view:{coordinateUnit:'mm',animation:sequence(180)}}}]};}
function fixture({wait,recordVideo}={}){
  const original=bank(),before=structuredClone(original),source={notes:'Original source',view:{sentinel:'retained'}},initial=structuredClone(source),events=[],writes=[],progress=[],timeline=prepareAnimatedTourTimeline(original);let owner=true,token=0,published=null;
  const renderer={timeline,canvas:{width:320,height:240,captureStream:()=>{}},published:null,ownerCurrent:()=>owner,
    async apply(time,{signal}={}){events.push(['prepare',time]);if(wait)await wait(time);if(signal?.aborted||!owner)throw Object.assign(Error('Fine preparation cancelled.'),{name:'AbortError'});const frame=evaluateAnimatedTour(renderer.timeline,time);published={...frame,complete:!renderer.incomplete,token:++token};renderer.published=published;renderer.canvas.pose=time;renderer.canvas.layers=published.layers;events.push(['prepared',time]);return published;},
    current:p=>p===published&&p.token===token&&owner,
    image(p){assert.equal(renderer.current(p),true);events.push(['image',p.time]);return 'data:image/png;base64,'+Buffer.from(JSON.stringify(p)).toString('base64');},cancel(){token++;events.push(['renderer:cancel']);}};
  const api={async animationBegin(o){validateExportOptions(o);events.push(['begin',o]);return {id:'owned-staging'};},async animationWrite(id,index,data){assert.equal(id,'owned-staging');writes.push({index,data});events.push(['write',index]);},async animationFinish(id){assert.equal(id,'owned-staging');events.push(['finish']);return {path:'chosen-by-native-dialog'};},async animationAbort(id){assert.equal(id,'owned-staging');events.push(['abort']);}};
  const exporter=new AnimatedTourExporter({renderer,api,...recordVideo?{recordVideo}:{},onProgress:p=>progress.push(p),onExportStateChange:b=>events.push(['busy',b])});
  return {renderer,exporter,api,source,initial,original,before,events,writes,progress,changeOwner(){owner=false;}};
}
test('PNG native staging uses exact uniform times/endpoints and exports moving incoming/outgoing saved tracks',async()=>{
  const h=fixture();await h.renderer.apply(.025);const result=await h.exporter.export('png',{fps:10,name:'Saved animated tour'});assert.equal(result.path,'chosen-by-native-dialog');
  const options=h.events.find(e=>e[0]==='begin')[1];assert.equal(options.frameCount,5);assert.equal(options.duration,.4);
  const frames=h.writes.map(w=>JSON.parse(Buffer.from(w.data.slice(22),'base64').toString()));assert.deepEqual(frames.map(f=>f.time),[0,.1,.2,.3,.4]);
  assert.deepEqual(frames[2].layers.map(l=>[l.role,l.animation.frame.angles[0],l.transitionPose.translation[0]]),[['outgoing',90,-1],['incoming',0,1]]);
  assert.equal(frames.at(-1).layers[0].animation.frame.angles[0],180);assert.equal(h.renderer.published.time,.025);assert.equal(h.exporter.exporting,false);assert.deepEqual(h.source,h.initial);assert.deepEqual(h.original,h.before);assert.ok(!h.events.some(e=>e[0]==='abort'));
});
test('PNG cannot read or write a frame before its awaited fine multi-layer preparation',async()=>{
  const g=gate(),h=fixture({wait:()=>g.promise}),exported=h.exporter.export('png',{fps:10});await until(()=>h.events.some(e=>e[0]==='prepare'));assert.equal(h.writes.length,0);assert.equal(h.events.some(e=>e[0]==='image'),false);g.resolve();await exported;assert.equal(h.writes.length,5);
});
test('cancelled ignored preparation settles and is fenced before native staging abort',async()=>{
  const g=gate(),h=fixture({wait:()=>g.promise}),exported=h.exporter.export('png',{fps:10}),rejected=assert.rejects(exported,/cancel/);await until(()=>h.events.some(e=>e[0]==='prepare'));h.exporter.cancel();assert.equal(h.events.some(e=>e[0]==='abort'),false);g.resolve();await rejected;assert.equal(h.writes.length,0);assert.ok(h.events.some(e=>e[0]==='abort'));assert.equal(h.exporter.exporting,false);assert.deepEqual(h.source,h.initial);
});
test('new owner during pending capture is never overwritten or restored by an obsolete tour export',async()=>{
  const g=gate(),h=fixture({wait:()=>g.promise}),exported=h.exporter.export('png',{fps:10}),rejected=assert.rejects(exported,/cancel/);await until(()=>h.events.some(e=>e[0]==='prepare'));h.changeOwner();h.source.view={newUserView:true};const changed=structuredClone(h.source);g.resolve();await rejected;assert.equal(h.writes.length,0);assert.deepEqual(h.source,changed);assert.ok(h.events.some(e=>e[0]==='abort'));assert.ok(!h.events.some(e=>e[0]==='finish'));
});
test('incomplete frames and failed native writes abort once and release export busy state',async()=>{
  for(const kind of ['incomplete','write']){const h=fixture();if(kind==='incomplete')h.renderer.incomplete=true;else h.api.animationWrite=async()=>{throw Error('Native writer rejected chunk.');};await assert.rejects(h.exporter.export('png',{fps:10}),kind==='incomplete'?/complete fine/:/writer rejected/);assert.equal(h.events.filter(e=>e[0]==='abort').length,1);assert.equal(h.exporter.exporting,false);assert.equal(h.events.at(-1)[1],false);assert.ok(!h.events.some(e=>e[0]==='finish'));}
});
test('readable long tours, invalid FPS/format and overlapping export refuse without creating extra native sessions',async()=>{
  const h=fixture();await assert.rejects(h.exporter.export('gif'),/PNG or WebM/);await assert.rejects(h.exporter.export('png',{fps:1.5}),/integer/);h.renderer.timeline=prepareAnimatedTourTimeline({...bank(),events:[{...bank().events[0],duration:301,transition:{method:'instant'}}]});await assert.rejects(h.exporter.export('png'),/300 seconds/);assert.equal(h.events.some(e=>e[0]==='begin'),false);
  const g=gate(),busy=fixture({wait:()=>g.promise}),exported=busy.exporter.export('png',{fps:10});await until(()=>busy.events.some(e=>e[0]==='prepare'));await assert.rejects(busy.exporter.export('png'),/already running/);g.resolve();await exported;assert.equal(busy.events.filter(e=>e[0]==='begin').length,1);
});
test('a cancelled native destination creates no frames and returns to the prior prepared tour time',async()=>{
  const h=fixture();await h.renderer.apply(.05);h.api.animationBegin=async()=>null;assert.equal(await h.exporter.export('png',{fps:10}),null);assert.equal(h.writes.length,0);assert.equal(h.renderer.published.time,.05);assert.equal(h.exporter.exporting,false);
});

function encoderBridge({beforeOutput,onEncode,timestamp,omitPose}={}){
  const frames=[],events=[];let encoder;
  class Frame{constructor(canvas,init){this.pose=canvas.pose;this.layers=structuredClone(canvas.layers);Object.assign(this,init);this.closed=false;frames.push(this);}close(){this.closed=true;}}
  class Encoder{
    static async isConfigSupported(){return {supported:true};}constructor(callbacks){encoder=this;this.callbacks=callbacks;this.queue=[];this.state='unconfigured';}
    configure(){this.state='configured';}
    encode(frame,options){assert.equal(frame.closed,false);this.queue.push({pose:frame.pose,timestamp:frame.timestamp,key:options.keyFrame});onEncode?.(frame);}
    async flush(){await tick();await tick();if(this.state==='closed')return;for(const frame of this.queue.splice(0)){
      beforeOutput?.(frame);if(frame.pose===omitPose)continue;const bytes=Uint8Array.of(Math.round(frame.pose*100));
      this.callbacks.output({timestamp:timestamp?.(frame)??frame.timestamp,type:frame.key?'key':'delta',byteLength:1,copyTo:target=>target.set(bytes)});
    }}
    close(){this.state='closed';this.queue=[];events.push(['closed']);}
  }
  return {recordVideo:options=>recordRenderedVideo({...options,Encoder,Frame,wait:tick,pollInterval:1,startupTimeout:100}),frames,events,get encoder(){return encoder;}};
}
function countFrames(h){const counter=new WebmFrameCounter();for(const write of h.writes)counter.feed(write.data);return counter.frames;}

test('tour WebM owns every absolute saved-track transition pose once and drains exact timestamps through native staging',async()=>{
  const bridge=encoderBridge(),h=fixture({recordVideo:bridge.recordVideo});await h.renderer.apply(.025);await h.exporter.export('webm',{fps:10});
  assert.deepEqual(bridge.frames.map(f=>[f.pose,f.timestamp]),[[0,0],[.1,100000],[.2,200000],[.3,300000],[.4,400000]]);
  assert.deepEqual(bridge.frames[2].layers.map(l=>[l.role,l.animation.frame.angles[0],l.transitionPose.translation[0]]),[['outgoing',90,-1],['incoming',0,1]]);
  assert.equal(bridge.frames.at(-1).layers[0].animation.frame.angles[0],180);
  assert.deepEqual(h.writes.slice(1,-1).map(w=>w.data.at(-1)),[0,10,20,30,40]);assert.equal(countFrames(h),5);assert.ok(bridge.frames.every(f=>f.closed));
  assert.equal(bridge.encoder.state,'closed');assert.equal(h.events.filter(e=>e[0]==='finish').length,1);assert.equal(h.exporter.recorder,null);assert.equal(h.exporter.exporting,false);
  assert.equal(h.renderer.published.time,.025);assert.deepEqual(h.original,h.before);assert.deepEqual(h.source,h.initial);
});
test('tour WebM cannot create an immutable frame until fine multi-layer preparation returns',async()=>{
  const g=gate(),bridge=encoderBridge(),h=fixture({wait:()=>g.promise,recordVideo:bridge.recordVideo}),exported=h.exporter.export('webm',{fps:10});
  await until(()=>h.events.some(e=>e[0]==='prepare'));assert.equal(bridge.frames.length,0);assert.equal(countFrames(h),0);g.resolve();await exported;assert.equal(bridge.frames.length,5);
});
test('a delayed prior encoded timestamp cannot acknowledge the tour terminal pose or publish native output',async()=>{
  const bridge=encoderBridge({timestamp:f=>f.pose===.4?300000:f.timestamp}),h=fixture({recordVideo:bridge.recordVideo});await h.renderer.apply(.025);
  await assert.rejects(h.exporter.export('webm',{fps:10}),/unrelated pose/);assert.equal(countFrames(h),4);assert.equal(h.events.filter(e=>e[0]==='abort').length,1);
  assert.equal(h.events.some(e=>e[0]==='finish'),false);assert.equal(h.renderer.published.time,.025);assert.deepEqual(h.original,h.before);assert.deepEqual(h.source,h.initial);assert.equal(h.exporter.exporting,false);
});
test('an omitted terminal output after successful encoder flush is refused rather than counted as complete',async()=>{
  const bridge=encoderBridge({omitPose:.4}),h=fixture({recordVideo:bridge.recordVideo});await assert.rejects(h.exporter.export('webm',{fps:10}),/omitted a submitted source pose/);
  assert.equal(countFrames(h),4);assert.equal(h.events.filter(e=>e[0]==='abort').length,1);assert.equal(h.events.some(e=>e[0]==='finish'),false);assert.ok(bridge.frames.every(f=>f.closed));assert.equal(bridge.encoder.state,'closed');
});
test('tour WebM incomplete fine preparation refuses before frame submission and aborts its metadata staging',async()=>{
  const bridge=encoderBridge(),h=fixture({recordVideo:bridge.recordVideo});h.renderer.incomplete=true;
  await assert.rejects(h.exporter.export('webm',{fps:10}),/complete fine/);assert.equal(bridge.frames.length,0);assert.equal(countFrames(h),0);assert.equal(bridge.encoder.state,'closed');assert.ok(h.events.some(e=>e[0]==='abort'));
});
test('cancelled WebM fine preparation settles before native staging removal and leaves the original bank untouched',async()=>{
  const g=gate(),bridge=encoderBridge(),h=fixture({wait:()=>g.promise,recordVideo:bridge.recordVideo}),exported=h.exporter.export('webm',{fps:10}),rejected=assert.rejects(exported,/cancel/i);
  await until(()=>h.events.some(e=>e[0]==='prepare'));h.exporter.cancel();assert.equal(h.events.some(e=>e[0]==='abort'),false);g.resolve();await rejected;
  assert.equal(bridge.frames.length,0);assert.equal(countFrames(h),0);assert.equal(h.events.filter(e=>e[0]==='abort').length,1);assert.equal(h.exporter.exporting,false);assert.deepEqual(h.original,h.before);
});
test('tour WebM new owner during delayed native write receives no obsolete preview restore',async()=>{
  const bridge=encoderBridge(),h=fixture({recordVideo:bridge.recordVideo});await h.renderer.apply(.025);const write=h.api.animationWrite;let changed=false;
  h.api.animationWrite=async(...args)=>{await write(...args);if(!changed){changed=true;h.changeOwner();h.source.view={newUserView:true};}};
  await assert.rejects(h.exporter.export('webm',{fps:10}),/cancel/i);assert.deepEqual(h.source.view,{newUserView:true});assert.equal(h.renderer.published.time,.025);
  assert.equal(h.events.filter(e=>e[0]==='abort').length,1);assert.equal(h.events.some(e=>e[0]==='finish'),false);assert.equal(bridge.frames.length,0);assert.equal(h.exporter.exporting,false);
});
test('tour WebM keeps its literal fractional endpoint independent of the encoder nominal frame rate',async()=>{
  const bridge=encoderBridge(),h=fixture({recordVideo:bridge.recordVideo});
  // The prepared timeline is immutable. Use a real independently prepared bank
  // with a final hold that puts the source endpoint off the 10fps grid.
  const input=bank();input.events[1].duration=.115;h.renderer.timeline=prepareAnimatedTourTimeline(input);
  await h.exporter.export('webm',{fps:10});assert.deepEqual(bridge.frames.map(f=>f.timestamp),[0,100000,200000,300000,400000,415000]);
  assert.equal(bridge.frames.at(-1).duration,100000);assert.equal(bridge.frames.at(-1).layers[0].animation.frame.angles[0],180);assert.equal(countFrames(h),6);
});
