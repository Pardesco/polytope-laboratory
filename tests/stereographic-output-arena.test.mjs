import test from 'node:test';
import assert from 'node:assert/strict';
import {StereographicOutputArena} from '../ui/stereographic-output-arena.mjs';
import {prepareStereographicWorkerGeometry,computeStereographicWorkerGeometry} from '../ui/stereographic-worker-geometry.mjs';
import {stereoDisplayGeometry} from '../ui/viewer-stereographic.mjs';
import {decodeStereographicOutput,StereographicWorkerCoordinator} from '../ui/stereographic-worker-protocol.mjs';
import {planStereographicQuality} from '../ui/stereographic-quality.mjs';

function input(){
  const points=[[1,0,0,0],[0,1,0,0],[0,0,1,0]],model={id:'arena-source',fingerprint:'a'.repeat(64),dimension:4,embeddingDimension:4,vertices:points,edges:[[0,1],[1,2],[2,0]],faces:[[0,1,2],[2,1,0]],cells:[[0],[1]]};
  return prepareStereographicWorkerGeometry({model,normalized:[...points,...points],edges:[[0,1],[3,4]],triangles:[{face:0,cell:0,vertices:[0,1,2]},{face:1,cell:1,vertices:[3,4,5]}],visibility:{vertices:Array(6).fill(true),edges:[true,true],faces:[true,true]},sourceVertexIds:[0,1,2,0,1,2],sourceVertexFaces:[0,0,0,1,1,1],sourceVertexCells:[0,0,0,1,1,1],sourceEdgeIds:[0,0],sourceEdgeFaces:[0,1],sourceEdgeCells:[0,1],sourceTriangleIds:[0,0]});
}
const arc={a:[1,-0,0],b:[0,1,0]},patch={points:[[1,-0,0],[0,1,0],[0,0,1]],normals:[[1,-0,0],[0,1,0],[0,0,1]]};
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
function sameBits(actual,expected){assert.equal(actual.constructor,expected.constructor);assert.deepEqual(bytes(actual),bytes(expected));}
function legacyPack(source,segments,triangles){
  const result={segments:new Float32Array(segments.length*6),edgeIds:new Uint32Array(segments.length),edgeFaces:new Int32Array(segments.length),edgeCells:new Int32Array(segments.length),edgeInstanceIds:new Uint32Array(segments.length),triangles:new Float32Array(triangles.length*9),normals:new Float32Array(triangles.length*9),faceIds:new Uint32Array(triangles.length),cellIds:new Int32Array(triangles.length),triangleIds:new Uint32Array(triangles.length),triangleInstanceIds:new Uint32Array(triangles.length)};
  segments.forEach((segment,i)=>{result.segments.set([...segment.a,...segment.b],i*6);for(const key of ['edgeIds','edgeFaces','edgeCells'])result[key][i]=source[key][segment.instance];result.edgeInstanceIds[i]=segment.instance;});
  triangles.forEach((triangle,i)=>{result.triangles.set(triangle.points.flat(),i*9);result.normals.set(triangle.normals.flat(),i*9);for(const key of ['faceIds','cellIds','triangleIds'])result[key][i]=source[key][triangle.instance];result.triangleInstanceIds[i]=triangle.instance;});
  return result;
}

test('direct batches retain exact Float32 bits, negative zero, duplicate source IDs and distinct owners',()=>{
  const source=input(),arena=new StereographicOutputArena(source,{segments:3,triangles:3});
  arena.appendSegments(0,[arc,arc]);arena.appendSegments(1,[arc]);arena.appendTriangles(0,[patch]);arena.appendTriangles(1,[patch,patch]);
  const actual=arena.finish(),expected=legacyPack(source,[{...arc,instance:0},{...arc,instance:0},{...arc,instance:1}],[{...patch,instance:0},{...patch,instance:1},{...patch,instance:1}]);
  for(const key of Object.keys(expected))sameBits(actual[key],expected[key]);
  assert.deepEqual([...actual.edgeFaces],[0,0,1]);assert.deepEqual([...actual.triangleInstanceIds],[0,1,1]);assert.ok(Object.is(actual.triangles[1],-0));
});

test('source owner arrays are independently snapshotted before later edits',()=>{
  const source=input(),before=source.positions.slice(),arena=new StereographicOutputArena(source,{segments:1,triangles:1});
  source.edgeIds[0]=2;source.faceIds[0]=1;source.cellIds[0]=1;source.edgeVisible[0]=0;source.triangleVisible[0]=0;
  arena.appendSegments(0,[arc]);arena.appendTriangles(0,[patch]);const output=arena.finish();
  assert.equal(output.edgeIds[0],0);assert.equal(output.faceIds[0],0);assert.equal(output.cellIds[0],0);sameBits(source.positions,before);assert.ok(source.positions.byteLength>0);
});

