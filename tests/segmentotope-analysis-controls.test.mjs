import test from 'node:test';
import assert from 'node:assert/strict';
import {SegmentotopeAnalysisControls,strictPredicateSummary} from '../ui/segmentotope-analysis-controls.mjs';

// Hand-authored 4-simplex incidence, independent of the production generator.
const model=()=>({id:'simplex-source',fingerprint:'a'.repeat(64),dimension:4,embeddingDimension:4,
  vertices:[[0,0,0,0],[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]],
  edges:[[0,1],[0,2],[0,3],[0,4],[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]],
  faces:[[0,1,2],[0,1,3],[0,1,4],[0,2,3],[0,2,4],[0,3,4],[1,2,3],[1,2,4],[1,3,4],[2,3,4]],
  cells:[[0,1,3,6],[0,2,4,7],[1,2,5,8],[3,4,5,9],[6,7,8,9]],
  metadata:{source:{originalParameters:{height:'1/2'}},offColors:{faces:[{values:[.2,.4,.6,.8],encoding:'unit'}]}}});
// Response fixtures exercise envelope/UI behavior; they do not assert that
// this coordinate simplex has mathematically passed equal-edge predicates.
const result=(source,status='passed')=>({status,sourceModelId:source.id,sourceFingerprint:source.fingerprint,certified:false,
  strictPredicatesPassed:status==='passed',numeric:{mode:'float64-approximate',tolerance:1e-8},diagnostics:[],
  checks:status==='unsupported'||status==='invalid'?{}:{twoParallelLayers:{passed:true,normalizedResidual:1e-16},equalEdges:{passed:status==='passed',relativeResidual:status==='passed'?3e-16:.2},
    commonHypersphere:{passed:true,relativeResidual:2e-16},orderedRegularFaces:{passed:true,faces:source.faces.map((_,sourceFaceId)=>({sourceFaceId,passed:true,sideRelativeResidual:1e-16,turnCosineResidual:2e-16,circleRelativeResidual:3e-16}))}}});

function fixture(){
  let state={model:model(),view:{angles:[0,0,0,0,0,0],camera:{position:[3,2,5]}}},exporting=false;
  const button={disabled:false},output={textContent:'',dataset:{},style:{}},calls=[],panel={querySelector:selector=>selector==='#analyze-strict-segmentotope'?button:output};
  const control=Object.create(SegmentotopeAnalysisControls.prototype);
  Object.assign(control,{panel,output,busy:false,publishedOwner:null,context:{getState:()=>state,isExporting:()=>exporting,guard:fn=>fn,
    analyze:async(source,params)=>{calls.push({source,params});return result(source);}}});
  control.sync();return {control,button,output,calls,get state(){return state;},setState:value=>state=value,setExport:value=>exporting=value};
}

test('read-only native request is detached and preserves full model data without creating state/history',async()=>{
  const f=fixture(),before=structuredClone(f.state),state=f.state;const summary=await f.control.analyze();
  assert.equal(f.state,state);assert.deepEqual(f.state,before);assert.equal(f.calls.length,1);assert.notEqual(f.calls[0].source,state.model);
  assert.deepEqual(f.calls[0].source,state.model);assert.deepEqual(f.calls[0].params,{tolerance:1e-8});
  f.calls[0].source.vertices[0][0]=99;f.calls[0].source.metadata.offColors.faces[0].values[3]=.1;assert.deepEqual(f.state,before);
  assert.equal(summary.status,'passed');assert.equal(f.output.dataset.status,'passed');assert.match(summary.text,/Float64 tolerance 1e-8/);assert.match(summary.text,/not a certificate/);
  assert.match(summary.text,/Two W layers: pass; normalized 1\.00e-16/);assert.match(summary.text,/turn cosine 2\.00e-16/);assert.equal(f.control.busy,false);
});

