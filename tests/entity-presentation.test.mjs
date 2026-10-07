import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {buildFaceSurfaces} from '../ui/face-fill.mjs';
import {projectDisplayPoint} from '../ui/display-frame.mjs';
import {cellVisibility} from '../ui/cell-visibility.mjs';
import {cellFaceInstances,presentationOptions,primitiveInstances} from '../ui/entity-presentation.mjs';

const HASH='e'.repeat(64),XW=[[0,0,0,-1],[0,1,0,0],[0,0,1,0],[1,0,0,0]];
function fixture(){
  const vertices=Array.from({length:16},(_,id)=>Array.from({length:4},(_,axis)=>(id>>axis&1)?1:-1));
  const edges=[];for(let i=0;i<16;i++)for(let j=i+1;j<16;j++)if(vertices[i].filter((x,k)=>x!==vertices[j][k]).length===1)edges.push([i,j]);
  const faces=[];
  for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){
    const variable=[0,1,2,3].filter(i=>i!==a&&i!==b);
    for(const x of [-1,1])for(const y of [-1,1])faces.push([[-1,-1],[1,-1],[1,1],[-1,1]].map(corner=>{
      const p=Array(4).fill(0);p[a]=x;p[b]=y;variable.forEach((axis,k)=>p[axis]=corner[k]);
      return vertices.findIndex(v=>v.every((value,k)=>value===p[k]));
    }));
  }
  const cells=[];for(let axis=0;axis<4;axis++)for(const side of [-1,1])cells.push(faces.flatMap((f,i)=>f.every(v=>vertices[v][axis]===side)?[i]:[]));
  const model={dimension:4,embeddingDimension:4,interpretation:'convex-polytope',vertices,edges,faces,cells,fingerprint:HASH};
  const cache={algorithmVersion:'cell-facing-1',sourceFingerprint:HASH,normalization:{center:[0,0,0,0],radius:2},sourceCellIds:cells.map((_,i)=>i),cells:cells.map((cell,i)=>{
    const normal=Array(4).fill(0);normal[Math.floor(i/2)]=i%2?1:-1;
    return {cell:i,sourceVertexIds:[...new Set(cell.flatMap(f=>faces[f]))].sort((a,b)=>a-b),normalizedPlane:{normal,offset:.5}};
  })};return {model,cache};
}
const viewer=model=>{const value=Object.create(Viewer.prototype);value.group=new THREE.Group();value.setModel(model);return value;};
function close(a,b,tolerance=1e-12){assert.equal(a.length,b.length);a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<tolerance,`${a} differs from ${b}`));}
function projected(points){return points.map(point=>({point,clipped:false}));}

test('literal tesseract shrink instantiates both cell owners with intrinsic center interpolation',()=>{
  const {model}=fixture(),source=buildFaceSurfaces(model).triangles,before=JSON.stringify({model,source});
  const result=cellFaceInstances(model,source,model.cells.map((_,i)=>i),.5);
  assert.equal(source.length,48);assert.equal(result.triangles.length,96);assert.equal(result.cellInstances,8);assert.equal(result.effectiveShrink,.5);
  for(const triangle of result.triangles){
    const axis=Math.floor(triangle.cell/2),side=triangle.cell%2?1:-1;
    assert.ok(model.cells[triangle.cell].includes(triangle.face));assert.equal(triangle.vertices,undefined);
    assert.ok(triangle.sourceVertices.length===3);
    triangle.points.forEach((point,i)=>point.forEach((x,k)=>assert.equal(x,k===axis?side:model.vertices[triangle.sourceVertices[i]][k]*.5)));
  }
  const face=0,shared=result.triangles.filter(t=>t.face===face);assert.equal(shared.length,4);
  assert.equal(new Set(shared.map(t=>t.cell)).size,2);assert.notDeepEqual(shared[0].points,shared[1].points);
  assert.equal(JSON.stringify({model,source}),before);
});

