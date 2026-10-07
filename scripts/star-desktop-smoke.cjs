const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),artifacts=process.env.POLYTOPE_TEST_ARTIFACTS?path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS):path.join(root,'artifacts');
const packaged=process.env.POLYTOPE_TEST_EXECUTABLE;
const profile=path.join(artifacts,packaged?'star-packaged-profile':'star-desktop-profile');
const geometry=model=>Object.fromEntries(['dimension','embeddingDimension','vertices','edges','faces','cells'].map(k=>[k,model[k]]));

async function main(){
  await fs.mkdir(profile,{recursive:true});
  await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  if(packaged)env.POLYTOPE_PYTHON='C:\\unavailable-development-python.exe';
  const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(25000);
  const errors=[],checks=[],images=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error('Renderer:',e.message);});
  const reportFile=path.join(artifacts,packaged?'star-packaged-smoke.json':'star-desktop-smoke.json');
  const snapshotFile=path.join(artifacts,packaged?'star-packaged-snapshot.polyproj':'star-desktop-snapshot.polyproj');
  const triangleCount=async()=>Number(await page.locator('#view-diagnostic').getAttribute('data-triangles'));
  const screenshot=async filename=>{
    await page.locator('#model-name').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(artifacts,filename)});
  };
  const canvasEvidence=async(label,selector='#base-canvas canvas')=>{
    const evidence=await page.evaluate(async({selector,label})=>{
      for(let i=0;i<4;i++)await new Promise(resolve=>requestAnimationFrame(resolve));
      const source=document.querySelector(selector);if(!source)throw Error('No rendered canvas.');
      const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
      const context=canvas.getContext('2d');context.drawImage(source,0,0);
      const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
      const previous=window.__starSmokePixels?.[selector];let changedPixels=0,nonBackgroundPixels=0;
      const corner=Array.from(pixels.slice(0,3));
      for(let i=0;i<pixels.length;i+=4){
        if(pixels[i]!==corner[0]||pixels[i+1]!==corner[1]||pixels[i+2]!==corner[2])nonBackgroundPixels++;
        if(previous&&previous.length===pixels.length&&(pixels[i]!==previous[i]||pixels[i+1]!==previous[i+1]||pixels[i+2]!==previous[i+2]))changedPixels++;
      }
      (window.__starSmokePixels||={})[selector]=pixels;
      return {label,width:canvas.width,height:canvas.height,nonBackgroundPixels,changedPixels};
    },{selector,label});
    images.push(evidence);return evidence;
  };
  const saveSnapshot=async()=>{
    await page.waitForFunction(()=>document.getElementById('cancel').hidden);
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},snapshotFile);
    await page.evaluate(()=>{document.getElementById('status').textContent='';});
    await page.locator('#save').click();
    await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,snapshotFile);
    return JSON.parse(await fs.readFile(snapshotFile,'utf8'));
  };
  const activeState=project=>{const doc=project.documents[project.active];return doc.states[doc.cursor];};
  const openFile=async(file,name)=>{
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
    await page.evaluate(()=>{document.getElementById('status').textContent='';});
    await page.locator('#open').click();
    await page.waitForFunction(name=>document.getElementById('model-name').textContent===name,name);
    await page.waitForFunction(()=>document.getElementById('cancel').hidden);
  };
  const appearance=async()=>{
    if(await page.locator('#surface-settings').count())await page.locator('#surface-settings').evaluate(el=>{el.open=true;});
  };
  const compare=async()=>{
    await page.keyboard.press('Escape');
    if(await page.locator('#viewport-layout').count())await page.locator('#viewport-layout').selectOption('split');
  };
  const fillRule=async value=>{await appearance();await page.locator('#face-fill-rule').selectOption(value);};
  const surfaceColors=async value=>{await appearance();await page.locator('#surface-colors').selectOption(value);};
  try{
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    await page.waitForFunction(()=>document.getElementById('derived-status').textContent.includes('8 vertices'));
    await appearance();
    const keys=['small-stellated-dodecahedron','great-dodecahedron','great-stellated-dodecahedron','great-icosahedron'];
    for(const key of keys){
      await page.locator(`[data-key="${key}"]`).click();
      const name=key.replaceAll('-',' ').replace(/^./,c=>c.toUpperCase());
      await page.waitForFunction(name=>document.getElementById('model-name').textContent===name,name);
      await page.waitForFunction(()=>document.getElementById('cancel').hidden);
      await appearance();
      assert.ok(await triangleCount()>0,`${key} did not acquire filled faces`);
      assert.equal(await page.locator('#face-fill-rule').inputValue(),'nonzero');
      assert.match(await page.locator('#view-diagnostic').getAttribute('title'),/Source face surface fill.*no solid interior/);
      const filled=await canvasEvidence(key+' filled');assert.ok(filled.nonBackgroundPixels>500);
      await page.locator('#faces-visible').uncheck();
      const wire=await canvasEvidence(key+' wireframe');assert.ok(wire.changedPixels>100,`${key} surface visibility had no rendered effect`);
      await page.locator('#faces-visible').check();
      await canvasEvidence(key+' filled restored');
      if(key==='small-stellated-dodecahedron'){
        const nonzeroTriangles=await triangleCount();
        await fillRule('even-odd');
        await page.waitForFunction(()=>document.getElementById('cancel').hidden);
        const parity=await canvasEvidence(key+' even odd');assert.ok(parity.changedPixels>100);
        assert.notEqual(await triangleCount(),nonzeroTriangles);
        await screenshot('workspace-star-even-odd.png');
        await fillRule('nonzero');
        await page.waitForFunction(()=>document.getElementById('cancel').hidden);
        await compare();
        await page.locator('#derived-mode').selectOption('section');
        await page.locator('#section-normal').fill('1, 2, 3');await page.locator('#section-depth').fill('0.13');await page.locator('#apply-section').click();
        await page.waitForFunction(()=>document.getElementById('derived-status').textContent.includes('Surface intersection'));
        await fillRule('even-odd');
        await page.waitForFunction(()=>document.getElementById('derived-status').textContent.includes('even-odd face fill'));
        const derived=await canvasEvidence('Named star surface intersection','#derived-canvas canvas');assert.ok(derived.nonBackgroundPixels>30);
        await screenshot('workspace-star-surface-section.png');
        checks.push('named star winding rule visibly changes GPU surfaces','named star generalized slice uses chosen fill rule');
        await page.locator('#promote').click();
        await page.waitForFunction(name=>document.getElementById('model-name').textContent===name,'Surface intersection of '+name);
        assert.equal(await page.locator('#derived-mode').inputValue(),'section-evidence');
        await page.waitForFunction(()=>document.getElementById('derived-status').textContent==='Source surface intersection evidence');
        assert.match(await page.locator('#net-preview').innerText(),/without assigning a solid interior/);
        const curve=activeState(await saveSnapshot());
        assert.equal(curve.model.interpretation,'surface-section');assert.equal(curve.model.faces.length,0);
        assert.equal(curve.view.derivedMode,'section-evidence');assert.equal(curve.model.metadata.sourceReferences.length,curve.model.vertices.length);
        assert.ok(curve.model.metadata.edgeSourceReferences.length);
        checks.push('promoted source curves default to supported section evidence with retained references');
      }
      checks.push(key+' filled surfaces and wireframe toggle');
    }

    // A planar source face gives a coplanar section with winding semantics.
    const pentagramPoints=Array.from({length:5},(_,i)=>[Math.cos(i*2*Math.PI/5),Math.sin(i*2*Math.PI/5),0]);
    const cycle=[0,2,4,1,3],pentagramName='Star surface pentagram fixture';
    const pentagramFile=path.join(artifacts,pentagramName+'.off');
    await fs.writeFile(pentagramFile,['OFF','5 1 5',...pentagramPoints.map(p=>p.join(' ')),[5,...cycle].join(' ')].join('\n')+'\n');
    await openFile(pentagramFile,pentagramName);
    await appearance();await compare();
    const before=activeState(await saveSnapshot()).model;
    assert.deepEqual(before.faces,[cycle]);
    await fillRule('even-odd');
    await compare();
    await page.locator('#derived-mode').selectOption('section');
    await page.locator('#section-normal').fill('0, 0, 1');await page.locator('#section-depth').fill('0');await page.locator('#apply-section').click();
    await page.waitForFunction(()=>document.getElementById('derived-status').textContent.includes('Surface intersection'));
    await page.waitForFunction(()=>!document.getElementById('promote').disabled);
    await page.locator('#promote').click();
    const promotedName='Surface intersection of '+pentagramName;
    await page.waitForFunction(name=>document.getElementById('model-name').textContent===name,promotedName);
    assert.equal(await page.locator('#face-fill-rule').inputValue(),'even-odd');
    assert.equal(await page.locator('#derived-mode').inputValue(),'face');
    await page.waitForFunction(()=>document.getElementById('derived-status').textContent.includes('intrinsic 2D'));
    const parityTriangles=await triangleCount();assert.ok(parityTriangles>0);
    const saved=await saveSnapshot(),promoted=activeState(saved);
    assert.equal(promoted.model.interpretation,'surface-section');
    assert.equal(promoted.model.metadata.fillRule,'even-odd');assert.equal(promoted.view.fillRule,'even-odd');
    assert.deepEqual(promoted.model.metadata.faceSourceReferences,[{face:0,cells:[],coplanar:true}]);
    const original=saved.documents.flatMap(d=>d.states).find(s=>s.model.name===pentagramName).model;
    assert.deepEqual(geometry(original),geometry(before));
    await page.locator('[data-key="cube"]').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');
    await openFile(snapshotFile,promotedName);
    await appearance();await compare();
    assert.equal(await page.locator('#face-fill-rule').inputValue(),'even-odd');assert.equal(await triangleCount(),parityTriangles);
    assert.equal(await page.locator('#derived-mode').inputValue(),'face');
    assert.doesNotMatch(await page.locator('#derived-status').innerText(),/Error|convex polytopes only/);
    await canvasEvidence('Promoted coplanar pentagram restored');
    await screenshot('workspace-promoted-star-section.png');
    checks.push('coplanar source pentagram cycles preserved','promotion preserves even odd rule and supported face view','native save reload preserves surface section semantics','source incidence unchanged after filling slicing promotion and persistence');

    // Independent 4D source fixture retains ordinary source cells and colors.
    const source4=await page.evaluate(()=>window.polytope.engine({op:'generate',params:{kind:'regular',key:'tesseract'}}));
    source4.name='4D generalized source cell fixture';source4.interpretation='generalized-complex';delete source4.measure;
    source4.metadata.offColors={faces:source4.faces.map(()=>null),cells:source4.cells.map((_,i)=>({encoding:'unit',values:i%2?[.1,.2,1,1]:[1,.15,.05,1]}))};
    const fixtureProject={format:'polytope-laboratory',version:1,active:0,documents:[{id:'star-cell-fixture',cursor:0,states:[{model:source4,view:{derivedMode:'section',fillRule:'nonzero',surfaceOpacity:.8,surfaceColors:'source'},label:'Fixture',notes:''}]}]};
    const fixtureFile=path.join(artifacts,'star-4d-cell-fixture.polyproj');await fs.writeFile(fixtureFile,JSON.stringify(fixtureProject));
    await openFile(fixtureFile,source4.name);
    await appearance();
    const fullTriangles=await triangleCount();assert.equal(fullTriangles,48);
    assert.equal(await page.locator('#cell-visibility-summary').innerText(),'8 / 8 visible');
    await page.locator('#visible-cell-id').fill('0');await page.locator('#isolate-cell').click();
    assert.equal(await page.locator('#cell-visibility-summary').innerText(),'1 / 8 visible');assert.equal(await triangleCount(),12);
    await canvasEvidence('Isolated cell source colors');
    await surfaceColors('face');const recolored=await canvasEvidence('Isolated cell face palette');assert.ok(recolored.changedPixels>100);
    await surfaceColors('source');const sourceColored=await canvasEvidence('Isolated cell source palette restored');assert.ok(sourceColored.changedPixels>100);
    await page.locator('#hide-cell').click();assert.equal(await page.locator('#cell-visibility-summary').innerText(),'0 / 8 visible');assert.equal(await triangleCount(),0);
    await page.locator('#show-all-cells').click();assert.equal(await page.locator('#cell-visibility-summary').innerText(),'8 / 8 visible');assert.equal(await triangleCount(),fullTriangles);
    const after4=activeState(await saveSnapshot());assert.deepEqual(geometry(after4.model),geometry(source4));assert.deepEqual(after4.model.metadata.offColors,source4.metadata.offColors);
    await screenshot('workspace-source-cell-surfaces.png');
    checks.push('4D generalized source cell isolation rebuilds complete surfaces','hide selected cell and show all restore visibility','source cell color metadata affects GPU surfaces','cell visibility and colors preserve source geometry');
    assert.deepEqual(errors,[]);
    const report={passed:true,packaged:Boolean(packaged),version:await app.evaluate(({app})=>app.getVersion()),checks,images,pageErrors:errors};
    await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');console.log(`Star desktop smoke passed: ${checks.length} checks, no renderer errors.`);
  }catch(error){
    await fs.writeFile(reportFile,JSON.stringify({passed:false,checks,images,pageErrors:errors,error:error.stack},null,2)+'\n');
    await page.screenshot({path:path.join(artifacts,'star-desktop-failure.png')}).catch(()=>{});
    console.error('Star smoke failed:',error);console.error(await page.locator('body').innerText().catch(()=>'<no document>'));throw error;
  }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
