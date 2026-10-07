import test from 'node:test';
import assert from 'node:assert/strict';
import {stereographicPoint,stereographicEdge,stereographicTriangle} from '../ui/stereographic.mjs';
import {project,rotate} from '../ui/projection.js';
const close=(a,b,t=1e-10)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const x=[1,0,0,0],y=[0,1,0,0],z=[0,0,1,0];

test('north-pole stereographic formula and radial scale independence',()=>{
  const p=[Math.sqrt(3)/2,0,0,.5];close(stereographicPoint(p).point[0],Math.sqrt(3));
  assert.deepEqual(stereographicPoint(p.map(v=>v*5)),stereographicPoint(p));
  assert.deepEqual(project(p,'stereographic'),stereographicPoint(p));
  assert.equal(stereographicPoint([0,0,0,1]).clipped,true);
  assert.equal(stereographicPoint([0,0,0,0]).clipped,true);
});

test('literal +X to +Y source edge becomes a quarter circle rather than a chord',()=>{
  const result=stereographicEdge(x,y);assert.ok(result.segments.length>8);assert.deepEqual(result.diagnostics,[]);
  for(const {a,b} of result.segments)for(const p of [a,b]){close(p[0]**2+p[1]**2,1);close(p[2],0);}
  const middle=result.segments.flatMap(s=>[s.a,s.b]).find(p=>Math.abs(p[0]-p[1])<1e-10);
  close(middle[0],Math.SQRT1_2);assert.ok(middle[0]+middle[1]>1.4);
  for(const {a,b} of result.segments){const midpoint=a.map((v,i)=>(v+b[i])/2);assert.ok(1-Math.hypot(...midpoint)<=.001);}
});

test('generic great-circle samples lie in one independently fitted Euclidean circle',()=>{
  const a=rotate(x,[11,7,28,19,-13,4]),b=rotate(y,[11,7,28,19,-13,4]);
  const points=stereographicEdge(a,b,{tolerance:.0001}).segments.flatMap(s=>[s.a,s.b]);
  const p=points[0],q=points[Math.floor(points.length/2)],r=points.at(-1);
  const u=q.map((v,i)=>v-p[i]),v=r.map((w,i)=>w-p[i]);
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),uu=dot(u,u),vv=dot(v,v),uv=dot(u,v),det=uu*vv-uv*uv;
  const alpha=vv*(uu-uv)/(2*det),beta=uu*(vv-uv)/(2*det),center=p.map((w,i)=>w+alpha*u[i]+beta*v[i]);
  const radius=Math.hypot(...p.map((w,i)=>w-center[i]));
  for(const point of points)close(Math.hypot(...point.map((w,i)=>w-center[i])),radius,1e-8);
});

test('a circle containing the pole legitimately projects to a straight line',()=>{
  const result=stereographicEdge(x,[0,0,0,1]);assert.ok(result.segments.length);
  assert.ok(result.clippedSegments);for(const s of result.segments)for(const p of [s.a,s.b]){close(p[1],0);close(p[2],0);assert.ok(p.every(Number.isFinite));}
});

test('arc crossing the pole remains two branches without any bridge across infinity',()=>{
  const result=stereographicEdge([.5,0,0,Math.sqrt(3)/2],[-.5,0,0,Math.sqrt(3)/2]);
  assert.ok(result.clippedSegments);assert.ok(result.segments.some(s=>s.a[0]>0));assert.ok(result.segments.some(s=>s.a[0]<0));
  assert.ok(result.segments.every(s=>s.a[0]*s.b[0]>0));
  assert.ok(result.segments.every(s=>[...s.a,...s.b].every(Number.isFinite)));
});

test('antipodal/source-center edges are diagnosed rather than assigned an arbitrary arc',()=>{
  const result=stereographicEdge(x,[-1,0,0,0]);assert.equal(result.segments.length,0);assert.match(result.diagnostics.join(' '),/no unique/);
});

test('radial surface triangle becomes a curved unit-sphere patch',()=>{
  const source=[x,y,z],before=structuredClone(source),result=stereographicTriangle(source,{tolerance:.002});
  assert.ok(result.triangles.length>16);assert.deepEqual(result.diagnostics,[]);assert.deepEqual(source,before);
  for(const triangle of result.triangles)for(const p of triangle)close(Math.hypot(...p),1);
  assert.ok(result.triangles.flat().some(p=>p.every(v=>v>.4)));
});

test('surface pole contained strictly inside a patch is clipped even with finite corners',()=>{
  const source=[[1,0,0,1],[-.5,Math.sqrt(3)/2,0,1],[-.5,-Math.sqrt(3)/2,0,1]];
  const result=stereographicTriangle(source,{tolerance:.01,maxDepth:7,maxTriangles:10000});
  assert.ok(result.clippedTriangles);assert.ok(result.triangles.length);
  for(const triangle of result.triangles)for(const point of triangle)assert.ok(point.every(Number.isFinite)&&Math.hypot(...point)<10);
});

test('a face through source center cannot silently fill its undefined spherical interior',()=>{
  const result=stereographicTriangle([[1,0,0,0],[0,1,0,0],[-1,-1,0,0]]);
  assert.equal(result.triangles.length,0);assert.match(result.diagnostics.join(' '),/undefined/);
});

test('resource caps omit unresolved curves and patches with diagnostics',()=>{
  const edge=stereographicEdge(x,y,{maxSegments:1});assert.ok(edge.exhausted);assert.equal(edge.segments.length,1);
  const patch=stereographicTriangle([x,y,z],{maxTriangles:1});assert.ok(patch.exhausted);assert.equal(patch.triangles.length,1);
  const noDepth=stereographicEdge(x,y,{maxDepth:0});assert.ok(noDepth.exhausted);assert.equal(noDepth.segments.length,0);
});

test('ordinary projection modes retain their original straight-edge point formulas',()=>{
  assert.deepEqual(project([1,2,3,.5],'orthographic'),{point:[1,2,3],clipped:false});
  assert.deepEqual(project([1,2,3,.5],'perspective'),{point:[1.2,2.4,3.5999999999999996],clipped:false});
});

for(const options of [{poleEpsilon:0},{maxDepth:99},{tolerance:-1},{maxSegments:0},{maxTriangles:0}])test('invalid subdivision bounds rejected '+JSON.stringify(options),()=>{
  assert.throws(()=>stereographicEdge(x,y,options));assert.throws(()=>stereographicTriangle([x,y,z],options));
});
