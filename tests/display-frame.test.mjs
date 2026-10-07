import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {applyDisplayFrame,projectDisplayPoint,resolveDisplayFrame} from '../ui/display-frame.mjs';

const HASH='a'.repeat(64),OTHER_HASH='b'.repeat(64);
// Proper 90-degree XW rotation: X becomes W and W becomes -X.
const QUARTER=[[0,0,0,-1],[0,1,0,0],[0,0,1,0],[1,0,0,0]];
const IDENTITY=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
const source={dimension:4,embeddingDimension:4,fingerprint:HASH};
const frame=matrix=>({matrix:structuredClone(matrix),sourceFingerprint:HASH});
function close(actual,expected,tolerance=1e-12){
  assert.equal(actual.length,expected.length);
  actual.forEach((x,i)=>assert.ok(Math.abs(x-expected[i])<tolerance,`${actual} differs from ${expected}`));
}
function viewer(model){const value=Object.create(Viewer.prototype);value.group=new THREE.Group();value.setModel(model);return value;}
function manualProjection(point){
  // Independently composed XW 90 then XY 90, followed by perspective from W=3.
  const factor=3/(3-point[0]);return [-point[1]*factor,-point[3]*factor,point[2]*factor];
}
function star(){
  const vertices=Array.from({length:5},(_,i)=>{
    const x=Math.cos(i*2*Math.PI/5),y=Math.sin(i*2*Math.PI/5);return [x,y,.2*x,.4*y];
  });
  vertices.push([0,0,1,0],[0,0,-1,0],[0,0,0,1],[0,0,0,-1]);
  const cycle=[0,2,4,1,3];
  return {...source,vertices,edges:cycle.map((a,i)=>[a,cycle[(i+1)%5]]),faces:[cycle],cells:[],interpretation:'generalized-complex'};
}

test('source-bound SO(4) resolves to a copied matrix without mutating saved metadata',()=>{
  const saved=frame(QUARTER),before=JSON.stringify(saved),result=resolveDisplayFrame(source,saved);
  assert.equal(result.applied,true);assert.equal(result.diagnostic,null);assert.deepEqual(result.matrix,QUARTER);
  assert.notEqual(result.matrix,saved.matrix);assert.notEqual(result.matrix[0],saved.matrix[0]);
  result.matrix[0][0]=17;assert.equal(JSON.stringify(saved),before);
});

test('analytic 90-degree frame is applied once before incremental rotation and projection',()=>{
  const point=[.2,.3,.4,.5],before=[...point],matrix=resolveDisplayFrame(source,frame(QUARTER)).matrix;
  close(applyDisplayFrame(point,matrix),[-.5,.3,.4,.2]);
  close(projectDisplayPoint(point,matrix,[],'orthographic').point,[-.5,.3,.4]);
  close(projectDisplayPoint(point,matrix,[90,0,0,0,0,0],'perspective').point,manualProjection(point));
  assert.deepEqual(point,before);
  assert.notDeepEqual(projectDisplayPoint(applyDisplayFrame(point,matrix),matrix,[]).point,[-.5,.3,.4]);
});

test('old views and an explicitly cleared frame retain identity behavior',()=>{
  for(const saved of [undefined,null]){
    const result=resolveDisplayFrame(source,saved);assert.equal(result.applied,false);assert.equal(result.diagnostic,null);
    close(projectDisplayPoint([1,2,3,4],result.matrix).point,[1,2,3]);
  }
  const p=[1,2,3],copy=applyDisplayFrame(p,null);assert.deepEqual(copy,p);assert.notEqual(copy,p);
});

test('malformed, nonfinite, nonorthogonal and reflection matrices give explicit rejection',()=>{
  const reflection=structuredClone(IDENTITY);reflection[3][3]=-1;
  const scale=structuredClone(IDENTITY);scale[0][0]=1.001;
  for(const saved of [false,[],{},frame([[1]]),frame([...IDENTITY.slice(0,3),[0,0,0,NaN]]),frame([...IDENTITY.slice(0,3),[0,0,0,Infinity]]),frame([...IDENTITY.slice(0,3),[0,0,0,'1']]),frame(scale),frame(reflection)]){
    const result=resolveDisplayFrame(source,saved);assert.equal(result.applied,false);assert.equal(result.matrix,null);assert.match(result.diagnostic,/Orientation frame ignored:/);
  }
  assert.match(resolveDisplayFrame(source,frame(reflection)).diagnostic,/determinant \+1/);
});

test('geometry fingerprint mismatch and missing verified source identity reject a saved frame',()=>{
  for(const model of [{...source,fingerprint:OTHER_HASH},{...source,fingerprint:undefined},{...source,fingerprint:'unverified'}]){
    const result=resolveDisplayFrame(model,frame(QUARTER));assert.equal(result.applied,false);assert.match(result.diagnostic,/fingerprint/);
  }
  assert.equal(resolveDisplayFrame(source,{...frame(QUARTER),sourceFingerprint:OTHER_HASH}).applied,false);
});

test('3D and lower-dimensional embeddings remain unaffected by a saved 4D frame',()=>{
  for(const model of [{...source,dimension:3},{...source,embeddingDimension:3}]){
    const result=resolveDisplayFrame(model,frame(QUARTER));assert.equal(result.applied,false);assert.match(result.diagnostic,/intrinsic 4D/);
  }
  assert.throws(()=>applyDisplayFrame([1,2,3],QUARTER),/four-component/);
});

