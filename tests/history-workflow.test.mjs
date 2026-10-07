import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareHistoryCommit,prepareHistoryOpen,verifyHistoryPublication,preserveHistoryObserver} from '../ui/history-workflow.mjs';

function fixture(){
  const source={id:'source',cursor:0,states:[{model:{id:'polygon',vertices:[[1,0],[0,1],[-1,0]]},view:{angles:[0,0,0,0,0,0]},notes:'retained source'}]};
  const other={id:'other',cursor:0,states:[{model:{id:'other-model'},view:{}}]};
  let project={documents:[source,other],active:0},exporting=false,resolve,reject;
  const originalProject=project,before=structuredClone(project),calls=[];
  const result={id:'result',cursor:1,states:[structuredClone(source.states[0]),{model:{id:'product'},view:{}}]};
  const context={getProject:()=>project,getDocument:()=>project.documents[project.active],
    getState:()=>{const doc=project.documents[project.active];return doc?.states[doc.cursor];},isExporting:()=>exporting,
    run:(...args)=>{calls.push(args);return new Promise((yes,no)=>{resolve=yes;reject=no;});}};
  return {context,source,other,originalProject,before,calls,result,
    export:()=>exporting=true,replace:()=>project={documents:[source,other],active:0},
    finish:()=>resolve(result),fail:()=>reject(Error('native refusal'))};
}
const methods=[['commit',f=>prepareHistoryCommit(f.context,'polygon-prism',{height:2},'Polygon × interval')],
  ['replay',f=>prepareHistoryOpen(f.context,'recipe-replay')],
  ['branch',f=>prepareHistoryOpen(f.context,'recipe-branch',{height:3})]];

test('construction publication callback runs after native await and again at final synchronous commit',async()=>{
  const f=fixture();let calls=0;f.context.verifyPublication=()=>{calls++;};
  const pending=prepareHistoryCommit(f.context,'attach-at-faces',{},'Attach faces');assert.equal(calls,0);
  f.finish();const prepared=await pending;assert.equal(calls,1);
  verifyHistoryPublication(f.context,prepared);assert.equal(calls,2);
});

test('construction-specific external-source changes refuse both native completion and final publication',async()=>{
  for(const finalOnly of [false,true]){
    const f=fixture();let changed=false;f.context.verifyPublication=()=>{if(changed)throw Error('Selected memory changed');};
    const pending=prepareHistoryCommit(f.context,'attach-at-faces',{},'Attach faces');
    if(!finalOnly)changed=true;f.finish();
    if(finalOnly){const prepared=await pending;changed=true;assert.throws(()=>verifyHistoryPublication(f.context,prepared),/memory changed/);}
    else await assert.rejects(pending,/memory changed/);
    assert.deepEqual(f.originalProject,f.before);
  }
});

