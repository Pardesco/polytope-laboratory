// Root-only real desktop diagram qualification. --self-test launches no GUI.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {createHash}=require('node:crypto');
const {guardRuntime}=require('./layer-join-smoke.cjs');
const {tetra,native}=require('./automatic-faceting-smoke.cjs');
const root=path.resolve(__dirname,'..'),clone=structuredClone;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const active=p=>{const d=p.documents[p.active];return d.states[d.cursor];};
const same=(a,b)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
const nativeOne=request=>{const reply=native([request])[0];assert.equal(reply.ok,true,reply.error);return reply.result;};
function sourceDocument(model){return {id:'diagram-literal-source',cursor:0,states:[{model,view:{coordinateUnit:'mm',surfaceColors:'source'},notes:'Diagram literal source ownership'}]};}
async function selfTest(){
  const raw={format:'polytope-laboratory',version:1,active:0,documents:[sourceDocument(tetra())]};
  const project=nativeOne({op:'validate-project',params:{project:raw}});
  const source=active(project).model,pool=nativeOne({op:'facet-candidates',model:source,params:{}});
  const candidate_ids=pool.candidates.filter(row=>row.sourceFaceIds.length).map(row=>row.id);
  const search=nativeOne({op:'facet-search',model:source,params:{candidate_ids}});
  const reply=nativeOne({op:'facet-diagram',model:source,params:{catalogue:pool,parameters:{vertex_id:0,search,result_id:search.results[0].id}}});
  assert.equal(reply.diagram.status,'complete');assert.equal(reply.state.kernelVersion,'0.1.0');assert.ok(reply.svg.includes('data-plane-id='));
  same(nativeOne({op:'facet-diagram',model:source,params:{state:reply.state}}),reply);
  const changed=clone(source);changed.metadata.coordinateUnits='cm';
  assert.equal(native([{op:'facet-diagram',model:changed,params:{state:reply.state}}])[0].ok,false);
  const document=nativeOne({op:'recipe-run',params:{document:project.documents[0],operation:'facet-adopt',parameters:reply.adoptionParameters}});
  same(document.states[document.cursor].model,reply.diagram.adoption.model);
  console.log('Faceting diagram smoke self-test PASS: native validated source, linked diagram, roundtrip, stale source refusal and adoption. No GUI launched.');
}
async function main(){
  const runtime=await guardRuntime(),{_electron:electron}=require('playwright');
  const folder=await fs.mkdtemp(path.join(root,'artifacts','faceting-diagram-smoke-'));
  const profile=path.join(folder,'profile');await fs.mkdir(profile);
  await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
  const checks=[],errors=[],files=[];let page,group='startup',serial=0;
  try{
    page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>document.getElementById('faceting-diagram-settings')&&document.getElementById('model-name').textContent==='Tesseract');
    await page.evaluate(()=>{window.diagramStatuses=[];new MutationObserver(()=>window.diagramStatuses.push(document.getElementById('status').textContent)).observe(document.getElementById('status'),{childList:true,subtree:true,characterData:true});});
    await app.evaluate(({ipcMain})=>{
      const original=ipcMain._invokeHandlers.get('engine');if(typeof original!=='function')throw Error('Real registered engine handler required.');
      globalThis.diagramHarness={original,rows:[],hold:false,ready:false,release:null,tamperSvg:null};
      ipcMain.removeHandler('engine');ipcMain.handle('engine',async(event,request,id)=>{
        const h=globalThis.diagramHarness,row={request:structuredClone(request),id};
        const result=await original(event,request,id);
        if(request.op.startsWith('facet-')||request.op==='recipe-run'&&request.params.operation==='facet-adopt'){
          row.result=structuredClone(result);h.rows.push(row);
        }
        if(request.op==='facet-diagram'&&h.tamperSvg!==null){result.svg=h.tamperSvg;h.tamperSvg=null;}
        if(request.op==='facet-diagram'&&h.hold){h.hold=false;h.ready=true;await new Promise(resolve=>h.release=resolve);}
        return result;
      });
    });
    const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
    const settle=async()=>{await done();await page.keyboard.press('Escape');await page.evaluate(()=>document.activeElement?.blur?.());};
    const disclose=async id=>{if(!await page.locator('#'+id).evaluate(n=>n.open))await page.locator('#'+id+' > summary').click();};
    const controls=async()=>{if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();await page.locator('[data-panel="construct"]').click();await disclose('automatic-faceting-settings');await disclose('faceting-diagram-settings');};
    const save=async label=>{
      await settle();const file=path.join(folder,`${String(++serial).padStart(2,'0')}-${label}.polyproj`);
      await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
      await page.locator('#save').click();await page.waitForFunction(file=>window.diagramStatuses.includes('Saved '+file),file);await done();
      const bytes=await fs.readFile(file);files.push({file,sha256:hash(bytes)});return {file,project:JSON.parse(bytes)};
    };
    const open=async file=>{await settle();const offset=await page.evaluate(()=>window.diagramStatuses.length);await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#open').click();await page.waitForFunction(({file,offset})=>window.diagramStatuses.slice(offset).includes('Opened '+file),{file,offset});await settle();};
    const initial=await save('startup'),fixture=clone(initial.project);fixture.active=0;fixture.documents=[sourceDocument(tetra())];
    const fixtureFile=path.join(folder,'literal-source.polyproj');await fs.writeFile(fixtureFile,JSON.stringify(fixture));await open(fixtureFile);
    const before=await save('native-source'),source=active(before.project).model;
    const prepare=async()=>{
      await controls();await page.locator('#faceting-candidates').click();await page.waitForFunction(()=>/^complete:/.test(document.getElementById('faceting-candidate-summary').textContent));await done();
      await page.locator('#faceting-source-faces').click();await page.locator('#faceting-diagram-link').uncheck();await page.locator('#faceting-diagram-seeds').fill('');
    };
    const draw=async()=>{await controls();await page.locator('#faceting-diagram-build').click();await page.waitForFunction(()=>document.getElementById('faceting-diagram-status').dataset.status==='complete'&&!document.getElementById('faceting-diagram-build').disabled);await done();};
    const chartCapture=async name=>{
      const chart=page.locator('#faceting-diagram-chart');await chart.scrollIntoViewIfNeeded();
      const evidence=await chart.evaluate(async panel=>{
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const svg=panel.querySelector('svg'),rect=svg.getBoundingClientRect(),box=panel.getBoundingClientRect();
        const ink=[...svg.querySelectorAll('[data-source-vertex-id],[data-plane-id],[data-candidate-id]')].map(node=>{
          const r=node.getBoundingClientRect(),record={tag:node.localName,sourceVertexId:node.getAttribute('data-source-vertex-id'),planeId:node.getAttribute('data-plane-id'),left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};
          if(node.localName==='line'){
            const matrix=node.getScreenCTM(),a=new DOMPoint(node.x1.baseVal.value,node.y1.baseVal.value).matrixTransform(matrix),b=new DOMPoint(node.x2.baseVal.value,node.y2.baseVal.value).matrixTransform(matrix);
            const dx=b.x-a.x,dy=b.y-a.y;let lo=0,hi=1,visible=true;
            for(const [p,q] of [[-dx,a.x-rect.left],[dx,rect.right-a.x],[-dy,a.y-rect.top],[dy,rect.bottom-a.y]]){
              if(p===0){if(q<0)visible=false;}else{const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);}
            }
            record.visibleSegmentLength=visible&&lo<=hi?Math.hypot(dx,dy)*(hi-lo):0;
          }
          return record;
        });
        return {panel:{left:box.left,top:box.top,right:box.right,bottom:box.bottom,width:box.width,height:box.height},svg:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height},ink,background:getComputedStyle(svg).backgroundColor};
      });
      await fs.writeFile(path.join(folder,name+'-viewport.json'),JSON.stringify(evidence,null,2));
      await chart.screenshot({path:path.join(folder,name+'.png')});
      assert.ok(evidence.svg.width>=150&&evidence.svg.height>=60,'Diagram must occupy a visible viewport area.');
      assert.ok(evidence.svg.left>=evidence.panel.left-1&&evidence.svg.right<=evidence.panel.right+1,'Complete SVG width must fit the chart viewport.');
      assert.ok(evidence.svg.top>=evidence.panel.top-1&&evidence.svg.bottom<=evidence.panel.bottom+1,'Complete SVG height must fit the chart viewport.');
      assert.ok(evidence.ink.length>=3,'Native chart must display source-owned geometry.');
      // The native plane chart intentionally extends infinite plane lines beyond
      // the SVG viewBox. Require a visible clipped segment for every such line,
      // and complete bounds for actual finite source vertices and finite facets.
      for(const ink of evidence.ink){
        if(ink.tag==='line'&&ink.planeId!==null)assert.ok(ink.visibleSegmentLength>=3,'Each native plane line must have a visible segment in the viewport.');
        else assert.ok(ink.left>=evidence.panel.left-1&&ink.right<=evidence.panel.right+1&&ink.top>=evidence.panel.top-1&&ink.bottom<=evidence.panel.bottom+1,'Finite source-owned SVG ink must remain visible without clipping.');
      }
      assert.equal(evidence.background,'rgb(255, 255, 255)','Native dark strokes/text require the white diagram surface.');
    };
    const last=async()=>{const rows=await app.evaluate(()=>structuredClone(globalThis.diagramHarness.rows));assert.ok(rows.length);return rows.at(-1);};
    group='real-chart';await prepare();await draw();const draft=(await last()).result;
    assert.equal(draft.diagram.status,'complete');same(draft.diagram.sourceSnapshot,source);
    assert.equal(await page.locator('#faceting-diagram-chart svg').count(),1);
    assert.equal(await page.locator('#faceting-diagram-adopt').isDisabled(),true);
    await chartCapture('draft-chart');
    // Browser XML nodes and bubbling DOM events exercise the mounted picker.
    await page.locator('#faceting-diagram-chart [data-plane-id]').first().dispatchEvent('click');
    assert.equal(await page.locator('#faceting-diagram-add-cycle').isEnabled(),true);
    assert.ok(await page.locator('#faceting-diagram-cycle option').count());
    await page.locator('#faceting-diagram-add-cycle').click();assert.equal(await page.locator('#faceting-diagram-chart').isHidden(),true);
    await draw();assert.ok((await last()).result.diagram.selection.facets.length);
    await page.locator('#faceting-diagram-chart [data-source-vertex-id]').first().dispatchEvent('click');
    assert.equal(await page.locator('#faceting-diagram-save').isDisabled(),true);assert.equal(await page.locator('#faceting-diagram-chart').isHidden(),true);
    await draw();same(active((await save('draft-readonly')).project).model,source);
    checks.push('Real browser SVG parse/render, native plane/cycle pick, enabled draft editing, vertex pick and source read-only preservation');

    group='native-linked-persistence';await page.locator('#faceting-search').click();await page.waitForFunction(()=>document.getElementById('faceting-status').dataset.status==='complete');await done();
    await page.locator('#faceting-diagram-link').check();await draw();const linked=(await last()).result;
    assert.ok(linked.adoptionParameters);assert.equal(await page.locator('#faceting-diagram-adopt').isEnabled(),true);
    await chartCapture('linked-chart');
    await page.locator('#faceting-diagram-save').click();await done();const saved=await save('diagram-saved');
    same(active(saved.project).model,source);same(active(saved.project).view.facetingDiagram,linked.state);
    await open(saved.file);await controls();assert.equal(await page.locator('#faceting-diagram-chart').isHidden(),true);
    await page.locator('#faceting-diagram-restore').click();await page.waitForFunction(()=>document.getElementById('faceting-diagram-status').dataset.status==='complete'&&!document.getElementById('faceting-diagram-build').disabled);await done();
    same((await last()).result,linked);
    await page.locator('#faceting-diagram-adopt').click();await done();const adopted=await save('adopted');
    same(active(adopted.project).model,linked.diagram.adoption.model);assert.equal(adopted.project.documents[0].states.length,2);
    await page.locator('#undo').click();same(active((await save('undo')).project).model,source);
    await page.locator('#redo').click();same(active((await save('redo')).project).model,linked.diagram.adoption.model);
    checks.push('Linked native diagram save/open/explicit restore, real history adoption, Undo/Redo and exact source/RGBA persistence');

    for(const mutation of ['unit','cancel']){
      group='held-native-'+mutation;await open(saved.file);await prepare();
      await page.evaluate(()=>document.getElementById('toast').hidden=true);
      await app.evaluate(()=>Object.assign(globalThis.diagramHarness,{hold:true,ready:false,release:null}));
      await page.locator('#faceting-diagram-build').click();
      await app.evaluate(()=>new Promise((resolve,reject)=>{const stop=Date.now()+15000,t=setInterval(()=>{if(globalThis.diagramHarness.ready){clearInterval(t);resolve();}else if(Date.now()>stop){clearInterval(t);reject(Error('Real diagram reply did not reach hold.'));}},10);}));
      if(mutation==='unit')await page.locator('#model-unit').selectOption('cm');else await page.locator('#faceting-diagram-cancel').click();
      await app.evaluate(()=>globalThis.diagramHarness.release());
      await page.waitForFunction(()=>!document.getElementById('toast').hidden&&/changed|cancel|abort/i.test(document.getElementById('toast').textContent));await done();
      assert.equal(await page.locator('#faceting-diagram-chart').isHidden(),true);
      same(active((await save(group)).project).model,source);
      checks.push('Held real native diagram refuses '+mutation+' publication before chart/save/adoption');
    }
    group='browser-xml-refusals';await open(saved.file);await prepare();
    for(const svg of ['<svg xmlns="http://www.w3.org/2000/svg"><script>window.diagramExecuted=true</script></svg>','<svg xmlns="http://www.w3.org/2000/svg"><path style="fill:red"/></svg>','<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>','<svg xmlns="http://www.w3.org/2000/svg"><path href="https://example.com"/></svg>','<svg xmlns="http://www.w3.org/2000/svg"><path></svg>']){
      await page.evaluate(()=>document.getElementById('toast').hidden=true);await app.evaluate((_electron,svg)=>globalThis.diagramHarness.tamperSvg=svg,svg);
      await page.locator('#faceting-diagram-build').click();await page.waitForFunction(()=>document.getElementById('faceting-diagram-status').dataset.status==='refused'&&!document.getElementById('faceting-diagram-build').disabled);await done();
      assert.equal(await page.locator('#faceting-diagram-chart').isHidden(),true);assert.equal(await page.evaluate(()=>window.diagramExecuted),undefined);
    }
    checks.push('Actual browser XML parser refuses malformed/script/style/foreign/external-reference SVG before insertion');
    const rows=await app.evaluate(()=>structuredClone(globalThis.diagramHarness.rows));await fs.writeFile(path.join(folder,'native-observed.json'),JSON.stringify(rows,null,2));
    for(const file of files)assert.equal(hash(await fs.readFile(file.file)),file.sha256);assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,packaged:Boolean(runtime.packaged),hidden:runtime.hidden,checks,pageErrors:errors,files,version:await app.evaluate(({app})=>app.getVersion()),scope:'Actual small-domain faceting diagram integration; no FAC-wide completeness or installed Stella equivalence claim'},null,2));
    console.log('Faceting diagram desktop smoke PASS. Artifacts: '+folder);
  }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});const statuses=await page?.evaluate(()=>window.diagramStatuses).catch(()=>undefined);const nativeObserved=await app.evaluate(()=>globalThis.diagramHarness?.rows).catch(()=>undefined);await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,group,error:error.stack,checks,pageErrors:errors,statuses,nativeObserved},null,2));console.error('Artifacts: '+folder);throw error;}
  finally{
    await app.evaluate(({ipcMain})=>{const h=globalThis.diagramHarness;if(h){h.release?.();ipcMain.removeHandler('engine');ipcMain.handle('engine',h.original);delete globalThis.diagramHarness;}}).catch(()=>{});
    await app.evaluate(({app})=>app.exit(0)).catch(()=>{});
  }
}
if(require.main===module)(process.argv.includes('--self-test')?selfTest():main()).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={selfTest};
