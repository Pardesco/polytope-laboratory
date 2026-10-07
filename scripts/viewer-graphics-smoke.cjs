const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const THREE=require('three');
const root=path.resolve(__dirname,'..');
const artifacts=process.env.POLYTOPE_TEST_ARTIFACTS?path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS):path.join(root,'artifacts','viewport-redesign');
const executable=process.env.POLYTOPE_TEST_EXECUTABLE;
const profile=path.join(artifacts,executable?'graphics-packaged-profile':'graphics-desktop-profile');
const active=project=>{const document=project.documents[project.active];return document.states[document.cursor];};
const sameGeometry=(a,b)=>assert.deepEqual(Object.fromEntries(['vertices','edges','faces','cells'].map(k=>[k,a[k]])),Object.fromEntries(['vertices','edges','faces','cells'].map(k=>[k,b[k]])));

async function main(){
  await fs.mkdir(profile,{recursive:true});await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  if(executable)env.POLYTOPE_PYTHON='C:\\unavailable-development-python.exe';
  const app=await electron.launch({executablePath:executable||require('electron'),args:executable?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(25000);const errors=[],checks=[],evidence=[];
  page.on('pageerror',error=>errors.push(error.message));
  const snapshotFile=path.join(artifacts,'graphics-snapshot.polyproj');
  const reportFile=path.join(artifacts,executable?'graphics-packaged-smoke.json':'graphics-desktop-smoke.json');
  const wait=async()=>{await page.waitForFunction(()=>document.getElementById('cancel').hidden);await page.evaluate(async()=>{for(let i=0;i<6;i++)await new Promise(requestAnimationFrame);});};
  const save=async()=>{
    await wait();await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},snapshotFile);
    await page.evaluate(()=>document.getElementById('status').textContent='');await page.locator('#save').click();
    await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,snapshotFile);
    return JSON.parse(await fs.readFile(snapshotFile,'utf8'));
  };
  const open=async(file,name)=>{
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
    await page.evaluate(()=>document.getElementById('status').textContent='');await page.locator('#open').click();
    await page.waitForFunction(file=>document.getElementById('status').textContent==='Opened '+file,file);
    await page.waitForFunction(name=>document.getElementById('model-name').textContent===name,name);await wait();
  };
  const scanEdges=async(label)=>{
    await wait();const value=await page.evaluate(()=>{
      const source=document.querySelector('#base-canvas canvas'),canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
      const context=canvas.getContext('2d');context.drawImage(source,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data,rows=[];
      for(let y=0;y<canvas.height;y++){let low=canvas.width,high=-1;for(let x=0;x<canvas.width;x++){const i=(y*canvas.width+x)*4;if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>65){low=Math.min(low,x);high=Math.max(high,x);}}if(high>=low)rows.push({y,width:high-low+1});}
      const groups=[];for(const row of rows){let group=groups.at(-1);if(!group||row.y>group.last+1){group={first:row.y,last:row.y,width:0};groups.push(group);}group.last=row.y;group.width=Math.max(group.width,row.width);}
      return {width:canvas.width,height:canvas.height,groups};
    });evidence.push({label,...value});assert.equal(value.groups.length,2,`${label}: expected two rendered parallel edge rows`);return value.groups.map(row=>row.width);
  };
  try{
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');await wait();
    assert.equal(await page.locator('#camera-projection').inputValue(),'orthographic');
    const edgeModel={name:'Parallel edge camera fixture',dimension:3,embeddingDimension:3,interpretation:'generalized-complex',vertices:[[-1,-.4,-1],[1,-.4,-1],[-1,.4,1],[1,.4,1]],edges:[[0,1],[2,3]],faces:[],cells:[]};
    const fixture=path.join(artifacts,'parallel-camera.polyproj');
    const project={format:'polytope-laboratory',version:1,active:0,documents:[{id:'camera-fixture',cursor:0,states:[{model:edgeModel,view:{viewportLayout:'single',cameraProjection:'orthographic',faces:false,edges:true,vertices:false,presentation:'wireframe'},label:'Camera fixture',notes:''}]}]};
    await fs.writeFile(fixture,JSON.stringify(project));await open(fixture,edgeModel.name);await page.locator('#view-orientation').selectOption('z');
    const parallel=await scanEdges('orthographic equal edges');assert.ok(Math.abs(parallel[0]-parallel[1])<=2);checks.push('GPU orthographic observation preserves equal parallel edge lengths at different depths');
    await page.locator('#camera-projection').selectOption('perspective');await page.locator('#fit-view').click();
    const perspective=await scanEdges('perspective equal edges');assert.ok(Math.max(...perspective)/Math.min(...perspective)>1.12);checks.push('GPU perspective observation gives the expected depth-dependent edge lengths');
    await page.locator('#camera-projection').selectOption('orthographic');
    for(const [axis,direction] of [['x',[1,0,0]],['y',[0,1,0]],['z',[0,0,1]],['isometric',[1,1,1]]]){
      await page.locator('#view-orientation').selectOption(axis);const state=active(await save()),position=state.view.camera.position.map((x,i)=>x-state.view.camera.target[i]);
      const unit=new THREE.Vector3(...position).normalize(),expected=new THREE.Vector3(...direction).normalize();assert.ok(unit.distanceTo(expected)<1e-8);
      assert.equal(state.view.camera.projection,'orthographic');sameGeometry(state.model,edgeModel);
    }
    checks.push('canonical X Y Z and isometric cameras persist directions without source changes');
    await page.locator('#view-orientation').selectOption('z');const canvas=page.locator('#base-canvas canvas'),box=await canvas.boundingBox();
    await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.wheel(0,-180);await wait();
    const zoomed=active(await save());assert.ok(zoomed.view.camera.zoom>1);const zoomedEdges=await scanEdges('orthographic zoom');
    await page.locator('[data-key="cube"]').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');
    await open(snapshotFile,edgeModel.name);const restored=active(await save());assert.deepEqual(restored.view.camera,zoomed.view.camera);assert.deepEqual(await scanEdges('restored orthographic zoom'),zoomedEdges);sameGeometry(restored.model,edgeModel);
    checks.push('orthographic camera zoom and frustum restore through native project reload');
    const legacy=structuredClone(project);legacy.documents[0].states[0].view.camera={position:[0,0,4],target:[0,0,0]};
    const legacyFile=path.join(artifacts,'legacy-camera.polyproj');await fs.writeFile(legacyFile,JSON.stringify(legacy));await open(legacyFile,edgeModel.name);
    const legacyState=active(await save());assert.deepEqual(legacyState.view.camera.position,[0,0,4]);assert.deepEqual(legacyState.view.camera.target,[0,0,0]);
    assert.equal(await page.locator('#camera-projection').inputValue(),'orthographic');checks.push('legacy camera position and target restore without new optional fields');
    await page.locator('[data-key="cube"]').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');await wait();
    await page.locator('#render-style').selectOption('solid');await page.locator('#view-orientation').selectOption('isometric');
    const cubeState=active(await save()),source=cubeState.model,view=cubeState.view.camera;
    const width=await canvas.evaluate(el=>el.width),height=await canvas.evaluate(el=>el.height),camera=new THREE.OrthographicCamera(-view.orthographicHalfHeight*width/height,view.orthographicHalfHeight*width/height,view.orthographicHalfHeight,-view.orthographicHalfHeight,.01,1000);
    camera.position.fromArray(view.position);camera.up.fromArray(view.up);camera.zoom=view.zoom;camera.lookAt(new THREE.Vector3(...view.target));camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const center=[0,1,2].map(i=>source.vertices.reduce((s,p)=>s+p[i],0)/source.vertices.length),radius=Math.max(...source.vertices.map(p=>Math.hypot(...p.map((x,i)=>x-center[i]))));
    const normalized=source.vertices.map(p=>p.map((x,i)=>(x-center[i])/radius)),direction=new THREE.Vector3(...view.position).sub(new THREE.Vector3(...view.target)).normalize();
    const centroids=source.faces.map(face=>[0,1,2].map(i=>face.reduce((sum,v)=>sum+normalized[v][i],0)/face.length)).filter(p=>new THREE.Vector3(...p).dot(direction)>.1);
    const samples=centroids.map(p=>{const q=new THREE.Vector3(...p).project(camera);return [Math.round((q.x+1)*width/2),Math.round((1-q.y)*height/2)];});
    const colors=await page.evaluate(samples=>{const source=document.querySelector('#base-canvas canvas'),canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;const context=canvas.getContext('2d');context.drawImage(source,0,0);return samples.map(([x,y])=>Array.from(context.getImageData(x,y,1,1).data));},samples);
    const brightness=colors.map(p=>p.slice(0,3).reduce((s,x)=>s+x,0)/3);assert.equal(brightness.length,3);assert.ok(Math.max(...brightness)-Math.min(...brightness)>10,`Lit cube faces lacked separation: ${JSON.stringify(colors)}`);
    assert.equal(cubeState.view.vertices,false);evidence.push({label:'lit cube face centroids',samples,colors});checks.push('matte lit cube has visibly distinct face shading with points disabled');
    await page.screenshot({path:path.join(artifacts,'workspace-matte-cube.png')});
    // Each edge shared by two faces pointing away from the camera is hidden by
    // the cube's opaque boundary. Sample its interior projection and neighbors.
    const faceCenters=source.faces.map(face=>[0,1,2].map(i=>face.reduce((sum,v)=>sum+normalized[v][i],0)/face.length));
    const hidden=source.edges.filter(([a,b])=>{const adjacent=source.faces.flatMap((face,i)=>face.includes(a)&&face.includes(b)?[i]:[]);return adjacent.length===2&&adjacent.every(i=>new THREE.Vector3(...faceCenters[i]).dot(direction)<-.1);});
    const hiddenSamples=hidden.map(([a,b])=>{const aa=new THREE.Vector3(...normalized[a]).project(camera),bb=new THREE.Vector3(...normalized[b]).project(camera),dx=(bb.x-aa.x)*width/2,dy=-(bb.y-aa.y)*height/2,length=Math.hypot(dx,dy);return {x:(aa.x+bb.x+2)*width/4,y:(2-aa.y-bb.y)*height/4,nx:-dy/length,ny:dx/length};});
    const contrasts=async()=>{await wait();return page.evaluate(samples=>{const source=document.querySelector('#base-canvas canvas'),canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;const context=canvas.getContext('2d');context.drawImage(source,0,0);return samples.map(({x,y,nx,ny})=>{const color=offset=>Array.from(context.getImageData(Math.round(x+nx*offset),Math.round(y+ny*offset),1,1).data).slice(0,3),sideA=color(-4),sideB=color(4),baseline=sideA.map((v,i)=>(v+sideB[i])/2);return Math.max(...[-1,0,1].flatMap(offset=>color(offset).map((v,i)=>Math.abs(v-baseline[i]))));});},hiddenSamples);};
    assert.equal(hidden.length,3);const solidContrast=await contrasts();assert.ok(Math.max(...solidContrast)<4,`Opaque hidden edges leaked: ${solidContrast}`);
    await page.locator('#render-style').selectOption('translucent');const translucentContrast=await contrasts();assert.ok(Math.max(...translucentContrast)>8,`Translucent hidden edges were absent: ${translucentContrast}`);
    evidence.push({label:'hidden back-edge pixel contrasts',solidContrast,translucentContrast});checks.push('opaque solid depth hides rear edges while translucent geometry reveals them');
    await page.screenshot({path:path.join(artifacts,'workspace-translucent-cube.png')});
    await page.locator('#render-style').selectOption('wireframe');await wait();await page.screenshot({path:path.join(artifacts,'workspace-crisp-wireframe.png')});
    const wire=active(await save());sameGeometry(wire.model,source);assert.equal(wire.view.faces,false);assert.equal(wire.view.vertices,false);assert.equal(wire.view.edges,true);checks.push('wireframe preset retains source topology and removes surface and point clutter');
    assert.deepEqual(errors,[]);await fs.writeFile(reportFile,JSON.stringify({passed:true,packaged:Boolean(executable),version:await app.evaluate(({app})=>app.getVersion()),checks,evidence,pageErrors:errors},null,2)+'\n');
    console.log(`Graphics smoke passed: ${checks.length} checks, no renderer errors.`);
  }catch(error){await fs.writeFile(reportFile,JSON.stringify({passed:false,checks,evidence,pageErrors:errors,error:error.stack},null,2)+'\n');await page.screenshot({path:path.join(artifacts,'graphics-failure.png')}).catch(()=>{});throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
