import test from 'node:test';
import assert from 'node:assert/strict';
import {AugmentationControls} from '../ui/augmentation-controls.mjs';

const tetra=()=>({id:'tetra-source',name:'Tetrahedron',dimension:3,embeddingDimension:3,
  interpretation:'generalized-complex',vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],
  edges:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],faces:[[0,2,1],[0,1,3],[1,2,3],[0,3,2]],cells:[],
  metadata:{offColors:{faces:[{encoding:'unit',values:[.2,.4,.6,.8]},null,null,null],cells:[]},attributes:['original']},
  numeric:{certified:false}});

function fixture(){
  const defaults={'augmentation-source':'current','augmentation-base-face':'1','augmentation-addition-face':'2',
    'augmentation-cycle-offset':'1','augmentation-scale':'sqrt(4)','attach-faces':''};
  const nodes=Object.fromEntries(Object.entries(defaults).map(([id,value])=>[id,{value,disabled:false,options:[],append(v){this.options.push(v);}}]));
  let state={model:tetra(),view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0]},label:'Original',notes:'Preserve'},
    doc={id:'document',cursor:0,states:[state]},project={id:'project',active:0,documents:[doc]},workspace={},exporting=false;
  let memories={version:1,slots:Array(9).fill(null)};
  memories.slots[0]={state:{model:{...tetra(),id:'stored-model'},view:{coordinateUnit:'mm'}},source:{documentId:'memory-owner'}};
  memories.slots[8]=structuredClone(memories.slots[0]);memories.slots[8].state.model.id='ninth-model';
  const calls=[],result={id:'attached'};
  const controls=Object.create(AugmentationControls.prototype);
  Object.assign(controls,{busy:false,memoryOptions:Array.from({length:9},()=>({disabled:false,textContent:''})),
    panel:{querySelector:s=>nodes[s.slice(1)],querySelectorAll:()=>Object.values(nodes)},
    context:{getState:()=>state,getProject:()=>project,getDocument:()=>doc,getWorkspace:()=>workspace,getMemories:()=>memories,
      isExporting:()=>exporting,guard:fn=>fn,number:async text=>{calls.push(['number',text]);return text==='sqrt(4)'?2:Number(text);},
      commit:async(...args)=>{calls.push(['commit',...args]);return result;}}});
  controls.sync();
  return {controls,nodes,calls,result,get state(){return state;},get doc(){return doc;},get project(){return project;},get memories(){return memories;},
    setExport:v=>exporting=v,setState:v=>state=v,setDoc:v=>doc=v,setProject:v=>project=v,setWorkspace:v=>workspace=v,setMemories:v=>memories=v};
}
const committed=f=>f.calls.find(row=>row[0]==='commit');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('native publication fence rejects changed units or selected memory after computation starts',async()=>{
  for(const change of [f=>{f.state.view.coordinateUnit='cm';},
    f=>{f.memories.slots[0].source.documentId='replaced-owner';},
    f=>{f.memories.slots[0].state.model.metadata.offColors.faces[0].values[3]=.1;}]){
    const f=fixture();f.nodes['augmentation-source'].value='memory:1';let release,published=false;
    f.controls.context.commit=async(op,params,label,{verifyPublication})=>{
      await new Promise(resolve=>{release=resolve;});verifyPublication();published=true;return f.result;
    };
    const pending=f.controls.attach();await flush();assert.equal(typeof release,'function');change(f);release();
    await assert.rejects(pending,/units|attributes|memory changed/);assert.equal(published,false);assert.equal(f.doc.states.length,1);
  }
});

test('native publication fence permits pose and unrelated-memory edits during computation',async()=>{
  const f=fixture();f.nodes['augmentation-source'].value='memory:1';let release,published=false;
  f.controls.context.commit=async(op,params,label,{verifyPublication})=>{
    await new Promise(resolve=>{release=resolve;});verifyPublication();published=true;return f.result;
  };
  const pending=f.controls.attach();await flush();f.state.view.angles[2]=87;
  f.memories.slots[8].source.documentId='unrelated-owner';release();
  assert.equal(await pending,f.result);assert.equal(published,true);assert.equal(f.state.view.angles[2],87);
});

