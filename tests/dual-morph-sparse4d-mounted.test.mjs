import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createServer} from 'vite';
import {chromium} from 'playwright';

const frameCount=3,methods=['expansion','tilting-quads'];
for(const [key,nv] of [['cell120',600]])test(`mounted ${key}: both morphs, Expert off, native reopen and real PNG frames`,{timeout:170000},async t=>{
  const engine=spawn('python',['-B','-u','engine/server.py'],{stdio:['pipe','pipe','pipe'],windowsHide:true}),pending=new Map(),receipts=new Map();let next=0,stderr='',browser,page,phase='startup',receiptBytes=0;const errors=[];
  engine.stderr.on('data',data=>stderr+=data);
  engine.stdin.on('error',error=>{for(const job of pending.values())job.reject(error);pending.clear();});
  engine.on('error',error=>{for(const job of pending.values())job.reject(error);pending.clear();});
  engine.on('exit',()=>{for(const job of pending.values())job.reject(Error('Native worker exited: '+stderr));pending.clear();});
  const lines=createInterface({input:engine.stdout});lines.on('line',line=>{const response=JSON.parse(line),job=pending.get(response.id);if(!job)return;pending.delete(response.id);
    if(response.ok&&job.key){const bytes=Buffer.byteLength(job.key)+Buffer.byteLength(JSON.stringify(response.result));if(bytes<=64*1024**2){while(receipts.size>=8||receiptBytes+bytes>64*1024**2){const first=receipts.keys().next().value;receiptBytes-=receipts.get(first).bytes;receipts.delete(first);}receipts.set(job.key,{bytes,result:structuredClone(response.result)});receiptBytes+=bytes;}}
    response.ok?job.resolve(response.result):job.reject(Error(response.error));});
  const compute=request=>{const key=['prepare-dual-morph','evaluate-dual-morph'].includes(request.op)?JSON.stringify(request):null;
    if(key&&receipts.has(key)){const record=receipts.get(key);receipts.delete(key);receipts.set(key,record);return new Promise(resolve=>setImmediate(()=>resolve(structuredClone(record.result))));}
    return new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject,key,op:request.op,started:Date.now()});engine.stdin.write(JSON.stringify({...request,id})+'\n');});};
  const server=await createServer({configFile:false,root:'ui',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0}});
  try{
    await server.listen();browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    t.signal.addEventListener('abort',()=>{engine.kill();browser.close().catch(()=>{});},{once:true});
    page=await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(90000);page.on('pageerror',error=>errors.push(error.message));
    // Carry the native JSON wire through one string, rather than Playwright's
    // per-property remote-value protocol for multi-megabyte frame descriptors.
    await page.exposeFunction('nativeEngineJSON',async text=>JSON.stringify(await compute(JSON.parse(text))));
    await page.addInitScript(()=>{
      window.nativeEngine=async request=>JSON.parse(await window.nativeEngineJSON(JSON.stringify(request)));
      window.morphReceipts=[];window.savedCount=0;window.pngFrames=[];window.pngFinished=0;
      window.polytope={engine:async request=>{const result=await window.nativeEngine(request);if(request.op==='evaluate-dual-morph')window.morphReceipts.push({ratio:result.ratio,method:result.method,counts:['vertices','edges','faces','cells'].map(k=>result.model[k].length)});return result;},cancel:async()=>{},setDirty:async()=>{},setWorkspaceAvailability:async()=>{},onAction(){},libraries:async()=>({libraries:[],errors:[]}),recoveryInfo:async()=>null,startupInfo:async()=>({hidden:false}),autosave:async()=>{},recentFiles:async()=>({files:[]}),
        save:async project=>{window.saved=await window.nativeEngine({op:'validate-project',params:{project}});window.savedCount++;return {path:'large4d.polyproj'};},open:async()=>({project:structuredClone(window.saved),path:'large4d.polyproj'}),confirmProjectOpen:async()=>true,
        animationBegin:async options=>{window.pngOptions=options;window.pngFrames=[];return {id:'large4d-png'};},animationWrite:async(id,index,data)=>{window.pngFrames[index]=data;},animationFinish:async()=>{window.pngFinished++;return {path:'large4d-frames'};},animationAbort:async()=>{window.pngAborted=true;}};
    });
    await page.goto('http://127.0.0.1:'+server.httpServer.address().port);
    const ready=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden&&document.querySelector('#evidence pre'));
    await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract');await ready();await page.locator('#welcome-close').click();
    await page.locator('#library-show-all').click();await page.locator(`[data-key="${key}"]`).click();await ready();
    const open=async()=>{if(!await page.locator('#dual-morph-settings').evaluate(n=>n.open)){await page.locator('#dock-more-button').click();await page.locator('#open-dual-morph-settings').click();}};
    for(const [index,method] of methods.entries()){
      const started=Date.now();phase=method+' apply';
      await open();await page.locator('#dual-morph-method').selectOption(method);
      assert.equal(await page.locator('#dual-morph-4d-help').isVisible(),true);assert.match(await page.locator('#dual-morph-4d-help').textContent(),/120-cell and 600-cell/);
      assert.equal(await page.locator('#dual-morph-method option[value="via-snub"]').evaluate(n=>n.disabled),true);
      if(!await page.locator('#dual-morph-geometry').evaluate(n=>n.open))await page.locator('#dual-morph-geometry > summary').click();
      await page.locator('#dual-morph-radius').fill('1');
      await page.locator('#dual-morph-ratio').fill('1/2');await page.locator('#dual-morph-apply').click();
      await page.waitForFunction(m=>document.getElementById('dual-morph-result').textContent.includes(m)&&document.getElementById('dual-morph-result').textContent.includes('0.500'),method);
      assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('expert-mode')),false);
      await page.locator('#dual-morph-settings .chrome-drawer-close').click();await page.locator('#save').click();await page.waitForFunction(n=>window.savedCount===n,index+1);
      const state=await page.evaluate(()=>{const d=window.saved.documents[window.saved.active];return d.states[d.cursor];});
      assert.equal(state.model.vertices.length,nv);assert.equal(state.view.dualMorph.method,method);assert.equal(state.view.dualMorph.ratio,.5);
      phase=method+' reopen';
      await page.locator('#open').click();await ready();await open();
      await page.waitForFunction(m=>document.getElementById('dual-morph-result').textContent.includes(m)&&document.getElementById('dual-morph-result').textContent.includes('0.500'),method);
      for(const ratio of [1,0]){
        await page.locator('#dual-morph-scrub').fill(String(ratio));await page.locator('#dual-morph-scrub').dispatchEvent('input');
        await page.waitForFunction(t=>document.getElementById('dual-morph-result').textContent.includes(t.toFixed(3)),ratio);
      }
      await page.locator('#dual-morph-settings .chrome-drawer-close').click();
      phase=method+' PNG export';
      await page.locator('#animation-morph').evaluate(n=>n.dispatchEvent(new CustomEvent('app-chrome-reveal',{bubbles:true})));
      await page.evaluate(()=>{document.getElementById('animation-duration').value='1';const fps=document.getElementById('animation-fps');fps.value='2';fps.dispatchEvent(new Event('change',{bubbles:true}));});
      await page.waitForFunction(()=>!document.getElementById('animation-fps').disabled&&document.getElementById('animation-fps').value==='2');
      await page.locator('#animation-morph').click();await ready();
      await page.locator('#timeline-export-settings').evaluate(n=>n.open=true);await page.locator('#animation-size').selectOption('w480');await page.locator('#animation-png').click();
      await page.waitForFunction(n=>window.pngFinished===n,index+1);
      await page.waitForFunction(()=>!document.getElementById('animation-png').disabled);
      const frames=await page.evaluate(()=>window.pngFrames);assert.equal(frames.length,frameCount);assert.equal(new Set(frames).size,frameCount);
      for(const frame of frames){assert.match(frame,/^data:image\/png;base64,/);const bytes=Buffer.from(frame.split(',')[1],'base64');assert.equal(bytes.readUInt32BE(16),480);}
      phase=method+' reset';
      await open();await page.locator('#dual-morph-reset').click();await page.waitForFunction(()=>document.getElementById('dual-morph-result').textContent==='Source geometry');
      await page.locator('#dual-morph-settings .chrome-drawer-close').click();
      t.diagnostic(`${method}: ${((Date.now()-started)/1000).toFixed(2)}s, ${frameCount} PNG frames`);
    }
    const receipts=await page.evaluate(()=>window.morphReceipts);
    for(const method of methods)assert.ok(receipts.some(r=>r.method===method&&r.ratio===.5&&r.counts[0]===(method==='expansion'?2400:2640)));
    assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('expert-mode')),false);assert.deepEqual(errors,[]);assert.equal(stderr,'');
  }catch(error){console.error('Mounted morph failure',JSON.stringify({key,phase,errors,pending:[...pending.values()].map(j=>({op:j.op,seconds:(Date.now()-j.started)/1000})),ui:await page?.evaluate(()=>({pngFinished:window.pngFinished,pngFrames:window.pngFrames?.length,pngOptions:window.pngOptions,pngAborted:window.pngAborted,pngDisabled:document.getElementById('animation-png')?.disabled,status:document.getElementById('status')?.textContent,morph:document.getElementById('dual-morph-result')?.textContent,progress:document.getElementById('animation-progress')?.textContent})).catch(()=>null)}));throw error;}
  finally{await browser?.close();await server.close();lines.close();engine.kill();for(const job of pending.values())job.reject(Error('Test complete.'));}
});
