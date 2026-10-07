const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),artifacts=process.env.POLYTOPE_TEST_ARTIFACTS?path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS):path.join(root,'artifacts');
const packaged=process.env.POLYTOPE_TEST_EXECUTABLE;
const profile=path.join(artifacts,packaged?'linked-packaged-profile':'linked-desktop-profile');
async function launch(){
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);
  await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
  // Wait until asynchronous startup link restoration has finished.
  await page.evaluate(async()=>{await window.polytope.libraries();});
  return {app,page};
}
async function main(){
  await fs.mkdir(profile,{recursive:true});
  await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  let session=await launch();const errors=[],checks=[];
  session.page.on('pageerror',e=>errors.push(e.message));
  try{
    const referenceCount=await session.page.evaluate(async()=> (await window.polytope.engine({op:'catalog',params:{}})).length);
    assert.ok(Number.isSafeInteger(referenceCount)&&referenceCount>0);
    await session.page.waitForFunction(count=>Number(document.getElementById('library-count').textContent)===count,referenceCount);
    const corpus=path.join(artifacts,'linked-library-fixture'),nested=path.join(corpus,'4D','regular');
    await fs.mkdir(nested,{recursive:true});await fs.mkdir(path.join(corpus,'5D'),{recursive:true});
    const model=await session.page.evaluate(()=>window.polytope.engine({op:'generate',params:{kind:'regular',key:'tesseract'}}));
    const off=['4OFF',`${model.vertices.length} ${model.faces.length} ${model.edges.length} ${model.cells.length}`,...model.vertices.map(p=>p.join(' ')),...model.faces.map(f=>[f.length,...f].join(' ')),...model.cells.map(c=>[c.length,...c].join(' '))].join('\n')+'\n';
    const file=path.join(nested,'Fixture tesseract.off');await fs.writeFile(file,off);
    await fs.writeFile(path.join(corpus,'5D','Unsupported.off'),'5OFF\n6 15 20 15 6\n');
    await fs.writeFile(path.join(corpus,'Malformed.off'),'not an OFF header\n');
    const link=async directory=>{
      await session.app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},directory);
      await session.page.evaluate(()=>{document.getElementById('status').textContent='';});
      await session.page.locator('#link-library').click();
      await session.page.waitForFunction(p=>document.getElementById('status').textContent.includes('OFF files from '+p),directory);
    };
    await link(corpus);
    const linked=await session.page.evaluate(()=>window.polytope.libraries());
    assert.equal(linked.libraries.length,1);
    assert.equal(linked.libraries[0].entries.length,3);
    assert.equal(linked.libraries[0].entries.filter(entry=>entry.supported!==false).length,1);
    assert.equal(Number(await session.page.locator('#library-count').innerText()),referenceCount+3);
    assert.equal(await session.page.locator('#catalog button:disabled').count(),2);
    await session.page.locator('[data-filter="4"]').click();
    await session.page.locator('#library-family').selectOption('Local OFF · 4D/regular');
    assert.equal(await session.page.locator('#library-count').innerText(),'1');
    await session.page.locator('#catalog button').click();
    await session.page.waitForFunction(()=>document.getElementById('model-name').textContent==='Fixture tesseract');
    assert.deepEqual(await session.page.locator('.count-block strong').allInnerTexts(),['16','32','24','8']);
    await session.page.waitForFunction(()=>document.getElementById('analysis').textContent.includes('convex-polytope'));
    checks.push('recursive metadata and unsupported diagnostics','dimension and category filters','ordered OFF load and convex recognition');
    await assert.rejects(session.page.evaluate(()=>window.polytope.libraryModel('C:/Windows/win.ini')),/not in a supported linked catalog/);
    checks.push('unlinked path rejected');
    await link(nested);
    await session.page.evaluate(p=>window.polytope.unlinkLibrary(p),nested);
    const retained=await session.page.evaluate(p=>window.polytope.libraryModel(p),file);assert.equal(retained.model.cells.length,8);
    checks.push('overlapping root ownership');
    const concurrent=await session.page.evaluate(async({file,corpus})=>{const [loaded]=await Promise.all([window.polytope.libraryModel(file),window.polytope.unlinkLibrary(corpus)]);return loaded.model;},{file,corpus});
    assert.equal(concurrent.cells.length,8);assert.equal(concurrent.metadata.linkedRelativePath,'4D/regular/Fixture tesseract.off');
    await link(corpus);checks.push('in-flight load remains valid during unlink');
    const moved=file+'.moved';await fs.rename(file,moved);
    try{await assert.rejects(session.page.evaluate(p=>window.polytope.libraryModel(p),file));}finally{await fs.rename(moved,file);}
    checks.push('missing indexed file diagnosed');
    await session.app.evaluate(({app})=>app.exit(0));session=await launch();session.page.on('pageerror',e=>errors.push(e.message));
    await session.page.waitForFunction(count=>Number(document.getElementById('library-count').textContent)===count,referenceCount+3);
    const restored=await session.page.evaluate(()=>window.polytope.libraries());assert.equal(restored.libraries.length,1);
    const loaded=await session.page.evaluate(p=>window.polytope.libraryModel(p),file);assert.equal(loaded.model.metadata.linkedRelativePath,'4D/regular/Fixture tesseract.off');
    checks.push('links restored after application restart','source path provenance');
    await session.page.locator('#linked-libraries').getByRole('button',{name:'Remove',exact:true}).click();
    await session.page.waitForFunction(count=>Number(document.getElementById('library-count').textContent)===count,referenceCount);
    await assert.rejects(session.page.evaluate(p=>window.polytope.libraryModel(p),file),/not in a supported linked catalog/);
    assert.equal((JSON.parse(await fs.readFile(path.join(profile,'linked-libraries.json'),'utf8'))).paths.length,0);
    checks.push('unlink revokes capabilities and persists','unlink preserves source files');await fs.access(file);
    if(process.env.POLYTOPE_TEST_LIBRARY){
      await link(path.resolve(process.env.POLYTOPE_TEST_LIBRARY));
      const corpusResult=await session.page.evaluate(()=>window.polytope.libraries());
      const entries=corpusResult.libraries[0].entries;
      assert.ok(entries.length>0);
      const source=entries.find(e=>e.name==='Grand hexacosichoron')||entries.find(e=>e.supported&&e.dimension===4);
      assert.ok(source);await session.page.locator('#search').fill(source.name);await session.page.locator('#catalog button').evaluateAll((nodes,key)=>{const node=nodes.find(n=>n.dataset.key===key);if(!node)throw new Error('Source file is not in the filtered library');node.click();},source.key);
      await session.page.waitForFunction(name=>document.getElementById('model-name').textContent===name,source.name);
      const sourceModel=await session.page.evaluate(p=>window.polytope.libraryModel(p),source.key);
      assert.deepEqual(['vertices','edges','faces','cells'].map(k=>sourceModel.model[k].length),source.counts);
      await session.page.screenshot({path:path.join(artifacts,packaged?'workspace-linked-packaged.png':'workspace-linked-desktop.png')});
      checks.push('actual source corpus indexed and source incidence opened');
    }
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(artifacts,packaged?'linked-packaged-smoke.json':'linked-desktop-smoke.json'),JSON.stringify({passed:true,packaged:Boolean(packaged),version:await session.app.evaluate(({app})=>app.getVersion()),checks,pageErrors:errors},null,2));
    console.log(`Linked library smoke passed: ${checks.length} checks.`);
  }finally{await session.app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
