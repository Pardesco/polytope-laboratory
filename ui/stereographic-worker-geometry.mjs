/** Worker-ready S3 display geometry. This module does not change Viewer state.
 * Prepared Float64 coordinates have their SO(4) frame and plane rotations
 * applied once. IDs describe the immutable source; instance IDs describe the
 * presentation snapshot. Tolerance qualifies the existing sampled criterion,
 * never the maximum error over an entire curve or patch.
 */
import {createDenseStereographicPacketComputer} from './stereographic-dense-packet.mjs';
import {rotate} from './projection.js';
import {applyDisplayFrame,resolveDisplayFrame} from './display-frame.mjs';
import {stereographicPoint} from './stereographic.mjs';
import {stereoDisplayGeometry,STEREO_VIEW_LIMITS} from './viewer-stereographic.mjs';
import {validateStereographicInput,decodeStereographicOutput,STEREOGRAPHIC_WORKER_LIMITS} from './stereographic-worker-protocol.mjs';
import {createHybridStereographicOutputArena} from './stereographic-hybrid-output-arena.mjs';

const computeDenseStereographicPacket=createDenseStereographicPacketComputer(computeStereographicPrimitiveGeometry);
const fail=message=>{throw Error(`Stereographic worker geometry: ${message}`);};
function record(value,label){
  if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).some(k=>typeof k!=='string')||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>d.get||d.set))fail(`${label} must be a plain data record.`);
  return value;
}
function array(value,label,length){
  if(!Array.isArray(value)||value.length!==length||Object.keys(value).length!==length||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>d.get||d.set))fail(`${label} must be a dense array of the required length.`);
  return value;
}
function point(value){array(value,'4D point',4);if(value.some(n=>!Number.isFinite(n)||Math.abs(n)>STEREOGRAPHIC_WORKER_LIMITS.coordinate))fail('Coordinates must be finite, bounded and four-dimensional.');return value;}
function count(value,label,maximum){if(!Number.isSafeInteger(value)||value<0||value>maximum)fail(`${label} exceeds its resource bound.`);return value;}
function mapping(values,length,Type,defaultValue,label){
  if(values===undefined)return Type.from({length},(_,i)=>defaultValue(i));
  if(!Array.isArray(values)&&!(values instanceof Type))fail(`${label} must be an array or matching typed array.`);
  if(Array.isArray(values))array(values,label,length);
  if(values.length!==length)fail(`${label} has a mismatched length.`);
  const out=new Type(length);for(let i=0;i<length;i++){const n=values[i];if(!Number.isSafeInteger(n)||n<(Type===Int32Array?-1:0)||n>0xffffffff||(Type===Int32Array&&n>0x7fffffff))fail(`${label} must contain bounded integer IDs.`);out[i]=n;}return out;
}
function mask(values,length,label){
  if(values===undefined)return new Uint8Array(length).fill(1);
  if((!Array.isArray(values)&&!(values instanceof Uint8Array))||values.length!==length)fail(`${label} has a mismatched length.`);
  if(Array.isArray(values))array(values,label,length);
  return Uint8Array.from(values,n=>{if(![true,false,0,1].includes(n))fail(`${label} must contain boolean masks.`);return Number(n);});
}

/** Main-thread preparation. Centers/radii, shrink and explosion translations
 * belong to the caller; neither this function nor the worker refits them.
 * Virtual triangle points are transformed just like indexed source points.
 */
