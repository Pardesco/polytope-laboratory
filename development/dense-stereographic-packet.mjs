/** DEVELOPMENT ONLY. Existing typed wire layout; no new worker/protocol fields.
 * Surface leaves pack directly, without rich raw/barycentric/path duplicates.
 */
import {emitDenseBudgetConformingPoleCut} from './dense-stereographic-budget.mjs';
import {computeStereographicWorkerGeometry} from '../ui/stereographic-worker-geometry.mjs';
import {validateStereographicInput,decodeStereographicOutput,STEREOGRAPHIC_WORKER_LIMITS} from '../ui/stereographic-worker-protocol.mjs';
import {createHybridStereographicOutputArena} from '../ui/stereographic-hybrid-output-arena.mjs';
const NONE=0xffffffff,qualified=new WeakMap();
const data=o=>o&&Object.getPrototypeOf(o)===Object.prototype&&Object.values(Object.getOwnPropertyDescriptors(o)).every(d=>'value' in d);
function settings(value){
  if(!data(value)||Object.keys(value).some(k=>!['tolerance','maxDepth','limits'].includes(k)))throw Error('Unknown dense packet option.');
  const tolerance=value.tolerance??.004,maxDepth=value.maxDepth??8;
  if(!Number.isFinite(tolerance)||tolerance<1e-8||tolerance>.032||!Number.isInteger(maxDepth)||maxDepth<0||maxDepth>8)throw Error('Invalid sampled tolerance/depth.');
  const limits={segments:60000,triangles:100000,inputTriangles:8192,inputEdges:30000,bytes:32*1024*1024};
  if(!data(value.limits??{}))throw Error('Dense limits require a data record.');
  for(const [key,n] of Object.entries(value.limits??{})){if(!(key in limits)||!Number.isInteger(n)||n<1||n>limits[key])throw Error('Limits may only lower existing caps.');limits[key]=n;}
  return {tolerance,maxDepth,limits};
}
export function denseStereographicSources(input){
  const sources=[],slots=[];let unsupported=0;
  for(let i=0;i<input.faceIds.length;i++)if(input.triangleVisible[i]){
    if(!input.triangleCornerIds||input.triangleCornerIds[i*3]===NONE){unsupported++;continue;}
    slots.push(i);sources.push({id:input.triangleIds[i],face:input.faceIds[i],cell:input.cellIds[i],topology:'registered-presentation',vertexIds:Array.from(input.triangleCornerIds.subarray(i*3,i*3+3)),points:[0,1,2].map(k=>Array.from(input.trianglePositions.subarray(i*12+k*4,i*12+k*4+4)))});
  }
  return {sources,slots,unsupported};
}
// Keep capture ownership closure in its own lexical scope. It must not retain
// the solve's arena/sink context and its unused typed capacity after decoding.
function ownerCheck(ownership){return ()=>{
  if(ownership.signal?.aborted||ownership.isCurrent?.()===false)throw Object.assign(Error('Dense packet canceled or ownership replaced; no packet published.'),{name:'AbortError'});
};}
export function computeDenseStereographicPacket(value,options={},ownership={}){
  const o=settings(options),check=ownerCheck(ownership);
  check();const input=validateStereographicInput(value,{bytes:o.limits.bytes});
  // Preserve original point/arc computation byte for byte. Mask only surfaces in
  // this private snapshot; source masks and every original resolution slot stay.
  const base=computeStereographicWorkerGeometry({...input,triangleVisible:new Uint8Array(input.faceIds.length)},{tolerance:o.tolerance,maxDepth:o.maxDepth,limits:{segments:o.limits.segments,triangles:o.limits.triangles,inputTriangles:Math.min(o.limits.inputTriangles,input.triangleCornerIds?8192:2000),inputEdges:o.limits.inputEdges}});
  check();const {sources,slots}=denseStereographicSources(input),notes=new Set(base.geometry.diagnostics),resolution=new Uint8Array(input.faceIds.length);
  let omittedTriangles=0,unresolvedTriangles=0,clippedTriangles=0,surface=null;
  // Arcs already belong to base's exact decoded buffers; no second edge arena.
  const arena=createHybridStereographicOutputArena(input,{segments:0,triangles:o.limits.triangles,bytes:o.limits.bytes});
  for(let i=0;i<input.faceIds.length;i++)if(input.triangleVisible[i]&&(!input.triangleCornerIds||input.triangleCornerIds[i*3]===NONE)){resolution[i]=4;omittedTriangles++;}
  if(omittedTriangles)notes.add('Explicit presentation topology is missing; unsupported surface instances were omitted.');
  if(sources.length>o.limits.inputTriangles||sources.length>o.limits.triangles){
    for(const slot of slots){resolution[slot]=4;omittedTriangles++;}
    notes.add('Complete initial surface mesh exceeds source/patch limits; no prefix truncation.');
  }else if(sources.length){
    surface=emitDenseBudgetConformingPoleCut(sources,{tolerance:o.tolerance,maxDepth:o.maxDepth,maxTriangles:o.limits.triangles,maxInputTriangles:o.limits.inputTriangles,maxVisits:1000000,maxCachedPoints:500000,maxRounds:64},{check,retained:(source,p,n)=>{
      const i=slots[source.instance];arena.appendTriangleCoordinates(i,p[0][0],p[0][1],p[0][2],p[1][0],p[1][1],p[1][2],p[2][0],p[2][1],p[2][2],n[0][0],n[0][1],n[0][2],n[1][0],n[1][1],n[1][2],n[2][0],n[2][1],n[2][2]);
    }});
    for(const row of surface.coverage){const i=slots[row.instance];if(row.unresolved>0){resolution[i]=3;unresolvedTriangles++;}else if(row.retained>0)resolution[i]=1;else if(row.clipped>0)resolution[i]=2;else{resolution[i]=4;omittedTriangles++;}}
    clippedTriangles=surface.counts.clippedLeaves;
    if(clippedTriangles)notes.add('Pole-excluded conforming surface area remains omitted; complete capture refused.');
    if(unresolvedTriangles)notes.add('Explicit unresolved sampled-quality/pole area remains; complete capture refused.');
    if(surface.stopReason)notes.add(`Last conforming mesh stopped at ${surface.stopReason}.`);
  }
  check();const output=arena.finish(),geometry={...base.geometry,triangles:output.triangles,normals:output.normals,faceIds:output.faceIds,cellIds:output.cellIds,triangleIds:output.triangleIds,triangleInstanceIds:output.triangleInstanceIds,triangleResolution:resolution,diagnostics:[...notes]};
  // Authoritative exact-size detached copies, including finite Float32 values
  // and specific visible input-instance ownership. Never transfer spare capacity.
  const decoded=decodeStereographicOutput(geometry,input,{bytes:o.limits.bytes});check();
  const packet={geometry:decoded,complete:base.complete&&!(unresolvedTriangles+omittedTriangles+clippedTriangles),exactPose:true,achievedTolerance:o.tolerance,unresolvedEdges:base.unresolvedEdges,omittedEdges:base.omittedEdges,unresolvedTriangles,omittedTriangles,clippedSegments:base.clippedSegments,clippedTriangles,
    evidence:{surface,outputBytes:Object.values(decoded).filter(ArrayBuffer.isView).reduce((s,a)=>s+a.byteLength,0),arenaCapacityBytes:arena.capacityBytes}};
  if(packet.evidence.outputBytes>STEREOGRAPHIC_WORKER_LIMITS.bytes)throw Error('Packet byte bound failed.');
  qualified.set(packet,{input,check,complete:packet.complete,bytes:o.limits.bytes});return packet;
}
export function assertDensePacketCapture(packet){
  const receipt=qualified.get(packet);
  if(!receipt||!receipt.complete||!packet.complete||packet.unresolvedEdges||packet.unresolvedTriangles||packet.omittedEdges||packet.omittedTriangles||packet.clippedTriangles)throw Error('Dense packet complete capture refused.');
  receipt.check();decodeStereographicOutput(packet.geometry,receipt.input,{bytes:receipt.bytes});
}
