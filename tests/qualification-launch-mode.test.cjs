// Preflight only: these tests never import Playwright or launch an app.
const test=require('node:test'),assert=require('node:assert/strict');
const {guardRuntime}=require('../scripts/layer-join-smoke.cjs');
const fields=['POLYTOPE_TEST_MODE','POLYTOPE_TEST_VISIBLE','POLYTOPE_HIDDEN_CANARY','POLYTOPE_TEST_EXECUTABLE'];
async function withMode(values,fn){
  const old=Object.fromEntries(fields.map(key=>[key,process.env[key]]));
  for(const key of fields){delete process.env[key];if(values[key]!==undefined)process.env[key]=values[key];}
  try{return await fn();}finally{for(const key of fields){delete process.env[key];if(old[key]!==undefined)process.env[key]=old[key];}}
}
test('default launch remains refused without hidden qualification or explicit visible opt-in',()=>withMode({},()=>assert.rejects(guardRuntime(),/explicitly opt into/)));
test('explicit visible opt-in permits normal development metadata without a hidden-window claim',()=>withMode({POLYTOPE_TEST_VISIBLE:'1'},async()=>{
  const result=await guardRuntime();assert.equal(result.hidden,false);assert.equal(result.packaged,undefined);
  assert.equal(result.canaryPath,undefined);assert.equal(result.runtime.packaged,false);assert.match(result.runtime.mainSha256,/^[0-9a-f]{64}$/);
}));
test('conflicting visible and hidden modes reject before any launch',()=>withMode({POLYTOPE_TEST_MODE:'hidden-no-focus',POLYTOPE_TEST_VISIBLE:'1'},()=>assert.rejects(guardRuntime(),/conflicts/)));
test('unknown main-process modes cannot be enabled by a visible opt-in',()=>withMode({POLYTOPE_TEST_MODE:'visible',POLYTOPE_TEST_VISIBLE:'1'},()=>assert.rejects(guardRuntime(),/explicitly opt into/)));
test('visible opt-in is literal; other truthy values remain refused',()=>withMode({POLYTOPE_TEST_VISIBLE:'true'},()=>assert.rejects(guardRuntime(),/explicitly opt into/)));
test('hidden mode still requires the qualified canary',()=>withMode({POLYTOPE_TEST_MODE:'hidden-no-focus'},()=>assert.rejects(guardRuntime(),/passing matching/)));
