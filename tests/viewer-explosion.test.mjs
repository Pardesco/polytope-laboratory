import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveExplosion,explosionGeometry} from '../ui/explosion.mjs';
import {prepareExplosionDisplay,prepareEntityDisplayBuffers,EXPLOSION_DISPLAY_LIMITS} from '../ui/viewer-explosion.mjs';
import {buildFaceSurfaces} from '../ui/face-fill.mjs';
import {perspectiveDisplayGeometry} from '../ui/viewer-perspective.mjs';
import {stereoDisplayGeometry} from '../ui/viewer-stereographic.mjs';
import {sourceEntityHits} from '../ui/entity-picking.mjs';

const close=(a,b,eps=1e-10)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const cube=()=>({id:'cube',fingerprint:'a'.repeat(64),dimension:3,embeddingDimension:3,interpretation:'convex-polytope',vertices:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],edges:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],cells:[]});
const geometry=(model,amount=1)=>explosionGeometry(resolveExplosion(model),amount);
function tesseract(){
  // Cartesian product incidence derived only from binary coordinates.
  const vertices=Array.from({length:16},(_,v)=>Array.from({length:4},(_,a)=>v>>a&1?1:-1));
  const edges=[];for(let v=0;v<16;v++)for(let a=0;a<4;a++)if(!(v>>a&1))edges.push([v,v|1<<a]);
  const faces=[];for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)for(let v=0;v<16;v++)if(!(v>>a&1)&&!(v>>b&1))faces.push([v,v|1<<a,v|1<<a|1<<b,v|1<<b]);
  const cells=[];for(let a=0;a<4;a++)for(const side of [-1,1])cells.push(faces.flatMap((f,id)=>f.every(v=>vertices[v][a]===side)?[id]:[]));
  return {id:'tesseract',fingerprint:'b'.repeat(64),dimension:4,embeddingDimension:4,interpretation:'convex-polytope',vertices,edges,faces,cells};
}
const radialGeometry=(model,amount)=>explosionGeometry(resolveExplosion(model,{direction:'radial'}),amount);
function explicitInstances(model,translation){
  const d=model.dimension,center=Array(d).fill(0);model.vertices.forEach(p=>p.forEach((x,k)=>center[k]+=x/model.vertices.length));
  const radius=Math.max(...model.vertices.map(p=>Math.hypot(...p.map((x,k)=>x-center[k]))));
  return {sourceFingerprint:model.fingerprint,normalization:{center,radius},entities:model.faces.map((ids,id)=>({id,kind:'face',sourceVertexIds:[...ids],sourceFaceIds:[id],sourceCycles:[[...ids]],faces:[ids.map((_,i)=>i)],translation:[...translation],points:ids.map(v=>model.vertices[v].map((x,k)=>x+translation[k]))}))};
}

test('cube retains original radius and analytic signed normal offsets with duplicated source IDs',()=>{
  const model=cube(),before=structuredClone(model),input=geometry(model),inputBefore=structuredClone(input),result=prepareExplosionDisplay(model,input);
  assert.equal(result.sourceModel,model);assert.equal(result.source.modelId,'cube');assert.equal(result.source.fingerprint,model.fingerprint);assert.equal(result.normalization.radius,Math.sqrt(3));
  assert.equal(result.vertices.length,24);assert.equal(result.edges.length,24);assert.equal(result.faces.length,6);assert.equal(result.triangles.length,12);
  result.vertexInstancesBySource.forEach(ids=>assert.equal(ids.length,3));result.edgeInstancesBySource.forEach(ids=>assert.equal(ids.length,2));result.faceInstancesBySource.forEach(ids=>assert.equal(ids.length,1));
  for(const v of result.vertices){const axis=v.sourceFace<2?2:v.sourceFace===2||v.sourceFace===4?1:0,sign=[-1,1,-1,1,1,-1][v.sourceFace];v.normalized.forEach((x,k)=>close(x,model.vertices[v.sourceVertex][k]/Math.sqrt(3)+(k===axis?sign:0)));}
  assert.deepEqual(model,before);assert.deepEqual(input,inputBefore);assert.equal(Object.isFrozen(model),false);assert.equal(Object.isFrozen(input.entities[0]),false);
});

