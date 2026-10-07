// Portable launchers do not forward the inspector streams required by
// Playwright's Electron launcher. Attach to the actual renderer over CDP.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const net=require('node:net');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createReadStream}=require('node:fs');
const {fileURLToPath}=require('node:url');
const root=path.resolve(__dirname,'..');
const pkg=require('../package.json');

async function runtimeFile(file){
  const hash=crypto.createHash('sha256');
  for await(const chunk of createReadStream(file))hash.update(chunk);
  return {bytes:(await fs.stat(file)).size,sha256:hash.digest('hex')};
}
async function engineResources(directory){
  const result={};
  async function visit(current){
    for(const entry of await fs.readdir(current,{withFileTypes:true})){
      const file=path.join(current,entry.name);
      if(entry.isDirectory())await visit(file);
      else if(entry.isFile())result[path.relative(directory,file).split(path.sep).join('/')]=await runtimeFile(file);
      else throw Error('Unexpected extracted engine resource type: '+file);
    }
  }
  await visit(directory);return Object.fromEntries(Object.entries(result).sort(([a],[b])=>a.localeCompare(b)));
}
async function runtimeSnapshot(runtimeRoot){
  const resources=path.join(runtimeRoot,'resources');
  return {executable:await runtimeFile(path.join(runtimeRoot,'Polytope Laboratory.exe')),
    archive:await runtimeFile(path.join(resources,'app.asar')),
    nativeExecutable:await runtimeFile(path.join(resources,'engine','polytope-engine.exe')),
    engineResources:await engineResources(path.join(resources,'engine'))};
}

