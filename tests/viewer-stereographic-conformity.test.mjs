import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {runStereographicWorkerJob,stereographicWorkerTransferables} from '../ui/stereographic-worker-geometry.mjs';
import {stereographicTriangle} from '../ui/stereographic.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve)),HASH='a'.repeat(64);
const corners=[[-2,-1,.4,0],[3,-1,.4,0],[3,2,.4,0],[-2,2,.4,0]];
function source(points=corners){
  const vertices=points.flatMap(p=>[p.slice(),p.map(x=>x===0?0:-x)]);
  for(let axis=0;axis<4;axis++)for(const sign of [1,-1])vertices.push(Array.from({length:4},(_,i)=>i===axis?4*sign:0));
  return {id:'literal-conformity-quad',fingerprint:HASH,name:'Literal same-face spherical quad',dimension:4,embeddingDimension:4,
    interpretation:'generalized-complex',vertices,edges:[[0,2],[2,4],[4,6],[0,6]],faces:[[0,2,4,6]],cells:[],
    numeric:{mode:'float64-approximate',certified:false},metadata:{coordinateUnits:'mm',notes:'Retain literal source attributes',
      retained:{array:[7,.125],label:'Source-only'},offColors:{faces:[{encoding:'unit',values:[.35,.65,.85,1]}],cells:[]}}};
}
class HeldWorker{
  constructor(){this.listeners=new Map();this.jobs=[];}
  addEventListener(type,fn){this.listeners.set(type,fn);}removeEventListener(type){this.listeners.delete(type);}
  postMessage(job,buffers){this.jobs.push(structuredClone(job,{transfer:buffers}));}
  reply(){const job=this.jobs.shift();assert.ok(job,'A real production geometry job must be pending.');const r=runStereographicWorkerJob(job);assert.equal(r.type,'geometry-result',r.message);this.listeners.get('message')?.({data:structuredClone(r,{transfer:stereographicWorkerTransferables(r)})});return r;}
  terminate(){this.terminated=true;}
}
function viewer({worker=true,model=source()}={}){
  const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.setModel(model);
  v.cameraProjection='orthographic';v.orthographicHalfHeight=2;v.camera=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);v.orthographicCamera=v.camera;
  v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);v.camera.position.set(0,0,8);v.camera.lookAt(0,0,0);v.camera.updateMatrixWorld();
  v.controls={target:new THREE.Vector3(),update(){}};v.renderer={domElement:{getBoundingClientRect:()=>({width:400,height:400})},render(){}};
  v.worker=worker?new HeldWorker():null;v.stereographicWorkerFactory=()=>v.worker;v.stereographicWorkerClock={now:()=>0,setTimer:()=>1,clearTimer(){}};
  v.statuses=[];v.onDisplay=s=>v.statuses.push(s);return v;
}
const view=opacity=>({projection:'stereographic',cameraProjection:'orthographic',angles:Array(6).fill(0),faces:true,edges:false,vertices:false,
  cellShrink:1,surfaceColors:'source',surfaceOpacity:opacity,pickKind:'face'});
