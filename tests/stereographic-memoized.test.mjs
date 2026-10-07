import test from 'node:test';
import assert from 'node:assert/strict';
import * as original from './fixtures/legacy-stereographic.mjs';
import * as production from '../ui/stereographic.mjs';
import * as candidate from '../development/stereographic-memoized.mjs';

const byteFloats=values=>Buffer.from(new Float64Array(values).buffer);
function sameGeometry(a,b){
  if(Array.isArray(a)){assert.ok(Array.isArray(b));assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)sameGeometry(a[i],b[i]);}
  else if(typeof a==='number'){assert.equal(typeof b,'number');assert.deepEqual(byteFloats([a]),byteFloats([b]));}
  else if(a&&typeof a==='object'){assert.deepEqual(Object.keys(a),Object.keys(b));for(const key of Object.keys(a))sameGeometry(a[key],b[key]);}
  else assert.deepEqual(b,a);
}
const edge=(a,b,options)=>{const before=JSON.stringify([a,b]),expected=original.stereographicEdge(a,b,options),actual=candidate.stereographicEdge(a,b,options);sameGeometry(expected,actual);assert.equal(JSON.stringify([a,b]),before);return actual;};
const triangle=(points,options)=>{const before=JSON.stringify(points),expected=original.stereographicTriangle(points,options),actual=candidate.stereographicTriangle(points,options);sameGeometry(expected,actual);assert.equal(JSON.stringify(points),before);return actual;};
const generic=[[1,.2,.3,.25],[-.15,1,.1,.35],[.1,-.2,1,-.4]];
const distance=(p,a,b)=>{const d=b.map((x,i)=>x-a[i]),den=d.reduce((sum,x)=>sum+x*x,0),t=den?Math.max(0,Math.min(1,d.reduce((sum,x,i)=>sum+(p[i]-a[i])*x,0)/den)):0;return Math.hypot(...p.map((x,i)=>x-a[i]-t*d[i]));};

test('scalar radial point arithmetic preserves every Float64 bit at ordinary, tiny, huge and cutoff samples',()=>{
  for(const p of [[1,0,0,0],[1,-0,.3,.7],[-.1,2,-3,-.4],[1e-180,-2e-180,3e-180,-4e-180],[1e180,-2e180,3e180,-4e180],[0,0,0,0],[0,0,0,1],[.2,0,0,.98]])for(const poleEpsilon of [.02,.1,.0001])sameGeometry(original.stereographicPoint(p,{poleEpsilon}),candidate.stereographicPoint(p,{poleEpsilon}));
});

test('ordinary circular and generic arcs preserve raw parameter intervals and all clipping/resource states',()=>{
  for(const [a,b] of [[[1,0,0,0],[0,1,0,0]],[generic[0],generic[1]],[[.4,.2,1,-.5],[-.2,.3,1,.8]]])for(const options of [{},{tolerance:.004,maxDepth:8},{tolerance:.032,maxDepth:8},{maxSegments:1},{maxDepth:0},{maxDepth:2,tolerance:1e-8}])edge(a,b,options);
});

test('generic surface patches preserve all Float64 vertices and deterministic recursive ordering',()=>{
  for(const points of [generic,[[1,0,0,0],[0,1,0,0],[0,0,1,0]],[[1,.3,0,1],[0,1,.3,.4],[.5,.3,1,-.7]]])for(const options of [{tolerance:.004,maxDepth:8},{tolerance:.032,maxDepth:8},{maxTriangles:1},{maxDepth:0},{maxDepth:2,tolerance:1e-8}])triangle(points,options);
});

test('pole crossings split arcs without bridges and preserve the diagnosed omissions',()=>{
  const result=edge([1,0,0,1],[-1,0,0,1],{tolerance:.004,maxDepth:8});
  assert.ok(result.clippedSegments>0);assert.ok(result.diagnostics.some(d=>d.includes('pole')));assert.ok(result.segments.length>0);
  for(const segment of result.segments){assert.ok(segment.t1<=.5||segment.t0>=.5);for(const p of [segment.a,segment.b])assert.ok(Math.hypot(...p)<=Math.sqrt(99)+1e-10);}
});

test('positive-cone interior pole tests preserve clipped leaves even when source corners are clear',()=>{
  const points=[[1,0,0,1],[0,1,0,1],[-1,-1,0,1]],result=triangle(points,{tolerance:.032,maxDepth:8,maxTriangles:100000});
  assert.ok(result.clippedTriangles>0);assert.ok(result.triangles.length>0);assert.ok(result.diagnostics.some(d=>d.includes('pole')));
  for(const patch of result.triangles)for(const p of patch)assert.ok(Math.hypot(...p)<=Math.sqrt(99)+1e-10);
});

test('center-crossing, undefined radial and degenerate cases retain refusal without invented geometry',()=>{
  assert.match(edge([1,0,0,0],[-1,0,0,0]).diagnostics[0],/source center/);
  for(const points of [[[1,0,0,0],[-1,0,0,0],[0,1,0,0]],[[0,0,0,0],[1,0,0,0],[0,1,0,0]],[[1,0,0,0],[1,0,0,0],[1,0,0,0]]])triangle(points,{maxDepth:2});
});

