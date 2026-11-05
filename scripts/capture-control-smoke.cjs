// Actual mouse orbit after capture; source math and native writes are unchanged.
const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline');
const active=p=>{const d=p.documents[p.active];return d.states[d.cursor];};
async function main(){
  const folder=await fs.mkdtemp(path.join(root,'artifacts','capture-controls-')),runtime=await require('./hidden-runtime.cjs').hiddenRuntime(),findings={},errors=[];
  for(const action of ['fit','png','cancel']){
    const directory=path.join(folder,action),profile=path.join(directory,'profile');await fs.mkdir(profile,{recursive:true});await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
    const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.POLYTOPE_TEST_MODE;if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(directory,'unavailable-python.exe');
    let app,page;
    try{
      app=await electron.launch({executablePath:runtime.executablePath,args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
      await app.evaluate(({BrowserWindow,dialog})=>{BrowserWindow.getAllWindows()[0].setContentSize(1500,950);dialog.showMessageBox=async()=>({response:1});});
      page=await app.firstWindow();require('./smoke-helpers.cjs').autoReveal(page);page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
      const ready=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden&&!document.getElementById('animation-png').disabled);
      const save=async label=>{await ready();const file=path.join(directory,label+'.polyproj');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);return active(JSON.parse(await fs.readFile(file,'utf8')));};
      const orbit=async(id,key,label)=>{
        const before=await save(label+'-before'),box=await page.locator('#'+id+' canvas').boundingBox();assert.ok(box&&box.width>200&&box.height>200);
        const x=box.x+box.width*.56,y=box.y+box.height*.28;
        await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+68,y+32,{steps:10});await page.mouse.up();
        await page.evaluate(async()=>{for(let i=0;i<12;i++)await new Promise(requestAnimationFrame);});
        const after=await save(label+'-after');assert.deepEqual(after.model,before.model);assert.equal(after.notes,before.notes);
        return {moved:JSON.stringify(before.view[key])!==JSON.stringify(after.view[key]),before:before.view[key],after:after.view[key]};
      };
      await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract'&&document.getElementById('cancel').hidden);
      await page.locator('#viewport-layout').selectOption('split');await page.waitForFunction(()=>!document.getElementById('promote').disabled&&document.getElementById('cancel').hidden);
      await page.locator('#section-normal').fill('.2, .3, .4, 1');await page.locator('#section-depth').fill('.1');await page.locator('#apply-section').click();await ready();
      const initial=await orbit('derived-canvas','derivedCamera','initial-orbit');assert.equal(initial.moved,true,'Fresh derived camera must rotate with the actual pointer');
      await page.locator('#animation-settings > summary').click();
      for(const [id,value] of [['animation-duration','0.25'],['animation-fps','8']]){await page.locator('#'+id).evaluate((input,value)=>{input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));},value);await ready();}
      await page.locator('#animation-target').selectOption('section');await page.locator('#animation-section').click();await ready();const source=await save('prepared');assert.equal(source.view.animation.duration,.25,'Bound the actual saved duration before running capture');assert.equal(source.view.animation.fps,8);
      const output=path.join(directory,'section.frames');if(!await page.locator('#animation-settings').evaluate(n=>n.open))await page.locator('#animation-settings > summary').click();
      if(action==='fit'){
        await page.locator('#animation-fit').click();await page.waitForFunction(()=>document.getElementById('animation-progress').textContent.startsWith('Fitted ')&&!document.getElementById('animation-png').disabled);
      }else{
        await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},output);
        if(action==='cancel')await app.evaluate(({ipcMain})=>{const original=ipcMain._invokeHandlers.get('animation-write');const assertHandler=typeof original==='function';if(!assertHandler)throw Error('Actual animation write handler required');const gate=globalThis.captureWriteGate={entered:false};ipcMain.removeHandler('animation-write');ipcMain.handle('animation-write',async(event,...args)=>{const result=await original(event,...args);gate.entered=true;await new Promise(resolve=>gate.release=resolve);return result;});});
        await page.locator('#animation-png').click();
        if(action==='cancel'){
          for(let attempt=0;attempt<300;attempt++){if(await app.evaluate(()=>globalThis.captureWriteGate?.entered===true))break;await new Promise(resolve=>setTimeout(resolve,50));}assert.equal(await app.evaluate(()=>globalThis.captureWriteGate?.entered===true),true,'Actual native frame must reach the held reply');await page.locator('#animation-cancel').click();await app.evaluate(()=>globalThis.captureWriteGate.release());await ready();await assert.rejects(()=>fs.access(output));assert.equal((await fs.readdir(directory)).filter(name=>name.startsWith('.polytope-animation-')).length,0);
        }else{
          await page.waitForFunction(file=>document.getElementById('animation-progress').textContent==='Exported '+file&&!document.getElementById('animation-png').disabled,output);
          const manifest=JSON.parse(await fs.readFile(path.join(output,'sequence.json'),'utf8'));assert.deepEqual(manifest.frameTimes,[0,.125,.25]);
        }
      }
      const restored=await save('restored');assert.deepEqual(restored.model,source.model);assert.equal(restored.notes,source.notes);for(const key of ['sectionNormal','sectionOffset','angles','animation'])assert.deepEqual(restored.view[key],source.view[key]);
      // Close the disclosure before pointer input; its overlay must not cover a pane.
      if(await page.locator('#animation-settings').evaluate(n=>n.open))await page.locator('#animation-settings > summary').click();
      const base=await orbit('base-canvas','camera','base-after-'+action),derived=await orbit('derived-canvas','derivedCamera','derived-after-'+action);findings[action]={baseOrbitRestored:base.moved,derivedOrbitRestored:derived.moved,base,derived};
      if(!baseline){assert.equal(base.moved,true,'Base controls must recover after '+action);assert.equal(derived.moved,true,'Derived controls must recover after '+action);}
      await page.screenshot({path:path.join(directory,'after.png')});
    }catch(error){await page?.screenshot({path:path.join(directory,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({error:error.stack,action,findings,errors},null,2));throw error;}
    finally{await app?.evaluate(({app})=>app.exit(0)).catch(()=>{});}
  }
  assert.deepEqual(errors,[]);const result={passed:true,version:runtime.version,packaged:runtime.packaged,baseline,developmentPythonDisabled:runtime.packaged,findings,errors};await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({folder,version:result.version,baseline,findings:Object.fromEntries(Object.entries(findings).map(([k,v])=>[k,{baseOrbitRestored:v.baseOrbitRestored,derivedOrbitRestored:v.derivedOrbitRestored}]))},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