test('current-copy attachment passes the exact full detached model and literal IDs through history only',async()=>{
  const f=fixture(),original=structuredClone(f.state.model);
  assert.equal(await f.controls.attach(),f.result);
  assert.deepEqual(f.calls[0],['number','sqrt(4)']);
  assert.deepEqual(committed(f).slice(0,4),['commit','attach-at-faces',{addition:original,base_face_id:1,addition_face_id:2,cycle_offset:1,scale:2},'Attach faces (3D)']);
  assert.equal(typeof committed(f)[4].verifyPublication,'function');
  assert.notEqual(committed(f)[2].addition,f.state.model);
  committed(f)[2].addition.metadata.offColors.faces[0].values[3]=0;
  assert.deepEqual(f.state.model,original);assert.equal(f.controls.busy,false);
});

test('first and ninth memory snapshots preserve stable model IDs, source RGBA and full metadata',async()=>{
  for(const slot of [1,9]){
    const f=fixture();f.nodes['augmentation-source'].value=`memory:${slot}`;f.controls.sync();
    const original=structuredClone(f.memories);await f.controls.attach();
    assert.deepEqual(committed(f)[2].addition,original.slots[slot-1].state.model);
    assert.notEqual(committed(f)[2].addition,f.memories.slots[slot-1].state.model);
    assert.deepEqual(f.memories,original);assert.match(f.controls.memoryOptions[slot-1].textContent,new RegExp(`Memory ${slot}`));
    assert.equal(f.nodes['augmentation-source'].value,`memory:${slot}`);
  }
});

test('memory source fallback can use the project bank and active document without optional getters',async()=>{
  const f=fixture();f.project.memories=f.memories;delete f.controls.context.getMemories;delete f.controls.context.getDocument;
  f.nodes['augmentation-source'].value='memory:1';await f.controls.attach();assert.equal(committed(f)[2].addition.id,'stored-model');
});

test('empty or invalid memory selections and malformed banks refuse before expression or commit',async()=>{
  for(const selection of ['memory:2','memory:0','memory:10','other','memory:01']){
    const f=fixture();f.nodes['augmentation-source'].value=selection;
    await assert.rejects(()=>f.controls.attach());assert.deepEqual(f.calls,[]);
  }
  for(const bank of [null,{version:2,slots:Array(9).fill(null)},{version:1,slots:[]}]){
    const f=fixture();f.setMemories(bank);f.nodes['augmentation-source'].value='memory:1';
    await assert.rejects(()=>f.controls.attach());assert.deepEqual(f.calls,[]);
  }
});

test('literal face IDs and cycle offsets are bounded before evaluating scale',async()=>{
  for(const id of ['augmentation-base-face','augmentation-addition-face','augmentation-cycle-offset']){
    for(const value of ['-1','1/2','sqrt(4)','1.0','NaN','1e2','99999999999999999999','',id==='augmentation-cycle-offset'?'3':'4']){
      const f=fixture();f.nodes[id].value=value;
      await assert.rejects(()=>f.controls.attach(),/source ID|selected source/);assert.deepEqual(f.calls,[]);
    }
  }
});

test('positive expression results retain the full bounded numeric domain and reject invalid types',async()=>{
  for(const value of [Number.MIN_VALUE,.5,1,1e100]){
    const f=fixture();f.controls.context.number=async()=>value;await f.controls.attach();assert.equal(committed(f)[2].scale,value);
  }
  for(const value of [0,-1,NaN,Infinity,-Infinity,true,'1',undefined,1e101,2n]){
    const f=fixture();f.controls.context.number=async()=>value;
    await assert.rejects(()=>f.controls.attach(),/positive.*finite/);assert.equal(committed(f),undefined);assert.equal(f.controls.busy,false);
  }
  for(const value of ['  ','a'.repeat(257)]){
    const f=fixture();f.nodes['augmentation-scale'].value=value;
    await assert.rejects(()=>f.controls.attach(),/positive scale expression/);assert.deepEqual(f.calls,[]);
  }
});

