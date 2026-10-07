import test from 'node:test';
import assert from 'node:assert/strict';
import {TorusControls} from '../ui/torus-controls.mjs';
import {numericControlFixture,deferred,flush} from './numeric-control-fixture.mjs';
const fixture=()=>numericControlFixture(TorusControls.prototype,{'torus-ring-segments':'10','torus-arm-segments':'8','torus-arm-ratio':'1/2','torus-ring-radius':'sqrt(4)','generate-torus':''});
test('counts and sizes share one native job and preserve source/units/RGBA while generating',async()=>{
  const f=fixture(),before=structuredClone(f.project);f.nodes['torus-ring-segments'].value='2+3';
  assert.equal(await f.control.generate(),f.result);
  assert.deepEqual(f.calls,[['torus',{ring_segments:5,arm_segments:8,arm_ratio:.5,ring_radius:2}]]);
  assert.deepEqual(f.expressionCalls.map(c=>c.parts),[['2+3','8','1/2','sqrt(4)']]);assert.deepEqual(f.project,before);
  assert.equal(f.control.busy,false);assert.equal(typeof f.options[0].verifyPublication,'function');
});
test('integer/range/product checks occur after expression evaluation without native geometry publication',async()=>{
  for(const text of ['2','0','-8','1334','3/2','NaN','99999']){
    const f=fixture();f.nodes['torus-ring-segments'].value=text;await assert.rejects(f.control.generate());assert.equal(f.calls.length,0);
  }
  const f=fixture();f.nodes['torus-ring-segments'].value='100';f.nodes['torus-arm-segments'].value='41';
  await assert.rejects(f.control.generate(),/4,000/);assert.equal(f.expressionCalls.length,1);assert.equal(f.calls.length,0);
});
test('decimal/exponent spellings and integer expressions are accepted by final numerical domain',async()=>{
  for(const [text,count] of [['10.0',10],['1e2',100],['3+3',6]]){
    const f=fixture();f.nodes['torus-ring-segments'].value=text;await f.control.generate();assert.equal(f.calls[0][1].ring_segments,count);
  }
});
test('ratio and positive finite radius reject boundaries and malformed native values',async()=>{
  for(const [id,value] of [['torus-arm-ratio','0'],['torus-arm-ratio','1'],['torus-arm-ratio','NaN'],['torus-ring-radius','0'],['torus-ring-radius','-1'],['torus-ring-radius','Infinity']]){
    const f=fixture();f.nodes[id].value=value;await assert.rejects(f.control.generate());assert.equal(f.calls.length,0);assert.equal(f.control.busy,false);
  }
});
test('export and full source edits during evaluation reject and restore visible controls',async()=>{
  for(const change of [f=>f.setExport(true),f=>f.state.model.metadata.offColors.faces[0].values[3]=.1,
    f=>f.state.view.coordinateUnit='cm',f=>f.state.notes='Changed',f=>f.setProject({...f.project})]){
    const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;const running=f.control.generate();
    assert.ok(Object.values(f.nodes).every(n=>n.disabled));change(f);hold.resolve([10,8,.5,2]);
    await assert.rejects(running);assert.equal(f.calls.length,0);assert.equal(f.control.busy,false);
  }
});
test('later count/size edits reject instead of silently publishing the captured request',async()=>{
  const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;const running=f.control.generate();
  f.nodes['torus-ring-segments'].value='12';hold.resolve([10,8,.5,2]);await assert.rejects(running,/target fields/);assert.equal(f.calls.length,0);
});
test('native continuation checks the same fence; observer motion is independent',async()=>{
  for(const change of [f=>f.state.notes='Changed',f=>{f.state.view.angles[0]=90;f.state.view.camera={zoom:2};}]){
    const f=fixture(),hold=deferred();let published=false;
    f.context.generate=async(kind,params,options)=>{await hold.promise;options.verifyPublication();published=true;return f.result;};
    const running=f.control.generate();await flush();change(f);hold.resolve();
    if(f.state.notes==='Changed'){await assert.rejects(running,/changed/);assert.equal(published,false);}
    else{await running;assert.equal(published,true);assert.equal(f.state.view.angles[0],90);}
  }
});
test('busy, canceled waits and refusal permit a fresh explicit retry without late publication',async()=>{
  const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;const running=f.control.generate();
  await assert.rejects(f.control.generate(),/current torus/);f.control.cancel();await assert.rejects(running,{name:'AbortError'});
  assert.equal(f.control.busy,false);assert.ok(Object.values(f.nodes).every(n=>!n.disabled));
  f.context.evaluateMany=async()=>[10,8,.5,2];await f.control.generate();hold.resolve([12,8,.5,2]);await flush();assert.equal(f.calls.length,1);
});
