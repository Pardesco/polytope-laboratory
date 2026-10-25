import test from 'node:test';
import assert from 'node:assert/strict';
import {AnimationControls} from '../ui/animation-controls.mjs';
import {createSequence} from '../ui/animation.mjs';
import {transferObservationControls} from '../ui/observation-controls.mjs';
function fixture(){
  const controls=()=>({enabled:true,enableDamping:true,update(){}}),viewer=()=>({controls:controls(),setDisplay(){},draw(){},image:()=> 'data:image/png;base64,AA=='});
  const base=viewer(),derived=viewer(),state={model:{id:'source',dimension:3},notes:'retain',view:{angles:Array(6).fill(0),sectionOffset:0,derivedMode:'section'}};state.view.animation=createSequence(state.view,.25,8);
  const writes=[],aborted=[],context={getState:()=>state,viewer:base,sectionViewer:derived,netViewer:derived,setStatus(){},
    refreshSection:async()=>{const previous=derived.controls;derived.controls={...previous};transferObservationControls(previous,derived.controls);},
    api:{animationBegin:async()=>({id:'capture'}),animationWrite:async(_,index)=>writes.push(index),animationFinish:async()=>({path:'capture.frames'}),animationAbort:async id=>aborted.push(id)}};
  const control=Object.assign(Object.create(AnimationControls.prototype),{context,time:0,generation:0,exporting:false,nodes:{target:{value:'section'},progress:{}},configure:async()=>{},pause(){this.generation++;},update(){},sequence:()=>state.view.animation,
    apply:async()=>{assert.equal(base.controls.enabled,false);assert.equal(derived.controls.enabled,false);await context.refreshSection();},prepareCapture:async()=>{}});
  return {control,context,base,derived,state,writes,aborted};
}

test('completed frame export restores the replacement camera without changing the source',async()=>{
  const f=fixture(),before=structuredClone(f.state),old=f.derived.controls;await f.control.export('png');
  assert.deepEqual(f.writes,[0,1,2]);assert.notStrictEqual(f.derived.controls,old);assert.deepEqual(f.state,before);
  assert.equal(f.base.controls.enabled,true);assert.equal(f.derived.controls.enabled,true);assert.equal(f.derived.controls.enableDamping,true);assert.equal(f.control.exporting,false);
});

test('native export failure aborts its session and restores observation after control rebinding',async()=>{
  const f=fixture();f.context.api.animationWrite=async()=>{throw Error('Native frame write failed');};
  await assert.rejects(f.control.export('png'),/Native frame write failed/);assert.deepEqual(f.aborted,['capture']);
  assert.equal(f.derived.controls.enabled,true);assert.equal(f.base.controls.enabled,true);assert.equal(f.control.exporting,false);
});

test('restoration errors cannot leave observation or export busy state held',async()=>{
  const f=fixture();f.base.setDisplay=()=>{throw Error('Presentation restoration failed');};
  await assert.rejects(f.control.export('png'),/Presentation restoration failed/);
  assert.equal(f.base.controls.enabled,true);assert.equal(f.derived.controls.enabled,true);assert.equal(f.control.exporting,false);assert.equal(f.control.exportView,null);
});
