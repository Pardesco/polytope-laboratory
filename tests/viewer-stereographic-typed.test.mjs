import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {runStereographicWorkerJob,stereographicWorkerTransferables} from '../ui/stereographic-worker-geometry.mjs';
import {packedPrimitiveInstances} from '../ui/viewer-stereographic-typed.mjs';
import {resolveExplosion,explosionGeometry} from '../ui/explosion.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve)),HASH='c'.repeat(64);
function source(){return {id:'typed-literal',fingerprint:HASH,dimension:4,embeddingDimension:4,interpretation:'generalized-complex',vertices:[[1,0,0,0],[-1,0,0,0],[0,1,0,0],[0,-1,0,0],[0,0,1,0],[0,0,-1,0],[0,0,0,1],[0,0,0,-1]],edges:[[0,2],[2,4],[4,0]],faces:[[0,2,4]],cells:[],metadata:{offColors:{faces:[{encoding:'byte',values:[200,100,50,128]}]}}};}
class HeldWorker{
  constructor(){this.listeners=new Map();this.jobs=[];}
  addEventListener(t,f){this.listeners.set(t,f);}removeEventListener(t){this.listeners.delete(t);}terminate(){this.terminated=true;}
  postMessage(job,buffers){this.jobs.push(structuredClone(job,{transfer:buffers}));}
  reply(transform=x=>x){const result=transform(runStereographicWorkerJob(this.jobs.shift())),delivered=structuredClone(result,{transfer:stereographicWorkerTransferables(result)});this.listeners.get('message')?.({data:delivered});return delivered;}
}
function viewer(model=source()){
  const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.setModel(model);v.cameraProjection='orthographic';v.orthographicHalfHeight=2;v.camera=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);v.orthographicCamera=v.camera;v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);v.camera.position.set(0,0,5);v.camera.lookAt(0,0,0);v.camera.updateMatrixWorld();v.controls={target:new THREE.Vector3(),update(){}};v.renderer={domElement:{getBoundingClientRect:()=>({width:400,height:400})},render(){}};
  const worker=new HeldWorker();v.worker=worker;v.stereographicWorkerFactory=()=>worker;v.stereographicWorkerClock={now:()=>0,setTimer:()=>1,clearTimer(){}};v.statuses=[];v.onDisplay=s=>v.statuses.push(s);v.timings=[];v.onStereographicTiming=t=>v.timings.push(t);return v;
}
async function publish(v,view={projection:'stereographic',vertices:true}){v.setDisplay(view);v.worker.reply();await tick();assert.ok(v.stereographicGeometry?.packed);return v.stereographicGeometry.packed;}
const snapshot=p=>Object.fromEntries(['positions','segments','triangles','normals'].map(k=>[k,p[k].slice()]));
function compare(p,before){for(const k of Object.keys(before))assert.deepEqual(p[k],before[k]);}

