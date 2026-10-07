import test from 'node:test';
import assert from 'node:assert/strict';
import {FacePlacementControls} from '../ui/face-placement-controls.mjs';

const cube=(id='base')=>({id,name:'Literal cube',dimension:3,embeddingDimension:3,
  vertices:[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
  edges:[[0,1],[1,2],[2,3],[0,3],[4,5],[5,6],[6,7],[4,7],[0,4],[1,5],[2,6],[3,7]],
  faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],cells:[],
  interpretation:'generalized-complex',numeric:{certified:false},metadata:{coordinateUnits:'mm',
    offColors:{faces:Array.from({length:6},(_,i)=>({encoding:'byte',values:[11+i,22,33,127]})),cells:[]},
    offlineAsset:{hash:'original'},literalAttributes:[1,2,3]}});
function fixture(){
  const defaults={'placement-source':'current','placement-face-ids':'3, 1','placement-addition-face':'0',
    'placement-scale':'sqrt(4)','placement-height':'-1/2','placement-angle':'90','place-at-faces':''};
  const nodes=Object.fromEntries(Object.entries(defaults).map(([id,value])=>[id,{value,disabled:false,
    options:[],append(option){this.options.push(option);}}]));
  const state={model:cube(),view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0]},label:'Original',notes:'Keep source notes'},
    doc={id:'document',cursor:0,states:[state]};
  let project={id:'project',active:0,documents:[doc]},exporting=false,
    memories={version:1,slots:Array(9).fill(null)};
  for(const i of [0,8])memories.slots[i]={state:{model:cube(`memory-${i+1}`),view:{coordinateUnit:'mm'},notes:'Stored notes'},
    source:{documentId:'stored-owner',modelId:`memory-${i+1}`},annotation:{literal:'original-entry'}};
  const calls=[],result={id:'placed'};
  const context={getProject:()=>project,getDocument:()=>project.documents[project.active],
    getState:()=>context.getDocument()?.states[context.getDocument().cursor],getMemories:()=>memories,
    isExporting:()=>exporting,guard:fn=>fn,
    number:async text=>{calls.push(['number',text]);return {'sqrt(4)':2,'-1/2':-.5}[text]??Number(text);},
    commit:async(...args)=>{calls.push(['commit',...args]);args[3].verifyPublication();return result;}};
  const panel={querySelector:s=>nodes[s.slice(1)],querySelectorAll:()=>Object.values(nodes)};
  const controls=Object.assign(Object.create(FacePlacementControls.prototype),{context,panel,busy:false,
    memoryOptions:Array.from({length:9},()=>({disabled:false,textContent:''}))});controls.sync();
  return {controls,context,nodes,calls,result,state,doc,get project(){return project;},get memories(){return memories;},
    setProject:v=>project=v,setExport:v=>exporting=v,setMemories:v=>memories=v};
}
const commit=f=>f.calls.find(row=>row[0]==='commit');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function holdExpressions(f){const pending=[deferred(),deferred(),deferred()];let index=0;
  f.context.number=value=>{f.calls.push(['number',value]);return pending[index++].promise;};return pending;}

test('current-copy placement commits detached full attributes, ordered IDs and exact workflow parameters',async()=>{
  const f=fixture(),before=structuredClone(f.project);
  assert.equal(await f.controls.place(),f.result);
  assert.deepEqual(f.calls.slice(0,3),[['number','sqrt(4)'],['number','-1/2'],['number','90']]);
  assert.deepEqual(commit(f).slice(0,4),['commit','place-at-faces',{addition:before.documents[0].states[0].model,
    face_ids:[3,1],addition_face_id:0,scale:2,height:-.5,angle_degrees:90,color_policy:'preserve'},'Place at faces (3D)']);
  assert.equal(typeof commit(f)[4].verifyPublication,'function');assert.notEqual(commit(f)[2].addition,f.state.model);
  commit(f)[2].addition.metadata.offColors.faces[0].values[3]=0;assert.deepEqual(f.project,before);
});

