import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {BlendingControls} from '../ui/blending-controls.mjs';
import {buildFaceSurfaces} from '../ui/face-fill.mjs';
import {sourceContext,deferred} from './construction-controls-fixture.mjs';

function fixture({mount=false}={}){
  const owner=sourceContext(),calls=[];owner.getState().model.interpretation='convex-polytope';
  let evaluate=async parts=>parts.map(t=>t==='1/3'?1/3:Number(t));
  const context={...owner,guard:fn=>fn,evaluateBatch:(...args)=>evaluate(...args),
    commit:async(op,params,label,options)=>{options.verifyPublication();calls.push({op,params,label,options});return 'committed';}};
  const fields={ids:'0,1;2',color:'first-source',weld:true,tolerance:'0',rule:'nonzero',
    operation:'truncate',amount:'1/3',evaluations:'100',residual:'1e-7',symmetry:true,
    mergeRule:'nonzero',mergeColor:'require-equal'};
  const nodes={},inserted=[];
  function node(){return {disabled:false,textContent:'',children:[],
    append(n){this.children.push(n);},after(n){inserted.push(n);},
    querySelector:id=>nodes[id.slice(1)],querySelectorAll(){return Object.values(nodes);},
    set innerHTML(html){this.html=html;for(const [,id] of html.matchAll(/id="([^"]+)"/g))nodes[id]??=node();},
    get innerHTML(){return this.html;}};}
  nodes['make-dual']=node();nodes['face-editing-settings']=node();
  const old=globalThis.document;let controls;
  globalThis.document={createElement:node,getElementById:id=>nodes[id]};
  try{controls=new BlendingControls(context,{mount});}finally{globalThis.document=old;}
  controls.fields=()=>({...fields});controls.sync();
  return {owner,context,calls,controls,fields,nodes,inserted,setEvaluate:fn=>{evaluate=fn;}};
}

test('mounted controls expose common Merge and collapsed options, plus the face union action',async()=>{
  const f=fixture({mount:true});
  assert.equal(f.controls.panel.id,'blending-controls');
  assert.equal(f.nodes['face-editing-settings'].children[0].id,'blend-region-controls');
  assert.match(f.controls.panel.innerHTML,/<details id="pseudo-uniform-settings">/);
  assert.ok(f.inserted.some(n=>n.id==='merge-compound-options'));
  await f.nodes['merge-compound'].onclick();assert.equal(f.calls[0].op,'merge-compound');
  await f.nodes['blend-regions'].onclick();assert.equal(f.calls[1].op,'blend-regions');
  await f.nodes['pseudo-uniform'].onclick();assert.equal(f.calls[2].op,'pseudo-uniform');
});

test('all actions use history commits with detached sources, cancellation and publication fences',async()=>{
  for(const op of ['merge-compound','blend-regions','pseudo-uniform']){
    const f=fixture();assert.equal(await f.controls.apply(op),'committed');
    assert.equal(f.calls[0].op,op);const options=f.calls[0].options;
    assert.ok(options.signal instanceof AbortSignal);
    assert.notEqual(options.sourceSnapshot,f.owner.getState().model);
    assert.deepEqual(options.sourceSnapshot,f.owner.getState().model);
  }
});

test('numeric expressions and winding/color controls are retained as native recipe parameters',async()=>{
  const f=fixture();await f.controls.apply('pseudo-uniform');
  assert.deepEqual(f.calls[0].params,{operation:'truncate',amount:1/3,max_evaluations:100,residual_tolerance:1e-7,keep_symmetry:true});
  f.fields.operation='expand';await f.controls.apply('pseudo-uniform');assert.equal(f.calls[1].params.operation,'expand');
  f.fields.rule='even-odd';await f.controls.apply('blend-regions');
  assert.deepEqual(f.calls[2].params,{face_ids:[0,1,2],tolerance:0,weld:true,color_policy:'first-source',fill_rule:'even-odd'});
  f.fields.mergeRule='even-odd';f.fields.mergeColor='first-source';await f.controls.apply('merge-compound');
  assert.deepEqual(f.calls[3].params,{fill_rule:'even-odd',color_policy:'first-source'});
});

test('invalid numeric domains, unsupported sources and export refuse before publication',async()=>{
  for(const [key,value] of [['amount','.5'],['amount','0'],['evaluations','1.5'],['residual','1e-12']]){
    const f=fixture();f.fields[key]=value;
    await assert.rejects(f.controls.apply('pseudo-uniform'),/domain|less than/);assert.equal(f.calls.length,0);
  }
  const f=fixture();f.owner.setExport(true);await assert.rejects(f.controls.apply('merge-compound'),/export/);
  f.owner.setExport(false);f.owner.getState().model.dimension=4;
  await assert.rejects(f.controls.apply('merge-compound'),/3D/);
  f.owner.getState().model.dimension=3;f.owner.getState().model.interpretation='generalized-complex';
  await assert.rejects(f.controls.apply('pseudo-uniform'),/convex/);assert.equal(f.calls.length,0);
});

test('pending numeric work rejects changed notes, colors, controls and cancellation',async()=>{
  for(const change of [f=>f.fields.amount='.25',f=>f.owner.getState().notes='changed',
    f=>f.owner.getState().model.metadata.offColors.faces[0].values[0]=.9,f=>f.controls.cancel()]){
    const f=fixture(),pending=deferred();f.setEvaluate(()=>pending.promise);
    const work=f.controls.apply('pseudo-uniform');change(f);pending.resolve([1/3,100,1e-7]);
    await assert.rejects(work,/changed|cancel/i);assert.equal(f.calls.length,0);assert.equal(f.controls.busy,false);
  }
});

test('held merge binds options, full source, workspace and export ownership',async()=>{
  for(const change of [f=>f.fields.mergeRule='even-odd',f=>f.owner.swapDocument(),f=>f.owner.swapProject(),
    f=>f.owner.getState().notes='changed',f=>f.owner.setExport(true),f=>f.controls.cancel()]){
    const f=fixture(),pending=deferred();let signal;
    f.context.commit=async(...args)=>{signal=args.at(-1).signal;await pending.promise;args.at(-1).verifyPublication();f.calls.push('published');};
    const work=f.controls.apply('merge-compound');change(f);pending.resolve();
    await assert.rejects(work,/changed|export|cancel/i);assert.equal(f.calls.length,0);assert.equal(f.controls.busy,false);
    if(signal.aborted)assert.equal(f.controls.mergeJob,null);
  }
});

test('successful history publication may replace the state; observer motion remains independent',async()=>{
  for(const op of ['merge-compound','pseudo-uniform','blend-regions']){
    const f=fixture();f.context.commit=async(...args)=>{
      f.owner.getState().view.camera.zoom=4;args.at(-1).verifyPublication();
      f.owner.setState(structuredClone(f.owner.getState()));return 'replaced';};
    assert.equal(await f.controls.apply(op),'replaced');
  }
});

test('native hole representation renders with correct area and an empty center',()=>{
  const code=`import json
from engine.planar_union import blend_regions
p=[[0,0],[3,0],[3,3],[0,3],[1,1],[2,1],[2,2],[1,2]]
f=[[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]
m={'id':'ring','name':'ring','dimension':2,'embeddingDimension':2,'interpretation':'generalized-complex','vertices':p,'faces':f,'edges':[list(e) for e in sorted({tuple(sorted((a,b))) for q in f for a,b in zip(q,q[1:]+q[:1])})],'cells':[],'metadata':{}}
print(json.dumps(blend_regions(m,[0,1,2,3])))`;
  const model=JSON.parse(execFileSync('python',['-B','-c',code],{encoding:'utf8',windowsHide:true}));
  const result=buildFaceSurfaces(model);assert.equal(result.diagnostics.length,0);
  let area=0;
  for(const {points:[a,b,c]} of result.triangles){
    area+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
    const x=(a[0]+b[0]+c[0])/3,y=(a[1]+b[1]+c[1])/3;
    assert.ok(!(x>1&&x<2&&y>1&&y<2));
  }
  assert.ok(Math.abs(area-8)<1e-8);
});

test('compound lifecycle, inspector mounting and native operation allowlist include the slice',async()=>{
  const [compound,desktop,history]=await Promise.all(['../ui/compound-controls.mjs','../desktop/main.cjs','../ui/history-controls.mjs']
    .map(path=>readFile(new URL(path,import.meta.url),'utf8')));
  assert.match(compound,/new BlendingControls\(context\)/);
  assert.match(compound,/this.blending.sync\(\)/);assert.match(compound,/this.blending\?\.cancel\(\)/);
  for(const op of ['blend-regions','merge-compound','pseudo-uniform']){
    assert.ok(desktop.includes(`'${op}'`));assert.ok(history.includes(`'${op}'`));
  }
});
