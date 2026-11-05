import test from 'node:test';
import assert from 'node:assert/strict';
import {openWorkspace,RecoverySnapshots,ProjectSaving,ProjectOpening} from '../ui/project-workflow.mjs';
import {NativeJobs} from '../ui/native-jobs.mjs';
import {createStatus} from '../ui/status.mjs';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
const {createWorkspaceReads}=createRequire(import.meta.url)('../desktop/workspace-reads.cjs');

function fixture(){
  let workspace={},revision=0,exporting=false,resolve,reject;const published=[],calls=[];
  const context={getProject:()=>workspace,getRevision:()=>revision,isExporting:()=>exporting,
    load:()=>{calls.push('load');return new Promise((a,b)=>{resolve=a;reject=b;});},publish:r=>published.push(r)};
  return {context,published,calls,finish:r=>resolve(r),fail:e=>reject(e),export:()=>exporting=true,
    edit:()=>revision++,replace:()=>workspace={}};
}

test('Open and Recover cannot start overlapping file choosers/reads and release their shared lock',async()=>{
  const f=fixture(),opening=new ProjectOpening(),first=opening.open(f.context);
  await assert.rejects(opening.open(f.context),/already opening/);assert.deepEqual(f.calls,['load']);
  f.finish(null);assert.equal(await first,null);assert.equal(opening.busy,false);
  const retry=opening.open(f.context);f.fail(Error('Invalid file'));await assert.rejects(retry,/Invalid file/);assert.equal(opening.busy,false);
});

test('canceled Open/Recover settle promptly, release busy state, and cannot publish after a successful retry',async()=>{
  for(const operation of ['open','recover']){
    const f=fixture(),reads=[],opening=new ProjectOpening();let sequence=0;
    const service=createWorkspaceReads({chooseFile:async()=>({canceled:false,filePaths:['/source.polyproj']}),recoveryPath:()=>'/recovery.polyproj',
      read:(file,id)=>new Promise(resolve=>reads.push({file,id,resolve}))});
    const jobs=new NativeJobs({id:()=>String(++sequence),now:()=>0,start:()=>({}),complete(){},cancel:id=>service.cancel(id)});
    f.context.load=()=>jobs.run(id=>service[operation](id),'Load file');
    const first=opening.open(f.context);await new Promise(resolve=>setImmediate(resolve));assert.equal(reads.length,1);assert.equal(jobs.pending.size,1);
    const canceled=assert.rejects(first,{name:'AbortError'});jobs.cancel();await canceled;assert.equal(opening.busy,false);assert.equal(jobs.pending.size,0);
    const fresh=opening.open(f.context);await new Promise(resolve=>setImmediate(resolve));assert.equal(reads.length,2);assert.notEqual(reads[0].id,reads[1].id);
    reads[1].resolve({project:{name:'new'}});await fresh;assert.equal(f.published.length,1);assert.equal(f.published[0].project.name,'new');
    reads[0].resolve({project:{name:'old'}});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.published.length,1);assert.equal(opening.busy,false);
  }
});

test('workspace edits, replacement and export invalidate only their pending file read and preserve newer status',async()=>{
  for(const change of ['edit','replace','export'])for(const newerStatus of [false,true]){
    const f=fixture(),opening=new ProjectOpening(),messages=[],cancellations=[];let owner,resolve,signal;
    const status=createStatus(text=>messages.push(text));
    const jobs=new NativeJobs({id:()=> 'file-read',now:()=>0,start:label=>status.set(label),complete:(token,text)=>status.complete(token,text),cancel:id=>cancellations.push(id)});
    f.context.load=options=>{signal=options.signal;return jobs.run(()=>new Promise(done=>resolve=done),'Opening file',{signal,onStatusOwner:value=>owner=value});};
    f.context.onStale=()=>status.complete(owner,'File load canceled');
    const pending=opening.open(f.context);await Promise.resolve();
    if(newerStatus)status.set('Newer action');f[change]();
    const canceled=assert.rejects(pending,{name:'AbortError'});assert.equal(opening.sync(),true);assert.equal(opening.sync(),false);await canceled;
    assert.equal(signal.aborted,true);assert.equal(opening.busy,false);assert.equal(jobs.pending.size,0);assert.deepEqual(cancellations,['file-read']);
    assert.equal(messages.at(-1),newerStatus?'Newer action':'File load canceled');resolve({project:{name:'late'}});await Promise.resolve();assert.deepEqual(f.published,[]);
  }
});

test('an invalidated provider ignoring cancellation cannot publish after the original workspace values return',async()=>{
  const f=fixture(),opening=new ProjectOpening(),original=f.context.getProject();let signal,resolve;
  f.context.load=options=>{signal=options.signal;return new Promise(done=>resolve=done);};
  const pending=opening.open(f.context);f.edit();opening.sync();assert.equal(signal.aborted,true);
  f.context.getProject=()=>original;f.context.getRevision=()=>0;resolve({project:{name:'late'}});
  await assert.rejects(pending,{name:'AbortError'});assert.deepEqual(f.published,[]);assert.equal(opening.busy,false);
});

