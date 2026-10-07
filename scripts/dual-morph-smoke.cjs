// Root owns real Electron/GPU launches. --self-test checks fixtures headlessly.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {guardRuntime}=require('./layer-join-smoke.cjs');
const root=path.resolve(__dirname,'..'),active=p=>{const d=p.documents[p.active];return d.states[d.cursor];};
const hash=b=>createHash('sha256').update(b).digest('hex');
function native(request){
  const p=spawnSync(process.env.POLYTOPE_PYTHON||'python',['-B','-m','engine.server'],{cwd:root,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024,input:JSON.stringify({...request,id:'morph-fixture'})+'\n'});
  assert.ifError(p.error);assert.equal(p.status,0,p.stderr);const r=JSON.parse(p.stdout.trim());assert.equal(r.ok,true,r.error);return r.result;
}
function fixture(key){
  const model=native({op:'generate',params:{kind:'regular',key}});
  model.metadata.coordinateUnits='mm';model.metadata.historical={literal:[.125,7,'keep']};
  model.metadata.offColors={faces:[{encoding:'byte',values:[50,100,150,127]},...model.faces.slice(1).map(()=>null)]};
  return {format:'polytope-laboratory',version:1,active:0,documents:[{id:'morph-'+key,cursor:0,states:[{model,notes:'Original morph source notes and mm units.',view:{angles:Array(6).fill(0),projection:'orthographic',cameraProjection:'orthographic',camera:{position:[0,0,5],target:[0,0,0],projection:'orthographic',zoom:1,up:[0,1,0],orthographicHalfHeight:1.4},faces:true,edges:true,vertices:true,pickKind:'vertex',surfaceColors:'source',surfaceOpacity:1,cellShrink:1,hiddenCells:[],isolatedCell:null,cellFacing:'all',coordinateUnit:'mm',viewportLayout:'single'}}]}]};
}
const settings=method=>({version:1,enabled:true,method,center:null,radius:Math.SQRT2,ratio:.25,duration:2,loop:false});
function frame(source,method,ratio=.25){
  const sourceContext={notes:source.notes,unit:'mm'},prepared=native({op:'prepare-dual-morph',model:source.model,params:{settings:settings(method),sourceContext}});
  return native({op:'evaluate-dual-morph',model:source.model,params:{prepared,ratio,sourceContext}});
}
async function selfTest(){
  for(const key of ['cube','tesseract']){
    const p=fixture(key),s=active(p),before=structuredClone(s.model);
    for(const method of key==='cube'?['sizing','truncation','augmentation','expansion','tilting-quads']:['expansion','tilting-quads']){
      const f=frame(s,method);assert.equal(f.method,method);assert.equal(f.ratio,.25);assert.equal(f.sourceFingerprint,s.model.fingerprint);assert.ok(f.model.vertices.length>s.model.vertices.length);assert.deepEqual(s.model,before);
    }
    s.view.dualMorph=settings('expansion');const saved=native({op:'validate-project',params:{project:p}});assert.deepEqual(active(saved).view.dualMorph,s.view.dualMorph);assert.deepEqual(active(saved).model.metadata,s.model.metadata);
  }
  console.log('Dual morph smoke headless self-test PASS: production fixtures, seven scoped native paths, source attributes and saved settings.');
}
async function main(){
  const runtime=await guardRuntime(),{_electron:electron}=require('playwright'),THREE=require('three');
  const artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));await fs.mkdir(artifacts,{recursive:true});
  const folder=await fs.mkdtemp(path.join(artifacts,'dual-morph-smoke-')),profile=path.join(folder,'profile');await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-python.exe');
  const app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
  let page,stage='startup',sequence=0;const checks=[],errors=[],evidence=[];
  try{
    page=await app.firstWindow();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    await page.evaluate(()=>{window.morphHarnessStatuses=[];new MutationObserver(()=>window.morphHarnessStatuses.push(document.getElementById('status').textContent)).observe(document.getElementById('status'),{childList:true,subtree:true,characterData:true});});
    const ready=async()=>{await page.waitForFunction(()=>document.getElementById('cancel').hidden);await page.evaluate(()=>new Promise(resolve=>{let n=5;const tick=()=>--n?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick);}));};
    async function save(label){await ready();await page.keyboard.press('Escape');const file=path.join(folder,`${++sequence}-${label}.polyproj`);await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.evaluate(()=>document.getElementById('status').textContent='');await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);return {file,project:JSON.parse(await fs.readFile(file,'utf8'))};}
    async function open(file,name){await ready();await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);const offset=await page.evaluate(()=>window.morphHarnessStatuses.length);await page.locator('#open').click();await page.waitForFunction(({file,offset})=>window.morphHarnessStatuses.slice(offset).includes('Opened '+file),{file,offset});await page.waitForFunction(name=>document.getElementById('model-name').textContent===name,name);await ready();await page.locator('#dual-morph-settings').evaluate(n=>{n.open=true;});}
    async function configure(method,ratio='.25'){await page.locator('#dual-morph-settings').evaluate(n=>{n.open=true;});await page.locator('#dual-morph-method').selectOption(method);await page.locator('#dual-morph-center').fill('');await page.locator('#dual-morph-radius').fill(String(Math.SQRT2));await page.locator('#dual-morph-ratio').fill(ratio);await page.locator('#dual-morph-duration').fill('2');await page.locator('#dual-morph-loop').uncheck();await page.locator('#dual-morph-apply').click();await page.waitForFunction(method=>document.getElementById('dual-morph-result').textContent.startsWith(method+' ')&&!document.getElementById('dual-morph-play').disabled,method);await ready();}
    async function capture(label){await page.keyboard.press('Escape');const file=path.join(folder,label+'.png');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.evaluate(()=>document.getElementById('status').textContent='');await page.locator('#image').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);const data=await fs.readFile(file);assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.ok(data.length>2000);evidence.push({capture:label,bytes:data.length,sha256:hash(data)});return hash(data);}
    function retained(actual,original){assert.deepEqual(actual.model,original.model);assert.equal(actual.notes,original.notes);assert.equal(actual.view.coordinateUnit,'mm');}
    for(const key of ['cube','tesseract']){
      stage=key;const p=fixture(key),source=active(p),file=path.join(folder,key+'-source.polyproj');await fs.writeFile(file,JSON.stringify(p));await open(file,source.model.name);
      // Canonical native reopen may add project defaults, but complete source JSON must persist thereafter.
      const canonical=active((await save(key+'-canonical')).project);
      for(const method of key==='cube'?['sizing','truncation','augmentation','expansion','tilting-quads']:['expansion','tilting-quads']){
        stage=key+'-'+method;await configure(method);const capturedHash=await capture(stage);const saved=await save(stage);retained(active(saved.project),canonical);assert.equal(active(saved.project).view.dualMorph.method,method);assert.equal(active(saved.project).view.dualMorph.ratio,.25);assert.equal(active(saved.project).view.dualMorph.enabled,true);
        checks.push(`${key} ${method}: actual UI numeric preparation/native pose/GPU still capture preserve original source, RGBA, notes and units`);
        if(method==='augmentation'){await open(saved.file,canonical.model.name);await page.waitForFunction(()=>!document.getElementById('dual-morph-play').disabled);const reopened=active((await save('cube-augmentation-reopened')).project);retained(reopened,canonical);assert.equal(reopened.view.dualMorph.method,'augmentation');assert.equal(reopened.view.dualMorph.ratio,.25);assert.equal(await capture('cube-augmentation-reconstructed'),capturedHash);checks.push('augmentation native Save/Open reconstructs the exact saved display, including byte-identical still capture, without storing morph meshes');}
      }
      if(key==='cube'){
        stage='cube-expansion-pick';await configure('expansion');await page.keyboard.press('Escape');await ready();const f=frame(canonical,'expansion'),r=Math.max(...canonical.model.vertices.map(p=>Math.hypot(...p))),points=f.model.vertices.map(p=>p.map(x=>x/r));
        const index=points.reduce((best,p,i)=>p[2]>points[best][2]?i:best,0),point=points[index],camera=canonical.view.camera,box=await page.locator('#base-canvas canvas').boundingBox(),half=camera.orthographicHalfHeight;
        const c=new THREE.OrthographicCamera(-half*box.width/box.height,half*box.width/box.height,half,-half,.01,1000);c.position.fromArray(camera.position);c.up.fromArray(camera.up);c.zoom=camera.zoom;c.lookAt(new THREE.Vector3(...camera.target));c.updateProjectionMatrix();c.updateMatrixWorld();const q=new THREE.Vector3(...point).project(c);
        await page.mouse.click(box.x+(q.x+1)*box.width/2,box.y+(1-q.y)*box.height/2);await ready();const selection=JSON.parse(await page.locator('#selection-info').textContent());assert.equal(selection.kind,'vertex');assert.ok(canonical.model.vertices[selection.index]);assert.match(await page.locator('#status').textContent(),/Morph vertex/);
        const picked=active((await save('cube-picked')).project);retained(picked,canonical);assert.equal(picked.view.dualMorph.ratio,.25);assert.deepEqual(picked.view.entitySelection,{kind:selection.kind,index:selection.index});checks.push('actual morphed GPU vertex pick returns retained source owners and persists selection without clearing the morph');
        stage='cube-playback';await page.locator('#dual-morph-settings').evaluate(n=>{n.open=true;});await page.locator('#dual-morph-play').click();await page.waitForFunction(()=>{const s=document.getElementById('dual-morph-scrub');return Number(s.value)>.45;});await page.locator('#dual-morph-pause').click();await ready();const paused=await save('cube-paused'),ratio=active(paused.project).view.dualMorph.ratio;assert.ok(ratio>.45&&ratio<=1);retained(active(paused.project),canonical);await capture('cube-paused');
        await page.locator('#dual-morph-settings').evaluate(n=>{n.open=true;});await page.locator('#dual-morph-reset').click();await ready();assert.equal(active((await save('cube-reset')).project).view.dualMorph.enabled,false);
        await open(paused.file,canonical.model.name);await page.waitForFunction(()=>!document.getElementById('dual-morph-play').disabled);const reopened=active((await save('cube-reopened')).project);retained(reopened,canonical);assert.equal(reopened.view.dualMorph.ratio,ratio);await capture('cube-reconstructed');checks.push('actual RAF playback/pause/reset and native Save/Open reconstruct exact saved pose while retaining source JSON and observer camera');
      }
    }
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,packaged:Boolean(runtime.packaged),version:await app.evaluate(({app})=>app.getVersion()),checks,evidence,pageErrors:errors},null,2));console.log(`Dual morph desktop smoke PASS (${checks.length} checks). Artifacts: ${folder}`);
  }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,stage,error:error.stack,checks,evidence,pageErrors:errors},null,2));console.error('Artifacts:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
if(require.main===module)(process.argv.includes('--self-test')?selfTest():main()).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={fixture,settings,frame,selfTest};
