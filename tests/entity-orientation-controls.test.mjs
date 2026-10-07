import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {EntityOrientationControls} from '../ui/entity-orientation-controls.mjs';
import {numericControlFixture,deferred,flush} from './numeric-control-fixture.mjs';
const observed=p=>p.then(value=>({value}),error=>({error}));
function fixture(){
  const h=numericControlFixture(EntityOrientationControls.prototype,{'orientation-source':'selection','orientation-direction':'','entity-first':'','entity-last':'','entity-orientation-clear':'','entity-orientation-result':''});
  Object.assign(h.state.model,{dimension:4,embeddingDimension:4,vertices:[[0,0,0,0],[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]],edges:[],faces:[],cells:[],interpretation:'generalized-complex'});
  for(let a=0;a<5;a++)for(let b=a+1;b<5;b++)h.state.model.edges.push([a,b]);
  for(let a=0;a<5;a++)for(let b=a+1;b<5;b++)for(let c=b+1;c<5;c++)h.state.model.faces.push([a,b,c]);
  h.state.model.cells=Array.from({length:5},(_,excluded)=>h.state.model.faces.flatMap((face,index)=>face.includes(excluded)?[]:[index]));
  h.state.model.metadata.offColors.faces=Array.from({length:10},(_,i)=>i?null:{encoding:'unit',values:[.2,.4,.6,.8]});
  h.state.model.metadata.offColors.cells=Array(5).fill(null);
  const selection={kind:'vertex',index:4,measurementA:{kind:'point',ids:'4'},frame:null},calls=[];let clears=0;
  Object.assign(h.context,{getTarget:()=>selection,clear:()=>{clears++;delete h.state.view.orientationFrame;},apply:async(mode,source,direction,options)=>{
    options.verifyPublication();calls.push({mode,source,direction,options});h.state.view.orientationFrame={entity:{kind:'vertex',index:4},mode,sourceVertexIds:[4]};return h.state.view.orientationFrame;
  }});
  Object.assign(h.control,{nodes:h.nodes,root:{hidden:false,querySelectorAll:()=>Object.values(h.nodes)},busy:false,generation:0});
  h.control.sync();return {...h,selection,orientationCalls:calls,get clears(){return clears;}};
}

test('blank First and Last preserve native inference without any expression call',async()=>{
  const h=fixture(),model=structuredClone(h.state.model);await h.control.apply('first');await h.control.apply('last');assert.equal(h.expressionCalls.length,0);assert.deepEqual(h.orientationCalls.map(c=>[c.mode,c.source,c.direction]),[['first','selection',undefined],['last','selection',undefined]]);assert.deepEqual(h.state.model,model);h.control.clear();assert.equal(h.clears,1);assert.equal(h.state.view.orientationFrame,undefined);assert.equal(h.nodes['entity-orientation-clear'].disabled,true);
});

test('four expressions evaluate in one native job, including nested function commas',async()=>{
  const h=fixture();h.nodes['orientation-source'].value='measurement';h.nodes['orientation-direction'].value='sqrt(4), max(1,2), -(1+1), 1/2';
  h.context.evaluateMany=async parts=>{h.expressionCalls.push([...parts]);return [2,2,-2,.5];};await h.control.apply('first');assert.deepEqual(h.expressionCalls,[['sqrt(4)','max(1,2)','-(1+1)','1/2']]);assert.deepEqual(h.orientationCalls[0].direction,[2,2,-2,.5]);assert.equal(h.orientationCalls[0].source,'measurement');assert.deepEqual(h.orientationCalls[0].options.sourceSnapshot,h.state.model);assert.equal(h.orientationCalls[0].options.expressionInputs.direction,'sqrt(4), max(1,2), -(1+1), 1/2');
});

test('literal whitespace and top-level semicolons retain supported vector entry',async()=>{
  for(const text of ['0 0 0 1','0; 0; 0; sqrt(4)']){const h=fixture();h.nodes['orientation-direction'].value=text;await h.control.apply('last');assert.deepEqual(h.orientationCalls[0].direction,[0,0,0,text.includes('sqrt')?2:1]);}
});

test('wrong dimensions, nonfinite/zero vectors and oversized individual expressions refuse before apply',async()=>{
  for(const text of ['0,0,1','0,0,0,1,2','0,0,0,0','0,0,0,NaN','0,0,0,'+'1'.repeat(513),'0 0 0 sqrt(4)']){
    const h=fixture(),before=structuredClone(h.state);h.nodes['orientation-direction'].value=text;await assert.rejects(h.control.apply('first'));assert.equal(h.orientationCalls.length,0);assert.deepEqual(h.state,before);assert.equal(h.control.busy,false);
  }
  // The limit is per expression, not an arbitrary 512-character vector cap.
  const h=fixture();h.nodes['orientation-direction'].value=Array(4).fill('1'.repeat(512)).join(',');h.context.evaluateMany=async()=>[1,2,3,4];await h.control.apply('first');assert.deepEqual(h.orientationCalls[0].direction,[1,2,3,4]);
});

