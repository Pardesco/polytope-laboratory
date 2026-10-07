import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {NumericEntry,NUMERIC_ENTRY_LIMITS} from '../ui/numeric-entry.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const scalar=(text,options={})=>({text,...options});
function fixture(){
  const state={model:{id:'tetra-source',name:'Literal tetrahedron',dimension:3,
    vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],edges:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],
    faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]],cells:[],
    metadata:{coordinateUnits:'mm',offColors:{faces:[{encoding:'unit',values:[.2,.4,.6,.8]},null,null,null],cells:[]}}},
    view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0],sectionOffset:0},notes:'Source reference retained'},
    document={id:'source-document',cursor:0,states:[state]};
  let project={active:0,documents:[document],memories:[]},exporting=false;
  const batches=[],published=[];
  const context={getProject:()=>project,getDocument:()=>project.documents[project.active],
    getState:()=>context.getDocument().states[context.getDocument().cursor],isExporting:()=>exporting,
    evaluateBatch:async parts=>{batches.push([...parts]);return parts.map(Number);}};
  const entry=new NumericEntry(context);
  return {state,document,context,entry,batches,published,setProject:value=>project=value,
    setExport:value=>exporting=value,publish:(values,verify)=>{verify();published.push(values);return values;},get project(){return project;}};
}