test('sample reuse is strictly per primitive and reduces radial work under a fixed traversal bound',()=>{
  candidate.resetAdaptiveProfile();const options={tolerance:.004,maxDepth:5,maxTriangles:4096},first=triangle(generic,options),profile={...candidate.ADAPTIVE_PROFILE};
  assert.equal(profile.triangleCalls,1);assert.ok(profile.triangleCacheHits>0);assert.ok(profile.trianglePointEvaluations<profile.triangleSampleRequests*.7);
  assert.equal(profile.triangleSampleRequests,profile.trianglePointEvaluations+profile.triangleCacheHits);assert.ok(profile.triangleVisits<=(4**6-1)/3);
  triangle(generic.map(p=>p.map((x,i)=>i===3?-x:x)),options);assert.equal(candidate.ADAPTIVE_PROFILE.triangleCalls,2);
  const second=triangle(generic,options);sameGeometry(first,second);assert.equal(candidate.ADAPTIVE_PROFILE.triangleCalls,3);
});

test('edge sample cache stays within its dyadic parameter bound and does not persist across source poses',()=>{
  candidate.resetAdaptiveProfile();edge(generic[0],generic[1],{maxDepth:5,tolerance:1e-8});const p={...candidate.ADAPTIVE_PROFILE};
  assert.ok(p.edgeCacheHits>0);assert.ok(p.edgePointEvaluations<=2**6+1);assert.ok(p.edgeVisits<=2**6-1);assert.equal(p.edgeSampleRequests,p.edgePointEvaluations+p.edgeCacheHits);
  edge(generic[1],generic[0],{maxDepth:5,tolerance:1e-8});assert.equal(candidate.ADAPTIVE_PROFILE.edgeCalls,2);
});

test('retained arc midpoints satisfy the original sampled criterion against an independent point-to-segment calculation',()=>{
  const [a,b]=generic,tolerance=.004,result=edge(a,b,{tolerance,maxDepth:8});assert.equal(result.exhausted,false);
  for(const segment of result.segments){const t=(segment.t0+segment.t1)/2,raw=a.map((x,i)=>x*(1-t)+b[i]*t),radius=Math.hypot(...raw),q=raw.map(x=>x/radius),p=q.slice(0,3).map(x=>x/(1-q[3]));assert.ok(distance(p,segment.a,segment.b)<=tolerance+1e-12);}
});

test('literal unit-sphere patch independently satisfies reconstructed raw midpoint/interior samples',()=>{
  const tolerance=.016,result=triangle([[1,0,0,0],[0,1,0,0],[0,0,1,0]],{tolerance,maxDepth:8});assert.equal(result.exhausted,false);
  for(const patch of result.triangles){
    // Source affine simplex has x+y+z=1, w=0. Recover each raw barycentric
    // sample from its radial image, without using either implementation.
    for(const p of patch)assert.ok(Math.abs(Math.hypot(...p)-1)<1e-12);
    const raw=patch.map(p=>{const sum=p[0]+p[1]+p[2];return p.map(x=>x/sum);}),normalize=p=>{const radius=Math.hypot(...p);return p.map(x=>x/radius);};
    for(let k=0;k<3;k++){const midpoint=normalize(raw[k].map((x,i)=>(x+raw[(k+1)%3][i])/2));assert.ok(distance(midpoint,patch[k],patch[(k+1)%3])<=tolerance+1e-12);}
    const center=normalize(raw[0].map((_,i)=>(raw[0][i]+raw[1][i]+raw[2][i])/3)),u=patch[1].map((x,i)=>x-patch[0][i]),v=patch[2].map((x,i)=>x-patch[0][i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);
    assert.ok(Math.abs(center.reduce((sum,x,i)=>sum+(x-patch[0][i])*n[i],0))/length<=tolerance+1e-12);
  }
});

test('leaf output arrays remain independent across neighboring patches, edges and repeated calls',()=>{
  const segments=edge([1,0,0,0],[0,1,0,0],{tolerance:.004,maxDepth:8}).segments;
  for(let i=1;i<segments.length;i++)assert.notEqual(segments[i-1].b,segments[i].a);
  const points=[[1,0,0,0],[0,1,0,0],[0,0,1,0]],a=triangle(points,{tolerance:.004,maxDepth:8}),b=triangle(points,{tolerance:.004,maxDepth:8}),seen=new Set();
  for(const patch of a.triangles)for(const point of patch){assert.equal(seen.has(point),false);seen.add(point);}a.triangles[0][0][0]=99;assert.notEqual(b.triangles[0][0][0],99);assert.equal(points[0][0],1);
});

test('invalid coordinates, cutoff and resource options are refused as before',()=>{
  for(const options of [{poleEpsilon:0},{poleEpsilon:1},{tolerance:0},{maxDepth:15},{maxDepth:-1},{maxSegments:100001},{maxTriangles:250001}]){
    assert.throws(()=>original.stereographicEdge(generic[0],generic[1],options));assert.throws(()=>candidate.stereographicEdge(generic[0],generic[1],options));
  }
  assert.throws(()=>candidate.stereographicPoint([NaN,0,0,0]),/finite/);assert.throws(()=>candidate.stereographicTriangle([generic[0],generic[1],[Infinity,0,0,0]]),/finite/);
});

test('current production contract remains numerically equivalent to its independently frozen adaptive reference',()=>{
  for(const options of [{tolerance:.004,maxDepth:8},{maxTriangles:1},{maxDepth:0}])sameGeometry(original.stereographicTriangle(generic,options),production.stereographicTriangle(generic,options));
  sameGeometry(original.stereographicEdge([1,0,0,1],[-1,0,0,1],{tolerance:.004,maxDepth:8}),production.stereographicEdge([1,0,0,1],[-1,0,0,1],{tolerance:.004,maxDepth:8}));
});
