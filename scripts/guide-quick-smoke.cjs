// SPDX-License-Identifier: GPL-3.0-only
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function main(){
  const folder=await fs.mkdtemp(path.join(root,'artifacts','guide-quick-')),env={...process.env,POLYTOPE_TEST_USER_DATA:path.join(folder,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.POLYTOPE_TEST_MODE;
  const app=await require('playwright')._electron.launch({executablePath:require('electron'),args:[root],cwd:root,env}),page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();await page.locator('#sphere-projection-settings > summary').click();await page.locator('#sphere-project-radius').focus();
    await page.keyboard.press('F1');await page.waitForFunction(()=>document.getElementById('help-dialog')?.open);assert.equal(await page.locator('#help-topic h3').innerText(),'Project onto a sphere');
    await page.locator('#help-search').fill('physical millimeters');assert.equal(await page.locator('#help-result-count').innerText(),'1 matching topics');assert.equal(await page.locator('#help-topic h3').innerText(),'Expressions and physical units');
    await page.locator('#help-search').fill('no-topic-matches-this');assert.equal(await page.locator('#help-result-count').innerText(),'0 matching topics');assert.match(await page.locator('#help-topic').innerText(),/No topics match/);
    await page.locator('#help-search').fill('');assert.equal(await page.locator('#help-result-count').innerText(),'21 matching topics');await page.locator('[data-topic="cell-nets"]').click();assert.match(await page.locator('#help-topic').innerText(),/convex or concave 3D cell boundaries/);await page.locator('#help-dialog').screenshot({path:path.join(folder,'offline-guide.png')});
    await page.keyboard.press('Escape');assert.equal(await page.locator('#help-dialog').evaluate(node=>node.open),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'sphere-project-radius');assert.equal(await page.locator('#model-name').innerText(),'Tesseract');assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,nativeF1:true,focusedControlTopic:true,offlineTopics:21,search:true,emptyResults:true,escapeRestoresFocus:true,sourceUnchanged:true,errors},null,2));console.log('Guide quick smoke PASS:',folder);
  }catch(error){await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({message:error.message,errors},null,2));console.error('Failure evidence:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
