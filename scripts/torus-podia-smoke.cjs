// Actual .14 construction controls and native persistence. Root launches only
// after hidden-mode HWND/cadence qualification; --self-test launches nothing.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const documentOf=p=>p.documents[p.active],active=p=>documentOf(p).states[documentOf(p).cursor];
const geometry=m=>Object.fromEntries(['dimension','embeddingDimension','vertices','edges','faces','cells','fingerprint'].map(k=>[k,m[k]]));
const counts=m=>['vertices','edges','faces','cells'].map(k=>m[k].length);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const determinant=(a,b,c)=>a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);
function rankThree(vertices){
  const p=vertices[0],vectors=vertices.slice(1).map(v=>v.map((x,i)=>x-p[i]));
  for(let a=0;a<vectors.length;a++)for(let b=a+1;b<vectors.length;b++)for(let c=b+1;c<vectors.length;c++)if(Math.abs(determinant(vectors[a],vectors[b],vectors[c]))>1e-8)return true;
  return false;
}
function verifyTorus(m,n,arm,ratio=.5,radius=1){
  assert.equal(m.dimension,3);assert.deepEqual(counts(m),[n*arm,2*n*arm,n*arm,0]);assert.ok(rankThree(m.vertices));
  const expectedEdges=[],expectedFaces=[];
  for(let i=0;i<n;i++)for(let j=0;j<arm;j++)expectedEdges.push([i*arm+j,((i+1)%n)*arm+j]);
  for(let i=0;i<n;i++)for(let j=0;j<arm;j++)expectedEdges.push([i*arm+j,i*arm+(j+1)%arm]);
  for(let i=0;i<n;i++)for(let j=0;j<arm;j++)expectedFaces.push([i*arm+j,((i+1)%n)*arm+j,((i+1)%n)*arm+(j+1)%arm,i*arm+(j+1)%arm]);
  assert.deepEqual(m.edges,expectedEdges);assert.deepEqual(m.faces,expectedFaces);
  for(let i=0;i<n;i++)for(let j=0;j<arm;j++){
    const u=i*2*Math.PI/n,v=j*2*Math.PI/arm,r=radius*(1+ratio*Math.cos(v)),point=m.vertices[i*arm+j];
    [r*Math.cos(u),r*Math.sin(u),radius*ratio*Math.sin(v)].forEach((x,k)=>near(point[k],x));
  }
  const boundary=new Map();for(const face of m.faces)for(let j=0;j<face.length;j++){const edge=[face[j],face[(j+1)%face.length]].sort((a,b)=>a-b).join(',');boundary.set(edge,(boundary.get(edge)||0)+1);}
  assert.equal(boundary.size,2*n*arm);for(const value of boundary.values())assert.equal(value,2);
  assert.equal(m.vertices.length-m.edges.length+m.faces.length,0);
  assert.equal(m.interpretation,'generalized-complex');assert.equal(m.measure,undefined);
  const info=m.metadata.polyhedralTorus;assert.equal(info.sourceModelId,m.id);assert.equal(info.sourceFingerprint,m.fingerprint);assert.equal(info.topology.eulerCharacteristic,0);assert.equal(info.topology.genus,1);
  assert.deepEqual(info.maps.vertices[arm*n-1],{ringIndex:n-1,armIndex:arm-1});assert.deepEqual(info.maps.faces,info.maps.vertices);
}
function sourceCycles(n,d){
  const used=new Set(),cycles=[];for(let seed=0;seed<n;seed++){if(used.has(seed))continue;const cycle=[];let v=seed;while(!used.has(v)){cycle.push(v);used.add(v);v=((v+d)%n+n)%n;}cycles.push(cycle);}return cycles;
}
function verifyPodium(m,{anti=false,n=3,d=1,rb=2,rt=1,height=2}={}){
  const cycles=sourceCycles(n,d),g=cycles.length,theta=anti?Math.PI*d/n:0;
  assert.equal(m.dimension,3);assert.deepEqual(counts(m),[2*n,(anti?4:3)*n,(anti?2:1)*n+2*g,0]);assert.ok(rankThree(m.vertices));
  const info=m.metadata[anti?'rationalAntipodium':'rationalPodium'];
  near(info.baseRadius,rb);near(info.topRadius,rt);near(info.height,height);near(info.upperRotationRadians,theta);
  near(info.sideEdgeLength,Math.hypot(height,Math.hypot(rb-rt,2*Math.sqrt(rb*rt)*Math.sin(theta/2))));
  assert.deepEqual(info.orderedSourceCycles,cycles);assert.deepEqual(m.faces.slice(0,g),cycles.map(c=>[...c].reverse()));assert.deepEqual(m.faces.slice(g,2*g),cycles.map(c=>c.map(v=>v+n)));
  for(let i=0;i<n;i++)for(let layer=0;layer<2;layer++){
    const angle=i*2*Math.PI/n+(layer?theta:0),radius=layer?rt:rb;
    [radius*Math.cos(angle),radius*Math.sin(angle),(layer?1:-1)*height/2].forEach((value,axis)=>near(m.vertices[layer*n+i][axis],value));
    assert.deepEqual(info.maps.vertices[layer*n+i],{role:'ring-vertex',sourceIndex:layer,sourceVertexId:i});
  }
  const lateral=anti?Array.from({length:n},(_,i)=>{const next=((i+d)%n+n)%n;return [[i,next,i+n],[i+n,next,next+n]];}).flat():cycles.flatMap(c=>c.map((a,j)=>{const b=c[(j+1)%c.length];return [a,b,b+n,a+n];}));
  assert.deepEqual(m.faces.slice(2*g),lateral);
  for(let layer=0;layer<2;layer++){
    const source=info.sourceModels[layer];assert.deepEqual(source.faces,cycles);assert.equal(source.metadata.regularStarPolygon.symbol,`${n}/${d}`);assert.equal(info.inputs[layer].sourceModelId,source.id);assert.equal(info.inputs[layer].sourceFingerprint,source.fingerprint);
    for(let i=0;i<n;i++)source.vertices[i].forEach((x,k)=>near(x,(layer?rt:rb)*[Math.cos(i*2*Math.PI/n),Math.sin(i*2*Math.PI/n)][k]));
  }
  assert.equal(m.numeric.certified,false);
  assert.equal(info.resultSourceFingerprint,m.fingerprint);assert.equal(m.provenance.generator.kind,anti?'rational-antipodium':'rational-podium');
  const final=m.metadata.constructionFinalization;assert.equal(final.nativeProjectGate.status,'passed');assert.equal(final.ownership.adapter,'podia-components');assert.equal(final.ownership.components,g);assert.equal(final.currentModelId,m.id);assert.equal(final.currentFingerprint,m.fingerprint);
  if(d===1){assert.equal(m.interpretation,'convex-polytope');assert.equal(final.classification.status,'passed');assert.equal(final.outcome,'promoted-convex');for(const name of ['content','boundaryMeasure'])assert.ok(Number.isFinite(m.measure[name])&&m.measure[name]>0);}
  else{assert.equal(m.interpretation,'generalized-complex');assert.equal(m.measure,undefined);assert.equal(final.outcome,'retained-generalized');}
  assert.equal(info.recoverableCompoundComponents,true);assert.equal(m.components.length,g);assert.equal(m.metadata.podiaComponents.partitionComponents.length,g);
  const owned=Object.fromEntries(['vertices','edges','faces','cells'].map(kind=>[kind,new Set()]));
  m.components.forEach((component,ordinal)=>{
    const part=info.componentPartitions[ordinal],attachment=m.metadata.podiaComponents.partitionComponents[ordinal];assert.deepEqual(component.maps,part.maps);assert.equal(attachment.componentId,component.id);assert.equal(attachment.leafSourceModelId,component.sourceModelId);assert.equal(attachment.leafSourceFingerprint,component.sourceFingerprint);assert.deepEqual(attachment.sourcePath,component.sourcePath);assert.deepEqual(attachment.sourceComponentIds,part.sourceComponentIds);
    assert.deepEqual(component.maps.vertices,[...cycles[ordinal],...cycles[ordinal].map(v=>v+n)].sort((a,b)=>a-b));
    let leaf=component.sourcePath.length?m:m.metadata.podiaComponents.directLeafSource;for(const index of component.sourcePath)leaf=leaf.metadata.compound.sourceModels[index];
    assert.equal(leaf.dimension,3);assert.equal(leaf.id,component.sourceModelId);assert.equal(leaf.fingerprint,component.sourceFingerprint);assert.deepEqual(leaf.metadata.podiaLeaf.sourceFactorModels,info.sourceModels);assert.deepEqual(leaf.metadata.podiaLeaf.sourceFactorInputs,info.inputs);
    assert.deepEqual(leaf.vertices,component.maps.vertices.map(v=>m.vertices[v]));
    for(const kind of ['edges','faces','cells']){const lower=kind==='cells'?'faces':'vertices';assert.deepEqual(leaf[kind].map(row=>row.map(i=>component.maps[lower][i])),component.maps[kind].map(i=>m[kind][i]));}
    for(const kind of Object.keys(owned))for(const id of component.maps[kind]){assert.equal(owned[kind].has(id),false);owned[kind].add(id);}
  });
  for(const kind of Object.keys(owned))assert.deepEqual([...owned[kind]].sort((a,b)=>a-b),m[kind].map((_,i)=>i));
  assert.equal(m.vertices.length-m.edges.length+m.faces.length,2*g);
}

