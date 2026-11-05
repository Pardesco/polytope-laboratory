const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {reveal}=require('./smoke-helpers.cjs');
const root=path.resolve(__dirname,'..'),visible=process.argv.includes('--visible');
async function main(){
  const folder=await fs.mkdtemp(path.join(root,'artifacts','export-workflow-')),profile=path.join(folder,'profile');await fs.mkdir(profile);
  await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const runtime=await require('./hidden-runtime.cjs').hiddenRuntime(),env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.POLYTOPE_TEST_MODE;
  if(!visible)env.POLYTOPE_TEST_MODE='hidden-no-focus';if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-python.exe');
  let app,page;const errors=[],checks=[];
  try{
    app=await electron.launch({executablePath:runtime.executablePath,args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
    await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
    await app.evaluate(({ipcMain})=>{
      const h=globalThis.geometryHarness={handlers:new Map(),tickets:[],events:[],ended:new Set()};
      for(const [channel,kind] of [['geometry-export-begin','begin'],['geometry-export-write','write'],['geometry-export-abort','abort']]){
        const original=ipcMain._invokeHandlers.get(channel);if(typeof original!=='function')throw Error('Geometry handlers required.');h.handlers.set(channel,original);ipcMain.removeHandler(channel);
        ipcMain.handle(channel,async(event,...args)=>{if(kind!=='begin')h.events.push({kind,id:args[0]});try{const result=await original(event,...args);if(kind==='begin'&&result)h.tickets.push(result.id);return result;}finally{if(kind!=='begin')h.ended.add(args[0]);}});
      }
    });
    page=await app.firstWindow();require('./smoke-helpers.cjs').autoReveal(page);page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
    const ready=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
    const preview=()=>page.waitForFunction(()=>document.getElementById('export-preview').dataset.status==='ready'&&!document.getElementById('confirm-export').disabled);
    const open=async()=>{await page.locator('#export').click();await reveal(page,'#export-format');await preview();};
    const saveDialog=async file=>app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async(...args)=>{globalThis.lastGeometrySaveOptions=args.at(-1);return {canceled:false,filePath:file};};},file);
    const write=async(format,name,unit='in',source='base',{staleClose=false}={})=>{
      await open();if(source!=='base')await page.locator('#export-source').selectOption(source);
      await page.locator('#export-format').selectOption(format);await page.locator('#export-units').selectOption(unit);await preview();
      if(staleClose){await page.locator('#export-dialog').evaluate(dialog=>dialog.dispatchEvent(new Event('close')));assert.equal(await page.locator('#confirm-export').isEnabled(),true);}
      const text=await page.locator('#export-preview').innerText(),file=path.join(folder,name+(format==='vrml'?'.wrl':'.'+format));await saveDialog(file);
      await page.locator('#confirm-export').click();await page.waitForFunction(file=>document.getElementById('status').textContent.startsWith('Exported '+file),file);
      return {file,text,data:await fs.readFile(file,'utf8')};
    };
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract'&&document.getElementById('cancel').hidden);
    await open();
    const availability=await page.locator('#export-format').evaluate(select=>Object.fromEntries(Array.from(select.options).map(option=>[option.value,!option.disabled])));
    // Intrinsic (default) export of a 4D model: only OFF/JSON carry cells; interchange formats (3MF/GLB/X3D, W16/printable) stay listed but disabled.
    assert.deepEqual(availability,{off:true,json:true,obj:false,stl:false,'3mf':false,dxf:false,vrml:false,pov:false,glb:false,x3d:false});
    assert.equal(await page.locator('#export-net').isDisabled(),true);assert.equal(await page.locator('#export-net-pdf').isDisabled(),true);
    assert.equal(await page.locator('#export-units option[value="mm"]').evaluate(option=>option.disabled),true);
    await page.screenshot({path:path.join(folder,'4d-formats.png')});await page.keyboard.press('Escape');
    checks.push('4D export offers OFF/JSON; unavailable formats, physical conversions and missing net output are disabled before file selection');
    await page.locator('[data-key="cube"]').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube'&&document.getElementById('cancel').hidden);
    await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();await page.locator('#transform-model-settings > summary').click();
    await page.locator('#model-unit').selectOption('mm');await page.locator('#reference-length').fill('25.4');await page.locator('#scale-reference').click();
    await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Transform of Cube'&&document.getElementById('cancel').hidden);
    const obj=await write('obj','one-inch-cube');
    const vertices=obj.data.split(/\r?\n/).filter(line=>line.startsWith('v ')).map(line=>line.split(/\s+/).slice(1).map(Number));
    assert.equal(vertices.length,8);assert.ok(vertices.flat().every(value=>Math.abs(Math.abs(value)-.5)<1e-10));
    const dxf=await write('dxf','inch-edges');assert.match(dxf.text,/faces and cells are omitted/);assert.match(dxf.data,/\$INSUNITS\n70\n1\n/);assert.equal(dxf.data.split('\n').filter(line=>line==='LINE').length,12);
    const stl=await write('stl','solid');assert.match(stl.text,/triangulated/);assert.equal(stl.data.split('\n').filter(line=>line.startsWith('facet normal')).length,12);
    const vrml=await write('vrml','meter-cube','m');assert.match(vrml.data,/#VRML V2.0/);
    assert.match((await app.evaluate(()=>globalThis.lastGeometrySaveOptions)).defaultPath,/\.wrl$/);
    const json=await write('json','inch-model');const model=JSON.parse(json.data);assert.equal(model.metadata.coordinateUnits,'in');assert.ok(model.vertices.flat().every(value=>Math.abs(Math.abs(value)-.5)<1e-10));
    checks.push('actual OBJ, DXF, STL, VRML and JSON outputs have checked coordinates, topology, units, extension and visible loss notices');
    const prior=path.join(folder,'canceled.obj');
    for(const close of ['escape','button','direct']){
      await fs.writeFile(prior,'prior literal file');await open();await page.locator('#export-format').selectOption('obj');await preview();
      await page.locator('#export-dialog').evaluate(dialog=>{window.geometryCloseBlock=event=>event.stopImmediatePropagation();dialog.addEventListener('close',window.geometryCloseBlock,true);});
      const before=await app.evaluate(()=>globalThis.geometryHarness.tickets.length);
      await app.evaluate(({dialog})=>{dialog.showSaveDialog=()=>new Promise(resolve=>{globalThis.resolveGeometryDialog=resolve;});});
      await page.locator('#confirm-export').click();assert.equal(await page.locator('#confirm-export').isDisabled(),true);
      if(close==='escape')await page.keyboard.press('Escape');else if(close==='button')await page.locator('#close-export').click();else await page.locator('#export-dialog').evaluate(dialog=>dialog.close());
      await page.waitForFunction(()=>!document.getElementById('export-dialog').open);
      await app.evaluate((_,file)=>{globalThis.resolveGeometryDialog({canceled:false,filePath:file});delete globalThis.resolveGeometryDialog;},prior);
      const terminal=await app.evaluate(async(_e,before)=>{const h=globalThis.geometryHarness,end=Date.now()+10000;while(h.tickets.length<=before||!h.ended.has(h.tickets[before])){if(Date.now()>end)throw Error('Late ticket did not terminate');await new Promise(r=>setTimeout(r,10));}const id=h.tickets[before];return h.events.filter(event=>event.id===id);},before);
      assert.equal(terminal.some(event=>event.kind==='write'),false);assert.equal(terminal.some(event=>event.kind==='abort'),true);
      await page.locator('#export-dialog').evaluate(dialog=>{dialog.removeEventListener('close',window.geometryCloseBlock,true);delete window.geometryCloseBlock;});
      assert.equal(await fs.readFile(prior,'utf8'),'prior literal file');
      await write('obj','after-cancel-'+close,'in','base',{staleClose:true});assert.equal(await fs.readFile(prior,'utf8'),'prior literal file');
    }
    checks.push('Escape, Close and programmatic close refuse late native tickets even with close events blocked; delayed old close events preserve a fresh preview and retry');
    await open();await preview();
    await app.evaluate(({dialog})=>{dialog.showSaveDialog=()=>new Promise(resolve=>{globalThis.resolveGeometryDialog=resolve;});});
    await page.locator('#confirm-export').click();
    await page.locator('#model-unit').evaluate(select=>{select.value='cm';select.dispatchEvent(new Event('change',{bubbles:true}));});
    await app.evaluate((_,file)=>{globalThis.resolveGeometryDialog({canceled:false,filePath:file});delete globalThis.resolveGeometryDialog;},prior);
    await page.waitForFunction(()=>document.getElementById('export-preview').dataset.status==='error');
    assert.equal(await fs.readFile(prior,'utf8'),'prior literal file');assert.match(await page.locator('#export-preview').innerText(),/units|changed/);
    await page.locator('#close-export').click();
    await page.locator('#model-unit').evaluate(select=>{select.value='mm';select.dispatchEvent(new Event('change',{bubbles:true}));});
    checks.push('source-unit changes while the native save dialog is held refuse publication and preserve the selected old file');
    await page.locator('#new').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract'&&document.getElementById('cancel').hidden);
    await page.locator('#viewport-layout').selectOption('split');await page.locator('#derived-mode').selectOption('section');
    await page.locator('#section-normal').fill('0,0,0,1');await page.locator('#section-depth').fill('0');await page.locator('#apply-section').click();
    await page.waitForFunction(()=>document.getElementById('derived-status').textContent.includes('8 vertices')&&document.getElementById('cancel').hidden);
    const section=await write('json','derived-section','model','derived');assert.equal(JSON.parse(section.data).dimension,3);assert.equal(JSON.parse(section.data).vertices.length,8);
    checks.push('a 4D source exports its selected 3D derived section without projecting or changing the original model');
    assert.deepEqual(errors,[]);await page.screenshot({path:path.join(folder,'workspace.png')});
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,version:await app.evaluate(({app})=>app.getVersion()),packaged:runtime.packaged,visible,checks,errors},null,2));
    console.log(JSON.stringify({folder,passed:true,checks},null,2));
  }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({error:error.stack,checks,errors},null,2));console.error('Artifacts:',folder);throw error;}
  finally{await app?.evaluate(({ipcMain})=>{const h=globalThis.geometryHarness;if(h)for(const [channel,handler] of h.handlers){ipcMain.removeHandler(channel);ipcMain.handle(channel,handler);}delete globalThis.geometryHarness;}).catch(()=>{});await app?.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
