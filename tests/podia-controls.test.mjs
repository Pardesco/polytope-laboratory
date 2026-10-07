import test from 'node:test';
import assert from 'node:assert/strict';
import {PodiaControls} from '../ui/podia-controls.mjs';
import {numericControlFixture,deferred,flush} from './numeric-control-fixture.mjs';
const observed=p=>p.then(value=>({value}),error=>({error}));
function fixture(){return numericControlFixture(PodiaControls.prototype,{'podium-kind':'rational-podium','podium-symbol':' 6/-2 ','podium-sizing':'radius','podium-elevation':'height','podium-base-size':'sqrt(4)','podium-top-size':'1/2','podium-elevation-size':'3','podium-base-label':'','podium-top-label':'','podium-elevation-label':'','generate-podium':''});}

test('all four size modes batch independent expressions and preserve raw signed/unreduced symbols',async()=>{
  for(const kind of ['rational-podium','rational-antipodium'])for(const sizing of ['radius','edge'])for(const elevation of ['height','side-edge']){
    const f=fixture(),source=structuredClone(f.state);f.nodes['podium-kind'].value=kind;f.nodes['podium-sizing'].value=sizing;f.nodes['podium-elevation'].value=elevation;
    assert.equal(await f.control.generate(),f.result);assert.deepEqual(f.calls,[[kind,{symbol:' 6/-2 ',[sizing==='radius'?'base_radius':'base_edge']:2,[sizing==='radius'?'top_radius':'top_edge']:.5,[elevation==='height'?'height':'side_edge']:3}]]);
    assert.deepEqual(f.expressionCalls[0].parts,['sqrt(4)','1/2','3']);assert.equal(f.expressionCalls.length,1);assert.deepEqual(f.options[0].sourceSnapshot,source.model);assert.deepEqual(f.state,source);
  }
});

test('invalid selectors, arithmetic symbols and blank dimensions refuse before native work',async()=>{
  for(const [id,value] of [['podium-kind','prism'],['podium-symbol','5/2+1'],['podium-symbol','sqrt(25)'],['podium-symbol',''],['podium-sizing','mixed'],['podium-elevation','unknown'],['podium-top-size',' ']]){
    const f=fixture();f.nodes[id].value=value;await assert.rejects(f.control.generate());assert.deepEqual(f.calls,[]);assert.deepEqual(f.expressionCalls,[]);
  }
});

test('each evaluated size must be finite positive and bounded with no partial dispatch',async()=>{
  for(const id of ['podium-base-size','podium-top-size','podium-elevation-size'])for(const value of ['0','-1','NaN','Infinity','1e101']){
    const f=fixture();f.nodes[id].value=value;await assert.rejects(f.control.generate(),/domain|finite|bounded/);assert.deepEqual(f.calls,[]);assert.equal(f.control.busy,false);
  }
});

test('export and full workspace/source mutations during batched expressions prevent publication',async()=>{
  for(const mutate of [f=>f.setExport(true),f=>f.setProject({...f.project}),f=>f.document.id='changed',f=>f.document.states=[f.state],f=>f.state.notes='edited',f=>f.state.model.vertices[0][0]=2,f=>f.state.view.coordinateUnit='cm',f=>f.state.model.metadata.offColors.faces[0].values[3]=.1]){
    const f=fixture(),gate=deferred();f.context.evaluateMany=()=>gate.promise;const pending=observed(f.control.generate());await flush();mutate(f);gate.resolve([2,.5,3]);assert.ok((await pending).error);assert.deepEqual(f.calls,[]);assert.equal(f.control.busy,false);
  }
});

test('already active export refuses before expressions and restores controls after export',async()=>{
  const f=fixture();f.setExport(true);f.control.sync();await assert.rejects(f.control.generate(),/export/);assert.deepEqual(f.calls,[]);assert.deepEqual(f.expressionCalls,[]);assert.ok(Object.values(f.nodes).every(n=>n.disabled));f.setExport(false);f.control.sync();assert.ok(Object.values(f.nodes).every(n=>!n.disabled));
});

