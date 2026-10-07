import test from 'node:test';
import assert from 'node:assert/strict';
import {SourceConstructionControls} from '../ui/source-construction-controls.mjs';

const tetra=()=>({id:'literal-source',dimension:3,embeddingDimension:3,
  vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],edges:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],
  faces:[[0,2,1],[0,1,3],[1,2,3],[2,0,3]],cells:[],interpretation:'generalized-complex',
  metadata:{coordinateUnits:'mm',offColors:{faces:[{encoding:'unit',values:[.1,.2,.3,.4]},null,null,null],cells:[]},asset:{hash:'original'}}});
function fixture(kind='geodesic'){
  const defaults=kind==='geodesic'?{'geodesic-frequency':'2','make-geodesic':''}:
    {'core-x':'1/2','core-y':'sqrt(4)','core-z':'-3','core-color-policy':'require-equal','make-convex-core':''};
  const nodes=Object.fromEntries(Object.entries(defaults).map(([id,value])=>[id,{value,disabled:false}]));
  const state={model:tetra(),view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0]},notes:'Keep notes'},
    doc={id:'source-document',cursor:0,states:[state]};
  let project={id:'project',active:0,documents:[doc]},exporting=false;
  const calls=[],result={id:'committed-document'};
  const context={getProject:()=>project,getDocument:()=>project.documents[project.active],
    getState:()=>context.getDocument()?.states[context.getDocument().cursor],isExporting:()=>exporting,
    guard:fn=>fn,number:async value=>{calls.push(['number',value]);return {'1/2':.5,'sqrt(4)':2,'-3':-3}[value]??Number(value);},
    commit:async(...args)=>{calls.push(['commit',...args]);args[3].verifyPublication();return result;}};
  context.evaluateMany=async parts=>Promise.all(parts.map(value=>context.number(value)));
  const panel={querySelector:s=>s==='button'?nodes[kind==='geodesic'?'make-geodesic':'make-convex-core']:nodes[s.slice(1)],
    querySelectorAll:()=>Object.values(nodes)};
  const controls=Object.assign(Object.create(SourceConstructionControls.prototype),{kind,context,panel,busy:false});
  controls.sync();
  return {controls,context,nodes,calls,result,state,doc,get project(){return project;},
    setProject:value=>project=value,setExport:value=>exporting=value};
}
const commit=f=>f.calls.find(row=>row[0]==='commit');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('frequency is natively evaluated before the exact operation and publication guard',async()=>{
  const f=fixture(),before=structuredClone(f.project);
  assert.equal(await f.controls.construct(),f.result);
  assert.deepEqual(commit(f).slice(0,4),['commit','triangular-geodesic',{frequency:2},'Triangular geodesic']);
  assert.equal(typeof commit(f)[4].verifyPublication,'function');assert.equal(f.calls.length,2);
  assert.deepEqual(f.project,before);assert.equal(f.controls.busy,false);
});

test('frequency expressions retain integer and native resource domains',async()=>{
  for(const [text,value] of [['1',1],['128',128],[' 2 ',2],['001',1],['+2',2],['2.0',2],['sqrt(4)',2],['1e2',100]]){
    const f=fixture();f.nodes['geodesic-frequency'].value=text;await f.controls.construct();assert.equal(commit(f)[2].frequency,value);
  }
  for(const value of ['','0','129','1000','-1','2.5','NaN','Infinity']){
    const f=fixture();f.nodes['geodesic-frequency'].value=value;await assert.rejects(f.controls.construct());assert.equal(commit(f),undefined);
    assert.equal(f.controls.busy,false);assert.equal(f.nodes['make-geodesic'].disabled,false);
  }
});

test('native output resource refusal is atomic, releases controls and allows next literal request',async()=>{
  const f=fixture(),before=structuredClone(f.project);let invocations=0;
  f.context.commit=async(op,params,label,{verifyPublication})=>{verifyPublication();
    if(!invocations++)throw Error('Geodesic predicted output counts exceed resource bounds.');return f.result;};
  f.nodes['geodesic-frequency'].value='128';
  await assert.rejects(()=>f.controls.construct(),/resource bounds/);
  assert.deepEqual(f.project,before);assert.equal(f.controls.busy,false);
  assert.ok(Object.values(f.nodes).every(n=>!n.disabled));
  f.nodes['geodesic-frequency'].value='2';assert.equal(await f.controls.construct(),f.result);
});

test('core snapshots all expressions and color policy; competing form edits refuse publication',async()=>{
  const f=fixture('core'),pending=[deferred(),deferred(),deferred()];let next=0;
  f.context.number=value=>{f.calls.push(['number',value]);return pending[next++].promise;};
  const running=f.controls.construct();assert.deepEqual(f.calls,[['number','1/2'],['number','sqrt(4)'],['number','-3']]);
  f.nodes['core-x'].value='99';f.nodes['core-color-policy'].value='none';
  pending[2].resolve(-3);pending[0].resolve(.5);await flush();assert.equal(commit(f),undefined);
  pending[1].resolve(2);await assert.rejects(running,/target fields/);assert.equal(commit(f),undefined);
});

