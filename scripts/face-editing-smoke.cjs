// Real UI operations, native project snapshots, and independent literal fixtures.
// Run only after the matching application build is ready.
const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));
const packaged=process.env.POLYTOPE_TEST_EXECUTABLE;
const geometry=model=>Object.fromEntries(['dimension','embeddingDimension','vertices','edges','faces','cells'].map(key=>[key,model[key]]));
const document=project=>project.documents[project.active];
const active=project=>{const current=document(project);return current.states[current.cursor];};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const clone=value=>structuredClone(value);

function fixture(name,vertices,faces,colors){
  const edges=new Map();for(const face of faces)for(let i=0;i<face.length;i++){const edge=[face[i],face[(i+1)%face.length]].sort((a,b)=>a-b);edges.set(edge.join(','),edge);}
  return {id:'fixture-'+name,name,dimension:3,embeddingDimension:3,interpretation:'generalized-complex',
    vertices,edges:[...edges.values()],faces,cells:[],metadata:{fixture:'independently authored source geometry',...colors?{offColors:{faces:colors,cells:[]}}:{}},
    numeric:{mode:'float64-approximate',certified:false,tolerance:1e-8},provenance:{operation:'independent-ui-fixture'}};
}
function fixtures(){
  const rgba={encoding:'byte',values:[40,160,90,128]};
  const colored=fixture('Colored cube',[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
    [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],Array.from({length:6},()=>clone(rgba)));
  const adjacent=fixture('Adjacent quads',[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[1,0,0],[2,0,0],[2,1,0],[1,1,0]],
    [[0,1,2,3],[4,5,6,7]],[clone(rgba),clone(rgba)]);
  const mixed=clone(adjacent);mixed.name='Different face colors';mixed.id='fixture-mixed';mixed.metadata.offColors.faces[1]={encoding:'unit',values:[.2,.6,.4,.25]};
  const points=[];for(const radius of [2,1])for(let i=0;i<6;i++)points.push([radius*Math.cos(i*Math.PI/3),radius*Math.sin(i*Math.PI/3),0]);
  const hole=fixture('Six-quad hole',points,Array.from({length:6},(_,i)=>[i,(i+1)%6,(i+1)%6+6,i+6]));
  return {colored,adjacent,mixed,hole};
}
function xyArea(model){const polygon=model.faces[0].map(v=>model.vertices[v]);return Math.abs(polygon.reduce((sum,a,i)=>{const b=polygon[(i+1)%polygon.length];return sum+a[0]*b[1]-a[1]*b[0];},0)/2);}

async function main(){
  const started=performance.now();await fs.mkdir(artifacts,{recursive:true});
  const folder=await fs.mkdtemp(path.join(artifacts,packaged?'face-editing-packaged-smoke-':'face-editing-smoke-'));
  const profile=path.join(folder,'profile');await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const authored=fixtures(),files={},originalHashes={};
  for(const [key,model] of Object.entries(authored)){const file=path.join(folder,key+'.json');await fs.writeFile(file,JSON.stringify(model));files[key]=file;originalHashes[key]=hash(await fs.readFile(file));}
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  if(packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);
  const errors=[],checks=[];let saveNumber=0;
  page.on('pageerror',error=>errors.push(error.message));
  const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
  const disclosure=async id=>{if(!await page.locator('#'+id).evaluate(element=>element.open))await page.locator('#'+id+' > summary').click();};
  const construct=async()=>{if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();};
  const facePanel=async()=>{await construct();await disclosure('face-editing-settings');};
  const save=async label=>{
    await done();const file=path.join(folder,`${String(++saveNumber).padStart(2,'0')}-${label}.polyproj`);
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
    await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);
    return {file,project:JSON.parse(await fs.readFile(file,'utf8'))};
  };
  const open=async(file,name)=>{
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
    await page.locator('#open').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Opened '+file,file);await done();
    if(name)assert.equal(await page.locator('#model-name').textContent(),name);
  };
  const catalogCube=async()=>{await page.locator('#search').fill('Cube');await page.locator('[data-key="cube"]').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');await done();};
  const memory=async(slot,action)=>{
    await disclosure('memories-settings');await page.locator('#memory-slot').selectOption(String(slot));await page.locator('#memory-source').selectOption('base');
    await page.locator('#memory-'+action).click();await page.waitForFunction(()=>!document.getElementById('memory-slot').disabled&&document.getElementById('cancel').hidden);
    if(action==='add')await page.waitForFunction(()=>document.getElementById('model-name').textContent.includes(' + '));
  };
  const edit=async(id,suffix)=>{await page.locator('#'+id).click();await page.waitForFunction(suffix=>document.getElementById('model-name').textContent.endsWith(suffix),suffix);await done();};
  const replay=async()=>{await disclosure('history-settings');const count=await page.locator('#document-tabs > button').count();await page.locator('#history-replay').click();await page.waitForFunction(count=>document.getElementById('document-tabs').children.length===count+1,count);await done();};
  const rejected=async(id,diagnostic)=>{await page.locator('#'+id).click();await page.waitForFunction(message=>!document.getElementById('toast').hidden&&document.getElementById('toast').textContent.includes(message)&&document.getElementById('cancel').hidden,diagnostic);};
  try{
    await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract'&&document.getElementById('face-editing-settings'));
    await catalogCube();await facePanel();assert.equal(await page.locator('#coincidence-tolerance').inputValue(),'0');assert.equal(await page.locator('#face-weld').isChecked(),false);
    await memory(1,'store');const stored=(await save('stored-cube')).project,storedCube=stored.memories.slots[0].state.model;
    await memory(1,'add');const doubled=(await save('double-cube')).project,doubleModel=active(doubled).model;
    assert.deepEqual([doubleModel.vertices.length,doubleModel.edges.length,doubleModel.faces.length],[16,24,12]);
    assert.deepEqual(doubled.memories,stored.memories);assert.equal(doubleModel.components.length,2);
    await facePanel();await page.locator('#coincidence-analyze').click();await page.waitForFunction(()=>{try{return JSON.parse(document.getElementById('face-edit-evidence').textContent).pairs.length===6;}catch{return false;}});await done();
    const inspected=(await save('inspection-unchanged')).project;assert.deepEqual(geometry(active(inspected).model),geometry(doubleModel));
    await edit('coincidence-remove','remove-coincident-pairs');const removed=(await save('double-cube-pairs-removed')).project,removedModel=active(removed).model;
    assert.equal(removedModel.faces.length,0);assert.deepEqual(removedModel.vertices,doubleModel.vertices);assert.deepEqual(removedModel.edges,doubleModel.edges);
    assert.equal(removedModel.metadata.faceEditing.evidence.removedPairs.length,6);assert.deepEqual(removed.memories,stored.memories);
    assert.equal(document(removed).operationHistory.nodes.find(node=>node.id===active(removed).operationNode).op,'remove-coincident-pairs');
    await page.locator('#undo').click();await done();assert.deepEqual(geometry(active((await save('pair-removal-undone')).project).model),geometry(doubleModel));
    await page.locator('#redo').click();await done();await replay();assert.deepEqual(geometry(active((await save('pair-removal-replayed')).project).model),geometry(removedModel));
    await page.screenshot({path:path.join(folder,'coincident-pairs-wire-result.png')});
    checks.push('native Memories double cube, six read-only pair inspections, explicit12-face removal, unchanged wires/sources, undo/redo and verified replay');

    await open(files.colored,authored.colored.name);await memory(1,'store');await memory(1,'add');await memory(1,'add');
    const triple=(await save('colored-triple-source')).project,tripleModel=active(triple).model;
    assert.deepEqual([tripleModel.vertices.length,tripleModel.edges.length,tripleModel.faces.length],[24,36,18]);
    await facePanel();await edit('coincidence-remove','remove-coincident-pairs');const odd=(await save('colored-triple-pairs')).project,oddModel=active(odd).model;
    assert.equal(oddModel.faces.length,6);assert.deepEqual(oddModel.metadata.offColors.faces,authored.colored.metadata.offColors.faces);
    assert.deepEqual(oddModel.metadata.faceEditing.evidence.unpairedFaceIds,[12,13,14,15,16,17]);
    assert.deepEqual(odd.memories,triple.memories);assert.deepEqual(oddModel.vertices,tripleModel.vertices);
    checks.push('triple coincidence groups leave one literal cube face set and preserve source RGBA/memory snapshots');

    await catalogCube();await memory(2,'store');const componentStored=(await save('component-stored')).project,originalCube=componentStored.memories.slots[1].state.model;
    await construct();await page.locator('#model-scale').fill('2');await page.locator('#scale').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Transform of Cube');await done();
    await memory(2,'add');const componentSource=(await save('scaled-cube-compound')).project,compound=active(componentSource).model;
    const selected=compound.components[1].id,remaining=compound.components[0].id;
    assert.deepEqual(compound.vertices.slice(0,8),originalCube.vertices.map(point=>point.map(x=>x*2)));
    await construct();await page.locator('#compound-component').selectOption(selected);await page.locator('#compound-extract').click();await done();
    const kept=(await save('kept-component')).project;assert.deepEqual(geometry(active(kept).model),geometry(originalCube));
    await page.locator('#undo').click();await done();await page.locator('#compound-component').selectOption(selected);await page.locator('#compound-drop').click();await done();
    const dropped=await save('deleted-component'),dropModel=active(dropped.project).model;
    assert.equal(dropModel.components.length,1);assert.equal(dropModel.components[0].id,remaining);assert.equal(await page.locator('#compound-drop').isEnabled(),false);
    assert.deepEqual(dropModel.vertices,originalCube.vertices.map(point=>point.map(x=>x*2)));
    assert.deepEqual([dropModel.edges.length,dropModel.faces.length],[12,6]);
    assert.deepEqual(dropModel.metadata.compoundComponentEditing.sourceMaps.vertices,[0,1,2,3,4,5,6,7,...Array(8).fill(null)]);
    assert.deepEqual(dropped.project.memories,componentSource.memories);
    await replay();const replayDrop=active((await save('deleted-component-replayed')).project).model;assert.deepEqual(geometry(replayDrop),geometry(dropModel));assert.equal(replayDrop.components[0].id,remaining);
    await open(dropped.file);const restored=active((await save('deleted-component-restored')).project).model;
    assert.deepEqual(geometry(restored),geometry(dropModel));assert.deepEqual(restored.components,dropModel.components);
    await page.screenshot({path:path.join(folder,'scaled-component-deletion.png')});
    checks.push('stored/current relative scale, explicit Keep/Delete leaf, remaining UUID/maps, last-leaf UI guard, native persistence and replay');

    await open(files.adjacent,authored.adjacent.name);await facePanel();await page.locator('#blend-face-ids').fill('0, 1');await page.locator('#face-weld').uncheck();await page.locator('#face-color-policy').selectOption('require-equal');
    const adjacent=(await save('adjacent-source')).project;
    await rejected('blend-faces','welding');const failedWeld=(await save('adjacent-without-weld-rejected')).project;assert.deepEqual(geometry(active(failedWeld).model),geometry(active(adjacent).model));
    await page.locator('#face-weld').check();await edit('blend-faces','blend-coplanar-faces');const blended=await save('adjacent-blended'),rectangle=active(blended.project).model;
    assert.deepEqual([rectangle.vertices.length,rectangle.edges.length,rectangle.faces.length],[6,6,1]);assert.equal(rectangle.faces[0].length,6);assert.equal(xyArea(rectangle),2);
    assert.deepEqual(rectangle.metadata.faceEditing.sourceMaps.vertices,[0,1,2,3,1,4,5,2]);assert.deepEqual(rectangle.metadata.faceEditing.sourceMaps.faces,[[0],[0]]);
    assert.deepEqual(rectangle.metadata.offColors.faces,[authored.adjacent.metadata.offColors.faces[0]]);
    assert.equal(rectangle.metadata.faceEditing.evidence.coordinateWeld,true);assert.equal(rectangle.metadata.faceEditing.evidence.disconnectedRegions,1);
    await replay();assert.deepEqual(geometry(active((await save('blend-replayed')).project).model),geometry(rectangle));
    await open(blended.file);assert.deepEqual(geometry(active((await save('blend-restored')).project).model),geometry(rectangle));
    await page.screenshot({path:path.join(folder,'six-corner-blended-rectangle.png')});
    checks.push('native eight-vertex adjacent JSON source, explicit weld, six-corner ordered rectangle area2, source maps/RGBA and verified persistence/replay');

    await open(files.mixed,authored.mixed.name);await facePanel();await page.locator('#face-weld').check();await page.locator('#blend-face-ids').fill('0, 1');await page.locator('#face-color-policy').selectOption('require-equal');
    const mixed=active((await save('mixed-color-source')).project).model;await rejected('blend-faces','different source colors');assert.deepEqual(geometry(active((await save('mixed-color-rejected')).project).model),geometry(mixed));
    await page.locator('#face-color-policy').selectOption('first-source');await edit('blend-faces','blend-coplanar-faces');assert.deepEqual(active((await save('mixed-color-explicit-policy')).project).model.metadata.offColors.faces,[authored.mixed.metadata.offColors.faces[0]]);
    await open(files.hole,authored.hole.name);await facePanel();await page.locator('#face-weld').uncheck();await page.locator('#blend-face-ids').fill('0, 1, 2, 3, 4, 5');
    const hole=active((await save('hole-source')).project).model;await rejected('blend-faces','hole');const rejectedHole=active((await save('hole-rejected')).project).model;
    assert.deepEqual(geometry(rejectedHole),geometry(hole));assert.equal(rejectedHole.faces.length,6);
    assert.match(await page.locator('#toast').innerText(),/No filled-hole result returned/);
    await page.screenshot({path:path.join(folder,'hole-diagnostic-unchanged-source.png')});
    checks.push('mixed source color refusal/explicit first-source RGBA and six-face hole diagnostic leave original geometry intact');

    for(const [key,file] of Object.entries(files))assert.equal(hash(await fs.readFile(file)),originalHashes[key]);
    assert.deepEqual(errors,[]);
    const result={passed:true,packaged:Boolean(packaged),developmentPythonUnavailable:Boolean(packaged),version:await app.evaluate(({app})=>app.getVersion()),
      seconds:(performance.now()-started)/1000,checks,pageErrors:errors,fixtureDirectory:folder,originalFixtureHashes:originalHashes,
      semanticCounts:{doubleCube:[16,24,12],removedDoubleCube:[16,24,0],oddTripleFaces:6,blendedRectangle:[6,6,1],blendedArea:2,rejectedHoleFaces:6}};
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));
    console.log(`Face editing ${packaged?'packaged ':''}smoke passed: ${checks.length} checks. Artifacts: ${folder}`);
  }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors},null,2));console.error('Artifacts:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
