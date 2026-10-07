// Future face-attachment integration qualification. Not registered in .14.
// GUI execution is root-only after native/history/UI mounting. --self-test
// uses independent literal fixtures and never launches or qualifies an app.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{guardRuntime}=require('./layer-join-smoke.cjs');
const root=path.resolve(__dirname,'..'),clone=structuredClone;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const doc=p=>p.documents[p.active],active=p=>doc(p).states[doc(p).cursor];
const keys=['dimension','embeddingDimension','vertices','edges','faces','cells','fingerprint'];
const geometry=m=>Object.fromEntries(keys.map(k=>[k,m[k]]));
const byteColor={encoding:'byte',values:[25,90,210,128]},unitColor={encoding:'unit',values:[.2,.6,.4,.25]};
function cube(id='attachment-cube'){
  const vertices=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
  const edges=[[0,1],[0,3],[0,4],[1,2],[1,5],[2,3],[2,6],[3,7],[4,5],[4,7],[5,6],[6,7]];
  const faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
  return {id,name:'Literal attachment cube',dimension:3,embeddingDimension:3,interpretation:'generalized-complex',
    vertices,edges,faces,cells:[],numeric:{mode:'float64-approximate',certified:false},
    metadata:{coordinateUnits:'mm',retainedAttribute:{label:'independent fixture'},
      offColors:{faces:[clone(byteColor),clone(unitColor),null,null,null,null],cells:[]}}};
}
function referenceBoundary(){
  return {vertices:[...cube().vertices,[0,0,2],[1,0,2],[1,1,2],[0,1,2]],
    edges:[...cube().edges,[4,8],[5,9],[6,10],[7,11],[8,9],[8,11],[9,10],[10,11]],
    faces:[[0,3,2,1],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],
      [8,9,10,11],[4,5,9,8],[5,6,10,9],[6,7,11,10],[7,4,8,11]],cells:[]};
}
function verifyBoundary(model){
  const expected=referenceBoundary();
  for(const key of ['vertices','edges','faces','cells'])assert.deepEqual(model[key],expected[key],key);
  assert.equal(model.dimension,3);assert.equal(model.embeddingDimension,3);
  assert.equal(model.interpretation,'generalized-complex');assert.equal(model.numeric.certified,false);
  assert.equal(model.measure,undefined);assert.equal(model.components,undefined);assert.equal(model.convexPieces,undefined);
  const use=new Map();for(const face of model.faces)for(let i=0;i<face.length;i++){
    const key=[face[i],face[(i+1)%face.length]].sort((a,b)=>a-b).join(',');use.set(key,(use.get(key)||0)+1);
  }
  assert.equal(use.size,20);assert.ok([...use.values()].every(n=>n===2));
  assert.equal(model.vertices.length-model.edges.length+model.faces.length,2);
}
function verifyEvidence(model,base,addition){
  verifyBoundary(model);const e=model.metadata.augmentation;
  assert.deepEqual(e.sourceModels,[base,addition]);
  assert.deepEqual(e.inputs.map(row=>row.sourceModelId),[base.id,addition.id]);
  assert.deepEqual(e.inputs[0].maps,{vertices:[0,1,2,3,4,5,6,7],edges:[0,1,2,3,4,5,6,7,8,9,10,11],faces:[0,null,1,2,3,4],cells:[]});
  assert.deepEqual(e.inputs[1].maps,{vertices:[4,5,6,7,8,9,10,11],edges:[8,9,12,10,13,11,14,15,16,17,18,19],faces:[null,5,6,7,8,9],cells:[]});
  assert.deepEqual(e.removedFaces,[{sourceIndex:0,faceId:1},{sourceIndex:1,faceId:0}]);
  assert.equal(e.resultModelId,model.id);assert.equal(e.resultFingerprint,model.fingerprint);
  assert.equal(e.alignment.determinant,1);assert.equal(e.alignment.maximumSnapResidual,0);
  assert.equal(e.boundary.closed,true);assert.equal(e.boundary.eulerCharacteristic,2);
  assert.equal(e.nativeProjectGate.passed,true);assert.equal(e.nativeProjectGate.filledMeasurePublished,false);
  assert.equal(model.metadata.coordinateUnits,'mm');
  const owners=[{sourceIndex:0,sourceFaceId:0},...[2,3,4,5].map(sourceFaceId=>({sourceIndex:0,sourceFaceId})),
    ...[1,2,3,4,5].map(sourceFaceId=>({sourceIndex:1,sourceFaceId}))];
  assert.deepEqual(e.faceOwners,owners);
  assert.deepEqual(model.metadata.offColors.faces,owners.map(o=>[base,addition][o.sourceIndex].metadata.offColors.faces[o.sourceFaceId]));
  assert.equal(e.measureEvidence.status,'passed');
  assert.ok(Math.abs(e.measureEvidence.disjointInteriorContent-2)<1e-12);
  assert.ok(Math.abs(e.measureEvidence.surfaceArea-10)<1e-12);
}
function selfTest(){
  const reference={...referenceBoundary(),dimension:3,embeddingDimension:3,interpretation:'generalized-complex',numeric:{certified:false}};
  verifyBoundary(reference);
  for(const mutate of [m=>m.faces[1].reverse(),m=>m.vertices[8][2]=1.9,m=>m.edges.pop(),m=>m.measure={content:2}]){
    const changed=clone(reference);mutate(changed);assert.throws(()=>verifyBoundary(changed));
  }
  console.log('Independent adjacent-cube boundary self-test PASS; corruption refusal. No app launched.');
}
async function main(){
  const runtime=await guardRuntime();
  const {_electron:electron}=require('playwright'),started=performance.now();
  const artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));
  await fs.mkdir(artifacts,{recursive:true});const folder=await fs.mkdtemp(path.join(artifacts,'augmentation-smoke-'));
  const profile=path.join(folder,'profile');await fs.mkdir(profile);
  await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
  const checks=[],errors=[],files=[];let page,serial=0;
  try{
    page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
    await page.waitForFunction(()=>document.getElementById('augmentation-settings')&&document.getElementById('model-name').textContent==='Tesseract');
    const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
    const disclose=async id=>{if(!await page.locator('#'+id).evaluate(n=>n.open))await page.locator('#'+id+' > summary').click();};
    const save=async label=>{
      await done();const file=path.join(folder,`${++serial}-${label}.polyproj`);
      await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
      await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);
      const bytes=await fs.readFile(file);files.push({file,sha256:hash(bytes)});return {file,project:JSON.parse(bytes)};
    };
    const open=async file=>{
      await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
      await page.locator('#open').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Opened '+file,file);await done();
    };
    const initial=await save('initial'),project=clone(initial.project),base=cube();
    project.documents=[{id:'literal-attachment-document',cursor:0,states:[{model:base,notes:'Retain source',
      view:{coordinateUnit:'mm',sectionNormal:[0,0,1],sectionOffset:0,derivedMode:'face'}}]}];project.active=0;
    const fixture=path.join(folder,'literal-cube.polyproj');await fs.writeFile(fixture,JSON.stringify(project));files.push({file:fixture,sha256:hash(await fs.readFile(fixture))});await open(fixture);
    const source=await save('source'),nativeBase=active(source.project).model;
    if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();
    await page.locator('[data-panel="construct"]').click();await disclose('augmentation-settings');
    await page.locator('#augmentation-source').selectOption('current');
    for(const [id,value] of [['base-face','1'],['addition-face','0'],['cycle-offset','0'],['scale','1']])await page.locator('#augmentation-'+id).fill(value);
    const historyCount=await page.locator('#history-list button').count();await page.locator('#attach-faces').click();
    await page.waitForFunction(n=>document.getElementById('history-list').children.length===n+1,historyCount);await done();
    const joined=await save('joined'),model=active(joined.project).model;verifyEvidence(model,nativeBase,nativeBase);
    await page.screenshot({path:path.join(folder,'attached-cubes.png')});
    assert.deepEqual(doc(joined.project).states[0].model,nativeBase);
    const node=doc(joined.project).operationHistory.nodes.at(-1);assert.equal(node.op,'attach-at-faces');assert.equal(node.algorithmVersion,'0.1.0');
    checks.push('literal adjacent cubes retain all12/20/10 ordered boundary records, paired seam maps, face RGBA, full snapshots and approximate area10/content2 without Hull replacement');
    await page.locator('#undo').click();assert.deepEqual(active((await save('undo')).project).model,nativeBase);
    await page.locator('#redo').click();assert.deepEqual(active((await save('redo')).project).model,model);
    await open(joined.file);const reopened=await save('reopened');assert.deepEqual(doc(reopened.project),doc(joined.project));
    await disclose('history-settings');const documents=await page.locator('#document-tabs > button').count();await page.locator('#history-replay').click();
    await page.waitForFunction(n=>document.getElementById('document-tabs').children.length===n+1,documents);await done();
    const replay=await save('replay');assert.deepEqual(geometry(active(replay.project).model),geometry(model));
    assert.deepEqual(active(replay.project).model.metadata,model.metadata);
    checks.push('native UI commit, undo/redo, Save/Open and replay preserve complete source attributes and result evidence');

    const construct=async()=>{
      if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();
      await page.locator('[data-panel="construct"]').click();await disclose('augmentation-settings');
    };
    await open(source.file);await disclose('memories-settings');await page.locator('#memory-slot').selectOption('9');
    await page.locator('#memory-store').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('in memory 9'));
    const bank=(await save('bank')).project,entry=bank.memories.slots[8];
    entry.state.model.id='colored-addition-memory';entry.source.modelId=entry.state.model.id;
    entry.state.model.metadata.retainedAttribute.label='memory-specific source';
    entry.state.model.metadata.offColors.faces[1]={encoding:'unit',values:[.7,.1,.9,.4]};
    const bankFixture=path.join(folder,'colored-memory.polyproj');await fs.writeFile(bankFixture,JSON.stringify(bank));files.push({file:bankFixture,sha256:hash(await fs.readFile(bankFixture))});await open(bankFixture);
    const bankSource=await save('native-memory-source'),memoryBefore=clone(bankSource.project.memories);
    const addition=memoryBefore.slots[8].state.model;await construct();await page.locator('#augmentation-source').selectOption('memory:9');
    const memoryHistoryCount=await page.locator('#history-list button').count();await page.locator('#attach-faces').click();
    await page.waitForFunction(n=>document.getElementById('history-list').children.length===n+1,memoryHistoryCount);await done();
    const memoryResult=await save('memory-joined');verifyEvidence(active(memoryResult.project).model,nativeBase,addition);
    await page.screenshot({path:path.join(folder,'attached-memory-cubes.png')});
    assert.deepEqual(memoryResult.project.memories,memoryBefore);
    assert.deepEqual(doc(memoryResult.project).operationHistory.nodes.at(-1).params.addition,addition);
    checks.push('numbered memory9 uses its full independent colored source snapshot and leaves the original memory bank unchanged');

    await open(bankSource.file);await construct();await page.locator('#augmentation-source').selectOption('current');
    await app.evaluate(({ipcMain})=>{
      const original=ipcMain._invokeHandlers.get('engine');if(typeof original!=='function')throw Error('Native engine handler unavailable for qualification.');
      globalThis.augmentationOriginalHandler=original;globalThis.augmentationNativeHeld=false;
      ipcMain.removeHandler('engine');ipcMain.handle('engine',async(event,request,id)=>{
        const result=await original(event,request,id);
        if(request.op==='recipe-run'&&request.params.operation==='attach-at-faces'){
          globalThis.augmentationNativeHeld=true;await new Promise(resolve=>{globalThis.augmentationReleaseNative=resolve;});
        }
        return result;
      });
    });
    try{
      await page.locator('#attach-faces').click();
      await app.evaluate(()=>new Promise((resolve,reject)=>{
        const until=Date.now()+5000,timer=setInterval(()=>{
          if(globalThis.augmentationNativeHeld){clearInterval(timer);resolve();}
          else if(Date.now()>until){clearInterval(timer);reject(Error('Attachment did not reach held native completion.'));}
        },10);
      }));
      await page.locator('#model-unit').selectOption('cm');await app.evaluate(()=>globalThis.augmentationReleaseNative());
      await page.waitForFunction(()=>!document.getElementById('toast').hidden&&document.getElementById('toast').textContent.includes('units, or attributes changed'));
      await done();const refused=await save('units-changed-refused');
      assert.deepEqual(active(refused.project).model,nativeBase);assert.equal(doc(refused.project).states.length,1);
      assert.equal(active(refused.project).view.coordinateUnit,'cm');assert.deepEqual(refused.project.memories,memoryBefore);
      assert.deepEqual(doc(refused.project).operationHistory,doc(bankSource.project).operationHistory);
      checks.push('actual held native completion refuses changed source units without publishing geometry/history or reverting the user edit');
    }finally{
      await app.evaluate(({ipcMain})=>{
        globalThis.augmentationReleaseNative?.();ipcMain.removeHandler('engine');
        ipcMain.handle('engine',globalThis.augmentationOriginalHandler);
        delete globalThis.augmentationOriginalHandler;delete globalThis.augmentationReleaseNative;
      });
    }
    for(const file of files)assert.equal(hash(await fs.readFile(file.file)),file.sha256);assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(folder,'source-after-refusal.png')});
    const result={passed:true,packaged:Boolean(runtime.packaged),runtime:runtime.runtime,hidden:runtime.hidden,
      version:await app.evaluate(({app})=>app.getVersion()),checks,pageErrors:errors,files,seconds:(performance.now()-started)/1000};
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));console.log('Augmentation smoke PASS. Artifacts: '+folder);
  }catch(error){
    await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});
    await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors},null,2));
    console.error('Artifacts: '+folder);throw error;
  }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
if(require.main===module){if(process.argv.includes('--self-test'))selfTest();else main().catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={cube,referenceBoundary,verifyBoundary,verifyEvidence};
