// Hold real completed native replies; inspect saved projects, not just labels.
const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline');
async function main(){
  const folder=await fs.mkdtemp(path.join(root,'artifacts','publication-workflow-')),profile=path.join(folder,'profile');await fs.mkdir(profile);
  await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const runtime=await require('./hidden-runtime.cjs').hiddenRuntime(),env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.POLYTOPE_TEST_MODE;
  if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-python.exe');
  let app,page;const errors=[],checks=[],findings={};
  try{
    app=await electron.launch({executablePath:runtime.executablePath,args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
    await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
    const settled=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract'&&document.getElementById('cancel').hidden);
    const observe=()=>page.evaluate(()=>{window.publicationStatuses=[];new MutationObserver(()=>window.publicationStatuses.push(document.getElementById('status').textContent)).observe(document.getElementById('status'),{childList:true,subtree:true,characterData:true});});await observe();
    const save=async name=>{const file=path.join(folder,name+'.polyproj');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);return {file,project:JSON.parse(await fs.readFile(file,'utf8'))};};
    const open=async(file,{wait=true}={})=>{await page.evaluate(()=>window.publicationStatuses=[]);await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#open').click();await page.waitForFunction(file=>window.publicationStatuses.includes('Opened '+file),file);if(wait)await settled();};
    const original=await save('original');
    await page.locator('[data-key="cube"]').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube'&&document.getElementById('cancel').hidden);
    const cube=await save('cube');
    await app.evaluate(({ipcMain})=>{
      const original=ipcMain._invokeHandlers.get('engine'),cancel=ipcMain._invokeHandlers.get('cancel');
      const h=globalThis.publicationHarness={original,cancel,op:null,pending:[],requests:[],canceled:[],returned:0};
      ipcMain.removeHandler('engine');ipcMain.handle('engine',async(event,request,id)=>{const hold=request.op===h.op;h.requests.push({op:request.op,id});const result=await original(event,request,id);if(hold)await new Promise(resolve=>h.pending.push({id,release:resolve}));h.returned++;return result;});
      ipcMain.removeHandler('cancel');ipcMain.handle('cancel',(event,id)=>{h.canceled.push(id);return cancel(event,id);});
    });
    const arm=op=>app.evaluate((_e,op)=>{const h=globalThis.publicationHarness;h.op=op;h.pending=[];h.requests=[];h.canceled=[];h.returned=0;},op);
    const held=()=>app.evaluate(async()=>{const end=Date.now()+10000;while(!globalThis.publicationHarness.pending.length){if(Date.now()>end)throw Error('Native result was not held');await new Promise(r=>setTimeout(r,10));}});
    const release=async()=>{await app.evaluate(()=>{const h=globalThis.publicationHarness;h.op=null;for(const p of h.pending)p.release();});await app.evaluate(async()=>{const end=Date.now()+10000;while(globalThis.publicationHarness.returned===0){if(Date.now()>end)throw Error('Native reply did not return');await new Promise(r=>setTimeout(r,10));}});};
    const advanced=async()=>{if(!await page.locator('#inspector-region').isVisible())await page.locator('#toggle-inspector').click();await page.locator('[data-panel="evidence"]').click();};
    const certify=async()=>{await advanced();await page.locator('#certify-current').click();await held();};

    await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();
    await arm('recipe-run');await page.locator('#make-dual').click();await held();await page.locator('#cancel').click();
    assert.ok(await app.evaluate(()=>globalThis.publicationHarness.canceled.length>0));
    findings.cancelClearedBusyBeforeReply=await page.locator('#cancel').isHidden();
    await release();await settled();const canceled=await save('canceled-dual');
    findings.canceledDualPublished=canceled.project.documents[canceled.project.active].states.length!==cube.project.documents[cube.project.active].states.length;
    checks.push('Cancel refuses a completed recipe reply and releases busy feedback before its late delivery');
    if(!baseline){
      assert.deepEqual(canceled.project.documents,cube.project.documents);
      await page.locator('#make-dual').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Dual of Cube'&&document.getElementById('cancel').hidden);
      const retry=await save('dual-retry');const before=cube.project.documents[cube.project.active],after=retry.project.documents[retry.project.active];
      assert.equal(after.states.length,before.states.length+1);
      assert.deepEqual(after.states.slice(0,-1).map(({operationNode,...state})=>state),before.states);
      assert.deepEqual(after.operationHistory.nodes.find(n=>n.id===after.states[0].operationNode).snapshot,before.states[0]);
      assert.equal(after.states.at(-1).model.vertices.length,6);
      checks.push('a fresh dual succeeds after cancellation and preserves the original source history');
    }

    await open(cube.file);await arm('rational-hull');await certify();await page.locator('#cancel').click();await release();await settled();
    const canceledCertificate=await save('canceled-certificate');findings.canceledCertificatePublished=canceledCertificate.project.documents.length!==cube.project.documents.length;
    checks.push('Cancel discards a late exact certification document');
    if(!baseline){
      assert.deepEqual(canceledCertificate.project.documents,cube.project.documents);await advanced();await page.locator('#certify-current').click();
      await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Rational input hull of Cube'&&document.getElementById('cancel').hidden);
      const retry=await save('certificate-retry'),last=retry.project.documents.at(-1).states[0].model;assert.equal(last.numeric.certified,true);assert.equal(last.vertices.length,8);assert.deepEqual(retry.project.documents.slice(0,-1),cube.project.documents);
      checks.push('fresh certification succeeds with its exact certificate and retains every prior document');
    }

    await open(cube.file);await arm('rational-hull');await certify();await open(original.file,{wait:false});await release();await settled();
    const replaced=await save('certificate-after-open');findings.certificateEnteredReplacement=replaced.project.documents.length!==original.project.documents.length;
    checks.push('a certification reply cannot enter a replacement project');

    // Reload the renderer to hold its actual bootstrap catalog response, before
    // its default model can be requested. Keep native dialogs in the harness.
    await arm('catalog');await page.reload();await held();await observe();
    await app.evaluate(({dialog})=>{dialog.showOpenDialog=()=>new Promise(resolve=>globalThis.resolvePublicationOpen=resolve);});
    await page.locator('#open').click();await release();await settled();
    findings.defaultStartedAfterOpen=await app.evaluate(()=>globalThis.publicationHarness.requests.some(r=>r.op==='generate'));
    await app.evaluate((_e,file)=>{globalThis.resolvePublicationOpen({canceled:false,filePaths:[file]});delete globalThis.resolvePublicationOpen;},original.file);
    await page.waitForFunction(file=>window.publicationStatuses.includes('Opened '+file)||document.getElementById('toast').textContent.includes('Workspace changed while opening'),original.file);
    findings.startupOpenRefused=await page.locator('#toast').textContent().then(s=>s.includes('Workspace changed while opening'));
    if(!findings.startupOpenRefused){await settled();const startup=await save('startup-open');assert.equal(startup.project.documents.length,original.project.documents.length);}
    checks.push('Open intent before the initial catalog arrives prevents default-model publication and preserves the selected project');
    if(!baseline){
      await page.evaluate(project=>window.polytope.autosave(project),original.project);
      await arm('catalog');await page.reload();await held();await observe();
      await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.find(i=>i.label==='File').submenu.items.find(i=>i.label==='Recover autosave').click());
      await page.waitForFunction(()=>window.publicationStatuses.some(s=>s.startsWith('Recovered autosave.')));
      await release();await settled();
      findings.recoverDefaultStarted=await app.evaluate(()=>globalThis.publicationHarness.requests.some(r=>r.op==='generate'));
      assert.equal(findings.recoverDefaultStarted,false);const recovered=await save('startup-recover');assert.deepEqual(recovered.project.documents,original.project.documents);
      checks.push('native Recover before startup discovery finishes restores the isolated autosave without an extra default model');
    }
    if(!baseline){assert.equal(findings.cancelClearedBusyBeforeReply,true);for(const key of ['canceledDualPublished','canceledCertificatePublished','certificateEnteredReplacement','defaultStartedAfterOpen','startupOpenRefused'])assert.equal(findings[key],false,key);}
    assert.deepEqual(errors,[]);await page.screenshot({path:path.join(folder,'workspace.png')});
    const result={passed:true,baseline,purpose:baseline?'publication behavior baseline':'publication workflow qualification',version:await app.evaluate(({app})=>app.getVersion()),packaged:runtime.packaged,findings,checks,errors};await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({folder,...result},null,2));
  }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({error:error.stack,findings,checks,errors},null,2));console.error('Artifacts:',folder);throw error;}
  finally{await app?.evaluate(({ipcMain})=>{const h=globalThis.publicationHarness;if(h){ipcMain.removeHandler('engine');ipcMain.handle('engine',h.original);ipcMain.removeHandler('cancel');ipcMain.handle('cancel',h.cancel);for(const p of h.pending)p.release();}delete globalThis.publicationHarness;}).catch(()=>{});await app?.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
