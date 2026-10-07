// Root-only mounted automatic-faceting GUI qualification. --self-test is headless.
// Small declared pools only; this never claims complete FAC-domain enumeration.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process'),{guardRuntime}=require('./layer-join-smoke.cjs');
const root=path.resolve(__dirname,'..'),clone=structuredClone;
const hash=x=>createHash('sha256').update(x).digest('hex');
const doc=p=>p.documents[p.active],active=p=>doc(p).states[doc(p).cursor];
const counts=m=>['vertices','edges','faces','cells'].map(k=>m[k].length);
const canonical=c=>[c,[...c].reverse()].flatMap(row=>row.map((_,i)=>[...row.slice(i),...row.slice(0,i)].join(','))).sort()[0];
const semantic=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const sameJSON=(a,b)=>assert.deepEqual(semantic(a),semantic(b));
function literal(id,vertices,faces){
  const edges=new Map();for(const f of faces)for(let i=0;i<f.length;i++){
    const e=[f[i],f[(i+1)%f.length]].sort((a,b)=>a-b);edges.set(e.join(','),e);
  }
  return {id,name:id,dimension:3,embeddingDimension:3,interpretation:'generalized-complex',vertices,
    edges:[...edges.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),faces,cells:[],
    numeric:{mode:'float64-approximate',certified:false},metadata:{coordinateUnits:'mm',
      literalOwner:{note:'retain all source attributes',values:[1,-0,.125]},
      offColors:{faces:faces.map((_,i)=>i%2?{encoding:'unit',values:[.2,.4,.6,.35]}:
        {encoding:'byte',values:[20,60,200,128]}),cells:[]}}};
}
function cube(){const points=[];for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])points.push([x,y,z]);
  return literal('Independent faceting cube',points,[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]]);}
function tetra(){return literal('Independent faceting tetrahedron',[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],
  [[0,2,1],[0,1,3],[1,2,3],[2,0,3]]);}
function tetraCompoundCycles(source){
  const groups=[0,1].map(parity=>source.vertices.flatMap((p,i)=>p.filter(x=>x===1).length%2===parity?[i]:[]));
  return groups.flatMap(ids=>ids.flatMap((a,i)=>ids.slice(i+1).flatMap((b,j)=>ids.slice(i+j+2).map(c=>[a,b,c]))));
}
function verifyPool(pool,source){
  assert.equal(pool.status,'complete');assert.equal(pool.sourceId,source.id);
  assert.equal(pool.generationStatus,'complete');assert.equal(pool.symmetry.status,'complete');
  const expected=source.vertices.length===8?[20,92]:[4,4];assert.deepEqual([pool.planes.length,pool.candidates.length],expected);
  const owners=pool.candidates.flatMap(row=>row.sourceFaceIds);assert.deepEqual(owners.sort((a,b)=>a-b),source.faces.map((_,i)=>i));
  for(const row of pool.candidates){assert.match(row.id,/^facet-[a-f0-9]{64}$/);assert.equal(new Set(row.cycle).size,row.cycle.length);}
}
function verifySearch(search,expectedFaces,complete=true){
  assert.equal(search.status,complete?'complete':'resource-limited');
  assert.equal(search.phaseStatus.candidateGeneration,'complete');assert.equal(search.phaseStatus.symmetryAction,'complete');
  assert.equal(search.phaseStatus.subsetSearch,complete?'complete':'resource-limited');
  if(complete){assert.equal(search.countMeaning,'exhausted recorded domain');assert.equal(search.results.length,1);
    assert.deepEqual(search.results[0].cycles.map(canonical).sort(),expectedFaces.map(canonical).sort());}
  else{assert.match(search.countMeaning,/lower bound/i);assert.ok(search.limitReasons.length);}
}
function verifyResult(model,source,faces){
  assert.deepEqual(model.vertices,source.vertices);assert.deepEqual(model.faces.map(canonical).sort(),faces.map(canonical).sort());
  assert.equal(model.interpretation,'generalized-complex');assert.equal(model.numeric.certified,false);
  assert.equal(model.measure,undefined);assert.equal(model.provenance.convexified,false);
  sameJSON(model.provenance.sourceSnapshot,source);assert.equal(model.metadata.coordinateUnits,'mm');
  assert.deepEqual(model.metadata.sourceVertexIds,source.vertices.map((_,i)=>i));
  const expectedEdges=new Set(faces.flatMap(f=>f.map((a,i)=>[a,f[(i+1)%f.length]].sort((a,b)=>a-b).join(','))));
  assert.deepEqual(new Set(model.edges.map(e=>e.join(','))),expectedEdges);
  const incidence=new Map();for(const f of model.faces)for(let i=0;i<f.length;i++){
    const k=[f[i],f[(i+1)%f.length]].sort((a,b)=>a-b).join(',');incidence.set(k,(incidence.get(k)||0)+1);
  }
  assert.ok([...incidence.values()].every(n=>n===2));
  for(const [i,f] of model.faces.entries()){
    const original=source.faces.flatMap((row,j)=>canonical(row)===canonical(f)?[j]:[]);
    assert.deepEqual(model.metadata.sourceFaceIds[i],original);
    sameJSON(model.metadata.offColors.faces[i],original.length?source.metadata.offColors.faces[original[0]]:null);
  }
  const e=model.metadata.automaticFacetingWorkflow;assert.equal(e.operation,'facet-adopt');
  assert.equal(e.algorithmVersion,'0.1.0');assert.equal(e.kernelVersion,'0.3.0');
  assert.equal(e.search.sourceId,source.id);assert.equal(e.search.status,'complete');
  assert.equal(model.provenance.workflowOperation,'facet-adopt');
}
function sourceIds(pool){return pool.candidates.filter(row=>row.sourceFaceIds.length).map(row=>row.id);}
function alternativeIds(pool,source){const cycles=new Set(tetraCompoundCycles(source).map(canonical));
  const ids=pool.candidates.filter(row=>cycles.has(canonical(row.cycle))).map(row=>row.id);assert.equal(ids.length,8);return ids;}
