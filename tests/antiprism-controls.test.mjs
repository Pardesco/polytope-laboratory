import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceContext} from './construction-controls-fixture.mjs';
import {AntiprismControls} from '../ui/antiprism-controls.mjs';

export function fixture(){
  const nodes=Object.fromEntries(Object.entries({
    'antiprism-symbol':' 6/-2 ','antiprism-base-sizing':'radius','antiprism-base-size':'sqrt(4)',
    'antiprism-elevation':'equal-triangle','antiprism-elevation-value':'invalid hidden value',
    'antiduoprism-height':'3','polyhedron-prism-height':'sqrt(4)',
    'antiprism-base-size-name':'','antiprism-elevation-name':'','antiprism-elevation-input':'',
    'generate-antiprism':'','generate-antiduoprism':'','make-polyhedron-prism':''
  }).map(([id,value])=>[id,{value,disabled:false,hidden:false,textContent:''}]));
  const calls=[],owner=sourceContext(3);
  const controls=Object.create(AntiprismControls.prototype);
  Object.assign(controls,{busy:false,panel:{querySelector:selector=>nodes[selector.slice(1)],querySelectorAll:()=>Object.values(nodes)},
    baseSizing:nodes['antiprism-base-sizing'],elevation:nodes['antiprism-elevation'],baseName:nodes['antiprism-base-size-name'],
    elevationName:nodes['antiprism-elevation-name'],elevationRow:nodes['antiprism-elevation-input'],prismButton:nodes['make-polyhedron-prism'],
    context:{...owner,number:async text=>{calls.push(['number',text]);return text==='sqrt(4)'?2:Number(text);},
      generate:async(kind,params,options)=>{options.verifyPublication();calls.push(['generate',kind,params]);},commit:async(op,params,label,options)=>{options.verifyPublication();calls.push(['commit',op,params,label]);}}});
  controls.sync();
  return {controls,nodes,calls,owner,setState:owner.setState,setExport:owner.setExport};
}

test('equal-triangle default passes raw unreduced signed symbol and omits hidden elevation input',async()=>{
  const f=fixture();await f.controls.generate('rational-antiprism');
  assert.deepEqual(f.calls,[['number','sqrt(4)'],['generate','rational-antiprism',{symbol:' 6/-2 ',radius:2}]]);
  assert.equal(f.nodes['antiprism-elevation-input'].hidden,true);assert.equal(f.nodes['antiprism-elevation-value'].disabled,true);
  assert.equal(f.controls.busy,false);
});

test('all explicit sizing selections publish mutually exclusive backend fields and show relevant elevation',async()=>{
  for(const base of ['radius','base-edge'])for(const elevation of ['height','side-edge']){
    const f=fixture();f.nodes['antiprism-base-sizing'].value=base;f.nodes['antiprism-elevation'].value=elevation;
    f.nodes['antiprism-elevation-value'].value='3';f.controls.sync();await f.controls.generate('rational-antiprism');
    const expected={symbol:' 6/-2 ',[base==='radius'?'radius':'base_edge']:2,[elevation==='height'?'height':'side_edge']:3};
    assert.deepEqual(f.calls,[['number','sqrt(4)'],['number','3'],['generate','rational-antiprism',expected]]);
    assert.equal(f.nodes['antiprism-elevation-input'].hidden,false);assert.equal(f.nodes['antiprism-elevation-value'].disabled,false);
    assert.equal(f.nodes['antiprism-base-size-name'].textContent,base==='radius'?'Radius':'Base edge length');
    assert.equal(f.nodes['antiprism-elevation-name'].textContent,elevation==='height'?'Height':'Side edge length');
  }
});

test('antiduoprism combines the same literal base parameters with independent interval height',async()=>{
  const f=fixture();f.nodes['antiprism-symbol'].value='5/3';f.nodes['antiprism-elevation'].value='height';f.nodes['antiprism-elevation-value'].value='1';
  await f.controls.generate('antiduoprism');
  assert.deepEqual(f.calls,[['number','sqrt(4)'],['number','1'],['number','3'],['generate','antiduoprism',{symbol:'5/3',radius:2,height:1,interval_height:3}]]);
});

test('intrinsic 3D current-source prism invokes its recipe operation; other embeddings are gated',async()=>{
  const f=fixture();await f.controls.prism();
  assert.deepEqual(f.calls,[['number','sqrt(4)'],['commit','polyhedron-prism',{height:2},'Polyhedron × interval']]);
  for(const model of [null,{dimension:2,embeddingDimension:2},{dimension:4,embeddingDimension:4},{dimension:3,embeddingDimension:4}]){
    f.setState(model?{model}:null);f.controls.sync();assert.equal(f.nodes['make-polyhedron-prism'].disabled,true);
    assert.equal(f.nodes['polyhedron-prism-height'].disabled,true);assert.equal(f.nodes['generate-antiprism'].disabled,false);
    await assert.rejects(()=>f.controls.prism(),/intrinsic 3D/);
  }
});

