// Spring/0.1 actual UI qualification. Authoring and self-tests launch no app.
// Root owns Electron launches through the shared matching-runtime guard.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),root=path.resolve(__dirname,'..');
const hash=x=>createHash('sha256').update(x).digest('hex'),clone=x=>structuredClone(x);
const {signature}=require('./source-zonohedron-smoke.cjs');
const doc=p=>p.documents[p.active],active=p=>doc(p).states[doc(p).cursor];
function tetra(){return {id:'spring-ui-literal-tetra',name:'Literal spring tetrahedron',dimension:3,embeddingDimension:3,
  interpretation:'generalized-complex',vertices:[[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]],
  edges:[[2,3],[0,2],[1,3],[0,1],[0,3],[1,2]],faces:[[2,1,0],[3,0,1],[2,3,0],[3,2,1]],cells:[],
  numeric:{mode:'float64-approximate',certified:false},metadata:{coordinateUnits:'mm',literal:{keep:[1,null,'signed 5/-3']},
    offColors:{vertices:[null,{encoding:'byte',values:[3,17,255,90]},null,null],
      faces:[{encoding:'unit',values:[.1,.2,.7,.35]},null,{encoding:'byte',values:[55,180,11,128]},null],cells:[]}}};}
function sourceDocument(source=tetra()){return {id:'spring-ui-literal-document',cursor:0,states:[{model:source,
  notes:'Literal incidence, alpha and source units must survive.',view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0],
    cameraProjection:'orthographic',surfaceOpacity:1,surfaceColors:'source',sectionNormal:[0,0,1],derivedMode:'section'}}]};}
const project=(d=sourceDocument())=>({format:'polytope-laboratory',version:1,active:0,documents:[d]});
const pins=source=>source.vertices.map((position,vertex)=>({vertex,position:clone(position)}));
function verifyResult(m,source,{length=1,satisfied=true}={}){
  const e=m.metadata.springRelaxation,o=m.metadata.springOperation;
  assert.equal(signature(e.sourceModel),signature(source));assert.equal(e.sourceModelId,source.id);
  assert.equal(m.dimension,3);assert.equal(m.embeddingDimension,3);assert.equal(m.interpretation,'generalized-complex');
  assert.deepEqual(m.edges,source.edges);assert.deepEqual(m.faces,source.faces);assert.deepEqual(m.cells,[]);
  assert.deepEqual(m.metadata.offColors,source.metadata.offColors);assert.equal(m.metadata.coordinateUnits,'mm');
  assert.deepEqual(e.maps,{vertices:[0,1,2,3],edges:[0,1,2,3,4,5],faces:[0,1,2,3]});
  assert.equal(e.geometricValidity.passed,true);assert.equal(e.nativeValidation.passed,true);
  assert.equal(e.requestedConstraintsSatisfied,satisfied);assert.equal(o.requestedConstraintsSatisfied,satisfied);
  assert.equal(o.algorithmVersion,'0.1.0');assert.equal(o.uniformityEstablished,false);assert.equal(o.certified,false);
  assert.equal(o.runtimePartialPublished,false);assert.equal(e.resultFingerprint,m.fingerprint);assert.equal(e.resultModelId,m.id);
  if(satisfied){
    for(const [a,b] of m.edges)assert.ok(Math.abs(Math.hypot(...m.vertices[a].map((x,i)=>x-m.vertices[b][i]))-length)<1e-8);
    const a=m.vertices[0],rows=[1,2,3].map(i=>m.vertices[i].map((x,j)=>x-a[j]));
    const det=rows[0][0]*(rows[1][1]*rows[2][2]-rows[1][2]*rows[2][1])-rows[0][1]*(rows[1][0]*rows[2][2]-rows[1][2]*rows[2][0])+rows[0][2]*(rows[1][0]*rows[2][1]-rows[1][1]*rows[2][0]);
    assert.ok(Math.abs(Math.abs(det)/6-Math.sqrt(2)*length**3/12)<1e-8);
  }else{assert.equal(o.adoption,'valid-near-miss');assert.ok(e.residuals.maximumAbsoluteNormalizedResidual>1);}
}
function verifyHistory(d,source){const n=d.operationHistory.nodes.at(-1);assert.equal(n.op,'spring-relaxation');
  assert.equal(n.algorithmVersion,'0.1.0');assert.equal(signature(d.operationHistory.nodes.find(p=>p.id===n.parent).snapshot.model),signature(source));return n;}
function native(request){const {spawnSync}=require('node:child_process'),r=spawnSync(process.env.POLYTOPE_PYTHON||'python',['-B','-m','engine.server'],
  {cwd:root,windowsHide:true,input:JSON.stringify(request)+'\n',encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024});
  assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout.trim());}