export function prepareStereographicWorkerGeometry(options){
  record(options,'preparation');const {model,normalized,edges,triangles,visibility,matrix=null,angles=[]}=options;
  record(model,'source model');record(visibility,'visibility');
  if(model.dimension!==4||(model.embeddingDimension??4)!==4)fail('An intrinsic 4D source is required.');
  const sourceCounts={};for(const [key,limit] of [['vertices','sourceVertices'],['edges','sourceEdges'],['faces','sourceFaces'],['cells','sourceCells']]){
    if(!Array.isArray(model[key]))fail(`Source ${key} must be an array.`);sourceCounts[key]=count(model[key].length,key,STEREOGRAPHIC_WORKER_LIMITS[limit]);
  }
  if(!Array.isArray(normalized)||!Array.isArray(edges)||!Array.isArray(triangles))fail('Presentation coordinates, edges and triangles must be arrays.');
  const nv=count(normalized.length,'vertices',STEREOGRAPHIC_WORKER_LIMITS.vertices),ne=count(edges.length,'edges',STEREOGRAPHIC_WORKER_LIMITS.edges),nt=count(triangles.length,'triangles',STEREOGRAPHIC_WORKER_LIMITS.triangles);
  // Preflight the byte cap before allocating coordinates or transforming them.
  if(nv*45+ne*21+nt*133>STEREOGRAPHIC_WORKER_LIMITS.bytes)fail('Input snapshot exceeds its byte cap.');
  array(normalized,'normalized coordinates',nv);array(edges,'edges',ne);array(triangles,'triangles',nt);
  if(!Array.isArray(angles)||angles.length>6)fail('Plane rotations require at most six finite angles.');
  array(angles,'angles',angles.length);if(angles.some(n=>!Number.isFinite(n)))fail('Plane rotations must be finite.');
  if(matrix!==null){array(matrix,'SO(4) matrix',4);matrix.forEach(point);const resolved=resolveDisplayFrame(model,{matrix,sourceFingerprint:model.fingerprint});if(!resolved.applied)fail(resolved.diagnostic);}
  const transform=p=>rotate(applyDisplayFrame(point(p),matrix),angles);
  const positions=new Float64Array(nv*4);normalized.forEach((p,i)=>positions.set(transform(p),i*4));
  const edgeIndices=new Uint32Array(ne*2);edges.forEach((e,i)=>{array(e,'edge endpoints',2);e.forEach((id,k)=>{count(id,'edge endpoint',nv-1);edgeIndices[i*2+k]=id;});});
  const faceIds=new Uint32Array(nt),cellIds=new Int32Array(nt),trianglePositions=new Float64Array(nt*12),triangleVisible=new Uint8Array(nt);
  const faceMask=mask(visibility.faces,sourceCounts.faces,'face visibility');
  triangles.forEach((triangle,i)=>{
    record(triangle,'triangle');const face=count(triangle.face,'source face',sourceCounts.faces-1),cell=triangle.cell??-1;
    if(!Number.isSafeInteger(cell)||cell< -1||cell>=sourceCounts.cells)fail('Triangle source cell is invalid.');
    faceIds[i]=face;cellIds[i]=cell;triangleVisible[i]=faceMask[face];
    if(triangle.vertices!==undefined){array(triangle.vertices,'triangle vertices',3);triangle.vertices.forEach((id,k)=>{count(id,'triangle endpoint',nv-1);trianglePositions.set(positions.subarray(id*4,id*4+4),i*12+k*4);});}
    else {array(triangle.normalized,'virtual triangle',3);triangle.normalized.forEach((p,k)=>trianglePositions.set(transform(p),i*12+k*4));}
  });
  if(options.conformingSurfaces!==undefined&&typeof options.conformingSurfaces!=='boolean')fail('Conforming surface preparation must be explicitly boolean.');
  // Presentation lineage, never coordinate equality, defines shared corners.
  // Indexed instances use their exact presentation vertex; independently
  // shrunk surfaces use (source cell, source vertex), preserving cell domains.
  const triangleCornerIds=new Uint32Array(nt*3).fill(0xffffffff),triangleSourceVertexIds=new Uint32Array(nt*3).fill(0xffffffff),cornerKeys=new Map();
  const sourceVertexIds=mapping(options.sourceVertexIds,nv,Uint32Array,i=>i,'vertex IDs');
  const corner=(key)=>{if(!cornerKeys.has(key))cornerKeys.set(key,cornerKeys.size);return cornerKeys.get(key);};
  triangles.forEach((triangle,i)=>{
    let ids,keys;
    if(triangle.vertices!==undefined){ids=triangle.vertices.map(id=>sourceVertexIds[id]);keys=triangle.vertices.map(id=>JSON.stringify(['indexed',cellIds[i],id]));}
    else if(triangle.sourceVertices!==undefined&&triangle.sourceVertices!==null){
      ids=array(triangle.sourceVertices,'source surface vertices',3);keys=ids.map(id=>JSON.stringify(['cell',cellIds[i],id]));
      ids.forEach(id=>count(id,'source surface vertex',sourceCounts.vertices-1));
    }else if(triangle.presentationCornerIds!==undefined){
      const local=array(triangle.presentationCornerIds,'declared virtual presentation corners',3);
      local.forEach(id=>count(id,'declared virtual presentation corner',0xffffffff));
      ids=[0xffffffff,0xffffffff,0xffffffff];keys=local.map(id=>JSON.stringify(['virtual',cellIds[i],faceIds[i],id]));
    }
    if(ids)for(let k=0;k<3;k++){triangleCornerIds[i*3+k]=corner(keys[k]);triangleSourceVertexIds[i*3+k]=ids[k];}
  });
  const triangleIds=mapping(options.sourceTriangleIds,nt,Uint32Array,i=>i,'triangle IDs');
  let triangleCount=0;for(const id of triangleIds)triangleCount=Math.max(triangleCount,id+1);
  sourceCounts.triangles=count(options.sourceTriangleCount??triangleCount,'source triangle count',STEREOGRAPHIC_WORKER_LIMITS.triangles);
  return validateStereographicInput({version:1,sourceCounts,positions,
    vertexIds:sourceVertexIds,vertexFaces:mapping(options.sourceVertexFaces,nv,Int32Array,()=>-1,'vertex face owners'),vertexCells:mapping(options.sourceVertexCells,nv,Int32Array,()=>-1,'vertex cell owners'),vertexVisible:mask(visibility.vertices,nv,'vertex visibility'),
    edges:edgeIndices,edgeIds:mapping(options.sourceEdgeIds,ne,Uint32Array,i=>i,'edge IDs'),edgeFaces:mapping(options.sourceEdgeFaces,ne,Int32Array,()=>-1,'edge face owners'),edgeCells:mapping(options.sourceEdgeCells,ne,Int32Array,()=>-1,'edge cell owners'),edgeVisible:mask(visibility.edges,ne,'edge visibility'),
    trianglePositions,faceIds,cellIds,triangleIds,triangleVisible,...(options.conformingSurfaces===true?{triangleCornerIds,triangleSourceVertexIds}:{})});
}

