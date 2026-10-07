import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {stereoDisplayGeometry} from '../ui/viewer-stereographic.mjs';
import {primitiveInstances} from '../ui/entity-presentation.mjs';
import {fitView} from '../ui/view-camera.mjs';

const HASH='b'.repeat(64),FRAME=[[0,-1,0,0],[1,0,0,0],[0,0,1,0],[0,0,0,1]];
const cross=()=>({name:'Literal S3 arcs',dimension:4,embeddingDimension:4,interpretation:'generalized-complex',fingerprint:HASH,
  vertices:[[1,0,0,0],[-1,0,0,0],[0,1,0,0],[0,-1,0,0],[0,0,1,0],[0,0,-1,0],[0,0,0,1],[0,0,0,-1]],edges:[[0,2],[2,4],[4,0]],faces:[[0,2,4]],cells:[],metadata:{offColors:{faces:[{encoding:'byte',values:[200,100,50,128]}]}}});
const viewer=model=>{const value=Object.create(Viewer.prototype);value.group=new THREE.Group();value.setModel(model);return value;};
const close=(a,b,tol=1e-6)=>{assert.equal(a.length,b.length);a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<tol,`${a} != ${b}`));};

test('actual S3 source edge becomes a quarter circle with source IDs and curved cylinder endpoints',()=>{
  const model=cross(),before=JSON.stringify(model),value=viewer(model),orthographic=[...value.edgeGeometry.attributes.position.array];
  const diagnostic=value.setDisplay({projection:'stereographic',angles:Array(6).fill(0),faces:false,vertices:true,vertexStyle:'sphere',edgeStyle:'cylinder',edgeRadius:.02});
  assert.equal(value.projected.length,8);assert.equal(value.pointGeometry.attributes.position.count,8);assert.equal(value.vertexSpheres.count,7); // +W pole omitted, no virtual source spheres.
  const segments=Array.from(value.stereographicGeometry.edges).filter(edge=>edge.edge===0);assert.ok(segments.length>4);
  // The mounted renderer now borrows packed Float32 display coordinates.
  // Mathematical raw-helper checks below retain their Float64 tolerances.
  for(const segment of segments){for(const point of [segment.a,segment.b]){close(point.slice(2),[0]);assert.ok(Math.abs(point[0]**2+point[1]**2-1)<2e-7);}}
  const mid=segments.flatMap(s=>[s.a,s.b]).find(p=>Math.abs(p[0]-Math.SQRT1_2)<2e-7);assert.ok(mid);assert.ok(Math.hypot(mid[0]-.5,mid[1]-.5)>.29);
  assert.equal(value.edgeCylinders.count,value.stereographicGeometry.edges.length);assert.equal(diagnostic.primitiveCounts.cylinders,value.stereographicGeometry.edges.length);
  value.stereographicGeometry.edges.forEach((segment,i)=>{const matrix=new THREE.Matrix4();value.edgeCylinders.getMatrixAt(i,matrix);close(new THREE.Vector3(0,-.5,0).applyMatrix4(matrix).toArray(),segment.a);close(new THREE.Vector3(0,.5,0).applyMatrix4(matrix).toArray(),segment.b);assert.equal(value.edgeCylinders.userData.sourceEdgeIds[i],segment.edge);});
  value.setDisplay({projection:'orthographic'});assert.deepEqual([...value.edgeGeometry.attributes.position.array],orthographic);assert.equal(value.renderTriangles,null);assert.equal(JSON.stringify(model),before);
});

test('actual radial face patches form unit sphere, preserve source RGBA and resize normals on toggle',()=>{
  const model=cross(),before=JSON.stringify(model),value=viewer(model),initial=[...value.surfaceGeometry.attributes.position.array];
  const result=value.setDisplay({projection:'stereographic',surfaceOpacity:1,surfaceColors:'source'});
  assert.ok(result.filledTriangles>100);assert.equal(value.triangles.length,1);assert.equal(value.renderTriangles.length,result.filledTriangles);
  assert.ok(value.renderTriangles.every(t=>t.face===0&&t.sourceTriangle===0));
  value.renderTriangles.forEach(t=>t.points.forEach(p=>assert.ok(Math.abs(Math.hypot(...p)-1)<2e-7)));
  let p=value.surfaceGeometry.getAttribute('position'),n=value.surfaceGeometry.getAttribute('normal'),c=value.surfaceGeometry.getAttribute('color');
  assert.equal(n.count,p.count);assert.equal(c.count,p.count);assert.equal(c.itemSize,4);assert.ok([...n.array].every(Number.isFinite));assert.ok(Math.abs(c.array[3]-128/255)<1e-7);assert.equal(value.surface.material.depthWrite,false);
  const center=Array.from(value.renderTriangles).flatMap(t=>t.points).find(p=>p.every(x=>x>.4));assert.ok(center); // Curved interior, not only subdivided boundary.
  value.setDisplay({projection:'perspective'});assert.equal(value.surfaceGeometry.getAttribute('position').count,3);assert.equal(value.surfaceGeometry.getAttribute('normal').count,3);assert.equal(value.surfaceGeometry.getAttribute('color').count,3);
  value.setDisplay({projection:'orthographic'});assert.deepEqual([...value.surfaceGeometry.attributes.position.array],initial);assert.equal(JSON.stringify(model),before);
});

