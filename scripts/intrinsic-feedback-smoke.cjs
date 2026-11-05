// Hold real native measurement/identity replies after computation.
const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline');
async function main(){
 const folder=await fs.mkdtemp(path.join(root,'artifacts','intrinsic-feedback-')),profile=path.join(folder,'profile');await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
 const runtime=await require('./hidden-runtime.cjs').hiddenRuntime(),env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.POLYTOPE_TEST_MODE;if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-python.exe');
 let app,page;const errors=[],findings={},checks=[];
 try{
  app=await electron.launch({executablePath:runtime.executablePath,args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});page=await app.firstWindow();require('./smoke-helpers.cjs').autoReveal(page);page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  const ready=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
  await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract'&&document.getElementById('cancel').hidden);
  await app.evaluate(({ipcMain})=>{const original=ipcMain._invokeHandlers.get('engine'),h=globalThis.intrinsicHarness={original,op:null,pending:[],returned:0};ipcMain.removeHandler('engine');ipcMain.handle('engine',async(event,request,id)=>{const held=request.op===h.op,result=await original(event,request,id);if(held)await new Promise(resolve=>h.pending.push({resolve,result}));h.returned++;return result;});});
  const arm=op=>app.evaluate((_e,op)=>{const h=globalThis.intrinsicHarness;h.op=op;h.pending=[];h.returned=0;},op);
  const held=()=>app.evaluate(async()=>{const end=Date.now()+10000;while(!globalThis.intrinsicHarness.pending.length){if(Date.now()>end)throw Error('Native reply not held');await new Promise(r=>setTimeout(r,10));}});
  const release=()=>app.evaluate(()=>{const h=globalThis.intrinsicHarness;h.op=null;for(const p of h.pending)p.resolve();});
  await page.locator('[data-key="cube"]').click();await ready();await page.locator('#toggle-inspector').click();await page.locator('[data-panel="info"]').click();
  await page.locator('#measurement-kind').selectOption('distance');await page.locator('#measurement-ids').fill('0, 1');await arm('measure');await page.locator('#measure').click();await held();
  const oldValue=await app.evaluate(()=>globalThis.intrinsicHarness.pending[0].result.value);
  await page.locator('#measurement-ids').fill('0, 3');await release();await ready();const lateText=await page.locator('#measurement-result').textContent();findings.oldMeasurementPublishedForNewInputs=Number.parseFloat(lateText)===oldValue;
  await page.locator('#measure').click();await ready();const freshText=await page.locator('#measurement-result').textContent();assert.ok(Math.abs(Number.parseFloat(freshText)-Math.sqrt(8))<1e-5);
  await page.locator('#measurement-ids').fill('0, 2');findings.completedMeasurementRemainedAfterEdit=(await page.locator('#measurement-result').textContent())===freshText;
  checks.push('editing measurement inputs refuses a held result and clears an already displayed result; fresh measurement uses the new indices');
  if(!baseline){
   await page.locator('#measurement-kind').selectOption('angle');await page.locator('#measurement-ids').fill('0, 1, 3');await page.locator('#measure').click();await ready();assert.ok(Math.abs(Number.parseFloat(await page.locator('#measurement-result').textContent())-90)<1e-6);
   await arm('measure');await page.locator('#measure').click();await held();assert.equal(await page.locator('#measurement-result').getAttribute('data-status'),'pending');await page.locator('#cancel').click();await ready();await release();await ready();assert.equal(await page.locator('#measurement-result').getAttribute('data-status'),'canceled');
   await page.locator('#measure').click();await ready();assert.ok(Math.abs(Number.parseFloat(await page.locator('#measurement-result').textContent())-90)<1e-6);checks.push('real angle measurement, explicit Cancel and a fresh retry retain the expected native 90-degree result');
  }
  await page.locator('[data-key="tesseract"]').click();await ready();await page.locator('[data-panel="evidence"]').click();await page.locator('#validate-regular4d').click();await ready();assert.equal(await page.locator('#regular4d-validation-result').getAttribute('data-status'),'passed');
  const firstText=await page.locator('#regular4d-validation-result').textContent();await arm('regular4d-validate');await page.locator('#validate-regular4d').click();await held();findings.previousIdentityRemainedWhileChecking=(await page.locator('#regular4d-validation-result').textContent())===firstText;
  if(!baseline){assert.equal(await page.locator('#regular4d-validation-result').getAttribute('data-status'),'pending');await page.screenshot({path:path.join(folder,'identity-pending.png')});}
  await page.locator('#model-unit').evaluate(node=>{node.value='mm';node.dispatchEvent(new Event('change',{bubbles:true}));});await page.locator('#notes').evaluate(node=>{node.value='Observer notes while checking';node.dispatchEvent(new Event('input',{bubbles:true}));});
  await release();await ready();findings.identityRejectedNotesOrUnitEdit=await page.locator('#toast').textContent().then(s=>s.includes('units, notes, or attributes changed'));
  if(!baseline){assert.equal(await page.locator('#regular4d-validation-result').getAttribute('data-status'),'passed');assert.equal(await page.locator('#model-unit').inputValue(),'mm');assert.equal(await page.locator('#notes').inputValue(),'Observer notes while checking');}
  checks.push('regular identity clears prior feedback while pending and permits notes/unit-display edits without changing intrinsic geometry');
  await arm('regular4d-validate');await page.locator('#validate-regular4d').click();await held();await page.locator('[data-key="cube"]').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');await release();await ready();
  findings.identityShowedStaleSourceError=await page.locator('#toast').textContent().then(s=>s.includes('source, units, notes, or attributes changed'));
  checks.push('a held identity result after selecting another model is discarded without a stale error on the new workspace');
  if(!baseline)for(const [key,value] of Object.entries(findings))assert.equal(value,false,key);
  assert.deepEqual(errors,[]);await page.screenshot({path:path.join(folder,'workspace.png')});const result={passed:true,baseline,version:await app.evaluate(({app})=>app.getVersion()),packaged:runtime.packaged,findings,checks,errors};await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({folder,...result},null,2));
 }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({error:error.stack,findings,checks,errors},null,2));console.error('Artifacts:',folder);throw error;}
 finally{await app?.evaluate(({ipcMain})=>{const h=globalThis.intrinsicHarness;if(h){ipcMain.removeHandler('engine');ipcMain.handle('engine',h.original);for(const p of h.pending)p.resolve();}delete globalThis.intrinsicHarness;}).catch(()=>{});await app?.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