test('busy state persists through native await and refusal releases controls for recovery',async()=>{
  const f=fixture(),gate=deferred();f.context.generate=()=>gate.promise;const pending=observed(f.control.generate());await flush();assert.ok(Object.values(f.nodes).every(n=>n.disabled));await assert.rejects(f.control.generate(),/current podium/);gate.reject(Error('Side edge too short'));assert.match((await pending).error.message,/Side edge too short/);assert.equal(f.control.busy,false);assert.ok(Object.values(f.nodes).every(n=>!n.disabled));f.context.generate=async(kind,params,o)=>{o.verifyPublication();f.calls.push([kind,params]);};await f.control.generate();assert.equal(f.calls.length,1);
});

test('edits to kind, symbol, sizing/elevation or active numeric text reject the held candidate',async()=>{
  for(const [id,value] of [['podium-kind','rational-antipodium'],['podium-symbol','5'],['podium-sizing','edge'],['podium-elevation','side-edge'],['podium-base-size','999'],['podium-top-size','1'],['podium-elevation-size','3.0']]){
    const f=fixture(),gate=deferred();f.context.evaluateMany=()=>gate.promise;const pending=observed(f.control.generate());await flush();f.nodes[id].value=value;gate.resolve([2,.5,3]);assert.ok((await pending).error);assert.deepEqual(f.calls,[]);
  }
});

test('mode changes expose the correct size labels without resetting expression text',()=>{
  const f=fixture();f.nodes['podium-sizing'].value='edge';f.nodes['podium-elevation'].value='side-edge';f.control.sync();assert.equal(f.nodes['podium-base-label'].textContent,'Base edge length');assert.equal(f.nodes['podium-top-label'].textContent,'Top edge length');assert.equal(f.nodes['podium-elevation-label'].textContent,'Side edge length');assert.equal(f.nodes['podium-base-size'].value,'sqrt(4)');
});

test('native generation ownership is checked after await, with camera and unrelated memories independent',async()=>{
  for(const mutate of [f=>f.state.notes='changed',f=>f.nodes['podium-symbol'].value='5',f=>f.state.view.coordinateUnit='in',f=>f.setExport(true)]){
    const f=fixture(),gate=deferred();let options;f.context.generate=async(kind,params,o)=>{options=o;await gate.promise;o.verifyPublication();f.calls.push([kind,params]);};const pending=observed(f.control.generate());while(!options)await flush();mutate(f);gate.resolve();assert.ok((await pending).error);assert.deepEqual(f.calls,[]);
  }
  const f=fixture(),gate=deferred();let options;f.context.generate=async(kind,params,o)=>{options=o;await gate.promise;o.verifyPublication();f.calls.push([kind,params]);};const pending=f.control.generate();while(!options)await flush();f.state.view.camera={latest:true};f.state.view.angles[0]=50;f.project.memories={unrelated:true};gate.resolve();await pending;assert.equal(f.calls.length,1);assert.equal(f.state.view.angles[0],50);
});

test('cancel consumes ignored expression/native promises, blocks late publication and retries',async()=>{
  for(const where of ['evaluateMany','generate']){
    const f=fixture(),gate=deferred(),original=f.context[where];let options;
    f.context[where]=where==='evaluateMany'?()=>gate.promise:async(kind,params,o)=>{options=o;await gate.promise;o.verifyPublication();f.calls.push([kind,params]);};
    const pending=observed(f.control.generate());await flush();f.control.cancel();assert.match((await pending).error.message,/cancel/i);assert.equal(f.control.busy,false);if(options)assert.equal(options.signal.aborted,true);gate.resolve([2,.5,3]);await flush();assert.deepEqual(f.calls,[]);f.context[where]=original;await f.control.generate();assert.equal(f.calls.length,1);
  }
});