async function main(){
  const artifacts=process.env.POLYTOPE_TEST_ARTIFACTS?path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS):path.join(root,'artifacts');await fs.mkdir(artifacts,{recursive:true});
  if(process.env.POLYTOPE_TEST_LIBRARY){
    const profile=path.join(artifacts,'portable-smoke-profile');await fs.mkdir(profile,{recursive:true});
    const library=path.resolve(process.env.POLYTOPE_TEST_LIBRARY),settings={version:1,paths:[library]};
    if(process.env.POLYTOPE_TEST_AUDIT){
      const evidenceDirectory=path.join(profile,'library-audits');await fs.mkdir(evidenceDirectory,{recursive:true});
      const auditPath=path.join(evidenceDirectory,'portable.library-index.json');
      await fs.copyFile(path.resolve(process.env.POLYTOPE_TEST_AUDIT),auditPath);settings.audits={[library]:auditPath};
    }
    await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify(settings));
  }
  const executable=process.env.POLYTOPE_TEST_EXECUTABLE||path.join(root,'release',`Polytope Laboratory ${pkg.version}.exe`);
  await fs.access(executable);
  const launcherHash=async()=>crypto.createHash('sha256').update(await fs.readFile(executable)).digest('hex');
  const executableSha256=await launcherHash();
  const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:path.join(artifacts,'portable-smoke-profile'),POLYTOPE_PYTHON:'C:\\unavailable-development-python.exe'};delete env.ELECTRON_RUN_AS_NODE;
  const started=Date.now();const launcher=spawn(executable,[`--remote-debugging-port=${port}`],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='',launchError,browser,page;launcher.on('error',e=>{launchError=e;});
  for(const stream of [launcher.stdout,launcher.stderr])stream.on('data',data=>{output=(output+data).slice(-12000);});
  try{
    let connected=false;
    while(Date.now()-started<90000){
      if(launchError)throw launchError;
      try{const response=await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(1000)});if(response.ok){connected=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    if(!connected)throw new Error('Portable renderer did not expose its debugging endpoint. Launcher output: '+output);
    browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);page=browser.contexts()[0].pages()[0];
    if(!page){await new Promise(resolve=>setTimeout(resolve,1000));page=browser.contexts()[0].pages()[0];}
    assert.ok(page,'Portable app opened its renderer');
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract',null,{timeout:40000});
    const rendererUrl=page.url(),rendererPath=fileURLToPath(new URL(rendererUrl));
    const extractedArchive=path.dirname(path.dirname(rendererPath));
    assert.equal(path.basename(extractedArchive),'app.asar','Actual portable renderer must use its extracted archive.');
    assert.equal(path.basename(path.dirname(extractedArchive)),'resources');
    const extractedRoot=path.dirname(path.dirname(extractedArchive));
    const extractedBefore=await runtimeSnapshot(extractedRoot);
    const candidateRoot=process.env.POLYTOPE_TEST_CANDIDATE_ROOT?path.resolve(process.env.POLYTOPE_TEST_CANDIDATE_ROOT):null;
    if(candidateRoot)assert.deepEqual(extractedBefore,await runtimeSnapshot(candidateRoot),
      'Actual portable extraction must exactly match the qualified unpacked candidate.');
    console.log('Actual portable launcher loaded Tesseract.');
    const evidence=await page.evaluate(async()=>{
      const call=(op,model,params={})=>window.polytope.engine({op,model,params});
      const model=await call('generate',null,{kind:'regular',key:'icosahedron'});
      const symmetry=await call('symmetry',model);
      const arrangement=await call('arrangement',model);
      const search=await call('stellation-enumerate',model,{arrangement});
      return {vertices:model.vertices.length,symmetryOrder:symmetry.order,regions:arrangement.regions.length,
              candidates:search.candidates.length,subsets:search.subsetsEvaluated,complete:search.completeWithinDeclaredCriteria};
    });
    assert.deepEqual(evidence,{vertices:12,symmetryOrder:120,regions:703,candidates:13,subsets:256,complete:true});
    const folding=await page.evaluate(async()=>{
      const call=(op,model,params={})=>window.polytope.engine({op,model,params});
      const model=await call('generate',null,{kind:'regular',key:'cube'});
      let net=await call('net',model);net=await call('net-edit',model,{net,action:'toggle-edge',edge:net.hinges[0]});
      net=await call('net-edit',model,{net,action:'move-component',component:net.components[1].root,translation:[20,-10],angle:37});
      const pose=await call('net-fold',model,{net,fraction:1});
      return {pieces:net.components.length,endpoint:pose.validation.endpointReconstructed,rigid:pose.validation.rigidityPreserved,hinges:pose.validation.hingesJoined};
    });
    assert.deepEqual(folding,{pieces:2,endpoint:true,rigid:true,hinges:true});
    const cellNets=await page.evaluate(async()=>{
      const call=(op,model,params={})=>window.polytope.engine({op,model,params});
      const model=await call('generate',null,{kind:'regular',key:'tesseract'});
      let net=await call('cell-net',model);net=await call('cell-net-edit',model,{net,action:'toggle-face',face:net.connections[0]});
      net=await call('cell-net-edit',model,{net,action:'move-component',component:net.components[1].root,translation:[2,-1,3],angles:[10,20,30]});
      return {cells:net.cells.length,pieces:net.components.length,rigid:net.validation.rigidityPreserved,joined:net.validation.connectedFacesJoined,intersectionsChecked:net.validation.cellIntersectionsChecked};
    });
    assert.deepEqual(cellNets,{cells:8,pieces:2,rigid:true,joined:true,intersectionsChecked:false});
    const packing=await page.evaluate(async()=>{
      const call=(op,model,params={})=>window.polytope.engine({op,model,params});
      const model=await call('generate',null,{kind:'regular',key:'dodecahedron'});
      const net=await call('net',model,{hinges:[],edge_length_mm:65});
      const plan=await call('net-pack',model,{net,paper:'a4'});
      return {pages:plan.pageCount,faces:plan.pages.flatMap(page=>page.parts.flatMap(part=>part.faceIds)).length,scale:plan.contentScale,edgeMm:plan.referenceEdgeLengthMm};
    });
    assert.deepEqual(packing,{pages:6,faces:12,scale:1,edgeMm:65});
    const references=await page.evaluate(async()=>{
      const call=(op,model,params={})=>window.polytope.engine({op,model,params});
      const catalog=await window.polytope.engine({op:'catalog'});
      const a=await call('generate',null,{kind:'regular',key:'snub-cube'}),b=await call('generate',null,{kind:'regular',key:'snub-cube-mirror'});
      const symmetry=await call('symmetry',a);
      const star=await call('generate',null,{kind:'regular',key:'great-stellated-dodecahedron'});
      const reciprocal=await call('incidence-dual',star),twice=await call('incidence-dual',reciprocal);
      const maxError=Math.max(...twice.vertices.map(p=>Math.min(...star.vertices.map(q=>Math.hypot(...p.map((x,i)=>x-q[i]))))));
      return {catalogEntries:catalog.length,snubVertices:a.vertices.length,snubGroupOrder:symmetry.order,snubProperOrder:symmetry.properOrder,
              mirrorCoordinates:b.vertices.every((p,v)=>p.every((x,i)=>Math.abs(x-a.vertices[v][i]*(i===0?-1:1))<1e-10)),
              starFaces:star.faces.length,starEuler:star.validation.eulerCharacteristic,dualVertices:reciprocal.vertices.length,
              dualFaces:reciprocal.faces.length,doubleDualCoordinatesRecovered:maxError<1e-8};
    });
    assert.deepEqual(references,{catalogEntries:222,snubVertices:24,snubGroupOrder:24,snubProperOrder:24,mirrorCoordinates:true,
      starFaces:12,starEuler:2,dualVertices:12,dualFaces:20,doubleDualCoordinatesRecovered:true});
    const developmentFeatures=await page.evaluate(async()=>{
      const call=(op,model,params={})=>window.polytope.engine({op,model,params});
      const cube=await call('generate',null,{kind:'regular',key:'cube'});
      const refined=await call('subdivide-edges',cube,{divisions:2});
      const cupola=await call('generate',null,{kind:'cupola',n:5,edge_length:1});
      const polygon=await call('generate',null,{kind:'regular-star-polygon',symbol:'6/2',radius:2});
      const sequence={version:2,duration:.2,fps:10,tracks:{explosion:{direction:'normal'},fold:{kind:'face-net'}},keyframes:[
        {time:0,angles:[0,0,0,0,0,0],sectionOffset:0,explosionAmount:0,foldFraction:0},
        {time:.2,angles:[0,0,0,0,0,0],sectionOffset:0,explosionAmount:.35,foldFraction:1}]};
      const project={format:'polytope-laboratory',version:1,active:0,documents:[{cursor:0,states:[{model:cube,view:{animation:sequence,explosionAmount:.35,foldFraction:.6,perspectiveDistance4D:.6,perspectiveNear4D:.05}}]}]};
      const reopened=await call('validate-project',null,{project});
      const view=reopened.documents[0].states[0].view;
      project.documents[0].states[0].view.perspectiveNear4D=.6;
      let invalidNearRejected=false;try{await call('validate-project',null,{project});}catch{invalidNearRejected=true;}
      const counts=model=>['vertices','edges','faces','cells'].map(k=>model[k].length);
      return {subdividedCube:counts(refined),originalCubeVertices:cube.vertices.length,regularCupola:counts(cupola),
        unreducedPolygon:counts(polygon),polygonCycles:polygon.faces,polygonSymbol:polygon.metadata.regularStarPolygon.symbol,
        animationVersion:view.animation.version,explosionEndpoint:view.animation.keyframes[1].explosionAmount,
        savedExplosion:view.explosionAmount,savedFold:view.foldFraction,perspectiveDistance:view.perspectiveDistance4D,
        perspectiveNear:view.perspectiveNear4D,invalidNearRejected};
    });
    assert.deepEqual(developmentFeatures,{subdividedCube:[20,24,6,0],originalCubeVertices:8,regularCupola:[15,25,12,0],
      unreducedPolygon:[6,6,2,0],polygonCycles:[[0,2,4],[1,3,5]],polygonSymbol:'6/2',animationVersion:2,
      explosionEndpoint:.35,savedExplosion:.35,savedFold:.6,perspectiveDistance:.6,perspectiveNear:.05,invalidNearRejected:true});
    const orderedProducts=await page.evaluate(async()=>{
      const call=(op,model,params={})=>window.polytope.engine({op,model,params});
      const polygon=await call('generate',null,{kind:'regular-star-polygon',symbol:'6/-2',radius:2});
      const document={id:'portable-prism-source',cursor:0,states:[{model:polygon,view:{coordinateUnit:'mm',sectionNormal:[0,1]}}]};
      const prism=await call('polygon-prism',polygon,{height:3});
      const history=await call('recipe-run',null,{document,operation:'polygon-prism',parameters:{height:3}});
      const replay=await call('recipe-replay',null,{document:history});
      const product=await call('generate',null,{kind:'polygon-product',left:{symbol:'6/-2',radius:2},right:{symbol:'5/3',radius:1}});
      const counts=m=>['vertices','edges','faces','cells'].map(k=>m[k].length);
      return {prism:counts(prism),product:counts(product),cycles:polygon.faces,
        prismLower:prism.vertices.slice(0,6),expectedLower:polygon.vertices.map(p=>[...p,-1.5]),
        replayExact:JSON.stringify(replay.states[0].model.vertices)===JSON.stringify(prism.vertices)&&JSON.stringify(replay.states[0].model.faces)===JSON.stringify(prism.faces),
        sectionNormal:history.states[1].view.sectionNormal,unit:history.states[1].view.coordinateUnit,
        operationVersion:history.operationHistory.nodes.at(-1).algorithmVersion,
        factorSymbols:product.metadata.orderedProduct.sourceModels.map(m=>m.metadata.regularStarPolygon.symbol),
        partitions:product.metadata.orderedProduct.componentPartitions.length,certified:product.numeric.certified};
    });
    assert.deepEqual(orderedProducts.prism,[12,18,10,0]);assert.deepEqual(orderedProducts.product,[30,60,46,16]);
    assert.deepEqual(orderedProducts.cycles,[[0,4,2],[1,5,3]]);assert.deepEqual(orderedProducts.prismLower,orderedProducts.expectedLower);
    assert.equal(orderedProducts.replayExact,true);assert.deepEqual(orderedProducts.sectionNormal,[0,0,1]);assert.equal(orderedProducts.unit,'mm');
    assert.equal(orderedProducts.operationVersion,'0.2.0');assert.deepEqual(orderedProducts.factorSymbols,['6/-2','5/3']);assert.equal(orderedProducts.partitions,2);assert.equal(orderedProducts.certified,false);
    const measurements=await page.evaluate(async()=>{
      const call=(op,model,params={})=>window.polytope.engine({op,model,params});
      const model=await call('generate',null,{kind:'regular',key:'tesseract'});
      const distance=await call('entity-measure',model,{entities:[{kind:'cell',index:0},{kind:'cell',index:7}]}),
        angle=await call('dihedral',model,{ridge:0}),info=await call('entity-info',model,{entity:{kind:'cell',index:0}}),
        alignment=await call('align-section',model,{entity:{kind:'cell',index:0},offset:-.5});
      const section=await call('section',model,{normal:alignment.normal,offset:alignment.offset});
      model.measure.content=999;
      const analysis=await call('analyze',model);
      return {distance:distance.value,interiorDihedral:angle.value,cellVolume:info.content,
        relativeOffset:alignment.relativeOffset,sectionVertices:section.model.vertices.length,sourceContent:analysis.measure.content};
    });
    for(const [key,value] of Object.entries({distance:2,interiorDihedral:90,cellVolume:8,relativeOffset:-.5,sectionVertices:8,sourceContent:16}))assert.ok(Math.abs(measurements[key]-value)<1e-8,`${key}: ${measurements[key]} versus ${value}`);
    const full4D=await page.evaluate(async()=>{
      const results=[];
      for(const key of ['simplex4','tesseract','cross4','cell24','cell600','cell120']){
        const model=await window.polytope.engine({op:'generate',params:{kind:'regular',key}}),group=await window.polytope.engine({op:'symmetry',model});
        results.push({key,algorithmVersion:group.algorithmVersion,order:group.order,properOrder:group.properOrder,complete:group.complete,closed:group.closureVerified,
          orbitSizes:Object.values(group.entityOrbits).map(orbits=>orbits.length===1?orbits[0].size:null)});
      }
      return results;
    });
    for(const [i,order] of [120,384,384,1152,14400,14400].entries()){
      assert.equal(full4D[i].order,order);assert.equal(full4D[i].properOrder,order/2);assert.ok(full4D[i].complete&&full4D[i].closed);
    }
    assert.deepEqual(full4D[5].orbitSizes,[600,1200,720,120]);
    let linkedLibrary;
    if(process.env.POLYTOPE_TEST_LIBRARY){
      linkedLibrary=await page.evaluate(async verifyAudit=>{
        const restored=await window.polytope.libraries();
        if(restored.errors.length||restored.libraries.length!==1)throw new Error('Portable did not restore its linked source library.');
        const library=restored.libraries[0],entries=library.entries;
        let audit;
        if(verifyAudit){
          if(!library.auditPath||library.auditError)throw new Error('Portable audit attachment did not restore.');
          const verified=await window.polytope.verifyLibraryAudit(library.path);
          if(verified.auditError)throw new Error(verified.auditError);
          const counts={};for(const row of verified.entries)counts[row.auditStatus]=(counts[row.auditStatus]||0)+1;
          if(counts.stale||counts.untested||verified.entries.some(row=>row.hashStatus!=='computed'))throw new Error('Portable importer evidence is stale or incomplete after verification.');
          audit={statusCounts:counts,hashedSources:verified.entries.length};
        }
        const source=entries.find(e=>e.name==='7-Fix')||entries.find(e=>e.name==='Grand hexacosichoron')||entries.find(e=>e.supported&&e.dimension===4&&e.counts[0]<=24);
        if(!source)throw new Error('No suitable 4D source fixture in linked library.');
        const {model}=await window.polytope.libraryModel(source.key);
        let unlinkedPathRejected=false;try{await window.polytope.libraryModel('C:/Windows/win.ini');}catch{unlinkedPathRejected=true;}
        return {entries:entries.length,sourceKey:source.key,sourceName:source.name,declaredCounts:source.counts,actualCounts:['vertices','edges','faces','cells'].map(k=>model[k].length),sourcePathRetained:!!model.metadata.linkedRelativePath,interpretation:model.interpretation,unlinkedPathRejected,audit};
      },Boolean(process.env.POLYTOPE_TEST_AUDIT));
      assert.deepEqual(linkedLibrary.actualCounts,linkedLibrary.declaredCounts);assert.ok(linkedLibrary.sourcePathRetained&&linkedLibrary.unlinkedPathRejected);
      await page.locator('#search').fill(linkedLibrary.sourceName);
      await page.locator('#catalog button').evaluateAll((nodes,key)=>{const node=nodes.find(n=>n.dataset.key===key);if(!node)throw new Error('Linked source not displayed');node.click();},linkedLibrary.sourceKey);
      await page.waitForFunction(name=>document.getElementById('model-name').textContent===name,linkedLibrary.sourceName,{timeout:30000});
    }
    await page.screenshot({path:path.join(artifacts,'workspace-portable-launch.png')});
    assert.equal(await launcherHash(),executableSha256,'Portable launcher changed during qualification.');
    assert.deepEqual(await runtimeSnapshot(extractedRoot),extractedBefore,'Actual extracted runtime changed during qualification.');
    const extractedRuntime={rendererUrl,extractedRoot,candidateRoot,unchanged:true,
      matchesCandidate:Boolean(candidateRoot),archiveSha256:extractedBefore.archive.sha256,
      nativeExecutableSha256:extractedBefore.nativeExecutable.sha256,...extractedBefore};
    await fs.writeFile(path.join(artifacts,'portable-smoke.json'),JSON.stringify({passed:true,version:pkg.version,executable,executableSha256,runtimeUnchanged:true,extractedRuntime,developmentPythonDisabled:true,seconds:(Date.now()-started)/1000,evidence,folding,cellNets,packing,references,developmentFeatures,orderedProducts,measurements,full4D,linkedLibrary},null,2));
    console.log('Portable launch and bundled-engine stellation/symmetry/nets/packing/chiral-star-library/intrinsic-measurement/full-regular-4D-group checks passed.');
  }finally{
    if(page)await page.evaluate(()=>window.close()).catch(()=>{});
    if(browser)await browser.close().catch(()=>{});
    // Let the launcher clean its own extraction directory after app exit.
    await new Promise(resolve=>{if(launcher.exitCode!==null||launcher.signalCode!==null)return resolve();const timeout=setTimeout(resolve,10000);launcher.once('exit',()=>{clearTimeout(timeout);resolve();});});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
