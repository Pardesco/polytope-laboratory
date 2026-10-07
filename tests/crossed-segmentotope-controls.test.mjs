import test from 'node:test';
import assert from 'node:assert/strict';
import {CrossedSegmentotopeControls} from '../ui/crossed-segmentotope-controls.mjs';
import {numericControlFixture,deferred,flush} from './numeric-control-fixture.mjs';
const observed=p=>p.then(value=>({value}),error=>({error}));
function fixture(){
  const values={symbol:' 6/-4 ',sizing:'radius',size:'sqrt(4)',elevation:'height','elevation-size':'1',depth:'3',orientation:'identity',matrix:'','size-name':'','elevation-name':''};for(let i=0;i<9;i++)values['matrix-'+i]=i%4===0?'1':'0';
  const fields=Object.fromEntries(Object.entries(values).map(([key,value])=>['crossed-layer-'+key,value]));fields['generate-crossed-segmentotope']='';const f=numericControlFixture(CrossedSegmentotopeControls.prototype,fields);f.control.sync();return f;
}

test('four sizing modes preserve raw symbols and independent interval depth in one native batch',async()=>{
  for(const sizing of ['radius','base-edge'])for(const elevation of ['height','side-edge']){
    const f=fixture(),source=structuredClone(f.state);f.nodes['crossed-layer-sizing'].value=sizing;f.nodes['crossed-layer-elevation'].value=elevation;f.control.sync();await f.control.generate();
    assert.deepEqual(f.expressionCalls[0].parts,['sqrt(4)','1','3']);assert.equal(f.expressionCalls.length,1);assert.deepEqual(f.calls,[['crossed-antiprism-segmentotope',{symbol:' 6/-4 ',[sizing==='radius'?'radius':'base_edge']:2,[elevation==='height'?'height':'side_edge']:1,depth:3}]]);assert.equal(f.nodes['crossed-layer-size-name'].textContent,sizing==='radius'?'Radius':'Base edge length');assert.equal(f.nodes['crossed-layer-elevation-name'].textContent,elevation==='height'?'Height':'Side edge length');assert.deepEqual(f.state,source);assert.deepEqual(f.options[0].sourceSnapshot,source.model);
  }
});

test('hidden matrix expressions are omitted and reflect X passes an actual common rigid matrix',async()=>{
  const f=fixture();f.nodes['crossed-layer-matrix-0'].value='invalid hidden';assert.equal(f.nodes['crossed-layer-matrix'].hidden,true);assert.equal(f.nodes['crossed-layer-matrix-0'].disabled,true);f.nodes['crossed-layer-orientation'].value='reflect-x';await f.control.generate();assert.deepEqual(f.calls[0][1].orientation,[[-1,0,0],[0,1,0],[0,0,1]]);assert.equal(f.expressionCalls[0].parts.length,3);
});

test('explicit orthogonal matrix entries share one twelve-value batch with source sizing',async()=>{
  const f=fixture();f.nodes['crossed-layer-orientation'].value='matrix';const values=['0','-1','0','1','0','0','0','0','-(1+1)/2'];for(let i=0;i<9;i++)f.nodes['crossed-layer-matrix-'+i].value=values[i];
  f.context.evaluateMany=async parts=>{f.expressionCalls.push({parts:[...parts]});return [2,1,3,0,-1,0,1,0,0,0,0,-1];};f.control.sync();assert.equal(f.nodes['crossed-layer-matrix'].hidden,false);await f.control.generate();assert.equal(f.expressionCalls.length,1);assert.equal(f.expressionCalls[0].parts.length,12);assert.deepEqual(f.calls,[['crossed-antiprism-segmentotope',{symbol:' 6/-4 ',radius:2,height:1,depth:3,orientation:[[0,-1,0],[1,0,0],[0,0,-1]]}]]);
});

test('export blocks expressions before and during evaluation and keeps visible controls disabled',async()=>{
  const f=fixture();f.setExport(true);f.control.sync();await assert.rejects(f.control.generate(),/export/);assert.deepEqual(f.expressionCalls,[]);assert.ok(Object.values(f.nodes).every(n=>n.disabled));f.setExport(false);f.context.evaluateMany=async()=>{f.setExport(true);return [2,1,3];};await assert.rejects(f.control.generate(),/export/);assert.deepEqual(f.calls,[]);assert.equal(f.control.busy,false);
});

test('full project/document/source ownership changes reject held expressions',async()=>{
  for(const mutate of [f=>f.setProject({...f.project}),f=>f.document.id='other',f=>f.document.states=[f.state],f=>f.document.cursor=1,f=>f.state.model={...f.state.model},f=>f.state.model.vertices[0][0]=2,f=>f.state.notes='edited',f=>f.state.view.coordinateUnit='cm',f=>f.state.model.metadata.offColors.faces[0].values[3]=.1]){
    const f=fixture(),gate=deferred();f.context.evaluateMany=()=>gate.promise;const pending=observed(f.control.generate());await flush();mutate(f);gate.resolve([2,1,3]);assert.ok((await pending).error);assert.deepEqual(f.calls,[]);assert.equal(f.control.busy,false);
  }
});

