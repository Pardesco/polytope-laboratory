import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {resolveExplosion,explosionGeometry} from '../ui/explosion.mjs';
import {projectDisplayPoint} from '../ui/display-frame.mjs';

const HASH='b'.repeat(64),close=(a,b,eps=1e-6)=>{assert.equal(a.length,b.length);a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<eps,`${a} != ${b}`));};
const cube=()=>({id:'cube',fingerprint:HASH,dimension:3,embeddingDimension:3,interpretation:'convex-polytope',vertices:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],edges:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],cells:[]});
function tesseract(){
  const vertices=Array.from({length:16},(_,v)=>Array.from({length:4},(_,a)=>v>>a&1?1:-1)),edges=[],faces=[],cells=[];
  for(let v=0;v<16;v++)for(let a=0;a<4;a++)if(!(v>>a&1))edges.push([v,v|1<<a]);
  for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)for(let v=0;v<16;v++)if(!(v>>a&1)&&!(v>>b&1))faces.push([v,v|1<<a,v|1<<a|1<<b,v|1<<b]);
  for(let a=0;a<4;a++)for(const sign of [-1,1])cells.push(faces.flatMap((f,id)=>f.every(v=>vertices[v][a]===sign)?[id]:[]));
  const model={id:'tesseract',fingerprint:HASH,dimension:4,embeddingDimension:4,interpretation:'convex-polytope',vertices,edges,faces,cells};
  const cache={algorithmVersion:'cell-facing-1',sourceFingerprint:HASH,normalization:{center:[0,0,0,0],radius:2},sourceCellIds:cells.map((_,i)=>i),cells:cells.map((f,cell)=>{const normal=Array(4).fill(0);normal[cell>>1]=cell%2?1:-1;return {cell,sourceVertexIds:[...new Set(f.flatMap(id=>faces[id]))].sort((a,b)=>a-b),normalizedPlane:{normal,offset:.5}};})};return {model,cache};
}
function viewer(model){const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.setModel(model);v.camera=new THREE.OrthographicCamera(-5,5,5,-5,.01,1000);v.camera.position.set(0,0,20);v.camera.lookAt(0,0,0);v.camera.updateMatrixWorld();v.renderer={domElement:{getBoundingClientRect:()=>({width:400,height:400})}};return v;}
const pose=(model,amount=1,options={})=>explosionGeometry(resolveExplosion(model,options),amount);
const buffers=v=>Object.fromEntries(['pointGeometry','edgeGeometry','surfaceGeometry','highlightGeometry'].map(k=>[k,Object.fromEntries(Object.entries(v[k].attributes).map(([name,a])=>[name,[a.itemSize,[...a.array]]]))]));

test('null and exact zero preserve original source pipeline buffers/materials/picking, and clearing restores it',()=>{
  const model=cube(),v=viewer(model),view={vertices:true,pickKind:'face',surfaceOpacity:1};v.select([6]);v.setDisplay(view);const original=buffers(v),modelBefore=JSON.stringify(model),normalTriangles=v.triangles;
  assert.deepEqual(v.setExplosion(null),{applied:false,supported:true,diagnostic:null});v.setDisplay(view);assert.deepEqual(buffers(v),original);
  assert.deepEqual(v.setExplosion(pose(model,0)),{applied:false,supported:true,diagnostic:null});let result=v.setDisplay(view);assert.equal(result.explosionApplied,false);assert.equal(v.triangles,normalTriangles);assert.deepEqual(buffers(v),original);assert.equal(v.surface.material.depthWrite,true);assert.equal(v.pickAt(200,200).picked.id,1);
  v.setExplosion(pose(model));v.setDisplay(view);assert.equal(v.pointGeometry.attributes.position.count,24);assert.equal(v.highlightGeometry.attributes.position.count,3);
  v.setExplosion(null);result=v.setDisplay(view);assert.equal(result.explosionCounts,null);assert.equal(v.renderTriangles,null);assert.equal(v.instanceProjected,null);assert.deepEqual(buffers(v),original);assert.equal(JSON.stringify(model),modelBefore);
});

