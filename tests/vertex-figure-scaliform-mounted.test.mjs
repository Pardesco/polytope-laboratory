import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const {reveal}=createRequire(import.meta.url)('../scripts/smoke-helpers.cjs');
const domain='regular-wythoff-and-scaliform',candidate='scaliform:scaliform4-tuta';

test('mounted Tuta figure completion: expert-off search, metric evidence, undo/reopen/replay and branch',{timeout:120000},async()=>{
  const engine=spawn('python',['-B','-u','engine/server.py'],{stdio:['pipe','pipe','pipe'],windowsHide:true}),pending=new Map();let next=0,stderr='';
  engine.stderr.on('data',data=>stderr+=data);
  engine.on('error',error=>{for(const job of pending.values())job.reject(error);pending.clear();});
  const lines=createInterface({input:engine.stdout});lines.on('line',line=>{const result=JSON.parse(line),job=pending.get(result.id);if(!job)return;pending.delete(result.id);result.ok?job.resolve(result.result):job.reject(Error(result.error));});
  const compute=request=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});engine.stdin.write(JSON.stringify({...request,id})+'\n');});
  const server=await createServer({configFile:false,root:'ui',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0}});let browser;
  try{
    await server.listen();browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
    await page.exposeFunction('nativeEngine',compute);
    await page.addInitScript(()=>{
      window.requests=[];window.saveCount=0;
      window.polytope={engine:request=>{window.requests.push(structuredClone(request));return window.nativeEngine(request);},cancel:async()=>{},setDirty:async()=>{},setWorkspaceAvailability:async()=>{},onAction(){},
        libraries:async()=>({libraries:[],errors:[]}),recoveryInfo:async()=>null,startupInfo:async()=>({hidden:false}),autosave:async()=>{},recentFiles:async()=>({files:[]}),
        save:async project=>{window.saved=await window.nativeEngine({op:'validate-project',params:{project}});window.saveCount++;return {path:'tuta-figure.polyproj'};},
        open:async()=>structuredClone(window.openPayload),confirmProjectOpen:async()=>true};
    });
    const address='http://127.0.0.1:'+server.httpServer.address().port;await page.goto(address);
    const ready=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden&&document.querySelector('#evidence pre'));
    await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract');await ready();await page.locator('#welcome-close').click();
    if(await page.locator('body').evaluate(n=>n.classList.contains('inspector-hidden')))await page.locator('#toggle-inspector').click();
    const save=async()=>{const count=await page.evaluate(()=>window.saveCount);await page.locator('#save').click();await page.waitForFunction(n=>window.saveCount>n,count);return page.evaluate(()=>window.saved);};
    const current=project=>{const doc=project.documents[project.active];return doc.states[doc.cursor];};
    const openModel=async model=>{await page.evaluate(model=>window.openPayload={model,path:model.name+'.json'},model);await page.locator('#open').click();await page.waitForFunction(name=>document.getElementById('model-name').textContent===name,model.name);await ready();};
    const search=async()=>{await reveal(page,'#vertex-figure-search');await page.locator('#vertex-figure-search').click();await page.waitForFunction(()=>document.getElementById('vertex-figure-cancel').hidden&&document.getElementById('vertex-figure-construction-status').textContent.length>0);};
    const tuta=await compute({op:'generate',params:{kind:'regular',key:'scaliform4-tuta'}});await openModel(tuta);
    await reveal(page,'#viewport-layout');await page.selectOption('#viewport-layout','split');await page.keyboard.press('Escape');await reveal(page,'#derived-mode');await page.selectOption('#derived-mode','vertex-figure');await page.waitForFunction(()=>!document.getElementById('promote').disabled&&document.getElementById('cancel').hidden);await page.locator('#promote').click();
    await page.waitForFunction(()=>document.getElementById('model-name').textContent.startsWith('Vertex figure 0 of '));await ready();
    const source=current(await save()).model;
    assert.deepEqual(['vertices','edges','faces'].map(k=>source[k].length),[5,8,5]);
    await page.locator('[data-panel="construct"]').click();await search();
    assert.equal(await page.locator('#vertex-figure-domain').inputValue(),domain);
    for(const id of ['vertex-figure-domain','vertex-figure-search','vertex-figure-output-length','construct-from-vertex-figure']){
      assert.equal(await page.locator('#'+id).isVisible(),true);assert.equal(await page.locator('#'+id).evaluate(n=>!!n.closest('[data-expert]')),false);
    }
    assert.equal(await page.locator('#vertex-figure-candidate').inputValue(),candidate);
    const evidence=JSON.parse(await page.locator('#vertex-figure-search-evidence').textContent());
    assert.equal(evidence.candidateCount,37);assert.equal(evidence.finiteDomainExhausted,true);assert.equal(evidence.certified,false);assert.equal(evidence.matches[0].id,candidate);assert.ok(evidence.matches[0].maxNormalizedResidual<1e-12);
    await page.locator('#vertex-figure-output-length').fill('sqrt(4)');await page.locator('#construct-from-vertex-figure').click();
    await page.waitForFunction(()=>document.getElementById('model-name').textContent.endsWith('(Tuta) from vertex figure'));await ready();
    const project=await save(),built=current(project).model,doc=project.documents[project.active];
    assert.deepEqual(['vertices','edges','faces','cells'].map(k=>built[k].length),[24,60,52,16]);assert.equal(doc.cursor,1);assert.equal(doc.states.length,2);
    assert.equal(doc.operationHistory.nodes.at(-1).op,'construct-from-vertex-figure');assert.equal(built.metadata.vertexFigureConstruction.outputEdgeLength,2);
    assert.equal(await page.evaluate(()=>window.requests.filter(r=>r.op==='recipe-run').at(-1).params.operation),'construct-from-vertex-figure');
    await page.locator('#undo').click();await ready();assert.deepEqual(current(await save()).model,source);
    await page.locator('#redo').click();await ready();assert.deepEqual(current(await save()).model,built);
    await page.evaluate(()=>window.openPayload={project:window.saved,path:'tuta-figure.polyproj'});await page.locator('#open').click();await ready();assert.deepEqual(current(await save()).model,built);
    const count=(await save()).documents.length;await reveal(page,'#history-replay');await page.locator('#history-replay').click();await ready();
    const replayed=await save();assert.equal(replayed.documents.length,count+1);assert.deepEqual(current(replayed).model,built);
    await reveal(page,'#history-branch');assert.equal(await page.locator('#history-branch').isDisabled(),false);await page.locator('#history-branch').click();
    await page.locator('#history-parameters').fill(JSON.stringify({candidate,edge_length:3}));await page.locator('#history-parameters-apply').click();await page.waitForFunction(()=>!document.getElementById('history-parameters-dialog').open);await ready();
    assert.equal(current(await save()).model.metadata.vertexFigureConstruction.outputEdgeLength,3);
    // The same search surface reports a finite failure and preserves ambiguity.
    const stretched=await compute({op:'transform',model:source,params:{matrix:[[1.01,0,0],[0,1,0],[0,0,1]]}});await openModel(stretched);await search();
    assert.match(await page.locator('#vertex-figure-construction-status').innerText(),/37 candidates in regular-wythoff-and-scaliform.*Other completions are not excluded/);
    assert.equal(await page.locator('#construct-from-vertex-figure').isDisabled(),true);
    await openModel(await compute({op:'generate',params:{kind:'regular',key:'tetrahedron'}}));await search();
    assert.equal(await page.locator('#vertex-figure-candidate').inputValue(),'');assert.equal(await page.locator('#construct-from-vertex-figure').isDisabled(),true);
    assert.equal(await page.locator('#vertex-figure-candidate option').count(),7);
    await page.selectOption('#vertex-figure-candidate','regular:simplex4');assert.equal(await page.locator('#construct-from-vertex-figure').isDisabled(),false);
    assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('expert-mode')),false);
    assert.deepEqual(errors,[]);assert.equal(stderr,'');
    const hidden=await browser.newPage();await hidden.exposeFunction('nativeEngine',compute);
    await hidden.addInitScript(()=>{window.polytope={engine:request=>window.nativeEngine(request),cancel:async()=>{},setDirty:async()=>{},setWorkspaceAvailability:async()=>{},onAction(){},libraries:async()=>({libraries:[],errors:[]}),recoveryInfo:async()=>null,startupInfo:async()=>({hidden:true}),autosave:async()=>{},recentFiles:async()=>({files:[]})};});
    await hidden.goto(address);await hidden.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract');
    for(const id of ['vertex-figure-search','vertex-figure-domain','construct-from-vertex-figure','vertex-figure-search-evidence']){await reveal(hidden,'#'+id);assert.equal(await hidden.locator('#'+id).isVisible(),true);}
    await hidden.close();
  }finally{await browser?.close();await server.close();lines.close();engine.kill();for(const job of pending.values())job.reject(Error('Test complete.'));}
});