test('saved SO4 frame and plane spin apply once to source and virtual stereo points',()=>{
  const model=cross(),value=viewer(model),view={projection:'stereographic',angles:[90,0,0,0,0,0],orientationFrame:{matrix:FRAME,sourceFingerprint:HASH}};
  value.setDisplay(view);close(value.projected[0].point,[-1,0,0]);close(value.stereographicGeometry.edges[0].a,[-1,0,0]);
  assert.ok(Array.from(value.renderTriangles).flatMap(t=>t.points).every(p=>p[0]<=1e-12&&p[1]<=1e-12&&p[2]>=-1e-12));
  const before=JSON.stringify({model,view});value.setDisplay(view);assert.equal(JSON.stringify({model,view}),before);
  const normalized=model.vertices.map(p=>[...p]),visibility={edges:[true,false,false],faces:[true]},virtual=[{face:0,normalized:[[.5,.5,0,0],[.5,0,.5,0],[0,.5,.5,0]]}];
  const result=stereoDisplayGeometry(normalized,model.edges,virtual,visibility,FRAME,view.angles);
  const corner=[-Math.SQRT1_2,-Math.SQRT1_2,0];assert.ok(result.triangles.flatMap(t=>t.points).some(p=>Math.hypot(...p.map((x,i)=>x-corner[i]))<1e-12));
});

test('stereo poles/source center/caps explicitly omit undefined geometry without flat chords',()=>{
  const normalized=[[1,0,0,0],[0,0,0,1],[-1,0,0,0],[0,1,0,0]],edges=[[0,1],[0,2],[0,3]],visibility={edges:[true,true,true],faces:[true]};
  const source=[{face:0,normalized:[normalized[0],normalized[2],normalized[3]]}];
  const result=stereoDisplayGeometry(normalized,edges,source,visibility,null,[]);
  assert.ok(result.clippedSegments>0);assert.equal(result.triangles.length,0);assert.ok(result.diagnostics.some(d=>d.includes('source center')));assert.ok(result.diagnostics.some(d=>d.includes('pole')));
  assert.ok(result.edges.every(segment=>segment.edge!==1));assert.ok(result.edges.flatMap(s=>[s.a,s.b]).flat().every(Number.isFinite));
  const bounded=stereoDisplayGeometry(normalized,edges,source,visibility,null,[],{limits:{segments:1,triangles:1,inputTriangles:1,inputEdges:1}});
  assert.ok(bounded.edges.length<=1);assert.ok(bounded.diagnostics.some(d=>d.includes('bound')||d.includes('resource')));
});

test('curve cylinder cap falls back to curved source lines with repeated source mapping',()=>{
  const model=cross(),projected=model.vertices.map(p=>({point:p.slice(0,3),clipped:false})),visibility={vertices:Array(8).fill(true),edges:[true,true,true]};
  const edgeSegments=[{edge:0,a:[1,0,0],b:[Math.SQRT1_2,Math.SQRT1_2,0]},{edge:0,a:[Math.SQRT1_2,Math.SQRT1_2,0],b:[0,1,0]}];
  const full=primitiveInstances(model,projected,visibility,{cylinders:true,edgeSegments});assert.deepEqual(full.edges.map(e=>e.edge),[0,0]);assert.deepEqual(full.edges.map(e=>e.vertices),[[0,2],[0,2]]);
  const capped=primitiveInstances(model,projected,visibility,{cylinders:true,edgeSegments,limits:{spheres:10,cylinders:1}});assert.equal(capped.cylinderSupported,false);assert.equal(capped.edges.length,0);assert.ok(capped.diagnostics.length);
});

test('stereo camera fitting handles the full bounded sampled geometry cloud without argument-stack overflow',()=>{
  const cloud=Array.from({length:450000},(_,i)=>[Math.sin(i)*9,Math.cos(i)*7,i%5-2]);const fitted=fitView(cloud);assert.ok(Number.isFinite(fitted.radius));assert.ok(fitted.radius>8);
});
