// Real Construct controls and native saves; literal cycles and independent GPU samples.
const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const THREE=require('three');
const root=path.resolve(__dirname,'..'),artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));
const packaged=process.env.POLYTOPE_TEST_EXECUTABLE;
const document=project=>project.documents[project.active];
const active=project=>{const current=document(project);return current.states[current.cursor];};
const geometry=model=>Object.fromEntries(['dimension','embeddingDimension','vertices','edges','faces','cells'].map(key=>[key,model[key]]));
const counts=model=>['vertices','edges','faces','cells'].map(key=>model[key].length);
function winding(points){let value=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],cross=a[0]*b[1]-a[1]*b[0];if(a[1]<=0&&b[1]>0&&cross>0)value++;else if(b[1]<=0&&a[1]>0&&cross<0)value--;}return value;}

async function main(){
  const started=performance.now();await fs.mkdir(artifacts,{recursive:true});
  const folder=await fs.mkdtemp(path.join(artifacts,packaged?'star-polygon-packaged-smoke-':'star-polygon-smoke-')),profile=path.join(folder,'profile');
  await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;if(packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);const checks=[],errors=[],pixelEvidence=[];let saveNumber=0;
  page.on('pageerror',error=>errors.push(error.message));
  const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
  const disclose=async id=>{if(!await page.locator('#'+id).evaluate(node=>node.open))await page.locator('#'+id+' > summary').click();};
  const fillRule=async value=>{await disclose('surface-settings');await page.locator('#face-fill-rule').selectOption(value);await done();};
  const construct=async()=>{if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();await disclose('star-polygon-settings');};
  const save=async label=>{await done();const file=path.join(folder,`${String(++saveNumber).padStart(2,'0')}-${label}.polyproj`);await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);return {file,project:JSON.parse(await fs.readFile(file,'utf8'))};};
  const open=async file=>{await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#open').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Opened '+file,file);await done();};
  const generate=async(symbol,radius='1')=>{await construct();await page.locator('#star-polygon-symbol').fill(symbol);await page.locator('#star-polygon-radius').fill(radius);const count=await page.locator('#document-tabs > button').count();await page.locator('#generate-star-polygon').click();await page.waitForFunction(count=>document.getElementById('document-tabs').children.length===count+1,count);await done();};
  const replay=async()=>{await disclose('history-settings');const count=await page.locator('#document-tabs > button').count();await page.locator('#history-replay').click();await page.waitForFunction(count=>document.getElementById('document-tabs').children.length===count+1,count);await done();};
  const sample=async(state,label)=>{
    const box=await page.locator('#base-canvas canvas').boundingBox(),pose=state.view.camera,half=pose.orthographicHalfHeight;
    assert.equal(pose.projection,'orthographic');assert.ok(half>0);
    const camera=new THREE.OrthographicCamera(-half*box.width/box.height,half*box.width/box.height,half,-half,.01,1000);
    camera.zoom=pose.zoom||1;camera.position.fromArray(pose.position);camera.up.fromArray(pose.up||[0,1,0]);camera.lookAt(new THREE.Vector3(...pose.target));camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    const source=state.model.vertices,center=[0,1].map(i=>source.reduce((sum,p)=>sum+p[i],0)/source.length),radius=Math.max(...source.map(p=>Math.hypot(...p.map((x,i)=>x-center[i]))));
    const locations=[[0,0],[radius*.65,0],[radius*.6*Math.cos(Math.PI/5),radius*.6*Math.sin(Math.PI/5)]].map(point=>new THREE.Vector3((point[0]-center[0])/radius,(point[1]-center[1])/radius,0).project(camera)).map(p=>[(p.x+1)/2,(1-p.y)/2]);
    const pixels=await page.locator('#base-canvas canvas').evaluate((source,locations)=>{const copy=document.createElement('canvas');copy.width=source.width;copy.height=source.height;const context=copy.getContext('2d');context.drawImage(source,0,0);const brightness=(x,y)=>{const data=context.getImageData(x-2,y-2,5,5).data;let peak=0;for(let i=0;i<data.length;i+=4)peak=Math.max(peak,(data[i]+data[i+1]+data[i+2])/3);return peak;};return {background:brightness(5,5),samples:locations.map(([x,y])=>brightness(Math.round(x*source.width),Math.round(y*source.height))),width:source.width,height:source.height};},locations);
    assert.ok(pixels.width>100&&pixels.height>100);pixelEvidence.push({label,locations,pixels});return pixels;
  };
  try{
    await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract'&&document.getElementById('star-polygon-settings'));await done();
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>!window.isDestroyed()).setContentSize(1484,900));
    const original=(await save('original-tesseract')).project,originalDocument=structuredClone(document(original));
    await generate('5/2','sqrt(4)');const pentagram=await save('radius-two-pentagram'),star=active(pentagram.project).model;
    assert.deepEqual(counts(star),[5,5,1,0]);assert.deepEqual(star.faces,[[0,2,4,1,3]]);assert.deepEqual(star.vertices[0],[2,0]);assert.equal(star.dimension,2);assert.equal(star.interpretation,'generalized-complex');assert.equal(star.metadata.regularStarPolygon.radius,2);assert.equal(star.metadata.regularStarPolygon.symbol,'5/2');
    assert.equal(winding(star.faces[0].map(v=>star.vertices[v])),2);assert.equal(star.numeric.certified,false);assert.equal(star.measure,undefined);assert.equal(star.facetEquations,undefined);
    assert.deepEqual(pentagram.project.documents[original.active].states.map(s=>geometry(s.model)),originalDocument.states.map(s=>geometry(s.model)));
    await open(pentagram.file);assert.deepEqual(geometry(active((await save('pentagram-restored')).project).model),geometry(star));
    checks.push('literal5/2 radius expression constructs a five-edge pentagram without hull substitution; original source and native persistence retained');

    await page.locator('#camera-projection').selectOption('orthographic');await page.locator('#view-orientation').selectOption('z');await page.locator('#fit-view').click();await page.locator('#render-style').selectOption('solid');await fillRule('nonzero');
    const nonzeroState=active((await save('pentagram-nonzero')).project),nonzero=await sample(nonzeroState,'nonzero winding');
    assert.ok(nonzero.samples[0]>nonzero.background+20,'Nonzero winding must fill the pentagram center');assert.ok(nonzero.samples[1]>nonzero.background+20,'A pentagram arm must render');assert.ok(nonzero.samples[2]<nonzero.background+8,'A hull-only gap outside the star must stay empty');
    await fillRule('even-odd');const oddState=active((await save('pentagram-even-odd')).project),odd=await sample(oddState,'even-odd winding');
    assert.deepEqual(geometry(oddState.model),geometry(star));assert.ok(odd.samples[0]<odd.background+8,'Even/odd must keep the winding-two center empty');assert.ok(odd.samples[1]>odd.background+20);assert.ok(odd.samples[2]<odd.background+8);
    await page.screenshot({path:path.join(folder,'pentagram-even-odd-empty-center.png')});
    checks.push('independent camera-projected GPU samples show actual star arms and empty hull gap; nonzero/even-odd center differs without source mutation');

    for(const [symbol,cycle,w] of [['5/3',[0,3,1,4,2],-2],['5/-3',[0,2,4,1,3],2]]){
      await generate(symbol);const result=await save(symbol==='5/3'?'retrograde-pentagram':'signed-pentagram'),model=active(result.project).model;
      assert.deepEqual(model.faces,[cycle]);assert.equal(model.metadata.regularStarPolygon.symbol,symbol);assert.equal(model.metadata.regularStarPolygon.originWindingPerCycle,w);assert.equal(winding(cycle.map(v=>model.vertices[v])),w);
      assert.ok(Math.sign(model.metadata.regularStarPolygon.cycleEvidence[0].signedAlgebraicArea)===Math.sign(w));
      await open(result.file);assert.deepEqual(geometry(active((await save(symbol==='5/3'?'retrograde-restored':'signed-restored')).project).model),geometry(model));
    }
    checks.push('positive retrograde5/3 and signed5/-3 preserve opposite literal cycles, independently measured winding and signed source integrals through native saves');

    await generate('6/2');const compound=await save('literal-hexagram'),hexagram=active(compound.project).model;
    assert.deepEqual(counts(hexagram),[6,6,2,0]);assert.deepEqual(hexagram.faces,[[0,2,4],[1,3,5]]);assert.equal(hexagram.metadata.regularStarPolygon.symbol,'6/2');assert.equal(hexagram.components.length,2);assert.deepEqual(hexagram.components.map(c=>c.maps.vertices),[[0,2,4],[1,3,5]]);
    await open(compound.file);const restored=active((await save('hexagram-restored')).project).model;assert.deepEqual(geometry(restored),geometry(hexagram));assert.deepEqual(restored.components,hexagram.components);
    await page.screenshot({path:path.join(folder,'two-source-triangle-hexagram.png')});await construct();const selected=hexagram.components[1].id,remaining=hexagram.components[0].id;
    await page.locator('#compound-component').selectOption(selected);await page.locator('#compound-extract').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent!=='Regular polygon 6/2');await done();
    const kept=active((await save('kept-rotated-triangle')).project).model;assert.deepEqual(counts(kept),[3,3,1,0]);assert.deepEqual(kept.vertices,[1,3,5].map(v=>hexagram.vertices[v]));assert.deepEqual(kept.faces,[[0,1,2]]);
    assert.equal(kept.provenance.originalSourceModelId,hexagram.components[1].sourceModelId);assert.equal(kept.metadata.regularStarPolygon.angularPhaseTurns.numerator,1);
    await page.locator('#undo').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Regular polygon 6/2');await done();await page.locator('#compound-component').selectOption(selected);await page.locator('#compound-drop').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent.includes('remove'));await done();
    const dropped=await save('deleted-rotated-triangle'),dropModel=active(dropped.project).model;assert.deepEqual(counts(dropModel),[3,3,1,0]);assert.deepEqual(dropModel.vertices,[0,2,4].map(v=>hexagram.vertices[v]));assert.equal(dropModel.components[0].id,remaining);assert.equal(await page.locator('#compound-drop').isEnabled(),false);
    assert.deepEqual(dropModel.metadata.compoundComponentEditing.sourceMaps.vertices,[0,null,1,null,2,null]);await replay();assert.deepEqual(geometry(active((await save('component-drop-replayed')).project).model),geometry(dropModel));
    await open(dropped.file);assert.deepEqual(active((await save('component-drop-restored')).project).model.components,dropModel.components);
    checks.push('unreduced6/2 stays two disconnected source triangles; phase-preserving Keep/Delete, leaf IDs/maps, undo/replay and native persistence work');

    await construct();const before=(await save('before-digon-refusal')).project;await page.locator('#star-polygon-symbol').fill('6/3');await page.locator('#star-polygon-radius').fill('1');await page.locator('#generate-star-polygon').click();
    await page.waitForFunction(()=>!document.getElementById('toast').hidden&&document.getElementById('toast').textContent.includes('digon')&&document.getElementById('cancel').hidden);const refused=(await save('digon-refused')).project;
    assert.equal(refused.documents.length,before.documents.length);assert.deepEqual(geometry(active(refused).model),geometry(active(before).model));assert.deepEqual(document(refused).operationHistory,document(before).operationHistory);
    await generate('5/2');assert.deepEqual(counts(active((await save('valid-after-digon')).project).model),[5,5,1,0]);assert.deepEqual(errors,[]);
    checks.push('half-turn digon refusal leaves source/history/document count intact; a subsequent valid literal polygon succeeds');
    const result={passed:true,packaged:Boolean(packaged),developmentPythonUnavailable:Boolean(packaged),version:await app.evaluate(({app})=>app.getVersion()),seconds:(performance.now()-started)/1000,checks,pageErrors:errors,pixelEvidence,nativeSnapshots:saveNumber,fixtureDirectory:folder};
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));console.log(`Star polygon ${packaged?'packaged ':''}smoke passed: ${checks.length} checks. Artifacts: ${folder}`);
  }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors,pixelEvidence},null,2));console.error('Artifacts:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
