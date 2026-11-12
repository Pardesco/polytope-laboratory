import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {defaultDocumentView} from '../ui/default-look.mjs';
const {EnginePool}=createRequire(import.meta.url)('../desktop/engine-pool.cjs');
const sourceProject=(source,view={})=>({format:'polytope-laboratory',version:1,active:0,documents:[{id:'section-source',cursor:0,states:[{model:source,view:{...defaultDocumentView(source.dimension),derivedMode:'face',...view},notes:'Section source notes'}]}]});

test('expert-off app chooses surface/density/ordinary cells, promotes, saves and reopens native sections',{timeout:180000},async t=>{
 const {cases,openBoundary}=JSON.parse(execFileSync('python',['-B','-c',"import json,runpy;h=runpy.run_path('tests/test_section_choices.py');print(json.dumps(dict(cases=h['section_cases'](),openBoundary=h['open_boundary_source']())))"],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024}));
 const pool=new EnginePool({spawnWorker:()=>spawn('python',['-B','engine/server.py'],{stdio:['pipe','pipe','pipe'],windowsHide:true})}),queue=[],calls=[];let next=0,active=0,closed=false;
 const pump=()=>{while(!closed&&active<3&&queue.length){const job=queue.shift();active++;pool.run(job.request,job.id).then(job.resolve,job.reject).finally(()=>{active--;pump();});}};
 const compute=request=>new Promise((resolve,reject)=>{calls.push(request);queue.push({request,id:request.id??'section-test-'+(++next),resolve,reject});pump();});
 const server=await createServer({configFile:false,root:'ui',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0}});let browser;
 try{
  await server.listen();browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1500,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('nativeEngine',compute);await page.exposeFunction('nativeCancel',id=>{const job=queue.find(j=>j.id===id);if(job){queue.splice(queue.indexOf(job),1);job.reject(Error('Job canceled.'));}return pool.cancel(id);});
  await page.addInitScript(()=>{
   localStorage.setItem('polytope-welcome-v1','dismissed');localStorage.setItem('polytope.expert-tools.v1','false');
   window.polytope={engine:(r,id)=>window.nativeEngine({...r,id}),cancel:id=>window.nativeCancel(id),setDirty:async()=>{},setWorkspaceAvailability:async()=>{},onAction(){},
    libraries:async()=>({libraries:[],errors:[]}),recoveryInfo:async()=>null,startupInfo:async()=>({hidden:false}),autosave:async()=>{},recentFiles:async()=>({files:[]}),discoveryMenu:async()=>{},
    open:async()=>structuredClone(window.openResult),confirmProjectOpen:async()=>true,
    save:async project=>{window.saved=await window.nativeEngine({op:'validate-project',params:{project}});return {path:'section-choice.polyproj'};}};
  });
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port);
  await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract').catch(async error=>{throw Error(error.message+' '+JSON.stringify({errors,calls:calls.map(r=>r.op),text:(await page.locator('body').innerText()).slice(-2500)}));});
  await page.locator('#toggle-inspector').click();
  await mkdir('artifacts/section-choices',{recursive:true});
  for(const c of cases)await t.test(c.source.name,async()=>{
   const start=calls.length;
   await page.evaluate(project=>window.openResult={project,path:'section-source.polyproj'},sourceProject(c.source,{sectionNormal:c.normal,sectionOffset:c.offset}));await page.locator('#open').click();
   await page.waitForFunction(name=>document.getElementById('model-name')?.textContent===name,c.source.name);
   await page.locator('#view-options-button').click();await page.selectOption('#viewport-layout','split');await page.keyboard.press('Escape');
   await page.selectOption('#derived-mode','section');
   await page.locator('#section-normal').fill(c.normal.join(', '));await page.locator('#section-depth').fill(String(c.offset));await page.locator('#apply-section').click();
   await page.waitForFunction(()=>document.getElementById('derived-status').textContent.startsWith('Surface intersection'));
   assert.match(await page.locator('#section-density-interpretation').innerText(),/curves do not define a filled solid/);
   assert.equal(await page.locator('#section-density-mode').isVisible(),true);
   assert.deepEqual(await page.locator('#section-density-mode option').evaluateAll(nodes=>nodes.map(n=>n.value)),['surface','density','ordinary-cells','winding-cells']);
   assert.equal(await page.locator('#section-density-mode option[value="winding-cells"]').evaluate(n=>n.disabled),c.source.dimension!==4);
   assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('expert-mode')),false);
   assert.equal(await page.locator('#section-density-mode').evaluate(n=>!!n.closest('[data-expert]')),false);
   assert.equal(await page.locator('#density-section-settings').evaluate(n=>n.open||!!n.closest('[data-expert]')),false);
   await page.selectOption('#section-density-mode',c.choice);
   await page.waitForFunction(()=>!document.getElementById('promote').disabled&&!document.getElementById('derived-status').textContent.startsWith('Surface intersection')).catch(async error=>{throw Error(error.message+' '+JSON.stringify(await page.evaluate(()=>({status:document.getElementById('derived-status').textContent,interpretation:document.getElementById('section-density-interpretation').textContent}))))});
   assert.equal(await page.inputValue('#derived-mode'),c.choice==='ordinary-cells'?'cell-section':'section');
   if(c.choice==='density')assert.equal(await page.locator('#derived-mode option:checked').innerText(),'Section');
   assert.match(await page.locator('#section-density-interpretation').innerText(),c.choice==='density'?/signed winding/:/no global star interior inferred/);
   const requests=calls.slice(start).filter(r=>r.op==='section');assert.ok(requests.some(r=>r.params.section_domain===c.choice));
   if(c.choice==='ordinary-cells')await page.screenshot({path:'artifacts/section-choices/ordinary-filled.png'});
   await page.locator('#promote').click();
   await page.waitForFunction(name=>document.getElementById('model-name').textContent!==name,c.source.name);
   await page.evaluate(()=>window.saved=null);await page.locator('#save').click();await page.waitForFunction(()=>!!window.saved);
   const saved=await page.evaluate(()=>window.saved),adopted=saved.documents[saved.active],result=adopted.states[adopted.cursor].model;
   assert.ok(result.faces.length);assert.notEqual(result.interpretation,'surface-section');assert.equal(result.numeric.certified,false);
   assert.ok(adopted.operationHistory,JSON.stringify({choice:c.choice,name:result.name,view:adopted.states[adopted.cursor].view,calls:calls.slice(start).map(r=>({op:r.op,params:r.op==='section'?r.params:undefined})),notices:await page.locator('#toast').innerText()}));
   assert.equal(adopted.operationHistory.nodes.at(-1).params.section_domain,c.choice);
   assert.deepEqual(adopted.states[0].model.vertices,JSON.parse(JSON.stringify(c.source.vertices)));
   assert.equal(adopted.states[adopted.cursor].notes,'Section source notes');
   if(c.source.dimension===3)assert.equal(result.metadata.densitySection.regions.length,2);
   await page.locator('#undo').click();await page.waitForFunction(name=>document.getElementById('model-name').textContent===name,c.source.name);
   await page.locator('#redo').click();
   await page.evaluate(()=>{window.openResult={project:window.saved,path:'section-choice.polyproj'};window.saved=null;});await page.locator('#open').click();
   await page.waitForFunction(name=>document.getElementById('model-name').textContent===name,result.name);
   await page.locator('#save').click();await page.waitForFunction(()=>!!window.saved);
   assert.deepEqual(await page.evaluate(()=>{const p=window.saved,d=p.documents[p.active];return d.states[d.cursor].model;}),result);
   await page.evaluate(()=>window.saved=null);
  });
  await t.test('unsupported density fill shows native refusal and disables promotion without switching to surface',async()=>{
   await page.evaluate(project=>window.openResult={project,path:'open-boundary.polyproj'},sourceProject(openBoundary));await page.locator('#open').click();
   await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Two separated cubes');
   await page.locator('#view-options-button').click();await page.selectOption('#viewport-layout','split');await page.keyboard.press('Escape');
   await page.selectOption('#derived-mode','section');
   await page.selectOption('#section-density-mode','density');
   await page.waitForFunction(()=>document.getElementById('derived-status').textContent.includes('two distinct incident faces'));
   assert.match(await page.locator('#section-density-interpretation').innerText(),/two distinct incident faces/);
   assert.equal(await page.locator('#promote').isDisabled(),true);assert.equal(await page.inputValue('#section-density-mode'),'density');
   await page.selectOption('#section-density-mode','surface');await page.waitForFunction(()=>document.getElementById('derived-status').textContent.startsWith('Surface intersection')).catch(async error=>{throw Error(error.message+' '+await page.locator('#derived-status').innerText());});
   assert.doesNotMatch(await page.locator('#section-density-interpretation').innerText(),/two distinct incident faces/);
   assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('expert-mode')),false);
  });
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server.close();closed=true;for(const job of queue.splice(0))job.reject(Error('Section test closed.'));pool.dispose();}
});