test('zero amount preserves source coordinates exactly and all triangle display indices are qualified',()=>{
  const model=cube(),result=prepareExplosionDisplay(model,geometry(model,0));
  result.vertices.forEach(v=>assert.deepEqual(v.point,model.vertices[v.sourceVertex]));
  result.edges.forEach(e=>{assert.deepEqual(e.sourceVertexIds,model.edges[e.sourceEdge]);assert.deepEqual(e.points,e.sourceVertexIds.map(v=>model.vertices[v]));});
  result.triangles.forEach(t=>{assert.deepEqual(t.points,t.sourceVertices.map(v=>model.vertices[v]));assert.deepEqual(t.normalized,t.vertices.map(v=>result.normalized[v]));assert.ok(t.sourceVertices.every(v=>model.faces[t.face].includes(v)));});
  const forged=geometry(model,0);forged.entities[0].points[0][0]+=1e-12;assert.throws(()=>prepareExplosionDisplay(model,forged),/exact source coordinates/);
});

test('model scaling and translation keep normalized explosion poses covariant without fitting instances',()=>{
  const base=cube(),shifted=cube();shifted.vertices=base.vertices.map(p=>p.map((x,k)=>x*7+[23,-91,8][k]));
  const a=prepareExplosionDisplay(base,geometry(base,.75)),b=prepareExplosionDisplay(shifted,geometry(shifted,.75));
  a.vertices.forEach((v,id)=>v.normalized.forEach((x,k)=>close(x,b.vertices[id].normalized[k])));assert.equal(b.normalization.radius,Math.sqrt(3)*7);assert.deepEqual(b.normalization.center,[23,-91,8]);
  assert.ok(Math.max(...a.normalized.map(p=>Math.hypot(...p)))>1.5);
});

test('Cartesian 4D cell instances retain both face owners and all edge/vertex paths',()=>{
  const model=tesseract(),input=radialGeometry(model,1),result=prepareExplosionDisplay(model,input);
  assert.equal(result.normalization.radius,2);assert.equal(result.vertices.length,64);assert.equal(result.edges.length,96);assert.equal(result.faces.length,48);assert.equal(result.triangles.length,96);
  result.vertexInstancesBySource.forEach(ids=>assert.equal(ids.length,4));result.edgeInstancesBySource.forEach(ids=>assert.equal(ids.length,3));result.faceInstancesBySource.forEach(ids=>assert.equal(ids.length,2));result.cellInstancesBySource.forEach(ids=>assert.equal(ids.length,1));
  for(const v of result.vertices){const axis=Math.floor(v.sourceCell/2),side=v.sourceCell%2?1:-1;v.point.forEach((x,k)=>assert.equal(x,model.vertices[v.sourceVertex][k]+(k===axis?side:0)));assert.ok(v.sourceFaceIds.every(f=>model.cells[v.sourceCell].includes(f)));}
  for(const edge of result.edges){assert.equal(edge.sourceFaceIds.length,2);assert.ok(edge.sourceFaceIds.every(f=>model.cells[edge.sourceCell].includes(f)));}
  for(const triangle of result.triangles){assert.ok(model.cells[triangle.cell].includes(triangle.face));assert.deepEqual(triangle.normalized,triangle.vertices.map(v=>result.normalized[v]));}
  const shared=result.faceInstancesBySource[0].map(id=>result.faces[id]);assert.notEqual(shared[0].sourceCell,shared[1].sourceCell);assert.notDeepEqual(shared[0].vertices.map(v=>result.vertices[v].point),shared[1].vertices.map(v=>result.vertices[v].point));
});

test('source RGB/RGBA preserve encoding semantics and face colors precede owning cell colors',()=>{
  const model=tesseract();model.metadata={offColors:{vertices:model.vertices.map(()=>({encoding:'byte',values:[20,40,60,128]})),edges:model.edges.map(()=>({encoding:'unit',values:[.1,.2,.3]})),faces:model.faces.map((_,id)=>id===0?{encoding:'unit',values:[.3,.4,.5,.25]}:null),cells:model.cells.map(()=>({encoding:'byte',values:[255,0,0,64]}))}};
  const result=prepareExplosionDisplay(model,radialGeometry(model,.3));assert.equal(result.colorSpace,'srgb');assert.deepEqual(result.vertices[0].rgba,[20/255,40/255,60/255,128/255]);assert.deepEqual(result.edges[0].rgba,[.1,.2,.3,1]);
  result.triangles.filter(t=>t.face===0).forEach(t=>assert.deepEqual(t.rgba,[.3,.4,.5,.25]));result.triangles.filter(t=>t.face!==0).forEach(t=>assert.deepEqual(t.rgba,[1,0,0,64/255]));
  result.triangles[0].rgba[0]=99;assert.equal(model.metadata.offColors.cells[0].values[0],255);
});