test('actual 3D face instances keep original normalization and repeated source point/edge/highlight IDs',()=>{
  const model=cube(),input=pose(model),before=JSON.stringify({model,input}),v=viewer(model);assert.equal(v.setExplosion(input).applied,true);v.select([6]);
  const result=v.setDisplay({vertices:true,vertexStyle:'sphere',edgeStyle:'cylinder',surfaceOpacity:1,pickKind:'edge'});
  assert.equal(v.model,model);assert.equal(v.projected.length,8);assert.equal(v.instanceProjected.length,24);assert.equal(v.radius,Math.sqrt(3));assert.deepEqual(result.explosionCounts,{vertices:24,edges:24,faces:6,entities:6,triangles:12,amount:1,direction:'normal'});assert.equal(v.vertexSpheres.count,24);assert.equal(v.edgeCylinders.count,24);assert.equal(v.highlightGeometry.attributes.position.count,3);
  model.vertices.forEach((_,id)=>assert.equal(v.vertexSpheres.userData.sourceVertexIds.filter(v=>v===id).length,3));model.edges.forEach((_,id)=>assert.equal(v.edgeCylinders.userData.sourceEdgeIds.filter(e=>e===id).length,2));
  const upper=v.explosionDisplay.vertices.find(v=>v.sourceFace===1&&v.sourceVertex===6);close(v.instanceProjected[upper.instance].point,[1/Math.sqrt(3),1/Math.sqrt(3),1+1/Math.sqrt(3)]);close(v.projected[6].point,Array(3).fill(1/Math.sqrt(3)));
  const picks=[];for(let i=0;i<2;i++)picks.push(v.pickAt(200,200+40/Math.sqrt(3)).picked.id);assert.deepEqual(picks.sort((a,b)=>a-b),[0,4]);v.setDisplay({vertices:true,pickKind:'vertex'});assert.equal(v.pickAt(200+40*(1+1/Math.sqrt(3)),200-40/Math.sqrt(3)).picked.kind,'vertex');assert.equal(JSON.stringify({model,input}),before);
});

test('4D explosion duplicates each cell owner and preserves source face/cell alpha and normals',()=>{
  const {model,cache}=tesseract();model.metadata={offColors:{faces:model.faces.map((_,id)=>id===0?{encoding:'byte',values:[255,64,0,128]}:null),cells:model.cells.map((_,id)=>({encoding:'unit',values:[.2,.4,.6,id===0?.25:1]}))}};
  const input=pose(model,1,{direction:'normal',planeCache:cache}),v=viewer(model),before=JSON.stringify({model,cache,input});v.setExplosion(input);const result=v.setDisplay({projection:'orthographic',vertices:true,vertexStyle:'sphere',edgeStyle:'cylinder',surfaceOpacity:1});
  assert.deepEqual(result.explosionCounts,{vertices:64,edges:96,faces:48,entities:8,triangles:96,amount:1,direction:'normal'});assert.equal(v.projected.length,16);assert.equal(v.vertexSpheres.count,64);assert.equal(v.edgeCylinders.count,72);assert.equal(result.primitiveCounts.collapsedEdges,24);assert.equal(v.surfaceGeometry.attributes.position.count,288);assert.ok([...v.surfaceGeometry.attributes.normal.array].every(Number.isFinite));
  const colors=v.surfaceGeometry.attributes.color.array;v.renderTriangles.forEach((t,id)=>{const expected=t.face===0?128/255:t.cell===0?.25:1;assert.ok(Math.abs(colors[id*12+3]-expected)<1e-7);});assert.equal(v.surface.material.transparent,true);assert.equal(v.surface.material.depthWrite,false);
  v.setDisplay({surfaceOpacity:1,surfaceColors:'face'});assert.equal(v.surface.material.transparent,false);assert.equal(v.surface.material.depthWrite,true);assert.equal(JSON.stringify({model,cache,input}),before);
});

test('translated supporting-plane offsets change finite-eye facing without modifying verified source cache',()=>{
  const {model,cache}=tesseract(),v=viewer(model),view={projection:'perspective',perspectiveDistance4D:.6,cellFacing:'hide-front',cellFacingCache:cache},before=JSON.stringify({model,cache});v.setDisplay(view);const planes=v.facingPlanes;assert.deepEqual(v.facingCounts,{front:1,back:7,grazing:0,total:8});
  v.setExplosion(pose(model,1,{direction:'normal',planeCache:cache}));let result=v.setDisplay(view);assert.equal(v.facingPlanes,planes);assert.ok(v.facingPlanes.planes.every(p=>p.offset===.5));assert.deepEqual(result.facingCounts,{front:0,back:8,grazing:0,total:8});assert.equal(result.explosionCounts.entities,8);
  result=v.setDisplay({...view,perspectiveDistance4D:1.5});assert.deepEqual(result.facingCounts,{front:0,back:7,grazing:1,total:8});
  result=v.setDisplay({...view,projection:'orthographic'});assert.deepEqual(result.facingCounts,{front:1,back:1,grazing:6,total:8});assert.equal(result.explosionCounts.entities,7);
  v.setExplosion(null);result=v.setDisplay(view);assert.equal(v.facingPlanes,planes);assert.deepEqual(result.facingCounts,{front:1,back:7,grazing:0,total:8});assert.equal(JSON.stringify({model,cache}),before);
});

