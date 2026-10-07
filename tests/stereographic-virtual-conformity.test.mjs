/** Real ordered star-face arrangements through the worker; no GUI required. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFaceSurfaces} from '../ui/face-fill.mjs';
import {cellFaceInstances} from '../ui/entity-presentation.mjs';
import {prepareEntityDisplayBuffers} from '../ui/viewer-explosion.mjs';
import {prepareStereographicWorkerGeometry,computeStereographicWorkerGeometry} from '../ui/stereographic-worker-geometry.mjs';
import {packSurfaceColors} from '../ui/packed-surface-colors.mjs';

const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),norm=p=>Math.hypot(...p);
const inverse=p=>{const rr=dot(p,p);return [...p.map(x=>2*x/(1+rr)),(rr-1)/(rr+1)];};
const key=p=>p.map(x=>Math.round(x*1e6)).join(',');
const edgeKey=(a,b)=>[key(a),key(b)].sort().join('|');
function source(step=2){
  const angular=Array.from({length:5},(_,i)=>[Math.cos(2*Math.PI*i/5),Math.sin(2*Math.PI*i/5)]);
  const cycle=Array.from({length:5},(_,i)=>((i*step)%5+5)%5),square=[[.35,-.45],[.35,.45],[-.35,.45],[-.35,-.45]];
  const vertices=angular.flatMap(a=>square.map(b=>[...a,...b])),faces=[];
  for(let b=0;b<4;b++)faces.push(cycle.map(a=>a*4+b));
  for(let a=0;a<5;a++)faces.push([0,1,2,3].map(b=>a*4+b));
  for(let a=0;a<5;a++)for(let b=0;b<4;b++)faces.push([cycle[a]*4+b,cycle[(a+1)%5]*4+b,cycle[(a+1)%5]*4+(b+1)%4,cycle[a]*4+(b+1)%4]);
  const cells=[];
  for(let b=0;b<4;b++)cells.push([b,(b+1)%4,...Array.from({length:5},(_,a)=>9+a*4+b)]);
  for(let a=0;a<5;a++)cells.push([4+cycle[a],4+cycle[(a+1)%5],...Array.from({length:4},(_,b)=>9+a*4+b)]);
  const edges=new Map();for(const face of faces)face.forEach((a,i)=>{const pair=[a,face[(i+1)%face.length]].sort((a,b)=>a-b);edges.set(pair.join(','),pair);});
  return {id:`literal-star-${step}-times-square`,fingerprint:'d'.repeat(64),dimension:4,embeddingDimension:4,interpretation:'generalized-complex',vertices,edges:[...edges.values()],faces,cells,
    metadata:{symbol:`5/${step}`,units:{label:'mm'},offColors:{faces:faces.map((_,i)=>i===0?{encoding:'byte',values:[255,64,0,96]}:null),cells:cells.map(()=>({encoding:'unit',values:[.1,.3,.7,.6]}))}}};
}
function prepare(model,triangles,extra={}){
  return prepareStereographicWorkerGeometry({model,normalized:model.vertices,edges:[],triangles:triangles.map(t=>({...t,normalized:t.normalized??t.points})),
    visibility:{faces:model.faces.map((_,i)=>i===0)},conformingSurfaces:true,...extra});
}
function rawPoint(p,cycle){
  const q=inverse(p),[z,w]=cycle[0].slice(2),den=q[2]**2+q[3]**2;
  assert.ok(den>1e-8,'The fixture avoids the radial center.');
  const scale=(z*q[2]+w*q[3])/den,raw=q.map(x=>x*scale);
  assert.ok(scale>0&&Math.hypot(raw[2]-z,raw[3]-w)<2e-6,'Patch escaped its original face or translated instance.');
  return raw;
}
function onSourceEdge(p,cycle){
  return cycle.some((a,i)=>{const b=cycle[(i+1)%cycle.length],v=b.map((x,k)=>x-a[k]),r=p.map((x,k)=>x-a[k]),t=dot(r,v)/dot(v,v);
    return t>=-2e-6&&t<=1+2e-6&&norm(r.map((x,k)=>x-t*v[k]))<3e-6;});
}
/** Pair actual leaf edges. A point-set-only comparison would miss an original
 * slab chord meeting two shorter segments, as well as adaptive T junctions. */
