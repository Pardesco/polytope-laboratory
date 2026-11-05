import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright';

test('mounted F5, captions, keyboard controls, recording and Escape preserve the saved project and open shelf layout',async()=>{
  const engine=spawn('python',['engine/server.py'],{stdio:['pipe','pipe','pipe'],windowsHide:true}),pending=new Map();let next=0,stderr='';
  engine.stderr.on('data',data=>stderr+=data);engine.on('error',error=>{for(const job of pending.values())job.reject(error);pending.clear();});
  const lines=createInterface({input:engine.stdout});lines.on('line',line=>{const result=JSON.parse(line),job=pending.get(result.id);if(!job)return;pending.delete(result.id);result.ok?job.resolve(result.result):job.reject(Error(result.error));});
  const compute=request=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});engine.stdin.write(JSON.stringify({...request,id})+'\n');});
  const server=await createServer({configFile:false,root:'ui',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0}});let browser;
  try{
    await server.listen();browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
    await page.exposeFunction('nativeEngine',compute);
    await page.exposeFunction('resizePresentation',enabled=>page.setViewportSize(enabled?{width:1440,height:900}:{width:1280,height:800}));
    await page.addInitScript(()=>{
      window.savedProjects=[];window.nativePresentation=[];window.recordedFrames=[];
      window.polytope={engine:r=>window.nativeEngine(r),cancel:async()=>{},setDirty:async()=>{},setWorkspaceAvailability:async()=>{},onAction:fn=>window.menuAction=fn,libraries:async()=>({libraries:[],errors:[]}),recoveryInfo:async()=>null,startupInfo:async()=>({hidden:false}),autosave:async()=>{},recentFiles:async()=>[],
        save:async project=>{window.savedProjects.push(structuredClone(project));return {path:'test.polyproj'};},
        presentationWindow:async value=>{window.nativePresentation.push(value);await window.resizePresentation(value);return value;},
        animationBegin:async options=>{window.recordOptions=options;return {id:'recording'};},animationWrite:async(_id,i,data)=>window.recordedFrames.push([i,typeof data==='string'?data.length:data.byteLength]),animationFinish:async()=>({path:'presentation.webm'}),animationAbort:async()=>{window.recordAborted=true;}};
    });
    await page.goto('http://127.0.0.1:'+server.httpServer.address().port);await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    await page.locator('#welcome-close').click();await page.locator('#auto-rotate').click();
    await page.locator('#save').click();await page.waitForFunction(()=>window.savedProjects.length===1);
    await page.locator('#presentation-settings > summary').click();
    const original=await page.evaluate(()=>({classes:document.body.className,layout:document.body.dataset.viewportLayout,style:document.body.getAttribute('style'),tabs:document.getElementById('document-tabs').textContent,open:document.getElementById('presentation-settings').open}));
    const oldBounds=await page.locator('#views').boundingBox();
    await page.keyboard.press('F5');await page.waitForFunction(()=>!document.getElementById('presentation-showcase').hidden&&document.getElementById('presentation-pause').textContent==='Pause');
    await page.waitForFunction(()=>document.getElementById('presentation-canvas').getAttribute('aria-label').includes('Tesseract'));
    assert.equal(await page.locator('.command-bar').evaluate(n=>n.inert),true);
    assert.deepEqual(await page.locator('#views').boundingBox(),oldBounds);
    await page.waitForFunction(()=>{const c=document.getElementById('presentation-canvas'),data=c.getContext('2d').getImageData(40,c.height-170,400,100).data;for(let i=0;i<data.length;i+=4)if(data[i]>210&&data[i+1]>210&&data[i+2]>210)return true;return false;});
    await page.keyboard.press('Space');await page.waitForFunction(()=>document.getElementById('presentation-pause').textContent==='Play');
    await mkdir('artifacts/w44-presentation',{recursive:true});await page.screenshot({path:'artifacts/w44-presentation/showcase.png'});
    await page.keyboard.press('c');assert.equal(await page.locator('#presentation-toggle-captions').getAttribute('aria-pressed'),'false');
    await page.keyboard.press('ArrowRight');await page.keyboard.press('Escape');await page.waitForFunction(()=>document.getElementById('presentation-showcase').hidden);
    assert.deepEqual(await page.evaluate(()=>({classes:document.body.className,layout:document.body.dataset.viewportLayout,style:document.body.getAttribute('style'),tabs:document.getElementById('document-tabs').textContent,open:document.getElementById('presentation-settings').open})),original);
    await page.locator('#save').click();await page.waitForFunction(()=>window.savedProjects.length===2);const saved=await page.evaluate(()=>window.savedProjects.map(({savedAt,...project})=>project));assert.deepEqual(saved[0],saved[1]);
    await page.locator('#presentation-settings > summary').click();await page.locator('#presentation-duration').fill('1');await page.locator('#presentation-settings > .settings-body > details > summary').click();await page.locator('#presentation-fps').fill('2');await page.locator('#presentation-size').selectOption('w480');
    // Programmatic click reaches the same handler without changing disclosure state.
    await page.locator('#presentation-record').evaluate(n=>n.click());await page.waitForFunction(()=>document.getElementById('presentation-status').textContent.includes('Presentation saved:'));
    assert.deepEqual(await page.evaluate(()=>({format:window.recordOptions.format,duration:window.recordOptions.duration,count:window.recordOptions.frameCount,writes:window.recordedFrames.length,aborted:!!window.recordAborted})),{format:'webm',duration:1,count:3,writes:5,aborted:false});
    await page.keyboard.press('Escape');await page.waitForFunction(()=>document.getElementById('presentation-showcase').hidden);assert.deepEqual(await page.evaluate(()=>window.nativePresentation),[true,false,true,false]);assert.deepEqual(errors,[]);assert.equal(stderr,'');
  }finally{await browser?.close();await server.close();lines.close();engine.kill();for(const job of pending.values())job.reject(Error('Test complete.'));}
});
