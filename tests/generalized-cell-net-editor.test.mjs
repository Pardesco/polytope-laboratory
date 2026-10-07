import test from 'node:test';
import assert from 'node:assert/strict';
import {CellNetEditor} from '../ui/cell-net-editor.js';

function harness(run){
  const model={id:'source4',fingerprint:'source-fp',dimension:4,embeddingDimension:4,vertices:[[0,0,0,0],[1,0,0,0],[0,1,0,0],[0,0,1,0]],edges:[[0,1],[1,2],[0,2],[0,3],[1,3],[2,3]],faces:[[0,1,2],[0,1,3],[0,2,3],[1,2,3]],cells:[[0,1,2,3]],metadata:{units:'source-units'}};
  const state={model,view:{derivedMode:'cell-net',cellNet:{root:0,shrink:.8}},notes:'Literal notes',cellNetLayout:null};let dirty=0;
  const context={getState:()=>state,getModel:()=>model,isBusy:()=>false,isExporting:()=>false};
  const editor=Object.assign(Object.create(CellNetEditor.prototype),{...context,context,run,sequence:0,markDirty:()=>dirty++});
  return {model,state,editor,dirty:()=>dirty};
}
const net={sourceId:'source4',sourceFingerprint:'source-fp',root:0,connections:[1],placements:[{root:0,translation:[2,3,4],quaternion:[0,0,0,1]}]};

test('saved source-bound whole-cell layout parameters restore without truncating Undo history',async()=>{
  let params;const h=harness(async(op,p)=>{assert.equal(op,'cell-net');params=p;return structuredClone(net);});
  h.state.cellNetHistory={sourceFingerprint:h.model.fingerprint,sourceId:h.model.id,cursor:1,states:[{root:0,connections:[],placements:[]},{root:0,connections:net.connections,placements:net.placements},{root:0,connections:[2],placements:[]}]};
  const before=structuredClone(h.state.cellNetHistory);await h.editor.evaluate(h.model,h.state);
  assert.deepEqual(params,{root:0,connections:net.connections,placements:net.placements});assert.deepEqual(h.state.cellNetHistory,before);assert.deepEqual(h.state.cellNetLayout,net);assert.equal(h.dirty(),1);
  await h.editor.evaluate(h.model,h.state);assert.equal(h.dirty(),1);
});

test('held preparation cannot publish after source geometry, units, notes or history changes',async()=>{
  for(const mutate of [h=>h.model.vertices[0][0]=.1,h=>h.model.metadata.units='other-units',h=>h.state.notes='changed',h=>h.state.cellNetHistory.states[0].connections.push(3)]){
    let resolve;const h=harness(()=>new Promise(r=>resolve=r));h.state.cellNetHistory={sourceFingerprint:h.model.fingerprint,sourceId:h.model.id,cursor:0,states:[{root:0,connections:[],placements:[]}]};
    const promise=h.editor.evaluate(h.model,h.state);mutate(h);resolve(structuredClone(net));await assert.rejects(promise,/changed/);assert.equal(h.state.cellNetLayout,null);assert.equal(h.dirty(),0);
  }
  let resolve;const h=harness(()=>new Promise(r=>resolve=r));const promise=h.editor.evaluate(h.model,h.state);h.editor.sequence++;resolve(structuredClone(net));assert.deepEqual(await promise,{stale:true});assert.equal(h.state.cellNetLayout,null);
});

test('new cell edits bind history to source ownership and reset a foreign bank',()=>{
  const h=harness();h.state.cellNetHistory={sourceFingerprint:'foreign',sourceId:'other',cursor:0,states:[{root:0,connections:[99],placements:[]}]};
  h.editor.remember(h.state,net);assert.equal(h.state.cellNetHistory.sourceId,h.model.id);assert.equal(h.state.cellNetHistory.sourceFingerprint,h.model.fingerprint);assert.equal(h.state.cellNetHistory.states.length,1);
});