function successful(request){const r=native(request);assert.equal(r.ok,true,r.error);return r.result;}
function selfTest(){const source=tetra();assert.deepEqual([source.vertices.length,source.edges.length,source.faces.length,source.cells.length],[4,6,4,0]);
  const count=new Map();for(const f of source.faces)for(let i=0;i<3;i++){const k=[f[i],f[(i+1)%3]].sort().join(',');count.set(k,(count.get(k)||0)+1);}
  assert.equal(count.size,6);assert.ok([...count.values()].every(n=>n===2));assert.equal(pins(source).length,4);
  assert.notEqual(signature(source),signature({...source,metadata:{...source.metadata,coordinateUnits:'cm'}}));
  console.log('Spring fixture self-test PASS. No graphical application launched.');}
async function nativeSelfTest(){selfTest();const d=sourceDocument(),before=clone(d),raw=d.states[0].model;
  const p=successful({op:'spring-relaxation-preview',model:raw,params:{}});assert.equal(p.recipeRecorded,false);verifyResult(successful({op:'spring-relaxation',model:raw,params:{}}),raw);
  const made=successful({op:'recipe-run',params:{document:d,operation:'spring-relaxation',parameters:{}}}),source=made.states[0].model;assert.deepEqual({...source,fingerprint:undefined},{...raw,fingerprint:undefined});verifyResult(made.states[made.cursor].model,source);const node=verifyHistory(made,source);
  assert.equal(signature(successful({op:'recipe-replay',params:{document:made}}).states[0].model),signature(made.states[made.cursor].model));
  const branch=successful({op:'recipe-branch',params:{document:made,parameters:{solver:{edge_length:2}}}});verifyResult(branch.states[branch.cursor].model,source,{length:2});assert.equal(verifyHistory(branch,source).parent,node.parent);
  const unresolved={solver:{pins:pins(source)},adoption:'valid-near-miss'};verifyResult(successful({op:'spring-relaxation',model:source,params:unresolved}),source,{satisfied:false});
  assert.equal(native({op:'spring-relaxation',model:source,params:{solver:{pins:pins(source)}}}).ok,false);
  const folder=await fs.mkdtemp(path.join(root,'artifacts','spring-native-selftest-')),file=path.join(folder,'spring.polyproj');successful({op:'save',params:{project:project(branch),path:file}});
  const loaded=successful({op:'load',params:{path:file}}).project;assert.equal(signature(doc(loaded)),signature(branch));assert.deepEqual(d,before);
  await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,scope:'headless native only, not GUI or CON14 parity',checks:6,file,sha256:hash(await fs.readFile(file))},null,2));console.log('Spring native self-test PASS:',folder);}
