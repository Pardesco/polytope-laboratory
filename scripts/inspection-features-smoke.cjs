const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const active=project=>{const doc=project.documents[project.active];return doc.states[doc.cursor];};
const geometry=model=>Object.fromEntries(['dimension','embeddingDimension','vertices','edges','faces','cells'].map(key=>[key,model[key]]));
const text=pairs=>pairs.map(([code,value])=>`${code}\n${value}\n`).join('');
function face(points){const p=[...points];if(p.length===3)p.push(p[2]);return [[0,'3DFACE'],[8,'analytic'],[420,0xff0044],...p.flatMap((point,i)=>point.map((value,j)=>[10+i+j*10,value]))];}
function drawing(entities){return text([[0,'SECTION'],[2,'HEADER'],[9,'$INSUNITS'],[70,4],[0,'ENDSEC'],[0,'SECTION'],[2,'ENTITIES'],...entities,[0,'ENDSEC'],[0,'EOF']]);}
async function main(){
  const artifacts=path.join(root,'artifacts'),packaged=process.env.POLYTOPE_TEST_EXECUTABLE;
  const folder=await fs.mkdtemp(path.join(artifacts,packaged?'inspection-packaged-smoke-':'inspection-smoke-'));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:path.join(folder,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  if(packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-python.exe');
  const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);const errors=[],checks=[];let number=0;
  page.on('pageerror',error=>errors.push(error.message));
  const ready=async()=>page.waitForFunction(()=>document.querySelector('#cancel').hidden);
  async function read(file){for(let i=0;i<100;i++){try{return await fs.readFile(file);}catch(error){if(error.code!=='ENOENT')throw error;await page.waitForTimeout(50);}}throw new Error('Native output was not written: '+file);}
  async function save(label){const file=path.join(folder,`${++number}-${label}.polyproj`);await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.locator('#save').click();const project=JSON.parse((await read(file)).toString());await ready();return {project,file};}
  async function open(file){await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#open').click();}
  try{
    await page.waitForFunction(()=>document.querySelector('#model-name').textContent==='Tesseract');await ready();
    const original=active((await save('original')).project);await page.locator('#toggle-inspector').click();await page.locator('[data-panel="info"]').click();
    await page.locator('#selection-kind').selectOption('cell');await page.locator('#selection-id').fill('0');await page.locator('#select-entity').click();
    await page.locator('#rotation-settings > summary').click();await page.locator('#projection').selectOption('perspective');await page.keyboard.press('Escape');
    await page.locator('#entity-first').click();await ready();const first=active((await save('first')).project);
    assert.deepEqual(geometry(first.model),geometry(original.model));assert.deepEqual(first.view.angles,Array(6).fill(0));
    assert.equal(first.view.orientationFrame.sourceFingerprint,first.model.fingerprint);assert.equal(first.view.orientationFrame.mode,'first');
    const apply=(frame,point)=>frame.matrix.map(row=>row.reduce((sum,x,i)=>sum+x*(point[i]-frame.center[i]),0));
    const checkFacing=(state,sign)=>{const frame=state.view.orientationFrame,ids=frame.sourceVertexIds,points=ids.map(id=>apply(frame,state.model.vertices[id]));assert.ok(points.every(point=>sign*point[3]>.99));assert.ok(Math.max(...points.map(p=>p[3]))-Math.min(...points.map(p=>p[3]))<1e-8);};
    checkFacing(first,1);await page.screenshot({path:path.join(folder,'cell-first.png')});
    const firstPng=path.join(folder,'first.png');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},firstPng);await page.locator('#image').count().then(async count=>{if(count)await page.locator('#image').click();else await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','image'));});const firstBytes=await read(firstPng);
    await page.locator('#entity-last').click();await ready();const last=active((await save('last')).project);checkFacing(last,-1);assert.deepEqual(geometry(last.model),geometry(original.model));
    const lastPng=path.join(folder,'last.png');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},lastPng);await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu-action','image'));const lastBytes=await read(lastPng);
    assert.notEqual(createHash('sha256').update(firstBytes).digest('hex'),createHash('sha256').update(lastBytes).digest('hex'));checks.push('First/Last source-cell directions change rendered perspective and preserve all source geometry');
    const lastFile=(await save('saved-last')).file;await page.locator('#entity-orientation-clear').click();assert.equal(await page.locator('#entity-orientation-result').textContent(),'');await open(lastFile);await page.waitForFunction(()=>document.querySelector('#entity-orientation-result').textContent.includes('last'));await ready();const restored=active((await save('restored')).project);assert.deepEqual(restored.view.orientationFrame,last.view.orientationFrame);checks.push('proper source-bound frame survives native save/reopen and can be cleared');
    await page.locator('#selection-kind').selectOption('vertex');await page.locator('#selection-id').fill('0');await page.locator('#entity-first').click();await ready();const vertex=active((await save('vertex')).project);const positioned=apply(vertex.view.orientationFrame,vertex.model.vertices[0]);assert.ok(positioned.slice(0,3).every(x=>Math.abs(x)<1e-8));assert.ok(positioned[3]>0);checks.push('vertex-first intrinsic frame aligns the actual selected source vertex');
    await page.locator('[data-panel="construct"]').click();await page.locator('#expression').fill('cosd(60) + diag(5/2)');await page.locator('#evaluate').click();await page.waitForFunction(()=>document.querySelector('#expression-result').textContent.includes('1.118034'));checks.push('documented degree-trig and polygon-symbol helpers are exposed through the desktop');
    const tetra=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],cycles=[[0,2,1],[0,1,3],[0,3,2],[1,2,3]];
    const tetraFile=path.join(folder,'exact-tetra.dxf'),source=drawing(cycles.flatMap(cycle=>face(cycle.map(i=>tetra[i]))));await fs.writeFile(tetraFile,source);await open(tetraFile);await page.waitForFunction(()=>document.querySelector('#model-name').textContent==='exact-tetra');await ready();const imported=active((await save('tetra')).project);
    assert.deepEqual(['vertices','edges','faces','cells'].map(key=>imported.model[key].length),[4,6,4,0]);assert.equal(imported.model.interpretation,'generalized-complex');assert.equal(imported.model.metadata.dxf.insunits,4);assert.equal(imported.model.metadata.dxf.unitName,'millimeters');assert.equal(imported.model.provenance.sourceFileSha256,createHash('sha256').update(source).digest('hex'));assert.equal(await page.locator('#entity-orientation-controls').isVisible(),false);checks.push('native DXF import retains exact tetrahedral incidence, CAD units/styles and raw-byte provenance');
    const pointFile=path.join(folder,'line-and-point.dxf');await fs.writeFile(pointFile,drawing([[0,'LINE'],[10,0],[20,0],[30,0],[11,2],[21,0],[31,0],[0,'POINT'],[10,0],[20,1],[30,0]]));await open(pointFile);await page.waitForFunction(()=>document.querySelector('#model-name').textContent==='line-and-point');await ready();const lines=active((await save('line-point')).project);assert.equal(lines.model.vertices.length,3);assert.equal(lines.model.edges.length,1);assert.equal(lines.view.vertices,true);assert.equal(lines.view.faces,false);checks.push('line/point DXF keeps lower-rank source geometry and displays isolated points');
    const badFile=path.join(folder,'unsupported.dxf');await fs.writeFile(badFile,drawing([[0,'CIRCLE'],[10,0],[20,0],[40,1]]));await open(badFile);await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('CIRCLE'));assert.equal(await page.locator('#model-name').textContent(),'line-and-point');checks.push('unsupported CAD geometry is rejected without replacing the current document');
    assert.deepEqual(errors,[]);await page.screenshot({path:path.join(folder,'inspection-workspace.png')});
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,packaged:Boolean(packaged),version:await app.evaluate(({app})=>app.getVersion()),checks,pageErrors:errors},null,2));console.log(`Inspection feature smoke passed: ${checks.length} checks. Artifacts: ${folder}`);
  }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors},null,2));console.error('Artifacts:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
