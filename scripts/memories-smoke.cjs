// Run after the Memories UI and native project integration have been built.
// Dialog substitutions and profiles are confined to this test process.
const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const geometry=model=>Object.fromEntries(['dimension','embeddingDimension','vertices','edges','faces','cells'].map(key=>[key,model[key]]));
const active=project=>{const document=project.documents[project.active];return document.states[document.cursor];};
async function main(){
  const artifacts=path.join(root,'artifacts');await fs.mkdir(artifacts,{recursive:true});
  const packaged=process.env.POLYTOPE_TEST_EXECUTABLE,folder=await fs.mkdtemp(path.join(artifacts,packaged?'memories-packaged-smoke-':'memories-smoke-'));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:path.join(folder,'profile')};delete env.ELECTRON_RUN_AS_NODE;if(packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);const checks=[],errors=[];let saveNumber=0;
  page.on('pageerror',error=>errors.push(error.message));
  const openPanel=async()=>{if(!await page.locator('#memories-settings').evaluate(element=>element.open))await page.locator('#memories-settings > summary').click();};
  const choose=async slot=>{await openPanel();await page.locator('#memory-slot').selectOption(String(slot));};
  const done=async()=>page.waitForFunction(()=>!document.getElementById('memory-slot').disabled&&document.getElementById('cancel').hidden);
  const save=async label=>{
    await page.waitForFunction(()=>document.getElementById('cancel').hidden);
    const file=path.join(folder,`${String(++saveNumber).padStart(2,'0')}-${label}.polyproj`);
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
    await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent.startsWith('Saved '+file),file);
    return {file,project:JSON.parse(await fs.readFile(file,'utf8'))};
  };
  const shortcut=async keys=>{await page.locator('#model-name').click();await page.keyboard.press(keys);await done();};
  try{
    await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract'&&document.getElementById('memory-store'));await done();
    assert.equal(await page.locator('#memory-slot option').count(),9);await choose(1);assert.equal(await page.locator('#memory-open').isEnabled(),false);assert.equal(await page.locator('#memory-swap').isEnabled(),false);
    await page.locator('#memory-store').click();await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Stored '));
    const tesseract=(await save('tesseract-memory')).project;assert.equal(tesseract.memories.version,1);assert.equal(tesseract.memories.slots.length,9);assert.equal(tesseract.memories.slots[0].state.model.dimension,4);
    checks.push('nine slots store a native 4D geometry snapshot with view and provenance');
    await page.locator('[data-key="cube"]').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');await done();
    await shortcut('Control+Alt+2');await page.waitForFunction(()=>document.getElementById('status').textContent.includes('memory 2'));
    const cube=(await save('cube-memory')).project;assert.equal(cube.memories.slots[1].state.model.name,'Cube');assert.deepEqual(geometry(cube.memories.slots[0].state.model),geometry(tesseract.memories.slots[0].state.model));
    checks.push('store keyboard shortcut keeps prior memory independent across documents');
    await shortcut('Alt+1');await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract');
    const opened=(await save('opened-tesseract')).project;assert.deepEqual(geometry(active(opened).model),geometry(tesseract.memories.slots[0].state.model));
    assert.ok(opened.documents.length>cube.documents.length);checks.push('open keyboard shortcut recalls validated geometry in an independent document');
    await shortcut('Alt+2');await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');
    await shortcut('Alt+Shift+1');await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract');
    const swapped=(await save('swapped')).project;assert.deepEqual(geometry(swapped.memories.slots[0].state.model),geometry(cube.memories.slots[1].state.model));
    await shortcut('Alt+Shift+1');await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');
    const swappedBack=(await save('swapped-back')).project;assert.deepEqual(geometry(swappedBack.memories.slots[0].state.model),geometry(tesseract.memories.slots[0].state.model));assert.deepEqual(geometry(active(swappedBack).model),geometry(cube.memories.slots[1].state.model));
    checks.push('two swaps restore both current and stored source geometries');
    await shortcut('Alt+1');await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract');
    await page.locator('#viewport-layout').selectOption('split');await page.locator('#derived-mode').selectOption('section');
    await page.locator('#section-normal').fill('0, 0, 0, 1');await page.locator('#section-depth').fill('0');await page.locator('#apply-section').click();
    await page.waitForFunction(()=>document.getElementById('derived-status').textContent.includes('vertices')&&document.getElementById('cancel').hidden);
    await choose(3);await page.locator('#memory-source').selectOption('derived');await page.waitForFunction(()=>!document.getElementById('memory-store').disabled);await page.locator('#memory-store').click();await done();
    const section=(await save('section-memory')).project,storedSection=section.memories.slots[2].state.model;
    assert.equal(storedSection.dimension,3);assert.equal(storedSection.vertices.length,8);assert.equal(storedSection.edges.length,12);assert.equal(storedSection.faces.length,6);assert.ok(storedSection.vertices.every(point=>point.length===3));
    await choose(3);await page.locator('#memory-open').click();await done();const sectionOpened=(await save('section-opened')).project;assert.deepEqual(geometry(active(sectionOpened).model),geometry(storedSection));
    checks.push('derived central tesseract section stores intrinsic 3D geometry and opens directly');
    await choose(2);await page.locator('#memory-clear').click();await done();assert.equal(await page.locator('#memory-open').isEnabled(),false);
    const cleared=await save('cleared');assert.equal(cleared.project.memories.slots[1],null);assert.deepEqual(geometry(cleared.project.memories.slots[0].state.model),geometry(tesseract.memories.slots[0].state.model));
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},cleared.file);await page.locator('#open').click();
    // Open has its own native file await; an idle engine queue does not mean
    // its new workspace has been adopted. Save only after that publication.
    await page.waitForFunction(file=>document.getElementById('status').textContent==='Opened '+file,cleared.file);await done();
    const reloaded=(await save('reloaded')).project;assert.deepEqual(reloaded.memories,cleared.project.memories);checks.push('clear and native project reopen preserve all remaining memory states');
    await page.locator('#toggle-inspector').click();await page.locator('[data-panel="info"]').click();await page.locator('#notes').focus();await page.keyboard.press('Control+Alt+9');
    const editable=(await save('editable-shortcut-ignored')).project;assert.equal(editable.memories.slots[8],null);
    await page.locator('#help').click();await page.keyboard.press('Alt+1');assert.equal(await page.locator('#help-dialog').isVisible(),true);await page.locator('#close-help').click();
    const dialog=(await save('dialog-shortcut-ignored')).project;assert.deepEqual(geometry(active(dialog).model),geometry(active(editable).model));checks.push('memory shortcuts ignore editable inputs and open dialogs');
    await page.locator('[data-key="cube"]').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');await done();
    await choose(4);await page.locator('#memory-source').selectOption('base');await page.locator('#memory-store').click();await done();
    const addSource=(await save('add-source')).project,storedCube=addSource.memories.slots[3].state.model;
    await page.locator('[data-panel="construct"]').click();await page.locator('#model-scale').fill('2');await page.locator('#scale').click();await done();
    const scaled=(await save('scaled-add-source')).project;assert.deepEqual(active(scaled).model.vertices,storedCube.vertices.map(point=>point.map(coordinate=>2*coordinate)));
    await choose(4);await page.locator('#memory-add').click();await done();const added=(await save('added-memory')).project,compound=active(added).model;
    assert.equal(compound.dimension,3);assert.equal(compound.vertices.length,16);assert.equal(compound.edges.length,24);assert.equal(compound.faces.length,12);
    const coordinates=points=>points.map(point=>JSON.stringify(point)).sort();assert.deepEqual(coordinates(compound.vertices),coordinates([...storedCube.vertices,...storedCube.vertices.map(point=>point.map(coordinate=>2*coordinate))]));
    assert.deepEqual(added.memories,scaled.memories);assert.ok(added.documents.length>scaled.documents.length);
    for(let index=0;index<scaled.documents.length;index++)assert.deepEqual(added.documents[index].states.map(state=>geometry(state.model)),scaled.documents[index].states.map(state=>geometry(state.model)));
    checks.push('Add preserves stored/current source sizes and creates an independent 16-vertex compound without mutating memories');
    if(!await page.locator('#animation-settings').evaluate(element=>element.open))await page.locator('#animation-settings > summary').click();
    for(const [id,value] of [['#animation-duration','20'],['#animation-fps','30']]){await page.locator(id).fill(value);await page.locator(id).dispatchEvent('change');}
    await page.locator('#animation-target').selectOption('base');const cancelled=path.join(folder,'memory-guard.frames');
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},cancelled);await page.locator('#animation-png').click();
    await page.waitForFunction(()=>document.getElementById('animation-progress').textContent.startsWith('Frame '));
    for(const id of ['memory-slot','memory-source','memory-store','memory-open','memory-swap','memory-clear','memory-add'])assert.equal(await page.locator('#'+id).isEnabled(),false,`${id} must be disabled during export`);
    await page.locator('#model-name').click();for(const keys of ['Control+Alt+9','Alt+1','Alt+Shift+1'])await page.keyboard.press(keys);
    assert.equal(await page.locator('#model-name').textContent(),active(added).model.name);
    if(!await page.locator('#animation-settings').evaluate(element=>element.open))await page.locator('#animation-settings > summary').click();await page.locator('#animation-cancel').click();
    await page.waitForFunction(()=>document.getElementById('animation-progress').textContent==='Animation export cancelled.');await done();
    await assert.rejects(()=>fs.access(cancelled));assert.equal((await fs.readdir(folder)).filter(file=>file.startsWith('.polytope-animation-')).length,0);
    const exported=(await save('export-shortcuts-ignored')).project;assert.deepEqual(exported.memories,added.memories);checks.push('animation export disables every memory control and suppresses all memory shortcuts');
    await page.locator('#toggle-inspector').click();await openPanel();await page.screenshot({path:path.join(folder,'memories-workspace.png')});assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,packaged:Boolean(packaged),version:await app.evaluate(({app})=>app.getVersion()),checks,pageErrors:errors},null,2));
    console.log(`Memories ${packaged?'packaged ':''}smoke passed: ${checks.length} checks. Artifacts: ${folder}`);
  }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors},null,2));console.error('Artifacts:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
