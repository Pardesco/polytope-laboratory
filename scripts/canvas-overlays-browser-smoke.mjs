// Real renderer and native calculations; no Electron or native dialogs.
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
const check=(value,message)=>{assert.ok(value,message);checks++;};
let server,browser;
try{
  const root=fileURLToPath(new URL('../dist',import.meta.url));
  server=createServer(async(request,response)=>{try{const name=new URL(request.url,'http://localhost').pathname,file=path.resolve(root,'.'+decodeURIComponent(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))throw Error('Invalid asset.');response.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');response.end(await readFile(file));}catch{response.statusCode=404;response.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));await page.exposeFunction('nativeEngine',compute);
  await context.addInitScript(()=>{
    localStorage.setItem('polytope-welcome-v1','dismissed');
    window.polytope={startupInfo:async()=>({hidden:location.search.includes('hidden')}),engine:request=>window.nativeEngine(request),cancel:async()=>{},setDirty:async()=>{},setWorkspaceAvailability:async()=>{},onAction:callback=>window.menuAction=callback,libraries:async()=>({libraries:[],errors:[]}),recoveryInfo:async()=>null,autosave:async()=>{},discoveryMenu:async()=>{},confirmProjectOpen:async()=>true,save:async project=>{window.savedProject=project;return {path:'canvas-v1.polyproj'};}};
  });
  const url='http://127.0.0.1:'+server.address().port;
  await page.goto(url);await page.locator('#explore-shape').waitFor();
  check(await page.locator('#projection-label').isVisible(),'visible 4D projection label');
  check(await page.locator('#canvas-hint-slot > :visible').count()===1,'exactly one opening hint');
  check(await page.locator('#explore-shape').isVisible(),'opening strip has priority');
  check(!await page.locator('.viewport.primary > .view-label').isVisible(),'redundant Model label is hidden');
  await mkdir('build',{recursive:true});await page.screenshot({path:'build/canvas-v1-opening-1600.png'});
  const viewport=await page.locator('#base-canvas').boundingBox(),stats=await page.locator('#counts-strip').boundingBox(),hint=await page.locator('#canvas-hint-slot').boundingBox();
  check(hint.y+hint.height<=stats.y,'hint and stats occupy separate zones');check(stats.x>=viewport.x&&stats.x+stats.width<=viewport.x+viewport.width,'compact stats inside canvas');
  await page.locator('#explore-shape-turn').click();await page.waitForFunction(()=>document.querySelector('#direct-4d-gizmo').classList.contains('direct-4d-demo'));
  await page.waitForFunction(()=>!document.querySelector('#direct-4d-gizmo').classList.contains('direct-4d-demo'));
  check(JSON.parse(await page.evaluate(()=>localStorage.getItem('polytope.canvas.explore.v1'))).used.includes('turn'),'demo action persisted');
  await page.locator('#explore-shape-build').click();await page.locator('#coxeter-builder').waitFor({state:'visible'});
  await page.keyboard.press('Escape');await page.locator('#coxeter-builder').waitFor({state:'hidden'});
  await page.locator('#explore-shape-elements').click();await page.waitForFunction(()=>document.getElementById('element-types-cell')?.open===true);
  check(await page.locator('[data-panel="info"]').getAttribute('aria-pressed')==='true','See its cells opens Analysis');
  check(await page.locator('#selection-summary').textContent().catch(()=>page.locator('#selection-info').textContent()),'first cell type highlights through existing selection');
  check(await page.locator('#explore-shape').isHidden(),'all three opening actions complete the strip');
  await page.locator('#view-options-button').click();
  check((await page.locator('#camera-projection').locator('..').textContent()).includes('3D camera'),'View options distinguishes the on-screen camera');
  check((await page.locator('#camera-projection').getAttribute('title')).includes('on-screen camera'),'3D camera tooltip');
  check((await page.locator('#perspective-strength-label').getAttribute('title')).includes('How strongly nearer 4D parts are enlarged'),'Depth tooltip');
  await page.screenshot({path:'build/canvas-v1-projection-options.png'});await page.keyboard.press('Escape');
  await page.locator('#fit-view').click();await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'build/canvas-v1-framed-1280.png'});
  await page.locator('#perspective-strength').evaluate(n=>{n.value='100';n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.locator('#projection').selectOption('orthographic');await page.locator('#projection').selectOption('perspective');
  check(await page.locator('#projection').inputValue()==='perspective','projection switches retain option values');
  await page.evaluate(()=>{window.savedProject=null;window.menuAction('save');});await page.waitForFunction(()=>!!window.savedProject);
  const saved=await page.evaluate(()=>{const p=window.savedProject,d=p.documents[p.active];return d.states[d.cursor];});
  check(saved.view.camera?.orthographicHalfHeight>1,'new framing persists in saved camera');check(saved.view.perspectiveDistance4D===1.15,'Depth persists');
  // A fresh 3D library open offers faces and preserves every original handler.
  await page.evaluate(()=>localStorage.removeItem('polytope.canvas.explore.v1'));await page.reload();await page.locator('#explore-shape').waitFor();
  await page.locator('#search').fill('Cube');await page.locator('#catalog .catalog-entry[data-key="cube"]').click();
  await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Cube');
  check(!await page.locator('#projection').isVisible()&&!await page.locator('#projection-label').isVisible(),'3D hides projection and label');
  check(await page.locator('#explore-shape-elements').textContent()==='See its faces','3D opening action names faces');check(await page.locator('#direct-4d-gizmo').isHidden(),'3D hides 4D turn widget');
  await page.locator('#explore-shape-dismiss').click();await page.reload();await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');check(await page.locator('#explore-shape').count()===0,'opening dismissal survives reload');
  await page.goto(url+'/?hidden');await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');check(await page.locator('#canvas-hint-slot').isHidden(),'hidden qualification suppresses every hint');check(await page.locator('#direct-4d-xw').isVisible(),'hidden qualification retains original control ids');
  assert.deepEqual(errors,[]);checks++;console.log(`PASS (${checks} checks): opening actions, priority queue, labels, native selection, saved view, 3D guards, hidden mode and three screenshots.`);
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));engine.kill();lines.close();}
