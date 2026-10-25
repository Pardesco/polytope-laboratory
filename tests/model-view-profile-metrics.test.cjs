const test=require('node:test'),assert=require('node:assert/strict');
const {cpuTime,distribution}=require('../scripts/model-view-profile-metrics.cjs');

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
