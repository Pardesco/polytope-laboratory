// Native recipe and attributed catalog workflows in a disposable desktop profile.
const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const geometry=model=>Object.fromEntries(['dimension','embeddingDimension','vertices','edges','faces','cells'].map(key=>[key,model[key]]));
const currentDoc=project=>project.documents[project.active];
const active=project=>{const doc=currentDoc(project);return doc.states[doc.cursor];};
async function main(){
  const artifacts=path.join(root,'artifacts');await fs.mkdir(artifacts,{recursive:true});
  const packaged=process.env.POLYTOPE_TEST_EXECUTABLE,folder=await fs.mkdtemp(path.join(artifacts,packaged?'recipes-packaged-smoke-':'recipes-smoke-'));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:path.join(folder,'profile')};delete env.ELECTRON_RUN_AS_NODE;if(packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);const checks=[],errors=[];let saveNumber=0;
  page.on('pageerror',error=>errors.push(error.message));
  const done=async()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
  const history=async()=>{if(!await page.locator('#history-settings').evaluate(element=>element.open))await page.locator('#history-settings > summary').click();};
  const save=async label=>{
    await done();const file=path.join(folder,`${String(++saveNumber).padStart(2,'0')}-${label}.polyproj`);
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
    await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);
    return {file,project:JSON.parse(await fs.readFile(file,'utf8'))};
  };
  const reopen=async file=>{await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#open').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Opened '+file,file);await done();};
  const scale=async value=>{await page.locator('#model-scale').fill(String(value));await page.locator('#scale').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Transform of Cube');await done();};
  const catalog=async(key,search,name)=>{await page.locator('[data-filter="all"]').click();await page.locator('#library-family').selectOption('all');await page.locator('#library-audit-filter').selectOption('all');await page.locator('#search').fill(search);await page.locator(`[data-key="${key}"]`).click();await page.waitForFunction(name=>document.getElementById('model-name').textContent===name,name);await done();};
  try{
    await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract'&&document.getElementById('history-replay'));await done();
    await history();assert.equal(await page.locator('#history-replay').isEnabled(),false);assert.equal(await page.locator('#history-branch').isEnabled(),false);
    await catalog('cube','Cube','Cube');const original=(await save('legacy-cube')).project,source=active(original).model;
    assert.equal(currentDoc(original).operationHistory,undefined);checks.push('legacy catalog snapshots remain readable and do not advertise recorded replay');
    await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();await scale(2);
    const scaled=(await save('scale-two')).project,scaledDoc=currentDoc(scaled),scaledNode=active(scaled).operationNode;
    assert.deepEqual(active(scaled).model.vertices,source.vertices.map(point=>point.map(value=>2*value)));
    assert.deepEqual(active(scaled).model.edges,source.edges);assert.deepEqual(active(scaled).model.faces,source.faces);
    assert.equal(scaledDoc.operationHistory.version,1);assert.equal(scaledDoc.operationHistory.nodes.length,2);
    const record=scaledDoc.operationHistory.nodes.find(node=>node.id===scaledNode);assert.equal(record.op,'transform');assert.deepEqual(record.params,{scale:2});assert.equal(record.inputs[0],scaledDoc.states[0].operationNode);
    checks.push('native scale seeds a source graph and associates full source incidence with the operation result');
    await history();await page.locator('#history-replay').click();await page.waitForFunction(count=>document.getElementById('document-tabs').children.length===count,scaled.documents.length+1);await done();
    const replayed=(await save('replayed-scale')).project;assert.deepEqual(geometry(active(replayed).model),geometry(active(scaled).model));
    assert.deepEqual(replayed.documents[scaled.active].states.map(state=>geometry(state.model)),scaledDoc.states.map(state=>geometry(state.model)));
    assert.equal(currentDoc(replayed).states.length,1);assert.equal(active(replayed).operationNode,scaledNode);checks.push('Replay verifies dependencies then opens equivalent geometry in an independent document');
    await page.locator('#document-tabs > button').nth(scaled.active).click();await done();await page.locator('#undo').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');await done();await scale(3);
    const linearBranch=(await save('undo-scale-three')).project,branchDoc=currentDoc(linearBranch);assert.equal(branchDoc.states.length,2);assert.equal(branchDoc.operationHistory.nodes.length,3);
    assert.ok(branchDoc.operationHistory.nodes.some(node=>node.id===scaledNode));assert.deepEqual(active(linearBranch).model.vertices,source.vertices.map(point=>point.map(value=>3*value)));
    checks.push('new operation after Undo retains the discarded linear result as an immutable graph branch');
    await history();await page.locator('#history-branch').click();await page.locator('#history-parameters').fill('{"scale":4}');await page.locator('#history-parameters-apply').click();
    await page.waitForFunction(()=>!document.getElementById('history-parameters-dialog').open);await done();
    const changed=await save('parameter-scale-four'),changedState=active(changed.project);assert.equal(changed.project.documents.length,linearBranch.documents.length+1);
    assert.deepEqual(changedState.model.vertices,source.vertices.map(point=>point.map(value=>4*value)));
    assert.deepEqual(changed.project.documents[linearBranch.active].states.map(state=>geometry(state.model)),branchDoc.states.map(state=>geometry(state.model)));
    assert.equal(currentDoc(changed.project).operationHistory.nodes.length,4);checks.push('Parameters branches from the original parent, producing scale four rather than multiplying scale three');
    await reopen(changed.file);const reopened=(await save('reopened-graph')).project;
    assert.deepEqual(currentDoc(reopened).operationHistory,currentDoc(changed.project).operationHistory);assert.deepEqual(geometry(active(reopened).model),geometry(changedState.model));checks.push('native project save and reopen preserve graph IDs, associations and source geometry');
    for(const [params,expected] of [['{bad','JSON'],['{"scale":0}','nonzero']]){
      await history();await page.locator('#history-branch').click();await page.locator('#history-parameters').fill(params);await page.locator('#history-parameters-apply').click();
      await page.waitForFunction(expected=>!document.getElementById('toast').hidden&&document.getElementById('toast').textContent.includes(expected),expected);
      assert.equal(await page.locator('#history-parameters-dialog').evaluate(element=>element.open),true);await done();await page.locator('#history-parameters-close').click();
      const rejected=(await save('rejected-'+expected.toLowerCase())).project;assert.deepEqual(geometry(active(rejected).model),geometry(changedState.model));assert.equal(rejected.documents.length,reopened.documents.length);
    }
    checks.push('malformed JSON and native invalid parameters fail without publishing or changing current geometry');
    const unsupported=structuredClone(reopened),unsupportedNode=currentDoc(unsupported).operationHistory.nodes.find(node=>node.id===active(unsupported).operationNode),sentinel=path.join(folder,'forbidden-history-export.json');
    unsupportedNode.op='export';unsupportedNode.params={format:'json',path:sentinel};const unsupportedFile=path.join(folder,'unsupported-readable.polyproj');await fs.writeFile(unsupportedFile,JSON.stringify(unsupported));await reopen(unsupportedFile);
    await history();assert.equal(await page.locator('#history-branch').isEnabled(),false);await page.locator('#history-replay').click();await page.waitForFunction(()=>!document.getElementById('toast').hidden&&document.getElementById('toast').textContent.includes('unsupported replay operation export'));await done();
    const safelyRetained=(await save('unsupported-snapshot')).project;assert.deepEqual(geometry(active(safelyRetained).model),geometry(changedState.model));assert.equal(currentDoc(safelyRetained).operationHistory.nodes.find(node=>node.id===active(safelyRetained).operationNode).op,'export');await assert.rejects(()=>fs.access(sentinel));
    checks.push('unknown file-operation records stay readable while replay refuses nested filesystem dispatch');
    await catalog('antiprism-j92','J92','triangular hebesphenorotunda');const johnson=(await save('catalog-j92')).project,jmodel=active(johnson).model;
    assert.deepEqual([jmodel.vertices.length,jmodel.edges.length,jmodel.faces.length,jmodel.cells.length],[18,36,20,0]);assert.equal(jmodel.metadata.key,'antiprism-j92');assert.equal(jmodel.provenance.catalogSource.sha256,'76d6b0548bdb833af6d4fb6ea07b235f26dacb3bc3433cb194d7260891cd8785');assert.ok(jmodel.metadata.offColors.faces.every(color=>color?.values.length===3));checks.push('library search loads attributed Johnson J92 geometry, source hashes and polygon RGB');
    await catalog('antiprism-u75','U75','great dirhombicosidodecahedron');const uniform=(await save('catalog-u75')).project,umodel=active(uniform).model;
    assert.deepEqual([umodel.vertices.length,umodel.edges.length,umodel.faces.length],[60,240,124]);assert.equal(umodel.interpretation,'generalized-complex');assert.equal(umodel.metadata.key,'antiprism-u75');checks.push('library U75 preserves all 124 nonconvex source faces without hull substitution');
    await catalog('miratope-grand-hecatonicosachoron','Grand hecatonicosachoron','Grand hecatonicosachoron');const star=(await save('catalog-4d-star')).project,smodel=active(star).model;
    assert.equal(smodel.dimension,4);assert.deepEqual([smodel.vertices.length,smodel.edges.length,smodel.faces.length,smodel.cells.length],[120,720,720,120]);assert.equal(smodel.interpretation,'generalized-complex');assert.equal(smodel.provenance.catalogSource.sha256,'ab7102e397cf1cb3ed35cadd65057927e3f34fded4f238570d63ae300b5dae53');checks.push('library opens attributed regular 4D star with complete source face/cell incidence');
    await page.locator('#search').fill('');await page.locator('#toggle-inspector').click();await history();await page.screenshot({path:path.join(folder,'recipes-and-catalog-workspace.png')});assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,packaged:Boolean(packaged),version:await app.evaluate(({app})=>app.getVersion()),checks,pageErrors:errors},null,2));console.log(`Recipes ${packaged?'packaged ':''}smoke passed: ${checks.length} checks. Artifacts: ${folder}`);
  }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors},null,2));console.error('Artifacts:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
