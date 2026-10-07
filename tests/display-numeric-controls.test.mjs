import test from 'node:test';
import assert from 'node:assert/strict';
import {PresentationControls} from '../ui/presentation-controls.mjs';
import {PerspectiveControls} from '../ui/perspective-controls.mjs';

function fixture(kind='radius'){
  const model={id:'source',dimension:kind==='projection'?4:3,embeddingDimension:kind==='projection'?4:3,
    interpretation:'generalized-complex',vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],
    edges:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],faces:[[0,2,1],[0,1,3],[1,2,3],[2,0,3]],cells:[],metadata:{coordinateUnits:'mm'}};
  if(kind==='projection')model.vertices=model.vertices.map(p=>[...p,0]);
  const state={model,notes:'retained',view:{coordinateUnit:'mm',camera:{zoom:2},angles:[0,0,0,0,0,0],
    vertexRadius:.015,edgeRadius:.006,vertexStyle:'sphere',edgeStyle:'cylinder',perspectiveDistance4D:3,perspectiveNear4D:.08}};
  const doc={id:'doc',states:[state],cursor:0};const project={documents:[doc],active:0};let exporting=false;
  const calls=[],context={getProject:()=>project,getDocument:()=>doc,getState:()=>state,isExporting:()=>exporting,
    evaluateMany:async()=>kind==='projection'?[4,.5]:[.02],markDirty:()=>calls.push('dirty'),display:()=>calls.push('display')};
  const nodes={'vertex-radius':{value:'1/50'},'edge-radius':{value:'1/100'}};
  const controls=Object.assign(Object.create(kind==='projection'?PerspectiveControls.prototype:PresentationControls.prototype),{
    context,panel:{querySelector:selector=>nodes[selector.slice(1)]},distance:{value:'2+2'},near:{value:'1/2'}});
  return {controls,context,state,nodes,calls,export:()=>exporting=true};
}
const deferred=()=>{let resolve;const promise=new Promise(a=>resolve=a);return {promise,resolve};};
test('a radius expression edits only its intended field and preserves newer camera/other radius',async()=>{
  const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;
  const pending=f.controls.editRadius('vertex-radius');f.state.view.edgeRadius=.03;f.state.view.camera.zoom=7;f.state.view.angles[1]=42;
  hold.resolve([.02]);await pending;assert.equal(f.state.view.vertexRadius,.02);assert.equal(f.state.view.edgeRadius,.03);
  assert.equal(f.state.view.camera.zoom,7);assert.equal(f.state.view.angles[1],42);assert.equal(f.state.view.vertexStyle,'sphere');
});
test('invalid radius never changes presentation',async()=>{
  for(const value of [0,-.1,.51,Infinity]){const f=fixture(),before=structuredClone(f.state);f.context.evaluateMany=async()=>[value];
    await assert.rejects(f.controls.editRadius('vertex-radius'));assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);}
});
test('projection pair validates cross-parameter relation before either setting changes',async()=>{
  for(const pair of [[0,.1],[101,.1],[3,3],[3,4],[3,0]]){
    const f=fixture('projection'),before=structuredClone(f.state);f.context.evaluateMany=async()=>pair;
    await assert.rejects(f.controls.edit());assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);
  }
});
test('valid perspective expression pair preserves latest observer/rotation',async()=>{
  const f=fixture('projection'),hold=deferred();f.context.evaluateMany=()=>hold.promise;
  const pending=f.controls.edit();f.state.view.camera.zoom=8;f.state.view.angles[4]=30;
  hold.resolve([4,.5]);await pending;assert.equal(f.state.view.perspectiveDistance4D,4);assert.equal(f.state.view.perspectiveNear4D,.5);
  assert.equal(f.state.view.camera.zoom,8);assert.equal(f.state.view.angles[4],30);
});
test('new target input, saved projection settings, source attributes and export invalidate pending display edits',async()=>{
  for(const change of [f=>f.controls.distance.value='5',f=>f.state.view.perspectiveNear4D=.2,
    f=>f.state.notes='changed',f=>f.state.view.coordinateUnit='in',f=>f.export()]){
    const f=fixture('projection'),hold=deferred();f.context.evaluateMany=()=>hold.promise;const pending=f.controls.edit();
    change(f);hold.resolve([4,.5]);await assert.rejects(pending);assert.deepEqual(f.calls,[]);
  }
});
test('cancelled display edit clears busy state and ignores late native response',async()=>{
  const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;const pending=f.controls.editRadius('edge-radius');
  f.controls.cancelNumeric();await assert.rejects(pending,{name:'AbortError'});hold.resolve([.01]);
  assert.equal(f.controls.numericEntry,null);assert.equal(f.state.view.edgeRadius,.006);assert.deepEqual(f.calls,[]);
});
