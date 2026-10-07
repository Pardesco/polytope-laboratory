// Cell0.2 attribute qualification. Self-tests are headless; root owns GUI runs.
// Promotion is a new source document, not a recorded cell recipe operation.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),root=path.resolve(__dirname,'..'),clone=x=>structuredClone(x);
const hash=x=>createHash('sha256').update(x).digest('hex');
const {signature}=require('./source-zonohedron-smoke.cjs');
const doc=p=>p.documents[p.active],active=p=>doc(p).states[doc(p).cursor];
const counts=m=>['vertices','edges','faces','cells'].map(k=>m[k].length),ids=a=>[...a].sort((a,b)=>a-b).join(',');
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(b)),`${a} != ${b}`);
function tesseract(){
  const vertices=[];for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])for(const w of [-1,1])vertices.push([x,y,z,w]);
  const lookup=new Map(vertices.map((p,i)=>[p.join(','),i])),faces=[];
  for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){
    const fixed=[0,1,2,3].filter(i=>i!==a&&i!==b);
    for(const x of [-1,1])for(const y of [-1,1]){const f=[];for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,1]]){const p=[0,0,0,0];p[a]=u;p[b]=v;p[fixed[0]]=x;p[fixed[1]]=y;f.push(lookup.get(p.join(',')));}faces.push(f);}
  }
  // Ordered winding and parent face-list order are deliberately noncanonical.
  faces[3]=[...faces[3]].reverse();faces[8]=[...faces[8].slice(2),...faces[8].slice(0,2)];
  const cells=[];for(let axis=0;axis<4;axis++)for(const sign of [-1,1])cells.push(faces.flatMap((f,i)=>f.every(v=>vertices[v][axis]===sign)?[i]:[]));
  cells[0].reverse();cells[7]=[...cells[7].slice(2),...cells[7].slice(0,2)];
  const edges=new Map();for(const f of faces)for(let i=0;i<4;i++){const e=[f[i],f[(i+1)%4]].sort((a,b)=>a-b);edges.set(ids(e),e);}
  const faceColor=i=>i%5===3?null:i%2?{encoding:'byte',values:[30+i,80,210,128]}:{encoding:'unit',values:[.25,.75,.5,.3]};
  return {id:'cell-attributes-literal-tesseract',name:'Literal colored unit tesseract',dimension:4,embeddingDimension:4,interpretation:'convex-polytope',
    vertices,edges:[...edges.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),faces,cells,numeric:{mode:'float64-approximate',certified:false},
    metadata:{coordinateUnits:'mm',offColors:{vertices:vertices.map((_,i)=>({encoding:'byte',values:[i,19,180,99]})),faces:faces.map((_,i)=>faceColor(i)),
      cells:cells.map((_,i)=>i%2?{encoding:'unit',values:[.8,.2,.1,.65]}:{encoding:'byte',values:[220,30,70,111]})},
      retained:{literal:'all source geometry and attributes',signedSymbol:'5/-3',flag:true,scientific:1e98,nullValue:null}}};
}
function sourceDocument(source=tesseract()){return {id:'cell-attributes-source-document',cursor:0,states:[{model:source,notes:'Keep complete source RGBA/null and mm units',
  view:{angles:[0,0,0,0,0,0],coordinateUnit:'mm',cameraProjection:'orthographic',projection:'orthographic',surfaceColors:'source',surfaceOpacity:1,
    sectionNormal:[0,0,0,1],sectionOffset:0,derivedMode:'section',entity:0}}]};}
