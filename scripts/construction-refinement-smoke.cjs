// Actual Construct UI, isolated profiles and authoritative native project snapshots.
const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));
const packaged=process.env.POLYTOPE_TEST_EXECUTABLE;
const currentDoc=project=>project.documents[project.active];
const active=project=>{const doc=currentDoc(project);return doc.states[doc.cursor];};
const geometry=model=>Object.fromEntries(['dimension','embeddingDimension','vertices','edges','faces','cells'].map(key=>[key,model[key]]));
const counts=model=>['vertices','edges','faces','cells'].map(key=>model[key].length);
const near=(a,b,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function canonical(face){const reverse=[...face].reverse(),cycles=[];for(const list of [face,reverse])for(let i=0;i<list.length;i++)cycles.push([...list.slice(i),...list.slice(0,i)].join(','));return cycles.sort()[0];}
function metricIncidenceMap(source,target,n){
  const p=source.vertices,q=target.vertices,distances=points=>points.map(a=>points.map(b=>Math.hypot(...a.map((x,i)=>x-b[i]))));
  const dp=distances(p),dq=distances(q),anchors=[n,n+1,n+2,0],bottom=target.faces.find(face=>face.length===2*n),top=q.map((_,i)=>i).filter(i=>!bottom.includes(i));
  for(let start=0;start<2*n;start++)for(const step of [-1,1])for(const t of top){
    const candidates=[0,1,2].map(i=>bottom[(start+step*i+2*n)%(2*n)]).concat(t);
    const mapping=p.map((_,v)=>q.findIndex((_,u)=>anchors.every((a,k)=>Math.abs(dp[v][a]-dq[u][candidates[k]])<1e-8)));
    if(mapping.some(i=>i<0)||new Set(mapping).size!==p.length)continue;
    if(dp.some((row,i)=>row.some((d,j)=>Math.abs(d-dq[mapping[i]][mapping[j]])>1e-8)))continue;
    const mappedEdges=source.edges.map(e=>e.map(v=>mapping[v]).sort((a,b)=>a-b).join(',')).sort(),referenceEdges=target.edges.map(e=>[...e].sort((a,b)=>a-b).join(',')).sort();
    const mappedFaces=source.faces.map(f=>canonical(f.map(v=>mapping[v]))).sort(),referenceFaces=target.faces.map(canonical).sort();
    if(JSON.stringify(mappedEdges)===JSON.stringify(referenceEdges)&&JSON.stringify(mappedFaces)===JSON.stringify(referenceFaces))return mapping;
  }
  throw new Error(`Generated ${n}-cupola lacks a complete metric/incidence match with attributed J${n}.`);
}
function reversedCube(){
  const vertices=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
  const edges=[...new Set(faces.flatMap(f=>f.map((a,i)=>[a,f[(i+1)%f.length]].sort((a,b)=>a-b).join(','))))].map(key=>key.split(',').map(Number));
  return {id:'literal-reversed-edge-cube',name:'Reversed edge cube',dimension:3,embeddingDimension:3,interpretation:'generalized-complex',
    vertices,faces,edges:[[1,0],...edges.filter(([a,b])=>!(a===0&&b===1))],cells:[],numeric:{certified:false,mode:'float64-approximate',tolerance:1e-8},
    metadata:{fixture:'Independent unit cube with first stored edge reversed',offColors:{faces:Array.from({length:6},()=>({encoding:'unit',values:[.3,.6,.8,.4]})),cells:[]}}};
}
async function main(){
  const started=performance.now();await fs.mkdir(artifacts,{recursive:true});
  const folder=await fs.mkdtemp(path.join(artifacts,packaged?'construction-refinement-packaged-smoke-':'construction-refinement-smoke-'));
  const profile=path.join(folder,'profile');await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const fixture=reversedCube(),fixturePath=path.join(folder,'reversed-edge-cube.json');await fs.writeFile(fixturePath,JSON.stringify(fixture));const originalHash=hash(await fs.readFile(fixturePath));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  if(packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);const errors=[],checks=[];let saveNumber=0;
  page.on('pageerror',error=>errors.push(error.message));
  const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
  const disclose=async id=>{if(!await page.locator('#'+id).evaluate(node=>node.open))await page.locator('#'+id+' > summary').click();};
  const construct=async id=>{if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();if(id)await disclose(id);};
  const save=async label=>{
    await done();const file=path.join(folder,`${String(++saveNumber).padStart(2,'0')}-${label}.polyproj`);
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
    await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);
    return {file,project:JSON.parse(await fs.readFile(file,'utf8'))};
  };
  const open=async file=>{await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#open').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Opened '+file,file);await done();};
  const catalog=async(key,search,name)=>{await page.locator('#search').fill(search);await page.locator(`[data-key="${key}"]`).click();await page.waitForFunction(name=>document.getElementById('model-name').textContent===name,name);await done();};
  const replay=async()=>{await disclose('history-settings');const count=await page.locator('#document-tabs > button').count();await page.locator('#history-replay').click();await page.waitForFunction(count=>document.getElementById('document-tabs').children.length===count+1,count);await done();};
  const refine=async(divisions,ids='')=>{await construct('subdivision-settings');await page.locator('#edge-divisions').fill(String(divisions));await page.locator('#subdivision-edge-ids').fill(ids);await page.locator('#subdivide-edges').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent.startsWith('Edge subdivision of '));await done();};
  const generate=async(n,edge='1',height='')=>{await construct('cupola-settings');await page.locator('#cupola-n').fill(String(n));await page.locator('#cupola-edge-length').fill(edge);await page.locator('#cupola-height').fill(height);const count=await page.locator('#document-tabs > button').count();await page.locator('#generate-cupola').click();await page.waitForFunction(count=>document.getElementById('document-tabs').children.length===count+1,count);await done();};
  try{
    await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract'&&document.getElementById('cupola-settings'));await done();
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>!window.isDestroyed()).setContentSize(1484,900));
    await catalog('cube','Cube','Cube');const original=(await save('cube-original')).project,source=active(original).model;
    await refine(2);const refined=await save('cube-subdivided'),refinedModel=active(refined.project).model;
    assert.deepEqual(counts(refinedModel),[20,24,6,0]);assert.deepEqual(refinedModel.vertices.slice(0,8),source.vertices);
    assert.deepEqual(refinedModel.vertices.slice(8),source.edges.map(([a,b])=>source.vertices[a].map((x,i)=>(x+source.vertices[b][i])/2)));
    assert.ok(refinedModel.faces.every(f=>f.length===8));assert.deepEqual(refinedModel.faces.map(f=>f.filter(v=>v<8)),source.faces);
    assert.deepEqual(geometry(refinedModel.metadata.edgeSubdivision.sourceModel),geometry(source));
    const refinedDoc=currentDoc(refined.project),node=refinedDoc.operationHistory.nodes.find(n=>n.id===active(refined.project).operationNode);
    assert.equal(node.op,'subdivide-edges');assert.equal(node.params.divisions,2);
    await page.locator('#undo').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');await done();assert.deepEqual(geometry(active((await save('cube-undone')).project).model),geometry(source));
    await page.locator('#redo').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent.startsWith('Edge subdivision'));await done();
    await replay();assert.deepEqual(geometry(active((await save('cube-replayed')).project).model),geometry(refinedModel));
    checks.push('native cube midpoint subdivision20/24/6, literal source/cycle lineage, undo/redo and verified operation replay');

    await page.locator('#document-tabs > button').nth(refined.project.active).click();await done();await disclose('history-settings');assert.ok(await page.locator('#history-branch').isEnabled());
    await page.locator('#history-branch').click();await page.locator('#history-parameters').fill(JSON.stringify({divisions:3}));await page.locator('#history-parameters-apply').click();await page.waitForFunction(()=>!document.getElementById('history-parameters-dialog').open);await done();
    const branch=await save('cube-three-segment-branch'),branchModel=active(branch.project).model;
    assert.deepEqual(counts(branchModel),[32,36,6,0]);assert.ok(branchModel.faces.every(f=>f.length===12));assert.deepEqual(branchModel.vertices.slice(0,8),source.vertices);
    assert.deepEqual(branch.project.documents[refined.project.active].states.map(s=>geometry(s.model)),refinedDoc.states.map(s=>geometry(s.model)));
    await open(branch.file);const restored=(await save('cube-branch-restored')).project;assert.deepEqual(geometry(active(restored).model),geometry(branchModel));assert.deepEqual(currentDoc(restored).operationHistory,currentDoc(branch.project).operationHistory);
    checks.push('three-segment parameter branch from original cube, unchanged earlier graph and native save/reopen');

    await open(fixturePath);await refine(3,'0');const selected=active((await save('reversed-selected-edge')).project).model;
    assert.deepEqual(counts(selected),[10,14,6,0]);assert.deepEqual(selected.vertices.slice(0,8),fixture.vertices);
    near(selected.vertices[8][0],2/3);near(selected.vertices[9][0],1/3);
    assert.deepEqual(selected.metadata.edgeSubdivision.edgeChains[0],[1,8,9,0]);
    assert.deepEqual(selected.faces[0],[0,3,2,1,8,9]);assert.deepEqual(selected.faces[2],[0,9,8,1,5,4]);
    assert.deepEqual(selected.metadata.offColors,fixture.metadata.offColors);assert.deepEqual(selected.metadata.edgeSubdivision.selectedEdgeIds,[0]);
    await replay();assert.deepEqual(geometry(active((await save('reversed-selected-replayed')).project).model),geometry(selected));
    checks.push('reversed stored edge selected by ID gives consistent opposite face insertion and unchanged source RGBA');

    await catalog('tesseract','Tesseract','Tesseract');await page.locator('#projection').selectOption('perspective');
    const fourSource=active((await save('tesseract-perspective-source')).project).model;await refine(2);const four=await save('tesseract-refined-perspective'),fourState=active(four.project);
    assert.deepEqual(counts(fourState.model),[48,64,24,8]);assert.deepEqual(fourState.model.cells,fourSource.cells);assert.deepEqual(fourState.model.vertices.slice(0,16),fourSource.vertices);assert.ok(fourState.model.faces.every(f=>f.length===8));
    assert.deepEqual(fourState.model.vertices.slice(16),fourSource.edges.map(([a,b])=>fourSource.vertices[a].map((x,i)=>(x+fourSource.vertices[b][i])/2)));
    assert.equal(fourState.view.projection,'perspective');assert.equal(await page.locator('#projection').inputValue(),'perspective');assert.ok(await page.locator('#projection').isVisible());
    const pixels=await page.locator('#base-canvas canvas').evaluate(canvas=>({width:canvas.width,height:canvas.height}));assert.ok(pixels.width>100&&pixels.height>100);
    await page.screenshot({path:path.join(folder,'tesseract-subdivided-perspective.png')});await replay();assert.deepEqual(geometry(active((await save('tesseract-replayed')).project).model),geometry(fourState.model));
    await open(four.file);assert.deepEqual(geometry(active((await save('tesseract-restored')).project).model),geometry(fourState.model));assert.equal(await page.locator('#projection').inputValue(),'perspective');
    checks.push('full4D tesseract48/64/24/8 with original cells, visible perspective projection, replay and native persistence');

    for(const n of [3,4,5]){
      await catalog(`antiprism-j${n}`,`J${n}`,{3:'triangular cupola',4:'square cupola',5:'pentagonal cupola'}[n]);const catalogProject=(await save(`johnson-j${n}-reference`)).project,reference=active(catalogProject).model;
      assert.equal(reference.metadata.key,`antiprism-j${n}`);const manifest=JSON.parse(await fs.readFile(path.join(root,'engine','catalog_data','antiprism','manifest.json'),'utf8')),entry=manifest.entries.find(e=>e.id===`J${n}`);
      assert.equal(reference.provenance.catalogSource.sha256,entry.sha256);assert.equal(hash(await fs.readFile(path.join(root,'engine','catalog_data','antiprism',entry.file))),entry.sha256);
      await generate(n);const result=await save(`regular-${n}-cupola`),state=active(result.project);assert.deepEqual(counts(state.model),[3*n,5*n,2*n+2,0]);metricIncidenceMap(state.model,reference,n);
      assert.deepEqual(geometry(active(catalogProject).model),geometry(result.project.documents[catalogProject.active].states[catalogProject.documents[catalogProject.active].cursor].model));
      assert.equal(state.model.metadata.cupola.heightMode,'regular-faces');assert.ok(state.model.validation.passed);assert.ok(!state.model.numeric.certified);
      for(const [a,b] of state.model.edges)near(Math.hypot(...state.model.vertices[a].map((x,i)=>x-state.model.vertices[b][i])),1);
      if(n===5)await page.screenshot({path:path.join(folder,'regular-five-cupola.png')});
      await open(result.file);assert.deepEqual(geometry(active((await save(`regular-${n}-cupola-restored`)).project).model),geometry(state.model));
    }
    checks.push('regular3/4/5 cupola native construction matches hash-verified J3/J4/J5 complete metrics/incidence and persists without changing reference documents');

    await construct('cupola-settings');const before=(await save('before-impossible-default')).project;await page.locator('#cupola-n').fill('6');await page.locator('#cupola-height').fill('');await page.locator('#generate-cupola').click();
    await page.waitForFunction(()=>!document.getElementById('toast').hidden&&document.getElementById('toast').textContent.includes('explicit positive cupola height'));const rejected=(await save('impossible-default-rejected')).project;
    assert.equal(rejected.documents.length,before.documents.length);assert.deepEqual(geometry(active(rejected).model),geometry(active(before).model));
    await generate(6,'sqrt(4)/2','sqrt(1)');const explicit=await save('explicit-six-cupola'),six=active(explicit.project).model;assert.deepEqual(counts(six),[18,30,14,0]);
    assert.equal(six.metadata.cupola.heightMode,'explicit');assert.equal(six.metadata.cupola.height,1);assert.equal(six.metadata.cupola.ringEdgeLength,1);assert.equal(six.metadata.cupola.regularFacesWithinFloatTolerance,false);
    for(const f of six.metadata.cupola.faceRoles.rectangles){const p=six.faces[f].map(v=>six.vertices[v]),u=p[1].map((x,i)=>x-p[0][i]),v=p[2].map((x,i)=>x-p[1][i]);near(u.reduce((sum,x,i)=>sum+x*v[i],0),0);near(Math.hypot(...v),1);assert.ok(Math.abs(Math.hypot(...u)-1)>0.1);}
    await page.screenshot({path:path.join(folder,'explicit-six-cupola.png')});await open(explicit.file);assert.deepEqual(geometry(active((await save('explicit-six-cupola-restored')).project).model),geometry(six));
    await refine(2);const sixRefined=active((await save('explicit-six-cupola-refined')).project).model;assert.deepEqual(counts(sixRefined),[48,60,14,0]);assert.deepEqual(sixRefined.vertices.slice(0,18),six.vertices);await replay();assert.deepEqual(geometry(active((await save('explicit-six-cupola-refinement-replayed')).project).model),geometry(sixRefined));
    checks.push('six-cupola blank-height refusal is atomic; expression-evaluated explicitheight1 retains unequal rectangles through persistence and refinement/replay');
    assert.equal(hash(await fs.readFile(fixturePath)),originalHash);assert.deepEqual(errors,[]);
    const result={passed:true,packaged:Boolean(packaged),developmentPythonUnavailable:Boolean(packaged),version:await app.evaluate(({app})=>app.getVersion()),seconds:(performance.now()-started)/1000,checks,pageErrors:errors,fixtureDirectory:folder,nativeSnapshots:saveNumber,originalFixtureSha256:originalHash};
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));console.log(`Construction/refinement ${packaged?'packaged ':''}smoke passed: ${checks.length} checks. Artifacts: ${folder}`);
  }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors},null,2));console.error('Artifacts:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