test('explicit star cycles retain virtual crossings and winding fill before entity translation',()=>{
  const vertices=Array.from({length:5},(_,i)=>[Math.cos(i*2*Math.PI/5),Math.sin(i*2*Math.PI/5),0]),ids=[0,2,4,1,3];
  const model={id:'pentagram',fingerprint:'c'.repeat(64),dimension:3,embeddingDimension:3,interpretation:'generalized-surface',vertices,edges:ids.map((v,i)=>[v,ids[(i+1)%5]]),faces:[ids],cells:[]},instances=explicitInstances(model,[4,2,-3]);
  const a=prepareEntityDisplayBuffers(model,instances,{fillRule:'nonzero'}),b=prepareEntityDisplayBuffers(model,instances,{fillRule:'even-odd'}),source=buildFaceSurfaces(model,'nonzero').triangles;
  assert.equal(a.diagnostics.length,0);assert.equal(a.vertices.length,5);assert.equal(a.edges.length,5);assert.ok(a.triangles.every(t=>t.vertices===undefined&&t.sourceVertices===null));
  assert.deepEqual(a.faces[0].sourceVertexIds,ids);a.triangles.forEach((t,id)=>t.points.forEach((p,i)=>p.forEach((x,k)=>close(x,source[id].points[i][k]+[4,2,-3][k]))));
  const area=result=>result.triangles.reduce((sum,t)=>{const [a,b,c]=t.points;return sum+Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;},0);
  assert.ok(area(a)>area(b));assert.equal(resolveExplosion(model).supported,false);assert.throws(()=>prepareExplosionDisplay(model,{...instances,dimension:3,amount:1,direction:'normal'}),/entity-direction semantics/);
});

test('nonplanar explicit cycles diagnose fill suppression while retaining real boundaries',()=>{
  const model=cube();model.interpretation='generalized-surface';model.vertices[0][2]=-.7;const result=prepareEntityDisplayBuffers(model,explicitInstances(model,[0,0,1]));
  assert.ok(result.diagnostics.some(d=>d.face===0&&/nonplanar/.test(d.reason)));assert.equal(result.edges.length,24);assert.equal(result.vertices.length,24);assert.ok(result.triangles.length<12);
});

test('presentation arrays, returned IDs and nested colors never alias source or caller instances',()=>{
  const model=cube();model.metadata={offColors:{faces:model.faces.map(()=>({encoding:'byte',values:[10,20,30,40]}))}};
  const instances=geometry(model,.5),savedModel=structuredClone(model),savedInstances=structuredClone(instances),result=prepareExplosionDisplay(model,instances);
  result.vertices[0].point[0]=900;result.edges[0].sourceVertexIds.reverse();result.faces[0].sourceVertexIds.reverse();result.triangles[0].sourceVertices.reverse();result.entities[0].sourceFaceIds.push(900);result.normalization.center[0]=50;
  assert.deepEqual(model,savedModel);assert.deepEqual(instances,savedInstances);model.vertices[0][0]=-4;instances.entities[0].sourceCycles[0].reverse();assert.equal(Object.isFrozen(model.vertices[0]),false);assert.equal(Object.isFrozen(instances.entities[0].sourceCycles[0]),false);
});

test('source fingerprint, complete incidence and uniform translation reject forged presentation metadata',()=>{
  const model=cube(),input=geometry(model);
  for(const mutate of [x=>x.sourceFingerprint='d'.repeat(64),x=>x.normalization.radius=100,x=>x.normalization.center[0]=1,x=>x.entities[0].sourceCycles[0].reverse(),x=>x.entities[0].sourceFaceIds=[1],x=>x.entities[0].faces[0].reverse(),x=>x.entities[0].points[0][0]+=1,x=>x.entities[0].id=1,x=>x.entities[0].kind='cell']){
    const forged=structuredClone(input);mutate(forged);assert.throws(()=>prepareExplosionDisplay(model,forged),/Explosion display unavailable/);
  }
  const cellModel=tesseract(),cellInput=radialGeometry(cellModel,1);cellInput.entities[0].sourceFaceIds.reverse();assert.throws(()=>prepareExplosionDisplay(cellModel,cellInput),/ordered source face\/cell/);
});

test('bounds fail atomically rather than publishing incomplete instance styles',()=>{
  const model=cube(),input=geometry(model),before=structuredClone(input);
  for(const field of Object.keys(EXPLOSION_DISPLAY_LIMITS))assert.throws(()=>prepareExplosionDisplay(model,input,{limits:{[field]:1}}),/bound|limit/);
  for(const limits of [{vertices:0},{vertices:Infinity},{triangles:EXPLOSION_DISPLAY_LIMITS.triangles+1},{unrecognized:1}])assert.throws(()=>prepareExplosionDisplay(model,input,{limits}),/limits/);
  assert.deepEqual(input,before);assert.throws(()=>prepareExplosionDisplay(model,input,{fillRule:'convex-hull'}),/fill rule/);
  for(const amount of [NaN,-1,11])assert.throws(()=>prepareExplosionDisplay(model,{...input,amount}),/payload/);
});