for(const [name,start] of methods){
  test(name+' returns the exact native result and immutable source ownership without publishing',async()=>{
    const f=fixture(),pending=start(f);
    assert.deepEqual(f.originalProject,f.before);
    const [operation,params,model,label]=f.calls[0];
    assert.equal(operation,name==='commit'?'recipe-run':'recipe-'+name);
    assert.notEqual(params.document,f.source);assert.deepEqual(params.document,f.source);assert.equal(model,null);
    if(name==='commit'){
      assert.equal(params.operation,'polygon-prism');assert.deepEqual(params.parameters,{height:2});
      assert.equal(params.label,'Polygon × interval');assert.equal(label,params.label);
    }else{
      assert.equal(label,name==='replay'?'Verify operation replay':'Construct parameter branch');
      assert.deepEqual(Object.keys(params),name==='replay'?['document']:['document','parameters']);
      if(name==='branch')assert.deepEqual(params.parameters,{height:3});
    }
    // Native consumers may mutate their detached request; caller source stays intact.
    params.document.states[0].model.vertices[0][0]=999;
    assert.deepEqual(f.originalProject,f.before);
    f.finish();const verified=await pending;
    assert.equal(verified.result,f.result);assert.equal(verified.sourceProject,f.originalProject);
    assert.equal(verified.sourceDocument,f.source);assert.equal(verified.sourceState,f.source.states[0]);assert.equal(verified.index,0);
    assert.deepEqual(f.originalProject,f.before);assert.equal(f.calls.length,1);
  });

  test(name+' rejects a preexisting export before calling native',async()=>{
    const f=fixture();f.export();await assert.rejects(start(f),/Finish animation export/);
    assert.deepEqual(f.calls,[]);assert.deepEqual(f.originalProject,f.before);
  });

  test(name+' rejects export begun while native result is pending',async()=>{
    const f=fixture(),pending=start(f);f.export();f.finish();
    await assert.rejects(pending,/export began/);assert.deepEqual(f.originalProject,f.before);
  });

  test(name+' rejects replacement workspace even if it contains the same source objects',async()=>{
    const f=fixture(),pending=start(f);f.replace();f.finish();
    await assert.rejects(pending,/changed/);assert.deepEqual(f.originalProject,f.before);
  });

  test(name+' rejects a replaced history state with identical serialized geometry',async()=>{
    const f=fixture(),pending=start(f);f.source.states[0]=structuredClone(f.source.states[0]);f.finish();
    await assert.rejects(pending,/changed/);assert.equal(f.source.states.length,1);
  });

  test(name+' rejects undo/redo cursor changes during native work',async()=>{
    const f=fixture();f.source.states.push({model:{id:'next'},view:{}});
    const pending=start(f);f.source.cursor=1;f.finish();
    await assert.rejects(pending,/changed/);assert.equal(f.source.states.length,2);
  });

  test(name+' rejects a closed source document while retaining other tabs',async()=>{
    const f=fixture(),pending=start(f);f.originalProject.documents.splice(0,1);f.finish();
    await assert.rejects(pending,/document closed/);assert.deepEqual(f.originalProject.documents,[f.other]);
  });

  test(name+' propagates native refusal without touching caller project',async()=>{
    const f=fixture(),pending=start(f);f.fail();await assert.rejects(pending,/native refusal/);
    assert.deepEqual(f.originalProject,f.before);
  });
}

test('commit permits the unchanged source in an inactive tab and returns its new index',async()=>{
  const f=fixture(),pending=methods[0][1](f);
  f.originalProject.documents.reverse();f.originalProject.active=0;
  f.finish();const verified=await pending;
  assert.equal(verified.sourceDocument,f.source);assert.equal(verified.index,1);
  assert.equal(f.context.getDocument(),f.other);assert.equal(f.originalProject.documents[1],f.source);
});

for(const name of ['replay','branch'])test(name+' rejects an active tab change with unchanged source history',async()=>{
  const f=fixture(),pending=methods.find(([kind])=>kind===name)[1](f);
  f.originalProject.active=1;f.finish();await assert.rejects(pending,/selection changed/);
  assert.equal(f.originalProject.documents.length,2);
});

for(const name of ['replay','branch'])test(name+' checks the 100-document cap before and after native await',async()=>{
  const start=methods.find(([kind])=>kind===name)[1],busy=fixture();
  while(busy.originalProject.documents.length<100)busy.originalProject.documents.push({id:'extra'});
  await assert.rejects(start(busy),/Close a document/);assert.deepEqual(busy.calls,[]);
  const f=fixture();while(f.originalProject.documents.length<99)f.originalProject.documents.push({id:'extra'});
  const pending=start(f);f.originalProject.documents.push({id:'last-permitted'});f.finish();
  await assert.rejects(pending,/Close a document/);assert.equal(f.originalProject.documents.length,100);
});

test('commit continues to replace a source at the cap because it does not open another document',async()=>{
  const f=fixture();while(f.originalProject.documents.length<100)f.originalProject.documents.push({id:'extra'});
  const pending=methods[0][1](f);f.finish();assert.equal((await pending).index,0);
  assert.equal(f.originalProject.documents.length,100);
});

