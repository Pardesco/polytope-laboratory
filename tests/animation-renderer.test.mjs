import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {AnimationRenderer} from '../ui/animation-renderer.mjs';
import {prepareAnimationAdapters} from '../ui/animation-adapters.mjs';
import {createSequence,withSequenceTracks} from '../ui/animation.mjs';
import {Viewer} from '../ui/viewer.js';

const cube=()=>({id:'independent-cube',fingerprint:'a'.repeat(64),dimension:3,embeddingDimension:3,interpretation:'convex-polytope',vertices:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],edges:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],cells:[]});
function state(){const model=cube(),view={angles:Array(6).fill(0),projection:'orthographic',sectionOffset:0,derivedMode:'dual',net:{root:2,length:37,tabs:false},surfaceOpacity:1};const sequence=withSequenceTracks(createSequence(view,2,4),{explosion:{direction:'normal'}});sequence.keyframes[1].explosionAmount=1;sequence.keyframes[1].sectionOffset=2;return {model,view:{...view,animation:sequence},notes:'preserved source'};}
function actualViewer(model){const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.setModel(model);v.supportsExplosion=true;return v;}
function harness(source=state()){
  let current=source;const calls=[],viewer=actualViewer(source.model),netViewer={setNet:net=>calls.push(['setNet',net]),setFold:f=>calls.push(['setFold',f]),setDisplay:view=>calls.push(['netDisplay',structuredClone(view)]),fit:()=>calls.push(['fit']),restoreCamera:camera=>calls.push(['restoreCamera',camera]),draw:()=>calls.push(['netDraw'])};
  const setExplosion=viewer.setExplosion.bind(viewer);viewer.setExplosion=payload=>{calls.push(['explosion',payload?.amount??null]);return setExplosion(payload);};viewer.draw=()=>calls.push(['draw']);
  const context={getState:()=>current,viewer,netViewer,run:async()=>{throw Error('Unexpected native job');},display:()=>{calls.push(['display']);viewer.setDisplay(current.view);},syncPose:view=>calls.push(['sync',structuredClone(view)]),refreshDerived:async()=>calls.push(['refreshDerived']),refreshSection:async()=>calls.push(['refreshSection']),showNet:pose=>calls.push(['showNet',pose.frame.foldFraction])};
  const renderer=new AnimationRenderer(context);return {source,viewer,netViewer,context,renderer,calls,setCurrent:s=>current=s};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const count=(h,kind)=>h.calls.filter(c=>c[0]===kind).length;
function independentCubeNet(model){
  const q=Math.SQRT1_2,components=model.faces.map((_,id)=>({root:id,targetQuaternion:id<2?[0,0,0,1]:id===2||id===4?[q,0,0,q]:[0,q,0,q],targetTranslation:[[0,0,-1],[0,0,1],[0,-1,0],[1,0,0],[0,1,0],[-1,0,0]][id]}));
  return {algorithmVersion:'0.3.0',units:'mm',sourceFingerprint:model.fingerprint,sourceId:model.id,scale:1,referenceEdgeLengthMm:2,sourceFaceCount:6,sourceEdges:structuredClone(model.edges),targetVertices:structuredClone(model.vertices),traversalOrder:[0,1,2,3,4,5],components,faces:model.faces.map((ids,id)=>({id,sourceVertices:[...ids],points:ids.map(v=>{const [x,y,z]=model.vertices[v];return id<2?[x,y]:id===2||id===4?[x,z]:[-z,y];}),parent:null,parentHinge:null,foldAngle:0,component:id}))};
}
function simplex(){
  const model={id:'literal-simplex',fingerprint:'b'.repeat(64),dimension:4,embeddingDimension:4,interpretation:'convex-polytope',vertices:[[0,0,0,0],[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]],edges:[[0,1],[0,2],[0,3],[0,4],[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]],faces:[[0,1,2],[0,1,3],[0,1,4],[0,2,3],[0,2,4],[0,3,4],[1,2,3],[1,2,4],[1,3,4],[2,3,4]],cells:[[6,7,8,9],[3,4,5,9],[1,2,5,8],[0,2,4,7],[0,1,3,6]]};
  const radius=Math.sqrt(19)/5,cache={algorithmVersion:'cell-facing-1',sourceFingerprint:model.fingerprint,normalization:{center:[.2,.2,.2,.2],radius},sourceCellIds:[0,1,2,3,4],cells:model.cells.map((f,cell)=>{const normal=cell===0?[.5,.5,.5,.5]:Array.from({length:4},(_,axis)=>axis===cell-1?-1:0);return {cell,sourceVertexIds:[...new Set(f.flatMap(id=>model.faces[id]))].sort((a,b)=>a-b),normalizedPlane:{normal,offset:(cell===0?.1:.2)/radius}};})};return {model,cache};
}
function saved4D(){const source=state(),value=simplex();source.model=value.model;source.view.explosionAmount=.5;return {source,cache:value.cache};}

test('capabilities require actual explosion advertisement and both linked rigid-net methods',()=>{
  const h=harness();assert.deepEqual(h.renderer.capabilities(),{morphRatio:true,explosion:true,fold:true});h.viewer.supportsExplosion=false;assert.equal(h.renderer.capabilities().explosion,false);delete h.netViewer.setFold;assert.equal(h.renderer.capabilities().fold,false);
});

test('qualified adapter poses render source-bound actual explosion before display/draw without mutating model',async()=>{
  const h=harness(),modelBefore=structuredClone(h.source.model),session=await prepareAnimationAdapters({state:h.source,getState:h.context.getState});
  await session.apply(1,(pose,o)=>h.renderer.renderTracks(pose,o));assert.deepEqual(h.calls.map(c=>c[0]),['explosion','display','sync','draw']);assert.equal(h.calls[0][1],.5);assert.equal(h.viewer.model,h.source.model);assert.equal(h.viewer.pointGeometry.attributes.position.count,24);assert.equal(h.viewer.projected.length,8);assert.equal(h.viewer.renderTriangles.length,12);assert.equal(h.source.view.explosionAmount,.5);assert.deepEqual(h.source.model,modelBefore);
  await session.apply(2,(pose,o)=>h.renderer.renderTracks(pose,o));assert.equal(h.source.view.explosionAmount,1);assert.ok(Math.abs(h.viewer.explosionDisplay.vertices[0].normalized[2]+1+1/Math.sqrt(3))<1e-10);session.destroy();
});

test('cancelled adapter restores complete original field absence and zero buffers through renderer refresh',async()=>{
  const h=harness(),original=structuredClone(h.source.view),session=await prepareAnimationAdapters({state:h.source,getState:h.context.getState});await session.apply(2,(p,o)=>h.renderer.renderTracks(p,o));session.cancel();const restore=await session.restore((p,o)=>h.renderer.renderTracks(p,o));
  assert.equal(restore.restoring,true);assert.deepEqual(h.source.view,original);assert.equal(Object.hasOwn(h.source.view,'explosionAmount'),false);assert.equal(h.viewer.explosionDisplay,null);assert.equal(h.viewer.pointGeometry.attributes.position.count,8);assert.equal(h.viewer.renderTriangles,null);assert.equal(count(h,'refreshDerived'),1);session.destroy();
});

test('renderer restoration retains prior nonzero presentation amount and original view values',async()=>{
  const h=harness();h.source.view.explosionAmount=.25;const original=structuredClone(h.source.view),session=await prepareAnimationAdapters({state:h.source,getState:h.context.getState});await session.apply(2,(p,o)=>h.renderer.renderTracks(p,o));session.cancel();await session.restore((p,o)=>h.renderer.renderTracks(p,o));assert.deepEqual(h.source.view,original);assert.equal(h.viewer.explosionDisplay.amount,.25);assert.equal(h.viewer.pointGeometry.attributes.position.count,24);session.destroy();
});

test('actual viewer rejects forged source payload before replacing complete view or drawing',async()=>{
  const h=harness(),before=structuredClone(h.source),session=await prepareAnimationAdapters({state:h.source,getState:h.context.getState}),pose=session.evaluate(1);pose.baseExplosion.sourceFingerprint='f'.repeat(64);await assert.rejects(()=>h.renderer.renderTracks(pose),/fingerprint/);assert.deepEqual(h.source,before);assert.equal(count(h,'draw'),0);assert.equal(count(h,'display'),0);session.destroy();
});

test('nonzero explosion cannot publish without advertised capability and an actual applied successful status',async t=>{
  for(const [name,configure] of [
    ['missing setter',h=>h.context.viewer={supportsExplosion:true,draw:()=>h.calls.push(['draw'])}],
    ['missing status',h=>h.viewer.setExplosion=()=>undefined],
    ['unadvertised capability',h=>h.viewer.supportsExplosion=false],
    ['not applied',h=>h.viewer.setExplosion=()=>({supported:true,applied:false,diagnostic:null})],
    ['diagnostic despite supported',h=>h.viewer.setExplosion=()=>({supported:true,applied:true,diagnostic:'Incomplete exploded source patch'})],
  ])await t.test(name,async()=>{const h=harness(),before=structuredClone(h.source.view),session=await prepareAnimationAdapters({state:h.source,getState:h.context.getState}),pose=session.evaluate(1);configure(h);await assert.rejects(()=>h.renderer.renderTracks(pose),/Explosion|explosion|Incomplete/);assert.deepEqual(h.source.view,before);assert.equal(count(h,'display'),0);assert.equal(count(h,'draw'),0);session.destroy();});
});

test('post-display actual explosion failure blocks draw and known partial pose remains restorable',async()=>{
  const h=harness(),original=structuredClone(h.source.view),session=await prepareAnimationAdapters({state:h.source,getState:h.context.getState}),display=h.context.display;let fail=true;h.context.display=()=>{display();if(fail)h.viewer.explosionDiagnostic='GPU presentation failed after preparation';};await assert.rejects(()=>session.apply(1,(p,o)=>h.renderer.renderTracks(p,o)),/GPU presentation failed/);assert.equal(count(h,'draw'),0);fail=false;await session.restore((p,o)=>h.renderer.renderTracks(p,o));assert.deepEqual(h.source.view,original);assert.equal(h.viewer.explosionDisplay,null);session.destroy();
});

test('mismatched source, aborted signal and stale generation cannot touch source view or viewer payload',async()=>{
  const h=harness(),session=await prepareAnimationAdapters({state:h.source,getState:h.context.getState}),pose=session.evaluate(1),before=structuredClone(h.source);pose.source={...pose.source,fingerprint:'f'.repeat(64)};await assert.rejects(()=>h.renderer.renderTracks(pose),/another source/);const valid=session.evaluate(1),controller=new AbortController();controller.abort();await assert.rejects(()=>h.renderer.renderTracks(valid,{signal:controller.signal}),/cancelled/);await assert.rejects(()=>h.renderer.renderTracks(valid,{isCurrent:()=>false}),/cancelled/);assert.deepEqual(h.source,before);assert.equal(h.calls.length,0);session.destroy();
});

test('native preflight forwards guarded detached source and rejects late source/abort ownership',async()=>{
  const h=harness(),job=deferred(),controller=new AbortController(),model=structuredClone(h.source.model);let current=true,request;h.context.run=async(...args)=>{request=args;return job.promise;};const pending=h.renderer.loadPlanes(model,{signal:controller.signal,isCurrent:()=>current});assert.equal(request[0],'cell-facing');assert.equal(request[2],model);assert.notEqual(request[2],h.source.model);assert.equal(request[4].signal,controller.signal);current=false;controller.abort();job.resolve({planes:'stale'});await assert.rejects(()=>pending,/source changed/);assert.equal(h.calls.length,0);
  const other=harness(),response=deferred();other.context.run=async()=>response.promise;const old=other.renderer.loadPlanes(structuredClone(other.source.model));other.setCurrent({...state(),model:{...cube(),fingerprint:'c'.repeat(64)}});response.resolve({planes:'wrong document'});await assert.rejects(()=>old,/source changed/);
});

test('net preflight snapshots physical settings before await and propagates native rejection',async()=>{
  const h=harness(),job=deferred();let request;h.context.run=async(...args)=>{request=args;return job.promise;};const model=structuredClone(h.source.model),pending=h.renderer.loadNet(model);h.source.view.net.root=5;h.source.view.net.length=99;assert.deepEqual(request.slice(0,3),['net',{root:2,edge_length_mm:37,tabs:false},model]);job.resolve({qualifiedNet:'result'});await assert.rejects(pending,/layout\/history changed/);
  h.context.run=async()=>{throw Error('Native net reconstruction failed');};await assert.rejects(()=>h.renderer.loadNet(model),/Native net reconstruction failed/);
});

test('stable fold descriptor installs once, restores observer camera once and draws absolute fold poses',async()=>{
  const h=harness();h.source.view.animation=withSequenceTracks(h.source.view.animation,{explosion:{direction:'normal'},fold:{kind:'face-net'}},h.source.view);h.source.view.animation.keyframes[1].foldFraction=1;h.source.netLayout=independentCubeNet(h.source.model);h.source.view.derivedCamera={position:[1,2,3],target:[0,0,0]};const session=await prepareAnimationAdapters({state:h.source,getState:h.context.getState}),first=session.evaluate(.5),second=session.evaluate(1.5);assert.equal(first.foldNet,second.foldNet);await h.renderer.renderTracks(first);await h.renderer.renderTracks(second);assert.equal(count(h,'setNet'),1);assert.equal(count(h,'restoreCamera'),1);assert.equal(count(h,'fit'),0);assert.deepEqual(h.calls.filter(c=>c[0]==='setFold').map(c=>c[1]),[.25,.75]);assert.equal(count(h,'netDraw'),2);assert.equal(count(h,'refreshSection'),0);session.destroy();
});

test('a newer seek owns the final view and old awaited section job cannot draw over it',async()=>{
  const h=harness();h.source.view.derivedMode='section';const session=await prepareAnimationAdapters({state:h.source,getState:h.context.getState}),first=deferred();let jobs=0;h.context.refreshSection=()=>++jobs===1?first.promise:Promise.resolve();
  const old=session.apply(.5,(p,o)=>h.renderer.renderTracks(p,o));assert.equal(h.source.view.sectionOffset,.5);await session.apply(2,(p,o)=>h.renderer.renderTracks(p,o));assert.equal(h.source.view.sectionOffset,2);assert.equal(h.source.view.explosionAmount,1);assert.equal(count(h,'draw'),1);first.resolve();await assert.rejects(()=>old,/cancelled/);assert.equal(h.source.view.sectionOffset,2);assert.equal(count(h,'draw'),1);session.destroy();
});

test('manual complete-view edit during async section preparation prevents stale draw and later restoration',async()=>{
  const h=harness();h.source.view.derivedMode='section';const session=await prepareAnimationAdapters({state:h.source,getState:h.context.getState}),job=deferred();h.context.refreshSection=()=>job.promise;const pending=session.apply(1,(p,o)=>h.renderer.renderTracks(p,o));h.source.view.camera={position:[9,8,7],target:[0,0,0]};const edited=structuredClone(h.source.view);job.resolve();await assert.rejects(()=>pending,/cancelled/);assert.equal(count(h,'draw'),0);await assert.rejects(()=>session.restore((p,o)=>h.renderer.renderTracks(p,o)),/view changed/);assert.deepEqual(h.source.view,edited);session.destroy();
});

test('document replacement during async restoration leaves the new document untouched and skips draw',async()=>{
  const h=harness(),session=await prepareAnimationAdapters({state:h.source,getState:h.context.getState});await session.apply(1,(p,o)=>h.renderer.renderTracks(p,o));const job=deferred();h.context.refreshDerived=()=>job.promise;const pending=session.restore((p,o)=>h.renderer.renderTracks(p,o)),other=state(),before=structuredClone(other);h.setCurrent(other);job.resolve();await assert.rejects(()=>pending,/cancelled/);assert.deepEqual(other,before);assert.equal(count(h,'draw'),1);session.destroy();
});

test('saved radial3D explosion rebuilds actual presentation without modifying complete view/model',async()=>{
  const h=harness();h.source.view.explosionAmount=.35;h.source.view.animation.tracks.explosion.direction='radial';const before=structuredClone(h.source),view=h.source.view;await h.renderer.restoreSavedExplosion();assert.deepEqual(h.source,before);assert.equal(h.source.view,view);assert.equal(h.viewer.explosionDisplay.amount,.35);assert.equal(h.viewer.explosionDisplay.direction,'radial');assert.equal(h.viewer.pointGeometry.attributes.position.count,24);assert.ok(Math.abs(h.viewer.explosionDisplay.vertices[0].normalized[2]+1.35/Math.sqrt(3))<1e-10);assert.deepEqual(h.calls.map(c=>c[0]),['explosion','display','draw']);
});

test('saved4D normal explosion fetches detached planes then renders without injecting cache into saved view',async()=>{
  const {source,cache}=saved4D(),h=harness(source),before=structuredClone(source);let requests=0;h.context.run=async(op,params,model)=>{requests++;assert.equal(op,'cell-facing');assert.notEqual(model,source.model);assert.deepEqual(model,source.model);model.vertices[0][0]=99;return cache;};await h.renderer.restoreSavedExplosion();assert.equal(requests,1);assert.deepEqual(source,before);assert.equal(Object.hasOwn(source.view,'cellFacingCache'),false);assert.equal(h.viewer.explosionDisplay.amount,.5);assert.equal(h.viewer.explosionDisplay.entities.length,5);assert.equal(count(h,'draw'),1);
});

test('saved4D valid planes avoid native calls and unsupported saved sources cannot capture original fallback',async()=>{
  const {source,cache}=saved4D();source.view.cellFacingCache=cache;const h=harness(source),before=structuredClone(source);await h.renderer.restoreSavedExplosion();assert.deepEqual(source,before);assert.equal(h.viewer.explosionDisplay.entities.length,5);
  const bad=harness();bad.source.view.explosionAmount=1;bad.source.model.interpretation='generalized-complex';await assert.rejects(()=>bad.renderer.restoreSavedExplosion(),/explicit entity-direction/);assert.equal(count(bad,'draw'),0);assert.equal(count(bad,'display'),0);
});

test('late saved-pose native result cannot replace an edited view or a newly selected document',async t=>{
  for(const kind of ['view','document','clear'])await t.test(kind,async()=>{const {source,cache}=saved4D(),h=harness(source),job=deferred();h.context.run=()=>job.promise;const pending=h.renderer.restoreSavedExplosion();let expected=source;if(kind==='view')source.view.camera={position:[9,8,7],target:[0,0,0]};if(kind==='document'){expected=state();h.setCurrent(expected);}if(kind==='clear')h.renderer.clearTracks();const before=structuredClone(expected);job.resolve(cache);await assert.rejects(()=>pending,/source changed/);assert.deepEqual(expected,before);assert.equal(count(h,'display'),0);assert.equal(count(h,'draw'),0);assert.equal(h.viewer.explosionDisplay,null);});
});

test('two saved-pose restores give publication ownership only to the latest native job',async()=>{
  const {source,cache}=saved4D(),h=harness(source),first=deferred(),second=deferred();let jobs=0;h.context.run=()=>++jobs===1?first.promise:second.promise;const old=h.renderer.restoreSavedExplosion(),latest=h.renderer.restoreSavedExplosion();second.resolve(cache);await latest;first.resolve(cache);await assert.rejects(()=>old,/source changed/);assert.equal(count(h,'draw'),1);assert.equal(h.viewer.explosionDisplay.amount,.5);
});

test('missing saved explosion track or amount leaves original source pipeline untouched',async()=>{
  const h=harness(),original=structuredClone(h.source);await h.renderer.restoreSavedExplosion();assert.deepEqual(h.source,original);assert.equal(h.calls.length,0);delete h.source.view.animation.tracks.explosion;h.source.view.explosionAmount=1;await h.renderer.restoreSavedExplosion();assert.equal(h.calls.length,0);assert.equal(h.viewer.explosionDisplay,null);
});

test('saved explosion post-display diagnostic rejects before draw without changing saved model or full view',async()=>{
  const h=harness();h.source.view.explosionAmount=.25;const before=structuredClone(h.source),display=h.context.display;h.context.display=()=>{display();h.viewer.explosionDiagnostic='Saved explosion surface could not be displayed';};await assert.rejects(()=>h.renderer.restoreSavedExplosion(),/Saved explosion surface could not be displayed/);assert.equal(count(h,'draw'),0);assert.equal(count(h,'display'),1);assert.deepEqual(h.source,before);
});