test('first and ninth memory additions retain independent full snapshots, RGBA and stable source IDs',async()=>{
  for(const slot of [1,9]){const f=fixture(),before=structuredClone(f.memories);
    f.nodes['placement-source'].value=`memory:${slot}`;await f.controls.place();
    assert.deepEqual(commit(f)[2].addition,before.slots[slot-1].state.model);
    assert.notEqual(commit(f)[2].addition,f.memories.slots[slot-1].state.model);
    commit(f)[2].addition.metadata.offlineAsset.hash='local-param-edit';assert.deepEqual(f.memories,before);
    assert.match(f.controls.memoryOptions[slot-1].textContent,new RegExp(`Memory ${slot}`));}
});

test('project memories fallback works; empty, invalid or malformed selected banks refuse before expressions',async()=>{
  const valid=fixture();valid.project.memories=valid.memories;delete valid.context.getMemories;
  valid.nodes['placement-source'].value='memory:9';await valid.controls.place();assert.equal(commit(valid)[2].addition.id,'memory-9');
  for(const selection of ['memory:2','memory:0','memory:10','memory:01','other']){
    const f=fixture();f.nodes['placement-source'].value=selection;await assert.rejects(()=>f.controls.place());assert.deepEqual(f.calls,[]);}
  for(const bank of [null,{version:2,slots:Array(9).fill(null)},{version:1,slots:[]}]){
    const f=fixture();f.setMemories(bank);f.nodes['placement-source'].value='memory:1';
    await assert.rejects(()=>f.controls.place());assert.deepEqual(f.calls,[]);}
  const absent=fixture();absent.setMemories(undefined);await absent.controls.place();assert.equal(commit(absent)[2].addition.id,'base');
});

test('literal face selections retain order and bound duplicates, count, syntax and addition IDs before expression awaits',async()=>{
  for(const text of ['', '1,1','1 2','1,,2','1,','-1','+1','1.0','1/2','sqrt(4)','1e2','6','x'.repeat(257),
      Array.from({length:17},(_,i)=>i).join(',')]){
    const f=fixture();f.nodes['placement-face-ids'].value=text;
    await assert.rejects(()=>f.controls.place());assert.deepEqual(f.calls,[]);assert.equal(f.controls.busy,false);}
  for(const text of ['','-1','1.0','1e2','6','999999999999']){
    const f=fixture();f.nodes['placement-addition-face'].value=text;
    await assert.rejects(()=>f.controls.place());assert.deepEqual(f.calls,[]);}
  const f=fixture();f.nodes['placement-face-ids'].value=' 003 , 1 , 0 ';await f.controls.place();
  assert.deepEqual(commit(f)[2].face_ids,[3,1,0]);
});

test('sixteen distinct in-range target IDs are accepted and seventeen in-range IDs hit the actual selection count limit',async()=>{
  const n=10,ring=Array.from({length:n},(_,i)=>[Math.cos(2*Math.PI*i/n),Math.sin(2*Math.PI*i/n),0]),
    bipyramid={id:'literal-decagonal-bipyramid',dimension:3,embeddingDimension:3,
      vertices:[...ring,[0,0,1],[0,0,-1]],
      edges:[...Array.from({length:n},(_,i)=>[i,(i+1)%n]),...Array.from({length:n},(_,i)=>[i,n]),
        ...Array.from({length:n},(_,i)=>[i,n+1])],
      faces:[...Array.from({length:n},(_,i)=>[i,(i+1)%n,n]),...Array.from({length:n},(_,i)=>[(i+1)%n,i,n+1])],
      cells:[],metadata:{coordinateUnits:'mm'}};
  const valid=fixture();valid.state.model=structuredClone(bipyramid);
  valid.nodes['placement-face-ids'].value=Array.from({length:16},(_,i)=>i).join(',');
  await valid.controls.place();assert.equal(commit(valid)[2].face_ids.length,16);
  const invalid=fixture();invalid.state.model=structuredClone(bipyramid);
  invalid.nodes['placement-face-ids'].value=Array.from({length:17},(_,i)=>i).join(',');
  await assert.rejects(()=>invalid.controls.place(),/1\.\.16 distinct/);assert.deepEqual(invalid.calls,[]);
});