test('actual worker publication binds geometry directly and preserves analytic float32 normal bits',async()=>{
  const v=viewer(),modelBefore=JSON.stringify(v.model),p=await publish(v),publication=v.stereographicWorker.published.publication;
  for(const [geometry,attribute,key] of [[v.surfaceGeometry,'position','triangles'],[v.surfaceGeometry,'normal','normals'],[v.edgeGeometry,'position','segments'],[v.pointGeometry,'position','positions']]){assert.strictEqual(geometry.getAttribute(attribute).array,p[key]);assert.strictEqual(p[key],publication.geometry[key]);}
  assert.equal(Array.isArray(v.renderTriangles),false);assert.equal(v.renderTriangles.length,p.counts.patches);assert.equal(v.renderTriangles[0].sourceInstance,p.triangleInstanceIds[0]);assert.strictEqual(v.lines.userData.sourceEdgeIds,p.edgeIds);assert.strictEqual(v.points.userData.sourceVertexIds,p.vertexIds);assert.deepEqual([...v.pointGeometry.getIndex().array],Array.from(p.vertexVisible).flatMap((visible,i)=>visible?[i]:[]));assert.equal(v.pointGeometry.getIndex().count,7);assert.ok(p.vertexVisible[6]===0,'pole vertex remains masked without sentinel mutation');assert.equal(JSON.stringify(v.model),modelBefore);
  const normalBits=new Uint32Array(p.normals.buffer,p.normals.byteOffset,p.normals.length);assert.deepEqual(new Uint32Array(v.surfaceGeometry.getAttribute('normal').array.buffer),normalBits);assert.ok(v.timings.some(t=>t.stage==='typed-publication'));assert.ok(v.timings.some(t=>t.stage==='viewer-packed-display'));v.clear();
});
test('100k packed patches publish without invoking any triangle/arc object traversal',async()=>{
  const v=viewer(),view={projection:'stereographic',vertices:true,edgeStyle:'line'};v.observationCloud=()=>{throw Error('automatic bounds expanded the cloud');};v.setDisplay(view);
  v.worker.reply(result=>{const g=result.geometry,n=100000,triangle=g.triangles.slice(0,9),normal=g.normals.slice(0,9);g.triangles=new Float32Array(n*9);g.normals=new Float32Array(n*9);for(let i=0;i<n;i++){g.triangles.set(triangle,i*9);g.normals.set(normal,i*9);}g.faceIds=new Uint32Array(n);g.cellIds=new Int32Array(n).fill(-1);g.triangleIds=new Uint32Array(n);g.triangleInstanceIds=new Uint32Array(n);return result;});await tick();
  const p=v.stereographicGeometry.packed;assert.equal(p.counts.patches,100000);assert.equal(v.surfaceGeometry.getAttribute('position').count,300000);assert.strictEqual(v.surfaceGeometry.getAttribute('position').array,p.triangles);assert.equal(v.renderTriangles.length,100000);assert.equal(Object.keys(v.renderTriangles).length,4);assert.equal(v.edgeCylinders,null);assert.deepEqual(v.observerBounds.center,v.stereographicGeometry.bounds.center);assert.ok(Number.isFinite(v.surfaceGeometry.boundingSphere.radius));assert.equal(v.surfaceGeometry.getAttribute('color').array.length,1200000);v.clear();
});
test('packed source RGBA and cell coloring use owner maps and reuse colors when owner layout is unchanged',async()=>{
  const v=viewer(),p=await publish(v,{projection:'stereographic',surfaceOpacity:1,surfaceColors:'source'}),colors=v.surfaceGeometry.getAttribute('color'),expected=new THREE.Color().setRGB(200/255,100/255,50/255,THREE.SRGBColorSpace);
  assert.ok(Math.abs(colors.array[0]-expected.r)<1e-7);assert.ok(Math.abs(colors.array[1]-expected.g)<1e-7);assert.ok(Math.abs(colors.array[2]-expected.b)<1e-7);assert.ok(Math.abs(colors.array[3]-128/255)<1e-7);assert.equal(v.surface.material.transparent,true);assert.equal(v.surface.material.depthWrite,false);
  const original=colors.array.slice(),before=snapshot(p);await publish(v,{projection:'stereographic',surfaceOpacity:1,surfaceColors:'source',angles:[1,0,0,0,0,0]});assert.strictEqual(v.surfaceGeometry.getAttribute('color'),colors);assert.deepEqual(colors.array,original);compare(p,before);v.clear();
});
test('surface hit indices resolve packed source faces/cells without constructing sampled triangle points',async()=>{
  const model=source();model.cells=[[0],[0]];const v=viewer(model);await publish(v,{projection:'stereographic',pickKind:'face'});const g=v.stereographicGeometry,p=g.packed;
  assert.equal(g.pickingTriangles[0].points,undefined);assert.deepEqual(g.pickingTriangles[0],{face:0,cell:undefined,sourceTriangle:0,sourceInstance:0});const center=new THREE.Vector3(...g.triangles[0].points[0]).add(new THREE.Vector3(...g.triangles[0].points[1])).add(new THREE.Vector3(...g.triangles[0].points[2])).divideScalar(3).project(v.camera);
  const x=(center.x+1)*200,y=(1-center.y)*200;assert.equal(v.pickAt(x,y).picked.id,0);v.view={projection:'stereographic',pickKind:'cell'};await publish(v,v.view);assert.equal(v.pickAt(x,y).picked.kind,'cell');assert.ok([0,1].includes(v.pickAt(x,y).picked.id));assert.equal(v.surfaceGeometry.getAttribute('position').array.length,p.triangles.length);v.clear();
});
test('point and curved-edge picking/highlights use the published packed pose while desired angles advance',async()=>{
  const v=viewer(),view={projection:'stereographic',vertices:true,pickKind:'vertex'},p=await publish(v,view);v.select([0]);assert.deepEqual([...v.highlightGeometry.getAttribute('position').array],[...p.positions.subarray(0,3)]);assert.equal(v.pickAt(300,200).picked.id,0);
  const before=snapshot(p);v.setDisplay({...view,angles:[90,0,0,0,0,0]});assert.equal(v.pickAt(300,200).picked.id,0);v.select([6]);assert.ok(v.highlightGeometry.getAttribute('position').array[0]>1e20);compare(p,before);v.worker.reply();await tick();assert.equal(v.pickAt(200,100).picked.id,0);assert.equal(v.publishedPickState.packedDisplay,v.stereographicGeometry.packed);v.clear();
});
test('returning to ordinary/perspective/conforming fallback never writes into previously borrowed arrays',async()=>{
  for(const mode of ['orthographic','perspective','fallback']){const v=viewer(),p=await publish(v),before=snapshot(p);if(mode==='fallback'){v.stereographicWorker.destroy();v.stereographicWorker=null;v.stereographicWorkerUnavailable='fixture sync fallback';v.setDisplay({projection:'stereographic',vertices:true});}else v.setDisplay({projection:mode,vertices:true});compare(p,before);assert.notStrictEqual(v.surfaceGeometry.getAttribute('position').array,p.triangles);assert.notStrictEqual(v.edgeGeometry.getAttribute('position').array,p.segments);assert.notStrictEqual(v.pointGeometry.getAttribute('position').array,p.positions);
    if(mode==='fallback'){const next=v.stereographicGeometry.packed;assert.ok(next);assert.notStrictEqual(next,p);assert.deepEqual([...v.pointGeometry.getIndex().array],[0,1,2,3,4,5,7]);assert.strictEqual(v.surfaceGeometry.getAttribute('position').array,next.triangles);}
    else{assert.equal(v.pointGeometry.getIndex(),null);assert.equal(v.stereographicGeometry?.packed,undefined);}v.clear();}
});
test('optional timing callback failures cannot invalidate a qualified display or capture',async()=>{
  const v=viewer();v.onStereographicTiming=()=>{throw Error('diagnostic consumer failed');};await publish(v);const promise=v.prepareCapture();v.worker.reply();await tick();assert.equal((await promise).complete,true);assert.equal(v.stereographicWorker.published.publication.phase,'capture');v.clear();
});
test('packed primitive traversal keeps native repeated IDs, counts collapse and refuses over-cap styles',()=>{
  const p={vertexIds:new Uint32Array([4,4,8]),vertexVisible:new Uint8Array([1,1,0]),positions:new Float32Array([0,0,0,1,0,0,9,9,9]),edgeIds:new Uint32Array([7,7,8]),segments:new Float32Array([0,0,0,1,0,0,1,0,0,2,0,0,0,0,0,0,0,0])};
  const line=packedPrimitiveInstances(p);assert.deepEqual(line.edges,[]);assert.deepEqual(line.vertices,[]);const styles=packedPrimitiveInstances(p,{spheres:true,cylinders:true});assert.deepEqual(styles.vertices.map(v=>v.vertex),[4,4]);assert.deepEqual(styles.edges.map(e=>e.edge),[7,7]);assert.equal(styles.collapsedEdges,1);const capped=packedPrimitiveInstances(p,{spheres:true,cylinders:true,limits:{spheres:1,cylinders:1}});assert.equal(capped.sphereSupported,false);assert.equal(capped.cylinderSupported,false);assert.deepEqual(capped.edges,[]);assert.equal(capped.diagnostics.length,2);
});
function tesseract(){const vertices=Array.from({length:16},(_,v)=>Array.from({length:4},(_,a)=>v>>a&1?1:-1)),edges=[],faces=[],cells=[];for(let v=0;v<16;v++)for(let a=0;a<4;a++)if(!(v>>a&1))edges.push([v,v|1<<a]);for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)for(let v=0;v<16;v++)if(!(v>>a&1)&&!(v>>b&1))faces.push([v,v|1<<a,v|1<<a|1<<b,v|1<<b]);for(let a=0;a<4;a++)for(const sign of [-1,1])cells.push(faces.flatMap((f,id)=>f.every(v=>vertices[v][a]===sign)?[id]:[]));return {id:'literal-tesseract',fingerprint:HASH,dimension:4,embeddingDimension:4,interpretation:'convex-polytope',vertices,edges,faces,cells,metadata:{offColors:{cells:[{encoding:'unit',values:[1,0,0,.25]},null,null,null,null,null,null,null]}}};}
test('exploded repeated cell instances retain native owners, sphere/rod mappings and original normalization',async()=>{
  const model=tesseract(),v=viewer(model),before=JSON.stringify(model),result=v.setExplosion(explosionGeometry(resolveExplosion(model,{direction:'radial'}),.2));assert.equal(result.applied,true,result.diagnostic);const p=await publish(v,{projection:'stereographic',cellShrink:.6,vertices:true,vertexStyle:'sphere',edgeStyle:'cylinder',surfaceColors:'cell'});
  assert.ok(new Set(p.vertexIds).size<p.vertexIds.length);assert.deepEqual([...v.vertexSpheres.userData.sourceVertexIds],Array.from(p.vertexIds).filter((_,i)=>p.vertexVisible[i]));assert.ok(v.edgeCylinders.userData.sourceEdgeIds.every(id=>model.edges[id]));for(let i=0;i<p.faceIds.length;i++)assert.ok(model.cells[p.cellIds[i]].includes(p.faceIds[i]));assert.deepEqual(v.renderTriangles[0].cell,p.cellIds[0]);const color=v.surfaceGeometry.getAttribute('color').array;assert.deepEqual([...color.subarray(0,3)],Array.from(new Float32Array(new THREE.Color().setHSL((p.cellIds[0]*.173+.58)%1,.32,.6).toArray())));assert.equal(JSON.stringify(model),before);v.clear();
});