async function main(){
  const runtime=await require('./layer-join-smoke.cjs').guardRuntime();
  const {_electron:electron}=require('playwright'),packaged=process.env.POLYTOPE_TEST_EXECUTABLE;
  const runtimeEntry=packaged?require('@electron/asar').extractFile(path.join(path.dirname(packaged),'resources','app.asar'),'desktop/main.cjs'):await fs.readFile(path.join(root,'desktop','main.cjs'));
  const started=performance.now(),artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));await fs.mkdir(artifacts,{recursive:true});
  const folder=await fs.mkdtemp(path.join(artifacts,packaged?'torus-podia-packaged-smoke-':'torus-podia-smoke-')),profile=path.join(folder,'profile');await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;if(packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:[root],cwd:root,env,timeout:30000});
  const checks=[],errors=[],snapshots=[],fixtures=[];let page,serial=0;
  try{
    assert.equal((await app.evaluate(({app})=>app.polytopeQualification))?.mode,runtime.hidden?'hidden-no-focus':undefined);
    page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>document.getElementById('podia-settings')&&document.getElementById('torus-settings')&&document.getElementById('model-name').textContent==='Tesseract');
    await page.evaluate(()=>{window.torusPodiaStatus=[];const status=document.getElementById('status');new MutationObserver(()=>window.torusPodiaStatus.push(status.textContent)).observe(status,{childList:true,subtree:true,characterData:true});});
    const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
    const disclose=async id=>{if(!await page.locator('#'+id).evaluate(n=>n.open))await page.locator('#'+id+' > summary').click();};
    const construct=async id=>{if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();if(id)await disclose(id);};
    const newDocument=async callback=>{const before=await page.locator('#document-tabs > button').count();await callback();await page.waitForFunction(n=>document.getElementById('document-tabs').children.length===n+1,before);await done();};
    const save=async label=>{
      await done();const file=path.join(folder,`${String(++serial).padStart(2,'0')}-${label}.polyproj`);await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.locator('#save').click();
      const deadline=Date.now()+30000;let bytes;while(Date.now()<deadline){try{bytes=await fs.readFile(file);JSON.parse(bytes);break;}catch(e){if(!['ENOENT'].includes(e.code)&&!(e instanceof SyntaxError))throw e;await new Promise(resolve=>setTimeout(resolve,25));}}
      assert.ok(bytes,'Native project save must produce a readable file');await done();snapshots.push({file,sha256:hash(bytes)});return {file,project:JSON.parse(bytes)};
    };
    const open=async file=>{await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#open').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Opened '+file||window.torusPodiaStatus.includes('Opened '+file),file);await done();};
    const fixture=async(label,project)=>{const file=path.join(folder,label+'.polyproj'),bytes=Buffer.from(JSON.stringify(project));await fs.writeFile(file,bytes);fixtures.push({file,sha256:hash(bytes)});return file;};
    const torus=async({n=10,arm=8,ratio='.5',radius='1'}={})=>{await construct('torus-settings');for(const [id,value] of [['ring-segments',n],['arm-segments',arm],['arm-ratio',ratio],['ring-radius',radius]])await page.locator('#torus-'+id).fill(String(value));await newDocument(()=>page.locator('#generate-torus').click());};
    const podium=async({anti=false,symbol='3',sizing='radius',elevation='height',base='2',top='1',size='2'}={})=>{await construct('podia-settings');await page.locator('#podium-kind').selectOption(anti?'rational-antipodium':'rational-podium');await page.locator('#podium-symbol').fill(symbol);await page.locator('#podium-sizing').selectOption(sizing);await page.locator('#podium-elevation').selectOption(elevation);for(const [id,value] of [['base-size',base],['top-size',top],['elevation-size',size]])await page.locator('#podium-'+id).fill(value);await newDocument(()=>page.locator('#generate-podium').click());};
    const replay=async()=>{await construct('history-settings');await newDocument(()=>page.locator('#history-replay').click());};
    await done();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1484,900));
    const initial=(await save('initial')).project;
    await torus();verifyTorus(active((await save('default-torus')).project).model,10,8);
    await torus({n:4,arm:4,radius:'sqrt(1)'});const four=await save('four-by-four'),torusModel=active(four.project).model;verifyTorus(torusModel,4,4);
    const xy=[[1,0],[0,1],[-1,0],[0,-1]],meridian=[[1.5,0],[1,.5],[.5,0],[1,-.5]];
    const radical=xy.flatMap(([x,y])=>meridian.map(([r,z])=>[r*x,r*y,z]));torusModel.vertices.forEach((p,i)=>p.forEach((x,j)=>near(x,radical[i][j])));
    assert.deepEqual(geometry(four.project.documents[0].states[0].model),geometry(initial.documents[0].states[0].model));
    checks.push('actual default80 and4x4 torus: cardinal/diamond coordinates, full ordered seams, rank3, degree2 boundary and Euler0; original document preserved');

    const coloredTorus=structuredClone(four.project),t=active(coloredTorus);t.view.coordinateUnit='mm';t.model.metadata.offColors={faces:[{encoding:'byte',values:[7,70,240,128]},...Array(14).fill(null),{encoding:'unit',values:[.2,.3,.5,.25]}],cells:[]};
    await open(await fixture('colored-torus-input',coloredTorus));const torusRoundtrip=await save('colored-torus-native');await open(torusRoundtrip.file);const torusReopened=active((await save('colored-torus-reopened')).project);
    assert.deepEqual(geometry(torusReopened.model),geometry(t.model));assert.deepEqual(torusReopened.model.metadata,t.model.metadata);assert.deepEqual(torusReopened.model.provenance,t.model.provenance);assert.equal(torusReopened.view.coordinateUnit,'mm');
    checks.push('torus native Save/Open preserves literal ordered geometry, source maps/provenance, units and both byte/unit RGBA');

    for(const anti of [false,true])for(const sizing of ['radius','edge'])for(const elevation of ['height','side-edge']){
      await podium({anti,sizing,elevation,base:sizing==='radius'?'sqrt(4)':'sqrt(12)',top:sizing==='radius'?'1':'sqrt(3)',size:elevation==='height'?'2':anti?'sqrt(7)':'sqrt(5)'});
      const m=active((await save(`${anti?'anti':'podium'}-${sizing}-${elevation}`)).project).model;verifyPodium(m,{anti});assert.equal(m.metadata[anti?'rationalAntipodium':'rationalPodium'].ringSizing,sizing==='radius'?'radii':'edge-lengths');
    }
    checks.push('actual podium and antipodium all four unequal-ring sizing combinations reproduce independent rb2/rt1/h2 metrics, literal walls, genuine factor-owned leaves and qualified convex measures');

    const starSnapshots=[];for(const anti of [false,true])for(const [symbol,n,d] of [['6/-2',6,-2],['5/2',5,2]]){
      await podium({anti,symbol,size:'3'});const saved=await save((anti?'anti':'podium')+'-'+n+'-'+d),m=active(saved.project).model;verifyPodium(m,{anti,n,d,height:3});starSnapshots.push({anti,n,d,file:saved.file,model:m});
      assert.equal(m.provenance.generator.parameters.symbol,symbol);if(anti)near(m.vertices[n][1],Math.sin(Math.PI*d/n));else near(m.vertices[n][1],0);
    }
    const signed=starSnapshots.find(s=>s.anti&&s.n===6);assert.deepEqual(signed.model.metadata.rationalAntipodium.orderedSourceCycles,[[0,4,2],[1,5,3]]);assert.ok(signed.model.vertices[6][1]<0);
    checks.push('signed6/-2 disconnected source cycles and5/2 stars retain raw half-step phases, source IDs/provenance and literal generalized boundaries');

    const star=starSnapshots.find(s=>!s.anti&&s.n===5);await open(star.file);const starProject=(await save('star-before-colors')).project,coloredStar=structuredClone(starProject),s=active(coloredStar);
    s.view.coordinateUnit='cm';s.model.metadata.offColors={faces:[{encoding:'byte',values:[10,80,255,128]},{encoding:'unit',values:[.2,.4,.8,.25]},...Array(s.model.faces.length-2).fill(null)],cells:[]};await open(await fixture('colored-star-podium-input',coloredStar));
    const beforePrism=active((await save('prism-source')).project);await construct('antiprism-settings');await page.locator('#polyhedron-prism-height').fill('sqrt(4)');await page.locator('#make-polyhedron-prism').click();await done();const prism=await save('unequal-star-four-prism'),prismState=active(prism.project),lift=prismState.model;
    assert.deepEqual(counts(lift),[20,40,29,9]);assert.equal(lift.dimension,4);assert.deepEqual(lift.vertices,[-1,1].flatMap(w=>beforePrism.model.vertices.map(p=>[...p,w])));assert.deepEqual(lift.metadata.polyhedronPrism.sourceModel,beforePrism.model);assert.equal(lift.interpretation,'generalized-complex');assert.equal(lift.measure,undefined);assert.equal(prismState.view.coordinateUnit,'cm');
    assert.deepEqual(lift.metadata.offColors.faces,[...beforePrism.model.metadata.offColors.faces,...beforePrism.model.metadata.offColors.faces,...Array(beforePrism.model.edges.length).fill(null)]);
    assert.equal(documentOf(prism.project).operationHistory.nodes.at(-1).op,'polyhedron-prism');
    await page.locator('#undo').click();await done();assert.deepEqual(geometry(active((await save('prism-undo')).project).model),geometry(beforePrism.model));await page.locator('#redo').click();await done();assert.deepEqual(geometry(active((await save('prism-redo')).project).model),geometry(lift));
    await replay();assert.deepEqual(geometry(active((await save('prism-replay')).project).model),geometry(lift));await construct('history-settings');await page.locator('#history-branch').click();await page.locator('#history-parameters').fill('{"height":4}');await newDocument(()=>page.locator('#history-parameters-apply').click());const branch=active((await save('prism-branch')).project).model;
    assert.deepEqual(branch.vertices,[-2,2].flatMap(w=>beforePrism.model.vertices.map(p=>[...p,w])));assert.deepEqual(branch.metadata.polyhedronPrism.sourceModel,beforePrism.model);await open(prism.file);assert.deepEqual(geometry(active((await save('prism-reopened')).project).model),geometry(lift));
    checks.push('unequal star podium actual4D prism preserves ordered source/RGBA/units through undo/redo, recipe replay, height branch and native reopen');

    const refusalBefore=(await save('before-refusals')).project;
    const refuse=async(button,text)=>{await page.evaluate(()=>{document.getElementById('toast').hidden=true;});await page.locator(button).click();await page.waitForFunction(text=>!document.getElementById('toast').hidden&&document.getElementById('toast').textContent.includes(text),text);await done();const current=(await save('refusal-'+serial)).project;assert.equal(current.documents.length,refusalBefore.documents.length);assert.equal(documentOf(current).states.length,documentOf(refusalBefore).states.length);assert.deepEqual(geometry(active(current).model),geometry(active(refusalBefore).model));};
    await construct('torus-settings');await page.locator('#torus-arm-ratio').fill('1');await refuse('#generate-torus','between 0 and 1');await construct('torus-settings');await page.locator('#torus-arm-ratio').fill('.5');await page.locator('#torus-ring-segments').fill('100');await page.locator('#torus-arm-segments').fill('100');await refuse('#generate-torus','4,000');
    await construct('podia-settings');await page.locator('#podium-kind').selectOption('rational-podium');await page.locator('#podium-symbol').fill('3');await page.locator('#podium-sizing').selectOption('radius');await page.locator('#podium-base-size').fill('2');await page.locator('#podium-top-size').fill('1');await page.locator('#podium-elevation').selectOption('side-edge');await page.locator('#podium-elevation-size').fill('.5');await refuse('#generate-podium','no real positive');
    await construct('podia-settings');await page.locator('#podium-elevation').selectOption('height');await page.locator('#podium-elevation-size').fill('1e-30');await refuse('#generate-podium','rank');
    await podium();verifyPodium(active((await save('refusal-recovered')).project).model);
    checks.push('torus ratio/resource and native podium side-feasibility/rank refusals publish no document/history/model; subsequent valid construction recovers');

    await disclose('animation-settings');for(const [id,value] of [['animation-duration','1'],['animation-fps','2']]){await page.locator('#'+id).fill(value);await page.locator('#'+id).dispatchEvent('change');}await page.locator('#animation-rotation').click();const beforeExport=active((await save('before-export')).project);await disclose('animation-settings');
    await app.evaluate(({dialog})=>{globalThis.torusPodiaExportHeld=false;dialog.showSaveDialog=()=>new Promise(resolve=>{globalThis.torusPodiaExportHeld=true;globalThis.torusPodiaReleaseExport=()=>resolve({canceled:true});});});await page.locator('#animation-target').selectOption('base');await page.locator('#animation-png').click();
    await page.waitForFunction(()=>!document.getElementById('animation-cancel').hidden);await app.evaluate(()=>new Promise((resolve,reject)=>{const until=Date.now()+5000;const timer=setInterval(()=>{if(globalThis.torusPodiaExportHeld){clearInterval(timer);resolve();}else if(Date.now()>until){clearInterval(timer);reject(Error('Export did not reach the explicit dialog stub.'));}},10);}));
    for(const id of ['generate-torus','torus-ring-segments','torus-arm-ratio','generate-podium','podium-kind','podium-symbol','podium-elevation-size'])assert.equal(await page.locator('#'+id).isEnabled(),false,`${id} must be disabled during export`);
    await page.locator('#animation-cancel').click();await app.evaluate(()=>globalThis.torusPodiaReleaseExport());await page.waitForFunction(()=>!document.getElementById('animation-png').disabled);await done();const afterExport=active((await save('after-export-cancel')).project);assert.deepEqual(geometry(afterExport.model),geometry(beforeExport.model));assert.deepEqual(afterExport.view,beforeExport.view);assert.equal((await fs.readdir(folder)).filter(name=>name.startsWith('.polytope-animation-')).length,0);
    checks.push('held explicit export dialog disables construction inputs; cancellation releases ownership and restores exact complete view/source with no staging residue');

    for(const file of [...fixtures,...snapshots])assert.equal(hash(await fs.readFile(file.file)),file.sha256);assert.deepEqual(errors,[]);await page.screenshot({path:path.join(folder,'torus-podia-workspace.png')});
    const sourceFiles=['scripts/torus-podia-smoke.cjs','ui/torus-controls.mjs','ui/podia-controls.mjs','engine/torus.py','engine/podia.py','engine/products.py'];const sourceHashes=[];for(const file of sourceFiles)sourceHashes.push({file,sha256:hash(await fs.readFile(path.join(root,file)))});
    checks.push('all input/native snapshots remain byte-identical and renderer reports no page errors');
    const result={passed:true,packaged:Boolean(packaged),developmentPythonUnavailable:Boolean(packaged),hidden:runtime.hidden,runtime:runtime.runtime,runtimeMainSha256:hash(runtimeEntry),version:await app.evaluate(({app})=>app.getVersion()),checks,pageErrors:errors,sourceHashes,sourceHashScope:'current workspace files; executable qualification manifest is collected separately by the root runner',fixtures,nativeSnapshots:snapshots,seconds:(performance.now()-started)/1000};await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));console.log(`Torus/podia ${packaged?'packaged ':''}smoke passed: ${checks.length} groups. Artifacts: ${folder}`);
  }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});const diagnostic=await page?.evaluate(()=>({status:document.getElementById('status')?.textContent,toast:document.getElementById('toast')?.textContent,statusTrace:window.torusPodiaStatus})).catch(()=>null);await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors,diagnostic},null,2));console.error('Artifacts:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}

function selfTest(){
  const vertices=[[1.5,0,0],[1,0,.5],[.5,0,0],[1,0,-.5],[0,1.5,0],[0,1,.5],[0,.5,0],[0,1,-.5],[-1.5,0,0],[-1,0,.5],[-.5,0,0],[-1,0,-.5],[0,-1.5,0],[0,-1,.5],[0,-.5,0],[0,-1,-.5]];
  const edges=[[0,4],[1,5],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,14],[11,15],[12,0],[13,1],[14,2],[15,3],[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[8,9],[9,10],[10,11],[11,8],[12,13],[13,14],[14,15],[15,12]];
  const faces=[[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0],[4,8,9,5],[5,9,10,6],[6,10,11,7],[7,11,8,4],[8,12,13,9],[9,13,14,10],[10,14,15,11],[11,15,12,8],[12,0,1,13],[13,1,2,14],[14,2,3,15],[15,3,0,12]];
  const maps=Array.from({length:16},(_,i)=>({ringIndex:Math.floor(i/4),armIndex:i%4}));const m={id:'independent',fingerprint:'fixture',dimension:3,vertices,edges,faces,cells:[],interpretation:'generalized-complex',metadata:{polyhedralTorus:{sourceModelId:'independent',sourceFingerprint:'fixture',topology:{genus:1,eulerCharacteristic:0},maps:{vertices:maps,faces:maps}}}};
  verifyTorus(m,4,4);for(const mutate of [model=>model.edges[12]=[12,1],model=>model.faces[15].reverse(),model=>model.vertices[2][0]+=.05]){const changed=structuredClone(m);mutate(changed);assert.throws(()=>verifyTorus(changed,4,4));}assert.equal(rankThree([[0,0,0],[1,0,0],[0,1,0],[1,1,0]]),false);assert.deepEqual(sourceCycles(6,-2),[[0,4,2],[1,5,3]]);assert.deepEqual(sourceCycles(5,2),[[0,2,4,1,3]]);
  console.log('Headless torus/podia fixture self-check PASS: hand-authored cardinal torus, seam/order/coordinate corruption rejection, rank and signed cycles. No app launched.');
}
if(require.main===module){if(process.argv.includes('--self-test'))selfTest();else main().catch(error=>{console.error(error);process.exitCode=1;});}
module.exports={verifyTorus,verifyPodium,sourceCycles,rankThree};
