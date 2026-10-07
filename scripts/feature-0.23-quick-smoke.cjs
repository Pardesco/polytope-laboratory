const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function main(){
  const folder=await fs.mkdtemp(path.join(root,'artifacts','feature-0.23-quick-')),profile=path.join(folder,'profile');await fs.mkdir(profile);
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.POLYTOPE_TEST_MODE;
  const app=await require('playwright')._electron.launch({executablePath:require('electron'),args:[root],cwd:root,env});
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    await page.locator('#surface-settings > summary').click();await page.locator('#material-lighting-settings > summary').click();
    await page.locator('#appearance-preset').selectOption('polished');await page.locator('#appearance-theme').selectOption('paper');
    await page.locator('#base-canvas').screenshot({path:path.join(folder,'polished-paper.png')});
    await page.locator('#surface-settings > summary').click();
    await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();
    await page.locator('#fitting-settings > summary').click();await page.locator('#fitting-mode').selectOption('equal-edges');await page.locator('#preview-fitting').click();
    await page.waitForFunction(()=>!document.getElementById('adopt-fitting').disabled);await page.locator('#adopt-fitting').click();
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Fitted Tesseract');
    await page.locator('#expansion-settings summary').click();await page.locator('#make-expansion').click();
    await page.waitForFunction(()=>document.querySelector('#counts-strip strong')?.textContent==='64');
    await page.locator('[data-panel="info"]').click();await page.locator('#project-metadata-settings summary').first().click();
    await page.locator('#metadata-title').fill('Expanded research tesseract');await page.locator('#metadata-author').fill('Randall');await page.locator('#metadata-save').click();
    await page.locator('#element-label-presets-settings summary').click();await page.locator('#label-preset-target-mode').selectOption('explicit');await page.locator('#label-preset-target-ids').fill('0,1,2');
    await page.locator('#label-preset-preview').click();await page.waitForFunction(()=>!document.getElementById('label-preset-apply').disabled);await page.locator('#label-preset-apply').click();
    await page.waitForFunction(()=>document.getElementById('label-preset-status')?.textContent==='Source labels recorded in history.');
    await app.evaluate(({dialog},destination)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:destination});},path.join(folder,'model.json'));
    await page.locator('#export').click();await page.locator('#export-format').selectOption('json');await page.locator('#confirm-export').click();
    await page.waitForFunction(()=>!document.getElementById('export-dialog').open);const exported=JSON.parse(await fs.readFile(path.join(folder,'model.json'),'utf8'));
    assert.equal(exported.vertices.length,64);assert.equal(exported.metadata.documentMetadata.title,'Expanded research tesseract');assert.equal(exported.metadata.documentMetadata.author,'Randall');
    await app.evaluate(({dialog},filePath)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[filePath]});},path.join(folder,'model.json'));
    await page.locator('#open').click();await page.waitForFunction(()=>document.querySelectorAll('#document-tabs button').length===2);
    assert.equal(await page.locator('#model-name').innerText(),'Expanded research tesseract');assert.equal(await page.locator('#metadata-author').inputValue(),'Randall');
    assert.deepEqual(errors,[]);await page.screenshot({path:path.join(folder,'workspace.png')});await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,fittingPreviewAndAdopt:true,materialPresets:true,expansion4D:true,labelsApplied:3,metadataJsonExport:true,metadataJsonReopen:true,pageErrors:errors},null,2));console.log('0.23 feature quick smoke PASS:',folder);
  }catch(error){await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({message:error.message,pageErrors:errors,text:await page.locator('body').innerText()},null,2));console.error('Failure evidence:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
