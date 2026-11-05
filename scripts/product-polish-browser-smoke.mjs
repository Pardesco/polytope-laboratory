// Browser qualification of mounted controls against the real JSON-lines engine.
// Native file dialogs/menu delivery remain the desktop lead's qualification.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import assert from 'node:assert/strict';
const engine=spawn('python',['engine/server.py'],{stdio:['pipe','pipe','pipe'],windowsHide:true}),pending=new Map();let next=0;
const lines=createInterface({input:engine.stdout});lines.on('line',line=>{const result=JSON.parse(line),job=pending.get(result.id);if(!job)return;pending.delete(result.id);if(result.ok)job.resolve(result.result);else job.reject(Error(result.error));});
engine.stderr.on('data',data=>process.stderr.write(data));
function compute(request){return new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});engine.stdin.write(JSON.stringify({...request,id})+'\n');});}
let server,browser;
try{
  const root=fileURLToPath(new URL('../dist',import.meta.url));
  server=createServer(async(request,response)=>{try{const pathname=new URL(request.url,'http://localhost').pathname,file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid asset.');response.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');response.end(await readFile(file));}catch{response.statusCode=404;response.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  await page.exposeFunction('nativeEngine',compute);
  await page.addInitScript(()=>{localStorage.setItem('polytope-welcome-v1','dismissed');window.polytope={engine:request=>window.nativeEngine(request),cancel:async()=>{},setDirty:async()=>{},setWorkspaceAvailability:async()=>{},onAction:callback=>{window.menuAction=callback;},libraries:async()=>({libraries:[],errors:[]}),recoveryInfo:async()=>null,save:async project=>{window.savedProject=project;return {path:'browser-fixture.polyproj'};},autosave:async()=>{},discoveryMenu:async()=>{}};});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');

  async function command(query){await page.keyboard.press('Control+k');await page.locator('#command-query').fill(query);await page.keyboard.press('Enter');}
  await command('Model scale');
  const primary=['make-dual','add-dual','truncate','make-faces-regular'];
  for(const id of primary){assert.equal(await page.locator('#'+id).isVisible(),true,id);assert.equal(await page.locator('#'+id).evaluate(n=>{for(let p=n.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open)return true;return false;}),false,id+' is collapsed');}
  assert.equal(await page.locator('#fit-refine-controls #fitting-settings').count(),1);
  assert.equal(await page.locator('#facet-stellate-controls #automatic-faceting-settings').count(),1);
  assert.equal(await page.locator('#stellation-plane-settings').evaluate(n=>n.open),false);
  const audit=await page.evaluate(()=>{
    const groups=['face-conway-settings','face-surgery-settings','fitting-settings','faceting-diagram-settings','automatic-faceting-settings','stellation-cell-settings','add-dual-controls','element-types','printable-settings','project-metadata-settings'];
    return groups.flatMap(id=>Array.from(document.getElementById(id)?.querySelectorAll('button,input:not([type=checkbox]),select,textarea')??[]).flatMap(n=>{
      const name=n.getAttribute('aria-label')||Array.from(n.labels??[]).map(l=>l.textContent.trim()).join(' ')||(n.tagName==='BUTTON'?n.textContent.trim():'')||n.title;
      return !name?[{id:n.id,issue:'No accessible name'}]:[];
    }));
  });assert.deepEqual(audit,[]);
  await page.evaluate(()=>window.menuAction('help'));await page.locator('#help-search').fill('Constructions and source domains');await page.locator('#help-topic a').filter({hasText:'W12 FACE CONWAY ZONES'}).click();await page.waitForFunction(()=>document.querySelector('#help-topic pre')?.textContent.includes('Face subdivision'));assert.match(await page.locator('#help-topic pre').innerText(),/Conway/);await page.keyboard.press('Escape');
  await command('Open: Cube');await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Cube');
  await page.evaluate(()=>window.menuAction('export'));await page.waitForFunction(()=>document.querySelector('#export-dialog')?.open);
  const intrinsic=await page.locator('#export-format option[value=stl]').innerText();
  await page.locator('#export-kind').selectOption('printable');await page.waitForFunction(()=>document.querySelector('#export-format option[value=stl]')?.textContent==='STL \u00b7 binary printable mesh');
  assert.equal(await page.locator('#printable-ascii').isVisible(),true);
  assert.equal(await page.locator('#export-format option[value=obj]').innerText(),'OBJ \u00b7 grouped printable mesh');
  await page.locator('#printable-ascii').check();await page.waitForFunction(()=>document.querySelector('#export-format option[value=stl]')?.textContent==='STL \u00b7 ASCII printable mesh');
  await page.locator('#export-kind').selectOption('intrinsic');await page.waitForFunction(label=>document.querySelector('#export-format option[value=stl]')?.textContent===label,intrinsic);await page.keyboard.press('Escape');
  await command('Conway notation');await page.locator('#conway-notation').fill('tI');await page.locator('#conway-apply').click();await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Truncated icosahedron');
  await page.locator('[data-panel=info]').click();await page.waitForFunction(()=>!!document.getElementById('element-type-face-1'));
  const typesText=await page.locator('#element-types-face').innerText();assert.doesNotMatch(typesText,/type \d+\d+ \u00d7/);assert.match(typesText,/12 \u00d7 pentagon/);assert.match(typesText,/20 \u00d7 hexagon/);
  await command('Open: Tetrahedron');await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tetrahedron');
  await command('New symmetric diagram');await page.waitForFunction(()=>document.querySelector('#faceting-diagram-chart circle[tabindex=\"0\"]'));
  const pick=page.locator('#faceting-diagram-chart circle[data-source-vertex-id]').filter({has:page.locator('title')}).first();
  assert.equal(await pick.getAttribute('role'),'button');assert.match(await pick.getAttribute('aria-label'),/Select source vertex/);
  await pick.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('#faceting-diagram-pick')?.textContent.includes('Selected source vertex'));
  console.log('PASS: mounted grouping, four primary actions, accessible control names, offline note loading, binary/ASCII/OBJ labels, intrinsic restoration, Conway name and separated element types.');
  assert.deepEqual(errors,[]);
}finally{
  await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));engine.kill();lines.close();
}
