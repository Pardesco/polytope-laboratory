import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {classifyCellFacing,composeDisplayMatrix,resolveSourcePlanes} from '../ui/cell-facing.mjs';

const HASH='c'.repeat(64),OTHER_HASH='d'.repeat(64);
const IDENTITY=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
const XW=[[0,0,0,-1],[0,1,0,0],[0,0,1,0],[1,0,0,0]];
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
  })};
  return {model,cache};
}
function close(actual,expected,tolerance=1e-12){assert.equal(actual.length,expected.length);actual.forEach((x,i)=>assert.ok(Math.abs(x-expected[i])<tolerance,`${actual} differs from ${expected}`));}
function resolved(){const {model,cache}=fixture();const value=resolveSourcePlanes(model,cache);assert.equal(value.supported,true,value.diagnostic);return value;}
function viewer(model){const value=Object.create(Viewer.prototype);value.group=new THREE.Group();value.setModel(model);return value;}

test('literal convex cache is verified and copied without source or incidence mutation',()=>{
  const {model,cache}=fixture(),before=JSON.stringify({model,cache}),value=resolveSourcePlanes(model,cache);
  assert.equal(value.supported,true);assert.equal(value.diagnostic,null);assert.equal(value.planes.length,8);
  assert.deepEqual(value.normalization,{center:[0,0,0,0],radius:2});
  value.planes[0].normal[0]=42;assert.equal(JSON.stringify({model,cache}),before);
});

test('parallel positive and negative W have one front, one back and six grazing cells',()=>{
  for(const sign of [-1,1]){
    const result=classifyCellFacing(resolved(),{direction:[0,0,0,sign]});
    assert.deepEqual(result.frontCellIds,[sign===1?7:6]);assert.deepEqual(result.backCellIds,[sign===1?6:7]);assert.deepEqual(result.grazingCellIds,[0,1,2,3,4,5]);
    result.cells.forEach((cell,i)=>assert.equal(cell.signedFacing,i<6?0:sign*(i%2?1:-1)));
  }
});

test('finite positive and negative W3 eyes have one front and seven back cells',()=>{
  for(const sign of [-1,1]){
    const result=classifyCellFacing(resolved(),{projection:'perspective',eye:[0,0,0,3*sign]});
    assert.deepEqual(result.frontCellIds,[sign===1?7:6]);assert.equal(result.backCellIds.length,7);assert.deepEqual(result.grazingCellIds,[]);
    result.cells.forEach((cell,i)=>assert.equal(cell.signedFacing,i<6?-.5:3*sign*(i%2?1:-1)-.5));
  }
});

test('saved frame and six angle rotations compose in viewer order',()=>{
  const matrix=composeDisplayMatrix(XW,[90,0,0,0,0,0]);
  // XW quarter-turn then XY quarter-turn maps p to (-Y,-W,Z,X).
  const point=[.2,.3,.4,.5];close(matrix.map(row=>row.reduce((sum,x,i)=>sum+x*point[i],0)),[-.3,-.5,.4,.2]);
  const result=classifyCellFacing(resolved(),{matrix:XW,angles:[90,0,0,0,0,0]});
  assert.deepEqual(result.frontCellIds,[1]);assert.deepEqual(result.backCellIds,[0]);assert.deepEqual(result.grazingCellIds,[2,3,4,5,6,7]);
  assert.deepEqual(XW,[[0,0,0,-1],[0,1,0,0],[0,0,1,0],[1,0,0,0]]);
});

test('cell-zero First/Last proper frames change selected cell facing in both projections',()=>{
  // Cell zero is X=-1; these explicit proper frames map its normal to +/-W.
  const first=[[0,0,0,1],[0,1,0,0],[0,0,1,0],[-1,0,0,0]],last=first.map((row,i)=>row.map(x=>(i>=2?-1:1)*x));
  for(const projection of ['orthographic','perspective']){
    const front=classifyCellFacing(resolved(),{matrix:first,projection}),back=classifyCellFacing(resolved(),{matrix:last,projection});
    assert.equal(front.cells[0].facing,'front');assert.equal(back.cells[0].facing,'back');
    assert.deepEqual(front.frontCellIds,[0]);assert.deepEqual(back.frontCellIds,[1]);
  }
});

