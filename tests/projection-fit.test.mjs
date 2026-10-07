import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectionFit} from '../ui/projection-fit.mjs';

function fixture(){
  let owner={project:{},document:{},state:{},model:{},fingerprint:'source',pose:'4D-pose',camera:'observer'},ready=false,time=0;
  const callbacks=[],events=[],canceled=[];
  const controller=new ProjectionFit({getOwner:()=>owner,isReady:()=>ready,now:()=>time,
    schedule:callback=>{callbacks.push(callback);return callbacks.length;},cancelScheduled:id=>canceled.push(id),
    fit:()=>events.push('fit'),persist:()=>events.push('persist'),onError:error=>events.push(error.message)});
  return {controller,callbacks,events,canceled,get owner(){return owner;},set owner(value){owner=value;},
    set ready(value){ready=value;},set time(value){time=value;},flush(){callbacks.shift()?.();}};
}

test('a pending projection waits for its display and fits only on a later frame',()=>{
  const f=fixture();f.controller.request();assert.equal(f.callbacks.length,1);f.flush();assert.deepEqual(f.events,[]);
  f.ready=true;f.controller.notify();assert.deepEqual(f.events,[]);assert.equal(f.callbacks.length,1);
  f.flush();assert.deepEqual(f.events,['fit','persist']);f.controller.notify();assert.equal(f.callbacks.length,0);
});
test('an already ready synchronous projection also defers camera changes',()=>{
  const f=fixture();f.ready=true;f.controller.request();assert.deepEqual(f.events,[]);
  f.flush();assert.deepEqual(f.events,['fit','persist']);
});
for(const key of ['project','document','state','model','fingerprint','pose','camera']){
  test(`changed ${key} before publication cancels the queued fit`,()=>{
    const f=fixture();f.controller.request();f.owner={...f.owner,[key]:typeof f.owner[key]==='string'?'changed':{}};
    f.ready=true;f.controller.notify();f.flush();assert.deepEqual(f.events,[]);
  });
  test(`changed ${key} after scheduling cannot apply an old fit`,()=>{
    const f=fixture();f.ready=true;f.controller.request();f.owner={...f.owner,[key]:typeof f.owner[key]==='string'?'changed':{}};
    f.flush();assert.deepEqual(f.events,[]);
  });
}
test('manual camera action cancels even a held callback that still executes',()=>{
  const f=fixture();f.ready=true;f.controller.request();f.controller.cancel();f.flush();
  assert.deepEqual(f.events,[]);assert.deepEqual(f.canceled,[1]);
});
test('a new projection replaces the old intent without resurrecting it',()=>{
  const f=fixture();f.ready=true;f.controller.request();f.owner={...f.owner,pose:'new pose'};f.controller.request();
  f.flush();assert.deepEqual(f.events,[]);f.flush();assert.deepEqual(f.events,['fit','persist']);
});
test('export or a removed workspace invalidates ownership',()=>{
  const f=fixture();f.ready=true;f.controller.request();f.owner=null;f.flush();assert.deepEqual(f.events,[]);
  f.controller.request();assert.equal(f.callbacks.length,0);
});
test('duplicate display notifications schedule one fit',()=>{
  const f=fixture();f.ready=true;f.controller.request();for(let i=0;i<10;i++)f.controller.notify();
  assert.equal(f.callbacks.length,1);f.flush();assert.deepEqual(f.events,['fit','persist']);
});
test('readiness lost after scheduling waits for a later current publication',()=>{
  const f=fixture();f.ready=true;f.controller.request();f.ready=false;f.flush();assert.deepEqual(f.events,[]);
  f.ready=true;f.controller.notify();f.flush();assert.deepEqual(f.events,['fit','persist']);
});
test('a fit failure reports once and does not persist or retry',()=>{
  const f=fixture();f.controller.fit=()=>{throw Error('Invalid display');};f.ready=true;f.controller.request();f.flush();
  assert.deepEqual(f.events,['Invalid display']);f.controller.notify();assert.equal(f.callbacks.length,0);
});
test('a worker that never becomes ready cannot keep a fit intent alive forever',()=>{
  const f=fixture();f.controller.request();f.flush();f.time=10001;f.flush();
  assert.deepEqual(f.events,[]);assert.equal(f.callbacks.length,0);assert.equal(f.controller.intent,null);
});
