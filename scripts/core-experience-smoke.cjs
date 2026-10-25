// Actual desktop workflow and repeatable IPC timings, with an isolated profile.
const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const baseline=process.argv.includes('--baseline'),visible=process.argv.includes('--visible');
async function main(){
  const folder=await fs.mkdtemp(path.join(root,'artifacts','core-experience-'));
  const profile=path.join(folder,'profile');await fs.mkdir(profile);
  await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const runtime=await require('./hidden-runtime.cjs').hiddenRuntime();
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.POLYTOPE_TEST_MODE;if(!visible)env.POLYTOPE_TEST_MODE='hidden-no-focus';
  if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:runtime.executablePath,args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
  const errors=[],checks=[];let page,benchmark;
  try{
    await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
    page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract'&&document.getElementById('cancel').hidden);
    await page.evaluate(()=>{
      window.coreStatusMessages=[];
      new MutationObserver(()=>window.coreStatusMessages.push(document.getElementById('status').textContent)).observe(document.getElementById('status'),{childList:true,subtree:true,characterData:true});
    });
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1500,950));
    const windows=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({visible:w.isVisible(),focused:w.isFocused()})));assert.equal(windows.length,1);assert.equal(windows[0].visible,visible);if(!visible)assert.equal(windows[0].focused,false);
    await page.locator('#toggle-inspector').click();
    await page.screenshot({path:path.join(folder,'analysis.png')});
    const inventory=await page.evaluate(()=>Object.fromEntries(['info','construct','evidence','net'].map(name=>{
      const panel=document.getElementById(name+'-panel');
      return [name,panel?Array.from(panel.children).map(n=>({id:n.id,tag:n.tagName,title:n.querySelector('summary')?.textContent||n.textContent.slice(0,70),hidden:n.hidden})):[]];
    })));
    await page.locator('[data-panel="construct"]').click();await page.screenshot({path:path.join(folder,'construct.png')});
    await page.locator('[data-panel="evidence"]').click();await page.screenshot({path:path.join(folder,'details.png')});
    benchmark=await page.evaluate(async()=>{
      const api=window.polytope;
      const send=(op,params={},model=null)=>api.engine({op,params,model},crypto.randomUUID());
      const source=await send('generate',{kind:'regular',key:'cuboctahedron'});
      const tetra=await send('generate',{kind:'regular',key:'truncated-tetrahedron'});
      const sourceContext={notes:'',unit:'model'};
      const settings={version:1,enabled:true,method:'sizing',center:null,radius:1,ratio:0,duration:5,loop:false};
      const prepared=await send('prepare-dual-morph',{settings,sourceContext},tetra);
      const samples={dual:[],morph:[]};const frames=[];
      for(let i=0;i<6;i++){
        let start=performance.now();const dual=await send('dual',{},source);samples.dual.push(performance.now()-start);
        if(dual.vertices.length!==source.faces.length)throw Error('Dual incidence changed');
        start=performance.now();const frame=await send('evaluate-dual-morph',{prepared,ratio:i/5,sourceContext},tetra);samples.morph.push(performance.now()-start);
        frames.push({ratio:frame.ratio,vertices:frame.model.vertices.length,bounds:frame.model.vertices.reduce((r,p)=>Math.max(r,Math.hypot(...p)),0)});
      }
      return {models:{dual:source.name,morph:tetra.name},samples,frames};
    });
    checks.push('cuboctahedron dual and six truncated-tetrahedron sizing morph poses through real desktop IPC');
    if(!baseline){
      await page.locator('[data-panel="construct"]').click();
      assert.equal(await page.locator('#make-dual').isVisible(),true);
      assert.equal(await page.locator('#generator').isVisible(),false);
      await page.locator('#create-model-settings > summary').click();assert.equal(await page.locator('#generator').isVisible(),true);
      await page.locator('[data-panel="evidence"]').click();
      assert.equal(await page.locator('#evidence pre').isVisible(),false);
      await page.locator('#validation-details > summary').click();assert.equal(await page.locator('#evidence pre').isVisible(),true);
      await page.locator('#validate').click();await page.waitForFunction(()=>document.getElementById('cancel').hidden);
      assert.equal(await page.locator('#evidence pre').count(),1);
      await page.locator('[data-panel="info"]').click();
      assert.equal(await page.locator('#analysis-details').evaluate(n=>n.open),false);
      await page.locator('#inspector-region').evaluate(n=>{n.scrollTop=n.scrollHeight;});
      await page.locator('[data-panel="construct"]').click();
      assert.equal(await page.locator('#inspector-region').evaluate(n=>n.scrollTop),0);
      assert.equal(await page.locator('[data-panel="construct"]').getAttribute('aria-pressed'),'true');
      checks.push('core actions visible, generators disclosed on request, numerical details collapsed, revalidation updates one report');
      for(const size of [{width:1200,height:760},{width:1500,height:950}]){
        await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size.width,size.height),size);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      }
      const file=path.join(folder,'saved.polyproj');
      await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
      await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);
      const project=JSON.parse(await fs.readFile(file,'utf8'));assert.ok(project.documents.length);
      await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
      await page.locator('#open').click();await page.waitForFunction(file=>window.coreStatusMessages.includes('Opened '+file),file);
      checks.push('native Save/Open and layout at two desktop sizes');
      await page.locator('[data-key="cube"]').click();
      await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube'&&document.getElementById('cancel').hidden);
      await page.locator('[data-panel="construct"]').click();
      await page.locator('#make-dual').click();
      await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Dual of Cube'&&document.getElementById('cancel').hidden);
      assert.equal(await page.locator('#counts-strip strong').first().textContent(),'6');
      await page.locator('#undo').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube'&&document.getElementById('cancel').hidden);
      await page.locator('#truncate').click();
      await page.waitForFunction(()=>document.getElementById('model-name').textContent!=='Cube'&&document.getElementById('cancel').hidden);
      assert.equal(await page.locator('#counts-strip strong').first().textContent(),'24');
      await page.locator('#undo').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube'&&document.getElementById('cancel').hidden);
      await page.locator('#transform-model-settings > summary').click();
      await page.locator('#model-scale').fill('2');await page.locator('#scale').click();
      await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Transform of Cube'&&document.getElementById('cancel').hidden);
      await page.locator('#undo').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube'&&document.getElementById('cancel').hidden);
      checks.push('actual dual, truncation and scale buttons retain source history and undo after Inspector reorganization');
      await page.locator('[data-key="truncated-tetrahedron"]').click();
      await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Truncated tetrahedron'&&document.getElementById('cancel').hidden);
      await page.locator('#dual-morph-settings > summary').click();
      await page.locator('#dual-morph-method').selectOption('sizing');
      await page.locator('#dual-morph-geometry > summary').click();
      await page.locator('#dual-morph-radius').fill('');
      // Occluded Windows renderers can tick near once per second. Keep the
      // functional moving-pose requirement, with a longer hidden sample window.
      const playbackDuration=visible?1:4;benchmark.playbackDurationSeconds=playbackDuration;
      await page.locator('#dual-morph-duration').fill(String(playbackDuration));
      await page.locator('#dual-morph-apply').click();
      await page.waitForFunction(()=>!document.getElementById('dual-morph-play').disabled&&document.getElementById('dual-morph-result').textContent.includes('0.000'));
      const matchedRadius=Number(await page.locator('#dual-morph-radius').inputValue());assert.ok(matchedRadius>0&&matchedRadius<1);
      await page.evaluate(()=>{
        window.morphPlaybackSamples=[];let previous;
        const node=document.getElementById('dual-morph-result');
        window.morphPlaybackObserver=new MutationObserver(()=>{const value=node.textContent;if(value!==previous){previous=value;window.morphPlaybackSamples.push({time:performance.now(),text:value});}});
        window.morphPlaybackObserver.observe(node,{childList:true,subtree:true,characterData:true});
      });
      await page.locator('#dual-morph-play').click();
      await page.waitForFunction(()=>document.getElementById('dual-morph-pause').disabled&&document.getElementById('dual-morph-result').textContent.includes('1.000'));
      benchmark.playback=await page.evaluate(()=>{window.morphPlaybackObserver.disconnect();return window.morphPlaybackSamples;});
      assert.ok(benchmark.playback.length>2,'Playback must publish multiple moving poses');
      await page.screenshot({path:path.join(folder,'matched-morph.png')});
      const morphFile=path.join(folder,'matched-morph.polyproj');
      await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},morphFile);
      await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,morphFile);
      const morphProject=JSON.parse(await fs.readFile(morphFile,'utf8')),document=morphProject.documents[morphProject.active],saved=document.states[document.cursor];
      assert.equal(saved.view.dualMorph.radius,matchedRadius);assert.equal(saved.view.dualMorph.ratio,1);
      benchmark.matched=await page.evaluate(async saved=>{
        const source=saved.model,sourceContext={notes:saved.notes??'',unit:saved.view.coordinateUnit??'model'},settings=saved.view.dualMorph;
        const run=(op,params)=>window.polytope.engine({op,params,model:source},crypto.randomUUID());
        const prepared=await run('prepare-dual-morph',{settings,sourceContext}),frame=await run('evaluate-dual-morph',{prepared,ratio:1,sourceContext});
        const center=prepared.settings.center,bound=model=>Math.max(...model.vertices.map(p=>Math.hypot(...p.map((x,i)=>x-center[i]))));
        return {radius:settings.radius,sourceBound:bound(source),dualBound:bound(frame.model)};
      },saved);
      assert.ok(Math.abs(benchmark.matched.sourceBound-benchmark.matched.dualBound)<1e-8);
      await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},morphFile);
      await page.locator('#open').click();await page.waitForFunction(file=>window.coreStatusMessages.includes('Opened '+file),morphFile);
      await page.waitForFunction(()=>!document.getElementById('dual-morph-play').disabled);
      assert.equal(Number(await page.locator('#dual-morph-radius').inputValue()),matchedRadius);
      checks.push('truncated-tetrahedron automatic radius matches endpoint bounds, actual playback advances, native Save/Open restores the numeric radius');
    }
    assert.deepEqual(errors,[]);
    const result={passed:true,baseline,visible,packaged:runtime.packaged,version:await app.evaluate(({app})=>app.getVersion()),checks,benchmark,inventory,errors};
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify({folder,passed:true,baseline,benchmark},null,2));
  }catch(error){
    await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});
    await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({error:error.stack,errors,checks,benchmark},null,2));
    console.error('Artifacts:',folder);throw error;
  }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