test('selected source faces above64 vertices refuse before numeric expression evaluation',async()=>{
  const f=fixture(),n=65,ring=Array.from({length:n},(_,i)=>[Math.cos(2*Math.PI*i/n),Math.sin(2*Math.PI*i/n)]);
  f.state.model={id:'literal-65-gonal-prism',dimension:3,embeddingDimension:3,
    vertices:[...ring.map(([x,y])=>[x,y,0]),...ring.map(([x,y])=>[x,y,1])],
    edges:[...Array.from({length:n},(_,i)=>[i,(i+1)%n]),...Array.from({length:n},(_,i)=>[n+i,n+(i+1)%n]),
      ...Array.from({length:n},(_,i)=>[i,n+i])],
    faces:[Array.from({length:n},(_,i)=>n-1-i),Array.from({length:n},(_,i)=>n+i),
      ...Array.from({length:n},(_,i)=>[i,(i+1)%n,n+(i+1)%n,n+i])],cells:[],metadata:{coordinateUnits:'mm'}};
  f.nodes['placement-face-ids'].value='0';f.nodes['placement-addition-face'].value='2';
  await assert.rejects(()=>f.controls.place(),/at most 64/);assert.deepEqual(f.calls,[]);
  f.nodes['placement-face-ids'].value='2';f.nodes['placement-addition-face'].value='0';
  await assert.rejects(()=>f.controls.place(),/at most 64/);assert.deepEqual(f.calls,[]);
});

test('three expressions start from one snapshot and commit only after all resolve, regardless of order',async()=>{
  const f=fixture(),pending=holdExpressions(f),running=f.controls.place();
  assert.deepEqual(f.calls,[['number','sqrt(4)'],['number','-1/2'],['number','90']]);
  pending[2].resolve(90);pending[0].resolve(2);await flush();assert.equal(commit(f),undefined);
  f.nodes['placement-source'].value='memory:9';f.nodes['placement-face-ids'].value='0';f.nodes['placement-addition-face'].value='5';
  f.nodes['placement-scale'].value='99';f.nodes['placement-height'].value='99';f.nodes['placement-angle'].value='-99';
  pending[1].resolve(-.5);await running;
  assert.equal(commit(f)[2].addition.id,'base');assert.deepEqual(commit(f)[2].face_ids,[3,1]);
  assert.equal(commit(f)[2].addition_face_id,0);assert.equal(commit(f)[2].scale,2);
  assert.equal(commit(f)[2].height,-.5);assert.equal(commit(f)[2].angle_degrees,90);
});

test('source attrs, units, notes and project/history ownership are fenced after each expression resolution order',async()=>{
  const changes=[f=>f.state.model.metadata.offColors.faces[0].values[3]=0,
    f=>f.state.model.metadata.offlineAsset.hash='changed',f=>f.state.model.vertices[1][0]=2,
    f=>f.state.notes='Edited notes',f=>f.state.view.coordinateUnit='cm',f=>f.state.model.metadata.coordinateUnits='cm',
    f=>f.setProject({...f.project}),f=>f.project.documents[0]={...f.doc},f=>f.doc.id='new-doc',f=>f.doc.states=[...f.doc.states],
    f=>{f.doc.states.push(structuredClone(f.state));f.doc.cursor=1;},f=>f.doc.states[0]={...f.state}];
  for(let axis=0;axis<3;axis++)for(const change of changes){
    const f=fixture(),pending=holdExpressions(f),running=f.controls.place();pending[axis].resolve(axis);await flush();change(f);
    pending.forEach((p,i)=>{if(i!==axis)p.resolve(i===0?1:0);});
    await assert.rejects(running,/changed/);assert.equal(commit(f),undefined);assert.equal(f.controls.busy,false);
  }
});