test('angle-driven facing updates each call instead of reusing stored cache masks',()=>{
  const {model,cache}=fixture();cache.masks={front:Array(8).fill(true),back:Array(8).fill(false)};
  const planes=resolveSourcePlanes(model,JSON.parse(JSON.stringify(cache)));
  assert.deepEqual(classifyCellFacing(planes).frontCellIds,[7]);
  assert.deepEqual(classifyCellFacing(planes,{angles:[0,0,90]}).frontCellIds,[1]);
  assert.deepEqual(classifyCellFacing(planes,{angles:[0,0,180]}).frontCellIds,[6]);
  assert.deepEqual(classifyCellFacing(planes).frontCellIds,[7]);
});

test('eye-on-plane and interior-eye classification matches normalized signed distance',()=>{
  const planes=resolved();
  assert.deepEqual(classifyCellFacing(planes,{projection:'perspective',eye:[0,0,0,0]}).backCellIds,[0,1,2,3,4,5,6,7]);
  for(const [w,facing] of [[.5-2e-8,'back'],[.5-5e-9,'grazing'],[.5,'grazing'],[.5+5e-9,'grazing'],[.5+2e-8,'front']])assert.equal(classifyCellFacing(planes,{projection:'perspective',eye:[0,0,0,w]}).cells[7].facing,facing);
  assert.equal(classifyCellFacing(planes,{projection:'stereographic'}).cells[7].signedFacing,1.05-.5);
});

test('translated and uniformly scaled sources preserve verified normalized planes',()=>{
  const {model,cache}=fixture(),shift=[2,-3,5,7],scale=1e-9;
  model.vertices=model.vertices.map(p=>p.map((x,i)=>scale*(x+shift[i])));
  cache.normalization={center:shift.map(x=>x*scale),radius:2*scale};
  const planes=resolveSourcePlanes(model,cache);assert.equal(planes.supported,true,planes.diagnostic);
  const result=classifyCellFacing(planes,{projection:'perspective'});
  assert.deepEqual(result.frontCellIds,[7]);result.cells.forEach((cell,i)=>assert.ok(Math.abs(cell.signedFacing-(i<6?-.5:i===6?-3.5:2.5))<1e-12));
});

test('rigidly rotated source planes covary with an inverse display frame',()=>{
  const {model,cache}=fixture();model.vertices=model.vertices.map(p=>[-p[3],p[1],p[2],p[0]]);
  cache.cells.forEach(cell=>{const n=cell.normalizedPlane.normal;cell.normalizedPlane.normal=[-n[3],n[1],n[2],n[0]];});
  const planes=resolveSourcePlanes(model,cache);assert.equal(planes.supported,true,planes.diagnostic);
  const inverse=XW.map((_,i)=>XW.map(row=>row[i]));
  const result=classifyCellFacing(planes,{matrix:inverse,projection:'perspective'});
  assert.deepEqual(result.frontCellIds,[7]);assert.equal(result.backCellIds.length,7);
});

test('hash, algorithm, normalization and cache coverage corruption reject explicitly',()=>{
  const mutations=[cache=>cache.sourceFingerprint=OTHER_HASH,cache=>cache.algorithmVersion='fake',cache=>cache.normalization.radius=3,cache=>cache.normalization.center[0]=1,cache=>cache.sourceCellIds.reverse(),cache=>cache.cells.pop(),cache=>cache.cells[0].sourceVertexIds.pop()];
  for(const mutate of mutations){const {model,cache}=fixture();mutate(cache);const result=resolveSourcePlanes(model,cache);assert.equal(result.supported,false);assert.match(result.diagnostic,/Cell facing unavailable/);}
});

test('matching hash cannot legitimize forged planes or geometry changed under a stale hash',()=>{
  for(const mutate of [cache=>cache.cells[0].normalizedPlane.normal[0]=1,cache=>cache.cells[0].normalizedPlane.offset=.8,cache=>cache.cells[0].normalizedPlane.normal=[0,0,0,1],cache=>cache.cells[0].normalizedPlane.offset=NaN]){
    const {model,cache}=fixture();mutate(cache);assert.equal(resolveSourcePlanes(model,cache).supported,false);
  }
  const {model,cache}=fixture();model.vertices[0][0]=-.8;
  assert.equal(resolveSourcePlanes(model,cache).supported,false);
});