test('native parser accepts nested function commas and independent degree/root arithmetic',()=>{
  const input=['min(3, max(1, 2))','sqrt(9) / 2','sind(30)','2 + 3','1 + 3r2'];
  const values=JSON.parse(execFileSync('python',['-c',
    'import json,sys; from engine.expressions import evaluate; print(json.dumps([evaluate(x)["value"] for x in json.loads(sys.argv[1])]))',
    JSON.stringify(input)],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',windowsHide:true}));
  assert.equal(values[0],2);assert.equal(values[1],1.5);assert.ok(Math.abs(values[2]-.5)<1e-15);
  assert.equal(values[3],5);assert.equal(values[4],1+3*Math.sqrt(2));
});

test('one job parses nested vectors and applies integer domains after native evaluation',async()=>{
  const f=fixture(),answers={'min(3, max(1, 2))':2,'sqrt(9) / 2':1.5,'-sind(30)':-.5,'2 + 3':5};
  f.context.evaluateBatch=async parts=>parts.map(text=>answers[text]);
  const result=await f.entry.run({normal:{kind:'vector',length:3,text:'min(3, max(1, 2)); sqrt(9) / 2; -sind(30)',nonzero:true},
    count:scalar('2 + 3',{integer:true,min:3,max:128})},f.publish);
  assert.deepEqual(result.normal,[2,1.5,-.5]);assert.equal(result.count,5);assert.ok(Object.isFrozen(result.normal));
});

test('preserves complete 20,000 by 4 hull domain using 2,500 bounded batches and one publication',async()=>{
  const f=fixture(),original=JSON.stringify(f.state);
  let yields=0;f.context.yieldBetweenBatches=async()=>{yields++;};
  const text=Array.from({length:20000},(_,i)=>`${i}, ${-i}, 1, 2`).join('\n');
  const result=await f.entry.run({points:{kind:'rows',length:[2,3,4],text}},f.publish);
  assert.equal(result.points.length,20000);assert.deepEqual(result.points[19999],[19999,-19999,1,2]);
  assert.equal(f.batches.length,2500);assert.ok(f.batches.every(batch=>batch.length===32));
  assert.equal(yields,2499);assert.equal(f.published.length,1);assert.equal(JSON.stringify(f.state),original);
});

test('rows retain order, signed coordinates, legacy whitespace literals, and one dimension',async()=>{
  const f=fixture();const result=await f.entry.run({points:{kind:'rows',length:[2,3,4],text:' 1 -2 3\n\n4; 5; 6\n'}},f.publish);
  assert.deepEqual(result.points,[[1,-2,3],[4,5,6]]);
  await assert.rejects(f.entry.run({points:{kind:'rows',length:[3,4],text:'1,2,3\n4,5,6,7'}},f.publish),/consistent dimension/);
});

for(const [label,mutate] of [
  ['RGBA',f=>f.state.model.metadata.offColors.faces[0].values[3]=.1],
  ['geometry',f=>f.state.model.vertices[0][0]=.25],
  ['metadata unit',f=>f.state.model.metadata.coordinateUnits='cm'],
  ['effective unit',f=>f.state.view.coordinateUnit='cm'],
  ['notes',f=>f.state.notes='Changed'],
  ['document ID',f=>f.document.id='new-document'],
  ['states ownership',f=>f.document.states=[f.state]],
  ['cursor',f=>{f.document.states.push({...f.state});f.document.cursor=1;}],
  ['project ownership',f=>f.setProject({...f.project})],
  ['source identity',f=>f.state.model=structuredClone(f.state.model)],
])test(`${label} change during a later chunk rejects atomic publication`,async()=>{
  const f=fixture(),hold=deferred();let calls=0;
  f.context.evaluateBatch=async parts=>++calls===1?parts.map(Number):hold.promise;
  const run=f.entry.run({points:{kind:'rows',length:4,text:Array(10).fill('1,2,3,4').join('\n')}},f.publish);
  await new Promise(resolve=>setImmediate(resolve));mutate(f);hold.resolve(Array(8).fill(1));
  await assert.rejects(run,/source|ownership|units|notes|attributes/i);assert.equal(f.published.length,0);assert.equal(f.entry.busy,false);
});

test('observer motion and unrelated memories remain live; edit writes current target only',async()=>{
  const f=fixture(),hold=deferred(),oldView=f.state.view;
  f.context.getTarget=()=>({offset:f.context.getState().view.sectionOffset});
  f.context.evaluateBatch=()=>hold.promise;
  const run=f.entry.run({offset:scalar('3')},(values,verify)=>{
    verify();f.context.getState().view.sectionOffset=values.offset;
  });
  f.state.view={...oldView,angles:[40,0,0,0,0,0],camera:{position:[4,5,6]}};
  f.project.memories.push({unrelated:'change'});hold.resolve([3]);await run;
  assert.equal(f.state.view.sectionOffset,3);assert.equal(oldView.sectionOffset,0);
  assert.equal(f.state.view.angles[0],40);assert.deepEqual(f.state.view.camera.position,[4,5,6]);
});

test('narrow target fence refuses competing field edit without fencing independent angles',async()=>{
  const f=fixture(),hold=deferred();f.context.getTarget=()=>({offset:f.state.view.sectionOffset});f.context.evaluateBatch=()=>hold.promise;
  const run=f.entry.run({offset:scalar('3')},f.publish);f.state.view.sectionOffset=2;hold.resolve([3]);
  await assert.rejects(run,/target fields/);assert.equal(f.published.length,0);
});

test('publisher checks the same fence after native operation and before mutation',async()=>{
  const f=fixture(),hold=deferred();let started=false;
  const run=f.entry.run({x:scalar('2')},async(values,verify)=>{started=true;await hold.promise;verify();f.state.view.sectionOffset=values.x;});
  await new Promise(resolve=>setImmediate(resolve));assert.ok(started);f.state.notes='Changed during construction';hold.resolve();
  await assert.rejects(run,/notes/);assert.equal(f.state.view.sectionOffset,0);
});

test('cancel drains control ownership, schedules no later chunks, and ignores late batch; retry succeeds',async()=>{
  const f=fixture(),hold=deferred();f.context.evaluateBatch=()=>hold.promise;
  const run=f.entry.run({x:scalar('2')},f.publish);assert.ok(f.entry.busy);
  await assert.rejects(f.entry.run({x:scalar('3')},f.publish),/current numeric edit/);
  f.entry.cancel();await assert.rejects(run,{name:'AbortError'});assert.equal(f.entry.busy,false);
  f.context.evaluateBatch=async parts=>parts.map(Number);await f.entry.run({x:scalar('3')},f.publish);
  hold.resolve([2]);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.published.map(item=>item.x),[3]);
});

test('external abort and destroy refuse publication even when native evaluator ignores signals',async()=>{
  for(const kind of ['signal','destroy']){
    const f=fixture(),hold=deferred(),controller=new AbortController();f.context.evaluateBatch=()=>hold.promise;
    const run=f.entry.run({x:scalar('2')},f.publish,{signal:controller.signal});
    if(kind==='signal')controller.abort();else f.entry.destroy();
    await assert.rejects(run,{name:'AbortError'});hold.resolve([2]);assert.equal(f.published.length,0);
  }
});

test('cancellation during second chunk never schedules a third or publishes a prefix',async()=>{
  const f=fixture(),hold=deferred();let calls=0;
  f.context.evaluateBatch=async parts=>++calls===1?parts.map(Number):hold.promise;
  const run=f.entry.run({points:{kind:'rows',length:4,text:Array(24).fill('1,2,3,4').join('\n')}},f.publish);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2);f.entry.cancel();
  await assert.rejects(run,{name:'AbortError'});hold.resolve(Array(32).fill(1));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2);assert.equal(f.published.length,0);
});

