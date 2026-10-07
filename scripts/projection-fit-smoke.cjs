// Actual delayed worker replies exercise projection-fit camera/source fences.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require('playwright');
const {guardRuntime}=require('./layer-join-smoke.cjs');
const root=path.resolve(__dirname,'..');
const active=p=>{const d=p.documents[p.active];return d.states[d.cursor];};
function holdIdleReply(){
  const Native=window.Worker;window.__holdProjectionFitIdle=false;window.__heldProjectionFitIdle=null;
  window.Worker=function(...args){
    const worker=new Native(...args),add=worker.addEventListener;
    worker.addEventListener=function(type,callback,...rest){
      if(type!=='message'||typeof callback!=='function')return Reflect.apply(add,this,[type,callback,...rest]);
      return Reflect.apply(add,this,[type,function(event){
        if(window.__holdProjectionFitIdle&&event.data?.type==='geometry-result'&&event.data.phase==='idle'){
          window.__holdProjectionFitIdle=false;
          window.__heldProjectionFitIdle={frameKey:event.data.frameKey,jobId:event.data.jobId,
            release:()=>Reflect.apply(callback,worker,[event])};return;
        }
        return Reflect.apply(callback,worker,[event]);
      },...rest]);
    };return worker;
  };
  window.Worker.prototype=Native.prototype;Object.setPrototypeOf(window.Worker,Native);
}
async function main(){
  const runtime=await guardRuntime(),folder=await fs.mkdtemp(path.join(root,'artifacts','projection-fit-smoke-'));
  const profile=path.join(folder,'profile');await fs.mkdir(profile);
  await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-python.exe');
  const app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);const checks=[],errors=[],files=[];let sequence=0;
  page.on('pageerror',error=>errors.push(error.message));
  const frames=()=>page.evaluate(async()=>{for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);});
  const idle=async()=>{await frames();await page.waitForFunction(()=>{
    const d=document.getElementById('view-diagnostic').dataset;return d.stereographicPending==='false'&&d.stereographicPhase==='idle';
  });await frames();};
  const release=()=>page.evaluate(()=>{window.__heldProjectionFitIdle?.release();window.__heldProjectionFitIdle=null;});
  const save=async label=>{
    const file=path.join(folder,`${++sequence}-${label}.polyproj`);
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
    await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);
    files.push(file);return active(JSON.parse(await fs.readFile(file,'utf8')));
  };
  const arm=async()=>{
    await page.locator('#projection').selectOption('orthographic');await frames();
    await page.evaluate(()=>{window.__heldProjectionFitIdle=null;window.__holdProjectionFitIdle=true;});
    await page.locator('#projection').selectOption('stereographic');
    await page.waitForFunction(()=>Boolean(window.__heldProjectionFitIdle));
  };
  try{
    await page.addInitScript(holdIdleReply);await page.reload();
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    await arm();const source=await save('held-source');
    const canvas=page.locator('#base-canvas canvas'),box=await canvas.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,-180);await frames();
    const edited=await save('user-zoom');assert.ok(edited.view.camera.zoom>source.view.camera.zoom);
    await release();await idle();const retained=await save('released-user-zoom');
    assert.deepEqual(retained.model,source.model);assert.deepEqual(retained.view.camera,edited.view.camera);
    checks.push('held idle reply cannot overwrite a user zoom with the queued projection fit');
    await page.screenshot({path:path.join(folder,'retained-user-zoom.png')});

    await arm();await page.locator('#projection').selectOption('orthographic');await frames();
    const ordinary=await save('replacement-projection');await release();await frames();
    const afterOrdinary=await save('late-stereo-reply');
    assert.equal(afterOrdinary.view.projection,'orthographic');assert.deepEqual(afterOrdinary.model,source.model);
    assert.deepEqual(afterOrdinary.view.camera,ordinary.view.camera);
    checks.push('a replacement projection owns its camera; the delayed old stereographic reply cannot refit it');

    await arm();await page.locator('[data-key="cube"]').click();
    await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');await frames();
    const cube=await save('replacement-source');await release();await frames();const afterCube=await save('late-old-source');
    assert.deepEqual(afterCube.model,cube.model);assert.deepEqual(afterCube.view.camera,cube.view.camera);
    checks.push('source replacement cancels the old projection fit and preserves the new cube camera/history');
    assert.deepEqual(errors,[]);
    const result={passed:true,version:await app.evaluate(({app})=>app.getVersion()),packaged:Boolean(runtime.packaged),
      runtime:runtime.runtime,hidden:runtime.hidden,checks,pageErrors:errors,files};
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));
    console.log(`Projection fit smoke PASS: ${checks.length} held-worker groups. Artifacts: ${folder}`);
  }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});
    await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,error:error.stack,checks,pageErrors:errors},null,2));throw error;}
  finally{await release().catch(()=>{});await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
