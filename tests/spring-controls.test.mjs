import test from 'node:test';
import assert from 'node:assert/strict';
import {SpringControls,SPRING_OPERATION,SPRING_PREVIEW_OPERATION,SPRING_VERSION,eligibleSpringSource} from '../ui/spring-controls.mjs';

const tetra=()=>({id:'literal-tetra',name:'Source',dimension:3,embeddingDimension:3,interpretation:'generalized-complex',
  vertices:[[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]],edges:[[2,3],[0,2],[1,3],[0,1],[0,3],[1,2]],
  faces:[[2,1,0],[3,0,1],[2,3,0],[3,2,1]],cells:[],numeric:{mode:'float64-approximate',certified:false},
  metadata:{coordinateUnits:'mm',arbitrary:{keep:[1,null,'original']},offColors:{faces:[{encoding:'byte',values:[10,20,30,125]},null,
    {encoding:'unit',values:[.1,.2,.3,.4]},null],cells:[]}}});
function packet(source,{satisfied=true,valid=true}={}){
  const evidence={algorithmVersion:'0.1.0',sourceModel:structuredClone(source),sourceModelId:source.id,requestedConstraintsSatisfied:satisfied,
    geometricValidity:{passed:valid,diagnostics:valid?[]:['Collapsed source edge.']},nativeValidation:{passed:valid},
    residuals:{maximumAbsoluteNormalizedResidual:satisfied?1e-10:1.828427124746,rmsNormalizedResidual:satisfied?1e-11:1.828427124746,weightedSpringEnergy:satisfied?1e-19:10.0294},
    solverTermination:{evaluations:12},resultModelId:'spring-'+'a'.repeat(64),resultFingerprint:'b'.repeat(64)};
  const model=valid?{...structuredClone(source),id:evidence.resultModelId,fingerprint:evidence.resultFingerprint,
    vertices:source.vertices.map(p=>p.map(x=>x/Math.sqrt(8))),metadata:{...structuredClone(source.metadata),springRelaxation:evidence}}:null;
  return {operation:SPRING_PREVIEW_OPERATION,algorithmVersion:'0.1.0',recipeRecorded:false,runtimePartialPublished:false,
    result:{status:valid?(satisfied?'constraints-satisfied':'stationary-residual'):'invalid-realization',model,evidence,
      preview:valid?null:{publishable:false},certified:false,uniform:false},
    adoption:{publishable:valid,constraintsSatisfied:satisfied,requiresExplicitNearMiss:valid&&!satisfied,uniformityEstablished:false,optimizerExecutionCertified:false}};
}
function fixture(){
  const defaults={'spring-initialization':'source','spring-seed':'0','spring-edge-length':'1','spring-random-scale':'1',
    'spring-evaluations':'500','spring-residual-tolerance':'1e-8','spring-solver-tolerance':'1e-11','spring-regular-faces':'',
    'spring-constraints':'{}','spring-accept-near-miss':'','preview-spring':'','adopt-spring':'','cancel-spring':'','spring-result':''};
  const nodes=Object.fromEntries(Object.entries(defaults).map(([id,value])=>[id,{value,checked:false,disabled:false,hidden:false,textContent:''}]));
  const state={model:tetra(),view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0]},notes:'Keep notes'},doc={id:'source-doc',states:[state],cursor:0};
  let project={active:0,documents:[doc],memories:{version:1,slots:Array(9).fill(null)}},exporting=false;
  const calls=[],context={getProject:()=>project,getDocument:()=>project.documents[project.active],getState:()=>context.getDocument()?.states[context.getDocument().cursor],
    isExporting:()=>exporting,number:async(text,options)=>{calls.push(['number',text,options]);return Number(text);},
    preview:async(...args)=>{calls.push(['preview',...args]);args[2].verifyPublication();return packet(state.model);},
    commit:async(...args)=>{calls.push(['commit',...args]);args[3].verifyPublication();return {id:'committed-document'};}};
  const panel={querySelector:s=>nodes[s.slice(1)],querySelectorAll:()=>Object.values(nodes),remove(){this.removed=true;}};
  const controls=Object.assign(Object.create(SpringControls.prototype),{context,panel,active:null,busy:false,generation:0,destroyed:false,previewData:null});controls.sync();
  return {controls,context,nodes,state,doc,calls,get project(){return project;},setProject:p=>project=p,setExport:v=>exporting=v};
}
const called=(f,kind)=>f.calls.find(c=>c[0]===kind),deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function holdNumbers(f){const pending=Array.from({length:6},deferred);let i=0;f.context.number=(text,options)=>{f.calls.push(['number',text,options]);return pending[i++].promise;};return pending;}

