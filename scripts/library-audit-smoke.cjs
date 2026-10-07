const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {randomUUID,createHash}=require('node:crypto');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));
const runRoot=path.join(artifacts,'library-audit-smoke-'+randomUUID());
const corpus=path.join(runRoot,'sources'),profile=path.join(runRoot,'profile');
const evidence=path.join(runRoot,'fresh.library-index.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const python=process.env.POLYTOPE_PYTHON||'python';
const packaged=process.env.POLYTOPE_TEST_EXECUTABLE;
const errors=[],checks=[];

function fixtures(){
  const script=String.raw`
import hashlib,json,sys
from pathlib import Path
from engine.formats import atomic_write,export_off,parse_off
from engine.generators import regular
from engine.library_audit import FORMAT,importer_fingerprint
root=Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
model=regular('cube')
model['metadata']['offColors']={'faces':[{'encoding':'byte','values':[255,0,0,128]} for f in model['faces']],'cells':[]}
source=export_off(model)
sources={'Passed RGBA cube.off':source,'Rejected header cube.off':source.replace('8 6 12','8 6 13',1),'Large audited cube.off':source+'#'+('padding '*150000)+'\n','Untested cube.off':source}
records={}
for name,text in sources.items():
    file=root/name;file.write_text(text,encoding='utf-8',newline='')
    if name.startswith('Untested'):continue
    try:
        validation=parse_off(text)['validation'];status='parsed';errors=[]
    except Exception as exc:
        validation={'passed':False};status='diagnosed';errors=[str(exc)]
    records[name]={'sourceHash':hashlib.sha256(file.read_bytes()).hexdigest(),'status':status,'sourceUnchanged':True,'validationPassed':validation['passed'],'warnings':[],'warningCount':0,'errors':errors}
index={'format':FORMAT,'schemaVersion':1,'sourceDirectory':str(root.resolve()),'importer':importer_fingerprint(),'records':records}
atomic_write(Path(sys.argv[2]),json.dumps(index))
print(json.dumps({'files':list(sources),'importer':index['importer']}))
`;
  return JSON.parse(execFileSync(python,['-c',script,corpus,evidence],{cwd:process.env.POLYTOPE_TEST_FIXTURE_ROOT||root,encoding:'utf8',windowsHide:true}));
}

async function launch(){
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  if(packaged)env.POLYTOPE_PYTHON=path.join(runRoot,'deliberately-unavailable-python.exe');
  const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  // Observe the real source view's uploaded WebGL color buffer. This avoids
  // exposing internal Viewer state or changing production instrumentation.
  await page.addInitScript(()=>{
    window.__libraryAuditColorUploads=[];
    window.__libraryAuditSurfaceDraws=[];
    for(const ctor of [window.WebGLRenderingContext,window.WebGL2RenderingContext]){
      if(!ctor)continue;
      const original=ctor.prototype.bufferData;
      ctor.prototype.bufferData=function(target,data,...args){
        if(this.canvas?.parentElement?.id==='base-canvas'&&data instanceof Float32Array&&data.length<=4096){
          window.__libraryAuditColorUploads.push(Array.from(data));
          if(window.__libraryAuditColorUploads.length>100)window.__libraryAuditColorUploads.shift();
        }
        return original.call(this,target,data,...args);
      };
      for(const method of ['drawArrays','drawElements']){
        const draw=ctor.prototype[method];
        ctor.prototype[method]=function(mode,...args){
          if(this.canvas?.parentElement?.id==='base-canvas'&&mode===this.TRIANGLES){
            window.__libraryAuditSurfaceDraws.push({blending:this.isEnabled(this.BLEND),depthWrite:this.getParameter(this.DEPTH_WRITEMASK)});
            if(window.__libraryAuditSurfaceDraws.length>200)window.__libraryAuditSurfaceDraws.shift();
          }
          return draw.call(this,mode,...args);
        };
      }
    }
  });
  await page.reload();
  await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
  await page.evaluate(()=>window.polytope.libraries());
  return {app,page};
}

async function main(){
  await fs.mkdir(profile,{recursive:true});
  await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const fixture=fixtures();
  const file=name=>path.join(corpus,name),passed=file('Passed RGBA cube.off'),rejected=file('Rejected header cube.off'),large=file('Large audited cube.off');
  const original=await fs.readFile(rejected);
  let session=await launch();
  const picker=async selected=>session.app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},selected);
  const status=prefix=>session.page.waitForFunction(prefix=>document.getElementById('status').textContent.startsWith(prefix),prefix);
  const rows=()=>session.page.evaluate(()=>window.polytope.libraries()).then(result=>result.libraries[0].entries);
  const clearStatus=()=>session.page.evaluate(()=>{document.getElementById('status').textContent='';});
  const attach=async selected=>{await picker(selected);await clearStatus();await session.page.locator('#linked-libraries').getByRole('button',{name:'Audit',exact:true}).click();await status('Attached audit evidence');};
  const verify=async()=>{await clearStatus();await session.page.locator('#linked-libraries').getByRole('button',{name:'Verify',exact:true}).click();await status('Source hashes verified');};
  const catalog=key=>session.page.locator('#catalog button').filter({has:session.page.locator('.entry-name',{hasText:key})});
  try{
    await picker(corpus);await session.page.locator('#link-library').click();await status('Indexed ');
    let entries=await rows();assert.equal(entries.length,4);assert.ok(entries.every(row=>row.auditStatus==='untested'));
    assert.equal(await session.page.locator('#linked-libraries').getByRole('button',{name:'Verify',exact:true}).isEnabled(),false);
    await attach(evidence);
    entries=await rows();assert.equal(entries.find(row=>row.key===passed).auditStatus,'passed');assert.equal(entries.find(row=>row.key===rejected).auditStatus,'rejected');assert.equal(entries.find(row=>row.key===large).auditStatus,'stale');
    assert.equal(await session.page.locator('#catalog .audit-passed').count(),1);assert.equal(await session.page.locator('#catalog .audit-rejected').count(),1);
    checks.push('native audit attachment and independent passed/rejected/untested/stale badges');
    await verify();
    // Calling libraries() restores bounded startup metadata, so observe Verify's
    // returned/rendered entries directly instead of accidentally reindexing.
    assert.equal(await session.page.locator('#catalog .audit-passed').count(),2);
    await session.page.locator('#library-audit-filter').selectOption('rejected');
    assert.equal(await session.page.locator('#library-count').innerText(),'1');
    await session.page.locator('#catalog button').click();
    await session.page.waitForFunction(()=>document.getElementById('library-dialog').open);
    assert.match(await session.page.locator('#library-source-info').innerText(),/Declared edge count 13/);
    assert.equal(await session.page.locator('#model-name').innerText(),'Tesseract');
    checks.push('explicit whole-library hash verification and rejection filter/detail dialog');
    await assert.rejects(session.page.evaluate(file=>window.polytope.libraryModel(file),rejected),/Declared edge count/);
    await session.app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},rejected);
    await assert.rejects(session.page.evaluate(file=>window.polytope.repairLibraryCopy(file),rejected),/existing files cannot be overwritten/);
    const corrected=path.join(runRoot,'corrected-copy.off');
    await session.app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},corrected);
    await session.page.locator('#library-repair-copy').click();await status('Saved validated edge-count copy');
    assert.equal(sha(await fs.readFile(rejected)),sha(original));
    assert.equal((await fs.readFile(corrected,'utf8')),original.toString('utf8').replace('8 6 13','8 6 12'));
    const validated=execFileSync(python,['-c','from engine.formats import load_file; import sys; print(load_file(sys.argv[1])["model"]["validation"]["passed"])',corrected],{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(validated.trim(),'True');
    checks.push('strict import rejection, native Save Copy, independently validated correction and source preservation');
    await session.page.locator('#library-audit-filter').selectOption('passed');
    await session.page.evaluate(()=>{window.__libraryAuditColorUploads=[];});
    await catalog('Passed RGBA cube').click();
    await session.page.waitForFunction(()=>document.getElementById('model-name').textContent==='Passed RGBA cube');
    await session.page.waitForFunction(()=>window.__libraryAuditColorUploads.some(values=>values.length>=12&&values.length%4===0&&values.every((value,index)=>Math.abs(value-([1,0,0,128/255][index%4]))<1e-6)));
    assert.equal(await session.page.locator('#surface-colors').inputValue(),'source');
    const uploaded=await session.page.evaluate(()=>window.__libraryAuditColorUploads.find(values=>values.length>=12&&values.length%4===0&&values.every((value,index)=>Math.abs(value-([1,0,0,128/255][index%4]))<1e-6)).slice(0,4));
    const loaded=await session.page.evaluate(file=>window.polytope.libraryModel(file),passed);
    assert.deepEqual(loaded.model.metadata.offColors.faces[0],{encoding:'byte',values:[255,0,0,128]});
    if(!await session.page.locator('#surface-settings').evaluate(node=>node.open))await session.page.locator('#surface-settings summary').click();
    await session.page.locator('#surface-colors').selectOption('face');await session.page.locator('#surface-colors').selectOption('source');
    await session.page.locator('#surface-opacity').evaluate(input=>{input.value='1';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
    await session.page.evaluate(()=>{window.__libraryAuditSurfaceDraws=[];});
    await session.page.waitForFunction(()=>window.__libraryAuditSurfaceDraws.length>0);
    const surfaceDraws=await session.page.evaluate(()=>window.__libraryAuditSurfaceDraws.slice(-8));
    assert.ok(surfaceDraws.every(draw=>draw.blending&&!draw.depthWrite),'Source alpha below one must retain blending without opaque depth writes even at global opacity one');
    const projectFile=path.join(runRoot,'colors.polyproj');
    await session.app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},projectFile);
    await session.page.locator('#save').click();await status('Saved ');
    const saved=JSON.parse(await fs.readFile(projectFile,'utf8')),state=saved.documents[saved.active].states[0];
    assert.equal(state.view.surfaceColors,'source');assert.deepEqual(state.model.metadata.offColors.faces[0],{encoding:'byte',values:[255,0,0,128]});
    assert.equal(state.view.surfaceOpacity,1);
    checks.push('actual source-view WebGL RGBA upload, alpha-aware blending/depth writes and project color persistence');
    await fs.appendFile(passed,'# changed source bytes\n');
    await session.page.locator('#library-audit-filter').selectOption('all');await verify();
    assert.equal(await session.page.locator('#catalog .audit-stale').count(),1);
    await catalog('Passed RGBA cube').click({button:'right'});
    await session.page.waitForFunction(()=>document.getElementById('library-dialog').open);
    assert.match(await session.page.locator('#library-source-info').innerText(),/Source bytes have changed/);
    await session.page.locator('#close-library-dialog').click();
    checks.push('changed source bytes invalidate passing evidence');
    await fs.writeFile(passed,original.toString('utf8').replace('8 6 13','8 6 12'));await verify();
    const stale=JSON.parse(await fs.readFile(evidence,'utf8'));stale.importer.dependencyVersions.numpy='old-version';
    const staleEvidence=path.join(runRoot,'stale.library-index.json');await fs.writeFile(staleEvidence,JSON.stringify(stale));await attach(staleEvidence);
    assert.equal(await session.page.locator('#catalog .audit-stale').count(),3);
    await attach(evidence);
    const preferences=JSON.parse(await fs.readFile(path.join(profile,'linked-libraries.json'),'utf8'));
    assert.equal(preferences.paths[0],corpus);assert.ok(preferences.audits[corpus].startsWith(path.join(profile,'library-audits')));
    await session.app.evaluate(({app})=>app.exit(0));session=await launch();
    await session.page.waitForFunction(()=>document.querySelectorAll('#catalog .audit-passed').length===1);
    const restored=await rows();assert.equal(restored.find(row=>row.key===passed).auditStatus,'passed');
    assert.equal(await session.page.locator('#linked-libraries').getByRole('button',{name:'Verify',exact:true}).isEnabled(),true);
    checks.push('dependency provenance invalidation and private audit attachments restored after restart');
    await session.page.locator('#library-audit-filter').selectOption('rejected');await session.page.locator('#catalog button').click();
    await session.page.screenshot({path:path.join(artifacts,packaged?'workspace-library-audit-packaged.png':'workspace-library-audit.png')});
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(artifacts,packaged?'library-audit-packaged-smoke.json':'library-audit-smoke.json'),JSON.stringify({passed:true,packaged:Boolean(packaged),developmentPythonUnavailable:Boolean(packaged),checks,pageErrors:errors,fixtureDirectory:runRoot,rgbaUploaded:uploaded,sourceAlphaDrawsAtFullOpacity:surfaceDraws,fixturePython:fixture.importer.pythonVersion},null,2));
    console.log(`Library audit smoke passed: ${checks.length} checks.`);
  }finally{await session.app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