test('all four native statuses show numerical scope without promoting unsupported results',async()=>{
  for(const status of ['passed','not-strict','unsupported','invalid']){
    const f=fixture();f.control.context.analyze=async source=>({...result(source,status),diagnostics:status==='unsupported'?[{message:'Ordered convex boundary is not verified.'}]:[]});
    const summary=await f.control.analyze();assert.equal(summary.status,status);assert.equal(f.output.dataset.status,status);
    assert.match(summary.text,/Float64/);assert.match(summary.text,/not a certificate/);
    if(status==='not-strict')assert.match(summary.text,/Equal edges: fail; relative 2\.00e-1/);
    if(status==='unsupported')assert.match(summary.text,/not verified/);
  }
});

test('native source ID/fingerprint mismatches or null binding never publish',async()=>{
  for(const change of [r=>r.sourceModelId='other',r=>r.sourceFingerprint='b'.repeat(64),r=>r.sourceModelId=null,r=>r.sourceFingerprint=null]){
    const f=fixture();f.control.context.analyze=async source=>{const r=result(source);change(r);return r;};
    await assert.rejects(()=>f.control.analyze(),/source model ID and fingerprint/);assert.equal(f.output.textContent,'');assert.equal(f.output.dataset.status,undefined);assert.equal(f.control.busy,false);
  }
});

test('new state/model pointer and geometry/color/provenance mutations fence pending responses',async()=>{
  for(const change of [f=>f.setState({...f.state}),f=>f.state.model=structuredClone(f.state.model),
    f=>f.state.model.vertices[1][0]=2,f=>f.state.model.faces[0].reverse(),f=>f.state.model.metadata.offColors.faces[0].values[3]=.5,
    f=>f.state.model.metadata.source.originalParameters.height='3/2',f=>f.state.model.fingerprint='b'.repeat(64)]){
    const f=fixture();let finish;f.control.context.analyze=source=>new Promise(resolve=>finish=()=>resolve(result(source)));
    const pending=f.control.analyze();change(f);finish();await assert.rejects(pending,/changed during predicate analysis/);assert.equal(f.output.textContent,'');assert.equal(f.control.busy,false);
  }
});

test('animated angle/camera and note changes retain valid model-bound read-only results',async()=>{
  const f=fixture();let finish;f.control.context.analyze=source=>new Promise(resolve=>finish=()=>resolve(result(source)));
  const pending=f.control.analyze();f.state.view.angles[4]=42;f.state.view.camera.position=[7,2,5];f.state.note='Analysis notes';finish();
  assert.equal((await pending).status,'passed');assert.equal(f.state.view.angles[4],42);assert.equal(f.state.note,'Analysis notes');f.control.sync();assert.match(f.output.textContent,/predicates passed/);
});

test('export blocks initial calls and rejects export beginning during native await',async()=>{
  const initial=fixture();initial.setExport(true);initial.control.sync();assert.equal(initial.button.disabled,true);
  await assert.rejects(()=>initial.control.analyze(),/animation export/);assert.deepEqual(initial.calls,[]);
  const f=fixture();let finish;f.control.context.analyze=source=>new Promise(resolve=>finish=()=>resolve(result(source)));
  const pending=f.control.analyze();f.setExport(true);finish();await assert.rejects(pending,/animation export/);assert.equal(f.output.textContent,'');assert.equal(f.button.disabled,true);
});

test('busy request cannot duplicate and native refusal releases controls for explicit retry',async()=>{
  const f=fixture();let reject;f.control.context.analyze=()=>new Promise((_,r)=>reject=r);const pending=f.control.analyze();
  assert.equal(f.button.disabled,true);await assert.rejects(()=>f.control.analyze(),/current strict-predicate/);reject(Error('Native classification refused'));
  await assert.rejects(pending,/classification refused/);assert.equal(f.control.busy,false);assert.equal(f.button.disabled,false);assert.equal(f.output.textContent,'');
  f.control.context.analyze=async source=>result(source);assert.equal((await f.control.analyze()).status,'passed');
});

test('later sync clears source-obsolete results but preserves them through view changes',async()=>{
  const f=fixture();await f.control.analyze();f.state.view.angles[0]=19;f.control.sync();assert.equal(f.output.dataset.status,'passed');
  f.state.model.metadata.extra='changed';f.control.sync();assert.equal(f.output.textContent,'');assert.equal(f.output.dataset.status,undefined);
  await f.control.analyze();f.setState({...f.state});f.control.sync();assert.equal(f.output.textContent,'');
});