test('replay requires the selected source document even when another tab shares the same state object',async()=>{
  const f=fixture();f.other.states=[f.source.states[0]];
  const pending=prepareHistoryOpen(f.context,'recipe-replay');f.originalProject.active=1;f.finish();
  await assert.rejects(pending,/selection changed/);
});

for(const [name,start] of methods){
  const opening=name!=='commit';
  for(const change of ['export','workspace','history','closed'])test(name+' final publication fence rejects '+change+' changed after preparation',async()=>{
    const f=fixture(),pending=start(f);f.finish();const prepared=await pending;
    if(change==='export')f.export();
    if(change==='workspace')f.replace();
    if(change==='history')f.source.states[0]=structuredClone(f.source.states[0]);
    if(change==='closed')f.originalProject.documents.splice(0,1);
    assert.throws(()=>verifyHistoryPublication(f.context,prepared,{opening}),
      change==='export'?/export began/:change==='closed'?/document closed/:/changed/);
    assert.ok(!f.originalProject.documents.includes(f.result));
  });
}

test('final fence covers an export microtask between helper resolution and caller continuation',async()=>{
  const f=fixture(),pending=prepareHistoryCommit(f.context,'polygon-prism',{height:2},'Prism');
  f.finish();
  // Resolving native queues the helper's continuation first. It verifies,
  // then resolves pending; this already queued export runs before the caller.
  queueMicrotask(()=>f.export());
  const prepared=await pending;
  assert.equal(prepared.result,f.result);
  assert.throws(()=>verifyHistoryPublication(f.context,prepared),/export began/);
  assert.deepEqual(f.originalProject,f.before);
});

test('final commit fence returns a fresh index when tabs reorder after preparation',async()=>{
  const f=fixture(),pending=prepareHistoryCommit(f.context,'polygon-prism',{height:2},'Prism');
  f.finish();const prepared=await pending;assert.equal(prepared.index,0);
  f.originalProject.documents.reverse();f.originalProject.active=0;
  const index=verifyHistoryPublication(f.context,prepared);
  assert.equal(index,1);assert.equal(f.originalProject.documents[index],f.source);
  assert.equal(f.context.getDocument(),f.other);
});

for(const name of ['replay','branch'])test(name+' final fence retains selection and cap checks after preparation',async()=>{
  const start=methods.find(([kind])=>kind===name)[1];
  const changed=fixture(),selectionPending=start(changed);changed.finish();const selection=await selectionPending;
  changed.originalProject.active=1;
  assert.throws(()=>verifyHistoryPublication(changed.context,selection,{opening:true}),/selection changed/);
  const full=fixture(),capPending=start(full);full.finish();const prepared=await capPending;
  while(full.originalProject.documents.length<100)full.originalProject.documents.push({id:'extra'});
  assert.throws(()=>verifyHistoryPublication(full.context,prepared,{opening:true}),/Close a document/);
  assert.equal(full.originalProject.documents.length,100);
});

for(const [name,start] of methods)test(name+' final fence accepts unchanged ownership without publication',async()=>{
  const f=fixture(),pending=start(f);f.finish();const prepared=await pending;
  assert.equal(verifyHistoryPublication(f.context,prepared,{opening:name!=='commit'}),0);
  assert.deepEqual(f.originalProject,f.before);
});

