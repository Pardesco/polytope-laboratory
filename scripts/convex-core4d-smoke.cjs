// Actual4D cellular-core qualification. Authoring/self-test launch no app.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{guardRuntime}=require('./layer-join-smoke.cjs');
const root=path.resolve(__dirname,'..'),clone=structuredClone,hash=x=>createHash('sha256').update(x).digest('hex');
const doc=p=>p.documents[p.active],active=p=>doc(p).states[doc(p).cursor];
const counts=m=>['vertices','edges','faces','cells'].map(k=>m[k].length),ids=a=>[...a].sort((a,b)=>a-b).join(',');
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const cycle=f=>[f,[...f].reverse()].flatMap(a=>a.map((_,i)=>[...a.slice(i),...a.slice(0,i)].join(','))).sort()[0];
function choices(n){if(!n)return [[]];return choices(n-1).flatMap(p=>[-1,1].map(x=>[...p,x]));}
function combinations(n,k){const out=[];function add(first,p){if(p.length===k){out.push(p);return;}for(let i=first;i<n;i++)add(i+1,[...p,i]);}add(0,[]);return out;}
const color=i=>i%2?{encoding:'unit',values:[.2,.6,.4,.25]}:{encoding:'byte',values:[25+i,90,210,128]};
function literal(id,vertices,faces,cells){
  const edges=new Map();for(const f of faces)for(let i=0;i<f.length;i++){
    const e=[f[i],f[(i+1)%f.length]].sort((a,b)=>a-b);edges.set(e.join(','),e);
  }
  return {id,name:id,dimension:4,embeddingDimension:4,interpretation:'generalized-complex',vertices,
    edges:[...edges.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),faces,cells,numeric:{mode:'float64-approximate',certified:false},
    metadata:{coordinateUnits:'mm',retainedAttribute:{literal:'independent4D fixture',numbers:[1,0,.125]},
      offColors:{faces:faces.map((_,i)=>color(i)),cells:cells.map((_,i)=>color(i))}}};
}
function tesseract(){
  const vertices=choices(4),lookup=new Map(vertices.map((p,i)=>[p.join(','),i])),faces=[];
  for(const free of combinations(4,2)){
    const fixed=[0,1,2,3].filter(a=>!free.includes(a));
    for(const signs of choices(2)){
      const f=[];for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
        const p=[0,0,0,0];fixed.forEach((axis,i)=>p[axis]=signs[i]);p[free[0]]=a;p[free[1]]=b;f.push(lookup.get(p.join(',')));
      }faces.push(f);
    }
  }
  const cells=[];for(let axis=0;axis<4;axis++)for(const sign of [-1,1])cells.push(faces.flatMap((f,fi)=>f.every(v=>vertices[v][axis]===sign)?[fi]:[]));
  return literal('Literal cellular tesseract',vertices,faces,cells);
}
function simplex(){
  const vertices=[[0,0,0,0],...Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>Number(i===j)))],faces=combinations(5,3);
  const cells=combinations(5,4).map(c=>faces.flatMap((f,fi)=>f.every(v=>c.includes(v))?[fi]:[]));
  return literal('Literal right5cell',vertices,faces,cells);
}
function polygonProduct(left,ordered,right){
  const n=left.length,m=right.length,vertices=left.flatMap(p=>right.map(q=>[...p,...q])),faces=[],cells=[];
  for(let b=0;b<m;b++)faces.push(ordered.map(a=>a*m+b));
  for(let a=0;a<n;a++)faces.push(Array.from({length:m},(_,b)=>a*m+b));
  for(let i=0;i<n;i++)for(let b=0;b<m;b++){
    const a=ordered[i],next=ordered[(i+1)%n],d=(b+1)%m;faces.push([a*m+b,next*m+b,next*m+d,a*m+d]);
  }
  for(let b=0;b<m;b++)cells.push([b,(b+1)%m,...Array.from({length:n},(_,i)=>m+n+i*m+b)]);
  for(let i=0;i<n;i++)cells.push([m+ordered[i],m+ordered[(i+1)%n],...Array.from({length:m},(_,b)=>m+n+i*m+b)]);
  return literal('Literal polygon product',vertices,faces,cells);
}
const square=[[-1,-1],[1,-1],[1,1],[-1,1]];
function crossedProduct(){
  const left=Array.from({length:5},(_,i)=>[Math.cos(2*Math.PI*i/5),Math.sin(2*Math.PI*i/5)]),ordered=[0,2,4,1,3];
  const m=polygonProduct(left,ordered,square);m.id=m.name='Literal raw5/2 x square';
  m.metadata.rawSymbol='5/2';m.metadata.factorSnapshots=[{symbol:'5/2',vertices:left,orderedCycles:[ordered]},
    {symbol:'4/1',vertices:clone(square),orderedCycles:[[0,1,2,3]]}];return m;
}
function expectedPentagonProduct(){
  const r=(3-Math.sqrt(5))/2,left=Array.from({length:5},(_,i)=>[r*Math.cos(Math.PI/5+2*Math.PI*i/5),r*Math.sin(Math.PI/5+2*Math.PI*i/5)]);
  return polygonProduct(left,[0,1,2,3,4],square);
}
function verifyBoundary(model,expected){
  assert.deepEqual(counts(model),counts(expected));assert.equal(model.dimension,4);assert.equal(model.embeddingDimension,4);
  const mapping=expected.vertices.map(p=>{
    const matches=model.vertices.flatMap((q,i)=>p.every((x,j)=>Math.abs(x-q[j])<1e-8)?[i]:[]);assert.equal(matches.length,1);return matches[0];
  });assert.equal(new Set(mapping).size,model.vertices.length);
  assert.deepEqual(model.edges.map(ids).sort(),expected.edges.map(e=>ids(e.map(v=>mapping[v]))).sort());
  const current=new Map(model.faces.map((f,i)=>[cycle(f),i]));assert.equal(current.size,model.faces.length);
  const faces=expected.faces.map(f=>cycle(f.map(v=>mapping[v])));assert.deepEqual([...current.keys()].sort(),faces.toSorted());
  const faceMap=faces.map(f=>current.get(f));assert.deepEqual(model.cells.map(ids).sort(),expected.cells.map(c=>ids(c.map(fi=>faceMap[fi]))).sort());
  assert.ok(model.faces.every((_,fi)=>model.cells.filter(c=>c.includes(fi)).length===2));
  assert.equal(model.vertices.length-model.edges.length+model.faces.length-model.cells.length,0);
}
function verifyEvidence(model,source,expected){
  verifyBoundary(model,expected);assert.equal(model.interpretation,'convex-polytope');assert.equal(model.numeric.certified,false);
  assert.equal(model.metadata.coordinateUnits,'mm');assert.equal(model.provenance.operation,'convex-core-4d');
  assert.equal(model.provenance.algorithmVersion,'0.1.0');assert.equal(model.provenance.kernelVersion,'0.1.0');
  const e=model.metadata.convexCore4d;assert.deepEqual(e.sourceModel,source);assert.equal(e.sourceBinding.sourceModelId,source.id);
  assert.equal(e.sourceBinding.sourceFingerprint,source.fingerprint);assert.match(e.sourceBinding.sourceSnapshotSha256,/^[a-f0-9]{64}$/);
  assert.equal(e.resultModelId,model.id);assert.equal(e.resultFingerprint,model.fingerprint);assert.equal(e.classification.status,'passed');
  assert.equal(e.classification.sourceModelId,model.id);assert.equal(e.classification.sourceFingerprint,model.fingerprint);
  assert.equal(e.nativeProjectGate.passed,true);assert.equal(e.nativeProjectGate.measurePublished,true);
  assert.equal(e.boundedness.clippingBoxUsed,false);assert.equal(e.boundedness.objectives.length,8);
  assert.deepEqual(model.metadata.offColors.faces,Array(model.faces.length).fill(null));
  for(const row of e.cellSupportOwners){
    assert.equal(row.sourceCellIds.length,1);const sourceId=row.sourceCellIds[0];
    assert.deepEqual(model.metadata.offColors.cells[row.resultCellId],source.metadata.offColors.cells[sourceId]);
    assert.deepEqual(e.hyperplaneGroups[row.hyperplaneGroupId].sourceCellIds,[sourceId]);
  }
  assert.deepEqual(e.candidateToOutputVertexIds,Array.from({length:model.vertices.length},(_,i)=>i));
  assert.deepEqual(e.nonextremeCandidateIds,[]);assert.equal(e.sourceCellHyperplaneRecords.length,source.cells.length);
  assert.equal(e.vertexHyperplaneLineage.length,model.vertices.length);
}
function verifyTesseract(model,source){verifyEvidence(model,source,tesseract());near(model.measure.content,16);near(model.measure.boundaryMeasure,64);}
function verifySimplex(model,source){verifyEvidence(model,source,simplex());near(model.measure.content,1/24);near(model.measure.boundaryMeasure,1);}
function verifyCrossed(model,source){
  verifyEvidence(model,source,expectedPentagonProduct());const r=(3-Math.sqrt(5))/2,area=2.5*r*r*Math.sin(2*Math.PI/5);
  near(model.measure.content,4*area);near(model.measure.boundaryMeasure,40*r*Math.sin(Math.PI/5)+8*area);
  assert.equal(model.metadata.convexCore4d.sourceModel.metadata.rawSymbol,'5/2');
  assert.ok(model.vertices.every(p=>Math.hypot(p[0],p[1])<.5));
}
function selfTest(){
  for(const [m,n] of [[tesseract(),[16,32,24,8]],[simplex(),[5,10,10,5]],[crossedProduct(),[20,40,29,9]]]){
    assert.deepEqual(counts(m),n);verifyBoundary(m,m);
  }
  const m=tesseract(),bad=clone(m);[bad.faces[0][1],bad.faces[0][2]]=[bad.faces[0][2],bad.faces[0][1]];
  assert.throws(()=>verifyBoundary(bad,m));const wrong=clone(m);wrong.cells[0].pop();assert.throws(()=>verifyBoundary(wrong,m));
  console.log('4Dcore independent cellular tesseract/5cell/crossed-product self-test PASS; no app launched.');
}
function nativeSelfTest(){
  const {spawnSync}=require('node:child_process');
  const code=`import json,sys
from engine.server import dispatch
source=json.load(sys.stdin)
doc={'id':'headless-core4d-preflight','cursor':0,'states':[{'model':source['model'],'view':{'coordinateUnit':'mm'}}]}
project={'format':'polytope-laboratory','version':1,'active':0,'documents':[doc]}
validated=dispatch({'op':'validate-project','params':{'project':project}})['documents'][0]
source_model=validated['states'][0]['model']
result=dispatch({'op':'recipe-run','params':{'document':validated,'operation':'convex-core-4d','parameters':{'center':source['center'],'color_policy':'require-equal'}}})
project['documents']=[result]
restored=dispatch({'op':'validate-project','params':{'project':json.loads(json.dumps(project))}})['documents'][0]
replayed=dispatch({'op':'recipe-replay','params':{'document':restored}})
assert replayed['states'][replayed['cursor']]['model']==result['states'][result['cursor']]['model']
print(json.dumps({'source':source_model,'model':restored['states'][restored['cursor']]['model']}))`;
  for(const [model,center,verify] of [[tesseract(),[0,0,0,0],verifyTesseract],
      [simplex(),[.2,.2,.2,.2],verifySimplex],[crossedProduct(),[0,0,0,0],verifyCrossed]]){
    const child=spawnSync(process.env.POLYTOPE_TEST_PYTHON||'python',['-B','-c',code],{
      cwd:root,input:JSON.stringify({model,center}),encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:16*1024*1024});
    assert.equal(child.status,0,child.error?.stack||child.stderr);
    const output=JSON.parse(child.stdout);verify(output.model,output.source);
  }
  console.log('4Dcore native recipe/project/replay preflight PASS for three independent fixtures; no app launched.');
}
async function main(){
  const runtime=await guardRuntime();const {_electron:electron}=require('playwright'),started=performance.now();
  const artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));
  await fs.mkdir(artifacts,{recursive:true});const folder=await fs.mkdtemp(path.join(artifacts,'convex-core4d-smoke-')),profile=path.join(folder,'profile');
  await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
  const checks=[],errors=[],files=[];let page,serial=0;
  try{
    assert.equal((await app.evaluate(({app})=>app.polytopeQualification))?.mode,runtime.hidden?'hidden-no-focus':undefined);
    page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>document.getElementById('core-w')&&document.getElementById('model-name').textContent==='Tesseract');
    await page.waitForFunction(()=>document.getElementById('cancel').hidden);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1484,900));
    await page.evaluate(()=>{window.core4dStatuses=[];new MutationObserver(()=>window.core4dStatuses.push(document.getElementById('status').textContent)).observe(document.getElementById('status'),{childList:true,subtree:true,characterData:true});});
    const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
    const disclose=async id=>{if(!await page.locator('#'+id).evaluate(n=>n.open))await page.locator('#'+id+' > summary').click();};
    const inspector=async()=>{if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();};
    const construct=async()=>{await inspector();await page.locator('[data-panel="construct"]').click();await disclose('convex-core-settings');assert.equal(await page.locator('#core-w').isVisible(),true);};
    const save=async label=>{
      await done();const file=path.join(folder,`${String(++serial).padStart(2,'0')}-${label}.polyproj`);
      await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
      await page.locator('#save').click();await page.waitForFunction(file=>window.core4dStatuses.includes('Saved '+file),file);await done();
      const bytes=await fs.readFile(file);files.push({file,sha256:hash(bytes)});return {file,project:JSON.parse(bytes)};
    };
    const open=async file=>{
      await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
      await page.locator('#open').click();await page.waitForFunction(file=>window.core4dStatuses.includes('Opened '+file),file);await done();
    };
    const initial=(await save('initial')).project;
    const replace=async(label,source,extra)=>{
      const p=clone(initial);p.active=0;p.documents=[source,...(extra?[extra]:[])].map((m,i)=>({id:'core4d-fixture-'+i,cursor:0,
        states:[{model:clone(m),notes:'Preserve literal4D source',view:{coordinateUnit:'mm',sectionNormal:[0,0,0,1],sectionOffset:0,derivedMode:'section',surfaceColors:'source'}}]}));
      const file=path.join(folder,label+'.polyproj'),bytes=Buffer.from(JSON.stringify(p));await fs.writeFile(file,bytes);files.push({file,sha256:hash(bytes)});
      await open(file);return save(label+'-native');
    };
    const center=async values=>{await construct();for(let i=0;i<4;i++)await page.locator('#core-'+['x','y','z','w'][i]).fill(String(values[i]));await page.locator('#core-color-policy').selectOption('require-equal');};
    const execute=async values=>{await center(values);const n=await page.locator('#history-list button').count();await page.locator('#make-convex-core').click();await page.waitForFunction(n=>document.getElementById('history-list').children.length===n+1,n);await done();return save('core4d-result');};
    const replay=async()=>{await inspector();await disclose('history-settings');const n=await page.locator('#document-tabs > button').count();await page.locator('#history-replay').click();await page.waitForFunction(n=>document.getElementById('document-tabs').children.length===n+1,n);await done();return save('replayed');};
    const branch=async params=>{
      await inspector();await disclose('history-settings');assert.equal(await page.locator('#history-branch').isEnabled(),true);
      const n=await page.locator('#document-tabs > button').count();await page.locator('#history-branch').click();await page.locator('#history-parameters').fill(JSON.stringify(params));
      await page.locator('#history-parameters-apply').click();await page.waitForFunction(n=>document.getElementById('document-tabs').children.length===n+1,n);await done();return save('branch');
    };

    const original=await replace('literal-tesseract',tesseract()),source=active(original.project).model;
    const cube=await execute(['1-1','2-2','3-3','4-4']),result=active(cube.project).model;verifyTesseract(result,source);
    assert.deepEqual(doc(cube.project).states[0].model,source);assert.equal(active(cube.project).view.coordinateUnit,'mm');
    assert.deepEqual(doc(cube.project).operationHistory.nodes.at(-1).params,{center:[0,0,0,0],color_policy:'require-equal'});
    await page.screenshot({path:path.join(folder,'tesseract-cellular-core.png')});
    checks.push('literal tesseract yields all independently checked16/32/24/8 records, supporting source-cell RGBA, historical source-face colors, current classification, volume16/boundary64 and four evaluated center coordinates');
    await page.locator('#undo').click();assert.deepEqual(active((await save('undo')).project).model,source);
    await page.locator('#redo').click();assert.deepEqual(active((await save('redo')).project).model,result);
    await open(cube.file);assert.deepEqual(active((await save('reopened')).project).model,result);
    assert.deepEqual(active((await replay()).project).model,result);
    const changed=await branch({center:[.25,0,0,.25],color_policy:'require-equal'});verifyTesseract(active(changed.project).model,source);
    assert.deepEqual(active(changed.project).model.metadata.convexCore4d.center,[.25,0,0,.25]);
    const nodes=doc(changed.project).operationHistory.nodes;assert.equal(nodes.at(-1).parent,nodes.at(-2).parent);
    assert.deepEqual(active((await replay()).project).model,active(changed.project).model);
    checks.push('native undo/redo, Save/Open, Replay and XYZ/W parameter branch retain whole ordered source and use the original parent with deterministic result binding');

    const simple=await replace('literal-right5cell',simplex()),simpleSource=active(simple.project).model;
    const simpleResult=await execute(['1/5','1/5','1/5','1/5']);verifySimplex(active(simpleResult.project).model,simpleSource);
    assert.deepEqual(active(simpleResult.project).model.metadata.convexCore4d.center,[.2,.2,.2,.2]);
    await page.screenshot({path:path.join(folder,'right5cell-core.png')});
    checks.push('literal right5cell supports produce5/10/10/5 with independently known volume1/24 and boundary1; W is evaluated and retained rather than omitted');
    const crossed=await replace('literal-crossed-product',crossedProduct()),crossedSource=active(crossed.project).model;
    const crossedResult=await execute([0,0,0,0]);verifyCrossed(active(crossedResult.project).model,crossedSource);
    assert.deepEqual(doc(crossedResult.project).states[0].model,crossedSource);await page.screenshot({path:path.join(folder,'crossed-product-core.png')});
    checks.push('literal unreduced5/2 x square produces the full smaller pentagon-product20/40/29/9 with analytic golden radius/volume and exact source-cell membership; no source vertex Hull replacement');

    for(const mode of ['native-unit','native-source','expression-W']){
      const before=await replace('held-'+mode,tesseract(),mode==='native-source'?simplex():undefined);
      await center(mode==='expression-W'?['11-11','12-12','13-13','14-14']:[0,0,0,0]);
      await app.evaluate(({ipcMain},mode)=>{
        const original=ipcMain._invokeHandlers.get('engine');if(typeof original!=='function')throw Error('Native engine handler unavailable.');
        globalThis.core4dHandler=original;globalThis.core4dHeld=false;globalThis.core4dExpressionReceipts=[];globalThis.core4dRecipeCalls=0;
        ipcMain.removeHandler('engine');ipcMain.handle('engine',async(event,request,id)=>{
          if(request.op==='recipe-run'&&request.params.operation==='convex-core-4d')globalThis.core4dRecipeCalls++;
          const value=await original(event,request,id);
          if(request.op==='expression-batch')globalThis.core4dExpressionReceipts.push({expressions:request.params.expressions,mode:request.params.mode,result:value});
          if((mode==='expression-W'&&request.op==='expression-batch'&&request.params.expressions.length===4&&request.params.expressions[3]==='14-14')
              ||(mode!=='expression-W'&&request.op==='recipe-run'&&request.params.operation==='convex-core-4d')){
            globalThis.core4dHeld=true;await new Promise(resolve=>{globalThis.core4dRelease=resolve;});
          }return value;
        });
      },mode);
      try{
        await page.locator('#make-convex-core').click();
        await app.evaluate(()=>new Promise((resolve,reject)=>{const until=Date.now()+10000,timer=setInterval(()=>{
          if(globalThis.core4dHeld){clearInterval(timer);resolve();}else if(Date.now()>until){clearInterval(timer);reject(Error('4Dcore held completion was not reached.'));}
        },10);}));
        if(mode==='expression-W'){
          await app.evaluate(()=>new Promise((resolve,reject)=>{const until=Date.now()+10000,timer=setInterval(()=>{
            if(globalThis.core4dExpressionReceipts.length===1){clearInterval(timer);resolve();}
            else if(Date.now()>until){clearInterval(timer);reject(Error('Atomic four-coordinate center batch result was not received.'));}
          },10);}));
          const receipts=await app.evaluate(()=>({expressions:globalThis.core4dExpressionReceipts,recipes:globalThis.core4dRecipeCalls}));
          assert.deepEqual(receipts.expressions,[{expressions:['11-11','12-12','13-13','14-14'],mode:'real',result:{mode:'real',values:[0,0,0,0]}}]);assert.equal(receipts.recipes,0);
        }
        if(mode==='native-source')await page.locator('#document-tabs > button').nth(1).click();else await page.locator('#model-unit').selectOption('cm');
        await app.evaluate(()=>globalThis.core4dRelease());
        await page.waitForFunction(()=>!document.getElementById('toast').hidden&&/source|document|units|changed/i.test(document.getElementById('toast').textContent));await done();
        const refused=await save('refused-'+mode);assert.equal(refused.project.active,mode==='native-source'?1:0);
        for(let i=0;i<before.project.documents.length;i++){
          const a=refused.project.documents[i],b=before.project.documents[i];assert.deepEqual(a.states.map(s=>s.model),b.states.map(s=>s.model));
          assert.deepEqual(a.operationHistory,b.operationHistory);assert.equal(a.states.length,1);assert.equal(a.states[0].notes,b.states[0].notes);
        }
        if(mode!=='native-source')assert.equal(active(refused.project).view.coordinateUnit,'cm');
        if(mode==='expression-W')assert.equal(await app.evaluate(()=>globalThis.core4dRecipeCalls),0);
        checks.push(mode==='expression-W'?'one atomic four-coordinate center expression batch includes W; held real reply plus changed unit refuses before native geometry/history dispatch':
          mode+' held actual4D native result refuses stale source ownership without publishing geometry/history or reverting user changes');
      }finally{
        await app.evaluate(({ipcMain})=>{globalThis.core4dRelease?.();ipcMain.removeHandler('engine');ipcMain.handle('engine',globalThis.core4dHandler);delete globalThis.core4dHandler;delete globalThis.core4dRelease;});
      }
    }
    for(const item of files)assert.equal(hash(await fs.readFile(item.file)),item.sha256);assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,packaged:Boolean(runtime.packaged),hidden:runtime.hidden,runtime:runtime.runtime,
      version:await app.evaluate(({app})=>app.getVersion()),checks,pageErrors:errors,files,seconds:(performance.now()-started)/1000},null,2));
    console.log('4D convex core smoke PASS. Artifacts: '+folder);
  }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors},null,2));console.error('Artifacts: '+folder);throw error;
  }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
if(require.main===module){if(process.argv.includes('--self-test'))selfTest();else if(process.argv.includes('--native-self-test'))nativeSelfTest();else main().catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={tesseract,simplex,crossedProduct,expectedPentagonProduct,verifyBoundary,verifyTesseract,verifySimplex,verifyCrossed};
