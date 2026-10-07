import test from 'node:test';
import assert from 'node:assert/strict';
import {SourceZonohedronControls,SOURCE_ZONOHEDRON_OPERATION,SOURCE_ZONOHEDRON_VERSION} from '../ui/source-zonohedron-controls.mjs';
const cube=()=>({id:'literal-cube',dimension:3,embeddingDimension:3,interpretation:'generalized-complex',
  vertices:[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
  edges:[[0,1],[1,2],[2,3],[0,3],[4,5],[5,6],[6,7],[4,7],[0,4],[1,5],[2,6],[3,7]],
  faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],cells:[],
  metadata:{coordinateUnits:'mm',asset:{hash:'original'},offColors:{faces:[{encoding:'byte',values:[10,20,30,127]},
    {encoding:'unit',values:[.1,.2,.3,.25]},null,null,null,null],cells:[]}},numeric:{certified:false}});
function fixture(){
  const defaults={'zonohedron-feature':'edges','zonohedron-ids':'3, 1,0','zonohedron-x':'1/2',
    'zonohedron-y':'-sqrt(4)','zonohedron-z':'0','zonohedron-length':'2','zonohedron-max-zones':'32',
    'make-source-zonohedron':'','cancel-source-zonohedron':'','add-zonohedron-selection':'','clear-zonohedron-selections':'','zonohedron-selection-list':''};
  const nodes=Object.fromEntries(Object.entries(defaults).map(([id,value])=>[id,{value,disabled:false,hidden:false}]));
  const state={model:cube(),view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0],camera:{projection:'orthographic'}},notes:'Retain source notes'},
    doc={id:'source-document',states:[state],cursor:0};let project={active:0,documents:[doc],memories:{version:1,slots:Array(9).fill(null)}},exporting=false;
  const calls=[],result={id:'native-result'},context={getProject:()=>project,getDocument:()=>project.documents[project.active],
    getState:()=>context.getDocument()?.states[context.getDocument().cursor],isExporting:()=>exporting,guard:fn=>fn,
    number:async(text,options)=>{calls.push(['number',text,options]);return {'1/2':.5,'-sqrt(4)':-2}[text]??Number(text);},
    commit:async(...args)=>{calls.push(['commit',...args]);args[3].verifyPublication();return result;}};
  context.evaluateMany=async parts=>Promise.all(parts.map((text)=>context.number(text)));
  const panel={querySelector:s=>nodes[s.slice(1)],querySelectorAll:()=>Object.values(nodes),remove(){this.removed=true;}};
  const controls=Object.assign(Object.create(SourceZonohedronControls.prototype),{context,panel,active:null,busy:false,generation:0,destroyed:false});controls.sync();
  return {controls,context,nodes,state,doc,calls,result,get project(){return project;},setProject:p=>project=p,setExport:v=>exporting=v};
}
const committed=f=>f.calls.find(c=>c[0]==='commit');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function holdNumbers(f){const pending=Array.from({length:5},deferred);pending[4].resolve(32);let i=0;
  f.context.number=(text,options)=>{f.calls.push(['number',text,options]);return pending[i++].promise;};return pending;}

