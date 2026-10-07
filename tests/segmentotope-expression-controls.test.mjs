import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SegmentotopeControls} from '../ui/segmentotope-controls.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const cube=()=>({id:'expression-layer-cube',name:'Literal layer cube',dimension:3,embeddingDimension:3,interpretation:'generalized-complex',
  vertices:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
  edges:[[0,1],[1,2],[2,3],[0,3],[4,5],[5,6],[6,7],[4,7],[0,4],[1,5],[2,6],[3,7]],
  faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],cells:[],
  metadata:{coordinateUnits:'mm',offColors:{faces:[{encoding:'unit',values:[.2,.4,.8,.25]},null,null,null,null,null],cells:[]}}});
function fixture(){
  const values={'layer-join-top':'current','layer-join-height':'-2','layer-join-x':'0','layer-join-y':'0','layer-join-z':'0',
    'layer-join-end-x':'1','layer-join-end-y':'0','layer-join-end-z':'0','layer-join-tx':'0','layer-join-ty':'0','layer-join-tz':'0',
    'layer-join-matrix':'1 0 0\n0 1 0\n0 0 1','layer-join-fit':'','layer-join-transform':'','layer-join-point-row':'',
    'layer-join-edge-row':'','layer-join-point-label':'','make-layer-join':''};
  const nodes=Object.fromEntries(Object.entries(values).map(([id,value])=>[id,{value,checked:false,disabled:false,hidden:false,textContent:''}]));
  const state={model:cube(),notes:'Historical source',view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0],camera:{position:[2,3,4]}}},
    doc={id:'expression-layer-doc',states:[state],cursor:0};let project={active:0,documents:[doc]},exporting=false,
    memories={version:1,slots:Array(9).fill(null)};memories.slots[0]={state:structuredClone(state),source:{documentId:'memory-original'}};
  const calls=[],context={getState:()=>context.getDocument().states[context.getDocument().cursor],getDocument:()=>project.documents[project.active],
    getProject:()=>project,getMemories:()=>memories,isExporting:()=>exporting,evaluateMany:async(parts,options)=>{calls.push(['numbers',[...parts],options]);return parts.map(Number);},
    commit:async(op,params,label,options)=>{calls.push(['commit',op,params,label,options]);options.verifyPublication();return {id:'joined'};}};
  const controls=Object.assign(Object.create(SegmentotopeControls.prototype),{context,busy:false,memoryOptions:[],
    panel:{querySelector:s=>nodes[s.slice(1)],querySelectorAll:()=>Object.values(nodes)}});controls.sync();
  return {controls,context,nodes,calls,state,doc,setExport:v=>exporting=v,setProject:v=>project=v,setMemories:v=>memories=v,get project(){return project;},get memories(){return memories;}};
}
const commit=f=>f.calls.find(c=>c[0]==='commit');
test('single native batch contains selected scalars and all matrix expressions, preserving nested commas',async()=>{
  const f=fixture(),c=Math.sqrt(3)/2;f.nodes['layer-join-top'].value='edge';f.nodes['layer-join-transform'].checked=true;
  f.nodes['layer-join-height'].value='-sqrt(4)';f.nodes['layer-join-x'].value='min(0,max(-1,0))';f.nodes['layer-join-tz'].value='max(0,min(1,0))';
  f.nodes['layer-join-matrix'].value='cosd(30), -sind(30), min(0,max(-1,0))\nsind(30); cosd(30); 0\n0 0 1';
  const answers={'-sqrt(4)':-2,'min(0,max(-1,0))':0,'max(0,min(1,0))':0,'cosd(30)':c,'-sind(30)':-.5,'sind(30)':.5};
  f.context.evaluateMany=async(parts,options)=>{f.calls.push(['numbers',[...parts],options]);return parts.map(s=>s in answers?answers[s]:Number(s));};
  await f.controls.join();const numbers=f.calls.filter(c=>c[0]==='numbers');assert.equal(numbers.length,1);assert.equal(numbers[0][1].length,19);
  assert.deepEqual(numbers[0][1].slice(-9),['cosd(30)','-sind(30)','min(0,max(-1,0))','sind(30)','cosd(30)','0','0','0','1']);
  assert.deepEqual(commit(f)[2].top_matrix,[[c,-.5,0],[.5,c,0],[0,0,1]]);assert.equal(commit(f)[2].height,-2);assert.deepEqual(commit(f)[2].top_translation,[0,0,0]);
  assert.match(commit(f)[2].top.source_id,/^[0-9a-f-]{36}$/);assert.ok(commit(f)[4].signal instanceof AbortSignal);assert.deepEqual(commit(f)[4].sourceSnapshot,f.state.model);
  assert.equal(commit(f)[4].expressionInputs.top_matrix,f.nodes['layer-join-matrix'].value);assert.equal(commit(f)[4].expressionInputs.height,'-sqrt(4)');
});
test('flat expression list and legacy numeric rows preserve literal matrix order/reflections',async()=>{
  for(const text of ['-1 0 0\n0 1 0\n0 0 1','-sqrt(1); max(0,0); 0; 0; 1; 0; 0; 0; cosd(0)']){
    const f=fixture();f.nodes['layer-join-transform'].checked=true;f.nodes['layer-join-matrix'].value=text;
    f.context.evaluateMany=async p=>p.map(s=>({'-sqrt(1)':-1,'max(0,0)':0,'cosd(0)':1}[s]??Number(s)));
    await f.controls.join();assert.deepEqual(commit(f)[2].top_matrix,[[-1,0,0],[0,1,0],[0,0,1]]);
  }
});
test('inactive blank/invalid transform and coordinates remain ignored; fitted current top schedules no expression IPC',async()=>{
  const f=fixture();for(const id of ['layer-join-matrix','layer-join-x','layer-join-end-x','layer-join-tx'])f.nodes[id].value='invalid()';
  await f.controls.join();assert.deepEqual(f.calls.find(c=>c[0]==='numbers')[1],['-2']);assert.equal('top_matrix' in commit(f)[2],false);
  const fit=fixture();fit.nodes['layer-join-fit'].checked=true;fit.nodes['layer-join-height'].value='';await fit.controls.join();
  assert.equal(fit.calls.filter(c=>c[0]==='numbers').length,0);assert.equal(commit(fit)[1],'fit-strict-layer-join');assert.equal('height' in commit(fit)[2],false);assert.deepEqual(commit(fit)[4].expressionInputs,{});
});
test('matrix syntax/blank/caps and numerical shear/scale refuse without native publication',async()=>{
  for(const text of ['', '1,0,0', 'cosd(0) 0 0 0 1 0 0 0 1', `${'1'.repeat(513)},0,0\n0,1,0\n0,0,1`]){
    const f=fixture();f.nodes['layer-join-transform'].checked=true;f.nodes['layer-join-matrix'].value=text;await assert.rejects(f.controls.join());assert.equal(commit(f),undefined);
  }
  for(const a of [[2,0,0,0,1,0,0,0,1],[1,.1,0,0,1,0,0,0,1],[NaN,0,0,0,1,0,0,0,1]]){
    const f=fixture();f.nodes['layer-join-transform'].checked=true;f.context.evaluateMany=async()=>[-2,0,0,0,...a];await assert.rejects(f.controls.join());assert.equal(commit(f),undefined);assert.equal(f.controls.busy,false);
  }
});
const changes={project:f=>f.setProject({...f.project}),document:f=>f.doc.id='changed-doc',states:f=>f.doc.states=[f.state],
  cursor:f=>{f.doc.states.push(structuredClone(f.state));f.doc.cursor=1;},source:f=>f.state.model.vertices[0][0]=2,
  metadataUnit:f=>f.state.model.metadata.coordinateUnits='cm',viewUnit:f=>f.state.view.coordinateUnit='cm',notes:f=>f.state.notes='Changed',
  rgba:f=>f.state.model.metadata.offColors.faces[0].values[3]=.8,form:f=>f.nodes['layer-join-matrix'].value='-1 0 0\n0 1 0\n0 0 1',
  mode:f=>f.nodes['layer-join-fit'].checked=true,export:f=>f.setExport(true)};