test('adopting a completed file may advance the workspace revision without canceling its own publication',async()=>{
  const f=fixture(),opening=new ProjectOpening();let signal;
  f.context.load=async options=>{signal=options.signal;return {project:{name:'current'}};};
  f.context.publish=result=>{f.edit();assert.equal(opening.sync(),false);f.published.push(result);};
  await opening.open(f.context);assert.equal(signal.aborted,false);assert.equal(f.published.length,1);assert.equal(opening.busy,false);
});

test('actual edit, playback and export transition hooks synchronize file-read ownership',async()=>{
  const source=await readFile(new URL('../ui/app.js',import.meta.url),'utf8');
  const dirty=source.split('\n').find(line=>line.startsWith('function markDirty()'));
  const pose=source.split('\n').find(line=>line.startsWith('function markPlaybackDirty()'));
  const transition=source.match(/onExportStateChange:\(\)=>\{(.*?)\},showSection:/);
  assert.ok(dirty&&pose&&transition);let synced=0;
  const code=dirty+'\n'+pose+'\nfunction changedExport(){'+transition[1]+'}';
  const scope={revision:0,dirty:false,renderTabs(){}};
  for(const match of code.matchAll(/\b(\w+)(?:\?\.|\.)\w+\(/g))scope[match[1]]=new Proxy({},{get:()=>()=>{}});
  scope.api={setDirty:()=>Promise.resolve()};scope.projectOpening={sync:()=>synced++};
  runInNewContext(code,scope);scope.markDirty();scope.markPlaybackDirty();scope.changedExport();
  assert.equal(synced,3);assert.equal(scope.revision,2);
});

function savingFixture(){
  let project={id:'first'},revision=0,exporting=false,resolve,reject;
  const writes=[],busy=[],saved=[],messages=[];
  const context={getProject:()=>project,getRevision:()=>revision,isExporting:()=>exporting,snapshot:()=>({project:project.id,revision}),
    write:value=>{writes.push(value);return new Promise((a,b)=>{resolve=a;reject=b;});},start:()=>({}),complete:(_owner,text)=>messages.push(text),
    onBusy:value=>busy.push(value),onSaved:value=>saved.push(value)};
  return {saving:new ProjectSaving(context),context,writes,busy,saved,messages,edit:()=>revision++,replace:()=>project={id:'second'},export:()=>exporting=true,
    finish:result=>resolve(result),fail:()=>reject(Error('Native write failed'))};
}

test('overlapping Save commands cannot open a second dialog or submit another snapshot',async()=>{
  const f=savingFixture(),first=f.saving.save();f.edit();
  await assert.rejects(f.saving.save(),/already in progress/);assert.deepEqual(f.writes,[{project:'first',revision:0}]);
  f.finish({path:'project.polyproj'});await first;assert.deepEqual(f.saved,[{current:false}]);assert.match(f.messages[0],/newer changes remain unsaved/);assert.deepEqual(f.busy,[true,false]);
  const next=f.saving.save();assert.deepEqual(f.writes[1],{project:'first',revision:1});f.finish({path:'project.polyproj'});await next;assert.deepEqual(f.saved.at(-1),{current:true});
});

test('Save cancellation clears busy state without marking a project clean',async()=>{
  const f=savingFixture(),pending=f.saving.save();f.finish(null);assert.equal(await pending,null);
  assert.deepEqual(f.saved,[]);assert.deepEqual(f.messages,['Save canceled.']);assert.equal(f.saving.busy,false);assert.deepEqual(f.busy,[true,false]);
});

test('a completed Save cannot clear dirty state or publish feedback into a replacement project',async()=>{
  const f=savingFixture(),pending=f.saving.save();f.replace();f.finish({path:'old-project.polyproj'});await pending;
  assert.deepEqual(f.saved,[]);assert.deepEqual(f.messages,[]);assert.equal(f.saving.busy,false);
});

test('failed snapshot/native Save releases the lock and remains retryable',async()=>{
  const f=savingFixture(),pending=f.saving.save();f.fail();await assert.rejects(pending,/Native write failed/);assert.equal(f.saving.busy,false);
  const snapshot=f.context.snapshot;f.context.snapshot=()=>{throw Error('Snapshot failed');};await assert.rejects(f.saving.save(),/Snapshot failed/);assert.equal(f.saving.busy,false);
  f.context.snapshot=snapshot;const retry=f.saving.save();f.finish({path:'project.polyproj'});await retry;assert.deepEqual(f.saved,[{current:true}]);
});

test('an export refuses Save before snapshotting, showing a dialog or changing busy feedback',async()=>{
  const f=savingFixture();f.export();await assert.rejects(f.saving.save(),/animation export/);assert.deepEqual(f.writes,[]);assert.deepEqual(f.busy,[]);
});

function recoveryFixture(){
  let project={id:'first'},revision=0,enabled=true,resolve,reject,snapshots=0;
  const writes=[],notices=[];
  const recovery=new RecoverySnapshots({getProject:()=>project,getRevision:()=>revision,shouldSave:()=>enabled,
    snapshot:()=>{snapshots++;return {project:project.id,revision};},
    write:input=>{writes.push(input);return new Promise((a,b)=>{resolve=a;reject=b;});},onSaved:notice=>notices.push(notice)});
  return {recovery,writes,notices,get snapshots(){return snapshots;},edit:()=>revision++,replace:()=>project={id:'second'},disable:()=>enabled=false,
    finish:()=>resolve({path:'recovery.polyproj'}),fail:()=>reject(Error('disk full'))};
}

test('recovery skips unchanged revisions before cloning or sending another native write',async()=>{
  const f=recoveryFixture(),pending=f.recovery.save();f.finish();assert.equal(await pending,true);
  for(let tick=0;tick<10;tick++)assert.equal(await f.recovery.save(),false);
  assert.equal(f.snapshots,1);assert.equal(f.writes.length,1);assert.equal(f.notices[0].current,true);
  f.edit();const next=f.recovery.save();f.finish();assert.equal(await next,true);assert.equal(f.writes.length,2);
});

test('slow recovery writes cannot accumulate snapshots and preserve edits made during the write',async()=>{
  const f=recoveryFixture(),pending=f.recovery.save();f.edit();
  for(let tick=0;tick<10;tick++)assert.equal(await f.recovery.save(),false);
  assert.equal(f.snapshots,1);f.finish();await pending;assert.equal(f.notices[0].current,false);
  const next=f.recovery.save();assert.deepEqual(f.writes[1],{project:'first',revision:1});f.finish();await next;
});

test('failed recovery writes remain retryable for the exact same revision',async()=>{
  const f=recoveryFixture(),pending=f.recovery.save();f.fail();await assert.rejects(pending,/disk full/);
  assert.equal(f.notices.length,0);assert.equal(f.recovery.pending,null);
  const retry=f.recovery.save();f.finish();assert.equal(await retry,true);assert.equal(f.writes.length,2);
});

test('project replacement fences recovery feedback and never reuses another project revision',async()=>{
  const f=recoveryFixture(),pending=f.recovery.save();f.replace();f.finish();await pending;
  assert.equal(f.notices.length,0);const next=f.recovery.save();assert.deepEqual(f.writes[1],{project:'second',revision:0});f.finish();await next;
  assert.equal(f.notices.length,1);
});

test('disabled recovery and snapshot failures do not leave a stuck pending job',async()=>{
  const f=recoveryFixture();f.disable();assert.equal(await f.recovery.save(),false);assert.equal(f.snapshots,0);
  const g=recoveryFixture();g.recovery.context.snapshot=()=>{throw Error('snapshot failed');};
  await assert.rejects(g.recovery.save(),/snapshot failed/);assert.equal(g.recovery.pending,null);assert.equal(g.writes.length,0);
});

test('loaded projects and imported geometry publish once into the unchanged workspace',async()=>{
  for(const result of [{project:{documents:[{}]},path:'a.polyproj'},{model:{id:'source'},path:'a.off'}]){
    const f=fixture(),pending=openWorkspace(f.context);f.finish(result);
    assert.equal(await pending,result);assert.deepEqual(f.published,[result]);
  }
});
test('an existing export refuses before any native file dialog or recovery load',async()=>{
  const f=fixture();f.export();await assert.rejects(()=>openWorkspace(f.context),/Finish or cancel/);assert.deepEqual(f.calls,[]);
});
test('an export started during native load cannot lose its locked document',async()=>{
  const f=fixture(),pending=openWorkspace(f.context);f.export();f.finish({project:{}});
  await assert.rejects(pending,/export began/);assert.deepEqual(f.published,[]);
});
test('project replacement or edits made during native loading prevent stale adoption',async()=>{
  for(const action of ['replace','edit']){
    const f=fixture(),pending=openWorkspace(f.context);f[action]();f.finish({project:{}});
    await assert.rejects(pending,/Workspace changed/);assert.deepEqual(f.published,[]);
  }
});
test('cancellation and missing recovery publish nothing, without a stale-result error',async()=>{
  const f=fixture(),pending=openWorkspace(f.context);f.edit();f.finish(null);
  assert.equal(await pending,null);assert.deepEqual(f.published,[]);
});
test('a native refusal propagates while leaving the current project intact',async()=>{
  const f=fixture(),pending=openWorkspace(f.context);f.fail(Error('Invalid native project'));
  await assert.rejects(pending,/Invalid native project/);assert.deepEqual(f.published,[]);
});
test('a queued export microtask executes before the final publication fence',async()=>{
  const f=fixture();let complete;
  f.context.load=()=>new Promise(resolve=>{complete=r=>{queueMicrotask(f.export);resolve(r);};});
  const pending=openWorkspace(f.context);complete({project:{}});
  await assert.rejects(pending,/export began/);assert.deepEqual(f.published,[]);
});
