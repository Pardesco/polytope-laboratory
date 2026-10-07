// Actual workspace numeric qualification. --self-test is headless only.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {guardRuntime}=require('./layer-join-smoke.cjs');
const {cube,tesseract,verifyFixture}=require('./expression-entry-smoke.cjs');
const {icosahedron,verifyGeodesic}=require('./source-construction-smoke.cjs');
const root=path.resolve(__dirname,'..'),clone=structuredClone,hash=b=>createHash('sha256').update(b).digest('hex');
const doc=p=>p.documents[p.active],active=p=>doc(p).states[doc(p).cursor];
const counts=m=>['vertices','edges','faces','cells'].map(k=>m[k].length);
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const belowFour='39999999999999999999999999999999999999999/10000000000000000000000000000000000000000';
const geometry=m=>Object.fromEntries(['dimension','embeddingDimension','vertices','edges','faces','cells'].map(k=>[k,m[k]]));
const hullPoints=[...cube().vertices,[0,0,0],[.5,0,0],[0,.5,0],[0,0,.5]];
const hullText=hullPoints.map(p=>p.map(x=>x===-1?'max(-2, -1)':x===1?'sqrt(4) / 2':String(x)).join('; ')).join('\n');
function incidence(m){
  const edges=new Set(m.edges.map(e=>[...e].sort((a,b)=>a-b).join(',')));assert.equal(edges.size,m.edges.length);
  for(const f of m.faces){assert.equal(new Set(f).size,f.length);for(let i=0;i<f.length;i++)assert.ok(edges.has([f[i],f[(i+1)%f.length]].sort((a,b)=>a-b).join(',')));}
  if(m.dimension===3)assert.equal(m.vertices.length-m.edges.length+m.faces.length,m.metadata?.topologicalGenus===1?0:2);
  if(m.dimension===4){const uses=Array(m.faces.length).fill(0);for(const cell of m.cells)for(const face of cell){assert.ok(Number.isSafeInteger(face)&&face>=0&&face<m.faces.length);uses[face]++;}assert.ok(uses.every(n=>n===2));}
}
function verifyWaterman(m,closed){
  assert.deepEqual(counts(m),closed?[6,12,8,0]:[12,24,14,0]);incidence(m);
  const source=m.metadata.watermanFcc.sourceSnapshot,expected=[];
  for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++)for(let z=-2;z<=2;z++)if((x+y+z)%2===0&&(closed?x*x+y*y+z*z<=4:x*x+y*y+z*z<4))expected.push([x,y,z]);
  assert.deepEqual(source.coordinates,expected);assert.equal(source.radiusSquared,closed?'4':belowFour);
  assert.equal(m.metadata.watermanFcc.selectedPointCount,closed?19:13);
  for(const [i,sourceId] of m.metadata.watermanFcc.outputVertexToSelectedPoint.entries())assert.deepEqual(m.vertices[i],expected[sourceId]);
  assert.equal(m.numeric.certified,false);assert.equal(m.metadata.watermanFcc.selectionCertificate.certified,true);
}
function nativeMany(requests){
  const child=spawnSync(process.env.POLYTOPE_TEST_FIXTURE_PYTHON||'python',['-B','-m','engine.server'],{cwd:root,windowsHide:true,encoding:'utf8',timeout:90000,maxBuffer:64*1024*1024,input:requests.map((r,i)=>JSON.stringify({...r,id:String(i)})).join('\n')+'\n'});
  assert.equal(child.error,undefined);assert.equal(child.status,0,child.stderr);
  const replies=child.stdout.trim().split(/\r?\n/).map(JSON.parse);assert.equal(replies.length,requests.length);
  for(const r of replies)assert.equal(r.ok,true,r.error);return replies.map(r=>r.result);
}
async function selfTest(){
  verifyFixture(cube());verifyFixture(tesseract());
  const requests=[{op:'expression-batch',params:{expressions:['max(1, min(2, 3))','sqrt(16)/2','-sind(90)*30'],mode:'real'}},
    {op:'expression-batch',params:{expressions:['4 - 1/10^40','4','1/2'],mode:'rational'}},
    {op:'hull',params:{points:hullPoints}},{op:'rational-hull',params:{points:[['0','0'],[belowFour,'0'],['0','1/2']]}},
    ...[{kind:'block',sizes:[2,3,4]},{kind:'wythoff',family:'B3',rings:[1,0,0],weights:[1,0,0]},
      {kind:'cupola',n:3,edge_length:1},{kind:'step-prism',n:7,step:2,radius:1},
      {kind:'torus',ring_segments:4,arm_segments:4,arm_ratio:.5,ring_radius:1},
      {kind:'waterman-fcc',radius_squared:belowFour,center:['0','0','0']},
      {kind:'waterman-fcc',radius_squared:'4',center:['0','0','0']}].map(params=>({op:'generate',params})),
    {op:'triangular-geodesic',model:icosahedron(),params:{frequency:2}},
    {op:'subdivide-edges',model:cube(),params:{divisions:2}}];
  const results=nativeMany(requests);assert.deepEqual(results[0].values,[2,2,-30]);assert.deepEqual(results[1].values,[belowFour,'4','1/2']);
  assert.deepEqual(counts(results[2]),[8,12,6,0]);incidence(results[2]);
  assert.ok(results[3].rationalCoordinates.some(row=>row.includes(belowFour)));assert.equal(results[3].certificate.exhausted,true);
  for(const [i,expected] of [[4,[8,12,6,0]],[5,[8,12,6,0]],[6,[9,15,8,0]],[7,[7,21,28,14]],[8,[16,32,16,0]],[12,[20,24,6,0]]]){assert.deepEqual(counts(results[i]),expected);incidence(results[i]);}
  verifyWaterman(results[9],false);verifyWaterman(results[10],true);verifyGeodesic(results[11],JSON.parse(JSON.stringify(icosahedron())),2);
  const {WorkspaceNumericControls}=await import('../ui/workspace-numeric-controls.mjs');
  const state={model:cube(),view:{coordinateUnit:'mm',sectionNormal:[0,0,1],sectionOffset:0,entity:0},notes:'Owned source'};
  const document={id:'headless-owned-document',states:[state],cursor:0},project={documents:[document],active:0},fields={
    'section-normal':{value:'0; min(0, 1); sqrt(4) / 2'},'section-depth':{value:'1/2'},'entity-id':{value:'0'},'section-offset':{value:'0'}};
  const context={getState:()=>state,getDocument:()=>document,getProject:()=>project,getInput:id=>fields[id],isExporting:()=>false,
    evaluateMany:async(expressions,{mode})=>nativeMany([{op:'expression-batch',params:{expressions:[...expressions],mode}}])[0].values,markDirty(){},async refreshDerived(){}};
  const controls=new WorkspaceNumericControls(context),original=clone(state.model);await controls.section();
  assert.deepEqual(state.view.sectionNormal,[0,0,1]);near(state.view.sectionOffset,.5);assert.deepEqual(state.model,original);
  fields['section-normal'].value='0,0,0';const before=clone(state);await assert.rejects(controls.section(),/nonzero/);assert.deepEqual(state,before);
  console.log('Workspace numeric self-test PASS: actual parser, exact thresholds, independent native incidence/counts and mounted controller staging. No GUI launched.');
}
async function main(){
  const runtime=await guardRuntime(); // Mandatory before requiring or launching Electron.
  const {_electron:electron}=require('playwright'),started=performance.now(),artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));
  await fs.mkdir(artifacts,{recursive:true});const folder=await fs.mkdtemp(path.join(artifacts,'workspace-numeric-smoke-')),profile=path.join(folder,'profile');await fs.mkdir(profile);
  await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
  const checks=[],errors=[],files=[];let page,serial=0,group='startup';
  try{
    assert.equal((await app.evaluate(({app})=>app.polytopeQualification))?.mode,runtime.hidden?'hidden-no-focus':undefined);
    page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract'&&document.getElementById('torus-settings'));
    await page.evaluate(()=>{window.workspaceNumericStatuses=[];new MutationObserver(()=>window.workspaceNumericStatuses.push(document.getElementById('status').textContent)).observe(document.getElementById('status'),{childList:true,subtree:true,characterData:true});});
    const done=()=>page.waitForFunction(()=>document.getElementById('cancel').hidden);
    const settle=async()=>{await done();await page.keyboard.press('Escape');await page.evaluate(async()=>{document.activeElement?.blur?.();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await done();};
    const disclose=async id=>{if(!await page.locator('#'+id).evaluate(n=>n.open))await page.locator('#'+id+' > summary').click();};
    const inspector=async panel=>{if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')!=='true')await page.locator('#toggle-inspector').click();await page.locator(`[data-panel="${panel}"]`).click();};
    const clearToast=()=>page.evaluate(()=>{document.getElementById('toast').hidden=true;});
    const toast=async pattern=>{await page.waitForFunction(()=>!document.getElementById('toast').hidden);assert.match(await page.locator('#toast').textContent(),pattern);};
    const save=async label=>{
      await settle();const file=path.join(folder,`${String(++serial).padStart(2,'0')}-${label}.polyproj`);
      await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
      await page.locator('#save').click();await page.waitForFunction(file=>window.workspaceNumericStatuses.includes('Saved '+file),file);await settle();
      const bytes=await fs.readFile(file);files.push({file,sha256:hash(bytes)});return {file,project:JSON.parse(bytes)};
    };
    const open=async file=>{
      await settle();await page.evaluate(()=>window.workspaceNumericStatuses=[]);
      await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
      await page.locator('#open').click();await page.waitForFunction(file=>window.workspaceNumericStatuses.includes('Opened '+file)||window.workspaceNumericStatuses.some(t=>t.includes('Workspace changed while opening')),file);
      assert.equal(await page.evaluate(file=>window.workspaceNumericStatuses.includes('Opened '+file),file),true);await settle();
    };
    const initial=(await save('initial')).project;
    const replace=async(source,other)=>{
      const p=clone(initial);p.active=0;p.documents=[source,...other?[other]:[]].map((m,i)=>({id:'numeric-literal-'+i,cursor:0,states:[{model:clone(m),notes:'Keep numeric source/RGBA',view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0],sectionNormal:Array(m.dimension).fill(0).map((_,i)=>Number(i===m.dimension-1)),sectionOffset:0,entity:0,derivedMode:'section',viewportLayout:'split',surfaceColors:'source'}}]}));
      const file=path.join(folder,'fixture-'+(++serial)+'.polyproj'),bytes=Buffer.from(JSON.stringify(p));await fs.writeFile(file,bytes);files.push({file,sha256:hash(bytes)});await open(file);return save('native-fixture');
    };
    const fields=async values=>{for(const [id,value] of Object.entries(values))await page.locator('#'+id).fill(value);};
    const create=async(button,label)=>{const n=await page.locator('#document-tabs > button').count();await page.locator('#'+button).click();await page.waitForFunction(n=>document.getElementById('document-tabs').children.length===n+1,n);await settle();return save(label);};
    const commit=async(button,label)=>{const n=await page.locator('#history-list button').count();await page.locator('#'+button).click();await page.waitForFunction(n=>document.getElementById('history-list').children.length===n+1,n);await settle();return save(label);};
    const change=async(id,value)=>{await page.locator('#'+id).fill(value);await page.locator('#'+id).press('Tab');await settle();};
    await app.evaluate(({ipcMain})=>{
      const original=ipcMain._invokeHandlers.get('engine'),cancel=ipcMain._invokeHandlers.get('cancel');if(typeof original!=='function'||typeof cancel!=='function')throw Error('Native qualification requires registered handlers.');
      globalThis.workspaceNumericHarness={original,cancel,requests:[],hold:false,held:false,ready:false};
      ipcMain.removeHandler('engine');ipcMain.handle('engine',async(event,request,id)=>{
        const h=globalThis.workspaceNumericHarness;h.requests.push(structuredClone({id,request}));
        if(request.op!==(h.holdOp??'expression-batch')||!h.hold)return original(event,request,id);
        h.hold=false;h.held=true;h.id=id;const result=await original(event,request,id);h.ready=true;
        await new Promise(resolve=>h.release=resolve);return result;
      });
      ipcMain.removeHandler('cancel');ipcMain.handle('cancel',async(event,id)=>{const h=globalThis.workspaceNumericHarness;if(h.id===id)h.cancelled=true;return cancel(event,id);});
    });
    const ledger=()=>app.evaluate(()=>structuredClone(globalThis.workspaceNumericHarness.requests));
    const mark=async()=>await app.evaluate(()=>globalThis.workspaceNumericHarness.requests.length);
    const jobs=async offset=>(await ledger()).slice(offset).map(e=>e.request);

    group='section';const ts=await replace(tesseract()),t=clone(active(ts.project).model);
    await page.locator('#derived-mode').selectOption('section');await fields({'section-normal':'0; min(0, 1); sqrt(4)/2; 0','section-depth':'1 / 2'});
    await page.locator('#apply-section').click();await settle();let section=await save('section-expressions');
    assert.deepEqual(active(section.project).view.sectionNormal,[0,0,1,0]);near(active(section.project).view.sectionOffset,.5);assert.deepEqual(active(section.project).model,t);
    await page.locator('#section-events').click();await settle();section=await save('section-next-vertex');near(active(section.project).view.sectionOffset,1);
    const sectionBefore=clone(active(section.project));
    for(const values of [{'section-normal':'0, 0, 0, 0','section-depth':'1/4'},{'section-normal':'0, 0, 1, 0','section-depth':'1/0'}]){
      await clearToast();await fields(values);await page.locator('#apply-section').click();await toast(/nonzero|division|Fraction\(1, 0\)/i);await settle();
      const refused=active((await save('section-atomic-refusal')).project);assert.deepEqual(refused.model,t);assert.deepEqual(refused.view.sectionNormal,sectionBefore.view.sectionNormal);near(refused.view.sectionOffset,sectionBefore.view.sectionOffset);
    }
    checks.push('Section nested-vector/depth expressions and Next vertex use intrinsic coordinates; zero normal and invalid depth refuse atomically without source/RGBA/unit changes');

    group='block-and-wythoff';await inspector('construct');await page.locator('#generator').selectOption('block');
    await fields({'generator-n':'not_a_number','generator-m':'1/0','block-sizes':'2 * 1; min(3,4); sqrt(16)'});
    const blockStart=await mark(),block=await create('generate','block-ignored-n-m'),bm=active(block.project).model;assert.deepEqual(counts(bm),[8,12,6,0]);incidence(bm);
    for(let axis=0;axis<3;axis++)near(Math.max(...bm.vertices.map(p=>p[axis]))-Math.min(...bm.vertices.map(p=>p[axis])),[2,3,4][axis]);
    const blockJob=(await jobs(blockStart)).find(r=>r.op==='generate');assert.deepEqual(blockJob.params.sizes,[2,3,4]);assert.equal(blockJob.params.n,undefined);assert.equal(blockJob.params.m,undefined);
    await inspector('construct');await page.locator('#coxeter-family').selectOption('B3');await fields({'coxeter-rings':'100','coxeter-weights':'max(1, min(2, 3)); 0 * phi; 1 - 1'});
    const wStart=await mark(),w=await create('wythoff','nested-wythoff');assert.deepEqual(counts(active(w.project).model),[8,12,6,0]);incidence(active(w.project).model);
    const wJob=(await jobs(wStart)).find(r=>r.op==='generate');assert.deepEqual(wJob.params.weights,[2,0,0]);assert.deepEqual(wJob.params.rings,[1,0,0]);
    const wBefore=clone(w.project);await inspector('construct');await clearToast();await page.locator('#coxeter-rings').fill('1/0');await page.locator('#wythoff').click();await toast(/ring mask/i);await settle();assert.deepEqual(active((await save('invalid-mask')).project).model,active(wBefore).model);
    await inspector('construct');await clearToast();await fields({'coxeter-rings':'100','coxeter-weights':'1, 1, 0'});await page.locator('#wythoff').click();await toast(/inactive|selected rings/i);await settle();assert.deepEqual(active((await save('inactive-ring-weight')).project).model,active(wBefore).model);
    checks.push('Block evaluates only its size vector; Wythoff nested weights preserve literal ring-mask domain and refuse incompatible weights');

    group='large-hull';await inspector('construct');await page.locator('#hull-points').fill(hullText);const hStart=await mark(),hulled=await create('build-hull','36-coordinate-hull'),hm=active(hulled.project).model;
    assert.deepEqual(counts(hm),[8,12,6,0]);incidence(hm);assert.deepEqual(hm.vertices.map(p=>p.join(',')).sort(),cube().vertices.map(p=>p.join(',')).sort());
    const hJobs=await jobs(hStart),batches=hJobs.filter(r=>r.op==='expression-batch');assert.equal(batches.length,1);assert.equal(batches[0].params.expressions.length,36);assert.equal(batches[0].params.mode,'real');assert.deepEqual(hJobs.find(r=>r.op==='hull').params.points,hullPoints);
    checks.push('A real 36-coordinate point-cloud hull uses exactly one native expression-batch job and retains the independent cube boundary');

    group='exact-hull-and-waterman';await inspector('evidence');await page.locator('#rational-points').fill('0, 0\n4 - 1/10^40, 0\n0, 1/2');const exactStart=await mark(),exact=await create('rational-hull','exact-rational-hull'),em=active(exact.project).model;
    assert.ok(em.rationalCoordinates.some(row=>row.includes(belowFour)));assert.equal(em.certificate.exhausted,true);assert.equal(em.certificate.exactFacetCount,3);
    assert.equal((await jobs(exactStart)).find(r=>r.op==='rational-hull').params.points[1][0],belowFour);
    for(const [text,closed] of [['4 - 1/10^40',false],['4',true]]){
      await inspector('construct');await disclose('waterman-settings');await page.locator('#waterman-mode').selectOption('exact-sphere');
      await fields({'waterman-radius-squared':text,'waterman-x':'0 / 7','waterman-y':'0 * 3','waterman-z':'1 - 1'});
      const offset=await mark(),water=await create('generate-waterman','exact-waterman-'+closed);verifyWaterman(active(water.project).model,closed);
      const req=(await jobs(offset)).find(r=>r.op==='generate');assert.equal(req.params.radius_squared,closed?'4':belowFour);assert.deepEqual(req.params.center,['0','0','0']);
    }
    checks.push('Exact rational hull coordinates and FCC 4−10^-40 versus4 membership stay distinct across actual typed expressions and native transport');

    group='construction-counts';const ico=icosahedron(),icoSaved=await replace(ico),ownedIco=active(icoSaved.project).model;
    await inspector('construct');await disclose('geodesic-settings');await page.locator('#geodesic-frequency').fill('sqrt(16) / 2');
    const geodesic=await commit('make-geodesic','expression-geodesic');verifyGeodesic(active(geodesic.project).model,ownedIco,2);assert.deepEqual(doc(geodesic.project).states[0].model,ownedIco);
    await inspector('construct');await disclose('geodesic-settings');await clearToast();await page.locator('#geodesic-frequency').fill('7/2');await page.locator('#make-geodesic').click();await toast(/integer domain/i);await settle();assert.deepEqual(active((await save('fractional-geodesic')).project).model,active(geodesic.project).model);
    const cs=await replace(cube()),c=clone(active(cs.project).model);await inspector('construct');await disclose('subdivision-settings');await fields({'edge-divisions':'1 + 1','subdivision-edge-ids':''});
    const subdivided=await commit('subdivide-edges','expression-subdivision');assert.deepEqual(counts(active(subdivided.project).model),[20,24,6,0]);incidence(active(subdivided.project).model);assert.deepEqual(doc(subdivided.project).states[0].model,c);
    await inspector('construct');await disclose('subdivision-settings');await clearToast();await page.locator('#edge-divisions').fill('7/2');await page.locator('#subdivide-edges').click();await toast(/integer domain/i);await settle();assert.deepEqual(active((await save('fractional-subdivision')).project).model,active(subdivided.project).model);
    for(const config of [
      {details:'cupola-settings',button:'generate-cupola',label:'cupola',values:{'cupola-n':'sqrt(9)','cupola-edge-length':'2 * cosd(60)','cupola-height':''},expected:[9,15,8,0]},
      {details:'step-prism-settings',button:'generate-step-prism',label:'step',values:{'step-prism-n':'5 + 2','step-prism-step':'1 + 1','step-prism-radius':'1/1'},expected:[7,21,28,14]},
      {details:'torus-settings',button:'generate-torus',label:'torus',values:{'torus-ring-segments':'2 + 2','torus-arm-segments':'sqrt(16)','torus-arm-ratio':'1 / 2','torus-ring-radius':'sqrt(4) / 2'},expected:[16,32,16,0]},
    ]){
      await inspector('construct');await disclose(config.details);await fields(config.values);const result=await create(config.button,'count-expression-'+config.label);assert.deepEqual(counts(active(result.project).model),config.expected);incidence(active(result.project).model);
      const field=Object.keys(config.values)[0];await inspector('construct');await disclose(config.details);await clearToast();await page.locator('#'+field).fill('7/2');await page.locator('#'+config.button).click();await toast(/integer domain/i);await settle();assert.deepEqual(active((await save('fractional-count-'+config.label)).project).model,active(result.project).model);
    }
    checks.push('Geodesic/subdivision/cupola/step/torus counts evaluate expressions before integer checks and retain literal incidence/source history; fractional counts refuse without publication');

    group='display-numbers';const displayStart=await replace(tesseract()),displaySource=clone(active(displayStart.project).model);
    await disclose('surface-settings');await change('vertex-radius','3 / 200');await disclose('surface-settings');await change('edge-radius','3 / 500');
    await disclose('rotation-settings');await page.locator('#projection').selectOption('perspective');await change('perspective-distance-4d','sqrt(16)');await disclose('rotation-settings');await change('perspective-near-4d','1 / 4');
    let display=await save('display-expression-values');near(active(display.project).view.vertexRadius,.015);near(active(display.project).view.edgeRadius,.006);near(active(display.project).view.perspectiveDistance4D,4);near(active(display.project).view.perspectiveNear4D,.25);assert.deepEqual(active(display.project).model,displaySource);
    await disclose('rotation-settings');await clearToast();await page.locator('#perspective-near-4d').fill('sqrt(16)');await page.locator('#perspective-near-4d').press('Tab');await toast(/near|distance/i);await settle();const badPerspective=active((await save('near-equals-distance-refusal')).project);near(badPerspective.view.perspectiveNear4D,.25);near(badPerspective.view.perspectiveDistance4D,4);
    await disclose('rotation-settings');await change('auto-rotation-speed','-sind(90) * 30');await disclose('rotation-settings');await page.locator('#auto-rotation-plane').selectOption('0');
    const beforeSpin=active((await save('before-signed-spin')).project);await page.locator('#auto-rotate').click();
    await page.waitForFunction(()=>Number(document.querySelector('#planes input').value)<-.25);await disclose('rotation-settings');await change('auto-rotation-speed','-15 * 2');
    const angleAfterEdit=Number(await page.locator('#plane-0').inputValue());assert.ok(angleAfterEdit<-.25);assert.equal(await page.locator('#auto-rotate').getAttribute('aria-pressed'),'true');
    await page.waitForFunction(a=>Number(document.querySelector('#planes input').value)<a-.1,angleAfterEdit);await page.locator('#auto-rotate').click();const spun=await save('signed-spin');
    near(active(spun.project).view.rotationSpeed,-30);assert.ok(active(spun.project).view.angles[0]<beforeSpin.view.angles[0]);assert.deepEqual(active(spun.project).model,displaySource);
    await open(spun.file);const reopened=await save('display-reopened');for(const key of ['rotationSpeed','vertexRadius','edgeRadius','perspectiveDistance4D','perspectiveNear4D'])assert.deepEqual(active(reopened.project).view[key],active(spun.project).view[key]);assert.deepEqual(active(reopened.project).model,displaySource);
    checks.push('Signed speed edits preserve advancing angles; radius/perspective expressions persist; near≥distance refuses atomically; full sourceRGBA/mm remains unchanged');

    group='held-ownership-and-cancel';
    const arm=(op='expression-batch')=>app.evaluate((_electron,op)=>{const h=globalThis.workspaceNumericHarness;Object.assign(h,{holdOp:op,hold:true,held:false,ready:false,cancelled:false,release:null});},op);
    const held=()=>app.evaluate(()=>new Promise((resolve,reject)=>{const stop=Date.now()+15000,t=setInterval(()=>{if(globalThis.workspaceNumericHarness.ready){clearInterval(t);resolve();}else if(Date.now()>stop){clearInterval(t);reject(Error('Real native response never reached its hold.'));}},10);}));
    const release=()=>app.evaluate(()=>{const h=globalThis.workspaceNumericHarness;if(typeof h.release!=='function')throw Error('Held native result is not ready.');h.release();h.release=null;});
    group='history-latest-observer';const observedSource=await replace(cube());await inspector('construct');await disclose('subdivision-settings');await page.locator('#edge-divisions').fill('1 + 1');
    await arm('recipe-run');await page.locator('#subdivide-edges').click();await held();
    await disclose('rotation-settings');await page.locator('#plane-0').evaluate(n=>{n.value='23';n.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#camera-projection').selectOption('perspective');
    await release();await settle();const observedResult=await save('history-preserves-latest-observer');assert.deepEqual(counts(active(observedResult.project).model),[20,24,6,0]);near(active(observedResult.project).view.angles[0],23);assert.equal(active(observedResult.project).view.cameraProjection,'perspective');
    assert.deepEqual(doc(observedResult.project).states[0].model,active(observedSource.project).model);await open(observedResult.file);const observedReopen=await save('history-observer-reopened');near(active(observedReopen.project).view.angles[0],23);assert.equal(active(observedReopen.project).view.cameraProjection,'perspective');
    checks.push('A later rotation and observer projection edit during actual native recipe computation survive commit and Save/Open; source and operation snapshots retain their original geometry');
    group='orientation-expressions';const orientationStart=await replace(tesseract()),orientationSource=clone(active(orientationStart.project).model);
    await inspector('info');await page.locator('#selection-kind').selectOption('vertex');await page.locator('#selection-id').fill('0');
    await page.locator('#entity-orientation-controls details > summary').click();await page.locator('#orientation-direction').fill('0; min(0, 1); 0; max(1, sqrt(4))');
    const orientationJobs=await mark();await page.locator('#entity-first').click();await settle();let oriented=await save('orientation-nested-expressions'),firstFrame=active(oriented.project).view.orientationFrame;
    assert.equal(firstFrame.mode,'first');assert.deepEqual(firstFrame.sourceDirection,[0,0,0,Math.sign(orientationSource.vertices[0][3])]);for(let i=0;i<4;i++)near(firstFrame.matrix[i].reduce((sum,x,j)=>sum+x*firstFrame.sourceDirection[j],0),i===3?1:0);assert.deepEqual(firstFrame.targetDirection,[0,0,0,1]);assert.deepEqual(active(oriented.project).model,orientationSource);
    assert.deepEqual((await jobs(orientationJobs)).find(r=>r.op==='entity-orientation').params.direction,[0,0,0,2]);
    await inspector('info');await page.locator('#orientation-direction').fill('');await page.locator('#entity-last').click();await settle();oriented=await save('orientation-native-inference');
    const lastFrame=active(oriented.project).view.orientationFrame,vertex=orientationSource.vertices[0],norm=Math.hypot(...vertex);assert.equal(lastFrame.mode,'last');
    for(let i=0;i<4;i++)near(lastFrame.sourceDirection[i],vertex[i]/norm);assert.deepEqual(active(oriented.project).model,orientationSource);
    await inspector('info');await clearToast();await page.locator('#orientation-direction').fill('0, 0, 0, 0');await page.locator('#entity-first').click();await toast(/nonzero/i);await settle();
    assert.deepEqual(active((await save('orientation-zero-refusal')).project).view.orientationFrame,lastFrame);
    await inspector('info');await page.locator('#orientation-direction').fill('0, 0, 0, sqrt(4)');await arm('entity-orientation');await page.locator('#entity-first').click();await held();
    await disclose('rotation-settings');await page.locator('#plane-0').evaluate(n=>{n.value='17';n.dispatchEvent(new Event('input',{bubbles:true}));});await release();await settle();oriented=await save('orientation-preserves-latest-pose');
    near(active(oriented.project).view.angles[0],17);assert.equal(active(oriented.project).view.orientationFrame.mode,'first');assert.deepEqual(active(oriented.project).model,orientationSource);
    await inspector('info');await page.locator('#orientation-direction').fill('');const frameBeforeUnits=clone(active(oriented.project).view.orientationFrame);
    await arm('entity-orientation');await page.locator('#entity-last').click();await held();await inspector('construct');await page.locator('#model-unit').selectOption('cm');await clearToast();await release();await toast(/source|changed|units/i);await settle();
    const refusedOrientation=active((await save('orientation-held-native-unit-refusal')).project);assert.deepEqual(refusedOrientation.view.orientationFrame,frameBeforeUnits);assert.equal(refusedOrientation.view.coordinateUnit,'cm');assert.deepEqual(refusedOrientation.model,orientationSource);
    checks.push('Actual First/Last accepts nested expressions and blank native inference, rejects zero direction and changed units after native wait, and preserves a later rotation edit without changing source/RGBA');
    group='held-ownership-and-cancel';
    for(const mutation of ['units','input','document','cancel']){
      const baseline=await replace(tesseract(),cube());await page.locator('#derived-mode').selectOption('section');await fields({'section-normal':'0,0,1,0','section-depth':'1/2'});await clearToast();await arm();const offset=await mark();await page.locator('#apply-section').click();await held();
      if(mutation==='units'){
        const n=(await jobs(offset)).filter(r=>r.op==='expression-batch').length;await page.locator('#apply-section').click();await toast(/current numeric edit/i);assert.equal((await jobs(offset)).filter(r=>r.op==='expression-batch').length,n);
        await inspector('construct');await page.locator('#model-unit').selectOption('cm');
      }else if(mutation==='input')await page.locator('#section-depth').fill('3/4');
      else if(mutation==='document')await page.locator('#document-tabs > button').nth(1).click();
      else{await page.locator('#cancel').click();await page.waitForFunction(()=>window.workspaceNumericStatuses.includes('Cancelled active computation.'));assert.equal(await app.evaluate(()=>globalThis.workspaceNumericHarness.cancelled),true);}
      await release();if(mutation!=='cancel')await toast(/source|changed|numeric target/i);await settle();const refused=await save('held-'+mutation),original=baseline.project;
      assert.equal(refused.project.documents.length,original.documents.length);
      for(let i=0;i<2;i++){const a=refused.project.documents[i].states[0],b=original.documents[i].states[0];assert.deepEqual(a.model,b.model);assert.deepEqual(a.view.sectionNormal,b.view.sectionNormal);near(a.view.sectionOffset,b.view.sectionOffset);}
      if(mutation==='units')assert.equal(refused.project.documents[0].states[0].view.coordinateUnit,'cm');if(mutation==='document')assert.equal(refused.project.active,1);
      checks.push(`Held real expression-batch ${mutation} case refuses stale publication atomically; source snapshots and user changes survive`);
    }
    const recovery=await replace(tesseract());await fields({'section-normal':'0,0,1,0','section-depth':'1/2'});await page.locator('#apply-section').click();await settle();const recovered=await save('post-cancel-recovery');near(active(recovered.project).view.sectionOffset,.5);assert.deepEqual(active(recovered.project).model,active(recovery.project).model);
    checks.push('After cancellation and stale-source refusals, subsequent real native numeric entry succeeds with a fresh owner');
    assert.deepEqual(errors,[]);for(const f of files)assert.equal(hash(await fs.readFile(f.file)),f.sha256);
    await fs.writeFile(path.join(folder,'native-requests.json'),JSON.stringify(await ledger(),null,2));await page.screenshot({path:path.join(folder,'workspace-numeric.png')});
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,packaged:Boolean(runtime.packaged),runtime:runtime.runtime,hidden:runtime.hidden,version:await app.evaluate(({app})=>app.getVersion()),checks,pageErrors:errors,files,seconds:(performance.now()-started)/1000,limits:['No executed Stella baseline equivalence claim.','Cancel uses actual NumericEntry abort plus Cancel IPC while a successful real native response is held; operating-system process termination is not asserted.','No simultaneous animation-export GPU capture is started; controller exclusion remains separately tested.']},null,2));console.log('Workspace numeric smoke PASS. '+folder);
  }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'native-requests.json'),JSON.stringify(await app.evaluate(()=>globalThis.workspaceNumericHarness?.requests||[]).catch(()=>[]),null,2));await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,group,error:error.stack,checks,pageErrors:errors,files},null,2));console.error('Artifacts: '+folder);throw error;}
  finally{await app.evaluate(({ipcMain})=>{const h=globalThis.workspaceNumericHarness;if(!h)return;h.release?.();ipcMain.removeHandler('engine');ipcMain.handle('engine',h.original);ipcMain.removeHandler('cancel');ipcMain.handle('cancel',h.cancel);delete globalThis.workspaceNumericHarness;}).catch(()=>{});await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
if(require.main===module)(process.argv.includes('--self-test')?selfTest():main()).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={hullPoints,hullText,belowFour,verifyWaterman,incidence,nativeMany};
