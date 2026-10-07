import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {project} from '../ui/projection.js';
import {projectDisplayPoint} from '../ui/display-frame.mjs';
import {perspectiveDisplayGeometry} from '../ui/viewer-perspective.mjs';

const HASH='d'.repeat(64),XW=[[0,0,0,-1],[0,1,0,0],[0,0,1,0],[1,0,0,0]];
const cross=()=>({dimension:4,embeddingDimension:4,interpretation:'generalized-complex',fingerprint:HASH,vertices:[[1,0,0,0],[-1,0,0,0],[0,1,0,0],[0,-1,0,0],[0,0,1,0],[0,0,-1,0],[0,0,0,1],[0,0,0,-1]],edges:[[0,2],[2,4],[4,0],[0,6]],faces:[[0,2,4]],cells:[]});
function viewer(model){
  const value=Object.create(Viewer.prototype);value.group=new THREE.Group();value.setModel(model);value.camera=new THREE.OrthographicCamera(-5,5,5,-5,.01,1000);value.camera.position.set(0,0,20);value.camera.lookAt(0,0,0);value.camera.updateMatrixWorld();value.renderer={domElement:{getBoundingClientRect:()=>({width:400,height:400})}};return value;
}
const close=(a,b,tolerance=1e-6)=>{assert.equal(a.length,b.length);a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<tolerance,`${a} != ${b}`));};
function tesseract(){
  const vertices=Array.from({length:16},(_,id)=>Array.from({length:4},(_,axis)=>(id>>axis&1)?1:-1)),edges=[],faces=[],cells=[];
  for(let a=0;a<16;a++)for(let b=a+1;b<16;b++)if(vertices[a].filter((x,i)=>x!==vertices[b][i]).length===1)edges.push([a,b]);
  for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){const variable=[0,1,2,3].filter(axis=>axis!==a&&axis!==b);for(const x of [-1,1])for(const y of [-1,1])faces.push([[-1,-1],[1,-1],[1,1],[-1,1]].map(corner=>vertices.findIndex(p=>p[a]===x&&p[b]===y&&variable.every((axis,k)=>p[axis]===corner[k]))));}
  for(let axis=0;axis<4;axis++)for(const side of [-1,1])cells.push(faces.flatMap((face,id)=>face.every(v=>vertices[v][axis]===side)?[id]:[]));
  const model={dimension:4,embeddingDimension:4,interpretation:'convex-polytope',fingerprint:HASH,vertices,edges,faces,cells};
  const cache={algorithmVersion:'cell-facing-1',sourceFingerprint:HASH,normalization:{center:[0,0,0,0],radius:2},sourceCellIds:cells.map((_,i)=>i),cells:cells.map((cell,id)=>{const normal=Array(4).fill(0);normal[Math.floor(id/2)]=id%2?1:-1;return {cell:id,sourceVertexIds:[...new Set(cell.flatMap(f=>faces[f]))].sort((a,b)=>a-b),normalizedPlane:{normal,offset:.5}};})};
  return {model,cache};
}

test('optional project options and framed projection preserve legacy arity/default object results',()=>{
  assert.deepEqual(project([1,2,3,.5],'perspective'),{point:[1.2,2.4,3.5999999999999996],clipped:false});
  close(project([.5,0,0,.5],'perspective',{distance:.6,near:.08}).point,[3,0,0]);
  close(projectDisplayPoint([0,.5,0,0],XW,[90,0,0,0,0,0],'perspective',{distance:.6}).point,[-.5,0,0]);
  assert.deepEqual(project([1,2,3],'perspective',{distance:0}),{point:[1,2,3],clipped:false});assert.deepEqual(project([1,2,3,.5],'orthographic',{distance:0}),{point:[1,2,3],clipped:false});
});

