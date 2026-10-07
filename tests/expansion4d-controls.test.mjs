import test from 'node:test';
import assert from 'node:assert/strict';
import {ExpansionControls} from '../ui/expansion-controls.mjs';

test('4D expansion parses four native center coordinates and retains late source fence',async()=>{
  const nodes=Object.fromEntries(Object.entries({ratio:'1/2',radius:'sqrt(2)',center:'0, 0, 0, 0',colors:'source'}).map(([k,value])=>['expansion-'+k,{value}]));nodes.button={};
  const state={model:{id:'4d',dimension:4,embeddingDimension:4,interpretation:'convex-polytope',vertices:[[1,1,1,1]],edges:[],faces:[],cells:[],metadata:{coordinateUnits:'mm'}},notes:'Keep 4D',view:{coordinateUnit:'mm'}};
  const doc={id:'doc',cursor:0,states:[state]},project={id:'project',active:0,documents:[doc]},calls=[];
  const context={getState:()=>state,getDocument:()=>doc,getProject:()=>project,
    evaluateMany:async parts=>parts.map(p=>({'1/2':.5,'sqrt(2)':Math.SQRT2}[p]??Number(p))),
    commit:async(...args)=>{args[3].verifyPublication();calls.push(args);return 'committed';}};
  const panel={querySelector:s=>s==='button'?nodes.button:nodes[s.slice(1)],querySelectorAll:()=>Object.values(nodes)};
  const control=Object.assign(Object.create(ExpansionControls.prototype),{context,panel,busy:false});control.sync();assert.equal(nodes.button.disabled,false);
  assert.equal(await control.construct(),'committed');assert.deepEqual(calls[0][1].center,[0,0,0,0]);
  let resolve;context.evaluateMany=()=>new Promise(r=>resolve=r);const pending=control.construct();state.notes='Changed';resolve([.5,Math.SQRT2,0,0,0,0]);
  await assert.rejects(pending,/changed/);assert.equal(calls.length,1);
});
