import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {contentLabelAnchors} from '../ui/element-content-anchors.mjs';
import {resolveExplosion,explosionGeometry} from '../ui/explosion.mjs';
import {projectDisplayPoint} from '../ui/display-frame.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/instance-label-native.json',import.meta.url),'utf8'));
const close=(a,b)=>a.forEach((x,k)=>assert.ok(Math.abs(x-b[k])<1e-7,`${a} differs from ${b}`));
const makeCanvas=()=>({width:0,height:0,getContext:()=>({clearRect(){},save(){},restore(){},translate(){},rotate(){},measureText:t=>({width:t.length*7}),fillText(){}})});
function viewer(model){const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.setModel(structuredClone(model));v.stereographicWorkerFactory=()=>null;return v;}
const labels=v=>v.elementContentLayer.group.children.filter(o=>o.isSprite);
test('folded face-net labels repeat native vertex/edge owners and preserve physical scale',async()=>{
 const {source,descriptor,net}=fixture.cube,v=viewer(source);try{
  v.setNet(structuredClone(net));v.setFold(.63);await v.setElementContent(descriptor,{sourceModel:source,makeCanvas});
  const sprites=labels(v),vertices=sprites.filter(s=>s.userData.sourceKind==='vertex'),edges=sprites.filter(s=>s.userData.sourceKind==='edge');
  assert.equal(vertices.length,source.faces.filter(f=>f.includes(0)).length);assert.equal(edges.length,source.faces.filter(f=>f.includes(source.edges[0][0])&&f.includes(source.edges[0][1])).length);
  for(const sprite of sprites){const ids=sprite.userData.instanceVertexIds,p=ids[0]===undefined?null:v.normalized[ids[0]].map((_,k)=>ids.reduce((sum,id)=>sum+v.normalized[id][k]/ids.length,0));close(sprite.position.toArray(),p);assert.equal(sprite.userData.sourceId,source.id);assert.equal(sprite.userData.domain,'face-net');}
  const drawing=v.elementContentLayer.textures.get('vertex:0').drawing;assert.equal(vertices[0].scale.x,drawing.widthUnits*net.scale/v.netRadius);assert.equal(v.elementContentDiagnostic,null);assert.ok((await v.prepareCapture()).elementContent.ready);
 }finally{v.clear();}
});
test('whole-cell net labels repeat vertices/edges and bind cell centroids despite face shrink',async()=>{
 const {source,descriptor,net}=fixture.tesseract,v=viewer(source);try{
  v.setCellNet(structuredClone(net),.4);await v.setElementContent(descriptor,{sourceModel:source,makeCanvas});const sprites=labels(v);
  assert.equal(sprites.filter(s=>s.userData.sourceKind==='vertex').length,net.cells.filter(c=>c.sourceVertices.includes(0)).length);
  const cell=sprites.find(s=>s.userData.sourceKind==='cell');assert.ok(cell);assert.equal(cell.userData.ownerCell,0);const ids=cell.userData.instanceVertexIds;close(cell.position.toArray(),v.normalized[ids[0]].map((_,k)=>ids.reduce((sum,id)=>sum+v.normalized[id][k]/ids.length,0)));
  assert.equal(v.elementContentDiagnostic,null);assert.ok((await v.prepareCapture()).elementContent.ready);
 }finally{v.clear();}
});
test('3D and 4D explosions label actual visible source instances through the saved projection',async()=>{
 for(const f of Object.values(fixture)){const v=viewer(f.source);try{
  assert.ok(v.setExplosion(explosionGeometry(resolveExplosion(v.model,{direction:'radial'}),.7)).applied);v.setDisplay({angles:[13,7,3,5,11,2],projection:'perspective',perspectiveDistance4D:4,vertices:true,edges:true,cellFacing:'all',cellShrink:.5});
  await v.setElementContent(f.descriptor,{sourceModel:f.source,makeCanvas});const sprites=labels(v);assert.ok(sprites.length>2);for(const s of sprites){const ids=s.userData.instanceVertexIds,points=v.explosionDisplay.normalized,p=points[ids[0]].map((_,k)=>ids.reduce((sum,id)=>sum+points[id][k]/ids.length,0));close(s.position.toArray(),projectDisplayPoint(p,null,v.view.angles,'perspective',{distance:4,near:.08}).point);assert.equal(s.userData.domain,'explosion');}
  assert.equal(v.elementContentDiagnostic,null);assert.ok((await v.prepareCapture()).elementContent.ready);
 }finally{v.clear();}}
});
test('lineage mismatch and occurrence caps refuse requested capture instead of inventing correspondence',async()=>{
 const {source,descriptor,net}=fixture.cube,v=viewer(source);try{
  v.setNet(structuredClone(net));await v.setElementContent(descriptor,{sourceModel:source,makeCanvas});v.net.faces[0].sourceVertices.reverse();await assert.rejects(v.prepareCapture(),/ordered source vertices/);
  v.net.faces[0].sourceVertices.reverse();assert.throws(()=>contentLabelAnchors(source,v.model,v.publishedPickState,descriptor.entries,{maxAnchors:1}),/occurrence limit/);
 }finally{v.clear();}
});
test('labels use the published pose while a desired view has not published, and visibility follows actual instances',async()=>{
 const {source,descriptor,net}=fixture.cube,v=viewer(source);try{
  v.setNet(structuredClone(net));await v.setElementContent(descriptor,{sourceModel:source,makeCanvas});const before=labels(v).map(s=>s.position.toArray()),published=v.publishedPickState;
  v.view={...v.view,angles:[90,0,0,0,0,0]};v.normalized=v.normalized.map(p=>p.map(x=>x+100));v.elementContentLayer.rebuild();assert.deepEqual(labels(v).map(s=>s.position.toArray()),before);
  const clone={...published,visibility:{...published.visibility,vertices:published.visibility.vertices.map(()=>false),edges:published.visibility.edges.map(()=>false)}};assert.equal(contentLabelAnchors(source,v.model,clone,descriptor.entries).size,0);
 }finally{v.clear();}
});
