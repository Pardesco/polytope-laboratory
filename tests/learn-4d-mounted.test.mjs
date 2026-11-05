import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const {EnginePool}=createRequire(import.meta.url)('../desktop/engine-pool.cjs');

test('mounted Learn 4D drives real geometry, projections, rotation, sections and nets, then restores the user document', {timeout:180000},async()=>{
  const jobs=new Map(),queue=[],requests=[];let stderr='',cancellations=0;
  const pool=new EnginePool({jobs,spawnWorker:()=>{
    const proc=spawn('python',['-u','engine/server.py'],{stdio:['pipe','pipe','pipe'],windowsHide:true,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
    proc.stderr.on('data',data=>stderr+=data);return proc;
  }});
  const execute=(request,id)=>pool.run(request,id).finally(drain);
  function drain(){while(queue.length&&jobs.size<3){const job=queue.shift();execute(job.request,job.id).then(job.resolve,job.reject);}}
  const compute=(request,id)=>{requests.push(request);return jobs.size<3?execute(request,id):new Promise((resolve,reject)=>queue.push({request,id,resolve,reject}));};
  const cancel=id=>{const at=queue.findIndex(job=>job.id===id);if(at>=0){queue.splice(at,1)[0].reject(Error('Queued job cancelled.'));cancellations++;return true;}const canceled=pool.cancel(id);if(canceled)cancellations++;return canceled;};
  const server=await createServer({configFile:false,root:'ui',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0}});let browser;
  try{
    await server.listen();browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
    await page.exposeFunction('nativeEngine',compute);await page.exposeFunction('nativeCancel',cancel);
    await page.addInitScript(()=>{
      window.savedProjects=[];window.nativePending=0;window.testHidden=true;
      const startupGate=new Promise(resolve=>window.releaseStartup=()=>{window.startupReleased=true;resolve();});
      window.autosaves=[];const interval=window.setInterval;window.setInterval=(fn,ms,...args)=>{if(ms===30000)window.recoveryTick=fn;return interval(fn,ms,...args);};
      window.polytope={engine:async(r,id)=>{window.nativePending++;try{if(r.op==='analyze'&&!window.startupReleased){window.startupHeld=true;await startupGate;}return await window.nativeEngine(r,id);}finally{window.nativePending--;}},cancel:id=>window.nativeCancel(id),setDirty:async v=>{window.testDirty=v;},setWorkspaceAvailability:async()=>{},onAction:fn=>window.menuAction=fn,libraries:async()=>({libraries:[],errors:[]}),recoveryInfo:async()=>null,startupInfo:async()=>({hidden:window.testHidden}),autosave:async p=>{window.autosaves.push(p);},recentFiles:async()=>({files:[]}),
        save:async project=>{window.savedProjects.push(structuredClone(project));return {path:'learn-test.polyproj'};}};
    });
    await page.goto('http://127.0.0.1:'+server.httpServer.address().port);await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract'&&window.startupHeld);
    await page.evaluate(async()=>{
      const {Viewer}=await import('/viewer.js'),fit=Viewer.prototype.fit;window.fitEvents=[];
      Viewer.prototype.fit=function(...args){const result=fit.apply(this,args);if(this.container.id==='base-canvas'){
        this.camera.updateMatrixWorld(true);const points=this.observationCloud().map(p=>this.camera.position.clone().fromArray(p).project(this.camera)),bounds=this.container.getBoundingClientRect();
        window.fitEvents.push({name:this.model?.name,aspect:this.aspect,actualAspect:bounds.width/bounds.height,max:Math.max(...points.flatMap(p=>[Math.abs(p.x),Math.abs(p.y)]))});
      }return result;};
    });
    assert.equal(await page.locator('#learn-4d-panel').isVisible(),false);assert.equal(await page.locator('#welcome-panel').isVisible(),false);
    if(await page.locator('#auto-rotate').getAttribute('aria-pressed')==='true')await page.locator('#auto-rotate').click();
    await page.locator('#save').click();await page.waitForFunction(()=>window.savedProjects.length===1);
    const original=await page.evaluate(()=>({classes:document.body.className,layout:document.body.dataset.viewportLayout}));
    await page.evaluate(()=>{window.openLearn4D();});await page.waitForFunction(()=>document.getElementById('learn-4d-status').textContent==='Preparing…');
    assert.equal(await page.locator('#document-tabs > button').count(),1);await page.keyboard.press('Escape');assert.equal(await page.locator('#learn-4d-panel').isVisible(),false);
    await page.keyboard.press('Control+k');await page.locator('#command-query').fill('Learn 4D');
    assert.ok((await page.locator('#command-results strong').allTextContents()).includes('Learn 4D'));
    await page.locator('#command-results [role=option]').filter({hasText:'Learn 4D'}).first().click();
    await page.waitForFunction(()=>document.getElementById('learn-4d-status').textContent==='Preparing…');await page.evaluate(()=>window.releaseStartup());
    const ready=()=>page.waitForFunction(()=>!document.getElementById('learn-4d-panel').hidden&&!document.getElementById('learn-4d-action').disabled&&document.getElementById('learn-4d-status').textContent.startsWith('Ready'));
    await ready();assert.equal(await page.locator('#dimension-badge').textContent(),'2D');assert.equal(await page.locator('#document-tabs > button').count(),2);
    await page.evaluate(()=>window.recoveryTick());assert.equal(await page.evaluate(()=>window.autosaves.length),0);
    const panelBounds=await page.locator('#learn-4d-panel').boundingBox();
    for(const id of ['learn-4d-close','learn-4d-back','learn-4d-next']){const b=await page.locator('#'+id).boundingBox();assert.ok(b.y>=panelBounds.y&&b.y+b.height<=panelBounds.y+panelBounds.height,id+' stays visible at 1280px');}
    await page.locator('#learn-4d-next').click();await ready();assert.equal(await page.locator('#dimension-badge').textContent(),'3D');
    await page.locator('#learn-4d-next').click();await ready();assert.equal(await page.locator('#dimension-badge').textContent(),'4D');
    const checkLayout=async()=>{
      const metrics=await page.evaluate(()=>{const panel=document.getElementById('learn-4d-panel'),status=document.getElementById('learn-4d-status'),gizmo=document.getElementById('direct-4d-gizmo'),viewport=document.querySelector('.viewport.primary'),s=getComputedStyle(status),rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};return {fit:window.fitEvents.at(-1),font:s.fontFamily,panelFont:getComputedStyle(panel).fontFamily,wrap:s.whiteSpace,statusFits:status.scrollWidth<=status.clientWidth+1&&status.scrollHeight<=status.clientHeight+1,gizmo:rect(gizmo),viewport:rect(viewport)};});
      assert.ok(Math.abs(metrics.fit.aspect-metrics.fit.actualAspect)<1e-9);assert.ok(metrics.fit.max<=1.001,JSON.stringify(metrics.fit));assert.equal(metrics.font,metrics.panelFont);assert.equal(metrics.wrap,'normal');assert.ok(metrics.statusFits);
      assert.ok(metrics.gizmo.left>=metrics.viewport.left&&metrics.gizmo.right<=metrics.viewport.right&&metrics.gizmo.top>=metrics.viewport.top&&metrics.gizmo.bottom<=metrics.viewport.bottom);
    };
    await checkLayout();await page.setViewportSize({width:1600,height:1000});await page.locator('#learn-4d-action').click();await ready();await checkLayout();
    await page.locator('#learn-4d-next').click();await ready();assert.equal(await page.locator('#projection').inputValue(),'perspective');
    await page.locator('#learn-4d-next').click();await ready();assert.equal(await page.locator('#projection').inputValue(),'orthographic');
    await page.locator('#learn-4d-next').click();await ready();assert.equal(await page.locator('#projection').inputValue(),'stereographic');
    await page.locator('#learn-4d-chapter').selectOption('2');await ready();assert.equal(await page.locator('#auto-rotation-plane').inputValue(),'2');assert.equal(await page.locator('#auto-rotate').getAttribute('aria-pressed'),'true');
    const angle=await page.locator('#plane-2').inputValue();await page.waitForFunction(a=>document.getElementById('plane-2').value!==a,angle);
    await page.locator('#learn-4d-next').click();await ready();assert.equal(await page.locator('#auto-rotate').getAttribute('aria-pressed'),'false');
    const canvas=page.locator('#base-canvas canvas'),box=await canvas.boundingBox();await page.keyboard.down('Shift');await page.mouse.move(box.x+box.width*.4,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.55,box.y+box.height*.5,{steps:8});await page.mouse.up();await page.keyboard.up('Shift');
    assert.notEqual(await page.locator('#plane-2').inputValue(),'24');
    await page.locator('#learn-4d-chapter').selectOption('3');await page.waitForFunction(()=>document.getElementById('derived-status').textContent.includes('intrinsic 3D'));
    const depth=await page.locator('#section-depth').inputValue();await page.waitForFunction(d=>document.getElementById('section-depth').value!==d,depth);
    await page.locator('#learn-4d-pause').click();assert.match(await page.locator('#learn-4d-status').innerText(),/Paused/);
    await mkdir('artifacts/u18-learn-4d',{recursive:true});await page.screenshot({path:'artifacts/u18-learn-4d/lesson-1280.png'});
    await page.locator('#learn-4d-next').click();await ready();assert.match(await page.locator('#model-name').innerText(),/24-cell/);
    await page.locator('#learn-4d-chapter').selectOption('4');await ready();assert.match(await page.locator('#derived-status').innerText(),/8 whole cells/);
    await page.setViewportSize({width:1600,height:1000});await page.screenshot({path:'artifacts/u18-learn-4d/net-1600.png'});
    const panel=await page.locator('#learn-4d-panel').boundingBox(),views=await page.locator('#views').boundingBox();assert.ok(views.x+views.width<=panel.x+1);
    await page.locator('#learn-4d-chapter').selectOption('5');await ready();
    for(const name of ['5-cell','16-cell','24-cell','120-cell']){assert.match(await page.locator('#model-name').innerText(),new RegExp(name));if(name!=='120-cell'){await page.locator('#learn-4d-next').click();await ready();}}
    await page.locator('#learn-4d-action').click();await ready();assert.match(await page.locator('#model-name').innerText(),/600-cell/);assert.equal(await page.locator('#faces-visible').isChecked(),false);
    await page.locator('#learn-4d-next').click();assert.equal(await page.locator('#learn-4d-panel').isVisible(),false);assert.equal(await page.locator('#document-tabs > button').count(),1);assert.equal(await page.locator('#model-name').innerText(),'Tesseract');
    assert.deepEqual(await page.evaluate(()=>({classes:document.body.className,layout:document.body.dataset.viewportLayout})),original);
    await page.locator('#save').click();await page.waitForFunction(()=>window.savedProjects.length===2);
    const saved=await page.evaluate(()=>window.savedProjects.map(({savedAt,...p})=>p));
    for(const p of saved)for(const d of p.documents)for(const s of d.states){delete s.view.camera;delete s.view.derivedCamera;}
    assert.deepEqual(saved[0],saved[1]);const exitFit=await page.evaluate(()=>window.fitEvents.at(-1));assert.equal(exitFit.name,'Tesseract');assert.ok(exitFit.max<=1.001);assert.ok(Math.abs(exitFit.aspect-exitFit.actualAspect)<1e-9);
    await page.waitForFunction(()=>window.nativePending===0);await page.evaluate(()=>window.menuAction('learn4d'));await ready();
    await page.locator('#learn-4d-chapter').selectOption('3');await page.waitForFunction(()=>document.getElementById('derived-status').textContent.includes('intrinsic 3D'));await page.keyboard.press('Escape');
    assert.equal(await page.locator('#learn-4d-panel').isVisible(),false);assert.equal(await page.locator('#document-tabs > button').count(),1);
    await page.waitForFunction(()=>window.nativePending===0);assert.equal(await page.locator('#model-name').innerText(),'Tesseract');
    await page.evaluate(()=>window.openLearn4D());await ready();await page.locator('#document-tabs > button').first().click();
    assert.equal(await page.locator('#learn-4d-panel').isVisible(),false);assert.equal(await page.locator('#document-tabs > button').count(),1);
    await page.waitForFunction(()=>window.nativePending===0);
    await page.evaluate(()=>window.openLearn4D());await ready();await page.locator('#document-tabs > button').first().locator('.tab-close').click();await page.locator('#learn-4d-close').click();
    assert.equal(await page.locator('#document-tabs > button').count(),0);assert.equal(await page.locator('#model-name').innerText(),'Choose a model');
    await page.waitForFunction(()=>window.nativePending===0);await page.evaluate(()=>window.openLearn4D());await ready();assert.equal(await page.locator('#document-tabs > button').count(),1);await page.keyboard.press('Escape');assert.equal(await page.locator('#document-tabs > button').count(),0);
    assert.ok(requests.some(r=>r.op==='cell-net'));assert.ok(requests.some(r=>r.op==='section'));assert.ok(cancellations>0);assert.equal(queue.length,0);assert.equal(jobs.size,0);assert.deepEqual(errors,[]);assert.equal(stderr,'');
    assert.equal(await page.evaluate(()=>document.querySelector('#toast pre')?.textContent??''),'');
  }finally{await browser?.close();await server.close();for(const job of queue.splice(0))job.reject(Error('Test complete.'));pool.dispose();}
});
