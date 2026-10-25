import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeJobs} from '../ui/native-jobs.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){
  let serial=0,time=100;const calls=[],jobs=new NativeJobs({id:()=>String(++serial),now:()=>time,start:label=>{calls.push(['start',label]);return label;},complete:(owner,text)=>calls.push(['complete',owner,text]),cancel:id=>{calls.push(['cancel',id]);return Promise.resolve(false);},change:()=>calls.push(['pending',jobs.pending.size])});
  return {jobs,calls,advance:()=>time=1350};
}
test('a successful native reply completes its own status and releases busy state',async()=>{
  const f=fixture(),d=deferred(),result={vertices:8};let id;
  const pending=f.jobs.run(key=>{id=key;return d.promise;},'Dual');assert.equal(f.jobs.pending.size,1);
  await Promise.resolve();assert.equal(id,'1');f.advance();d.resolve(result);assert.equal(await pending,result);
  assert.equal(f.jobs.pending.size,0);assert.deepEqual(f.calls.filter(x=>x[0]==='complete'),[['complete','Dual','Dual completed in 1.25 s']]);
});
test('global Cancel settles promptly without waiting for native cancellation or its held reply',async()=>{
  const f=fixture(),d=deferred(),pending=f.jobs.run(()=>d.promise,'Dual');await Promise.resolve();
  const refused=assert.rejects(pending,{name:'AbortError'});f.jobs.cancel();assert.equal(f.jobs.pending.size,0);await refused;
  d.resolve({late:true});await Promise.resolve();assert.equal(f.calls.some(x=>x[0]==='complete'),false);assert.deepEqual(f.calls.filter(x=>x[0]==='cancel'),[['cancel','1']]);
});
test('late rejection after cancellation is consumed and cannot affect a fresh job',async()=>{
  const f=fixture(),old=deferred(),fresh=deferred();
  const first=f.jobs.run(()=>old.promise,'Old');await Promise.resolve();const refused=assert.rejects(first,{name:'AbortError'});f.jobs.cancel();await refused;
  const second=f.jobs.run(()=>fresh.promise,'Fresh');await Promise.resolve();old.reject(Error('late native failure'));await Promise.resolve();assert.equal(f.jobs.pending.size,1);
  fresh.resolve(7);assert.equal(await second,7);assert.deepEqual(f.calls.filter(x=>x[0]==='complete').map(x=>x[1]),['Fresh']);
});
test('a signal cancels only its job; an already aborted signal never invokes native',async()=>{
  const f=fixture(),a=deferred(),b=deferred(),controller=new AbortController();let called=false;
  const first=f.jobs.run(()=>a.promise,'A',{signal:controller.signal}),second=f.jobs.run(()=>b.promise,'B');await Promise.resolve();
  const refused=assert.rejects(first,{name:'AbortError'});controller.abort();await refused;assert.equal(f.jobs.pending.size,1);
  await assert.rejects(f.jobs.run(()=>{called=true;},'No work',{signal:controller.signal}),{name:'AbortError'});assert.equal(called,false);
  b.resolve('kept');assert.equal(await second,'kept');a.resolve('discarded');
});
test('cancel before request submission prevents native work, and repeated cancel is harmless',async()=>{
  const f=fixture();let invoked=0;const pending=f.jobs.run(()=>invoked++,'Queued');const refused=assert.rejects(pending,{name:'AbortError'});
  f.jobs.cancel();f.jobs.cancel();await refused;assert.equal(invoked,0);assert.equal(f.calls.filter(x=>x[0]==='cancel').length,1);
});
test('native refusals preserve diagnostics and cleanup, while cancellation transport failure cannot keep busy state',async()=>{
  const f=fixture(),failure=Error('Domain unsupported');await assert.rejects(f.jobs.run(()=>{throw failure;},'Refused'),error=>error===failure);assert.equal(f.jobs.pending.size,0);
  f.jobs.context.cancel=()=>Promise.reject(Error('IPC ended'));const d=deferred(),pending=f.jobs.run(()=>d.promise,'Held');await Promise.resolve();const refused=assert.rejects(pending,{name:'AbortError'});f.jobs.cancel();await refused;assert.equal(f.jobs.pending.size,0);d.resolve(9);
});