test('native slot ordering and masks prevent ambiguous or invisible ownership',()=>{
  const source=input(),arena=new StereographicOutputArena(source,{segments:2,triangles:2});arena.appendSegments(1,[arc]);arena.appendTriangles(1,[patch]);
  assert.throws(()=>arena.appendSegments(0,[arc]),/input order/);assert.throws(()=>arena.appendTriangles(0,[patch]),/input order/);assert.throws(()=>arena.appendTriangles(-1,[]),/input order/);
  source.edgeVisible[0]=0;source.triangleVisible[0]=0;const hidden=new StereographicOutputArena(source,{segments:1,triangles:1});
  assert.throws(()=>hidden.appendSegments(0,[arc]),/Masked/);assert.throws(()=>hidden.appendTriangles(0,[patch]),/Masked/);
});

test('capacity failures are atomic and remaining budgets never silently omit output',()=>{
  const arena=new StereographicOutputArena(input(),{segments:1,triangles:1});
  assert.throws(()=>arena.appendSegments(0,[arc,arc]),/resource/);assert.throws(()=>arena.appendTriangles(0,[patch,patch]),/resource/);
  assert.equal(arena.segmentCount,0);assert.equal(arena.triangleCount,0);assert.equal(arena.remainingTriangles,1);
  arena.appendSegments(0,[arc]);arena.appendTriangles(0,[patch]);assert.equal(arena.remainingSegments,0);assert.equal(arena.remainingTriangles,0);
  assert.throws(()=>arena.appendTriangles(1,[patch]),/resource/);assert.equal(arena.finish().triangles.length,9);
});

test('late invalid coordinate or normal fails the whole batch before writing',()=>{
  const arena=new StereographicOutputArena(input(),{segments:2,triangles:2});
  for(const bad of [NaN,Infinity,1e10]){
    assert.throws(()=>arena.appendSegments(0,[arc,{a:[bad,0,0],b:[1,0,0]}]),/finite/);
    assert.throws(()=>arena.appendTriangles(0,[patch,{...patch,normals:[[1,0,0],[0,1,0],[0,0,bad]]}]),/finite/);
    assert.equal(arena.segmentCount,0);assert.equal(arena.triangleCount,0);
  }
  arena.appendTriangles(0,[patch]);sameBits(arena.finish().triangles,new Float32Array(patch.points.flat()));
});

test('accessor and sparse batches are refused without running getters',()=>{
  const arena=new StereographicOutputArena(input(),{segments:2,triangles:2});let visits=0;
  const bad={points:patch.points};Object.defineProperty(bad,'normals',{get(){visits++;return patch.normals;}});
  assert.throws(()=>arena.appendTriangles(0,[patch,bad]),/data property/);
  const endpoint=[1,0,0];Object.defineProperty(endpoint,1,{get(){visits++;return 0;}});assert.throws(()=>arena.appendSegments(0,[{a:endpoint,b:arc.b}]),/data property/);
  const sparse=[patch,patch];delete sparse[1];assert.throws(()=>arena.appendTriangles(0,sparse),/data property/);
  assert.equal(visits,0);assert.equal(arena.triangleCount,0);
});

test('missing normals use the original ordered flat normal arithmetic including degenerate zero',()=>{
  const arena=new StereographicOutputArena(input(),{segments:0,triangles:2});
  arena.appendTriangles(0,[{points:[[1,0,0],[0,1,0],[0,0,1]]},{points:[[0,0,0],[0,0,0],[0,0,0]]}]);
  const actual=arena.finish(),unit=1/Math.sqrt(3);sameBits(actual.normals,new Float32Array([unit,unit,unit,unit,unit,unit,unit,unit,unit,...Array(9).fill(0)]));
});

test('finished prefix views contain no unused slots and cannot be appended or finished twice',()=>{
  const arena=new StereographicOutputArena(input(),{segments:10,triangles:10});arena.appendSegments(0,[arc]);const actual=arena.finish();
  assert.equal(actual.segments.length,6);assert.equal(actual.triangles.length,0);assert.equal(actual.segments.buffer.byteLength,10*6*4);
  assert.throws(()=>arena.appendSegments(0,[]),/finished/);assert.throws(()=>arena.finish(),/finished/);
});

