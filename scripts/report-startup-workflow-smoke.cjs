// Audit real report/discovery replies held after native completion.
const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline');
async function main(){
  const folder=await fs.mkdtemp(path.join(root,'artifacts','report-startup-')),profile=path.join(folder,'profile');await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const runtime=await require('./hidden-runtime.cjs').hiddenRuntime(),env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.POLYTOPE_TEST_MODE;if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-python.exe');
  let app,page;const errors=[],checks=[],findings={};
  try{
    app=await electron.launch({executablePath:runtime.executablePath,args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
    page=await app.firstWindow();require('./smoke-helpers.cjs').autoReveal(page);page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
    const ready=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
    const euler=()=>page.locator('#evidence pre').textContent().then(s=>JSON.parse(s).validation.eulerCharacteristic);
    const save=async name=>{const file=path.join(folder,name+'.polyproj');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);return JSON.parse(await fs.readFile(file,'utf8'));};
    await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract'&&document.getElementById('cancel').hidden);
    await page.locator('[data-key="cube"]').click();await ready();assert.equal(await euler(),2);
    await app.evaluate(({ipcMain})=>{
      const original=ipcMain._invokeHandlers.get('engine'),h=globalThis.reportHarness={original,ops:[],pending:[],serial:0,returned:[],requests:[],failCatalog:0};
      ipcMain.removeHandler('engine');ipcMain.handle('engine',async(event,request,id)=>{const hold=h.ops.includes(request.op),serial=++h.serial;h.requests.push({serial,op:request.op,id});const result=await original(event,request,id);if(request.op==='catalog'&&h.failCatalog>0){h.failCatalog--;throw Error('Fixture temporary catalog transport failure');}if(hold)await new Promise(resolve=>h.pending.push({serial,op:request.op,release:resolve,result}));h.returned.push(serial);return result;});
    });
    const arm=ops=>app.evaluate((_e,ops)=>{const h=globalThis.reportHarness;h.ops=ops;h.pending=[];h.requests=[];h.returned=[];},ops);
    const held=op=>app.evaluate(async(_e,op)=>{const end=Date.now()+10000;while(!globalThis.reportHarness.pending.some(p=>p.op===op)){if(Date.now()>end)throw Error('No held '+op);await new Promise(r=>setTimeout(r,10));}},op);
    const release=async op=>{const ids=await app.evaluate((_e,op)=>{const h=globalThis.reportHarness,items=h.pending.filter(p=>p.op===op);h.ops=h.ops.filter(x=>x!==op);for(const p of items)p.release();return items.map(p=>p.serial);},op);await app.evaluate(async(_e,ids)=>{const end=Date.now()+10000;while(!ids.every(id=>globalThis.reportHarness.returned.includes(id))){if(Date.now()>end)throw Error('Held reply did not return');await new Promise(r=>setTimeout(r,10));}},ids);};
    await page.locator('#toggle-inspector').click();await page.locator('[data-panel="evidence"]').click();
    await arm(['validate','analyze']);await page.locator('#validate').click();await held('validate');
    await page.locator('[data-key="tesseract"]').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract');await held('analyze');
    findings.oldValidationVisibleWhileLoading=await page.locator('#evidence pre').count()>0;
    findings.oldAnalysisVisibleWhileLoading=await page.locator('#analysis').textContent().then(s=>s.includes('Volume'));
    await page.screenshot({path:path.join(folder,'pending-report.png')});await release('analyze');
    await page.waitForFunction(()=>{const p=document.querySelector('#evidence pre');return p&&JSON.parse(p.textContent).validation.eulerCharacteristic===0;});
    await release('validate');await ready();findings.lateValidationReplacedCurrent=(await euler())!==0;
    checks.push('report loading clears prior source data and a late Cube validation cannot replace the current Tesseract report');
    if(!baseline){
      await page.locator('#validate').click();await ready();assert.equal(await euler(),0);assert.equal(await page.locator('#evidence pre').count(),1);
      checks.push('fresh validation succeeds without duplicate report blocks');
      await arm(['analyze','validate']);await page.locator('[data-key="cube"]').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');await held('analyze');
      await page.locator('#validate').click();await held('validate');await release('analyze');
      await page.waitForFunction(()=>document.getElementById('analysis').textContent.includes('Volume'));
      assert.equal(await page.locator('#evidence pre').count(),0);assert.match(await page.locator('#evidence').textContent(),/Checking current model/);
      await release('validate');await ready();assert.equal(await euler(),2);
      checks.push('automatic analysis can finish its own fields while a newer manual validation retains ownership of the pending report');
    }
    await arm(['catalog']);await page.reload();await held('catalog');await page.locator('#cancel').click();await ready();await release('catalog');
    findings.catalogRowsAfterStartupCancel=await page.locator('#catalog [data-key]').count();findings.discoveryRetryAvailable=await page.locator('#catalog-retry').isVisible();
    if(!baseline){
      assert.equal(findings.discoveryRetryAvailable,true);
      assert.equal((await page.locator('#catalog').textContent()).includes('No matching models'),false);
      for(const size of [{width:1200,height:760},{width:1500,height:950}]){await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size.width,size.height),size);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(folder,`library-canceled-${size.width}.png`)});}
      await page.locator('#catalog-retry').click();await ready();assert.ok(await page.locator('#catalog [data-key]').count()>0);assert.equal(await page.locator('#document-tabs button').count(),0);
      await page.locator('[data-key="cube"]').click();await ready();assert.equal(await page.locator('#model-name').textContent(),'Cube');
      checks.push('canceled startup discovery offers an explicit retry; retry restores the library without an unsolicited default model');
      await arm([]);await app.evaluate(()=>globalThis.reportHarness.failCatalog=1);await page.reload();
      await page.waitForFunction(()=>{const b=document.getElementById('catalog-retry');return b&&!b.hidden&&b.textContent==='Retry Library';});await ready();
      assert.equal(await page.locator('#document-tabs button').count(),0);await page.locator('#new').click();await ready();assert.equal(await page.locator('#model-name').textContent(),'Tesseract');
      const beforeRetry=await save('before-library-retry');await page.locator('#catalog-retry').click();await ready();assert.ok(await page.locator('#catalog [data-key]').count()>0);const afterRetry=await save('after-library-retry');assert.deepEqual(afterRetry.documents,beforeRetry.documents);assert.equal(afterRetry.active,beforeRetry.active);
      checks.push('one simulated transport failure offers Retry Library; New still works and real native catalog retry preserves the saved project exactly');
    }
    if(!baseline){assert.equal(findings.oldValidationVisibleWhileLoading,false);assert.equal(findings.oldAnalysisVisibleWhileLoading,false);assert.equal(findings.lateValidationReplacedCurrent,false);}
    assert.deepEqual(errors,[]);await page.screenshot({path:path.join(folder,'workspace.png')});
    const result={passed:true,baseline,purpose:baseline?'report/startup behavior baseline':'report/startup qualification',version:await app.evaluate(({app})=>app.getVersion()),packaged:runtime.packaged,findings,checks,errors};await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({folder,...result},null,2));
  }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({error:error.stack,findings,checks,errors},null,2));console.error('Artifacts:',folder);throw error;}
  finally{await app?.evaluate(({ipcMain})=>{const h=globalThis.reportHarness;if(h){ipcMain.removeHandler('engine');ipcMain.handle('engine',h.original);for(const p of h.pending)p.release();}delete globalThis.reportHarness;}).catch(()=>{});await app?.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
