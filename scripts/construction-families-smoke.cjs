// Actual .14 construction controls, native snapshots and independent incidence.
const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),packaged=process.env.POLYTOPE_TEST_EXECUTABLE;
const artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));
const doc=p=>p.documents[p.active],active=p=>doc(p).states[doc(p).cursor];
const geometry=m=>Object.fromEntries(['dimension','embeddingDimension','vertices','edges','faces','cells'].map(k=>[k,m[k]]));
const counts=m=>['vertices','edges','faces','cells'].map(k=>m[k].length);
const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
function verifyOcta(m){
  assert.deepEqual(counts(m),[6,12,8,0]);
  const opposite=new Set(['0,4','1,5','2,3']);
  for(let a=0;a<6;a++)for(let b=0;b<6;b++)near(dot(m.vertices[a],m.vertices[b]),a===b?1.5:opposite.has([a,b].sort((x,y)=>x-y).join(','))?-1.5:0);
  const edges=new Set(m.edges.map(e=>[...e].sort((a,b)=>a-b).join(',')));
  for(let a=0;a<6;a++)for(let b=a+1;b<6;b++)assert.equal(edges.has(`${a},${b}`),!opposite.has(`${a},${b}`));
  const faces=new Set(m.faces.map(f=>[...f].sort((a,b)=>a-b).join(',')));
  for(const a of [0,4])for(const b of [1,5])for(const c of [2,3])assert.ok(faces.has([a,b,c].sort((x,y)=>x-y).join(',')));
}
function verifyTesseract(m){
  assert.deepEqual(counts(m),[16,32,24,8]);
  assert.equal(new Set(m.vertices.map(p=>p.join(','))).size,16);
  for(const p of m.vertices)for(const x of p)near(Math.abs(x),1);
  for(const [a,b] of m.edges)assert.equal(m.vertices[a].filter((x,i)=>x!==m.vertices[b][i]).length,1);
  const fixed=ids=>[0,1,2,3].filter(axis=>ids.every(v=>m.vertices[v][axis]===m.vertices[ids[0]][axis]));
  for(const f of m.faces){assert.equal(f.length,4);assert.equal(fixed(f).length,2);}
  const planes=[];for(const c of m.cells){assert.equal(c.length,6);const ids=[...new Set(c.flatMap(f=>m.faces[f]))];assert.equal(ids.length,8);const axis=fixed(ids);assert.equal(axis.length,1);planes.push(axis[0]+':'+m.vertices[ids[0]][axis[0]]);}
  assert.equal(new Set(planes).size,8);
}
function verifyOwnerMaps(m,vertexBlocks){
  assert.deepEqual(m.components.map(c=>c.maps.vertices),vertexBlocks.map(v=>v.sort((a,b)=>a-b)));
  for(const c of m.components){const vertices=new Set(c.maps.vertices),faces=new Set(c.maps.faces);
    assert.deepEqual(c.maps.edges,m.edges.flatMap((e,i)=>e.every(v=>vertices.has(v))?[i]:[]));
    assert.deepEqual(c.maps.faces,m.faces.flatMap((f,i)=>f.every(v=>vertices.has(v))?[i]:[]));
    assert.deepEqual(c.maps.cells,m.cells.flatMap((cell,i)=>cell.every(f=>faces.has(f))?[i]:[]));
    let source=m;for(const i of c.sourcePath)source=source.metadata.compound.sourceModels[i];
    assert.equal(source.id,c.sourceModelId);assert.equal(source.fingerprint,c.sourceFingerprint);
    assert.equal(source.dimension,m.dimension);assert.deepEqual(source.vertices,c.maps.vertices.map(v=>m.vertices[v]));
  }
}
function verifyStep(m,n,step){
  assert.deepEqual(m.metadata.stepPrism.selectedFactorVertexIds,Array.from({length:n},(_,i)=>[i,((step*i)%n+n)%n]));
  assert.deepEqual(m.metadata.stepPrism.sourceVertices,m.vertices);assert.equal(m.interpretation,'convex-polytope');
  const facetSets=new Set(m.cells.map(c=>[...new Set(c.flatMap(f=>m.faces[f]))].sort((a,b)=>a-b).join(',')));
  if(n===5){
    assert.deepEqual(counts(m),[5,10,10,5]);
    for(let a=0;a<5;a++)for(let b=0;b<5;b++)near(dot(m.vertices[a],m.vertices[b]),a===b?2:-.5);
    for(let omit=0;omit<5;omit++)assert.ok(facetSets.has(Array.from({length:5},(_,i)=>i).filter(i=>i!==omit).join(',')));
  }else if(n===8){
    assert.deepEqual(counts(m),[8,24,32,16]);
    for(let a=0;a<8;a++)for(let b=0;b<8;b++)near(dot(m.vertices[a],m.vertices[b]),a===b?2:b===(a+4)%8?-2:0);
    for(let a=0;a<8;a++)for(let b=a+1;b<8;b++)for(let c=b+1;c<8;c++)for(let d=c+1;d<8;d++){
      const vertices=[a,b,c,d];if(vertices.every(v=>!vertices.includes((v+4)%8)))assert.ok(facetSets.has(vertices.join(',')));
    }
  }else{
    assert.deepEqual(counts(m),[6,15,18,9]);
    for(let a=0;a<4;a++)for(let b=0;b<4;b++)near(m.vertices.reduce((sum,p)=>sum+p[a]*p[b],0),a===b?3:0);
    for(const a of [0,2,4])for(const b of [1,3,5])assert.ok(facetSets.has([0,1,2,3,4,5].filter(v=>v!==a&&v!==b).join(',')));
  }
}