test('limits and invalid native ownership fail before an arena can accept output',()=>{
  const source=input();for(const options of [{triangles:100001},{segments:-1},{bytes:1},{unknown:1},{triangles:Infinity}])assert.throws(()=>new StereographicOutputArena(source,options),/bounds|bound|unknown/);
  const options={};Object.defineProperty(options,'triangles',{get(){throw Error('getter ran');}});assert.throws(()=>new StereographicOutputArena(source,options),/accessor/);
  source.faceIds[1]=99;assert.throws(()=>new StereographicOutputArena(source),/source|range|invalid/i);
});

test('actual adaptive circular segments and analytic normals match production buffers and decoder provenance',()=>{
  const source=input(),original=computeStereographicWorkerGeometry(source),arena=new StereographicOutputArena(source);
  for(let i=0;i<source.edgeIds.length;i++){
    const points=[0,1].map(k=>Array.from(source.positions.subarray(source.edges[i*2+k]*4,source.edges[i*2+k]*4+4)));
    arena.appendSegments(i,stereoDisplayGeometry(points,[[0,1]],[],{edges:[true],faces:[]},null,[]).edges);
  }
  for(let i=0;i<source.faceIds.length;i++){
    const points=[0,1,2].map(k=>Array.from(source.trianglePositions.subarray(i*12+k*4,i*12+k*4+4)));
    arena.appendTriangles(i,stereoDisplayGeometry([],[],[{normalized:points,face:0}],{edges:[],faces:[true]},null,[]).triangles);
  }
  const packed=arena.finish();for(const key of Object.keys(packed))sameBits(packed[key],original.geometry[key]);
  const decoded=decodeStereographicOutput({...original.geometry,...packed},source);for(const key of Object.keys(packed))sameBits(decoded[key],original.geometry[key]);
  assert.equal(decoded.triangles.buffer.byteLength,decoded.triangles.byteLength);assert.notEqual(decoded.triangles.buffer,packed.triangles.buffer);
});

test('packing cannot qualify partial status, repair forged ownership or change clipping diagnostics',()=>{
  const source=input(),original=computeStereographicWorkerGeometry(source,{limits:{triangles:1}}),arena=new StereographicOutputArena(source,{segments:0,triangles:1});
  arena.appendTriangles(0,[{points:Array.from({length:3},(_,i)=>Array.from(original.geometry.triangles.subarray(i*3,i*3+3))),normals:Array.from({length:3},(_,i)=>Array.from(original.geometry.normals.subarray(i*3,i*3+3)))}]);
  const output={...original.geometry,...arena.finish(),segments:original.geometry.segments,edgeIds:original.geometry.edgeIds,edgeFaces:original.geometry.edgeFaces,edgeCells:original.geometry.edgeCells,edgeInstanceIds:original.geometry.edgeInstanceIds};
  assert.equal(original.complete,false);assert.deepEqual([...original.geometry.triangleResolution],[3,4]);decodeStereographicOutput(output,source);
  output.faceIds[0]=1;assert.throws(()=>decodeStereographicOutput(output,source),/owner|provenance|match/i);
});

test('direct writes require neither Array.flat nor TypedArray.set per primitive',()=>{
  const arena=new StereographicOutputArena(input(),{segments:1,triangles:1}),flat=Array.prototype.flat,set=Float32Array.prototype.set;
  try{Array.prototype.flat=()=>{throw Error('flat');};Float32Array.prototype.set=()=>{throw Error('set');};arena.appendSegments(0,[arc]);arena.appendTriangles(0,[patch]);}
  finally{Array.prototype.flat=flat;Float32Array.prototype.set=set;}
  assert.equal(arena.finish().triangles.length,9);
});

test('scalar coordinate path is bit-identical to legacy records and takes owners only from its bound source',()=>{
  const source=input(),arena=new StereographicOutputArena(source,{segments:2,triangles:2});
  for(let instance=0;instance<2;instance++){
    arena.appendSegmentCoordinates(instance,...arc.a,...arc.b);
    arena.appendTriangleCoordinates(instance,...patch.points.flat(),...patch.normals.flat());
  }
  const actual=arena.finish(),expected=legacyPack(source,[{...arc,instance:0},{...arc,instance:1}],[{...patch,instance:0},{...patch,instance:1}]);
  for(const key of Object.keys(expected))sameBits(actual[key],expected[key]);
});