function settings(value,conforming=false){
  record(value,'settings');const tolerance=value.tolerance??.004,maxDepth=value.maxDepth??8,poleEpsilon=value.poleEpsilon??.02;
  if(!Number.isFinite(tolerance)||tolerance<1e-8||tolerance>.032||!Number.isInteger(maxDepth)||maxDepth<0||maxDepth>8||poleEpsilon!==.02)fail('Invalid sampled tolerance, subdivision depth or frozen pole cutoff.');
  const overrides=value.limits??{};record(overrides,'geometry limits');const limits={...STEREO_VIEW_LIMITS,...(conforming?{inputTriangles:8192}:{})};
  for(const [key,n] of Object.entries(overrides)){if(!(key in limits)||!Number.isInteger(n)||n<1||n>limits[key])fail('Geometry limits may only lower existing integer caps.');limits[key]=n;}
  return {tolerance,maxDepth,poleEpsilon,limits};
}
function geometricNormals(points){
  const [a,b,c]=points,u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal),unit=normal.map(x=>length?x/length:0);return [unit,unit,unit];
}
const four=(array,offset)=>Array.from(array.subarray(offset,offset+4));

/** Compute in a worker (or in isolated tests). Each primitive uses the existing
 * unchanged display helper with remaining global budgets. Small local inputs
 * avoid repeatedly transforming the entire source and reveal exact per-input
 * resolution, including retained portions of an exhausted primitive.
 */
