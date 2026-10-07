// Development qualification harness. --self-test is native/Node only and never
// launches Electron. Root owns sequential GUI execution and runtime canaries.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {guardRuntime}=require('./layer-join-smoke.cjs');
const root=path.resolve(__dirname,'..'),clone=structuredClone,hash=x=>createHash('sha256').update(x).digest('hex');
const doc=p=>p.documents[p.active],active=p=>doc(p).states[doc(p).cursor];
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-8*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const color=i=>i%2?{encoding:'byte',values:[30+i,80,210,128]}:{encoding:'unit',values:[.25,.75,.5,.3]};
const edgeKey=e=>[...e].sort((a,b)=>a-b).join(',');
function model(id,dimension,vertices,faces,cells=[]){
  const edges=new Map();for(const f of faces)for(let i=0;i<f.length;i++){
    const e=[f[i],f[(i+1)%f.length]].sort((a,b)=>a-b);edges.set(edgeKey(e),e);
  }
  return {id,name:id,dimension,embeddingDimension:dimension,interpretation:'convex-polytope',vertices,
    edges:[...edges.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),faces,cells,
    numeric:{mode:'float64-approximate',certified:false},metadata:{coordinateUnits:'mm',
      fixture:{literal:'independent net expression source',keep:[true,null,1e99]},
      offColors:{faces:faces.map((_,i)=>color(i)),cells:cells.map((_,i)=>color(i+6))}}};
}
function cube(){return model('Literal expression cube',3,
  [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
  [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]);}
function tesseract(){
  const vertices=Array.from({length:16},(_,i)=>Array.from({length:4},(_,a)=>(i>>a&1)?1:-1)),faces=[];
  for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)for(let i=0;i<16;i++)if(!(i>>a&1)&&!(i>>b&1))
    faces.push([i,i^(1<<a),i^(1<<a)^(1<<b),i^(1<<b)]);
  const cells=[];for(let a=0;a<4;a++)for(const sign of [-1,1])
    cells.push(faces.flatMap((f,i)=>f.every(v=>vertices[v][a]===sign)?[i]:[]));
  return model('Literal expression tesseract',4,vertices,faces,cells);
}
function verifyFixture(m){
  assert.deepEqual(['vertices','edges','faces','cells'].map(k=>m[k].length),m.dimension===3?[8,12,6,0]:[16,32,24,8]);
  for(const [a,b] of m.edges)near(Math.hypot(...m.vertices[a].map((x,i)=>x-m.vertices[b][i])),2);
  for(const face of m.faces){assert.equal(face.length,4);assert.equal(new Set(face).size,4);}
  if(m.dimension===3){const use=new Map();for(const f of m.faces)for(let i=0;i<4;i++){
    const key=edgeKey([f[i],f[(i+1)%4]]);use.set(key,(use.get(key)||0)+1);
  }assert.equal(use.size,12);assert.ok([...use.values()].every(n=>n===2));}
  else{
    const use=Array(24).fill(0);for(const cell of m.cells){assert.equal(cell.length,6);const vertices=new Set(cell.flatMap(f=>m.faces[f]));
      assert.equal(vertices.size,8);cell.forEach(f=>use[f]++);}
    assert.ok(use.every(n=>n===2));
  }
}
function verifyNet(net,source,length){
  near(net.referenceEdgeLengthMm,length);assert.equal(net.units,'mm');assert.equal(net.faces.length,source.faces.length);
  for(const face of net.faces){assert.deepEqual(face.sourceVertices,source.faces[face.id]);
    for(let i=0;i<face.points.length;i++)near(Math.hypot(...face.points[i].map((x,j)=>x-face.points[(i+1)%face.points.length][j])),length);
  }
  assert.equal(net.foldValidation.rigidityPreserved,true);assert.equal(net.foldValidation.hingesJoined,true);
  assert.equal(net.foldValidation.endpointReconstructed,true);near(net.foldValidation.maxEndpointErrorMm,0);
}
function verifyCells(net,source){
  assert.equal(net.cells.length,8);assert.equal(net.sourceId,source.id);assert.equal(net.validation.rigidityPreserved,true);
  for(const cell of net.cells){
    const expected=[...new Set(source.cells[cell.id].flatMap(f=>source.faces[f]))].sort((a,b)=>a-b);
    assert.deepEqual(cell.sourceVertices,expected);assert.equal(cell.points.length,8);
    for(const face of cell.faces)assert.deepEqual(face.vertices.map(i=>cell.sourceVertices[i]),source.faces[face.id]);
    for(let a=0;a<8;a++)for(let b=a+1;b<8;b++){
      const p=source.vertices[cell.sourceVertices[a]],q=source.vertices[cell.sourceVertices[b]];
      near(Math.hypot(...cell.points[a].map((x,i)=>x-cell.points[b][i])),Math.hypot(...p.map((x,i)=>x-q[i])));
    }
  }
}
function verifyCellPlacement(before,after){
  const angle=[45,4,-3].map(x=>x*Math.PI/180),[sx,sy,sz]=angle.map(Math.sin),[cx,cy,cz]=angle.map(Math.cos);
  const rotation=[[cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx],
    [sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-cz*sx],[-sy,cy*sx,cy*cx]];
  const points=before.cells.flatMap(c=>c.points),center=points.reduce((sum,p)=>sum.map((x,i)=>x+p[i]/points.length),[0,0,0]),delta=[1,2,7];
  for(const cell of before.cells){const next=after.cells.find(c=>c.id===cell.id);assert.ok(next);
    cell.points.forEach((p,i)=>rotation.forEach((row,a)=>near(next.points[i][a],center[a]+delta[a]+row.reduce((sum,x,b)=>sum+x*(p[b]-center[b]),0))));
  }
}
function verifyPaper(packed){
  near(packed.referenceEdgeLengthMm,12.7);assert.equal(packed.validation.scalePreserved,true);
  assert.equal(packed.validation.partBoundsInsideMargins,true);
  assert.deepEqual(packed.parameters,{paper:'custom',orientation:'portrait',width_mm:200,height_mm:99,margin_mm:5,gap_mm:5,allow_rotation:true});
}
function native(request){
  const r=spawnSync(process.env.POLYTOPE_TEST_PYTHON||'python',['-B','-m','engine.server'],
    {cwd:root,windowsHide:true,input:JSON.stringify(request)+'\n',encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024});
  assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout.trim());
  assert.equal(result.ok,true,result.error);return result.result;
}
async function selfTest(){
  const {splitExpressionVector,ExpressionEntry}=await import('../ui/expression-entry.mjs');
  const c=cube(),t=tesseract();verifyFixture(c);verifyFixture(t);
  const state={model:c,view:{coordinateUnit:'mm'},notes:'Keep source'},context={getState:()=>state,number:async expression=>native({op:'expression',params:{expression}}).value};
  const entry=new ExpressionEntry(context),before=clone(state);
  const result=await entry.run({length:'25.4/2',translation:splitExpressionVector('min(1, 2), sqrt(4), 3 + 4'),
    angles:splitExpressionVector('sind(90) * 45; max(3, min(4, 5)); -sqrt(9)')},v=>v);
  assert.deepEqual(result,{length:12.7,translation:[1,2,7],angles:[45,4,-3]});assert.deepEqual(state,before);
  const net=native({op:'net',model:c,params:{edge_length_mm:result.length,tabs:true}});verifyNet(net,c,12.7);
  const moved=native({op:'net-edit',model:c,params:{net,action:'move-component',component:net.components[0].root,translation:[1,2],angle:45}});verifyNet(moved,c,12.7);
  const cellNet=native({op:'cell-net',model:t,params:{}});
  const cellMoved=native({op:'cell-net-edit',model:t,params:{net:cellNet,action:'move-component',component:cellNet.components[0].root,
    translation:result.translation,angles:result.angles}});verifyCells(cellMoved,t);verifyCellPlacement(cellNet,cellMoved);
  const packed=native({op:'net-pack',model:c,params:{net:moved,paper:'custom',orientation:'portrait',width_mm:200,height_mm:99,margin_mm:5,gap_mm:5,allow_rotation:true}});
  verifyPaper(packed);
  for(const mutate of [m=>m.vertices[0][0]=0,m=>m.edges.pop(),m=>m.faces[0][1]=m.faces[0][0]]){const bad=clone(c);mutate(bad);assert.throws(()=>verifyFixture(bad));}
  console.log('Expression-entry literal cube/tesseract/native parser/net/cell/paper self-test PASS. No app launched.');
}
async function main(){
  const runtime=await guardRuntime(); // Mandatory before loading/launching Electron.
  const {_electron:electron}=require('playwright'),started=performance.now();
  const artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));
  await fs.mkdir(artifacts,{recursive:true});const folder=await fs.mkdtemp(path.join(artifacts,runtime.packaged?'expression-entry-packaged-smoke-':'expression-entry-smoke-'));
  const profile=path.join(folder,'profile');await fs.mkdir(profile);
  await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
  const checks=[],errors=[],files=[];let page,serial=0;
  try{
    assert.equal((await app.evaluate(({app})=>app.polytopeQualification))?.mode,runtime.hidden?'hidden-no-focus':undefined);
    page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>document.getElementById('net-length')&&document.getElementById('cell-net-move')&&document.getElementById('model-name').textContent==='Tesseract');
    await page.evaluate(()=>{window.expressionStatuses=[];new MutationObserver(()=>window.expressionStatuses.push(document.getElementById('status').textContent))
      .observe(document.getElementById('status'),{childList:true,subtree:true,characterData:true});});
    const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
    const settle=async()=>{await done();await page.keyboard.press('Escape');await page.evaluate(async()=>{document.activeElement?.blur?.();
      for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});await done();};
    const inspector=async()=>{if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();};
    const nets=async()=>{await inspector();await page.locator('[data-panel="net"]').click();};
    const save=async label=>{
      await settle();const file=path.join(folder,`${String(++serial).padStart(2,'0')}-${label}.polyproj`);
      await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
      await page.locator('#save').click();await page.waitForFunction(file=>window.expressionStatuses.includes('Saved '+file),file);await settle();
      const bytes=await fs.readFile(file);files.push({file,sha256:hash(bytes)});return {file,project:JSON.parse(bytes)};
    };
    const open=async file=>{
      await settle();await page.evaluate(()=>window.expressionStatuses=[]);
      await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
      await page.locator('#open').click();await page.waitForFunction(file=>window.expressionStatuses.includes('Opened '+file)||window.expressionStatuses.some(s=>s.includes('Workspace changed while opening')),file);
      assert.equal(await page.evaluate(file=>window.expressionStatuses.includes('Opened '+file),file),true,'Settled Open must succeed without weakening workspace protection.');await settle();
    };
    const initial=(await save('initial')).project;
    const replace=async source=>{
      verifyFixture(source);const p=clone(initial);p.active=0;
      p.documents=[{id:'expression-source-document',cursor:0,states:[{model:clone(source),notes:'Keep expression source/RGBA',view:{
        coordinateUnit:'mm',angles:[0,0,0,0,0,0],sectionNormal:Array(source.dimension).fill(0).map((_,i)=>Number(i===source.dimension-1)),
        sectionOffset:0,derivedMode:source.dimension===4?'section':'face',viewportLayout:'split',surfaceColors:'source'}}]}];
      const file=path.join(folder,source.dimension===4?'literal-tesseract.polyproj':'literal-cube.polyproj'),bytes=Buffer.from(JSON.stringify(p));
      await fs.writeFile(file,bytes);files.push({file,sha256:hash(bytes)});await open(file);return save('native-source-'+source.dimension);
    };
    const waitEdit=async(id,index)=>{await page.waitForFunction(({id,index})=>document.getElementById(id).dataset.edit===String(index),{id,index});await settle();};
    const staleToast=()=>page.waitForFunction(()=>!document.getElementById('toast').hidden&&/changed while evaluating expressions/.test(document.getElementById('toast').textContent));
    const clearToast=()=>page.evaluate(()=>document.getElementById('toast').hidden=true);
    const originalCube=await replace(cube()),c=clone(active(originalCube.project).model);await nets();
    assert.equal(await page.locator('#net-length').getAttribute('type'),'text');assert.equal(await page.locator('#net-root').getAttribute('type'),'number');
    await page.locator('#net-root').fill('0');await page.locator('#net-length').fill('25.4/2');await page.locator('#net-rebuild').click();
    await page.waitForFunction(()=>document.getElementById('net-summary').textContent.includes('E0 = 12.7 mm'));await settle();
    const reset=await save('cube-net-E0'),resetState=active(reset.project);verifyNet(resetState.netLayout,c,12.7);assert.deepEqual(resetState.model,c);
    await nets();await page.locator('#net-component').selectOption('0');
    for(const [id,value] of [['net-move-x','min(1, 2)'],['net-move-y','sqrt(4)'],['net-angle','sind(90) * 45']])await page.locator('#'+id).fill(value);
    const edit=resetState.netHistory.cursor+1;await page.locator('#net-move').click();await waitEdit('net-summary',edit);
    const moved=await save('cube-net-placed'),movedState=active(moved.project);verifyNet(movedState.netLayout,c,12.7);assert.deepEqual(movedState.model,c);
    const placement=movedState.netLayout.placements.find(p=>p.root===0);assert.ok(placement);near(placement.angle,45);
    // First edit adds this literal translation after rotating about the piece center;
    // exact vertex correspondence verifies rotation/placement without relying on UI text.
    const beforePoints=resetState.netLayout.faces.flatMap(f=>f.points),afterPoints=movedState.netLayout.faces.flatMap(f=>f.points);
    const center=beforePoints.reduce((s,p)=>s.map((x,i)=>x+p[i]/beforePoints.length),[0,0]),cs=Math.SQRT1_2;
    for(let i=0;i<beforePoints.length;i++){const [x,y]=beforePoints[i].map((v,a)=>v-center[a]);near(afterPoints[i][0],center[0]+cs*x-cs*y+1);near(afterPoints[i][1],center[1]+cs*x+cs*y+2);}
    await page.screenshot({path:path.join(folder,'cube-expression-net.png')});
    checks.push('actual net E0/XY/angle expression buttons produce12.7 mm rigid cube faces and independently verified45-degree placement; complete source units/RGBA/incidence retained');

    await nets();await page.locator('#net-undo').click();await waitEdit('net-summary',edit-1);
    assert.deepEqual(active((await save('net-undo')).project).netLayout,resetState.netLayout);
    await nets();await page.locator('#net-redo').click();await waitEdit('net-summary',edit);
    assert.deepEqual(active((await save('net-redo')).project).netLayout,movedState.netLayout);
    await nets();await page.locator('#net-paper').selectOption('custom');
    for(const [id,value] of [['net-paper-width','210 - 2*5'],['net-paper-height','297 / 3'],['net-paper-margin','10/2'],['net-paper-gap','2 + 3']])await page.locator('#'+id).fill(value);
    await page.locator('#net-pack').click();await page.waitForFunction(()=>document.getElementById('net-paper-status').textContent.includes('Page 1 of'));await settle();
    const packed=await save('custom-expression-paper'),packedState=active(packed.project);verifyPaper(packedState.netPages);assert.deepEqual(packedState.model,c);
    await open(packed.file);const reopened=await save('paper-reopened');assert.deepEqual(active(reopened.project).netLayout,packedState.netLayout);
    assert.deepEqual(active(reopened.project).netPages,packedState.netPages);assert.deepEqual(active(reopened.project).view.netPrint,packedState.view.netPrint);
    await page.screenshot({path:path.join(folder,'expression-paper.png')});
    checks.push('real paper width/height/margin/gap expressions pack at unchanged physical E0; net Undo/Redo and native Save/Open reconstruct identical math/layout/units');

    const stable=await save('before-invalid');await nets();
    for(const [button,id,value,pattern] of [['net-rebuild','net-length','sqrt(-1)',/domain|negative|complex/i],
      ['net-pack','net-paper-gap','101',/gaps/],['net-move','net-move-x','unknown(2)',/unknown|allowed|function/i]]){
      await clearToast();await page.locator('#'+id).fill(value);await page.locator('#'+button).click();
      await page.waitForFunction(()=>!document.getElementById('toast').hidden);assert.match(await page.locator('#toast').innerText(),pattern);await settle();
      const refused=await save('invalid-'+id);const a=active(refused.project),b=active(stable.project);
      for(const key of ['model','netLayout','netHistory','netPages'])assert.deepEqual(a[key],b[key],key);
      assert.deepEqual(a.view.net,b.view.net);assert.deepEqual(a.view.netPrint,b.view.netPrint);
      await nets();await page.locator('#'+id).fill(id==='net-length'?'25.4/2':id==='net-paper-gap'?'2 + 3':'min(1, 2)');
    }
    checks.push('invalid expression and out-of-range paper input reject atomically without partial net/config/cache/history/source mutation');

    // Hold actual native responses using the registered IPC handler. Qualification
    // only changes transport timing/errors, never accesses private renderer state.
    await app.evaluate(({ipcMain})=>{
      const original=ipcMain._invokeHandlers.get('engine'),cancel=ipcMain._invokeHandlers.get('cancel');
      if(typeof original!=='function'||typeof cancel!=='function')throw Error('Actual native handlers unavailable.');
      globalThis.expressionHarness={original,cancel,mode:null,held:false,count:0};
      ipcMain.removeHandler('engine');ipcMain.handle('engine',async(event,request,id)=>{
        const h=globalThis.expressionHarness;h.count++;
        const matches=h.mode==='native'?request.op==='cell-net-edit':request.op==='expression';
        if(!matches||!h.mode)return original(event,request,id);
        const mode=h.mode;h.mode=null;h.held=true;h.id=id;
        if(mode==='cancel')return new Promise((resolve,reject)=>{h.release=resolve;h.reject=reject;});
        const result=await original(event,request,id);h.ready=true;await new Promise(resolve=>h.release=resolve);return result;
      });
      ipcMain.removeHandler('cancel');ipcMain.handle('cancel',async(event,id)=>{
        const h=globalThis.expressionHarness;if(h.held&&h.id===id&&h.reject){h.reject(Error('Job cancelled.'));h.reject=null;h.cancelled=true;return true;}
        return h.cancel(event,id);
      });
    });
    const arm=mode=>app.evaluate((_,mode)=>{Object.assign(globalThis.expressionHarness,{mode,held:false,ready:false,cancelled:false,release:null,reject:null});},mode);
    const held=()=>app.evaluate(()=>new Promise((resolve,reject)=>{const stop=Date.now()+10000,t=setInterval(()=>{
      if(globalThis.expressionHarness.held){clearInterval(t);resolve();}else if(Date.now()>stop){clearInterval(t);reject(Error('Expression handler never held.'));}},10);}));
    const ready=()=>app.evaluate(()=>new Promise((resolve,reject)=>{const stop=Date.now()+10000,t=setInterval(()=>{
      if(globalThis.expressionHarness.ready){clearInterval(t);resolve();}else if(Date.now()>stop){clearInterval(t);reject(Error('Held actual native response never completed.'));}},10);}));
    const release=()=>app.evaluate(()=>{const h=globalThis.expressionHarness;if(typeof h.release!=='function')throw Error('Held native response is not ready.');h.release();});
    try{
      await nets();await clearToast();await arm('expression');await page.locator('#net-move').click();await held();
      const beforeBusy=await app.evaluate(()=>globalThis.expressionHarness.count);await page.locator('#net-move').click();
      await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('current expression edit'));
      assert.equal(await app.evaluate(()=>globalThis.expressionHarness.count),beforeBusy);
      await page.locator('[data-panel="construct"]').click();await page.locator('#model-unit').selectOption('cm');
      await ready();
      await release();await staleToast();await settle();const stale=await save('held-expression-unit-refusal');
      const a=active(stale.project),b=active(stable.project);assert.equal(a.view.coordinateUnit,'cm');
      for(const key of ['model','netLayout','netHistory','netPages'])assert.deepEqual(a[key],b[key],key);
      checks.push('held actual expression response refuses changed source units; duplicate real button click invokes no second native expression and cannot publish a partial placement');

      await nets();await clearToast();await arm('cancel');await page.locator('#net-move').click();await held();await page.locator('#cancel').click();
      await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('Job cancelled'));await settle();
      assert.equal(await app.evaluate(()=>globalThis.expressionHarness.cancelled),true);
      const cancelled=await save('cancelled-expression');for(const key of ['model','netLayout','netHistory','netPages'])assert.deepEqual(active(cancelled.project)[key],a[key]);
      await nets();const recoveryEdit=active(cancelled.project).netHistory.cursor+1;await page.locator('#net-move').click();await waitEdit('net-summary',recoveryEdit);
      const recovered=await save('expression-recovered');verifyNet(active(recovered.project).netLayout,c,12.7);assert.deepEqual(active(recovered.project).model,c);
      checks.push('actual Cancel-button IPC propagates an injected cancellation error atomically and releases the expression lock; subsequent real native expression placement succeeds');

      const ts=await replace(tesseract()),t=clone(active(ts.project).model);await nets();await page.locator('#cell-net-build').click();
      await page.waitForFunction(()=>document.getElementById('cell-net-summary').textContent.includes('8 complete cells'));await settle();
      const cellReset=await save('cell-net-initial');verifyCells(active(cellReset.project).cellNetLayout,t);await nets();
      await page.locator('#cell-net-component').selectOption('0');
      await page.locator('#cell-net-translation').fill('min(1, 2), sqrt(4), 3 + 4');
      await page.locator('#cell-net-angles').fill('sind(90) * 45; max(3, min(4, 5)); -sqrt(9)');
      const ce=active(cellReset.project).cellNetHistory.cursor+1;await page.locator('#cell-net-move').click();await waitEdit('cell-net-summary',ce);
      const cellMoved=await save('cell-expression-placed');const cm=active(cellMoved.project);verifyCells(cm.cellNetLayout,t);
      verifyCellPlacement(active(cellReset.project).cellNetLayout,cm.cellNetLayout);assert.deepEqual(cm.model,t);
      assert.ok(cm.cellNetLayout.placements.length);assert.deepEqual(cm.cellNetHistory.states.at(-1).placements,cm.cellNetLayout.placements);
      await open(cellMoved.file);const cellReopen=await save('cell-expression-reopened');assert.deepEqual(active(cellReopen.project).cellNetLayout,cm.cellNetLayout);assert.deepEqual(active(cellReopen.project).model,t);
      await nets();await page.locator('#cell-net-undo').click();await waitEdit('cell-net-summary',ce-1);assert.deepEqual(active((await save('cell-undo')).project).cellNetLayout,active(cellReset.project).cellNetLayout);
      await nets();await page.locator('#cell-net-redo').click();await waitEdit('cell-net-summary',ce);assert.deepEqual(active((await save('cell-redo')).project).cellNetLayout,cm.cellNetLayout);
      await page.screenshot({path:path.join(folder,'tesseract-expression-cell-net.png')});
      checks.push('cell XYZ expression vectors preserve nested function commas and arithmetic spaces; every source cell/face cycle and pair distance, full4D RGBA/mm source, native Save/Open and cell Undo/Redo survive');

      await nets();await clearToast();await page.locator('#cell-net-translation').fill('1,,3');await page.locator('#cell-net-move').click();
      await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('expressions separated'));await settle();
      assert.deepEqual(active((await save('invalid-cell-vector')).project).cellNetLayout,cm.cellNetLayout);
      await nets();await page.locator('#cell-net-translation').fill('min(1, 2), sqrt(4), 3 + 4');await clearToast();await arm('native');
      await page.locator('#cell-net-move').click();await held();await page.locator('[data-panel="info"]').click();await page.locator('#notes').fill('Changed while cell placement awaited');
      await ready();
      await release();await staleToast();await settle();const heldCell=await save('held-cell-notes-refusal');
      assert.equal(active(heldCell.project).notes,'Changed while cell placement awaited');assert.deepEqual(active(heldCell.project).model,t);
      assert.deepEqual(active(heldCell.project).cellNetLayout,cm.cellNetLayout);assert.deepEqual(active(heldCell.project).cellNetHistory,cm.cellNetHistory);
      checks.push('invalid cell vector rejects before native mutation; held actual cell-placement completion refuses changed notes without overwriting the user edit or net history');
    }finally{
      await app.evaluate(({ipcMain})=>{const h=globalThis.expressionHarness;if(!h)return;h.reject?.(Error('Qualification cleanup.'));h.release?.();
        ipcMain.removeHandler('engine');ipcMain.handle('engine',h.original);ipcMain.removeHandler('cancel');ipcMain.handle('cancel',h.cancel);delete globalThis.expressionHarness;});
    }
    for(const file of files)assert.equal(hash(await fs.readFile(file.file)),file.sha256);assert.deepEqual(errors,[]);
    const result={passed:true,packaged:Boolean(runtime.packaged),runtime:runtime.runtime,hidden:runtime.hidden,
      version:await app.evaluate(({app})=>app.getVersion()),checks,pageErrors:errors,files,seconds:(performance.now()-started)/1000,
      limits:['Development harness; no executed Stella baseline equivalence claim.','Cancellation case injects a transport cancellation error through actual Cancel IPC; it does not prove operating-system process termination.','Animation-export exclusion is covered by headless controller tests; this harness does not start a simultaneous animation capture.']};
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));console.log('Expression-entry smoke PASS. Artifacts: '+folder);
  }catch(error){
    await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});
    await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors},null,2));
    console.error('Artifacts: '+folder);throw error;
  }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
if(require.main===module){if(process.argv.includes('--self-test'))selfTest().catch(e=>{console.error(e);process.exitCode=1;});else main().catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={cube,tesseract,verifyFixture,verifyNet,verifyCells,verifyCellPlacement,verifyPaper};
