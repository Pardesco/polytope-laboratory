const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),active=project=>{const doc=project.documents[project.active];return doc.states[doc.cursor];};
const geometry=model=>Object.fromEntries(['dimension','embeddingDimension','vertices','edges','faces','cells'].map(key=>[key,model[key]]));

function starProduct(){
  const vertices=[],faces=[],edges=[],cells=[],cycle=[0,2,4,1,3],id=(a,b)=>a*3+b;
  for(let a=0;a<5;a++)for(let b=0;b<3;b++)vertices.push([Math.cos(a*2*Math.PI/5),Math.sin(a*2*Math.PI/5),.7*Math.cos(b*2*Math.PI/3),.7*Math.sin(b*2*Math.PI/3)]);
  for(let b=0;b<3;b++)faces.push(cycle.map(a=>id(a,b)));
  for(let a=0;a<5;a++)faces.push([0,1,2].map(b=>id(a,b)));
  for(let e=0;e<5;e++)for(let b=0;b<3;b++){
    const a=cycle[e],next=cycle[(e+1)%5],nextB=(b+1)%3;
    faces.push([id(a,b),id(next,b),id(next,nextB),id(a,nextB)]);
  }
  for(let b=0;b<3;b++)cells.push([b,(b+1)%3,...Array.from({length:5},(_,e)=>8+e*3+b)]);
  for(let e=0;e<5;e++)cells.push([3+cycle[e],3+cycle[(e+1)%5],...Array.from({length:3},(_,b)=>8+e*3+b)]);
  for(let a=0;a<5;a++)for(let b=0;b<3;b++){
    edges.push([id(cycle[a],b),id(cycle[(a+1)%5],b)]);edges.push([id(a,b),id(a,(b+1)%3)]);
  }
  return {name:'Pentagram by triangle facing fixture',dimension:4,embeddingDimension:4,interpretation:'generalized-complex',vertices,edges,faces,cells,metadata:{fillSemantics:'ordered-source-cycles'},numeric:{mode:'float64-approximate',certified:false}};
}