test('UI closed-incidence eligibility is bounded and does not assert geometric convexity',async()=>{
  const flat=fixture();flat.state.model.vertices[3][2]=0;
  await flat.controls.attach();assert.equal(committed(flat)[2].addition.interpretation,'generalized-complex');
  assert.equal(committed(flat)[2].addition.numeric.certified,false);
  for(const change of [m=>m.dimension=4,m=>m.embeddingDimension=4,m=>m.faces.pop(),m=>m.edges.push([0,1]),
    m=>m.vertices.push([2,2,2]),m=>m.vertices[0][0]=Infinity,m=>m.cells=[[0,1,2,3]],m=>m.id='',
    m=>m.vertices=Array.from({length:257},()=>[0,0,0])]){
    const f=fixture();change(f.state.model);f.controls.sync();assert.equal(f.nodes['attach-faces'].disabled,true);
    await assert.rejects(()=>f.controls.attach());assert.deepEqual(f.calls,[]);
  }
});

test('different source display units or invalid units refuse instead of converting snapshots',async()=>{
  for(const unit of ['cm','parsec']){
    const f=fixture();f.nodes['augmentation-source'].value='memory:1';f.memories.slots[0].state.view.coordinateUnit=unit;
    await assert.rejects(()=>f.controls.attach(),/unit/);assert.deepEqual(f.calls,[]);
  }
});

test('export before click or during the expression disables controls and prevents history invocation',async()=>{
  const existing=fixture();existing.setExport(true);existing.controls.sync();assert.ok(Object.values(existing.nodes).every(n=>n.disabled));
  await assert.rejects(()=>existing.controls.attach(),/animation export/);assert.deepEqual(existing.calls,[]);
  const f=fixture();let finish;f.controls.context.number=()=>new Promise(resolve=>finish=resolve);
  const pending=f.controls.attach();f.setExport(true);finish(1);await assert.rejects(pending,/animation export/);
  assert.equal(committed(f),undefined);assert.equal(f.controls.busy,false);assert.ok(Object.values(f.nodes).every(n=>n.disabled));
});

test('workspace/project/document/cursor/state/model and source attributes are fenced on an async expression',async()=>{
  const changes=[f=>f.setWorkspace({}),f=>f.setProject({...f.project}),f=>f.project.documents=[f.doc],
    f=>f.project.active=1,f=>f.setDoc({...f.doc}),f=>f.doc.id='changed',f=>f.doc.cursor=1,
    f=>f.doc.states=[f.state],f=>f.doc.states.push(structuredClone(f.state)),f=>f.setState({...f.state}),
    f=>f.state.model=structuredClone(f.state.model),f=>f.state.model.metadata.attributes.push('changed'),
    f=>f.state.model.vertices[1][0]=2,f=>f.state.model.metadata.offColors.faces[0].values[3]=.1,
    f=>f.state.notes='changed',f=>f.state.view.coordinateUnit='cm'];
  for(const change of changes){
    const f=fixture();let finish;f.controls.context.number=()=>new Promise(resolve=>finish=resolve);
    const pending=f.controls.attach();change(f);finish(1);await assert.rejects(pending);
    assert.equal(committed(f),undefined);assert.equal(f.controls.busy,false);
  }
});

test('viewport pose can rotate while the source geometry and physical units remain unchanged',async()=>{
  const f=fixture();let finish;f.controls.context.number=()=>new Promise(resolve=>finish=resolve);
  const pending=f.controls.attach();f.state.view.angles[2]=.4;finish(1);await pending;assert.ok(committed(f));
});

