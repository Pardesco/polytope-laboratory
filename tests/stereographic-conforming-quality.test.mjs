import test from 'node:test';
import assert from 'node:assert/strict';
import {conformingTriangleSampledQuality} from '../ui/stereographic-conforming-quality.mjs';
import {stereographicTriangle} from '../ui/stereographic.mjs';
import {selectiveConformingPoleCut as optimized} from '../ui/stereographic-conforming-surface.mjs';
import {selectiveConformingPoleCut as frozen} from '../development/stereographic-selective-pole-cut.mjs';
import {prepareStereographicWorkerGeometry as prepare} from '../ui/stereographic-worker-geometry.mjs';
import {conformingNativeFixture} from '../development/conforming-worker-fixtures.mjs';

// Independent inverse stereographic and Euclidean segment/plane distance.
const project=p=>{const r=Math.hypot(...p),d=1-p[3]/r;return p.slice(0,3).map(x=>x/r/d);};
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),minus=(a,b)=>a.map((x,i)=>x-b[i]);
function literalError(raw){
  const q=raw.map(project),center=project([0,1,2,3].map(k=>raw.reduce((s,p)=>s+p[k],0)/3)),u=minus(q[1],q[0]),v=minus(q[2],q[0]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const distances=[Math.abs(dot(minus(center,q[0]),n))/Math.hypot(...n)];
  for(let i=0;i<3;i++){
    const p=project(raw[i].map((x,k)=>(x+raw[(i+1)%3][k])/2)),edge=minus(q[(i+1)%3],q[i]),from=minus(p,q[i]),t=Math.max(0,Math.min(1,dot(from,edge)/dot(edge,edge)));
    distances.push(Math.hypot(...from.map((x,k)=>x-t*edge[k])));
  }
  return Math.max(...distances);
}
test('direct sampled criterion agrees with independent chord/plane calculation and old depth-zero oracle',()=>{
  for(let i=0;i<60;i++){
    const raw=[[-.8,-.7,.3,-.2],[.9,-.5,.3,-.2],[.2,.8,.3,-.2]].map((p,j)=>p.map((x,k)=>x+(k<3?.07*Math.sin(i*1.37+j+k):0)));
    const q=conformingTriangleSampledQuality(raw),expected=literalError(raw);assert.ok(Math.abs(q.error-expected)<2e-14);assert.equal(q.clipped,false);
    for(const tolerance of [q.error*.999,q.error*1.001]){
      const oracle=stereographicTriangle(raw,{maxDepth:0,maxTriangles:1,tolerance});
      assert.equal(oracle.exhausted,q.error>tolerance);if(!oracle.exhausted)assert.deepEqual(oracle.triangles,[q.points]);
    }
  }
});
test('source sphere proof still refuses actual pole crossing, origin/rank and bounded depth',()=>{
  const raw=[[.08,0,0,1],[0,.08,0,1],[-.08,-.08,0,1]],input=[{id:0,face:0,cell:-1,topology:'near-pole',vertexIds:[0,1,2],points:raw}];
  const r=optimized(input,{maxDepth:0});assert.equal(r.complete,false);assert.equal(r.triangles.length,0);assert.ok(r.holes.length);
  const through=[{...input[0],points:[[1,0,0,0],[0,1,0,0],[-1,-1,0,0]]}];
  const zero=optimized(through);assert.equal(zero.complete,false);assert.equal(zero.triangles.length,0);assert.match(zero.holes[0].reason,/rank/);
  // Independent rays can still pass arbitrarily near the center at unequal
  // scales. Preserve the pre-existing conservative numerical origin refusal.
  const near=[[1e9,0,0,0],[0,1e9,0,0],[-1,-1,1e-11,0]],oracle=stereographicTriangle(near,{maxDepth:0});
  assert.match(oracle.diagnostics.join(' '),/source center/);
  const refused=optimized([{...input[0],points:near}]);assert.equal(refused.complete,false);assert.equal(refused.triangles.length,0);
});
for(const [key,tolerance] of [['tesseract',.004],['cell600',.032],['cell120',.032]])test(`optimized ${key} ${tolerance} retains frozen source geometry and coverage with explicit rendering corner order`,()=>{
  const f=conformingNativeFixture(key,{scope:'all'}),{center,radius}=f.recipe.normalization;
  const g=prepare({model:f.model,normalized:f.model.vertices.map(p=>p.map((x,k)=>(x-center[k])/radius)),edges:[],triangles:f.actualTriangles,visibility:{vertices:f.model.vertices.map(()=>0),edges:[],faces:f.model.faces.map(()=>1)},conformingSurfaces:true});
  const input=Array.from(g.faceIds,(face,i)=>({id:g.triangleIds[i],face,cell:g.cellIds[i],topology:'registered-presentation',vertexIds:Array.from(g.triangleCornerIds.subarray(i*3,i*3+3)),points:[0,1,2].map(k=>Array.from(g.trianglePositions.subarray(i*12+k*4,i*12+k*4+4)))}));
  const options={tolerance,maxDepth:8,maxTriangles:100000,maxVisits:1000000,maxCachedPoints:500000,maxInputTriangles:8192,maxRounds:64};
  const reference=frozen(input,options),actual=optimized(input,options);
  const sourceOrdered = actual.triangles.map(triangle => {
    const {renderCornerOrder, ...record} = triangle;
    assert.deepEqual([...renderCornerOrder].sort(), [0, 1, 2]);
    // Compare points/normals in the immutable raw/source corner order. The
    // rendering permutation must affect neither parameter coverage nor owners.
    record.points = [0, 1, 2].map(k => triangle.points[renderCornerOrder.indexOf(k)]);
    record.normals = [0, 1, 2].map(k => triangle.normals[renderCornerOrder.indexOf(k)]);
    return record;
  });
  assert.deepEqual({...actual, triangles: sourceOrdered}, reference);
});
