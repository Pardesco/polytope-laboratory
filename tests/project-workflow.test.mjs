import test from 'node:test';
import assert from 'node:assert/strict';
import {openWorkspace} from '../ui/project-workflow.mjs';

function fixture(){
  let workspace={},revision=0,exporting=false,resolve,reject;const published=[],calls=[];
  const context={getProject:()=>workspace,getRevision:()=>revision,isExporting:()=>exporting,
    load:()=>{calls.push('load');return new Promise((a,b)=>{resolve=a;reject=b;});},publish:r=>published.push(r)};
  return {context,published,calls,finish:r=>resolve(r),fail:e=>reject(e),export:()=>exporting=true,
    edit:()=>revision++,replace:()=>workspace={}};
}

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
