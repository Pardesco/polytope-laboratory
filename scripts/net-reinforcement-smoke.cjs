// Root-only actual mounted reinforcement desktop qualification.
// --self-test checks native production dispatch and launches no Electron process.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {guardRuntime}=require('./layer-join-smoke.cjs'),{native}=require('./automatic-faceting-smoke.cjs');
const root=path.resolve(__dirname,'..'),clone=structuredClone,hash=x=>createHash('sha256').update(x).digest('hex');
const active=p=>{const d=p.documents[p.active];return d.states[d.cursor];};
const same=(a,b)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
const nativeOne=request=>{const reply=native([request])[0];assert.equal(reply.ok,true,reply.error);return reply.result;};
function cube(){const m=nativeOne({op:'generate',params:{kind:'regular',key:'cube'}});m.name='Independent reinforcement cube';m.metadata.coordinateUnits='mm';m.metadata.offColors={faces:m.faces.map((_,i)=>i%2?{encoding:'unit',values:[.2,.4,.6,.35]}:{encoding:'byte',values:[20,60,200,128]}),cells:[]};return m;}
const cycles=[[0,1,7,6],[0,3,5]];
async function selfTest(){
  const source=cube(),reply=nativeOne({op:'net-reinforcement',model:source,params:{netParameters:{edge_length_mm:20,tabs:true},cycles}});
  assert.equal(reply.panels.length,2);assert.ok(Math.abs(reply.panels[0].areaMm2-400*Math.SQRT2)<1e-8);
  const pages=nativeOne({op:'net-reinforcement-pages',model:source,params:{state:reply}});assert.equal(pages.pages.length,2);assert.equal(pages.scale,1);
  const report=nativeOne({op:'net-measurements',model:source,params:{netParameters:{edge_length_mm:20},cycles,unit:'in'}});
  for(const row of report.report.rows.filter(r=>r.kind==='edge-length'))assert.ok(Math.abs(row.value-20/25.4)<1e-10);
  same(source,reply.source);console.log('Reinforcement desktop smoke self-test PASS: actual production native supports/pages/unit exports. No GUI launched.');
}
async function main(){
  const runtime=await guardRuntime(),{_electron:electron}=require('playwright'),artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));
  await fs.mkdir(artifacts,{recursive:true});const folder=await fs.mkdtemp(path.join(artifacts,'net-reinforcement-smoke-'));
  const profile=path.join(folder,'profile');await fs.mkdir(profile);await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
  const checks=[],errors=[],files=[];let page,group='startup',serial=0;
  try{
    page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
    await page.waitForFunction(()=>document.getElementById('net-reinforcement-settings')&&document.getElementById('model-name').textContent==='Tesseract');
    await page.evaluate(()=>{window.supportStatuses=[];new MutationObserver(()=>window.supportStatuses.push(document.getElementById('status').textContent)).observe(document.getElementById('status'),{childList:true,subtree:true,characterData:true});});
    await app.evaluate(({ipcMain})=>{const original=ipcMain._invokeHandlers.get('engine');globalThis.supportHarness={original,rows:[],hold:false,ready:false,release:null};ipcMain.removeHandler('engine');ipcMain.handle('engine',async(event,request,id)=>{const result=await original(event,request,id),h=globalThis.supportHarness;if(request.op.startsWith('net-reinforcement')||request.op==='net-measurements')h.rows.push({request:structuredClone(request),result:structuredClone(result)});if(h.hold&&request.op==='net-reinforcement'){h.hold=false;h.ready=true;await new Promise(resolve=>h.release=resolve);}return result;});});
    const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
    const controls=async()=>{if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();await page.locator('[data-panel="net"]').click();if(!await page.locator('#net-reinforcement-settings').evaluate(n=>n.open))await page.locator('#net-reinforcement-settings > summary').click();};
    const dialog=async file=>app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
    const save=async label=>{await done();const file=path.join(folder,`${++serial}-${label}.polyproj`);await dialog(file);await page.locator('#save').click();await page.waitForFunction(file=>window.supportStatuses.includes('Saved '+file),file);await done();return {file,project:JSON.parse(await fs.readFile(file,'utf8'))};};
    const open=async file=>{await done();const offset=await page.evaluate(()=>window.supportStatuses.length);await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#open').click();await page.waitForFunction(({file,offset})=>window.supportStatuses.slice(offset).includes('Opened '+file),{file,offset});await done();await page.waitForFunction(()=>document.getElementById('net-fold-evidence').textContent.includes('Full fold checked:'));await done();};
    const action=async name=>{await controls();await page.evaluate(()=>{document.getElementById('reinforcement-status').dataset.status='awaiting';});await page.locator('#reinforcement-'+name).click();await page.waitForFunction(()=>document.getElementById('reinforcement-status').dataset.status==='complete'&&!document.getElementById('reinforcement-build').disabled);await done();};
    const last=()=>app.evaluate(()=>structuredClone(globalThis.supportHarness.rows.at(-1)));
    const initial=await save('startup'),fixture=clone(initial.project);fixture.active=0;fixture.documents=[{id:'support-fixture',cursor:0,states:[{model:cube(),view:{coordinateUnit:'mm',derivedMode:'net',net:{root:0,length:20,tabs:true,display:'layout',fraction:0,action:'move',component:0}},notes:'Retain independent support source notes'}]}];
    const file=path.join(folder,'source.polyproj');await fs.writeFile(file,JSON.stringify(fixture));await open(file);await controls();const before=await save('native-source'),source=active(before.project).model;
    group='actual-support-preview';await page.locator('#reinforcement-cycles').fill(JSON.stringify(cycles));await action('build');const reply=(await last()).result;
    assert.equal(reply.referenceEdgeLengthMm,20);assert.equal(reply.panels.length,2);same(reply.source,source);
    assert.equal(await page.locator('#reinforcement-chart svg polygon').count(),2);await page.locator('#reinforcement-chart').scrollIntoViewIfNeeded();
    const bounds=await page.locator('#reinforcement-chart').evaluate(panel=>{const svg=panel.querySelector('svg').getBoundingClientRect(),box=panel.getBoundingClientRect();return {svg:{width:svg.width,height:svg.height,left:svg.left,right:svg.right},panel:{width:box.width,left:box.left,right:box.right}};});
    await fs.writeFile(path.join(folder,'preview-viewport.json'),JSON.stringify(bounds,null,2));assert.ok(bounds.svg.width>=150&&bounds.svg.left>=bounds.panel.left-1&&bounds.svg.right<=bounds.panel.right+1,'Support preview must fit the visible inspector width.');
    await page.locator('#reinforcement-chart').screenshot({path:path.join(folder,'support-preview.png')});
    await action('save');const saved=await save('supports-saved');same(active(saved.project).model,source);assert.equal(active(saved.project).notes,active(before.project).notes);same(active(saved.project).model.metadata.offColors,source.metadata.offColors);
    await open(saved.file);await controls();assert.equal(await page.locator('#reinforcement-chart').isHidden(),true);await action('restore');same((await last()).result.panels,reply.panels);
    checks.push('Real internal rectangle/triangle SVG preview, physical E0, source vertex IDs, saved parameters/explicit restore and exact source/RGBA/notes preservation');
    group='real-file-exports';
    for(const format of ['svg','csv','json','pdf']){const destination=path.join(folder,'supports.'+format);await dialog(destination);await action(format);const bytes=await fs.readFile(destination);assert.ok(bytes.length);files.push({path:destination,sha256:hash(bytes)});
      if(format==='svg')assert.match(bytes.toString(),/data-source-vertex-ids="0 1 7 6"/);
      if(format==='csv')assert.match(bytes.toString(),/interior-dihedral/);
      if(format==='json'){const report=JSON.parse(bytes);assert.equal(report.referenceEdgeLengthMm,20);for(const row of report.rows.filter(r=>r.kind==='edge-length'))assert.equal(row.value,20);}
      if(format==='pdf'){assert.equal(bytes.subarray(0,5).toString(),'%PDF-');const oracle=spawnSync('python',['-B',path.join(root,'scripts','verify-reinforcement-pdf.py'),destination],{windowsHide:true,encoding:'utf8'});assert.equal(oracle.status,0,oracle.stderr);await fs.writeFile(path.join(folder,'pdf-vector-oracle.json'),oracle.stdout);}
    }
    checks.push('Actual SVG/CSV/JSON/native PDF file writes; independent PDF page and20mm/20sqrt2mm vector oracle; all source edge measurements exported at native E0');
    group='held-dialog-source-refusal';const refusedFile=path.join(folder,'must-not-write.svg');
    await app.evaluate(({dialog},file)=>{globalThis.supportDialog={ready:false,release:null};dialog.showSaveDialog=async()=>{globalThis.supportDialog.ready=true;await new Promise(resolve=>globalThis.supportDialog.release=resolve);return {canceled:false,filePath:file};};},refusedFile);
    await page.locator('#reinforcement-svg').click();await app.evaluate(()=>new Promise((resolve,reject)=>{const stop=Date.now()+15000,t=setInterval(()=>{if(globalThis.supportDialog.ready){clearInterval(t);resolve();}else if(Date.now()>stop){clearInterval(t);reject(Error('Native export did not reach held dialog.'));}},10);}));
    await page.locator('#model-unit').selectOption('cm');await app.evaluate(()=>globalThis.supportDialog.release());await page.waitForFunction(()=>['refused','user-cancelled'].includes(document.getElementById('reinforcement-status').dataset.status)&&!document.getElementById('reinforcement-build').disabled);await done();
    await assert.rejects(fs.access(refusedFile),{code:'ENOENT'});const afterRefusal=await save('dialog-refused');same(active(afterRefusal.project).model,source);assert.equal(active(afterRefusal.project).view.coordinateUnit,'cm');assert.equal(active(afterRefusal.project).notes,active(before.project).notes);
    checks.push('Held actual native export dialog refuses source-unit change before transactional disk write; user units, notes and RGBA/source remain intact');
    group='held-native-cancel';await open(saved.file);await controls();await page.locator('#reinforcement-cycles').fill(JSON.stringify(cycles));
    await app.evaluate(()=>Object.assign(globalThis.supportHarness,{hold:true,ready:false,release:null}));await page.locator('#reinforcement-build').click();
    await app.evaluate(()=>new Promise((resolve,reject)=>{const stop=Date.now()+15000,t=setInterval(()=>{if(globalThis.supportHarness.ready){clearInterval(t);resolve();}else if(Date.now()>stop){clearInterval(t);reject(Error('Native support response did not reach hold.'));}},10);}));
    await page.locator('#reinforcement-cancel').click();await app.evaluate(()=>globalThis.supportHarness.release());await page.waitForFunction(()=>document.getElementById('reinforcement-status').dataset.status==='user-cancelled'&&!document.getElementById('reinforcement-build').disabled);assert.equal(await page.locator('#reinforcement-chart').isHidden(),true);same(active((await save('canceled')).project).model,source);
    checks.push('Actual completed native support response cannot publish after cancellation');
    group='invalid-panel';await controls();await page.locator('#reinforcement-cycles').fill('[[0,1,3,2]]');await page.locator('#reinforcement-build').click();await page.waitForFunction(()=>document.getElementById('reinforcement-status').dataset.status==='refused'&&!document.getElementById('reinforcement-build').disabled);assert.equal(await page.locator('#reinforcement-svg').isDisabled(),true);assert.equal(await page.locator('#reinforcement-pdf').isDisabled(),true);same(active((await save('exterior-refused')).project).model,source);
    checks.push('Exterior source face refused as an internal support, without publish/save/export or geometry replacement');
    const rows=await app.evaluate(()=>structuredClone(globalThis.supportHarness.rows));await fs.writeFile(path.join(folder,'native-observed.json'),JSON.stringify(rows,null,2));for(const f of files)assert.equal(hash(await fs.readFile(f.path)),f.sha256);assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,packaged:Boolean(runtime.packaged),hidden:runtime.hidden,checks,files,pageErrors:errors,scope:'Bounded internal supporting polygons and measurements; no requirement-wide, installed baseline or physical assembly qualification'},null,2));console.log('Reinforcement desktop smoke PASS. Artifacts: '+folder);
  }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});const statuses=await page?.evaluate(()=>window.supportStatuses).catch(()=>undefined),nativeObserved=await app.evaluate(()=>globalThis.supportHarness?.rows).catch(()=>undefined);await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,group,error:error.stack,checks,statuses,nativeObserved,pageErrors:errors},null,2));console.error('Artifacts: '+folder);throw error;}
  finally{await app.evaluate(({ipcMain})=>{const h=globalThis.supportHarness;if(h){h.release?.();ipcMain.removeHandler('engine');ipcMain.handle('engine',h.original);}globalThis.supportDialog?.release?.();}).catch(()=>{});await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
if(require.main===module)(process.argv.includes('--self-test')?selfTest():main()).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={selfTest};