test('selected memory whole-entry attrs/source/notes/units and equal-looking replacement are fenced during awaits',async()=>{
  const changes=[f=>f.memories.slots[0].state.model.metadata.offColors.faces[0].values[3]=0,
    f=>f.memories.slots[0].state.model.metadata.offlineAsset.hash='changed',
    f=>f.memories.slots[0].source.documentId='changed-owner',f=>f.memories.slots[0].state.notes='Changed notes',
    f=>f.memories.slots[0].state.view.coordinateUnit='cm',f=>f.memories.slots[0].annotation.literal='changed-annotation',
    f=>f.memories.slots[0]=structuredClone(f.memories.slots[0]),f=>f.memories.slots[0]=null];
  for(const change of changes){const f=fixture();f.nodes['placement-source'].value='memory:1';
    const pending=holdExpressions(f),running=f.controls.place();change(f);pending.forEach((p,i)=>p.resolve(i===0?1:0));
    await assert.rejects(running,/memory changed/);assert.equal(commit(f),undefined);assert.equal(f.controls.busy,false);}
});

test('observer camera motion, unrelated memories and bank replacement retaining selected entry are permitted',async()=>{
  const f=fixture();f.nodes['placement-source'].value='memory:1';const selected=f.memories.slots[0];
  const pending=holdExpressions(f),running=f.controls.place();
  f.state.view.angles[4]=76;f.state.view.camera={projection:'perspective',zoom:2};
  f.setMemories({...f.memories,slots:f.memories.slots.map((entry,i)=>i===8?null:entry)});
  assert.equal(f.memories.slots[0],selected);pending.forEach((p,i)=>p.resolve(i===0?1:0));
  await running;assert.ok(commit(f));assert.equal(f.state.view.angles[4],76);
});

test('resolved display units and literal model metadata units are checked independently without conversion',async()=>{
  for(const change of [f=>f.memories.slots[0].state.view.coordinateUnit='cm',
    f=>f.memories.slots[0].state.model.metadata.coordinateUnits='cm',
    f=>delete f.memories.slots[0].state.model.metadata.coordinateUnits,
    f=>f.memories.slots[0].state.view.coordinateUnit='parsec']){
    const f=fixture();f.nodes['placement-source'].value='memory:1';change(f);
    await assert.rejects(()=>f.controls.place(),/units|unit metadata/);assert.deepEqual(f.calls,[]);
  }
  const f=fixture();f.nodes['placement-source'].value='memory:1';
  f.state.view.coordinateUnit=f.memories.slots[0].state.view.coordinateUnit='cm';
  await f.controls.place();assert.equal(commit(f)[2].addition.metadata.coordinateUnits,'mm');
  assert.deepEqual(commit(f)[2].addition.vertices,cube()['vertices']);
});

test('positive scale, signed height and bounded angle retain literal evaluated values; malformed types refuse',async()=>{
  const valid=[[Number.MIN_VALUE,-1e100,-360],[1e100,1e100,360],[1,0,0]];
  for(const values of valid){const f=fixture();let i=0;f.context.number=async()=>values[i++];
    await f.controls.place();assert.deepEqual([commit(f)[2].scale,commit(f)[2].height,commit(f)[2].angle_degrees],values);}
  for(const axis of [0,1,2])for(const value of [NaN,Infinity,-Infinity,true,'1',undefined,2n,axis===2?361:1e101,
    ...(axis===0?[0,-1]:[])]){
    const f=fixture();let i=0;f.context.number=async()=>i++===axis?value:1;
    await assert.rejects(()=>f.controls.place());assert.equal(commit(f),undefined);assert.equal(f.controls.busy,false);
  }
  for(const field of ['scale','height','angle'])for(const value of [' ','x'.repeat(257)]){
    const f=fixture();f.nodes[`placement-${field}`].value=value;
    await assert.rejects(()=>f.controls.place(),/expressions/);assert.deepEqual(f.calls,[]);}
});

