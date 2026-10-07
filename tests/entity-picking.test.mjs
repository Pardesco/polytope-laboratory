import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {sourceEntityHits,PickCycle,clipNdcSegment,clipCameraSegment,pointSegmentDistance} from '../ui/entity-picking.mjs';

const fixture=()=>({dimension:4,embeddingDimension:4,interpretation:'generalized-complex',fingerprint:'c'.repeat(64),vertices:[[1,0,0,0],[-1,0,0,0],[0,1,0,0],[0,-1,0,0],[0,0,1,0],[0,0,-1,0],[0,0,0,1],[0,0,0,-1]],edges:[[0,2],[2,4],[4,0]],faces:[[0,2,4]],cells:[]});
function viewer(model){
  const value=Object.create(Viewer.prototype);value.group=new THREE.Group();value.setModel(model);
  value.camera=new THREE.OrthographicCamera(-2,2,2,-2,.01,100);value.camera.position.set(0,0,5);value.camera.lookAt(0,0,0);value.camera.updateMatrixWorld();
  value.renderer={domElement:{getBoundingClientRect:()=>({width:400,height:400})}};value.picks=[];value.onPick=(...args)=>value.picks.push(args);return value;
}
const ids=result=>result.hits.map(h=>h.id);

test('visible source vertices sort by pixel distance then stable ID, independently of input order',()=>{
  const vertices=[{id:25,point:[10,10]},{id:3,point:[10,10]},{id:17,point:[11,10]},{id:1,point:[10,10],visible:false},{id:2,point:[10,10],clipped:true},{id:9,point:[NaN,10]}];
  assert.deepEqual(ids(sourceEntityHits('vertex',{cursor:[10,10],vertices})),[3,25,17]);
  assert.deepEqual(ids(sourceEntityHits('vertex',{cursor:[10,10],vertices,enabled:false})),[]);
});

test('stereo polylines pick their true sampled arc and never use a virtual endpoint chord',()=>{
  const mid=Math.SQRT1_2*100,segments=[{id:8,points:[[100,0],[mid,mid]]},{id:8,points:[[mid,mid],[0,100]]},{id:2,points:[[100,0],[mid,mid]],visible:false}];
  assert.deepEqual(ids(sourceEntityHits('edge',{cursor:[mid,mid],segments})),[8]);
  assert.deepEqual(ids(sourceEntityHits('edge',{cursor:[50,50],segments})),[]);
  assert.equal(pointSegmentDistance([5,2],[0,0],[10,0]),2);assert.equal(pointSegmentDistance([4,3],[0,0],[0,0]),5);
});

test('face source IDs deduplicate virtual patches and retain nearest ray depth',()=>{
  const triangles=[{face:17},{face:17},{face:3},{face:1,visible:false}],rayHits=[{faceIndex:0,distance:5},{faceIndex:1,distance:2},{faceIndex:2,distance:2},{faceIndex:3,distance:1}];
  const result=sourceEntityHits('face',{cursor:[0,0],triangles,rayHits});assert.deepEqual(ids(result),[3,17]);assert.equal(result.hits[1].distance,2);
});

test('cells cycle all active shared owners, while independent shrunk cell patches have one owner',()=>{
  const context={cursor:[0,0],triangles:[{face:0},{face:1,cell:7},{face:2,cell:3}],rayHits:[{faceIndex:0,distance:1},{faceIndex:1,distance:2},{faceIndex:2,distance:.5}],faceOwners:[[2,5,8],[],[]],activeCells:[2,5,7]};
  assert.deepEqual(ids(sourceEntityHits('cell',context)),[2,5,7]);
  assert.deepEqual(ids(sourceEntityHits('cell',{...context,activeCells:[7]})),[7]);
});

test('bounded source traversal fails explicitly without partial or invented IDs',()=>{
  const vertices=Array.from({length:3},(_,id)=>({id,point:[0,0]})),result=sourceEntityHits('vertex',{cursor:[0,0],vertices,limit:2});
  assert.deepEqual(result.hits,[]);assert.match(result.diagnostic,/resource limit/);
  const ownerCap=sourceEntityHits('cell',{cursor:[0,0],triangles:[{face:0}],rayHits:[{faceIndex:0,distance:1}],faceOwners:[[0,1,2]],activeCells:[0,1,2],limit:2});assert.deepEqual(ownerCap.hits,[]);assert.match(ownerCap.diagnostic,/owner traversal/);
  assert.match(sourceEntityHits('crossing',{cursor:[0,0]}).diagnostic,/unsupported/);
});

test('coincident source entity cycling resets after cursor move, kind change or empty hit',()=>{
  const cycle=new PickCycle(),hits=[{id:2},{id:9},{id:11}];
  assert.equal(cycle.choose(hits,[20,20],'edge').id,2);assert.equal(cycle.choose(hits,[21,20],'edge').id,9);assert.equal(cycle.choose(hits,[20,20],'edge').id,11);assert.equal(cycle.choose(hits,[20,20],'edge').id,2);
  assert.equal(cycle.choose(hits,[40,20],'edge').id,2);assert.equal(cycle.choose(hits,[40,20],'face').id,2);assert.equal(cycle.choose([],[40,20],'face'),null);assert.equal(cycle.choose(hits,[40,20],'face').id,2);
});

