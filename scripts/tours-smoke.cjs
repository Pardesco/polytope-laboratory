// Native saved tours and deterministic preview workflow in an isolated profile.
const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const geometry=model=>Object.fromEntries(['dimension','embeddingDimension','vertices','edges','faces','cells'].map(key=>[key,model[key]]));
const active=project=>{const doc=project.documents[project.active];return doc.states[doc.cursor];};
async function main(){
  const artifacts=path.join(root,'artifacts');await fs.mkdir(artifacts,{recursive:true});
  const packaged=process.env.POLYTOPE_TEST_EXECUTABLE,folder=await fs.mkdtemp(path.join(artifacts,packaged?'tours-packaged-smoke-':'tours-smoke-'));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:path.join(folder,'profile')};delete env.ELECTRON_RUN_AS_NODE;if(packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);const checks=[],errors=[];let saveNumber=0;
  page.on('pageerror',error=>errors.push(error.message));
  const panel=async()=>{if(!await page.locator('#tour-settings').evaluate(element=>element.open))await page.locator('#tour-settings > summary').click();};
  const done=async()=>page.waitForFunction(()=>document.getElementById('cancel').hidden&&!document.getElementById('tour-add').disabled);
  const save=async label=>{
    await done();const file=path.join(folder,`${String(++saveNumber).padStart(2,'0')}-${label}.polyproj`);
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
    await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);
    return {file,project:JSON.parse(await fs.readFile(file,'utf8'))};
  };
  const open=async file=>{
    const expected=JSON.parse(await fs.readFile(file,'utf8')).tour;
    await panel();await page.locator('#tour-duration').fill('127');await page.locator('#tour-duration').dispatchEvent('change');await done();
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#open').click();
    await page.waitForFunction(expected=>document.getElementById('tour-event').options.length===expected.events.length&&document.getElementById('tour-event').value===String(expected.cursor)&&document.getElementById('tour-duration').value===String(expected.events[expected.cursor].duration),expected);await done();
  };
  const duration=async value=>{await page.locator('#tour-duration').fill(String(value));await page.locator('#tour-duration').dispatchEvent('change');await done();};
  const seek=async time=>{await panel();await page.locator('#tour-scrub').evaluate((input,time)=>{input.value=String(time);input.dispatchEvent(new Event('input',{bubbles:true}));},time);await done();};
  try{
    await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract'&&document.getElementById('tour-add'));await done();await panel();
    assert.equal(await page.locator('#tour-event option').count(),0);for(const id of ['tour-play','tour-prev','tour-next','tour-replace','tour-delete'])assert.equal(await page.locator('#'+id).isEnabled(),false);
    await page.locator('#tour-add').click();await duration(.3);const four=(await save('tesseract-event')).project;
    assert.equal(four.tour.version,1);assert.equal(four.tour.events.length,1);assert.equal(four.tour.events[0].state.model.dimension,4);assert.equal(four.tour.events[0].transition,'instant');assert.equal(four.tour.events[0].duration,.3);
    checks.push('empty controls and Add persist a full native 4D event snapshot');
    await page.locator('[data-key="cube"]').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');await done();await panel();await page.locator('#tour-add').click();await duration(.4);
    const cube=(await save('cube-event')).project,source=active(cube).model;
    await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();await page.locator('#model-scale').fill('2');await page.locator('#scale').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Transform of Cube');await done();
    const scaled=(await save('source-scaled')).project;assert.deepEqual(scaled.tour,cube.tour);assert.deepEqual(active(scaled).model.vertices,source.vertices.map(point=>point.map(value=>2*value)));
    await panel();await page.locator('#tour-add').click();await duration(.2);const captured=(await save('recorded-operation-event')).project;
    assert.equal(captured.tour.events.length,3);assert.equal(captured.tour.events[2].state.operationNode,active(scaled).operationNode);assert.deepEqual(geometry(captured.tour.events[1].state.model),geometry(source));
    checks.push('source operations preserve earlier events and capture recipe lineage without an attached graph');
    const thirdId=captured.tour.events[2].id;await panel();await page.locator('#tour-up').click();await done();const up=(await save('reordered')).project;assert.equal(up.tour.events[1].id,thirdId);assert.equal(up.tour.cursor,1);
    await panel();await page.locator('#tour-down').click();await page.locator('#tour-delete').click();await done();await page.locator('#tour-replace').click();await done();
    const edited=(await save('deleted-and-replaced')).project;assert.equal(edited.tour.events.length,2);assert.equal(edited.tour.events[1].id,cube.tour.events[1].id);assert.deepEqual(geometry(edited.tour.events[1].state.model),geometry(active(scaled).model));assert.deepEqual(edited.tour.events[0],cube.tour.events[0]);
    checks.push('reorder, delete and Replace retain event identity and untouched independent source snapshots');
    const tourFile=path.join(folder,'saved.polytour');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},tourFile);await panel();await page.locator('#tour-save').click();await done();await page.waitForFunction(()=>document.getElementById('tour-save')&&!document.getElementById('tour-save').disabled);
    let exported;for(let attempt=0;attempt<100;attempt++){try{exported=JSON.parse(await fs.readFile(tourFile,'utf8'));break;}catch{await page.waitForTimeout(50);}}assert.ok(exported);assert.deepEqual(exported,edited.tour);
    const bad=structuredClone(exported);bad.events[0].transition='fade';const badFile=path.join(folder,'unsupported.polytour');await fs.writeFile(badFile,JSON.stringify(bad));await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},badFile);
    await panel();await page.locator('#tour-merge').click();await page.waitForFunction(()=>!document.getElementById('toast').hidden&&(/Only instant|Version 1 tours require literal instant/.test(document.getElementById('toast').textContent)));await done();assert.deepEqual((await save('rejected-merge')).project.tour,edited.tour);
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},tourFile);await panel();await page.locator('#tour-merge').click();await page.waitForFunction(()=>document.getElementById('tour-event').options.length===4);await done();
    const merged=await save('merged');assert.equal(new Set(merged.project.tour.events.map(event=>event.id)).size,4);assert.deepEqual(merged.project.tour.events.slice(0,2),edited.tour.events);assert.deepEqual(merged.project.tour.events[2].state,edited.tour.events[0].state);
    checks.push('native standalone save, rejected unsupported transition and Merge preserve data and unique IDs');
    await open(merged.file);assert.deepEqual((await save('reopened')).project.tour,merged.project.tour);checks.push('native project reopen reconstructs retained tour snapshots and cursor');
    await seek(0);await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract');const first=(await save('first-preview')).project;
    assert.deepEqual(geometry(active(first).model),geometry(edited.tour.events[0].state.model));assert.equal(first.documents.length,merged.project.documents.length+1);
    for(let index=0;index<merged.project.documents.length;index++)assert.deepEqual(first.documents[index].states.map(state=>geometry(state.model)),merged.project.documents[index].states.map(state=>geometry(state.model)));
    await panel();await page.locator('#tour-next').click();await done();const next=(await save('next-preview')).project;assert.equal(next.documents.length,first.documents.length);assert.deepEqual(geometry(active(next).model),geometry(edited.tour.events[1].state.model));assert.equal(active(next).operationNode,undefined);assert.equal(active(next).sourceOperationNode,edited.tour.events[1].state.operationNode);
    await panel();await page.locator('#tour-prev').click();await done();assert.equal(await page.locator('#model-name').textContent(),'Tesseract');
    checks.push('seek, Next and Prev reuse an independent native preview and detach recipe associations');
    await panel();await page.locator('#tour-play').click();await page.waitForFunction(()=>document.getElementById('tour-play').textContent==='Play'&&document.getElementById('tour-event').value==='3');await done();
    const ended=(await save('play-end')).project;assert.equal(ended.tour.cursor,3);assert.deepEqual(geometry(active(ended).model),geometry(edited.tour.events[1].state.model));assert.equal(await page.locator('#tour-position').textContent(),'1.400 / 1.400 s');
    await panel();await page.locator('#tour-loop').check();await page.locator('#tour-play').click();await page.waitForFunction(()=>document.getElementById('tour-event').value==='1'&&document.getElementById('tour-play').textContent==='Pause');await page.waitForFunction(()=>document.getElementById('tour-event').value==='0'&&document.getElementById('tour-play').textContent==='Pause');await page.locator('#tour-play').click();await done();await page.locator('#tour-loop').uncheck();
    assert.equal(await page.locator('#tour-play').textContent(),'Play');checks.push('one-clock playback reaches the exact endpoint and loop returns to the first event before Pause');
    const guarded=(await save('before-shortcuts')).project;await page.locator('[data-panel="info"]').click();await page.locator('#notes').focus();await page.keyboard.press('Control+Alt+t');await page.keyboard.press('Control+Alt+ArrowRight');await page.locator('#help').click();await page.keyboard.press('Control+Alt+t');assert.equal(await page.locator('#help-dialog').isVisible(),true);await page.locator('#close-help').click();
    const ignored=(await save('shortcuts-ignored')).project;assert.deepEqual(ignored.tour,guarded.tour);assert.deepEqual(geometry(active(ignored).model),geometry(active(guarded).model));checks.push('tour shortcuts ignore editable notes and modal dialogs');
    await page.locator('#model-name').click();await page.keyboard.press('Control+Alt+t');await page.waitForFunction(()=>document.getElementById('tour-event').options.length===5);await done();await panel();await page.locator('#tour-delete').click();await done();
    assert.deepEqual((await save('shortcut-add-deleted')).project.tour.events,ignored.tour.events);checks.push('Add keyboard shortcut captures an event and Delete restores the prior event sequence');
    if(!await page.locator('#animation-settings').evaluate(element=>element.open))await page.locator('#animation-settings > summary').click();
    for(const [id,value] of [['#animation-duration','20'],['#animation-fps','30']]){await page.locator(id).fill(value);await page.locator(id).dispatchEvent('change');}
    await page.locator('#animation-target').selectOption('base');const cancelled=path.join(folder,'tour-guard.frames');
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},cancelled);await page.locator('#animation-png').click();await page.waitForFunction(()=>document.getElementById('animation-progress').textContent.startsWith('Frame '));
    for(const id of ['tour-add','tour-replace','tour-delete','tour-play','tour-event','tour-scrub','tour-merge','tour-save'])assert.equal(await page.locator('#'+id).isEnabled(),false);
    await page.locator('#model-name').click();await page.keyboard.press('Control+Alt+t');await page.keyboard.press('Control+Alt+ArrowRight');
    if(!await page.locator('#animation-settings').evaluate(element=>element.open))await page.locator('#animation-settings > summary').click();await page.locator('#animation-cancel').click();await page.waitForFunction(()=>document.getElementById('animation-progress').textContent==='Animation export cancelled.');await done();
    await assert.rejects(()=>fs.access(cancelled));assert.deepEqual((await save('export-guard')).project.tour.events,ignored.tour.events);checks.push('animation export disables tours, ignores shortcuts and cancels without publishing frame output');
    await page.locator('#toggle-inspector').click();await panel();await page.screenshot({path:path.join(folder,'tours-workspace.png')});assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,packaged:Boolean(packaged),version:await app.evaluate(({app})=>app.getVersion()),checks,pageErrors:errors},null,2));console.log(`Tours ${packaged?'packaged ':''}smoke passed: ${checks.length} checks. Artifacts: ${folder}`);
  }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors},null,2));console.error('Artifacts:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