test('source fences are checked after all three asynchronous expressions independent of resolution order',async()=>{
  const changes=[f=>f.state.model.metadata.offColors.faces[0].values[3]=.7,
    f=>f.state.model.metadata.asset.hash='changed',f=>f.state.model.vertices[1][0]=2,
    f=>f.state.view.coordinateUnit='cm',f=>f.state.notes='Changed',
    f=>f.setProject({...f.project}),f=>f.project.documents[0]={...f.doc},
    f=>f.doc.id='changed-document-id',f=>f.doc.states=[...f.doc.states],
    f=>f.doc.states[0]={...f.state},f=>{f.doc.states.push(structuredClone(f.state));f.doc.cursor=1;}];
  for(let axis=0;axis<3;axis++)for(const change of changes){
    const f=fixture('core'),pending=[deferred(),deferred(),deferred()];let next=0;
    f.context.number=()=>pending[next++].promise;
    const running=f.controls.construct();pending[axis].resolve(axis);await flush();change(f);
    for(let i=0;i<3;i++)if(i!==axis)pending[i].resolve(i);
    await assert.rejects(running,/changed/);assert.equal(commit(f),undefined);assert.equal(f.controls.busy,false);
  }
});

test('rotation and camera changes while core expressions run preserve geometric publication eligibility',async()=>{
  const f=fixture('core'),pending=[deferred(),deferred(),deferred()];let next=0;
  f.context.number=()=>pending[next++].promise;
  const running=f.controls.construct();f.state.view.angles[0]=76;f.state.view.camera={projection:'perspective',zoom:2};
  pending.forEach((p,i)=>p.resolve(i));await running;assert.ok(commit(f));assert.equal(f.state.view.angles[0],76);
});

test('center expression syntax and color policy refuse before evaluation',async()=>{
  for(const [id,value] of [['core-x',''],['core-y',' '],['core-z','a'.repeat(257)],['core-color-policy','average']]){
    const f=fixture('core');f.nodes[id].value=value;await assert.rejects(()=>f.controls.construct());
    assert.deepEqual(f.calls,[]);assert.equal(f.controls.busy,false);
  }
  const f=fixture('core');f.nodes['core-color-policy'].value='none';await f.controls.construct();
  assert.equal(commit(f)[2].color_policy,'none');
});

test('core numeric results are finite bounded primitive numbers and include signed coordinates',async()=>{
  for(const value of [NaN,Infinity,-Infinity,true,'1',undefined,1e101,2n]){
    const f=fixture('core');f.context.number=async()=>value;
    await assert.rejects(()=>f.controls.construct(),/finite.*bounded/);assert.equal(commit(f),undefined);
    assert.equal(f.controls.busy,false);
  }
  for(const value of [-1e100,0,Number.MIN_VALUE,1e100]){const f=fixture('core');f.context.number=async()=>value;
    await f.controls.construct();assert.deepEqual(commit(f)[2].center,[value,value,value]);}
});

test('native publication callback fences source attributes and ownership after computation starts',async()=>{
  const changes=[f=>f.state.model.metadata.offColors.faces[0].values[3]=.9,
    f=>f.state.notes='Changed',f=>f.state.view.coordinateUnit='cm',f=>f.setProject({...f.project}),
    f=>f.doc.id='changed-document-id',f=>f.doc.states=[...f.doc.states],
    f=>{f.project.documents.push(structuredClone(f.doc));f.project.active=1;},f=>f.setExport(true)];
  for(const kind of ['geodesic','core'])for(const change of changes){
    const f=fixture(kind),native=deferred();let published=false;
    f.context.commit=async(op,params,label,{verifyPublication})=>{await native.promise;verifyPublication();published=true;return f.result;};
    const running=f.controls.construct();await flush();change(f);native.resolve();
    await assert.rejects(running,/changed|export/);assert.equal(published,false);assert.equal(f.controls.busy,false);
  }
});

test('successful guarded commit may adopt a new history state without a false post-publication check',async()=>{
  const f=fixture();f.context.commit=async(op,params,label,{verifyPublication})=>{
    verifyPublication();f.doc.states.push({model:tetra(),view:{},notes:'New result'});f.doc.cursor=1;return f.result;};
  assert.equal(await f.controls.construct(),f.result);assert.equal(f.doc.cursor,1);assert.equal(f.controls.busy,false);
});

