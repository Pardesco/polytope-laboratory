import test from 'node:test';
import assert from 'node:assert/strict';
import {StephanoidControls,adjacentStephanoid} from '../ui/stephanoid-controls.mjs';
function fixture(){
 const model={id:'source',dimension:3,embeddingDimension:3,vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],edges:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],faces:[[0,1,2],[0,1,3],[0,2,3],[1,2,3]],cells:[]},state={model,view:{coordinateUnit:'mm'},notes:'Kept'},document={id:'doc',states:[state],cursor:0},project={};
 const nodes=Object.fromEntries(Object.entries({n:'7',a:'1',b:'4',mode:'self-dual',radius:'2',height:'1',status:'','height-row':''}).map(([key,value])=>[key,{value,disabled:false,hidden:false}])),calls=[],context={getState:()=>state,getDocument:()=>document,getProject:()=>project,isExporting:()=>false,evaluateMany:async texts=>texts.map(Number),generate:async(...args)=>{args[2].verifyPublication();calls.push(args);return {metadata:{stephanoid:{symmetryFamily:'antiprismatic',componentCount:1,resolvedTotalHeight:3}}};}};
 const control=Object.assign(Object.create(StephanoidControls.prototype),{context,panel:{querySelector:s=>nodes[s.replace('#stephanoid-','')],querySelectorAll:()=>Object.values(nodes)},busy:false});
 return {control,state,nodes,calls,context};
}
test('native numeric construction preserves parameters, cancellation contract and bounded sequence',async()=>{
 const f=fixture();await f.control.generate();assert.deepEqual(f.calls[0].slice(0,2),['stephanoid',{n:7,a:1,b:4,radius:2,mode:'self-dual'}]);assert.ok(f.calls[0][2].signal);assert.equal(f.state.notes,'Kept');
 assert.deepEqual(adjacentStephanoid(4,1,2,1),[5,1,2]);assert.deepEqual(adjacentStephanoid(5,1,2,-1),[4,1,2]);assert.throws(()=>adjacentStephanoid(4,1,2,-1),/endpoint/);assert.throws(()=>adjacentStephanoid(7,1,1,1));
});
test('held native expressions refuse source and field edits before generated publication',async()=>{
 for(const edit of [f=>f.state.notes='Changed',f=>f.nodes.b.value='3']){
  const f=fixture();let release;f.context.evaluateMany=texts=>new Promise(resolve=>release=()=>resolve(texts.map(Number)));const pending=f.control.generate();edit(f);release();await assert.rejects(pending);assert.equal(f.calls.length,0);
 }
});