test('export before evaluation and after await refuses; controls recover without overwriting state',async()=>{
  const f=fixture();f.setExport(true);await assert.rejects(f.entry.run({x:scalar('2')},f.publish),/export/);
  f.setExport(false);const hold=deferred();f.context.evaluateBatch=()=>hold.promise;
  const run=f.entry.run({x:scalar('2')},f.publish);f.setExport(true);hold.resolve([2]);await assert.rejects(run,/export/);
  assert.equal(f.entry.busy,false);assert.equal(f.published.length,0);
});

test('native malformed results and final integer/nonzero/cross-field domains cannot publish',async()=>{
  for(const value of [[],[1,2],[NaN],[Infinity],[true],['3'],[1e101]]){
    const f=fixture();f.context.evaluateBatch=async()=>value;
    await assert.rejects(f.entry.run({x:scalar('3')},f.publish),/results/);assert.equal(f.published.length,0);
  }
  const f=fixture();
  await assert.rejects(f.entry.run({count:scalar('3.5',{integer:true,min:1,max:128})},f.publish),/integer domain/);
  await assert.rejects(f.entry.run({normal:{kind:'vector',length:3,text:'0,0,0',nonzero:true}},f.publish),/nonzero/);
  await assert.rejects(f.entry.run({distance:scalar('2'),near:scalar('3')},f.publish,{validate:values=>{if(values.near>=values.distance)throw Error('Near must precede eye.');}}),/Near/);
  assert.equal(f.published.length,0);
});

test('invalid expressions, accessor input/results, and excess rows reject without invoking getters',async()=>{
  const f=fixture();let touched=false;
  const fields={};Object.defineProperty(fields,'x',{get(){touched=true;return scalar('2');},enumerable:true});
  await assert.rejects(f.entry.run(fields,f.publish),/accessors/);assert.equal(touched,false);
  const result=[];Object.defineProperty(result,'0',{get(){touched=true;return 2;},enumerable:true});
  f.context.evaluateBatch=async()=>result;await assert.rejects(f.entry.run({x:scalar('2')},f.publish),/accessors/);assert.equal(touched,false);
  for(const text of ['min(1,2), 3','sqrt(4) sqrt(9) 1','1,,3','(1,2,3'])
    await assert.rejects(f.entry.run({v:{kind:'vector',length:3,text}},f.publish),/expressions separated/);
  await assert.rejects(f.entry.run({p:{kind:'rows',length:4,text:Array(NUMERIC_ENTRY_LIMITS.rows+1).fill('1,2,3,4').join('\n')}},f.publish),/20,000/);
  await assert.rejects(f.entry.run({x:scalar('1'.repeat(513))},f.publish),/512/);
});

test('sequential legacy evaluator uses identical fence and number validation',async()=>{
  const f=fixture();delete f.context.evaluateBatch;const calls=[];f.context.number=async text=>{calls.push(text);return Number(text);};
  const values=await f.entry.run({v:{kind:'vector',length:3,text:'1,2,3'}},f.publish);
  assert.deepEqual(values.v,[1,2,3]);assert.deepEqual(calls,['1','2','3']);
});

test('evaluateMany preserves 80,000 coordinates with exactly one native request and atomic publication',async()=>{
  const f=fixture(),calls=[];
  f.context.evaluateMany=async(parts,options)=>{calls.push({count:parts.length,...options});return parts.map(Number);};
  const values=await f.entry.run({points:{kind:'rows',length:4,text:Array.from({length:20000},(_,i)=>`${i},${-i},1,2`).join('\n')}},f.publish);
  assert.equal(calls.length,1);assert.equal(calls[0].count,80000);assert.equal(calls[0].mode,'real');
  assert.equal(f.batches.length,0);assert.deepEqual(values.points[19999],[19999,-19999,1,2]);assert.equal(f.published.length,1);
});

