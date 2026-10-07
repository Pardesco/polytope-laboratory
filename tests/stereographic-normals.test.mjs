import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {sphericalSpanNormal,stereographicPatchNormals} from '../ui/stereographic-normals.mjs';
import {Viewer} from '../ui/viewer.js';

const close=(a,b,tolerance=1e-10)=>{assert.equal(a.length,b.length);a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<tolerance,`${a} != ${b}`));};
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const raw=[[1,0,0,0],[0,1,0,0],[0,0,1,0]],source=()=>({dimension:4,embeddingDimension:4,interpretation:'generalized-complex',vertices:[...raw,[-1,0,0,0],[0,-1,0,0],[0,0,-1,0],[0,0,0,1],[0,0,0,-1]],edges:[[0,1],[1,2],[2,0]],faces:[[0,1,2]],cells:[],metadata:{offColors:{faces:[{encoding:'byte',values:[50,150,250,128]}]}}});

test('unit spherical patch analytic normals are its radial position at every vertex',()=>{
  const normal=sphericalSpanNormal(raw),patch=[[1,0,0],[Math.SQRT1_2,Math.SQRT1_2,0],[Math.sqrt(.5),.5,.5]],normals=stereographicPatchNormals(patch,normal);
  normals.forEach((n,i)=>close(n,patch[i]));assert.ok(Math.hypot(...normals[1].map((x,i)=>x-normals[0][i]))>.5);
  // Child presentation order cannot reverse an unchanged source support.
  const reversed=stereographicPatchNormals([...patch].reverse(),normal);reversed.forEach((n,i)=>close(n,patch[patch.length-1-i]));
  // Reversing the ordered raw source rows really reverses the differential.
  const sourceReversed=sphericalSpanNormal([raw[0],raw[2],raw[1]]),flipped=stereographicPatchNormals(patch,sourceReversed);flipped.forEach((n,i)=>close(n,patch[i].map(x=>-x)));
});

test('R4 span cofactor is scale-independent, orthogonal and rejects degenerate rows',()=>{
  const points=[[2,0,0,1],[0,3,0,-1],[0,0,4,2]],normal=sphericalSpanNormal(points),scaled=points.map((p,i)=>p.map(x=>x*[.001,1000,17][i]));
  assert.ok(Math.abs(Math.hypot(...normal)-1)<1e-12);points.forEach(p=>assert.ok(Math.abs(dot(p,normal))<1e-12));close(sphericalSpanNormal(scaled),normal);
  assert.equal(sphericalSpanNormal([[0,0,0,0],raw[1],raw[2]]),null);assert.equal(sphericalSpanNormal([raw[0],raw[0],raw[2]]),null);assert.equal(sphericalSpanNormal([[NaN,0,0,0],raw[1],raw[2]]),null);
});

test('rotated S2 stereographic normals match independently derived translated sphere gradients',()=>{
  const angle=Math.PI/6,s=Math.sin(angle),c=Math.cos(angle),points=raw.map(p=>[c*p[0]-s*p[3],p[1],p[2],s*p[0]+c*p[3]]),span=sphericalSpanNormal(points);
  const projected=points.map(p=>p.slice(0,3).map(x=>x/(1-p[3]))),normals=stereographicPatchNormals(projected,span),center=[Math.tan(angle),0,0];
  projected.forEach((p,i)=>{const delta=p.map((x,k)=>x-center[k]),length=Math.hypot(...delta),expected=delta.map(x=>x/length);close(normals[i],expected);assert.ok(Math.abs(length-1/c)<1e-12);});
});

test('S2 through the pole maps to a plane with constant normals',()=>{
  const span=sphericalSpanNormal([[1,0,0,0],[0,1,0,0],[0,0,0,-1]]),points=[[1,0,0],[0,1,0],[0,0,0]],normals=stereographicPatchNormals(points,span);
  normals.forEach(n=>close(n,[0,0,1]));
});

test('actual viewer smooth stereo normals retain source RGBA and ordinary flat shading on toggle',()=>{
  const model=source(),before=JSON.stringify(model),value=Object.create(Viewer.prototype);value.group=new THREE.Group();value.setModel(model);
  assert.equal(value.surface.material.flatShading,true);value.setDisplay({projection:'stereographic',surfaceOpacity:1,surfaceColors:'source'});assert.equal(value.surface.material.flatShading,false);
  let position=value.surfaceGeometry.getAttribute('position'),normal=value.surfaceGeometry.getAttribute('normal'),color=value.surfaceGeometry.getAttribute('color');assert.equal(normal.count,position.count);assert.equal(color.count,position.count);
  for(let i=0;i<position.count;i++){const p=[0,1,2].map(k=>position.array[i*3+k]),n=[0,1,2].map(k=>normal.array[i*3+k]);close(n,p,1e-6);assert.ok(Math.abs(Math.hypot(...n)-1)<1e-6);assert.ok(Math.abs(color.array[i*4+3]-128/255)<1e-7);}
  value.setDisplay({projection:'orthographic',surfaceOpacity:1});assert.equal(value.surface.material.flatShading,true);assert.equal(value.surfaceGeometry.getAttribute('normal').count,3);assert.equal(value.surfaceGeometry.getAttribute('color').count,3);assert.equal(value.surface.material.depthWrite,false);
  value.setDisplay({projection:'perspective'});assert.equal(value.surface.material.flatShading,true);assert.equal(JSON.stringify(model),before);
});
