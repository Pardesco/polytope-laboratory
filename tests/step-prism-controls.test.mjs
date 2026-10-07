import test from 'node:test';
import assert from 'node:assert/strict';
import {StepPrismControls} from '../ui/step-prism-controls.mjs';
import {numericControlFixture,deferred,flush} from './numeric-control-fixture.mjs';
const fixture=()=>numericControlFixture(StepPrismControls.prototype,{'step-prism-n':'13','step-prism-step':'-2','step-prism-radius':'sqrt(4)','generate-step-prism':''});
test('order/step expressions and evaluated radius publish unchanged signed parameters in one native job',async()=>{
  const f=fixture();f.nodes['step-prism-n'].value='2+3';f.nodes['step-prism-step'].value='-(1+1)';await f.control.generate();
  assert.deepEqual(f.calls,[['step-prism',{n:5,step:-2,radius:2}]]);assert.equal(f.expressionCalls.length,1);
});
test('noncoprime and signed steps are preserved without reduction; numerical integer spellings are accepted',async()=>{
  for(const [n,text,step] of [[6,'2',2],[6,'-2',-2],[9,'+3',3],[12,'4',4],[128,'-126',-126]]){
    const f=fixture();f.nodes['step-prism-n'].value=String(n);f.nodes['step-prism-step'].value=text;await f.control.generate();
    assert.deepEqual(f.calls[0][1],{n,step,radius:2});
  }
  const f=fixture();f.nodes['step-prism-n'].value='13.0';f.nodes['step-prism-step'].value='2/1';await f.control.generate();assert.equal(f.calls[0][1].step,2);
});
test('post-evaluation integer/count/step domains refuse without generator invocation',async()=>{
  for(const [id,text] of [['step-prism-n','4'],['step-prism-n','129'],['step-prism-n','3/2'],
    ['step-prism-step','0'],['step-prism-step','13'],['step-prism-step','-13'],['step-prism-step','3/2']]){
    const f=fixture();f.nodes[id].value=text;await assert.rejects(f.control.generate());assert.equal(f.calls.length,0);
  }
});
test('radius bounds accept endpoints and reject primitive/nonfinite/out-of-domain results',async()=>{
  for(const radius of [1e-70,1e70]){const f=fixture();f.context.evaluateMany=async()=>[13,-2,radius];await f.control.generate();assert.equal(f.calls[0][1].radius,radius);}
  for(const radius of [NaN,Infinity,0,-1,1e-71,1e71,true,'2']){const f=fixture();f.context.evaluateMany=async()=>[13,-2,radius];
    await assert.rejects(f.control.generate());assert.equal(f.calls.length,0);assert.equal(f.control.busy,false);}
});
test('export and changing current fields cannot bypass programmatic construction guards',async()=>{
  const f=fixture();f.setExport(true);f.control.sync();assert.ok(Object.values(f.nodes).every(n=>n.disabled));await assert.rejects(f.control.generate(),/export/);
  const g=fixture(),hold=deferred();g.context.evaluateMany=()=>hold.promise;const running=g.control.generate();g.nodes['step-prism-step'].value='3';
  hold.resolve([13,-2,2]);await assert.rejects(running,/target fields/);assert.equal(g.calls.length,0);
});
test('native publication checks full source and latest observer pose stays untouched',async()=>{
  for(const changed of [false,true]){
    const f=fixture(),hold=deferred();let published=false;f.context.generate=async(kind,params,options)=>{await hold.promise;options.verifyPublication();published=true;return f.result;};
    const running=f.control.generate();await flush();f.state.view.angles[0]=80;f.state.view.camera={zoom:3};if(changed)f.state.model.metadata.offColors.faces[0].values[3]=.9;
    hold.resolve();if(changed){await assert.rejects(running,/changed/);assert.equal(published,false);}else{await running;assert.equal(published,true);assert.equal(f.state.view.camera.zoom,3);}
  }
});
test('cancel/refusal releases busy lock; native rank degeneracy remains a diagnosed refusal',async()=>{
  const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;const running=f.control.generate();
  await assert.rejects(f.control.generate(),/current step-prism/);f.control.cancel();await assert.rejects(running,{name:'AbortError'});assert.equal(f.control.busy,false);
  const g=fixture();g.nodes['step-prism-n'].value='6';g.nodes['step-prism-step'].value='3';g.context.generate=async(kind,params,options)=>{
    options.verifyPublication();assert.deepEqual(params,{n:6,step:3,radius:2});throw Error('Correlated vertices have affine dimension 3.');};
  await assert.rejects(g.control.generate(),/affine dimension/);assert.equal(g.control.busy,false);
});
test('constructor uses existing compact anchors and text numeric fields',async()=>{
  const previous=globalThis.document;
  try{const f=fixture(),inserted=[];globalThis.document={createElement:()=>f.panel,getElementById:id=>id==='antiprism-settings'?{after:panel=>inserted.push(panel)}:null};
    const control=new StepPrismControls(f.context);assert.deepEqual(inserted,[f.panel]);assert.match(f.panel.innerHTML,/maxlength="512"/);
    await f.nodes['generate-step-prism'].onclick();assert.equal(control.busy,false);assert.equal(f.calls.length,1);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
