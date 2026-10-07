// Real desktop finite LIB-04 qualification. --self-test launches no app.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {guardRuntime}=require('./layer-join-smoke.cjs');
const root=path.resolve(__dirname,'..'),hash=b=>createHash('sha256').update(b).digest('hex');
const active=p=>{const d=p.documents[p.active];return d.states[d.cursor];};
// JavaScript JSON serialization spells both signed zeros as 0. Preserve all
// nonzero coordinates and literal incidence order in this Save/Open comparison.
const portableZero=value=>Array.isArray(value)?value.map(portableZero):typeof value==='number'&&value===0?0:value;
const geometry=m=>Object.fromEntries(['dimension','embeddingDimension','interpretation','vertices','edges','faces','cells','fingerprint'].map(k=>[k,portableZero(m[k])]));
async function fixtures(folder){
  const selected=process.env.POLYTOPE_REGULAR4D_PROOF;
  const file=selected?path.resolve(selected):path.join(folder,'independent-registered-proof.json');
  if(!selected){
    const child=spawnSync(process.env.POLYTOPE_TEST_FIXTURE_PYTHON||'python',['-B',path.join(root,'scripts/qualify-regular4d-catalog.py'),'--output',file],{cwd:root,encoding:'utf8',timeout:180000,windowsHide:true});
    assert.equal(child.status,0,child.stderr||child.stdout);
  }
  const proof=JSON.parse(await fs.readFile(file,'utf8'));
  assert.equal(proof.passed,true);assert.equal(proof.version,'0.1.0');assert.equal(proof.entries.length,16);
  assert.equal(new Set(proof.entries.map(e=>e.key)).size,16);
  assert.equal(proof.referenceQualification.dualPairReceipts.length,10);
  assert.equal(proof.catalogModuleSha256,hash(await fs.readFile(path.join(root,'engine/catalog.py'))));
  assert.equal(proof.referenceQualification.verifierSourceSha256,hash(await fs.readFile(path.join(root,'engine/regular4d_validation.py'))));
  for(const entry of proof.entries){
    assert.equal(entry.receipt.catalogKey,entry.key);assert.equal(entry.receipt.status,'passed');
    assert.equal(entry.receipt.sourceId,entry.source.id);assert.equal(entry.receipt.sourceFingerprint,entry.source.fingerprint);
    assert.equal(entry.receipt.flagCount,entry.receipt.reachedFlags);assert.equal(entry.receipt.flagOrbitCount,1);
    assert.equal(entry.receipt.certified,false);assert.equal(entry.receipt.hullUsed,false);
    assert.deepEqual(entry.record.counts,['vertices','edges','faces','cells'].map(k=>entry.source[k].length));
  }
  return proof;
}
async function main(){
  const runtime=await guardRuntime(); // Mandatory before requiring/launching Electron.
  const started=performance.now(),artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));
  await fs.mkdir(artifacts,{recursive:true});const folder=await fs.mkdtemp(path.join(artifacts,'regular4d-catalog-smoke-'));
  const proof=await fixtures(folder),profile=path.join(folder,'profile');await fs.mkdir(profile);
  await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const {_electron:electron}=require('playwright'),env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
  const checks=[],errors=[],loaded=[];let page,serial=0;
  try{
    assert.equal((await app.evaluate(({app})=>app.polytopeQualification))?.mode,runtime.hidden?'hidden-no-focus':undefined);
    page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract'&&window.polytope);
    await page.evaluate(()=>{window.regular4dStatuses=[];new MutationObserver(()=>window.regular4dStatuses.push(document.getElementById('status').textContent)).observe(document.getElementById('status'),{childList:true,subtree:true,characterData:true});});
    const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
    const settle=async()=>{await done();await page.keyboard.press('Escape');await page.evaluate(()=>document.activeElement?.blur());await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await done();};
    const save=async label=>{
      await settle();const file=path.join(folder,`${++serial}-${label}.polyproj`);
      await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
      await page.locator('#save').click();await page.waitForFunction(file=>window.regular4dStatuses.includes('Saved '+file),file);await done();
      return {file,project:JSON.parse(await fs.readFile(file,'utf8'))};
    };
    const open=async file=>{
      await settle();await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
      await page.locator('#open').click();await page.waitForFunction(file=>window.regular4dStatuses.includes('Opened '+file),file);await done();
    };
    if(await page.locator('#toggle-library').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-library').click();
    await page.locator('[data-filter="4"]').click();await page.locator('#library-family').selectOption('all');
    for(const entry of proof.entries){
      // Symbols are real catalog search input, including unreduced star steps.
      await page.locator('#search').fill(entry.record.symbol);
      assert.equal(await page.locator(`.catalog-entry[data-key="${entry.key}"]`).count(),1);
      await page.locator('#search').fill(entry.record.aliases[1]||entry.record.name);
      assert.equal(await page.locator(`.catalog-entry[data-key="${entry.key}"]`).count(),1);
      const n=await page.locator('#document-tabs > button').count();
      await page.locator(`.catalog-entry[data-key="${entry.key}"]`).click();
      await page.waitForFunction(n=>document.getElementById('document-tabs').children.length===n+1,n);await done();
      const saved=await save(entry.key),source=active(saved.project).model;
      assert.equal(source.metadata.key,entry.key);assert.deepEqual(geometry(source),geometry(entry.source));
      for(const field of ['symbol','regular4dIdentity','cellType','cellSymbol','vertexFigureType','vertexFigureSymbol','dualKey','dualName'])assert.deepEqual(source.metadata[field],entry.record[field]);
      if(entry.source.provenance.catalogSource)assert.deepEqual(source.provenance.catalogSource,entry.source.provenance.catalogSource);
      assert.deepEqual(source.metadata.offColors,entry.source.metadata.offColors);assert.equal(source.numeric.certified,false);
      if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();
      await page.locator('[data-panel="evidence"]').click();
      await page.locator('#validate-regular4d').click();
      await page.waitForFunction(key=>{const n=document.getElementById('regular4d-validation-result');return n.dataset.status==='passed'&&n.dataset.key===key;},entry.key);await done();
      assert.equal(Number(await page.locator('#regular4d-validation-result').getAttribute('data-flags')),entry.receipt.flagCount);
      assert.match(await page.locator('#regular4d-validation-result').textContent(),/numerical.*float64/i);
      assert.deepEqual(active((await save('verified-'+entry.key)).project).model,source);
      const before=structuredClone(source);
      const receipt=await page.evaluate(({source,key})=>window.polytope.engine({op:'regular4d-validate',model:source,params:{key}},'regular4d-proof-'+key),{source,key:entry.key});
      assert.equal(receipt.status,'passed');assert.equal(receipt.catalogKey,entry.key);assert.equal(receipt.sourceId,source.id);
      assert.equal(receipt.sourceFingerprint,source.fingerprint);assert.equal(receipt.reachedFlags,entry.receipt.flagCount);
      assert.equal(receipt.certified,false);assert.equal(receipt.hullUsed,false);assert.deepEqual(source,before);
      loaded.push({key:entry.key,source,receipt,file:saved.file});
      if(['simplex4','cell120','miratope-stellated-hecatonicosachoron'].includes(entry.key)){
        await open(saved.file);const reopened=await save('reopened-'+entry.key);
        assert.deepEqual(active(reopened.project).model,source);
      }
    }
    checks.push('All six independent convex and ten attributed stars load through actual catalog search with complete ordered native source incidence');
    checks.push('All sixteen symbols and aliases resolve to unchanged keys; cells, vertex figures and dual names persist');
    checks.push('All sixteen actual Analyze buttons show complete flag-orbit numerical validation; independent native receipts bind snapshots without hull or exact/volume claims');
    checks.push('Representative simplex, 120-cell and pentagram-face star native Save/Open preserve full source IDs, attributes and incidence');
    const selected=loaded.find(e=>e.key==='tesseract'),p=JSON.parse(await fs.readFile(selected.file,'utf8')),m=active(p).model;
    m.metadata.coordinateUnits='mm';m.metadata.offColors={faces:m.faces.map(()=>({encoding:'byte',values:[25,90,210,128]})),cells:m.cells.map(()=>({encoding:'unit',values:[.2,.6,.4,.25]}))};
    const coloredState=structuredClone(active(p));delete coloredState.operationNode;
    p.active=0;p.documents=[{id:'literal-colored-catalog-source',cursor:0,states:[coloredState]}];
    const colored=path.join(folder,'colored-source.polyproj');await fs.writeFile(colored,JSON.stringify(p));await open(colored);
    const saved=await save('colored'),restored=active(saved.project).model;assert.deepEqual(restored.metadata.offColors,m.metadata.offColors);assert.equal(restored.metadata.coordinateUnits,'mm');assert.deepEqual(geometry(restored),geometry(m));
    const colorProof=await page.evaluate(source=>window.polytope.engine({op:'regular4d-validate',model:source,params:{key:'tesseract'}},'color-proof'),restored);
    assert.notEqual(colorProof.sourceSnapshotSha256,selected.receipt.sourceSnapshotSha256);assert.equal(colorProof.status,'passed');
    await open(saved.file);assert.deepEqual(active((await save('colored-reopened')).project).model,restored);
    checks.push('Literal full RGBA and millimeter source attributes survive native Save/Open and receive a distinct current-snapshot proof');
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(folder,'loaded-receipts.json'),JSON.stringify(loaded,null,2));
    await page.locator('#search').fill('');await page.screenshot({path:path.join(folder,'regular4d-catalog.png')});
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,packaged:Boolean(runtime.packaged),runtime:runtime.runtime,hidden:runtime.hidden,version:await app.evaluate(({app})=>app.getVersion()),checks,pageErrors:errors,sourceCount:16,seconds:(performance.now()-started)/1000},null,2));
    console.log('Regular4D catalog smoke PASS. Artifacts: '+folder);
  }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors},null,2));throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
async function selfTest(){
  const artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));await fs.mkdir(artifacts,{recursive:true});
  const folder=await fs.mkdtemp(path.join(artifacts,'regular4d-headless-'));await fixtures(folder);
  console.log('Registered16 finite proof fixture self-test PASS; no Electron or GUI launched. '+folder);
}
if(require.main===module)(process.argv.includes('--self-test')?selfTest():main()).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={fixtures,geometry};