test('preview is source-bound read-only, default adoption exact and full source RGBA/unit is detached',async()=>{
  const f=fixture(),before=structuredClone(f.project);await f.controls.preview();
  assert.equal(SPRING_OPERATION,'spring-relaxation');assert.equal(SPRING_VERSION,'0.1.0');
  const preview=called(f,'preview');assert.equal(preview[1],SPRING_PREVIEW_OPERATION);assert.equal(called(f,'commit'),undefined);
  assert.deepEqual(preview[2],{solver:{initialization:'source',seed:0,max_evaluations:500,edge_length:1,random_scale:1,
    residual_tolerance:1e-8,solver_tolerance:1e-11,regular_faces:false},adoption:'constraints-satisfied'});
  assert.deepEqual(preview[3].sourceSnapshot,f.state.model);assert.notEqual(preview[3].sourceSnapshot,f.state.model);
  assert.ok(preview[3].signal instanceof AbortSignal);assert.equal(typeof preview[3].verifyPublication,'function');
  assert.deepEqual(f.project,before);assert.equal(f.nodes['adopt-spring'].disabled,false);
  assert.match(f.nodes['spring-result'].textContent,/Targets satisfied/);assert.match(f.nodes['spring-result'].textContent,/uniformity not established/);
  await f.controls.adopt();const commit=called(f,'commit');assert.equal(commit[1],SPRING_OPERATION);assert.equal(commit[2].adoption,'constraints-satisfied');
  assert.equal(typeof commit[4].verifyPublication,'function');assert.ok(commit[4].signal instanceof AbortSignal);
  commit[4].sourceSnapshot.metadata.offColors.faces[0].values[3]=0;assert.deepEqual(f.project,before);
  assert.equal(f.controls.previewData,null);assert.equal(f.controls.busy,false);
});
test('literal signed advanced source constraints survive exactly and seeded options are explicit',async()=>{
  const f=fixture();f.nodes['spring-initialization'].value='random';f.nodes['spring-seed'].value='4294967295';
  f.nodes['spring-regular-faces'].checked=true;
  const constraints={face_steps:[-1,2,-2,1],edge_weights:[1,2,3,4,5,6],extra_springs:[{vertices:[3,0],length:1.5,weight:2}],
    pins:[{vertex:2,position:[.5,-2,1]}]};f.nodes['spring-constraints'].value=JSON.stringify(constraints);
  await f.controls.preview();const solver=called(f,'preview')[2].solver;
  for(const [key,value]of Object.entries(constraints))assert.deepEqual(solver[key],value);
  assert.equal(solver.seed,4294967295);assert.equal(solver.initialization,'random');assert.equal(solver.regular_faces,true);
});
test('unresolved result cannot commit without separate explicit adoption, status never relabelled uniform',async()=>{
  const f=fixture();f.context.preview=async()=>packet(f.state.model,{satisfied:false});await f.controls.preview();
  assert.equal(f.nodes['adopt-spring'].disabled,true);assert.equal(f.nodes['spring-accept-near-miss'].disabled,false);
  await assert.rejects(()=>f.controls.adopt(),/Explicitly accept/);assert.equal(called(f,'commit'),undefined);
  f.nodes['spring-accept-near-miss'].checked=true;f.controls.sync();assert.equal(f.nodes['adopt-spring'].disabled,false);
  await f.controls.adopt();assert.equal(called(f,'commit')[2].adoption,'valid-near-miss');
  assert.match(f.nodes['spring-result'].textContent,/Targets unresolved/);assert.match(f.nodes['spring-result'].textContent,/stationary-residual/);
});
test('invalid preview remains diagnostics only under both checkbox policies',async()=>{
  const f=fixture();f.context.preview=async()=>packet(f.state.model,{valid:false,satisfied:false});await f.controls.preview();
  assert.equal(f.nodes['adopt-spring'].disabled,true);f.nodes['spring-accept-near-miss'].checked=true;
  await assert.rejects(()=>f.controls.adopt(),/Invalid realizations/);assert.equal(called(f,'commit'),undefined);
  assert.match(f.nodes['spring-result'].textContent,/Collapsed source edge/);
});
test('geometry dimension/closure/ownership limits gate controls without convexity assumptions',async()=>{
  for(const mutate of [m=>m.dimension=4,m=>m.embeddingDimension=4,m=>m.faces.pop(),m=>m.edges.push([0,1]),
    m=>m.edges[0][0]=true,m=>m.vertices.push([1,2,3]),m=>m.cells.push([0]),m=>m.vertices[0][0]=Infinity]){
    const f=fixture();mutate(f.state.model);f.controls.sync();assert.equal(f.nodes['preview-spring'].disabled,true);
    await assert.rejects(()=>f.controls.preview());assert.equal(f.calls.length,0);
  }
  assert.equal(eligibleSpringSource(tetra()),true);
});
test('advanced JSON unknown/scalar keys refuse before numeric/native calls',async()=>{
  for(const [id,value] of [['spring-constraints','[]'],['spring-constraints','null'],
    ['spring-constraints','{"max_seconds":1}'],['spring-constraints','{"pins":1}'],['spring-constraints','{bad}']]){
    const f=fixture();f.nodes[id].value=value;await assert.rejects(()=>f.controls.preview());assert.equal(f.calls.length,0);
  }
});
test('numeric native refusals/nonfinite/out-of-range scalars never reach preview',async()=>{
  for(const value of [NaN,Infinity,-1,0,'1',true,1e101]){
    const f=fixture();f.context.number=async()=>value;await assert.rejects(()=>f.controls.preview());assert.equal(called(f,'preview'),undefined);
  }
  const f=fixture();f.context.number=async()=>{throw Error('Native equation refused');};
  await assert.rejects(()=>f.controls.preview(),/Native equation refused/);assert.equal(f.controls.busy,false);
});
test('source RGBA/unit/metadata/notes/project/state/history/controls mutations during each numeric await refuse',async()=>{
  const changes=[f=>f.state.model.vertices[0][0]=2,f=>f.state.model.metadata.offColors.faces[0].values[3]=126,
    f=>f.state.model.metadata.arbitrary.keep[0]=2,f=>f.state.model.metadata.coordinateUnits='cm',f=>f.state.view.coordinateUnit='cm',
    f=>f.state.notes='edited',f=>f.doc.states=[f.state],f=>f.doc.operationHistory={version:1,nodes:[]},
    f=>f.setProject({...f.project}),f=>f.nodes['spring-edge-length'].value='2',f=>f.setExport(true)];
  for(const change of changes){
    const f=fixture(),numbers=holdNumbers(f),run=f.controls.preview();change(f);numbers[0].resolve(1);
    await assert.rejects(run);assert.equal(called(f,'preview'),undefined);numbers.slice(1).forEach((p,i)=>p.resolve([1,1e-8,1e-11,0,500][i]));
    assert.equal(f.controls.busy,false);
  }
});
test('late preview response checks ownership again and cannot enable adoption after source/export changes',async()=>{
  for(const change of [f=>f.state.model.metadata.offColors.faces[0]=null,f=>f.setExport(true),f=>f.doc.operationHistory={version:1,nodes:[]}]){
    const f=fixture(),pending=deferred();f.context.preview=()=>pending.promise;const run=f.controls.preview();await flush();
    const response=packet(f.state.model);change(f);pending.resolve(response);await assert.rejects(run);
    assert.equal(f.controls.previewData,null);assert.equal(f.nodes['adopt-spring'].disabled,true);
  }
});
test('current preview invalidates on source/control edits, adoption cannot rebind silently',async()=>{
  for(const change of [f=>f.nodes['spring-evaluations'].value='501',f=>f.state.model.metadata.coordinateUnits='cm',
    f=>f.doc.operationHistory={version:1,nodes:[]},f=>f.setProject({...f.project})]){
    const f=fixture();await f.controls.preview();change(f);f.controls.sync();assert.equal(f.controls.previewData,null);
    await assert.rejects(()=>f.controls.adopt());assert.equal(called(f,'commit'),undefined);
  }
});
test('final commit provider callback refuses late export/source/parameter/adoption changes immediately before publication',async()=>{
  const changes=[f=>f.setExport(true),f=>f.state.model.metadata.offColors.faces[0]=null,
    f=>f.doc.operationHistory={version:1,nodes:[]},f=>f.nodes['spring-accept-near-miss'].checked=true];
  for(const change of changes){
    const f=fixture();await f.controls.preview();const pending=deferred();let options,published=false;
    f.context.commit=async(op,params,label,o)=>{options=o;await pending.promise;o.verifyPublication();published=true;};
    const run=f.controls.adopt();await flush();change(f);pending.resolve();await assert.rejects(run);assert.equal(published,false);assert.ok(options.signal.aborted);
  }
  const f=fixture();await f.controls.preview();f.context.commit=async(op,params,label,o)=>{params.solver.seed=1;o.verifyPublication();};
  await assert.rejects(()=>f.controls.adopt(),/parameters changed/);
});
test('successful provider can publish changed source after its final callback without false postcommit source rejection',async()=>{
  const f=fixture();await f.controls.preview();f.context.commit=async(op,params,label,o)=>{
    o.verifyPublication();f.doc.states.push({model:packet(f.state.model).result.model,view:{coordinateUnit:'mm'},notes:'Keep notes'});f.doc.cursor=1;f.controls.sync();return f.doc;};
  assert.equal(await f.controls.adopt(),f.doc);assert.equal(f.controls.busy,false);assert.equal(f.doc.cursor,1);
});
test('cancel ignored async number/preview providers never publish late packets and permits clean retry',async()=>{
  for(const kind of ['number','preview']){
    const f=fixture(),pending=deferred();let signal;
    if(kind==='number')f.context.number=(text,options)=>{signal=options.signal;return pending.promise;};
    else f.context.preview=(op,params,options)=>{signal=options.signal;return pending.promise;};
    const run=f.controls.preview();await flush();assert.equal(f.controls.cancel(),true);await assert.rejects(run,/canceled/);assert.ok(signal.aborted);
    pending.resolve(kind==='number'?1:packet(f.state.model));await flush();assert.equal(f.controls.previewData,null);
    f.context.number=async text=>Number(text);f.context.preview=async()=>packet(f.state.model);await f.controls.preview();assert.ok(f.controls.previewData);
  }
});
test('busy/export guards run before numeric/native jobs; destroy cancels pending job',async()=>{
  const f=fixture();f.setExport(true);await assert.rejects(()=>f.controls.preview(),/export/);assert.equal(f.calls.length,0);
  f.setExport(false);const pending=deferred();f.context.preview=()=>pending.promise;const run=f.controls.preview();await flush();
  await assert.rejects(()=>f.controls.preview(),/Finish or cancel/);f.controls.destroy();await assert.rejects(run,/canceled/);
  pending.reject(Error('late native error'));await flush();assert.equal(f.controls.panel.removed,true);
});
test('forged response flags/source/colors/incidence/missing ownership reject instead of granting adoption',async()=>{
  const changes=[p=>p.runtimePartialPublished=true,p=>p.algorithmVersion='0.2.0',p=>p.result.uniform=true,
    p=>p.adoption.publishable=false,p=>p.adoption.constraintsSatisfied=false,p=>p.result.evidence.sourceModel.metadata.coordinateUnits='cm',
    p=>p.result.model.metadata.offColors.faces[0]=null,p=>p.result.model.faces[0].reverse(),
    p=>delete p.result.model.fingerprint,p=>p.result.evidence.geometricValidity.passed=false,p=>p.result.model.numeric.certified=true];
  for(const change of changes){const f=fixture(),response=packet(f.state.model);change(response);f.context.preview=async()=>response;
    await assert.rejects(()=>f.controls.preview());assert.equal(f.controls.previewData,null);assert.equal(f.nodes['adopt-spring'].disabled,true);}
});
test('response accessor or cyclic/nonplain JSON is rejected without invoking getters',async()=>{
  const f=fixture();let reads=0;const response=packet(f.state.model);Object.defineProperty(response,'evil',{get(){reads++;return 1;},enumerable:true});
  f.context.preview=async()=>response;await assert.rejects(()=>f.controls.preview(),/accessors/);assert.equal(reads,0);
  const g=fixture(),cycle=packet(g.state.model);cycle.self=cycle;g.context.preview=async()=>cycle;await assert.rejects(()=>g.controls.preview(),/acyclic/);
});
test('native batch evaluates scalar and integer expressions once under one source owner',async()=>{
  const f=fixture();f.nodes['spring-edge-length'].value='sqrt(4)';f.nodes['spring-seed'].value='2^5';f.nodes['spring-evaluations'].value='2*250';
  f.context.number=()=>assert.fail('Native batch should own all numeric entries');
  f.context.evaluateMany=async(expressions,options)=>{f.calls.push(['batch',expressions,options]);return [2,1,1e-8,1e-11,32,500];};
  await f.controls.preview();const batch=called(f,'batch');assert.deepEqual(batch[1],['sqrt(4)','1','1e-8','1e-11','2^5','2*250']);
  assert.equal(batch[2].mode,'real');assert.ok(batch[2].signal instanceof AbortSignal);
  assert.equal(called(f,'preview')[2].solver.seed,32);assert.equal(called(f,'preview')[2].solver.edge_length,2);
});
test('native batch late owner/field edits, integer fractions and malformed results cannot publish',async()=>{
  for(const change of [f=>f.setExport(true),f=>f.state.model.metadata.coordinateUnits='cm',f=>f.nodes['spring-seed'].value='2']){
    const f=fixture(),pending=deferred();f.context.evaluateMany=()=>pending.promise;const run=f.controls.preview();change(f);
    pending.resolve([1,1,1e-8,1e-11,0,500]);await assert.rejects(run);assert.equal(called(f,'preview'),undefined);
  }
  for(const values of [[1,1,1e-8,1e-11,.5,500],[1,1,1e-8,1e-11,0,2001],[1,1],{values:[1,1,1e-8,1e-11,0,500]}]){
    const f=fixture();f.context.evaluateMany=async()=>values;await assert.rejects(()=>f.controls.preview());assert.equal(called(f,'preview'),undefined);
  }
  const f=fixture(),values=[1,1,1e-8,1e-11,0,500];let reads=0;Object.defineProperty(values,0,{get(){reads++;return 1;},enumerable:true});
  f.context.evaluateMany=async()=>values;await assert.rejects(()=>f.controls.preview(),/accessors/);assert.equal(reads,0);
});
