// Lead-run hidden desktop qualification. --self-test never imports Electron.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),os=require('node:os');
const {verifySequence,verifyMedia,inspectBuffer,toolsAvailable}=require('./media-verifier.cjs');
const root=path.resolve(__dirname,'..'),hash=b=>createHash('sha256').update(b).digest('hex');
const active=p=>{const d=p.documents[p.active];return d.states[d.cursor];};
const FROZEN=['ui/animation.mjs','ui/animation-controls.mjs','ui/animation-track-controls.mjs','ui/animation-v4-view.mjs','ui/video-recorder.mjs','ui/vp8-webm.mjs','ui/avc-mp4.mjs','ui/gif-encoder.mjs','ui/media-export-options.mjs','ui/animated-tour-export.mjs','ui/animated-tour-renderer.mjs','desktop/animation-export.cjs'];
const CASES=[['rotation3','cube','base'],['rotation4','tesseract','base'],['section4','tesseract','section'],['fold3','fold','net'],['morph-snub3','morph','base'],['camera-v4','tesseract','base'],['projection-v4','tesseract','base'],['opacity-v4','tesseract','base'],['sectionNormal-v4','tesseract','section'],['tour','tour','tour']];
function scenarioProject(seed,name){
  const project=structuredClone(seed),state=active(project),view=state.view;delete project.tour;
  const frame=time=>({time,angles:[0,0,0,0,0,0],sectionOffset:0});
  const sequence={version:1,duration:.26,fps:8,loop:false,keyframes:[frame(0),frame(.26)]},[start,end]=sequence.keyframes;
  view.animation=sequence;view.viewportLayout='single';view.autoRotate=false;
  if(name==='rotation3')end.angles=[67,23,0,0,0,0];
  if(name==='rotation4')end.angles=[0,0,67,0,23,0];
  if(name==='section4'){view.viewportLayout='split';view.derivedMode='section';view.sectionNormal=[.3,.5,.7,1].map(x=>x/Math.sqrt(1.83));start.sectionOffset=-.65;end.sectionOffset=.25;}
  if(name==='fold3'){sequence.version=2;sequence.tracks={fold:{kind:'face-net'}};start.foldFraction=0;end.foldFraction=1;view.viewportLayout='split';view.derivedMode='net';}
  if(name==='morph-snub3'){sequence.version=3;sequence.tracks={morphRatio:{kind:'dual-morph',version:1}};start.morphRatio=0;end.morphRatio=1;assert.equal(view.dualMorph?.method,'via-snub');}
  if(name.endsWith('-v4')){
    const kind=name.slice(0,-3);sequence.version=4;sequence.tracks={[kind]:{}};
    if(kind==='camera'){start.camera={azimuth:20,elevation:18,distance:6};end.camera={azimuth:87,elevation:31,distance:6};}
    if(kind==='projection'){view.projection='perspective';start.projection=2.5;end.projection=5;}
    if(kind==='opacity'){start.opacity=.15;end.opacity=.85;}
    if(kind==='sectionNormal'){view.viewportLayout='split';view.derivedMode='section';start.sectionNormal=[0,0,0,1];end.sectionNormal=[.2,.4,.5,Math.sqrt(.55)];start.sectionOffset=end.sectionOffset=.2;}
  }
  return project;
}
async function selfTest(){
  const {normalizeSequence,sequenceFrameTimes}=await import('../ui/animation.mjs'),{fixture}=require('./animated-tours-smoke.cjs');
  const seed=fixture();active(seed).view.dualMorph={method:'via-snub'};
  for(const [name] of CASES.filter(c=>c[0]!=='tour')){const p=scenarioProject(seed,name);assert.deepEqual(sequenceFrameTimes(normalizeSequence(active(p).view.animation)),[0,.125,.25,.26]);assert.deepEqual(active(p).model,active(seed).model);}
  console.log('Media qualification plan PASS: nine deterministic animation cases plus animated tour; no Electron launched.');
}
async function main(){
  const artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));await fs.mkdir(artifacts,{recursive:true});const folder=await fs.mkdtemp(path.join(artifacts,'media-qualification-'));
  const report={schemaVersion:1,startedAt:new Date().toISOString(),passed:false,runtimeQualified:false,platform:{platform:process.platform,release:os.release(),arch:process.arch},decoder:toolsAvailable(),cases:[],negativeChecks:[],pageErrors:[],frozenFiles:{},limits:['No AVI qualification','No 512 MiB disk exhaustion test','Hardware/driver support applies only to the recorded runtime']};
  let app,page,watch;
  const persist=()=>fs.writeFile(path.join(folder,'result.json'),JSON.stringify(report,null,2)+'\n');
  try{
    assert.equal(process.env.POLYTOPE_TEST_MODE,'hidden-no-focus','Media qualification requires hidden-no-focus plus the matching canary and root HWND watcher.');
    const runtime=await require('./layer-join-smoke.cjs').guardRuntime();report.runtime=runtime.runtime;report.canaryPath=runtime.canaryPath;
    for(const file of FROZEN){const bytes=await fs.readFile(path.join(root,file));report.frozenFiles[file]=hash(bytes);if(runtime.packaged&&file.startsWith('desktop/')){const shipped=require('@electron/asar').extractFile(runtime.runtime.archivePath,file);assert.equal(hash(shipped),hash(bytes),'Packaged export module differs from candidate: '+file);}}
    report.rendererBuild={};
    async function pinBuild(directory){for(const entry of await fs.readdir(path.join(root,directory),{withFileTypes:true})){const file=directory+'/'+entry.name;if(entry.isDirectory())await pinBuild(file);else{const bytes=await fs.readFile(path.join(root,file));report.rendererBuild[file]=hash(bytes);if(runtime.packaged)assert.equal(hash(require('@electron/asar').extractFile(runtime.runtime.archivePath,file)),hash(bytes),'Packaged renderer differs from local build: '+file);}}}
    await pinBuild('dist');
    const profile=path.join(folder,'profile');await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
    const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
    watch=await require('./windows-hidden-window-watch.cjs').startHiddenWindowWatch({executablePath:runtime.runtime.executablePath,evidencePath:path.join(folder,'native-watch.json')});
    const {_electron:electron}=require('playwright');app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
    page=await app.firstWindow();require('./smoke-helpers.cjs').autoReveal(page);page.setDefaultTimeout(45000);page.on('pageerror',e=>report.pageErrors.push(e.message));
    report.initialWindows=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({visible:w.isVisible(),focused:w.isFocused(),focusable:w.isFocusable()})));assert.deepEqual(report.initialWindows,[{visible:false,focused:false,focusable:false}]);
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract'&&document.getElementById('cancel').hidden);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1600,1100));
    await page.addStyleTag({content:'#views{width:960px!important;height:640px!important;flex:none!important}#base-canvas,#derived-canvas{box-sizing:content-box!important;width:480px!important;height:320px!important;min-width:480px!important;min-height:320px!important;max-width:480px!important;max-height:320px!important;border:0!important;padding:0!important}'});
    await page.waitForFunction(()=>document.querySelector('#base-canvas canvas').width/document.querySelector('#base-canvas canvas').height===1.5);
    await page.evaluate(()=>{window.mediaErrors=[];window.mediaStatuses=[];const seen=new WeakSet();new MutationObserver(()=>{for(const node of document.querySelectorAll('.friendly-toast[data-kind="error"]'))if(!seen.has(node)){seen.add(node);window.mediaErrors.push(node.querySelector('pre')?.textContent||node.textContent);}}).observe(document.body,{subtree:true,childList:true});new MutationObserver(()=>window.mediaStatuses.push(document.getElementById('status').textContent)).observe(document.getElementById('status'),{subtree:true,childList:true,characterData:true});});
    report.capabilities=await page.evaluate(async()=>{const probes=[];for(const codec of ['vp8','avc1.420028','avc1.420033','avc1.420034'])try{const result=await VideoEncoder.isConfigSupported({codec,width:480,height:320,framerate:8,bitrate:6000000,...(codec.startsWith('avc')?{avc:{format:'avc'}}:{})});probes.push({codec,supported:result.supported});}catch(e){probes.push({codec,supported:false,error:e.message});}return {VideoEncoder:typeof VideoEncoder,VideoFrame:typeof VideoFrame,userAgent:navigator.userAgent,probes};});
    report.gpu=await app.evaluate(async({app})=>({status:app.getGPUFeatureStatus(),info:await app.getGPUInfo('basic')}));report.versions=await app.evaluate(()=>process.versions);
    const dialog=file=>app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
    const ready=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden&&!document.getElementById('animation-duration').disabled);
    const change=async(id,value)=>{await page.locator(id).fill(String(value));await page.locator(id).press('Tab');};
    const save=async label=>{await ready();const file=path.join(folder,label+'.polyproj');await dialog(file);await page.locator('#save').click();await page.waitForFunction(file=>window.mediaStatuses.includes('Saved '+file),file);return JSON.parse(await fs.readFile(file,'utf8'));};
    const open=async(project,label)=>{const file=path.join(folder,label+'.polyproj');await fs.writeFile(file,JSON.stringify(project));await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1});},file);await page.locator('#open').click();await page.waitForFunction(file=>window.mediaStatuses.includes('Opened '+file),file);await ready();if(await page.locator('#auto-rotate').getAttribute('aria-pressed')==='true')await page.locator('#auto-rotate').click();};
    if(await page.locator('#auto-rotate').getAttribute('aria-pressed')==='true')await page.locator('#auto-rotate').click();
    const seeds={tesseract:await save('seed-tesseract')};
    await page.locator('#library-show-all').click();await page.locator('[data-key="cube"]').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');await ready();seeds.cube=await save('seed-cube');
    await page.locator('#animation-fold').click();await page.waitForFunction(()=>!document.getElementById('animation-fold-pose').disabled);await ready();seeds.fold=await save('seed-fold');
    await open(seeds.cube,'prepare-morph');await page.locator('#dual-morph-method').selectOption('via-snub');await change('#dual-morph-ratio',0);await page.locator('#dual-morph-apply').click();await page.waitForFunction(()=>document.getElementById('dual-morph-result').textContent.includes('via-snub'));await ready();await page.locator('#animation-morph').click();await page.waitForFunction(()=>!document.getElementById('animation-morph-pose').disabled);seeds.morph=await save('seed-morph');
    const exportFile=async(name,format,prefix,target)=>{
      const file=path.join(folder,`${name}.${format==='png'?'frames':format}`);await page.locator(`#${prefix}-size`).selectOption('w480');await page.locator(`#${prefix}-framing`).selectOption('viewport');await page.locator(`#${prefix}-format`).selectOption(format);if(prefix==='animation')await page.locator('#animation-target').selectOption(target);else await change('#tour-fps',8);
      await page.evaluate(()=>{window.mediaErrors=[];});await dialog(file);await page.locator(`#${prefix}-export`).click();
      await page.waitForFunction(({file,prefix})=>window.mediaErrors.length||window.mediaStatuses.includes((prefix==='tour'?'Exported tour ':'Exported animation ')+file),{file,prefix},{timeout:120000});
      await ready();const errors=await page.evaluate(()=>window.mediaErrors);if(errors.length)throw Error(errors.join('\n'));return file;
    };
    for(const [name,seed,target] of CASES){
      const tour=name==='tour',project=tour?require('./animated-tours-smoke.cjs').fixture():scenarioProject(seeds[seed],name),prefix=tour?'tour':'animation',times=tour?[0,.125,.25,.375,.5,.625,.75]:[0,.125,.25,.26];
      const entry={name,target,mathSampleTimes:times,formats:{},sourceSha256:hash(JSON.stringify(active(project).model))};report.cases.push(entry);await persist();
      try{
        await open(project,'case-'+name);const before=await save(name+'-before');
        const frames=await exportFile(name,'png',prefix,target),reference=await verifySequence(frames,{times});entry.formats.png={...reference.report,qualified:true,path:frames};
        for(const format of ['webm','mp4','gif']){
          const expectedFile=path.join(folder,name+'.'+format);
          try{const file=await exportFile(name,format,prefix,target);entry.formats[format]={path:file,...await verifyMedia(file,{times,fps:8,references:reference.references,width:reference.report.width,height:reference.report.height,maximumMeanRgbError:format==='gif'?12:5,tools:report.decoder})};}
          catch(error){const exported=await fs.access(expectedFile).then(()=>true,()=>false);entry.formats[format]={qualified:false,level:/unavailable/i.test(error.message)?'unavailable':'failed',...(exported?{path:expectedFile}:{}),exported,error:error.message};}
          await persist();
        }
        const after=await save(name+'-after');assert.deepEqual(after.documents,before.documents,'Export changed source/history/view');if(tour)assert.deepEqual(after.tour,before.tour,'Export changed tour');entry.restored=true;
      }catch(error){entry.error=error.stack;}
      await persist();
    }
    // Deliberately remove the encoder API. No recorder or realtime fallback is permitted.
    await open(scenarioProject(seeds.cube,'rotation3'),'negative-source');
    for(const format of ['webm','mp4']){
      await page.evaluate(()=>{window.mediaOriginalEncoder=Object.getOwnPropertyDescriptor(window,'VideoEncoder');Object.defineProperty(window,'VideoEncoder',{value:undefined,configurable:true});});
      try{await assert.rejects(()=>exportFile('no-encoder-'+format,format,'animation','base'),/unavailable/);await assert.rejects(()=>fs.access(path.join(folder,'no-encoder-'+format+'.'+format)));report.negativeChecks.push({name:'no-encoder-'+format,passed:true});}
      finally{await page.evaluate(()=>{if(window.mediaOriginalEncoder)Object.defineProperty(window,'VideoEncoder',window.mediaOriginalEncoder);else delete window.VideoEncoder;});}
    }
    const invalid=await page.evaluate(async()=>{const checks=[];for(const options of [{format:'png',fps:60,frameCount:18002},{format:'png',fps:8,frameCount:4,duration:301}]){try{await window.polytope.animationBegin(options);checks.push(false);}catch(e){checks.push(e.message);}}return checks;});assert.ok(invalid.every(x=>typeof x==='string'&&/Invalid/.test(x)));report.negativeChecks.push({name:'native-frame-duration-limits',passed:true,diagnostics:invalid});
    const limitFile=path.join(folder,'limit.webm');await dialog(limitFile);const limits=await page.evaluate(async()=>{const session=await window.polytope.animationBegin({format:'webm',fps:8,frameCount:2,duration:.125});try{await window.polytope.animationWrite(session.id,0,new Uint8Array(32*1024*1024+1));return false;}catch(e){return e.message;}finally{await window.polytope.animationAbort(session.id);}});assert.match(limits,/32 MiB/);await assert.rejects(()=>fs.access(limitFile));report.negativeChecks.push({name:'native-chunk-limit',passed:true,diagnostic:limits});
    const pixelFile=path.join(folder,'pixel-limit.frames');await dialog(pixelFile);const pixelLimit=await page.evaluate(async()=>{const session=await window.polytope.animationBegin({format:'png',fps:8,frameCount:2,duration:.125});try{const b=new Uint8Array(33),v=new DataView(b.buffer);b.set([137,80,78,71,13,10,26,10]);v.setUint32(8,13);b.set([73,72,68,82],12);v.setUint32(16,8193);v.setUint32(20,1);await window.polytope.animationWrite(session.id,0,'data:image/png;base64,'+btoa(String.fromCharCode(...b)));return false;}catch(e){return e.message;}finally{await window.polytope.animationAbort(session.id);}});assert.match(pixelLimit,/dimensions.*limit/);await assert.rejects(()=>fs.access(pixelFile));report.negativeChecks.push({name:'native-pixel-limit',passed:true,diagnostic:pixelLimit});
    for(const format of ['png','webm','gif','mp4']){
      const supported=!['webm','mp4'].includes(format)||report.capabilities.probes.some(p=>p.supported&&(format==='webm'?p.codec==='vp8':p.codec.startsWith('avc')));
      if(!supported){report.negativeChecks.push({name:'cancel-'+format,passed:false,diagnostic:'Runtime encoder unavailable; cancellation not exercised'});continue;}
      const project=scenarioProject(seeds.cube,'rotation3'),seq=active(project).view.animation;seq.duration=300;seq.fps=60;seq.keyframes[1].time=300;await open(project,'cancel-source-'+format);const before=await save('cancel-before-'+format),file=path.join(folder,'cancelled.'+(format==='png'?'frames':format));
      await page.locator('#animation-size').selectOption('w480');await page.locator('#animation-format').selectOption(format);await page.locator('#animation-target').selectOption('base');await page.evaluate(()=>{window.mediaErrors=[];document.getElementById('animation-progress').textContent='';});await dialog(file);await page.locator('#animation-export').click();
      await page.waitForFunction(()=>window.mediaErrors.length||/^(Frame |Encoding frame )/.test(document.getElementById('animation-progress').textContent));assert.deepEqual(await page.evaluate(()=>window.mediaErrors),[]);await page.locator('#animation-cancel').click();await page.waitForFunction(()=>document.getElementById('animation-progress').textContent==='Animation export cancelled.');await ready();await assert.rejects(()=>fs.access(file));assert.deepEqual((await save('cancel-after-'+format)).documents,before.documents);report.negativeChecks.push({name:'cancel-'+format,passed:true});await persist();
    }
    await open(seeds.cube,'still-cube');await page.locator('#png-size').selectOption('viewport');
    const viewport=await page.locator('#base-canvas canvas').evaluate(c=>({width:c.width,height:c.height,pixelRatio:devicePixelRatio}));report.stillViewport=viewport;
    for(const transparent of [false,true])for(const scale of [1,2,4]){
      await page.locator('#png-transparent').setChecked(transparent);await page.locator('#png-scale').selectOption(String(scale));await page.locator('#png-supersample').selectOption('2');const file=path.join(folder,`still-alpha-${transparent}-scale-${scale}.png`);await dialog(file);await page.locator('#image').click();await page.waitForFunction(file=>window.mediaStatuses.includes('Saved '+file),file);const p=inspectBuffer(await fs.readFile(file),'png');assert.equal(p.width,viewport.width*scale);assert.equal(p.height,viewport.height*scale);if(transparent)assert.ok(p.alpha.min===0&&p.alpha.max>0);else assert.equal(p.alpha.min,255);report.negativeChecks.push({name:`still-alpha-${transparent}-scale-${scale}`,passed:true,width:p.width,height:p.height,alpha:p.alpha});
    }
    assert.equal((await fs.readdir(folder)).filter(f=>f.startsWith('.polytope-animation-')).length,0,'Leaked native staging');assert.deepEqual(report.pageErrors,[]);
    for(const file of FROZEN)assert.equal(hash(await fs.readFile(path.join(root,file))),report.frozenFiles[file],'Frozen export source changed during qualification');
    report.runtimeQualified=Boolean(runtime.packaged);report.passed=report.runtimeQualified&&report.cases.every(c=>c.restored&&Object.values(c.formats).length===4&&Object.values(c.formats).every(f=>f.qualified))&&report.negativeChecks.every(c=>c.passed);report.completedAt=new Date().toISOString();await page.screenshot({path:path.join(folder,'workspace.png')});
  }catch(error){report.passed=false;report.error=error.stack;if(page)await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});}
  finally{
    if(app){report.finalWindows=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({visible:w.isVisible(),focused:w.isFocused(),focusable:w.isFocusable()}))).catch(()=>null);if(JSON.stringify(report.finalWindows)!==JSON.stringify([{visible:false,focused:false,focusable:false}]))report.passed=false;await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
    if(watch)try{report.nativeWatch=await watch.stop();if(report.nativeWatch.violations!==0||report.nativeWatch.checks<10||!report.nativeWatch.eventHooksArmed)report.passed=false;}catch(e){report.passed=false;report.watchError=e.message;}
    report.matrix=report.cases.flatMap(c=>['png','webm','mp4','gif'].map(format=>({scenario:c.name,format,status:c.formats[format]?.qualified?'qualified':c.formats[format]?.level||'not-run',restored:c.restored===true})));await persist();
  }
  console.log(`Media qualification ${report.passed?'PASS':'INCOMPLETE/FAIL'}: ${folder}`);if(!report.passed)process.exitCode=1;
}
if(require.main===module)(process.argv.includes('--self-test')?selfTest():main()).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={scenarioProject,CASES,FROZEN,selfTest};