test('single literal selection commits exact params, full detached source snapshot and publication/abort contracts',async()=>{
  const f=fixture(),before=structuredClone(f.project);assert.equal(await f.controls.construct(),f.result);
  assert.equal(SOURCE_ZONOHEDRON_VERSION,'0.1.0');assert.equal(SOURCE_ZONOHEDRON_OPERATION,'source-zonohedron');
  assert.deepEqual(f.calls.slice(0,4).map(c=>c.slice(0,2)),[['number','1/2'],['number','-sqrt(4)'],['number','0'],['number','2']]);
  assert.deepEqual(committed(f).slice(0,4),['commit','source-zonohedron',{
    selections:[{kind:'edges',ids:[3,1,0]}],center:[.5,-2,0],edge_length:2,max_zones:32},'Source zonohedron']);
  const options=committed(f)[4];assert.equal(typeof options.verifyPublication,'function');assert.ok(options.signal instanceof AbortSignal);
  assert.deepEqual(options.sourceSnapshot,f.state.model);assert.notEqual(options.sourceSnapshot,f.state.model);
  options.sourceSnapshot.metadata.offColors.faces[0].values[3]=0;assert.deepEqual(f.project,before);
  assert.equal(f.controls.busy,false);assert.equal(f.nodes['cancel-source-zonohedron'].hidden,true);
});
test('vertices/edges/faces/world axes use explicit distinct ordered IDs, never infer all-of-type',async()=>{
  for(const kind of ['vertices','edges','faces','world-axes']){
    const f=fixture();f.nodes['zonohedron-feature'].value=kind;f.nodes['zonohedron-ids'].value='2, 0, 1';await f.controls.construct();
    assert.deepEqual(committed(f)[2].selections,[{kind,ids:[2,0,1]}]);assert.equal(committed(f)[2].selections.length,1);
  }
});
test('literal feature IDs refuse before expressions and evaluated maximum zones retain integer/range gates',async()=>{
  for(const text of ['', '1,1','1 2','1,,2','1,','-1','+1','1.0','1/2','sqrt(4)','1e2','12','x'.repeat(1025)]){
    const f=fixture();f.nodes['zonohedron-ids'].value=text;await assert.rejects(()=>f.controls.construct());assert.deepEqual(f.calls,[]);
  }
  for(const text of ['3','0,1,3']){const f=fixture();f.nodes['zonohedron-feature'].value='world-axes';f.nodes['zonohedron-ids'].value=text;
    await assert.rejects(()=>f.controls.construct(),/world-axis/);assert.deepEqual(f.calls,[]);}
  for(const kind of ['all-vertices','symmetry-type','add-zones','vertex','other']){const f=fixture();f.nodes['zonohedron-feature'].value=kind;
    await assert.rejects(()=>f.controls.construct());assert.deepEqual(f.calls,[]);}
  for(const value of ['', '0','33','100','-1','3.5','Infinity']){const f=fixture();f.nodes['zonohedron-max-zones'].value=value;
    await assert.rejects(()=>f.controls.construct());assert.equal(committed(f),undefined);}
  const f=fixture();f.nodes['zonohedron-ids'].value=' 003,001,0 ';f.nodes['zonohedron-max-zones'].value='01';await f.controls.construct();
  assert.deepEqual(committed(f)[2].selections[0].ids,[3,1,0]);assert.equal(committed(f)[2].max_zones,1);
});
test('center/length/maxZones captured before await; competing numeric edits refuse publication',async()=>{
  const f=fixture(),numbers=holdNumbers(f),running=f.controls.construct();
  f.nodes['zonohedron-x'].value='99';f.nodes['zonohedron-length'].value='999';f.nodes['zonohedron-max-zones'].value='1';
  numbers[3].resolve(2);numbers[1].resolve(-2);numbers[0].resolve(.5);await flush();assert.equal(committed(f),undefined);
  numbers[2].resolve(0);await assert.rejects(running,/target fields/);assert.equal(committed(f),undefined);
});

test('maximum zones accepts native expressions while literal source IDs keep their separate grammar',async()=>{
  const f=fixture(),number=f.context.number;f.nodes['zonohedron-max-zones'].value='32/2';
  f.context.number=async(text,options)=>text==='32/2'?16:number(text,options);
  await f.controls.construct();assert.equal(committed(f)[2].max_zones,16);
  assert.deepEqual(committed(f)[2].selections,[{kind:'edges',ids:[3,1,0]}]);
});