async function main(){
  const runtime=await require('./layer-join-smoke.cjs').guardRuntime();
  const {_electron:electron}=require('playwright'),started=performance.now(),folder=await fs.mkdtemp(path.join(root,'artifacts',runtime.packaged?'spring-packaged-smoke-':'spring-smoke-')),profile=path.join(folder,'profile');
  await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
  const checks=[],errors=[],files=[];let page,serial=0;
  try{
    assert.equal((await app.evaluate(({app})=>app.polytopeQualification))?.mode,runtime.hidden?'hidden-no-focus':undefined);
    page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>document.getElementById('spring-settings')&&document.getElementById('model-name').textContent==='Tesseract');
    await page.evaluate(()=>{window.springStatuses=[];new MutationObserver(()=>window.springStatuses.push(document.getElementById('status').textContent)).observe(document.getElementById('status'),{childList:true,subtree:true,characterData:true});});
    const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden&&document.getElementById('cancel-spring').hidden);
    const disclose=async id=>{if(!await page.locator('#'+id).evaluate(n=>n.open))await page.locator('#'+id+' > summary').click();};
    const construct=async()=>{if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();await disclose('spring-settings');};
    const save=async label=>{await done();const file=path.join(folder,`${++serial}-${label}.polyproj`);await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.locator('#save').click();await page.waitForFunction(file=>window.springStatuses.includes('Saved '+file),file);await done();const bytes=await fs.readFile(file);files.push({file,sha256:hash(bytes)});return {file,project:JSON.parse(bytes)};};
    const open=async(file,{pending=false}={})=>{if(!pending)await done();await page.keyboard.press('Escape');await page.evaluate(()=>{window.springStatuses=[];document.activeElement?.blur();});await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#open').click();await page.waitForFunction(file=>window.springStatuses.includes('Opened '+file),file);if(!pending)await done();};
    const more=async callback=>{const n=await page.locator('#document-tabs > button').count();await callback();await page.waitForFunction(n=>document.getElementById('document-tabs').children.length===n+1,n);await done();};
    await done();const initial=(await save('initial')).project;initial.active=0;initial.documents=[sourceDocument()];const fixture=path.join(folder,'literal-spring-tetra.polyproj');await fs.writeFile(fixture,JSON.stringify(initial));await open(fixture);
    const sourceSaved=await save('native-source'),source=active(sourceSaved.project).model;assert.deepEqual(source.vertices,tetra().vertices);assert.deepEqual(source.faces,tetra().faces);assert.deepEqual(source.metadata,tetra().metadata);
    await app.evaluate(({ipcMain})=>{const original=ipcMain._invokeHandlers.get('engine');globalThis.springGate={armed:false,held:false};ipcMain.removeHandler('engine');ipcMain.handle('engine',async function(event,request,...args){const result=await original.call(this,event,request,...args),g=globalThis.springGate;if(g.armed&&request.op===g.op){g.armed=false;g.held=true;await new Promise(resolve=>{g.release=resolve;});g.held=false;}return result;});});
    const arm=op=>app.evaluate((_electron,op)=>{globalThis.springGate.armed=true;globalThis.springGate.op=op;},op),held=()=>app.evaluate(()=>new Promise((resolve,reject)=>{const deadline=Date.now()+30000,t=setInterval(()=>{if(globalThis.springGate.held){clearInterval(t);resolve();}else if(Date.now()>deadline){clearInterval(t);reject(Error('Actual native spring reply gate not reached.'));}},10);})),release=()=>app.evaluate(()=>globalThis.springGate.release());
    const constraints=async value=>{await construct();const area=page.locator('#spring-constraints');await area.evaluate(n=>n.closest('details').open=true);await area.fill(JSON.stringify(value));await area.dispatchEvent('change');};
    const preview=async()=>{await construct();await page.locator('#preview-spring').click();await done();};
    await construct();await page.locator('#spring-edge-length').fill('sqrt(1)');await page.locator('#spring-evaluations').fill('2*250');await preview();await page.waitForFunction(()=>document.getElementById('spring-result').textContent.includes('Targets satisfied'));assert.equal(await page.locator('#adopt-spring').isEnabled(),true);
    assert.equal(signature(doc((await save('read-only-preview')).project)),signature(doc(sourceSaved.project)));
    await page.locator('#adopt-spring').click();await done();const built=await save('adopted'),result=active(built.project).model;verifyResult(result,source);const node=verifyHistory(doc(built.project),source);await page.screenshot({path:path.join(folder,'spring-adopted.png')});checks.push('actual read-only expression preview, explicit adoption, independent tetrahedron metric/volume, literal IDs/cycles/RGBA/null/units');
    await page.locator('#undo').click();await done();assert.equal(signature(active((await save('undo')).project).model),signature(source));await page.locator('#redo').click();await done();assert.equal(signature(active((await save('redo')).project).model),signature(result));
    await disclose('history-settings');await more(()=>page.locator('#history-replay').click());verifyResult(active((await save('replayed')).project).model,source);
    await disclose('history-settings');await page.locator('#history-branch').click();await page.locator('#history-parameters').fill(JSON.stringify({solver:{edge_length:2}}));await more(()=>page.locator('#history-parameters-apply').click());const branched=await save('branched');verifyResult(active(branched.project).model,source,{length:2});assert.equal(verifyHistory(doc(branched.project),source).parent,node.parent);await open(branched.file);assert.equal(signature(doc((await save('reopened')).project)),signature(doc(branched.project)));checks.push('actual Undo/Redo, original-parent native Branch, Replay and complete Save/Open');
    await open(sourceSaved.file);await constraints({pins:pins(source)});await preview();await page.waitForFunction(()=>document.getElementById('spring-result').textContent.includes('Targets unresolved'));assert.equal(await page.locator('#adopt-spring').isEnabled(),false);await page.locator('#spring-accept-near-miss').check();await page.locator('#spring-accept-near-miss').dispatchEvent('change');assert.equal(await page.locator('#adopt-spring').isEnabled(),true);await page.locator('#adopt-spring').click();await done();verifyResult(active((await save('accepted-unresolved')).project).model,source,{satisfied:false});checks.push('actual fixed conflicting targets remain unresolved and require explicit valid realization acceptance; no uniformity claim');
    await open(sourceSaved.file);await constraints({pins:source.vertices.map((_,vertex)=>({vertex,position:[0,0,0]}))});await preview();await page.waitForFunction(()=>document.getElementById('spring-result').textContent.includes('Invalid realization'));assert.equal(await page.locator('#adopt-spring').isEnabled(),false);assert.equal(signature(doc((await save('invalid-preview')).project)),signature(doc(sourceSaved.project)));checks.push('actual rank-collapsed constrained preview never publishes a model or history');
    await open(sourceSaved.file);await constraints({});await arm('spring-relaxation-preview');await page.locator('#preview-spring').click();await held();await page.locator('#cancel-spring').click();await release();await done();assert.equal(signature(doc((await save('canceled-preview')).project)),signature(doc(sourceSaved.project)));assert.equal(await page.locator('#adopt-spring').isEnabled(),false);checks.push('actual canceled already-computed native preview reply cannot enable stale adoption');
    await preview();await arm('recipe-run');await page.locator('#adopt-spring').click();await held();await open(branched.file,{pending:true});await release();await done();assert.equal(signature(doc((await save('late-adoption')).project)),signature(doc(branched.project)));checks.push('actual source/workspace replacement fences an already-computed native adoption before synchronous app publication');
    await open(sourceSaved.file);await disclose('animation-settings');for(const [id,value] of [['animation-duration','1'],['animation-fps','2']]){await page.locator('#'+id).fill(value);await page.locator('#'+id).dispatchEvent('change');}await page.locator('#animation-rotation').click();await page.locator('#animation-target').selectOption('base');
    await constraints({});await preview();await arm('recipe-run');await page.locator('#adopt-spring').click();await held();await disclose('animation-settings');
    await app.evaluate(({dialog})=>{globalThis.springExportHeld=false;dialog.showSaveDialog=()=>new Promise(resolve=>{globalThis.springExportHeld=true;globalThis.springExportRelease=()=>resolve({canceled:true});});});await page.locator('#animation-png').click();await page.waitForFunction(()=>!document.getElementById('animation-cancel').hidden);await app.evaluate(()=>new Promise((resolve,reject)=>{const deadline=Date.now()+10000,t=setInterval(()=>{if(globalThis.springExportHeld){clearInterval(t);resolve();}else if(Date.now()>deadline){clearInterval(t);reject(Error('Export dialog gate not reached.'));}},10);}));await release();await page.waitForFunction(()=>document.getElementById('cancel-spring').hidden);assert.equal(await page.locator('#preview-spring').isEnabled(),false);assert.equal(await page.locator('#adopt-spring').isEnabled(),false);await page.locator('#animation-cancel').click();await app.evaluate(()=>globalThis.springExportRelease());await done();await page.waitForFunction(()=>!document.getElementById('animation-png').disabled);assert.equal(signature(active((await save('export-fenced')).project).model),signature(source));checks.push('actual export beginning after native adoption computation blocks publication and restores coherent source; export UI state may legitimately change');
    await open(sourceSaved.file);await constraints({});await preview();await page.locator('#adopt-spring').click();await done();verifyResult(active((await save('recovered')).project).model,source);checks.push('actual successful recovery after invalid preview, cancel, source switch and export fences');
    assert.deepEqual(errors,[]);for(const f of files)assert.equal(hash(await fs.readFile(f.file)),f.sha256);await page.screenshot({path:path.join(folder,'spring-workspace.png')});
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,scope:'spring/0.1 source-owned workflow; full CON14/installed Stella comparison unqualified',checks,pageErrors:errors,files,hidden:runtime.hidden,packaged:Boolean(runtime.packaged),developmentPythonUnavailable:Boolean(runtime.packaged),version:await app.evaluate(({app})=>app.getVersion()),runtimeMainSha256:hash(runtime.entry),seconds:(performance.now()-started)/1000},null,2));console.log(`Spring smoke PASS: ${checks.length} groups. Artifacts: ${folder}`);
  }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors,diagnostic:await page?.evaluate(()=>({status:document.getElementById('status')?.textContent,toast:document.getElementById('toast')?.textContent,preview:document.getElementById('spring-result')?.textContent,statusTrace:window.springStatuses})).catch(()=>null)},null,2));console.error('Artifacts:',folder);throw error;}
  finally{await app.evaluate(({app})=>{globalThis.springGate?.release?.();globalThis.springExportRelease?.();app.exit(0);}).catch(()=>{});}
}
if(require.main===module){if(process.argv.includes('--native-self-test'))nativeSelfTest().catch(e=>{console.error(e);process.exitCode=1;});else if(process.argv.includes('--self-test'))selfTest();else main().catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={tetra,sourceDocument,project,pins,verifyResult,verifyHistory};