test('unit shrink preserves ordinary source triangles and source picking indices',()=>{
  const {model}=fixture(),source=buildFaceSurfaces(model).triangles,result=cellFaceInstances(model,source,[7],1);
  assert.equal(result.triangles,source);assert.equal(result.effectiveShrink,1);assert.equal(result.cellInstances,0);
  assert.ok(result.triangles.every(t=>t.vertices.length===3));
});

test('shrink resource/domain failures report full-size fallback and never partial cell instances',()=>{
  const {model}=fixture(),source=buildFaceSurfaces(model).triangles;
  for(const shrink of [0,-1,NaN,Infinity,1.1]){const result=cellFaceInstances(model,source,[0],shrink);assert.equal(result.triangles,source);assert.equal(result.effectiveShrink,1);assert.ok(result.diagnostics.length);}
  assert.match(cellFaceInstances({...model,dimension:3},source,[0],.5).diagnostics[0],/intrinsic 4D/);
  assert.match(cellFaceInstances(model,source,[99],.5).diagnostics[0],/Invalid active/);
  assert.match(cellFaceInstances(model,source,[0,1],.5,{limits:{cellTriangles:1,cellVertexVisits:1000}}).diagnostics[0],/instance resource/);
  assert.match(cellFaceInstances(model,source,[0],.5,{limits:{cellTriangles:1000,cellVertexVisits:1}}).diagnostics[0],/traversal resource/);
});

test('primitive source IDs exclude clipped, hidden and zero-length projected edges',()=>{
  const points=projected([[0,0,0],[0,2,0],[0,2,0],[3,0,0]]);points[3].clipped=true;
  const model={edges:[[0,1],[1,2],[0,3],[0,2]]},visibility={vertices:[true,true,false,true],edges:[true,true,true,false]};
  const before=JSON.stringify({model,points,visibility}),result=primitiveInstances(model,points,visibility,{spheres:true,cylinders:true});
  assert.deepEqual(result.vertices.map(v=>v.vertex),[0,1]);assert.deepEqual(result.edges.map(v=>v.edge),[0]);
  assert.deepEqual(result.edges[0],{edge:0,vertices:[0,1],midpoint:[0,1,0],direction:[0,1,0],length:2});assert.equal(result.collapsedEdges,1);
  assert.equal(JSON.stringify({model,points,visibility}),before);
});

test('primitive caps fall back as complete styles rather than silently omitting source entities',()=>{
  const result=primitiveInstances({edges:[[0,1],[1,2]]},projected([[0,0,0],[1,0,0],[2,0,0]]),{vertices:[true,true,true],edges:[true,true]}, {spheres:true,cylinders:true,limits:{spheres:2,cylinders:1}});
  assert.equal(result.sphereSupported,false);assert.equal(result.cylinderSupported,false);assert.equal(result.vertices.length,0);assert.equal(result.edges.length,0);assert.equal(result.diagnostics.length,2);
});

test('radii and shrink options retain legacy defaults and diagnose invalid metadata',()=>{
  const defaults=presentationOptions({});assert.equal(defaults.vertexStyle,'point');assert.equal(defaults.edgeStyle,'line');assert.equal(defaults.cellShrink,1);
  const valid=presentationOptions({vertexStyle:'sphere',edgeStyle:'cylinder',vertexRadius:.03,edgeRadius:.01,cellShrink:.7});assert.deepEqual(valid.diagnostics,[]);
  assert.equal(valid.vertexRadius,.03);assert.equal(valid.edgeRadius,.01);
  const invalid=presentationOptions({vertexStyle:'unknown',edgeStyle:'unknown',vertexRadius:-1,edgeRadius:Infinity,cellShrink:0});assert.equal(invalid.diagnostics.length,5);assert.equal(invalid.cellShrink,1);
});