test('native publication callback rejects changed base/memory or export after computation starts',async()=>{
  const changes=[f=>f.state.notes='changed',f=>f.doc.id='changed',f=>f.state.model.metadata.offColors.faces[0].values[3]=0,
    f=>f.memories.slots[0].source.modelId='changed',f=>f.memories.slots[0].annotation.literal='changed',f=>f.setExport(true)];
  for(const change of changes){const f=fixture();f.nodes['placement-source'].value='memory:1';const native=deferred();let published=false;
    f.context.commit=async(op,params,label,{verifyPublication})=>{await native.promise;verifyPublication();published=true;return f.result;};
    const running=f.controls.place();await flush();change(f);native.resolve();
    await assert.rejects(running,/changed|animation export/);assert.equal(published,false);assert.equal(f.controls.busy,false);
  }
});

test('native guard allows observer motion and successful adoption without false post-commit source rejection',async()=>{
  const f=fixture(),native=deferred();f.context.commit=async(op,params,label,{verifyPublication})=>{
    await native.promise;verifyPublication();f.doc.states.push({model:cube('result'),view:{}});f.doc.cursor=1;return f.result;};
  const running=f.controls.place();await flush();f.state.view.angles[1]=45;native.resolve();
  assert.equal(await running,f.result);assert.equal(f.doc.cursor,1);assert.equal(f.controls.busy,false);
});

test('busy disables every control across expression and native awaits and rejects duplicate invocation',async()=>{
  const f=fixture(),expressions=deferred(),native=deferred();f.context.number=()=>expressions.promise;
  f.context.commit=()=>native.promise;const running=f.controls.place();assert.ok(Object.values(f.nodes).every(n=>n.disabled));
  await assert.rejects(()=>f.controls.place(),/current placement/);expressions.resolve(1);await flush();
  assert.equal(f.controls.busy,true);await assert.rejects(()=>f.controls.place(),/current placement/);
  native.resolve(f.result);await running;assert.equal(f.controls.busy,false);assert.ok(Object.values(f.nodes).every(n=>!n.disabled));
});

test('expression cancellation/native resource refusal remain atomic and controls allow recovery',async()=>{
  const f=fixture(),before=structuredClone({project:f.project,memories:f.memories});
  f.context.number=async()=>{throw Object.assign(Error('Cancelled expression'),{name:'AbortError'});};
  await assert.rejects(()=>f.controls.place(),{name:'AbortError'});assert.equal(f.controls.busy,false);assert.equal(commit(f),undefined);
  assert.deepEqual({project:f.project,memories:f.memories},before);
  const g=fixture();let calls=0;g.context.commit=async(op,params,label,{verifyPublication})=>{
    verifyPublication();if(!calls++)throw Error('Native aggregate output resource limit exceeded.');return g.result;};
  await assert.rejects(()=>g.controls.place(),/resource limit/);assert.equal(g.controls.busy,false);
  assert.equal(await g.controls.place(),g.result);
});

test('export before click or while expressions resolve rejects publication and preserves disabled state until completion',async()=>{
  const f=fixture();f.setExport(true);f.controls.sync();assert.ok(Object.values(f.nodes).every(n=>n.disabled));
  await assert.rejects(()=>f.controls.place(),/animation export/);assert.deepEqual(f.calls,[]);
  const g=fixture(),pending=holdExpressions(g),running=g.controls.place();
  pending.forEach((p,i)=>p.resolve(i===0?1:0));queueMicrotask(()=>g.setExport(true));
  await assert.rejects(running,/animation export/);assert.equal(commit(g),undefined);assert.equal(g.controls.busy,false);
  assert.ok(Object.values(g.nodes).every(n=>n.disabled));g.setExport(false);g.controls.sync();
  assert.ok(Object.values(g.nodes).every(n=>!n.disabled));
});