test('actual perspective near-clipped edge retains its source reference and cylinder endpoints',()=>{
  const model=cross(),before=JSON.stringify(model),value=viewer(model),view={projection:'perspective',perspectiveDistance4D:.6,perspectiveNear4D:.08,vertices:true,vertexStyle:'sphere',edgeStyle:'cylinder',pickKind:'edge',faces:false},viewBefore=JSON.stringify(view);
  const diagnostic=value.setDisplay(view),segment=value.perspectiveGeometry.edges.find(e=>e.edge===3);close(segment.a,[1,0,0]);close(segment.b,[3.6,0,0]);assert.equal(segment.t0,0);assert.equal(segment.t1,.52);assert.equal(diagnostic.perspectiveCounts.clippedEdges,1);assert.equal(diagnostic.perspectiveCounts.omittedEdges,0);assert.match(diagnostic.perspectiveDiagnostic,/near plane/);
  assert.equal(value.projected[6].clipped,true);assert.equal(value.projected.length,8);assert.equal(value.pointGeometry.attributes.position.count,8);assert.equal(value.vertexSpheres.count,7);assert.equal(value.edgeCylinders.count,4);
  const index=value.edgeCylinders.userData.sourceEdgeIds.indexOf(3),matrix=new THREE.Matrix4();value.edgeCylinders.getMatrixAt(index,matrix);close(new THREE.Vector3(0,-.5,0).applyMatrix4(matrix).toArray(),segment.a);close(new THREE.Vector3(0,.5,0).applyMatrix4(matrix).toArray(),segment.b);
  assert.equal(value.pickAt(292,200).picked.id,3);assert.equal(value.pickAt(292,200).picked.kind,'edge');value.select([6]);value.setDisplay(view);assert.ok(value.highlightGeometry.attributes.position.array[0]>100);
  assert.equal(JSON.stringify(model),before);assert.equal(JSON.stringify(view),viewBefore);
});

test('actual clipped triangle keeps its finite quad surface, barycentric source references and RGBA',()=>{
  const model=cross();model.faces=[[0,2,6]];model.edges=[[0,2],[2,6],[6,0]];model.metadata={offColors:{faces:[{encoding:'byte',values:[255,80,40,128]}]}};
  const before=JSON.stringify(model),value=viewer(model),result=value.setDisplay({projection:'perspective',perspectiveDistance4D:.6,perspectiveNear4D:.08,pickKind:'face',surfaceOpacity:1,surfaceColors:'source'});
  assert.equal(value.triangles.length,1);assert.equal(value.renderTriangles.length,2);assert.equal(result.filledTriangles,2);assert.equal(result.perspectiveCounts.clippedTriangles,1);assert.equal(result.perspectiveCounts.omittedTriangles,0);
  const position=value.surfaceGeometry.getAttribute('position'),normal=value.surfaceGeometry.getAttribute('normal'),color=value.surfaceGeometry.getAttribute('color');assert.equal(position.count,6);assert.equal(normal.count,6);assert.equal(color.count,6);assert.equal(color.itemSize,4);assert.ok(Math.abs(color.array[3]-128/255)<1e-7);assert.equal(value.surface.material.depthWrite,false);assert.equal(value.surface.material.flatShading,true);
  value.renderTriangles.forEach(t=>{assert.equal(t.face,0);assert.equal(t.sourceTriangle,0);t.points4.forEach((p,j)=>{const bary=t.barycentrics[j],source=value.triangles[0].vertices.map(id=>value.normalized[id]);close(p,[0,1,2,3].map(axis=>bary.reduce((sum,x,k)=>sum+x*source[k][axis],0)));});});
  assert.equal(value.pickAt(240,160).picked.id,0);assert.equal(value.pickAt(200,200).picked,null);assert.ok([...normal.array].every(Number.isFinite));assert.equal(JSON.stringify(model),before);
});

test('actual saved frame plus angle spin applies once to clipped source and virtual triangles',()=>{
  const model=cross(),value=viewer(model),view={projection:'perspective',perspectiveDistance4D:.6,perspectiveNear4D:.08,orientationFrame:{matrix:XW,sourceFingerprint:HASH},angles:[90,0,0,0,0,0]},before=JSON.stringify({model,view});
  value.setDisplay(view);assert.equal(value.projected[0].clipped,true);close(value.projected[2].point,[-1,0,0]);close(value.projected[6].point,[0,-1,0]);
  const edge=value.perspectiveGeometry.edges.find(e=>e.edge===0);close(edge.a,[-3.6,0,0]);close(edge.b,[-1,0,0]);close([edge.t0],[.48]);
  const virtual=[{face:0,cell:7,normalized:[[.5,.5,0,0],[.5,0,.5,0],[0,.5,.5,0]]}],visibility={edges:[true,false,false,false],faces:[true]};
  const result=perspectiveDisplayGeometry(value.normalized,model.edges,virtual,visibility,XW,view.angles,{distance:.6,near:.08});assert.equal(result.triangles[0].cell,7);close(result.triangles[0].points[0],[-3,0,0]);
  assert.equal(JSON.stringify({model,view}),before);
});

