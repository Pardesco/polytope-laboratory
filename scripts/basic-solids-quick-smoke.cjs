const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function main(){
  const folder=await fs.mkdtemp(path.join(root,'artifacts','basic-solids-quick-')),profile=path.join(folder,'profile');await fs.mkdir(profile);
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.POLYTOPE_TEST_MODE;
  const app=await require('playwright')._electron.launch({executablePath:require('electron'),args:[root],cwd:root,env});
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();await page.locator('#basic-solid-settings > summary').click();
    for(const [index,key] of ['edge01','edge02','edge03','edge12','edge13','edge23'].entries())await page.locator('#basic-'+key).fill(['3','4','5','5','sqrt(34)','sqrt(41)'][index]);await page.locator('#basic-unit').selectOption('mm');
    const cases=[['edge-tetrahedron','Edge-defined tetrahedron','4'],['triangular-prism','Irregular triangular prism','6'],['triangular-grid','Triangular grid','15']];
    for(const [kind,name,count] of cases){await page.locator('#basic-kind').selectOption(kind);await page.locator('#basic-generate').click();await page.waitForFunction(name=>document.getElementById('model-name')?.textContent===name,name);assert.equal(await page.locator('#counts-strip strong').first().innerText(),count);}
    assert.deepEqual(errors,[]);await page.screenshot({path:path.join(folder,'triangular-grid.png')});await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,modes:cases.map(row=>row[0]),expressions:true,physicalUnits:true,pageErrors:errors},null,2));console.log('Basic solids quick smoke PASS:',folder);
  }catch(error){await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({message:error.message,pageErrors:errors,text:await page.locator('body').innerText()},null,2));console.error('Failure evidence:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
