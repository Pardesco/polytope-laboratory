// Renderer + real JSON-lines engine qualification, without Electron or native dialogs.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {reveal}=createRequire(import.meta.url)('./smoke-helpers.cjs');
const engine=spawn('python',['engine/server.py'],{stdio:['pipe','pipe','pipe'],windowsHide:true}),pending=new Map();let next=0,checks=0;
const lines=createInterface({input:engine.stdout});lines.on('line',line=>{const result=JSON.parse(line),job=pending.get(result.id);if(!job)return;pending.delete(result.id);result.ok?job.resolve(result.result):job.reject(Error(result.error));});
engine.stderr.on('data',data=>process.stderr.write(data));
const compute=request=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});engine.stdin.write(JSON.stringify({...request,id})+'\n');});
const check=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
let server,browser;
try{
  const root=fileURLToPath(new URL('../dist',import.meta.url));
  server=createServer(async(request,response)=>{try{const name=new URL(request.url,'http://localhost').pathname,file=path.resolve(root,'.'+decodeURIComponent(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))throw Error('Invalid asset.');response.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');response.end(await readFile(file));}catch{response.statusCode=404;response.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));await page.exposeFunction('nativeEngine',compute);
  await page.addInitScript(()=>{
    localStorage.setItem('polytope-welcome-v1','dismissed');
    window.polytope={startupInfo:async()=>({hidden:true}),engine:request=>window.nativeEngine(request),cancel:async()=>{},setDirty:async()=>{},setWorkspaceAvailability:async()=>{},onAction:callback=>window.menuAction=callback,libraries:async()=>({libraries:[],errors:[]}),recoveryInfo:async()=>null,autosave:async()=>{},save:async project=>{window.savedProject=project;return {path:'nets-flow.polyproj'};},
      beginTextExport:async options=>{window.exportOptions=options;return {id:'output-ticket'};},writeTextExport:async(id,data)=>{window.exportedData=data;return {path:'faces.dxf'};},abortTextExport:async()=>{},
      beginNetPrint:async(id,content)=>{window.printDocument=content;return {id};},commitNetPrint:async id=>{window.printCommitted=id;return {success:true};},abortNetPrint:async()=>{}};
  });
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract'&&document.getElementById('cancel').hidden);
  await page.locator('#toggle-inspector').click();await page.locator('[data-panel="net"]').click();
  check(await page.locator('#nets-step-1-title').innerText(),'1\nChoose net type');check(await page.locator('#net-rebuild').isDisabled(),true);check(await page.locator('#cell-net-build').isDisabled(),false);
  check(await page.locator('#nets-type-surface').isVisible(),true);await page.locator('#cell-net-build').click();await page.waitForFunction(()=>document.getElementById('cell-net-summary').textContent.includes('8 complete cells')&&document.getElementById('cancel').hidden);
  check(await page.locator('#cell-net-edit-settings').evaluate(n=>n.open),false);await (await reveal(page,'#cell-net-face')).fill('0');check(await page.locator('#cell-net-edit-settings').evaluate(n=>n.open),true);
  await mkdir('build',{recursive:true});await page.locator('#inspector-region').evaluate(n=>n.scrollTop=0);await page.screenshot({path:'build/nets-flow-4d.png'});
  async function open(key,name){await page.locator('#search').fill(key);await page.locator(`#catalog [data-key="${key}"]`).click();await page.waitForFunction(name=>document.getElementById('model-name').textContent===name&&document.getElementById('cancel').hidden,name);}
  await open('cube','Cube');check(await page.locator('#net-rebuild').isDisabled(),false);check(await page.locator('#cell-net-build').isDisabled(),true);check(await page.locator('#net-visible-surface').isDisabled(),true);
  await page.locator('#net-rebuild').click();await page.waitForFunction(()=>!document.getElementById('net-pack').disabled&&document.getElementById('cancel').hidden);
  check(await page.locator('#net-summary').innerText().then(t=>t.includes('6 faces')),true);check(await page.locator('#net-print').isEnabled(),true);check(await page.locator('#net-export-dxf').isEnabled(),true);
  await page.locator('#net-rearrange').click();await page.waitForFunction(()=>document.getElementById('cancel').hidden);await page.locator('#net-pack').click();await page.waitForFunction(()=>!document.getElementById('net-packed-pdf').disabled&&document.getElementById('cancel').hidden);
  check(await page.locator('#net-preview svg').count(),1);
  await page.locator('#net-export-dxf').click();await page.waitForFunction(()=>typeof window.exportedData==='string'&&document.getElementById('cancel').hidden);check(await page.evaluate(()=>window.exportOptions.format==='dxf'&&window.exportedData.includes('$INSUNITS')&&window.exportedData.includes('CUT')),true);
  await page.locator('#net-print').click();await page.waitForFunction(()=>!!window.printCommitted&&!document.getElementById('net-print').disabled);check(await page.evaluate(()=>window.printDocument.packed&&window.printDocument.content.every(svg=>svg.includes('mm'))),true);
  check(await page.locator('#net-export-actions button').evaluateAll(nodes=>{const boxes=nodes.map(n=>n.getBoundingClientRect());return boxes.every(b=>b.width>35&&Math.abs(b.top-boxes[0].top)<1)&&nodes.every(n=>n.scrollWidth<=n.clientWidth+1);}),true);
  check(await page.locator('#inspector-region').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
  await page.locator('#save').click();await page.waitForFunction(()=>!!window.savedProject);check(await page.evaluate(()=>{const d=window.savedProject.documents[window.savedProject.active],s=d.states[d.cursor];return Boolean(s.netHistory?.states.length&&s.netPages&&s.netLayout);}),true);
  await (await reveal(page,'#net-paper')).selectOption('letter');await page.locator('#net-paper-settings > summary').click();await page.locator('#net-print').scrollIntoViewIfNeeded();await page.screenshot({path:'build/nets-flow-print.png'});
  await page.locator('[data-panel="evidence"]').click();check(await page.locator('#advanced-checks h2').innerText(),'Checks');check(await page.locator('#advanced-model-information h2').innerText(),'Model information');
  check(await page.locator('#evidence-panel summary').allTextContents().then(names=>names.includes('Method notes')),false);
  await (await reveal(page,'#rational-points')).fill('0,0,0\n1,0,0\n0,1,0\n0,0,1');check(await page.locator('#advanced-exact-arithmetic').evaluate(n=>n.open),true);
  await page.locator('#inspector-region').evaluate(n=>n.scrollTop=0);await page.screenshot({path:'build/nets-flow-advanced.png'});
  await page.locator('[data-panel="net"]').click();await open('small-stellated-dodecahedron','Small stellated dodecahedron');check(await page.locator('#net-rebuild').isDisabled(),true);check(await page.locator('#net-visible-surface').isDisabled(),false);
  await page.locator('#net-visible-surface').click();await page.waitForFunction(()=>!document.getElementById('net-rebuild').disabled&&document.getElementById('cancel').hidden);check(await page.locator('#net-visible-surface').isDisabled(),true);
  await page.locator('#net-rebuild').click();await page.waitForFunction(()=>!document.getElementById('net-print').disabled&&document.getElementById('cancel').hidden);check(await page.locator('#net-summary').innerText().then(t=>t.includes('outer surface')),true);
  check(errors,[]);console.log(`PASS (${checks} assertions): real 4D/3D/visible-surface workflows, cards, saved layout, packing, output toolbar, Advanced and reveal at 1280px. No Electron launched.`);
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));engine.kill();lines.close();}