test('source-plane cell facing uses the actual perspective eye and shares manual masks with clipping',()=>{
  const {model,cache}=tesseract(),value=viewer(model),before=JSON.stringify({model,cache});
  let result=value.setDisplay({projection:'perspective',perspectiveDistance4D:.6,cellFacing:'hide-front',cellFacingCache:cache});assert.deepEqual(result.facingCounts,{front:1,back:7,grazing:0,total:8});assert.equal(value.visibility.activeCells.length,7);
  result=value.setDisplay({projection:'perspective',perspectiveDistance4D:.4,cellFacing:'hide-front',cellFacingCache:cache,vertices:true,vertexStyle:'sphere',edgeStyle:'cylinder'});assert.deepEqual(result.facingCounts,{front:0,back:8,grazing:0,total:8});assert.equal(value.visibility.activeCells.length,8);assert.equal(value.vertexSpheres.count,8);assert.equal(value.edgeCylinders.count,20);assert.equal(result.perspectiveCounts.omittedEdges,12);
  result=value.setDisplay({projection:'perspective',perspectiveDistance4D:.5,cellFacing:'hide-front',cellFacingCache:cache});assert.deepEqual(result.facingCounts,{front:0,back:7,grazing:1,total:8});
  result=value.setDisplay({projection:'perspective',perspectiveDistance4D:.51,cellFacing:'front',cellFacingCache:cache});assert.deepEqual(value.visibility.activeCells,[7]);assert.equal(result.filledTriangles,0);assert.match(result.perspectiveDiagnostic,/near plane/);
  result=value.setDisplay({projection:'perspective',perspectiveDistance4D:.6,cellFacing:'hide-front',cellFacingCache:cache,hiddenCells:[0],isolatedCell:1,cellShrink:.6});assert.deepEqual(value.visibility.activeCells,[1]);assert.equal(value.cellInstances,1);assert.ok(value.renderTriangles.every(t=>t.cell===1));assert.equal(JSON.stringify({model,cache}),before);
});

test('perspective frame/distance/near caches reuse fill and unchanged geometry, then restore ordinary/stereo buffers',()=>{
  const value=viewer(cross()),source=value.sourceTriangles,view={projection:'perspective',perspectiveDistance4D:.6,perspectiveNear4D:.08};value.setDisplay(view);const geometry=value.perspectiveGeometry,triangles=value.triangles;
  value.setDisplay({...view,surfaceColors:'face'});assert.equal(value.perspectiveGeometry,geometry);assert.equal(value.triangles,triangles);assert.equal(value.sourceTriangles,source);
  value.setDisplay({...view,perspectiveNear4D:.2});assert.notEqual(value.perspectiveGeometry,geometry);assert.equal(value.sourceTriangles,source);
  value.setDisplay({projection:'stereographic'});assert.equal(value.perspectiveGeometry,null);assert.ok(value.stereographicGeometry);assert.equal(value.surface.material.flatShading,false);
  value.setDisplay({projection:'orthographic'});assert.equal(value.perspectiveGeometry,null);assert.equal(value.stereographicGeometry,null);assert.equal(value.renderTriangles,null);assert.equal(value.edgeGeometry.attributes.position.count,8);assert.equal(value.surfaceGeometry.attributes.position.count,3);assert.equal(value.surfaceGeometry.attributes.normal.count,3);
  const invalid=value.setDisplay({projection:'perspective',perspectiveDistance4D:0});assert.match(invalid.perspectiveDiagnostic,/Invalid 4D perspective settings/);assert.equal(invalid.perspectiveCounts.distance,3);
});

