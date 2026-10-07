/** Development-only replacement: immutable per-pose VideoFrame ownership,
 * explicit timestamps, one bounded encoder flush per frame, ordered native
 * writes. CanvasCapture/MediaRecorder block counts are NOT pose acknowledgments.
 * No automatic fallback to the known-unqualified 0.20 path. */
import {VP8WebmWriter} from './vp8-webm.mjs';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const abort=()=>Object.assign(Error('Video export cancelled or superseded.'),{name:'AbortError'});
const require=(test,message)=>{if(!test)throw Error(message);};

export async function recordRenderedVideo({canvas,fps,frameCount,frameTimes,renderFrame,writeChunk,check=()=>{},progress=()=>{},onRecorder=()=>{},
  Encoder=globalThis.VideoEncoder,Frame=globalThis.VideoFrame,wait=sleep,startupTimeout=10000,pollInterval=20,maximumBytes=512*1024*1024}){
  require(typeof Encoder==='function'&&typeof Encoder.isConfigSupported==='function'&&typeof Frame==='function',
    'Explicit-pose WebCodecs video encoding is unavailable. Export PNG frames instead.');
  require(Number.isSafeInteger(fps)&&fps>=1&&fps<=60&&Number.isSafeInteger(frameCount)&&frameCount>=1&&frameCount<=18001,'Invalid bounded video sampling.');
  require(typeof renderFrame==='function'&&typeof writeChunk==='function'&&Number.isFinite(startupTimeout)&&startupTimeout>0&&startupTimeout<=10000&&
    Number.isFinite(pollInterval)&&pollInterval>0&&pollInterval<=1000,'Invalid video callbacks or timeout.');
  const times=frameTimes===undefined?Array.from({length:frameCount},(_,i)=>i/fps):frameTimes;
  require(Array.isArray(times)&&times.length===frameCount&&times[0]===0&&times.every((t,i)=>Number.isFinite(t)&&t>=0&&t<=300&&(!i||t>times[i-1])),
    'Video requires absolute ordered source times starting at zero.');
  const timestamps=times.map(t=>Math.round(t*1e6));
  require(timestamps.every((t,i)=>!i||t>timestamps[i-1]),'Requested poses cannot be distinguished at the encoder microsecond time resolution. Export PNG frames instead.');
  const durations=timestamps.map((t,i)=>i+1<frameCount?timestamps[i+1]-t:Math.max(1,Math.round(1e6/fps)));
  const width=canvas?.width,height=canvas?.height;
  const writer=new VP8WebmWriter({width,height,fps,timestamps,durations,maximumBytes});
  let encoder=null,closed=false,cancelled=false,failure=null,pending=Promise.resolve(),chunkIndex=0,queuedBytes=0,submitted=0,encoded=0;
  const guard=()=>{check();if(cancelled)throw abort();if(failure)throw failure;};
  async function bounded(promise,label,{cleanup=false}={}){
    let settled=false,value,error;
    Promise.resolve(promise).then(v=>{value=v;settled=true;},e=>{error=e;settled=true;});
    const deadline=Date.now()+startupTimeout;
    while(!settled){if(!cleanup)guard();if(Date.now()>=deadline)throw Error(label);await wait(pollInterval);}
    if(error)throw error;if(!cleanup)guard();return value;
  }
  function stop(){if(cancelled||closed)return;cancelled=true;try{encoder?.close();}catch{};}
  const control={get state(){return closed||cancelled?'inactive':'recording';},stop};
  function enqueue(data){
    guard();queuedBytes+=data.length;require(queuedBytes<=64*1024*1024,'Video writer cannot keep up with encoding.');
    pending=pending.then(async()=>{guard();await writeChunk(chunkIndex++,data);guard();queuedBytes-=data.length;});
    // Install a rejection handler immediately; the retained promise is still
    // awaited before advancing or disposing native staging ownership.
    pending.catch(error=>{failure??=error;});
  }
  try{
    guard();
    const config={codec:'vp8',width,height,bitrate:6000000,framerate:fps,latencyMode:'quality',hardwareAcceleration:'no-preference'};
    const support=await bounded(Encoder.isConfigSupported(config),'Video encoder capability query did not finish.');
    require(support?.supported===true,'Explicit-pose VP8 encoding is unavailable. Export PNG frames instead.');
    encoder=new Encoder({output(chunk,metadata){
      if(closed||cancelled||failure)return;
      try{
        guard();require(encoded<submitted&&chunk.timestamp===timestamps[encoded], 'Encoder emitted a duplicate, missing, reordered or unrelated pose.');
        require(Number.isSafeInteger(chunk.byteLength)&&chunk.byteLength>0&&chunk.byteLength<=32*1024*1024-1024,'Encoded frame exceeds the chunk budget.');
        require(metadata?.decoderConfig?.codec===undefined||metadata.decoderConfig.codec==='vp8','Encoder changed the supported video codec.');
        const bytes=new Uint8Array(chunk.byteLength);chunk.copyTo(bytes);
        enqueue(writer.frame({timestamp:chunk.timestamp,type:chunk.type,data:bytes}));encoded++;
      }catch(error){failure=error;try{encoder?.close();}catch{}}
    },error(error){failure=error instanceof Error?error:Error('Video encoder failed.');}});
    encoder.configure(config);onRecorder(control);progress('Preparing explicit-pose video encoder...');
    enqueue(writer.begin());await bounded(pending,'Video header write did not finish.');
    for(let index=0;index<frameCount;index++){
      guard();await renderFrame(index);guard();
      require(canvas.width===width&&canvas.height===height,'Video canvas dimensions changed during export.');
      let frame;
      try{
        // VideoFrame(ImageBitmap/CanvasImageSource) retains its own media
        // resource. Later canvas draws cannot substitute another pose.
        frame=new Frame(canvas,{timestamp:timestamps[index],duration:durations[index],alpha:'discard'});
        guard();submitted++;encoder.encode(frame,{keyFrame:index===0||index%Math.max(1,2*fps)===0});
      }finally{frame?.close();}
      // Unlike requestData(), flush explicitly drains the underlying codec's
      // pending output for all submitted VideoFrames. Verify timestamp coverage
      // AFTER flush; a delayed prior chunk alone never acknowledges this pose.
      await bounded(encoder.flush(),'Video encoder did not drain the submitted pose.');
      require(encoded===submitted,'Encoder flush omitted a submitted source pose.');
      await bounded(pending,'Encoded video write did not finish.');guard();progress(index+1);
    }
    enqueue(writer.finish());await bounded(pending,'Video index write did not finish.');guard();
    return {method:'webcodecs-vp8',submittedFrames:submitted,encodedFrames:encoded,timestamps:timestamps.slice(),
      sourceTimes:times.slice(),terminalHoldMicroseconds:durations.at(-1),bytes:writer.total};
  }finally{
    closed=true;try{encoder?.close();}catch{}
    try{await bounded(pending,'Pending native video write did not settle during cleanup.',{cleanup:true});}
    finally{onRecorder(null);}
  }
}
