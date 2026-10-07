import test from 'node:test';
import assert from 'node:assert/strict';
import {publishBoundedExport} from '../ui/bounded-export.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('held export dialog cannot publish after source changes',async()=>{
  const dialog=deferred(),calls=[];let current=true;
  const api={beginTextExport:()=>dialog.promise,writeTextExport:async()=>calls.push('write'),abortTextExport:async id=>calls.push(['abort',id])};
  const result=publishBoundedExport(api,'csv','literal',{verifyPublication:()=>{if(!current)throw Error('source changed');}});
  current=false;dialog.resolve({id:'ticket'});
  await assert.rejects(result,/source changed/);assert.deepEqual(calls,[['abort','ticket']]);
});
test('PDF rendering stays private until source is rechecked',async()=>{
  const render=deferred(),calls=[];let current=true;
  const api={beginTextExport:async()=>({id:'pdf'}),renderPackedNetPdf:()=>render.promise,writeTextExport:async()=>calls.push('write'),abortTextExport:async id=>calls.push(['abort',id])};
  const result=publishBoundedExport(api,'pdf',['<svg/>'],{verifyPublication:()=>{if(!current)throw Error('source changed');}});
  await Promise.resolve();current=false;render.resolve(new Uint8Array([1,2]));
  await assert.rejects(result,/source changed/);assert.deepEqual(calls,[['abort','pdf']]);
});
test('cancel during a held dialog aborts its late ticket without publishing',async()=>{
  const dialog=deferred(),calls=[],controller=new AbortController();
  const api={beginTextExport:()=>dialog.promise,writeTextExport:async()=>calls.push('write'),abortTextExport:async id=>calls.push(['abort',id])};
  const result=publishBoundedExport(api,'svg','<svg/>',{signal:controller.signal});
  controller.abort();dialog.resolve({id:'late'});
  await assert.rejects(result,{name:'AbortError'});assert.deepEqual(calls,[['abort','late']]);
});
test('confirmed PDF ticket publishes literal rendered bytes once',async()=>{
  const bytes=new Uint8Array([37,80,68,70]),calls=[];
  const api={beginTextExport:async params=>{calls.push(params);return {id:'pdf'};},renderPackedNetPdf:async pages=>{calls.push(pages);return bytes;},writeTextExport:async(id,data)=>{assert.equal(data,bytes);calls.push(id);return {path:'chosen.pdf'};},abortTextExport:async()=>assert.fail('completed ticket must not abort')};
  assert.deepEqual(await publishBoundedExport(api,'pdf',['native page']),{path:'chosen.pdf'});
  assert.equal(calls.length,3);
});