test('cheap bounded source gate rejects unsupported dimensions, open incidence and oversized inputs, without a convexity claim',async()=>{
  for(const mutate of [m=>m.dimension=4,m=>m.embeddingDimension=4,m=>m.faces.pop(),m=>m.cells=[[0,1,2,3]],
    m=>m.vertices.push([0,0,0]),m=>m.vertices[0][0]=Infinity,m=>m.edges.push([0,1]),m=>m.id='',
    m=>m.vertices=Array.from({length:257},()=>[0,0,0])]){
    const f=fixture();mutate(f.state.model);f.controls.sync();assert.equal(f.nodes['place-at-faces'].disabled,true);
    await assert.rejects(()=>f.controls.place());assert.deepEqual(f.calls,[]);}
  const flat=fixture();flat.state.model.vertices.forEach(point=>point[2]=0);
  await flat.controls.place();assert.equal(commit(flat)[2].addition.numeric.certified,false);
});

test('noncongruent source face arities are permitted for native placement, while literal source IDs remain unchanged',async()=>{
  const f=fixture();f.nodes['placement-source'].value='memory:1';
  f.memories.slots[0].state.model={...cube('tetra'),vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],
    edges:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],faces:[[0,2,1],[0,1,3],[1,2,3],[2,0,3]],
    metadata:{coordinateUnits:'mm'}};
  await f.controls.place();assert.equal(commit(f)[2].addition.faces[0].length,3);assert.equal(f.state.model.faces[3].length,4);
});

test('accessors, sparse arrays, cycles, deep or oversized attributes are refused before evaluation without getter reads',async()=>{
  for(const mode of ['accessor','model-getter','memory-getter','cycle','deep','large','sparse']){
    const f=fixture();let reads=0;
    if(mode==='accessor')Object.defineProperty(f.state.model.metadata,'secret',{enumerable:true,get(){reads++;return 'bad';}});
    if(mode==='model-getter')Object.defineProperty(f.state,'model',{get(){reads++;return cube();}});
    if(mode==='memory-getter'){
      f.nodes['placement-source'].value='memory:1';Object.defineProperty(f.memories.slots[0],'source',{enumerable:true,get(){reads++;return {};}});}
    if(mode==='cycle')f.state.model.metadata.cycle=f.state.model;
    if(mode==='deep'){let n={};f.state.model.metadata.deep=n;for(let i=0;i<70;i++)n=n.next={};}
    if(mode==='large')f.state.model.metadata.text='x'.repeat(8*1024*1024);
    if(mode==='sparse')delete f.state.model.vertices[0];
    await assert.rejects(()=>f.controls.place());assert.deepEqual(f.calls,[]);assert.equal(reads,0);
  }
});

test('constructor mounts a closed compact disclosure with nine numbered memories, guarded action and fallback anchor',async()=>{
  const f=fixture(),previous=globalThis.document;let inserted,html;
  const panel={...f.controls.panel,id:'',open:false,set innerHTML(value){html=value;}};
  globalThis.document={createElement:tag=>tag==='details'?panel:{value:'',textContent:'',disabled:false},
    getElementById:id=>id==='geodesic-settings'?{after(node){inserted=node;}}:null};
  try{const controls=new FacePlacementControls(f.context);
    assert.equal(inserted,panel);assert.equal(panel.id,'face-placement-settings');assert.equal(panel.open,false);
    assert.match(html,/<summary>Place at faces \(3D\)<\/summary>/);assert.equal(controls.memoryOptions.length,9);
    assert.deepEqual(controls.memoryOptions.map(o=>o.value),Array.from({length:9},(_,i)=>`memory:${i+1}`));
    assert.equal(controls.memoryOptions[1].disabled,true);assert.equal(controls.memoryOptions[0].disabled,false);
    await f.nodes['place-at-faces'].onclick();assert.equal(commit(f)[1],'place-at-faces');
    globalThis.document.getElementById=()=>null;assert.throws(()=>new FacePlacementControls(f.context),/shelf anchor/);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