async function workerFine(v,settings=view(1)){
  const pending=v.setDisplay(settings);assert.equal(pending.stereographicPending,true);
  const input=v.worker.jobs[0].geometry;assert.ok(input.triangleCornerIds instanceof Uint32Array,'Mounted Viewer must actually opt into shared-corner topology.');
  assert.deepEqual([...input.triangleSourceVertexIds],[0,2,4,0,4,6]);assert.deepEqual([...input.triangleCornerIds],[0,1,2,0,2,3]);
  v.worker.reply();await tick();const captured=v.prepareCapture();assert.equal(v.worker.jobs[0].phase,'capture');v.worker.reply();await tick();assert.equal((await captured).complete,true);
  const p=v.stereographicGeometry.packed;assert.equal(p.complete,true);assert.equal(p.achievedTolerance,.004);return p;
}
const key=p=>p.map(x=>x===0?0:x).join(',');
const edgeKey=(a,b)=>a<b?JSON.stringify([a,b]):JSON.stringify([b,a]);
// The fixture's W=0 projection is exactly the positive-Z unit sphere.
// Intersect its radial ray with literal source plane Z=.4 to classify ONLY
// perimeter edges. All remaining single-sided edges reveal cracks/T-junctions.
function perimeter(a,b){
  const raw=p=>{assert.ok(p[2]>0);return [.4*p[0]/p[2],.4*p[1]/p[2]];},p=raw(a),q=raw(b),epsilon=2e-5;
  return [[0,-2],[0,3],[1,-1],[1,2]].some(([axis,value])=>Math.abs(p[axis]-value)<epsilon&&Math.abs(q[axis]-value)<epsilon);
}
function inspectConformity(p){
  const edges=new Map(),seam=[new Map(),new Map()],normalByPoint=new Map();
  for(let patch=0;patch<p.faceIds.length;patch++){
    assert.equal(p.faceIds[patch],0);assert.equal(p.cellIds[patch],-1);assert.ok([0,1].includes(p.triangleInstanceIds[patch]));
    const points=Array.from({length:3},(_,j)=>Array.from(p.triangles.subarray(patch*9+j*3,patch*9+j*3+3)));
    assert.equal(new Set(points.map(key)).size,3,'No collapsed emitted triangle may conceal conformity.');
    for(let j=0;j<3;j++){
      const a=points[j],b=points[(j+1)%3],ka=key(a),kb=key(b),ek=edgeKey(ka,kb),n=Array.from(p.normals.subarray(patch*9+j*3,patch*9+j*3+3));
      const previous=normalByPoint.get(ka);if(previous)assert.deepEqual(n,previous,'Same-face analytic normal Float32 bits must match at reused points.');else normalByPoint.set(ka,n);
      assert.ok(Math.abs(Math.hypot(...n)-1)<2e-7);assert.ok(Math.hypot(...n.map((x,k)=>x-a[k]))<2e-7,'Normals must follow the analytic unit S2, not triangle planes.');
      let e=edges.get(ek);if(!e){e={a,b,uses:[]};edges.set(ek,e);}e.uses.push({patch,forward:ka<kb});
      // Literal a->c line in raw XY: y = .6*x + .2.
      const x=.4*a[0]/a[2],y=.4*a[1]/a[2];if(Math.abs(y-.6*x-.2)<2e-5)seam[p.triangleInstanceIds[patch]].set(ka,n);
    }
  }
  let boundary=0,interior=0;
  for(const e of edges.values()){
    assert.ok(e.uses.length<=2,'Same-face mesh must not overlap with duplicate leaf edges.');
    if(e.uses.length===1){assert.ok(perimeter(e.a,e.b),'Interior leaf edge has no exact matching neighbor: crack or T-junction.');boundary++;}
    else{assert.notEqual(e.uses[0].forward,e.uses[1].forward,'Neighboring leaves must traverse the shared edge in opposite directions.');interior++;}
  }
  assert.ok(boundary>10&&interior>100,'Both true perimeter and many internal adaptive leaf edges must be exercised.');
  assert.ok(seam[0].size>10&&seam[1].size>10);assert.deepEqual([...seam[0].keys()].sort(),[...seam[1].keys()].sort(),'Original source diagonal must contain identical exact packed endpoints on both source triangles.');
  for(const [k,n] of seam[0])assert.deepEqual(n,seam[1].get(k));
  return {boundary,interior,seamSamples:seam[0].size};
}
function checkColors(v,p,opacity){
  const c=new THREE.Color().setRGB(.35,.65,.85,THREE.SRGBColorSpace),expected=Array.from(new Float32Array([...c.toArray(),1])),colors=v.surfaceGeometry.getAttribute('color').array;
  assert.equal(colors.length,p.faceIds.length*12);for(let i=0;i<colors.length;i+=4)assert.deepEqual(Array.from(colors.subarray(i,i+4)),expected);
  assert.equal(v.surface.material.flatShading,false);assert.equal(v.surface.material.opacity,opacity);assert.equal(v.surface.material.transparent,opacity<1);assert.equal(v.surface.material.depthWrite,opacity===1);
}
test('mounted Viewer opts into conformity and publishes independently paired shared edges and analytic normals',async()=>{
  const model=source(),before=structuredClone(model),v=viewer({model});try{
    const p=await workerFine(v);assert.deepEqual(v.center,[0,0,0,0]);assert.equal(v.radius,4);const stats=inspectConformity(p);assert.ok(stats.seamSamples>=30);
    assert.strictEqual(v.surfaceGeometry.getAttribute('position').array,p.triangles);assert.strictEqual(v.surfaceGeometry.getAttribute('normal').array,p.normals);checkColors(v,p,1);
    assert.deepEqual(model,before);assert.strictEqual(v.publishedPickState.packedDisplay,p);assert.equal(v.stereographicWorker.published.publication.phase,'capture');
  }finally{v.clear();}
});
test('unavailable-worker synchronous fallback uses the SAME conforming fine packed geometry rather than legacy independent patches',async()=>{
  const a=viewer(),model=source(),before=structuredClone(model),b=viewer({worker:false,model});try{
    const p=await workerFine(a),status=b.setDisplay(view(1));assert.match(status.stereographicDiagnostic,/worker unavailable.*synchronous/i);assert.equal(b.stereographicWorker,null);
    const q=b.stereographicGeometry.packed;assert.ok(q);assert.equal(q.complete,true);inspectConformity(q);checkColors(b,q,1);
    for(const field of ['triangles','normals','faceIds','cellIds','triangleIds','triangleInstanceIds'])assert.deepEqual(q[field],p[field]);
    assert.equal((await b.prepareCapture()).complete,true);assert.deepEqual(model,before);
  }finally{a.clear();b.clear();}
});
test('opaque and translucent actual Viewer materials retain smooth normal/color ownership; ordinary perspective remains flat',async()=>{
  for(const worker of [true,false]){const model=source(),before=structuredClone(model),v=viewer({worker,model});try{
    const p=worker?await workerFine(v,view(.45)):(v.setDisplay(view(.45)),v.stereographicGeometry.packed);inspectConformity(p);checkColors(v,p,.45);
    v.setDisplay({...view(.45),projection:'perspective'});assert.equal(v.surface.material.flatShading,true);assert.equal(v.stereographicGeometry,null);assert.equal(v.surface.material.opacity,.45);assert.deepEqual(model,before);
  }finally{v.clear();}}
});
test('actual synchronous pole-clipped conforming surface remains readable and refuses complete capture',async()=>{
  const poleCorners=[[-.3,-.3,.02,.5],[.3,-.3,.02,.5],[.3,.3,.02,.5],[-.3,.3,.02,.5]],model=source(poleCorners),before=structuredClone(model),v=viewer({worker:false,model});try{
    const status=v.setDisplay(view(1));assert.match(status.stereographicDiagnostic,/pole|unresolved/i);assert.ok(v.renderTriangles.length>0);
    assert.equal(v.stereographicGeometry.complete,false);assert.ok(v.stereographicGeometry.clippedTriangles>0||v.stereographicGeometry.unresolvedTriangles>0);
    await assert.rejects(v.prepareCapture(),/complete stereographic geometry|unresolved|undefined/i);assert.deepEqual(model,before);assert.equal(v.surface.material.flatShading,false);
  }finally{v.clear();}
});
test('independent leaf-edge oracle detects the original complete-mesh defect, so a smooth material alone cannot pass',()=>{
  const pieces=[[corners[0],corners[1],corners[2]],[corners[0],corners[2],corners[3]]].map(points=>stereographicTriangle(points,{tolerance:.004,maxDepth:8}));assert.ok(pieces.every(p=>!p.exhausted&&!p.clippedTriangles));
  const triangles=Float32Array.from(pieces.flatMap(p=>p.triangles.flat(2))),normals=triangles.slice();
  // Unit hemisphere coordinates ARE its independent analytic normals.
  const owner=Uint32Array.from(pieces.flatMap((p,i)=>Array(p.triangles.length).fill(i))),p={triangles,normals,faceIds:new Uint32Array(owner.length),cellIds:new Int32Array(owner.length).fill(-1),triangleInstanceIds:owner};
  assert.throws(()=>inspectConformity(p),/matching neighbor|source diagonal/);
});
