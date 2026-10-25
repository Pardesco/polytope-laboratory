// Actual Library loading and rotation task; CPU/RAF observations are not GPU time.
const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {cpuTime,quantile}=require('./model-view-profile-metrics.cjs');
const root=path.resolve(__dirname,'..'),hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const active=p=>{const d=p.documents[p.active];return d.states[d.cursor];};
const cases=[{key:'cell120',name:'120-cell',counts:[600,1200,720,120]},{key:'cell600',name:'600-cell',counts:[120,720,1200,600]},{key:'miratope-grand-hexacosichoron',name:'Grand hexacosichoron',counts:[120,720,1200,600]}];
function cpuSummary(cpu){const nodes=new Map(cpu.nodes.map(n=>[n.id,n])),self=new Map();for(let i=0;i<(cpu.samples??[]).length;i++){const frame=nodes.get(cpu.samples[i]).callFrame,key=JSON.stringify(frame),entry=self.get(key)||{...frame,selfMs:0,samples:0};entry.selfMs+=(cpu.timeDeltas?.[i]??0)/1000;entry.samples++;self.set(key,entry);}return [...self.values()].sort((a,b)=>b.selfMs-a.selfMs).slice(0,30);}
async function main(){
  const option=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.split('=').slice(1).join('='),workload=option('workload')||'absent';
  assert.ok(['absent','annotated','emptied'].includes(workload),'Choose absent, annotated or emptied');
  assert.ok(!option('version')||process.env.POLYTOPE_TEST_EXECUTABLE,'Historical version overrides require a real packaged executable');
  const folder=await fs.mkdtemp(path.join(root,'artifacts','model-view-profile-')),profile=path.join(folder,'profile');await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const runtime=await require('./hidden-runtime.cjs').hiddenRuntime(process.env.POLYTOPE_TEST_EXECUTABLE,option('version')),env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.POLYTOPE_TEST_MODE;if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-python.exe');
  let app,page,cdp;const errors=[],loads=[],rotations=[];
  try{
    app=await electron.launch({executablePath:runtime.executablePath,args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});await app.evaluate(({BrowserWindow,dialog})=>{BrowserWindow.getAllWindows()[0].setContentSize(1500,950);dialog.showMessageBox=async()=>({response:1});});
    page=await app.firstWindow();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract'&&document.getElementById('cancel').hidden);
    await page.evaluate(()=>{
      const p=window.modelViewProfile={shader:{createProgram:0,deleteProgram:0,linkProgram:0,getProgramInfoLog:0},longTasks:[],draws:0};
      for(const type of [window.WebGLRenderingContext,window.WebGL2RenderingContext])if(type)for(const name of [...Object.keys(p.shader),'drawElements','drawArrays']){const original=type.prototype[name];type.prototype[name]=function(...args){if(this.canvas.closest('#base-canvas')){if(name.startsWith('draw')){p.draws++;if(p.active&&document.getElementById('model-name').textContent===p.active.name&&p.active.firstDraw==null)p.active.firstDraw=performance.now();}else p.shader[name]++;}return original.apply(this,args);};}
      p.observer=new PerformanceObserver(list=>p.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));p.observer.observe({type:'longtask',buffered:false});
    });
    cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');
    let serial=0;const save=async label=>{const file=path.join(folder,`${++serial}-${label}.polyproj`);await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);return active(JSON.parse(await fs.readFile(file,'utf8')));};
    await cdp.send('Profiler.start');
    for(let pass=0;pass<2;pass++)for(const entry of cases){
      await page.locator('#search').fill(entry.key);const button=page.locator(`.catalog-entry[data-key="${entry.key}"]`);assert.equal(await button.count(),1);const name=await button.locator('.entry-name').textContent();
      const displayed=entry.name||name;assert.ok(displayed,'Need actual source display name');
      await button.evaluate((button,name)=>{const p=window.modelViewProfile;p.active={name,started:performance.now(),shaderBefore:structuredClone(p.shader)};button.click();},displayed);
      await page.waitForFunction(name=>document.getElementById('model-name').textContent===name&&document.getElementById('cancel').hidden&&window.modelViewProfile.active.firstDraw!=null,displayed);
      const measured=await page.evaluate(()=>{const p=window.modelViewProfile,a=p.active;p.active=null;return {...a,settled:performance.now(),shaderAfter:structuredClone(p.shader)};});
      const source=await save('loaded-'+entry.key+'-'+pass),counts=['vertices','edges','faces','cells'].map(k=>source.model[k]?.length||0);if(entry.counts)assert.deepEqual(counts,entry.counts);
      loads.push({pass,key:entry.key,name:source.model.name,counts,firstDrawObservedMs:measured.firstDraw-measured.started,settledObservedMs:measured.settled-measured.started,shader:Object.fromEntries(Object.keys(measured.shaderAfter).map(k=>[k,measured.shaderAfter[k]-measured.shaderBefore[k]])),sourceSha256:hash(source.model),geometrySha256:hash(Object.fromEntries(['dimension','embeddingDimension','vertices','edges','faces','cells','faceColors','edgeColors','vertexColors'].filter(k=>source.model[k]!==undefined).map(k=>[k,source.model[k]])))});
    }
    const {profile:loadCpu}=await cdp.send('Profiler.stop');await fs.writeFile(path.join(folder,'load.cpuprofile'),JSON.stringify(loadCpu));
    // Time real display updates on the last loaded source, using the header's rotation control.
    if(workload!=='absent'){
      if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();
      await page.locator('[data-panel="info"]').click();await page.locator('#element-content-settings').evaluate(n=>{n.open=true;});
      await page.locator('#element-content-kind').selectOption('face');await page.locator('#element-content-index').fill('0');await page.locator('#element-content-markup').fill('Rotation profile');
      await page.locator('#element-content-status').evaluate(n=>{n.dataset.status='';});
      await page.locator('#element-content-text').click();await page.waitForFunction(()=>document.getElementById('element-content-status').dataset.status==='recorded'&&document.getElementById('cancel').hidden);
      const added=await save('added-label');assert.equal(added.view.elementAnnotations.entries.length,1);
      if(workload==='emptied'){
        await page.locator('#element-content-settings').evaluate(n=>{n.open=true;});
        await page.locator('#element-content-status').evaluate(n=>{n.dataset.status='';});
        await page.locator('#element-content-remove-text').click();await page.waitForFunction(()=>document.getElementById('element-content-status').dataset.status==='recorded'&&document.getElementById('cancel').hidden);
      }
      await page.keyboard.press('Escape');if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')==='true')await page.locator('#toggle-inspector').click();
    }
    const before=await save('before-rotation');
    if(workload==='absent')assert.equal(before.view.elementAnnotations==null,true);
    else {assert.ok(before.view.elementAnnotations);assert.equal(before.view.elementAnnotations.entries.length,workload==='annotated'?1:0);}
    await page.evaluate(()=>{window.modelViewProfile.longTasks=[];});await cdp.send('Profiler.start');await page.locator('#auto-rotate').click();
    const cadence=await page.evaluate(async()=>{const p=window.modelViewProfile,shaderBefore=structuredClone(p.shader),times=[],started=performance.now();await new Promise(resolve=>{function tick(now){times.push(now);if(now-started>=1500)resolve();else requestAnimationFrame(tick);}requestAnimationFrame(tick);});return {times,shaderBefore,shaderAfter:structuredClone(p.shader),durationMs:performance.now()-started,visibility:document.visibilityState};});
    await page.locator('#auto-rotate').click();const {profile:rotateCpu}=await cdp.send('Profiler.stop');await fs.writeFile(path.join(folder,'rotation.cpuprofile'),JSON.stringify(rotateCpu));
    const rotationLongTasks=await page.evaluate(()=>structuredClone(window.modelViewProfile.longTasks));
    const after=await save('after-rotation');assert.deepEqual(after.model,before.model);assert.equal(after.notes,before.notes);assert.deepEqual(after.view.elementAnnotations,before.view.elementAnnotations);assert.notDeepEqual(after.view.angles,before.view.angles);rotations.push({longTasks:rotationLongTasks,annotationSha256:hash(before.view.elementAnnotations??null),model:before.model.name,sourceSha256:hash(before.model),durationMs:cadence.durationMs,visibility:cadence.visibility,rafIntervalsMs:cadence.times.slice(1).map((t,i)=>t-cadence.times[i]),shaderBefore:cadence.shaderBefore,shaderAfter:cadence.shaderAfter});
    await page.screenshot({path:path.join(folder,'workspace.png')});const longTasks=await page.evaluate(()=>{const p=window.modelViewProfile;p.observer.disconnect();return p.longTasks;});assert.deepEqual(errors,[]);
    const rotationSummary={...cpuTime(rotateCpu),longTaskCount:rotationLongTasks.length,rafMedianMs:quantile(rotations[0].rafIntervalsMs,.5),rafP95Ms:quantile(rotations[0].rafIntervalsMs,.95)};
    const result={passed:true,runtime,rotationSummary,baseline:process.argv.includes('--baseline'),purpose:'actual UI task timings, shader lifetime, sampled renderer CPU and RAF cadence; not isolated GPU time or a general FPS claim',version:runtime.version,packaged:runtime.packaged,developmentPythonDisabled:runtime.packaged,workload,annotationDocumentAbsent:workload==='absent',loads,rotations,longTasks,loadTopSelf:cpuSummary(loadCpu),rotationTopSelf:cpuSummary(rotateCpu),hardware:{cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memoryGiB:os.totalmem()/2**30,platform:os.platform(),release:os.release()},errors};await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({folder,version:result.version,packaged:result.packaged,loads:loads.map(x=>({key:x.key,firstDrawObservedMs:x.firstDrawObservedMs,settledObservedMs:x.settledObservedMs})),rotationTopSelf:result.rotationTopSelf.slice(0,6)},null,2));
  }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({error:error.stack,loads,errors},null,2));console.error('Artifacts:',folder);throw error;}finally{await cdp?.detach().catch(()=>{});await app?.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
