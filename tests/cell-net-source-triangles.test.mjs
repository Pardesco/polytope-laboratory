import test from 'node:test';
import assert from 'node:assert/strict';
import {cellNetSourceSurfaces} from '../ui/cell-net-source-triangles.mjs';

const xy=[[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]],ids=[12,5,6,10,7,8],ears=[[0,1,2],[0,2,3],[0,3,5],[3,4,5]];
const cell=(id,dx)=>({id,sourceVertices:ids,points:xy.map(([x,y])=>[x+dx,y,0]),faces:[{id:19,vertices:[0,1,2,3,4,5]}]});
const net=()=>({cells:[cell(0,0),cell(1,9)],sourceFaceTriangles:ears.map(t=>({face:19,sourceVertices:t.map(i=>ids[i])}))});

test('both complete cell copies retain concave face area and distinct source ownership',()=>{
  const value=net(),before=structuredClone(value),surface=cellNetSourceSurfaces(value);assert.equal(surface.filledFaces,2);assert.equal(surface.triangles.length,8);
  for(const face of [0,1]){
    const tris=surface.triangles.filter(t=>t.face===face),area=tris.reduce((s,t)=>{const [a,b,c]=t.points;return s+Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;},0);assert.equal(area,5);
    assert.ok(tris.every(t=>t.vertices.every(v=>v>=face*6&&v<(face+1)*6)));
  }
  assert.deepEqual(value,before);assert.equal(cellNetSourceSurfaces(value,{faceIds:[1]}).triangles.length,4);assert.equal(cellNetSourceSurfaces(value,{faceIds:[]}).filledFaces,0);
});

test('concave surface corners use the same whole-cell shrink positions as ordinary corners',()=>{
  const value=net(),surface=cellNetSourceSurfaces(value),corners=value.cells.flatMap(c=>c.points),shrunk=value.cells.flatMap(c=>{const center=c.points[0].map((_,k)=>c.points.reduce((s,p)=>s+p[k],0)/c.points.length);return c.points.map(p=>p.map((v,k)=>center[k]+.5*(v-center[k])));});
  for(const triangle of surface.triangles)for(const vertex of triangle.vertices){assert.deepEqual(triangle.points[triangle.vertices.indexOf(vertex)],corners[vertex]);assert.notDeepEqual(shrunk[vertex],corners[vertex]);}
  const malformed=net();malformed.sourceFaceTriangles[0].sourceVertices[0]=99;assert.throws(()=>cellNetSourceSurfaces(malformed),/owning source face/);
});
