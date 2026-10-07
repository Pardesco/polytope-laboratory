// Source-feature zonohedron qualification. --self-test and --native-self-test
// launch no graphical application. Root owns guarded Electron execution.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),root=path.resolve(__dirname,'..');
const clone=x=>structuredClone(x),hash=x=>createHash('sha256').update(x).digest('hex');
const doc=p=>p.documents[p.active],active=p=>doc(p).states[doc(p).cursor];
const counts=m=>['vertices','edges','faces','cells'].map(k=>m[k].length);
const ids=a=>[...a].sort((a,b)=>a-b).join(','),key=p=>p.map(x=>Math.abs(x)<1e-10?0:Math.round(x*1e9)/1e9).join(',');
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const GROUPS=[{kind:'edges',ids:[2,0]},{kind:'faces',ids:[4,1]},{kind:'world-axes',ids:[2,0]}];
const PARAMS={selections:GROUPS,center:[.5,-2,0],edge_length:2,max_zones:32};
function cube(){
  const vertices=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
    faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],edges=new Map();
  for(const f of faces)for(let i=0;i<f.length;i++){const e=[f[i],f[(i+1)%f.length]].sort((a,b)=>a-b);edges.set(ids(e),e);}
  return {id:'source-zonohedron-literal-cube',name:'Literal colored source cube',dimension:3,embeddingDimension:3,
    interpretation:'convex-polytope',vertices,edges:[...edges.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),faces,cells:[],facetVertices:clone(faces),
    numeric:{mode:'float64-approximate',certified:false},metadata:{coordinateUnits:'mm',literal:{owned:true,number:1,symbol:'5/-3',scientific:1e98},
      offColors:{vertices:vertices.map((_,i)=>({encoding:'byte',values:[i,25,128,17]})),
        faces:[{encoding:'byte',values:[20,50,210,128]},null,{encoding:'unit',values:[.1,.4,.7,.3]},null,null,{encoding:'unit',values:[.3,.2,.8,.75]}],cells:[]}}};
}
function sourceDocument(source=cube()){
  return {id:'source-zonohedron-literal-document',cursor:0,states:[{model:source,notes:'Source attributes are historical, including null and alpha.',
    view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0],cameraProjection:'orthographic',surfaceColors:'source',surfaceOpacity:1,
      sectionNormal:[0,0,1],sectionOffset:.25,derivedMode:'section',entity:0}}]};
}
function project(document=sourceDocument()) {return {format:'polytope-laboratory',version:1,active:0,documents:[document]};}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
const signature=v=>JSON.stringify(canonical(v));
function axisDirection(source,kind,index){
  let raw;if(kind==='world-axes')raw=[0,1,2].map(i=>Number(i===index));
  else if(kind==='edges'){const [a,b]=source.edges[index];raw=source.vertices[b].map((x,i)=>x-source.vertices[a][i]);}
  else if(kind==='faces'){
    const f=source.faces[index],a=source.vertices[f[0]],b=source.vertices[f[1]],c=source.vertices[f[2]],u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]);
    raw=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  }else throw Error('Independent orthogonal-axis fixture accepts edges/faces/world-axes only.');
  const axes=raw.flatMap((x,i)=>Math.abs(x)>1e-10?[i]:[]);assert.equal(axes.length,1,'Fixture seed must lie on exactly one coordinate axis.');
  return [0,1,2].map(i=>Number(i===axes[0]));
}
function verifyCubeIncidence(m,length=2){
  assert.deepEqual(counts(m),[8,12,6,0]);assert.equal(m.dimension,3);assert.equal(m.embeddingDimension,3);
  const expected=[];for(const x of [-length/2,length/2])for(const y of [-length/2,length/2])for(const z of [-length/2,length/2])expected.push([x,y,z]);
  assert.deepEqual(m.vertices.map(key).sort(),expected.map(key).sort());assert.equal(new Set(m.vertices.map(key)).size,8);
  const edges=[];for(let a=0;a<8;a++)for(let b=a+1;b<8;b++)if(m.vertices[a].filter((x,i)=>Math.abs(x-m.vertices[b][i])>1e-9).length===1)edges.push(ids([a,b]));
  assert.deepEqual(m.edges.map(ids).sort(),edges.sort());const faces=[];
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1])faces.push(ids(m.vertices.flatMap((p,i)=>Math.abs(p[axis]-sign*length/2)<1e-9?[i]:[])));
  assert.deepEqual(m.faces.map(ids).sort(),faces.sort());const uses=new Map();
  for(const f of m.faces){assert.equal(f.length,4);for(let i=0;i<4;i++){const e=ids([f[i],f[(i+1)%4]]);assert.ok(edges.includes(e),'Each literal cycle follows a cube edge.');uses.set(e,(uses.get(e)||0)+1);}}
  assert.ok([...uses.values()].every(n=>n===2));near(m.measure.content,length**3);near(m.measure.boundaryMeasure,6*length**2);
}
function verifyResult(m,source,params=PARAMS){
  const e=m.metadata.sourceZonohedron,support=m.metadata.supportZonohedron;
  assert.equal(e.algorithmVersion,'0.1.0');assert.equal(m.interpretation,'convex-polytope');assert.equal(m.numeric.certified,false);
  assert.equal(signature(e.sourceModel),signature(source),'Every source field, RGBA, literal cycle, ID and unit must remain historical.');
  assert.equal(e.sourceModelId,source.id);if(source.fingerprint)assert.equal(e.sourceFingerprint,source.fingerprint);
  assert.deepEqual(e.selections,params.selections);assert.deepEqual(e.center,params.center||[0,0,0]);near(e.edgeLength,params.edge_length??1);assert.equal(e.maxZones,params.max_zones??null);
  assert.equal(m.metadata.coordinateUnits,'mm');assert.equal(m.metadata.offColors,undefined,'New faces receive no invented historical colors.');
  assert.equal(e.resultModelId,m.id);assert.equal(e.resultFingerprint,m.fingerprint);assert.equal(m.provenance.sourceModelId,source.id);
  const owners=params.selections.flatMap(g=>g.ids.map(i=>({kind:g.kind,sourceEntityId:i}))),directions=params.selections.flatMap(g=>g.ids.map(i=>axisDirection(source,g.kind,i)));
  assert.deepEqual(e.seedOwners.map(({kind,sourceEntityId})=>({kind,sourceEntityId})),owners);assert.deepEqual(e.seedDirections,directions);
  e.seedOwners.forEach(owner=>{if(owner.kind==='edges')assert.deepEqual(owner.sourceVertexIds,source.edges[owner.sourceEntityId]);if(owner.kind==='faces')assert.deepEqual(owner.sourceVertexIds,source.faces[owner.sourceEntityId]);});
  assert.equal(support.distinctZoneCount,3);assert.equal(support.selectedZones.length,3);assert.equal(e.selectedZoneOwners.length,3);
  for(let i=0;i<3;i++){const zone=support.selectedZones[i];assert.deepEqual(e.selectedZoneOwners[i],zone.sourceDirectionIds.map(id=>e.seedOwners[id]));}
  assert.deepEqual(support.selectedZones.flatMap(z=>z.sourceDirectionIds).sort((a,b)=>a-b),owners.map((_,i)=>i));
  verifyCubeIncidence(m,params.edge_length??1);
}
function verifyHistory(document,source,params){
  const node=document.operationHistory.nodes.at(-1);assert.equal(node.op,'source-zonohedron');assert.equal(node.algorithmVersion,'0.1.0');
  assert.deepEqual(node.params,params);assert.equal(node.snapshot.model.id,document.states[document.cursor].model.id);
  const parent=document.operationHistory.nodes.find(n=>n.id===node.parent);assert.ok(parent);assert.equal(signature(parent.snapshot.model),signature(source));
  assert.equal(signature(document.states[0].model),signature(source));return node;
}
function native(request){
  const {spawnSync}=require('node:child_process'),r=spawnSync(process.env.POLYTOPE_PYTHON||'python',['-B','-m','engine.server'],
    {cwd:root,windowsHide:true,input:JSON.stringify(request)+'\n',encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024});
  assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr);const reply=JSON.parse(r.stdout.trim());return reply;
}
function successful(request){const reply=native(request);assert.equal(reply.ok,true,reply.error);return reply.result;}
function selfTest(){
  const c=cube();assert.deepEqual(counts(c),[8,12,6,0]);const directions=GROUPS.flatMap(g=>g.ids.map(i=>axisDirection(c,g.kind,i)));
  assert.equal(new Set(directions.map(key)).size,3);assert.deepEqual(directions,[[0,0,1],[1,0,0],[0,1,0],[0,0,1],[0,0,1],[1,0,0]]);
  // Include Y through literal source face 4, not inference from output.
  assert.deepEqual(axisDirection(c,'faces',4),[0,1,0]);
  const checked=clone(c);checked.measure={content:8,boundaryMeasure:24};verifyCubeIncidence(checked);
  const broken=clone(checked);broken.faces[0]=[0,2,3,1];assert.throws(()=>verifyCubeIncidence(broken));
  assert.notEqual(signature(c),signature({...c,metadata:{...c.metadata,offColors:{...c.metadata.offColors,faces:Array(6).fill(null)}}}));
  console.log('Source zonohedron fixture/checker self-test PASS. No app launched.');
}
async function nativeSelfTest(){
  selfTest();const input=sourceDocument(),before=clone(input),built=successful({op:'recipe-run',params:{document:input,operation:'source-zonohedron',parameters:PARAMS,label:'Source zonohedron'}});
  assert.deepEqual(input,before);const source=built.states[0].model,result=built.states[built.cursor].model;
  verifyResult(result,source,PARAMS);const node=verifyHistory(built,source,PARAMS);
  const replay=successful({op:'recipe-replay',params:{document:built}});assert.equal(signature(replay.states[replay.cursor].model),signature(result));
  const branchParams={selections:[{kind:'world-axes',ids:[2,0,1]}],center:[0,0,0],edge_length:3,max_zones:32},
    branch=successful({op:'recipe-branch',params:{document:built,parameters:branchParams}});verifyResult(branch.states[branch.cursor].model,source,branchParams);
  assert.equal(branch.operationHistory.nodes.at(-1).parent,node.parent);verifyHistory(branch,source,branchParams);
  const old=successful({op:'recipe-replay',params:{document:branch,target:node.parent}});assert.equal(signature(old.states[old.cursor].model),signature(source));
  const folder=await fs.mkdtemp(path.join(path.join(root,'artifacts'),'source-zonohedron-native-selftest-')),file=path.join(folder,'branch.polyproj');
  successful({op:'save',params:{project:project(branch),path:file}});const loaded=successful({op:'load',params:{path:file}}).project;
  assert.equal(signature(doc(loaded)),signature(branch));verifyResult(active(loaded).model,source,branchParams);
  for(const params of [{...PARAMS,selections:[{kind:'edges',ids:[0,0]}]},{...PARAMS,selections:[{kind:'world-axes',ids:[0,1]}]},{...PARAMS,edge_length:0}])assert.equal(native({op:'recipe-run',params:{document:input,operation:'source-zonohedron',parameters:params}}).ok,false);
  assert.deepEqual(input,before);const bytes=await fs.readFile(file);await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,scope:'headless native JSON/history/project only',file,sha256:hash(bytes),orderedSelections:GROUPS,counts:counts(result),checks:6},null,2));
  console.log(`Source zonohedron native self-test PASS: ordered groups, independent cube incidence, source RGBA/units, replay, original-parent branch, Save/Open and atomic refusals. Artifacts: ${folder}`);
}
async function main(){
  const runtime=await require('./layer-join-smoke.cjs').guardRuntime(); // Dynamic matching canary before Electron import/launch.
  const {_electron:electron}=require('playwright'),started=performance.now(),artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));
  await fs.mkdir(artifacts,{recursive:true});const folder=await fs.mkdtemp(path.join(artifacts,runtime.packaged?'source-zonohedron-packaged-smoke-':'source-zonohedron-smoke-')),profile=path.join(folder,'profile');
  await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
  const checks=[],errors=[],files=[];let page,serial=0;
  try{
    assert.equal((await app.evaluate(({app})=>app.polytopeQualification))?.mode,runtime.hidden?'hidden-no-focus':undefined);
    page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>document.getElementById('zonohedron-selection-list')&&document.getElementById('model-name').textContent==='Tesseract');
    await page.evaluate(()=>{window.zonoStatuses=[];new MutationObserver(()=>window.zonoStatuses.push(document.getElementById('status').textContent)).observe(document.getElementById('status'),{childList:true,subtree:true,characterData:true});});
    const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
    const disclose=async id=>{if(!await page.locator('#'+id).evaluate(n=>n.open))await page.locator('#'+id+' > summary').click();};
    const construct=async()=>{if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();await disclose('source-zonohedron-settings');};
    const save=async label=>{await done();const file=path.join(folder,`${String(++serial).padStart(2,'0')}-${label}.polyproj`);await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.locator('#save').click();await page.waitForFunction(file=>window.zonoStatuses.includes('Saved '+file),file);await done();const bytes=await fs.readFile(file);files.push({file,sha256:hash(bytes)});return {file,project:JSON.parse(bytes)};};
    const open=async(file,{pending=false}={})=>{if(!pending)await done();await page.keyboard.press('Escape');await page.evaluate(()=>{window.zonoStatuses=[];document.activeElement?.blur();});await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#open').click();await page.waitForFunction(file=>window.zonoStatuses.includes('Opened '+file),file);if(!pending)await done();};
    const newDoc=async callback=>{const n=await page.locator('#document-tabs > button').count();await callback();await page.waitForFunction(n=>document.getElementById('document-tabs').children.length===n+1,n);await done();};
    await done();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1484,900));
    const initial=(await save('initial')).project,fixture=clone(initial);fixture.active=0;fixture.documents=[sourceDocument()];
    const fixtureFile=path.join(folder,'literal-colored-cube.polyproj'),fixtureBytes=Buffer.from(JSON.stringify(fixture));await fs.writeFile(fixtureFile,fixtureBytes);files.push({file:fixtureFile,sha256:hash(fixtureBytes)});await open(fixtureFile);
    const sourceSaved=await save('native-source'),source=active(sourceSaved.project).model;assert.deepEqual(source.vertices,cube().vertices);assert.deepEqual(source.edges,cube().edges);assert.deepEqual(source.faces,cube().faces);assert.deepEqual(source.metadata,cube().metadata);assert.equal(active(sourceSaved.project).view.coordinateUnit,'mm');
    const fields=async(params=PARAMS)=>{await construct();for(const [axis,value] of ['x','y','z'].map((axis,i)=>[axis,params.center[i]]))await page.locator('#zonohedron-'+axis).fill(String(value));await page.locator('#zonohedron-length').fill(String(params.edge_length));await page.locator('#zonohedron-max-zones').fill(String(params.max_zones));};
    const groups=async selections=>{await construct();if(await page.locator('#clear-zonohedron-selections').isEnabled())await page.locator('#clear-zonohedron-selections').click();for(const g of selections){await page.locator('#zonohedron-feature').selectOption(g.kind);await page.locator('#zonohedron-ids').fill(g.ids.join(','));await page.locator('#add-zonohedron-selection').click();}assert.equal((await page.locator('#zonohedron-selection-list').textContent()).trim(),selections.map((g,i)=>`${i+1}. ${g.kind}: ${g.ids.join(', ')}`).join('\n'));};
    await fields();await groups(GROUPS);await page.locator('#make-source-zonohedron').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Equal-edge support zonohedron');await done();
    const built=await save('ordered-feature-groups'),result=active(built.project).model;verifyResult(result,source,PARAMS);const node=verifyHistory(doc(built.project),source,PARAMS);assert.equal(active(built.project).view.coordinateUnit,'mm');await page.screenshot({path:path.join(folder,'ordered-source-zonohedron.png')});
    checks.push('actual imported cube: ordered edge/face/world-axis groups, independent entire cube incidence/measures, exact source RGBA/null/units and historical source receipt');

    await page.locator('#undo').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Literal colored source cube');assert.equal(signature(active((await save('undo-source')).project).model),signature(source));
    await page.locator('#redo').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Equal-edge support zonohedron');assert.equal(signature(active((await save('redo-result')).project).model),signature(result));
    await disclose('history-settings');await newDoc(()=>page.locator('#history-replay').click());const replay=await save('native-replay');assert.equal(signature(active(replay.project).model),signature(result));verifyResult(active(replay.project).model,source,PARAMS);
    const branchParams={selections:[{kind:'world-axes',ids:[2,0,1]}],center:[0,0,0],edge_length:3,max_zones:32};
    await disclose('history-settings');await page.locator('#history-branch').click();await page.locator('#history-parameters').fill(JSON.stringify(branchParams));await newDoc(()=>page.locator('#history-parameters-apply').click());const branched=await save('native-branch');verifyResult(active(branched.project).model,source,branchParams);assert.equal(verifyHistory(doc(branched.project),source,branchParams).parent,node.parent);
    await open(branched.file);const reopened=await save('reopened-full-history');assert.equal(signature(doc(reopened.project).operationHistory),signature(doc(branched.project).operationHistory));assert.equal(signature(active(reopened.project).model),signature(active(branched.project).model));
    checks.push('actual Undo/Redo, native Replay, original-parent parameter Branch and Save/Open preserve recorded algorithm, complete source and output attributes');

    await open(sourceSaved.file);await groups(GROUPS);await page.locator('#clear-zonohedron-selections').click();assert.equal((await page.locator('#zonohedron-selection-list').textContent()).trim(),'');await fields(branchParams);await page.locator('#zonohedron-feature').selectOption('world-axes');await page.locator('#zonohedron-ids').fill('2,0,1');await page.locator('#make-source-zonohedron').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Equal-edge support zonohedron');await done();const single=await save('cleared-single-group');verifyResult(active(single.project).model,source,branchParams);verifyHistory(doc(single.project),source,branchParams);
    checks.push('actual Clear removes accumulated groups; unqueued literal editor becomes one ordered group without retaining stale selections');

    await open(sourceSaved.file);const beforeRefusal=await save('before-refusal');
    const refuse=async(selections,text)=>{await fields();await groups(selections);await page.evaluate(()=>document.getElementById('toast').hidden=true);await page.locator('#make-source-zonohedron').click();await page.waitForFunction(text=>!document.getElementById('toast').hidden&&document.getElementById('toast').textContent.includes(text),text);await done();const rejected=await save('refused');assert.equal(signature(doc(rejected.project)),signature(doc(beforeRefusal.project)));assert.equal(rejected.project.documents.length,beforeRefusal.project.documents.length);};
    await refuse([{kind:'world-axes',ids:[0,1]}],'3..32');
    await construct();await page.locator('#clear-zonohedron-selections').click();await page.locator('#zonohedron-feature').selectOption('edges');await page.locator('#zonohedron-ids').fill('0,0');await page.evaluate(()=>document.getElementById('toast').hidden=true);await page.locator('#add-zonohedron-selection').click();await page.waitForFunction(()=>!document.getElementById('toast').hidden&&document.getElementById('toast').textContent.includes('distinct'));assert.equal((await page.locator('#zonohedron-selection-list').textContent()).trim(),'');assert.equal(signature(doc((await save('duplicate-refused')).project)),signature(doc(beforeRefusal.project)));
    checks.push('rank-two native seeds and duplicate literal IDs refuse atomically without source/history replacement or partially added selection group');

    // Gate ONLY the already-computed native transport reply. Original handler,
    // trusted sender, parameters, numerical result and errors remain unchanged.
    // This exposes the real app publication boundary rather than mocking math.
    await app.evaluate(({ipcMain})=>{const original=ipcMain._invokeHandlers?.get('engine');if(typeof original!=='function')throw Error('Native reply-gate qualification requires the actual engine handler.');globalThis.zonoGate={armed:false,held:false};ipcMain.removeHandler('engine');ipcMain.handle('engine',async function(event,request,...args){const result=await original.call(this,event,request,...args);const gate=globalThis.zonoGate;if(gate.armed&&request.op==='recipe-run'&&request.params?.operation==='source-zonohedron'){gate.armed=false;gate.held=true;gate.request=structuredClone(request);await new Promise(resolve=>{gate.release=resolve;});gate.held=false;}return result;});});
    const arm=()=>app.evaluate(()=>{if(globalThis.zonoGate.held)throw Error('Previous reply gate still active.');globalThis.zonoGate.armed=true;});
    const held=()=>app.evaluate(()=>new Promise((resolve,reject)=>{const deadline=Date.now()+30000,t=setInterval(()=>{if(globalThis.zonoGate.held){clearInterval(t);resolve();}else if(Date.now()>deadline){clearInterval(t);reject(Error('Native source-zonohedron reply gate not reached.'));}},10);}));
    const release=()=>app.evaluate(()=>{if(!globalThis.zonoGate.held)throw Error('No native reply is held.');globalThis.zonoGate.release();});
    await open(sourceSaved.file);await fields();await groups(GROUPS);const beforeCancel=await save('before-native-cancel');await arm();await page.locator('#make-source-zonohedron').click();await held();await page.locator('#cancel-source-zonohedron').click();await page.waitForFunction(()=>document.getElementById('cancel-source-zonohedron').hidden);await release();await done();const canceled=await save('after-native-cancel');assert.equal(signature(doc(canceled.project)),signature(doc(beforeCancel.project)));
    checks.push('actual Cancel fences an already-computed native result held before renderer publication; late reply cannot replace source/history');

    await open(sourceSaved.file);await fields();await groups(GROUPS);await arm();await page.locator('#make-source-zonohedron').click();await held();await open(built.file,{pending:true});await release();await done();await page.waitForFunction(()=>document.getElementById('cancel-source-zonohedron').hidden);const switched=await save('workspace-switch-late-reply');assert.equal(signature(doc(switched.project)),signature(doc(built.project)));
    checks.push('actual workspace replacement while native reply is pending rejects late publication and retains newly opened document/history');

    await open(sourceSaved.file);await fields();await groups(GROUPS);await disclose('animation-settings');for(const [id,value] of [['animation-duration','1'],['animation-fps','2']]){await page.locator('#'+id).fill(value);await page.locator('#'+id).dispatchEvent('change');}await page.locator('#animation-rotation').click();await page.locator('#animation-target').selectOption('base');const beforeExport=await save('before-export-fence');
    await arm();await construct();await page.locator('#make-source-zonohedron').click();await held();await app.evaluate(({dialog})=>{globalThis.zonoExportHeld=false;dialog.showSaveDialog=()=>new Promise(resolve=>{globalThis.zonoExportHeld=true;globalThis.zonoExportRelease=()=>resolve({canceled:true});});});await disclose('animation-settings');await page.locator('#animation-png').click();await page.waitForFunction(()=>!document.getElementById('animation-cancel').hidden);await app.evaluate(()=>new Promise((resolve,reject)=>{const deadline=Date.now()+10000,t=setInterval(()=>{if(globalThis.zonoExportHeld){clearInterval(t);resolve();}else if(Date.now()>deadline){clearInterval(t);reject(Error('Export dialog gate not reached.'));}},10);}));
    await release();await page.waitForFunction(()=>document.getElementById('cancel-source-zonohedron').hidden);for(const id of ['make-source-zonohedron','add-zonohedron-selection','clear-zonohedron-selections','zonohedron-feature','zonohedron-ids'])assert.equal(await page.locator('#'+id).isEnabled(),false);await page.locator('#animation-cancel').click();await app.evaluate(()=>globalThis.zonoExportRelease());await page.waitForFunction(()=>!document.getElementById('animation-png').disabled);await done();const afterExport=await save('after-export-fence');assert.equal(signature(doc(afterExport.project)),signature(doc(beforeExport.project)));assert.equal((await fs.readdir(folder)).filter(x=>x.startsWith('.polytope-animation-')).length,0);
    checks.push('actual export beginning after native computation fences result publication; construction stays disabled, cancellation restores full source/view/history with no staged output');

    await open(sourceSaved.file);await fields();await groups(GROUPS);await page.locator('#make-source-zonohedron').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Equal-edge support zonohedron');await done();verifyResult(active((await save('recovered-after-fences')).project).model,source,PARAMS);
    checks.push('valid construction recovers after native refusal, canceled reply, source replacement and export ownership fences');
    for(const file of files)assert.equal(hash(await fs.readFile(file.file)),file.sha256);assert.deepEqual(errors,[]);await page.screenshot({path:path.join(folder,'source-zonohedron-workspace.png')});
    const sourceHashes=[];for(const file of ['scripts/source-zonohedron-smoke.cjs','ui/source-zonohedron-controls.mjs','engine/source_zonohedron.py','engine/source_zonohedron_workflow.py','ui/history-workflow.mjs'])sourceHashes.push({file,sha256:hash(await fs.readFile(path.join(root,file)))});
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,scope:'bounded explicit source-feature workflow; full CON08 and installed Stella conformance remain unqualified',checks,pageErrors:errors,files,sourceHashes,hidden:runtime.hidden,packaged:Boolean(runtime.packaged),developmentPythonUnavailable:Boolean(runtime.packaged),runtime:runtime.runtime,version:await app.evaluate(({app})=>app.getVersion()),runtimeMainSha256:hash(runtime.entry),canaryPath:runtime.canaryPath,seconds:(performance.now()-started)/1000},null,2));console.log(`Source zonohedron smoke PASS: ${checks.length} groups. Artifacts: ${folder}`);
  }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});const diagnostic=await page?.evaluate(()=>({status:document.getElementById('status')?.textContent,toast:document.getElementById('toast')?.textContent,statusTrace:window.zonoStatuses,groups:document.getElementById('zonohedron-selection-list')?.textContent})).catch(()=>null);await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors,diagnostic},null,2));console.error('Artifacts:',folder);throw error;}
  finally{await app.evaluate(({app})=>{globalThis.zonoGate?.release?.();globalThis.zonoExportRelease?.();app.exit(0);}).catch(()=>{});}
}
if(require.main===module){if(process.argv.includes('--native-self-test'))nativeSelfTest().catch(error=>{console.error(error);process.exitCode=1;});else if(process.argv.includes('--self-test'))selfTest();else main().catch(error=>{console.error(error);process.exitCode=1;});}
module.exports={cube,sourceDocument,project,axisDirection,verifyCubeIncidence,verifyResult,verifyHistory,signature,GROUPS,PARAMS};
