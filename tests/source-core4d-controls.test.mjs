import test from 'node:test';
import assert from 'node:assert/strict';
import {SourceConstructionControls} from '../ui/source-construction-controls.mjs';

const combinations=(ids,size)=>size===0?[[]]:ids.flatMap((id,i)=>combinations(ids.slice(i+1),size-1).map(t=>[id,...t]));
function simplex(dimension){
  const vertices=[Array(dimension).fill(0),...Array.from({length:dimension},(_,i)=>Array.from({length:dimension},(_,j)=>Number(i===j)))];
  const ids=vertices.map((_,i)=>i),faces=combinations(ids,3);
  return {id:`simplex-${dimension}`,dimension,embeddingDimension:dimension,vertices,
    edges:combinations(ids,2),faces,cells:dimension===4?combinations(ids,4).map(cell=>faces.map((f,i)=>f.every(v=>cell.includes(v))?i:-1).filter(i=>i>=0)):[],
    metadata:{coordinateUnits:'mm',offColors:{faces:faces.map(()=>null),cells:dimension===4?Array.from({length:5},()=>({encoding:'byte',values:[20,30,40,100]})):[]}}};
}
function fixture(dimension=4){
  const state={model:simplex(dimension),view:{coordinateUnit:'mm',angles:Array(6).fill(0)},notes:'retained'},
    doc={id:'source-document',states:[state],cursor:0};
  let project={documents:[doc],active:0},exporting=false;
  const nodes=Object.fromEntries(['core-x','core-y','core-z','core-w','core-color-policy','make-convex-core'].map(id=>[id,{value:id==='core-color-policy'?'require-equal':'.2',disabled:false}]));
  const row={hidden:true},calls=[];
  const context={getState:()=>context.getDocument()?.states[context.getDocument().cursor],getDocument:()=>project.documents[project.active],getProject:()=>project,isExporting:()=>exporting,
    number:async text=>{calls.push(['number',text]);return Number(text);},
    commit:async(op,params,label,{verifyPublication})=>{verifyPublication();calls.push(['commit',op,params,label]);return {published:true};}};
  context.evaluateMany=async(expressions,{mode,signal})=>{
    calls.push(['batch',[...expressions],mode,signal]);return Promise.all(expressions.map(text=>context.number(text)));
  };
  const panel={querySelector:selector=>selector==='button'?nodes['make-convex-core']:selector==='#core-w-row'?row:nodes[selector.slice(1)],
    querySelectorAll:()=>Object.values(nodes)};
  const controls=Object.assign(Object.create(SourceConstructionControls.prototype),{context,panel,kind:'core',busy:false});
  controls.sync();return {state,doc,get project(){return project;},nodes,row,calls,context,controls,
    setProject:value=>project=value,setExport:value=>exporting=value};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('intrinsic4D cell source exposes W and publishes exactly four center coordinates to4D operation',async()=>{
  const f=fixture(),before=structuredClone(f.project);f.nodes['core-w'].value='-.1';
  assert.equal(f.row.hidden,false);assert.equal(f.nodes['make-convex-core'].disabled,false);
  assert.deepEqual(await f.controls.construct(),{published:true});
  assert.deepEqual(f.calls.filter(c=>c[0]==='commit'),[['commit','convex-core-4d',{center:[.2,.2,.2,-.1],color_policy:'require-equal'},'Convex core']]);
  assert.deepEqual(f.calls.filter(c=>c[0]==='batch').map(c=>c.slice(1,3)),[[['.2','.2','.2','-.1'],'real']]);
  assert.deepEqual(f.project,before);
});

test('3D construction hides W and never evaluates an irrelevant invalid fourth expression',async()=>{
  const f=fixture(3);f.nodes['core-w'].value='not an expression';assert.equal(f.row.hidden,true);
  await f.controls.construct();assert.equal(f.calls.filter(c=>c[0]==='number').length,3);
  assert.deepEqual(f.calls.filter(c=>c[0]==='batch').map(c=>c[1]),[['.2','.2','.2']]);
  assert.equal(f.calls.at(-1)[1],'convex-core');assert.deepEqual(f.calls.at(-1)[2].center,[.2,.2,.2]);
  f.state.model=simplex(4);f.controls.sync();assert.equal(f.row.hidden,false);
});

test('one batch owns all four expressions; source cell colors changed before its completion refuse publication',async()=>{
  const f=fixture(),batch=deferred();let input,options,count=0;
  f.context.evaluateMany=(expressions,opts)=>{input=expressions;options=opts;count++;return batch.promise;};
  const running=f.controls.construct();
  assert.deepEqual(input,['.2','.2','.2','.2']);assert.equal(Object.isFrozen(input),true);assert.equal(count,1);
  assert.equal(options.mode,'real');assert.ok(options.signal instanceof AbortSignal);
  assert.ok(Object.values(f.nodes).every(n=>n.disabled));await tick();assert.ok(!f.calls.some(c=>c[0]==='commit'));
  f.state.model.metadata.offColors.cells[0].values[3]=0;batch.resolve([.2,.2,.2,.2]);
  await assert.rejects(running,/changed/);assert.ok(!f.calls.some(c=>c[0]==='commit'));
  assert.equal(f.controls.busy,false);assert.ok(Object.values(f.nodes).every(n=>!n.disabled));
});

test('fourth expression cancellation releases controls without invoking native construction',async()=>{
  const f=fixture(),last=deferred();let next=0;f.context.number=()=>++next===4?last.promise:Promise.resolve(.2);
  const running=f.controls.construct();last.reject(Object.assign(Error('Cancelled'),{name:'AbortError'}));
  await assert.rejects(running,{name:'AbortError'});assert.equal(f.controls.busy,false);
  assert.ok(!f.calls.some(c=>c[0]==='commit'));assert.equal(f.nodes['make-convex-core'].disabled,false);
});

test('fourth numeric coordinate is finite primitive and source-bounded; malformed expression is rejected before evaluation',async()=>{
  for(const value of [NaN,Infinity,-Infinity,'1',true,undefined,1e101]){
    const f=fixture();let next=0;f.context.number=async()=>++next===4?value:.2;
    await assert.rejects(()=>f.controls.construct(),/finite.*bounded/);assert.equal(f.controls.busy,false);
    assert.ok(!f.calls.some(c=>c[0]==='commit'));
  }
  for(const text of ['', 'a'.repeat(257)]){const f=fixture();f.nodes['core-w'].value=text;
    await assert.rejects(()=>f.controls.construct(),/finite center expressions/);assert.deepEqual(f.calls,[]);}
});

test('observer4D pose may move during expression and native awaits while source units remain bound',async()=>{
  const f=fixture(),last=deferred(),native=deferred();let next=0;
  f.context.number=()=>++next===4?last.promise:Promise.resolve(.2);
  f.context.commit=async(op,params,label,{verifyPublication})=>{await native.promise;verifyPublication();f.calls.push(['commit',op,params]);};
  const running=f.controls.construct();f.state.view.angles[2]=32;last.resolve(.2);await tick();
  f.state.view.camera={projection:'perspective',zoom:2};native.resolve();await running;
  assert.equal(f.calls.at(-1)[1],'convex-core-4d');assert.equal(f.state.view.angles[2],32);
  const g=fixture(),held=deferred();g.context.commit=async(op,params,label,{verifyPublication})=>{await held.promise;verifyPublication();};
  const stale=g.controls.construct();await tick();g.state.view.coordinateUnit='cm';held.resolve();
  await assert.rejects(stale,/changed/);assert.equal(g.state.view.coordinateUnit,'cm');assert.equal(g.controls.busy,false);
});

test('cell incidence or active document selection changes during native job cannot publish stale core',async()=>{
  for(const change of [f=>f.state.model.cells[0].reverse(),f=>f.doc.states=[structuredClone(f.state)]]){
    const f=fixture(),native=deferred();let published=false;
    f.context.commit=async(op,params,label,{verifyPublication})=>{await native.promise;verifyPublication();published=true;};
    const running=f.controls.construct();await tick();change(f);native.resolve();await assert.rejects(running,/changed/);
    assert.equal(published,false);assert.equal(f.controls.busy,false);
  }
});

test('4D core requires current intrinsic cell incidence and leaves unsupported geometry to native diagnosis',async()=>{
  for(const change of [m=>m.cells=[],m=>m.embeddingDimension=3]){const f=fixture();change(f.state.model);f.controls.sync();
    assert.equal(f.nodes['make-convex-core'].disabled,true);await assert.rejects(()=>f.controls.construct());}
  const f=fixture();let calls=0;f.context.commit=async()=>{if(!calls++)throw Error('Distinct cell hyperplane limit exceeded.');return {published:true};};
  await assert.rejects(()=>f.controls.construct(),/hyperplane limit/);assert.equal(f.controls.busy,false);
  assert.equal(f.nodes['make-convex-core'].disabled,false);assert.deepEqual(await f.controls.construct(),{published:true});
});

const changes={
  'cell RGBA':f=>{f.state.model.metadata.offColors.cells[0].values[3]=128;},
  'face RGBA':f=>{f.state.model.metadata.offColors.faces[0]={encoding:'unit',values:[.1,.2,.3,.4]};},
  'view units':f=>{f.state.view.coordinateUnit='cm';},
  'source units':f=>{f.state.model.metadata.coordinateUnits='in';},
  notes:f=>{f.state.notes='Edited source note';},
  coordinates:f=>{f.state.model.vertices[1][0]=2;},
  'ordered cell incidence':f=>{f.state.model.cells[0].reverse();},
  'source receipt':f=>{f.state.model.metadata.ownerReceipt={hash:'new receipt'};},
  'model identity':f=>{f.state.model=structuredClone(f.state.model);},
  document:f=>{f.project.documents[0]={...f.doc};},
  'state array':f=>{f.doc.states=[f.state];},
  'active state':f=>{f.doc.states=[structuredClone(f.state)];},
  cursor:f=>{f.doc.states.push(structuredClone(f.state));f.doc.cursor=1;},
  workspace:f=>f.setProject({...f.project}),
  X:f=>{f.nodes['core-x'].value='.1';},
  Y:f=>{f.nodes['core-y'].value='.1';},
  Z:f=>{f.nodes['core-z'].value='.1';},
  W:f=>{f.nodes['core-w'].value='.1';},
  'color policy':f=>{f.nodes['core-color-policy'].value='none';},
  export:f=>f.setExport(true)
};
for(const stage of ['expression','native'])test(`4D core ${stage} owner includes complete source attributes and every active form field`,async t=>{
  for(const [name,change] of Object.entries(changes))await t.test(name,async()=>{
    const f=fixture(),held=deferred(),started=deferred();let published=false;
    if(stage==='expression')f.context.evaluateMany=async(parts,options)=>{
      assert.deepEqual(parts,['.2','.2','.2','.2']);assert.equal(options.mode,'real');started.resolve();await held.promise;return [.2,.2,.2,.2];
    };
    else f.context.commit=async(op,params,label,options)=>{
      started.resolve();await held.promise;options.verifyPublication();published=true;
    };
    const running=f.controls.construct();await started.promise;change(f);const edited=structuredClone(f.project);held.resolve();
    await assert.rejects(running,/changed|export/);assert.equal(published,false);
    assert.ok(!f.calls.some(c=>c[0]==='commit'));assert.deepEqual(f.project,edited);assert.equal(f.controls.busy,false);
  });
});

test('cancel owns batched expressions and native publication, blocks ignored late results and permits retry',async()=>{
  for(const stage of ['expression','native']){
    const f=fixture(),held=deferred(),started=deferred();let options,published=0;
    if(stage==='expression')f.context.evaluateMany=async(parts,opts)=>{
      options=opts;started.resolve();await held.promise;return [.2,.2,.2,.2];
    };
    else f.context.commit=async(op,params,label,opts)=>{
      options=opts;started.resolve();await held.promise;opts.verifyPublication();published++;
    };
    const before=structuredClone(f.project),running=f.controls.construct();await started.promise;
    const rejected=assert.rejects(running,{name:'AbortError'});f.controls.cancel();await rejected;
    assert.equal(options.signal.aborted,true);assert.equal(f.controls.busy,false);assert.equal(published,0);
    assert.deepEqual(f.project,before);assert.ok(Object.values(f.nodes).every(node=>!node.disabled));
    held.resolve();await tick();assert.equal(published,0);assert.deepEqual(f.project,before);
    f.context.evaluateMany=async()=>[.2,.2,.2,.2];
    f.context.commit=async(op,params,label,opts)=>{opts.verifyPublication();published++;return {published:true};};
    assert.deepEqual(await f.controls.construct(),{published:true});assert.equal(published,1);
  }
});

test('every batched center result must be a finite bounded primitive and match all four inputs',async()=>{
  for(let axis=0;axis<4;axis++)for(const invalid of [NaN,Infinity,-Infinity,'1',true,undefined,1e101]){
    const f=fixture();f.context.evaluateMany=async()=>Array.from({length:4},(_,i)=>i===axis?invalid:.2);
    await assert.rejects(f.controls.construct(),/finite.*bounded/);assert.ok(!f.calls.some(c=>c[0]==='commit'));assert.equal(f.controls.busy,false);
  }
  for(const results of [[.2,.2,.2],[.2,.2,.2,.2,.2],[.2,,.2,.2]]){
    const f=fixture();f.context.evaluateMany=async()=>results;
    await assert.rejects(f.controls.construct(),/match all input|holes|ordinary array/);assert.ok(!f.calls.some(c=>c[0]==='commit'));
  }
});

test('batched source snapshots and expression text are detached; current observer motion survives both awaits',async()=>{
  const f=fixture(),batch=deferred(),native=deferred(),started=deferred(),source=structuredClone(f.state.model);
  let entryOptions;
  f.nodes['core-w'].value='-1/10';
  f.context.evaluateMany=async(parts,options)=>{assert.deepEqual(parts,['.2','.2','.2','-1/10']);assert.equal(options.mode,'real');await batch.promise;return [.2,.2,.2,-.1];};
  f.context.commit=async(op,params,label,options)=>{
    entryOptions=options;assert.equal(op,'convex-core-4d');assert.deepEqual(params,{center:[.2,.2,.2,-.1],color_policy:'require-equal'});
    assert.deepEqual(options.expressionInputs,{center:['.2','.2','.2','-1/10'],color_policy:'require-equal'});
    assert.deepEqual(options.sourceSnapshot,source);assert.notEqual(options.sourceSnapshot,f.state.model);
    started.resolve();await native.promise;options.verifyPublication();
    // Only the detached copy is writable by a native transport/consumer.
    options.sourceSnapshot.metadata.offColors.cells[0].values[0]=255;
    f.doc.states.push({...f.state,model:structuredClone(source)});f.doc.cursor=1;return {published:true};
  };
  const running=f.controls.construct();f.state.view.angles[4]=71;batch.resolve();await started.promise;
  f.state.view.camera={projection:'perspective',zoom:3};native.resolve();
  assert.deepEqual(await running,{published:true});assert.ok(entryOptions.signal instanceof AbortSignal);
  assert.deepEqual(f.state.model,source);assert.equal(f.context.getState().view.angles[4],71);
  assert.deepEqual(f.context.getState().view.camera,{projection:'perspective',zoom:3});assert.equal(f.controls.busy,false);
});

test('4D source ownership remains live throughout native await and refuses competing construction callbacks',async()=>{
  const f=fixture(),native=deferred(),started=deferred();
  f.context.commit=async(op,params,label,options)=>{started.resolve();await native.promise;options.verifyPublication();return {published:true};};
  const running=f.controls.construct();await started.promise;
  assert.equal(f.controls.busy,true);assert.ok(Object.values(f.nodes).every(node=>node.disabled));
  await assert.rejects(f.controls.construct(),/current construction/);assert.equal(f.calls.filter(c=>c[0]==='batch').length,1);
  native.resolve();assert.deepEqual(await running,{published:true});assert.equal(f.controls.busy,false);
});
