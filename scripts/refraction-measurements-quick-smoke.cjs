const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function main(){
  const folder=await fs.mkdtemp(path.join(root,'artifacts','refraction-measurements-quick-')),profile=path.join(folder,'profile');await fs.mkdir(profile);
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.POLYTOPE_TEST_MODE;
  const app=await require('playwright')._electron.launch({executablePath:require('electron'),args:[root],cwd:root,env});const page=await app.firstWindow(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const capture=async name=>{const filePath=path.join(folder,name);await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},filePath);await page.locator('#image').click();for(let i=0;i<100;i++){try{if((await fs.stat(filePath)).size>100)return fs.readFile(filePath);}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw Error('PNG capture did not finish.');};
  try{
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    const ids=await page.evaluate(async()=>{const model=await window.polytope.engine({op:'generate',params:{kind:'regular',key:'tesseract'}});return [-1,1].map(w=>model.cells.findIndex(cell=>cell.every(f=>model.faces[f].every(v=>model.vertices[v][3]===w))));});assert(ids.every(i=>i>=0));
    await page.locator('#toggle-inspector').click();await page.locator('#measure-a-kind').selectOption('cell');await page.locator('#measure-b-kind').selectOption('cell');await page.locator('#measure-a-ids').fill(String(ids[0]));await page.locator('#measure-b-ids').fill(String(ids[1]));await page.locator('#measure-bounded').check();await page.locator('#measure-flat-distance').click();
    await page.waitForFunction(()=>document.getElementById('entity-measure-result')?.textContent.includes('Numerical distance bounds:'));const measurement=await page.locator('#entity-measure-result').innerText();assert.match(measurement,/^2 model-units/);
    await page.locator('#surface-settings > summary').click();await page.locator('#material-effects-settings > summary').click();await page.locator('#effects-reflection').selectOption('studio');await page.locator('#effects-reflectivity').fill('0.8');await page.locator('#effects-apply').click();await page.waitForFunction(()=>!document.getElementById('effects-apply').disabled);
    const before=await capture('reflection.png');
    if(!await page.locator('#surface-settings').evaluate(panel=>panel.open))await page.locator('#surface-settings > summary').click();
    if(!await page.locator('#material-effects-settings').evaluate(panel=>panel.open))await page.locator('#material-effects-settings > summary').click();
    await page.locator('#effects-environmentMode').selectOption('refraction');await page.locator('#effects-refractiveIndex').fill('sqrt(2)');await page.locator('#effects-apply').click();await page.waitForFunction(()=>!document.getElementById('effects-apply').disabled);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const after=await capture('refraction.png');assert.notDeepEqual(after,before,'Refraction must change actual rendered pixels');
    const projectPath=path.join(folder,'refraction.polyproj');await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},projectPath);await page.locator('#save').click();
    for(let i=0;i<100;i++){try{if((await fs.stat(projectPath)).size>100)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
    const project=JSON.parse(await fs.readFile(projectPath,'utf8')),document=project.documents[0],effects=document.states[document.cursor].view.materialEffects;assert.equal(effects.environmentMode,'refraction');assert(Math.abs(effects.refractiveIndex-Math.SQRT2)<1e-12);
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,environmentRefractionGPU:true,indexExpression:true,savedNativeSettings:true,bounded4DCellDistance:measurement,errors},null,2));console.log('Refraction/measurements quick smoke PASS:',folder);
  }catch(error){await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({message:error.message,errors,text:await page.locator('body').innerText()},null,2));console.error('Failure evidence:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