test('every source/unit/notes/RGBA/document/workspace/form ownership mutation during expression await refuses',async()=>{
  for(const [name,change] of Object.entries(changes)){const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;const run=f.controls.join();change(f);hold.resolve([-2]);
    await assert.rejects(run,undefined,name);assert.equal(commit(f),undefined,name);assert.equal(f.controls.busy,false);}
});
test('same ownership fences remain active immediately before publication after native await',async()=>{
  for(const [name,change] of Object.entries(changes)){const f=fixture(),hold=deferred();let publications=0;
    f.context.commit=async(op,p,label,options)=>{f.calls.push(['commit',op,p,label,options]);await hold.promise;options.verifyPublication();publications++;return {};};
    const run=f.controls.join();await flush();assert.ok(commit(f),name);change(f);hold.resolve();await assert.rejects(run,undefined,name);assert.equal(publications,0,name);
  }
});
test('selected memory complete record is bound, including saved unit/notes/view/source, while unrelated slot remains independent',async()=>{
  for(const stage of ['expression','native'])for(const change of [f=>f.memories.slots[0].state.view.coordinateUnit='cm',f=>f.memories.slots[0].state.notes='changed',
    f=>f.memories.slots[0].source.documentId='changed',f=>f.memories.slots[0].state.view.camera.position[0]=7]){
    const f=fixture(),hold=deferred();f.nodes['layer-join-top'].value='memory:1';let publications=0;
    if(stage==='expression')f.context.evaluateMany=()=>hold.promise;
    else f.context.commit=async(op,p,label,o)=>{await hold.promise;o.verifyPublication();publications++;return {};};
    const run=f.controls.join();await flush();change(f);hold.resolve(stage==='expression'?[-2]:undefined);await assert.rejects(run);assert.equal(publications,0);
  }
  const f=fixture(),hold=deferred();f.nodes['layer-join-top'].value='memory:1';f.context.evaluateMany=()=>hold.promise;
  const run=f.controls.join();f.memories.slots[8]={state:structuredClone(f.state),source:{}};hold.resolve([-2]);await run;assert.ok(commit(f));
});
test('mutating submitted numerical parameters during native work refuses final publication',async()=>{
  const f=fixture(),hold=deferred();let published=false;f.context.commit=async(op,params,label,o)=>{params.height=9;await hold.promise;o.verifyPublication();published=true;};
  const run=f.controls.join();await flush();hold.resolve();await assert.rejects(run,/parameters changed/);assert.equal(published,false);
});
test('observer pose remains live through numeric and native waits and successful provider publication',async()=>{
  const f=fixture(),numbers=deferred(),native=deferred();f.context.evaluateMany=()=>numbers.promise;
  f.context.commit=async(op,p,label,o)=>{await native.promise;o.verifyPublication();return {view:structuredClone(f.state.view)};};
  const run=f.controls.join();f.state.view={...f.state.view,angles:[17,0,0,0,0,0],camera:{position:[7,8,9]}};numbers.resolve([-2]);await flush();
  f.state.view.angles[0]=41;f.state.view.camera.position[0]=12;native.resolve();const result=await run;
  assert.equal(result.view.angles[0],41);assert.deepEqual(result.view.camera.position,[12,8,9]);assert.equal(f.state.view.angles[0],41);
});
test('canceled ignored expression/native providers cannot publish late and allow clean retry',async()=>{
  for(const stage of ['expression','native']){
    const f=fixture(),hold=deferred();let published=0;
    if(stage==='expression')f.context.evaluateMany=()=>hold.promise;
    else f.context.commit=async(op,p,label,o)=>{await hold.promise;o.verifyPublication();published++;return {};};
    const run=f.controls.join();await flush();await assert.rejects(f.controls.join(),/current layer join/);f.controls.cancelNumeric();await assert.rejects(run,{name:'AbortError'});
    hold.resolve(stage==='expression'?[-2]:undefined);await flush();assert.equal(published,0);assert.equal(f.controls.busy,false);
    f.context.evaluateMany=async p=>p.map(Number);f.context.commit=async(op,p,label,o)=>{o.verifyPublication();return 'retry';};assert.equal(await f.controls.join(),'retry');
  }
});
test('native refusal and forged expression arrays release ownership without source mutation',async()=>{
  const f=fixture(),before=structuredClone(f.state);f.context.commit=async()=>{throw Error('Native convexity refused.');};await assert.rejects(f.controls.join(),/convexity/);assert.deepEqual(f.state,before);assert.equal(f.controls.busy,false);
  const g=fixture();let getter=false;g.context.evaluateMany=async()=>{const result=[0];Object.defineProperty(result,'0',{get(){getter=true;return -2;}});return result;};await assert.rejects(g.controls.join(),/accessors/);assert.equal(getter,false);assert.equal(commit(g),undefined);
});
test('actual native degree/root expressions yield signed reflected tesseract geometry with complete source provenance',async()=>{
  const f=fixture(),cwd=fileURLToPath(new URL('../',import.meta.url)),before=structuredClone(f.state);
  const native=request=>{const r=JSON.parse(execFileSync('python',['-B','-m','engine.server'],{cwd,windowsHide:true,input:JSON.stringify(request)+'\n',encoding:'utf8'}));assert.equal(r.ok,true,r.error);return r.result;};
  f.nodes['layer-join-transform'].checked=true;f.nodes['layer-join-height'].value='-sqrt(4)';f.nodes['layer-join-matrix'].value='-sqrt(1),max(0,0),sind(0)\n0,cosd(0),0\n0,0,1';
  f.context.evaluateMany=async expressions=>native({op:'expression-batch',params:{expressions,mode:'real'}}).values;
  f.context.commit=async(op,params,label,o)=>{const result=native({op,params,model:o.sourceSnapshot});o.verifyPublication();return result;};
  const result=await f.controls.join();assert.deepEqual(['vertices','edges','faces','cells'].map(k=>result[k].length),[16,32,24,8]);
  for(const p of result.vertices)p.forEach(x=>assert.ok(Math.abs(Math.abs(x)-1)<1e-12));
  const e=result.metadata.convexLayerJoin;assert.equal(e.height,-2);assert.deepEqual(e.layers[1].transform.matrix,[[-1,0,0],[0,1,0],[0,0,1]]);
  assert.deepEqual(e.layers[0].sourceSnapshot,before.model);assert.deepEqual(e.layers[1].sourceSnapshot,before.model);
  assert.deepEqual(f.state,before);assert.equal(e.layers[0].sourceSnapshot.metadata.coordinateUnits,'mm');assert.equal(e.layers[1].sourceSnapshot.metadata.coordinateUnits,'mm');
  for(const layer of e.layers)for(const [i,target] of layer.maps.faces.entries())assert.deepEqual(result.metadata.offColors.faces[target],before.model.metadata.offColors.faces[i]);
});
