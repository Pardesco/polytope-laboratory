const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),THREE=require('three');
const root=path.resolve(__dirname,'..');
const active=project=>{const d=project.documents[project.active];return d.states[d.cursor];};
const geometry=model=>Object.fromEntries(['dimension','embeddingDimension','vertices','edges','faces','cells'].map(k=>[k,model[k]]));
const literal=()=>({name:'Analytic spherical quarter-circle fixture',dimension:4,embeddingDimension:4,interpretation:'generalized-complex',
  vertices:[[1,0,0,0],[-1,0,0,0],[0,1,0,0],[0,-1,0,0],[0,0,1,0],[0,0,-1,0],[0,0,0,1],[0,0,0,-1]],edges:[[0,2],[2,4],[4,0]],faces:[[0,2,4]],cells:[],metadata:{fillSemantics:'ordered-source-cycles'}});

async function main(){
  const artifacts=process.env.POLYTOPE_TEST_ARTIFACTS?path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS):path.join(root,'artifacts');await fs.mkdir(artifacts,{recursive:true});
  const packaged=process.env.POLYTOPE_TEST_EXECUTABLE,folder=await fs.mkdtemp(path.join(artifacts,packaged?'stereographic-packaged-':'stereographic-smoke-'));
  const profile=path.join(folder,'profile');await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;if(packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-python.exe');
  const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);const errors=[],checks=[],evidence=[];let sequence=0;
  page.on('pageerror',error=>errors.push(error.message));
  const ready=async()=>{await page.waitForFunction(()=>document.getElementById('cancel').hidden);for(let i=0;i<5;i++)await page.evaluate(()=>new Promise(requestAnimationFrame));};
  async function save(label){await ready();await page.keyboard.press('Escape');const file=path.join(folder,`${++sequence}-${label}.polyproj`);await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.evaluate(()=>document.getElementById('status').textContent='');await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);return {file,project:JSON.parse(await fs.readFile(file,'utf8'))};}
  async function open(file,name){await ready();await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#open').click();await page.waitForFunction(name=>document.getElementById('model-name').textContent===name,name);await ready();}
  async function projection(value){await page.locator('#projection').selectOption(value);await ready();}
  async function faceVisible(value){await page.locator('#surface-settings').evaluate(node=>{node.open=true;});if(value)await page.locator('#faces-visible').check();else await page.locator('#faces-visible').uncheck();await page.keyboard.press('Escape');await ready();}
  async function sample(label,points){
    await ready();const state=active((await save('camera-'+label)).project),v=state.view.camera;
    const size=await page.locator('#base-canvas canvas').evaluate(c=>[c.width,c.height]),[width,height]=size,half=v.orthographicHalfHeight;
    const camera=new THREE.OrthographicCamera(-half*width/height,half*width/height,half,-half,.01,1000);camera.position.fromArray(v.position);camera.up.fromArray(v.up);camera.zoom=v.zoom;camera.lookAt(new THREE.Vector3(...v.target));camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const locations=points.map(p=>{const q=new THREE.Vector3(...p).project(camera);return [Math.round((q.x+1)*width/2),Math.round((1-q.y)*height/2)];});
    const pixels=await page.evaluate(locations=>{const source=document.querySelector('#base-canvas canvas'),c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.drawImage(source,0,0);return locations.map(([x,y])=>{const bytes=ctx.getImageData(x-3,y-3,7,7).data;let maximum=0;for(let i=0;i<bytes.length;i+=4)maximum=Math.max(maximum,(bytes[i]+bytes[i+1]+bytes[i+2])/3);return maximum;});},locations);
    evidence.push({label,points,locations,pixels});return pixels;
  }
  try{
    await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract');await ready();const original=active((await save('original')).project),model=literal();
    const project={format:'polytope-laboratory',version:1,active:0,documents:[{id:'analytic-quarter-circle',cursor:0,states:[{model,view:{...original.view,projection:'orthographic',angles:Array(6).fill(0),faces:false,vertices:false,edges:true,surfaceOpacity:1,vertexStyle:'point',edgeStyle:'line'},notes:'',label:'Independent analytic S3 fixture'}]}]};
    const file=path.join(folder,'analytic-quarter-circle.polyproj');await fs.writeFile(file,JSON.stringify(project));await open(file,model.name);await page.locator('#view-orientation').selectOption('z');await page.locator('#fit-view').click();
    const midpoint=[Math.SQRT1_2,Math.SQRT1_2,0],chord=[.5,.5,0],flat=await sample('orthographic-chord',[midpoint,chord]);assert.ok(flat[0]<35&&flat[1]>65,JSON.stringify(flat));
    await projection('stereographic');const curved=await sample('stereographic-circle',[midpoint,chord]);assert.ok(curved[0]>65&&curved[1]<35,JSON.stringify(curved));
    const quarter=[Math.cos(Math.PI/8),Math.sin(Math.PI/8),0],threeQuarter=[Math.sin(Math.PI/8),Math.cos(Math.PI/8),0];assert.ok((await sample('quarter-circle-other-locations',[quarter,threeQuarter])).every(x=>x>65));
    await page.screenshot({path:path.join(folder,'stereographic-curved-source-edges.png')});checks.push('actual GPU edge follows analytic unit quarter circle and leaves endpoint chord midpoint empty; ordinary orthographic mode does the reverse');
    assert.match(await page.locator('#view-diagnostic').textContent(),/source vertices.*pole/);const curveState=active((await save('curved-source')).project);assert.deepEqual(geometry(curveState.model),geometry(model));assert.equal(curveState.model.vertices.length,8);
    checks.push('projection-pole source vertex is explicitly diagnosed and virtual curve samples never become source vertices');
    await faceVisible(true);const patch=await sample('spherical-face-interior',[[.6,.6,0],[.9,.9,0]]);assert.ok(patch[0]>45&&patch[1]<35,JSON.stringify(patch));
    assert.ok(Number(await page.locator('#view-diagnostic').getAttribute('data-triangles'))>100);await page.screenshot({path:path.join(folder,'stereographic-curved-face-patch.png')});checks.push('actual lit spherical face covers curved interior outside the flat source triangle and preserves matching curved boundary');
    const smoothPixels=await sample('analytic-normal-lighting-row',Array.from({length:121},(_,i)=>[.15+i*.5/120,.3,0]));
    const adjacentJumps=smoothPixels.slice(1).map((value,i)=>Math.abs(value-smoothPixels[i]));
    assert.ok(Math.max(...adjacentJumps)<=3,`Spherical patch lighting has visible facet jumps: ${Math.max(...adjacentJumps)}`);
    assert.ok(Math.max(...smoothPixels)-Math.min(...smoothPixels)>4,'Lighting row should show smoothly varying curved shape');
    evidence.push({label:'smooth analytic normal row summary',maximumAdjacentLuminanceJump:Math.max(...adjacentJumps),luminanceRange:Math.max(...smoothPixels)-Math.min(...smoothPixels)});
    checks.push('analytic spherical normals produce smoothly varying actual GPU lighting across internal tessellation boundaries');
    await faceVisible(false);await page.locator('#rotation-settings').evaluate(node=>{node.open=true;});await page.locator('#plane-0').evaluate(node=>{node.value='90';node.dispatchEvent(new Event('input',{bubbles:true}));});await page.keyboard.press('Escape');
    const rotated=await sample('rotated-quarter-circle',[[-Math.SQRT1_2,Math.SQRT1_2,0],[-.5,.5,0]]);assert.ok(rotated[0]>65&&rotated[1]<35,JSON.stringify(rotated));await page.screenshot({path:path.join(folder,'stereographic-rotated-curves.png')});
    checks.push('incremental XY rotation moves curved geometry once and does not restore endpoint chords');
    await page.locator('#surface-settings').evaluate(node=>{node.open=true;});await page.locator('#edge-style').selectOption('cylinder');await page.keyboard.press('Escape');await ready();
    const cylinders=await sample('curved-cylinder-path',[[-Math.SQRT1_2,Math.SQRT1_2,0],[-.5,.5,0]]);assert.ok(cylinders[0]>60&&cylinders[1]<35,JSON.stringify(cylinders));await page.screenshot({path:path.join(folder,'stereographic-curved-cylinders.png')});
    const saved=await save('rotated-curved-cylinders'),state=active(saved.project);assert.equal(state.view.edgeStyle,'cylinder');assert.equal(state.view.projection,'stereographic');assert.equal(state.view.angles[0],90);assert.deepEqual(geometry(state.model),geometry(model));
    await projection('perspective');await open(saved.file,model.name);await page.waitForFunction(()=>document.getElementById('projection').value==='stereographic');const restored=await sample('restored-curved-cylinder-path',[[-Math.SQRT1_2,Math.SQRT1_2,0],[-.5,.5,0]]);assert.ok(restored[0]>60&&restored[1]<35,JSON.stringify(restored));
    checks.push('cylinder style follows the same curved source edge path; native save/reopen restores stereographic projection and rotation without source mutation');
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,packaged:Boolean(packaged),version:await app.evaluate(({app})=>app.getVersion()),checks,evidence,pageErrors:errors},null,2));console.log(`Stereographic desktop smoke passed: ${checks.length} checks. Artifacts: ${folder}`);
  }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,evidence,pageErrors:errors},null,2));console.error('Artifacts:',folder);console.error(await page.locator('body').innerText().catch(()=>''));throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