test('generalized, lower-rank, malformed and capped sources retain explicit unsupported diagnostics',()=>{
  const mutations=[model=>model.interpretation='generalized-complex',model=>model.dimension=3,model=>model.vertices=model.vertices.map(p=>[...p.slice(0,3),0]),model=>model.cells[0][0]=99,model=>model.faces[0][0]=99,model=>model.vertices=Array(20001).fill([0,0,0,0])];
  for(const mutate of mutations){const {model,cache}=fixture();mutate(model);const result=resolveSourcePlanes(model,cache);assert.equal(result.supported,false);assert.match(result.diagnostic,/Cell facing unavailable/);}
  const {model,cache}=fixture();model.interpretation='generalized-complex';assert.match(resolveSourcePlanes(model,cache).diagnostic,/source-orientation semantics/);
});

test('invalid matrices, observer vectors and options do not yield invented facing masks',()=>{
  const planes=resolved(),reflection=IDENTITY.map(row=>[...row]);reflection[3][3]=-1;
  for(const options of [{matrix:reflection},{matrix:[[1]]},{angles:[Infinity]},{angles:[0,0,0,0,0,0,0]},{projection:'unknown'},{eye:[0,0,0,3]},{direction:[0,0,0,0]},{direction:[0,0,0,Infinity]},{projection:'perspective',eye:[0,0,0,NaN]},{projection:'perspective',direction:[0,0,0,1]},{grazingTolerance:0}]){
    const result=classifyCellFacing(planes,options);assert.equal(result.supported,false);assert.equal(result.masks,null);assert.ok(result.diagnostic);
  }
  assert.throws(()=>composeDisplayMatrix(reflection),/determinant/);
});

test('large finite parallel direction is normalized without mutating inputs',()=>{
  const direction=[0,0,0,1e300],before=[...direction],result=classifyCellFacing(resolved(),{direction});
  assert.deepEqual(result.frontCellIds,[7]);assert.deepEqual(direction,before);
});

test('actual viewer facing modes preserve shared-face ownership and source IDs',()=>{
  const {model,cache}=fixture(),value=viewer(model),before=JSON.stringify(model);
  for(const [cellFacing,active,faceCount] of [['hide-front',[0,1,2,3,4,5,6],24],['hide-back',[0,1,2,3,4,5,7],24],['front',[7],6],['back',[6],6]]){
    const view={cellFacing,cellFacingCache:cache},viewBefore=JSON.stringify(view),report=value.setDisplay(view);
    assert.equal(report.facingApplied,true);assert.equal(report.facingDiagnostic,null);assert.deepEqual(report.facingCounts,{front:1,back:1,grazing:6,total:8});
    assert.deepEqual(value.visibility.activeCells,active);assert.equal(value.visibility.faces.filter(Boolean).length,faceCount);
    assert.equal(value.triangles.length,faceCount*2);
    value.triangles.forEach(triangle=>assert.ok(value.visibility.faceOwners[triangle.face].some(cell=>active.includes(cell))));
    if(active.length===1){assert.equal(value.visibility.edges.filter(Boolean).length,12);assert.equal(value.visibility.vertices.filter(Boolean).length,8);}
    assert.equal(JSON.stringify(view),viewBefore);
  }
  assert.equal(JSON.stringify(model),before);
});

test('actual viewer finite-eye culling differs from parallel culling',()=>{
  const {model,cache}=fixture(),value=viewer(model);
  value.setDisplay({cellFacing:'hide-back',cellFacingCache:cache,projection:'orthographic'});
  assert.equal(value.visibility.activeCells.length,7);assert.equal(value.visibility.faces.filter(Boolean).length,24);
  const report=value.setDisplay({cellFacing:'hide-back',cellFacingCache:cache,projection:'perspective'});
  assert.deepEqual(report.facingCounts,{front:1,back:7,grazing:0,total:8});assert.deepEqual(value.visibility.activeCells,[7]);
  assert.equal(value.visibility.faces.filter(Boolean).length,6);assert.equal(value.triangles.length,12);
});

test('actual viewer updates facing with angles but reuses planes and surfaces while masks stay equal',()=>{
  const {model,cache}=fixture(),value=viewer(model);
  value.setDisplay({cellFacing:'front',cellFacingCache:cache,angles:[0,0,10]});
  assert.deepEqual(value.visibility.activeCells,[1,7]);
  const planes=value.facingPlanes,triangles=value.triangles;
  let builds=0;const original=value.rebuildSurfaces;value.rebuildSurfaces=function(...args){builds++;return original.apply(this,args);};
  value.setDisplay({cellFacing:'front',cellFacingCache:cache,angles:[0,0,20]});
  assert.equal(value.facingPlanes,planes);assert.equal(value.triangles,triangles);assert.equal(builds,0);
  value.setDisplay({cellFacing:'front',cellFacingCache:cache,angles:[0,0,90]});
  assert.deepEqual(value.visibility.activeCells,[1]);assert.equal(builds,1);assert.equal(value.facingPlanes,planes);
  value.setDisplay({cellFacing:'front',cellFacingCache:structuredClone(cache),angles:[0,0,90]});
  assert.notEqual(value.facingPlanes,planes);assert.equal(builds,1);
});

