import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareAnimationAdapters} from '../ui/animation-adapters.mjs';
import {createSequence,withSequenceTracks} from '../ui/animation.mjs';
const cube=()=>({id:'literal-cube',fingerprint:'a'.repeat(64),dimension:3,embeddingDimension:3,interpretation:'convex-polytope',vertices:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],edges:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],cells:[],metadata:{offColors:{faces:Array.from({length:6},(_,id)=>({encoding:'byte',values:[id,40,80,128]}))}}});
function state(model=cube(),tracks={explosion:{direction:'normal'}}){const view={angles:[0,0,0,0,0,0],sectionOffset:0,cameraProjection:'orthographic'};const sequence=withSequenceTracks(createSequence(view,2,4),tracks);sequence.keyframes[1].angles=Array(6).fill(0);if(tracks.explosion)sequence.keyframes[1].explosionAmount=1;if(tracks.fold)sequence.keyframes[1].foldFraction=1;return {model,view:{...view,animation:sequence},notes:'retained'};}
function independentCubeNet(model){
  // Six separately rooted rigid square faces, hand authored rather than kernel generated.
  const q=Math.SQRT1_2,components=model.faces.map((_,id)=>({root:id,targetQuaternion:id<2?[0,0,0,1]:id===2||id===4?[q,0,0,q]:[0,q,0,q],targetTranslation:[[0,0,-1],[0,0,1],[0,-1,0],[1,0,0],[0,1,0],[-1,0,0]][id]}));
  return {algorithmVersion:'0.3.0',units:'mm',sourceFingerprint:model.fingerprint,sourceId:model.id,scale:1,referenceEdgeLengthMm:2,sourceFaceCount:6,sourceEdges:structuredClone(model.edges),targetVertices:structuredClone(model.vertices),traversalOrder:[0,1,2,3,4,5],components,faces:model.faces.map((ids,id)=>({id,sourceVertices:[...ids],points:ids.map(index=>{const [x,y,z]=model.vertices[index];return id<2?[x,y]:id===2||id===4?[x,z]:[-z,y];}),parent:null,parentHinge:null,foldAngle:0,component:id}))};
}
function simplex(){
  const model={id:'literal-4-simplex',fingerprint:'b'.repeat(64),dimension:4,embeddingDimension:4,interpretation:'convex-polytope',vertices:[[0,0,0,0],[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]],edges:[[0,1],[0,2],[0,3],[0,4],[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]],faces:[[0,1,2],[0,1,3],[0,1,4],[0,2,3],[0,2,4],[0,3,4],[1,2,3],[1,2,4],[1,3,4],[2,3,4]],cells:[[6,7,8,9],[3,4,5,9],[1,2,5,8],[0,2,4,7],[0,1,3,6]]};
  const radius=Math.sqrt(19)/5,cache={algorithmVersion:'cell-facing-1',sourceFingerprint:model.fingerprint,normalization:{center:[.2,.2,.2,.2],radius},sourceCellIds:[0,1,2,3,4],cells:model.cells.map((faces,id)=>{const normal=id===0?[.5,.5,.5,.5]:Array.from({length:4},(_,axis)=>axis===id-1?-1:0);return {cell:id,sourceVertexIds:[...new Set(faces.flatMap(face=>model.faces[face]))].sort((a,b)=>a-b),normalizedPlane:{normal,offset:(id===0?.1:.2)/radius}};})};return {model,cache};
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('absolute source explosion buffers retain model identity, source IDs and colors without writes',async()=>{
  const source=state();source.view.sectionAlignment={retained:'original plane'};source.view.animation.keyframes[1].sectionOffset=2;const before=structuredClone(source),session=await prepareAnimationAdapters({state:source});
  assert.equal(session.source.modelId,source.model.id);assert.equal(session.source.fingerprint,source.model.fingerprint);assert.ok(Object.isFrozen(session.sequence));
  const start=session.evaluate(0),half=session.evaluate(1),end=session.evaluate(2);
  assert.equal(start.frame.explosionAmount,0);assert.equal(half.frame.explosionAmount,.5);close(end.baseExplosion.entities[0].translation[2],-Math.sqrt(3));
  assert.deepEqual(start.view.sectionAlignment,source.view.sectionAlignment);assert.equal(Object.hasOwn(end.view,'sectionAlignment'),false);
  assert.deepEqual(end.baseExplosion.entities[0].sourceVertexIds,source.model.faces[0]);assert.deepEqual(end.baseExplosion.entities[0].sourceColor,source.model.metadata.offColors.faces[0]);
  end.baseExplosion.entities[0].points[0][0]=88;end.view.angles[0]=999;assert.deepEqual(source,before);assert.notEqual(session.evaluate(2).baseExplosion.entities[0].points[0][0],88);
  session.destroy();
});

test('validated4Dnative planes fetch exactly once, with detached inputs and no source mutation',async()=>{
  const {model,cache}=simplex(),source=state(model),before=structuredClone(source);let calls=0;
  const session=await prepareAnimationAdapters({state:source,loadPlanes:async(detached,options)=>{calls++;assert.notEqual(detached,source.model);assert.equal(options.isCurrent(),true);detached.vertices[0][0]=55;return cache;}});
  for(const time of [0,.5,1,2,0]){const pose=session.evaluate(time);assert.equal(pose.baseExplosion.entities.length,5);assert.ok(pose.baseExplosion.entities.every(entity=>entity.points.every(point=>point.length===4)));}
  assert.equal(calls,1);assert.deepEqual(source,before);session.destroy();
});

test('valid existing planes avoid native fetch, forged caches are repaired only through one actual fetch',async()=>{
  const {model,cache}=simplex(),source=state(model);source.view.cellFacingCache=structuredClone(cache);let calls=0;
  const first=await prepareAnimationAdapters({state:source,loadPlanes:async()=>{calls++;return cache;}});assert.equal(calls,0);first.destroy();
  source.view.cellFacingCache.cells[0].normalizedPlane.offset=99;
  const repaired=await prepareAnimationAdapters({state:source,loadPlanes:async()=>{calls++;return cache;}});assert.equal(calls,1);assert.equal(source.view.cellFacingCache.cells[0].normalizedPlane.offset,99);repaired.destroy();
  await assert.rejects(()=>prepareAnimationAdapters({state:source,loadPlanes:async()=>{calls++;return source.view.cellFacingCache;}}),/support checks/);assert.equal(calls,2);
});

test('native preflight errors, source replacement and abort are atomic',async()=>{
  const {model}=simplex(),source=state(model),before=structuredClone(source);
  await assert.rejects(()=>prepareAnimationAdapters({state:source,loadPlanes:async()=>{throw Error('Native plane validation failed.');}}),/Native plane validation failed/);assert.deepEqual(source,before);
  let release,current=source,options;const pending=prepareAnimationAdapters({state:source,getState:()=>current,loadPlanes:async(_,value)=>{options=value;return new Promise(resolve=>{release=resolve;});}});
  current=state();assert.equal(options.isCurrent(),false);release(simplex().cache);await assert.rejects(()=>pending,/preparation cancelled/);assert.deepEqual(source,before);
  const controller=new AbortController();const aborted=prepareAnimationAdapters({state:source,signal:controller.signal,loadPlanes:async()=>{controller.abort();return simplex().cache;}});await assert.rejects(()=>aborted,/preparation cancelled/);assert.deepEqual(source,before);
});

test('full cube face-net descriptors bind source incidence and reconstruct rigid endpoints',async()=>{
  const source=state(cube(),{fold:{kind:'face-net'}});source.netLayout=independentCubeNet(source.model);source.view.net={fraction:.25};const before=structuredClone(source),session=await prepareAnimationAdapters({state:source});
  const start=session.evaluate(0),end=session.evaluate(2);assert.equal(start.foldFaces.length,6);assert.equal(end.foldSourceFingerprint,source.model.fingerprint);
  assert.equal(end.view.derivedMode,'net');assert.equal(end.view.viewportLayout,'split');assert.equal(end.view.net.display,'fold');assert.equal(end.view.net.fraction,1);
  assert.equal(start.foldNet,end.foldNet);assert.ok(Object.isFrozen(end.foldNet));assert.notEqual(end.foldNet,source.netLayout);assert.ok(Object.isFrozen(end.foldNet.faces[0].points));
  end.foldFaces.forEach(face=>face.points.forEach((point,p)=>point.forEach((value,axis)=>close(value,source.model.vertices[source.model.faces[face.id][p]][axis]))));
  end.foldFaces[0].sourceVertices.reverse();assert.deepEqual(source,before);session.destroy();
});

test('missing face net uses one detached native fetch and invalid endpoints cannot be legitimized by hash alone',async()=>{
  const source=state(cube(),{fold:{kind:'face-net'}}),net=independentCubeNet(source.model);let calls=0;
  const session=await prepareAnimationAdapters({state:source,loadNet:async model=>{calls++;model.id='callback-owned';return net;}});assert.equal(calls,1);assert.equal(source.netLayout,undefined);session.destroy();
  source.netLayout=structuredClone(net);source.netLayout.components[0].targetTranslation=[99,0,0];await assert.rejects(()=>prepareAnimationAdapters({state:source}),/endpoint fails/);
  source.netLayout=structuredClone(net);source.netLayout.faces[0].sourceVertices.reverse();await assert.rejects(()=>prepareAnimationAdapters({state:source}),/ordered source vertex/);
  source.netLayout=structuredClone(net);source.netLayout.targetVertices[0][0]=50;await assert.rejects(()=>prepareAnimationAdapters({state:source}),/target cache differs/);
});

test('cancel aborts in-flight rendering, stale generations cannot publish, and evaluation stops',async()=>{
  const source=state(),session=await prepareAnimationAdapters({state:source});let release,options,published=0;
  const pending=session.apply(1,async(_,controls)=>{options=controls;await new Promise(resolve=>{release=resolve;});if(controls.isCurrent())published++;});
  session.cancel();assert.equal(options.signal.aborted,true);assert.equal(options.isCurrent(),false);release();await assert.rejects(()=>pending,/publication cancelled/);assert.equal(published,0);assert.throws(()=>session.evaluate(2),/cancelled/);
  session.destroy();
});

test('new seek invalidates only the prior pending renderer publication',async()=>{
  const source=state(),session=await prepareAnimationAdapters({state:source});let release,firstOptions,published=[];
  const old=session.apply(.5,async(pose,options)=>{firstOptions=options;await new Promise(resolve=>{release=resolve;});if(options.isCurrent())published.push(pose.frame.time);});
  await session.apply(2,async(pose,options)=>{assert.ok(options.isCurrent());published.push(pose.frame.time);});assert.equal(firstOptions.signal.aborted,true);release();await assert.rejects(()=>old,/publication cancelled/);assert.deepEqual(published,[2]);session.destroy();
});

test('restore after cancellation preserves original field absence and exact view values',async()=>{
  const source=state(),original=structuredClone(source.view),session=await prepareAnimationAdapters({state:source});
  await session.apply(1,async(pose,options)=>{assert.ok(options.isCurrent());source.view=structuredClone(pose.view);});assert.equal(source.view.explosionAmount,.5);session.cancel();
  const restored=await session.restore(async(pose,options)=>{assert.equal(pose.restoring,true);assert.ok(options.isCurrent());source.view=structuredClone(pose.view);});
  assert.deepEqual(source.view,original);assert.equal(Object.hasOwn(source.view,'explosionAmount'),false);assert.equal(restored.frame.explosionAmount,0);assert.deepEqual(restored.baseExplosion.entities[0].points,source.model.faces[0].map(id=>source.model.vertices[id]));session.destroy();
});

test('restore retains prior nonzero explosion/fold presentation without inventing foldFraction',async()=>{
  const source=state(cube(),{explosion:{direction:'normal'},fold:{kind:'face-net'}});source.netLayout=independentCubeNet(source.model);source.view.explosionAmount=.25;source.view.net={fraction:.75};const original=structuredClone(source.view),session=await prepareAnimationAdapters({state:source});
  await session.apply(2,async pose=>{source.view=structuredClone(pose.view);});session.cancel();const pose=await session.restore(async pose=>{source.view=structuredClone(pose.view);});
  assert.deepEqual(source.view,original);assert.equal(pose.frame.explosionAmount,.25);assert.equal(pose.frame.foldFraction,.75);assert.equal(Object.hasOwn(pose.view,'foldFraction'),false);session.destroy();
});

test('external view changes and source identity/hash changes prevent restoration or publication',async()=>{
  const source=state(),session=await prepareAnimationAdapters({state:source});source.view.cameraProjection='perspective';let called=0;
  await assert.rejects(()=>session.restore(async()=>called++),/view changed/);assert.equal(called,0);assert.equal(source.view.cameraProjection,'perspective');session.destroy();
  const other=state(),guard=await prepareAnimationAdapters({state:other});other.model.fingerprint='f'.repeat(64);assert.throws(()=>guard.evaluate(1),/source changed/);await assert.rejects(()=>guard.restore(async()=>called++),/source changed/);assert.equal(called,0);guard.destroy();
});

test('a failed renderer that published an exact known pose can still restore atomically',async()=>{
  const source=state(),original=structuredClone(source.view),session=await prepareAnimationAdapters({state:source});
  await assert.rejects(()=>session.apply(1,async pose=>{source.view=structuredClone(pose.view);throw Error('GPU context lost.');}),/GPU context lost/);
  await session.restore(async pose=>{source.view=structuredClone(pose.view);});assert.deepEqual(source.view,original);session.destroy();
});

test('unsupported generalized sources,4Dfolds,missing renderers and local aborts diagnose',async()=>{
  const generalized=state();generalized.model.interpretation='generalized-complex';await assert.rejects(()=>prepareAnimationAdapters({state:generalized}),/explicit entity-direction/);
  await assert.rejects(()=>prepareAnimationAdapters({state:state(simplex().model,{fold:{kind:'face-net'}})}),/partial 4D/);
  const source=state(),session=await prepareAnimationAdapters({state:source});await assert.rejects(()=>session.apply(0,null),/renderer callback/);
  const abort=new AbortController();abort.abort();await assert.rejects(()=>session.apply(0,async()=>{}, {signal:abort.signal}),/cancelled/);session.destroy();
});

test('actual native cube net protocol qualifies and reconstructs every source coordinate',async()=>{
  const program="import sys,json;from engine.nets import unfold;from engine.geometry import identity;model=json.load(sys.stdin);model['fingerprint']=identity(model);print(json.dumps({'model':model,'net':unfold(model,edge_length_mm=25,tabs=False)}))";
  const result=JSON.parse(execFileSync('python',['-c',program],{cwd:fileURLToPath(new URL('..',import.meta.url)),input:JSON.stringify(cube()),encoding:'utf8'}));
  const source=state(result.model,{fold:{kind:'face-net'}});source.netLayout=result.net;
  const session=await prepareAnimationAdapters({state:source}),endpoint=session.evaluate(2);
  assert.equal(endpoint.foldSourceFingerprint,result.model.fingerprint);assert.equal(session.source.modelId,'literal-cube');assert.equal(endpoint.foldFaces.length,6);
  endpoint.foldFaces.forEach(face=>face.points.forEach((point,p)=>point.forEach((value,axis)=>close(value,result.net.targetVertices[face.sourceVertices[p]][axis]))));session.destroy();
});

test('a manual camera change while rendering prevents stale publication and restoration',async()=>{
  const source=state(),session=await prepareAnimationAdapters({state:source});let release,options,published=0;
  const pending=session.apply(1,async(_,controls)=>{options=controls;await new Promise(resolve=>{release=resolve;});if(controls.isCurrent())published++;});
  source.view.cameraProjection='perspective';assert.equal(options.isCurrent(),false);release();await assert.rejects(()=>pending,/publication cancelled/);assert.equal(published,0);
  await assert.rejects(()=>session.restore(async()=>published++),/view changed/);assert.equal(source.view.cameraProjection,'perspective');assert.equal(published,0);session.destroy();
});

test('cancel or new seek can replace a known pose while its renderer awaits completion',async()=>{
  const source=state(),original=structuredClone(source.view),session=await prepareAnimationAdapters({state:source});let release;
  const pending=session.apply(.5,async pose=>{source.view=structuredClone(pose.view);await new Promise(resolve=>{release=resolve;});});
  await session.apply(2,async pose=>{source.view=structuredClone(pose.view);});release();await assert.rejects(()=>pending,/publication cancelled/);assert.equal(source.view.explosionAmount,1);
  let finish;const last=session.apply(1,async pose=>{source.view=structuredClone(pose.view);await new Promise(resolve=>{finish=resolve;});});session.cancel();finish();await assert.rejects(()=>last,/publication cancelled/);
  await session.restore(async pose=>{source.view=structuredClone(pose.view);});assert.deepEqual(source.view,original);session.destroy();
});

test('malformed source identity and dimensions reject without freezing source-owned objects',async()=>{
  for(const field of ['id','dimension','embeddingDimension']){
    const source=state(),invalid={unexpected:1};source.model[field]=invalid;
    await assert.rejects(()=>prepareAnimationAdapters({state:source}),/identity|dimension/);
    assert.equal(Object.isFrozen(invalid),false);invalid.unaffected=true;assert.equal(source.model[field].unaffected,true);
  }
});