for(const [name,start] of methods){
  for(const change of ['coordinates','attributes','model-pointer']){
    test(name+' refuses in-place '+change+' changes during native work',async()=>{
      const f=fixture(),pending=start(f);
      if(change==='coordinates')f.source.states[0].model.vertices[0][0]+=1;
      else if(change==='attributes')f.source.states[0].model.metadata={offColors:{faces:[{encoding:'unit',values:[1,0,0,.2]}]}};
      else f.source.states[0].model=structuredClone(f.source.states[0].model);
      f.finish();await assert.rejects(pending,/changed/);
      assert.equal(f.source.states.length,1);
    });
  }
  test(name+' final publication fence refuses model attribute edit after preparation',async()=>{
    const f=fixture(),pending=start(f);f.finish();const prepared=await pending;
    f.source.states[0].model.metadata={annotation:'edited during caller continuation'};
    assert.throws(()=>verifyHistoryPublication(f.context,prepared,{opening:name!=='commit'}),/changed/);
    assert.equal(f.source.states.length,1);
  });
  test(name+' accepts view rotation while geometric source is unchanged',async()=>{
    const f=fixture(),pending=start(f);f.source.states[0].view.angles[2]=37;f.finish();
    const prepared=await pending;assert.equal(verifyHistoryPublication(f.context,prepared,{opening:name!=='commit'}),0);
  });
}


test('a later native-wait observer edit survives geometry commit without altering source or recorded snapshots',async()=>{
  const f=fixture();f.source.states[0].model.dimension=3;f.result.states[1].model.dimension=3;
  f.source.states[0].view.camera={position:[2,3,4]};f.result.states[1].view.camera={position:[1,1,1]};
  const pending=prepareHistoryCommit(f.context,'subdivide-edges',{divisions:2},'Subdivide');
  f.source.states[0].view.angles[0]=17;f.source.states[0].view.camera.position=[5,6,7];f.source.states[0].view.cameraProjection='perspective';
  f.result.operationHistory={nodes:[{snapshot:structuredClone(f.result.states[1])}]};
  const snapshot=structuredClone(f.result.operationHistory),source=structuredClone(f.source.states[0]);
  f.finish();const prepared=await pending;verifyHistoryPublication(f.context,prepared);preserveHistoryObserver(prepared);
  assert.deepEqual(f.result.states[1].view.angles,[17,0,0,0,0,0]);assert.deepEqual(f.result.states[1].view.camera,{position:[5,6,7]});assert.equal(f.result.states[1].view.cameraProjection,'perspective');
  assert.deepEqual(f.source.states[0],source);assert.deepEqual(f.result.operationHistory,snapshot);
  f.result.states[1].view.camera.position[0]=99;assert.equal(f.source.states[0].view.camera.position[0],5);
});

test('observer transfer preserves native reset policy for unchanged pose and changed dimensional domains',async()=>{
  for(const changedDimension of [false,true]){
    const f=fixture();f.source.states[0].model.dimension=3;f.result.states[1].model.dimension=changedDimension?4:3;
    f.source.states[0].view.camera={position:[2,3,4]};f.source.states[0].view.cameraProjection='orthographic';
    f.result.states[1].view={cameraProjection:'perspective',derivedMode:'section'};
    const expected=structuredClone(f.result.states[1].view),pending=prepareHistoryCommit(f.context,'transform',{},'Operation');
    if(changedDimension){f.source.states[0].view.angles[0]=17;f.source.states[0].view.camera.position[0]=22;}
    f.finish();const prepared=await pending;verifyHistoryPublication(f.context,prepared);preserveHistoryObserver(prepared);assert.deepEqual(f.result.states[1].view,expected);
  }
});

test('observer transfer notices edits in the final publication microtask, including field removal',async()=>{
  const f=fixture();f.source.states[0].model.dimension=3;f.result.states[1].model.dimension=3;
  f.source.states[0].view.camera={position:[2,3,4]};f.result.states[1].view.camera={position:[2,3,4]};
  const pending=prepareHistoryCommit(f.context,'transform',{},'Operation');f.finish();const prepared=await pending;
  delete f.source.states[0].view.camera;f.source.states[0].view.angles[1]=12;verifyHistoryPublication(f.context,prepared);preserveHistoryObserver(prepared);
  assert.equal(Object.hasOwn(f.result.states[1].view,'camera'),false);assert.deepEqual(f.result.states[1].view.angles,[0,12,0,0,0,0]);
});