function computeLegacyStereographicWorkerGeometry(value,options={}){
  const input=validateStereographicInput(value),o=settings(options,Boolean(input.triangleCornerIds)),notes=new Set(),nv=input.vertexIds.length,ne=input.edgeIds.length,nt=input.faceIds.length;
  const positions=new Float32Array(nv*3),vertexVisible=input.vertexVisible.slice(),edgeResolution=new Uint8Array(ne),triangleResolution=new Uint8Array(nt);
  let undefinedVertices=0,clippedSegments=0,clippedTriangles=0,unresolvedEdges=0,unresolvedTriangles=0,omittedEdges=0,omittedTriangles=0,visitedEdges=0,visitedTriangles=0;
  for(let i=0;i<nv;i++){
    const point4=four(input.positions,i*4),projected=stereographicPoint(point4,o);positions.set(projected.point,i*3);
    if(projected.clipped){vertexVisible[i]=0;if(input.vertexVisible[i]){notes.add(projected.reason);if(point4.every(n=>n===0))undefinedVertices++;}}
  }
  const arena=createHybridStereographicOutputArena(input,{segments:o.limits.segments,triangles:o.limits.triangles});
  for(let i=0;i<ne;i++){
    if(!input.edgeVisible[i])continue;
    if(visitedEdges>=o.limits.inputEdges||arena.segmentCount>=o.limits.segments){edgeResolution[i]=4;omittedEdges++;notes.add('Stereographic edge geometry resource limit reached; remaining source arcs were omitted.');continue;}
    visitedEdges++;
    const points=[four(input.positions,input.edges[i*2]*4),four(input.positions,input.edges[i*2+1]*4)];
    const result=stereoDisplayGeometry(points,[[0,1]],[],{edges:[true],faces:[]},null,[],{...o,limits:{...o.limits,segments:arena.remainingSegments}});
    result.diagnostics.forEach(d=>notes.add(d));clippedSegments+=result.clippedSegments;
    for(const segment of result.edges)arena.appendSegmentCoordinates(i,segment.a[0],segment.a[1],segment.a[2],segment.b[0],segment.b[1],segment.b[2]);
    if(result.unresolvedEdges){edgeResolution[i]=3;unresolvedEdges++;}
    else if(result.edges.length)edgeResolution[i]=1;
    else if(result.clippedSegments)edgeResolution[i]=2;
    else {edgeResolution[i]=4;omittedEdges++;notes.add('A source arc has no defined spherical image and was omitted.');}
  }
  for(let i=0;i<nt;i++){
    if(!input.triangleVisible[i])continue;
    if(visitedTriangles>=o.limits.inputTriangles||arena.triangleCount>=o.limits.triangles){triangleResolution[i]=4;omittedTriangles++;notes.add('Stereographic surface geometry resource limit reached; remaining source patches were omitted.');continue;}
    visitedTriangles++;
    const points=[0,1,2].map(k=>four(input.trianglePositions,i*12+k*4));
    const result=stereoDisplayGeometry([],[],[{normalized:points,face:0}],{edges:[],faces:[true]},null,[],{...o,limits:{...o.limits,triangles:arena.remainingTriangles}});
    result.diagnostics.forEach(d=>notes.add(d));clippedTriangles+=result.clippedTriangles;
    for(const triangle of result.triangles){
      const p=triangle.points,n=triangle.normals??geometricNormals(p);
      arena.appendTriangleCoordinates(i,p[0][0],p[0][1],p[0][2],p[1][0],p[1][1],p[1][2],p[2][0],p[2][1],p[2][2],n[0][0],n[0][1],n[0][2],n[1][0],n[1][1],n[1][2],n[2][0],n[2][1],n[2][2]);
    }
    if(result.unresolvedTriangles){triangleResolution[i]=3;unresolvedTriangles++;}
    else if(result.triangles.length)triangleResolution[i]=1;
    else if(result.clippedTriangles)triangleResolution[i]=2;
    else {triangleResolution[i]=4;omittedTriangles++;notes.add('A source patch has no defined spherical image and was omitted.');}
  }
  // Prefix views retain bounded capacity locally. The authoritative decoder
  // below validates provenance and owns exact-size buffers before transfer.
  const {segments,edgeIds,edgeFaces,edgeCells,edgeInstanceIds,triangles,normals,faceIds,cellIds,triangleIds,triangleInstanceIds}=arena.finish();
  const geometry={version:1,positions,vertexIds:input.vertexIds.slice(),vertexFaces:input.vertexFaces.slice(),vertexCells:input.vertexCells.slice(),vertexVisible,segments,edgeIds,edgeFaces,edgeCells,edgeInstanceIds,edgeResolution,triangles,normals,faceIds,cellIds,triangleIds,triangleInstanceIds,triangleResolution,diagnostics:[...notes]};
  // Validate the same bounded provenance contract as the coordinator before
  // advertising completion or returning transferable buffers.
  const decoded=decodeStereographicOutput(geometry,input);
  return {geometry:decoded,complete:!(undefinedVertices+unresolvedEdges+unresolvedTriangles+omittedEdges+omittedTriangles)&&!(input.triangleCornerIds&&clippedTriangles),exactPose:true,achievedTolerance:o.tolerance,unresolvedEdges,unresolvedTriangles,omittedEdges,omittedTriangles,clippedSegments,clippedTriangles};
}