test('busy guard prevents competing generation and cancel releases ignored providers safely',async()=>{
  const f=fixture(),gate=deferred();f.context.evaluateMany=()=>gate.promise;const pending=observed(f.control.generate());await flush();assert.ok(Object.entries(f.nodes).filter(([key])=>!key.includes('matrix-')).every(([,n])=>n.disabled));await assert.rejects(f.control.generate(),/current crossed layer/);f.control.cancel();assert.match((await pending).error.message,/cancel/i);gate.resolve([2,1,3]);await flush();assert.deepEqual(f.calls,[]);assert.equal(f.control.busy,false);f.context.evaluateMany=async()=>[2,1,3];await f.control.generate();assert.equal(f.calls.length,1);
});

test('ordinary, malformed, unsafe and out-of-bound literal symbols reject before evaluation',async()=>{
  for(const symbol of ['','4','5/2','4/2','5/5','2/1','1001/1000','5/(1+2)','5/3'.repeat(20),'999999999999999999/3']){const f=fixture();f.nodes['crossed-layer-symbol'].value=symbol;await assert.rejects(f.control.generate(),/literal retrograde|Use/);assert.deepEqual(f.expressionCalls,[]);assert.deepEqual(f.calls,[]);}
});

test('unknown sizing/orientation and blank active fields refuse atomically before native work',async()=>{
  for(const [key,value] of [['sizing','diameter'],['elevation','equal-triangle'],['orientation','gyro2'],['size',''],['matrix-2','']]){const f=fixture();if(key==='matrix-2')f.nodes['crossed-layer-orientation'].value='matrix';f.nodes['crossed-layer-'+key].value=value;await assert.rejects(f.control.generate());assert.deepEqual(f.calls,[]);assert.deepEqual(f.expressionCalls,[]);}
});

test('nonpositive, nonfinite and forged sizes cannot call the native generator',async()=>{
  for(const value of [0,-1,Infinity,NaN,1e101,true]){const f=fixture();f.context.evaluateMany=async()=>[value,1,3];await assert.rejects(f.control.generate(),/domain|finite|bounded/);assert.deepEqual(f.calls,[]);assert.equal(f.control.busy,false);}
});

test('nonorthogonal matrices reject without publishing sizes or orientation',async()=>{
  for(const value of ['2','1e99']){const f=fixture();f.nodes['crossed-layer-orientation'].value='matrix';f.nodes['crossed-layer-matrix-0'].value=value;await assert.rejects(f.control.generate(),/orthogonal/);assert.deepEqual(f.calls,[]);assert.equal(f.control.busy,false);}
});

test('numeric and native failures reset busy and permit later explicit requests',async()=>{
  for(const where of ['evaluateMany','generate']){const f=fixture(),original=f.context[where];f.context[where]=async()=>{throw Error('Cancelled request');};await assert.rejects(f.control.generate(),/Cancelled request/);assert.equal(f.control.busy,false);assert.equal(f.nodes['generate-crossed-segmentotope'].disabled,false);f.context[where]=original;await f.control.generate();assert.equal(f.calls.length,1);}
});

test('form and active matrix edits fence pending input while hidden matrix edits remain irrelevant',async()=>{
  for(const [key,value] of [['symbol','5/-3'],['sizing','base-edge'],['elevation','side-edge'],['size','999'],['elevation-size','2'],['depth','4'],['orientation','reflect-x'],['matrix-2','1']]){
    const f=fixture(),gate=deferred();if(key.startsWith('matrix'))f.nodes['crossed-layer-orientation'].value='matrix';f.context.evaluateMany=()=>gate.promise;const pending=observed(f.control.generate());await flush();f.nodes['crossed-layer-'+key].value=value;gate.resolve(key.startsWith('matrix')?[2,1,3,1,0,0,0,1,0,0,0,1]:[2,1,3]);assert.ok((await pending).error);assert.deepEqual(f.calls,[]);
  }
  const f=fixture(),gate=deferred();f.context.evaluateMany=()=>gate.promise;const pending=f.control.generate();await flush();f.nodes['crossed-layer-matrix-0'].value='invalid hidden';f.state.view.camera={latest:true};f.state.view.angles[0]=40;f.project.memories={unrelated:true};gate.resolve([2,1,3]);await pending;assert.equal(f.calls.length,1);assert.equal(f.state.view.angles[0],40);
});

test('native publication options fence late source/unit/RGBA edits and ignored-provider cancellation',async()=>{
  for(const mutate of [f=>f.state.view.coordinateUnit='in',f=>f.state.model.metadata.offColors.faces[0].values[3]=.4,f=>f.nodes['crossed-layer-depth'].value='9',f=>f.control.cancel()]){
    const f=fixture(),gate=deferred();let options;f.context.generate=async(kind,params,o)=>{options=o;await gate.promise;o.verifyPublication();f.calls.push([kind,params]);};const pending=observed(f.control.generate());while(!options)await flush();mutate(f);if(options.signal.aborted)assert.match((await pending).error.message,/cancel/i);gate.resolve();assert.ok((await pending).error);await flush();assert.deepEqual(f.calls,[]);assert.equal(f.control.busy,false);
  }
});