test('scalar invalid inputs or capacity/order failures never advance a primitive or publish partial coordinates',()=>{
  const arena=new StereographicOutputArena(input(),{segments:1,triangles:1}),numbers=[...patch.points.flat(),...patch.normals.flat()];
  for(let i=0;i<numbers.length;i++){
    const invalid=[...numbers];invalid[i]=i%3===0?NaN:i%3===1?Infinity:1e10;
    assert.throws(()=>arena.appendTriangleCoordinates(1,...invalid),/finite/);assert.equal(arena.triangleCount,0);
  }
  assert.throws(()=>arena.appendTriangleCoordinates(0,...numbers.slice(0,-1)),/finite/);
  arena.appendTriangleCoordinates(0,...numbers);assert.throws(()=>arena.appendTriangleCoordinates(1,...numbers),/resource/);
  assert.throws(()=>arena.appendSegmentCoordinates(1,1,0,0,0,Infinity,0),/finite/);assert.equal(arena.segmentCount,0);
  arena.appendSegmentCoordinates(0,...arc.a,...arc.b);sameBits(arena.finish().triangles,new Float32Array(patch.points.flat()));
});

test('scalar path retains true adaptive output and authoritative complete/partial status unchanged',()=>{
  for(const options of [{},{limits:{triangles:1,segments:1}}]){
    const source=input(),original=computeStereographicWorkerGeometry(source,options),arena=new StereographicOutputArena(source);
    for(let instance=0;instance<source.edgeIds.length;instance++)for(let i=0;i<original.geometry.edgeIds.length;i++)if(original.geometry.edgeInstanceIds[i]===instance)arena.appendSegmentCoordinates(instance,...original.geometry.segments.subarray(i*6,i*6+6));
    for(let instance=0;instance<source.faceIds.length;instance++)for(let i=0;i<original.geometry.faceIds.length;i++)if(original.geometry.triangleInstanceIds[i]===instance)arena.appendTriangleCoordinates(instance,...original.geometry.triangles.subarray(i*9,i*9+9),...original.geometry.normals.subarray(i*9,i*9+9));
    const actual=arena.finish();for(const key of Object.keys(actual))sameBits(actual[key],original.geometry[key]);decodeStereographicOutput({...original.geometry,...actual},source);
    assert.equal(original.complete,!options.limits);
  }
});

for(const capped of [false,true])test(`real transport capture ${capped?'refuses capped':'accepts complete'} scalar-packed output without changing source ownership`,async()=>{
  const geometry=input(),model={id:'arena-source',fingerprint:'a'.repeat(64),vertices:[[1,0,0,0],[0,1,0,0],[0,0,1,0]],edges:[[0,1],[1,2],[2,0]],faces:[[0,1,2],[2,1,0]],cells:[[0],[1]]},owner={model,sourceKey:JSON.stringify([model.id,model.fingerprint]),frameKey:'arena-pose',generation:1};
  const quality=planStereographicQuality({cameraProjection:'orthographic',cssHeight:684,orthographicHalfHeight:1.45,zoom:1,phase:'capture'}),request={...owner,phase:'capture',token:1,quality,geometry};let published=0,listener;
  const worker={addEventListener(type,fn){if(type==='message')listener=fn;},removeEventListener(){},terminate(){},postMessage(job){queueMicrotask(()=>{
    const result=computeStereographicWorkerGeometry(job.geometry,capped?{limits:{triangles:1}}:{}),arena=new StereographicOutputArena(job.geometry);
    for(let i=0;i<result.geometry.edgeIds.length;i++)arena.appendSegmentCoordinates(result.geometry.edgeInstanceIds[i],...result.geometry.segments.subarray(i*6,i*6+6));
    for(let i=0;i<result.geometry.faceIds.length;i++)arena.appendTriangleCoordinates(result.geometry.triangleInstanceIds[i],...result.geometry.triangles.subarray(i*9,i*9+9),...result.geometry.normals.subarray(i*9,i*9+9));
    const packed=decodeStereographicOutput({...result.geometry,...arena.finish()},job.geometry);
    listener({data:{type:'geometry-result',version:1,jobId:job.jobId,token:job.token,generation:job.generation,sourceKey:job.sourceKey,frameKey:job.frameKey,phase:job.phase,...result,geometry:packed}});
  });}};
  const coordinator=new StereographicWorkerCoordinator({worker,getOwner:()=>owner,publish:()=>{published++;}});
  try{
    if(capped){await assert.rejects(coordinator.capture(request),/complete geometry/);assert.equal(published,0);}
    else{const captured=await coordinator.capture(request);assert.equal(captured.complete,true);assert.equal(published,1);assert.deepEqual([...new Set(captured.geometry.cellIds)],[0,1]);}
  }finally{coordinator.destroy();}
});
