import test from 'node:test';
import assert from 'node:assert/strict';
import {ViewportControls} from '../ui/viewport-controls.mjs';

const source=()=>({id:'source',dimension:3,embeddingDimension:3,interpretation:'generalized-complex',
  vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],edges:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],
  faces:[[0,2,1],[0,1,3],[1,2,3],[2,0,3]],cells:[],metadata:{coordinateUnits:'mm'}});
function fixture(text='60/5'){
  const state={model:source(),notes:'retained',view:{rotationSpeed:12,angles:[0,0,0,0,0,0],camera:{zoom:2},coordinateUnit:'mm'}};
  const doc={id:'doc',states:[state],cursor:0};let project={documents:[doc],active:0},exporting=false;
  const calls=[],context={getProject:()=>project,getDocument:()=>project.documents[0],getState:()=>project.documents[0].states[0],
    isExporting:()=>exporting,evaluateMany:async()=>[12],markDirty:()=>calls.push('dirty')};
  const controls=Object.assign(Object.create(ViewportControls.prototype),{context,speed:{value:text}});
  return {controls,context,state,calls,replace:()=>project={...project},export:()=>exporting=true};
}
const deferred=()=>{let resolve;const promise=new Promise(a=>resolve=a);return {promise,resolve};};
test('expression speed edits preserve independently advancing rotation and latest observer',async()=>{
  const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;
  const pending=f.controls.editSpeed();f.state.view.angles[2]=43;f.state.view.camera.zoom=5;
  hold.resolve([-24]);await pending;
  assert.equal(f.state.view.rotationSpeed,-24);assert.equal(f.controls.speed.value,'-24');
  assert.equal(f.state.view.angles[2],43);assert.equal(f.state.view.camera.zoom,5);assert.deepEqual(f.calls,['dirty']);
});
test('failed/native overbudget speed leaves original state untouched',async()=>{
  for(const value of [181,-181,NaN,Infinity]){
    const f=fixture();f.context.evaluateMany=async()=>[value];const before=structuredClone(f.state);
    await assert.rejects(f.controls.editSpeed());assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);
  }
});
test('speed text/config/source/units/project/export changes invalidate held results',async()=>{
  for(const change of [f=>f.controls.speed.value='25',f=>f.state.view.rotationSpeed=30,
    f=>f.state.model.vertices[0][0]=.2,f=>f.state.view.coordinateUnit='in',f=>f.state.notes='new',f=>f.replace(),f=>f.export()]){
    const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;const pending=f.controls.editSpeed();
    change(f);hold.resolve([24]);await assert.rejects(pending);assert.ok(!f.calls.length);
  }
});
test('speed cancellation refuses ignored native result and clears current edit',async()=>{
  const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;const pending=f.controls.editSpeed();
  f.controls.cancelNumeric();await assert.rejects(pending,{name:'AbortError'});hold.resolve([24]);
  assert.equal(f.controls.numericEntry,null);assert.deepEqual(f.calls,[]);
});
