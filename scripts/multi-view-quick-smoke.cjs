const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function main(){
  const folder=await fs.mkdtemp(path.join(root,'artifacts','multi-view-quick-')),profile=path.join(folder,'profile');await fs.mkdir(profile);
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.POLYTOPE_TEST_MODE;
  const app=await require('playwright')._electron.launch({executablePath:require('electron'),args:[root],cwd:root,env});
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    await app.evaluate(({dialog},destination)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:destination});},path.join(folder,'six-views.png'));
    await page.locator('#open-multiple-views').click();
    await page.waitForFunction(()=>document.getElementById('multiple-views-status')?.textContent==='4 independent source views.');
    await page.locator('#multiple-views-count').selectOption('6');
    await page.waitForFunction(()=>document.querySelectorAll('#multiple-views-grid canvas').length===6&&!document.getElementById('multiple-views-export').disabled);
    await page.locator('.multi-tile-bar button').filter({hasText:'Maximize'}).first().click();
    await page.locator('.multi-tile-bar button').filter({hasText:'Restore'}).first().click();
    await page.locator('#multiple-views-export').click();
    await page.waitForFunction(()=>document.getElementById('multiple-views-status')?.textContent.startsWith('Saved multiple-view grid'));
    const bytes=await fs.readFile(path.join(folder,'six-views.png'));assert.equal(bytes.subarray(1,4).toString(),'PNG');
    await page.locator('#multiple-views-dialog').screenshot({path:path.join(folder,'workspace.png')});
    await page.locator('#multiple-views-close').click();
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,views:6,gridPngBytes:bytes.length,pageErrors:errors},null,2));
    console.log('Multiple views quick smoke PASS:',folder);
  }catch(error){await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({message:error.message,pageErrors:errors,text:await page.locator('body').innerText()},null,2));console.error('Failure evidence:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
