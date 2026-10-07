import test from 'node:test';
import assert from 'node:assert/strict';
import {tabPreferences,edgePreference} from '../ui/net-tab-controls.mjs';
import {AnimationRenderer} from '../ui/animation-renderer.mjs';
const model={id:'source',fingerprint:'source-metric',edges:[[0,1],[1,2]],faces:[[0,1,2],[1,0,3],[1,2,3]]};
test('source edge owner selection, default reset, and foreign source reset',()=>{
  const first=tabPreferences(model);const next=edgePreference(model,first,0,'single','1');
  assert.deepEqual(next.edges,[{edge:0,mode:'single',face:1}]);assert.deepEqual(first.edges,[]);
  const doubled=edgePreference(model,next,1,'double','auto');assert.equal(doubled.edges.length,2);
  const reset=edgePreference(model,doubled,0,'default','auto');assert.deepEqual(reset.edges,[{edge:1,mode:'double'}]);
  assert.deepEqual(tabPreferences({...model,id:'other'},reset).edges,[]);
  assert.throws(()=>edgePreference(model,first,0,'single','2'),/incident/);
  assert.throws(()=>edgePreference(model,first,2,'none','auto'),/existing/);
});
test('folding preparation carries tab preferences and the saved forest, fences late settings',async()=>{
  const preferences=tabPreferences(model),source={model,view:{net:{root:0,length:29,tabs:true,tabOptions:preferences}},netLayout:{sourceFingerprint:model.fingerprint,root:0,hinges:[1],placements:[{root:0,angle:17,translation:[9,4]}]}};
  let submitted,resolve;const renderer=new AnimationRenderer({getState:()=>source,run:async(op,params)=>{submitted=structuredClone(params);return new Promise(done=>resolve=done);}});
  const job=renderer.loadNet(model);assert.deepEqual(submitted.tab_options,preferences);assert.deepEqual(submitted.hinges,[1]);assert.deepEqual(submitted.placements,source.netLayout.placements);
  source.view.net.tabOptions.widthMm=7;resolve({literal:'old native result'});await assert.rejects(job,/net settings changed/);
});
