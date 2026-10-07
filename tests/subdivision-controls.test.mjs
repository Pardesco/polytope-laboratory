import test from 'node:test';
import assert from 'node:assert/strict';
import {SubdivisionControls} from '../ui/subdivision-controls.mjs';
import {numericControlFixture,deferred,flush} from './numeric-control-fixture.mjs';
const fixture=()=>numericControlFixture(SubdivisionControls.prototype,{'edge-divisions':'2+3','subdivision-edge-ids':'3, 1, 0','subdivide-edges':''});
test('evaluated integer divisions preserve literal edge ID order and guarded native operation',async()=>{
  const f=fixture();await f.control.construct();assert.deepEqual(f.calls,[['subdivide-edges',{divisions:5,edge_ids:[3,1,0]},'Subdivide source edges']]);
  assert.deepEqual(f.expressionCalls[0].parts,['2+3']);assert.equal(typeof f.options[0].verifyPublication,'function');
});
test('counts retain integer/range checks and source IDs do not become expression fields',async()=>{
  for(const value of ['0','129','3/2']){const f=fixture();f.nodes['edge-divisions'].value=value;await assert.rejects(f.control.construct(),/domain/);assert.equal(f.calls.length,0);}
  for(const value of ['1/2','sqrt(4)','+1','1.0','-1','1e2']){
    const f=fixture();f.nodes['subdivision-edge-ids'].value=value;await assert.rejects(f.control.construct(),/literal/);assert.equal(f.expressionCalls.length,0);
  }
});
test('blank IDs retain native all-edge choice; long literal lists are not restricted to target64KiB',async()=>{
  const f=fixture();f.nodes['subdivision-edge-ids'].value='';await f.control.construct();assert.deepEqual(f.calls[0][1],{divisions:5});
  const g=fixture();g.nodes['subdivision-edge-ids'].value=Array.from({length:20000},(_,i)=>String(i)).join(',');
  g.context.commit=async(op,params,label,options)=>{options.verifyPublication();assert.equal(params.edge_ids.length,20000);return g.result;};
  // Native range/budget validation still owns this deliberately oversized source-ID fixture.
  assert.equal(await g.control.construct(),g.result);
});
test('source/field/selection edits and export during expression await reject publication',async()=>{
  for(const change of [f=>f.nodes['edge-divisions'].value='3',f=>f.nodes['subdivision-edge-ids'].value='1',
    f=>f.state.notes='Changed',f=>f.document.id='replacement',f=>f.setExport(true)]){
    const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;const run=f.control.construct();change(f);hold.resolve([5]);
    await assert.rejects(run);assert.equal(f.calls.length,0);assert.equal(f.control.busy,false);
  }
});
test('held native publication rechecks IDs/full source and keeps moving observer independent',async()=>{
  for(const changed of [false,true]){
    const f=fixture(),hold=deferred();let published=false;f.context.commit=async(op,params,label,options)=>{await hold.promise;options.verifyPublication();published=true;return f.result;};
    const run=f.control.construct();await flush();f.state.view.camera={zoom:2};if(changed)f.nodes['subdivision-edge-ids'].value='2';hold.resolve();
    if(changed){await assert.rejects(run,/IDs changed/);assert.equal(published,false);}else{await run;assert.equal(published,true);assert.equal(f.state.view.camera.zoom,2);}
  }
});
test('busy/export programmatic bypass, cancellation and retry preserve all source attributes',async()=>{
  const f=fixture(),original=structuredClone(f.project),hold=deferred();f.context.evaluateMany=()=>hold.promise;const run=f.control.construct();
  await assert.rejects(f.control.construct(),/current subdivision/);f.control.cancel();await assert.rejects(run,{name:'AbortError'});
  assert.equal(f.control.busy,false);assert.deepEqual(f.project,original);f.setExport(true);await assert.rejects(f.control.construct(),/export/);
});