test('actual viewer instanced spheres/rods preserve source mapping and align cylinder endpoints',()=>{
  const {model}=fixture(),before=JSON.stringify(model),value=viewer(model);
  const report=value.setDisplay({vertices:true,faces:false,vertexStyle:'sphere',edgeStyle:'cylinder',vertexRadius:.03,edgeRadius:.01,edgeOpacity:.4});
  assert.equal(value.points.visible,false);assert.equal(value.lines.visible,false);assert.equal(value.surface.visible,false);
  assert.equal(value.vertexSpheres.isInstancedMesh,true);assert.equal(value.edgeCylinders.isInstancedMesh,true);
  assert.deepEqual(value.vertexSpheres.userData.sourceVertexIds,model.vertices.map((_,i)=>i));assert.equal(report.primitiveCounts.spheres,16);
  assert.equal(report.primitiveCounts.cylinders,24);assert.equal(report.primitiveCounts.collapsedEdges,8);
  const transform=new THREE.Matrix4();value.vertexSpheres.getMatrixAt(0,transform);
  close(new THREE.Vector3().setFromMatrixPosition(transform).toArray(),value.projected[0].point,1e-7);
  close(new THREE.Vector3().setFromMatrixScale(transform).toArray(),[.03,.03,.03],1e-7);
  value.edgeCylinders.userData.sourceEdgeIds.forEach((edge,i)=>{
    value.edgeCylinders.getMatrixAt(i,transform);const [a,b]=model.edges[edge];
    close(new THREE.Vector3(0,-.5,0).applyMatrix4(transform).toArray(),value.projected[a].point,1e-6);
    close(new THREE.Vector3(0,.5,0).applyMatrix4(transform).toArray(),value.projected[b].point,1e-6);
  });
  assert.equal(value.edgeCylinders.material.opacity,.4);assert.equal(value.edgeCylinders.material.transparent,true);assert.equal(value.edgeCylinders.material.depthWrite,false);
  const balls=value.vertexSpheres,rods=value.edgeCylinders;value.setDisplay({vertices:true,vertexStyle:'point',edgeStyle:'line'});
  assert.equal(value.points.visible,true);assert.equal(value.lines.visible,true);assert.equal(balls.visible,false);assert.equal(rods.visible,false);
  value.setDisplay({vertices:true,vertexStyle:'sphere',edgeStyle:'cylinder'});assert.equal(value.vertexSpheres,balls);assert.equal(value.edgeCylinders,rods);assert.equal(JSON.stringify(model),before);
});

test('actual shrink occurs before saved frame, angle spin and finite projection exactly once',()=>{
  const {model}=fixture(),value=viewer(model),before=JSON.stringify(model),source=structuredClone(value.normalized);
  const view={cellShrink:.5,orientationFrame:{matrix:XW,sourceFingerprint:HASH},angles:[90,0,0,0,0,0],projection:'perspective'},viewBefore=JSON.stringify(view);
  value.setDisplay(view);assert.equal(value.triangles.length,96);assert.equal(value.cellInstances,8);
  const buffer=value.surfaceGeometry.attributes.position.array;
  value.triangles.forEach((triangle,i)=>triangle.points.forEach((p,j)=>{
    const q=p.map(x=>x/2),factor=3/(3-q[0]),expected=[-q[1]*factor,-q[3]*factor,q[2]*factor];
    close([...buffer.slice(i*9+j*3,i*9+j*3+3)],expected,1e-6);
  }));
  source.forEach((p,i)=>close(value.projected[i].point,projectDisplayPoint(p,XW,view.angles,'perspective').point));
  const edges=[...value.edgeGeometry.attributes.position.array];value.setDisplay({...view,cellShrink:1});assert.equal(value.triangles.length,48);assert.deepEqual([...value.edgeGeometry.attributes.position.array],edges);
  assert.deepEqual(value.normalized,source);assert.equal(JSON.stringify(model),before);assert.equal(JSON.stringify(view),viewBefore);
});