test('perspective adapter cap omits whole source patches and leaves source masks/coordinates unchanged',()=>{
  const normalized=cross().vertices,edges=[[0,6],[0,2]],source=[{face:0,vertices:[0,2,6]}],visibility={edges:[true,true],faces:[true]},before=JSON.stringify({normalized,edges,source,visibility});
  const result=perspectiveDisplayGeometry(normalized,edges,source,visibility,null,[],{distance:.6,near:.08},{segments:1,triangles:1,inputEdges:1,inputTriangles:1});assert.equal(result.edges.length,1);assert.equal(result.triangles.length,0);assert.ok(result.diagnostics.some(d=>d.includes('complete source patch')));assert.ok(result.diagnostics.some(d=>d.includes('edge geometry resource')));assert.equal(JSON.stringify({normalized,edges,source,visibility}),before);
});

test('camera fit includes retained near-clipped endpoints beyond every visible source vertex',()=>{
  const value=viewer(cross());value.setDisplay({projection:'perspective',perspectiveDistance4D:.6,faces:false});value.cameraProjection='orthographic';value.orthographicCamera=value.camera;value.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);value.controls={target:new THREE.Vector3()};value.aspect=1;value.bindControls=()=>{value.camera.lookAt(value.controls.target);value.camera.updateMatrixWorld();};
  value.fit();assert.ok(value.orthographicHalfHeight>=2.76-1e-6);const endpoint=new THREE.Vector3(...value.perspectiveGeometry.edges.find(e=>e.edge===3).b).project(value.camera);assert.ok(Math.abs(endpoint.x)<1&&Math.abs(endpoint.y)<1);
});

test('extreme finite close-eye fit/restore includes clipped pieces and excludes hidden point sentinels',()=>{
  const value=viewer(cross());value.cameraProjection='orthographic';value.orthographicCamera=value.camera;value.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);value.controls={target:new THREE.Vector3()};value.aspect=1;value.bindControls=()=>{value.camera.lookAt(value.controls.target);value.camera.updateMatrixWorld();};
  value.select([6]);value.setDisplay({projection:'perspective',perspectiveDistance4D:.6,perspectiveNear4D:.000001,vertices:true});
  assert.ok(value.perspectiveGeometry.edges.find(e=>e.edge===3).b[0]>200000);assert.ok(value.pointGeometry.attributes.position.array[6*3]>1e29);assert.ok(value.highlightGeometry.attributes.position.array[0]>1e29);assert.ok([...value.pointGeometry.attributes.position.array].every(Number.isFinite));
  assert.ok(value.observationCloud().every(p=>p.every(x=>Math.abs(x)<=1000000)));
  value.fit();assert.ok(value.camera.far>100000);assert.equal(value.camera.near,.01);
  const inside=()=>value.observationCloud().forEach(p=>{const q=new THREE.Vector3(...p).project(value.camera);assert.ok([q.x,q.y,q.z].every(x=>Number.isFinite(x)&&Math.abs(x)<=1+1e-8),`${q.toArray()} outside observer frustum`);});inside();
  const saved=value.cameraState();value.camera.far=1000;value.restoreCamera(saved);assert.ok(value.camera.far>100000);assert.equal(value.camera.near,.01);inside();
  const bound=value.observerBounds,center=new THREE.Vector3(...bound.center),distance=value.camera.position.distanceTo(center);
  value.camera.position.copy(center).add(new THREE.Vector3(0,0,-distance));value.camera.lookAt(center);value.camera.updateMatrixWorld();
  value.controls.update=()=>{};value.scene=new THREE.Scene();value.renderer.render=()=>{};value.camera.far=1000;
  value.observationCloud=()=>{throw new Error('Orbit/draw must use cached constant-work bounds');};value.draw();
  assert.equal(value.observerBounds,bound);assert.ok(value.camera.far>distance+bound.radius);assert.equal(value.camera.near,.01);
  const cloud=[...value.perspectiveGeometry.edges.flatMap(edge=>[edge.a,edge.b]),...value.projected.filter(p=>!p.clipped).map(p=>p.point)];
  cloud.forEach(p=>{const q=new THREE.Vector3(...p).project(value.camera);assert.ok(q.z>=-1&&q.z<=1,'opposite observer orbit retains each point inside far plane');});
});
