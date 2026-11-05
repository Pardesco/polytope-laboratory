import test from 'node:test';
import assert from 'node:assert/strict';
import {VisibleSurfaceControls,visibleSurfaceSummary} from '../ui/visible-surface-controls.mjs';
import {NetEditor} from '../ui/net-editor.js';
import {faceNetSummary,currentFaceNet} from '../ui/net-presentation.mjs';
import {sourceContext,deferred} from './construction-controls-fixture.mjs';

function fixture(empty=false){
  const owner=sourceContext(),nodes={},calls=[];
  const panel={hidden:false,querySelector:selector=>nodes[selector.slice(1)],set innerHTML(text){
    for(const id of text.matchAll(/id="([^"]+)"/g))nodes[id[1]]={value:id[1]==='net-visible-fill'?'nonzero':'',disabled:false,textContent:''};
  }};
  const previous=globalThis.document;globalThis.document={createElement:()=>panel};let control;
  const context={...owner,guard:fn=>fn,commit:async(op,params,label,options)=>{options.verifyPublication();calls.push({op,params,label,options});return 'committed';}};
  if(empty){context.getState=()=>undefined;context.isExporting=()=>{throw Error('Animation controller is not initialized yet.');};}
  try{control=new VisibleSurfaceControls(context,{prepend:node=>assert.equal(node,panel)});}finally{globalThis.document=previous;}
  return {control,owner,nodes,calls};
}
test('empty app startup mounts safely before animation controllers initialize',()=>{
  const f=fixture(true);assert.equal(f.control.panel.hidden,true);assert.equal(f.control.button.disabled,true);
});
test('Nets mounts a primary paper action and uses the undoable native recipe path',async()=>{
  const f=fixture();assert.equal(f.control.panel.id,'net-visible-surface-settings');assert.equal(f.control.panel.hidden,false);
  assert.equal(await f.nodes['net-visible-surface'].onclick(),'committed');
  assert.equal(f.calls[0].op,'visible-surface');assert.deepEqual(f.calls[0].params,{fill_rule:'nonzero'});
  assert.ok(f.calls[0].options.signal instanceof AbortSignal);assert.equal(f.control.busy,false);
  f.owner.getState().view.fillRule='even-odd';f.control.source=null;f.control.sync();assert.equal(f.control.fill.value,'even-odd');
  await f.control.build();assert.deepEqual(f.calls[1].params,{fill_rule:'even-odd'});
});
test('held construction refuses changed source, notes, colors, interpretation, units and workspace ownership',async t=>{
  const mutations={notes:f=>f.owner.getState().notes='changed',colors:f=>f.owner.getState().model.metadata.offColors.faces[0].values[0]=.3,
    model:f=>f.owner.getState().model.vertices[0][0]=.2,units:f=>f.owner.getState().view.coordinateUnit='cm',
    interpretation:f=>f.control.fill.value='even-odd',document:f=>f.owner.swapDocument(),project:f=>f.owner.swapProject(),
    exporting:f=>f.owner.setExport(true)};
  for(const [name,mutate] of Object.entries(mutations))await t.test(name,async()=>{
    const f=fixture(),pending=deferred();f.control.context.commit=async(...args)=>{await pending.promise;args.at(-1).verifyPublication();f.calls.push('published');};
    const job=f.control.build();mutate(f);pending.resolve();await assert.rejects(job,/changed|export/);
    assert.equal(f.calls.length,0);assert.equal(f.control.busy,false);
  });
});
test('cancellation aborts the native request; observer motion permits publication',async()=>{
  const f=fixture(),pending=deferred();let signal;
  f.control.context.commit=async(...args)=>{signal=args.at(-1).signal;await pending.promise;args.at(-1).verifyPublication();};
  const job=f.control.build();f.control.cancel();assert.equal(signal.aborted,true);pending.resolve();await assert.rejects(job,{name:'AbortError'});
  assert.equal(f.control.busy,false);
  f.control.context.commit=async(...args)=>{f.owner.getState().view.camera.zoom=4;args.at(-1).verifyPublication();return 'camera independent';};
  assert.equal(await f.control.build(),'camera independent');
});
test('surface receipt and paper summary describe closure, piece count and actual overlaps',()=>{
  const f=fixture(),surface={faces:60,triangles:180,shells:1,totalGenus:0,maxWindingResidual:1e-12};
  f.owner.getState().model.metadata.visibleSurface=surface;f.control.sync();
  assert.equal(f.control.button.disabled,true);assert.match(f.control.summary.textContent,/60 simple faces \(180 triangles\).*closed shell.*genus 0/);
  assert.match(visibleSurfaceSummary(surface),/outer surface.*residual 1.0e-12/);
  const net={visibleSurface:surface,components:Array(20).fill({}),faces:Array(60).fill({}),hinges:[],overlapPairs:[],tabOverlapPairs:[],referenceEdgeLengthMm:25};
  assert.match(faceNetSummary(net),/outer surface[\s\S]*20 connected pieces[\s\S]*No face or tab overlaps/);
  net.tabOverlapPairs.push({});assert.match(faceNetSummary(net),/Check the layout before printing/);
});
test('initial native paper tab ownership is adopted into editable saved configuration',async()=>{
  const owner=sourceContext(),state=owner.getState();state.model.fingerprint='literal-source';
  const options={version:1,sourceId:state.model.id,sourceFingerprint:state.model.fingerprint,mode:'single',widthMm:2,edges:[]};
  const net={sourceId:state.model.id,sourceFingerprint:state.model.fingerprint,root:0,referenceEdgeLengthMm:25,tabs:true,hinges:[1],placements:[],tabOptions:options,visibleSurface:{}};
  const editor=Object.assign(Object.create(NetEditor.prototype),{context:owner,getState:owner.getState,sequence:0,run:async()=>net,markDirty(){}});
  delete state.model.metadata.offColors;
  await editor.evaluate(state.model,state);
  assert.deepEqual(state.view.net.tabOptions,options);assert.notEqual(state.view.net.tabOptions,options);
  assert.deepEqual(state.netHistory.states[0].tab_options,options);assert.equal(currentFaceNet(state),true);
});
