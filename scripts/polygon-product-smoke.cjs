// Actual Construct actions and native snapshots; independent Cartesian topology.
const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),packaged=process.env.POLYTOPE_TEST_EXECUTABLE;
const artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));
const doc=p=>p.documents[p.active],active=p=>doc(p).states[doc(p).cursor];
const geometry=m=>Object.fromEntries(['dimension','embeddingDimension','vertices','edges','faces','cells'].map(k=>[k,m[k]]));
const counts=m=>['vertices','edges','faces','cells'].map(k=>m[k].length);
function verifyTesseract(m){
  assert.deepEqual(counts(m),[16,32,24,8]);
  const corners=m.vertices.map(([x,y,z,w])=>[(x+y)/Math.SQRT2,(y-x)/Math.SQRT2,(z+w)/Math.SQRT2,(w-z)/Math.SQRT2].map(x=>{assert.ok(Math.abs(Math.abs(x)-1)<1e-9);return Math.sign(x);}));
  assert.equal(new Set(corners.map(p=>p.join(','))).size,16);
  for(const [a,b] of m.edges)assert.equal(corners[a].filter((x,i)=>x!==corners[b][i]).length,1);
  const fixed=ids=>[0,1,2,3].filter(axis=>ids.every(v=>corners[v][axis]===corners[ids[0]][axis]));
  for(const f of m.faces){assert.equal(f.length,4);assert.equal(fixed(f).length,2);}
  const cellPlanes=[];for(const c of m.cells){assert.equal(c.length,6);const ids=[...new Set(c.flatMap(f=>m.faces[f]))];assert.equal(ids.length,8);const axes=fixed(ids);assert.equal(axes.length,1);cellPlanes.push(axes[0]+':'+corners[ids[0]][axes[0]]);}
  assert.equal(new Set(cellPlanes).size,8);
}
async function main(){
  const started=performance.now();await fs.mkdir(artifacts,{recursive:true});
  const folder=await fs.mkdtemp(path.join(artifacts,packaged?'polygon-product-packaged-smoke-':'polygon-product-smoke-')),profile=path.join(folder,'profile');
  await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;if(packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);const checks=[],errors=[];let serial=0;
  page.on('pageerror',e=>errors.push(e.message));
  const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
  const disclose=async id=>{if(!await page.locator('#'+id).evaluate(n=>n.open))await page.locator('#'+id+' > summary').click();};
  const construct=async()=>{if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();await disclose('product-settings');};
  const save=async label=>{await done();const file=path.join(folder,`${++serial}-${label}.polyproj`);await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);return {file,project:JSON.parse(await fs.readFile(file,'utf8'))};};
  const open=async file=>{await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#open').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Opened '+file,file);await done();};
  const newDoc=async callback=>{const n=await page.locator('#document-tabs > button').count();await callback();await page.waitForFunction(n=>document.getElementById('document-tabs').children.length===n+1,n);await done();};
  const generate=async(a,b,ra='1',rb='1')=>{await construct();await page.locator('#product-left-symbol').fill(a);await page.locator('#product-right-symbol').fill(b);await page.locator('#product-left-radius').fill(ra);await page.locator('#product-right-radius').fill(rb);await newDoc(()=>page.locator('#generate-polygon-product').click());};
  try{
    await page.waitForFunction(()=>document.getElementById('product-settings')&&document.getElementById('model-name').textContent==='Tesseract');await done();
    await construct();assert.equal(await page.locator('#make-polygon-prism').isDisabled(),true);
    await generate('4','4','sqrt(2)','sqrt(2)');const square=await save('square-square'),tesseract=active(square.project).model;
    verifyTesseract(tesseract);assert.equal(tesseract.interpretation,'convex-polytope');assert.equal(tesseract.numeric.certified,false);assert.equal(tesseract.metadata.constructionFinalization.classification.status,'passed');assert.equal(tesseract.components.length,1);assert.ok(Math.abs(tesseract.measure.content-16)<1e-8);
    await open(square.file);assert.deepEqual(geometry(active((await save('square-restored')).project).model),geometry(tesseract));
    checks.push('actual square product has independently checked Cartesian tesseract incidence/content and persists with safe approximate convex evidence and genuine component ownership');

    await generate('6/-2','5/3','sqrt(4)','1');const signed=await save('signed-disconnected-product'),product=active(signed.project).model,info=product.metadata.orderedProduct;
    assert.deepEqual(counts(product),[30,60,46,16]);assert.equal(info.componentPartitions.length,2);
    assert.equal(info.sourceModels[0].metadata.regularStarPolygon.symbol,'6/-2');assert.deepEqual(info.sourceModels[0].faces,[[0,4,2],[1,5,3]]);assert.equal(info.sourceModels[1].metadata.regularStarPolygon.symbol,'5/3');
    await open(signed.file);assert.deepEqual(active((await save('signed-restored')).project).model.metadata.orderedProduct,info);
    checks.push('unreduced signed factors preserve both disconnected cycles, raw retrograde symbol, incidence partitions and complete source snapshots through save/load');

    await construct();await disclose('star-polygon-settings');await page.locator('#star-polygon-symbol').fill('6/-2');await page.locator('#star-polygon-radius').fill('sqrt(4)');await newDoc(()=>page.locator('#generate-star-polygon').click());
    const original=active((await save('prism-source')).project).model;await construct();assert.equal(await page.locator('#make-polygon-prism').isEnabled(),true);
    await page.locator('#polygon-prism-height').fill('sqrt(9)');await page.locator('#make-polygon-prism').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent.includes('interval'));await done();
    const made=await save('prism'),prism=active(made.project).model;assert.deepEqual(counts(prism),[12,18,10,0]);assert.deepEqual(prism.vertices.slice(0,6),original.vertices.map(p=>[...p,-1.5]));assert.deepEqual(prism.vertices.slice(6),original.vertices.map(p=>[...p,1.5]));
    assert.deepEqual(active(made.project).view.sectionNormal,[0,0,1]);assert.equal(doc(made.project).operationHistory.nodes.at(-1).op,'polygon-prism');
    await page.locator('#undo').click();await done();assert.deepEqual(geometry(active((await save('undo')).project).model),geometry(original));
    await page.locator('#redo').click();await done();assert.deepEqual(geometry(active((await save('redo')).project).model),geometry(prism));
    await disclose('history-settings');await newDoc(()=>page.locator('#history-replay').click());assert.deepEqual(geometry(active((await save('replayed')).project).model),geometry(prism));
    await disclose('history-settings');await page.locator('#history-branch').click();await page.locator('#history-parameters').fill('{"height":5}');await newDoc(()=>page.locator('#history-parameters-apply').click());const branched=active((await save('branched')).project).model;assert.deepEqual([...new Set(branched.vertices.map(p=>p[2]))].sort((a,b)=>a-b),[-2.5,2.5]);
    checks.push('literal disconnected prism uses evaluated height, correct section dimension, native undo/redo, operation replay and branch from original polygon');

    await generate('3','3');const before=await save('before-refusal');await construct();await page.locator('#product-left-symbol').fill('4/2');await page.locator('#generate-polygon-product').click();await page.waitForFunction(()=>!document.getElementById('toast').hidden&&/digon/i.test(document.getElementById('toast').textContent));await done();const after=await save('after-refusal');assert.deepEqual(doc(after.project).states,doc(before.project).states);assert.equal(after.project.documents.length,before.project.documents.length);
    await generate('5/2','3');assert.deepEqual(counts(active((await save('recovered')).project).model),[15,30,23,8]);
    checks.push('unsupported digon product leaves document/history unchanged and the next valid actual construction succeeds');
    assert.deepEqual(errors,[]);await page.screenshot({path:path.join(folder,'products.png')});
    const result={passed:true,packaged:Boolean(packaged),developmentPythonUnavailable:Boolean(packaged),version:await app.evaluate(({app})=>app.getVersion()),checks,nativeSnapshots:serial,seconds:(performance.now()-started)/1000,pageErrors:errors};await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));console.log('Polygon product smoke passed. Artifacts: '+folder);
  }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors},null,2));console.error('Artifacts: '+folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