function project(document=sourceDocument()){return {format:'polytope-laboratory',version:1,active:0,documents:[document]};}
function verifyCubeMetric(m){
  assert.deepEqual(counts(m),[8,12,6,0]);assert.equal(m.dimension,3);assert.equal(m.embeddingDimension,3);
  const distances=[];for(let i=0;i<8;i++)for(let j=i+1;j<8;j++)distances.push(m.vertices[i].reduce((s,x,a)=>s+(x-m.vertices[j][a])**2,0));
  distances.sort((a,b)=>a-b);distances.forEach((x,i)=>near(x,i<12?4:i<24?8:12));
  const boundary=new Map();for(const f of m.faces){assert.equal(f.length,4);for(let i=0;i<4;i++){const e=ids([f[i],f[(i+1)%4]]);boundary.set(e,(boundary.get(e)||0)+1);}}
  assert.deepEqual([...boundary.keys()].sort(),m.edges.map(ids).sort());assert.ok([...boundary.values()].every(n=>n===2));
  for(const [a,b] of m.edges)near(m.vertices[a].reduce((s,x,i)=>s+(x-m.vertices[b][i])**2,0),4);
  if(m.measure){near(m.measure.content,8);near(m.measure.boundaryMeasure,24);}
}
function verifyCell(m,source,index){
  verifyCubeMetric(m);const e=m.metadata.cellExtraction,frame=e.frame,maps=e.maps;
  assert.equal(e.algorithmVersion,'0.2.0');assert.equal(m.provenance.algorithmVersion,'0.2.0');assert.equal(e.resultModelId,m.id);
  if(m.fingerprint)assert.equal(e.resultFingerprint,m.fingerprint);assert.equal(e.sourceModelId,source.id);if(source.fingerprint)assert.equal(e.sourceFingerprint,source.fingerprint);
  assert.match(e.sourceSnapshotSha256,/^[a-f0-9]{64}$/);assert.equal(signature(e.sourceModel),signature(source),'Full source attributes and literal incidence must survive.');
  assert.deepEqual(e.parameters,{kind:'cell',index});assert.deepEqual(maps.cells,[index]);assert.deepEqual(maps.faces,source.cells[index]);
  const vertices=[...new Set(source.cells[index].flatMap(f=>source.faces[f]))].sort((a,b)=>a-b);assert.deepEqual(maps.vertices,vertices);
  for(let axis=0;axis<3;axis++)near(m.vertices.reduce((sum,p)=>sum+p[axis],0)/m.vertices.length,0);
  for(let axis=0;axis<4;axis++)near(frame.origin[axis],vertices.reduce((sum,v)=>sum+source.vertices[v][axis],0)/vertices.length);
  const edges=source.edges.flatMap((edge,i)=>vertices.includes(edge[0])&&vertices.includes(edge[1])?[i]:[]);assert.deepEqual(maps.edges,edges);
  assert.equal(frame.basis.length,4);assert.ok(frame.basis.every(row=>row.length===3));assert.equal(frame.origin.length,4);
  for(let a=0;a<3;a++)for(let b=0;b<3;b++)near(frame.basis.reduce((sum,row)=>sum+row[a]*row[b],0),Number(a===b));
  near(frame.ambientOrientationDeterminant,1);for(let axis=0;axis<3;axis++)near(frame.basis.reduce((sum,row,a)=>sum+row[axis]*frame.normal[a],0),0);
  m.vertices.forEach((p,i)=>frame.basis.forEach((row,a)=>near(row.reduce((sum,x,b)=>sum+x*p[b],frame.origin[a]),source.vertices[maps.vertices[i]][a])));
  m.edges.forEach((edge,i)=>assert.deepEqual(edge.map(v=>maps.vertices[v]),source.edges[maps.edges[i]]));
  m.faces.forEach((face,i)=>assert.deepEqual(face.map(v=>maps.vertices[v]),source.faces[maps.faces[i]],'Literal cycle/winding must not be canonicalized.'));
  assert.deepEqual(m.metadata.offColors.faces,maps.faces.map(f=>source.metadata.offColors.faces[f]));assert.deepEqual(m.metadata.offColors.cells,[]);
  assert.deepEqual(e.selectedCellColor,source.metadata.offColors.cells[index]);assert.ok(e.selectedCellColor!==null);
  assert.ok(m.metadata.offColors.faces.some(c=>c===null),'Fixture requires an actual null source-face color.');
  assert.equal(m.metadata.coordinateUnits,'mm');assert.equal(e.nativeProjectGate.passed,true);
  assert.deepEqual(m.metadata.sourceEmbedding.sourceVertexIds,maps.vertices);assert.deepEqual(m.metadata.sourceEmbedding.sourceFaceIds,maps.faces);
}
function verifyLegacy(m){verifyCubeMetric(m);assert.equal(m.provenance.algorithmVersion,'0.1.0');assert.equal(m.metadata.cellExtraction,undefined);assert.equal(m.metadata.coordinateUnits,undefined);assert.equal(m.metadata.offColors,undefined);}
function verifyRecorded(document,source,index){
  const node=document.operationHistory.nodes.at(-1);assert.equal(node.op,'cell');assert.equal(node.algorithmVersion,'0.2.0');assert.deepEqual(node.params,{kind:'cell',index});
  const parent=document.operationHistory.nodes.find(n=>n.id===node.parent);assert.ok(parent);assert.equal(signature(parent.snapshot.model),signature(source));verifyCell(document.states[document.cursor].model,source,index);return node;
}
function native(request){const {spawnSync}=require('node:child_process'),r=spawnSync(process.env.POLYTOPE_PYTHON||'python',['-B','-m','engine.server'],{cwd:root,windowsHide:true,input:JSON.stringify(request)+'\n',encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024});assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout.trim());}
function successful(request){const r=native(request);assert.equal(r.ok,true,r.error);return r.result;}
function syntheticCell(source,index=0){
  const vertices=[...new Set(source.cells[index].flatMap(f=>source.faces[f]))].sort((a,b)=>a-b),map=new Map(vertices.map((v,i)=>[v,i])),edges=source.edges.flatMap((e,i)=>e.every(v=>map.has(v))?[i]:[]),faces=source.cells[index],basis=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],origin=[-1,0,0,0];assert.equal(index,0);
  return {id:'synthetic-checker-cell',dimension:3,embeddingDimension:3,vertices:vertices.map(v=>source.vertices[v].slice(1)),edges:edges.map(e=>source.edges[e].map(v=>map.get(v))),faces:faces.map(f=>source.faces[f].map(v=>map.get(v))),cells:[],provenance:{algorithmVersion:'0.2.0'},metadata:{coordinateUnits:'mm',offColors:{faces:faces.map(f=>clone(source.metadata.offColors.faces[f])),cells:[]},sourceEmbedding:{sourceVertexIds:vertices,sourceFaceIds:faces},cellExtraction:{algorithmVersion:'0.2.0',resultModelId:'synthetic-checker-cell',sourceModelId:source.id,sourceSnapshotSha256:'a'.repeat(64),sourceModel:clone(source),parameters:{kind:'cell',index},maps:{vertices,edges,faces,cells:[index]},frame:{basis,origin,normal:[-1,0,0,0],ambientOrientationDeterminant:1},selectedCellColor:clone(source.metadata.offColors.cells[index]),nativeProjectGate:{passed:true}}}};
}
function selfTest(){
  const source=tesseract();assert.deepEqual(counts(source),[16,32,24,8]);const m=syntheticCell(source);verifyCell(m,source,0);
  const wrongFace=clone(m);wrongFace.metadata.offColors.faces[0]=clone(source.metadata.offColors.cells[0]);assert.throws(()=>verifyCell(wrongFace,source,0));
  const wrongCycle=clone(m);wrongCycle.faces[0].reverse();assert.throws(()=>verifyCell(wrongCycle,source,0));
  const fakeCells=clone(m);fakeCells.metadata.offColors.cells=[clone(source.metadata.offColors.cells[0])];assert.throws(()=>verifyCell(fakeCells,source,0));
  const droppedSource=clone(m);droppedSource.metadata.cellExtraction.sourceModel.metadata.retained.flag=false;assert.throws(()=>verifyCell(droppedSource,source,0));
  console.log('Cell attribute fixture/checker self-test PASS: full lineage, ordered cycles, null/face RGBA and separate historical cell color. No app launched.');
}
async function nativeSelfTest(){
  selfTest();await fs.mkdir(path.join(root,'artifacts'),{recursive:true});const folder=await fs.mkdtemp(path.join(root,'artifacts','cell-attributes-native-selftest-')),sourceFile=path.join(folder,'literal-source.polyproj');await fs.writeFile(sourceFile,JSON.stringify(project()));
  const loaded=successful({op:'load',params:{path:sourceFile}}).project,source=active(loaded).model,before=signature(source),d=doc(loaded),results=[];
  for(const index of [0,7]){const result=successful({op:'cell',model:source,params:{kind:'cell',index}});verifyCell(result,source,index);assert.equal(signature(successful({op:'cell',model:source,params:{kind:'cell',index},algorithmVersion:'0.2.0'})),signature(result));results.push(result);}
  const recorded=successful({op:'recipe-run',params:{document:d,operation:'cell',parameters:{kind:'cell',index:0}}}),node=verifyRecorded(recorded,source,0),replay=successful({op:'recipe-replay',params:{document:recorded}});assert.equal(signature(replay.states[replay.cursor].model),signature(results[0]));
  const branch=successful({op:'recipe-branch',params:{document:recorded,parameters:{kind:'cell',index:7}}});assert.equal(verifyRecorded(branch,source,7).parent,node.parent);
  const file=path.join(folder,'recorded-cell-branch.polyproj');successful({op:'save',params:{project:project(branch),path:file}});const reopened=successful({op:'load',params:{path:file}}).project;assert.equal(signature(doc(reopened)),signature(branch));verifyCell(active(reopened).model,source,7);
  const original=successful({op:'recipe-replay',params:{document:branch,target:node.parent}});assert.equal(signature(original.states[original.cursor].model),signature(source));
  const legacy=successful({op:'cell',model:source,params:{kind:'cell',index:0},algorithmVersion:'0.1.0'});verifyLegacy(legacy);assert.equal(native({op:'cell',model:source,params:{kind:'cell',index:0},algorithmVersion:'future'}).ok,false);assert.equal(signature(source),before);
  // Legacy graph construction uses the existing versioned Python adapter;
  // replay/branch/save/load below use the mounted JSON API, not a new kernel.
  const {spawnSync}=require('node:child_process'),made=spawnSync(process.env.POLYTOPE_PYTHON||'python',['-B','-c',"import sys,json;from engine.cell_attributes import run_cell;print(json.dumps(run_cell(json.load(sys.stdin),{'kind':'cell','index':0},version='0.1.0')))"] ,{cwd:root,windowsHide:true,input:JSON.stringify(d),encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024});assert.equal(made.error,undefined);assert.equal(made.status,0,made.stderr);const oldDoc=JSON.parse(made.stdout),oldReplay=successful({op:'recipe-replay',params:{document:oldDoc}});verifyLegacy(oldReplay.states[oldReplay.cursor].model);const oldBranch=successful({op:'recipe-branch',params:{document:oldDoc,parameters:{kind:'cell',index:7}}});assert.equal(oldBranch.operationHistory.nodes.at(-1).algorithmVersion,'0.1.0');verifyLegacy(oldBranch.states[oldBranch.cursor].model);
  const oldFile=path.join(folder,'legacy-cell.polyproj');successful({op:'save',params:{project:project(oldDoc),path:oldFile}});verifyLegacy(active(successful({op:'load',params:{path:oldFile}}).project).model);
  await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,scope:'headless native JSON and existing versioned adapter only',checks:8,sourceSha256:hash(signature(source)),currentFile:file,legacyFile:oldFile},null,2));console.log(`Cell attribute native self-test PASS: current default/explicit, full attributes, replay/branch, native files, explicit legacy/version-retaining legacy history. Artifacts: ${folder}`);
}
async function main(){
  const runtime=await require('./layer-join-smoke.cjs').guardRuntime(); // Must precede Electron import/launch.
  const {_electron:electron}=require('playwright'),started=performance.now(),artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));await fs.mkdir(artifacts,{recursive:true});
  const folder=await fs.mkdtemp(path.join(artifacts,runtime.packaged?'cell-attributes-packaged-smoke-':'cell-attributes-smoke-')),profile=path.join(folder,'profile');await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000}),checks=[],errors=[],files=[],images=[];let page,serial=0;
  try{
    assert.equal((await app.evaluate(({app})=>app.polytopeQualification))?.mode,runtime.hidden?'hidden-no-focus':undefined);page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract');
    await page.evaluate(()=>{window.cellAttributeStatuses=[];new MutationObserver(()=>window.cellAttributeStatuses.push(document.getElementById('status').textContent)).observe(document.getElementById('status'),{childList:true,subtree:true,characterData:true});});
    const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden),disclose=async id=>{if(!await page.locator('#'+id).evaluate(n=>n.open))await page.locator('#'+id+' > summary').click();};
    const save=async label=>{await done();const file=path.join(folder,`${String(++serial).padStart(2,'0')}-${label}.polyproj`);await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.locator('#save').click();await page.waitForFunction(file=>window.cellAttributeStatuses.includes('Saved '+file),file);await done();const bytes=await fs.readFile(file);files.push({file,sha256:hash(bytes)});return {file,project:JSON.parse(bytes)};};
    const open=async file=>{await done();await page.keyboard.press('Escape');await page.evaluate(()=>{window.cellAttributeStatuses=[];document.activeElement?.blur();});await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#open').click();await page.waitForFunction(file=>window.cellAttributeStatuses.includes('Opened '+file),file);await done();};
    const fixture=async(label,p)=>{const file=path.join(folder,label+'.polyproj'),bytes=Buffer.from(JSON.stringify(p));await fs.writeFile(file,bytes);files.push({file,sha256:hash(bytes)});return file;};
    const newDoc=async callback=>{const n=await page.locator('#document-tabs > button').count();await callback();await page.waitForFunction(n=>document.getElementById('document-tabs').children.length===n+1,n);await done();};
    const pixels=async(label,selector='#base-canvas canvas')=>{const value=await page.evaluate(async selector=>{for(let i=0;i<4;i++)await new Promise(resolve=>requestAnimationFrame(resolve));const source=document.querySelector(selector),c=document.createElement('canvas');if(!source)throw Error('No canvas for cell attribute pixel evidence.');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.drawImage(source,0,0);const bytes=ctx.getImageData(0,0,c.width,c.height).data,background=[...bytes.slice(0,3)],previous=window.cellAttributePixels?.[selector];let nonBackground=0,changed=0;for(let i=0;i<bytes.length;i+=4){if(bytes[i]!==background[0]||bytes[i+1]!==background[1]||bytes[i+2]!==background[2])nonBackground++;if(previous&&previous.length===bytes.length&&(bytes[i]!==previous[i]||bytes[i+1]!==previous[i+1]||bytes[i+2]!==previous[i+2]))changed++;}(window.cellAttributePixels||={})[selector]=bytes;return {width:c.width,height:c.height,nonBackground,changed};},selector);assert.ok(value.nonBackground>200);images.push({label,...value});return value;};
    await done();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1484,900));const initial=(await save('initial')).project,p=clone(initial);p.documents=[sourceDocument()];p.active=0;await open(await fixture('literal-colored-tesseract',p));
    const accepted=await save('native-accepted-source'),source=active(accepted.project).model;assert.deepEqual(source.vertices,tesseract().vertices);assert.deepEqual(source.edges,tesseract().edges);assert.deepEqual(source.faces,tesseract().faces);assert.deepEqual(source.cells,tesseract().cells);assert.deepEqual(source.metadata,tesseract().metadata);assert.equal(active(accepted.project).view.coordinateUnit,'mm');
    const promoted=[];
    for(const index of [0,7]){
      await open(accepted.file);await page.locator('#viewport-layout').selectOption('split');await page.locator('#derived-mode').selectOption('cell');await done();await page.locator('#entity-id').fill(String(index));await page.locator('#entity-id').press('Tab');await page.waitForFunction(()=>document.getElementById('derived-status').textContent==='8 vertices · 12 edges · 6 faces · intrinsic 3D');await done();assert.equal(await page.locator('#promote').isEnabled(),true);await pixels('derived-cell-'+index,'#derived-canvas canvas');await page.screenshot({path:path.join(folder,'derived-cell-'+index+'.png')});
      await newDoc(()=>page.locator('#promote').click());await page.waitForFunction(index=>document.getElementById('model-name').textContent==='Cell '+index+' of Literal colored unit tesseract',index);const saved=await save('promoted-cell-'+index);verifyCell(active(saved.project).model,source,index);assert.equal(active(saved.project).view.coordinateUnit,'mm');assert.equal(doc(saved.project).states.length,1);assert.equal(doc(saved.project).operationHistory,undefined);assert.equal(await page.locator('#undo').isEnabled(),false);assert.equal(signature(saved.project.documents[0].states[0].model),signature(source));promoted.push(saved);
      await open(saved.file);const reopened=await save('promoted-cell-'+index+'-reopened');assert.equal(signature(active(reopened.project).model),signature(active(saved.project).model));assert.equal(active(reopened.project).view.coordinateUnit,'mm');
    }
    checks.push('actual colored/unit 4D import; Compare Cell0/7 and Promote retain all source-to-local coordinates, ordered face cycles/RGBA/null, mm units and separate historical parent-cellRGBA; promotion is an independent unrecorded source document');
    checks.push('actual promoted current cells Save/Open retain complete extraction receipt, full parent source, source palette/null and units without inventing 3D cells');

    await open(promoted[0].file);await page.locator('#fit-view').click();await disclose('surface-settings');await page.locator('#surface-colors').selectOption('source');await pixels('source-palette');await page.locator('#surface-colors').selectOption('face');const alternate=await pixels('face-palette');assert.ok(alternate.changed>100);await page.locator('#surface-colors').selectOption('source');const restored=await pixels('source-palette-restored');assert.ok(restored.changed>100);verifyCell(active((await save('palette-source-restored')).project).model,source,0);await page.screenshot({path:path.join(folder,'promoted-cell-source-colors.png')});
    checks.push('actual promoted source colors visibly differ from generated face coloring; restoring source mode leaves literal byte/unit/alpha/null palette unchanged');

    // The UI only derives/promotes cells. Create a RECORDED cell operation via
    // its actual native IPC, then exercise the visible history controls. Do not
    // attribute this recipe ancestry to the unrecorded Promote action above.
    const recorded=await page.evaluate(document=>window.polytope.engine({op:'recipe-run',params:{document,operation:'cell',parameters:{kind:'cell',index:0},label:'Recorded cell attribute fixture'}},'cell-attributes-recorded-native'),clone(doc(accepted.project)));verifyRecorded(recorded,source,0);const rp=clone(accepted.project);rp.documents=[recorded];rp.active=0;await open(await fixture('native-recorded-cell0',rp));const recordSaved=await save('recorded-cell0-accepted'),node=verifyRecorded(doc(recordSaved.project),source,0);
    await page.locator('#undo').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Literal colored unit tesseract');assert.equal(signature(active((await save('recorded-undo')).project).model),signature(source));await page.locator('#redo').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cell 0 of Literal colored unit tesseract');verifyCell(active((await save('recorded-redo')).project).model,source,0);
    await disclose('history-settings');await newDoc(()=>page.locator('#history-replay').click());const replay=await save('recorded-current-replay');verifyRecorded(doc(replay.project),source,0);assert.equal(signature(active(replay.project).model),signature(active(recordSaved.project).model));
    await disclose('history-settings');await page.locator('#history-branch').click();await page.locator('#history-parameters').fill('{"kind":"cell","index":7}');await newDoc(()=>page.locator('#history-parameters-apply').click());const branched=await save('recorded-original-parent-branch');assert.equal(verifyRecorded(doc(branched.project),source,7).parent,node.parent);await open(branched.file);const branchReopened=await save('branch-reopened');verifyRecorded(doc(branchReopened.project),source,7);assert.equal(signature(doc(branchReopened.project).operationHistory),signature(doc(branched.project).operationHistory));
    checks.push('actual native IPC-authored recorded cell0.2 fixture supports UI Undo/Redo, Replay and original-4D-parent Branch7; complete versioned history survives Save/Open');

    const beforeLegacy=await save('before-readonly-version-probes');const versions=await page.evaluate(async source=>{const current=await window.polytope.engine({op:'cell',model:source,params:{kind:'cell',index:0}},'cell-current-version-probe'),legacy=await window.polytope.engine({op:'cell',model:source,params:{kind:'cell',index:0},algorithmVersion:'0.1.0'},'cell-legacy-version-probe');let rejected=false;try{await window.polytope.engine({op:'cell',model:source,params:{kind:'cell',index:0},algorithmVersion:'future'},'cell-unsupported-version-probe');}catch{rejected=true;}return {current,legacy,rejected};},source);verifyCell(versions.current,source,0);verifyLegacy(versions.legacy);assert.equal(versions.rejected,true);assert.equal(signature(doc((await save('after-readonly-version-probes')).project)),signature(doc(beforeLegacy.project)));
    checks.push('actual native IPC default remains cell0.2; explicit cell0.1 retains old geometry and old absent color/unit metadata; unsupported version refuses without mutating active UI document');

    for(const file of files)assert.equal(hash(await fs.readFile(file.file)),file.sha256);assert.deepEqual(errors,[]);const sourceHashes=[];for(const file of ['scripts/cell-attributes-smoke.cjs','engine/cell_attributes.py','ui/app.js','ui/history-workflow.mjs'])sourceHashes.push({file,sha256:hash(await fs.readFile(path.join(root,file)))});
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,checks,pageErrors:errors,files,images,sourceHashes,scope:'Cell0.2 source attributes and explicit legacy compatibility; promoted documents do not assert operation-replay ancestry',hidden:runtime.hidden,packaged:Boolean(runtime.packaged),developmentPythonUnavailable:Boolean(runtime.packaged),runtime:runtime.runtime,version:await app.evaluate(({app})=>app.getVersion()),runtimeMainSha256:hash(runtime.entry),canaryPath:runtime.canaryPath,seconds:(performance.now()-started)/1000},null,2));console.log(`Cell attribute smoke PASS: ${checks.length} groups. Artifacts: ${folder}`);
  }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});const diagnostic=await page?.evaluate(()=>({status:document.getElementById('status')?.textContent,derived:document.getElementById('derived-status')?.textContent,toast:document.getElementById('toast')?.textContent,statusTrace:window.cellAttributeStatuses})).catch(()=>null);await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors,diagnostic},null,2));console.error('Artifacts:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
if(require.main===module){if(process.argv.includes('--native-self-test'))nativeSelfTest().catch(error=>{console.error(error);process.exitCode=1;});else if(process.argv.includes('--self-test'))selfTest();else main().catch(error=>{console.error(error);process.exitCode=1;});}
module.exports={tesseract,sourceDocument,project,verifyCell,verifyCubeMetric,verifyLegacy,verifyRecorded,selfTest};