test('selected memory full-entry changes are fenced; unrelated slot replacement is allowed',async()=>{
  for(const change of [f=>f.memories.slots[0]=null,f=>f.memories.slots[0]=structuredClone(f.memories.slots[0]),
    f=>f.memories.slots[0].state.model.id='changed',f=>f.memories.slots[0].source.documentId='changed',
    f=>f.memories.slots[0].state.view.coordinateUnit='cm',f=>f.memories.slots[0].state.model.metadata.attributes.push('changed'),
    f=>f.memories.slots[0].state.model.metadata.offColors.faces[0].values[3]=.1]){
    const f=fixture();f.nodes['augmentation-source'].value='memory:1';let finish;
    f.controls.context.number=()=>new Promise(resolve=>finish=resolve);
    const pending=f.controls.attach();change(f);finish(1);await assert.rejects(pending);
    assert.equal(committed(f),undefined);
  }
  const f=fixture();f.nodes['augmentation-source'].value='memory:1';let finish;
  f.controls.context.number=()=>new Promise(resolve=>finish=resolve);
  const pending=f.controls.attach();f.setMemories({...f.memories,slots:f.memories.slots.map((e,i)=>i===8?null:e)});
  finish(1);await pending;assert.ok(committed(f));
});

test('expression cancellation releases busy state and preserves the source and memory bank',async()=>{
  const f=fixture(),before=structuredClone({state:f.state,memories:f.memories});
  f.controls.context.number=async()=>{throw Object.assign(Error('Cancelled expression'),{name:'AbortError'});};
  await assert.rejects(()=>f.controls.attach(),{name:'AbortError'});
  assert.equal(f.controls.busy,false);assert.equal(committed(f),undefined);
  assert.deepEqual({state:f.state,memories:f.memories},before);
});

test('busy covers expression and native history awaits; native refusal remains atomic and retryable',async()=>{
  const f=fixture();let finishNumber,finishNative;
  f.controls.context.number=()=>new Promise(resolve=>finishNumber=resolve);
  f.controls.context.commit=(...args)=>{f.calls.push(['commit',...args]);return new Promise(resolve=>finishNative=resolve);};
  const pending=f.controls.attach();assert.ok(Object.values(f.nodes).every(n=>n.disabled));
  await assert.rejects(()=>f.controls.attach(),/current face attachment/);
  finishNumber(1);await flush();assert.equal(f.controls.busy,true);
  await assert.rejects(()=>f.controls.attach(),/current face attachment/);
  finishNative(f.result);assert.equal(await pending,f.result);assert.equal(f.controls.busy,false);
  const retry=fixture(),before=structuredClone(retry.state);let count=0;
  retry.controls.context.commit=async()=>{if(!count++)throw Error('Native face polygons are incongruent.');return retry.result;};
  await assert.rejects(()=>retry.controls.attach(),/incongruent/);assert.deepEqual(retry.state,before);
  assert.equal(retry.controls.busy,false);assert.equal(await retry.controls.attach(),retry.result);
});

test('controls snapshot all requested inputs coherently despite synthetic edits while disabled',async()=>{
  const f=fixture();let finish;f.controls.context.number=()=>new Promise(resolve=>finish=resolve);
  const pending=f.controls.attach();f.nodes['augmentation-source'].value='memory:9';
  f.nodes['augmentation-base-face'].value='0';f.nodes['augmentation-addition-face'].value='3';
  f.nodes['augmentation-cycle-offset'].value='0';f.nodes['augmentation-scale'].value='99';
  finish(2);await pending;
  assert.equal(committed(f)[2].addition.id,'tetra-source');assert.equal(committed(f)[2].base_face_id,1);
  assert.equal(committed(f)[2].addition_face_id,2);assert.equal(committed(f)[2].cycle_offset,1);assert.equal(committed(f)[2].scale,2);
});

test('bounded plain snapshot cloning refuses deep, cyclic, accessor and huge attributes before evaluation',async()=>{
  for(const mode of ['cycle','deep','accessor','source-getter','large']){
    const f=fixture();let reads=0;
    if(mode==='cycle')f.state.model.metadata.cycle=f.state.model;
    if(mode==='deep'){
      let nested={};f.state.model.metadata.deep=nested;
      for(let i=0;i<70;i++){nested.next={};nested=nested.next;}
    }
    if(mode==='accessor')Object.defineProperty(f.state.model.metadata,'getter',{enumerable:true,get(){reads++;return 'bad';}});
    if(mode==='source-getter')Object.defineProperty(f.state.model,'vertices',{get(){reads++;return [[0,0,0]];}});
    if(mode==='large')f.state.model.metadata.text='x'.repeat(8*1024*1024);
    await assert.rejects(()=>f.controls.attach());assert.deepEqual(f.calls,[]);assert.equal(reads,0);
  }
});