test('orthogonality and determinant tolerance rejects near-identity scale corruption',()=>{
  const accepted=structuredClone(IDENTITY);accepted[0][0]+=1e-10;
  assert.equal(resolveDisplayFrame(source,frame(accepted)).applied,true);
  const rejected=structuredClone(IDENTITY);rejected[0][0]+=1e-8;
  assert.equal(resolveDisplayFrame(source,frame(rejected)).applied,false);
});

test('actual viewer buffers apply saved frame identically to vertices and virtual star crossings',()=>{
  const model=star(),before=JSON.stringify(model),value=viewer(model),normalized=structuredClone(value.normalized);
  const saved={...frame(QUARTER),center:[1e8,-1e8,1e8,-1e8]}; // No second centering.
  const report=value.setDisplay({orientationFrame:saved,angles:[90,0,0,0,0,0],projection:'perspective'});
  assert.equal(report.orientationApplied,true);assert.equal(report.orientationDiagnostic,null);
  assert.ok(value.triangles.length>0);assert.ok(value.triangles.every(t=>!t.vertices));
  normalized.forEach((p,i)=>close(value.projected[i].point,manualProjection(p)));
  const buffer=value.surfaceGeometry.attributes.position.array;
  value.triangles.forEach((t,i)=>t.normalized.forEach((p,j)=>close([...buffer.slice(i*9+j*3,i*9+j*3+3)],manualProjection(p),1e-6)));
  // Independently intersect source segments 0->2 and 1->3 in the XY plane.
  const [a,b,c,d]=[0,2,1,3].map(i=>model.vertices[i]);
  const r=b.map((x,i)=>x-a[i]),s=d.map((x,i)=>x-c[i]),delta=c.map((x,i)=>x-a[i]);
  const cross=(u,v)=>u[0]*v[1]-u[1]*v[0],parameter=cross(delta,s)/cross(r,s);
  const crossing=a.map((x,i)=>x+parameter*r[i]);
  const matches=value.triangles.flatMap(t=>t.points).filter(p=>Math.hypot(...p.map((x,i)=>x-crossing[i]))<1e-8);
  assert.ok(matches.length>1,'a true crossing must appear in multiple triangles');
  const expected=manualProjection(crossing.map((x,i)=>(x-value.center[i])/value.radius));
  value.triangles.forEach((t,i)=>t.points.forEach((p,j)=>{
    if(Math.hypot(...p.map((x,k)=>x-crossing[k]))<1e-8)close([...buffer.slice(i*9+j*3,i*9+j*3+3)],expected,1e-6);
  }));
  value.setDisplay({orientationFrame:saved,angles:[90,0,0,0,0,0],projection:'perspective'});
  normalized.forEach((p,i)=>close(value.projected[i].point,manualProjection(p))); // No accumulation.
  assert.deepEqual(value.normalized,normalized);assert.equal(JSON.stringify(model),before);
});

test('actual viewer JSON-restored frame, rejection, and clear restore source projection',()=>{
  const model=star(),value=viewer(model),before=JSON.stringify(model);
  const saved=JSON.parse(JSON.stringify({orientationFrame:frame(QUARTER),angles:[],projection:'orthographic'}));
  value.setDisplay(saved);assert.equal(value.orientationApplied,true);
  const report=value.setDisplay({...saved,orientationFrame:{...saved.orientationFrame,sourceFingerprint:OTHER_HASH}});
  assert.equal(report.orientationApplied,false);assert.match(report.orientationDiagnostic,/fingerprint/);
  value.normalized.forEach((p,i)=>close(value.projected[i].point,p.slice(0,3)));
  value.setDisplay(saved);const cleared=value.setDisplay({angles:[],projection:'orthographic'});
  assert.equal(cleared.orientationApplied,false);assert.equal(cleared.orientationDiagnostic,null);
  value.normalized.forEach((p,i)=>close(value.projected[i].point,p.slice(0,3)));
  assert.equal(JSON.stringify(model),before);
});

test('ordinary face triangles reuse once-transformed source vertices',()=>{
  const model={...source,vertices:[[1,0,0,0],[0,1,0,0],[0,0,0,1]],edges:[[0,1],[1,2],[2,0]],faces:[[0,1,2]],cells:[]};
  const value=viewer(model),before=JSON.stringify(model);
  value.setDisplay({orientationFrame:frame(QUARTER),angles:[90,0,0,0,0,0],projection:'perspective'});
  assert.ok(value.triangles.every(t=>t.vertices));
  const buffer=value.surfaceGeometry.attributes.position.array;
  value.triangles.forEach((t,i)=>t.vertices.forEach((v,j)=>close([...buffer.slice(i*9+j*3,i*9+j*3+3)],manualProjection(value.normalized[v]),1e-6)));
  assert.equal(JSON.stringify(model),before);value.clear();assert.equal(value.orientationApplied,false);assert.equal(value.orientationDiagnostic,null);
});

test('3D net-like viewer stays unchanged and diagnoses a foreign orientation frame',()=>{
  const model={dimension:3,embeddingDimension:3,vertices:[[0,0,0],[1,0,0],[0,1,0]],edges:[[0,1],[1,2],[2,0]],faces:[[0,1,2]],cells:[],interpretation:'rigid-face-assembly'};
  const value=viewer(model),before=JSON.stringify(model),points=structuredClone(value.projected);
  const report=value.setDisplay({orientationFrame:frame(QUARTER)});
  assert.equal(report.orientationApplied,false);assert.match(report.orientationDiagnostic,/intrinsic 4D/);
  assert.deepEqual(value.projected,points);assert.equal(JSON.stringify(model),before);
});