test('mixed exact/real fields group once per mode, then retain original field and vector order',async()=>{
  const f=fixture(),calls=[];
  f.context.evaluateMany=async(parts,{mode})=>{
    calls.push({parts:[...parts],mode});return mode==='rational'?['1/3','-2/5']:parts.map(Number);
  };
  const value=await f.entry.run({a:scalar('2'),exact:{mode:'rational',kind:'vector',length:2,text:'1/3,-2/5'},
    b:{kind:'vector',length:2,text:'3,4'}},f.publish);
  assert.deepEqual(calls,[{parts:['2','3','4'],mode:'real'},{parts:['1/3','-2/5'],mode:'rational'}]);
  assert.deepEqual(value,{a:2,exact:['1/3','-2/5'],b:[3,4]});
});

test('exact integer domains refuse rounded unsafe root and compare fractional bounds with BigInt',async()=>{
  const f=fixture();f.context.evaluateMany=async()=>['9007199254740993'];
  await assert.rejects(f.entry.run({root:{text:'large',mode:'rational',integer:true,min:1,max:Number.MAX_SAFE_INTEGER}},f.publish),/integer domain/);
  f.context.evaluateMany=async()=>['1/3'];
  const value=await f.entry.run({radius:{text:'1/3',mode:'rational',min:'1/4',max:'1/2'}},f.publish);assert.equal(value.radius,'1/3');
  await assert.rejects(f.entry.run({radius:{text:'1/3',mode:'rational',min:'1/3',exclusiveMin:true}},f.publish),/domain/);
});

test('exact batch fallback retains threshold fractions; approximate provider is never used as an exact fallback',async()=>{
  const f=fixture();let realCalls=0,exactCalls=0;f.context.number=async()=>{realCalls++;return 4;};
  const near='39999999999999999999999999999999999999999/10000000000000000000000000000000000000000';
  await assert.rejects(f.entry.run({radius:{mode:'rational',text:'4 - 1/10^40'}},f.publish),/exact rational.*unavailable/);
  f.context.evaluateRationalBatch=async(parts,options)=>{exactCalls++;assert.equal(options.mode,'rational');return [near];};
  const value=await f.entry.run({radius:{mode:'rational',text:'4 - 1/10^40'}},f.publish);
  assert.equal(value.radius,near);assert.equal(realCalls,0);assert.equal(exactCalls,1);
});

test('rational output allows the native 12,000-bit domain and rejects accessor/noncanonical payloads',async()=>{
  const f=fixture(),top=(1n<<11999n)+1n,bottom=1n<<11999n,value=`${top}/${bottom}`;
  assert.ok(value.length>4096&&value.length<8192);f.context.evaluateMany=async()=>[value];
  assert.equal((await f.entry.run({value:{text:'large exact',mode:'rational'}},f.publish)).value,value);
  for(const bad of ['2/4','1/1','-0','0/2',null,4,'1/0']){
    f.context.evaluateMany=async()=>[bad];await assert.rejects(f.entry.run({value:{text:'bad',mode:'rational'}},f.publish),/rational/);
  }
  let touched=false;const output=[];Object.defineProperty(output,'0',{get(){touched=true;return '1';}});f.context.evaluateMany=async()=>output;
  await assert.rejects(f.entry.run({value:{text:'bad',mode:'rational'}},f.publish),/accessors/);assert.equal(touched,false);
});

test('source edit after first mode stops the second mode and rejects full mixed publication',async()=>{
  const f=fixture(),calls=[];f.context.evaluateMany=async(parts,{mode})=>{
    calls.push(mode);f.state.notes='Changed after real job';return parts.map(Number);
  };
  await assert.rejects(f.entry.run({real:scalar('2'),exact:{mode:'rational',text:'1/3'}},f.publish),/changed/);
  assert.deepEqual(calls,['real']);assert.equal(f.published.length,0);
});
