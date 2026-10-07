import test from 'node:test';
import assert from 'node:assert/strict';
import {SegmentotopeControls} from '../ui/segmentotope-controls.mjs';

const tetra=()=>({id:'tetra-source',name:'Tetrahedron',dimension:3,embeddingDimension:3,
  interpretation:'generalized-complex',vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],
  edges:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],faces:[[0,2,1],[0,1,3],[1,2,3],[0,3,2]],cells:[],
  metadata:{offColors:{faces:[{encoding:'unit',values:[.2,.4,.6,.8]},null,null,null],cells:[]},attributes:['original']}});
const square=()=>({id:'square-top',name:'Square',dimension:2,embeddingDimension:2,
  vertices:[[-1,-1],[1,-1],[1,1],[-1,1]],edges:[[0,1],[1,2],[2,3],[0,3]],faces:[[0,1,2,3]],cells:[],metadata:{literal:['top']}});

function fixture(){
  const defaults={'layer-join-top':'current','layer-join-height':'-sqrt(4)',
    'layer-join-x':'0','layer-join-y':'1/2','layer-join-z':'0',
    'layer-join-end-x':'1','layer-join-end-y':'0','layer-join-end-z':'0',
    'layer-join-tx':'2','layer-join-ty':'-1','layer-join-tz':'0',
    'layer-join-matrix':'1 0 0\n0 1 0\n0 0 1','layer-join-transform':'','layer-join-fit':'',
    'layer-join-point-row':'','layer-join-edge-row':'','layer-join-point-label':'','make-layer-join':''};
  const nodes=Object.fromEntries(Object.entries(defaults).map(([id,value])=>[id,{value,disabled:false,checked:false,hidden:false,textContent:'',options:[],append(option){this.options.push(option);}}]));
  const rows=new Set(['layer-join-point-row','layer-join-edge-row','layer-join-point-label']);
  const interactive=Object.entries(nodes).filter(([id])=>!rows.has(id)).map(([,node])=>node);
  let state={model:tetra(),view:{},notes:'Literal source notes'},exporting=false;
  const document={id:'layer-source-document',states:[state],cursor:0};let project={id:'project',active:0,documents:[document]};
  let memories={version:1,slots:Array(9).fill(null)};
  memories.slots[0]={state:{model:tetra(),view:{}},source:{documentId:'memory-origin'}};
  memories.slots[1]={state:{model:square(),view:{}},source:{documentId:'square-origin'}};
  const calls=[],result={id:'joined'};
  const controls=Object.create(SegmentotopeControls.prototype);
  Object.assign(controls,{busy:false,memoryOptions:Array.from({length:9},()=>({disabled:false,textContent:''})),
    panel:{querySelector:selector=>nodes[selector.slice(1)],querySelectorAll:()=>interactive},
    context:{getState:()=>state,getDocument:()=>document,getProject:()=>project,getMemories:()=>memories,isExporting:()=>exporting,
      guard:fn=>fn,number:async text=>{calls.push(['number',text]);return text==='-sqrt(4)'?-2:text==='1/2'?.5:text==='sqrt(1)'?1:Number(text);},
      commit:async(...args)=>{calls.push(['commit',...args]);args[3].verifyPublication();return result;}}});
  controls.sync();
  return {controls,nodes,calls,result,interactive,get state(){return state;},get project(){return project;},get memories(){return memories;},
    setState:value=>{state=value;document.states=[state];},setProject:value=>project=value,setMemories:value=>memories=value,setExport:value=>exporting=value};
}

const commit=f=>f.calls.find(call=>call[0]==='commit');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('current copy preserves every source attribute and passes signed height through only the planned operation',async()=>{
  const f=fixture(),original=structuredClone(f.state.model);
  assert.equal(await f.controls.join(),f.result);
  assert.deepEqual(f.calls[0],['number','-sqrt(4)']);
  assert.deepEqual(commit(f).slice(0,4),['commit','convex-layer-join',{top:original,height:-2},'Parallel layer join (4D)']);
  assert.ok(commit(f)[4].signal instanceof AbortSignal);assert.equal(typeof commit(f)[4].verifyPublication,'function');
  assert.deepEqual(commit(f)[4].sourceSnapshot,original);assert.deepEqual(commit(f)[4].expressionInputs,{height:'-sqrt(4)'});
  assert.notEqual(commit(f)[2].top,f.state.model);
  commit(f)[2].top.metadata.attributes.push('changed');assert.deepEqual(f.state.model,original);
  assert.equal(f.controls.busy,false);
});

