import test from 'node:test';
import assert from 'node:assert/strict';
import {GrowingStereographicOutputArena as Growing} from '../development/stereographic-growing-output-arena.mjs';
import {StereographicOutputArena as Fixed} from '../ui/stereographic-output-arena.mjs';
import {prepareStereographicWorkerGeometry} from '../ui/stereographic-worker-geometry.mjs';

function source(){
  const points=[[1,0,0,0],[0,1,0,0],[0,0,1,0]],model={dimension:4,embeddingDimension:4,vertices:points,edges:[[0,1]],faces:[[0,1,2]],cells:[]};
  return prepareStereographicWorkerGeometry({model,normalized:points,edges:model.edges,triangles:[{face:0,vertices:[0,1,2]}],visibility:{vertices:[true,true,true],edges:[true],faces:[true]}});
}
const patch=[1,-0,0,0,1,0,0,0,1,1,-0,0,0,1,0,0,0,1],arc=[1,-0,0,0,1,0];
function same(actual,expected){for(const key of Object.keys(expected))assert.deepEqual(Buffer.from(actual[key].buffer,actual[key].byteOffset,actual[key].byteLength),Buffer.from(expected[key].buffer,expected[key].byteOffset,expected[key].byteLength),key);}

test('visible source seeds reduce initial allocation while retaining original remaining output budgets',()=>{
  const arena=new Growing(source());assert.equal(arena.segmentCapacity,32);assert.equal(arena.triangleCapacity,32);assert.equal(arena.capacityBytes,4096);assert.equal(arena.cumulativeAllocatedBytes,4096);assert.equal(arena.remainingSegments,60000);assert.equal(arena.remainingTriangles,100000);
});
test('geometric growth preserves every coordinate/normal/owner bit through multiple transitions',()=>{
  const input=source(),a=new Growing(input),b=new Fixed(input);
  for(let i=0;i<1000;i++){a.appendTriangleCoordinates(0,...patch);b.appendTriangleCoordinates(0,...patch);if(i<257){a.appendSegmentCoordinates(0,...arc);b.appendSegmentCoordinates(0,...arc);}}
  assert.equal(a.triangleCapacity,1024);assert.equal(a.segmentCapacity,512);assert.ok(a.growthCount>=8);same(a.finish(),b.finish());
});
test('batch growth occurs after full validation and late refusal changes neither capacity nor ownership',()=>{
  const a=new Growing(source()),points=[[1,0,0],[0,1,0],[0,0,1]],normals=points,batch=Array.from({length:50},()=>({points,normals}));batch[49]={points:[[NaN,0,0],points[1],points[2]],normals};
  assert.throws(()=>a.appendTriangles(0,batch),/finite/);assert.equal(a.triangleCapacity,32);assert.equal(a.triangleCount,0);assert.equal(a.growthCount,0);
  batch[49]={points,normals};a.appendTriangles(0,batch);assert.equal(a.triangleCapacity,64);assert.equal(a.triangleCount,50);
});
test('lowered absolute caps keep their exact last slot instead of being raised to a growth bucket',()=>{
  const a=new Growing(source(),{segments:35,triangles:35});for(let i=0;i<35;i++){a.appendSegmentCoordinates(0,...arc);a.appendTriangleCoordinates(0,...patch);}
  assert.equal(a.triangleCapacity,35);assert.equal(a.segmentCapacity,35);assert.throws(()=>a.appendTriangleCoordinates(0,...patch),/resource/);assert.equal(a.triangleCount,35);assert.equal(a.finish().triangles.length,315);
});
test('old+new temporary capacity is checked before allocation and failure keeps the previous arena usable',()=>{
  const input=source(),a=new Growing(input,{segments:0,triangles:64,bytes:6000});for(let i=0;i<32;i++)a.appendTriangleCoordinates(0,...patch);
  assert.throws(()=>a.appendTriangleCoordinates(0,...patch),/transition.*byte/);assert.equal(a.triangleCount,32);assert.equal(a.triangleCapacity,32);assert.equal(a.growthCount,0);assert.equal(a.finish().triangles.length,288);
});
test('masked-only geometry allocates zero coordinate capacity and cannot secretly own output',()=>{
  const input=source();input.edgeVisible.fill(0);input.triangleVisible.fill(0);const a=new Growing(input);assert.equal(a.capacityBytes,0);assert.equal(a.cumulativeAllocatedBytes,0);assert.throws(()=>a.appendTriangleCoordinates(0,...patch),/Masked/);assert.equal(a.finish().triangles.buffer.byteLength,0);
});
test('source edits remain detached across later capacity growth',()=>{
  const input=source(),a=new Growing(input);input.faceIds[0]=9;input.edgeIds[0]=9;input.triangleVisible[0]=0;
  for(let i=0;i<80;i++)a.appendTriangleCoordinates(0,...patch);const output=a.finish();assert.ok(output.faceIds.every(id=>id===0));assert.ok(output.triangleInstanceIds.every(id=>id===0));assert.equal(input.positions.byteLength,96);
});
test('prefix views remain spare-capacity views until authoritative decoding and cannot grow after finish',()=>{
  const a=new Growing(source());for(let i=0;i<33;i++)a.appendTriangleCoordinates(0,...patch);const output=a.finish();assert.equal(output.triangles.length,33*9);assert.equal(output.triangles.buffer.byteLength,64*9*4);assert.throws(()=>a.appendTriangleCoordinates(0,...patch),/finished/);
});
