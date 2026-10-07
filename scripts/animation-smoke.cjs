/** Electron integration checks: run after npm run build. Dialog choices are
 * substituted only in the test process; production still uses native dialogs. */
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');

async function main(){
  await require('./layer-join-smoke.cjs').guardRuntime();
  const {_electron:electron}=require('playwright');
  const artifacts=path.join(root,'artifacts');await fs.mkdir(artifacts,{recursive:true});
  const packaged=process.env.POLYTOPE_TEST_EXECUTABLE;
  const output=await fs.mkdtemp(path.join(artifacts,packaged?'animation-packaged-smoke-':'animation-smoke-'));
  const profile=path.join(output,'profile');await fs.mkdir(profile);
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  if(packaged)env.POLYTOPE_PYTHON='C:\\unavailable-development-python.exe';
  const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);
  const errors=[],checks=[];let videoProof;page.on('pageerror',error=>{errors.push(error.message);console.error('Renderer:',error.message);});
  await page.evaluate(()=>{window.animationEncoderDiagnostic={videoEncoder:typeof VideoEncoder,videoFrame:typeof VideoFrame};});
  const saveDialog=file=>app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},file);
  async function change(id,value){await page.locator(id).fill(String(value));await page.locator(id).dispatchEvent('change');}
  async function openAnimation(){if(!await page.locator('#animation-settings').evaluate(element=>element.open))await page.locator('#animation-settings > summary').click();}
  async function waitDone(file){await page.waitForFunction(path=>document.getElementById('animation-progress').textContent.includes('Exported '+path),file);await page.waitForFunction(()=>!document.getElementById('animation-png').disabled);}
  try{
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    await page.waitForFunction(()=>document.getElementById('animation-play')&&!document.getElementById('animation-controls').hidden);
    await openAnimation();
    await change('#animation-duration',.25);await change('#animation-fps',8);
    await page.locator('#animation-plane').selectOption('2');await page.locator('#animation-turns').fill('.125');await page.locator('#animation-rotation').click();
    await page.locator('#animation-end').click();
    await page.waitForFunction(()=>document.getElementById('animation-position').textContent.startsWith('0.250'));
    assert.ok(Math.abs(Number(await page.locator('#plane-2').inputValue())-69)<1e-6);
    await page.locator('#animation-start').click();await page.locator('#animation-play').click();
    await page.waitForFunction(()=>document.getElementById('animation-play').textContent==='Play'&&document.getElementById('animation-position').textContent.startsWith('0.250'));
    checks.push('4D rotation endpoints and time-based playback');
    const frames=path.join(output,'rotation.frames');await saveDialog(frames);await page.locator('#animation-png').click();await waitDone(frames);
    const frameFiles=(await fs.readdir(frames)).filter(file=>file.endsWith('.png'));assert.equal(frameFiles.length,3);
    const manifest=JSON.parse(await fs.readFile(path.join(frames,'sequence.json'),'utf8'));assert.deepEqual(manifest.frameTimes,[0,.125,.25]);
    const first=await fs.readFile(path.join(frames,frameFiles[0])),last=await fs.readFile(path.join(frames,frameFiles.at(-1)));assert.notDeepEqual(first,last);
    checks.push('PNG exports exact start/end frame times and differing poses');
    const projectFile=path.join(output,'animation.polyproj');await saveDialog(projectFile);await page.locator('#save').click();
    await page.waitForFunction(path=>document.getElementById('status').textContent.startsWith('Saved '+path),projectFile);
    const project=JSON.parse(await fs.readFile(projectFile,'utf8')),active=project.documents[project.active],saved=active.states[active.cursor].view.animation;
    assert.equal(saved.version,1);assert.equal(saved.duration,.25);assert.equal(saved.keyframes[1].angles[2],69);checks.push('animation tracks persisted in full project view state');
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},projectFile);
    const reopened=await page.evaluate(async()=>{const result=await window.polytope.open(),doc=result.project.documents[result.project.active];return doc.states[doc.cursor].view.animation;});
    assert.deepEqual(reopened,saved);checks.push('saved animation tracks reopen intact through geometry engine');
    await openAnimation();
    await change('#animation-duration',1);
    await page.locator('#animation-settings > summary').click();
    await page.locator('#viewport-layout').selectOption('split');
    await page.locator('#section-normal').fill('0.3, 0.5, 0.7, 1');await page.locator('#apply-section').click();
    await page.waitForFunction(()=>document.getElementById('derived-status').textContent.includes('vertices')&&document.getElementById('status').textContent.startsWith('Evaluate section completed'));
    await openAnimation();
    await page.locator('#animation-section').click();
    const sections=path.join(output,'section.frames');await saveDialog(sections);await page.locator('#animation-png').click();await waitDone(sections);
    assert.equal((await fs.readdir(sections)).filter(file=>file.endsWith('.png')).length,9);
    const sectionStart=await fs.readFile(path.join(sections,'frame-000000.png')),sectionMiddle=await fs.readFile(path.join(sections,'frame-000004.png'));assert.notDeepEqual(sectionStart,sectionMiddle);
    checks.push('section depth sweep captures computed derived sections');
    await page.locator('#animation-target').selectOption('base');await change('#animation-duration',.1);await change('#animation-fps',10);await page.locator('#animation-rotation').click();
    // A transform keeps the capture source's dimensions while putting it fully
    // outside the visible window. Export must render even without screen paint.
    await page.locator('#base-canvas canvas').evaluate(element=>{element.style.transform='translateY(-300vh)';});
    const video=path.join(output,'rotation.webm');await saveDialog(video);await page.locator('#animation-webm').click();await waitDone(video);
    const videoBytes=await fs.readFile(video);assert.equal(videoBytes.readUInt32BE(0),0x1a45dfa3);assert.ok(videoBytes.length>1000);checks.push('short WebM video starts its encoder and captures valid content with the source canvas fully offscreen');
    await page.locator('#base-canvas canvas').evaluate(element=>{element.style.transform='';});
    const expectedVideo=path.join(output,'video-expected.frames');await saveDialog(expectedVideo);await page.locator('#animation-png').click();await waitDone(expectedVideo);
    // Container bytes alone do not prove that the submitted final pose was
    // encoded. Independently decode every frame and compare all PNG references.
    const {spawnSync}=require('node:child_process'),ffprobe=process.env.POLYTOPE_FFPROBE||'ffprobe',ffmpeg=process.env.POLYTOPE_FFMPEG||'ffmpeg';
    const run=(command,args)=>{const r=spawnSync(command,args,{windowsHide:true,timeout:30000,maxBuffer:64*1024*1024});if(r.error)throw r.error;assert.equal(r.status,0,String(r.stderr));return r.stdout;};
    const expectedManifest=JSON.parse(await fs.readFile(path.join(expectedVideo,'sequence.json'),'utf8'));
    assert.deepEqual(expectedManifest.frameTimes,[0,.1]);
    const probe=JSON.parse(run(ffprobe,['-v','error','-select_streams','v:0','-count_frames','-show_frames','-show_entries','stream=codec_name,width,height,nb_read_frames:frame=pts_time','-of','json',video]).toString()),stream=probe.streams[0];
    assert.equal(stream.codec_name,'vp8');assert.equal(Number(stream.nb_read_frames),expectedManifest.frameCount);
    assert.deepEqual(probe.frames.map(f=>Number(f.pts_time)),expectedManifest.frameTimes);
    const raw=run(ffmpeg,['-v','error','-i',video,'-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgb24','pipe:1']),size=stream.width*stream.height*3;
    assert.equal(raw.length,size*expectedManifest.frameCount);
    const referenceFiles=(await fs.readdir(expectedVideo)).filter(f=>f.endsWith('.png')).sort(),referencePixels=referenceFiles.map(f=>run(ffmpeg,['-v','error','-i',path.join(expectedVideo,f),'-f','rawvideo','-pix_fmt','rgb24','pipe:1']));
    assert.equal(referenceFiles.length,expectedManifest.frameCount);referencePixels.forEach(p=>assert.equal(p.length,size));
    const poseEndpoints=require('./video-pose-endpoint-proof.cjs').provePoseEndpoints({first:raw.subarray(0,size),last:raw.subarray(raw.length-size),references:referencePixels});
    videoProof={qualified:true,codec:stream.codec_name,width:stream.width,height:stream.height,decodedFrameCount:Number(stream.nb_read_frames),decodedSourceTimes:probe.frames.map(f=>Number(f.pts_time)),referenceManifest:expectedManifest,poseEndpoints};
    checks.push('offscreen WebM decodes exact source timestamps and uniquely matching independent PNG endpoint poses');
    await change('#animation-duration',10);await change('#animation-fps',20);
    const cancelled=path.join(output,'cancelled.frames');await saveDialog(cancelled);await page.locator('#animation-png').click();
    await page.waitForFunction(()=>document.getElementById('animation-progress').textContent.startsWith('Frame '));await page.locator('#animation-cancel').click();
    await page.waitForFunction(()=>document.getElementById('animation-progress').textContent==='Animation export cancelled.'&&!document.getElementById('animation-png').disabled);
    await assert.rejects(()=>fs.access(cancelled));assert.equal((await fs.readdir(output)).filter(file=>file.startsWith('.polytope-animation-')).length,0);checks.push('cancel removes staging files without publishing incomplete frames');
    const switched=path.join(output,'switched.frames');await saveDialog(switched);await page.locator('#animation-png').click();
    await page.waitForFunction(()=>document.getElementById('animation-progress').textContent.startsWith('Frame '));
    await page.locator('[data-key="cube"]').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');
    await page.waitForFunction(()=>!document.getElementById('animation-png').disabled);await assert.rejects(()=>fs.access(switched));checks.push('document switch cancels in-flight export without publishing frames');
    await openAnimation();
    assert.equal(await page.locator('#animation-controls').isVisible(),true);await change('#animation-duration',.2);await change('#animation-fps',10);await page.locator('#animation-plane').selectOption('3');await page.locator('#animation-rotation').click();await page.locator('#animation-end').click();
    await page.waitForFunction(()=>document.getElementById('animation-position').textContent.startsWith('0.200'));
    checks.push('3D models expose supported rotation plane animation');
    await page.waitForFunction(()=>document.getElementById('derived-status').textContent.includes('vertices')&&!document.getElementById('analysis').textContent.includes('4D content'));
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1600,1300));
    await page.locator('.workspace').evaluate(element=>{element.scrollTop=0;});
    await page.screenshot({path:path.join(output,'animation-workspace.png')});assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:true,packaged:Boolean(packaged),version:await app.evaluate(({app})=>app.getVersion()),checks,videoProof,pageErrors:errors},null,2));
    console.log(`Animation ${packaged?'packaged ':''}smoke passed: ${checks.length} checks. Artifacts: ${output}`);
  }catch(error){
    const diagnostic=await page.evaluate(()=>({status:document.getElementById('status')?.textContent,position:document.getElementById('animation-position')?.textContent,duration:document.getElementById('animation-duration')?.value,fps:document.getElementById('animation-fps')?.value,progress:document.getElementById('animation-progress')?.textContent,toast:document.getElementById('toast')?.textContent,encoder:window.animationEncoderDiagnostic})).catch(()=>null);
    console.error('Animation diagnostic:',JSON.stringify(diagnostic));await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error;
  }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
