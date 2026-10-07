import test from 'node:test';
import assert from 'node:assert/strict';
import {createSequence,normalizeSequence,withSequenceTracks,evaluateSequence,setSequenceKeyframe,resizeSequence,sequenceFrameTimes} from '../ui/animation.mjs';
import {resolveExplosion,explosionGeometry,foldTrackPositions} from '../ui/explosion.mjs';
import {AnimationControls} from '../ui/animation-controls.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const cube=()=>({dimension:3,embeddingDimension:3,interpretation:'convex-polytope',vertices:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],edges:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],cells:[],metadata:{offColors:{faces:Array.from({length:6},(_,id)=>({encoding:'byte',values:[id,40,80,128]}))}}});
const view={angles:[0,0,0,0,0,0],sectionOffset:-2},tracks={explosion:{direction:'normal'},fold:{kind:'face-net'}};
function tesseract(){
  // Explicit Cartesian sign construction; independent of the native generator.
  const vertices=Array.from({length:16},(_,id)=>Array.from({length:4},(_,axis)=>(id>>axis&1)?1:-1));
  const edges=[];for(let id=0;id<16;id++)for(let axis=0;axis<4;axis++){const neighbor=id^(1<<axis);if(neighbor>id)edges.push([id,neighbor]);}
  const faces=[];for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){const remaining=[0,1,2,3].filter(axis=>axis!==a&&axis!==b);for(const x of [-1,1])for(const y of [-1,1])faces.push([[-1,-1],[1,-1],[1,1],[-1,1]].map(corner=>{const point=Array(4).fill(0);point[a]=x;point[b]=y;remaining.forEach((axis,i)=>point[axis]=corner[i]);return vertices.findIndex(value=>value.every((v,i)=>v===point[i]));}));}
  const cells=[];for(let axis=0;axis<4;axis++)for(const side of [-1,1])cells.push(faces.flatMap((face,id)=>face.every(vertex=>vertices[vertex][axis]===side)?[id]:[]));
  const model={dimension:4,embeddingDimension:4,interpretation:'convex-polytope',vertices,edges,faces,cells,fingerprint:'c'.repeat(64)};
  const cache={algorithmVersion:'cell-facing-1',sourceFingerprint:model.fingerprint,normalization:{center:[0,0,0,0],radius:2},sourceCellIds:cells.map((_,id)=>id),cells:cells.map((cell,id)=>{const normal=Array(4).fill(0);normal[Math.floor(id/2)]=id%2?1:-1;return {cell:id,sourceVertexIds:[...new Set(cell.flatMap(face=>faces[face]))].sort((a,b)=>a-b),normalizedPlane:{normal,offset:.5}};})};return {model,cache};
}
const hingedTriangles=()=>({algorithmVersion:'0.3.0',units:'mm',referenceEdgeLengthMm:1,sourceFingerprint:'d'.repeat(64),faces:[
  {id:0,sourceVertices:[0,1,2],points:[[0,0],[1,0],[0,1]],parent:null,parentHinge:null,foldAngle:0,component:0},
  {id:1,sourceVertices:[0,1,3],points:[[0,0],[1,0],[0,-1]],parent:0,parentHinge:0,foldAngle:Math.PI/2,component:0}],
  components:[{root:0,targetQuaternion:[0,0,0,1],targetTranslation:[0,0,0]}],traversalOrder:[0,1],sourceEdges:[[0,1]],targetVertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,-1]]});

test('explicit version2 migration preserves every legacy rotation/depth frame and allows explicit downgrade',()=>{
  const old=createSequence(view,2,24),before=structuredClone(old),updated=withSequenceTracks(old,tracks,{explosionAmount:.2,foldFraction:.4});
  assert.equal(old.version,1);assert.deepEqual(old,before);assert.equal(updated.version,2);assert.deepEqual(updated.tracks,tracks);
  for(let i=0;i<2;i++){assert.deepEqual(updated.keyframes[i].angles,old.keyframes[i].angles);assert.equal(updated.keyframes[i].sectionOffset,old.keyframes[i].sectionOffset);assert.equal(updated.keyframes[i].explosionAmount,.2);assert.equal(updated.keyframes[i].foldFraction,.4);}
  assert.deepEqual(withSequenceTracks(updated,{}),old);assert.deepEqual(normalizeSequence(JSON.parse(JSON.stringify(updated))),updated);
  assert.deepEqual(createSequence({...view,explosionAmount:1,foldFraction:.5},2,24,{tracks}).keyframes[0],{...old.keyframes[0],explosionAmount:1,foldFraction:.5});
});

