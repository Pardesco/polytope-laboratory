import test from 'node:test';
import assert from 'node:assert/strict';
import {DiagramEditHistory,cycleKey,pickedFacet} from '../ui/faceting-diagram-editor.mjs';
import {facetingStatusText} from '../ui/automatic-faceting-controls.mjs';

test('polygon picking keeps ordered boundaries, accepts rotations/reversal, and refuses a different cycle',()=>{
  const diagram={mainVertexId:0,catalogue:{candidates:[{id:'square',cycle:[0,1,2,3]}],planes:[{sourceVertexIds:[0,1,2,3]}]}};
  assert.equal(pickedFacet(diagram,[0,3,2,1]),'square');
  assert.equal(cycleKey([2,3,0,1]),cycleKey([0,1,2,3]));
  assert.throws(()=>pickedFacet(diagram,[0,1,3,2]),/absent/);
  assert.throws(()=>pickedFacet(diagram,[0,1,1]),/distinct/);
  assert.throws(()=>pickedFacet(diagram,[1,2,3]),/main vertex/);
  assert.throws(()=>pickedFacet(diagram,[0,1,4]),/nonplanar|source plane/);
});

test('diagram history detaches snapshots, bounds history and truncates redo on a new edit',()=>{
  const h=new DiagramEditHistory(),first={parameters:{seed_ids:[]}};h.reset(first);first.parameters.seed_ids.push('outside');
  h.push({parameters:{seed_ids:['a']}});assert.deepEqual(h.target(-1).parameters.seed_ids,[]);
  h.cursor--;const detached=h.target(1);detached.parameters.seed_ids.push('outside');
  assert.deepEqual(h.target(1).parameters.seed_ids,['a']);
  h.push({parameters:{seed_ids:['b']}});assert.equal(h.target(1),null);
  for(let i=0;i<120;i++)h.push({i});assert.equal(h.states.length,100);assert.equal(h.cursor,99);
});

test('search status distinguishes finite exhaustion, caps, interruption and zero results',()=>{
  assert.match(facetingStatusText({status:'complete',results:[]}),/0 results.*exhausted within the recorded candidate domain/);
  for(const status of ['resource-limited','user-cancelled','unsupported']){
    const text=facetingStatusText({status,results:[{}],limitReasons:['policy verdict unknown']});
    assert.match(text,/not exhausted.*lower bound.*policy verdict unknown/);
  }
});
