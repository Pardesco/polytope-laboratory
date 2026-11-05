const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createProjectStorage}=require('../desktop/project-storage.cjs');
const {createWorkspaceReads}=require('../desktop/workspace-reads.cjs');

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'polytope-recovery-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'recovery.polyproj'),project={format:'polytope-laboratory',version:1,documents:[{name:'Previous'}]};
  const writeProject=async(destination,project)=>fs.writeFile(destination,JSON.stringify(project));
  const storage=createProjectStorage({writeProject});
  const read=async destination=>{const project=JSON.parse(await fs.readFile(destination,'utf8'));if(project.version!==1)throw Error('Unsupported project version');return {project};};
  const service=createWorkspaceReads({chooseFile:async()=>null,read,recoveryPath:()=>file,recoveryBackupPath:()=>file+'.bak'});
  return {file,project,storage,service};
}

for(const corrupt of ['{"partial":',JSON.stringify({version:900}),null])test('corrupt/missing autosave falls back to the previous complete snapshot: '+String(corrupt),async t=>{
  const f=await fixture(t);await f.storage.publish(f.file,f.project);await f.storage.publish(f.file,{...f.project,documents:[{name:'Latest'}]});
  if(corrupt===null)await fs.unlink(f.file);else await fs.writeFile(f.file,corrupt);
  const result=await f.service.recover('recover');
  assert.deepEqual(result.project,f.project);assert.match(result.recoveryWarning,/previous snapshot.*newer changes may be missing/);
  assert.deepEqual(JSON.parse(await fs.readFile(f.file+'.bak','utf8')),f.project);
});

test('valid latest recovery is preferred without a fallback notice',async t=>{
  const f=await fixture(t);await f.storage.publish(f.file,f.project);
  const result=await f.service.recover('latest');assert.deepEqual(result,{project:f.project});
});

test('two missing snapshots return no recovery; two corrupted snapshots explain both failures',async t=>{
  const f=await fixture(t);assert.equal(await f.service.recover('absent'),null);
  await fs.writeFile(f.file,'{');await fs.writeFile(f.file+'.bak','{');
  await assert.rejects(f.service.recover('corrupt'),/No usable recovery snapshot\. Latest: .* Previous:/);
});

test('canceling a failed latest read prevents fallback; canceling a fallback prevents adoption',async()=>{
  for(const stage of ['latest','previous']){
    const reads=[];
    const service=createWorkspaceReads({chooseFile:async()=>null,recoveryPath:()=>'/latest',recoveryBackupPath:()=>'/previous',
      read:(file,id)=>new Promise((resolve,reject)=>reads.push({file,id,resolve,reject}))});
    const pending=service.recover('cancel');
    if(stage==='latest')service.cancel('cancel');
    reads[0].reject(Error('Invalid latest geometry'));await Promise.resolve();await Promise.resolve();
    if(stage==='previous'){
      assert.equal(reads[1].file,'/previous');assert.equal(reads[1].id,'cancel');service.cancel('cancel');reads[1].resolve({project:{}});
    }
    await assert.rejects(pending,{name:'AbortError'});assert.equal(reads.length,stage==='latest'?1:2);assert.equal(service.has('cancel'),false);
  }
});

test('a native cancellation does not attempt another read, and a non-project backup refuses',async()=>{
  for(const cancel of [false,true]){
    let reads=0;
    const service=createWorkspaceReads({chooseFile:async()=>null,recoveryPath:()=>'/latest',recoveryBackupPath:()=>'/previous',
      read:async()=>{reads++;if(reads===1)throw Error(cancel?'Job cancelled.':'Corrupt JSON');return {model:{}};}});
    await assert.rejects(service.recover('id'),cancel?/cancelled/:/does not contain a project/);assert.equal(reads,cancel?1:2);
  }
});

test('desktop autosave retains backup and renderer exposes the fallback message',async()=>{
  const main=await fs.readFile(path.join(__dirname,'../desktop/main.cjs'),'utf8');
  assert.match(main,/handle\('autosave',project=>projectStorage\.publish\(recoveryPath\(\),project\)\)/);
  const app=await fs.readFile(path.join(__dirname,'../ui/app.js'),'utf8');assert.match(app,/setStatus\(\(result\.recoveryWarning\?/);
});