test('explosion/fold tracks use absolute interpolated times, exact endpoints and detached samples',()=>{
  let sequence=withSequenceTracks(createSequence(view,2,4),tracks);sequence.keyframes[1].explosionAmount=2;sequence.keyframes[1].foldFraction=1;sequence.keyframes[1].sectionOffset=2;
  const half=evaluateSequence(sequence,1);assert.equal(half.explosionAmount,1);assert.equal(half.foldFraction,.5);assert.equal(half.sectionOffset,0);assert.equal(half.angles[0],180);
  sequence=setSequenceKeyframe(sequence,1,{...view,explosionAmount:.5,foldFraction:.8});assert.equal(evaluateSequence(sequence,.5).explosionAmount,.25);assert.equal(evaluateSequence(sequence,1.5).foldFraction,.9);
  const target=evaluateSequence(sequence,1.5);for(const time of [2,0,.3,99])evaluateSequence(sequence,time);assert.deepEqual(evaluateSequence(sequence,1.5),target);
  assert.equal(evaluateSequence(sequence,-1).explosionAmount,0);assert.equal(evaluateSequence(sequence,99).foldFraction,1);
  target.angles[0]=12345;assert.notEqual(sequence.keyframes[1].angles[0],12345);
});

test('resize and capture retain active track values and do not reset a track missing from view',()=>{
  let sequence=withSequenceTracks(createSequence(view,2,4),tracks);sequence.keyframes[1].explosionAmount=4;sequence.keyframes[1].foldFraction=1;
  sequence=setSequenceKeyframe(sequence,1,view);assert.equal(sequence.keyframes[1].explosionAmount,2);assert.equal(sequence.keyframes[1].foldFraction,.5);
  const longer=resizeSequence(sequence,4);assert.equal(longer.keyframes[1].time,2);assert.equal(evaluateSequence(longer,2).explosionAmount,2);assert.deepEqual(longer.tracks,tracks);
  assert.deepEqual(sequenceFrameTimes(createSequence(view,.13,24,{tracks})),[0,1/24,2/24,3/24,.13]);
});

test('unknown tracks, unbounded amounts, malformed options and partial4D fold tracks reject',()=>{
  const base=createSequence(view),sequence=withSequenceTracks(base,tracks);
  for(const invalid of [{...base,version:2},{...base,tracks},{...sequence,tracks:{morph:{}}},{...sequence,tracks:{explosion:{direction:'guess'}}},{...sequence,tracks:{fold:{kind:'cell-net'}}},{...sequence,tracks:{fold:{kind:'face-net',interpolateVertices:true}}}])assert.throws(()=>normalizeSequence(invalid));
  for(const [name,values] of [['explosionAmount',[-1,11,Infinity,true]],['foldFraction',[-.1,1.1,NaN,'1']]])for(const value of values){const copy=structuredClone(sequence);copy.keyframes[0][name]=value;assert.throws(()=>normalizeSequence(copy));}
  let called=0;const frame=structuredClone(sequence);Object.defineProperty(frame.keyframes[0],'time',{get(){called++;return 0;}});assert.throws(()=>normalizeSequence(frame),/accessors/);assert.equal(called,0);
});

