// Actual face-placement qualification. Authoring and self-tests launch no GUI.
// GUI launches are root-owned and require guardRuntime's explicit runtime opt-in.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {guardRuntime}=require('./layer-join-smoke.cjs');
const root=path.resolve(__dirname,'..'),clone=structuredClone;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const doc=p=>p.documents[p.active],active=p=>doc(p).states[doc(p).cursor];
const kinds=['vertices','edges','faces','cells'],counts=m=>kinds.map(k=>m[k].length);
const range=(n,offset=0)=>Array.from({length:n},(_,i)=>i+offset);
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const color=(i,addition)=>i%2?{encoding:'unit',values:[.2,.6,.4,addition ? .375 : .25]}:
  {encoding:'byte',values:[25+i,90+i,210-i,addition?127:128]};
function cube(addition=false){
  return {id:addition?'literal-placement-memory-addition':'literal-placement-base',
    name:addition?'Literal memory cube':'Literal placement cube',dimension:3,embeddingDimension:3,
    interpretation:'generalized-complex',vertices:[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
    edges:[[0,1],[1,2],[2,3],[0,3],[4,5],[5,6],[6,7],[4,7],[0,4],[1,5],[2,6],[3,7]],
    faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],cells:[],
    numeric:{mode:'float64-approximate',certified:false},metadata:{coordinateUnits:'mm',
      retainedAttribute:{literal:addition?'addition-specific attribute':'base-specific attribute',numbers:[1,.125]},
      offlineAsset:{relativePath:'textures/local.png',hash:addition?'addition-asset':'base-asset'},
      offColors:{faces:range(6).map(i=>color(i,addition)),cells:[]}}};
}
function parameters(addition,extra={}){
  return {addition,face_ids:[1],addition_face_id:0,scale:1,height:0,angle_degrees:0,color_policy:'preserve',...extra};
}
function expectedVertex(point,target,{scale=1,height=0,angle_degrees=0}){
  // Literal source bottom face: anchor(.5,.5,0), outward -Z, first edge +Y.
  // Top target's tangent is +X and outward +Z; +X target's tangent +Y.
  // These Cartesian formulas are independent of the published native matrix.
  const [x,y,z]=point,c=Math.cos(angle_degrees*Math.PI/180),s=Math.sin(angle_degrees*Math.PI/180);
  if(target===1)return [.5+scale*(c*(y-.5)+s*(x-.5)),.5+scale*(s*(y-.5)-c*(x-.5)),1+height+scale*z];
  if(target===3)return [1+height+scale*z,.5+scale*(c*(y-.5)+s*(x-.5)),.5+scale*(s*(y-.5)-c*(x-.5))];
  throw Error('Independent fixture oracle supports only literal target faces 1 and 3.');
}
function verifyGeometry(model,base,addition,params){
  const n=params.face_ids.length;assert.deepEqual(counts(model),[8*(n+1),12*(n+1),6*(n+1),0]);
  assert.equal(model.dimension,3);assert.equal(model.embeddingDimension,3);
  assert.deepEqual(model.vertices.slice(0,8),base.vertices);
  assert.deepEqual(model.edges.slice(0,12),base.edges);assert.deepEqual(model.faces.slice(0,6),base.faces);
  for(const [i,target] of params.face_ids.entries()){
    const offset=8*(i+1);addition.vertices.forEach((p,v)=>expectedVertex(p,target,params).forEach((x,j)=>near(model.vertices[offset+v][j],x)));
    assert.deepEqual(model.edges.slice(12*(i+1),12*(i+2)),addition.edges.map(e=>e.map(v=>v+offset)));
    assert.deepEqual(model.faces.slice(6*(i+1),6*(i+2)),addition.faces.map(f=>f.map(v=>v+offset)));
  }
  assert.equal(model.interpretation,'generalized-complex');assert.equal(model.numeric.certified,false);
  assert.equal(model.measure,undefined);assert.equal(model.metadata.coordinateUnits,'mm');
  assert.deepEqual(model.metadata.offColors,{faces:[...base.metadata.offColors.faces,...params.face_ids.flatMap(()=>addition.metadata.offColors.faces)],cells:[]});
}
function verifyPlacement(model,base,addition,params){
  verifyGeometry(model,base,addition,params);
  const e=model.metadata.facePlacement;assert.equal(e.schemaVersion,1);
  assert.deepEqual(e.sourceModels,[base,addition]);assert.equal(e.resultModelId,model.id);assert.equal(e.resultFingerprint,model.fingerprint);
  assert.deepEqual(e.baseMaps,Object.fromEntries(kinds.map(k=>[k,range(base[k].length)])));
  assert.equal(model.provenance.operation,'place-at-faces');assert.equal(model.provenance.algorithmVersion,'0.1.0');
  assert.equal(model.provenance.kernelVersion,'0.1.0');assert.equal(e.nativeProjectGate.passed,true);
  assert.equal(e.nativeProjectGate.filledMeasurePublished,false);
  for(const k of ['weld','removeCoincidentFaces','blendCoplanarFaces','hullReplacement'])assert.equal(e.outputPolicy[k],false);
  assert.equal(e.outputPolicy.keepBase,true);assert.equal(e.placements.length,params.face_ids.length);
  assert.equal(model.components.length,params.face_ids.length+1);
  assert.equal(new Set(model.components.map(c=>c.id)).size,model.components.length);
  e.inputs.forEach((input,i)=>{assert.equal(input.sourceModelId,e.sourceModels[i].id);assert.match(input.sourceSnapshotSha256,/^[a-f0-9]{64}$/);});
  for(const [i,row] of e.placements.entries()){
    assert.equal(row.targetFaceId,params.face_ids[i]);assert.equal(row.additionFaceId,0);
    assert.equal(row.sourceModelId,addition.id);assert.equal(row.componentIds.length,1);
    const expectedMaps=Object.fromEntries(kinds.map(k=>[k,range(addition[k].length,base[k].length+i*addition[k].length)]));
    assert.deepEqual(row.maps,expectedMaps);
    const component=model.components.find(c=>c.id===row.componentIds[0]);assert.ok(component);
    assert.deepEqual(component.maps,expectedMaps);assert.equal(component.sourceModelId,row.instanceModelId);
    assert.deepEqual(component.sourcePath,params.face_ids.length===1?[1]:[1,i]);
    const t=row.transform;near(t.scale,params.scale);near(t.height,params.height);near(t.angleDegrees,params.angle_degrees);
    assert.deepEqual(t.sourceAnchor,[.5,.5,0]);assert.deepEqual(t.sourceOutwardNormal,[0,0,-1]);
    const normal=row.targetFaceId===1?[0,0,1]:[1,0,0];normal.forEach((v,j)=>near(t.targetOutwardNormal[j],v));
    const anchor=row.targetFaceId===1?[.5,.5,1+params.height]:[1+params.height,.5,.5];anchor.forEach((v,j)=>near(t.targetAnchor[j],v));
    near(t.determinant,1);const r=t.rotation;
    for(let a=0;a<3;a++)for(let b=0;b<3;b++)near(r.reduce((sum,row)=>sum+row[a]*row[b],0),a===b?1:0);
  }
}
function verifyComponent(model,placed,addition,index=0){
  const row=placed.metadata.facePlacement.placements[index];assert.deepEqual(counts(model),[8,12,6,0]);
  row.maps.vertices.forEach((source,i)=>assert.deepEqual(model.vertices[i],placed.vertices[source]));
  assert.deepEqual(model.edges,addition.edges);assert.deepEqual(model.faces,addition.faces);assert.deepEqual(model.cells,[]);
  assert.deepEqual(model.metadata.offColors,addition.metadata.offColors);assert.equal(model.metadata.coordinateUnits,'mm');
  assert.deepEqual(model.metadata.facePlacementInstance.sourceModel,addition);
  assert.equal(model.provenance.sourceModelId,placed.id);assert.equal(model.provenance.componentId,row.componentIds[0]);
  assert.deepEqual(model.provenance.sourceMaps,row.maps);assert.equal(model.numeric.certified,false);assert.equal(model.measure,undefined);
}
function reference(base,addition,params){
  const m=clone(base);for(const target of params.face_ids){const offset=m.vertices.length;
    m.vertices.push(...addition.vertices.map(p=>expectedVertex(p,target,params)));
    m.edges.push(...addition.edges.map(e=>e.map(v=>v+offset)));m.faces.push(...addition.faces.map(f=>f.map(v=>v+offset)));
    m.metadata.offColors.faces.push(...clone(addition.metadata.offColors.faces));
  }return m;
}
function selfTest(){
  const base=cube(),addition=cube(true),p=parameters(addition,{face_ids:[3,1],scale:.5,height:-.25,angle_degrees:90});
  const r=reference(base,addition,p);verifyGeometry(r,base,addition,p);
  near(r.vertices[8][0],.75);near(r.vertices[8][1],.25);near(r.vertices[8][2],.25);
  near(r.vertices[16][0],.25);near(r.vertices[16][1],.25);near(r.vertices[16][2],.75);
  const coordinate=clone(r);coordinate.vertices[8][0]+=.01;assert.throws(()=>verifyGeometry(coordinate,base,addition,p));
  const cycle=clone(r);cycle.faces[6].reverse();assert.throws(()=>verifyGeometry(cycle,base,addition,p));
  const rgba=clone(r);rgba.metadata.offColors.faces[6].values[3]=126;assert.throws(()=>verifyGeometry(rgba,base,addition,p));
  const measure=clone(r);measure.measure={content:1};assert.throws(()=>verifyGeometry(measure,base,addition,p));
  console.log('Face placement independent coordinate/incidence/RGBA verifier self-test PASS; no app launched.');
}
function nativeSelfTest(){
  const base=cube(),addition=cube(true),cases=[parameters(base),parameters(addition,{face_ids:[3,1],scale:.5,height:-.25,angle_degrees:90})];
  const run=requests=>{const processResult=spawnSync(process.env.POLYTOPE_PYTHON||'python',['-B','-m','engine.server'],{
    cwd:root,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024,input:requests.map(r=>JSON.stringify(r)).join('\n')+'\n'});
    assert.ifError(processResult.error);assert.equal(processResult.status,0,processResult.stderr);
    return processResult.stdout.trim().split(/\r?\n/).map(line=>{const result=JSON.parse(line);assert.equal(result.ok,true,result.error);return result.result;});};
  const values=run(cases.map((params,i)=>({id:'placement-'+i,op:'place-at-faces',model:base,params})));
  values.forEach((m,i)=>verifyPlacement(m,base,cases[i].addition,cases[i]));
  const forgedMap=clone(values[1]);forgedMap.metadata.facePlacement.placements[0].maps.vertices[0]=0;
  assert.throws(()=>verifyPlacement(forgedMap,base,addition,cases[1]));
  const forgedSource=clone(values[1]);forgedSource.metadata.facePlacement.sourceModels[1].metadata.offlineAsset.hash='forged';
  assert.throws(()=>verifyPlacement(forgedSource,base,addition,cases[1]));
  const components=run(values.map(m=>({op:'compound-component',model:m,params:{component_id:m.metadata.facePlacement.placements[0].componentIds[0]}})));
  components.forEach((m,i)=>verifyComponent(m,values[i],cases[i].addition));
  const document={id:'literal-placement-document',cursor:0,states:[{model:base,notes:'Retain placement source notes',
    view:{coordinateUnit:'mm',sectionNormal:[0,0,1],sectionOffset:0,derivedMode:'face',surfaceColors:'source'}}]};
  const fixture={format:'polytope-laboratory',version:1,active:0,documents:[document],memories:{version:1,slots:Array(9).fill(null)}};
  fixture.memories.slots[8]={state:{model:addition,notes:'Memory-only addition notes',view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0]}},
    source:{documentId:'retained-external-addition-document',modelId:addition.id,origin:'independent numbered-memory fixture'}};
  const [validated]=run([{op:'validate-project',params:{project:fixture}}]);
  const originalMemory=clone(validated.memories);assert.match(originalMemory.slots[8].state.model.fingerprint,/^[a-f0-9]{64}$/);
  delete originalMemory.slots[8].state.model.fingerprint;assert.deepEqual(originalMemory,fixture.memories);
  const source=validated.documents[0].states[0].model,currentParams=parameters(source);
  const [recipe]=run([{op:'recipe-run',params:{document:validated.documents[0],operation:'place-at-faces',parameters:currentParams}}]);
  verifyPlacement(recipe.states[recipe.cursor].model,source,source,currentParams);
  const branchParams=parameters(source,{face_ids:[3,1],scale:.5,height:-.25,angle_degrees:90});
  const [replay,branch]=run([{op:'recipe-replay',params:{document:recipe}},
    {op:'recipe-branch',params:{document:recipe,parameters:branchParams}}]);
  assert.deepEqual(replay.states[replay.cursor].model,recipe.states[recipe.cursor].model);
  verifyPlacement(branch.states[branch.cursor].model,source,source,branchParams);
  assert.equal(branch.operationHistory.nodes.at(-1).parent,branch.operationHistory.nodes.at(-2).parent);
  assert.deepEqual(document.states[0].model,base);
  console.log('Face placement cold native geometry/components, memory project envelope and recipe Replay/original-parent branch PASS; no app launched.');
}
async function main(){
  const runtime=await guardRuntime(); // Refuse an unapproved runtime before requiring Electron.
  const {_electron:electron}=require('playwright'),started=performance.now();
  const artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));
  await fs.mkdir(artifacts,{recursive:true});const folder=await fs.mkdtemp(path.join(artifacts,'face-placement-smoke-'));
  const profile=path.join(folder,'profile');await fs.mkdir(profile);
  await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
  const checks=[],errors=[],files=[];let page,serial=0;
  try{
    assert.equal((await app.evaluate(({app})=>app.polytopeQualification))?.mode,runtime.hidden?'hidden-no-focus':undefined);
    page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>document.getElementById('face-placement-settings')&&document.getElementById('model-name').textContent==='Tesseract');
    await page.evaluate(()=>{window.placementStatuses=[];new MutationObserver(()=>window.placementStatuses.push(document.getElementById('status').textContent)).observe(document.getElementById('status'),{childList:true,subtree:true,characterData:true});});
    const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
    const disclose=async id=>{if(!await page.locator('#'+id).evaluate(n=>n.open))await page.locator('#'+id+' > summary').click();};
    const inspector=async()=>{if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();};
    const construct=async()=>{await inspector();await page.locator('[data-panel="construct"]').click();await disclose('face-placement-settings');};
    const save=async label=>{
      await done();const file=path.join(folder,`${String(++serial).padStart(2,'0')}-${label}.polyproj`);
      await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
      await page.locator('#save').click();await page.waitForFunction(file=>window.placementStatuses.includes('Saved '+file),file);await done();
      const bytes=await fs.readFile(file);files.push({file,sha256:hash(bytes)});return {file,project:JSON.parse(bytes)};
    };
    const open=async file=>{
      await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
      await page.locator('#open').click();await page.waitForFunction(file=>window.placementStatuses.includes('Opened '+file),file);await done();
    };
    const initial=(await save('initial')).project;
    const replace=async(label,withMemory=false)=>{
      const p=clone(initial);p.active=0;
      p.documents=[{id:'literal-placement-document',cursor:0,states:[{model:cube(),notes:'Retain placement source notes',
        view:{coordinateUnit:'mm',sectionNormal:[0,0,1],sectionOffset:0,derivedMode:'face',surfaceColors:'source'}}]}];
      p.memories={version:1,slots:Array(9).fill(null)};
      if(withMemory)p.memories.slots[8]={state:{model:cube(true),notes:'Memory-only addition notes',view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0]}},
        source:{documentId:'retained-external-addition-document',modelId:cube(true).id,origin:'independent numbered-memory fixture'}};
      const file=path.join(folder,label+'.polyproj'),bytes=Buffer.from(JSON.stringify(p));await fs.writeFile(file,bytes);files.push({file,sha256:hash(bytes)});
      await open(file);return save(label+'-native');
    };
    const configure=async(params,source='current')=>{
      await construct();await page.locator('#placement-source').selectOption(source);
      for(const [id,value] of [['face-ids',params.face_ids.join(',')],['addition-face',params.addition_face_id],['scale',params.scale],['height',params.height],['angle',params.angle_degrees]])
        await page.locator('#placement-'+id).fill(String(value));
    };
    const execute=async(params,source='current')=>{
      await configure(params,source);const n=await page.locator('#history-list button').count();
      await page.locator('#place-at-faces').click();await page.waitForFunction(n=>document.getElementById('history-list').children.length===n+1,n);
      await done();return save('placement-result');
    };
    const replay=async()=>{
      await inspector();await disclose('history-settings');assert.equal(await page.locator('#history-replay').isEnabled(),true);
      const n=await page.locator('#document-tabs > button').count();await page.locator('#history-replay').click();
      await page.waitForFunction(n=>document.getElementById('document-tabs').children.length===n+1,n);await done();return save('replayed');
    };
    const branch=async params=>{
      await inspector();await disclose('history-settings');assert.equal(await page.locator('#history-branch').isEnabled(),true);
      const n=await page.locator('#document-tabs > button').count();await page.locator('#history-branch').click();
      await page.locator('#history-parameters').fill(JSON.stringify(params));await page.locator('#history-parameters-apply').click();
      await page.waitForFunction(n=>document.getElementById('document-tabs').children.length===n+1,n);await done();return save('parameter-branch');
    };

    const original=await replace('literal-cube'),base=active(original.project).model,oneParams=parameters(base);
    const single=await execute(oneParams),one=active(single.project).model;verifyPlacement(one,base,base,oneParams);
    assert.deepEqual(doc(single.project).states[0].model,base);
    assert.equal(doc(single.project).states[0].notes,doc(original.project).states[0].notes);
    assert.equal(active(single.project).notes,'Retain placement source notes');assert.equal(active(single.project).view.coordinateUnit,'mm');
    const top=base.faces[1].map(v=>base.vertices[v].join(',')),placedBottom=one.faces[6].map(v=>one.vertices[v].join(','));
    assert.deepEqual(placedBottom.sort(),top.sort());assert.equal(new Set(one.faces[6]).size,4);
    assert.ok(one.faces[6].every(v=>v>=8));await page.screenshot({path:path.join(folder,'one-face-unwelded.png')});
    checks.push('current copy top placement independently gives16/24/12 with coincident faces retained under distinct IDs, literal source cycles/notes/units and byte/unit RGBA');
    await page.locator('#undo').click();assert.deepEqual(active((await save('undo')).project).model,base);
    await page.locator('#redo').click();assert.deepEqual(active((await save('redo')).project).model,one);
    await open(single.file);assert.deepEqual(active((await save('reopened')).project).model,one);
    const replayedSingle=await replay();assert.deepEqual(active(replayedSingle.project).model,one);
    checks.push('actual native Save/Open adoption, undo/redo and independent Replay preserve complete model attributes and geometry');
    const altered=parameters(base,{face_ids:[3,1],scale:.5,height:-.25,angle_degrees:90});
    const branched=await branch(altered),branchModel=active(branched.project).model;verifyPlacement(branchModel,base,base,altered);
    const nodes=doc(branched.project).operationHistory.nodes;assert.equal(nodes.at(-1).parent,nodes.at(-2).parent);
    assert.equal(nodes.at(-1).op,'place-at-faces');assert.deepEqual(nodes.at(-1).params.addition,base);
    assert.deepEqual(branched.project.documents.slice(0,-1),replayedSingle.project.documents);
    assert.deepEqual(active((await replay()).project).model,branchModel);
    checks.push('original-parent Parameters branch yields24/36/18 instead of expanding the prior16 vertices; independent signed height -.25, scale .5 and90-degree top/+X point witnesses match, and Replay preserves the branch');

    const memorySource=await replace('literal-memory-cube',true),memoryBefore=clone(memorySource.project.memories),nativeBase=active(memorySource.project).model;
    const addition=memoryBefore.slots[8].state.model,memoryParams=parameters(addition,{face_ids:[3,1],scale:.5,height:-.25,angle_degrees:90});
    const memoryResult=await execute(memoryParams,'memory:9'),placed=active(memoryResult.project).model;verifyPlacement(placed,nativeBase,addition,memoryParams);
    assert.deepEqual(memoryResult.project.memories,memoryBefore);assert.deepEqual(doc(memoryResult.project).states[0].model,nativeBase);
    assert.equal(doc(memoryResult.project).states[0].notes,doc(memorySource.project).states[0].notes);
    assert.notDeepEqual(addition.metadata.offColors,nativeBase.metadata.offColors);
    await open(memoryResult.file);const memoryReopened=await save('memory-reopened');assert.deepEqual(active(memoryReopened.project).model,placed);assert.deepEqual(memoryReopened.project.memories,memoryBefore);
    assert.deepEqual(active((await replay()).project).model,placed);
    await page.screenshot({path:path.join(folder,'two-face-memory-placements.png')});
    checks.push('numbered Memory9 full entry and external source identity remain untouched through two explicitly ordered independent copies, saved/reopened and replayed with distinct alpha and offline attributes');

    await inspector();await page.locator('[data-panel="construct"]').click();
    const componentId=placed.metadata.facePlacement.placements[0].componentIds[0];
    await page.locator('#compound-component').selectOption(componentId);const historyCount=await page.locator('#history-list button').count();
    await page.locator('#compound-extract').click();await page.waitForFunction(n=>document.getElementById('history-list').children.length===n+1,historyCount);await done();
    const extracted=await save('genuine-component');verifyComponent(active(extracted.project).model,placed,addition);
    assert.deepEqual(extracted.project.memories,memoryBefore);assert.deepEqual(doc(extracted.project).states.at(-2).model,placed);
    assert.deepEqual(active((await replay()).project).model,active(extracted.project).model);
    checks.push('actual Keep component extracts8/12/6 from genuine source mappings, retaining placed coordinates, original cycles, memory RGBA/unit/source snapshot and mixed placement-component Replay');

    for(const mutation of ['unit','memory']){
      const before=await replace('held-'+mutation,true),source=active(before.project).model,bank=clone(before.project.memories);
      const p=parameters(mutation==='memory'?bank.slots[8].state.model:source);await configure(p,mutation==='memory'?'memory:9':'current');
      await app.evaluate(({ipcMain})=>{
        const original=ipcMain._invokeHandlers.get('engine');if(typeof original!=='function')throw Error('Native engine handler unavailable.');
        globalThis.placementOriginalHandler=original;globalThis.placementHeld=false;
        ipcMain.removeHandler('engine');ipcMain.handle('engine',async(event,request,id)=>{
          const result=await original(event,request,id);
          if(request.op==='recipe-run'&&request.params.operation==='place-at-faces'){
            globalThis.placementHeld=true;await new Promise(resolve=>{globalThis.placementRelease=resolve;});
          }return result;
        });
      });
      try{
        await page.locator('#place-at-faces').click();await app.evaluate(()=>new Promise((resolve,reject)=>{
          const until=Date.now()+15000,timer=setInterval(()=>{if(globalThis.placementHeld){clearInterval(timer);resolve();}
            else if(Date.now()>until){clearInterval(timer);reject(Error('Placement never reached held native completion.'));}},10);
        }));
        if(mutation==='unit')await page.locator('#model-unit').selectOption('cm');
        else{
          await disclose('memories-settings');await page.locator('#memory-slot').selectOption('9');await page.locator('#memory-source').selectOption('base');
          assert.equal(await page.locator('#memory-store').isEnabled(),true);await page.locator('#memory-store').click();
          await page.waitForFunction(()=>window.placementStatuses.some(t=>/^Stored .* in memory 9\.$/.test(t)));
        }
        await app.evaluate(()=>globalThis.placementRelease());
        await page.waitForFunction(mutation=>!document.getElementById('toast').hidden&&(mutation==='memory'
          ?/selected placement memory changed/i:/source, units, notes, or attributes changed/i).test(document.getElementById('toast').textContent),mutation);
        await done();const refused=await save(mutation+'-changed-refused');
        assert.deepEqual(active(refused.project).model,source);assert.equal(doc(refused.project).states.length,1);
        assert.deepEqual(doc(refused.project).operationHistory,doc(before.project).operationHistory);
        assert.equal(active(refused.project).notes,active(before.project).notes);
        if(mutation==='unit'){assert.equal(active(refused.project).view.coordinateUnit,'cm');assert.deepEqual(refused.project.memories,bank);}
        else{assert.deepEqual(refused.project.memories.slots.slice(0,8),bank.slots.slice(0,8));
          assert.notDeepEqual(refused.project.memories.slots[8],bank.slots[8]);assert.deepEqual(refused.project.memories.slots[8].state.model,source);
          assert.equal(refused.project.memories.slots[8].source.documentId,doc(before.project).id);}
        checks.push('actual held native completion refuses changed '+mutation+' ownership without publishing geometry/history, preserves the user edit and unrelated memory slots');
      }finally{
        await app.evaluate(({ipcMain})=>{globalThis.placementRelease?.();ipcMain.removeHandler('engine');ipcMain.handle('engine',globalThis.placementOriginalHandler);
          delete globalThis.placementOriginalHandler;delete globalThis.placementRelease;});
      }
      if(mutation==='unit')await page.locator('#model-unit').selectOption('mm');
      const recovered=await execute(parameters(source));verifyPlacement(active(recovered.project).model,source,source,parameters(source));
    }
    checks.push('both stale-refusal paths release controls and accept a subsequent valid current-copy placement');
    for(const file of files)assert.equal(hash(await fs.readFile(file.file)),file.sha256);assert.deepEqual(errors,[]);
    const result={passed:true,packaged:Boolean(runtime.packaged),runtime:runtime.runtime,hidden:runtime.hidden,
      version:await app.evaluate(({app})=>app.getVersion()),checks,pageErrors:errors,files,seconds:(performance.now()-started)/1000};
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));console.log('Face placement smoke PASS. Artifacts: '+folder);
  }catch(error){
    await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});
    await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors},null,2));
    console.error('Artifacts: '+folder);throw error;
  }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
if(require.main===module){if(process.argv.includes('--self-test'))selfTest();else if(process.argv.includes('--native-self-test'))nativeSelfTest();else main().catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={cube,parameters,expectedVertex,verifyGeometry,verifyPlacement,verifyComponent,selfTest,nativeSelfTest};
