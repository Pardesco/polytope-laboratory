// Actual parallel-layer UI qualification. Authoring/self-tests launch no app.
// GUI execution requires a matching hidden runtime canary and root HWND watcher.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),root=path.resolve(__dirname,'..');
const hash=x=>createHash('sha256').update(x).digest('hex'),clone=x=>structuredClone(x);
const doc=p=>p.documents[p.active],active=p=>doc(p).states[doc(p).cursor];
const counts=m=>['vertices','edges','faces','cells'].map(k=>m[k].length);
const geometry=m=>Object.fromEntries(['dimension','embeddingDimension','vertices','edges','faces','cells','fingerprint'].map(k=>[k,m[k]]));
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const ids=a=>[...a].sort((a,b)=>a-b).join(','),pointKey=p=>p.map(x=>x===0?0:x).join(',');
const colorByte={encoding:'byte',values:[20,50,210,128]},colorUnit={encoding:'unit',values:[.1,.4,.7,.3]};
// Literal expected matrices are independent of the UI expression parser.
const matrixExpressionCases=[
  {name:'quarter-turn',heightText:'sqrt(4)',height:2,matrix:[[0,-1,0],[1,0,0],[0,0,1]],
    matrixText:'min(0,max(-1,0)), -sind(90), 0\ncosd(0), 0, 0\n0, 0, sqrt(1)',
    terms:['min(0,max(-1,0))','-sind(90)','0','cosd(0)','0','0','0','0','sqrt(1)']},
  {name:'reflection',heightText:'-sqrt(4)',height:-2,matrix:[[-1,0,0],[0,1,0],[0,0,1]],
    matrixText:'-cosd(0), min(0,max(-1,0)), 0\n0; sind(90); 0\n0 0 1',
    terms:['-cosd(0)','min(0,max(-1,0))','0','0','sind(90)','0','0','0','1']},
].map(c=>({...c,translation:[0,0,0],translationTexts:['min(0,max(-1,0))','sind(0)','0']}));
function model(id,name,dimension,vertices,faces){
  const edges=new Map();for(const f of faces)for(let i=0;i<f.length;i++)edges.set(ids([f[i],f[(i+1)%f.length]]),[f[i],f[(i+1)%f.length]].sort((a,b)=>a-b));
  return {id,name,dimension,embeddingDimension:dimension,interpretation:'generalized-complex',vertices,edges:[...edges.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),faces,cells:[],numeric:{mode:'float64-approximate',certified:false},metadata:{fixture:{author:'independent layer workflow',preserve:['coordinates','cycles','RGBA']}}};
}
function cube(){
  const m=model('layer-cube-source','Literal layer cube',3,[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]);
  m.metadata.offColors={faces:[clone(colorByte),null,null,null,null,clone(colorUnit)],cells:[]};return m;
}
function square(){const m=model('layer-square-memory','Literal square top',2,[[-1,-1],[1,-1],[1,1],[-1,1]],[[0,1,2,3]]);m.metadata.offColors={faces:[clone(colorUnit)],cells:[]};return m;}
function tetra(){const m=model('layer-tetra-memory','Literal tetrahedron top',3,[[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]],[[1,2,3],[0,3,2],[0,1,3],[0,2,1]]);m.metadata.offColors={faces:[clone(colorUnit),clone(colorByte),null,null],cells:[]};return m;}
function nonconvex(){
  const n=5,vertices=[];for(const z of [-1,1])for(let i=0;i<n;i++)vertices.push([Math.cos(2*Math.PI*i/n),Math.sin(2*Math.PI*i/n),z]);
  const cycle=[0,2,4,1,3],faces=[[...cycle].reverse(),cycle.map(i=>i+n)];
  for(let i=0;i<n;i++){const a=cycle[i],b=cycle[(i+1)%n];faces.push([a,b,b+n,a+n]);}
  return model('layer-star-refusal','Closed literal star prism',3,vertices,faces);
}
function canonicalCycle(c){const candidates=[];for(const f of [c,[...c].reverse()])for(let i=0;i<c.length;i++)candidates.push([...f.slice(i),...f.slice(0,i)].join(','));return candidates.sort()[0];}
const determinant3=a=>a[0][0]*(a[1][1]*a[2][2]-a[1][2]*a[2][1])-a[0][1]*(a[1][0]*a[2][2]-a[1][2]*a[2][0])+a[0][2]*(a[1][0]*a[2][1]-a[1][1]*a[2][0]);
function rank(points){
  const rows=points.slice(1).map(p=>p.map((x,i)=>x-points[0][i]));let r=0;
  for(let column=0;column<4&&r<rows.length;column++){let pivot=r;for(let i=r+1;i<rows.length;i++)if(Math.abs(rows[i][column])>Math.abs(rows[pivot][column]))pivot=i;if(Math.abs(rows[pivot][column])<1e-8)continue;[rows[r],rows[pivot]]=[rows[pivot],rows[r]];const v=rows[r][column];for(let c=column;c<4;c++)rows[r][c]/=v;for(let i=r+1;i<rows.length;i++){const v=rows[i][column];for(let c=column;c<4;c++)rows[i][c]-=v*rows[r][c];}r++;}return r;
}
function verifyHullIncidence(m){
  // Independent exhaustive supporting planes for SMALL, well-scaled fixtures.
  // It does not call the native hull, derive incidence from native cells, or
  // certify arbitrary near-degenerate floating-point inputs.
  assert.ok(m.vertices.length<=16);const p=m.vertices,n=p.length,facets=new Map(),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
  for(let a=0;a<n;a++)for(let b=a+1;b<n;b++)for(let c=b+1;c<n;c++)for(let d=c+1;d<n;d++){
    const rows=[b,c,d].map(i=>p[i].map((x,j)=>x-p[a][j])),normal=Array.from({length:4},(_,column)=>(column%2?-1:1)*determinant3(rows.map(row=>row.filter((_,j)=>j!==column)))),size=Math.hypot(...normal);if(size<1e-8)continue;
    const unit=normal.map(x=>x/size),offset=dot(unit,p[a]),distances=p.map(q=>dot(unit,q)-offset);if(distances.some(x=>x>1e-8)&&distances.some(x=>x< -1e-8))continue;
    const vertices=distances.flatMap((x,i)=>Math.abs(x)<1e-8?[i]:[]);if(vertices.length===n)continue;facets.set(ids(vertices),vertices);
  }
  assert.deepEqual(m.cells.map(c=>ids(new Set(c.flatMap(f=>m.faces[f])))).sort(),[...facets.keys()].sort());
  const sets=[...facets.values()].map(v=>new Set(v)),faces=new Set(),edges=[];
  for(let i=0;i<sets.length;i++)for(let j=i+1;j<sets.length;j++){const intersection=[...sets[i]].filter(v=>sets[j].has(v));if(intersection.length>=3&&rank(intersection.map(v=>p[v]))===2)faces.add(ids(intersection));}
  assert.deepEqual(m.faces.map(ids).sort(),[...faces].sort());
  for(let a=0;a<n;a++)for(let b=a+1;b<n;b++){const containing=sets.filter(s=>s.has(a)&&s.has(b));if(containing.length&&[...containing[0]].filter(v=>containing.every(s=>s.has(v))).length===2)edges.push(ids([a,b]));}
  assert.deepEqual(m.edges.map(ids).sort(),edges.sort());
}
function verifyMaps(m,base,top){
  assert.equal(m.dimension,4);assert.equal(m.interpretation,'convex-polytope');assert.equal(m.numeric.certified,false);
  const info=m.metadata.convexLayerJoin;assert.equal(info.algorithmVersion,'0.1.0');assert.deepEqual(info.nonextremeInputPointIds,[]);
  assert.deepEqual(info.layers[0].sourceSnapshot,base);if(top)assert.deepEqual(info.layers[1].sourceSnapshot,top);
  assert.deepEqual([...info.inputToOutputVertexIds].sort((a,b)=>a-b),Array.from({length:m.vertices.length},(_,i)=>i));
  const colored=new Set();for(const layer of info.layers){
    const source=layer.sourceSnapshot,mapping=layer.maps;assert.equal(layer.sourceModelId,source.id);assert.match(layer.sourceSnapshotSha256,/^[a-f0-9]{64}$/);
    source.vertices.forEach((p,i)=>{const xyz=[...p];while(xyz.length<3)xyz.push(0);const q=layer.transform.matrix.map((row,j)=>row.reduce((s,x,k)=>s+x*xyz[k],0)+layer.transform.translation[j]);q.push((layer.role==='base'?-.5:.5)*info.height);q.forEach((x,j)=>near(m.vertices[mapping.vertices[i]][j],x));});
    source.edges.forEach((e,i)=>assert.equal(ids(m.edges[mapping.edges[i]]),ids(e.map(v=>mapping.vertices[v]))));
    source.faces.forEach((f,i)=>{const target=mapping.faces[i];assert.equal(canonicalCycle(m.faces[target]),canonicalCycle(f.map(v=>mapping.vertices[v])));assert.deepEqual(m.metadata.offColors.faces[target],source.metadata?.offColors?.faces?.[i]??null);colored.add(target);});
    if(source.dimension===3){assert.equal(layer.capCellIds.length,1);assert.equal(ids(m.cells[layer.capCellIds[0]]),ids(mapping.faces));}else assert.deepEqual(layer.capCellIds,[]);
  }
  m.metadata.offColors.faces.forEach((c,i)=>{if(!colored.has(i))assert.equal(c,null);});assert.ok(m.metadata.offColors.cells.every(c=>c===null));
  const ridges=Array(m.faces.length).fill(0);for(const c of m.cells)for(const f of c)ridges[f]++;assert.ok(ridges.every(n=>n===2));
  assert.ok(m.measure.content>0&&m.measure.boundaryMeasure>0);
  verifyHullIncidence(m);
}
function verifyTesseract(m){
  assert.deepEqual(counts(m),[16,32,24,8]);assert.equal(new Set(m.vertices.map(pointKey)).size,16);
  m.vertices.forEach(p=>p.forEach(x=>near(Math.abs(x),1)));
  const expectedEdges=[];for(let a=0;a<16;a++)for(let b=a+1;b<16;b++)if(m.vertices[a].filter((x,i)=>x!==m.vertices[b][i]).length===1)expectedEdges.push(ids([a,b]));
  assert.deepEqual(m.edges.map(ids).sort(),expectedEdges.sort());
  const faces=[];for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)for(const x of [-1,1])for(const y of [-1,1])faces.push(ids(m.vertices.flatMap((p,i)=>p[a]===x&&p[b]===y?[i]:[])));
  assert.deepEqual(m.faces.map(ids).sort(),faces.sort());
  for(const f of m.faces)for(let i=0;i<f.length;i++)assert.ok(expectedEdges.includes(ids([f[i],f[(i+1)%f.length]])));
  const cells=[];for(let a=0;a<4;a++)for(const x of [-1,1])cells.push(ids(m.vertices.flatMap((p,i)=>p[a]===x?[i]:[])));
  assert.deepEqual(m.cells.map(c=>ids(new Set(c.flatMap(f=>m.faces[f])))).sort(),cells.sort());near(m.measure.content,16);near(m.measure.boundaryMeasure,64);
}
function verifyPyramid(m){
  assert.deepEqual(counts(m),[9,20,18,7]);const info=m.metadata.convexLayerJoin,base=info.layers[0],top=info.layers[1],apex=top.maps.vertices[0];
  const expected=[...base.maps.edges.map(i=>ids(m.edges[i])),...base.maps.vertices.map(v=>ids([v,apex]))];assert.deepEqual(m.edges.map(ids).sort(),expected.sort());
  assert.equal(top.dimension,0);assert.equal(top.sourceSnapshot.format,'polytope-layer-source');assert.deepEqual(top.sourceSnapshot.faces,[]);
}
function verifyFit(m,height,kind){
  const fit=m.metadata.strictLayerFit,strict=fit.strictPredicateEvidence;near(fit.resolvedPositiveHeight,height);near(m.metadata.convexLayerJoin.height,height);near(fit.targetEdgeLength,2);assert.equal(fit.certified,false);assert.equal(m.provenance.operation,'fit-strict-layer-join');
  assert.equal(strict.status,'passed');assert.equal(strict.strictPredicatesPassed,true);assert.equal(strict.certified,false);assert.equal(strict.sourceModelId,m.id);assert.equal(strict.sourceFingerprint,m.fingerprint);
  for(const check of Object.values(strict.checks))assert.equal(check.passed,true);
  for(const [a,b] of m.edges)near(Math.hypot(...m.vertices[a].map((x,i)=>x-m.vertices[b][i])),2);
  const center=kind==='point'?[0,0,0,-1.5]:[0,0,0,0];for(const p of m.vertices)near(Math.hypot(...p.map((x,i)=>x-center[i])),2);
}
async function guardRuntime(){
  const hidden=process.env.POLYTOPE_TEST_MODE==='hidden-no-focus';
  if(hidden&&process.env.POLYTOPE_TEST_VISIBLE==='1')throw Error('Visible opt-in conflicts with hidden qualification.');
  if(!hidden&&(process.env.POLYTOPE_TEST_MODE!==undefined||process.env.POLYTOPE_TEST_VISIBLE!=='1'))throw Error('Use root-qualified hidden-no-focus mode or explicitly opt into normal visible qualification with POLYTOPE_TEST_VISIBLE=1.');
  const selected=await require('./hidden-runtime.cjs').hiddenRuntime();
  const packaged=process.env.POLYTOPE_TEST_EXECUTABLE;
  const entry=packaged?require('@electron/asar').extractFile(path.join(path.dirname(packaged),'resources','app.asar'),'desktop/main.cjs'):await fs.readFile(path.join(root,'desktop','main.cjs'));
  if(!hidden)return {packaged,entry,hidden:false,runtime:selected};
  if(!process.env.POLYTOPE_HIDDEN_CANARY)throw Error('Provide a passing matching POLYTOPE_HIDDEN_CANARY and run beneath the root native HWND watcher.');
  const text=entry.toString('utf8');for(const marker of ["qualificationMode==='hidden-no-focus'",'show:false,focusable:false,skipTaskbar:true',"qualificationError('app.focus')"])assert.ok(text.includes(marker),'Selected runtime lacks hidden activation guards.');
  const canary=JSON.parse(await fs.readFile(path.resolve(process.env.POLYTOPE_HIDDEN_CANARY),'utf8'));
  assert.equal(canary.passed,true);assert.equal(canary.mainSha256,hash(entry),'Selected runtime differs from the qualified hidden canary.');assert.equal(canary.qualification?.mode,'hidden-no-focus');
  assert.equal(Boolean(canary.packaged),selected.packaged);assert.equal(canary.version,selected.version);
  assert.equal(canary.executablePath??canary.nativeWatch?.image,selected.executablePath);
  if(selected.packaged){assert.equal(canary.executableSha256,selected.executableSha256);assert.equal(canary.archiveSha256,selected.archiveSha256);}
  assert.equal(canary.nativeWatch?.violations,0);assert.ok(canary.nativeWatch?.checks>=10);assert.equal(canary.nativeWatch?.eventHooksArmed,true);assert.equal(canary.initialWindows?.[0]?.visible,false);assert.equal(canary.finalWindows?.[0]?.visible,false);
  return {packaged,entry,hidden:true,runtime:selected,canaryPath:path.resolve(process.env.POLYTOPE_HIDDEN_CANARY)};
}
async function main(){
  const runtime=await guardRuntime(); // Must run before requiring/launching Electron.
  const {_electron:electron}=require('playwright'),started=performance.now(),artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));
  await fs.mkdir(artifacts,{recursive:true});const folder=await fs.mkdtemp(path.join(artifacts,runtime.packaged?'layer-join-packaged-smoke-':'layer-join-smoke-')),profile=path.join(folder,'profile');
  await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
  const checks=[],errors=[],files=[];let page,serial=0;
  try{
    assert.equal((await app.evaluate(({app})=>app.polytopeQualification))?.mode,runtime.hidden?'hidden-no-focus':undefined);page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>document.getElementById('layer-join-settings')&&document.getElementById('model-name').textContent==='Tesseract');
    await page.evaluate(()=>{window.layerStatuses=[];new MutationObserver(()=>window.layerStatuses.push(document.getElementById('status').textContent)).observe(document.getElementById('status'),{childList:true,subtree:true,characterData:true});});
    // Delay only an already-computed real native transport response. Never
    // replace mathematics, authorization, validation, or the handler's errors.
    await app.evaluate(({ipcMain})=>{const original=ipcMain._invokeHandlers?.get('engine');if(typeof original!=='function')throw Error('Actual engine handler unavailable for reply-gate proof.');
      globalThis.layerNativeGate={armed:false,held:false,sequence:0,jobs:[]};ipcMain.removeHandler('engine');ipcMain.handle('engine',async function(event,request,...args){
        const g=globalThis.layerNativeGate;if(request.op==='expression-batch'||request.op==='recipe-run'){g.jobs.push({sequence:++g.sequence,request:structuredClone(request)});if(g.jobs.length>128)g.jobs.shift();}
        const result=await original.call(this,event,request,...args);
        if(g.armed&&request.op===g.op&&(request.op!=='recipe-run'||request.params?.operation==='convex-layer-join')){g.armed=false;g.held=true;await new Promise(resolve=>{g.release=resolve;});g.held=false;}return result;
      });});
    const jobMark=()=>app.evaluate(()=>globalThis.layerNativeGate.sequence),jobs=mark=>app.evaluate((_electron,mark)=>globalThis.layerNativeGate.jobs.filter(j=>j.sequence>mark).map(j=>j.request),mark);
    const arm=op=>app.evaluate((_electron,op)=>{const g=globalThis.layerNativeGate;if(g.held||g.armed)throw Error('Previous layer reply gate remains active.');g.op=op;g.armed=true;},op);
    const held=()=>app.evaluate(()=>new Promise((resolve,reject)=>{const deadline=Date.now()+30000,t=setInterval(()=>{if(globalThis.layerNativeGate.held){clearInterval(t);resolve();}else if(Date.now()>deadline){clearInterval(t);reject(Error('Actual layer native reply gate was not reached.'));}},10);}));
    const release=()=>app.evaluate(()=>{if(!globalThis.layerNativeGate.held)throw Error('No native layer reply is held.');globalThis.layerNativeGate.release();});
    const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
    const disclose=async id=>{if(!await page.locator('#'+id).evaluate(n=>n.open))await page.locator('#'+id+' > summary').click();};
    const construct=async()=>{if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();await disclose('layer-join-settings');if(!await page.locator('#layer-join-settings details').evaluate(n=>n.open))await page.locator('#layer-join-settings details > summary').click();};
    const save=async label=>{await done();const file=path.join(folder,`${String(++serial).padStart(2,'0')}-${label}.polyproj`);await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.locator('#save').click();await page.waitForFunction(file=>window.layerStatuses.includes('Saved '+file),file);await done();const bytes=await fs.readFile(file);files.push({file,sha256:hash(bytes)});return {file,project:JSON.parse(bytes)};};
    const settle=async()=>{await done();await page.keyboard.press('Escape');await page.evaluate(async()=>{document.activeElement?.blur?.();for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});await done();};
    const open=async file=>{await settle();await page.evaluate(()=>window.layerStatuses=[]);await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#open').click();await page.waitForFunction(file=>window.layerStatuses.includes('Opened '+file)||window.layerStatuses.some(s=>s.includes('Workspace changed while opening')),file);assert.ok(await page.evaluate(file=>window.layerStatuses.includes('Opened '+file),file),'Project open must succeed without a workspace-change discard.');await settle();};
    const fixture=async(label,project)=>{const file=path.join(folder,label+'.polyproj'),bytes=Buffer.from(JSON.stringify(project));await fs.writeFile(file,bytes);files.push({file,sha256:hash(bytes)});return file;};
    const replace=async(label,project,source)=>{const p=clone(project);p.documents=[clone(doc(project))];p.active=0;const d=doc(p);d.id='layer-source-document';d.cursor=0;d.states=[{model:clone(source),notes:'Preserved literal layer source',view:{coordinateUnit:'mm',surfaceOpacity:.75,sectionNormal:Array(source.dimension).fill(0).map((_,i)=>i===source.dimension-1?1:0),sectionOffset:.25,entity:0,derivedMode:'section'}}];delete d.operationHistory;const file=await fixture(label,p);await open(file);return save(label+'-native');};
    const configureJoin=async(top='current',height='2',transform,fit=false)=>{await construct();await page.locator('#layer-join-fit').uncheck();await page.locator('#layer-join-top').selectOption(top);await page.locator('#layer-join-height').fill(fit?'THIS_DISABLED_VALUE_MUST_NOT_BE_EVALUATED':height);if(fit){await page.locator('#layer-join-fit').check();assert.equal(await page.locator('#layer-join-height').isEnabled(),false);}if(top==='point'||top==='edge')for(const axis of ['x','y','z'])await page.locator('#layer-join-'+axis).fill(top==='edge'&&axis==='x'?'-.5':'0');if(top==='edge')for(const axis of ['x','y','z'])await page.locator('#layer-join-end-'+axis).fill(axis==='x'?'.5':'0');if(transform){await page.locator('#layer-join-transform').check();await page.locator('#layer-join-matrix').fill(transform.matrixText??transform.matrix.flat().join(' '));for(let i=0;i<3;i++)await page.locator('#layer-join-t'+['x','y','z'][i]).fill(String(transform.translationTexts?.[i]??transform.translation[i]));}else await page.locator('#layer-join-transform').uncheck();};
    const join=async(top='current',height='2',transform,fit=false)=>{await configureJoin(top,height,transform,fit);await page.locator('#make-layer-join').click();await page.waitForFunction(()=>document.getElementById('dimension-badge').textContent==='4D');await done();return save((fit?'fitted-':'joined-')+top.replace(':','-'));};
    const newDoc=async callback=>{const n=await page.locator('#document-tabs > button').count();await callback();await page.waitForFunction(n=>document.getElementById('document-tabs').children.length===n+1,n);await done();};
    await done();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1484,900));
    const initial=(await save('initial')).project,source=await replace('literal-cube',initial,cube()),base=clone(active(source.project).model);
    const copied=await join();let result=active(copied.project).model;verifyMaps(result,base,base);verifyTesseract(result);assert.deepEqual(doc(copied.project).states[0].model,base);assert.equal(doc(copied.project).states.length,2);assert.equal(active(copied.project).view.coordinateUnit,'mm');assert.deepEqual(active(copied.project).view.sectionNormal,[0,0,0,1]);
    const node=doc(copied.project).operationHistory.nodes.at(-1);assert.equal(node.op,'convex-layer-join');assert.equal(node.algorithmVersion,'0.1.0');assert.deepEqual(node.params,{top:base,height:2});
    await page.screenshot({path:path.join(folder,'cube-copy-tesseract.png')});checks.push('current cube copy produces every independently checked tesseract vertex/edge/face/cell; source cycles, byte/unit RGBA and units retained');

    await page.locator('#undo').click();await page.waitForFunction(()=>document.getElementById('dimension-badge').textContent==='3D');assert.deepEqual(active((await save('undo')).project).model,base);await page.locator('#redo').click();await page.waitForFunction(()=>document.getElementById('dimension-badge').textContent==='4D');assert.deepEqual(geometry(active((await save('redo')).project).model),geometry(result));
    await disclose('history-settings');await newDoc(()=>page.locator('#history-replay').click());const replay=await save('replay');assert.deepEqual(geometry(active(replay.project).model),geometry(result));assert.deepEqual(active(replay.project).model.metadata,result.metadata);
    await disclose('history-settings');await page.locator('#history-branch').click();await page.locator('#history-parameters').fill(JSON.stringify({...node.params,height:-3,top_translation:[.1,.2,.3]}));await newDoc(()=>page.locator('#history-parameters-apply').click());const branch=await save('branch');verifyMaps(active(branch.project).model,base,base);assert.equal(active(branch.project).model.metadata.convexLayerJoin.height,-3);await open(branch.file);const reopened=await save('reopened');assert.deepEqual(doc(reopened.project).operationHistory,doc(branch.project).operationHistory);assert.deepEqual(active(reopened.project).model.metadata,active(branch.project).model.metadata);checks.push('undo/redo, native Replay and parameter Branch preserve literal source and ownership; Save/Open retains recorded algorithm0.1 and full evidence');

    const compact=[];for(const top of ['point','edge']){await open(source.file);const saved=await join(top);const m=active(saved.project).model;verifyMaps(m,base);if(top==='point')verifyPyramid(m);else assert.deepEqual(counts(m),[10,21,18,7]);const recorded=doc(saved.project).operationHistory.nodes.at(-1).params.top;assert.equal(recorded.kind,top);assert.match(recorded.source_id,/^[a-f0-9-]{36}$/i);assert.equal(m.metadata.convexLayerJoin.layers[1].sourceModelId,recorded.source_id);await disclose('history-settings');await newDoc(()=>page.locator('#history-replay').click());assert.deepEqual(geometry(active((await save(top+'-replay')).project).model),geometry(m));compact.push(recorded.source_id);}
    assert.notEqual(...compact);checks.push('point pyramid and edge layer join retain actual0D/1D compact snapshots with distinct stable IDs through native replay');

    await replace('tetra-memory-source',source.project,tetra());await disclose('memories-settings');await page.locator('#memory-slot').selectOption('1');await page.locator('#memory-store').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('in memory 1'));const storedTetra=await save('tetra-memory');
    await replace('square-memory-source',storedTetra.project,square());await disclose('memories-settings');await page.locator('#memory-slot').selectOption('2');await page.locator('#memory-store').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('in memory 2'));const storedBoth=await save('two-memories');const bankSource=await replace('cube-with-memories',storedBoth.project,base),bank=clone(bankSource.project.memories),topSquare=bank.slots[1].state.model,topTetra=bank.slots[0].state.model;
    for(const [slot,top,expected] of [['memory:2',topSquare,[12,24,19,7]],['memory:1',topTetra,[12,34,34,12]]]){await open(bankSource.file);const saved=await join(slot);verifyMaps(active(saved.project).model,base,top);assert.deepEqual(counts(active(saved.project).model),expected);assert.deepEqual(saved.project.memories,bank);assert.deepEqual(doc(saved.project).states[0].model,base);}
    await open(bankSource.file);const reflected=await join('memory:2','-2',{matrix:[[-1,0,0],[0,1,0],[0,0,1]],translation:[.1,.2,.3]});const rm=active(reflected.project).model;verifyMaps(rm,base,topSquare);near(rm.metadata.convexLayerJoin.layers[1].transform.determinant,-1);assert.deepEqual(reflected.project.memories,bank);assert.equal(rm.metadata.convexLayerJoin.height,-2);checks.push('actual numbered polygon/3D memories remain immutable; signed height, explicit reflection and XYZ translation agree with all source-to-output coordinates');

    for(const [top,height] of [['current',2],['point',1]]){
      await open(source.file);const fitted=await join(top,'unused',top==='current'?{matrix:[[-1,0,0],[0,1,0],[0,0,1]],translation:[0,0,0]}:undefined,true),fm=active(fitted.project).model;verifyMaps(fm,base,top==='current'?base:undefined);verifyFit(fm,height,top);if(top==='current')verifyTesseract(fm);else verifyPyramid(fm);
      const fn=doc(fitted.project).operationHistory.nodes.at(-1);assert.equal(fn.op,'fit-strict-layer-join');assert.equal(fn.algorithmVersion,'0.1.0');assert.ok(!Object.hasOwn(fn.params,'height'));assert.deepEqual(doc(fitted.project).states[0].model,base);assert.equal(active(fitted.project).view.coordinateUnit,'mm');
      await construct();await page.locator('#analyze-strict-segmentotope').click();await page.waitForFunction(()=>document.getElementById('strict-segmentotope-result').dataset.status==='passed');await done();const text=await page.locator('#strict-segmentotope-result').textContent();assert.ok(text.includes('Numerical predicates passed')&&text.includes('not a certificate'));for(const label of ['Two W layers: pass','Equal edges: pass','Common hypersphere: pass','Ordered regular faces: pass'])assert.ok(text.includes(label));
      const analyzed=await save('fitted-'+top+'-analyzed');assert.deepEqual(doc(analyzed.project).states,doc(fitted.project).states);assert.deepEqual(doc(analyzed.project).operationHistory,doc(fitted.project).operationHistory);
      await disclose('history-settings');await newDoc(()=>page.locator('#history-replay').click());const replayed=await save('fitted-'+top+'-replayed');assert.deepEqual(geometry(active(replayed.project).model),geometry(fm));verifyFit(active(replayed.project).model,height,top);await open(analyzed.file);const reopened=await save('fitted-'+top+'-reopened');assert.deepEqual(active(reopened.project).model.metadata,fm.metadata);assert.deepEqual(doc(reopened.project).operationHistory,doc(analyzed.project).operationHistory);
    }
    for(const [top,message] of [['memory:1','unequal edges'],['point','differing lateral XYZ distances']]){
      await open(bankSource.file);const beforeFit=(await save('before-fit-refusal')).project;await construct();await page.locator('#layer-join-top').selectOption(top);await page.locator('#layer-join-fit').check();await page.locator('#layer-join-transform').uncheck();if(top==='point')for(const axis of ['x','y','z'])await page.locator('#layer-join-'+axis).fill(axis==='x'?'.1':'0');await page.evaluate(()=>document.getElementById('toast').hidden=true);await page.locator('#make-layer-join').click();await page.waitForFunction(message=>!document.getElementById('toast').hidden&&document.getElementById('toast').textContent.includes(message),message);await done();const refused=(await save('fit-refused-'+top.replace(':','-'))).project;assert.deepEqual(doc(refused).states,doc(beforeFit).states);assert.deepEqual(doc(refused).operationHistory,doc(beforeFit).operationHistory);assert.deepEqual(refused.memories,beforeFit.memories);assert.equal(refused.documents.length,beforeFit.documents.length);
    }
    checks.push('fitted height ignores disabled manual expression, resolves cube-copy h2 and origin-point h1 with independent equal-edge/hypersphere checks; read-only numerical predicates state not a certificate; fit Replay/Open preserves evidence, unequal layers/off-center point refuse atomically');

    await open(source.file);const before=(await save('before-invalid-input')).project;
    const refusal=async(callback,text)=>{await construct();await page.locator('#layer-join-fit').uncheck();await page.locator('#layer-join-top').selectOption('current');await page.locator('#layer-join-transform').uncheck();await page.evaluate(()=>document.getElementById('toast').hidden=true);await callback();await page.waitForFunction(text=>!document.getElementById('toast').hidden&&document.getElementById('toast').textContent.includes(text),text);await done();const p=(await save('refused')).project;assert.deepEqual(doc(p).states,doc(before).states);assert.deepEqual(doc(p).operationHistory,doc(before).operationHistory);assert.equal(p.documents.length,before.documents.length);};
    await refusal(async()=>{await page.locator('#layer-join-height').fill('0');await page.locator('#make-layer-join').click();},'nonzero');
    await refusal(async()=>{await page.locator('#layer-join-height').fill('2');await page.locator('#layer-join-top').selectOption('edge');for(const axis of ['x','y','z']){await page.locator('#layer-join-'+axis).fill('0');await page.locator('#layer-join-end-'+axis).fill('0');}await page.locator('#make-layer-join').click();},'distinct');
    const invalid=await replace('nonconvex-source',source.project,nonconvex());await construct();await page.locator('#layer-join-top').selectOption('current');await page.locator('#layer-join-height').fill('2');await page.locator('#layer-join-transform').uncheck();await page.evaluate(()=>document.getElementById('toast').hidden=true);await page.locator('#make-layer-join').click();await page.waitForFunction(()=>!document.getElementById('toast').hidden&&document.getElementById('toast').textContent.includes('ordered convex source boundary'));await done();const rejected=(await save('nonconvex-refused')).project;assert.deepEqual(doc(rejected).states,doc(invalid.project).states);assert.deepEqual(doc(rejected).operationHistory,doc(invalid.project).operationHistory);await open(source.file);verifyTesseract(active((await join()).project).model);checks.push('zero-height/coincident-edge/nonconvex boundary refusals are atomic; no source/history replacement, followed by successful recovery');

    await open(source.file);await disclose('animation-settings');for(const [id,value] of [['animation-duration','1'],['animation-fps','2']]){await page.locator('#'+id).fill(value);await page.locator('#'+id).dispatchEvent('change');}await page.locator('#animation-rotation').click();const beforeExport=(await save('before-export')).project;
    await app.evaluate(({dialog})=>{globalThis.layerHeld=false;dialog.showSaveDialog=()=>new Promise(resolve=>{globalThis.layerHeld=true;globalThis.layerRelease=()=>resolve({canceled:true});});});await disclose('animation-settings');await page.locator('#animation-target').selectOption('base');await page.locator('#animation-png').click();await page.waitForFunction(()=>!document.getElementById('animation-cancel').hidden);await app.evaluate(()=>new Promise((resolve,reject)=>{const deadline=Date.now()+5000,t=setInterval(()=>{if(globalThis.layerHeld){clearInterval(t);resolve();}else if(Date.now()>deadline){clearInterval(t);reject(Error('Export dialog stub not reached.'));}},10);}));
    for(const id of ['make-layer-join','layer-join-fit','layer-join-top','layer-join-height','layer-join-transform','layer-join-x','layer-join-matrix','analyze-strict-segmentotope'])assert.equal(await page.locator('#'+id).isEnabled(),false);
    await page.evaluate(()=>{document.getElementById('toast').hidden=true;document.getElementById('make-layer-join').dispatchEvent(new MouseEvent('click',{bubbles:true}));});await page.waitForFunction(()=>!document.getElementById('toast').hidden&&document.getElementById('toast').textContent.includes('Finish animation export'));
    await page.locator('#animation-cancel').click();await app.evaluate(()=>globalThis.layerRelease());await page.waitForFunction(()=>!document.getElementById('animation-png').disabled);await done();const afterExport=(await save('after-export')).project;assert.deepEqual(doc(afterExport).states,doc(beforeExport).states);assert.deepEqual(doc(afterExport).operationHistory,doc(beforeExport).operationHistory);assert.deepEqual(afterExport.memories,beforeExport.memories);assert.equal((await fs.readdir(folder)).filter(f=>f.startsWith('.polytope-animation-')).length,0);checks.push('held export disables construction; explicit bypass also refuses; cancellation restores complete source/view/history without staged output');

    const unitCube=cube();unitCube.metadata.coordinateUnits='mm';
    const expressionSource=await replace('expression-matrix-source',source.project,unitCube),expressionBase=clone(active(expressionSource.project).model);
    for(const c of matrixExpressionCases){
      await open(expressionSource.file);const mark=await jobMark(),joined=await join('current',c.heightText,c),m=active(joined.project).model;
      verifyMaps(m,expressionBase,expressionBase);verifyTesseract(m);assert.equal(active(joined.project).view.coordinateUnit,'mm');
      const e=m.metadata.convexLayerJoin;near(e.height,c.height);assert.deepEqual(e.layers[1].transform.matrix,c.matrix);assert.deepEqual(e.layers[1].transform.translation,c.translation);
      for(const layer of e.layers)assert.equal(layer.sourceSnapshot.metadata.coordinateUnits,'mm');
      const trace=await jobs(mark),batches=trace.filter(r=>r.op==='expression-batch');assert.equal(batches.length,1);
      assert.deepEqual(batches[0].params.expressions,[c.heightText,...c.translationTexts,...c.terms]);assert.equal(batches[0].params.mode,'real');
      const request=trace.find(r=>r.op==='recipe-run');assert.equal(request.params.operation,'convex-layer-join');
      const n=doc(joined.project).operationHistory.nodes.at(-1);assert.equal(n.algorithmVersion,'0.1.0');
      assert.deepEqual(n.params,{top:expressionBase,height:c.height,top_matrix:c.matrix,top_translation:c.translation});
      assert.deepEqual(request.params.parameters,n.params);assert.deepEqual(doc(joined.project).states[0].model,expressionBase);
      await page.screenshot({path:path.join(folder,'matrix-expression-'+c.name+'.png')});
      await disclose('history-settings');await newDoc(()=>page.locator('#history-replay').click());const replayed=await save('matrix-expression-'+c.name+'-replay');
      assert.deepEqual(geometry(active(replayed.project).model),geometry(m));assert.deepEqual(active(replayed.project).model.metadata,m.metadata);
      await open(joined.file);const opened=await save('matrix-expression-'+c.name+'-reopened');assert.deepEqual(doc(opened.project).operationHistory,doc(joined.project).operationHistory);assert.deepEqual(active(opened.project).model.metadata,m.metadata);
      checks.push(`Actual ${c.name} nine-entry expression matrix: nested commas/degree trig, one13-value batch, signed height, independent complete tesseract incidence/maps/RGBA/mm and numerical recipe Replay/Save/Open`);
    }

    for(const stage of ['expression-batch','recipe-run'])for(const mutation of ['units','form','cancel']){
      await open(expressionSource.file);await configureJoin('current',matrixExpressionCases[0].heightText,matrixExpressionCases[0]);
      const baseline=(await save('before-held-'+stage+'-'+mutation)).project,mark=await jobMark();await page.evaluate(()=>document.getElementById('toast').hidden=true);
      await arm(stage);await page.locator('#make-layer-join').click();await held();
      if(mutation==='units')await page.locator('#model-unit').selectOption('cm');
      else if(mutation==='form')await page.locator('#layer-join-matrix').evaluate((n,value)=>{n.value=value;},matrixExpressionCases[1].matrixText);
      else{await page.locator('#cancel').click();await page.waitForFunction(()=>window.layerStatuses.includes('Cancelled active computation.'));}
      await release();if(mutation!=='cancel')await page.waitForFunction(()=>!document.getElementById('toast').hidden&&/source|changed|units|numeric target/i.test(document.getElementById('toast').textContent));
      await settle();const rejected=(await save('held-'+stage+'-'+mutation+'-refused')).project;
      assert.equal(rejected.documents.length,baseline.documents.length);assert.equal(doc(rejected).cursor,doc(baseline).cursor);
      assert.deepEqual(doc(rejected).operationHistory,doc(baseline).operationHistory);assert.deepEqual(rejected.memories,baseline.memories);
      const expected=clone(doc(baseline).states);if(mutation==='units')expected[doc(baseline).cursor].view.coordinateUnit='cm';assert.deepEqual(doc(rejected).states,expected);
      assert.equal(active(rejected).model.dimension,3);assert.deepEqual(active(rejected).model,expressionBase);
      const trace=await jobs(mark);assert.equal(trace.filter(r=>r.op==='expression-batch').length,1);assert.equal(trace.filter(r=>r.op==='recipe-run').length,stage==='recipe-run'?1:0);
    }
    checks.push('Already-computed real expression and native recipe replies: changed effective units/form and global Cancel all refuse publication; intentional changes survive with source/RGBA/history/memories intact');
    await open(expressionSource.file);const recovered=await join('current',matrixExpressionCases[1].heightText,matrixExpressionCases[1]);verifyMaps(active(recovered.project).model,expressionBase,expressionBase);verifyTesseract(active(recovered.project).model);
    checks.push('A fresh real expression-matrix construction succeeds after all held-reply ownership/cancellation refusals');

    for(const file of files)assert.equal(hash(await fs.readFile(file.file)),file.sha256);assert.deepEqual(errors,[]);await page.screenshot({path:path.join(folder,'layer-join-workspace.png')});
    await fs.writeFile(path.join(folder,'native-requests.json'),JSON.stringify(await app.evaluate(()=>globalThis.layerNativeGate.jobs),null,2));
    const sourceHashes=[];for(const file of ['scripts/layer-join-smoke.cjs','ui/segmentotope-controls.mjs','ui/segmentotope-analysis-controls.mjs','ui/numeric-entry.mjs','ui/expression-entry.mjs','ui/native-source-binding.mjs','ui/history-workflow.mjs','engine/expressions.py','engine/segmentotopes.py','engine/layer_join_workflow.py','engine/strict_layer_fit.py'])sourceHashes.push({file,sha256:hash(await fs.readFile(path.join(root,file)))});
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,hidden:runtime.hidden,runtime:runtime.runtime,packaged:Boolean(runtime.packaged),developmentPythonUnavailable:Boolean(runtime.packaged),version:await app.evaluate(({app})=>app.getVersion()),runtimeMainSha256:hash(runtime.entry),canaryPath:runtime.canaryPath,checks,pageErrors:errors,files,sourceHashes,seconds:(performance.now()-started)/1000},null,2));console.log(`Layer join smoke PASS: ${checks.length} groups. Artifacts: ${folder}`);
  }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});const diagnostic=await page?.evaluate(()=>({status:document.getElementById('status')?.textContent,toast:document.getElementById('toast')?.textContent,statusTrace:window.layerStatuses,unit:document.getElementById('model-unit')?.value,matrix:document.getElementById('layer-join-matrix')?.value,dimension:document.getElementById('dimension-badge')?.textContent})).catch(()=>null);await fs.writeFile(path.join(folder,'native-requests.json'),JSON.stringify(await app.evaluate(()=>globalThis.layerNativeGate?.jobs??[]).catch(()=>[]),null,2));await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors,diagnostic},null,2));console.error('Artifacts:',folder);throw error;}
  finally{await app.evaluate(({app})=>{globalThis.layerNativeGate?.release?.();globalThis.layerRelease?.();app.exit(0);}).catch(()=>{});}
}
function selfTest(){
  const c=cube(),s=square(),star=nonconvex();assert.deepEqual(counts(c),[8,12,6,0]);assert.deepEqual(counts(s),[4,4,1,0]);assert.deepEqual(counts(tetra()),[4,6,4,0]);assert.deepEqual(counts(star),[10,15,7,0]);
  for(const m of [c,star]){const uses=new Map();for(const f of m.faces)for(let i=0;i<f.length;i++){const e=ids([f[i],f[(i+1)%f.length]]);uses.set(e,(uses.get(e)||0)+1);}assert.equal(uses.size,m.edges.length);assert.ok([...uses.values()].every(n=>n===2));}
  assert.equal(canonicalCycle([0,1,2,3]),canonicalCycle([2,1,0,3]));assert.notEqual(canonicalCycle([0,1,2,3]),canonicalCycle([0,2,1,3]));assert.deepEqual(c.metadata.offColors.faces[0],colorByte);
  for(const c of matrixExpressionCases){assert.equal(c.terms.length,9);assert.equal(c.translationTexts.length,3);assert.equal(Math.abs(determinant3(c.matrix)),1);assert.equal(c.matrixText.split('\n').length,3);}
  console.log('Layer join headless fixture self-test PASS. No app launched.');
}
function nativeSelfTest(){
  selfTest();const {spawnSync}=require('node:child_process'),base=cube(),inputs=[{top:clone(base),height:2},{top:{kind:'point',source_id:'selftest-point',coordinates:[0,0,0]},height:2},{top:{kind:'edge',source_id:'selftest-edge',start:[-.5,0,0],end:[.5,0,0]},height:2},{top:square(),height:-2,top_matrix:[[-1,0,0],[0,1,0],[0,0,1]],top_translation:[.1,.2,.3]},{top:tetra(),height:2}];
  const requests=inputs.map((params,id)=>({id,op:'convex-layer-join',model:base,params}));requests.push({id:'nonconvex',op:'convex-layer-join',model:nonconvex(),params:{top:base,height:2}});
  requests.push(...[
    ['fit-copy',{top:clone(base),top_matrix:[[-1,0,0],[0,1,0],[0,0,1]],top_translation:[0,0,0]}],['fit-point',{top:{kind:'point',source_id:'fitted-point',coordinates:[0,0,0]}}],
    ['fit-unequal',{top:tetra()}],['fit-offcenter',{top:{kind:'point',source_id:'offcenter-point',coordinates:[.1,0,0]}}],
  ].map(([id,params])=>({id,op:'fit-strict-layer-join',model:base,params})));
  const result=spawnSync(process.env.POLYTOPE_PYTHON||'python',['-B','-m','engine.server'],{cwd:root,windowsHide:true,input:requests.map(r=>JSON.stringify(r)).join('\n')+'\n',encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);const replies=result.stdout.trim().split(/\r?\n/).map(JSON.parse);assert.equal(replies.length,requests.length);
  for(let i=0;i<inputs.length;i++){assert.equal(replies[i].ok,true,replies[i].error);verifyMaps(replies[i].result,base,inputs[i].top.kind?undefined:inputs[i].top);}verifyTesseract(replies[0].result);verifyPyramid(replies[1].result);assert.deepEqual(counts(replies[2].result),[10,21,18,7]);assert.deepEqual(counts(replies[3].result),[12,24,19,7]);assert.deepEqual(counts(replies[4].result),[12,34,34,12]);assert.equal(replies[5].ok,false);assert.match(replies[5].error,/ordered convex source boundary/);
  const byId=new Map(replies.map(r=>[r.id,r]));for(const [id,height,kind] of [['fit-copy',2,'current'],['fit-point',1,'point']]){const r=byId.get(id);assert.equal(r.ok,true,r.error);verifyMaps(r.result,base,kind==='current'?base:undefined);verifyFit(r.result,height,kind);}
  assert.equal(byId.get('fit-unequal').ok,false);assert.match(byId.get('fit-unequal').error,/unequal edges/);assert.equal(byId.get('fit-offcenter').ok,false);assert.match(byId.get('fit-offcenter').error,/differing lateral XYZ distances/);
  const fit=byId.get('fit-copy').result,analysis=spawnSync(process.env.POLYTOPE_PYTHON||'python',['-B','-m','engine.server'],{cwd:root,windowsHide:true,input:JSON.stringify({op:'analyze-strict-segmentotope',model:fit,params:{tolerance:1e-8}})+'\n',encoding:'utf8',timeout:30000,maxBuffer:1024*1024});assert.equal(analysis.error,undefined);assert.equal(analysis.status,0,analysis.stderr);const checked=JSON.parse(analysis.stdout);assert.equal(checked.ok,true,checked.error);assert.equal(checked.result.status,'passed');assert.equal(checked.result.certified,false);assert.equal(checked.result.sourceFingerprint,fit.fingerprint);
  const native=request=>{const r=spawnSync(process.env.POLYTOPE_PYTHON||'python',['-B','-m','engine.server'],{cwd:root,windowsHide:true,input:JSON.stringify(request)+'\n',encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr);const reply=JSON.parse(r.stdout);assert.equal(reply.ok,true,reply.error);return reply.result;};
  const unitCube=cube();unitCube.metadata.coordinateUnits='mm';
  for(const c of matrixExpressionCases){
    const evaluated=native({op:'expression-batch',params:{expressions:[c.heightText,...c.translationTexts,...c.terms],mode:'real'}}).values;
    assert.deepEqual(evaluated,[c.height,...c.translation,...c.matrix.flat()]);
    const d={id:'layer-matrix-headless-document',cursor:0,states:[{model:unitCube,notes:'Headless unit source',view:{coordinateUnit:'mm',sectionNormal:[0,0,1]}}]},
      params={top:unitCube,height:evaluated[0],top_translation:evaluated.slice(1,4),top_matrix:[evaluated.slice(4,7),evaluated.slice(7,10),evaluated.slice(10,13)]},
      recorded=native({op:'recipe-run',params:{document:d,operation:'convex-layer-join',parameters:params}}),m=recorded.states[recorded.cursor].model,
      source=recorded.states[0].model;
    // Recipe checks refresh only the documented source fingerprint. The top
    // parameter remains the exact independent input supplied by the caller.
    verifyMaps(m,source,unitCube);verifyTesseract(m);assert.equal(recorded.states[recorded.cursor].view.coordinateUnit,'mm');
    const replay=native({op:'recipe-replay',params:{document:recorded}});assert.deepEqual(geometry(replay.states[replay.cursor].model),geometry(m));assert.deepEqual(replay.states[replay.cursor].model.metadata,m.metadata);
  }
  console.log('Layer join native JSON self-test PASS: independent full incidence; nested degree/root matrix expressions with signed tesseract maps/mm/RGBA and recorded Replay; fitted h2/h1 with equal edges/common sphere and read-only numerical predicates; nonconvex/unequal/off-center refusals. No app launched.');
}
if(require.main===module){if(process.argv.includes('--native-self-test'))nativeSelfTest();else if(process.argv.includes('--self-test'))selfTest();else main().catch(error=>{console.error(error);process.exitCode=1;});}
module.exports={cube,square,tetra,nonconvex,verifyMaps,verifyTesseract,verifyPyramid,verifyHullIncidence,verifyFit,guardRuntime,matrixExpressionCases};
