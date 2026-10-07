import test from 'node:test';
import assert from 'node:assert/strict';
import {recordRenderedVideo} from '../ui/video-recorder.mjs';
import {VP8WebmWriter} from '../ui/vp8-webm.mjs';
import {WebmFrameCounter} from '../ui/webm-frames.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function fixture(options={}){
  const canvas={width:32,height:24,pose:null},snapshots=[],closedFrames=[],writes=[],events=[];
  let encoder,control=null;
  class Frame{
    constructor(source,init){this.pose=source.pose;this.timestamp=init.timestamp;this.duration=init.duration;this.closed=false;snapshots.push(this);}
    close(){this.closed=true;closedFrames.push(this.timestamp);}
  }
  class Encoder{
    static async isConfigSupported(config){return {supported:options.supported!==false,config};}
    constructor(init){encoder=this;this.init=init;this.queue=[];this.state='unconfigured';this.flushes=0;}
    configure(config){this.state='configured';this.config=config;}
    encode(frame,opts){assert.equal(frame.closed,false);this.queue.push({pose:frame.pose,timestamp:frame.timestamp,duration:frame.duration,type:opts.keyFrame?'key':'delta'});options.onEncode?.(this.queue.at(-1),canvas,control);}
    async flush(){this.flushes++;events.push(['flush',this.queue.map(f=>f.pose)]);await tick();await tick();
      if(options.hang)return new Promise(()=>{});
      if(options.error){this.init.error(Error('Delayed encoder failure'));throw Error('Encoder flush failed');}
      while(this.queue.length){const frame=this.queue.shift();if(options.omit===frame.pose)continue;options.beforeOutput?.(frame,canvas,control);
        const bytes=Uint8Array.from([frame.pose]);
        const chunk={timestamp:options.timestamp?.(frame)??frame.timestamp,type:options.type?.(frame)??frame.type,
          byteLength:options.byteLength??bytes.length,copyTo(target){if(options.copyError)throw Error('Snapshot copy refused');target.set(bytes);}};
        this.init.output(chunk,{decoderConfig:{codec:options.codec??'vp8'}});if(options.duplicate)this.init.output(chunk);}
      events.push(['flushed']);}
    close(){this.state='closed';this.queue=[];events.push(['closed']);}
  }
  const args={canvas,Encoder,Frame,fps:8,frameCount:4,pollInterval:1,startupTimeout:100,wait:tick,
    renderFrame:async index=>{canvas.pose=index;events.push(['render',index]);},writeChunk:async(index,data)=>{await tick();writes.push({index,data:data.slice()});events.push(['write',index]);},
    onRecorder:value=>{control=value;events.push(['control',value?.state??null]);}};
  return {args,canvas,snapshots,closedFrames,writes,events,get encoder(){return encoder;},get control(){return control;}};
}

test('delayed codec emits immutable exact submitted poses after flush; canvas repaint cannot alias any endpoint',async()=>{
  const h=fixture({beforeOutput:(_,canvas)=>canvas.pose=99});const result=await recordRenderedVideo(h.args);
  assert.deepEqual(h.snapshots.map(f=>f.pose),[0,1,2,3]);assert.ok(h.snapshots.every(f=>f.closed));
  assert.deepEqual(result.timestamps,[0,125000,250000,375000]);assert.equal(result.encodedFrames,4);
  assert.equal(h.encoder.flushes,4);assert.equal(h.encoder.state,'closed');assert.equal(h.control,null);
  const count=new WebmFrameCounter();for(const w of h.writes)count.feed(w.data);assert.equal(count.frames,4);
  assert.deepEqual(h.writes.slice(1,-1).map(w=>w.data.at(-1)),[0,1,2,3]);
  assert.deepEqual(h.writes.map(w=>w.index),[0,1,2,3,4,5]);
  for(let frame=1;frame<4;frame++){
    const at=h.events.findIndex(e=>e[0]==='render'&&e[1]===frame);
    assert.ok(h.events.slice(0,at).some(e=>e[0]==='write'&&e[1]===frame),'Previous owned frame is drained before next render.');
  }
});

test('exact fractional source endpoint is passed as its own timestamp and duration instead of index/fps',async()=>{
  const h=fixture();h.args.frameTimes=[0,1/8,1/4,.26];const result=await recordRenderedVideo(h.args);
  assert.deepEqual(result.timestamps,[0,125000,250000,260000]);assert.deepEqual(h.snapshots.map(f=>f.duration),[125000,125000,10000,125000]);
});

test('each missing/duplicate/reordered output and changed codec is refused after explicit flush',async()=>{
  for(const options of [{omit:3},{duplicate:true},{timestamp:f=>f.timestamp+1},{type:()=> 'delta'},{codec:'vp9'},{copyError:true}]){
    const h=fixture(options);await assert.rejects(recordRenderedVideo(h.args),/omitted|duplicate|timestamp|initial|codec|copy/i);
    assert.equal(h.encoder.state,'closed');assert.equal(h.control,null);assert.ok(h.snapshots.every(f=>f.closed));
  }
});