test('native publication permits observer motion and restores eligibility for the currently selected source',async()=>{
  const f=fixture(),native=deferred();let published=false;
  f.context.commit=async(op,params,label,{verifyPublication})=>{
    await native.promise;verifyPublication();published=true;return f.result;};
  const running=f.controls.construct();f.state.view={coordinateUnit:'mm',angles:[87,0,0,0,0,0],
    camera:{projection:'perspective',zoom:3}};native.resolve();
  assert.equal(await running,f.result);assert.equal(published,true);assert.equal(f.controls.busy,false);
  assert.equal(f.nodes['make-geodesic'].disabled,false);
  const g=fixture(),blocked=deferred();g.context.commit=async(op,params,label,{verifyPublication})=>{
    await blocked.promise;verifyPublication();return g.result;};
  const pending=g.controls.construct();
  const newState={model:tetra(),view:{coordinateUnit:'mm'}};
  newState.model.embeddingDimension=4;newState.model.vertices.forEach(point=>point.push(0));
  g.doc.states=[newState];blocked.resolve();await assert.rejects(pending,/changed/);
  assert.equal(g.controls.busy,false);assert.equal(g.nodes['make-geodesic'].disabled,true);
  assert.equal(g.nodes['geodesic-frequency'].disabled,false);
});

test('busy owns expression and native awaits and restores controls after cancellation or refusal',async()=>{
  const f=fixture('core'),expressions=deferred(),native=deferred();
  f.context.number=()=>expressions.promise;f.context.commit=()=>native.promise;
  const running=f.controls.construct();assert.ok(Object.values(f.nodes).every(n=>n.disabled));
  await assert.rejects(()=>f.controls.construct(),/current construction/);
  expressions.resolve(0);await flush();assert.equal(f.controls.busy,true);
  await assert.rejects(()=>f.controls.construct(),/current construction/);
  native.reject(Object.assign(Error('Cancelled'),{name:'AbortError'}));await assert.rejects(running,{name:'AbortError'});
  assert.equal(f.controls.busy,false);assert.ok(Object.values(f.nodes).every(n=>!n.disabled));
  const g=fixture('core');g.context.number=async()=>{throw Object.assign(Error('Cancelled expression'),{name:'AbortError'});};
  await assert.rejects(()=>g.controls.construct(),{name:'AbortError'});assert.equal(g.controls.busy,false);assert.equal(commit(g),undefined);
});

test('export disables all controls and fences exports started during expression completion',async()=>{
  const f=fixture();f.setExport(true);f.controls.sync();assert.ok(Object.values(f.nodes).every(n=>n.disabled));
  await assert.rejects(()=>f.controls.construct(),/export/);assert.deepEqual(f.calls,[]);
  const g=fixture('core'),number=deferred();g.context.number=()=>number.promise;
  const running=g.controls.construct();number.resolve(0);queueMicrotask(()=>g.setExport(true));
  await assert.rejects(running,/export/);assert.equal(commit(g),undefined);assert.equal(g.controls.busy,false);
  assert.ok(Object.values(g.nodes).every(n=>n.disabled));g.setExport(false);g.controls.sync();
  assert.ok(Object.values(g.nodes).every(n=>!n.disabled));
});

test('eligibility preserves native geometric authority while disabling wrong dimensions or nontriangular geodesic sources',async()=>{
  for(const kind of ['core','geodesic'])for(const change of [m=>m.dimension=4,m=>m.embeddingDimension=4,m=>m.vertices.pop(),m=>m.faces=[]]){
    const f=fixture(kind);change(f.state.model);f.controls.sync();assert.equal(f.controls.panel.querySelector('button').disabled,true);
    await assert.rejects(()=>f.controls.construct());assert.deepEqual(f.calls,[]);
  }
  const f=fixture();f.state.model.faces[0].push(3);f.controls.sync();assert.equal(f.nodes['make-geodesic'].disabled,true);
  await assert.rejects(()=>f.controls.construct(),/triangular/);
  const g=fixture('core');g.state.model.faces[0].push(3);await g.controls.construct();assert.ok(commit(g));
});

test('constructor mounts compact closed disclosures with guarded actions in the correct shelf order',async()=>{
  const previous=globalThis.document;
  try{for(const kind of ['geodesic','core']){
    const f=fixture(kind);let insertion,html;
    const panel={...f.controls.panel,id:'',open:false,set innerHTML(value){html=value;}};
    globalThis.document={createElement:tag=>{assert.equal(tag,'details');return panel;},
      getElementById:id=>({after:node=>{insertion={id,node};}})};
    const controls=new SourceConstructionControls(f.context,kind);
    assert.equal(panel.open,false);assert.equal(insertion.node,panel);
    assert.equal(insertion.id,kind==='geodesic'?'subdivision-settings':'geodesic-settings');
    assert.equal(panel.id,kind==='geodesic'?'geodesic-settings':'convex-core-settings');
    assert.match(html,/<summary>/);assert.equal(typeof panel.querySelector('button').onclick,'function');
    await panel.querySelector('button').onclick();assert.equal(controls.busy,false);assert.ok(commit(f));
  }}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
  assert.throws(()=>new SourceConstructionControls({},'unknown'),/Unknown source construction/);
});