test('unsupported dimensions, missing identities and resource excess disable/refuse before native work',async()=>{
  for(const change of [m=>m.dimension=3,m=>m.embeddingDimension=3,m=>delete m.fingerprint,m=>m.fingerprint='bad',m=>m.id='',
    m=>m.vertices=Array.from({length:65},()=>[0,0,0,0])]){
    const f=fixture();change(f.state.model);f.control.sync();assert.equal(f.button.disabled,true);await assert.rejects(()=>f.control.analyze(),/source-bound intrinsic 4D/);assert.deepEqual(f.calls,[]);
  }
});

test('bounded complete-model snapshots refuse cycles/getters/nonfinite/deep attributes without native work',async()=>{
  for(const change of [m=>m.metadata.loop=m,m=>m.metadata.nan=NaN,m=>{let node=m.metadata;for(let i=0;i<70;i++)node=node.next={};}]){
    const f=fixture();change(f.state.model);await assert.rejects(()=>f.control.analyze());assert.deepEqual(f.calls,[]);
  }
  const f=fixture();let reads=0;Object.defineProperty(f.state.model.metadata,'unsafe',{enumerable:true,get(){reads++;return 'unsafe';}});
  await assert.rejects(()=>f.control.analyze(),/accessors/);assert.equal(reads,0);assert.deepEqual(f.calls,[]);
});

test('forged numerical scope, missing checks and malformed source-face residuals refuse publication',async()=>{
  for(const change of [r=>r.certified=true,r=>r.status='uniform',r=>r.numeric.mode='exact',r=>r.numeric.tolerance=1e-4,
    r=>r.strictPredicatesPassed=false,r=>delete r.checks.equalEdges,r=>r.checks.equalEdges.relativeResidual=NaN,
    r=>r.checks.equalEdges.relativeResidual=.1,r=>r.checks.orderedRegularFaces.faces.pop(),
    r=>r.checks.orderedRegularFaces.faces[1].sourceFaceId=0,r=>r.checks.orderedRegularFaces.faces[0].turnCosineResidual=-1,
    r=>r.checks.orderedRegularFaces.faces[0].passed=false,r=>r.checks.orderedRegularFaces.faces[0].turnCosineResidual=.1]){
    const f=fixture();f.control.context.analyze=async source=>{const r=result(source);change(r);return r;};
    await assert.rejects(()=>f.control.analyze(),/native|predicate/);assert.equal(f.output.textContent,'');
  }
});

test('diagnostic text is bounded and rendered as text, with no markup interpretation',async()=>{
  const f=fixture(),message='<img src=x onerror=alert(1)> '+ 'x'.repeat(400);
  f.control.context.analyze=async source=>({...result(source,'unsupported'),diagnostics:[{message},{message:'second'},{message:'third'},{message:'omitted'}]});
  const summary=await f.control.analyze();assert.match(f.output.textContent,/<img/);assert.equal(summary.text.includes('omitted'),false);assert.equal(summary.text.split('\n')[1].length,256);
  assert.throws(()=>strictPredicateSummary({...result(f.state.model),diagnostics:null},f.state.model),/diagnostics/);
});

test('constructor mounts one guarded read-only row inside the existing layer panel',async()=>{
  const previous=globalThis.document,f=fixture(),inserted=[];let guarded=0;
  try{
    const row={...f.control.panel,className:'',innerHTML:''};globalThis.document={getElementById:id=>id==='layer-join-settings'?{append:node=>inserted.push(node)}:null,createElement:()=>row};
    const control=new SegmentotopeAnalysisControls({...f.control.context,guard:fn=>{guarded++;return fn;}});
    assert.deepEqual(inserted,[row]);assert.equal(guarded,1);assert.match(row.innerHTML,/Strict predicates/);assert.match(row.innerHTML,/aria-live="polite"/);
    assert.equal(f.output.style.whiteSpace,'pre-line');await f.button.onclick();assert.equal(f.calls.length,1);assert.equal(control.output.dataset.status,'passed');
    globalThis.document.getElementById=()=>null;assert.throws(()=>new SegmentotopeAnalysisControls(f.control.context),/parallel layer join panel/);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