test('one delayed prior output cannot satisfy a later submitted pose',async()=>{
  const h=fixture({timestamp:f=>f.pose===3?250000:f.timestamp});
  await assert.rejects(recordRenderedVideo(h.args),/unrelated pose/);
  assert.deepEqual(h.writes.slice(1).map(w=>w.data.at(-1)),[0,1,2]);
});

test('stop/cancel during pending codec work prevents late writes and releases frame resources',async()=>{
  const h=fixture({onEncode:(frame,canvas,control)=>{if(frame.pose===2)control.stop();}});
  await assert.rejects(recordRenderedVideo(h.args),/cancelled/);assert.equal(h.encoder.state,'closed');assert.equal(h.control,null);
  assert.deepEqual(h.writes.slice(1).map(w=>w.data.at(-1)),[0,1]);assert.ok(h.snapshots.every(f=>f.closed));
});

test('external source fence after awaited rendering refuses creating or submitting an obsolete frame',async()=>{
  const h=fixture();let owner=true;
  h.args.check=()=>{if(!owner)throw Error('Source ownership changed');};h.args.renderFrame=async()=>{await tick();owner=false;};
  await assert.rejects(recordRenderedVideo(h.args),/ownership changed/);assert.equal(h.snapshots.length,0);assert.equal(h.encoder.state,'closed');
});

test('native chunk writes retain ordering, settle before return, and cannot grow an unbounded encoder queue',async()=>{
  const h=fixture();let active=0,max=0;
  h.args.writeChunk=async(index,data)=>{active++;max=Math.max(max,active);await tick();await tick();h.writes.push({index,data:data.slice()});active--;};
  await recordRenderedVideo(h.args);assert.equal(active,0);assert.equal(max,1);assert.deepEqual(h.writes.map(w=>w.index),[0,1,2,3,4,5]);
});

test('writer failure and codec failure refuse publishing a completed stream',async()=>{
  for(const which of ['writer','codec']){const h=fixture(which==='codec'?{error:true}:{});
    if(which==='writer')h.args.writeChunk=async()=>{throw Error('Native write failed');};
    await assert.rejects(recordRenderedVideo(h.args),/write failed|encoder failure|flush failed/);assert.equal(h.encoder.state,'closed');assert.equal(h.control,null);}
});

test('encoder stalls have a bounded timeout without frame count substitution',async()=>{
  const h=fixture({hang:true});h.args.startupTimeout=5;
  await assert.rejects(recordRenderedVideo(h.args),/did not drain/);assert.equal(h.encoder.state,'closed');assert.equal(h.control,null);
});

test('unsupported WebCodecs refuses explicitly even when a legacy MediaRecorder exists',async()=>{
  const h=fixture({supported:false});await assert.rejects(recordRenderedVideo(h.args),/VP8 encoding is unavailable/);assert.equal(h.snapshots.length,0);
  await assert.rejects(recordRenderedVideo({...h.args,Encoder:undefined}),/WebCodecs/);
});

test('invalid dimensions/sampling/collapsed times/resource excess refuse before image submission',async()=>{
  for(const patch of [{fps:1.5},{fps:61},{frameCount:18002},{frameTimes:[0,0,.2,.3]},{frameTimes:[0,1e-9,.2,.3]},
    {canvas:{width:8193,height:24}},{canvas:{width:1,height:0}},{maximumBytes:512*1024*1024+1}]){
    const h=fixture();await assert.rejects(recordRenderedVideo({...h.args,...patch}));assert.equal(h.snapshots.length,0);
  }
  const h=fixture();h.args.maximumBytes=32;await assert.rejects(recordRenderedVideo(h.args),/output size/);assert.equal(h.snapshots.length,0);
  const large=fixture({byteLength:32*1024*1024});await assert.rejects(recordRenderedVideo(large.args),/chunk budget/);
});

test('dimension change after renderer await refuses a mixed-resolution stream',async()=>{
  const h=fixture();h.args.renderFrame=async index=>{h.canvas.pose=index;if(index===1)h.canvas.width++;};
  await assert.rejects(recordRenderedVideo(h.args),/dimensions changed/);assert.equal(h.snapshots.length,1);assert.ok(h.snapshots[0].closed);
});

test('bounded WebM writer enforces monotone literal timestamp ownership and first keyframe',()=>{
  const make=()=>new VP8WebmWriter({width:32,height:24,fps:8,timestamps:[0,125000],durations:[125000,125000]});
  const a=make();assert.throws(()=>a.frame({timestamp:0,type:'key',data:Uint8Array.of(0)}),/Unexpected/);a.begin();
  assert.throws(()=>a.frame({timestamp:0,type:'delta',data:Uint8Array.of(0)}),/keyframe/);
  a.frame({timestamp:0,type:'key',data:Uint8Array.of(0)});assert.throws(()=>a.finish(),/incomplete/);
  assert.throws(()=>a.frame({timestamp:1,type:'delta',data:Uint8Array.of(1)}),/timestamp/);
  a.frame({timestamp:125000,type:'delta',data:Uint8Array.of(1)});a.finish();assert.throws(()=>a.finish(),/incomplete/);
});