async function main(){
  const artifacts=process.env.POLYTOPE_TEST_ARTIFACTS?path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS):path.join(root,'artifacts');await fs.mkdir(artifacts,{recursive:true});
  const packaged=process.env.POLYTOPE_TEST_EXECUTABLE,folder=await fs.mkdtemp(path.join(artifacts,packaged?'cell-facing-packaged-':'cell-facing-smoke-'));
  const profile=path.join(folder,'profile');await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;if(packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-python.exe');
  const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);const errors=[],checks=[],images=[];let sequence=0;
  page.on('pageerror',error=>errors.push(error.message));
  const ready=async()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
  const appearance=async()=>page.locator('#surface-settings').evaluate(node=>{node.open=true;});
  const triangles=async()=>Number(await page.locator('#view-diagnostic').getAttribute('data-triangles'));
  async function save(label){
    await ready();const file=path.join(folder,`${++sequence}-${label}.polyproj`);
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
    await page.evaluate(()=>document.getElementById('status').textContent='');await page.locator('#save').click();
    await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);await ready();
    return {file,project:JSON.parse(await fs.readFile(file,'utf8'))};
  }
  async function open(file,name){
    await ready();await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
    await page.evaluate(()=>document.getElementById('status').textContent='');await page.locator('#open').click();
    await page.waitForFunction(name=>document.getElementById('model-name').textContent===name,name);await ready();
  }
  async function mode(value,counts){await appearance();await page.locator('#cell-facing').selectOption(value);await ready();if(counts)await page.waitForFunction(expected=>document.getElementById('cell-facing-result').textContent===expected,counts);}
  async function visibility(count){await page.waitForFunction(count=>document.getElementById('cell-visibility-summary').textContent===`${count} / 8 visible`,count);}
  async function projection(value){await page.locator('#rotation-settings').evaluate(node=>{node.open=true;});await page.locator('#projection').selectOption(value);await page.keyboard.press('Escape');}
  async function resetAngles(){await page.locator('#rotation-settings').evaluate(node=>{node.open=true;});for(let i=0;i<6;i++)await page.locator('#plane-'+i).evaluate(node=>{node.value='0';node.dispatchEvent(new Event('input',{bubbles:true}));});await page.keyboard.press('Escape');}
  async function capture(name){
    for(let i=0;i<4;i++)await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
    const evidence=await page.evaluate(()=>{
      const source=document.querySelector('#base-canvas canvas'),canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
      const context=canvas.getContext('2d');context.drawImage(source,0,0);const bytes=context.getImageData(0,0,canvas.width,canvas.height).data,corner=[...bytes.slice(0,3)];let nonBackground=0;
      for(let i=0;i<bytes.length;i+=4)if(bytes[i]!==corner[0]||bytes[i+1]!==corner[1]||bytes[i+2]!==corner[2])nonBackground++;
      return {width:canvas.width,height:canvas.height,nonBackground};
    });
    assert.ok(evidence.nonBackground>200);images.push({name,...evidence});await page.screenshot({path:path.join(folder,name+'.png')});
  }
  const jobs=async()=>app.evaluate(()=>globalThis.__facingSmokeJobs);
  try{
    await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract');await ready();
    await app.evaluate(({ipcMain})=>{globalThis.__facingSmokeJobs=0;const old=ipcMain._invokeHandlers.get('engine');ipcMain._invokeHandlers.set('engine',async(event,request,...args)=>{if(request?.op==='cell-facing')globalThis.__facingSmokeJobs++;return old(event,request,...args);});});
    const initial=active((await save('original')).project);assert.deepEqual(['vertices','edges','faces','cells'].map(key=>initial.model[key].length),[16,32,24,8]);
    await resetAngles();await projection('orthographic');await mode('hide-front','1 front / 1 back / 6 grazing');await visibility(7);
    assert.equal(await triangles(),48);assert.equal(await jobs(),1);await capture('orthographic-hide-front');
    checks.push('native cached convex planes give orthographic 1 front / 1 back / 6 grazing and retain shared source faces');
    await projection('perspective');await page.waitForFunction(()=>document.getElementById('cell-facing-result').textContent==='1 front / 7 back / 0 grazing');
    await mode('front','1 front / 7 back / 0 grazing');await visibility(1);assert.equal(await triangles(),12);await capture('perspective-front-only');
    await mode('back','1 front / 7 back / 0 grazing');await visibility(7);assert.equal(await triangles(),48);assert.equal(await jobs(),1);
    checks.push('finite W3 observer gives 1 front / 7 back; front-only renders six source faces and back-only retains all shared faces');
    await page.keyboard.press('Escape');await page.locator('#toggle-inspector').click();await page.locator('[data-panel="info"]').click();
    await page.locator('#selection-kind').selectOption('cell');await page.locator('#selection-id').fill('0');await page.locator('#select-entity').click();
    await mode('front');await page.keyboard.press('Escape');await page.locator('#entity-first').click();await ready();
    await appearance();await page.locator('#visible-cell-id').fill('0');await page.locator('#isolate-cell').click();await visibility(1);assert.equal(await triangles(),12);
    await page.keyboard.press('Escape');await page.locator('#entity-last').click();await ready();await visibility(0);assert.equal(await triangles(),0);
    await appearance();await page.locator('#show-all-cells').click();await visibility(1);await capture('cell-zero-last-front-only');
    checks.push('selected cell 0 First/Last combines correctly with facing and manual isolation');
    await page.keyboard.press('Escape');await page.locator('#entity-orientation-clear').click();await resetAngles();await projection('orthographic');await mode('front');
    await page.locator('#rotation-settings').evaluate(node=>{node.open=true;});await page.locator('#auto-rotation-plane').selectOption('2');await page.locator('#auto-rotation-speed').fill('90');await page.locator('#auto-rotation-speed').dispatchEvent('change');
    await page.keyboard.press('Escape');const beforeJobs=await jobs();await page.locator('#auto-rotate').click();
    await page.waitForFunction(()=>document.getElementById('cell-facing-result').textContent==='2 front / 2 back / 4 grazing');
    await page.locator('#auto-rotate').click();assert.equal(await jobs(),beforeJobs);await visibility(2);await capture('dynamic-xw-facing');
    checks.push('automatic XW spin updates observer-facing masks without another native plane job');
    await resetAngles();await mode('front');const cached=active((await save('zero-front')).project),front=cached.view.cellFacingCache.frontCellIds[0];
    await appearance();await page.locator('#visible-cell-id').fill(String(front));await page.locator('#hide-cell').click();await visibility(0);
    await page.locator('#show-all-cells').click();await page.locator('#isolate-cell').click();await visibility(1);
    const saved=await save('cached-front-isolated'),savedState=active(saved.project);
    assert.equal(savedState.view.cellFacing,'front');assert.equal(savedState.view.isolatedCell,front);assert.equal(savedState.view.cellFacingCache.sourceFingerprint,savedState.model.fingerprint);
    assert.deepEqual(geometry(savedState.model),geometry(initial.model));await mode('all');
    await open(saved.file,'Tesseract');await page.waitForFunction(()=>document.getElementById('cell-facing').value==='front');await appearance();await visibility(1);assert.equal(await triangles(),12);
    const restored=active((await save('restored-cache')).project);assert.deepEqual(restored.view.cellFacingCache,savedState.view.cellFacingCache);assert.equal(restored.view.cellFacing,'front');assert.equal(restored.view.isolatedCell,front);assert.equal(await jobs(),beforeJobs);
    checks.push('hide/isolate intersects facing; complete cache, mode and source geometry survive native save/reopen');
    const corrupted=structuredClone(saved.project),badState=active(corrupted);badState.model.name='Invalid cached cell-plane fixture';badState.view.hiddenCells=[];badState.view.isolatedCell=null;badState.view.cellFacingCache.cells[0].normalizedPlane.offset=.8;
    const badFile=path.join(folder,'invalid-plane-cache.polyproj');await fs.writeFile(badFile,JSON.stringify(corrupted));
    await open(badFile,badState.model.name);await page.waitForFunction(()=>document.getElementById('view-diagnostic').textContent.includes('Cell facing unavailable:'));
    await appearance();await visibility(8);assert.equal(await triangles(),48);assert.match(await page.locator('#view-diagnostic').textContent(),/support checks/);
    await capture('invalid-cache-diagnostic');checks.push('persisted false support plane is explicitly ignored instead of silently culling source cells');
    const star=starProduct(),starProject={format:'polytope-laboratory',version:1,active:0,documents:[{id:'literal-star-product',cursor:0,states:[{model:star,view:{...initial.view,angles:Array(6).fill(0),cellFacing:'all',hiddenCells:[],isolatedCell:null},notes:'',label:'Independent generalized star fixture'}]}]};
    const starFile=path.join(folder,'literal-star-product.polyproj');await fs.writeFile(starFile,JSON.stringify(starProject));await open(starFile,star.name);await appearance();
    assert.equal(await page.locator('#cell-facing').isDisabled(),true);assert.match(await page.locator('#cell-facing').getAttribute('title'),/orientation semantics/);assert.ok(await triangles()>0);
    await page.locator('#visible-cell-id').fill('0');await page.locator('#isolate-cell').click();await visibility(1);assert.ok(await triangles()>0);
    const starSaved=active((await save('star-manual-isolated')).project);assert.deepEqual(geometry(starSaved.model),geometry(star));await capture('generalized-star-manual-isolation');
    checks.push('literal pentagram-by-triangle 4D cells disable unsupported facing while retaining manual source-cell isolation');
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,packaged:Boolean(packaged),version:await app.evaluate(({app})=>app.getVersion()),checks,images,cellFacingNativeJobs:await jobs(),pageErrors:errors},null,2));
    console.log(`Cell-facing desktop smoke passed: ${checks.length} checks. Artifacts: ${folder}`);
  }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,images,pageErrors:errors},null,2));console.error('Artifacts:',folder);console.error(await page.locator('body').innerText().catch(()=>''));throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
