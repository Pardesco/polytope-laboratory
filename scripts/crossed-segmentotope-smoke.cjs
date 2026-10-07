// Authoring and --self-test are headless. App execution is root-only beneath
// its native HWND watcher, using a passing matching hidden-runtime canary.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),root=path.resolve(__dirname,'..');
const {guardRuntime}=require('./layer-join-smoke.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex'),clone=x=>structuredClone(x);
const doc=p=>p.documents[p.active],active=p=>doc(p).states[doc(p).cursor];
const counts=m=>['vertices','edges','faces','cells'].map(k=>m[k].length);
const geometry=m=>Object.fromEntries(['dimension','embeddingDimension','vertices','edges','faces','cells','fingerprint'].map(k=>[k,m[k]]));
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const ids=a=>[...a].sort((a,b)=>a-b).join(',');
function cycle(c){const variants=[];for(const row of [c,[...c].reverse()])for(let i=0;i<c.length;i++)variants.push([...row.slice(i),...row.slice(0,i)].join(','));return variants.sort()[0];}
const colorByte={encoding:'byte',values:[10,70,240,128]},colorUnit={encoding:'unit',values:[.2,.4,.8,.25]};
function squareReference(height=1,depth=1){
  const a=Math.SQRT1_2,source=[[1,0,-height/2],[0,1,-height/2],[-1,0,-height/2],[0,-1,-height/2],[-a,a,height/2],[-a,-a,height/2],[a,-a,height/2],[a,a,height/2]];
  const sourceFaces=[[1,2,3,0],[4,7,6,5],[0,3,4],[4,3,7],[1,0,5],[5,0,4],[2,1,6],[6,1,5],[3,2,7],[7,2,6]],edgeMap=new Map();
  for(const f of sourceFaces)for(let i=0;i<f.length;i++)edgeMap.set(ids([f[i],f[(i+1)%f.length]]),[f[i],f[(i+1)%f.length]].sort((a,b)=>a-b));
  const sourceEdges=[...edgeMap.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const vertices=[-depth/2,depth/2].flatMap(t=>source.map(([x,y,z])=>[x,y,t,z]));
  const faces=[...sourceFaces.map(f=>[...f].reverse()),...sourceFaces.map(f=>f.map(v=>v+8)),...sourceEdges.map(([a,b])=>[a,b,b+8,a+8])];
  const edgeFaces=new Map(sourceEdges.map((e,i)=>[ids(e),20+i]));
  const cells=[Array.from({length:10},(_,i)=>i),Array.from({length:10},(_,i)=>i+10),...sourceFaces.map((f,i)=>[i,i+10,...f.map((a,j)=>edgeFaces.get(ids([a,f[(j+1)%f.length]])))])];
  const edges=[...sourceEdges,...sourceEdges.map(e=>e.map(v=>v+8)),...Array.from({length:8},(_,i)=>[i,i+8])];
  return {vertices,edges,faces,cells,source,sourceFaces};
}
function verifySquare(m){
  const e=m.metadata.crossedAntiprismSegmentotope,r=squareReference(e.height,e.depth),matrix=e.commonOrientation.matrix;
  assert.deepEqual(counts(m),[16,40,36,12]);
  r.vertices.forEach((p,i)=>{const q=matrix.map(row=>row.reduce((s,x,j)=>s+x*p[j],0));q.push(p[3]);q.forEach((x,j)=>near(m.vertices[i][j],x));});
  assert.deepEqual(m.edges.map(ids).sort(),r.edges.map(ids).sort());assert.deepEqual(m.faces.map(cycle).sort(),r.faces.map(cycle).sort());
  assert.deepEqual(m.cells.map(c=>c.map(f=>cycle(m.faces[f])).sort().join('|')).sort(),r.cells.map(c=>c.map(f=>cycle(r.faces[f])).sort().join('|')).sort());
  assert.deepEqual(e.layerCapCellIds,[2,3]);assert.deepEqual(e.crossedAntiprismLateralCellIds,[0,1]);assert.equal(e.triangularPrismLateralCellIds.length,8);
  for(const layer of e.layers){
    assert.equal(layer.singleConvexLayer,true);assert.equal(layer.convexCaps,true);
    assert.equal(ids(new Set(m.cells[layer.capCellIds[0]].flatMap(f=>m.faces[f]))),ids(layer.vertexIds));
    const boundary=m.cells[layer.capCellIds[0]];assert.equal(boundary.length,6);assert.ok(boundary.every(f=>m.faces[f].length===4));
    for(const v of layer.vertexIds)near(m.vertices[v][3],layer.fourthCoordinate);
  }
  // Independent local crossed facet proof: triangle [0,3,4] has other factor
  // vertices on both sides, hence cannot be a convex supporting boundary.
  const [p,q,t]=[r.source[0],r.source[3],r.source[4]],u=q.map((x,i)=>x-p[i]),v=t.map((x,i)=>x-p[i]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],distances=r.source.map(q=>q.reduce((s,x,i)=>s+(x-p[i])*n[i],0));
  assert.ok(Math.min(...distances)<-1e-5&&Math.max(...distances)>1e-5,'Crossed lateral triangle must cut through other source vertices');
}
function verifySource(m){
  const e=m.metadata.crossedAntiprismSegmentotope,s=e.sourceFactorModel,v=s.vertices.length,g=e.layers[0].capCellIds.length;
  assert.equal(m.dimension,4);assert.equal(m.embeddingDimension,4);assert.equal(m.interpretation,'generalized-complex');assert.equal(m.numeric.certified,false);assert.equal(m.measure,undefined);
  assert.deepEqual(counts(m),[4*e.n,10*e.n,8*e.n+4*g,2*e.n+4*g]);assert.equal(e.resultSourceModelId,m.id);assert.equal(e.resultSourceFingerprint,m.fingerprint);
  assert.equal(e.sourceFactorModelId,s.id);assert.equal(e.sourceFactorFingerprint,s.fingerprint);assert.match(e.sourceFactorSnapshotSha256,/^[a-f0-9]{64}$/);
  assert.equal(s.metadata.rationalAntiprism.n,e.n);assert.equal(s.metadata.rationalAntiprism.d,e.d);near(e.rawUpperRotationRadians,Math.PI*e.d/e.n);assert.deepEqual(e.coordinateOwnership.sourcePrismToOutputAxisOrder,[0,1,3,2]);
  for(let i=0;i<m.vertices.length;i++){
    const map=e.maps.vertices[i],p=s.vertices[map.sourceVertexId],xyz=[p[0],p[1],(map.intervalEndpoint?1:-1)*e.depth/2],q=e.commonOrientation.matrix.map(row=>row.reduce((sum,x,k)=>sum+x*xyz[k],0));q.push(p[2]);q.forEach((x,j)=>near(m.vertices[i][j],x));assert.equal(map.sourceVertexId,i%v);
  }
  for(const [f,outputs] of e.sourceMaps.faces.entries())for(const output of outputs){
    const endpoint=e.maps.faces[output].intervalEndpoint;assert.equal(cycle(m.faces[output]),cycle(s.faces[f].map(i=>i+endpoint*v)));
  }
  if(m.metadata.offColors)for(let i=0;i<m.faces.length;i++){
    const record=e.maps.faces[i],expected=record.role==='source-face'?(s.metadata.offColors?.faces?.[record.sourceFaceId]??null):null;assert.deepEqual(m.metadata.offColors.faces[i],expected);
  }
  if(m.metadata.offColors)assert.ok(m.metadata.offColors.cells.every(c=>c===null));
  const use=Array(m.faces.length).fill(0);for(const cell of m.cells){const links=new Map();for(const f of cell){use[f]++;const row=m.faces[f];for(let i=0;i<row.length;i++){const edge=ids([row[i],row[(i+1)%row.length]]);links.set(edge,(links.get(edge)||0)+1);}}assert.ok([...links.values()].every(n=>n===2));}assert.ok(use.every(n=>n===2));
  for(const kind of ['vertices','edges','faces','cells'])assert.deepEqual(e.componentPartitions.flatMap(p=>p.maps[kind]).sort((a,b)=>a-b),Array.from({length:m[kind].length},(_,i)=>i));
  assert.equal(e.recoverableCompoundComponents,false);assert.equal(m.components,undefined);
}
function sameCoordinates(a,b,scale=1){assert.equal(a.length,b.length);a.forEach((p,i)=>p.forEach((x,j)=>near(x,scale*b[i][j])));}
function nativeRequests(requests){
  const {spawnSync}=require('node:child_process');
  const result=spawnSync(process.env.POLYTOPE_PYTHON||'python',['-B','-m','engine.server'],{cwd:root,windowsHide:true,input:requests.map(r=>JSON.stringify(r)).join('\n')+'\n',encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);const replies=result.stdout.trim().split(/\r?\n/).map(JSON.parse);assert.equal(replies.length,requests.length);return replies;
}
function selfTest(){
  const r=squareReference();assert.deepEqual(counts(r),[16,40,36,12]);
  const good=[{symbol:'4/3',radius:1,height:1},{symbol:'4/3',base_edge:Math.SQRT2,height:1},{symbol:'4/3',radius:1,side_edge:Math.sqrt(3+Math.SQRT2)},{symbol:'4/3',base_edge:Math.SQRT2,side_edge:Math.sqrt(3+Math.SQRT2)},{symbol:'4/-3',height:1},{symbol:'5/-3',height:1},{symbol:'6/4',height:1,cap_colors:[colorByte,colorUnit]},{symbol:'4/3',height:1,orientation:[[-1,0,0],[0,1,0],[0,0,1]]}];
  const bad=[{symbol:'5/2',height:1},{symbol:'4/3'},{symbol:'4/3',height:1,depth:0},{symbol:'4/3',height:1,orientation:[[2,0,0],[0,1,0],[0,0,1]]}];
  const requests=[...good,...bad,good[0]].map((params,id)=>({id,op:'generate',params:{kind:'crossed-antiprism-segmentotope',depth:1,...params}}));
  const replies=nativeRequests(requests);good.forEach((_,i)=>{assert.equal(replies[i].ok,true,replies[i].error);verifySource(replies[i].result);});
  for(let i=0;i<4;i++){verifySquare(replies[i].result);sameCoordinates(replies[i].result.vertices,replies[0].result.vertices);}
  bad.forEach((_,i)=>assert.equal(replies[good.length+i].ok,false));assert.equal(replies.at(-1).ok,true);verifySquare(replies.at(-1).result);
  assert.deepEqual(replies[6].result.metadata.crossedAntiprismSegmentotope.sourceFactorModel.metadata.rationalAntiprism.orderedSourceCycles,[[0,4,2],[1,5,3]]);
  const model=replies[6].result,document={id:'crossed-self-test',cursor:0,states:[{model,view:{coordinateUnit:'mm'}}]};
  const scaled=nativeRequests([{op:'recipe-run',params:{document,operation:'transform',parameters:{scale:2}}}])[0];assert.equal(scaled.ok,true,scaled.error);
  const history=nativeRequests([{op:'recipe-replay',params:{document:scaled.result}},{op:'recipe-branch',params:{document:scaled.result,parameters:{scale:3}}}]);
  for(const response of history)assert.equal(response.ok,true,response.error);
  assert.deepEqual(geometry(history[0].result.states[0].model),geometry(active({active:0,documents:[scaled.result]}).model));sameCoordinates(history[1].result.states[1].model.vertices,model.vertices,3);
  console.log('Crossed segmentotope headless native self-test PASS: four modes; independent4/3 complete nonconvex incidence; raw signed/unreduced/RGBA ownership; malformed request recovery; scale Replay/Branch. No app launched.');
}
async function main(){
  const runtime=await guardRuntime(); // Mandatory BEFORE importing/launching Electron.
  const {_electron:electron}=require('playwright'),started=performance.now(),artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));await fs.mkdir(artifacts,{recursive:true});
  const folder=await fs.mkdtemp(path.join(artifacts,runtime.packaged?'crossed-segmentotope-packaged-smoke-':'crossed-segmentotope-smoke-')),profile=path.join(folder,'profile');await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
  const checks=[],errors=[],files=[];let page,serial=0;
  try{
    assert.equal((await app.evaluate(({app})=>app.polytopeQualification))?.mode,runtime.hidden?'hidden-no-focus':undefined);page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>document.getElementById('crossed-segmentotope-settings')&&document.getElementById('model-name').textContent==='Tesseract');
    await page.evaluate(()=>{window.crossedStatuses=[];new MutationObserver(()=>window.crossedStatuses.push(document.getElementById('status').textContent)).observe(document.getElementById('status'),{childList:true,subtree:true,characterData:true});});
    const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
    const disclose=async id=>{if(!await page.locator('#'+id).evaluate(n=>n.open))await page.locator('#'+id+' > summary').click();};
    const construct=async(id='crossed-segmentotope-settings')=>{if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();await disclose(id);};
    const save=async label=>{await done();const file=path.join(folder,`${String(++serial).padStart(2,'0')}-${label}.polyproj`);await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.locator('#save').click();await page.waitForFunction(file=>window.crossedStatuses.includes('Saved '+file),file);await done();const bytes=await fs.readFile(file);files.push({file,sha256:hash(bytes)});return {file,project:JSON.parse(bytes)};};
    const open=async file=>{await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#open').click();await page.waitForFunction(file=>window.crossedStatuses.includes('Opened '+file),file);await done();};
    const fixture=async(label,project)=>{const file=path.join(folder,label+'.polyproj'),bytes=Buffer.from(JSON.stringify(project));await fs.writeFile(file,bytes);files.push({file,sha256:hash(bytes)});return file;};
    const newDoc=async callback=>{const n=await page.locator('#document-tabs > button').count();await callback();await page.waitForFunction(n=>document.getElementById('document-tabs').children.length===n+1,n);await done();};
    const generate=async({symbol='4/3',sizing='radius',elevation='height',size=sizing==='radius'?'1':'sqrt(2)',rise=elevation==='height'?'1':'sqrt(3+sqrt(2))',depth='1',orientation='identity',matrix}={})=>{
      await construct();for(const [id,value] of [['symbol',symbol],['size',size],['elevation-size',rise],['depth',depth]])await page.locator('#crossed-layer-'+id).fill(value);
      await page.locator('#crossed-layer-sizing').selectOption(sizing);await page.locator('#crossed-layer-elevation').selectOption(elevation);await disclose('crossed-layer-orientation-settings');await page.locator('#crossed-layer-orientation').selectOption(orientation);
      if(matrix)for(let i=0;i<9;i++)await page.locator('#crossed-layer-matrix-'+i).fill(String(matrix.flat()[i]));
      await newDoc(()=>page.locator('#generate-crossed-segmentotope').click());return save('generated-'+symbol.trim().replace(/\W/g,'-')+'-'+sizing+'-'+elevation);
    };
    await done();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1484,900));const initial=await save('initial'),modes=[];
    for(const sizing of ['radius','base-edge'])for(const elevation of ['height','side-edge']){const snapshot=await generate({sizing,elevation});const m=active(snapshot.project).model;verifySource(m);verifySquare(m);modes.push(snapshot);assert.equal(m.provenance.generator.kind,'crossed-antiprism-segmentotope');}
    for(const snapshot of modes)sameCoordinates(active(snapshot.project).model.vertices,active(modes[0].project).model.vertices);
    assert.deepEqual(geometry(modes.at(-1).project.documents[0].states[0].model),geometry(active(initial.project).model));await page.screenshot({path:path.join(folder,'crossed-square-product.png')});
    checks.push('actual four sizing modes produce every independently transcribed4/3 vertex/edge/ordered face/cell16/40/36/12, convex layer-cap membership and genuinely crossed lateral facet; original document unchanged and no filled measure');
    for(const symbol of ['5/-3',' 6/-4 ']){const snapshot=await generate({symbol});const m=active(snapshot.project).model;verifySource(m);assert.equal(m.provenance.generator.parameters.symbol,symbol);assert.equal(m.metadata.crossedAntiprismSegmentotope.symbol,symbol);
      if(symbol.includes('6')){assert.deepEqual(counts(m),[24,60,56,20]);const e=m.metadata.crossedAntiprismSegmentotope;assert.deepEqual(e.sourceFactorModel.metadata.rationalAntiprism.orderedSourceCycles,[[0,2,4],[1,3,5]]);assert.equal(e.componentPartitions.length,2);assert.ok(e.componentPartitions.every(p=>p.historicalSourceComponentIds.length===1));}
    }
    checks.push('actual signed5/-3 and unreduced6/-4 preserve raw half-step phases, angular source IDs/full snapshots and explicit disconnected partitions without fabricated current component leaves');
    const reflected=await generate({orientation:'reflect-x'}),reflectedModel=active(reflected.project).model;verifySource(reflectedModel);verifySquare(reflectedModel);sameCoordinates(reflectedModel.vertices,active(modes[0].project).model.vertices.map(([x,y,z,w])=>[-x,y,z,w]));
    const matrix=[[0,-1,0],[1,0,0],[0,0,-1]],rotated=await generate({orientation:'matrix',matrix}),rotatedModel=active(rotated.project).model;verifySource(rotatedModel);verifySquare(rotatedModel);sameCoordinates(rotatedModel.vertices,active(modes[0].project).model.vertices.map(([x,y,z,w])=>[-y,x,-z,w]));
    checks.push('actual common X reflection and explicit orthogonal matrix preserve all cycles/ownership and produce independently checked coordinates without gyro aliases');
    const nativeColored=await page.evaluate(params=>window.polytope.engine({op:'generate',params:{kind:'crossed-antiprism-segmentotope',...params}},'crossed-color-fixture'),{symbol:'6/4',height:1,depth:1,cap_colors:[colorByte,colorUnit]});verifySource(nativeColored);
    const colored=clone(rotated.project);colored.active=0;colored.documents=[{id:'crossed-colored-source',cursor:0,states:[{model:nativeColored,view:{...clone(active(rotated.project).view),coordinateUnit:'mm'},notes:'Literal current source and historical factor RGBA'}]}];
    await open(await fixture('colored-native-source',colored));const persisted=await save('colored-native');await open(persisted.file);const reopened=await save('colored-reopened'),beforeScale=active(reopened.project);verifySource(beforeScale.model);assert.deepEqual(beforeScale.model.metadata,nativeColored.metadata);assert.deepEqual(beforeScale.model.provenance,nativeColored.provenance);assert.equal(beforeScale.view.coordinateUnit,'mm');
    checks.push('actual native factor generation retains byte/unitRGBA in source snapshots and mapped copies; UI Save/Open preserves full source/provenance, units and no solid measure');
    await construct();await page.locator('#model-scale').fill('2');await page.locator('#scale').click();await done();const scaled=await save('scale-two'),scaledModel=active(scaled.project).model;sameCoordinates(scaledModel.vertices,beforeScale.model.vertices,2);assert.deepEqual(scaledModel.metadata,beforeScale.model.metadata);assert.equal(active(scaled.project).view.coordinateUnit,'mm');assert.equal(doc(scaled.project).operationHistory.nodes.at(-1).op,'transform');
    await page.locator('#undo').click();await done();assert.deepEqual(geometry(active((await save('scale-undo')).project).model),geometry(beforeScale.model));await page.locator('#redo').click();await done();assert.deepEqual(geometry(active((await save('scale-redo')).project).model),geometry(scaledModel));
    await construct('history-settings');await newDoc(()=>page.locator('#history-replay').click());assert.deepEqual(geometry(active((await save('scale-replay')).project).model),geometry(scaledModel));
    await construct('history-settings');await page.locator('#history-branch').click();await page.locator('#history-parameters').fill('{"scale":3}');await newDoc(()=>page.locator('#history-parameters-apply').click());const branched=await save('scale-branch');sameCoordinates(active(branched.project).model.vertices,beforeScale.model.vertices,3);assert.deepEqual(active(branched.project).model.metadata,beforeScale.model.metadata);await open(branched.file);assert.deepEqual(doc((await save('history-reopened')).project).operationHistory,doc(branched.project).operationHistory);
    checks.push('actual source scale undo/redo, Replay and parent-based parameter Branch preserve original snapshotRGBA/units/history; generated-only geometry binding stays historical after scaling');
    const before=(await save('before-refusals')).project;
    const refuse=async(change,message)=>{await construct();await page.locator('#crossed-layer-symbol').fill('4/3');await page.locator('#crossed-layer-sizing').selectOption('radius');await page.locator('#crossed-layer-size').fill('1');await page.locator('#crossed-layer-elevation').selectOption('height');await page.locator('#crossed-layer-elevation-size').fill('1');await page.locator('#crossed-layer-depth').fill('1');await disclose('crossed-layer-orientation-settings');await page.locator('#crossed-layer-orientation').selectOption('identity');await page.evaluate(()=>document.getElementById('toast').hidden=true);await change();await page.locator('#generate-crossed-segmentotope').click();await page.waitForFunction(message=>!document.getElementById('toast').hidden&&document.getElementById('toast').textContent.includes(message),message);await done();const p=(await save('refused')).project;assert.equal(p.documents.length,before.documents.length);assert.deepEqual(doc(p).states,doc(before).states);assert.deepEqual(doc(p).operationHistory,doc(before).operationHistory);};
    await refuse(()=>page.locator('#crossed-layer-symbol').fill('5/2'),'n/2');await refuse(()=>page.locator('#crossed-layer-depth').fill('0'),'depth: result is outside the declared domain.');await refuse(async()=>{await page.locator('#crossed-layer-elevation').selectOption('side-edge');await page.locator('#crossed-layer-elevation-size').fill('1');},'horizontal half-step');await refuse(async()=>{await page.locator('#crossed-layer-orientation').selectOption('matrix');for(let i=0;i<9;i++)await page.locator('#crossed-layer-matrix-'+i).fill(i===0?'2':i%4===0?'1':'0');},'orthogonal');verifySquare(active((await generate()).project).model);
    checks.push('ordinary symbol, zero depth, impossible side and shear/scale matrix refusals leave source/history/documents intact; valid construction recovers');
    await construct('animation-settings');for(const [id,value] of [['animation-duration','1'],['animation-fps','2']]){await page.locator('#'+id).fill(value);await page.locator('#'+id).dispatchEvent('change');}await page.locator('#animation-rotation').click();await page.locator('#animation-target').selectOption('base');const beforeExport=(await save('before-export')).project;
    await app.evaluate(({dialog})=>{globalThis.crossedHeld=false;dialog.showSaveDialog=()=>new Promise(resolve=>{globalThis.crossedHeld=true;globalThis.crossedRelease=()=>resolve({canceled:true});});});await construct('animation-settings');await page.locator('#animation-png').click();await page.waitForFunction(()=>!document.getElementById('animation-cancel').hidden);await app.evaluate(()=>new Promise((resolve,reject)=>{const until=Date.now()+5000,t=setInterval(()=>{if(globalThis.crossedHeld){clearInterval(t);resolve();}else if(Date.now()>until){clearInterval(t);reject(Error('Export dialog stub not reached.'));}},10);}));
    for(const id of ['generate-crossed-segmentotope','crossed-layer-symbol','crossed-layer-size','crossed-layer-depth','crossed-layer-orientation','crossed-layer-matrix-0'])assert.equal(await page.locator('#'+id).isEnabled(),false);
    await page.evaluate(()=>{document.getElementById('toast').hidden=true;document.getElementById('generate-crossed-segmentotope').dispatchEvent(new MouseEvent('click',{bubbles:true}));});await page.waitForFunction(()=>!document.getElementById('toast').hidden&&document.getElementById('toast').textContent.includes('Finish animation export'));await page.locator('#animation-cancel').click();await app.evaluate(()=>globalThis.crossedRelease());await page.waitForFunction(()=>!document.getElementById('animation-png').disabled);await done();const afterExport=(await save('after-export')).project;assert.deepEqual(doc(afterExport).states,doc(beforeExport).states);assert.equal(afterExport.documents.length,beforeExport.documents.length);assert.equal((await fs.readdir(folder)).filter(x=>x.startsWith('.polytope-animation-')).length,0);
    checks.push('actual held export disables crossed construction, rejects synthetic publication, cancels with unchanged complete source/view and no staging output');
    for(const file of files)assert.equal(hash(await fs.readFile(file.file)),file.sha256);assert.deepEqual(errors,[]);await page.screenshot({path:path.join(folder,'crossed-workspace.png')});checks.push('native fixtures remain byte-identical and renderer page errors are absent');
    const sourceHashes=[];for(const file of ['scripts/crossed-segmentotope-smoke.cjs','ui/crossed-segmentotope-controls.mjs','engine/crossed_segmentotopes.py'])sourceHashes.push({file,sha256:hash(await fs.readFile(path.join(root,file)))});
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,hidden:runtime.hidden,runtime:runtime.runtime,packaged:Boolean(runtime.packaged),developmentPythonUnavailable:Boolean(runtime.packaged),version:await app.evaluate(({app})=>app.getVersion()),runtimeMainSha256:hash(runtime.entry),canaryPath:runtime.canaryPath,checks,pageErrors:errors,files,sourceHashes,seconds:(performance.now()-started)/1000},null,2));console.log(`Crossed segmentotope smoke PASS: ${checks.length} groups. Artifacts: ${folder}`);
  }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});const diagnostic=await page?.evaluate(()=>({status:document.getElementById('status')?.textContent,toast:document.getElementById('toast')?.textContent,statusTrace:window.crossedStatuses})).catch(()=>null);await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors,diagnostic},null,2));console.error('Artifacts:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
if(require.main===module){if(process.argv.includes('--self-test'))selfTest();else main().catch(error=>{console.error(error);process.exitCode=1;});}
module.exports={squareReference,verifySquare,verifySource,guardRuntime};
