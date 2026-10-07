const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const THREE=require('three');
const root=path.resolve(__dirname,'..'),artifacts=path.join(root,'artifacts');
const runRoot=path.join(artifacts,'workspace-ui-smoke-'+randomUUID()),profile=path.join(runRoot,'profile');
const packaged=process.env.POLYTOPE_TEST_EXECUTABLE;
const checks=[],errors=[];let saveNumber=0;

function geometry(model){return Object.fromEntries(['dimension','embeddingDimension','vertices','edges','faces','cells'].map(key=>[key,model[key]]));}
function active(project){const document=project.documents[project.active];return document.states[document.cursor];}
function rotated(point,angles){
  const p=[...point],planes=[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
  planes.forEach(([a,b],i)=>{if(b>=p.length)return;const radians=(angles[i]||0)*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians),x=p[a],y=p[b];p[a]=c*x-s*y;p[b]=s*x+c*y;});
  return p;
}

function assertCameraFit(state,aspect){
  const pose=state.view.camera;assert.ok(pose?.position?.every(Number.isFinite));assert.ok(pose?.target?.every(Number.isFinite));
  const halfHeight=pose.orthographicHalfHeight;
  if(pose.projection==='orthographic')assert.ok(Number.isFinite(halfHeight)&&halfHeight>0);
  const camera=pose.projection==='orthographic'
    ?new THREE.OrthographicCamera(-halfHeight*aspect,halfHeight*aspect,halfHeight,-halfHeight,0.01,1000)
    :new THREE.PerspectiveCamera(38,aspect,0.01,1000);
  camera.zoom=pose.zoom||1;camera.updateProjectionMatrix();
  camera.position.fromArray(pose.position);camera.up.fromArray(pose.up||[0,1,0]);camera.lookAt(new THREE.Vector3(...pose.target));camera.updateMatrixWorld(true);
  const points=state.model.vertices,d=state.model.embeddingDimension||state.model.dimension;
  const center=Array.from({length:d},(_,i)=>points.reduce((sum,p)=>sum+p[i],0)/points.length);
  const radius=Math.max(...points.map(p=>Math.hypot(...p.map((x,i)=>x-center[i]))));
  const ndc=points.map(p=>new THREE.Vector3(...rotated(p.map((x,i)=>(x-center[i])/radius),state.view.angles).slice(0,3)).project(camera));
  assert.ok(ndc.every(p=>Math.abs(p.x)<0.98&&Math.abs(p.y)<0.98&&p.z>=-1&&p.z<=1),'Fit must contain every source vertex within the camera frustum');
  return {maximumX:Math.max(...ndc.map(p=>Math.abs(p.x))),maximumY:Math.max(...ndc.map(p=>Math.abs(p.y)))};
}

