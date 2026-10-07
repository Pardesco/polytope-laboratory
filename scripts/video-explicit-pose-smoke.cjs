// Root-only actual browser codec qualification of the frozen development module.
// This does not qualify native staging or the shipped animated-tour integration.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),hash=b=>createHash('sha256').update(b).digest('hex');
async function main(){
  const runtime=await require('./layer-join-smoke.cjs').guardRuntime();
  assert.equal(runtime.hidden,false,'This root harness requires explicitly authorized visible execution.');
  assert.equal(runtime.packaged!==undefined,true,'Use the retained unpacked desktop candidate.');
  const ffmpeg=process.env.POLYTOPE_FFMPEG||'ffmpeg',ffprobe=process.env.POLYTOPE_FFPROBE||'ffprobe';
  function run(command,args,maxBuffer=64*1024*1024){const r=spawnSync(command,args,{windowsHide:true,timeout:30000,maxBuffer});if(r.error)throw r.error;assert.equal(r.status,0,String(r.stderr));return r.stdout;}
  run(ffmpeg,['-version']);run(ffprobe,['-version']);
  const inputs=['scripts/video-explicit-pose-smoke.cjs','scripts/video-pose-endpoint-proof.cjs','scripts/video-endpoint-proof.cjs',
    'development/video-export-integration-0.21/video-recorder.mjs','development/video-export-integration-0.21/vp8-webm.mjs'];
  const references=path.join(root,'artifacts/desktop-qualification-rY2gcg/animatedTours/animated-tours-packaged-0Audu7/tour.frames');
  inputs.push(...Array.from({length:7},(_,i)=>path.relative(root,path.join(references,`frame-${String(i).padStart(6,'0')}.png`))),path.relative(root,path.join(references,'sequence.json')));
  async function snapshot(){return Object.fromEntries(await Promise.all(inputs.map(async f=>[f,hash(await fs.readFile(path.join(root,f)))])));}
  const before=await snapshot(),folder=await fs.mkdtemp(path.join(root,'artifacts/video-explicit-pose-browser-'));
  const sequence=JSON.parse(await fs.readFile(path.join(references,'sequence.json'),'utf8'));
  assert.deepEqual(sequence.frameTimes,[0,.125,.25,.375,.5,.625,.75]);assert.equal(sequence.frameCount,7);assert.equal(sequence.fps,8);
  const images=await Promise.all(Array.from({length:7},async(_,i)=>'data:image/png;base64,'+(await fs.readFile(path.join(references,`frame-${String(i).padStart(6,'0')}.png`))).toString('base64')));
  const moduleUrl=pathToFileURL(path.join(root,'development/video-export-integration-0.21/video-recorder.mjs')).href;
  const html=path.join(folder,'codec.html'),script=path.join(folder,'codec.mjs'),video=path.join(folder,'explicit-poses.webm'),profile=path.join(folder,'profile');
  await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  await fs.writeFile(html,'<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; img-src \'self\' data:"><title>Explicit pose codec qualification</title></head><body><p id="status">Preparing real browser codec qualification</p><canvas id="canvas"></canvas><script type="module" src="./codec.mjs"></script></body></html>');
  await fs.writeFile(script,`import {recordRenderedVideo} from ${JSON.stringify(moduleUrl)};
const urls=${JSON.stringify(images)},times=${JSON.stringify(sequence.frameTimes)};
window.ready=(async()=>{
 const images=await Promise.all(urls.map(async url=>{const img=new Image();img.src=url;await img.decode();return img;}));
 const canvas=document.getElementById('canvas');canvas.width=images[0].naturalWidth;canvas.height=images[0].naturalHeight;
 const context=canvas.getContext('2d',{alpha:false});
 if(!context||images.some(img=>img.naturalWidth!==canvas.width||img.naturalHeight!==canvas.height))throw Error('Invalid pose images.');
 const draw=index=>context.drawImage(images[index],0,0);
 window.capture=()=>recordRenderedVideo({canvas,fps:8,frameCount:7,frameTimes:times,renderFrame:draw,
  writeChunk:(index,bytes)=>window.appendVideoChunk(index,Array.from(bytes)),progress:value=>document.getElementById('status').textContent=String(value)});
 window.cancelCapture=async()=>{let control,writes=0;try{
   await recordRenderedVideo({canvas,fps:8,frameCount:7,frameTimes:times,renderFrame:index=>{draw(index);if(index===2)control.stop();},
    writeChunk:()=>{writes++;},onRecorder:value=>{control=value;}});
   throw Error('Cancellation unexpectedly succeeded.');
 }catch(error){if(error.name!=='AbortError')throw error;return {name:error.name,writes,controlReleased:control===null};}};
 return {width:canvas.width,height:canvas.height,videoEncoder:typeof VideoEncoder,videoFrame:typeof VideoFrame};
})();window.ready.catch(error=>{document.getElementById('status').textContent=error.stack;});`);
  await fs.writeFile(video,Buffer.alloc(0),{flag:'wx'});
  const {_electron:electron}=require('playwright');
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile,POLYTOPE_PYTHON:path.join(folder,'unavailable-development-python.exe')};delete env.ELECTRON_RUN_AS_NODE;
  let app,chunkCount=0,bytes=0;const errors=[],started=Date.now();
  const proof={format:'polytope-explicit-pose-browser-component-proof',version:1,passed:false,scope:'Actual Chromium VideoEncoder and VP8 WebM mux component; independent previously captured GPU PNG poses. Shipped animated-tour integration/native staging/release remain unqualified.',folder,runtime,sourceBefore:before,referenceSequence:sequence,errors};
  try{
    app=await electron.launch({executablePath:runtime.packaged,args:[],cwd:root,env,timeout:30000});
    const mainPage=await app.firstWindow();mainPage.on('pageerror',e=>errors.push(e.message));
    await mainPage.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract',{},{timeout:30000});
    const next=app.waitForEvent('window',{timeout:30000});
    await app.evaluate(async({BrowserWindow},file)=>{globalThis.explicitPoseWindow=new BrowserWindow({show:true,width:1000,height:720,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await globalThis.explicitPoseWindow.loadFile(file);},html);
    const page=await next;page.on('pageerror',e=>errors.push(e.message));
    await page.exposeFunction('appendVideoChunk',async(index,data)=>{
      assert.equal(index,chunkCount);assert.ok(Array.isArray(data)&&data.length>0&&data.length<=32*1024*1024);assert.ok(data.every(x=>Number.isInteger(x)&&x>=0&&x<=255));
      bytes+=data.length;assert.ok(bytes<=64*1024*1024);await fs.appendFile(video,Buffer.from(data));chunkCount++;
    });
    const options=await app.evaluate(()=>{const p=globalThis.explicitPoseWindow.webContents.getLastWebPreferences();return {sandbox:p.sandbox,contextIsolation:p.contextIsolation,nodeIntegration:p.nodeIntegration};});
    assert.deepEqual(options,{sandbox:true,contextIsolation:true,nodeIntegration:false});proof.browserSecurity=options;
    const ready=await page.evaluate(()=>window.ready);proof.browserCapabilities=ready;assert.equal(ready.videoEncoder,'function');assert.equal(ready.videoFrame,'function');
    proof.recording=await page.evaluate(()=>window.capture());assert.equal(proof.recording.submittedFrames,7);assert.equal(proof.recording.encodedFrames,7);
    assert.deepEqual(proof.recording.timestamps,sequence.frameTimes.map(t=>t*1e6));assert.equal(proof.recording.bytes,bytes);
    proof.cancellation=await page.evaluate(()=>window.cancelCapture());assert.equal(proof.cancellation.name,'AbortError');assert.equal(proof.cancellation.controlReleased,true);assert.ok(proof.cancellation.writes>=1);
    const probe=JSON.parse(run(ffprobe,['-v','error','-select_streams','v:0','-count_frames','-show_frames','-show_entries','stream=codec_name,width,height,nb_read_frames:frame=pts_time','-of','json',video]).toString());
    const stream=probe.streams[0];assert.equal(stream.codec_name,'vp8');assert.equal(Number(stream.nb_read_frames),7);assert.equal(stream.width,ready.width);assert.equal(stream.height,ready.height);
    const decodedTimes=probe.frames.map(f=>Number(f.pts_time));assert.deepEqual(decodedTimes,sequence.frameTimes);proof.probe=probe;
    const raw=run(ffmpeg,['-v','error','-i',video,'-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgb24','pipe:1']),size=ready.width*ready.height*3;assert.equal(raw.length,size*7);
    const pngs=Array.from({length:7},(_,i)=>run(ffmpeg,['-v','error','-i',path.join(references,`frame-${String(i).padStart(6,'0')}.png`),'-f','rawvideo','-pix_fmt','rgb24','pipe:1']));pngs.forEach(p=>assert.equal(p.length,size));
    proof.poseEndpoints=require('./video-pose-endpoint-proof.cjs').provePoseEndpoints({first:raw.subarray(0,size),last:raw.subarray(size*6,size*7),references:pngs});
    proof.allPoses=Array.from({length:7},(_,index)=>{const pixels=raw.subarray(index*size,(index+1)*size),errors=pngs.map(p=>{let sum=0;for(let j=0;j<size;j++)sum+=Math.abs(pixels[j]-p[j]);return sum/size;}),sorted=errors.map((error,index)=>({error,index})).sort((a,b)=>a.error-b.error);assert.equal(sorted[0].index,index);assert.ok(sorted[1].error-sorted[0].error>1e-12);assert.ok(errors[index]<5);return {index,sourceTime:sequence.frameTimes[index],decodedTime:decodedTimes[index],closestReference:sorted[0].index,allReferenceMeanRgbErrors:errors};});
    assert.deepEqual(errors,[]);proof.video={file:video,sha256:hash(await fs.readFile(video)),bytes,chunkCount};proof.passed=true;
  }catch(error){proof.failure=error.stack;throw error;}
  finally{
    if(app)await app.close();proof.elapsedMilliseconds=Date.now()-started;proof.sourceAfter=await snapshot();
    proof.runtimeAfter=await require('./hidden-runtime.cjs').hiddenRuntime();
    proof.inputsUnchanged=JSON.stringify(proof.sourceBefore)===JSON.stringify(proof.sourceAfter)&&JSON.stringify(runtime.runtime)===JSON.stringify(proof.runtimeAfter);
    if(!proof.inputsUnchanged)proof.passed=false;
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({passed:proof.passed,result:path.join(folder,'result.json'),failure:proof.failure}));assert.equal(proof.inputsUnchanged,true);
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