test('actual shrunk cell instances keep distinct source-cell palettes and RGBA alpha',()=>{
  const {model}=fixture();model.metadata={offColors:{cells:model.cells.map((_,i)=>({encoding:'byte',values:i%2?[0,0,255,255]:[255,0,0,128]}))}};
  const value=viewer(model);value.setDisplay({cellShrink:.7,surfaceColors:'source',surfaceOpacity:1});
  const colors=value.surfaceGeometry.getAttribute('color');assert.equal(colors.count,value.triangles.length*3);
  value.triangles.forEach((triangle,i)=>{
    const expected=triangle.cell%2?[0,0,1,1]:[1,0,0,128/255];close([...colors.array.slice(i*12,i*12+4)],expected,1e-7);
  });
  assert.equal(value.surface.material.transparent,true);assert.equal(value.surface.material.depthWrite,false);
  value.setDisplay({cellShrink:.7,surfaceColors:'cell'});const cellColors=value.surfaceGeometry.getAttribute('color').array;
  const shared=value.triangles.map((t,i)=>({t,i})).filter(({t})=>t.face===0);assert.notDeepEqual([...cellColors.slice(shared[0].i*12,shared[0].i*12+3)],[...cellColors.slice(shared[1].i*12,shared[1].i*12+3)]);
});

test('actual shrink preserves facing/manual filtering and avoids retriangulation on slider changes',()=>{
  const {model,cache}=fixture(),value=viewer(model);value.setDisplay({cellShrink:.6,cellFacing:'front',cellFacingCache:cache,projection:'perspective',vertices:true,vertexStyle:'sphere',edgeStyle:'cylinder'});
  assert.deepEqual(value.visibility.activeCells,[7]);assert.equal(value.triangles.length,12);assert.equal(value.cellInstances,1);assert.equal(value.vertexSpheres.count,8);assert.equal(value.edgeCylinders.count,12);
  const sourceTriangles=value.sourceTriangles,planes=value.facingPlanes;
  value.setDisplay({cellShrink:.8,cellFacing:'front',cellFacingCache:cache,projection:'perspective'});
  assert.equal(value.sourceTriangles,sourceTriangles);assert.equal(value.facingPlanes,planes);assert.equal(value.effectiveCellShrink,.8);
  value.setDisplay({cellShrink:.8,cellFacing:'front',cellFacingCache:cache,projection:'perspective',hiddenCells:[7]});assert.equal(value.triangles.length,0);
});

test('virtual pentagram crossing points shrink toward their source-cell center',()=>{
  const cycle=[0,2,4,1,3],vertices=[];
  for(const z of [-.5,.5])for(let i=0;i<5;i++)vertices.push([Math.cos(i*2*Math.PI/5),Math.sin(i*2*Math.PI/5),z,.6]);
  vertices.push([0,0,0,-.6]);const faces=[cycle,cycle.map(v=>v+5)],edges=[];
  cycle.forEach((a,i)=>{const b=cycle[(i+1)%5];faces.push([a,b,b+5,a+5]);edges.push([a,b],[a+5,b+5],[a,a+5]);});
  const model={dimension:4,embeddingDimension:4,interpretation:'generalized-complex',vertices,faces,edges,cells:[[0,1,2,3,4,5,6]],fingerprint:HASH},value=viewer(model),source=buildFaceSurfaces(model).triangles;
  const result=cellFaceInstances(model,source,[0],.5),crossings=source.filter(t=>!t.vertices);assert.ok(crossings.length);
  const paired=result.triangles.filter(t=>!t.sourceVertices);assert.equal(paired.length,crossings.length);
  paired.forEach((triangle,i)=>triangle.points.forEach((p,j)=>close(p,[crossings[i].points[j][0]*.5,crossings[i].points[j][1]*.5,crossings[i].points[j][2]*.5,.6],1e-12)));
  value.setDisplay({cellShrink:.5,orientationFrame:{matrix:XW,sourceFingerprint:HASH},projection:'perspective'});
  const buffer=value.surfaceGeometry.getAttribute('position').array;
  value.triangles.forEach((t,i)=>t.normalized.forEach((p,j)=>close([...buffer.slice(i*9+j*3,i*9+j*3+3)],projectDisplayPoint(p,XW,[],'perspective').point,1e-6)));
  assert.equal(value.primitiveCounts.spheres,0);assert.equal(model.vertices.length,11);assert.deepEqual(model.faces[0],cycle);
});