test('Cartesian cube outward normals translate each rigid face by amount times model radius',()=>{
  const model=cube(),before=structuredClone(model),resolved=resolveExplosion(model);assert.equal(resolved.supported,true,resolved.diagnostic);close(resolved.normalization.radius,Math.sqrt(3));
  const expected=[[0,0,-1],[0,0,1],[0,-1,0],[1,0,0],[0,1,0],[-1,0,0]];
  const pose=explosionGeometry(resolved,1);
  pose.entities.forEach((entity,id)=>{entity.translation.forEach((value,axis)=>close(value,expected[id][axis]*Math.sqrt(3)));assert.deepEqual(entity.sourceVertexIds,model.faces[id]);assert.deepEqual(entity.sourceColor,model.metadata.offColors.faces[id]);
    const original=model.faces[id].map(index=>model.vertices[index]);for(let a=0;a<original.length;a++)for(let b=0;b<original.length;b++)close(Math.hypot(...original[a].map((value,i)=>value-original[b][i])),Math.hypot(...entity.points[a].map((value,i)=>value-entity.points[b][i])));
  });
  assert.deepEqual(model,before);assert.ok(Object.isFrozen(resolved.entities));
});

test('amount zero is exact and later output mutations cannot modify source or resolver snapshots',()=>{
  const model=cube(),resolved=resolveExplosion(model),zero=explosionGeometry(resolved,0);zero.entities.forEach((entity,id)=>assert.deepEqual(entity.points,model.faces[id].map(index=>model.vertices[index])));
  zero.entities[0].points[0][0]=99;zero.entities[0].sourceCycles[0].reverse();zero.entities[0].sourceColor.values[0]=44;
  assert.equal(model.vertices[0][0],-1);assert.equal(resolved.entities[0].points[0][0],-1);assert.deepEqual(resolved.entities[0].sourceCycles[0],model.faces[0]);assert.equal(resolved.entities[0].sourceColor.values[0],0);
  for(const amount of [-1,11,NaN,Infinity])assert.throws(()=>explosionGeometry(resolved,amount),/finite/);
});

test('explicit centroid radial explosion is dimensionless and covaries under source scale/translation',()=>{
  const model=cube(),resolved=resolveExplosion(model,{direction:'radial'}),pose=explosionGeometry(resolved,1);assert.equal(resolved.supported,true,resolved.diagnostic);assert.deepEqual(pose.entities[0].translation,[0,0,-1]);
  const changed=cube();changed.vertices=changed.vertices.map(point=>point.map((value,i)=>value*7+[10,-30,50][i]));const moved=explosionGeometry(resolveExplosion(changed,{direction:'radial'}),1);
  for(let id=0;id<6;id++)for(let p=0;p<4;p++)for(let axis=0;axis<3;axis++)close(moved.entities[id].points[p][axis],pose.entities[id].points[p][axis]*7+[10,-30,50][axis]);
});

test('4D cell normals reuse verified source planes and translate complete ordered cell faces',()=>{
  const {model,cache}=tesseract(),before=JSON.stringify({model,cache}),resolved=resolveExplosion(model,{planeCache:cache});assert.equal(resolved.supported,true,resolved.diagnostic);assert.equal(resolved.entities.length,8);
  const pose=explosionGeometry(resolved,.5);pose.entities.forEach((entity,id)=>{const expected=Array(4).fill(0);expected[Math.floor(id/2)]=id%2?1:-1;assert.deepEqual(entity.translation,expected);assert.deepEqual(entity.sourceFaceIds,model.cells[id]);assert.deepEqual(entity.sourceCycles,model.cells[id].map(face=>model.faces[face]));assert.ok(entity.points.every(point=>point.length===4));});assert.equal(JSON.stringify({model,cache}),before);
  const radial=explosionGeometry(resolveExplosion(model,{direction:'radial'}),1);radial.entities[7].translation.forEach((value,i)=>close(value,i===3?1:0));
});

test('forged planes, generalized boundaries, invalid incidence and malformed source spans diagnose',()=>{
  const {model,cache}=tesseract();cache.cells[0].normalizedPlane.normal=[1,0,0,0];const forged=resolveExplosion(model,{planeCache:cache});assert.equal(forged.supported,false);assert.match(forged.diagnostic,/support checks/);
  const star=cube();star.interpretation='generalized-complex';for(const direction of ['normal','radial'])assert.match(resolveExplosion(star,{direction}).diagnostic,/explicit entity-direction/);
  const invalid=cube();invalid.faces[0][0]=999;assert.equal(resolveExplosion(invalid).supported,false);
  const flattened=cube();flattened.vertices=flattened.vertices.map(point=>[...point.slice(0,2),0]);assert.match(resolveExplosion(flattened).diagnostic,/full dimension/);
  assert.throws(()=>explosionGeometry(forged,1),/Explosion unavailable/);assert.match(resolveExplosion(tesseract().model).diagnostic,/plane cache/);
});

