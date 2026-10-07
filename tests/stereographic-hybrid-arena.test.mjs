import test from 'node:test';
import assert from 'node:assert/strict';
import {createHybridStereographicOutputArena as create} from '../development/stereographic-hybrid-output-arena.mjs';
import {StereographicOutputArena} from '../ui/stereographic-output-arena.mjs';
import {prepareStereographicWorkerGeometry} from '../ui/stereographic-worker-geometry.mjs';
function input(n=1,visible=n){
  const points=[[1,0,0,0],[0,1,0,0],[0,0,1,0]],model={dimension:4,embeddingDimension:4,vertices:points,edges:[[0,1]],faces:[[0,1,2]],cells:[]},source=prepareStereographicWorkerGeometry({model,normalized:points,edges:model.edges,triangles:Array.from({length:n},()=>({face:0,vertices:[0,1,2]})),visibility:{vertices:[true,true,true],edges:[true],faces:[true]}});
  source.triangleVisible.fill(0);source.triangleVisible.subarray(0,visible).fill(1);return source;
}
const coordinates=[1,-0,0,0,1,0,0,0,1,1,-0,0,0,1,0,0,0,1];
test('small snapshots grow, while the exact1000-visible boundary seeds the full bounded triangle capacity',()=>{
  const below=create(input(1000,999)),at=create(input(1000));assert.equal(below.triangleCapacity,999*16);assert.equal(at.triangleCapacity,100000);assert.equal(at.remainingTriangles,100000);assert.equal(at.segmentCapacity,32);assert.equal(at.capacityBytes,8801280);
});
test('hidden instances and no-faces inputs never seed full capacity from catalogue/source counts',()=>{
  const hidden=create(input(2000,1));assert.equal(hidden.triangleCapacity,32);const empty=create(input(0));assert.equal(empty.triangleCapacity,0);assert.equal(empty.finish().triangles.byteLength,0);
  const source=input(2000,0);source.edgeVisible.fill(0);assert.equal(create(source).capacityBytes,0);
});
test('lowered global caps remain exact despite dense seeding and are never enlarged by heuristics',()=>{
  const arena=create(input(1000),{segments:3,triangles:7});assert.equal(arena.triangleCapacity,7);assert.equal(arena.segmentCapacity,3);
  for(let i=0;i<7;i++)arena.appendTriangleCoordinates(0,...coordinates);assert.throws(()=>arena.appendTriangleCoordinates(0,...coordinates),/resource/);assert.equal(arena.finish().triangles.length,63);
});
test('both seed paths keep fixed-arena coordinate/normal/ownership bits through actual growth',()=>{
  for(const n of [1,1000]){
    const source=input(n),a=create(source),b=new StereographicOutputArena(source);for(let i=0;i<80;i++){a.appendTriangleCoordinates(0,...coordinates);b.appendTriangleCoordinates(0,...coordinates);}
    const x=a.finish(),y=b.finish();for(const key of Object.keys(x))assert.deepEqual(Buffer.from(x[key].buffer,x[key].byteOffset,x[key].byteLength),Buffer.from(y[key].buffer,y[key].byteOffset,y[key].byteLength),key);
  }
});
test('source edits cannot change copied owners or dense allocation after factory construction',()=>{
  const source=input(1000),arena=create(source);source.triangleVisible.fill(0);source.faceIds[0]=99;arena.appendTriangleCoordinates(0,...coordinates);assert.equal(arena.triangleCapacity,100000);assert.equal(arena.finish().faceIds[0],0);
});