test('full source attributes, units, notes, document and project owners fence held expression results',async()=>{
  for(const mutate of [h=>h.state.model.vertices[0][0]=.25,h=>h.state.model.metadata.offColors.faces[0].values[3]=.5,h=>h.state.notes='changed',h=>h.state.view.coordinateUnit='cm',h=>h.document.id='other',h=>h.document.states=[h.state],h=>h.setProject({...h.project}),h=>h.state.model={...h.state.model}]){
    const h=fixture(),gate=deferred();h.nodes['orientation-direction'].value='0,0,0,1';h.context.evaluateMany=()=>gate.promise;const pending=observed(h.control.apply('first'));await flush();mutate(h);gate.resolve([0,0,0,1]);assert.ok((await pending).error);assert.equal(h.orientationCalls.length,0);assert.equal(h.state.view.orientationFrame,undefined);
  }
});

test('selected IDs, Measurement A, frame and exact form strings fence both expression and native waits',async()=>{
  for(const blank of [false,true])for(const mutate of [h=>h.selection.index=3,h=>h.selection.measurementA.ids='3',h=>h.selection.frame={mode:'last'},h=>h.nodes['orientation-source'].value='measurement',h=>h.nodes['orientation-direction'].value='0,0,1,0',h=>h.setExport(true)]){
    const h=fixture(),gate=deferred();h.nodes['orientation-direction'].value=blank?'':'0,0,0,1';
    if(blank)h.context.apply=async(mode,source,direction,options)=>{await gate.promise;options.verifyPublication();h.state.view.orientationFrame={mode};};else h.context.evaluateMany=()=>gate.promise;
    const pending=observed(h.control.apply('first'));await flush();mutate(h);gate.resolve([0,0,0,1]);assert.ok((await pending).error);assert.equal(h.state.view.orientationFrame,undefined);
  }
});

test('native callback rechecks after await before publishing explicit direction and inferred frames',async()=>{
  for(const direction of ['','0,0,0,1']){
    const h=fixture(),gate=deferred();let options;h.nodes['orientation-direction'].value=direction;
    h.context.apply=async(_mode,_source,_direction,o)=>{options=o;await gate.promise;o.verifyPublication();h.state.view.orientationFrame={mode:'first'};};
    const pending=observed(h.control.apply('first'));while(!options)await flush();h.state.model.metadata.custom='late native edit';gate.resolve();assert.ok((await pending).error);assert.equal(h.state.view.orientationFrame,undefined);
  }
});

test('observer camera/angles and unrelated memories move independently through native await',async()=>{
  const h=fixture(),gate=deferred();let options;
  h.context.apply=async(mode,source,direction,o)=>{options=o;await gate.promise;o.verifyPublication();h.state.view.orientationFrame={entity:{kind:'vertex',index:4},sourceVertexIds:[4],mode};};
  const pending=h.control.apply('last');await flush();h.state.view.camera={pan:[2,3],zoom:2};h.state.view.angles[0]=45;h.project.memories={unrelated:true};gate.resolve();await pending;assert.deepEqual(h.state.view.camera,{pan:[2,3],zoom:2});assert.equal(h.state.view.angles[0],45);assert.equal(options.signal.aborted,false);
});

test('busy/export/outside-4D guards reject programmatic First/Last/Clear bypass and restore controls',async()=>{
  const h=fixture(),gate=deferred();h.context.apply=()=>gate.promise;const pending=h.control.apply('first');await flush();assert.equal(h.nodes['entity-first'].disabled,true);assert.equal(h.nodes['orientation-direction'].disabled,true);await assert.rejects(h.control.apply('last'),/current operation/);assert.throws(()=>h.control.clear(),/current operation/);gate.resolve();await pending;assert.equal(h.nodes['entity-first'].disabled,false);
  h.setExport(true);h.control.sync();await assert.rejects(h.control.apply('first'));assert.throws(()=>h.control.clear());h.setExport(false);h.state.model.dimension=3;h.control.sync();assert.equal(h.control.root.hidden,true);await assert.rejects(h.control.apply('first'));assert.throws(()=>h.control.clear());
});

