// Mounted renderer + real native engine; never launches Electron.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const engine=spawn('python',['engine/server.py'],{stdio:['pipe','pipe','pipe'],windowsHide:true}),pending=new Map();let next=0,checks=0;
const lines=createInterface({input:engine.stdout});lines.on('line',line=>{const result=JSON.parse(line),job=pending.get(result.id);if(!job)return;pending.delete(result.id);result.ok?job.resolve(result.result):job.reject(Error(result.error));});engine.stderr.on('data',data=>process.stderr.write(data));
const compute=request=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});engine.stdin.write(JSON.stringify({...request,id})+'\n');});
const check=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
let server,browser;
try{
  const root=fileURLToPath(new URL('../dist',import.meta.url));
  server=createServer(async(request,response)=>{try{const name=new URL(request.url,'http://localhost').pathname,file=path.resolve(root,'.'+decodeURIComponent(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))throw Error('Invalid asset.');response.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');response.end(await readFile(file));}catch{response.statusCode=404;response.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const errors=[];
  async function pageFor({empty=false}={}){
    const page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));await page.exposeFunction('nativeEngine',compute);
    await page.addInitScript(({empty})=>{
      window.polytope={startupInfo:async()=>({hidden:true}),engine:request=>empty&&request.op==='catalog'?Promise.reject(Error('Empty library fixture')):window.nativeEngine(request),cancel:async()=>{},setDirty:async value=>{window.lastDirty=value;},setWorkspaceAvailability:async()=>{},onAction:callback=>{window.menuAction=callback;},libraries:async()=>({libraries:[],errors:[]}),recoveryInfo:async()=>null,save:async project=>{window.savedProject=project;return {path:'builder.polyproj'};},autosave:async()=>{},discoveryMenu:async()=>{}};
    },{empty});await page.goto('http://127.0.0.1:'+server.address().port);return page;
  }
  const page=await pageFor();await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract').catch(async error=>{console.error({errors,status:await page.locator('#status').textContent(),name:await page.locator('#model-name').textContent()});throw error;});
  await page.waitForFunction(()=>document.getElementById('cancel').hidden);
  await page.evaluate(()=>window.openCoxeterBuilder());await page.waitForFunction(()=>!document.getElementById('coxeter-builder-open').disabled).catch(async error=>{console.error(await page.evaluate(()=>({open:document.getElementById('coxeter-builder').open,status:document.getElementById('coxeter-builder-status').textContent,global:document.getElementById('status').textContent})),errors);throw error;});
  check(await page.locator('#coxeter-builder-name').innerText(),'Cube');check(await page.locator('#model-name').innerText(),'Tesseract');check(await page.locator('#history-list button').count(),1);check(await page.locator('#coxeter-builder-preview').isVisible(),true);
  check(await page.locator('#coxeter-builder-families [data-family]').count(),8);check(await page.locator('#coxeter-builder [data-expert]').count(),1);
  await page.locator('#coxeter-builder-node-0').press('ArrowRight');check(await page.evaluate(()=>document.activeElement.id),'coxeter-builder-node-1');
  await page.keyboard.press('Space');await page.waitForFunction(()=>document.getElementById('coxeter-builder-name')?.textContent==='Truncated cube');
  await page.keyboard.press('Enter');await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Truncated cube');check(await page.locator('#history-list button').count(),2);check(await page.locator('#coxeter-builder').isVisible(),false);
  await page.locator('#undo').click();await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');await page.locator('#redo').click();await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Truncated cube');
  await page.evaluate(()=>window.menuAction('save'));await page.waitForFunction(()=>!!window.savedProject);
  const saved=await page.evaluate(()=>window.savedProject);check(saved.documents[saved.active].states.length,2);check(saved.documents[saved.active].operationHistory.nodes.at(-1).op,'generate');
  await page.keyboard.press('Control+k');await page.locator('#command-query').fill('Shape builder');await page.keyboard.press('Enter');await page.waitForFunction(()=>!document.getElementById('coxeter-builder-open').disabled);
  await page.locator('#coxeter-builder-family-H3').click();await page.waitForFunction(()=>document.getElementById('coxeter-builder-name')?.textContent==='Dodecahedron');await page.locator('#coxeter-builder-snub').check();await page.waitForFunction(()=>!document.getElementById('coxeter-builder-open').disabled);check((await page.locator('#coxeter-builder-counts').innerText()).includes('60 vertices'),true);await page.locator('#coxeter-builder-hand').click();await page.waitForFunction(()=>!document.getElementById('coxeter-builder-open').disabled);
  await page.locator('#coxeter-builder-family-A4').click();await page.waitForFunction(()=>document.getElementById('coxeter-builder-name')?.textContent==='5-cell');check(await page.locator('#coxeter-builder-counts').innerText(),'5 vertices · 10 edges · 10 faces · 5 cells');
  await page.locator('#coxeter-builder-family-D4').click();await page.waitForFunction(()=>!document.getElementById('coxeter-builder-open').disabled);check(await page.locator('#coxeter-builder-diagram line').count(),3);check(await page.locator('#coxeter-builder-diagram [data-node]').count(),4);
  check(await page.locator('#coxeter-builder-open').evaluate(n=>{const r=n.getBoundingClientRect();return r.bottom<=innerHeight&&r.right<=innerWidth;}),true);
  await mkdir('build',{recursive:true});await page.screenshot({path:'build/coxeter-builder-1280.png'});await page.setViewportSize({width:1600,height:1000});await page.screenshot({path:'build/coxeter-builder-1600.png'});
  await page.locator('#coxeter-builder-close').click();check(await page.locator('#coxeter-builder-preview').isVisible(),false);check(await page.locator('#model-name').innerText(),'Truncated cube');
  await page.evaluate(()=>window.openCoxeterBuilder());await page.waitForFunction(()=>!document.getElementById('coxeter-builder-open').disabled);await page.locator('#undo').click();await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');check(await page.locator('#coxeter-builder').isVisible(),false);
  await page.waitForFunction(()=>document.getElementById('cancel').hidden);await page.evaluate(()=>window.openCoxeterBuilder());await page.locator('#coxeter-builder-family-H4').click();await page.locator('#coxeter-builder-node-3').click();
  await page.waitForFunction(()=>document.getElementById('coxeter-builder-name')?.textContent==='Runcinated 120-cell',null,{timeout:120000});
  check((await page.locator('#coxeter-builder-counts').innerText()).includes('2,400 vertices'),true);await page.screenshot({path:'build/coxeter-builder-dense-H4.png'});
  await page.locator('#coxeter-builder-open').click();await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Runcinated 120-cell',null,{timeout:120000});check(await page.locator('#history-list button').count(),2);
  await page.evaluate(()=>window.menuAction('save'));await page.waitForFunction(()=>window.savedProject?.documents[window.savedProject.active].states.at(-1).model.vertices.length===2400);check(await page.evaluate(()=>window.savedProject.documents[window.savedProject.active].operationHistory.nodes.at(-1).params.kind),'coxeter-builder');
  await page.locator('#undo').click();await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');await page.locator('#redo').click();await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Runcinated 120-cell');
  await page.close();const empty=await pageFor({empty:true});await empty.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Choose a model');await empty.evaluate(()=>window.openCoxeterBuilder());await empty.waitForFunction(()=>!document.getElementById('coxeter-builder-open').disabled);await empty.locator('#coxeter-builder-open').click();await empty.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Cube');check(await empty.locator('#history-list button').count(),1);await empty.close();
  check(errors,[]);console.log(`PASS (${checks} assertions): mounted diagram, native preview, keyboard commit, Undo/Redo, saved history, palette, snubs/mirror, 4D/D4, dense H4 generation commit, 1280/1600 layout, navigation cancellation and empty workspace.`);
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));engine.kill();lines.close();}
