import test from 'node:test';
import assert from 'node:assert/strict';
import {captureContentHistoryPublication} from '../ui/element-content-history.mjs';
import {prepareHistoryOpen,verifyHistoryPublication} from '../ui/history-workflow.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){
  const state={model:{id:'owned-model',fingerprint:'geometry-only',metadata:{rgba:[.1,.2,.3,.4]}},notes:'original',
    view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0],camera:{position:[0,0,5]},
      elementAnnotations:{source:{id:'owned-model'},entries:[{kind:'face',index:0,text:{markup:'original'}}]},
      elementContentDetached:[{sourceNotes:'archived original'}],elementContentTransfer:{mapped:[{sourceIndex:0,resultIndex:0}]}}};
  const document={cursor:0,states:[state]},project={active:0,documents:[document]},held=deferred(),entered=deferred();
  const context={getProject:()=>project,getDocument:()=>document,getState:()=>document.states[document.cursor],isExporting:()=>false,
    run:async()=>{const result=structuredClone(document);entered.resolve();await held.promise;return result;}};
  context.verifyPublication=captureContentHistoryPublication(context);return {state,context,held,entered};
}
const changes=[s=>s.view.elementAnnotations.entries[0].text.markup='late content',s=>s.view.elementAnnotations=null,
  s=>s.view.elementContentDetached[0].sourceNotes='late archive',s=>s.view.elementContentTransfer.mapped[0].resultIndex=1,
  s=>s.notes='late notes',s=>s.view.coordinateUnit='cm'];

test('held native history replay/branch refuses in-place content, archive, receipt, notes and unit changes',async()=>{
  for(const operation of ['recipe-replay','recipe-branch'])for(const change of changes){
    const f=fixture(),pending=prepareHistoryOpen(f.context,operation,{markup:'branch'});await f.entered.promise;change(f.state);
    const rejected=assert.rejects(pending,/content, notes, units/);f.held.resolve();await rejected;
  }
});

test('history final publication fence also refuses changes after native preparation has settled',async()=>{
  const f=fixture(),pending=prepareHistoryOpen(f.context,'recipe-replay');await f.entered.promise;f.held.resolve();const prepared=await pending;
  f.state.view.elementAnnotations.entries[0].text.markup='changed after await';
  assert.throws(()=>verifyHistoryPublication(f.context,prepared,{opening:true}),/content, notes, units/);
});

test('observer angles, cameras and derived display changes stay independent of history content owner',async()=>{
  const f=fixture(),pending=prepareHistoryOpen(f.context,'recipe-replay');await f.entered.promise;
  f.state.view.angles[3]=23;f.state.view.camera.position[0]=2;f.state.view.derivedCamera={position:[3,2,1]};f.state.view.derivedMode='net';f.held.resolve();
  const prepared=await pending;assert.equal(verifyHistoryPublication(f.context,prepared,{opening:true}),0);
});