test('cancelNumeric aborts ignored expression/native providers, blocks late publication and supports retry',async()=>{
  for(const blank of [false,true]){
    const h=fixture(),gate=deferred();let options;h.nodes['orientation-direction'].value=blank?'':'0,0,0,1';
    if(blank)h.context.apply=async(mode,source,direction,o)=>{options=o;await gate.promise;o.verifyPublication();h.state.view.orientationFrame={mode};};else h.context.evaluateMany=()=>gate.promise;
    const pending=observed(h.control.apply('first'));await flush();h.control.cancelNumeric();assert.match((await pending).error.message,/cancel/i);assert.equal(h.control.busy,false);if(options)assert.equal(options.signal.aborted,true);gate.resolve([0,0,0,1]);await flush();assert.equal(h.state.view.orientationFrame,undefined);
    h.context.evaluateMany=async()=>[0,0,0,1];h.context.apply=async(mode,source,direction,o)=>{o.verifyPublication();h.state.view.orientationFrame={entity:{kind:'vertex',index:4},mode,sourceVertexIds:[4]};};await h.control.apply('last');assert.equal(h.state.view.orientationFrame.mode,'last');
  }
});

test('malformed selection snapshots reject accessors without invoking them or allocating native jobs',async()=>{
  const h=fixture();let invoked=0;Object.defineProperty(h.selection,'unsafe',{get(){invoked++;return 0;}});await assert.rejects(h.control.apply('first'),/accessors/);assert.equal(invoked,0);assert.equal(h.orientationCalls.length,0);assert.equal(h.expressionCalls.length,0);
});

test('actual native expression batch and SO(4) orientation preserve literal source geometry and RGBA',async()=>{
  const h=fixture(),source=structuredClone(h.state.model),native=request=>JSON.parse(execFileSync('python',['-c',"import json,sys;from engine.server import dispatch;print(json.dumps(dispatch(json.loads(sys.argv[1]))))",JSON.stringify(request)],{cwd:process.cwd(),windowsHide:true,encoding:'utf8'}));
  h.context.evaluateMany=async(expressions,{mode})=>native({op:'expression-batch',params:{expressions,mode}}).values;
  h.context.apply=async(mode,source,direction,o)=>{const frame=native({op:'entity-orientation',model:h.state.model,params:{entity:{kind:'vertex',index:4},mode,...direction?{direction}:{}}});o.verifyPublication();h.state.view.orientationFrame=frame;return frame;};
  h.nodes['orientation-direction'].value='0,0,0,sqrt(4)';const first=await h.control.apply('first');assert.deepEqual(first.sourceDirection,[0,0,0,1]);assert.deepEqual(first.targetDirection,[0,0,0,1]);assert.ok(first.checks.orthogonalityError<1e-12);assert.deepEqual(h.state.model,source);
  h.nodes['orientation-direction'].value='';const last=await h.control.apply('last');const radial=[-1,-1,-1,4].map(value=>value/Math.sqrt(19));for(let i=0;i<4;i++)assert.ok(Math.abs(last.sourceDirection[i]-radial[i])<1e-12);for(let row=0;row<4;row++)assert.ok(Math.abs(last.matrix[row].reduce((sum,value,i)=>sum+value*last.sourceDirection[i],0)-(row===3?-1:0))<1e-12);assert.deepEqual(h.state.model,source);
});


test('constructor mounts existing First/Last/Clear IDs and guards each action without rewriting direction text',async()=>{
  const h=fixture(),saved=Object.getOwnPropertyDescriptor(globalThis,'document');let mounted,guarded=0;
  const root={innerHTML:'',querySelectorAll:()=>Object.entries(h.nodes).map(([id,node])=>Object.assign(node,{id}))};
  try{
    globalThis.document={createElement:()=>root,getElementById:id=>{assert.equal(id,'selection-info');return {after:node=>mounted=node};}};
    h.context.guard=fn=>{guarded++;return fn;};const controls=new EntityOrientationControls(h.context);assert.equal(mounted,root);assert.equal(root.id,'entity-orientation-controls');assert.equal(guarded,3);assert.match(root.innerHTML,/top-level commas or semicolons/);
    h.nodes['orientation-direction'].value='sqrt(4),0,0,0';controls.sync();assert.equal(h.nodes['orientation-direction'].value,'sqrt(4),0,0,0');await h.nodes['entity-first'].onclick();assert.equal(h.orientationCalls[0].mode,'first');h.nodes['entity-orientation-clear'].onclick();assert.equal(h.clears,1);
  }finally{if(saved)Object.defineProperty(globalThis,'document',saved);else delete globalThis.document;}
});