async function main(){
  const started=performance.now();
  await fs.mkdir(profile,{recursive:true});await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  if(packaged)env.POLYTOPE_PYTHON=path.join(runRoot,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  try{
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>!window.isDestroyed()).setContentSize(1484,900));
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    await page.waitForFunction(()=>document.getElementById('base-canvas').querySelector('canvas'));
    const snapshot=async label=>{
      // Numeric edits now await the native expression batch. Observe their
      // publication before asserting the resulting saved workspace settings.
      await page.waitForFunction(()=>document.getElementById('cancel').hidden);
      const target=path.join(runRoot,`${String(++saveNumber).padStart(2,'0')}-${label}.polyproj`);
      await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},target);
      await page.evaluate(()=>{document.getElementById('status').textContent='';});await page.locator('#save').click();
      await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Saved '));
      return {path:target,project:JSON.parse(await fs.readFile(target,'utf8'))};
    };
    const metrics=async()=>page.evaluate(()=>{
      const region=document.getElementById('base-canvas'),rect=region.getBoundingClientRect(),canvas=region.querySelector('canvas');
      return {width:innerWidth,height:innerHeight,base:{width:rect.width,height:rect.height,area:rect.width*rect.height},
              pixels:{width:canvas.width,height:canvas.height},headerText:document.querySelector('header').innerText,
              overflow:document.documentElement.scrollWidth>innerWidth};
    });
    const initial=await metrics();assert.equal(initial.width,1484);assert.equal(initial.height,900);
    assert.ok(initial.base.area/(initial.width*initial.height)>0.45,'Geometry must occupy a substantial fraction of the default workspace');
    assert.ok(initial.base.height>500,'Default geometry viewport should not be a short strip');assert.equal(initial.overflow,false);
    assert.doesNotMatch(initial.headerText,/POLYTOPE\s+LABORATORY/i,'Header should focus on work rather than product branding');
    assert.equal(await page.locator('#toggle-inspector').getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('#viewport-layout').inputValue(),'single');assert.equal(await page.locator('#derived-canvas').isVisible(),false);
    for(const id of ['surface-settings','rotation-settings','animation-settings','history-settings'])assert.equal(await page.locator('#'+id).evaluate(node=>node.open),false);
    for(const id of ['surface-settings','rotation-settings','animation-settings','history-settings']){
      await page.locator('#'+id+' summary').click();assert.equal(await page.locator('#'+id+' .settings-body').isVisible(),true);
      await page.locator('#'+id+' summary').click();assert.equal(await page.locator('#'+id+' .settings-body').isVisible(),false);
    }
    checks.push('large geometry workspace at 1484 by 900 with restrained header and collapsed advanced controls');
    await page.locator('#toggle-library').click();const expanded=await metrics();assert.ok(expanded.base.width>initial.base.width+100);
    await page.locator('#toggle-inspector').click();assert.equal(await page.locator('#toggle-inspector').getAttribute('aria-pressed'),'true');
    assert.ok((await metrics()).base.width<expanded.base.width-100);
    await page.locator('#toggle-inspector').click();await page.locator('#toggle-library').click();
    await page.locator('#viewport-layout').selectOption('split');await page.waitForFunction(()=>document.getElementById('derived-canvas').getBoundingClientRect().width>100);
    assert.equal(await page.locator('#derived-canvas').isVisible(),true);
    const splitWidth=(await metrics()).base.width;assert.ok(splitWidth<initial.base.width*0.8);
    await page.locator('#viewport-layout').selectOption('single');
    checks.push('collapsible library/inspector and usable single/comparison geometry layouts');
    await page.locator('#rotation-settings summary').click();
    const xw=await page.locator('#auto-rotation-plane').evaluate(select=>Array.from(select.options).find(option=>option.textContent.toUpperCase().includes('XW'))?.value);
    assert.ok(xw!==undefined,'4D spin should offer an XW rotation plane');await page.locator('#auto-rotation-plane').selectOption(xw);
    await page.locator('#auto-rotation-speed').evaluate(input=>{input.value='24';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.locator('#rotation-settings summary').click();
    await page.locator('#fit-view').click();
    const tesseractBefore=active((await snapshot('tesseract-before')).project);
    assert.equal(tesseractBefore.view.rotationPlane,2);assert.equal(tesseractBefore.view.rotationSpeed,24);
    const tesseractSize=await metrics(),tesseractFrustum=assertCameraFit(tesseractBefore,tesseractSize.base.width/tesseractSize.base.height);
    await page.locator('#auto-rotate').click();assert.equal(await page.locator('#auto-rotate').getAttribute('aria-pressed'),'true');
    await page.waitForTimeout(300);const tesseractSpinning=active((await snapshot('tesseract-spinning')).project);
    assert.notDeepEqual(tesseractSpinning.view.angles,tesseractBefore.view.angles);
    assert.notEqual(tesseractSpinning.view.angles[2],tesseractBefore.view.angles[2]);
    [0,1,3,4,5].forEach(index=>assert.equal(tesseractSpinning.view.angles[index],tesseractBefore.view.angles[index],'Selected-plane spin must not alter unrelated rotation planes'));
    assert.deepEqual(geometry(tesseractSpinning.model),geometry(tesseractBefore.model));
    await page.locator('#auto-rotate').click();assert.equal(await page.locator('#auto-rotate').getAttribute('aria-pressed'),'false');
    const stopped=active((await snapshot('tesseract-stopped')).project);await page.waitForTimeout(250);
    const still=active((await snapshot('tesseract-still')).project);assert.deepEqual(still.view.angles,stopped.view.angles);
    const canvas=await page.locator('#base-canvas canvas').boundingBox();
    await page.keyboard.down('Shift');await page.mouse.move(canvas.x+canvas.width*.45,canvas.y+canvas.height*.45);
    await page.mouse.down();await page.mouse.move(canvas.x+canvas.width*.45+60,canvas.y+canvas.height*.45+30,{steps:8});await page.mouse.up();await page.keyboard.up('Shift');
    const dragged=active((await snapshot('tesseract-four-dimensional-drag')).project);
    assert.notEqual(dragged.view.angles[2],still.view.angles[2]);assert.notEqual(dragged.view.angles[4],still.view.angles[4]);
    [0,1,3,5].forEach(index=>assert.equal(dragged.view.angles[index],still.view.angles[index]));
    assert.deepEqual(geometry(dragged.model),geometry(still.model));
    assert.deepEqual(dragged.view.camera,still.view.camera,'4D dragging should preserve the observer camera');
    await page.waitForFunction(()=>document.getElementById('cancel').hidden);
    await page.screenshot({path:path.join(artifacts,packaged?'workspace-ui-tesseract-packaged.png':'workspace-ui-tesseract.png')});
    checks.push('visible 4D automatic rotation changes display angles, preserves source incidence and stops');
    checks.push('direct Shift-drag rotates XW/YW while preserving source geometry and the 3D observer');
    await page.locator('[data-key="cube"]').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');
    const cubeBefore=active((await snapshot('cube-before')).project);
    assert.equal(await page.locator('#auto-rotate').isVisible(),true);assert.equal(await page.locator('#auto-rotate').isEnabled(),true);
    await page.locator('#auto-rotate').click();await page.waitForTimeout(300);const cubeSpinning=active((await snapshot('cube-spinning')).project);
    assert.notDeepEqual(cubeSpinning.view.angles,cubeBefore.view.angles);assert.deepEqual(geometry(cubeSpinning.model),geometry(cubeBefore.model));
    await page.locator('#auto-rotate').click();checks.push('visible 3D automatic rotation is useful without enabling a 4D-only panel');
    for(const style of ['wireframe','translucent','solid'])await page.locator('#render-style').selectOption(style);
    await page.locator('#camera-projection').selectOption('orthographic');await page.locator('#view-orientation').selectOption('x');await page.locator('#fit-view').click();
    const axis=active((await snapshot('cube-axis-orthographic')).project);
    assert.equal(axis.view.camera.projection,'orthographic');
    const position=axis.view.camera.position.map((value,i)=>value-axis.view.camera.target[i]);
    assert.ok(Math.abs(position[0])>Math.abs(position[1])*10&&Math.abs(position[0])>Math.abs(position[2])*10,'X orientation should place the camera on the viewport X axis');
    const axisSize=await metrics(),orthographicFrustum=assertCameraFit(axis,axisSize.base.width/axisSize.base.height);
    await page.locator('#camera-projection').selectOption('perspective');await page.locator('#view-orientation').selectOption('isometric');await page.locator('#fit-view').click();
    const fitted=await snapshot('cube-fitted-perspective'),fitState=active(fitted.project),size=await metrics();
    assert.equal(fitState.view.camera.projection,'perspective');
    const frustum=assertCameraFit(fitState,size.base.width/size.base.height);
    assert.deepEqual(geometry(fitState.model),geometry(cubeBefore.model));
    await page.locator('#viewport-layout').selectOption('split');await page.locator('#camera-projection').selectOption('orthographic');await page.locator('#render-style').selectOption('wireframe');
    const saved=await snapshot('cube-display-persistence');
    await page.locator('#viewport-layout').selectOption('single');await page.locator('#camera-projection').selectOption('perspective');await page.locator('#render-style').selectOption('solid');
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},saved.path);
    await page.locator('#open').click();await page.waitForFunction(()=>document.getElementById('camera-projection').value==='orthographic'&&document.getElementById('viewport-layout').value==='split');
    assert.equal(await page.locator('#render-style').inputValue(),'wireframe');
    const restored=active((await snapshot('cube-restored')).project);
    assert.deepEqual(geometry(restored.model),geometry(active(saved.project).model));assert.deepEqual(restored.view.camera,active(saved.project).view.camera);
    assert.equal(restored.view.viewportLayout,'split');assert.equal(restored.view.cameraProjection,'orthographic');assert.equal(restored.view.presentation,'wireframe');
    checks.push('real camera projection/orientation, independently checked fit, source preservation and native project display round-trip');
    await page.locator('#viewport-layout').selectOption('single');await page.locator('#render-style').selectOption('solid');await page.locator('#fit-view').click();
    await page.waitForFunction(()=>document.getElementById('cancel').hidden);
    await page.screenshot({path:path.join(artifacts,packaged?'workspace-ui-cube-packaged.png':'workspace-ui-cube.png')});
    await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();assert.equal(await page.locator('#make-dual').isVisible(),true);await page.locator('#toggle-inspector').click();
    checks.push('mathematical construction tools remain accessible in the hidden-by-default inspector');
    assert.deepEqual(errors,[]);
    const result={passed:true,packaged:Boolean(packaged),developmentPythonUnavailable:Boolean(packaged),seconds:(performance.now()-started)/1000,checks,pageErrors:errors,fixtureDirectory:runRoot,initialViewport:initial,cameraFit:{perspective:frustum,orthographic:orthographicFrustum,tesseract:tesseractFrustum}};
    await fs.writeFile(path.join(artifacts,packaged?'workspace-ui-packaged-smoke.json':'workspace-ui-smoke.json'),JSON.stringify(result,null,2));
    console.log(`Workspace UI smoke passed: ${checks.length} checks.`);
  }catch(error){
    await page.screenshot({path:path.join(runRoot,'failure.png')}).catch(()=>{});
    await fs.writeFile(path.join(runRoot,'failure.json'),JSON.stringify({passed:false,error:error.stack,pageErrors:errors,completedChecks:checks},null,2));throw error;
  }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
