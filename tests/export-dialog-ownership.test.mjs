import test from 'node:test';
import assert from 'node:assert/strict';
import {ExportControls} from '../ui/export-controls.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function fixture(){
  const gate=deferred(),value=Object.create(ExportControls.prototype),oldScope={},newScope={},fresh={result:{report:{losses:[]}}},events=[];
  value.scope=oldScope;value.dialog={open:true};value.preview={textContent:'fresh preview',dataset:{status:'ready'}};
  value.session={prepared:{result:{report:{losses:['old loss']}}},confirm:()=>gate.promise};value.context={setStatus:text=>events.push(['status',text])};
  value.close=()=>events.push(['close']);value.sync=()=>events.push(['sync']);
  return {value,gate,events,fresh,newScope};
}
test('a late successful save cannot close or rewrite the status of a reopened dialog',async()=>{
  const f=fixture(),pending=f.value.confirm();f.value.scope=f.newScope;f.value.session.prepared=f.fresh;
  f.gate.resolve({path:'old-source.obj'});assert.deepEqual(await pending,{path:'old-source.obj'});
  assert.deepEqual(f.events,[]);assert.strictEqual(f.value.session.prepared,f.fresh);assert.equal(f.value.preview.textContent,'fresh preview');
});
test('a late refusal cannot erase a fresh reviewed export or replace its feedback',async()=>{
  const f=fixture(),pending=f.value.confirm();f.value.scope=f.newScope;f.value.session.prepared=f.fresh;f.gate.reject(Error('old native failure'));
  assert.equal(await pending,null);assert.deepEqual(f.events,[]);assert.strictEqual(f.value.session.prepared,f.fresh);assert.equal(f.value.preview.dataset.status,'ready');
});
test('a current-dialog refusal still clears the old review and reports its actionable error',async()=>{
  const f=fixture(),pending=f.value.confirm();f.gate.reject(Error('Source units changed'));
  await assert.rejects(pending,/units changed/);assert.equal(f.value.session.prepared,null);assert.equal(f.value.preview.textContent,'Source units changed');assert.deepEqual(f.events,[['sync']]);
});
