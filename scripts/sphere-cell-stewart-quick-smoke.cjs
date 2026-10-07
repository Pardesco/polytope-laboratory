// SPDX-License-Identifier: GPL-3.0-only
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
async function main(){
  const folder=await fs.mkdtemp(path.join(root,'artifacts','sphere-cell-stewart-quick-')),profile=path.join(folder,'profile');await fs.mkdir(profile);
  const fixture=spawnSync('python',['-c','import json; from tests.test_generalized_cell_nets import dented_simplex; print(json.dumps(dented_simplex()))'],{cwd:root,windowsHide:true,encoding:'utf8'});assert.equal(fixture.status,0,fixture.stderr);
  const sourcePath=path.join(folder,'concave-4d.json');await fs.writeFile(sourcePath,fixture.stdout);
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.POLYTOPE_TEST_MODE;
  const app=await require('playwright')._electron.launch({executablePath:require('electron'),args:[root],cwd:root,env});const page=await app.firstWindow(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const open=async filePath=>{await app.evaluate(({dialog},filePath)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[filePath]});},filePath);await page.locator('#open').click();};
  const save=async filePath=>{await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},filePath);await page.locator('#save').click();await page.waitForFunction(()=>document.getElementById('status')?.textContent.startsWith('Saved'));return JSON.parse(await fs.readFile(filePath,'utf8'));};
  const active=project=>{const doc=project.documents[project.active];return doc.states[doc.cursor];};
  try{
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();await page.locator('#sphere-projection-settings > summary').click();
    await page.locator('#sphere-project-center').fill('0, 0, 0, 0');await page.locator('#sphere-project-radius').fill('sqrt(9)');await page.locator('#sphere-project-apply').click();
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Sphere projection of Tesseract');
    const projected=active(await save(path.join(folder,'sphere.polyproj')));assert.equal(projected.model.vertices.length,16);assert.equal(projected.model.cells.length,8);
    for(const vertex of projected.model.vertices)assert(Math.abs(Math.hypot(...vertex)-3)<1e-9);
    await page.locator('#sphere-project-center').fill('');await page.locator('#sphere-project-radius').fill('');await page.locator('#sphere-project-apply').click();
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Sphere projection of Sphere projection of Tesseract');
    await open(sourcePath);await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Literal concave tetrahedral 4D shell');
    await page.locator('[data-panel="net"]').click();await page.locator('#cell-net-build').click();await page.waitForFunction(()=>document.getElementById('cell-net-summary')?.textContent.startsWith('8 complete cells'));
    assert.equal(await page.locator('#derived-mode').inputValue(),'cell-net');
    await page.locator('#cell-net-face').fill('0');await page.locator('#cell-net-match').click();assert.match(await page.locator('#cell-net-selection').innerText(),/Matching cells: C\d+, C\d+/);
    await page.locator('#derived-canvas').screenshot({path:path.join(folder,'literal-4d-cell-net.png')});
    const netPath=path.join(folder,'literal-4d-net.polyproj'),net=active(await save(netPath));assert.equal(net.cellNetLayout.cells.length,8);assert.equal(net.model.interpretation,'generalized-complex');
    await open(netPath);await page.waitForFunction(()=>document.getElementById('status')?.textContent.startsWith('Opened'));await page.waitForFunction(()=>document.getElementById('cell-net-summary')?.textContent.startsWith('8 complete cells'));
    await page.locator('#library-family').selectOption('Stewart toroids');assert.equal(await page.locator('.catalog-entry').count(),7);
    await page.locator('.catalog-entry[data-key="stewart-k3-4q3-s3"]').click();await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Stewart toroid K3 / 4Q3(S3)');
    const stewart=active(await save(path.join(folder,'genus-three.polyproj'))).model;assert.deepEqual(['vertices','edges','faces'].map(k=>stewart[k].length),[30,72,38]);assert.equal(stewart.metadata.stewart.T.topology.genus,3);
    await page.locator('#base-canvas').screenshot({path:path.join(folder,'stewart-genus-three.png')});assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,sphereExpressions:true,sphereDefaults:true,sourceIncidenceRetained:true,generalizedWholeCellNetGPU:true,matchingFaces:true,nativeNetSaveReopen:true,stewartEntries:7,stewartGenusThree:true,errors},null,2));console.log('Sphere/cell/Stewart quick smoke PASS:',folder);
  }catch(error){await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({message:error.message,errors,text:await page.locator('body').innerText()},null,2));console.error('Failure evidence:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
