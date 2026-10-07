import test from 'node:test';
import assert from 'node:assert/strict';
import {CupolaControls} from '../ui/cupola-controls.mjs';
import {numericControlFixture,deferred,flush} from './numeric-control-fixture.mjs';
function fixture(){
  const f=numericControlFixture(CupolaControls.prototype,{'cupola-n':'3','cupola-edge-length':'sqrt(4)','cupola-height':'','generate-cupola':''});
  f.context.generate=async(params,options)=>{options.verifyPublication();f.calls.push(params);f.options.push(options);return f.result;};return f;
}
test('count expression shares one native job and retains optional canonical cupola height',async()=>{
  const f=fixture();f.nodes['cupola-n'].value='2+3';await f.control.generate();
  assert.deepEqual(f.calls,[{n:5,edge_length:2,height:null}]);assert.deepEqual(f.expressionCalls[0].parts,['2+3','sqrt(4)']);
});
test('n>=6 requires explicit positive height after evaluated count; fraction/range failures cannot generate',async()=>{
  const f=fixture();f.nodes['cupola-n'].value='3+3';await assert.rejects(f.control.generate(),/explicit positive/);assert.equal(f.calls.length,0);
  f.nodes['cupola-height'].value='1/2';await f.control.generate();assert.deepEqual(f.calls[0],{n:6,edge_length:2,height:.5});
  for(const count of ['2','129','3/2']){const g=fixture();g.nodes['cupola-n'].value=count;await assert.rejects(g.control.generate(),/domain/);assert.equal(g.calls.length,0);}
});
test('size/count edits and source/export changes during await refuse atomically',async()=>{
  for(const change of [f=>f.nodes['cupola-height'].value='1',f=>f.nodes['cupola-n'].value='4',
    f=>f.state.notes='Changed',f=>f.state.view.coordinateUnit='cm',f=>f.setExport(true)]){
    const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;const run=f.control.generate();change(f);hold.resolve([3,2]);
    await assert.rejects(run);assert.equal(f.calls.length,0);assert.equal(f.control.busy,false);
  }
});
test('native publication is source-bound but independent camera/rotation remains live',async()=>{
  for(const changed of [false,true]){
    const f=fixture(),hold=deferred();let published=false;f.context.generate=async(params,options)=>{await hold.promise;options.verifyPublication();published=true;return f.result;};
    const run=f.control.generate();await flush();f.state.view.angles[0]=90;if(changed)f.state.model.metadata.offColors.faces[0].values[3]=.1;hold.resolve();
    if(changed){await assert.rejects(run,/changed/);assert.equal(published,false);}else{await run;assert.equal(published,true);assert.equal(f.state.view.angles[0],90);}
  }
});
test('busy cancellation restores visible nodes and native refusal allows next request',async()=>{
  const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;const run=f.control.generate();
  assert.ok(Object.values(f.nodes).every(n=>n.disabled));await assert.rejects(f.control.generate(),/current cupola/);
  f.control.cancel();await assert.rejects(run,{name:'AbortError'});assert.equal(f.control.busy,false);assert.ok(Object.values(f.nodes).every(n=>!n.disabled));
});
test('constructor mounts compact text-count fields and actual guarded action',async()=>{
  const previous=globalThis.document;
  try{const f=fixture(),mount=[];globalThis.document={createElement:()=>f.panel,getElementById:()=>({after:node=>mount.push(node)})};
    new CupolaControls(f.context);assert.deepEqual(mount,[f.panel]);assert.match(f.panel.innerHTML,/type="text"/);await f.nodes['generate-cupola'].onclick();assert.equal(f.calls.length,1);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
