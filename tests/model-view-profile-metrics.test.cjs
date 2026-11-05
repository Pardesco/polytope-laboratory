const test=require('node:test'),assert=require('node:assert/strict');
const {cpuTime,distribution,navigationMetrics,navigationComparison}=require('../scripts/model-view-profile-metrics.cjs');

test('CPU accounting includes all samples and excludes only the idle frame',()=>{
  const cpu={nodes:[{id:1,callFrame:{functionName:'(idle)'}},{id:2,callFrame:{functionName:'(program)'}},{id:3,callFrame:{functionName:'sourceWalk'}}],samples:[1,2,3,1],timeDeltas:[1000,2000,4000,3000]};
  assert.deepEqual(cpuTime(cpu),{sampledTotalMs:10,sampledIdleMs:4,sampledNonIdleMs:6});
  assert.throws(()=>cpuTime({...cpu,timeDeltas:[1]}));
});

test('distribution reports median and interpolated quartiles without changing run order',()=>{
  const samples=[9,1,3,5,7],result=distribution(samples);
  assert.deepEqual(result,{samples:[9,1,3,5,7],median:5,q1:3,q3:7,iqr:4});
  assert.deepEqual(samples,[9,1,3,5,7]);assert.throws(()=>distribution([]));
});

function navigation(){return {navigationRequested:true,navigations:Array.from({length:12},(_,i)=>({key:['cell120','cell600','miratope-grand-hexacosichoron'][i%3],pass:Math.floor(i/3),sourceSha256:String(i%3).repeat(64),notesPreserved:true,firstDrawObservedMs:i+1,settledObservedMs:i+10}))};}
test('navigation timing keeps first draw and settled time distinct for each retained source',()=>{
  const input=navigation(),before=structuredClone(input),result=navigationMetrics(input);
  assert.equal(result.cell120.firstDrawObservedMs.median,5.5);assert.equal(result.cell120.settledObservedMs.median,14.5);
  assert.deepEqual(input,before);assert.equal(navigationMetrics({}),null);
});
for(const [label,change] of [
  ['incomplete passes',r=>r.navigations.pop()],
  ['source mutation',r=>{r.navigations[3].sourceSha256='f'.repeat(64);}],
  ['missing source preservation',r=>{r.navigations[0].notesPreserved=false;}],
  ['out of order',r=>{r.navigations[0].pass=3;}],
  ['nonfinite timing',r=>{r.navigations[0].settledObservedMs=NaN;}],
  ['settled before draw',r=>{r.navigations[0].settledObservedMs=0;}],
  ['unrequested navigation',r=>{r.navigationRequested=false;}],
])test('navigation comparison refuses '+label,()=>{const input=navigation();change(input);assert.throws(()=>navigationMetrics(input));});

test('navigation aggregates independent run medians instead of treating every revisit as a new run',()=>{
  const samples=[['old',100],['new',20],['old',10],['new',2]].map(([version,value])=>({version,navigation:{cell120:{firstDrawObservedMs:{median:value},settledObservedMs:{median:value+10}}}}));
  const result=navigationComparison(samples,['old','new']);
  assert.equal(result.sampleUnit,'per-run median across four revisits');
  assert.deepEqual(result.groups.cell120.old.firstDrawObservedMs.samples,[100,10]);
  assert.equal(result.groups.cell120.old.firstDrawObservedMs.median,55);
  assert.equal(result.groups.cell120.new.settledObservedMs.median,21);
});
test('historical comparisons stay valid and mixed navigation phases are refused',()=>{
  assert.equal(navigationComparison([{version:'old'},{version:'new'}],['old','new']),null);
  assert.throws(()=>navigationComparison([{version:'old'}, {version:'new',navigation:{}}],['old','new']),/mix/);
});
