// Real desktop section/entity controls, source preservation and export ownership.
const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),visible=process.argv.includes('--visible'),baseline=process.argv.includes('--baseline'),measure=process.argv.includes('--benchmark'),pendingAudit=process.argv.includes('--pending-audit');
const active=p=>{const d=p.documents[p.active];return d.states[d.cursor];};
async function main(){
  const folder=await fs.mkdtemp(path.join(root,'artifacts','section-workflow-')),profile=path.join(folder,'profile');await fs.mkdir(profile);
  await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const runtime=await require('./hidden-runtime.cjs').hiddenRuntime(),env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.POLYTOPE_TEST_MODE;
  if(!visible)env.POLYTOPE_TEST_MODE='hidden-no-focus';if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-python.exe');
  let app,page;const errors=[],checks=[],findings={};
  try{
    app=await electron.launch({executablePath:runtime.executablePath,args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
    page=await app.firstWindow();require('./smoke-helpers.cjs').autoReveal(page);page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    const ready=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
    const save=async name=>{await ready();const file=path.join(folder,name+'.polyproj');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);return {file,state:active(JSON.parse(await fs.readFile(file,'utf8')))};};
    const reveal=async id=>{if(!await page.locator('#'+id).evaluate(n=>n.open))await page.locator('#'+id+' > summary').click();};
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract'&&document.getElementById('cancel').hidden);
    await page.locator('#viewport-layout').selectOption('split');await page.locator('#derived-mode').selectOption('cell');await ready();
    await page.locator('#entity-id').fill('1');await page.locator('#entity-id').blur();await ready();const original=await save('entity-one');assert.equal(original.state.view.entity,1);
    await page.locator('#entity-id').fill('');await page.locator('#entity-id').blur();await ready();const invalid=await save('entity-blank');
    findings.blankEntityChangedSavedIndex=invalid.state.view.entity!==original.state.view.entity;
    if(!baseline){
      assert.equal(findings.blankEntityChangedSavedIndex,false);assert.equal(await page.locator('#entity-id').inputValue(),'1');
      for(const value of ['99','1.5','-1']){await page.locator('#entity-id').fill(value);await page.locator('#entity-id').blur();await ready();const rejected=await save('entity-refused-'+value);assert.equal(rejected.state.view.entity,1);assert.deepEqual(rejected.state.model,original.state.model);}
      assert.equal(await page.locator('#derived-entity-label').textContent(),'Cell index');assert.match(await page.locator('#derived-input-note').textContent(),/0 to 7/);checks.push('literal cell IDs reject blank, out-of-range, fractional and negative inputs without changing source or applied selection');
    }
    await page.locator('#entity-id').fill('1');await page.locator('#entity-id').blur();await ready();
    await page.locator('#derived-mode').selectOption('section');await ready();
    await page.locator('#section-normal').fill('0, 0, 0, 2');await page.locator('#section-depth').fill('0');await page.locator('#apply-section').focus();await page.keyboard.press('Enter');await ready();
    const plane=await save('section-plane');assert.deepEqual(plane.state.view.sectionNormal,[0,0,0,2]);assert.equal(plane.state.view.sectionOffset,0);assert.deepEqual(plane.state.model,original.state.model);
    await page.locator('#section-depth').fill('0/2');
    const pending=await page.locator('#apply-section').evaluate(button=>{
      button.click();const promotionDisabled=document.getElementById('promote').disabled;
      document.getElementById('export').click();const exportDisabled=document.getElementById('export-source').options[1].disabled;document.getElementById('close-export').click();
      if(promotionDisabled)document.getElementById('promote').dispatchEvent(new MouseEvent('click',{bubbles:true}));
      return {promotionDisabled,exportDisabled};
    });
    findings.pendingPlanePromotionDisabled=pending.promotionDisabled;findings.pendingPlaneDerivedExportDisabled=pending.exportDisabled;
    if(!baseline&&!pendingAudit){assert.equal(pending.promotionDisabled,true,'Promotion must wait for manual plane evaluation');assert.equal(pending.exportDisabled,true,'Derived export must wait for manual plane evaluation');}await ready();
    await page.locator('#section-normal').fill('0, 0, 0, 0');await page.locator('#apply-section').click();await ready();const refused=await save('zero-normal');assert.deepEqual(refused.state.view.sectionNormal,plane.state.view.sectionNormal);assert.equal(refused.state.view.sectionOffset,0);checks.push('manual section normal uses intrinsic source coordinates; zero normal preserves the saved plane');
    await page.locator('#section-normal').fill('0, 0, 0, 2');
    await page.locator('#section-depth').fill('0');await page.locator('#section-events').click();await ready();
    const next=await save('next-vertex'),extent=Math.max(...original.state.model.vertices.map(p=>p[3]));assert.ok(Math.abs(next.state.view.sectionOffset-extent)<1e-7);
    await page.locator('#section-events').click();await ready();const wrap=await save('wrapped-vertex');assert.ok(Math.abs(wrap.state.view.sectionOffset+extent)<1e-7);checks.push('Next vertex steps through normalized source levels and wraps at the final level');
    await page.locator('#section-depth').fill('0');await page.locator('#apply-section').click();await ready();
    await reveal('animation-settings');await page.locator('#animation-target').selectOption('base');
    for(const [id,value] of [['animation-duration','0.25'],['animation-fps','8']]){await page.locator('#'+id).fill(value);await page.locator('#'+id).blur();await page.waitForFunction(()=>!document.getElementById('animation-rotation').disabled);}
    await page.locator('#animation-rotation').click();await page.waitForFunction(()=>!document.getElementById('animation-rotation').disabled);const before=await save('before-held-animation');
    const drafts={normal:'0, 0, 0, 1+1',depth:'0/2'};
    if(!baseline&&!pendingAudit){await page.locator('#section-normal').fill(drafts.normal);await page.locator('#section-depth').fill(drafts.depth);}
    await app.evaluate(({dialog})=>{dialog.showSaveDialog=()=>new Promise(resolve=>{globalThis.resolveSectionAnimation=resolve;});});await reveal('animation-settings');await page.locator('#animation-png').click();await page.waitForFunction(()=>document.getElementById('animation-png').disabled);
    const ids=['derived-mode','section-normal','section-depth','section-offset','apply-section','section-events','entity-id','promote'];findings.exportControlDisabled={};for(const id of ids)findings.exportControlDisabled[id]=await page.locator('#'+id).isDisabled();
    if(!baseline)for(const id of ids)assert.equal(findings.exportControlDisabled[id],true,id);
    await page.locator('#derived-mode').evaluate(n=>{n.value='cell';n.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.locator('#section-offset').evaluate(n=>{n.value='.25';n.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.locator('#entity-id').evaluate(n=>{n.value='2';n.dispatchEvent(new Event('change',{bubbles:true}));});
    await app.evaluate(()=>{if(typeof globalThis.resolveSectionAnimation!=='function')throw Error('Animation dialog was not reached');globalThis.resolveSectionAnimation({canceled:true});delete globalThis.resolveSectionAnimation;});await page.waitForFunction(()=>!document.getElementById('animation-png').disabled);await ready();
    const after=await save('after-held-animation');findings.queuedExportEventsChangedView=['derivedMode','sectionNormal','sectionOffset','entity'].some(k=>JSON.stringify(after.state.view[k])!==JSON.stringify(before.state.view[k]));
    if(!baseline){
      assert.equal(findings.queuedExportEventsChangedView,false);assert.deepEqual(after.state.model,original.state.model);assert.equal(await page.locator('#derived-mode').inputValue(),before.state.view.derivedMode);
      if(!pendingAudit){assert.equal(await page.locator('#section-depth').inputValue(),drafts.depth);assert.equal(await page.locator('#section-normal').inputValue(),drafts.normal);}checks.push('held animation dialog disables derived controls; queued events preserve source, plane, mode and entity; unapplied expressions return after cancellation');
      const frames=path.join(folder,'after-cancel.frames');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},frames);await reveal('animation-settings');await page.locator('#animation-png').click();
      await page.waitForFunction(file=>document.getElementById('animation-progress').textContent==='Exported '+file&&!document.getElementById('animation-png').disabled,frames);
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(frames,'sequence.json'),'utf8')).frameTimes,[0,.125,.25]);assert.equal((await fs.readdir(frames)).filter(name=>name.endsWith('.png')).length,3);
      const completed=await save('after-successful-animation');for(const key of ['derivedMode','sectionNormal','sectionOffset','entity'])assert.deepEqual(completed.state.view[key],before.state.view[key]);checks.push('canceled animation retries with exact PNG frame times and restores the section view');
      // Oblique hypercube cuts vary with depth; axis-W cuts are congruent cubes.
      await page.locator('#section-normal').fill('.2, .3, .4, 1');await page.locator('#apply-section').click();await ready();const sweepBefore=await save('before-section-sweep');
      await reveal('animation-settings');await page.locator('#animation-target').selectOption('section');await page.locator('#animation-section').click();await page.waitForFunction(()=>!document.getElementById('animation-section').disabled);
      const sectionFrames=path.join(folder,'section-sweep.frames');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},sectionFrames);await page.locator('#animation-png').click();
      await page.waitForFunction(file=>document.getElementById('animation-progress').textContent==='Exported '+file&&!document.getElementById('animation-png').disabled,sectionFrames);
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(sectionFrames,'sequence.json'),'utf8')).frameTimes,[0,.125,.25]);assert.notDeepEqual(await fs.readFile(path.join(sectionFrames,'frame-000000.png')),await fs.readFile(path.join(sectionFrames,'frame-000001.png')));
      const swept=await save('after-section-sweep');for(const key of ['derivedMode','sectionNormal','sectionOffset','entity'])assert.deepEqual(swept.state.view[key],sweepBefore.state.view[key]);checks.push('owned oblique section-depth sweep exports changing geometry at exact PNG times and restores the original plane');
      await page.locator('#section-normal').fill('0, 0, 0, 2');await page.locator('#apply-section').click();await ready();
      for(const size of [{width:1200,height:760},{width:1500,height:950}]){await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size.width,size.height),size);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('#apply-section').isVisible(),true);}
      // Check synchronously in the same input turn, before the 200ms debounce.
      assert.equal(await page.locator('#section-offset').evaluate(n=>{n.value='.25';n.dispatchEvent(new Event('input',{bubbles:true}));return document.getElementById('promote').disabled;}),true);
      await page.waitForFunction(()=>!document.getElementById('promote').disabled&&document.getElementById('cancel').hidden);
      const slid=await save('slid-section');assert.ok(Math.abs(slid.state.view.sectionOffset-.25)<.02);assert.deepEqual(slid.state.model,original.state.model);
      await page.locator('#section-depth').fill(String(extent*2));await page.locator('#apply-section').click();await page.waitForFunction(()=>document.getElementById('derived-status').textContent==='Empty intersection'&&document.getElementById('cancel').hidden);assert.equal(await page.locator('#promote').isDisabled(),true);
      await page.locator('#section-depth').fill('0');await page.locator('#apply-section').click();await page.waitForFunction(()=>!document.getElementById('promote').disabled&&document.getElementById('cancel').hidden);
      const sectionSaved=await save('saved-section');await page.locator('#derived-mode').selectOption('cell');await ready();
      await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},sectionSaved.file);await page.locator('#open').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Opened '+file,sectionSaved.file);await ready();
      const reopened=await save('reopened-section');for(const key of ['derivedMode','sectionNormal','sectionOffset','entity'])assert.deepEqual(reopened.state.view[key],sectionSaved.state.view[key]);assert.deepEqual(reopened.state.model,original.state.model);
      await page.screenshot({path:path.join(folder,'section-controls.png')});
      await page.locator('#derived-mode').selectOption('cell-section');await page.waitForFunction(()=>!document.getElementById('promote').disabled&&document.getElementById('cancel').hidden);assert.equal(await page.locator('#entity-id').isVisible(),false);
      await page.locator('#promote').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent!=='Tesseract'&&document.getElementById('cancel').hidden);const promoted=await save('promoted-section');assert.equal(promoted.state.model.dimension,3);assert.equal(promoted.state.model.vertices.length,8);
      const project=JSON.parse(await fs.readFile(promoted.file,'utf8'));assert.deepEqual(project.documents[0].states[0].model,original.state.model);checks.push('depth input disables stale promotion immediately; empty sections cannot promote; Save/Open and 3D promotion preserve the original 4D source');
      await page.locator('#help').click();await page.locator('#help-search').fill('sections');await page.locator('[data-topic="sections"]').click();assert.match(await page.locator('#help-topic').textContent(),/normal is normalized/);assert.match(await page.locator('#help-topic').textContent(),/literal whole numbers/);await page.locator('#close-help').click();checks.push('offline guide exposes current section/ID/export behavior after removing superseded static help');
    }
    await page.screenshot({path:path.join(folder,'section-workspace.png')});assert.deepEqual(errors,[]);
    let benchmark;
    if(measure)benchmark=await page.evaluate(async()=>{
      const run=(op,model,params)=>window.polytope.engine({op,model,params},crypto.randomUUID()),samples={},models={},geometry={};
      for(const key of ['tesseract','cell120']){
        const model=await run('generate',null,{kind:'regular',key}),params={normal:[.2,.3,.4,1],offset:.1,fill_rule:'nonzero'};
        const summary=r=>JSON.stringify({status:r.status,vertices:r.model?.vertices,edges:r.model?.edges,faces:r.model?.faces,cells:r.model?.cells});
        const reference=await run('section',model,params),expected=summary(reference);samples[key]=[];models[key]={name:model.name,vertices:model.vertices.length,cells:model.cells.length};
        geometry[key]={status:reference.status,vertices:reference.model.vertices.length,edges:reference.model.edges.length,faces:reference.model.faces.length};
        for(let i=0;i<5;i++){const start=performance.now(),result=await run('section',model,params);samples[key].push(performance.now()-start);if(summary(result)!==expected)throw Error('Section output changed between repeated jobs');}
      }
      return {samples,models,geometry,settings:{normal:[.2,.3,.4,1],offset:.1,fillRule:'nonzero',repetitions:5}};
    });
    const result={passed:true,purpose:baseline||pendingAudit?'baseline reproduction':'section workflow qualification',version:await app.evaluate(({app})=>app.getVersion()),packaged:runtime.packaged,visible,baseline,pendingAudit,findings,checks,benchmark,
      enginePoolSha256:createHash('sha256').update(await fs.readFile(path.join(root,'desktop','engine-pool.cjs'))).digest('hex'),hardware:{cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memoryGiB:os.totalmem()/2**30,platform:os.platform(),release:os.release()},errors};await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({folder,...result},null,2));
  }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({error:error.stack,checks,findings,errors},null,2));console.error('Artifacts:',folder);throw error;}finally{await app?.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
