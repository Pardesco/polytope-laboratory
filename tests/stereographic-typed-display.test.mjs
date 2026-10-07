import test from 'node:test';
import assert from 'node:assert/strict';
import {createStereographicTypedDisplay,sameTypedDisplayOwners,sameTypedDisplayLayout,typedDisplayBounds} from '../ui/stereographic-typed-display.mjs';
import {validateStereographicInput,decodeStereographicOutput} from '../ui/stereographic-worker-protocol.mjs';

// Hand-authored two presentation copies of one source triangular face, with
// distinct cell owners. One edge has two retained fragments. No tessellator.
function fixture(){
  const model={id:'literal',fingerprint:'a'.repeat(64),vertices:[[0,0,0,0],[1,0,0,0],[0,1,0,0]],edges:[[0,1]],faces:[[0,1,2]],cells:[[0],[0]]};
  const input={version:1,sourceCounts:{vertices:3,edges:1,faces:1,cells:2,triangles:1},positions:new Float64Array([0,0,0,0,1,0,0,0,0,1,0,0,10,0,0,0,11,0,0,0,10,1,0,0]),vertexIds:new Uint32Array([0,1,2,0,1,2]),vertexFaces:new Int32Array(6),vertexCells:new Int32Array([0,0,0,1,1,1]),vertexVisible:new Uint8Array([1,1,1,1,1,1]),edges:new Uint32Array([0,1,3,4,0,1]),edgeIds:new Uint32Array(3),edgeFaces:new Int32Array(3),edgeCells:new Int32Array([0,1,0]),edgeVisible:new Uint8Array([1,1,0]),trianglePositions:new Float64Array([0,0,0,0,1,0,0,0,0,1,0,0,10,0,0,0,11,0,0,0,10,1,0,0,0,0,0,0,1,0,0,0,0,1,0,0]),faceIds:new Uint32Array(3),cellIds:new Int32Array([0,1,0]),triangleIds:new Uint32Array(3),triangleVisible:new Uint8Array([1,1,0])};
  const geometry={version:1,positions:new Float32Array([0,0,0,1,0,0,0,1,0,10,0,0,11,0,0,10,1,0]),vertexIds:input.vertexIds.slice(),vertexFaces:input.vertexFaces.slice(),vertexCells:input.vertexCells.slice(),vertexVisible:input.vertexVisible.slice(),segments:new Float32Array([0,0,0,.5,0,0,.5,0,0,1,0,0,10,0,0,11,0,0]),edgeIds:new Uint32Array(3),edgeFaces:new Int32Array(3),edgeCells:new Int32Array([0,0,1]),edgeInstanceIds:new Uint32Array([0,0,1]),edgeResolution:new Uint8Array([1,1,0]),triangles:new Float32Array([0,0,0,1,0,0,0,1,0,10,0,0,11,0,0,10,1,0]),normals:new Float32Array([0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1]),faceIds:new Uint32Array(2),cellIds:new Int32Array([0,1]),triangleIds:new Uint32Array(2),triangleInstanceIds:new Uint32Array([0,1]),triangleResolution:new Uint8Array([1,1,0]),diagnostics:[]};
  const sourceKey=JSON.stringify([model.id,model.fingerprint]),frameKey='{"angles":[0,0,0,0,0,0]}',view={projection:'stereographic',angles:[0,0,0,0,0,0],hiddenCells:[],nested:{kept:0}};
  const snapshot={model,sourceKey,frameKey,generation:4,view};
  const publication={model,source:{modelId:model.id,fingerprint:model.fingerprint},jobId:7,token:9,generation:4,sourceKey,frameKey,phase:'interaction',intermediate:false,complete:true,exactPose:true,achievedTolerance:.01,quality:{phase:'interaction',tolerance:.01,criterion:'adaptive-sampled-world-error',wholePrimitiveBound:false,pixelBound:'orthographic-criterion-conversion',budgetSatisfied:true},geometry};
  return {model,input,geometry,publication,snapshot,isCurrent:()=>true};
}
const display=f=>createStereographicTypedDisplay(f.publication,f);
function remove(f,kind,status){const keys=kind==='edge'?['segments','edgeIds','edgeFaces','edgeCells','edgeInstanceIds']:['triangles','normals','faceIds','cellIds','triangleIds','triangleInstanceIds'];for(const k of keys)f.geometry[k]=new f.geometry[k].constructor(0);f.geometry[kind==='edge'?'edgeResolution':'triangleResolution']=new Uint8Array([status,status,0]);}

