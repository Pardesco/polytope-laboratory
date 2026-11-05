import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright';

test('mounted 1280x800 UI keeps readable controls, visible focus, an opaque builder and a spaced Guide search',async()=>{
  const engine=spawn('python',['engine/server.py'],{stdio:['pipe','pipe','pipe'],windowsHide:true}),pending=new Map();let next=0,stderr='';
  engine.stderr.on('data',data=>stderr+=data);engine.on('error',error=>{for(const job of pending.values())job.reject(error);pending.clear();});
  const lines=createInterface({input:engine.stdout});lines.on('line',line=>{const result=JSON.parse(line),job=pending.get(result.id);if(!job)return;pending.delete(result.id);result.ok?job.resolve(result.result):job.reject(Error(result.error));});
  const compute=request=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});engine.stdin.write(JSON.stringify({...request,id})+'\n');});
  const server=await createServer({configFile:false,root:'ui',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0}});let browser;
  try{
    await server.listen();browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
    await page.exposeFunction('nativeEngine',compute);
    await page.addInitScript(()=>{window.polytope={engine:request=>window.nativeEngine(request),cancel:async()=>{},setDirty:async()=>{},setWorkspaceAvailability:async()=>{},onAction(){},libraries:async()=>({libraries:[],errors:[]}),recoveryInfo:async()=>null,startupInfo:async()=>({hidden:false}),autosave:async()=>{},recentFiles:async()=>[],discoveryMenu:async()=>{}};localStorage.setItem('polytope-welcome-v1','dismissed');});
    await page.goto('http://127.0.0.1:'+server.httpServer.address().port);await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    await page.evaluate(()=>document.getElementById('welcome-close')?.click());
    await page.locator('#toggle-inspector').click();
    const tinyText=()=>page.evaluate(()=>Array.from(document.querySelectorAll('body *')).filter(n=>Array.from(n.childNodes).some(c=>c.nodeType===3&&c.textContent.trim())&&n.getBoundingClientRect().width&&n.getBoundingClientRect().height&&parseFloat(getComputedStyle(n).fontSize)<12).map(n=>({id:n.id,cls:n.className,font:getComputedStyle(n).fontSize,text:n.textContent.slice(0,55)})));
    assert.deepEqual(await tinyText(),[]);
    for(const panel of ['construct','net','evidence','info']){await page.locator('.inspector-tabs [data-panel="'+panel+'"]').click();assert.deepEqual(await tinyText(),[],panel);}
    assert.equal(await page.locator('#auto-rotate').getAttribute('aria-pressed'),'false');
    const dimensions=await page.evaluate(()=>({body:getComputedStyle(document.body).fontSize,viewport:innerWidth,scroll:document.documentElement.scrollWidth,main:document.querySelector('main').getBoundingClientRect().right,inspector:document.querySelector('.inspector').scrollWidth,panel:document.querySelector('.inspector').clientWidth}));
    assert.equal(dimensions.body,'14px');assert.ok(dimensions.scroll<=dimensions.viewport,JSON.stringify(dimensions));assert.ok(dimensions.main<=dimensions.viewport,JSON.stringify(dimensions));assert.ok(dimensions.inspector<=dimensions.panel,JSON.stringify(dimensions));
    for(const selector of ['#projection','#fit-view','.inspector-tabs button'])for(const node of await page.locator(selector).all()){
      const computed=await node.evaluate(n=>({font:getComputedStyle(n).fontSize,height:n.getBoundingClientRect().height}));assert.equal(computed.font,'14px',selector);assert.ok(computed.height>=36,selector+JSON.stringify(computed));
    }
    await page.locator('#fit-view').focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');assert.deepEqual(await page.locator('#fit-view').evaluate(n=>({width:getComputedStyle(n).outlineWidth,style:getComputedStyle(n).outlineStyle})),{width:'2px',style:'solid'});
    await mkdir('artifacts/ui-pass-v8',{recursive:true});await page.screenshot({path:'artifacts/ui-pass-v8/01-default-1280.png'});
    for(const selector of ['.inspector-tabs button.active','.library .segmented button.active'])assert.equal(await page.locator(selector).evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(48, 71, 87)');
    const rotation=page.locator('#rotation-settings > summary');await rotation.click();
    assert.equal(await rotation.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(48, 71, 87)');assert.match(await rotation.evaluate(n=>getComputedStyle(n).boxShadow),/inset/);
    for(const button of await page.locator('#rotation-settings .chrome-drawer-header button').all()){
      const target=await button.boundingBox();assert.ok(target.width>=32&&target.height>=32,JSON.stringify(target));
    }
    await rotation.focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('chrome-drawer-help')),true);await page.keyboard.press('Escape');assert.equal(await rotation.evaluate(n=>n===document.activeElement),true);
    await page.locator('#library-build-symmetry').click();await page.waitForFunction(()=>document.getElementById('coxeter-builder-status')?.textContent.includes('Drag the preview'));
    const builder=await page.locator('#coxeter-builder').evaluate(n=>({background:getComputedStyle(n).backgroundColor,font:getComputedStyle(n.querySelector('#coxeter-builder-status')).fontFamily,width:n.scrollWidth,client:n.clientWidth}));
    assert.equal(builder.background,'rgb(20, 33, 45)');assert.match(builder.font,/Segoe UI/);assert.ok(builder.width<=builder.client,JSON.stringify(builder));
    for(const node of await page.locator('#coxeter-builder .coxeter-family-group span').all())assert.ok(await node.evaluate(n=>parseFloat(getComputedStyle(n).fontSize))>=12);
    await page.locator('#coxeter-builder-status').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/ui-pass-v8/07-builder-1280.png'});await page.locator('#coxeter-builder-close').click();
    await page.locator('#help').click();
    const label=await page.locator('#help-dialog .guide-search-label').evaluate(n=>{const input=n.querySelector('input'),range=document.createRange();range.selectNode(n.firstChild);return {bottom:range.getBoundingClientRect().bottom,top:input.getBoundingClientRect().top};});
    assert.ok(label.top-label.bottom>=8,JSON.stringify(label));
    await page.locator('[data-topic="whats-new"]').click();assert.match(await page.locator('#help-topic h3').innerText(),/November 2026/);
    await page.screenshot({path:'artifacts/ui-pass-v8/09-guide-1280.png'});await page.keyboard.press('Escape');
    await page.evaluate(()=>{const probe=document.createElement('div');probe.id='motion-probe';probe.style.transition='opacity 1s';document.body.append(probe);});
    assert.equal(await page.locator('#motion-probe').evaluate(n=>getComputedStyle(n).transitionDuration),'0s');
    await page.locator('#auto-rotate').click();assert.equal(await page.locator('#auto-rotate').getAttribute('aria-pressed'),'true');await page.locator('#auto-rotate').click();
    await page.setViewportSize({width:1600,height:1000});await page.screenshot({path:'artifacts/ui-pass-v8/01-default-1600.png'});
    await page.locator('#library-build-symmetry').click();await page.waitForFunction(()=>document.getElementById('coxeter-builder-status')?.textContent.includes('Drag the preview'));await page.screenshot({path:'artifacts/ui-pass-v8/07-builder-1600.png'});await page.locator('#coxeter-builder-close').click();
    await page.locator('#help').click();await page.locator('[data-topic="whats-new"]').click();await page.screenshot({path:'artifacts/ui-pass-v8/09-guide-1600.png'});
    assert.deepEqual(errors,[]);assert.equal(stderr,'');
  }finally{await browser?.close();await server.close();lines.close();engine.kill();for(const job of pending.values())job.reject(Error('Test complete.'));}
});