test('actual viewer intersects manual isolation and hiding with facing without changing saved intent',()=>{
  const {model,cache}=fixture(),value=viewer(model),before=JSON.stringify(model);
  const view={cellFacing:'front',cellFacingCache:cache,isolatedCell:6,hiddenCells:[0]},viewBefore=JSON.stringify(view);
  value.setDisplay(view);assert.deepEqual(value.visibility.activeCells,[]);assert.equal(value.triangles.length,0);
  assert.equal(JSON.stringify(view),viewBefore);
  value.setDisplay({...view,cellFacing:'hide-front'});assert.deepEqual(value.visibility.activeCells,[6]);assert.equal(value.triangles.length,12);
  value.setDisplay({...view,isolatedCell:null,hiddenCells:[7]});assert.deepEqual(value.visibility.activeCells,[]);
  assert.equal(JSON.stringify(model),before);
});

test('actual viewer applies First/Last source frames to both culling and rendered geometry',()=>{
  const {model,cache}=fixture(),value=viewer(model);
  const first=[[0,0,0,1],[0,1,0,0],[0,0,1,0],[-1,0,0,0]],last=first.map((row,i)=>row.map(x=>(i>=2?-1:1)*x));
  for(const [matrix,cell] of [[first,0],[last,1]]){
    const report=value.setDisplay({cellFacing:'front',cellFacingCache:cache,orientationFrame:{matrix,sourceFingerprint:HASH}});
    assert.equal(report.orientationApplied,true);assert.equal(report.facingApplied,true);assert.deepEqual(value.visibility.activeCells,[cell]);
    value.normalized.forEach((p,i)=>close(value.projected[i].point,matrix.slice(0,3).map(row=>row.reduce((sum,x,k)=>sum+x*p[k],0))));
  }
});

test('actual viewer clear-to-all restores manual visibility and suppresses disabled-mode diagnostics',()=>{
  const {model,cache}=fixture(),value=viewer(model);
  value.setDisplay({cellFacing:'front',cellFacingCache:cache});assert.equal(value.triangles.length,12);
  const report=value.setDisplay({cellFacing:'all',cellFacingCache:{bad:true}});
  assert.equal(report.facingApplied,false);assert.equal(report.facingDiagnostic,null);assert.equal(report.facingCounts,null);
  assert.deepEqual(value.visibility.activeCells,[0,1,2,3,4,5,6,7]);assert.equal(value.triangles.length,48);
  assert.ok(value.visibility.vertices.every(Boolean));assert.ok(value.visibility.edges.every(Boolean));
});

test('actual viewer unsupported, forged and generalized caches retain manual filters with diagnosis',()=>{
  for(const kind of ['missing','forged','hash','generalized']){
    const {model,cache}=fixture();let useCache=cache;
    if(kind==='missing')useCache=undefined;
    if(kind==='forged')cache.cells[0].normalizedPlane.offset=.8;
    if(kind==='hash')cache.sourceFingerprint=OTHER_HASH;
    if(kind==='generalized')model.interpretation='generalized-complex';
    const before=JSON.stringify(model),value=viewer(model),report=value.setDisplay({cellFacing:'front',cellFacingCache:useCache,hiddenCells:[0]});
    assert.equal(report.facingApplied,false);assert.equal(report.facingCounts,null);assert.match(report.facingDiagnostic,/Cell facing unavailable:/);
    assert.deepEqual(value.visibility.activeCells,[1,2,3,4,5,6,7]);assert.equal(JSON.stringify(model),before);
  }
});

test('actual viewer visibility key follows effective cells instead of irrelevant manual hiding changes',()=>{
  const {model}=fixture(),value=viewer(model);value.setDisplay({isolatedCell:7,hiddenCells:[0]});
  const triangles=value.triangles;value.setDisplay({isolatedCell:7,hiddenCells:[1]});assert.equal(value.triangles,triangles);
  assert.deepEqual(value.visibility.activeCells,[7]);assert.equal(value.visibility.vertices.filter(Boolean).length,8);
  assert.throws(()=>value.setDisplay({hiddenCells:[999]}),/outside/);
});
