const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function main(){
  const folder=await fs.mkdtemp(path.join(root,'artifacts','surface-tools-quick-')),profile=path.join(folder,'profile');await fs.mkdir(profile);
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.POLYTOPE_TEST_MODE;
  const app=await require('playwright')._electron.launch({executablePath:require('electron'),args:[root],cwd:root,env});
  const page=await app.firstWindow(),errors=[],consoleErrors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  try{
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();await page.locator('#basic-solid-settings > summary').click();await page.locator('#basic-generate').click();
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Edge-defined tetrahedron');
    await page.locator('#surface-settings > summary').click();await page.locator('#material-effects-settings > summary').click();await frame();
    const baseline=await page.locator('#base-canvas').screenshot({path:path.join(folder,'baseline.png')});
    await page.locator('#effects-bump').selectOption('waves');await page.locator('#effects-bumpStrength').fill('0.06');await page.locator('#effects-bumpFrequency').fill('5');await page.locator('#effects-apply').click();
    await page.waitForFunction(()=>!document.getElementById('effects-apply').disabled);await frame();
    const bump=await page.locator('#base-canvas').screenshot({path:path.join(folder,'bump.png')});assert.notDeepEqual(bump,baseline,'Bump must change rendered pixels');
    await page.locator('#effects-reflection').selectOption('studio');await page.locator('#effects-reflectivity').fill('0.65');await page.locator('#effects-apply').click();await page.waitForFunction(()=>!document.getElementById('effects-apply').disabled);
    const png=path.join(folder,'effects-capture.png');await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},png);await page.locator('#image').click();
    for(let i=0;i<100;i++){try{if((await fs.stat(png)).size>100)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
    assert((await fs.stat(png)).size>100);await frame();const reflected=await page.locator('#base-canvas').screenshot({path:path.join(folder,'bump-studio.png')});assert.notDeepEqual(reflected,bump,'Studio reflection must change rendered pixels');
    await page.locator('#surface-settings > summary').click();
    await page.locator('#stellation-evaluate').click();await page.waitForFunction(()=>document.querySelectorAll('#stellation-regions input').length>0);
    await page.locator('#stellation-cell-settings > summary').click();await page.locator('#stellation-cell-evaluate').click();await page.waitForFunction(()=>document.querySelector('#stellation-cell-diagram svg g[data-region]'));
    const cell=page.locator('#stellation-cell-diagram svg g[data-region]').first();const before=await cell.getAttribute('aria-pressed');await cell.click();await page.waitForFunction(before=>document.querySelector('#stellation-cell-diagram svg g[data-region]')?.getAttribute('aria-pressed')!==before,before);
    await page.locator('#stellation-cell-undo').click();assert.equal(await cell.getAttribute('aria-pressed'),before);await page.locator('#stellation-cell-redo').click();await page.locator('#stellation-cell-fill').click();
    await page.locator('#exact-section-settings > summary').click();await page.locator('#exact-section-normal').fill('1, 1, 1');await page.locator('#exact-section-offset').fill('1/3');await page.locator('#preview-exact-section').click();await page.waitForFunction(()=>!document.getElementById('adopt-exact-section').disabled);
    const sectionPreview=await page.locator('#exact-section-result').innerText();await page.locator('#adopt-exact-section').click();await page.waitForFunction(()=>document.getElementById('model-name')?.textContent!=='Edge-defined tetrahedron');
    assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);await page.screenshot({path:path.join(folder,'section-workspace.png')});
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,bumpGPU:true,studioGPU:true,captureReady:true,cellSelectionUndoRedo:true,conservativeFill:true,exactSectionPreview:sectionPreview,sectionAdopted:true,pageErrors:errors,consoleErrors},null,2));console.log('Surface tools quick smoke PASS:',folder);
  }catch(error){await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({message:error.message,pageErrors:errors,consoleErrors,text:await page.locator('body').innerText()},null,2));console.error('Failure evidence:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
