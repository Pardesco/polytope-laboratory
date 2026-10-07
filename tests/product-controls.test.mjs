import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceContext,sourceModel} from './construction-controls-fixture.mjs';
import {ProductControls} from '../ui/product-controls.mjs';

export function fixture(){
  const nodes=Object.fromEntries(Object.entries({
    'product-left-symbol':'6/-2','product-left-radius':'sqrt(4)',
    'product-right-symbol':'5/3','product-right-radius':'3',
    'polygon-prism-height':'sqrt(4)','generate-polygon-product':'','make-polygon-prism':''
  }).map(([id,value])=>[id,{value,disabled:false}]));
  const calls=[],owner=sourceContext(2);
  const controls=Object.create(ProductControls.prototype);
  Object.assign(controls,{busy:false,panel:{querySelector:selector=>nodes[selector.slice(1)],querySelectorAll:()=>Object.values(nodes)},
    generateButton:nodes['generate-polygon-product'],prismButton:nodes['make-polygon-prism'],
    context:{...owner,number:async text=>{calls.push(['number',text]);return text==='sqrt(4)'?2:Number(text);},
      generate:async(params,options)=>{options.verifyPublication();calls.push(['generate',params]);},commit:async(op,params,label,options)=>{options.verifyPublication();calls.push(['commit',op,params,label]);}}});
  return {controls,nodes,calls,owner,setState:owner.setState,setExport:owner.setExport};
}

test('actual controller evaluates radii separately and passes unreduced signed symbols untouched',async()=>{
  const f=fixture();await f.controls.generate();
  assert.deepEqual(f.calls,[['number','sqrt(4)'],['number','3'],['generate',{left:{symbol:'6/-2',radius:2},right:{symbol:'5/3',radius:3}}]]);
  assert.equal(f.controls.busy,false);assert.equal(f.nodes['generate-polygon-product'].disabled,false);
});

test('actual prism controller commits explicit height while source dimensionality gates controls',async()=>{
  const f=fixture();await f.controls.prism();
  assert.deepEqual(f.calls,[['number','sqrt(4)'],['commit','polygon-prism',{height:2},'Polygon × interval']]);
  for(const model of [null,{dimension:4,embeddingDimension:4},{dimension:2,embeddingDimension:3}]){
    f.setState(model?{model}:null);f.controls.sync();
    assert.equal(f.nodes['make-polygon-prism'].disabled,true);assert.equal(f.nodes['polygon-prism-height'].disabled,true);
    await assert.rejects(()=>f.controls.prism(),/intrinsic 2D/);
    assert.equal(f.nodes['generate-polygon-product'].disabled,false);
  }
});

test('export guards block expression evaluation and publication both before and during construction',async()=>{
  const f=fixture();f.setExport(true);f.controls.sync();
  assert.ok(Object.values(f.nodes).every(node=>node.disabled));
  await assert.rejects(()=>f.controls.generate(),/export/);await assert.rejects(()=>f.controls.prism(),/export/);assert.deepEqual(f.calls,[]);
  for(const operation of ['generate','prism']){
    f.setExport(false);f.controls.context.number=async()=>{f.setExport(true);return 2;};
    await assert.rejects(()=>f.controls[operation](),/export/);
    assert.equal(f.controls.busy,false);assert.deepEqual(f.calls,[]);
  }
});

test('a changed active source during async height evaluation rejects a stale prism commit',async()=>{
  const f=fixture();let resolve;
  f.controls.context.number=()=>new Promise(done=>{resolve=done;});
  const pending=f.controls.prism();await new Promise(done=>setImmediate(done));
  f.setState({...f.owner.getState(),model:sourceModel(3)});resolve(2);
  await assert.rejects(()=>pending,/source.*changed/);
  assert.deepEqual(f.calls,[]);assert.equal(f.controls.busy,false);assert.equal(f.nodes['make-polygon-prism'].disabled,true);
});

test('pending construction disables actions and rejects concurrent generator or prism callbacks',async()=>{
  const f=fixture();let resolve,first=true;
  f.controls.context.number=()=>first?(first=false,new Promise(done=>{resolve=done;})):Promise.resolve(3);
  const pending=f.controls.generate();await new Promise(done=>setImmediate(done));
  assert.ok(Object.values(f.nodes).every(node=>node.disabled));
  await assert.rejects(()=>f.controls.generate(),/current product/);await assert.rejects(()=>f.controls.prism(),/current product/);
  resolve(2);await pending;assert.equal(f.calls.filter(call=>call[0]==='generate').length,1);assert.equal(f.controls.busy,false);
});

test('literal symbol and finite positive size failures leave both construction callbacks untouched',async()=>{
  for(const symbol of ['5/(1+1)','sqrt(5)','', '5/2'.repeat(12)]){
    const f=fixture();f.nodes['product-left-symbol'].value=symbol;
    await assert.rejects(()=>f.controls.generate(),/literal polygon/);assert.deepEqual(f.calls,[]);
  }
  for(const value of [0,-1,Infinity,NaN,1e101]){
    const f=fixture();f.controls.context.number=async()=>value;
    await assert.rejects(()=>f.controls.generate(),/domain|finite|bounded/);await assert.rejects(()=>f.controls.prism(),/domain|finite|bounded/);
    assert.deepEqual(f.calls,[]);assert.equal(f.controls.busy,false);
  }
});