test('source/full RGBA/unit/notes/document/history/project changes after any expression resolution refuse atomically',async()=>{
  const changes=[f=>f.state.model.vertices[1][0]=2,f=>f.state.model.metadata.offColors.faces[0].values[3]=125,
    f=>f.state.model.metadata.asset.hash='changed',f=>f.state.model.numeric.certified=true,
    f=>f.state.model.metadata.coordinateUnits='cm',f=>f.state.view.coordinateUnit='cm',f=>f.state.notes='changed',
    f=>f.doc.id='new-document-id',f=>f.doc.states=[...f.doc.states],f=>f.doc.states[0]={...f.state},
    f=>{f.doc.states.push(structuredClone(f.state));f.doc.cursor=1;},f=>f.project.documents[0]={...f.doc},
    f=>f.setProject({...f.project}),f=>{f.project.documents.push(structuredClone(f.doc));f.project.active=1;}];
  for(let resolved=0;resolved<4;resolved++)for(const change of changes){
    const f=fixture(),numbers=holdNumbers(f),running=f.controls.construct();numbers[resolved].resolve(resolved===3?2:0);await flush();change(f);
    numbers.forEach((n,i)=>{if(i!==resolved)n.resolve(i===3?2:0);});
    await assert.rejects(running,/changed/);assert.equal(committed(f),undefined);assert.equal(f.controls.busy,false);
  }
});
test('explicit feature kind/order changes are fenced across expressions and native await',async()=>{
  for(const stage of ['expression','native'])for(const change of [f=>f.nodes['zonohedron-feature'].value='faces',
    f=>f.nodes['zonohedron-ids'].value='0,1,3']){
    const f=fixture(),pending=deferred();let published=false;
    if(stage==='expression')f.context.number=()=>pending.promise;
    else f.context.commit=async(op,params,label,options)=>{await pending.promise;options.verifyPublication();published=true;return f.result;};
    const running=f.controls.construct();await flush();change(f);pending.resolve(1);
    await assert.rejects(running,/selected source features changed/);assert.equal(published,false);assert.equal(f.controls.busy,false);
  }
});
test('equivalent ID whitespace/leading zeros do not change the semantic selection',async()=>{
  const f=fixture(),pending=deferred();f.context.number=()=>pending.promise;
  const running=f.controls.construct();f.nodes['zonohedron-ids'].value=' 003, 01, 0 ';pending.resolve(1);
  await running;assert.deepEqual(committed(f)[2].selections[0].ids,[3,1,0]);
});
test('camera/rotation/presentation and unrelated memory edits remain eligible while source geometry stays identical',async()=>{
  const f=fixture(),pending=deferred();f.context.number=()=>pending.promise;const running=f.controls.construct();
  f.state.view.angles[0]=173;f.state.view.camera={projection:'perspective',zoom:3};f.state.view.opacity=.7;
  f.project.memories={version:1,slots:Array(9).fill(null)};f.project.memories.slots[8]={literal:'unrelated'};
  pending.resolve(1);await running;assert.ok(committed(f));assert.equal(f.state.view.angles[0],173);assert.equal(f.state.view.opacity,.7);
});
test('source publication fence refuses source changes/export begun after native starts',async()=>{
  for(const change of [f=>f.state.model.metadata.offColors.faces[1].values[3]=.9,
    f=>f.state.notes='changed',f=>f.state.view.coordinateUnit='cm',f=>f.doc.id='changed',
    f=>f.doc.states=[...f.doc.states],f=>f.setProject({...f.project}),f=>f.setExport(true)]){
    const f=fixture(),pending=deferred();let published=false;
    f.context.commit=async(op,params,label,options)=>{await pending.promise;options.verifyPublication();published=true;return f.result;};
    const running=f.controls.construct();await flush();change(f);pending.resolve();
    await assert.rejects(running);assert.equal(published,false);assert.equal(f.controls.busy,false);
  }
});
test('numeric edge/center refusals and expression bounds are primitive, finite, signed and atomic',async()=>{
  for(const value of [NaN,Infinity,-Infinity,'1',true,undefined,1e101,2n]){
    const f=fixture();f.context.number=async()=>value;await assert.rejects(()=>f.controls.construct());assert.equal(committed(f),undefined);assert.equal(f.controls.busy,false);
  }
  for(const value of [0,-1,1e6+1]){const f=fixture();let i=0;f.context.number=async()=>i++===3?value:0;
    await assert.rejects(()=>f.controls.construct(),/edge_length/);assert.equal(committed(f),undefined);}
  const f=fixture();let i=0;f.context.number=async()=>[-1e100,0,1e100,1e6,32][i++];await f.controls.construct();
  assert.deepEqual(committed(f)[2].center,[-1e100,0,1e100]);assert.equal(committed(f)[2].edge_length,1e6);
  for(const id of ['x','y','z','length'])for(const value of ['',' ', 'a'.repeat(257)]){
    const f=fixture();f.nodes['zonohedron-'+id].value=value;await assert.rejects(()=>f.controls.construct(),/256/);assert.deepEqual(f.calls,[]);
  }
});
test('busy disables inputs and construction while cancel stays usable across expression/native waits',async()=>{
  const f=fixture(),numbers=deferred(),native=deferred();f.context.number=()=>numbers.promise;f.context.commit=()=>native.promise;
  const running=f.controls.construct();assert.equal(f.controls.busy,true);
  for(const [id,n] of Object.entries(f.nodes))assert.equal(n.disabled,id!=='cancel-source-zonohedron');
  assert.equal(f.nodes['cancel-source-zonohedron'].hidden,false);await assert.rejects(()=>f.controls.construct(),/current source zonohedron/);
  numbers.resolve(1);await flush();assert.equal(f.controls.busy,true);await assert.rejects(()=>f.controls.construct(),/current source zonohedron/);
  native.reject(Object.assign(Error('Native canceled'),{name:'AbortError'}));await assert.rejects(running,{name:'AbortError'});
  assert.equal(f.controls.busy,false);assert.equal(f.nodes['make-source-zonohedron'].disabled,false);
});
test('cancel rejects ignored-provider expression waits immediately; next request survives old completion',async()=>{
  const f=fixture(),old=holdNumbers(f),first=f.controls.construct();const firstFailure=assert.rejects(first,{name:'AbortError'});
  assert.equal(f.controls.cancel(),true);await firstFailure;assert.equal(f.controls.busy,false);
  const next=holdNumbers(f),second=f.controls.construct();old.forEach(n=>n.resolve(1));await flush();
  assert.equal(f.controls.busy,true);assert.equal(committed(f),undefined);next.forEach(n=>n.resolve(1));
  assert.equal(await second,f.result);assert.equal(f.controls.busy,false);assert.equal(f.controls.cancel(),false);
});
test('cancel fences late native publication and permits a distinct retry without old finally clearing the new job',async()=>{
  const f=fixture(),old=deferred();let attempts=0,published=0,oldOptions;
  f.context.commit=async(op,params,label,options)=>{if(!attempts++){oldOptions=options;await old.promise;}
    options.verifyPublication();published++;return f.result;};
  const first=f.controls.construct();await flush();const rejected=assert.rejects(first,{name:'AbortError'});
  f.controls.cancel();await rejected;assert.equal(oldOptions.signal.aborted,true);
  const second=f.controls.construct();assert.equal(await second,f.result);assert.equal(published,1);
  old.resolve();await flush();assert.equal(published,1);assert.equal(f.controls.busy,false);
});
test('native geometric/resource refusal consumes the error, leaves source untouched and allows retry',async()=>{
  const f=fixture(),before=structuredClone(f.project);let attempts=0;
  f.context.commit=async(op,params,label,options)=>{options.verifyPublication();if(!attempts++)throw Error('Selected source seeds have rank below3.');return f.result;};
  await assert.rejects(()=>f.controls.construct(),/rank below3/);assert.deepEqual(f.project,before);assert.equal(f.controls.busy,false);
  assert.equal(await f.controls.construct(),f.result);
});
test('export denies initial calls and publication; restored control eligibility uses the latest source',async()=>{
  const f=fixture();f.setExport(true);f.controls.sync();assert.equal(f.nodes['make-source-zonohedron'].disabled,true);
  await assert.rejects(()=>f.controls.construct(),/export/);assert.deepEqual(f.calls,[]);
  f.setExport(false);f.controls.sync();assert.equal(f.nodes['make-source-zonohedron'].disabled,false);
  const g=fixture(),pending=deferred();g.context.number=()=>pending.promise;const running=g.controls.construct();
  g.setExport(true);pending.resolve(1);await assert.rejects(running,/export/);assert.equal(committed(g),undefined);
  assert.equal(g.nodes['make-source-zonohedron'].disabled,true);g.setExport(false);g.state.model.embeddingDimension=4;g.controls.sync();
  assert.equal(g.nodes['make-source-zonohedron'].disabled,true);
});
test('source eligibility and malformed source attributes refuse without Hull/type invention or expressions',async()=>{
  for(const change of [m=>m.dimension=4,m=>m.embeddingDimension=4,m=>m.vertices=m.vertices.slice(0,3),
    m=>m.faces=[],m=>m.cells=[[0]],m=>m.id='',m=>m.vertices[0][0]=1e101,
    m=>m.metadata.coordinateUnits='yards',m=>m.faces[0]=Array.from({length:65},(_,i)=>i%8)]){
    const f=fixture();change(f.state.model);await assert.rejects(()=>f.controls.construct());assert.deepEqual(f.calls,[]);
  }
  const f=fixture();f.state.model.interpretation='generalized-complex';await f.controls.construct();
  assert.equal(committed(f)[4].sourceSnapshot.interpretation,'generalized-complex');
  const getter=fixture();let invoked=0;Object.defineProperty(getter.state.model.metadata,'bad',{enumerable:true,get(){invoked++;return 1;}});
  await assert.rejects(()=>getter.controls.construct(),/accessor/);assert.equal(invoked,0);assert.deepEqual(getter.calls,[]);
});
test('display and metadata units remain independently bound without implicit conversion or color reassignment',async()=>{
  const f=fixture();f.state.view.coordinateUnit='cm';await f.controls.construct();assert.equal(committed(f)[2].edge_length,2);
  assert.equal(committed(f)[4].sourceSnapshot.metadata.coordinateUnits,'mm');assert.equal(f.state.view.coordinateUnit,'cm');
  assert.deepEqual(committed(f)[4].sourceSnapshot.metadata.offColors,f.state.model.metadata.offColors);
});
test('constructor mounts one compact closed disclosure with explicit axes default and guarded buttons',async()=>{
  const old=globalThis.document;
  try{
    const f=fixture();let html,mounted,guardCalls=0;
    const panel={...f.controls.panel,id:'',open:false,set innerHTML(value){html=value;}};
    globalThis.document={createElement:tag=>{assert.equal(tag,'details');return panel;},getElementById:()=>{throw Error('Explicit mount must not search shared DOM.');}};
    f.context.mount=p=>mounted=p;f.context.guard=fn=>{guardCalls++;return fn;};
    const control=new SourceZonohedronControls(f.context);assert.equal(mounted,panel);assert.equal(panel.id,'source-zonohedron-settings');
    assert.equal(panel.open,false);assert.match(html,/value="world-axes"/);assert.match(html,/value="0,1,2"/);assert.equal(guardCalls,3);
    await f.nodes['make-source-zonohedron'].onclick();assert.equal(control.busy,false);assert.ok(committed(f));
  }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});