function assertConforming(result,cycles){
  const g=result.geometry,edges=new Map(),normals=new Map();let interior=0;
  assert.equal(result.complete,true,JSON.stringify(g.diagnostics));assert.deepEqual(g.diagnostics,[]);
  assert.ok(g.faceIds.length>0,'The actual star fill must remain visible.');
  for(let i=0;i<g.faceIds.length;i++){
    assert.equal(g.faceIds[i],0);const cell=g.cellIds[i],cycle=cycles.get(cell);assert.ok(cycle,'No invented cell owner.');
    const points=[0,1,2].map(k=>Array.from(g.triangles.subarray(i*9+k*3,i*9+k*3+3)));
    for(let k=0;k<3;k++){
      const p=points[k],normal=Array.from(g.normals.subarray(i*9+k*3,i*9+k*3+3));rawPoint(p,cycle);
      assert.ok(Math.abs(norm(normal)-1)<2e-6);const nk=`${cell}:${key(p)}`;
      if(normals.has(nk))assert.ok(dot(normal,normals.get(nk))>.999,'Arrangement seam normals disagree.');else normals.set(nk,normal);
      const a=p,b=points[(k+1)%3];assert.ok(norm(a.map((x,j)=>x-b[j]))>1e-8);
      const ek=`${cell}:${edgeKey(a,b)}`,old=edges.get(ek);if(old)old.count++;else edges.set(ek,{count:1,a,b,cycle});
    }
  }
  for(const e of edges.values()){
    assert.ok(e.count===1||e.count===2,'No duplicate or nonmanifold leaf edge.');
    if(e.count===2){interior++;continue;}
    const a=rawPoint(e.a,e.cycle),b=rawPoint(e.b,e.cycle),mid=a.map((x,k)=>(x+b[k])/2);
    assert.ok(onSourceEdge(a,e.cycle)&&onSourceEdge(b,e.cycle)&&onSourceEdge(mid,e.cycle),'Unpaired interior leaf edge: coarse chord/fine break mismatch.');
  }
  assert.ok(interior>20,'Exercise subdivided arrangement interiors.');
}
function assertSourceColor(model,result){
  const faceOwners=model.faces.map((_,face)=>model.cells.flatMap((faces,cell)=>faces.includes(face)?[cell]:[])),sourceKey=JSON.stringify([model.id,model.fingerprint]);
  const packed={...result.geometry,sourceCounts:{vertices:model.vertices.length,edges:model.edges.length,faces:model.faces.length,cells:model.cells.length},owner:{modelId:model.id,fingerprint:model.fingerprint,sourceKey}};
  const color=packSurfaceColors(model,packed,{faceOwners,activeCellSet:new Set(model.cells.map((_,i)=>i))},'source');
  assert.equal(color.vertexAlpha,true);for(let i=3;i<color.colors.length;i+=4)assert.ok(Math.abs(color.colors[i]-96/255)<1e-7);
}
for(const [step,rule] of [[2,'nonzero'],[3,'nonzero'],[-2,'nonzero'],[2,'even-odd']])test(`real 5/${step} ${rule} virtual arrangement retains a conforming curved fill and source RGBA`,()=>{
  const model=source(step),before=JSON.stringify(model),fill=buildFaceSurfaces(model,rule,{faceIds:[0]});assert.deepEqual(fill.diagnostics,[]);
  assert.ok(fill.triangles.every(t=>!t.vertices&&t.presentationCornerIds?.length===3),'Virtual lineage must come from the actual face-fill builder.');
  const input=prepare(model,fill.triangles),saved=structuredClone(input),result=computeStereographicWorkerGeometry(input,{tolerance:.004,maxDepth:8});
  assertConforming(result,new Map([[-1,model.faces[0].map(v=>model.vertices[v])]]));assertSourceColor(model,result);
  assert.ok(result.geometry.triangleIds.every(id=>id<fill.triangles.length));assert.deepEqual(input,saved);assert.equal(JSON.stringify(model),before);
});
test('actual cell shrink retains virtual arrangement lineage and distinct source cell domains',()=>{
  const model=source(),before=JSON.stringify(model),fill=buildFaceSurfaces(model,'nonzero',{faceIds:[0]}),active=[0,3],shrink=.8;
  const display=cellFaceInstances(model,fill.triangles,active,shrink);assert.deepEqual(display.diagnostics,[]);assert.equal(display.cellInstances,2);
  const cycles=new Map();for(const cell of active){const ids=[...new Set(model.cells[cell].flatMap(f=>model.faces[f]))],center=[0,1,2,3].map(k=>ids.reduce((s,v)=>s+model.vertices[v][k]/ids.length,0));
    cycles.set(cell,model.faces[0].map(v=>model.vertices[v].map((x,k)=>center[k]+shrink*(x-center[k]))));}
  const result=computeStereographicWorkerGeometry(prepare(model,display.triangles),{tolerance:.004,maxDepth:8});assertConforming(result,cycles);assertSourceColor(model,result);
  assert.deepEqual([...new Set(result.geometry.cellIds)].sort(),active);assert.equal(JSON.stringify(model),before);
});
test('explicit generalized translated entities retain virtual lineage, normalization and separate owners',()=>{
  const model=source(),before=JSON.stringify(model),center=[0,1,2,3].map(k=>model.vertices.reduce((s,p)=>s+p[k]/model.vertices.length,0)),radius=Math.max(...model.vertices.map(p=>norm(p.map((x,k)=>x-center[k]))));
  const translations=new Map([[0,[0,0,.1,0]],[3,[0,0,0,-.12]]]);
  const entities=[...translations].map(([id,translation])=>{const sourceFaceIds=model.cells[id],sourceVertexIds=[...new Set(sourceFaceIds.flatMap(f=>model.faces[f]))].sort((a,b)=>a-b),local=new Map(sourceVertexIds.map((v,i)=>[v,i]));
    return {id,kind:'cell',translation,sourceFaceIds,sourceVertexIds,sourceCycles:sourceFaceIds.map(f=>model.faces[f]),faces:sourceFaceIds.map(f=>model.faces[f].map(v=>local.get(v))),points:sourceVertexIds.map(v=>model.vertices[v].map((x,k)=>x+translation[k]))};});
  const display=prepareEntityDisplayBuffers(model,{sourceFingerprint:model.fingerprint,normalization:{center,radius},entities});assert.deepEqual(display.diagnostics,[]);
  const triangles=display.triangles.filter(t=>t.face===0),cycles=new Map([...translations].map(([cell,t])=>[cell,model.faces[0].map(v=>model.vertices[v].map((x,k)=>(x+t[k]-center[k])/radius))]));
  const input=prepare(model,triangles,{normalized:display.normalized,sourceVertexIds:display.sourceVertexIds,sourceVertexCells:display.vertices.map(v=>v.cell)});
  const result=computeStereographicWorkerGeometry(input,{tolerance:.004,maxDepth:8});assertConforming(result,cycles);assertSourceColor(model,result);
  assert.deepEqual([...new Set(result.geometry.cellIds)].sort(),[0,3]);assert.equal(JSON.stringify(model),before);
});
test('virtual arrangement resource exhaustion remains explicitly incomplete and cannot claim whole-face capture',()=>{
  const model=source(),fill=buildFaceSurfaces(model,'nonzero',{faceIds:[0]}),result=computeStereographicWorkerGeometry(prepare(model,fill.triangles),{tolerance:.004,maxDepth:8,limits:{triangles:1}});
  assert.equal(result.complete,false);assert.ok(result.omittedTriangles>0||result.unresolvedTriangles>0);assert.ok(result.geometry.diagnostics.length>0);
});
test('virtual conformity changes no source point or edge projection buffers or ownership slots',()=>{
  const model=source(),before=JSON.stringify(model),fill=buildFaceSurfaces(model,'nonzero',{faceIds:[0]});
  const input=prepare(model,fill.triangles,{edges:model.edges}),legacy=structuredClone(input);
  delete legacy.triangleCornerIds;delete legacy.triangleSourceVertexIds;
  const settings={tolerance:.004,maxDepth:8},a=computeStereographicWorkerGeometry(input,settings),b=computeStereographicWorkerGeometry(legacy,settings);
  for(const field of ['positions','vertexIds','vertexFaces','vertexCells','vertexVisible','segments','edgeIds','edgeFaces','edgeCells','edgeInstanceIds','edgeResolution'])assert.deepEqual(a.geometry[field],b.geometry[field],field);
  assert.equal(JSON.stringify(model),before);
});
