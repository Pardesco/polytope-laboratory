import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';

// Exercise the actual buffers/materials without requiring a WebGL context.
function viewer(model){const value=Object.create(Viewer.prototype);value.group=new THREE.Group();value.setModel(model);return value;}
const triangle={dimension:3,vertices:[[0,0,0],[1,0,0],[0,1,0]],edges:[[0,1],[1,2],[2,0]],faces:[[0,1,2]],cells:[]};
function validNormals(value){const p=value.surfaceGeometry.getAttribute('position'),n=value.surfaceGeometry.getAttribute('normal');assert.equal(n.count,p.count);assert.ok([...n.array].every(Number.isFinite));return [...n.array];}

test('matte surfaces retain source RGBA and restrained optional edge/point overlays',()=>{
  const model=structuredClone(triangle);model.metadata={offColors:{faces:[{encoding:'byte',values:[255,64,0,128]}]}};
  const before=JSON.stringify(model),value=viewer(model),colors=value.surfaceGeometry.getAttribute('color');
  assert.equal(value.surface.material.type,'MeshPhongMaterial');assert.equal(value.surface.material.flatShading,true);
  assert.equal(colors.itemSize,4);assert.ok(Math.abs(colors.array[3]-128/255)<1e-7);
  assert.ok(Math.abs(colors.array[1]-new THREE.Color().setRGB(1,64/255,0,THREE.SRGBColorSpace).g)<1e-7);
  assert.equal(value.points.visible,false);assert.equal(value.points.material.sizeAttenuation,false);
  value.setDisplay({faces:true,edges:false,vertices:true,edgeOpacity:.4,vertexSize:5});
  assert.equal(value.lines.visible,false);assert.equal(value.points.visible,true);assert.equal(value.points.material.size,5);
  assert.equal(value.lines.material.opacity,.4);validNormals(value);assert.equal(JSON.stringify(model),before);
  value.setDisplay({surfaceOpacity:1,surfaceColors:'source'});assert.equal(value.surface.material.transparent,true);assert.equal(value.surface.material.depthWrite,false);
  value.setDisplay({surfaceOpacity:1,surfaceColors:'face'});assert.equal(value.surface.material.transparent,false);assert.equal(value.surface.material.depthWrite,true);
  value.setDisplay({surfaceOpacity:.22,surfaceColors:'face'});assert.equal(value.surface.material.transparent,true);assert.equal(value.surface.material.depthWrite,false);
});

test('projected 4D geometry regenerates finite normals as the display rotation changes',()=>{
  const model={...structuredClone(triangle),dimension:4,vertices:[[0,0,0,0],[1,0,0,0],[0,1,0,1]]};
  const before=JSON.stringify(model),value=viewer(model),initial=validNormals(value);
  value.setDisplay({angles:[0,0,0,0,0,40],projection:'orthographic'});
  const rotated=validNormals(value);assert.notDeepEqual(rotated,initial);
  const p=value.surfaceGeometry.getAttribute('position');
  const a=new THREE.Vector3().fromBufferAttribute(p,0),b=new THREE.Vector3().fromBufferAttribute(p,1),c=new THREE.Vector3().fromBufferAttribute(p,2);
  const expected=b.sub(a).cross(c.sub(a)).normalize();
  assert.ok(expected.distanceTo(new THREE.Vector3(...rotated.slice(0,3)))<1e-6);
  assert.equal(JSON.stringify(model),before);
});

test('switching winding rules resizes the normal buffer along with rendered triangles',()=>{
  const vertices=Array.from({length:5},(_,i)=>[Math.cos(i*2*Math.PI/5),Math.sin(i*2*Math.PI/5),0]);
  const cycle=[0,2,4,1,3],model={dimension:3,vertices,edges:cycle.map((v,i)=>[v,cycle[(i+1)%5]]),faces:[cycle],cells:[]},value=viewer(model);
  const initial=value.triangles.length;validNormals(value);
  value.setDisplay({fillRule:'even-odd'});assert.notEqual(value.triangles.length,initial);validNormals(value);
  value.setDisplay({fillRule:'nonzero'});assert.equal(value.triangles.length,initial);validNormals(value);
  assert.deepEqual(model.faces,[cycle]);
});

test('rigid net folding updates lit surfaces and keeps source edge lengths',()=>{
  const angle=Math.PI/3,net={faces:[{id:0,points:[[0,0],[1,0],[0,1]],sourceVertices:[0,1,2],parent:null,component:0}],components:[{root:0,targetQuaternion:[Math.sin(angle/2),0,0,Math.cos(angle/2)],targetTranslation:[0,0,0]}],traversalOrder:[0],targetVertices:[[0,0,0],[1,0,0],[0,.5,Math.sin(angle)]],sourceEdges:triangle.edges};
  const value=viewer(triangle);value.setNet(net);const initial=validNormals(value),start=[...value.surfaceGeometry.attributes.position.array];
  value.setFold(1);const end=[...value.surfaceGeometry.attributes.position.array];assert.notDeepEqual(validNormals(value),initial);
  const lengths=points=>triangle.edges.map(([a,b])=>Math.hypot(...points.slice(a*3,a*3+3).map((x,i)=>x-points[b*3+i])));
  lengths(start).forEach((x,i)=>assert.ok(Math.abs(x-lengths(end)[i])<1e-6));assert.equal(value.surfaceGeometry.getAttribute('color').itemSize,3);
});