test('destroy cancels pending work, removes own panel and refuses future construction',async()=>{
  const f=fixture(),pending=deferred();f.context.number=()=>pending.promise;const running=f.controls.construct();
  const rejected=assert.rejects(running,{name:'AbortError'});f.controls.destroy();await rejected;
  assert.equal(f.controls.destroyed,true);assert.equal(f.controls.panel.removed,true);assert.equal(f.controls.busy,false);
  pending.reject(Error('Ignored late provider rejection'));await flush();await assert.rejects(()=>f.controls.construct(),{name:'AbortError'});
  f.controls.destroy();
});

test('mixed feature groups preserve insertion and literal ID order in the native request',async()=>{
  const f=fixture();f.controls.addSelection();
  f.nodes['zonohedron-feature'].value='faces';f.nodes['zonohedron-ids'].value='5,0';f.controls.addSelection();
  f.nodes['zonohedron-feature'].value='world-axes';f.nodes['zonohedron-ids'].value='2,0,1';f.controls.addSelection();
  f.nodes['zonohedron-ids'].value='0';await f.controls.construct();
  assert.deepEqual(committed(f)[2].selections,[{kind:'edges',ids:[3,1,0]},{kind:'faces',ids:[5,0]},{kind:'world-axes',ids:[2,0,1]}]);
  assert.match(f.nodes['zonohedron-selection-list'].textContent,/1\. edges: 3, 1, 0\n2\. faces: 5, 0\n3\. world-axes: 2, 0, 1/);
});