test('camera frustum clipping handles outside and behind-camera edge endpoints',()=>{
  assert.deepEqual(clipNdcSegment([-2,0,0],[2,0,0]),[[-1,0,0],[1,0,0]]);assert.equal(clipNdcSegment([0,0,2],[1,1,3]),null);
  assert.deepEqual(clipCameraSegment([0,0,-2,-1],[0,0,0,1]),[[0,0,-1],[0,0,0]]);assert.equal(clipCameraSegment([0,0,2,-1],[0,0,3,-1]),null);
  assert.equal(clipCameraSegment([NaN,0,0,1],[0,0,0,1]),null);
});

test('actual viewer picks curved source edges/cylinders, not chord placeholders, and respects toggles',()=>{
  const model=fixture(),before=JSON.stringify(model),value=viewer(model),cursor=[200+100*Math.SQRT1_2,200-100*Math.SQRT1_2];
  value.setDisplay({projection:'stereographic',faces:false,edges:true,vertices:false,pickKind:'edge',edgeStyle:'cylinder'});
  const curve=value.pickAt(...cursor);assert.equal(curve.picked.id,0);assert.equal(curve.picked.kind,'edge');assert.deepEqual(value.picks.at(-1),[0,1,'edge']);
  assert.equal(value.pickAt(250,150).picked,null);value.setDisplay({projection:'stereographic',edges:false,pickKind:'edge'});assert.equal(value.pickAt(...cursor).picked,null);
  value.setDisplay({projection:'orthographic',edges:true,pickKind:'edge'});assert.equal(value.pickAt(...cursor).picked,null);assert.equal(value.pickAt(250,150).picked.id,0);assert.equal(JSON.stringify(model),before);
});

test('actual spherical face picking returns its source face outside the old flat triangle',()=>{
  const model=fixture(),before=JSON.stringify(model),value=viewer(model);
  value.setDisplay({projection:'stereographic',pickKind:'face',faces:true});const result=value.pickAt(260,140);assert.equal(result.picked.id,0);assert.equal(result.candidates,1);assert.deepEqual(value.picks.at(-1),[0,1,'face']);
  value.setDisplay({projection:'orthographic',pickKind:'face',faces:true});assert.equal(value.pickAt(260,140).picked,null);
  value.setDisplay({projection:'stereographic',pickKind:'face',faces:false});assert.equal(value.pickAt(260,140).picked,null);assert.equal(JSON.stringify(model),before);
});

test('actual vertex visibility obeys explicit point/sphere toggle and source pole clipping',()=>{
  const value=viewer(fixture());value.setDisplay({pickKind:'vertex',projection:'stereographic',vertices:false});assert.equal(value.pickAt(300,200).picked,null);
  value.setDisplay({pickKind:'vertex',projection:'stereographic',vertices:true,vertexStyle:'sphere'});assert.equal(value.pickAt(300,200).picked.id,0);
  const center=[value.pickAt(200,200),value.pickAt(200,200),value.pickAt(200,200)];assert.deepEqual(center.map(r=>r.picked.id),[4,5,7]);assert.ok(center.every(r=>r.candidates===3)); // +/-Z and south pole coincide; north pole stays clipped.
});

test('actual shared cell owners cycle and manual isolation preserves source incidence',()=>{
  const model={dimension:4,embeddingDimension:4,interpretation:'generalized-complex',vertices:[[-1,-1,0,0],[1,-1,0,0],[1,1,0,0],[-1,1,0,0]],edges:[[0,1],[1,2],[2,3],[3,0]],faces:[[0,1,2,3]],cells:[[0],[0]]};
  const before=JSON.stringify(model),value=viewer(model);value.setDisplay({pickKind:'cell',faces:true});
  assert.equal(value.pickAt(210,190).picked.id,0);assert.equal(value.pickAt(210,190).picked.id,1);assert.equal(value.pickAt(210,190).candidates,2);
  value.setDisplay({pickKind:'cell',faces:true,isolatedCell:1});const isolated=value.pickAt(210,190);assert.equal(isolated.picked.id,1);assert.equal(isolated.candidates,1);
  value.setDisplay({pickKind:'cell',faces:true,hiddenCells:[0,1]});assert.equal(value.pickAt(210,190).picked,null);assert.equal(JSON.stringify(model),before);
});

test('actual cell-net source callbacks survive direct selection mode additions',()=>{
  const value=viewer({dimension:3,embeddingDimension:3,vertices:[[0,0,0],[1,0,0],[0,1,0]],edges:[[0,1],[1,2],[2,0]],faces:[[0,1,2]],cells:[]});
  value.cellNet={};value.cellSurfacePoints=value.normalized.map(p=>[...p]);value.cellFaceOwners=[{face:42,cell:7}];value.cellVertexSources=[11,12,13];const faces=[],vertices=[];value.onCellFace=(...args)=>faces.push(args);value.onCellVertex=id=>vertices.push(id);
  value.setDisplay({pickKind:'edge',faces:true,vertices:false});const triangle=value.triangles[0],p=triangle.vertices.map(v=>value.projected[v].point),center=[0,1,2].map(i=>p.reduce((s,q)=>s+q[i],0)/3);
  assert.equal(value.pickAt(200+100*center[0],200-100*center[1]).picked.kind,'face');assert.deepEqual(faces,[[42,7]]);
  const point=value.projected[0].point;assert.equal(value.pickAt(200+100*point[0],200-100*point[1],{shiftKey:true}).picked.kind,'vertex');assert.deepEqual(vertices,[11]);
});
