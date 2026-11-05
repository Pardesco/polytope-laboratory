import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {WHATS_NEW_LINKS} from '../ui/guide-refresh.mjs';
import {FEATURE_ACTION_INDEX} from '../ui/guide-action-index.mjs';

test('mounted Guide, contextual help, Welcome, menu action and live command/shortcut indexes work offline',async()=>{
  const engine=spawn('python',['engine/server.py'],{stdio:['pipe','pipe','pipe'],windowsHide:true}),pending=new Map();let next=0,stderr='';
  engine.stderr.on('data',data=>stderr+=data);engine.on('error',error=>{for(const job of pending.values())job.reject(error);pending.clear();});
  const lines=createInterface({input:engine.stdout});lines.on('line',line=>{const result=JSON.parse(line),job=pending.get(result.id);if(!job)return;pending.delete(result.id);result.ok?job.resolve(result.result):job.reject(Error(result.error));});
  const compute=request=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});engine.stdin.write(JSON.stringify({...request,id})+'\n');});
  const server=await createServer({configFile:false,root:'ui',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0}});let browser;
  try{
    await server.listen();browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
    await page.exposeFunction('nativeEngine',compute);
    await page.addInitScript(()=>{window.polytope={engine:request=>window.nativeEngine(request),cancel:async()=>{},setDirty:async()=>{},setWorkspaceAvailability:async()=>{},onAction:callback=>window.menuAction=callback,libraries:async()=>({libraries:[],errors:[]}),recoveryInfo:async()=>null,startupInfo:async()=>({hidden:false}),autosave:async()=>{},recentFiles:async()=>[],discoveryMenu:async()=>{}};});
    await page.goto('http://127.0.0.1:'+server.httpServer.address().port);await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    await page.locator('#welcome-whats-new').click();await page.waitForFunction(()=>document.getElementById('help-dialog').open);
    assert.match(await page.locator('#help-topic h3').innerText(),/What’s new/);assert.equal(await page.locator('#welcome-panel').isVisible(),false);
    assert.equal(await page.locator('.guide-layout > nav h4').count(),10);
    assert.equal(await page.locator('#help-topic [data-guide-topic]').count(),WHATS_NEW_LINKS.length);
    for(const [id] of WHATS_NEW_LINKS){
      await page.locator('#help-topic [data-guide-topic="'+id+'"]').click();
      assert.ok(await page.locator('#help-topic ol li').count()>=3,id);
      await page.locator('[data-topic="whats-new"]').click();
    }
    await page.keyboard.press('Escape');
    const order=await page.locator('#info-panel > [id]').evaluateAll(nodes=>nodes.map(n=>n.id));
    for(const [before,after] of [['analysis-overview','element-types'],['element-types','library-related'],['library-related','analysis-details-heading'],['analysis-details-heading','analysis-measurements'],['analysis-measurements','information-panel'],['information-panel','polychoron-relationships']])assert.ok(order.includes(before)&&order.includes(after)&&order.indexOf(before)<order.indexOf(after),before+' before '+after);
    assert.equal(await page.locator('#analysis-measurements > #analysis').count(),1);
    assert.equal(await page.locator('#uc-polygon-options').evaluate(n=>n.open),false);
    for(const [id,title] of [['uniform-compound-settings','Create and adjust a uniform compound'],['presentation-settings','Present and record a playlist']]){
      const helpSelector=id==='uniform-compound-settings'?'#construct-pane-'+id+' .construct-pane-help':'#'+id+' .chrome-drawer-help';
      const help=page.locator(helpSelector);
      if(id==='uniform-compound-settings')await page.evaluate(id=>window.openConstructTool(id),id);
      await help.evaluate(n=>{if(document.body.classList.contains('inspector-hidden'))document.getElementById('toggle-inspector').click();for(let p=n.parentElement;p;p=p.parentElement){if(p.tagName==='DETAILS')p.open=true;}const panel=n.closest('.inspector-panel');if(panel)document.querySelector('[data-panel="'+panel.id.replace('-panel','')+'"]').click();});
      await help.click();
      assert.equal(await page.locator('#help-topic h3').innerText(),title);await page.keyboard.press('Escape');
      await page.waitForFunction(selector=>document.activeElement===document.querySelector(selector),helpSelector);
    }
    await page.evaluate(()=>window.menuAction('whatsnew'));assert.match(await page.locator('#help-topic h3').innerText(),/What’s new/);await page.keyboard.press('Escape');
    const contexts=await page.evaluate(async()=>{
      const {GROUP_GUIDE_TOPICS,guideContext}=await import('/user-guide.mjs');
      return Array.from(document.querySelectorAll('#inspector-region details')).map(node=>({id:node.id,topic:guideContext(node),mapped:!node.id||!!GROUP_GUIDE_TOPICS[node.id],help:!!node.querySelector(':scope > summary .group-help')}));
    });
    assert.ok(contexts.length>60);for(const row of contexts){assert.ok(row.mapped,JSON.stringify(row));assert.ok(row.help,JSON.stringify(row));assert.notEqual(row.topic,'start',JSON.stringify(row));}
    for(const [id,title] of [['information-panel','Read and export a measurement table'],['zone-extension-settings','Build zonohedra from axes or add zones'],['density-section-settings','Fill a section by winding density']]){
      await page.evaluate(id=>document.querySelector('#'+id+' > summary .group-help').click(),id);assert.equal(await page.locator('#help-topic h3').innerText(),title);await page.keyboard.press('Escape');
    }
    await page.evaluate(()=>document.querySelector('#zone-extension-settings > summary .group-help').disabled=true);
    await page.waitForFunction(()=>!document.querySelector('#zone-extension-settings > summary .group-help').disabled);
    await page.locator('#animation-settings details[data-guide-topic="media-export"] > summary .group-help').evaluate(n=>n.click());
    assert.equal(await page.locator('#help-topic h3').innerText(),'Choose image and video export options');await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    for(const item of FEATURE_ACTION_INDEX){await page.locator('#command-query').fill(item.query);assert.ok(await page.locator('#command-results [role="option"]').count()>0,item.query);}
    for(const [query,label] of [['uniform compound Skilling','Create compound'],['Apply parameters','Apply parameters'],['Preview edge cut','Preview edge cut'],['Adopt edge cut','Adopt edge cut'],['Check literal vertex links','Check literal vertex links'],['Start presentation','Start presentation (F5)'],['Record presentation','Record presentation'],['Compute table','Compute table'],['Re-arrange pieces','Re-arrange pieces'],['Export assembly sheet SVG','Export assembly sheet SVG'],['Export selected format','Export selected format']]){
      await page.locator('#command-query').fill(query);assert.ok((await page.locator('#command-results strong').allTextContents()).includes(label),query+' finds live action');
    }
    for(const [query,expected] of [['Miller','Miller'],['Interpolate face colors','Interpolate face colors'],['Bcc','BCC'],['printable model','Export model'],['hollow shell','Export model'],['displayed geometry','Export model']]){
      await page.locator('#command-query').fill(query);assert.ok((await page.locator('#command-results').innerText()).includes(expected),query);
    }
    await page.locator('#command-query').fill('whatsnew');await page.keyboard.press('Enter');assert.match(await page.locator('#help-topic h3').innerText(),/What’s new/);
    // Lazy feature notes are loaded locally and preserve a route back to the task.
    await page.locator('[data-topic="solid-printing"]').click();await page.locator('a[href="#guide-note-SOLID_PRINTING.md"]').click();await page.waitForFunction(()=>document.querySelector('#help-topic pre')?.textContent.includes('Outer surface solid printing'));
    await page.locator('[data-topic="solid-printing"]').click();assert.equal(await page.locator('#help-topic ol li').count(),5);await page.keyboard.press('Escape');
    await page.evaluate(()=>window.menuAction('shortcuts'));assert.equal(await page.locator('#shortcut-action-index button').count(),FEATURE_ACTION_INDEX.length);
    await page.locator('#shortcut-action-index button').filter({hasText:'Hollow solid printing'}).click();assert.equal(await page.locator('#command-query').inputValue(),'Hollow shell');assert.equal(await page.locator('#shortcut-sheet').evaluate(node=>node.open),false);assert.equal(await page.locator('#command-palette').evaluate(node=>node.open),true);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'command-query');
    assert.deepEqual(errors,[]);assert.equal(stderr,'');
  }finally{await browser?.close();await server.close();lines.close();engine.kill();for(const job of pending.values())job.reject(Error('Test complete.'));}
});