test('clear returns to current editor and a different source clears staged literal IDs',async()=>{
  const f=fixture();f.controls.addSelection();f.controls.clearSelections();
  f.nodes['zonohedron-ids'].value='0,1,2';await f.controls.construct();
  assert.deepEqual(committed(f)[2].selections,[{kind:'edges',ids:[0,1,2]}]);
  f.controls.addSelection();f.state.model=structuredClone(f.state.model);f.controls.sync();
  assert.deepEqual(f.controls.groups,[]);assert.equal(f.nodes['zonohedron-selection-list'].textContent,'');
});

test('total IDs and group bounds reject an extra selection atomically',()=>{
  const f=fixture();f.nodes['zonohedron-ids'].value=Array.from({length:12},(_,i)=>i).join(',');
  for(let i=0;i<5;i++)f.controls.addSelection();
  const before=structuredClone(f.controls.groups);assert.throws(()=>f.controls.addSelection(),/64 source IDs/);
  assert.deepEqual(f.controls.groups,before);
  f.controls.clearSelections();f.nodes['zonohedron-ids'].value='0';
  for(let i=0;i<16;i++)f.controls.addSelection();
  assert.throws(()=>f.controls.addSelection(),/16 ordered/);assert.equal(f.controls.groups.length,16);
});

test('staged group mutations during expression and native waits reject publication',async()=>{
  for(const phase of ['expression','native']){
    const f=fixture(),pending=deferred();f.controls.addSelection();let published=false;
    if(phase==='expression')f.context.number=()=>pending.promise;
    else f.context.commit=async(op,params,label,options)=>{await pending.promise;options.verifyPublication();published=true;return f.result;};
    const running=f.controls.construct();await flush();f.controls.groups[0].ids.reverse();pending.resolve(1);
    await assert.rejects(running,/selected source features changed/);assert.equal(published,false);
  }
});

test('group editing refuses during active construction and export',async()=>{
  const f=fixture(),pending=deferred();f.context.number=()=>pending.promise;
  const running=f.controls.construct();assert.throws(()=>f.controls.addSelection(),/Finish/);assert.throws(()=>f.controls.clearSelections(),/Finish/);
  const rejected=assert.rejects(running,{name:'AbortError'});f.controls.cancel();await rejected;pending.resolve(1);
  f.setExport(true);assert.throws(()=>f.controls.addSelection(),/Finish/);assert.throws(()=>f.controls.clearSelections(),/Finish/);
});
