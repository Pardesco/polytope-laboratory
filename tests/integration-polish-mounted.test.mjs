import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright';

test('merged inspector, library, toolbar, dock and Appearance fit at 1280x800 and 1600x1000',{timeout:120000},async()=>{
  const engine=spawn('python',['engine/server.py'],{stdio:['pipe','pipe','pipe'],windowsHide:true}),pending=new Map();let next=0,stderr='';
  engine.stderr.on('data',data=>stderr+=data);
  const lines=createInterface({input:engine.stdout});lines.on('line',line=>{const result=JSON.parse(line),job=pending.get(result.id);if(!job)return;pending.delete(result.id);result.ok?job.resolve(result.result):job.reject(Error(result.error));});
  const compute=request=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});engine.stdin.write(JSON.stringify({...request,id})+'\n');});
  const server=await createServer({configFile:false,root:'ui',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0}});let browser;
  try{
    await server.listen();browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.exposeFunction('nativeEngine',compute);
    await page.addInitScript(()=>{
      localStorage.setItem('polytope-welcome-v1','dismissed');
      window.polytope={engine:r=>window.nativeEngine(r),cancel:async()=>{},setDirty:async()=>{},setWorkspaceAvailability:async()=>{},onAction(){},libraries:async()=>({libraries:[],errors:[]}),recoveryInfo:async()=>null,startupInfo:async()=>({hidden:false}),autosave:async()=>{},recentFiles:async()=>[],discoveryMenu:async()=>{}};
    });
    await page.goto('http://127.0.0.1:'+server.httpServer.address().port);
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    await page.locator('#toggle-inspector').click();await mkdir('artifacts/integration-polish',{recursive:true});
    const checkBounds=async()=>{
      const metrics=await page.evaluate(()=>{
        const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
        const nodes=[...document.querySelectorAll('.command-bar button,.command-bar summary,.view-toolbar button,.view-toolbar select,.workspace-shelf > details > summary,.inspector-tabs button')].filter(n=>n.checkVisibility());
        return {width:innerWidth,scroll:document.documentElement.scrollWidth,inspector:{scroll:document.querySelector('.inspector').scrollWidth,width:document.querySelector('.inspector').clientWidth},nodes:nodes.map(n=>({id:n.id,text:n.textContent.trim(),...rect(n)}))};
      });
      assert.ok(metrics.scroll<=metrics.width,JSON.stringify(metrics));assert.ok(metrics.inspector.scroll<=metrics.inspector.width,JSON.stringify(metrics));
      for(const node of metrics.nodes)assert.ok(node.left>=0&&node.right<=metrics.width&&node.top>=0&&node.bottom<=800+(metrics.width===1600?200:0),JSON.stringify(node));
    };
    for(const [width,height] of [[1280,800],[1600,1000]]){
      await page.setViewportSize({width,height});
      await page.locator('#auto-rotate').click();assert.equal(await page.locator('#auto-rotate').innerText(),'Pause rotation');
      const toolbar=await page.locator('.view-toolbar').evaluate(root=>{
        const bounds=root.getBoundingClientRect(),controls=[...root.querySelectorAll(':scope > .toolbar-group > button,:scope > .toolbar-group > select,#projection-label,#perspective-strength-label,#view-options-button')].filter(n=>n.checkVisibility());
        return {left:bounds.left,right:bounds.right,height:bounds.height,controls:controls.map(n=>{const r=n.getBoundingClientRect();return {id:n.id,left:r.left,right:r.right,center:r.top+r.height/2};})};
      });
      assert.ok(Math.max(...toolbar.controls.map(n=>n.center))-Math.min(...toolbar.controls.map(n=>n.center))<1,JSON.stringify(toolbar));
      for(const control of toolbar.controls)assert.ok(control.left>=toolbar.left&&control.right<=toolbar.right,JSON.stringify(toolbar));
      for(const [id,label] of [['image','Snapshot (PNG)'],['view-options-button','View options']]){
        assert.equal(await page.locator('#'+id).getAttribute('title'),label);assert.equal(await page.locator('#'+id).getAttribute('aria-label'),label);
        assert.equal(await page.locator('#'+id+' .chrome-toolbar-label').evaluate(n=>getComputedStyle(n).clipPath),width<=1400?'inset(50%)':'none');
      }
      if(width===1280)assert.ok((await page.locator('#perspective-strength').boundingBox()).width<=48);
      await page.locator('#view-options-button').click();assert.equal(await page.locator('#camera-projection').isVisible(),true);await page.keyboard.press('Escape');
      for(const panel of ['info','construct','net','evidence']){
        await page.locator(`.inspector-tabs [data-panel="${panel}"]`).click();await checkBounds();
        const tabs=await page.locator('.inspector-tabs button').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent.trim(),client:n.clientWidth,scroll:n.scrollWidth,wrap:getComputedStyle(n).whiteSpace})));
        assert.deepEqual(tabs.map(t=>t.text),['Analysis','Construct','Nets','Advanced']);for(const tab of tabs){assert.ok(tab.scroll<=tab.client,JSON.stringify(tab));assert.equal(tab.wrap,'nowrap');}
        if(panel==='construct')assert.equal(await page.locator('#construct-card-incidence-truncation-settings strong').innerText(),'Star truncation');
        if(panel==='net'){
          for(const selector of ['#nets-other-types > summary','#cell-net-generation-settings > summary']){
            const bounds=await page.locator(selector).evaluate(n=>{const label=n.querySelector('span')??n,range=document.createRange();if(label===n)range.selectNodeContents(n.firstChild);else range.selectNodeContents(label);const text=range.getBoundingClientRect(),help=n.querySelector('.group-help').getBoundingClientRect();return {lines:range.getClientRects().length,right:text.right,help:help.left,scroll:n.scrollWidth,width:n.clientWidth};});
            assert.equal(bounds.lines,1,selector+JSON.stringify(bounds));assert.ok(bounds.right<=bounds.help&&bounds.scroll<=bounds.width,selector+JSON.stringify(bounds));
          }
          assert.equal(await page.locator('#nets-other-types > summary span').innerText(),'Other net types (2)');
          await page.locator('#nets-other-types > summary').click();assert.match(await page.locator('#nets-type-faces-reason').innerText(),/Choose a 3D model/);await page.locator('#nets-other-types > summary').click();
          assert.equal(await page.locator('#nets-step-2').innerText().then(text=>text.includes('Arrange intact 3D cells from a closed 4D shell.')),false);
        }
        await page.screenshot({path:`artifacts/integration-polish/${panel}-${width}.png`});
      }
      const cards=page.locator('.library-collection-card');assert.ok(await cards.count()>=6);
      const heights=[];
      for(const card of await cards.all()){
        await card.scrollIntoViewIfNeeded();const metrics=await card.evaluate(n=>{const rect=n=>n.getBoundingClientRect(),name=rect(n.querySelector('strong')),count=rect(n.querySelector('small')),card=rect(n),rail=rect(document.getElementById('library-region'));return {height:card.height,gap:count.top-name.bottom,content:count.bottom-card.bottom,visible:card.top>=rail.top&&card.bottom<=rail.bottom,scroll:n.scrollWidth,width:n.clientWidth};});
        heights.push(metrics.height);assert.ok(metrics.gap>=0&&metrics.gap<=8&&metrics.content<=0&&metrics.visible&&metrics.scroll<=metrics.width,JSON.stringify(metrics));
      }
      assert.equal(new Set(heights).size,1);assert.equal(await page.locator('#search').getAttribute('placeholder'),'Search shapes');assert.match(await page.locator('#search').getAttribute('title'),/Names,.*aliases.*symbols/);assert.match(await page.locator('#search').getAttribute('title'),/Counts:/);
      await page.locator('.library-collection-card').nth(4).scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/integration-polish/collections-${width}.png`});
      await page.locator('#library-region').evaluate(n=>n.scrollTop=0);
      await page.locator('.inspector-tabs [data-panel="info"]').click();await page.locator('#surface-settings > summary').click();await checkBounds();
      const sheet=await page.locator('.appearance-sheet').boundingBox(),views=await page.locator('#views').boundingBox();assert.ok(views.width>200&&views.x+views.width<=sheet.x&&sheet.x+sheet.width<=width);
      await page.screenshot({path:`artifacts/integration-polish/appearance-${width}.png`});await page.keyboard.press('Escape');
      await page.locator('#auto-rotate').click();
    }
    assert.deepEqual(errors,[]);assert.equal(stderr,'');
  }finally{await browser?.close();await server.close();lines.close();engine.kill();for(const job of pending.values())job.reject(Error('Test complete.'));}
});
