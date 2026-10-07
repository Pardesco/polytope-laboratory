const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const active=project=>{const doc=project.documents[project.active];return doc.states[doc.cursor];};
const geometry=model=>Object.fromEntries(['dimension','embeddingDimension','vertices','edges','faces','cells'].map(k=>[k,model[k]]));

function cube(){
  const vertices=Array.from({length:8},(_,id)=>Array.from({length:3},(_,axis)=>(id>>axis&1)?1:-1));
  const edges=[];for(let a=0;a<8;a++)for(let b=a+1;b<8;b++)if(vertices[a].filter((x,i)=>x!==vertices[b][i]).length===1)edges.push([a,b]);
  const faces=[];for(let axis=0;axis<3;axis++)for(const side of [-1,1]){
    const free=[0,1,2].filter(i=>i!==axis);
    faces.push([[-1,-1],[1,-1],[1,1],[-1,1]].map(corner=>vertices.findIndex(p=>p[axis]===side&&free.every((a,k)=>p[a]===corner[k]))));
  }
  return {name:'Literal primitive cube',dimension:3,embeddingDimension:3,interpretation:'convex-polytope',vertices,edges,faces,cells:[]};
}

async function main(){
  const artifacts=process.env.POLYTOPE_TEST_ARTIFACTS?path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS):path.join(root,'artifacts');await fs.mkdir(artifacts,{recursive:true});
  const packaged=process.env.POLYTOPE_TEST_EXECUTABLE,folder=await fs.mkdtemp(path.join(artifacts,packaged?'entity-presentation-packaged-':'entity-presentation-smoke-'));
  const profile=path.join(folder,'profile');await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;if(packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-python.exe');
  const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);const errors=[],checks=[],images=[],gpu=[];let sequence=0;
  page.on('pageerror',error=>errors.push(error.message));
  const ready=async()=>{await page.waitForFunction(()=>document.getElementById('cancel').hidden);for(let i=0;i<5;i++)await page.evaluate(()=>new Promise(requestAnimationFrame));};
  const appearance=async()=>page.locator('#surface-settings').evaluate(node=>{node.open=true;});
  const triangles=async()=>Number(await page.locator('#view-diagnostic').getAttribute('data-triangles'));
  async function input(id,value){await appearance();await page.locator('#'+id).evaluate((node,value)=>{node.value=String(value);node.dispatchEvent(new Event(['vertex-radius','edge-radius'].includes(node.id)?'change':'input',{bubbles:true}));},value);await ready();}
  async function save(label){
    await ready();await page.keyboard.press('Escape');const file=path.join(folder,`${++sequence}-${label}.polyproj`);
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
  async function projectFile(label,model,view){
    const project={format:'polytope-laboratory',version:1,active:0,documents:[{id:label,cursor:0,states:[{model,view,notes:'',label}]}]};
    const file=path.join(folder,label+'.polyproj');await fs.writeFile(file,JSON.stringify(project));return file;
  }
  async function capture(name){
    await ready();const evidence=await page.evaluate(()=>{
      const source=document.querySelector('#base-canvas canvas'),canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data,bg=[...data.slice(0,3)];let nonBackground=0,checksum=0;
      for(let i=0;i<data.length;i+=4){if(data[i]!==bg[0]||data[i+1]!==bg[1]||data[i+2]!==bg[2])nonBackground++;checksum=(checksum+data[i]*3+data[i+1]*5+data[i+2]*7)>>>0;}
      return {width:canvas.width,height:canvas.height,nonBackground,checksum};
    });assert.ok(evidence.nonBackground>200);images.push({name,...evidence});await page.screenshot({path:path.join(folder,name+'.png')});return evidence;
  }
  async function drawCounts(label){await ready();const draws=await page.evaluate(()=>globalThis.__presentationDraws||[]);gpu.push({label,draws});return draws.map(d=>d.instances).sort((a,b)=>a-b);}
  async function resetAngles(){await page.locator('#rotation-settings').evaluate(node=>{node.open=true;});for(let i=0;i<6;i++)await page.locator('#plane-'+i).evaluate(node=>{node.value='0';node.dispatchEvent(new Event('input',{bubbles:true}));});await page.keyboard.press('Escape');await ready();}
  async function projection(value){await page.locator('#rotation-settings').evaluate(node=>{node.open=true;});await page.locator('#projection').selectOption(value);await page.keyboard.press('Escape');await ready();}
  try{
    await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract');await ready();
    // Observe real GPU draws, without exposing or modifying the application's viewer.
    await page.evaluate(()=>{
      const p=WebGL2RenderingContext.prototype,clear=p.clear;
      p.clear=function(mask){if(this.canvas.closest('#base-canvas')&&(mask&this.COLOR_BUFFER_BIT))globalThis.__presentationDraws=[];return clear.call(this,mask);};
      for(const method of ['drawElementsInstanced','drawArraysInstanced']){const old=p[method];p[method]=function(...args){if(this.canvas.closest('#base-canvas'))(globalThis.__presentationDraws??=[]).push({method,mode:args[0],count:args[method==='drawElementsInstanced'?1:2],instances:args.at(-1)});return old.apply(this,args);};}
    });
    const original=await save('original-tesseract'),tesseract=active(original.project);
    assert.deepEqual(['vertices','edges','faces','cells'].map(k=>tesseract.model[k].length),[16,32,24,8]);
    const literal=cube(),baseView={...tesseract.view,angles:Array(6).fill(0),faces:false,vertices:false,edges:true,vertexStyle:'point',edgeStyle:'line',cellShrink:1,surfaceOpacity:1};
    const cubeFile=await projectFile('literal-cube',literal,{...baseView,sectionNormal:[0,0,1],rotationPlane:1});await open(cubeFile,literal.name);await page.locator('#view-orientation').selectOption('isometric');
    const lines=await capture('cube-source-lines');await input('vertex-style','sphere');await input('edge-style','cylinder');await input('vertex-radius',.05);await input('edge-radius',.018);
    assert.deepEqual(await drawCounts('literal cube instances'),[8,12]);assert.equal(await page.locator('#cell-shrink').isDisabled(),true);
    const solid=await capture('cube-instanced-spheres-cylinders');assert.notEqual(solid.checksum,lines.checksum);assert.ok(solid.nonBackground>lines.nonBackground);
    const cubeSaved=await save('cube-styles'),cubeState=active(cubeSaved.project);assert.deepEqual(geometry(cubeState.model),geometry(literal));
    assert.deepEqual(['vertexStyle','edgeStyle','vertexRadius','edgeRadius','cellShrink'].map(k=>cubeState.view[k]),['sphere','cylinder',.05,.018,1]);assert.equal(cubeState.view.vertices,true);
    checks.push('literal cube renders eight spheres and twelve cylinders in actual instanced GPU draws; radii change pixels without source mutation');
    await input('vertex-style','point');await input('edge-style','line');assert.deepEqual(await drawCounts('ordinary primitives restored'),[]);
    await open(cubeSaved.file,literal.name);await page.waitForFunction(()=>document.getElementById('vertex-style').value==='sphere');assert.deepEqual(await drawCounts('restored cube styles'),[8,12]);
    const restoredCube=active((await save('cube-restored')).project);assert.deepEqual(geometry(restoredCube.model),geometry(literal));
    assert.deepEqual(['vertexStyle','edgeStyle','vertexRadius','edgeRadius'].map(k=>restoredCube.view[k]),['sphere','cylinder',.05,.018]);
    checks.push('native save/reopen restores both primitive styles and radii; switching to point/line removes instanced draws');
    const shrinkFile=await projectFile('tesseract-shrink',{...tesseract.model,name:'Tesseract presentation fixture'},{...baseView,faces:true,vertices:true,vertexStyle:'sphere',edgeStyle:'cylinder',surfaceOpacity:.28,vertexRadius:.025,edgeRadius:.009});
    await open(shrinkFile,'Tesseract presentation fixture');await resetAngles();await projection('perspective');assert.equal(await triangles(),48);
    const full=await capture('tesseract-full-size');await input('cell-shrink',.6);assert.equal(await triangles(),96);assert.deepEqual(await drawCounts('shrunk tesseract primitives'),[16,32]);
    const shrunk=await capture('tesseract-independent-cell-shrink');assert.notEqual(full.checksum,shrunk.checksum);
    const shrunkSave=await save('shrunk-tesseract'),shrunkState=active(shrunkSave.project);assert.equal(shrunkState.view.cellShrink,.6);assert.deepEqual(geometry(shrunkState.model),geometry(tesseract.model));
    checks.push('eight tesseract cells produce ninety-six separate face triangles at shrink .6; all sixteen vertices and thirty-two full-size edges remain');
    await appearance();await page.locator('#cell-facing').selectOption('front');await ready();await page.waitForFunction(()=>document.getElementById('cell-visibility-summary').textContent==='1 / 8 visible');
    assert.equal(await triangles(),12);assert.deepEqual(await drawCounts('front-facing cell primitives'),[8,12]);await capture('shrunk-front-facing-cell');
    await page.keyboard.press('Escape');await page.locator('#toggle-inspector').click();await page.locator('[data-panel="info"]').click();await page.locator('#selection-kind').selectOption('cell');await page.locator('#selection-id').fill('0');await page.locator('#select-entity').click();
    await page.locator('#entity-first').click();await ready();await appearance();await page.locator('#visible-cell-id').fill('0');await page.locator('#isolate-cell').click();await ready();assert.equal(await triangles(),12);
    assert.deepEqual(await drawCounts('shrunk first isolated cell'),[8,12]);await page.keyboard.press('Escape');await page.locator('#entity-last').click();await ready();assert.equal(await triangles(),0);assert.deepEqual(await drawCounts('shrunk last excluded cell'),[]);
    await appearance();await page.locator('#cell-facing').selectOption('all');await ready();assert.equal(await triangles(),12);assert.deepEqual(await drawCounts('manual isolated last cell'),[8,12]);await capture('shrunk-cell-last-manual-isolation');
    const oriented=await save('oriented-shrunk-cell'),orientedState=active(oriented.project);assert.equal(orientedState.view.cellShrink,.6);assert.equal(orientedState.view.isolatedCell,0);assert.deepEqual(geometry(orientedState.model),geometry(tesseract.model));
    checks.push('shrink combines with dynamic source-cell facing, isolation and cell 0 First/Last without changing incidence or source coordinates');
    await input('cell-shrink',1);assert.equal(await triangles(),12);await open(oriented.file,'Tesseract presentation fixture');await page.waitForFunction(()=>document.getElementById('cell-shrink').value==='0.6');assert.equal(await triangles(),12);
    const finalState=active((await save('complete-presentation-restored')).project);assert.deepEqual(finalState.view.orientationFrame,orientedState.view.orientationFrame);assert.equal(finalState.view.isolatedCell,0);assert.equal(finalState.view.cellShrink,.6);assert.deepEqual(geometry(finalState.model),geometry(tesseract.model));
    checks.push('native project reload restores shrink, source-bound orientation, styles and isolation together');
    for(const [field,value] of [['vertexRadius',0],['edgeRadius',0],['cellShrink',1.01]]){
      const bad=structuredClone(oriented.project);active(bad).view[field]=value;active(bad).model.name='Invalid presentation '+field;const file=path.join(folder,'invalid-'+field+'.polyproj');await fs.writeFile(file,JSON.stringify(bad));
      await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.evaluate(()=>document.getElementById('status').textContent='');await page.locator('#open').click();
      await page.waitForFunction(field=>document.getElementById('status').textContent.includes(field),field);assert.equal(await page.locator('#model-name').textContent(),'Tesseract presentation fixture');await ready();
    }
    checks.push('native project parser rejects zero primitive radii and shrink greater than one before adopting malformed state');
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,packaged:Boolean(packaged),version:await app.evaluate(({app})=>app.getVersion()),checks,images,gpu,pageErrors:errors},null,2));
    console.log(`Entity presentation desktop smoke passed: ${checks.length} checks. Artifacts: ${folder}`);
  }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,images,gpu,pageErrors:errors},null,2));console.error('Artifacts:',folder);console.error(await page.locator('body').innerText().catch(()=>''));throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
