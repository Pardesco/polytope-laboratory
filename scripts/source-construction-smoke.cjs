// Actual source-construction GUI qualification; --self-test never launches an app.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{guardRuntime}=require('./layer-join-smoke.cjs');
const root=path.resolve(__dirname,'..'),clone=structuredClone;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const doc=p=>p.documents[p.active],active=p=>doc(p).states[doc(p).cursor];
const counts=m=>['vertices','edges','faces','cells'].map(k=>m[k].length);
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const cycle=c=>[c,[...c].reverse()].flatMap(f=>f.map((_,i)=>[...f.slice(i),...f.slice(0,i)].join(','))).sort()[0];
const color=i=>i%2?{encoding:'unit',values:[.2,.6,.4,.25]}:{encoding:'byte',values:[25,90,210,128]};
function literal(id,vertices,faces){
  const edges=new Map();for(const f of faces)for(let i=0;i<f.length;i++){
    const e=[f[i],f[(i+1)%f.length]].sort((a,b)=>a-b);edges.set(e.join(','),e);
  }
  return {id,name:id,dimension:3,embeddingDimension:3,interpretation:'generalized-complex',vertices,
    edges:[...edges.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),faces,cells:[],
    numeric:{mode:'float64-approximate',certified:false},metadata:{coordinateUnits:'mm',
      retainedAttribute:{literal:'independent source',numbers:[1,-0,.125]},
      offColors:{faces:faces.map((_,i)=>color(i)),cells:[]}}};
}
function cube(){return literal('Literal source cube',
  [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
  [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]);}
function icosahedron(){
  const phi=(1+Math.sqrt(5))/2,vertices=[];
  for(const a of [-1,1])for(const b of [-phi,phi])vertices.push([0,a,b],[a,b,0],[b,0,a]);
  const adjacent=(a,b)=>Math.abs(Math.hypot(...sub(vertices[a],vertices[b]))-2)<1e-10,faces=[];
  for(let a=0;a<12;a++)for(let b=a+1;b<12;b++)for(let c=b+1;c<12;c++)if(adjacent(a,b)&&adjacent(b,c)&&adjacent(c,a)){
    const face=[a,b,c];if(dot(cross(sub(vertices[b],vertices[a]),sub(vertices[c],vertices[a])),vertices[a])<0)face.reverse();faces.push(face);
  }
  return literal('Literal phi icosahedron',vertices,faces);
}
function starPrism(){
  const vertices=[];for(const z of [-1,1])for(let i=0;i<5;i++)vertices.push([Math.cos(2*Math.PI*i/5),Math.sin(2*Math.PI*i/5),z]);
  const ordered=[0,2,4,1,3],faces=[[...ordered].reverse(),ordered.map(i=>i+5)];
  for(let i=0;i<5;i++){const a=ordered[i],b=ordered[(i+1)%5];faces.push([a,b,b+5,a+5]);}
  const m=literal('Literal crossed 5/2 prism',vertices,faces);m.metadata.rawSymbol='5/2';m.metadata.sourceOrderedCycles=[ordered];return m;
}
function manifold(model){
  const edges=new Map();for(const f of model.faces)for(let i=0;i<f.length;i++){
    const a=f[i],b=f[(i+1)%f.length],key=[a,b].sort((a,b)=>a-b).join(',');
    const row=edges.get(key)||[];row.push(a<b?1:-1);edges.set(key,row);
  }
  assert.equal(edges.size,model.edges.length);assert.ok([...edges.values()].every(row=>row.length===2&&row[0]+row[1]===0));
  assert.deepEqual([...edges.keys()].sort(),model.edges.map(e=>[...e].sort((a,b)=>a-b).join(',')).sort());
  assert.equal(model.vertices.length-model.edges.length+model.faces.length,2);
}
function verifyGeodesic(model,source,frequency=2){
  assert.deepEqual(counts(model),frequency===2?[42,120,80,0]:[12,30,20,0]);
  assert.equal(model.dimension,3);assert.equal(model.interpretation,'generalized-complex');
  assert.equal(model.measure,undefined);assert.equal(model.numeric.certified,false);manifold(model);
  const e=model.metadata.triangularGeodesic;assert.equal(e.frequency,frequency);assert.deepEqual(e.sourceModel,source);
  assert.equal(e.resultModelId,model.id);assert.equal(e.resultFingerprint,model.fingerprint);
  assert.equal(model.metadata.coordinateUnits,'mm');assert.equal(model.provenance.operation,'triangular-geodesic');
  const radius=Math.hypot(...source.vertices[0]);model.vertices.forEach(p=>near(Math.hypot(...p),radius));
  source.vertices.forEach((p,i)=>p.forEach((x,j)=>near(model.vertices[e.sourceMaps.vertices[i]][j],x)));
  if(frequency===2){
    const midIds=new Map();for(let ei=0;ei<source.edges.length;ei++){
      const [a,b]=source.edges[ei],sum=source.vertices[a].map((x,j)=>x+source.vertices[b][j]),length=Math.hypot(...sum);
      const expected=sum.map(x=>x*radius/length),chain=e.sourceEdgeVertexChains[ei];assert.equal(chain.length,3);
      const id=chain[1];expected.forEach((x,j)=>near(model.vertices[id][j],x));midIds.set([a,b].sort((a,b)=>a-b).join(','),id);
    }
    const expected=[];for(const f of source.faces){
      const [a,b,c]=f,get=(a,b)=>midIds.get([a,b].sort((a,b)=>a-b).join(',')),ab=get(a,b),bc=get(b,c),ca=get(c,a);
      expected.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);
    }
    assert.deepEqual(model.faces.map(cycle).sort(),expected.map(cycle).sort());
    assert.ok(e.sourceMaps.faces.every(row=>row.length===4));assert.equal(new Set([...midIds.values()]).size,30);
  }
  assert.deepEqual(model.metadata.offColors.faces,e.faceSources.map(row=>source.metadata.offColors.faces[row.sourceFaceId]));
}
function verifyCore(model,source,star=false){
  assert.deepEqual(counts(model),star?[10,15,7,0]:[8,12,6,0]);manifold(model);
  assert.equal(model.interpretation,'convex-polytope');assert.equal(model.numeric.certified,false);
  assert.equal(model.metadata.coordinateUnits,'mm');assert.equal(model.provenance.operation,'convex-core');
  const e=model.metadata.convexCore;assert.deepEqual(e.sourceModel,source);assert.equal(e.resultModelId,model.id);
  assert.equal(e.resultFingerprint,model.fingerprint);assert.equal(e.classification.sourceModelId,model.id);
  assert.equal(e.classification.status,'passed');assert.equal(e.nativeProjectGate.passed,true);
  assert.equal(e.boundedness.clippingBoxUsed,false);assert.equal(e.boundedness.objectives.length,6);
  const expected=star?undefined:source.vertices.map(p=>p.join(',')).sort();
  if(!star){assert.deepEqual(model.vertices.map(p=>p.join(',')).sort(),expected);near(model.measure.content,8);near(model.measure.boundaryMeasure,24);}
  else{
    const radius=(3-Math.sqrt(5))/2;model.vertices.forEach(p=>{near(Math.hypot(p[0],p[1]),radius);near(Math.abs(p[2]),1);});
    near(model.measure.content,5*radius**2*Math.sin(2*Math.PI/5));assert.equal(e.sourceModel.metadata.rawSymbol,'5/2');
    assert.ok(model.vertices.every(p=>Math.hypot(p[0],p[1])<.5));
  }
  for(const row of e.faceSupportOwners){
    assert.equal(row.sourceFaceIds.length,1);const fi=row.sourceFaceIds[0];
    assert.deepEqual(model.metadata.offColors.faces[row.resultFaceId],source.metadata.offColors.faces[fi]);
  }
}
function selfTest(){
  const ico=icosahedron();assert.deepEqual(counts(ico),[12,30,20,0]);manifold(ico);
  ico.edges.forEach(([a,b])=>near(Math.hypot(...sub(ico.vertices[a],ico.vertices[b])),2));
  assert.deepEqual(counts(cube()),[8,12,6,0]);manifold(cube());assert.deepEqual(counts(starPrism()),[10,15,7,0]);
  const bad=clone(ico);bad.faces[0].reverse();assert.throws(()=>manifold(bad));
  console.log('Source construction literal phi/cube/crossed-prism fixture self-test PASS; no app launched.');
}
async function main(){
  const runtime=await guardRuntime(); // Before requiring or launching Electron.
  const {_electron:electron}=require('playwright'),started=performance.now();
  const artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));
  await fs.mkdir(artifacts,{recursive:true});const folder=await fs.mkdtemp(path.join(artifacts,'source-construction-smoke-'));
  const profile=path.join(folder,'profile');await fs.mkdir(profile);
  await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
  const checks=[],errors=[],files=[];let page,serial=0;
  try{
    assert.equal((await app.evaluate(({app})=>app.polytopeQualification))?.mode,runtime.hidden?'hidden-no-focus':undefined);
    page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>document.getElementById('geodesic-settings')&&document.getElementById('convex-core-settings')&&document.getElementById('model-name').textContent==='Tesseract');
    await page.evaluate(()=>{window.sourceConstructionStatuses=[];new MutationObserver(()=>window.sourceConstructionStatuses.push(document.getElementById('status').textContent)).observe(document.getElementById('status'),{childList:true,subtree:true,characterData:true});});
    const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
    const disclose=async id=>{if(!await page.locator('#'+id).evaluate(n=>n.open))await page.locator('#'+id+' > summary').click();};
    const inspector=async()=>{if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();};
    const construct=async kind=>{await inspector();await page.locator('[data-panel="construct"]').click();await disclose(kind==='geodesic'?'geodesic-settings':'convex-core-settings');};
    const save=async label=>{
      await done();const file=path.join(folder,`${String(++serial).padStart(2,'0')}-${label}.polyproj`);
      await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
      await page.locator('#save').click();await page.waitForFunction(file=>window.sourceConstructionStatuses.includes('Saved '+file),file);await done();
      const bytes=await fs.readFile(file);files.push({file,sha256:hash(bytes)});return {file,project:JSON.parse(bytes)};
    };
    const open=async file=>{
      await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
      await page.locator('#open').click();await page.waitForFunction(file=>window.sourceConstructionStatuses.includes('Opened '+file),file);await done();
    };
    const initial=(await save('initial')).project;
    const replace=async(label,source,extra)=>{
      const p=clone(initial);p.active=0;
      p.documents=[source,...(extra?[extra]:[])].map((model,i)=>({id:'source-fixture-'+i,cursor:0,
        states:[{model:clone(model),notes:'Retain source notes',view:{coordinateUnit:'mm',sectionNormal:[0,0,1],sectionOffset:0,derivedMode:'face',surfaceColors:'source'}}]}));
      const file=path.join(folder,label+'.polyproj'),bytes=Buffer.from(JSON.stringify(p));await fs.writeFile(file,bytes);files.push({file,sha256:hash(bytes)});
      await open(file);return save(label+'-native');
    };
    const execute=async(kind)=>{
      await construct(kind);const n=await page.locator('#history-list button').count();
      if(kind==='geodesic')await page.locator('#geodesic-frequency').fill('2');
      else{for(const axis of ['x','y','z'])await page.locator('#core-'+axis).fill('0');await page.locator('#core-color-policy').selectOption('require-equal');}
      await page.locator(kind==='geodesic'?'#make-geodesic':'#make-convex-core').click();
      await page.waitForFunction(n=>document.getElementById('history-list').children.length===n+1,n);await done();return save(kind+'-result');
    };
    const replay=async()=>{await inspector();await disclose('history-settings');const n=await page.locator('#document-tabs > button').count();await page.locator('#history-replay').click();await page.waitForFunction(n=>document.getElementById('document-tabs').children.length===n+1,n);await done();return save('replayed');};
    const branch=async params=>{
      await inspector();await disclose('history-settings');assert.equal(await page.locator('#history-branch').isEnabled(),true);
      const n=await page.locator('#document-tabs > button').count();await page.locator('#history-branch').click();
      await page.locator('#history-parameters').fill(JSON.stringify(params));await page.locator('#history-parameters-apply').click();
      await page.waitForFunction(n=>document.getElementById('document-tabs').children.length===n+1,n);await done();return save('parameter-branch');
    };

    const icoSource=await replace('literal-icosahedron',icosahedron()),ico=active(icoSource.project).model;
    const geodesic=await execute('geodesic'),geo=active(geodesic.project).model;verifyGeodesic(geo,ico);
    assert.deepEqual(doc(geodesic.project).states[0].model,ico);assert.equal(active(geodesic.project).view.coordinateUnit,'mm');
    await page.screenshot({path:path.join(folder,'icosahedron-frequency2.png')});
    checks.push('literal phi icosahedron f2 yields independently checked42/120/80 ordered radial triangles, source edge midpoint chains, full snapshots, units and byte/unit RGBA without filled measure');
    await page.locator('#undo').click();assert.deepEqual(active((await save('geo-undo')).project).model,ico);
    await page.locator('#redo').click();assert.deepEqual(active((await save('geo-redo')).project).model,geo);
    await open(geodesic.file);assert.deepEqual(active((await save('geo-reopened')).project).model,geo);
    assert.deepEqual(active((await replay()).project).model,geo);
    const geoBranch=await branch({frequency:1});verifyGeodesic(active(geoBranch.project).model,ico,1);
    const geoNodes=doc(geoBranch.project).operationHistory.nodes;assert.equal(geoNodes.at(-1).parent,geoNodes.at(-2).parent);
    assert.deepEqual(active((await replay()).project).model,active(geoBranch.project).model);
    checks.push('geodesic actual native Save/Open, undo/redo, Replay and f1 parameter branch preserve full source attributes; branch returns to original ico12/30/20 instead of refining the prior f2 result');

    const cubeSource=await replace('literal-cube',cube()),base=active(cubeSource.project).model;
    const core=await execute('core'),coreModel=active(core.project).model;verifyCore(coreModel,base);
    assert.deepEqual(doc(core.project).states[0].model,base);await page.screenshot({path:path.join(folder,'cube-convex-core.png')});
    await page.locator('#undo').click();assert.deepEqual(active((await save('core-undo')).project).model,base);
    await page.locator('#redo').click();assert.deepEqual(active((await save('core-redo')).project).model,coreModel);
    await open(core.file);assert.deepEqual(active((await save('core-reopened')).project).model,coreModel);
    assert.deepEqual(active((await replay()).project).model,coreModel);
    const coreBranch=await branch({center:[.25,0,0],color_policy:'require-equal'});verifyCore(active(coreBranch.project).model,base);
    assert.deepEqual(active(coreBranch.project).model.metadata.convexCore.center,[.25,0,0]);
    const coreNodes=doc(coreBranch.project).operationHistory.nodes;assert.equal(coreNodes.at(-1).parent,coreNodes.at(-2).parent);
    assert.deepEqual(active((await replay()).project).model,active(coreBranch.project).model);
    checks.push('core cube8/12/6 independently preserves physical corners, RGBA/unit support ownership and approximate area24/content8 through persistence/replay; center parameter branch binds original source rather than previous core');

    const crossed=await replace('literal-crossed-prism',starPrism()),star=active(crossed.project).model;
    const chamber=await execute('core');verifyCore(active(chamber.project).model,star,true);
    assert.deepEqual(doc(chamber.project).states[0].model,star);await page.screenshot({path:path.join(folder,'pentagram-prism-core.png')});
    checks.push('literal crossed5/2 prism produces smaller10/15/7 pentagonal chamber with analytic radius (3−sqrt5)/2; unreduced source cycles remain historical and no circumradius1 source Hull replaces them');

    for(const [kind,source,mutation] of [['core',cube(),'unit'],['geodesic',icosahedron(),'source']]){
      const before=await replace('held-'+kind,source,mutation==='source'?cube():undefined);
      await construct(kind);if(kind==='geodesic')await page.locator('#geodesic-frequency').fill('2');
      await app.evaluate(({ipcMain},operation)=>{
        const original=ipcMain._invokeHandlers.get('engine');if(typeof original!=='function')throw Error('Native engine handler unavailable.');
        globalThis.sourceConstructionHandler=original;globalThis.sourceConstructionHeld=false;
        ipcMain.removeHandler('engine');ipcMain.handle('engine',async(event,request,id)=>{
          const result=await original(event,request,id);
          if(request.op==='recipe-run'&&request.params.operation===operation){globalThis.sourceConstructionHeld=true;await new Promise(resolve=>{globalThis.sourceConstructionRelease=resolve;});}
          return result;
        });
      },kind==='geodesic'?'triangular-geodesic':'convex-core');
      try{
        await page.locator(kind==='geodesic'?'#make-geodesic':'#make-convex-core').click();
        await app.evaluate(()=>new Promise((resolve,reject)=>{const until=Date.now()+10000,timer=setInterval(()=>{
          if(globalThis.sourceConstructionHeld){clearInterval(timer);resolve();}else if(Date.now()>until){clearInterval(timer);reject(Error('Construction never reached held native completion.'));}
        },10);}));
        if(mutation==='unit')await page.locator('#model-unit').selectOption('cm');else await page.locator('#document-tabs > button').nth(1).click();
        await app.evaluate(()=>globalThis.sourceConstructionRelease());
        await page.waitForFunction(()=>!document.getElementById('toast').hidden&&/source|document|units|changed/i.test(document.getElementById('toast').textContent));await done();
        const after=await save(kind+'-stale-refused');assert.equal(after.project.active,mutation==='source'?1:0);
        for(let i=0;i<before.project.documents.length;i++){
          const a=after.project.documents[i],b=before.project.documents[i];assert.equal(a.states.length,b.states.length);
          assert.deepEqual(a.states.map(s=>s.model),b.states.map(s=>s.model));assert.deepEqual(a.operationHistory,b.operationHistory);
          assert.equal(a.states[0].notes,b.states[0].notes);
        }
        if(mutation==='unit')assert.equal(active(after.project).view.coordinateUnit,'cm');
        checks.push(kind+' actual held native completion refuses changed '+mutation+' ownership without publishing geometry/history or reverting the user edit');
      }finally{
        await app.evaluate(({ipcMain})=>{globalThis.sourceConstructionRelease?.();ipcMain.removeHandler('engine');ipcMain.handle('engine',globalThis.sourceConstructionHandler);delete globalThis.sourceConstructionHandler;delete globalThis.sourceConstructionRelease;});
      }
    }
    for(const file of files)assert.equal(hash(await fs.readFile(file.file)),file.sha256);assert.deepEqual(errors,[]);
    const result={passed:true,packaged:Boolean(runtime.packaged),runtime:runtime.runtime,hidden:runtime.hidden,
      version:await app.evaluate(({app})=>app.getVersion()),checks,pageErrors:errors,files,seconds:(performance.now()-started)/1000};
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));console.log('Source construction smoke PASS. Artifacts: '+folder);
  }catch(error){
    await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});
    await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors},null,2));
    console.error('Artifacts: '+folder);throw error;
  }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
if(require.main===module){if(process.argv.includes('--self-test'))selfTest();else main().catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={icosahedron,cube,starPrism,verifyGeodesic,verifyCore,manifold};
