// Packaged qualification only. Importing this file or --plan never launches Electron.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const E=require('./common-workflows-evidence.cjs');
const root=path.resolve(__dirname,'..');
const CASES=[
  ['startup','r7-desktop-startup','Fresh profile, retained IDs, Expert off and minimum-size layout'],
  ['dual','r7-desktop-dual','Catalog Cube → polar dual → undo/redo/reopen/replay'],
  ['truncate','r7-desktop-truncate','Catalog Cube → truncation → history round trip'],
  ['live-slider','r7-desktop-live-slider','Cancel/retry a live cut preview, Apply → history round trip'],
  ['measure','r7-desktop-measure','Intrinsic source distance with independent coordinate oracle'],
  ['surface-section','r7-desktop-surface-section','Literal generalized Cube face surfaces → section curves'],
  ['filled-section','r7-desktop-filled-section','Tesseract → filled convex section → promote/history'],
  ['density-section','r7-desktop-density-section','Generalized Cube → explicit Filled (density) → promote/history'],
  ['net','r7-desktop-net','Cube → unfold and inspect six-face net → SVG'],
  ['export-print','r7-desktop-export-print','3D print it → checked binary STL'],
  ['export-paper','r7-desktop-export-paper','Make a paper model → Nets → checked SVG'],
  ['export-picture','r7-desktop-export-picture','Save a picture → checked PNG'],
  ['export-video','r7-desktop-export-video','Make a video or GIF → short rotation WebM container'],
  ['export-software','r7-desktop-export-software','Use in other 3D software → checked GLB'],
  ['export-geometry','r7-desktop-export-geometry','Export model data → cancel/retry → checked OFF/JSON'],
  ['goursat','r7-desktop-goursat','Verified gax star → save/reopen → scale/history'],
  ['waterman4','r7-desktop-waterman4','Z4 squared radius 1 → expected 16-cell → scale/history'],
  ['via-snub','r7-desktop-via-snub','Cube via-snub ratio 0.5 → reopen → endpoint Replay'],
  ['faceting','r7-desktop-faceting','Bounded Cube source-face search → preview → adopt/history'],
  ['stellation-planes','r7-desktop-stellation-planes','Six arbitrary planes in explicit box → 27 regions → promote/history'],
  ['memory-add','r7-desktop-memory-add','Store Cube → add at relative scale 1/2 → history; immutable slot'],
  ['memory-blend','r7-desktop-memory-blend','Store Cube → blend at relative scale 1/2 → history; immutable slot'],
  ['dxf-boundary','r7-desktop-dxf-boundary','Cube → intrinsic DXF face boundary → six 3DFACE records'],
  ['png-environment','r7-desktop-png-environment','Import synthetic PNG environment → reopen → matching capture pixels'],
  ['legacy-ids','r7-desktop-legacy-ids','Retained common IDs reveal without Expert mode'],
  ['dialogs','r7-desktop-dialogs','Native Open/Save and export review cancellation/retry preserve source']
].map(([key,id,description])=>({key,id,description}));
const LEGACY_IDS=['make-dual','truncate','truncation','live-truncation-range','measure','measurement-ids','apply-section','section-normal','section-density-mode','net-rebuild','export','export-format','save','open','undo','redo','history-replay','generate-goursat-wythoff','generate-waterman4','dual-morph-method','faceting-search','stellation-arbitrary-planes','memory-add','memory-blend','dxf-export-profile','effects-image-import'];
const FROZEN=['ui','desktop','engine','dist','package.json','scripts/common-workflows-qualification.cjs','scripts/common-workflows-evidence.cjs','scripts/hidden-runtime.cjs','scripts/windows-hidden-window-watch.cjs','tests/fixtures/material-environment.json'];
const stamp=()=>new Date().toISOString();
async function json(file,value){await fs.writeFile(file,JSON.stringify(value,null,2)+'\n');}
async function runSession(runtime,config,folder){
  await fs.mkdir(folder,{recursive:true});const profile=path.join(folder,'profile');await fs.mkdir(profile);
  await json(path.join(profile,'linked-libraries.json'),{version:1,paths:[]});
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile,POLYTOPE_PYTHON:path.join(folder,'unavailable-python.exe')};
  delete env.ELECTRON_RUN_AS_NODE;delete env.POLYTOPE_TEST_MODE;
  if(config.mode==='hidden')env.POLYTOPE_TEST_MODE='hidden-no-focus';
  const result={...config,startedUtc:stamp(),passed:false,cases:[],pageErrors:[],consoleErrors:[],dialogPolicy:'Only native dialog choices are stubbed; geometry, storage and export handlers execute unchanged.'};
  let app,page,watch,current,sequence=0;
  const artifacts=[];
  const saveResult=()=>json(path.join(folder,'result.json'),result);
  const recordFile=async(file,format,model)=>{
    const proof={...await E.artifact(file),...(format?E.inspectOutput(format,await fs.readFile(file),model):{})};
    current.outputs.push(proof);artifacts.push(proof);return proof;
  };
  try{
    if(config.mode==='hidden')watch=await require('./windows-hidden-window-watch.cjs').startHiddenWindowWatch({executablePath:runtime.executablePath,evidencePath:path.join(folder,'native-watch.json')});
    const {_electron}=require('playwright');
    app=await _electron.launch({executablePath:runtime.executablePath,args:['--force-device-scale-factor='+config.scale],cwd:root,env,timeout:30000});
    result.platform=await app.evaluate(({app,screen})=>({packaged:app.isPackaged,version:app.getVersion(),os:process.getSystemVersion(),versions:process.versions,displays:screen.getAllDisplays().map(d=>({bounds:d.bounds,workArea:d.workArea,scaleFactor:d.scaleFactor}))}));
    assert.equal(result.platform.packaged,true);assert.equal(result.platform.version,runtime.version);
    await app.evaluate(({dialog,ipcMain})=>{
      const original=ipcMain._invokeHandlers.get('engine');if(!original)throw Error('Missing actual engine IPC');
      globalThis.commonHarness={rows:[],dialogs:[],pending:0};
      ipcMain.removeHandler('engine');ipcMain.handle('engine',async(event,...args)=>{
        const h=globalThis.commonHarness,request=args[0],row={op:request.op,params:request.params,sourceId:request.model?.id,startedUtc:new Date().toISOString()};h.rows.push(row);h.pending++;
        try{const result=await original(event,...args),m=result?.model??result;
          row.result={status:result?.status,name:m?.name,id:m?.id,counts:m?.vertices?['vertices','edges','faces','cells'].map(k=>m[k]?.length??0):null,
            numeric:m?.numeric,metadata:m?.metadata,diagnostics:result?.diagnostics,densityDiagnostics:result?.densityDiagnostics,value:result?.value,units:result?.units};return result;
        }catch(error){row.error=error.message;throw error;}finally{row.finishedUtc=new Date().toISOString();h.pending--;}
      });
      dialog.showMessageBox=async(...args)=>{const options=args.at(-1);globalThis.commonHarness.dialogs.push({kind:'message',options});return {response:1};};
    });
    page=await app.firstWindow();page.setDefaultTimeout(30000);
    page.on('pageerror',error=>result.pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')result.consoleErrors.push(message.text());});
    await page.waitForFunction(()=>!!document.body);
    await page.evaluate(()=>{
      const h=window.commonQualification={expertViolations:[],statuses:[]};
      if(document.body.classList.contains('expert-mode'))h.expertViolations.push({kind:'startup',time:performance.now()});
      new MutationObserver(records=>{for(const record of records)if((record.oldValue??'').split(/\s+/).includes('expert-mode')||document.body.classList.contains('expert-mode'))h.expertViolations.push({kind:'class-change',time:performance.now()});}).observe(document.body,{attributes:true,attributeFilter:['class'],attributeOldValue:true});
      new MutationObserver(()=>h.statuses.push(document.getElementById('status').textContent)).observe(document.getElementById('status'),{subtree:true,childList:true,characterData:true});
    });
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract'&&document.getElementById('cancel')?.hidden,null,{timeout:120000});
    const windows=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({visible:w.isVisible(),focused:w.isFocused(),minimum:w.getMinimumSize(),size:w.getSize(),content:w.getContentSize()})));
    result.initialWindows=await windows();
    await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0],[width,height]=w.getMinimumSize();if(!width||!height)throw Error('Declared minimum size missing');w.setSize(width,height);});
    result.minimumWindows=await windows();
    const idle=async()=>{
      await page.waitForFunction(()=>document.getElementById('cancel').hidden);
      const end=Date.now()+120000;while(await app.evaluate(()=>globalThis.commonHarness.pending)){assert.ok(Date.now()<end,'Native jobs did not settle');await new Promise(resolve=>setTimeout(resolve,50));}
      await page.waitForFunction(()=>document.getElementById('cancel').hidden);
    };
    const target=async selector=>{
      const node=await E.strictReveal(page,selector),box=await node.boundingBox();
      const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
      assert.ok(box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1,'Control clipped at minimum window: '+selector);
      current.actions.push({selector,box,viewport});return node;
    };
    const click=async id=>(await target('#'+id)).click();
    const fill=async(id,value)=>(await target('#'+id)).fill(String(value));
    const select=async(id,value)=>(await target('#'+id)).selectOption(value);
    const text=async id=>page.locator('#'+id).innerText();
    const until=async(id,fragment)=>page.waitForFunction(({id,fragment})=>document.getElementById(id).textContent.includes(fragment),{id,fragment},{timeout:120000});
    const dialog=async(kind,file,canceled=false)=>app.evaluate(({dialog},{kind,file,canceled})=>{
      dialog[kind==='save'?'showSaveDialog':'showOpenDialog']=async(...args)=>{
        globalThis.commonHarness.dialogs.push({kind,options:args.at(-1),canceled,path:file});
        return kind==='save'?{canceled,filePath:canceled?undefined:file}:{canceled,filePaths:canceled?[]:[file]};
      };
      return globalThis.commonHarness.dialogs.length;
    },{kind,file,canceled});
    const waitDialog=async before=>{
      const end=Date.now()+30000;while(await app.evaluate(n=>globalThis.commonHarness.dialogs.length<=n,before)){assert.ok(Date.now()<end,'Native dialog was not invoked');await new Promise(resolve=>setTimeout(resolve,25));}
    };
    const snapshot=()=>page.evaluate(()=>({expert:document.body.classList.contains('expert-mode'),expertViolations:window.commonQualification?.expertViolations,status:document.getElementById('status')?.textContent,toast:document.getElementById('toast')?.textContent,name:document.getElementById('model-name')?.textContent,derived:document.getElementById('derived-status')?.textContent,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth}));
    const step=async(label,fn)=>{
      const receipt={sequence:++sequence,label,startedUtc:stamp(),passed:false,outputs:[],actions:[],nativeStart:await app.evaluate(()=>globalThis.commonHarness.rows.length)},parent=current;current=receipt;parent.steps.push(receipt);
      try{await E.expertOff(page);receipt.value=await fn();await idle();await E.expertOff(page);receipt.passed=true;}
      catch(error){receipt.error=error.stack;throw error;}
      finally{
        receipt.finishedUtc=stamp();receipt.state=await snapshot().catch(error=>({error:error.message}));
        receipt.nativeEnd=await app.evaluate(()=>globalThis.commonHarness.rows.length).catch(()=>null);
        const name=String(receipt.sequence).padStart(3,'0')+'-'+label.replace(/[^a-z0-9]+/gi,'-').slice(0,80);
        try{await page.screenshot({path:path.join(folder,name+'.png'),timeout:15000});receipt.screenshot=await E.artifact(path.join(folder,name+'.png'));artifacts.push(receipt.screenshot);}
        catch(error){receipt.screenshotError=error.message;receipt.passed=false;}
        await json(path.join(folder,name+'.json'),receipt);current=parent;
        assert.equal(receipt.passed,true,receipt.error??receipt.screenshotError);
      }
    };
    const save=async label=>{
      const file=path.join(folder,String(++sequence).padStart(3,'0')+'-'+label+'.polyproj');await dialog('save',file);await click('save');await until('status','Saved '+file);await idle();
      await recordFile(file);return {file,project:JSON.parse(await fs.readFile(file,'utf8'))};
    };
    const reopen=async file=>{await dialog('open',file);const n=await page.evaluate(()=>window.commonQualification.statuses.length);await click('open');
      await page.waitForFunction(({file,n})=>window.commonQualification.statuses.slice(n).includes('Opened '+file),{file,n});await idle();};
    const choose=async key=>{
      await page.keyboard.press('Escape');
      if(await page.locator('body').evaluate(n=>n.classList.contains('library-hidden')))await click('toggle-library');
      if(await page.locator('#library-show-all').count()&&await page.locator('#library-show-all').isVisible())await click('library-show-all');
      await fill('search',key);const before=await text('model-name');await (await target('#catalog [data-key="'+key+'"]')).click();
      if(key==='cube')await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');
      else if(key==='tesseract')await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract');
      else await page.waitForFunction(before=>document.getElementById('model-name').textContent!==before,before);
      await idle();
    };
    const history=async(label,action,check=()=>{})=>{
      let source,built;
      await step(label+'-source',async()=>{source=E.active((await save(label+'-source')).project).model;});
      await step(label+'-apply',async()=>{await action();await idle();built=await save(label+'-built');const m=E.active(built.project).model,d=built.project.documents[built.project.active];await check(m,source);assert.ok(d.cursor>0&&d.states.length>1,'Operation must retain an undoable source snapshot');});
      await step(label+'-undo',async()=>{await click('undo');await idle();E.sameGeometry(E.active((await save(label+'-undo')).project).model,source);});
      await step(label+'-redo',async()=>{await click('redo');await idle();E.sameGeometry(E.active((await save(label+'-redo')).project).model,E.active(built.project).model);});
      await step(label+'-reopen',async()=>{await reopen(built.file);const p=(await save(label+'-reopened')).project;assert.deepEqual(E.active(p).model,E.active(built.project).model);});
      await step(label+'-replay',async()=>{const n=built.project.documents.length;await click('history-replay');await idle();const replayed=(await save(label+'-replayed')).project;
        assert.equal(replayed.documents.length,n+1,'Replay opens an independent document');E.sameGeometry(E.active(replayed).model,E.active(built.project).model);});
      return built;
    };
    const changed=async action=>{const before=await text('model-name');await action();await page.waitForFunction(before=>document.getElementById('model-name').textContent!==before,before,{timeout:120000});await idle();};
    const exportOpen=async goal=>{await click('export');await page.waitForFunction(()=>document.getElementById('export-dialog').open);await click('export-goal-'+goal);};
    const preview=()=>page.waitForFunction(()=>document.getElementById('export-preview').dataset.status==='ready'&&!document.getElementById('confirm-export').disabled,null,{timeout:120000});
    const geometryExport=async(goal,format)=>{
      const model=E.active((await save('export-'+format+'-source')).project).model;await exportOpen(goal);await select('export-focus-export-format',format);
      if(goal==='geometry')await select('export-units','model');await preview();
      const file=path.join(folder,String(++sequence).padStart(3,'0')+'-goal-'+goal+'.'+format);await dialog('save',file);await click('confirm-export');await until('status','Exported '+file);
      return recordFile(file,format,model);
    };
    const net=async()=>{await click('net-rebuild');await until('net-summary','6 faces');await idle();assert.ok(await page.locator('#net-svg svg').count()||await page.locator('#net-preview svg').count(),'Net SVG preview');};
    const netExport=async name=>{const file=path.join(folder,name+'.svg');await dialog('save',file);await click('net-export-svg');await until('status',file);return recordFile(file,'svg');};
    const picture=async name=>{await exportOpen('picture');await select('export-focus-png-size','viewport');const file=path.join(folder,name+'.png');await dialog('save',file);await click('export-goal-action');await until('status',file);await recordFile(file,'png');return file;};
    const routines={
      startup:async()=>step('startup',async()=>{
        assert.equal(result.initialWindows.length,1);assert.equal(result.initialWindows[0].visible,config.mode==='visible');if(config.mode==='hidden')assert.equal(result.initialWindows[0].focused,false);
        const w=result.minimumWindows[0];assert.deepEqual(w.size,w.minimum);const view=await snapshot();assert.ok(Math.abs(view.dpr-config.scale)<.02,'Requested device scale is active');assert.ok(view.scrollWidth<=view.width,'No horizontal page overflow');
        assert.match(page.url(),/^file:/,'Packaged file renderer required');
        if(await page.locator('#welcome-close').isVisible())await click('welcome-close');
        if(await page.locator('#auto-rotate').getAttribute('aria-pressed')==='true')await click('auto-rotate');
        if(await page.locator('body').evaluate(n=>n.classList.contains('inspector-hidden')))await click('toggle-inspector');
        for(const id of ['save','open','undo','redo','make-dual','truncate','measure','apply-section','net-rebuild','history-replay'])assert.equal(await page.locator('#'+id).count(),1,id);
        return {window:w,viewport:view};
      }),
      dual:async()=>{await choose('cube');await history('dual',()=>changed(()=>click('make-dual')),m=>assert.deepEqual([m.vertices.length,m.edges.length,m.faces.length],[6,12,8]));},
      truncate:async()=>{await choose('cube');await history('truncate',async()=>{await fill('truncation','1/3');await changed(()=>click('truncate'));},m=>assert.equal(m.vertices.length,24));},
      'live-slider':async()=>{await choose('cube');await step('live-preview-cancel-retry',async()=>{
        const before=E.active((await save('live-before')).project).model;await click('live-truncation-stop-1');await page.waitForFunction(()=>!document.getElementById('live-truncation-apply').disabled);
        await click('live-truncation-cancel');assert.deepEqual(E.active((await save('live-canceled')).project).model,before);
      });await history('live-slider',async()=>{await click('live-truncation-stop-2');await page.waitForFunction(()=>!document.getElementById('live-truncation-apply').disabled);await changed(()=>click('live-truncation-apply'));},m=>assert.equal(m.vertices.length,12));},
      measure:async()=>{await choose('cube');await step('source-measurement',async()=>{
        const m=E.active((await save('measure-source')).project).model,expected=Math.hypot(...m.vertices[0].map((v,i)=>v-m.vertices[1][i]));
        await select('measurement-kind','distance');await fill('measurement-ids','0, 1');await click('measure');await page.waitForFunction(()=>document.getElementById('measurement-result').dataset.status==='ready');
        const shown=await text('measurement-result');assert.ok(Math.abs(parseFloat(shown)-expected)<1e-5);return {shown,expected,residual:Math.abs(parseFloat(shown)-expected)};
      });},
      'surface-section':async()=>{await choose('cube');await history('literal-face-complex',async()=>{await click('copy-facets');await changed(()=>click('facet'));},m=>assert.equal(m.interpretation,'generalized-complex'));
        await step('surface-section',async()=>{await select('viewport-layout','split');await select('derived-mode','section');await select('section-density-mode','surface');await fill('section-normal','0,0,1');await fill('section-depth','0.137');await click('apply-section');await until('derived-status','Surface intersection');
          const saved=await save('surface-section');assert.equal(E.active(saved.project).view.densitySection?.enabled??false,false);return {status:await text('derived-status')};});},
      'filled-section':async()=>{await choose('tesseract');await step('filled-convex-section',async()=>{await select('viewport-layout','split');await select('derived-mode','section');await select('section-density-mode','surface');await fill('section-normal','0,0,0,1');await fill('section-depth','0');await click('apply-section');await page.waitForFunction(()=>!document.getElementById('promote').disabled&&document.getElementById('derived-status').textContent.includes('8 vertices'));});
        await history('filled-section-promote',()=>changed(()=>click('promote')),m=>assert.deepEqual([m.dimension,m.vertices.length,m.faces.length],[3,8,6]));},
      'density-section':async()=>{await choose('cube');await history('density-source-complex',async()=>{await click('copy-facets');await changed(()=>click('facet'));},m=>assert.equal(m.interpretation,'generalized-complex'));
        await step('explicit-density-fill',async()=>{await select('viewport-layout','split');await select('derived-mode','section');await fill('section-normal','0,0,1');await fill('section-depth','.137');await click('apply-section');await until('derived-status','Surface intersection');await select('section-density-mode','density');await page.waitForFunction(()=>!document.getElementById('promote').disabled&&!document.getElementById('derived-status').textContent.startsWith('Surface intersection'));assert.match(await text('section-density-interpretation'),/signed winding/);});
        await history('density-section-promote',()=>changed(()=>click('promote')),(m,source)=>{assert.equal(m.dimension,2);assert.ok(m.faces.length>0);const span=i=>Math.max(...source.vertices.map(p=>p[i]))-Math.min(...source.vertices.map(p=>p[i]));assert.ok(Math.abs(m.measure.content-span(0)*span(1))<1e-7);});},
      net:async()=>{await choose('cube');await step('net-six-faces',async()=>{await net();const saved=await save('net');assert.ok(E.active(saved.project).netLayout);await netExport('net');await reopen(saved.file);const restored=E.active((await save('net-reopened')).project);E.sameGeometry(restored.model,E.active(saved.project).model);assert.deepEqual(restored.view.net,E.active(saved.project).view.net);assert.equal(restored.netLayout.faces.length,6);});},
      'export-print':async()=>{await choose('cube');await step('export-print',()=>geometryExport('print','stl'));},
      'export-paper':async()=>{await choose('cube');await step('export-paper',async()=>{await exportOpen('paper');await click('export-goal-action');await net();await netExport('paper-goal');});},
      'export-picture':async()=>{await choose('cube');await step('export-picture',()=>picture('picture-goal'));},
      'export-video':async()=>{await choose('cube');await step('export-video',async()=>{
        for(const [id,value] of [['animation-duration','.25'],['animation-fps','8']]){await fill(id,value);await (await target('#'+id)).press('Tab');}
        await select('animation-plane','0');await fill('animation-turns','.125');await click('animation-rotation');await exportOpen('video');await select('export-focus-animation-format','webm');
        const file=path.join(folder,'video-goal.webm');await dialog('save',file);await click('export-goal-action');await until('animation-progress','Exported '+file);return recordFile(file,'webm');
      });},
      'export-software':async()=>{await choose('cube');await step('export-software',()=>geometryExport('software','glb'));},
      'export-geometry':async()=>{await choose('cube');await step('export-geometry-cancel',async()=>{await exportOpen('geometry');await preview();const file=path.join(folder,'canceled.off'),n=await dialog('save',file,true);await click('confirm-export');
        await waitDialog(n);await page.waitForFunction(()=>!document.getElementById('confirm-export').disabled);await assert.rejects(fs.access(file),{code:'ENOENT'});await page.keyboard.press('Escape');});
        for(const format of ['off','json'])await step('export-geometry-'+format,()=>geometryExport('geometry',format));},
      goursat:async()=>{await choose('cube');await step('goursat-gax-generate',async()=>{await select('goursat-wythoff-choice','goursat-wythoff-gax');await changed(()=>click('generate-goursat-wythoff'));const saved=await save('goursat');const m=E.active(saved.project).model;
        assert.deepEqual(['vertices','edges','faces','cells'].map(k=>m[k].length),[120,720,1200,600]);assert.equal(m.metadata.goursatVerification.status,'passed');await reopen(saved.file);assert.deepEqual(E.active((await save('goursat-reopened')).project).model,m);});
        await history('goursat-scale',async()=>{await fill('model-scale','2');await changed(()=>click('scale'));});},
      waterman4:async()=>{await choose('cube');await step('waterman4-generate',async()=>{await select('waterman4-lattice','Z4');await fill('waterman4-radius','1');await changed(()=>click('generate-waterman4'));const s=await save('waterman4');assert.deepEqual(['vertices','edges','faces','cells'].map(k=>E.active(s.project).model[k].length),[8,24,32,16]);await reopen(s.file);});
        await history('waterman4-scale',async()=>{await fill('model-scale','2');await changed(()=>click('scale'));});},
      'via-snub':async()=>{await choose('cube');await step('via-snub-reopen-replay',async()=>{
        const source=E.active((await save('snub-source')).project).model;await select('dual-morph-method','via-snub');await fill('dual-morph-ratio','.5');await click('dual-morph-apply');await until('dual-morph-result','0.500');
        const saved=await save('via-snub');assert.equal(E.active(saved.project).view.dualMorph.method,'via-snub');assert.deepEqual(E.active(saved.project).model,source);await reopen(saved.file);await until('dual-morph-result','0.500');
        await fill('dual-morph-ratio','1');await click('dual-morph-apply');await until('dual-morph-result','1.000');assert.match(await page.locator('#dual-morph-play').innerText(),/Replay/);await click('dual-morph-play');await click('dual-morph-pause');await click('dual-morph-reset');
        assert.deepEqual(E.active((await save('snub-reset')).project).model,source);
      });},
      faceting:async()=>{await choose('cube');await step('faceting-bounded-search',async()=>{
        await fill('faceting-max_face_vertices','4');await fill('faceting-node_limit','1024');await fill('faceting-result_limit','2');await click('faceting-candidates');await until('faceting-candidate-summary','complete:');await click('faceting-source-faces');await click('faceting-search');
        await page.waitForFunction(()=>document.getElementById('faceting-status').dataset.status==='complete');assert.equal(await page.locator('#faceting-result option').count(),1);await click('faceting-preview');await idle();return {status:await text('faceting-status')};
      });await history('faceting-adopt',()=>changed(()=>click('faceting-adopt')),m=>assert.equal(m.interpretation,'generalized-complex'));},
      'stellation-planes':async()=>{await choose('cube');await step('arbitrary-plane-arrangement',async()=>{
        await fill('stellation-arbitrary-planes','1,0,0,-1\n-1,0,0,-1\n0,1,0,-1\n0,-1,0,-1\n0,0,1,-1\n0,0,-1,-1');await fill('stellation-bounds-min','-3,-3,-3');await fill('stellation-bounds-max','3,3,3');await fill('stellation-region-limit','2048');await click('stellation-evaluate-arbitrary');await until('stellation-summary','Arbitrary planes');await until('stellation-summary','27 observed');
        const saved=await save('planes');assert.equal(E.active(saved.project).arrangement.unrestrictedEnumerationComplete,false);await reopen(saved.file);await click('stellation-cell-evaluate');await page.waitForFunction(()=>document.querySelector('#stellation-face-diagram svg'));
      });await history('stellation-promote',()=>changed(()=>click('stellation-face-base')),m=>assert.ok(Math.abs(m.measure.content-8)<1e-8));},
      'memory-add':async()=>memory(false),
      'memory-blend':async()=>memory(true),
      'dxf-boundary':async()=>{await choose('cube');await step('dxf-face-boundary',async()=>{
        const m=E.active((await save('dxf-source')).project).model;await click('export');await (await target('#export-all-formats > summary')).click();await select('export-kind','intrinsic');await select('export-format','dxf');await select('dxf-export-profile','boundary');await preview();
        const file=path.join(folder,'face-boundary.dxf');await dialog('save',file);await click('confirm-export');await until('status','Exported '+file);return recordFile(file,'dxf',m);
      });},
      'png-environment':async()=>{await choose('cube');await step('png-environment-import-reopen',async()=>{
        const fixture=require('../tests/fixtures/material-environment.json'),file=path.join(folder,'synthetic-panorama.png');await fs.writeFile(file,Buffer.from(fixture.pngBase64,'base64'));await recordFile(file,'png');
        await fill('effects-reflectivity','1');await click('effects-apply');await page.waitForFunction(()=>!document.getElementById('effects-apply').disabled);const baseline=await picture('environment-none');
        const chooserPromise=page.waitForEvent('filechooser');await click('effects-image-file');const chooser=await chooserPromise;await chooser.setFiles(file);
        await click('effects-image-import');await until('effects-image-status','32');const saved=await save('environment');assert.equal(E.active(saved.project).view.materialEffects.environmentAsset.width,32);
        const before=await picture('environment-before');await reopen(saved.file);const after=await picture('environment-after');
        const pixels=async file=>app.evaluate(({nativeImage},file)=>{const image=nativeImage.createFromPath(file);return {size:image.getSize(),pixels:image.toBitmap().toString('base64')};},file);
        assert.deepEqual(await pixels(after),await pixels(before),'Reopened PNG environment pixels');
        assert.notDeepEqual(await pixels(before),await pixels(baseline),'Imported environment must change captured pixels');
      });},
      'legacy-ids':async()=>{await choose('cube');for(const id of LEGACY_IDS)await step('legacy-'+id,async()=>{
        if(['apply-section','section-normal','section-density-mode'].includes(id)){await select('viewport-layout','split');await select('derived-mode','section');}
        if(['export-format','dxf-export-profile'].includes(id)){
          await click('export');await (await target('#export-all-formats > summary')).click();if(id==='dxf-export-profile'){await select('export-kind','intrinsic');await select('export-format','dxf');}
        }
        await target('#'+id);if(await page.locator('#export-dialog').evaluate(n=>n.open))await page.keyboard.press('Escape');
      });},
      dialogs:async()=>{await choose('cube');await step('native-open-save-cancel-retry',async()=>{
        const original=await save('dialogs-source'),source=E.active(original.project).model;
        const file=path.join(folder,'canceled-save.polyproj'),saveStart=await dialog('save',file,true);await click('save');await waitDialog(saveStart);await idle();await assert.rejects(fs.access(file),{code:'ENOENT'});
        const openStart=await dialog('open',original.file,true);await click('open');await waitDialog(openStart);await idle();assert.deepEqual(E.active((await save('after-cancel')).project).model,source);
        await reopen(original.file);await exportOpen('geometry');await preview();await page.keyboard.press('Escape');assert.equal(await page.locator('#export-dialog').evaluate(n=>n.open),false);
        await geometryExport('geometry','json');
      });}
    };
    async function memory(blend){
      await choose('cube');let slot;
      await step('memory-store',async()=>{await select('memory-slot','1');await click('memory-store');await page.waitForFunction(()=>document.getElementById('memory-slot').selectedOptions[0].textContent.includes('Cube'));slot=(await save('memory-source')).project.memories.slots[0];await fill('memory-scale','1/2');});
      const built=await history(blend?'memory-blend':'memory-add',async()=>{await changed(()=>click(blend?'memory-blend':'memory-add'));await until('memory-addition-result',blend?'Merged at relative scale 0.5':'Added at relative scale 0.5');},m=>{
        if(blend)assert.equal(m.faces.length,6);else{assert.equal(m.vertices.length,16);assert.deepEqual(m.vertices.slice(8),slot.state.model.vertices.map(p=>p.map(x=>x/2)));}
      });assert.deepEqual(built.project.memories.slots[0],slot,'Stored memory is immutable');
    }
    let startupPassed=false;
    for(const spec of CASES){
      current={...spec,startedUtc:stamp(),passed:false,steps:[],actions:[],outputs:[],nativeStart:await app.evaluate(()=>globalThis.commonHarness.rows.length)};result.cases.push(current);
      try{
        if(spec.key!=='startup'&&!startupPassed)throw Error('Blocked by failed startup; no common workflow can qualify');
        await page.keyboard.press('Escape');await routines[spec.key]();assert.ok(current.steps.length,'Case has actual steps');assert.ok(current.steps.every(s=>s.passed));await E.expertOff(page);current.passed=true;if(spec.key==='startup')startupPassed=true;
      }catch(error){current.error=error.stack;}
      finally{
        current.finishedUtc=stamp();
        current.nativeEnd=await app.evaluate(()=>globalThis.commonHarness.rows.length).catch(()=>null);
        if(!current.steps.length){try{const file=path.join(folder,spec.key+'-blocked.png');await page.screenshot({path:file,timeout:15000});current.screenshot=await E.artifact(file);}catch(error){current.screenshotError=error.message;}}
        await json(path.join(folder,spec.key+'-case.json'),current);await saveResult();
        console.log(config.id+' '+spec.id+': '+(current.passed?'PASS':'FAIL'));
      }
    }
    result.finalWindows=await windows();
    if(config.mode==='hidden')assert.ok(result.finalWindows.every(w=>!w.visible&&!w.focused),'Hidden windows stay hidden and unfocused');
    for(const proof of artifacts)assert.equal((await E.artifact(proof.file)).sha256,proof.sha256,'Receipt artifact changed: '+proof.file);
    result.artifactsVerified=artifacts.length;
  }catch(error){result.error=error.stack;if(page){try{const file=path.join(folder,'session-failure.png');await page.screenshot({path:file,timeout:15000});result.failureScreenshot=await E.artifact(file);}catch(captureError){result.screenshotError=captureError.message;}}}
  finally{
    if(app){
      result.native=await app.evaluate(()=>globalThis.commonHarness).catch(error=>({error:error.message}));
      await json(path.join(folder,'native-receipts.json'),result.native);
      if(page)result.finalState=await page.evaluate(()=>({expert:document.body.classList.contains('expert-mode'),violations:window.commonQualification?.expertViolations})).catch(error=>({error:error.message}));
      await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});
    }
    if(watch){try{result.nativeWatch=await watch.stop();assert.equal(result.nativeWatch.violations,0);assert.equal(result.nativeWatch.eventHooksArmed,true);assert.ok(result.nativeWatch.checks>=10);}catch(error){result.error=[result.error,error.stack].filter(Boolean).join('\n');}}
    result.finishedUtc=stamp();result.passed=!result.error&&!result.native?.error&&!result.finalState?.error&&result.cases.length===CASES.length&&result.cases.every(c=>c.passed)&&!result.pageErrors.length&&!result.finalState?.expert&&!result.finalState?.violations?.length;
    await saveResult();
  }
  return result;
}
async function main(args=process.argv.slice(2)){
  const options=E.parseArgs(args);
  if(options.help){console.log('node scripts/common-workflows-qualification.cjs --candidate ABSOLUTE_UNPACKED_EXE --exe-sha256 HASH --archive-sha256 HASH [--mode hidden|visible|both] [--scales 1,1.5,2] [--output DIR]\n--plan prints the scenario matrix without loading Playwright or launching Electron. Default mode: hidden.');return;}
  if(options.plan){console.log(JSON.stringify({scope:'Unexecuted qualification plan; not evidence',runs:E.runs(options),cases:CASES,legacyIds:LEGACY_IDS},null,2));return;}
  assert.equal(process.platform,'win32','Packaged qualification requires Windows');
  const output=path.resolve(options.output??path.join(root,'artifacts','common-workflows-'+new Date().toISOString().replace(/[:.]/g,'-')));await fs.mkdir(output,{recursive:true});
  assert.equal((await fs.readdir(output)).length,0,'Evidence folder must be empty');
  const report={schemaVersion:1,startedUtc:stamp(),passed:false,options,scope:'Pinned unpacked Windows candidate; automated dialogs, numerical geometry. No installer, hardware printer, competitor or media-decoder qualification.',runs:[]};
  const reportFile=path.join(output,'result.json');
  try{
    const {hiddenRuntime}=require('./hidden-runtime.cjs'),runtime=await hiddenRuntime(options.candidate);assert.equal(runtime.packaged,true);
    assert.equal(runtime.executableSha256.toLowerCase(),options['exe-sha256'].toLowerCase(),'Pinned executable SHA256');assert.equal(runtime.archiveSha256.toLowerCase(),options['archive-sha256'].toLowerCase(),'Pinned app.asar SHA256');report.runtime=runtime;
    const candidateRoot=path.dirname(runtime.executablePath),candidate=await E.manifest(candidateRoot,['resources']),sources=await E.manifest(root,FROZEN);
    await json(path.join(output,'frozen-candidate.json'),candidate);await json(path.join(output,'frozen-sources.json'),sources);await json(reportFile,report);
    for(const config of E.runs(options)){
      E.assertFrozen(sources,await E.manifest(root,FROZEN));E.assertFrozen(candidate,await E.manifest(candidateRoot,['resources']));
      report.runs.push(await runSession(runtime,config,path.join(output,config.id)));await json(reportFile,report);
      E.assertFrozen(sources,await E.manifest(root,FROZEN));E.assertFrozen(candidate,await E.manifest(candidateRoot,['resources']));
      assert.equal((await hiddenRuntime(options.candidate)).executableSha256,runtime.executableSha256,'Candidate executable changed');
    }
    report.freezeVerified=true;report.passed=report.runs.length===E.runs(options).length&&report.runs.every(r=>r.passed);
  }catch(error){report.error=error.stack;}
  finally{report.finishedUtc=stamp();await json(reportFile,report);console.log('Evidence: '+output);}
  if(!report.passed)throw Error('Common workflow qualification failed. Inspect '+reportFile);
}
module.exports={CASES,LEGACY_IDS,FROZEN,main,runSession};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
