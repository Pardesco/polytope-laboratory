import test from 'node:test';
import assert from 'node:assert/strict';
import {ExpansionControls} from '../ui/expansion-controls.mjs';

function fixture(){
  const nodes=Object.fromEntries(Object.entries({ratio:'1/2',radius:'sqrt(2)',center:'',colors:'source'}).map(([key,value])=>['expansion-'+key,{value,disabled:false}]));
  nodes.button={disabled:false};
  const state={model:{id:'cube',dimension:3,embeddingDimension:3,interpretation:'convex-polytope',vertices:[[0,0,0]],edges:[],faces:[],cells:[],metadata:{coordinateUnits:'mm'}},view:{coordinateUnit:'mm'},notes:'Keep notes'};
  const document={id:'document',cursor:0,states:[state]},project={id:'project',active:0,documents:[document]},calls=[];
  let exporting=false;
  const context={getState:()=>state,getDocument:()=>document,getProject:()=>project,isExporting:()=>exporting,
    evaluateMany:async texts=>texts.map(t=>({'1/2':.5,'sqrt(2)':Math.SQRT2}[t]??Number(t))),
    commit:async(...args)=>{args[3].verifyPublication();calls.push(args);return 'committed';}};
  const panel={querySelector:s=>s==='button'?nodes.button:nodes[s.slice(1)],querySelectorAll:()=>Object.values(nodes)};
  const controls=Object.assign(Object.create(ExpansionControls.prototype),{context,panel,busy:false});controls.sync();
  return {nodes,state,context,controls,calls,setExport:value=>exporting=value};
}

test('expressions publish the exact static operation and source fence',async()=>{
  const f=fixture();f.nodes['expansion-center'].value='0,0,0';const before=structuredClone(f.state);
  assert.equal(await f.controls.construct(),'committed');
  assert.deepEqual(f.calls[0].slice(0,3),['expand-runcinate',{ratio:.5,radius:Math.SQRT2,center:[0,0,0],color_policy:'source'},'Expand / runcinate']);
  assert.equal(typeof f.calls[0][3].verifyPublication,'function');assert.deepEqual(f.state,before);
});

test('held numeric work refuses source or form changes and explicit cancellation',async()=>{
  for(const change of [f=>f.state.notes='Changed',f=>f.nodes['expansion-colors'].value='none',f=>f.controls.cancel()]){
    const f=fixture();let resolve;f.context.evaluateMany=()=>new Promise(r=>resolve=r);
    const pending=f.controls.construct();change(f);resolve([.5,Math.SQRT2]);
    await assert.rejects(pending,/changed|canceled/);assert.equal(f.calls.length,0);assert.equal(f.controls.busy,false);
  }
});

test('Unsupported dimension and export disable construction, bounded ratio is refused before publication',async()=>{
  const f=fixture();f.state.model.dimension=5;f.controls.sync();assert.equal(f.nodes.button.disabled,true);
  await assert.rejects(f.controls.construct(),/3D/);f.state.model.dimension=3;f.setExport(true);f.controls.sync();assert.equal(f.nodes.button.disabled,true);
  await assert.rejects(f.controls.construct(),/export/);f.setExport(false);f.nodes['expansion-ratio'].value='2';
  await assert.rejects(f.controls.construct(),/at most|domain|between|outside|<=/);assert.equal(f.calls.length,0);
});