test('literal fixture also passes the authoritative production decoder',()=>{const f=fixture();assert.doesNotThrow(()=>decodeStereographicOutput(f.geometry,validateStereographicInput(f.input)));});
test('geometry arrays/buffers are borrowed exactly, never detached or mutated; metadata is owned',()=>{
  const f=fixture(),before=structuredClone({model:f.model,input:f.input,geometry:f.geometry}),d=display(f);for(const key of Object.keys(f.geometry).filter(k=>ArrayBuffer.isView(f.geometry[k])))assert.strictEqual(d[key],f.geometry[key]);assert.deepEqual(f.model,before.model);assert.deepEqual(f.input,before.input);assert.deepEqual(f.geometry,before.geometry);assert.ok(Object.isFrozen(d));assert.ok(Object.isFrozen(d.view.nested));assert.equal(Object.isFrozen(f.model),false);assert.equal(Object.isFrozen(f.snapshot.view),false);
  f.snapshot.view.angles[0]=88;f.publication.quality.tolerance=.03;f.geometry.diagnostics.push('later');assert.equal(d.view.angles[0],0);assert.equal(d.quality.tolerance,.01);assert.deepEqual(d.diagnostics,[]);assert.equal(d.triangles.byteLength,72);
});
test('lazy records distinguish fragment index, input instance, source IDs and repeated cell owners',()=>{
  const d=display(fixture());assert.deepEqual(d.edgeAt(0),{edge:0,sourceEdge:0,face:0,cell:0,a:[0,0,0],b:[.5,0,0]});assert.equal(d.edgeAt(1).edge,0);assert.equal(d.edgeAt(2).edge,1);assert.equal(d.edgeAt(2).cell,1);assert.deepEqual(d.patchOwnerAt(1),{face:0,cell:1,sourceTriangle:0,sourceInstance:1});assert.deepEqual(d.patchAt(1).points,[[10,0,0],[11,0,0],[10,1,0]]);assert.deepEqual(d.patchAt(1).normals,[[0,0,-1],[0,0,-1],[0,0,-1]]);assert.notStrictEqual(d.patchAt(0),d.patchAt(0));assert.ok(Object.isFrozen(d.patchAt(0).points[0]));
});
test('float32 bits including fractional rounding and signed zero are preserved',()=>{
  const f=fixture();f.geometry.triangles[0]=1/3;f.geometry.triangles[1]=-0;f.geometry.normals[0]=Math.SQRT1_2;const d=display(f),p=d.patchAt(0);assert.equal(p.points[0][0],Math.fround(1/3));assert.ok(Object.is(p.points[0][1],-0));assert.equal(p.normals[0][0],Math.fround(Math.SQRT1_2));assert.deepEqual(new Uint32Array(d.triangles.buffer),new Uint32Array(f.geometry.triangles.buffer));
});
test('explicit borrowing semantics permit owner writes; accessor records remain detached',()=>{
  const f=fixture(),d=display(f),p=d.patchAt(0);f.geometry.triangles[0]=2;assert.equal(d.triangles[0],2);assert.equal(d.patchAt(0).points[0][0],2);assert.equal(p.points[0][0],0);f.geometry.faceIds=new Uint32Array([99]);assert.equal(d.patchOwnerAt(0).face,0);
});
test('finite packed bounds include retained arcs/patches and exclude hidden vertex slots',()=>{
  const f=fixture();f.geometry.positions[0]=100;f.geometry.vertexVisible[0]=0;const b=typedDisplayBounds(display(f));assert.deepEqual(b.min,[0,0,0]);assert.deepEqual(b.max,[11,1,0]);assert.deepEqual(b.center,[5.5,.5,0]);assert.equal(b.radius,Math.hypot(5.5,.5));assert.ok(Object.isFrozen(b.max));
});
test('fully pole-clipped and masked inputs produce zero outputs with null finite bounds',()=>{
  const f=fixture();remove(f,'edge',2);remove(f,'patch',2);f.geometry.vertexVisible.fill(0);f.geometry.diagnostics=['All visible primitives lie outside the pole cutoff.'];const d=display(f);assert.equal(d.complete,true);assert.equal(d.counts.patches,0);assert.equal(d.resolution.edges.clipped,2);assert.deepEqual(Array.from(d.edgeResolution),[2,2,0]);assert.equal(typedDisplayBounds(d),null);
});
test('zero visible geometry needs no fabricated clipping diagnostic',()=>{
  const f=fixture();remove(f,'edge',0);remove(f,'patch',0);f.input.edgeVisible.fill(0);f.input.triangleVisible.fill(0);f.input.vertexVisible.fill(0);f.geometry.vertexVisible.fill(0);const d=display(f);assert.equal(d.complete,true);assert.deepEqual(d.diagnostics,[]);assert.equal(typedDisplayBounds(d),null);
});
test('optional owner slots remain undefined for existing source color fallback',()=>{
  const f=fixture();f.input.edgeFaces.fill(-1);f.input.edgeCells.fill(-1);f.geometry.edgeFaces.fill(-1);f.geometry.edgeCells.fill(-1);f.input.cellIds.fill(-1);f.geometry.cellIds.fill(-1);const d=display(f);assert.equal(d.edgeAt(0).face,undefined);assert.equal(d.edgeAt(0).cell,undefined);assert.equal(d.patchOwnerAt(0).cell,undefined);
});
test('large packed publications retain constant record shape without coordinate slice/copy',()=>{
  const f=fixture(),n=10000;f.geometry.triangles=new Float32Array(n*9);f.geometry.normals=new Float32Array(n*9);f.geometry.faceIds=new Uint32Array(n);f.geometry.cellIds=new Int32Array(n);f.geometry.triangleIds=new Uint32Array(n);f.geometry.triangleInstanceIds=new Uint32Array(n);f.geometry.triangleResolution[1]=2;f.geometry.diagnostics=['Second source instance was pole clipped.'];
  const original=Float32Array.prototype.slice;let d;try{Float32Array.prototype.slice=()=>{throw Error('Unexpected geometry copy');};d=display(f);}finally{Float32Array.prototype.slice=original;}assert.equal(d.counts.patches,n);assert.strictEqual(d.triangles,f.geometry.triangles);assert.equal(Object.keys(d).length,Object.keys(display(fixture())).length);assert.equal(d.renderTriangles,undefined);assert.deepEqual(d.patchAt(n-1).points,[[0,0,0],[0,0,0],[0,0,0]]);
});
test('diagnosed retained partial fragments stay partial and cannot masquerade as capture',()=>{
  const f=fixture();f.geometry.edgeResolution[0]=3;f.geometry.triangleResolution[1]=3;f.geometry.diagnostics=['Subdivision cap: retained edge and patch fragments are incomplete.'];f.publication.complete=false;f.publication.intermediate=true;const d=display(f);assert.equal(d.resolution.edges.unresolved,1);assert.equal(d.resolution.patches.unresolved,1);assert.equal(d.edgeAt(0).sourceEdge,0);assert.equal(d.complete,false);f.publication.phase='capture';f.publication.quality={...f.publication.quality,phase:'capture',tolerance:.004};f.publication.achievedTolerance=.004;f.publication.intermediate=false;assert.throws(()=>display(f),/Capture requires complete/);
});
test('owner/layout comparison detects ordered owner maps while ignoring coordinates and pose',()=>{
  const a=display(fixture()),f=fixture();f.geometry.triangles[0]=99;f.snapshot.frameKey=f.publication.frameKey='other-pose';const b=display(f);assert.equal(sameTypedDisplayOwners(a,b),true);assert.equal(sameTypedDisplayLayout(a,b),true);f.geometry.edgeResolution[0]=3;f.geometry.diagnostics=['Incomplete'];f.publication.complete=false;const partial=display(f);assert.equal(sameTypedDisplayOwners(a,partial),true);assert.equal(sameTypedDisplayLayout(a,partial),false);const c=fixture();c.geometry.cellIds.reverse();assert.throws(()=>display(c),/ownership/);const changed=fixture();changed.input.cellIds[0]=changed.geometry.cellIds[0]=1;assert.equal(sameTypedDisplayOwners(a,display(changed)),false);assert.equal(sameTypedDisplayOwners(null,a),false);
});
test('source/model/pose/generation/guard changes reject stale display envelopes',()=>{
  for(const edit of [f=>f.snapshot.model=structuredClone(f.model),f=>f.model.fingerprint='b'.repeat(64),f=>f.model.id='changed',f=>f.snapshot.sourceKey='other',f=>f.snapshot.frameKey='other',f=>f.snapshot.generation++,f=>f.isCurrent=()=>false]){const f=fixture();edit(f);assert.throws(()=>display(f),{name:'AbortError'});}const f=fixture();let n=0;f.isCurrent=()=>++n===1;assert.throws(()=>display(f),{name:'AbortError'});
});
test('unknown versions, invalid resource limits, wrong typed formats and ownership refuse boundedly',()=>{
  const edits=[f=>f.geometry.version=2,f=>f.input.version=2,f=>f.geometry.normals=new Float32Array(0),f=>f.geometry.triangles=new Float64Array(18),f=>f.geometry.triangles=new Float32Array(17),f=>f.geometry.positions[0]=Infinity,f=>f.geometry.normals[0]=NaN,f=>f.geometry.segments[0]=1e10,f=>f.geometry.edgeInstanceIds[0]=3,f=>f.geometry.edgeCells[0]=1,f=>f.geometry.triangleIds[0]=1,f=>f.geometry.vertexIds[0]=1,f=>f.geometry.vertexVisible[0]=2,f=>f.geometry.triangleResolution[0]=4,f=>f.geometry.edgeResolution[2]=1,f=>f.geometry.diagnostics=[' '],f=>f.geometry.diagnostics=['x'.repeat(513)],f=>f.geometry.positions=new Float32Array(new SharedArrayBuffer(72)),f=>f.geometry.positions=new class extends Float32Array{}(18),f=>f.publication.exactPose=false,f=>f.publication.achievedTolerance=.02,f=>f.publication.quality.wholePrimitiveBound=true];for(const edit of edits){const f=fixture();edit(f);assert.throws(()=>display(f),/Stereographic typed display/);}for(const limits of [{bytes:64},{patches:1},{vertices:5},{bytes:33554433},{unknown:1}]){const f=fixture();f.limits=limits;assert.throws(()=>display(f),/cap|bound|Limits/);}
});
test('accessor indices are bounded and nonfinite post-publication buffer mutation is diagnosed',()=>{
  const f=fixture(),d=display(f);for(const i of [-1,.5,2,NaN])assert.throws(()=>d.patchAt(i),/index/);assert.throws(()=>d.edgeAt(3),/index/);assert.throws(()=>d.patchOwnerAt(2),/index/);f.geometry.segments[0]=NaN;assert.throws(()=>typedDisplayBounds(d),/mutated/);
});
test('pose metadata refuses cycles/accessors/deep records without changing source data',()=>{
  const f=fixture();f.snapshot.view.self=f.snapshot.view;assert.throws(()=>display(f),/acyclic/);const g=fixture();Object.defineProperty(g.geometry,'triangles',{get(){throw Error('getter ran');}});assert.throws(()=>display(g),/plain data/);const h=fixture();let row=h.snapshot.view;for(let i=0;i<35;i++){row.child={};row=row.child;}assert.throws(()=>display(h),/bound/);
});
test('detached empty buffers cannot masquerade as legitimate zero output',()=>{
  const f=fixture();remove(f,'edge',2);f.geometry.diagnostics=['Pole clipped edges'];structuredClone(f.geometry.segments.buffer,{transfer:[f.geometry.segments.buffer]});assert.throws(()=>display(f),/detached/);
});