test('numbered memory supplies exact original 2D/3D model and stable names without replacing any memory',async()=>{
  for(const slot of [1,2]){
    const f=fixture();f.nodes['layer-join-top'].value=`memory:${slot}`;f.controls.sync();
    const before=structuredClone(f.memories);await f.controls.join();
    assert.deepEqual(commit(f)[2].top,before.slots[slot-1].state.model);
    assert.notEqual(commit(f)[2].top,f.memories.slots[slot-1].state.model);
    assert.deepEqual(f.memories,before);assert.match(f.controls.memoryOptions[slot-1].textContent,new RegExp(`Memory ${slot}`));
    assert.equal(f.nodes['layer-join-top'].value,`memory:${slot}`);
  }
});

test('point/edge typed specifications keep a single stable source UUID and literal XYZ expressions',async()=>{
  for(const mode of ['point','edge']){
    const f=fixture();f.nodes['layer-join-top'].value=mode;f.controls.sync();
    assert.equal(f.nodes['layer-join-point-row'].hidden,false);
    assert.equal(f.nodes['layer-join-edge-row'].hidden,mode!=='edge');
    await f.controls.join();const top=commit(f)[2].top;
    assert.equal(top.kind,mode);assert.match(top.source_id,/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    assert.deepEqual(mode==='point'?top.coordinates:top.start,[0,.5,0]);
    if(mode==='edge')assert.deepEqual(top.end,[1,0,0]);
    const previous=top.source_id;f.calls.length=0;await f.controls.join();assert.notEqual(commit(f)[2].top.source_id,previous);
  }
});

test('explicit rigid rotation/reflection matrices and translations retain their original XYZ meaning',async()=>{
  for(const [text,m] of [['0 -1 0\n1 0 0\n0 0 1',[[0,-1,0],[1,0,0],[0,0,1]]],
    ['-1,0,0,0,1,0,0,0,1',[[-1,0,0],[0,1,0],[0,0,1]]]]){
    const f=fixture();f.nodes['layer-join-transform'].checked=true;f.nodes['layer-join-matrix'].value=text;
    await f.controls.join();assert.deepEqual(commit(f)[2].top_matrix,m);assert.deepEqual(commit(f)[2].top_translation,[2,-1,0]);
    assert.ok(f.calls.every(call=>call[0]!=='number'||call[1]!==text));
  }
});

test('transform defaults are omitted and inactive coordinates do not trigger numeric jobs',async()=>{
  const f=fixture();f.nodes['layer-join-matrix'].value='not a matrix';f.nodes['layer-join-x'].value='bad';
  await f.controls.join();assert.deepEqual(f.calls.filter(call=>call[0]==='number'),[['number','-sqrt(4)']]);
  assert.deepEqual(Object.keys(commit(f)[2]),['top','height']);
});

test('invalid matrix syntax, scaling, shear and nonfinite entries refuse without native commit',async()=>{
  for(const value of ['', '1 0 0','sqrt(1) 0 0 0 1 0 0 0 1','2 0 0 0 1 0 0 0 1','1 1 0 0 1 0 0 0 1','NaN 0 0 0 1 0 0 0 1','1e300 0 0 0 1 0 0 0 1']){
    const f=fixture();f.nodes['layer-join-transform'].checked=true;f.nodes['layer-join-matrix'].value=value;
    await assert.rejects(()=>f.controls.join());assert.equal(commit(f),undefined);assert.equal(f.controls.busy,false);
  }
});

test('invalid/empty memory slots, malformed bank and unsupported top dimensions refuse before numbers',async()=>{
  for(const value of ['memory:0','memory:10','memory:3','memory:01','arbitrary']){
    const f=fixture();f.nodes['layer-join-top'].value=value;
    await assert.rejects(()=>f.controls.join());assert.deepEqual(f.calls,[]);
  }
  const malformed=fixture();malformed.nodes['layer-join-top'].value='memory:1';malformed.setMemories({version:2,slots:[]});
  await assert.rejects(()=>malformed.controls.join(),/nine numbered slots/);assert.deepEqual(malformed.calls,[]);
  for(const [dimension,embedding] of [[4,4],[3,4],[2,4],[1,3]]){
    const f=fixture();f.nodes['layer-join-top'].value='memory:1';f.memories.slots[0].state.model.dimension=dimension;f.memories.slots[0].state.model.embeddingDimension=embedding;
    await assert.rejects(()=>f.controls.join(),/top memory/);assert.deepEqual(f.calls,[]);
  }
});

test('nonclosed or invalid 3D bases refuse and leave native convexity to the engine for otherwise closed sources',async()=>{
  for(const change of [model=>model.faces.pop(),model=>model.cells.push([0]),model=>model.edges.pop(),
    model=>model.faces[0].push(0),model=>model.dimension=2,model=>model.embeddingDimension=4,
    model=>model.vertices.push([0,0,2]),model=>model.vertices[0][0]=NaN]){
    const f=fixture();change(f.state.model);f.controls.sync();assert.equal(f.nodes['make-layer-join'].disabled,true);
    await assert.rejects(()=>f.controls.join());assert.deepEqual(f.calls,[]);
  }
  const f=fixture();f.controls.context.commit=async()=>{throw Error('Ordered convex source boundary is not verified.');};
  await assert.rejects(()=>f.controls.join(),/convex source boundary/);assert.equal(f.controls.busy,false);
});

test('combined input limit is checked with the actual selected top and before copying dense sources',async()=>{
  const f=fixture();f.state.model.vertices=Array.from({length:65},()=>[0,0,0]);
  await assert.rejects(()=>f.controls.join(),/64 selected vertices/);assert.deepEqual(f.calls,[]);
  const ring=60,model={id:'bipyramid',dimension:3,embeddingDimension:3,vertices:[[0,0,1],[0,0,-1],...Array.from({length:ring},(_,i)=>[Math.cos(2*Math.PI*i/ring),Math.sin(2*Math.PI*i/ring),0])],faces:[],edges:[],cells:[]};
  for(let i=0;i<ring;i++){const a=i+2,b=(i+1)%ring+2;model.faces.push([0,a,b],[1,b,a]);model.edges.push([0,a],[1,a],[a,b]);}
  const copy=fixture();copy.state.model=model;await assert.rejects(()=>copy.controls.join(),/64 selected vertices/);assert.deepEqual(copy.calls,[]);
  for(const top of ['point','edge']){
    const allowed=fixture();allowed.state.model=structuredClone(model);allowed.nodes['layer-join-top'].value=top;await allowed.controls.join();assert.ok(commit(allowed));
  }
});

test('nonfinite/boolean/string/zero numeric height or coordinates refuse without commit',async()=>{
  for(const value of [NaN,Infinity,-Infinity,1e101,true,'1',null,undefined,0]){
    const f=fixture();f.controls.context.number=async()=>value;
    await assert.rejects(()=>f.controls.join());assert.equal(commit(f),undefined);assert.equal(f.controls.busy,false);
  }
  for(const value of [NaN,Infinity,true,'1',1e101]){
    const f=fixture();f.nodes['layer-join-top'].value='point';let calls=0;
    f.controls.context.number=async()=>calls++?value:1;
    await assert.rejects(()=>f.controls.join());assert.equal(commit(f),undefined);
  }
});

test('negative and positive finite nonzero height endpoints are forwarded without absolute-value conversion',async()=>{
  for(const value of [-1e100,-1,1,1e100]){
    const f=fixture();f.controls.context.number=async()=>value;await f.controls.join();assert.equal(commit(f)[2].height,value);
  }
});

test('blank selected numeric fields refuse before evaluation; coincident edge endpoints refuse after bounded evaluations',async()=>{
  for(const id of ['layer-join-height','layer-join-x','layer-join-end-x','layer-join-tx']){
    const f=fixture();f.nodes['layer-join-top'].value='edge';f.nodes['layer-join-transform'].checked=true;f.nodes[id].value='  ';
    await assert.rejects(()=>f.controls.join(),/every selected XYZ/);assert.deepEqual(f.calls,[]);
  }
  const f=fixture();f.nodes['layer-join-top'].value='edge';
  for(const axis of ['x','y','z'])f.nodes['layer-join-end-'+axis].value=f.nodes['layer-join-'+axis].value;
  await assert.rejects(()=>f.controls.join(),/endpoints must be distinct/);assert.equal(commit(f),undefined);
});

test('export existing before click or beginning during a numeric await fences every commit',async()=>{
  const existing=fixture();existing.setExport(true);existing.controls.sync();assert.ok(existing.interactive.every(n=>n.disabled));
  await assert.rejects(()=>existing.controls.join(),/animation export/);assert.deepEqual(existing.calls,[]);
  const f=fixture();let finish;f.controls.context.number=()=>new Promise(resolve=>finish=resolve);
  const pending=f.controls.join();f.setExport(true);finish(1);await assert.rejects(pending,/export/);
  assert.equal(commit(f),undefined);assert.equal(f.controls.busy,false);assert.ok(f.interactive.every(n=>n.disabled));
});

test('export/source/history/workspace changes in any coordinate await prevent publication',async()=>{
  for(const change of [f=>f.setExport(true),f=>f.setProject({id:'other'}),f=>f.setState({model:f.state.model,view:{}}),
    f=>f.state.model=structuredClone(f.state.model),f=>f.state.model.metadata.attributes.push('edited'),f=>f.state.model.vertices[1][0]=2]){
    for(const position of [0,1,3]){
      const f=fixture();f.nodes['layer-join-top'].value='point';let count=0,finish;
      f.controls.context.number=async()=>count++===position?await new Promise(resolve=>finish=resolve):1;
      const pending=f.controls.join();await flush();change(f);finish(1);await assert.rejects(pending);
      assert.equal(commit(f),undefined);assert.equal(f.controls.busy,false);
    }
  }
});

test('selected memory replacement, geometry/color/metadata edits are fenced but unrelated slot changes are permitted',async()=>{
  for(const change of [f=>f.memories.slots[0]=structuredClone(f.memories.slots[0]),f=>f.memories.slots[0]=null,
    f=>f.memories.slots[0].state.model.metadata.attributes.push('changed'),f=>f.memories.slots[0].state.model.metadata.offColors.faces[0].values[3]=.5,
    f=>f.memories.slots[0].state.model.vertices[1][0]=2]){
    const f=fixture();f.nodes['layer-join-top'].value='memory:1';let finish;f.controls.context.number=()=>new Promise(resolve=>finish=resolve);
    const pending=f.controls.join();change(f);finish(1);await assert.rejects(pending);assert.equal(commit(f),undefined);
  }
  const f=fixture();f.nodes['layer-join-top'].value='memory:1';let finish;f.controls.context.number=()=>new Promise(resolve=>finish=resolve);
  const pending=f.controls.join();f.setMemories({...f.memories,slots:f.memories.slots.map((entry,i)=>i===8?{state:{model:square(),view:{}},source:{}}:entry)});
  finish(1);await pending;assert.ok(commit(f));
});

test('final synchronous guard catches queued export before commit after the last expression',async()=>{
  const f=fixture();let finish;f.controls.context.number=async()=>await new Promise(resolve=>finish=resolve);
  const pending=f.controls.join();finish(1);queueMicrotask(()=>f.setExport(true));
  await assert.rejects(pending,/export/);assert.equal(commit(f),undefined);
});

test('busy locks through number and native awaits; refusal/cancellation releases it for explicit retry',async()=>{
  const f=fixture();let finishNumber,finishNative;
  f.controls.context.number=()=>new Promise(resolve=>finishNumber=resolve);
  f.controls.context.commit=(...args)=>{f.calls.push(['commit',...args]);return new Promise(resolve=>finishNative=resolve);};
  const pending=f.controls.join();await assert.rejects(()=>f.controls.join(),/current layer join/);
  finishNumber(1);await flush();assert.equal(f.controls.busy,true);await assert.rejects(()=>f.controls.join(),/current layer join/);
  finishNative(f.result);assert.equal(await pending,f.result);assert.equal(f.controls.busy,false);
  for(const message of ['Native convex source refusal.','Job cancelled.']){
    const retry=fixture();let count=0;retry.controls.context.commit=async()=>{if(!count++)throw Error(message);return retry.result;};
    await assert.rejects(()=>retry.controls.join(),error=>error.message===message);assert.equal(retry.controls.busy,false);
    assert.equal(await retry.controls.join(),retry.result);
  }
});

test('expression cancellation restores controls and never invokes commit',async()=>{
  const f=fixture();f.controls.context.number=async()=>{throw Object.assign(Error('Cancelled expression'),{name:'AbortError'});};
  await assert.rejects(()=>f.controls.join(),{name:'AbortError'});assert.equal(commit(f),undefined);assert.equal(f.controls.busy,false);
});

test('changed disabled form inputs invalidate the captured join rather than silently publishing old values',async()=>{
  const f=fixture();f.nodes['layer-join-top'].value='point';let finish,calls=0;
  f.controls.context.number=async text=>calls++?(text==='1/2'?.5:Number(text)):await new Promise(resolve=>finish=resolve);
  const pending=f.controls.join();f.nodes['layer-join-top'].value='edge';f.nodes['layer-join-x'].value='100';f.nodes['layer-join-height'].value='9';
  finish(-2);await assert.rejects(pending,/target fields changed/);assert.equal(commit(f),undefined);assert.equal(f.controls.busy,false);
});

test('bounded snapshot clone refuses cycles, accessors and deep attributes without numeric/native work',async()=>{
  const cycle=fixture();cycle.state.model.metadata.cycle=cycle.state.model;
  await assert.rejects(()=>cycle.controls.join(),/circular/);assert.deepEqual(cycle.calls,[]);
  const getter=fixture();let read=false;Object.defineProperty(getter.state.model.metadata,'unsafe',{enumerable:true,get(){read=true;return 'unsafe';}});
  await assert.rejects(()=>getter.controls.join(),/accessors/);assert.equal(read,false);assert.deepEqual(getter.calls,[]);
  const deep=fixture();let node=deep.state.model.metadata;for(let i=0;i<70;i++){node.next={};node=node.next;}
  await assert.rejects(()=>deep.controls.join(),/nesting limit/);assert.deepEqual(deep.calls,[]);
});

test('constructor uses a single guarded disclosure and escaped stable memory option names',async()=>{
  const previous=globalThis.document;
  try{
    for(const anchor of ['podia-settings','torus-settings','step-prism-settings','antiprism-settings','product-settings','star-polygon-settings','cupola-settings','subdivision-settings']){
      const f=fixture(),inserted=[],panel={...f.controls.panel,id:'',innerHTML:''};f.memories.slots[0].state.model.name='<img src=x onerror=alert(1)>';
      let guarded=0;globalThis.document={createElement:tag=>tag==='details'?panel:{value:'',textContent:'',disabled:false},
        getElementById:id=>id===anchor?{after:node=>inserted.push(node)}:null};
      const control=new SegmentotopeControls({...f.controls.context,guard:fn=>{guarded++;return fn;}});
      assert.equal(control.panel.id,'layer-join-settings');assert.deepEqual(inserted,[panel]);assert.equal(guarded,1);
      assert.match(panel.innerHTML,/Parallel layer join \(4D\)/);assert.equal(control.memoryOptions.length,9);
      assert.equal(control.memoryOptions[0].value,'memory:1');assert.match(control.memoryOptions[0].textContent,/<img/);
      assert.equal(control.memoryOptions[2].disabled,true);assert.equal(typeof f.nodes['make-layer-join'].onclick,'function');
      await f.nodes['make-layer-join'].onclick();assert.ok(commit(f));
    }
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('missing anchor fails explicitly without native calls or hidden mounting',()=>{
  const previous=globalThis.document;
  try{
    const f=fixture();globalThis.document={createElement:()=>({...f.controls.panel}),getElementById:()=>null};
    assert.throws(()=>new SegmentotopeControls(f.controls.context),/construction controls anchor/);assert.deepEqual(f.calls,[]);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('strict height fit ignores the manual height and invokes its native operation',async()=>{
  const f=fixture();f.nodes['layer-join-fit'].checked=true;f.nodes['layer-join-height'].value='not evaluated';
  f.controls.sync();assert.equal(f.nodes['layer-join-height'].disabled,true);
  await f.controls.join();const call=commit(f);
  assert.equal(call[1],'fit-strict-layer-join');assert.equal('height' in call[2],false);
  assert.deepEqual(call[2].top,f.state.model);
});
test('strict point height fitting still resolves coordinates and retains source identity',async()=>{
  const f=fixture();f.nodes['layer-join-fit'].checked=true;f.nodes['layer-join-top'].value='point';
  await f.controls.join();const call=commit(f);
  assert.equal(call[1],'fit-strict-layer-join');assert.deepEqual(call[2].top.coordinates,[0,.5,0]);
  assert.match(call[2].top.source_id,/^[0-9a-f-]{36}$/);assert.equal('height' in call[2],false);
});

test('construction field synchronization preserves independent analysis eligibility',()=>{
  const f=fixture(),analysis={disabled:true,hasAttribute:name=>name==='data-independent-control'};
  f.interactive.push(analysis);f.controls.sync();assert.equal(analysis.disabled,true);
  f.setExport(true);f.controls.sync();assert.equal(analysis.disabled,true);
});