/** Isolated0.21 candidate: registered topology uses one shared refiner/direct
 * sink. Legacy raw jobs retain their existing explicitly bounded contract.
 */
export function computeStereographicWorkerGeometry(value,options={}){
  const input=validateStereographicInput(value);
  if(input.triangleCornerIds){
    const {evidence,...result}=computeDenseStereographicPacket(input,options);
    return result;
  }
  return computeLegacyStereographicWorkerGeometry(input,options);
}
/** Private primitive seam for the direct sink; refuses any visible surface. */
export function computeStereographicPrimitiveGeometry(value,options={}){
  const input=validateStereographicInput(value);
  if(input.triangleVisible.some(Boolean))throw Error('Primitive-only computation requires every surface masked.');
  return computeLegacyStereographicWorkerGeometry(input,options);
}

/** Transport envelope; invalid envelopes throw, valid jobs return a bounded
 * error response on invalid geometry. Source models never enter the worker.
 */
export function runStereographicWorkerJob(job){
  record(job,'job');if(job.type!=='geometry-job'||job.version!==1)fail('Unknown job envelope.');
  for(const key of ['jobId','token','generation'])count(job[key],key,Number.MAX_SAFE_INTEGER);
  if(!job.jobId||!job.token||!['interaction','idle','capture'].includes(job.phase)||typeof job.sourceKey!=='string'||!job.sourceKey.length||job.sourceKey.length>4096||typeof job.frameKey!=='string'||!job.frameKey.length||job.frameKey.length>32768)fail('Invalid job ownership.');
  const envelope=Object.fromEntries(['jobId','token','generation','sourceKey','frameKey','phase'].map(key=>[key,job[key]]));
  try{
    record(job.quality,'quality');if(job.quality.phase!==job.phase||job.quality.criterion!=='adaptive-sampled-world-error'||job.quality.wholePrimitiveBound!==false||job.quality.tolerance>(job.phase==='interaction'?.032:.004))fail('Unsupported quality contract.');
    const result=computeStereographicWorkerGeometry(job.geometry,{tolerance:job.quality.tolerance,poleEpsilon:job.quality.poleEpsilon});
    return {type:'geometry-result',version:1,...envelope,...result};
  }catch(error){return {type:'geometry-error',version:1,...envelope,message:String(error?.message??error).slice(0,512)};}
}

export function stereographicWorkerTransferables(result){
  if(result.type!=='geometry-result')return [];
  return [...new Set(Object.values(result.geometry).filter(value=>ArrayBuffer.isView(value)).map(value=>value.buffer))];
}