function native(requests){
  const cwd=path.resolve(process.env.POLYTOPE_FACETING_ENGINE_ROOT||root);
  const run=spawnSync(process.env.POLYTOPE_TEST_FIXTURE_PYTHON||'python',['-B','-m','engine.server'],
    {cwd,windowsHide:true,encoding:'utf8',timeout:90000,maxBuffer:64*1024*1024,
      input:requests.map((r,i)=>JSON.stringify({...r,id:'faceting-self-'+i})).join('\n')+'\n'});
  assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr);
  const replies=run.stdout.trim().split(/\r?\n/).map(JSON.parse);assert.equal(replies.length,requests.length);return replies;
}
function nativeOne(request){const reply=native([request])[0];assert.equal(reply.ok,true,reply.error);return reply.result;}
function sourceDocument(source){return {id:'literal-faceting-document',cursor:0,states:[{model:clone(source),
  view:{coordinateUnit:'mm',surfaceColors:'source',derivedMode:'face'},notes:'Retain faceting source notes'}]};}
async function selfTest(){
  for(const source of [cube(),tetra()]){
    const pool=nativeOne({op:'facet-candidates',model:source,params:{max_face_vertices:4}});verifyPool(pool,source);
    const args={max_face_vertices:4,candidate_ids:sourceIds(pool),node_limit:128,result_limit:2};
    const search=nativeOne({op:'facet-search',model:source,params:args});verifySearch(search,source.faces);
    const params={search,result_id:search.results[0].id};
    const result=nativeOne({op:'facet-adopt',model:source,params});verifyResult(result,source,source.faces);
    const document=nativeOne({op:'recipe-run',params:{document:sourceDocument(source),operation:'facet-adopt',parameters:params}});
    assert.equal(document.states.length,2);sameJSON(document.states[0].model,source);verifyResult(document.states[1].model,source,source.faces);
    const replay=nativeOne({op:'recipe-replay',params:{document}});sameJSON(replay.states[0].model,result);
    if(source.vertices.length===8){
      const alternate=nativeOne({op:'facet-search',model:source,params:{...args,candidate_ids:alternativeIds(pool,source),node_limit:1024}});
      verifySearch(alternate,tetraCompoundCycles(source));
      const branch=nativeOne({op:'recipe-branch',params:{document,parameters:{search:alternate,result_id:alternate.results[0].id}}});
      verifyResult(branch.states[branch.cursor].model,source,tetraCompoundCycles(source));assert.deepEqual(counts(branch.states[branch.cursor].model),[8,12,8,0]);
      assert.ok(branch.states[branch.cursor].model.metadata.offColors.faces.every(c=>c===null));
      const refused=native([{op:'facet-search',model:source,params:{...args,criteria:{spiky:true}}},{op:'facet-search',model:source,params:args}]);
      assert.equal(refused[0].ok,false);assert.equal(refused[1].ok,true);
      const limited=nativeOne({op:'facet-search',model:source,params:{...args,node_limit:1}});verifySearch(limited,source.faces,false);
      const altered=clone(result);altered.metadata.offColors.faces[0]=null;assert.throws(()=>verifyResult(altered,source,source.faces));
      const folder=await fs.mkdtemp(path.join(os.tmpdir(),'faceting-native-proof-'));
      try{
        const file=path.join(folder,'source.polyproj'),project={format:'polytope-laboratory',version:1,active:0,documents:[document]};
        nativeOne({op:'save',params:{path:file,project}});
        const loaded=nativeOne({op:'load',params:{path:file}}).project;
        const reread=nativeOne({op:'recipe-replay',params:{document:loaded.documents[0]}});
        verifyResult(reread.states[0].model,source,source.faces);
      }finally{
        assert.ok(path.resolve(folder).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(folder,{recursive:true,force:true});
      }
    }
  }
  console.log('Automatic faceting headless self-test PASS: actual native small-domain pool/search/adoption/replay/alternative-parent branch/SaveOpen, literal incidence and RGBA. No app launched.');
}
async function main(){
  const runtime=await guardRuntime(); // Required before requiring or launching Electron.
  const {_electron:electron}=require('playwright'),started=performance.now();
  const artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));
  await fs.mkdir(artifacts,{recursive:true});const folder=await fs.mkdtemp(path.join(artifacts,'automatic-faceting-smoke-'));
  const profile=path.join(folder,'profile');await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
  const checks=[],errors=[],files=[];let page,serial=0,group='startup';
  try{
    assert.equal((await app.evaluate(({app})=>app.polytopeQualification))?.mode,runtime.hidden?'hidden-no-focus':undefined);
    page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>document.getElementById('automatic-faceting-settings')&&document.getElementById('model-name').textContent==='Tesseract');
    await page.evaluate(()=>{window.facetingHarnessStatuses=[];new MutationObserver(()=>window.facetingHarnessStatuses.push(document.getElementById('status').textContent))
      .observe(document.getElementById('status'),{childList:true,subtree:true,characterData:true});});
    await app.evaluate(({ipcMain})=>{
      const original=ipcMain._invokeHandlers.get('engine'),cancel=ipcMain._invokeHandlers.get('cancel');
      if(typeof original!=='function'||typeof cancel!=='function')throw Error('Registered native handlers required.');
      globalThis.facetingHarness={original,cancel,rows:[],hold:false,ready:false,release:null};
      ipcMain.removeHandler('engine');ipcMain.handle('engine',async(event,request,id)=>{
        const h=globalThis.facetingHarness,observe=request.op.startsWith('facet-')||request.op==='recipe-run'&&request.params.operation==='facet-adopt'||['recipe-replay','recipe-branch'].includes(request.op);
        const row=observe?{id,request:structuredClone(request)}:null;if(row)h.rows.push(row);
        const hold=h.hold&&request.op===h.holdOp&&(request.op!=='recipe-run'||request.params.operation==='facet-adopt');
        if(hold){h.hold=false;h.heldId=id;}
        const result=await original(event,request,id);if(row)row.result=structuredClone(result);
        if(hold){h.ready=true;await new Promise(resolve=>h.release=resolve);}return result;
      });
      ipcMain.removeHandler('cancel');ipcMain.handle('cancel',async(event,id)=>{const h=globalThis.facetingHarness;if(h.heldId===id)h.cancelSeen=true;return cancel(event,id);});
    });
    const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
    const settle=async()=>{await done();await page.keyboard.press('Escape');await page.evaluate(async()=>{document.activeElement?.blur?.();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await done();};
    const disclose=async id=>{if(!await page.locator('#'+id).evaluate(n=>n.open))await page.locator('#'+id+' > summary').click();};
    const inspector=async panel=>{if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();await page.locator(`[data-panel="${panel}"]`).click();};
    const controls=async()=>{await inspector('construct');await disclose('automatic-faceting-settings');};
    const bounds=async()=>{await controls();const details=page.locator('#automatic-faceting-settings > details');if(!await details.evaluate(n=>n.open))await details.locator(':scope > summary').click();};
    const save=async label=>{
      await settle();const file=path.join(folder,`${String(++serial).padStart(2,'0')}-${label}.polyproj`);
      await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
      await page.locator('#save').click();await page.waitForFunction(file=>window.facetingHarnessStatuses.includes('Saved '+file),file);await done();
      const bytes=await fs.readFile(file);files.push({file,sha256:hash(bytes)});return {file,project:JSON.parse(bytes)};
    };
    const open=async file=>{await settle();await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
      await page.locator('#open').click();await page.waitForFunction(file=>window.facetingHarnessStatuses.includes('Opened '+file),file);await settle();};
    const initial=(await save('startup')).project;
    const replace=async(label,source,extra=false)=>{
      const p=clone(initial);p.active=0;p.documents=[source,...extra?[tetra()]:[]].map((m,i)=>({...sourceDocument(m),id:'faceting-fixture-'+i}));
      const file=path.join(folder,label+'.polyproj'),bytes=Buffer.from(JSON.stringify(p));await fs.writeFile(file,bytes);files.push({file,sha256:hash(bytes)});
      await open(file);return save(label+'-native');
    };
    const ledger=()=>app.evaluate(()=>structuredClone(globalThis.facetingHarness.rows));
    const mark=()=>app.evaluate(()=>globalThis.facetingHarness.rows.length);
    const last=async(op,offset=0)=>{const rows=(await ledger()).slice(offset).filter(row=>row.request.op===op);assert.ok(rows.length,op+' was not actually requested');return rows.at(-1);};
    const sameOwnership=(before,after,{unit,notes,activeIndex}={})=>{
      assert.equal(after.documents.length,before.documents.length);assert.equal(after.active,activeIndex??before.active);
      for(let i=0;i<before.documents.length;i++){
        const a=after.documents[i],b=before.documents[i];assert.equal(a.id,b.id);assert.equal(a.cursor,b.cursor);assert.equal(a.states.length,b.states.length);
        sameJSON(a.operationHistory,b.operationHistory);for(let j=0;j<a.states.length;j++){
          sameJSON(a.states[j].model,b.states[j].model);assert.equal(a.states[j].notes,i===before.active&&notes!==undefined?notes:b.states[j].notes);
          assert.equal(a.states[j].view.coordinateUnit,i===before.active&&unit?unit:b.states[j].view.coordinateUnit);
        }
      }
    };
    const pool=async()=>{await bounds();await page.locator('#faceting-max_face_vertices').fill('2+2');
      await page.locator('#faceting-candidates').click();await page.waitForFunction(()=>/^complete:/.test(document.getElementById('faceting-candidate-summary').textContent));await done();
      const result=(await last('facet-candidates')).result;verifyPool(result,(await last('facet-candidates')).request.model);
      await page.locator('#faceting-source-faces').click();return result;};
    const search=async()=>{await controls();const offset=await mark();await page.locator('#faceting-search').click();
      await page.waitForFunction(()=>['complete','resource-limited'].includes(document.getElementById('faceting-status').dataset.status));await done();return (await last('facet-search',offset)).result;};
    const prepare=async(label,extra=false)=>{
      const before=await replace(label,cube(),extra);await bounds();
      await page.locator('#faceting-criterion').selectOption('closed');await page.locator('#faceting-equivalence').selectOption('labeled');
      for(const [key,value] of Object.entries({node_limit:'2^7',result_limit:'1+1',min_face_types:'1',max_face_types:'0',max_faces_per_plane:'0'}))await page.locator('#faceting-'+key).fill(value);
      await page.locator('#faceting-actions').fill('');await page.locator('#faceting-plane-counts').fill('');
      for(const id of ['partial','coplanar','invariant'])await page.locator('#faceting-'+id).uncheck();
      const catalogue=await pool();return {before,catalogue,source:active(before.project).model};
    };
    const arm=op=>app.evaluate((_electron,op)=>{Object.assign(globalThis.facetingHarness,{hold:true,holdOp:op,ready:false,release:null,cancelSeen:false});},op);
    const held=()=>app.evaluate(()=>new Promise((resolve,reject)=>{const stop=Date.now()+15000,t=setInterval(()=>{if(globalThis.facetingHarness.ready){clearInterval(t);resolve();}
      else if(Date.now()>stop){clearInterval(t);reject(Error('Actual native response did not reach hold.'));}},10);}));
    const release=()=>app.evaluate(()=>{if(typeof globalThis.facetingHarness.release!=='function')throw Error('No held native response.');globalThis.facetingHarness.release();});
    const toast=()=>page.waitForFunction(()=>!document.getElementById('toast').hidden&&/changed|source|units|cancel|abort|stale|integer|invalid|JSON/i.test(document.getElementById('toast').textContent));
    const clearToast=()=>page.evaluate(()=>document.getElementById('toast').hidden=true);

    group='cube-readonly';let fixture=await prepare('cube-readonly'),source=fixture.source;
    assert.equal((await page.locator('#faceting-pool').inputValue()).trim().split(/\s+/).length,6);
    sameOwnership(fixture.before.project,(await save('after-pool')).project);
    const cubeSearch=await search();verifySearch(cubeSearch,source.faces);
    assert.equal(await page.locator('#faceting-result option').count(),1);
    sameOwnership(fixture.before.project,(await save('after-search')).project);
    const offset=await mark();await controls();await page.locator('#faceting-preview').click();await done();
    await page.waitForFunction(()=>!document.getElementById('facet-preview').hidden&&document.querySelector('#facet-preview canvas')?.width>0);
    const preview=(await last('facet-adopt',offset)).result;verifyResult(preview,source,source.faces);
    assert.equal((await ledger()).slice(offset).filter(r=>r.request.op==='recipe-run').length,0);
    sameOwnership(fixture.before.project,(await save('after-preview')).project);await controls();
    await page.screenshot({path:path.join(folder,'cube-source-and-local-preview.png')});
    checks.push('Literal cube92 candidates/20 planes, explicit six-source-face exhausted pool and separate validated preview preserve complete source document, notes, units and mixed RGBA; preview does not call recipe-run');

    group='adopt-history';await controls();const n=await page.locator('#history-list button').count();await page.locator('#faceting-adopt').click();
    await page.waitForFunction(n=>document.getElementById('history-list').children.length===n+1,n);await done();
    const adopted=await save('cube-adopted'),result=active(adopted.project).model;verifyResult(result,source,source.faces);sameJSON(result,preview);
    assert.equal(active(adopted.project).notes,'Retain faceting source notes');assert.equal(active(adopted.project).view.coordinateUnit,'mm');
    sameJSON(doc(adopted.project).states[0].model,source);assert.equal(doc(adopted.project).operationHistory.nodes.at(-1).op,'facet-adopt');
    await page.locator('#undo').click();sameJSON(active((await save('cube-undo')).project).model,source);
    await page.locator('#redo').click();sameJSON(active((await save('cube-redo')).project).model,result);
    await open(adopted.file);sameJSON(active((await save('cube-reopened')).project).model,result);
    await inspector('construct');await disclose('history-settings');const tabs=await page.locator('#document-tabs > button').count();await page.locator('#history-replay').click();
    await page.waitForFunction(n=>document.getElementById('document-tabs').children.length===n+1,tabs);await done();
    const replayed=await save('cube-replayed');sameJSON(active(replayed.project).model,result);sameJSON(replayed.project.documents[0],adopted.project.documents[0]);
    checks.push('Explicit adoption matches native preview and records facet-adopt0.1; Undo/Redo/nativeSaveOpen/full-attributeReplay preserve ordered geometry, source receipt, RGBA, units and original document');

    group='original-parent-branch';
    const alternate=await page.evaluate(async({source,ids})=>window.polytope.engine({op:'facet-search',model:source,
      params:{max_face_vertices:4,candidate_ids:ids,node_limit:1024,result_limit:2}},'faceting-alternative-proof'),{source,ids:alternativeIds(fixture.catalogue,source)});
    verifySearch(alternate,tetraCompoundCycles(source));const params={search:alternate,result_id:alternate.results[0].id};
    await inspector('construct');await disclose('history-settings');assert.equal(await page.locator('#history-branch').isEnabled(),true);
    const count=await page.locator('#document-tabs > button').count();await page.locator('#history-branch').click();
    await page.locator('#history-parameters').fill(JSON.stringify(params));await page.locator('#history-parameters-apply').click();
    await page.waitForFunction(n=>document.getElementById('document-tabs').children.length===n+1,count);await done();
    const branched=await save('alternate-parent-branch');verifyResult(active(branched.project).model,source,tetraCompoundCycles(source));
    assert.deepEqual(counts(active(branched.project).model),[8,12,8,0]);assert.ok(active(branched.project).model.metadata.offColors.faces.every(c=>c===null));
    sameJSON(branched.project.documents[0],adopted.project.documents[0]);await page.screenshot({path:path.join(folder,'alternating-tetra-branch.png')});
    checks.push('Real parameter editor branches from original cube source to independent two-alternating-tetra8/12/8 incidence, keeps every original coordinate and assigns null to new-cycle colors; original adoption remains intact');

    group='tetra-readonly-adopt';const tetraStart=await replace('tetra-source',tetra()),tet=active(tetraStart.project).model;
    await pool();const tetraSearch=await search();verifySearch(tetraSearch,tet.faces);sameOwnership(tetraStart.project,(await save('tetra-readonly')).project);
    await controls();await page.locator('#faceting-adopt').click();await page.waitForFunction(()=>document.getElementById('history-list').children.length===2);await done();
    const tetraResult=active((await save('tetra-adopted')).project).model;verifyResult(tetraResult,tet,tet.faces);assert.deepEqual(counts(tetraResult),[4,6,4,0]);
    checks.push('Independent righttetra exact four-candidate/four-plane pool, source-preserving search and adoption4/6/4 retain source color and unit inheritance');

    group='empty-invalid-limited';fixture=await prepare('refusals');await bounds();await page.locator('#faceting-max_face_types').fill('5');
    let s=await search();assert.equal(s.status,'complete');assert.equal(s.results.length,0);
    assert.equal(await page.locator('#faceting-preview').isDisabled(),true);assert.equal(await page.locator('#faceting-adopt').isDisabled(),true);
    sameOwnership(fixture.before.project,(await save('empty-search')).project);
    await bounds();await page.locator('#faceting-max_face_types').fill('0');await page.locator('#faceting-node_limit').fill('1/2');await clearToast();
    const beforeInvalid=await mark();await page.locator('#faceting-search').click();await toast();await done();
    assert.equal((await ledger()).slice(beforeInvalid).filter(r=>r.request.op==='facet-search').length,0);
    sameOwnership(fixture.before.project,(await save('invalid-bound')).project);
    await bounds();await page.locator('#faceting-node_limit').fill('1');s=await search();verifySearch(s,fixture.source.faces,false);
    assert.equal(await page.locator('#faceting-adopt').isDisabled(),true);
    // Playwright disabled-state checks follow the enclosing label to its select.
    // Check each unsupported option's actual native state and attribute instead.
    for(const value of ['spiky','tidy-dual'])assert.equal(await page.locator('#faceting-criterion option[value="'+value+'"]').evaluate(option=>option.disabled&&option.hasAttribute('disabled')),true);
    sameOwnership(fixture.before.project,(await save('limited-search')).project);
    checks.push('Empty type-filtered results, fractional integer refusal and node-limited lower-bound searches cannot adopt or mutate a source; unsupported tidy-dual/spiky options remain unavailable');

    for(const mutation of ['unit','notes','document','criteria','cancel']){
      group='held-search-'+mutation;fixture=await prepare(group,mutation==='document');await clearToast();await controls();await arm('facet-search');
      await page.locator('#faceting-search').click();await held();
      const expected={};
      if(mutation==='unit'){await page.locator('#model-unit').selectOption('cm');expected.unit='cm';}
      else if(mutation==='notes'){await inspector('info');await page.locator('#notes').fill('User changed notes during actual native search');expected.notes='User changed notes during actual native search';}
      else if(mutation==='document'){await page.locator('#document-tabs > button').nth(1).click();expected.activeIndex=1;}
      else if(mutation==='criteria')await page.locator('#faceting-criterion').evaluate(n=>{n.value='isohedral';n.dispatchEvent(new Event('change',{bubbles:true}));});
      else await page.locator('#faceting-cancel').click();
      await release();await toast();await done();const after=await save(group+'-refused');sameOwnership(fixture.before.project,after.project,expected);
      await controls();assert.equal(await page.locator('#faceting-adopt').isDisabled(),true);
      if(mutation==='cancel')assert.equal(await app.evaluate(()=>globalThis.facetingHarness.cancelSeen),true);
      checks.push(`Held real native search rejects ${mutation} publication atomically; complete source/history/user changes preserved`);
    }

    group='held-adoption';fixture=await prepare(group);await search();await controls();await clearToast();await arm('recipe-run');
    await page.locator('#faceting-adopt').click();await held();await page.locator('#model-unit').selectOption('cm');await release();await toast();await done();
    sameOwnership(fixture.before.project,(await save('held-adoption-refused')).project,{unit:'cm'});
    checks.push('Actual completed recipe adoption is refused after changed source units; verified native output is not appended to current document/history');

    group='camera-allowed';fixture=await prepare(group);await controls();await arm('facet-search');await page.locator('#faceting-search').click();await held();
    await page.locator('#view-orientation').selectOption('x');await release();await done();
    await page.waitForFunction(()=>document.getElementById('faceting-status').dataset.status==='complete');
    sameOwnership(fixture.before.project,(await save('camera-allowed-readonly')).project);await controls();assert.equal(await page.locator('#faceting-adopt').isEnabled(),true);
    checks.push('Observer camera orientation is allowed while actual source-bound search awaits; it does not invalidate source mathematics or destroy the retained result');

    const requests=await ledger();await fs.writeFile(path.join(folder,'native-observed.json'),JSON.stringify(requests,null,2));
    for(const file of files)assert.equal(hash(await fs.readFile(file.file)),file.sha256);assert.deepEqual(errors,[]);
    const qualification={passed:true,packaged:Boolean(runtime.packaged),runtime:runtime.runtime,hidden:runtime.hidden,
      version:await app.evaluate(({app})=>app.getVersion()),checks,pageErrors:errors,files,
      evidenceScope:'actual mounted small declared pools; not FAC-wide completeness or installed Stella conformance',seconds:(performance.now()-started)/1000};
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(qualification,null,2));console.log('Automatic faceting GUI smoke PASS. Artifacts: '+folder);
  }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});
    await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,group,error:error.stack,checks,pageErrors:errors},null,2));
    console.error('Artifacts: '+folder);throw error;
  }finally{
    await app.evaluate(({ipcMain})=>{const h=globalThis.facetingHarness;if(h){h.release?.();ipcMain.removeHandler('engine');ipcMain.handle('engine',h.original);ipcMain.removeHandler('cancel');ipcMain.handle('cancel',h.cancel);delete globalThis.facetingHarness;}}).catch(()=>{});
    await app.evaluate(({app})=>app.exit(0)).catch(()=>{});
  }
}
if(require.main===module){(process.argv.includes('--self-test')?selfTest():main()).catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={cube,tetra,tetraCompoundCycles,verifyPool,verifySearch,verifyResult,native};