test('export guard stops all callbacks before any expression evaluation',async()=>{
  const f=fixture();f.setExport(true);f.controls.sync();
  assert.ok(Object.values(f.nodes).every(node=>node.disabled));
  for(const operation of [()=>f.controls.generate('rational-antiprism'),()=>f.controls.generate('antiduoprism'),()=>f.controls.prism()]){
    await assert.rejects(operation,/export/);
  }
  assert.deepEqual(f.calls,[]);
});

test('export starting during an expression stops immediately before the next expression or publication',async()=>{
  for(const kind of ['rational-antiprism','antiduoprism','current']){
    const f=fixture();f.nodes['antiprism-elevation'].value='height';let evaluations=0;
    f.controls.context.number=async()=>{evaluations++;f.setExport(true);return 2;};
    await assert.rejects(()=>kind==='current'?f.controls.prism():f.controls.generate(kind),/export/);
    assert.equal(evaluations,1);assert.deepEqual(f.calls,[]);assert.equal(f.controls.busy,false);
  }
});

test('active model or active state changes during height evaluation cancel the current-source operation',async()=>{
  for(const modelChanged of [false,true]){
    const f=fixture();let resolve;
    f.controls.context.number=()=>new Promise(done=>{resolve=done;});
    const previous=f.controls.context.getState(),pending=f.controls.prism();await new Promise(done=>setImmediate(done));
    f.setState({...previous,model:modelChanged?structuredClone(previous.model):previous.model});resolve(2);
    await assert.rejects(()=>pending,/source.*changed/);assert.deepEqual(f.calls,[]);assert.equal(f.controls.busy,false);
  }
});

test('busy construction disables controls and refuses concurrent generation and source-prism callbacks',async()=>{
  const f=fixture();let resolve;
  f.controls.context.number=()=>new Promise(done=>{resolve=done;});
  const pending=f.controls.generate('rational-antiprism');await new Promise(done=>setImmediate(done));
  assert.ok(Object.values(f.nodes).every(node=>node.disabled));
  await assert.rejects(()=>f.controls.generate('antiduoprism'),/current antiprism/);await assert.rejects(()=>f.controls.prism(),/current antiprism/);
  resolve(2);await pending;assert.equal(f.calls.length,1);assert.equal(f.controls.busy,false);
});

test('literal symbols and unknown mode/kind refusals are atomic',async()=>{
  for(const symbol of ['','5/(1+1)','sqrt(5)','5/2'.repeat(12)]){
    const f=fixture();f.nodes['antiprism-symbol'].value=symbol;
    await assert.rejects(()=>f.controls.generate('rational-antiprism'),/literal polygon/);assert.deepEqual(f.calls,[]);
  }
  for(const [id,value,message] of [['antiprism-base-sizing','diameter',/radius or base/],['antiprism-elevation','hull',/equilateral triangles/]]){
    const f=fixture();f.nodes[id].value=value;await assert.rejects(()=>f.controls.generate('rational-antiprism'),message);assert.deepEqual(f.calls,[]);
  }
  const f=fixture();await assert.rejects(()=>f.controls.generate('unknown'),/antiprism construction/);assert.deepEqual(f.calls,[]);
});

test('finite positive expression bounds leave backend callbacks untouched and release busy state',async()=>{
  for(const value of [0,-1,Infinity,NaN,1e101]){
    const f=fixture();f.controls.context.number=async()=>value;
    await assert.rejects(()=>f.controls.generate('rational-antiprism'),/domain|finite|bounded/);await assert.rejects(()=>f.controls.prism(),/domain|finite|bounded/);
    assert.deepEqual(f.calls,[]);assert.equal(f.controls.busy,false);
  }
});

test('native refusal or cancellation resets controls and permits the next explicit request',async()=>{
  for(const message of ['Equal-triangle height is not real and positive.','Cancelled']){
    const f=fixture();let count=0;f.controls.context.generate=async()=>{if(!count++)throw Error(message);};
    await assert.rejects(()=>f.controls.generate('rational-antiprism'),new RegExp(message.replace('.','\\.')));
    assert.equal(f.controls.busy,false);assert.equal(f.nodes['generate-antiprism'].disabled,false);
    await f.controls.generate('rational-antiprism');assert.equal(count,2);
  }
});

test('cancelled numeric evaluation releases busy state without constructing a partial model',async()=>{
  for(const operation of ['rational-antiprism','antiduoprism','current']){
    const f=fixture();f.controls.context.number=async()=>{throw Error('Cancelled expression');};
    await assert.rejects(()=>operation==='current'?f.controls.prism():f.controls.generate(operation),/Cancelled expression/);
    assert.equal(f.controls.busy,false);assert.deepEqual(f.calls,[]);assert.equal(f.nodes['generate-antiprism'].disabled,false);
  }
});
