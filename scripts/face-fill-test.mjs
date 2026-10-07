import assert from 'node:assert/strict';
import {buildFaceSurfaces,FACE_FILL_LIMITS} from '../ui/face-fill.mjs';

const model=(points,cycle=points.map((_,i)=>i))=>({vertices:points,faces:[cycle]});
const area=result=>result.triangles.reduce((sum,{points:[a,b,c]})=>{
  const u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]);
  const dot=(x,y)=>x.reduce((s,a,i)=>s+a*y[i],0);
  return sum+Math.sqrt(Math.max(0,dot(u,u)*dot(v,v)-dot(u,v)**2))/2;
},0);
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<Math.abs(expected)*1e-8+1e-12,`${actual} != ${expected}`);
const points=Array.from({length:5},(_,i)=>[Math.cos(i*2*Math.PI/5),Math.sin(i*2*Math.PI/5),0]);
const star=model(points,[0,2,4,1,3]),saved=JSON.stringify(star);
const innerRadius=Math.cos(2*Math.PI/5)/Math.cos(Math.PI/5);
const unionArea=5*innerRadius*Math.sin(Math.PI/5);
const innerArea=2.5*innerRadius**2*Math.sin(2*Math.PI/5);
near(area(buildFaceSurfaces(star)),unionArea);
near(area(buildFaceSurfaces(star,'even-odd')),unionArea-innerArea);
near(area(buildFaceSurfaces(model(points))),2.5*Math.sin(2*Math.PI/5));
assert.equal(JSON.stringify(star),saved);
assert.ok(buildFaceSurfaces(star).triangles.every(t=>t.face===0&&!t.vertices));
near(area(buildFaceSurfaces(model(points,[3,1,4,2,0]))),unionArea); // reversed cycle
near(area(buildFaceSurfaces(model([[-1,-1],[1,1],[-1,1],[1,-1]]))),2); // bow tie
near(area(buildFaceSurfaces(model([[0,0],[2,0],[2,1],[1,1],[1,2],[0,2]]))),3); // concave L
const twice=model([[0,0],[1,0],[1,1],[0,1],[0,0],[1,0],[1,1],[0,1]]);
near(area(buildFaceSurfaces(twice)),1); // coincident source IDs retain winding 2
assert.equal(buildFaceSurfaces(twice,'even-odd').triangles.length,0);

// A convex fan cannot replace the pentagram: its center has winding 2.
for(const scale of [1e-9,1e9]){
  const transformed=model(points.map(([x,y])=>[scale*x/Math.sqrt(2),scale*y/Math.sqrt(2),scale*x/Math.sqrt(2),scale*y/Math.sqrt(2)]),star.faces[0]);
  near(area(buildFaceSurfaces(transformed))/scale**2,unionArea);
}
assert.equal(buildFaceSurfaces(model([[0,0,0],[1,0,0],[1,1,1],[0,1,0]])).suppressedFaces,1);
assert.match(buildFaceSurfaces(model([[0,0],[1,0],[2,0]])).diagnostics[0].reason,/dimension/);
assert.throws(()=>buildFaceSurfaces(star,'unknown'),/fill rule/);
const oversized=Array.from({length:FACE_FILL_LIMITS.faceVertices+1},(_,i)=>[Math.cos(i),Math.sin(i)]);
assert.match(buildFaceSurfaces(model(oversized)).diagnostics[0].reason,/resource limit/);
assert.equal(buildFaceSurfaces({vertices:points,faces:[[0,1,2],[0,0,1]]}).filledFaces,1);
const selected=buildFaceSurfaces({vertices:points,faces:[[0,1,2],star.faces[0]]},'even-odd',{faceIds:[1]});
assert.equal(selected.consideredFaces,1);
assert.ok(selected.triangles.every(t=>t.face===1));
near(area(selected),unionArea-innerArea);
assert.throws(()=>buildFaceSurfaces(star,'nonzero',{faceIds:[0,0]}),/source face IDs/);
console.log('Face filling: independent pentagram areas, winding rules, concavity, crossings, scale/4D covariance, source preservation and diagnostics passed.');