test('rigid triangular hinge folds match analytic0,.5,1 poses, joins and all pair distances',()=>{
  const net=hingedTriangles(),before=structuredClone(net);
  for(const fraction of [0,.5,1]){
    const result=foldTrackPositions(net,fraction),point=result[1].points[2];close(point[0],0);close(point[1],-Math.cos(Math.PI*fraction/2));close(point[2],-Math.sin(Math.PI*fraction/2));
    assert.deepEqual(result[0].points[0],result[1].points[0]);assert.deepEqual(result[0].points[1],result[1].points[1]);
    for(const face of result)for(let a=0;a<3;a++)for(let b=0;b<3;b++)close(Math.hypot(...face.points[a].map((value,i)=>value-face.points[b][i])),Math.hypot(...net.faces[face.id].points[a].map((value,i)=>value-net.faces[face.id].points[b][i])));
  }
  assert.deepEqual(net,before);const result=foldTrackPositions(net,.5);result[0].sourceVertices.reverse();result[0].points[0][0]=99;assert.deepEqual(net,before);
});

test('a forged convex label cannot make an ordered pentagram base a supported normal face',()=>{
  const vertices=Array.from({length:5},(_,i)=>[Math.cos(2*Math.PI*i/5),Math.sin(2*Math.PI*i/5),0]);vertices.push([0,0,1]);
  const source={dimension:3,interpretation:'convex-polytope',vertices,faces:[[0,2,4,1,3],...Array.from({length:5},(_,i)=>[i,(i+1)%5,5])],cells:[]};
  const result=resolveExplosion(source);assert.equal(result.supported,false);assert.match(result.diagnostic,/self-crossing or ambiguous/);
});

test('fold roots rotate rigidly through quaternions rather than interpolating vertex buffers',()=>{
  const net=hingedTriangles();net.faces=net.faces.slice(0,1);net.traversalOrder=[0];net.components[0].targetQuaternion=[Math.SQRT1_2,0,0,Math.SQRT1_2];net.components[0].targetTranslation=[2,0,0];
  const point=foldTrackPositions(net,.5)[0].points[2];close(point[0],1);close(point[1],Math.SQRT1_2);close(point[2],Math.SQRT1_2);close(Math.hypot(...point.map((value,i)=>value-foldTrackPositions(net,.5)[0].points[0][i])),1);
});

test('invalid hinge ordering, disconnected faces, root poses and4Dcell folding fail explicitly',()=>{
  for(const mutate of [net=>{net.traversalOrder=[1,0];},net=>{net.faces[1].points[0]=[10,10];},net=>{net.components[0].targetQuaternion=[0,0,0,2];},net=>{net.faces[1].parentHinge=77;}]){const net=hingedTriangles();mutate(net);assert.throws(()=>foldTrackPositions(net,.5));}
  for(const fraction of [0,.5,1])assert.throws(()=>foldTrackPositions({cells:[],algorithmVersion:'0.4.0'},fraction),/Partial 4D/);
  assert.throws(()=>foldTrackPositions(hingedTriangles(),NaN),/finite/);
});

test('sequence evaluation remains pure after cancellation and stale generation cannot publish a pose',()=>{
  const sequence=withSequenceTracks(createSequence(view,.13,24),tracks);sequence.keyframes[1].explosionAmount=1;sequence.keyframes[1].foldFraction=1;
  const source={view:{animation:sequence}},controls=Object.create(AnimationControls.prototype);controls.context={getState:()=>source};controls.generation=2;
  assert.throws(()=>controls.assertActive(source,1),/cancelled/);const last=evaluateSequence(sequence,.13);assert.equal(last.explosionAmount,1);assert.equal(last.foldFraction,1);assert.deepEqual(evaluateSequence(sequence,.13),last);
  controls.context.getState=()=>({view:{}});assert.throws(()=>controls.assertActive(source,2),/cancelled/);
});