test('cell shrink is about translated cell centers; manual masks constrain unique owner picking/highlights',()=>{
  const {model}=tesseract(),v=viewer(model),input=pose(model,1,{direction:'radial'});v.setExplosion(input);v.select([0]);const result=v.setDisplay({projection:'orthographic',isolatedCell:7,cellShrink:.6,vertices:true,vertexStyle:'sphere',edgeStyle:'cylinder',pickKind:'cell'});
  assert.equal(result.explosionCounts.entities,1);assert.equal(result.explosionCounts.vertices,8);assert.equal(result.explosionCounts.edges,12);assert.equal(result.explosionCounts.faces,6);assert.equal(v.renderTriangles.length,12);assert.equal(v.vertexSpheres.count,8);assert.equal(v.edgeCylinders.count,12);assert.ok(v.renderTriangles.every(t=>t.cell===7));assert.equal(v.pickAt(200,200).picked.id,7);
  const center=[0,0,0,1];v.explosionTriangles.forEach(t=>t.normalized.forEach((p,i)=>close(p,t.points[i].map((x,k)=>center[k]+.6*((x-v.center[k])/v.radius-center[k])))));
  const highlights=[...v.highlightGeometry.attributes.position.array];assert.ok(highlights.every(x=>x>1e29),'source vertex0 has no instance in isolated positiveW cell');
  const again=v.setDisplay({projection:'orthographic',isolatedCell:7,cellShrink:.6,vertices:true});assert.equal(again.explosionCounts.vertices,8);assert.ok(v.instanceVisibility.vertices.filter(Boolean).length===8,'cached display preserves instance masks');
});

test('perspective and spherical adapters transform duplicated translated instances once and retain source IDs',()=>{
  const {model}=tesseract(),v=viewer(model),input=pose(model,.8,{direction:'radial'}),matrix=[[0,0,0,-1],[0,1,0,0],[0,0,1,0],[1,0,0,0]],angles=[17,0,0,0,0,0],before=JSON.stringify({model,input});v.setExplosion(input);
  let result=v.setDisplay({projection:'perspective',perspectiveDistance4D:.6,perspectiveNear4D:.08,orientationFrame:{sourceFingerprint:HASH,matrix},angles,vertices:true,edgeStyle:'cylinder'});assert.ok(result.perspectiveCounts.clippedEdges>0);assert.ok(result.perspectiveCounts.triangles>0);assert.ok(v.lines.userData.sourceEdgeIds.every(id=>id>=0&&id<32));
  v.instanceProjected.forEach((p,id)=>{const expected=projectDisplayPoint(v.explosionDisplay.normalized[id],matrix,angles,'perspective',{distance:.6,near:.08});assert.equal(p.clipped,expected.clipped);if(!p.clipped)close(p.point,expected.point);});v.renderTriangles.forEach(t=>assert.ok(model.cells[t.cell].includes(t.face)));
  result=v.setDisplay({projection:'stereographic',orientationFrame:{sourceFingerprint:HASH,matrix},angles,edgeStyle:'cylinder'});assert.ok(result.stereographicCounts.segments>0);assert.ok(v.renderTriangles.length>0);assert.equal(v.surface.material.flatShading,false);assert.ok([...v.surfaceGeometry.attributes.normal.array].every(Number.isFinite));assert.ok(v.edgeCylinders.userData.sourceEdgeIds.every(id=>id>=0&&id<32));assert.equal(JSON.stringify({model,input}),before);
});

test('invalid, generalized, stale and capped explosion payloads report unsupported without changing source view',()=>{
  const model=cube(),v=viewer(model),view={vertices:true,edgeStyle:'line'},before=JSON.stringify(model);v.setDisplay(view);const original=buffers(v),valid=pose(model);
  for(const change of [p=>p.sourceFingerprint='c'.repeat(64),p=>p.normalization.radius=1,p=>p.entities[0].points[0][0]+=1,p=>p.entities.length=1,p=>p.entities=Array(10001).fill(p.entities[0])]){const bad=structuredClone(valid);change(bad);const state=v.setExplosion(bad);assert.equal(state.supported,false);assert.equal(state.applied,false);assert.ok(state.diagnostic);const result=v.setDisplay(view);assert.equal(result.explosionApplied,false);assert.ok(result.explosionDiagnostic);assert.deepEqual(buffers(v),original);}
  const unsupported={...cube(),interpretation:'generalized-complex'},u=viewer(unsupported);const result=u.setExplosion(valid);assert.equal(result.supported,false);assert.match(result.diagnostic,/generalized or compound/);u.setDisplay(view);assert.equal(u.explosionDisplay,null);assert.equal(JSON.stringify(model),before);assert.deepEqual(view,{vertices:true,edgeStyle:'line'});
});

test('Fit encloses translated instance cloud and preserves original mathematical normalization',()=>{
  const model=cube(),v=viewer(model);v.cameraProjection='orthographic';v.orthographicCamera=v.camera;v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);v.controls={target:new THREE.Vector3()};v.aspect=1;v.bindControls=()=>{v.camera.lookAt(v.controls.target);v.camera.updateMatrixWorld();};
  v.setExplosion(pose(model,3));v.setDisplay({vertices:true});const sourceRadius=v.radius,sourcePoints=structuredClone(v.projected);v.fit();assert.ok(v.orthographicHalfHeight>4);assert.equal(v.radius,sourceRadius);assert.deepEqual(v.projected,sourcePoints);
  v.observationCloud().forEach(p=>{const q=new THREE.Vector3(...p).project(v.camera);assert.ok([q.x,q.y,q.z].every(x=>Math.abs(x)<1),'actual translated instance must fit observer frustum');});
});