test('invalid RGB/RGBA and identity reject without freezing malformed user data',()=>{
  for(const record of [{encoding:'unit',values:[1,2,0]},{encoding:'byte',values:[1.5,2,3]},{encoding:'byte',values:[1,2]},{encoding:'index',values:[1,2,3]}]){
    const model=cube();model.metadata={offColors:{faces:model.faces.map(()=>record)}};assert.throws(()=>prepareExplosionDisplay(model,geometry(model)),/RGB\/RGBA/);assert.equal(Object.isFrozen(record.values),false);
  }
  const model=cube(),invalid={bad:true};model.id=invalid;assert.throws(()=>prepareExplosionDisplay(model,geometry(model)),/identity/);assert.equal(Object.isFrozen(invalid),false);
});

test('subset and empty explicit instance sets retain full source map cardinalities',()=>{
  const model=tesseract(),input=radialGeometry(model,.5);input.entities=[input.entities[3]];const result=prepareEntityDisplayBuffers(model,input);
  assert.equal(result.entities.length,1);assert.equal(result.sourceVertexIds.length,8);assert.equal(result.vertexInstancesBySource.length,16);assert.deepEqual(result.cellInstancesBySource[3],[0]);assert.ok(result.cellInstancesBySource.filter((_,i)=>i!==3).every(ids=>ids.length===0));
  input.entities=[];const empty=prepareEntityDisplayBuffers(model,input);assert.equal(empty.triangles.length,0);assert.equal(empty.edges.length,0);assert.equal(empty.vertexInstancesBySource.length,16);
});

test('all duplicate vertex/edge picking paths resolve original source IDs and faces retain explicit cell owners',()=>{
  const model=tesseract(),display=prepareExplosionDisplay(model,radialGeometry(model,1)),sourceVertex=0;
  const candidates=display.vertexInstancesBySource[sourceVertex].map(id=>({id:display.vertices[id].sourceVertex,point:[5,5,0]}));
  assert.deepEqual(sourceEntityHits('vertex',{cursor:[5,5],vertices:candidates}).hits.map(hit=>hit.id),[sourceVertex]);
  const sourceEdge=0,segments=display.edgeInstancesBySource[sourceEdge].map(id=>({id:display.edges[id].sourceEdge,points:[[0,0],[10,0]]}));assert.deepEqual(sourceEntityHits('edge',{cursor:[5,0],segments}).hits.map(hit=>hit.id),[sourceEdge]);
  const selected=display.triangles.flatMap((t,id)=>t.face===0?[{faceIndex:id,distance:1}]:[]),activeCells=Array.from({length:8},(_,i)=>i);
  const cells=sourceEntityHits('cell',{cursor:[0,0],rayHits:selected,triangles:display.triangles,activeCells}).hits.map(hit=>hit.id);assert.equal(cells.length,2);assert.ok(cells.every(id=>model.cells[id].includes(0)));
});

test('4D observation frame, rotation, perspective and stereographic adapters consume instance indices correctly',()=>{
  const model=tesseract(),result=prepareExplosionDisplay(model,radialGeometry(model,.25)),matrix=[[0,0,0,-1],[0,1,0,0],[0,0,1,0],[1,0,0,0]],angles=[13,0,0,27,0,0];
  const visibility={edges:result.edges.map(()=>true),faces:model.faces.map(()=>true)};
  const perspective=perspectiveDisplayGeometry(result.normalized,result.edgeIndices,result.triangles,visibility,matrix,angles,{distance:4});
  assert.equal(perspective.edges.length,96);assert.ok(perspective.triangles.length>0);assert.ok(perspective.triangles.every(t=>model.cells[t.cell].includes(t.face)&&t.points.every(p=>p.every(Number.isFinite))));
  perspective.edges.forEach(e=>assert.ok(Number.isInteger(result.sourceEdgeIds[e.edge])));
  const stereo=stereoDisplayGeometry(result.normalized,result.edgeIndices,result.triangles,visibility,matrix,angles,{maxDepth:2,tolerance:.1});
  assert.ok(stereo.edges.length>0);assert.ok(stereo.triangles.length>0);assert.ok(stereo.triangles.every(t=>model.cells[t.cell].includes(t.face)&&t.points.every(p=>p.every(Number.isFinite))));
});