test('selected face arity mismatch refuses before any scale expression',async()=>{
  const f=fixture();f.nodes['augmentation-source'].value='memory:1';
  const cube={id:'stored-cube',dimension:3,embeddingDimension:3,
    vertices:[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
    faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],cells:[],metadata:{}};
  const edges=new Map();for(const face of cube.faces)for(let j=0;j<4;j++){
    const pair=[face[j],face[(j+1)%4]].sort((a,b)=>a-b);edges.set(pair.join(','),pair);
  }
  cube.edges=[...edges.values()];f.memories.slots[0].state.model=cube;
  await assert.rejects(()=>f.controls.attach(),/equal arity/);assert.deepEqual(f.calls,[]);
});

test('history callback may replace the source after its native publication guard without a false post-commit refusal',async()=>{
  const f=fixture();f.controls.context.commit=async()=>{
    const state={model:tetra(),view:{}};f.doc.states.push(state);f.doc.cursor=1;f.setState(state);return f.result;
  };
  assert.equal(await f.controls.attach(),f.result);assert.equal(f.doc.cursor,1);assert.equal(f.controls.busy,false);
});

test('queued export after expression resolution is caught before history publication begins',async()=>{
  const f=fixture();let finish;
  f.controls.context.number=async()=>await new Promise(resolve=>finish=resolve);
  const pending=f.controls.attach();finish(1);queueMicrotask(()=>f.setExport(true));
  await assert.rejects(pending,/animation export/);assert.equal(committed(f),undefined);
});

test('memory accessors and arbitrary extra ownership attributes are bounded and fenced',async()=>{
  const invalid=fixture();let reads=0;invalid.nodes['augmentation-source'].value='memory:1';
  Object.defineProperty(invalid.memories.slots[0],'source',{enumerable:true,get(){reads++;return {};}});
  await assert.rejects(()=>invalid.controls.attach(),/accessor/);assert.equal(reads,0);assert.deepEqual(invalid.calls,[]);
  const f=fixture();f.nodes['augmentation-source'].value='memory:1';f.memories.slots[0].annotation={title:'original'};
  let finish;f.controls.context.number=()=>new Promise(resolve=>finish=resolve);
  const pending=f.controls.attach();f.memories.slots[0].annotation.title='edited';finish(1);
  await assert.rejects(pending,/memory changed/);assert.equal(committed(f),undefined);
});

test('constructor creates a closed compact disclosure, guarded action, and nine explicit source slots',async()=>{
  const f=fixture(),previous=globalThis.document;let inserted=null,html='';
  const panel={id:'',open:false,set innerHTML(value){html=value;},querySelector:selector=>f.nodes[selector.slice(1)],
    querySelectorAll:()=>Object.values(f.nodes)};
  globalThis.document={createElement:tag=>tag==='details'?panel:{value:'',textContent:'',disabled:false},
    getElementById:id=>id==='layer-join-settings'?{after(value){inserted=value;}}:null};
  try{
    const controls=new AugmentationControls(f.controls.context);
    assert.equal(inserted,panel);assert.equal(panel.id,'augmentation-settings');assert.equal(panel.open,false);
    assert.match(html,/<summary>Attach faces \(3D\)<\/summary>/);
    assert.equal(controls.memoryOptions.length,9);
    assert.deepEqual(controls.memoryOptions.map(o=>o.value),Array.from({length:9},(_,i)=>`memory:${i+1}`));
    assert.equal(typeof f.nodes['attach-faces'].onclick,'function');
    await f.nodes['attach-faces'].onclick();assert.equal(committed(f)[1],'attach-at-faces');
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
