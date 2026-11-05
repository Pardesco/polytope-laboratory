import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {WALKTHROUGHS} from '../ui/walkthrough.mjs';

test('all eight walkthroughs target visible controls after mounted layout, with native actions and history',async(t)=>{
  const engine=spawn('python',['engine/server.py'],{stdio:['pipe','pipe','pipe'],windowsHide:true}),pending=new Map();let next=0,stderr='';
  engine.stderr.on('data',data=>stderr+=data);engine.on('error',error=>{for(const job of pending.values())job.reject(error);pending.clear();});
  const lines=createInterface({input:engine.stdout});lines.on('line',line=>{const result=JSON.parse(line),job=pending.get(result.id);if(!job)return;pending.delete(result.id);result.ok?job.resolve(result.result):job.reject(Error(result.error));});
  const compute=request=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});engine.stdin.write(JSON.stringify({...request,id})+'\n');});
  const server=await createServer({configFile:false,root:'ui',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0}});let browser;
  try{
    await server.listen();browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
    await page.exposeFunction('nativeEngine',compute);
    await page.addInitScript(()=>{
      localStorage.setItem('polytope.direct4d.gizmo','0');
      window.polytope={engine:request=>window.nativeEngine(request),cancel:async()=>{},setDirty:async()=>{},setWorkspaceAvailability:async()=>{},onAction:callback=>window.menuAction=callback,libraries:async()=>({libraries:[],errors:[]}),recoveryInfo:async()=>null,startupInfo:async()=>({hidden:sessionStorage.getItem('welcome-test-hidden')==='1'}),autosave:async()=>{},recentFiles:async()=>({files:[]}),discoveryMenu:async()=>{},open:async()=>{window.openRequested=true;return null;},save:async project=>{window.savedProject=project;return {path:'welcome.polyproj'};}};
    });
    const url='http://127.0.0.1:'+server.httpServer.address().port;
    await page.goto(url);await page.locator('#welcome-panel').waitFor({state:'visible'});
    assert.equal(await page.locator('#welcome-primary > button').count(),3);
    assert.equal(await page.locator('#welcome-title').innerText(),'Explore shapes in three and four dimensions');
    assert.equal(await page.locator('#welcome-never').isChecked(),true);
    for(const tour of WALKTHROUGHS)for(const step of tour.steps)assert.equal(await page.locator('#'+step.anchor).count(),1,tour.id+': '+step.anchor+' exists after layout');
    await mkdir('build',{recursive:true});await page.screenshot({path:'build/welcome-refresh-1280.png'});
    await page.setViewportSize({width:1600,height:1000});await page.screenshot({path:'build/welcome-refresh-1600.png'});await page.setViewportSize({width:1280,height:900});
    await page.locator('#welcome-library').click();assert.equal(await page.locator('#library-collections').isVisible(),true);
    const reopen=async()=>{await page.evaluate(()=>window.menuAction('welcome'));await page.locator('#welcome-panel').waitFor({state:'visible'});};
    await reopen();await page.locator('#welcome-open').click();await page.waitForFunction(()=>window.openRequested===true);
    await reopen();await page.locator('#welcome-symmetry').click();assert.equal(await page.locator('#coxeter-builder').isVisible(),true);await page.locator('#coxeter-builder-close').click();
    for(const tour of WALKTHROUGHS){
      t.diagnostic('Walkthrough: '+tour.id);
      await reopen();await page.locator('#walkthrough-'+tour.id).click();
      for(const [index,step] of tour.steps.entries()){
        const anchor=page.locator('#'+step.anchor);
        await page.waitForFunction(id=>document.getElementById(id)?.classList.contains('walkthrough-anchor'),step.anchor);
        assert.equal(await anchor.isVisible(),true,tour.id+' step '+index+' visible');
        assert.equal(await page.locator('#walkthrough-step').innerText(),'Step '+(index+1)+' of '+tour.steps.length);
        if(!step.event){
          if(step.anchor==='base-canvas'){
            const before=await page.locator('#planes input').evaluateAll(nodes=>nodes.map(n=>Number(n.value))),box=await anchor.boundingBox();
            await page.keyboard.down('Shift');await page.mouse.move(box.x+box.width*.4,box.y+box.height*.45);await page.mouse.down();await page.mouse.move(box.x+box.width*.4+60,box.y+box.height*.45-20,{steps:6});await page.mouse.up();await page.keyboard.up('Shift');
            await page.waitForFunction(before=>[...document.querySelectorAll('#planes input')].some((n,i)=>Math.abs(Number(n.value)-before[i])>1),before);
          }
          await page.locator('#walkthrough-next').click();
        }else if(step.event==='click'){
          await page.waitForFunction(id=>!document.getElementById(id).matches(':disabled'),step.anchor);await anchor.click();
        }else if(await anchor.evaluate(n=>n.tagName==='SELECT')){
          await anchor.selectOption(step.value);
        }else if(await anchor.evaluate(n=>n.type==='range')){
          await page.waitForFunction(id=>!document.getElementById(id).matches(':disabled'),step.anchor);await anchor.press('ArrowRight');
        }else{
          await anchor.fill(step.anchor==='measure-a-ids'?'1':step.anchor==='net-length'?'24':step.anchor==='printable-size'?'80':'0.2');
          await anchor.press('Tab');
        }
        if(tour.id==='cut-corners'&&['live-truncation-apply','undo','make-dual'].includes(step.anchor)){
          const count=step.anchor==='live-truncation-apply'?'12':step.anchor==='undo'?'8':'6';
          await page.waitForFunction(count=>document.querySelector('#counts-strip strong')?.textContent===count,count);
        }
      }
      assert.equal(await page.locator('#walkthrough-coach').isVisible(),false,tour.id+': completed; '+await page.locator('#walkthrough-step').textContent());
      if(tour.id==='struts')await page.locator('#close-export').click();
      if(tour.id==='cut-corners'){
        await page.waitForFunction(()=>document.querySelectorAll('#history-list button').length===2);
        await page.evaluate(()=>window.menuAction('save'));await page.waitForFunction(()=>!!window.savedProject);
        const saved=await page.evaluate(()=>window.savedProject),doc=saved.documents[saved.active];
        assert.equal(doc.states.length,2);assert.equal(doc.cursor,1);assert.equal(doc.states[1].model.vertices.length,6);assert.equal(doc.states[1].model.faces.length,8);
        await page.locator('#undo').click();await page.waitForFunction(()=>document.querySelector('#counts-strip strong')?.textContent==='8');
        await page.locator('#redo').click();await page.waitForFunction(()=>document.querySelector('#counts-strip strong')?.textContent==='6');
      }
    }
    assert.equal(await page.locator('#workspace-tip').isVisible(),true);await page.locator('#workspace-tip-dismiss').click();assert.equal(await page.locator('#workspace-tip').isVisible(),false);
    await reopen();await page.locator('#welcome-never').uncheck();await page.locator('#welcome-close').click();await page.reload();await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    assert.equal(await page.locator('#welcome-panel').isVisible(),false);assert.equal(await page.locator('#workspace-tip').isVisible(),false);
    await reopen();await page.locator('#welcome-never').check();await page.locator('#welcome-close').click();assert.equal(await page.evaluate(()=>localStorage.getItem('polytope-welcome-v1')),null);
    await page.evaluate(()=>sessionStorage.setItem('welcome-test-hidden','1'));await page.reload();await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    assert.equal(await page.locator('#welcome-panel').isVisible(),false);assert.equal(await page.locator('#workspace-tip').isVisible(),false);
    await page.evaluate(()=>window.menuAction('welcome'));assert.equal(await page.locator('#welcome-panel').isVisible(),false);
    assert.deepEqual(errors,[]);assert.equal(stderr,'');
  }finally{await browser?.close();await server.close();lines.close();engine.kill();for(const job of pending.values())job.reject(Error('Test complete.'));}
});
