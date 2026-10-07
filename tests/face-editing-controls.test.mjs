import test from 'node:test';
import assert from 'node:assert/strict';
import {FaceEditingControls} from '../ui/face-editing-controls.mjs';
import {controlFixture} from './construction-controls-fixture.mjs';

test('face analysis uses a detached complete source and preserves source geometry and attributes',async()=>{
  const f=controlFixture(FaceEditingControls),before=structuredClone(f.owner.getState());
  await f.controls.apply('face-coincidences');
  assert.equal(f.publications.length,1);const [,source,params]=f.publications[0];
  assert.deepEqual(source,before.model);assert.notEqual(source,f.owner.getState().model);
  assert.deepEqual(params,{tolerance:2});assert.deepEqual(f.owner.getState(),before);
  assert.deepEqual(JSON.parse(f.nodes['face-edit-evidence'].textContent),{pairs:[[0,1]],unpairedFaceIds:[2,3],tolerance:2});
  assert.ok(f.options[0].signal instanceof AbortSignal);assert.equal(typeof f.options[0].verifyPublication,'function');
});
test('remove and blend preserve weld, literal face IDs, and color policy replay parameters',async()=>{
  for(const op of ['remove-coincident-pairs','blend-faces']){
    const f=controlFixture(FaceEditingControls);await f.controls.apply(op);
    assert.deepEqual(f.publications[0].slice(0,3),['commit',op,op==='blend-faces'?{
      tolerance:2,weld:true,face_ids:[0,1,2],color_policy:'first-source'}:{tolerance:2,weld:true}]);
    assert.match(f.nodes['face-edit-evidence'].textContent,/construction history/);assert.equal(f.controls.busy,false);
  }
});
test('successful commits may replace the active state after their final publication check',async()=>{
  const f=controlFixture(FaceEditingControls);
  f.controls.context.commit=async(op,params,label,options)=>{
    options.verifyPublication();f.owner.setState(structuredClone(f.owner.getState()));
  };
  await f.controls.apply('remove-coincident-pairs');assert.match(f.nodes['face-edit-evidence'].textContent,/construction history/);
});
test('unsupported operation, blank or out-of-domain tolerance, export, and native refusal are atomic',async()=>{
  for(const value of ['', 'NaN','-1','1e101']){
    const f=controlFixture(FaceEditingControls);f.nodes['coincidence-tolerance'].value=value;
    await assert.rejects(()=>f.controls.apply('remove-coincident-pairs'),/expressions|finite|domain|bounded/);
    assert.equal(f.publications.length,0);assert.equal(f.controls.busy,false);
    assert.equal(f.nodes['face-edit-evidence'].textContent,'original evidence');
  }
  const f=controlFixture(FaceEditingControls);await assert.rejects(()=>f.controls.apply('other'),/supported face/);
  f.owner.setExport(true);await assert.rejects(()=>f.controls.apply('blend-faces'),/current action/);
  f.owner.setExport(false);f.controls.context.commit=async()=>{throw Error('Native invalid ordered face');};
  await assert.rejects(()=>f.controls.apply('blend-faces'),/Native invalid ordered face/);
  assert.equal(f.nodes['face-edit-evidence'].textContent,'original evidence');assert.equal(f.controls.busy,false);
});
test('native owns literal ID validity, no expressions are interpreted as face indices',async()=>{
  const f=controlFixture(FaceEditingControls);f.nodes['blend-face-ids'].value='sqrt(4), 1';
  f.controls.context.commit=async(op,params,label,options)=>{
    options.verifyPublication();assert.ok(Number.isNaN(params.face_ids[0]));throw Error('Native face IDs rejected');
  };
  await assert.rejects(()=>f.controls.apply('blend-faces'),/Native face IDs rejected/);
  assert.equal(f.publications.length,0);
});