async function main(){
  const started=performance.now();await fs.mkdir(artifacts,{recursive:true});
  const folder=await fs.mkdtemp(path.join(artifacts,packaged?'construction-families-packaged-smoke-':'construction-families-smoke-')),profile=path.join(folder,'profile');
  await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  if(packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);const checks=[],errors=[],fixtures=[];let serial=0;
  page.on('pageerror',e=>errors.push(e.message));
  const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
  const disclose=async id=>{if(!await page.locator('#'+id).evaluate(n=>n.open))await page.locator('#'+id+' > summary').click();};
  const construct=async id=>{if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();if(id)await disclose(id);};
  const save=async label=>{await done();const file=path.join(folder,`${String(++serial).padStart(2,'0')}-${label}.polyproj`);await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);return {file,project:JSON.parse(await fs.readFile(file,'utf8'))};};
  const open=async file=>{await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#open').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Opened '+file,file);await done();};
  const newDoc=async callback=>{const n=await page.locator('#document-tabs > button').count();await callback();await page.waitForFunction(n=>document.getElementById('document-tabs').children.length===n+1,n);await done();};
  const replay=async()=>{await construct('history-settings');await newDoc(()=>page.locator('#history-replay').click());};
  const anti=async(symbol,{four=false,radius='1',base='radius',elevation='equal-triangle',value='1',interval='2'}={})=>{
    await construct('antiprism-settings');await page.locator('#antiprism-symbol').fill(symbol);await page.locator('#antiprism-base-sizing').selectOption(base);await page.locator('#antiprism-base-size').fill(radius);
    await page.locator('#antiprism-elevation').selectOption(elevation);if(elevation!=='equal-triangle')await page.locator('#antiprism-elevation-value').fill(value);
    await page.locator('#antiduoprism-height').fill(interval);await newDoc(()=>page.locator(four?'#generate-antiduoprism':'#generate-antiprism').click());
  };
  const step=async(n,k)=>{await construct('step-prism-settings');await page.locator('#step-prism-n').fill(String(n));await page.locator('#step-prism-step').fill(String(k));await page.locator('#step-prism-radius').fill('sqrt(1)');await newDoc(()=>page.locator('#generate-step-prism').click());};
  const fixture=async(label,project)=>{const file=path.join(folder,label+'.polyproj');const bytes=Buffer.from(JSON.stringify(project));await fs.writeFile(file,bytes);fixtures.push({file,sha256:hash(bytes)});return file;};
  try{
    await page.waitForFunction(()=>document.getElementById('step-prism-settings')&&document.getElementById('antiprism-settings')&&document.getElementById('model-name').textContent==='Tesseract');await done();
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()).setContentSize(1484,900));
    const initial=(await save('initial-source')).project;
    await anti('3',{radius:'sqrt(1)'});const octa=(await save('triangular-antiprism')).project,m=active(octa).model;
    verifyOcta(m);assert.equal(m.interpretation,'convex-polytope');near(m.measure.content,Math.sqrt(6));assert.equal(m.components.length,1);
    assert.deepEqual(geometry(initial.documents[0].states[0].model),geometry(octa.documents[0].states[0].model));
    await page.screenshot({path:path.join(folder,'ordinary-triangular-antiprism.png')});
    checks.push('actual expression-sized triangular antiprism matches full octahedron Gram/incidence, convex volume and preserves initial source');

    const stars=[];for(const [symbol,phase,height,cycle] of [['5/2',2*Math.PI/5,Math.pow(5,.25),[0,2,4,1,3]],['5/3',3*Math.PI/5,1,[0,3,1,4,2]],['5/-2',-2*Math.PI/5,Math.pow(5,.25),[0,3,1,4,2]]]){
      await anti(symbol);const saved=await save('raw-phase-'+symbol.replace('/','-')),model=active(saved.project).model,info=model.metadata.rationalAntiprism;
      assert.deepEqual(counts(model),[10,20,12,0]);near(info.upperRotationRadians,phase);near(info.height,height);
      assert.deepEqual(info.orderedSourceCycles,[cycle]);assert.equal(info.sourceModel.metadata.regularStarPolygon.symbol,symbol);
      near(model.vertices[5][0],Math.cos(phase));near(model.vertices[5][1],Math.sin(phase));
      assert.equal(model.interpretation,'generalized-complex');assert.ok(!model.measure);stars.push(model);
    }
    assert.notDeepEqual(stars[0].vertices,stars[1].vertices);assert.notDeepEqual(stars[1].vertices,stars[2].vertices);
    await page.screenshot({path:path.join(folder,'signed-raw-star-antiprism.png')});
    checks.push('actual5/2,5/3 and5/-2 preserve unreduced signed source cycles and distinct raw half-step phases without solid measure');

    await anti('6/2');const original=await save('disconnected-antiprism'),colored=structuredClone(original.project),source=active(colored);
    source.model.metadata.offColors={faces:Array(16).fill(null),cells:[]};source.model.metadata.offColors.faces[0]={encoding:'byte',values:[7,70,240,128]};source.model.metadata.offColors.faces[15]={encoding:'unit',values:[.2,.3,.5,.25]};source.view.coordinateUnit='mm';
    const coloredFile=await fixture('colored-disconnected-antiprism-input',colored);await open(coloredFile);await construct('antiprism-settings');
    const originalModel=source.model;verifyOwnerMaps(originalModel,[[0,2,4,6,8,10],[1,3,5,7,9,11]]);const first=originalModel.components[0].id,second=originalModel.components[1].id;
    await page.locator('#compound-component').selectOption(first);await page.locator('#compound-extract').click();await done();const kept=active((await save('kept-antiprism')).project);
    assert.deepEqual(counts(kept.model),[6,12,8,0]);assert.deepEqual(kept.model.vertices,originalModel.components[0].maps.vertices.map(v=>originalModel.vertices[v]));assert.equal(kept.view.coordinateUnit,'mm');assert.deepEqual(kept.model.metadata.offColors.faces[0],source.model.metadata.offColors.faces[0]);
    await page.locator('#undo').click();await done();assert.deepEqual(geometry(active((await save('keep-undo')).project).model),geometry(originalModel));
    await page.locator('#redo').click();await done();assert.deepEqual(geometry(active((await save('keep-redo')).project).model),geometry(kept.model));
    await page.locator('#undo').click();await done();await construct('antiprism-settings');await page.locator('#compound-component').selectOption(first);await page.locator('#compound-drop').click();await done();
    const dropped=await save('deleted-antiprism'),dropModel=active(dropped.project).model;assert.deepEqual(counts(dropModel),[6,12,8,0]);assert.equal(dropModel.components[0].id,second);
    await replay();assert.deepEqual(geometry(active((await save('delete-replayed')).project).model),geometry(dropModel));
    await open(dropped.file);const reopened=active((await save('delete-reopened')).project);assert.equal(reopened.model.components[0].id,second);assert.equal(reopened.view.coordinateUnit,'mm');
    assert.deepEqual(reopened.model.metadata.compound.sourceModels,dropModel.metadata.compound.sourceModels);
    checks.push('actual6/2 antiprism has genuine interleaved dimensional leaves, currentRGBA, Keep/Delete, undo/redo, replay and native reopen');

    await anti('6/2',{four:true,interval:'sqrt(4)'});const four=await save('disconnected-antiduoprism'),fourModel=active(four.project).model;
    assert.deepEqual(counts(fourModel),[24,60,56,20]);assert.equal(fourModel.interpretation,'generalized-complex');assert.ok(!fourModel.measure);
    verifyOwnerMaps(fourModel,[0,1].map(parity=>[0,1].flatMap(layer=>[0,1].flatMap(ring=>[parity,parity+2,parity+4].map(v=>v+ring*6+layer*12)))));
    assert.equal(fourModel.metadata.polyhedronPrism.sourceModel.metadata.rationalAntiprism.symbol,'6/2');
    await page.screenshot({path:path.join(folder,'disconnected-four-dimensional-antiduoprism.png')});
    await construct('antiprism-settings');await page.locator('#compound-component').selectOption(fourModel.components[0].id);await page.locator('#compound-drop').click();await done();assert.deepEqual(counts(active((await save('four-leaf-delete')).project).model),[12,30,28,10]);
    await page.locator('#undo').click();await done();assert.deepEqual(geometry(active((await save('four-delete-undo')).project).model),geometry(fourModel));
    checks.push('actual6/2 antiprism×interval has24/60/56/20, preserved source definition and full4D leaf Delete/undo');

    await page.locator('#search').fill('Cube');await page.locator('[data-key="cube"]').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');await done();
    const cubeSaved=await save('cube-source'),cubeProject=structuredClone(cubeSaved.project),cubeState=active(cubeProject),cube=cubeState.model;
    cube.metadata.offColors={faces:[{encoding:'byte',values:[7,70,240,128]},null,null,null,null,{encoding:'unit',values:[.2,.3,.5,.25]}],cells:[]};cubeState.view.coordinateUnit='mm';cubeState.view.entity=2;
    const cubeFile=await fixture('colored-cube-input',cubeProject);await open(cubeFile);await construct('antiprism-settings');assert.equal(await page.locator('#make-polyhedron-prism').isEnabled(),true);
    await page.locator('#polyhedron-prism-height').fill('sqrt(4)');await page.locator('#make-polyhedron-prism').click();await done();const prism=await save('cube-interval'),prismState=active(prism.project),prismModel=prismState.model;
    verifyTesseract(prismModel);assert.equal(prismModel.interpretation,'convex-polytope');near(prismModel.measure.content,16);
    assert.deepEqual(prismModel.vertices,cube.vertices.map(p=>[...p,-1]).concat(cube.vertices.map(p=>[...p,1])));assert.deepEqual(prismModel.metadata.polyhedronPrism.sourceModel,cube);
    assert.deepEqual(prismModel.metadata.offColors.faces,[...cube.metadata.offColors.faces,...cube.metadata.offColors.faces,...Array(12).fill(null)]);assert.equal(prismState.view.coordinateUnit,'mm');assert.deepEqual(prismState.view.sectionNormal,[0,0,0,1]);assert.equal(prismState.view.entity,0);
    assert.equal(doc(prism.project).operationHistory.nodes.at(-1).op,'polyhedron-prism');
    await page.screenshot({path:path.join(folder,'cube-interval-tesseract.png')});await replay();assert.deepEqual(geometry(active((await save('cube-interval-replay')).project).model),geometry(prismModel));
    await construct('history-settings');await page.locator('#history-branch').click();await page.locator('#history-parameters').fill('{"height":6}');await newDoc(()=>page.locator('#history-parameters-apply').click());const branch=active((await save('cube-height-branch')).project).model;assert.deepEqual([...new Set(branch.vertices.map(p=>p[3]))].sort((a,b)=>a-b),[-3,3]);assert.deepEqual(branch.vertices.slice(0,8),cube.vertices.map(p=>[...p,-3]));
    checks.push('actual current cube×interval preserves exact tesseract incidence, sourceRGBA/units, dimension reset, native replay and height branch');

    await construct('product-settings');await page.locator('#product-left-symbol').fill('6/2');await page.locator('#product-right-symbol').fill('3');await page.locator('#product-left-radius').fill('1');await page.locator('#product-right-radius').fill('1');await newDoc(()=>page.locator('#generate-polygon-product').click());
    const cartesian=await save('recoverable-polygon-product'),cartesianModel=active(cartesian.project).model;
    assert.deepEqual(counts(cartesianModel),[18,36,30,12]);
    verifyOwnerMaps(cartesianModel,[0,1].map(parity=>[parity,parity+2,parity+4].flatMap(a=>[0,1,2].map(b=>a*3+b))));
    const factorSnapshots=structuredClone(cartesianModel.metadata.orderedProduct.sourceModels);assert.equal(cartesianModel.metadata.orderedProduct.recoverableCompoundComponents,true);
    await page.locator('#compound-component').selectOption(cartesianModel.components[0].id);await page.locator('#compound-drop').click();await done();const productDropped=active((await save('polygon-product-leaf-delete')).project).model;
    assert.deepEqual(counts(productDropped),[9,18,15,6]);assert.deepEqual(productDropped.metadata.orderedProduct.sourceModels,factorSnapshots);
    await replay();assert.deepEqual(geometry(active((await save('polygon-product-delete-replay')).project).model),geometry(productDropped));
    checks.push('actual6/2×3 polygon product preserves original interleaved IDs and factor snapshots with genuine full4D leaf Delete/replay');

    for(const [n,k] of [[5,2],[8,3],[6,2]]){await step(n,k);const made=await save(`step-${n}-${k}`);verifyStep(active(made.project).model,n,k);await open(made.file);assert.deepEqual(geometry(active((await save(`step-${n}-${k}-reopened`)).project).model),geometry(active(made.project).model));}
    await page.screenshot({path:path.join(folder,'noncoprime-step-prism.png')});
    checks.push('actualstep5/2simplex,8/3crosspolytope and noncoprime6/2 retain independently checked Gram/facets, original IDs and native persistence');

    const before=(await save('before-rank-refusal')).project;await construct('step-prism-settings');await page.locator('#step-prism-step').fill('3');await page.locator('#generate-step-prism').click();await page.waitForFunction(()=>!document.getElementById('toast').hidden&&document.getElementById('toast').textContent.includes('dimension 3'));await done();const refused=(await save('rank-refused')).project;
    assert.equal(refused.documents.length,before.documents.length);assert.equal(doc(refused).states.length,doc(before).states.length);assert.deepEqual(geometry(active(refused).model),geometry(active(before).model));
    await construct('antiprism-settings');await page.locator('#antiprism-symbol').fill('3');await page.locator('#antiprism-elevation').selectOption('side-edge');await page.locator('#antiprism-elevation-value').fill('1');await page.locator('#generate-antiprism').click();await page.waitForFunction(()=>!document.getElementById('toast').hidden&&document.getElementById('toast').textContent.includes('no real positive'));await done();
    const flat=(await save('flat-side-refused')).project;assert.equal(flat.documents.length,before.documents.length);assert.deepEqual(geometry(active(flat).model),geometry(active(before).model));
    await anti('3',{base:'base-edge',radius:'sqrt(3)',elevation:'height',value:'sqrt(2)'});verifyOcta(active((await save('sizing-recovered')).project).model);
    checks.push('native rank and impossible-side refusals are atomic; explicit base-edge/height sizing recovers the exact octahedron');

    for(const f of fixtures)assert.equal(hash(await fs.readFile(f.file)),f.sha256);assert.deepEqual(errors,[]);
    const result={passed:true,packaged:Boolean(packaged),developmentPythonUnavailable:Boolean(packaged),version:await app.evaluate(({app})=>app.getVersion()),checks,pageErrors:errors,nativeSnapshots:serial,fixtures,seconds:(performance.now()-started)/1000};
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));console.log(`Construction families ${packaged?'packaged ':''}smoke passed: ${checks.length} groups. Artifacts: ${folder}`);
  }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors},null,2));console.error('Artifacts:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
