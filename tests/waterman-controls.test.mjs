import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {WatermanControls} from '../ui/waterman-controls.mjs';
import {numericControlFixture,deferred,flush} from './numeric-control-fixture.mjs';
const near='39999999999999999999999999999999999999999/10000000000000000000000000000000000000000';
const fixture=()=>numericControlFixture(WatermanControls.prototype,{'waterman-mode':'exact-sphere','waterman-root':'5','waterman-radius-squared':'3/4',
  'waterman-x':'1/2','waterman-y':'1/2','waterman-z':'1/2','generate-waterman':'','waterman-root-row':'','waterman-radius-row':'','waterman-x-row':'','waterman-y-row':'','waterman-z-row':''});
test('exact sphere fields reach native generation as canonical strings, never float divisions',async()=>{
  const f=fixture(),before=structuredClone(f.project);assert.equal(await f.control.generate(),f.result);
  assert.deepEqual(f.calls,[['waterman-fcc',{radius_squared:'3/4',center:['1/2','1/2','1/2']}]]);
  assert.equal(f.expressionCalls.length,1);assert.equal(f.expressionCalls[0].mode,'rational');assert.deepEqual(f.project,before);
});
test('author root accepts an exact integer expression and ignores unused origin inputs',async()=>{
  const f=fixture();f.nodes['waterman-mode'].value='author-root';f.nodes['waterman-root'].value='2+3';f.nodes['waterman-x'].value='nonsense';
  await f.control.generate();assert.deepEqual(f.calls,[['waterman-root',{root:5}]]);assert.deepEqual(f.expressionCalls[0].parts,['2+3']);
});
test('near-boundary expression remains distinct from float-equal four, with original expression evidence',async()=>{
  const f=fixture();f.nodes['waterman-radius-squared'].value='4 - 1/10^40';await f.control.generate();
  assert.equal(f.calls[0][1].radius_squared,near);assert.equal(Number(near.split('/')[0])/Number(near.split('/')[1]),4);
  assert.equal(f.options[0].expressionInputs.radius_squared,'4 - 1/10^40');assert.equal(f.expressionCalls[0].mode,'rational');
});
test('actual native rational evaluation and FCC membership independently distinguish threshold neighbors',()=>{
  const script='import json; from engine.server import dispatch; r=dispatch({"op":"expression-batch","params":{"expressions":["4 - 1/10^40","4"],"mode":"rational"}}); out=[]\nfor value in r["values"]:\n m=dispatch({"op":"generate","params":{"kind":"waterman-fcc","radius_squared":value,"center":["0","0","0"]}}); out.append({"radius":value,"vertices":m["vertices"]})\nprint(json.dumps(out))';
  const result=JSON.parse(execFileSync('python',['-c',script],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',windowsHide:true}));
  assert.equal(result[0].radius,near);assert.equal(result[1].radius,'4');assert.equal(result[0].vertices.length,12);assert.equal(result[1].vertices.length,6);
  assert.ok(result[0].vertices.every(point=>point.reduce((sum,x)=>sum+x*x,0)===2));
  assert.ok(result[1].vertices.every(point=>point.reduce((sum,x)=>sum+x*x,0)===4));
});
test('irrational/malformed exact native outputs and nonpositive radius cannot dispatch',async()=>{
  for(const result of [null,2,NaN,'NaN','1/0','1/-2','2/4','1/1','-0']){
    const f=fixture();f.context.evaluateMany=async()=>[result,'0','0','0'];await assert.rejects(f.control.generate());assert.equal(f.calls.length,0);
  }
  for(const value of ['0','-2','-1/2']){const f=fixture();f.nodes['waterman-radius-squared'].value=value;await assert.rejects(f.control.generate(),/domain/);assert.equal(f.calls.length,0);}
  const f=fixture();f.nodes['waterman-x'].value='sqrt(4)';await assert.rejects(f.control.generate(),/exact rational/);assert.equal(f.calls.length,0);
});
test('root denominator and safe integer limits are checked exactly before Number conversion',async()=>{
  for(const text of ['0','-1','3/2','9007199254740992','9007199254740993']){
    const f=fixture();f.nodes['waterman-mode'].value='author-root';f.nodes['waterman-root'].value=text;
    await assert.rejects(f.control.generate(),/integer domain/);assert.equal(f.calls.length,0);
  }
});
test('changing sphere fields/mode, source attributes or export during exact await refuses atomically',async()=>{
  for(const change of [f=>f.nodes['waterman-mode'].value='author-root',f=>f.nodes['waterman-x'].value='2',
    f=>f.state.notes='Changed',f=>f.state.view.coordinateUnit='cm',f=>f.state.model.metadata.offColors.faces[0].values[3]=.1,f=>f.setExport(true)]){
    const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;const run=f.control.generate();change(f);hold.resolve(['3/4','1/2','1/2','1/2']);
    await assert.rejects(run);assert.equal(f.calls.length,0);assert.equal(f.control.busy,false);
  }
});
test('native generated publication guards ownership after await and keeps camera motion independent',async()=>{
  for(const changed of [false,true]){
    const f=fixture(),hold=deferred();let published=false;
    f.context.generate=async(kind,params,options)=>{await hold.promise;options.verifyPublication();published=true;return f.result;};
    const run=f.control.generate();await flush();f.state.view.camera={zoom:3};if(changed)f.document.id='replacement';hold.resolve();
    if(changed){await assert.rejects(run,/changed/);assert.equal(published,false);}else{await run;assert.equal(published,true);assert.equal(f.state.view.camera.zoom,3);}
  }
});
test('cancel, busy/export bypass and native refusal release controls for retry',async()=>{
  const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;const run=f.control.generate();
  assert.ok(Object.values(f.nodes).every(n=>n.disabled));await assert.rejects(f.control.generate(),/current Waterman/);
  f.control.cancel();await assert.rejects(run,{name:'AbortError'});assert.equal(f.control.busy,false);
  const g=fixture();let calls=0;g.context.generate=async(kind,params,options)=>{options.verifyPublication();if(!calls++)throw Error('Candidate box exceeds resource limit');return g.result;};
  await assert.rejects(g.control.generate(),/resource/);assert.equal(await g.control.generate(),g.result);
  g.setExport(true);await assert.rejects(g.control.generate(),/export/);
});
test('switching modes hides and disables exactly unused parameters',()=>{
  const f=fixture();f.nodes['waterman-mode'].value='author-root';f.control.sync();
  assert.equal(f.nodes['waterman-root-row'].hidden,false);assert.equal(f.nodes['waterman-root'].disabled,false);assert.equal(f.nodes['waterman-x'].disabled,true);
  f.nodes['waterman-mode'].value='exact-sphere';f.control.sync();assert.equal(f.nodes['waterman-root'].disabled,true);assert.equal(f.nodes['waterman-x'].disabled,false);
});
