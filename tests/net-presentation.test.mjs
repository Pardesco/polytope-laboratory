import test from 'node:test';
import assert from 'node:assert/strict';
import {literalNetIndex,faceNetSummary,cellNetSummary,cellNetChecks,currentFaceNet} from '../ui/net-presentation.mjs';
import {CellNetEditor} from '../ui/cell-net-editor.js';
import {NetEditor} from '../ui/net-editor.js';
import {numericControlFixture} from './numeric-control-fixture.mjs';
test('source indices are literal, bounded and never interpret empty text or arithmetic as a source ID',()=>{
  assert.equal(literalNetIndex(' 2 ',4,'cell'),2);
  for(const text of ['', ' ', '1/2','2+1','NaN','1.5','-1','4','9007199254740993'])assert.throws(()=>literalNetIndex(text,4,'cell'),/literal/);
  assert.throws(()=>literalNetIndex('0',0,'cell'),/no available/);
});
test('empty startup disables net actions without evaluating controllers that are not initialized yet',()=>{
  const nodes=new Map(),editor=Object.assign(Object.create(NetEditor.prototype),{getState:()=>undefined,context:{isExporting:()=>{throw Error('Not initialized yet');}},$:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}});
  editor.updateActions();assert.equal(nodes.get('net-rebuild').disabled,true);assert.equal(nodes.get('net-pack').disabled,true);
});

test('fold playback reports actual saved-pose changes and stops changing them during export',()=>{
  const state={view:{derivedMode:'net',net:{fraction:0}}};let exporting=false,draws=0;
  const editor=Object.assign(Object.create(NetEditor.prototype),{playing:true,direction:1,getState:()=>state,config:()=>state.view.net,
    context:{isExporting:()=>exporting},viewer:{net:{},setFold(){draws++;}},foldStatus(){}});
  assert.equal(editor.tick(.1),true);assert.equal(state.view.net.fraction,.025);assert.equal(draws,1);
  exporting=true;assert.equal(editor.tick(.1),undefined);assert.equal(state.view.net.fraction,.025);assert.equal(editor.playing,false);
});
test('overlap warnings stay in the common summary while numerical errors remain available separately',()=>{
  const net={faces:Array(6),components:[{}],hinges:Array(5),referenceEdgeLengthMm:25,overlapPairs:[],tabOverlapPairs:[]};
  assert.match(faceNetSummary(net),/No face or tab overlaps/);net.tabOverlapPairs.push({});assert.match(faceNetSummary(net),/Check the layout before printing/);
  const cell={cells:Array(8),components:[{}],connections:Array(7),validation:{maxRigidDistanceError:1e-12,maxConnectedFaceGap:2e-12},domain:'Literal source cells'};
  assert.match(cellNetSummary(cell),/intersections not checked/);assert.doesNotMatch(cellNetSummary(cell),/1.00e/);assert.match(cellNetChecks(cell),/1.00e-12/);assert.match(cellNetChecks(cell),/Literal source/);
});
test('invalid cell roots or export ownership refuse before changing the saved layout or view',()=>{
  const f=numericControlFixture(Object.prototype,{});f.state.model.cells=[[0,1,2,3]];f.state.view.cellNet={root:0,shrink:1};
  const field={value:'0'},calls=[];const editor=Object.assign(Object.create(CellNetEditor.prototype),{context:f.context,getState:f.context.getState,getModel:()=>f.state.model,$:()=>field,markDirty:()=>calls.push('dirty'),refresh:()=>calls.push('refresh')});
  for(const value of ['', '1/2','1','-1']){field.value=value;const before=structuredClone(f.state);assert.throws(()=>editor.build(false),/literal/);assert.deepEqual(f.state,before);assert.deepEqual(calls,[]);}
  field.value='0';f.setExport(true);const before=structuredClone(f.state);assert.throws(()=>editor.build(false),/export/);assert.deepEqual(f.state,before);
});
