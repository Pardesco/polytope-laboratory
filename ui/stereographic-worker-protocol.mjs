/** Isolated worker transport and publication ownership, not a renderer.
 * Input coordinates are normalized intrinsic 4D presentation instances. IDs
 * always refer to the unchanged native source. Quality measures the existing
 * sampled-error criterion; this protocol does not certify whole curves.
 */
export const STEREOGRAPHIC_WORKER_LIMITS=Object.freeze({bytes:32*1024*1024,vertices:100000,edges:100000,triangles:125000,segments:100000,patches:250000,sourceVertices:20000,sourceEdges:200000,sourceFaces:100000,sourceCells:20000,diagnostics:100,diagnosticLength:512,coordinate:1e9,timeoutMs:15000});
const fail=message=>{throw new Error(`Stereographic worker: ${message}`);};
const integer=(n,label,max)=>{if(!Number.isSafeInteger(n)||n<0||n>max)fail(`${label} exceeds its integer bound.`);return n;};
function record(value,label){if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail(`${label} must be a plain data record.`);const keys=Reflect.ownKeys(value);if(keys.length>64||keys.some(k=>typeof k!=='string')||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>d.get||d.set))fail(`${label} must be a bounded plain data record.`);return value;}
function limits(overrides={}){record(overrides,'limits');const result={...STEREOGRAPHIC_WORKER_LIMITS};for(const [key,value] of Object.entries(overrides)){if(!(key in result)||!Number.isFinite(value)||value<=0||value>result[key])fail('Limits may only lower known resource caps.');result[key]=value;}return Object.freeze(result);}
function text(value,label,max){if(typeof value!=='string'||!value.length||value.length>max)fail(`${label} is not a bounded string.`);return value;}
function diagnostics(value,cap){if(!Array.isArray(value)||value.length>cap.diagnostics||value.some(v=>typeof v!=='string'||v.length>cap.diagnosticLength||!v.trim().length))fail('Diagnostics must be nonempty bounded text.');return Object.freeze([...value]);}
function boundedJSON(value){let visits=0,chars=0;const seen=new Set();function copy(item,depth){if(++visits>4096||depth>12)fail('Quality metadata exceeds its bound.');if(item===null||typeof item==='boolean')return item;if(typeof item==='number'){if(!Number.isFinite(item))fail('Quality metadata must be finite.');return item;}if(typeof item==='string'){chars+=item.length;if(chars>65536)fail('Quality metadata exceeds its string bound.');return item;}if(typeof item!=='object'||seen.has(item))fail('Quality metadata must be finite JSON.');seen.add(item);let out;if(Array.isArray(item)){if(item.length>4096||Object.keys(item).length!==item.length||Object.values(Object.getOwnPropertyDescriptors(item)).some(d=>d.get||d.set))fail('Quality metadata arrays must be dense data.');out=item.map(x=>copy(x,depth+1));}else{record(item,'quality');out={};for(const [k,v] of Object.entries(item)){chars+=k.length;if(chars>65536)fail('Quality metadata exceeds its string bound.');Object.defineProperty(out,k,{value:copy(v,depth+1),enumerable:true});}}seen.delete(item);return Object.freeze(out);}return copy(value,0);}
function typed(value,Type,label,budget,cap){if(!(value instanceof Type)||Object.getPrototypeOf(value)!==Type.prototype||!(value.buffer instanceof ArrayBuffer)||value.buffer.resizable===true)fail(`${label} has an unsupported typed-buffer representation.`);budget.bytes+=value.byteLength;if(budget.bytes>cap.bytes)fail('Geometry exceeds its byte cap.');return value;}
const count=(value,stride,label,max)=>{if(value.length%stride)fail(`${label} has an invalid coordinate stride.`);return integer(value.length/stride,label,max);};
function floats(array,cap){for(const n of array)if(!Number.isFinite(n)||Math.abs(n)>cap.coordinate)fail('Coordinates must be finite and bounded.');}
function ids(array,length,maximum,label,{cell=false,mask=false}={}){if(array.length!==length)fail(`${label} has a mismatched length.`);for(const n of array)if(mask?n!==0&&n!==1:cell?n< -1||n>=maximum:n>=maximum)fail(`${label} contains an invalid source ID or mask.`);}
function sourceCounts(value,cap){record(value,'sourceCounts');return Object.freeze({vertices:integer(value.vertices,'source vertices',cap.sourceVertices),edges:integer(value.edges,'source edges',cap.sourceEdges),faces:integer(value.faces,'source faces',cap.sourceFaces),cells:integer(value.cells,'source cells',cap.sourceCells),triangles:integer(value.triangles,'source triangles',cap.triangles)});}
const inputTypes={positions:Float64Array,vertexIds:Uint32Array,vertexFaces:Int32Array,vertexCells:Int32Array,vertexVisible:Uint8Array,edges:Uint32Array,edgeIds:Uint32Array,edgeFaces:Int32Array,edgeCells:Int32Array,edgeVisible:Uint8Array,trianglePositions:Float64Array,faceIds:Uint32Array,cellIds:Int32Array,triangleIds:Uint32Array,triangleVisible:Uint8Array};
// Per-input primitive resolution: 0 masked, 1 rendered, 2 fully clipped by
// the projection algorithm, 3 unresolved, 4 deliberately omitted. Clipping
// must be diagnosed by the algorithm; transport validation is not its proof.
const outputTypes={positions:Float32Array,vertexIds:Uint32Array,vertexFaces:Int32Array,vertexCells:Int32Array,vertexVisible:Uint8Array,segments:Float32Array,edgeIds:Uint32Array,edgeFaces:Int32Array,edgeCells:Int32Array,edgeInstanceIds:Uint32Array,edgeResolution:Uint8Array,triangles:Float32Array,normals:Float32Array,faceIds:Uint32Array,cellIds:Int32Array,triangleIds:Uint32Array,triangleInstanceIds:Uint32Array,triangleResolution:Uint8Array};
const topologyTypes={triangleCornerIds:Uint32Array,triangleSourceVertexIds:Uint32Array};
function copiedGeometry(value,types,extra={}){const out={version:1,...extra};for(const key of Object.keys(types))out[key]=value[key].slice();if(types===inputTypes&&value.triangleCornerIds!==undefined)for(const key of Object.keys(topologyTypes))out[key]=value[key].slice();return out;}
/** Detached snapshot. Transfer only this owned copy, never caller buffers. */
export function validateStereographicInput(value,overrides={}){
  const cap=limits(overrides),budget={bytes:0};record(value,'input geometry');if(value.version!==1)fail('Unknown input geometry version.');const source=sourceCounts(value.sourceCounts,cap),arrays={};for(const [key,Type] of Object.entries(inputTypes))arrays[key]=typed(value[key],Type,key,budget,cap);
  const nv=count(arrays.positions,4,'input vertices',cap.vertices),ne=count(arrays.edges,2,'input edges',cap.edges),nt=count(arrays.trianglePositions,12,'input triangles',cap.triangles);floats(arrays.positions,cap);floats(arrays.trianglePositions,cap);
  ids(arrays.vertexIds,nv,source.vertices,'vertexIds');ids(arrays.vertexFaces,nv,source.faces,'vertexFaces',{cell:true});ids(arrays.vertexCells,nv,source.cells,'vertexCells',{cell:true});ids(arrays.vertexVisible,nv,2,'vertexVisible',{mask:true});for(const id of arrays.edges)if(id>=nv)fail('An edge refers to a missing presentation vertex.');
  ids(arrays.edgeIds,ne,source.edges,'edgeIds');ids(arrays.edgeFaces,ne,source.faces,'edgeFaces',{cell:true});ids(arrays.edgeCells,ne,source.cells,'edgeCells',{cell:true});ids(arrays.edgeVisible,ne,2,'edgeVisible',{mask:true});ids(arrays.faceIds,nt,source.faces,'faceIds');ids(arrays.cellIds,nt,source.cells,'cellIds',{cell:true});ids(arrays.triangleIds,nt,source.triangles,'triangleIds');ids(arrays.triangleVisible,nt,2,'triangleVisible',{mask:true});
  if(value.triangleCornerIds!==undefined||value.triangleSourceVertexIds!==undefined){
    for(const [key,Type] of Object.entries(topologyTypes))arrays[key]=typed(value[key],Type,key,budget,cap);
    if(arrays.triangleCornerIds.length!==nt*3||arrays.triangleSourceVertexIds.length!==nt*3)fail('Surface topology has a mismatched corner stride.');
    const corners=new Map(),NONE=0xffffffff;
    for(let i=0;i<nt;i++){
      const missing=arrays.triangleCornerIds[i*3]===NONE;
      for(let k=0;k<3;k++){
        const offset=i*3+k,id=arrays.triangleCornerIds[offset],sourceId=arrays.triangleSourceVertexIds[offset];
        if((id===NONE)!==missing||missing&&sourceId!==NONE)fail('Unsupported virtual topology must mark the entire triangle.');
        if(missing)continue;
        if(id>=cap.vertices+cap.triangles*3||sourceId!==NONE&&sourceId>=source.vertices)fail('Surface corner identity exceeds its source/resource bound.');
        if(k&&Array.from(arrays.triangleCornerIds.subarray(i*3,i*3+k)).includes(id))fail('Surface triangle must have distinct corner identities.');
        const p=arrays.trianglePositions.subarray(i*12+k*4,i*12+k*4+4),old=corners.get(id);
        if(old&&(old.sourceId!==sourceId||old.cell!==arrays.cellIds[i]||sourceId===NONE&&old.face!==arrays.faceIds[i]||!old.point.every((x,j)=>Object.is(x,p[j]))))fail('Shared surface corner has inconsistent source/domain/posed coordinates.');
        if(!old)corners.set(id,{sourceId,cell:arrays.cellIds[i],face:arrays.faceIds[i],point:Array.from(p)});
      }
    }
  }
  return copiedGeometry(arrays,inputTypes,{sourceCounts:source});
}
/** Output provenance must come from visible input instances, not merely an
 * in-range native ID. No missing/error primitives may masquerade as capture.
 */
export function decodeStereographicOutput(value,input,overrides={}){
  const cap=limits(overrides),budget={bytes:0};record(value,'output geometry');if(value.version!==1)fail('Unknown output geometry version.');const arrays={};for(const [key,Type] of Object.entries(outputTypes))arrays[key]=typed(value[key],Type,key,budget,cap);
  const nv=count(arrays.positions,3,'output vertices',cap.vertices),ns=count(arrays.segments,6,'output segments',cap.segments),nt=count(arrays.triangles,9,'output patches',cap.patches),source=input.sourceCounts;
  floats(arrays.positions,cap);floats(arrays.segments,cap);floats(arrays.triangles,cap);floats(arrays.normals,cap);if(arrays.normals.length!==arrays.triangles.length)fail('Patch normals have a mismatched length.');
  ids(arrays.vertexIds,nv,source.vertices,'vertexIds');ids(arrays.vertexFaces,nv,source.faces,'vertexFaces',{cell:true});ids(arrays.vertexCells,nv,source.cells,'vertexCells',{cell:true});ids(arrays.vertexVisible,nv,2,'vertexVisible',{mask:true});if(nv!==input.vertexIds.length)fail('Output must retain every input vertex ownership slot.');for(let i=0;i<nv;i++)if(arrays.vertexIds[i]!==input.vertexIds[i]||arrays.vertexFaces[i]!==input.vertexFaces[i]||arrays.vertexCells[i]!==input.vertexCells[i]||arrays.vertexVisible[i]>input.vertexVisible[i])fail('Output vertex ownership or visibility was forged.');
  ids(arrays.edgeIds,ns,source.edges,'edgeIds');ids(arrays.edgeFaces,ns,source.faces,'edgeFaces',{cell:true});ids(arrays.edgeCells,ns,source.cells,'edgeCells',{cell:true});ids(arrays.faceIds,nt,source.faces,'faceIds');ids(arrays.cellIds,nt,source.cells,'cellIds',{cell:true});ids(arrays.triangleIds,nt,source.triangles,'triangleIds');
  ids(arrays.edgeInstanceIds,ns,input.edgeIds.length,'edgeInstanceIds');ids(arrays.triangleInstanceIds,nt,input.faceIds.length,'triangleInstanceIds');
  for(let i=0;i<ns;i++){const j=arrays.edgeInstanceIds[i];if(!input.edgeVisible[j]||arrays.edgeIds[i]!==input.edgeIds[j]||arrays.edgeFaces[i]!==input.edgeFaces[j]||arrays.edgeCells[i]!==input.edgeCells[j])fail('Output edge picking ownership is absent, forged or masked.');}
  for(let i=0;i<nt;i++){const j=arrays.triangleInstanceIds[i];if(!input.triangleVisible[j]||arrays.faceIds[i]!==input.faceIds[j]||arrays.cellIds[i]!==input.cellIds[j]||arrays.triangleIds[i]!==input.triangleIds[j])fail('Output patch picking ownership is absent, forged or masked.');}
  const notes=diagnostics(value.diagnostics??[],cap),outputEdges=new Set(arrays.edgeInstanceIds),outputTriangles=new Set(arrays.triangleInstanceIds);
  for(const [status,mask,outputs] of [[arrays.edgeResolution,input.edgeVisible,outputEdges],[arrays.triangleResolution,input.triangleVisible,outputTriangles]]){if(status.length!==mask.length)fail('Primitive resolution slots do not match input.');for(let i=0;i<status.length;i++){if(status[i]>4||(!mask[i]&&status[i]!==0)||(mask[i]&&status[i]===0))fail('Primitive resolution or masking was forged.');if(status[i]===1&&!outputs.has(i))fail('Rendered primitive is missing its geometry.');if([0,2,4].includes(status[i])&&outputs.has(i))fail('Output geometry conflicts with primitive resolution.');if(status[i]===2&&!notes.length)fail('Clipped primitives require an algorithm diagnostic.');}}
  return copiedGeometry(arrays,outputTypes,{diagnostics:notes});
}
function identity(model){if(!model||typeof model!=='object')fail('A native source model identity is required.');const modelId=model.id??null,fingerprint=model.fingerprint;if(modelId!==null&&(typeof modelId!=='string'||modelId.length>512)||typeof fingerprint!=='string'||!/^[0-9a-f]{64}$/.test(fingerprint))fail('Source model requires its validated fingerprint and bounded ID.');return Object.freeze({modelId,fingerprint});}
function nativeOwnership(input,model,cap){
  for(const key of ['vertices','edges','faces','cells'])if(!Array.isArray(model[key])||model[key].length!==input.sourceCounts[key])fail(`Input ${key} count does not match the source model.`);
  const faces=new Map(),cells=new Map();let entries=0;
  function members(table,index,cache,max,label){if(cache.has(index))return cache.get(index);const row=table[index];if(!Array.isArray(row)||row.length>max)fail(`Native ${label} incidence is malformed.`);entries+=row.length;if(entries>cap.bytes/8)fail('Native ownership lookup exceeds its resource cap.');for(const id of row)integer(id,`native ${label} incidence`,max-1);const set=new Set(row);cache.set(index,set);return set;}
  const face=id=>members(model.faces,id,faces,input.sourceCounts.vertices,'face'),cell=id=>members(model.cells,id,cells,input.sourceCounts.faces,'cell');
  function role(vertex,faceId,cellId){if(faceId>=0&&!face(faceId).has(vertex))fail('Presentation vertex is not in its claimed native face.');if(cellId>=0){const f=cell(cellId);if(faceId>=0&&!f.has(faceId))fail('Presentation face is not in its claimed native cell.');if(faceId<0&&![...f].some(id=>face(id).has(vertex)))fail('Presentation vertex is not in its claimed native cell.');}}
  for(let i=0;i<input.vertexIds.length;i++)role(input.vertexIds[i],input.vertexFaces[i],input.vertexCells[i]);
  for(let i=0;i<input.edgeIds.length;i++){const a=input.vertexIds[input.edges[2*i]],b=input.vertexIds[input.edges[2*i+1]],edge=model.edges[input.edgeIds[i]];if(!Array.isArray(edge)||edge.length!==2||!(edge[0]===a&&edge[1]===b||edge[1]===a&&edge[0]===b))fail('Presentation edge does not match its native source endpoints.');role(a,input.edgeFaces[i],input.edgeCells[i]);role(b,input.edgeFaces[i],input.edgeCells[i]);}
  for(let i=0;i<input.faceIds.length;i++){
    if(input.cellIds[i]>=0&&!cell(input.cellIds[i]).has(input.faceIds[i]))fail('Presentation triangle face is not in its claimed native cell.');
    if(input.triangleSourceVertexIds)for(let k=0;k<3;k++){const vertex=input.triangleSourceVertexIds[i*3+k];if(vertex!==0xffffffff)role(vertex,input.faceIds[i],input.cellIds[i]);}
  }
}
function requestMetadata(value){record(value,'request');integer(value.token,'quality token',Number.MAX_SAFE_INTEGER);if(!value.token)fail('Quality token must be positive.');integer(value.generation,'source generation',Number.MAX_SAFE_INTEGER);text(value.sourceKey,'source key',4096);text(value.frameKey,'frame key',32768);if(!['interaction','idle','capture'].includes(value.phase))fail('Unsupported request phase.');const quality=boundedJSON(value.quality);if(!quality||quality.phase!==value.phase||!Number.isFinite(quality.tolerance)||quality.tolerance<1e-8||quality.tolerance>(value.phase==='interaction'?.032:.004)||!['orthographic-criterion-conversion','unavailable'].includes(quality.pixelBound)||quality.criterion!=='adaptive-sampled-world-error'||quality.wholePrimitiveBound!==false||![null,true,false].includes(quality.budgetSatisfied))fail('Unsupported sampled-error quality contract.');if(value.phase==='capture'&&quality.budgetSatisfied===false)fail('Capture cannot meet the requested sampled pixel criterion.');return Object.freeze({token:value.token,generation:value.generation,sourceKey:value.sourceKey,frameKey:value.frameKey,phase:value.phase,quality});}
const cancelled=message=>Object.assign(new Error(`Stereographic worker: ${message}`),{name:'AbortError'});
function publicationCopy(publication){return Object.freeze({...publication,geometry:copiedGeometry(publication.geometry,outputTypes,{diagnostics:publication.geometry.diagnostics})});}

/** Worker must support add/removeEventListener, postMessage, terminate.
 * Owner is {model,sourceKey,frameKey,generation}. Optional isCurrentRequest
 * consumes the ORIGINAL quality request, retaining quality object identity.
 * publish(publication,{signal,isCurrent}) may be asynchronous, but must check
 * isCurrent immediately before changing renderer buffers. Successful promise
 * resolution means publication completed, not just worker message arrival.
 * A superseded active task remains occupied until reply, so compute cannot
 * expand beyond one active job. Timeout/fatal transport failure terminates it.
 * Optional canPublishIntermediate(original,latest) qualifies a bounded
 * retired INTERACTION pose against the latest presentation family. It must
 * compare every presentation/camera field except permitted rotating angles.
 * Those publications carry original metadata and intermediate:true; their
 * superseded promises stay rejected. Diagnosed partial interaction geometry
 * may move the viewport, with complete:false and truthful per-input resolution
 * and counters. It is NEVER a complete capture or a full-source display claim.
 * Idle is latest-only; capture additionally requires complete geometry.
 */
export class StereographicWorkerCoordinator {
  constructor({worker,getOwner,publish,isCurrentRequest=()=>true,canPublishIntermediate=null,limits:overrides={},setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}={}){
    if(!worker||['postMessage','addEventListener','removeEventListener','terminate'].some(k=>typeof worker[k]!=='function')||[getOwner,publish,isCurrentRequest,setTimer,clearTimer].some(fn=>typeof fn!=='function')||canPublishIntermediate!==null&&typeof canPublishIntermediate!=='function')fail('Invalid worker coordinator dependencies.');
    this.worker=worker;this.getOwner=getOwner;this.publish=publish;this.isCurrentRequest=isCurrentRequest;this.canPublishIntermediate=canPublishIntermediate;this.cap=limits(overrides);this.setTimer=setTimer;this.clearTimer=clearTimer;this.serial=0;this.latest=0;this.latestJob=null;this.active=null;this.queued=null;this.published=null;this.destroyed=false;this.failure=null;
    this.message=e=>{void this.receive(e.data);};this.workerError=e=>this.fatal(new Error(`Stereographic worker transport failed: ${String(e.message??'unreadable worker message').slice(0,512)}`));worker.addEventListener('message',this.message);worker.addEventListener('error',this.workerError);worker.addEventListener('messageerror',this.workerError);
  }
  ownerMatches(job,{pose=true}={}){try{const owner=this.getOwner(),id=identity(owner.model);return owner.model===job.model&&id.modelId===job.source.modelId&&id.fingerprint===job.source.fingerprint&&owner.sourceKey===job.meta.sourceKey&&(!pose||owner.frameKey===job.meta.frameKey&&owner.generation===job.meta.generation);}catch{return false;}}
  current(job){try{return !this.destroyed&&!this.failure&&!job.settled&&job.id===this.latest&&this.ownerMatches(job)&&this.isCurrentRequest(job.original);}catch{return false;}}
  intermediateCurrent(job){
    try{const latest=this.latestJob;return Boolean(this.canPublishIntermediate)&&!this.destroyed&&!this.failure&&job===this.active&&job.settled&&job.meta.phase==='interaction'&&latest?.meta.phase==='interaction'&&this.current(latest)&&this.ownerMatches(job,{pose:false})&&job.meta.sourceKey===latest.meta.sourceKey&&job.id>(this.published?.jobId??0)&&this.canPublishIntermediate(job.original,latest.original)===true;}catch{return false;}
  }
  settle(job,error,publication){if(!job||job.settled)return;job.settled=true;if(error){job.abort.abort();job.reject(error);}else job.resolve(publicationCopy(publication));}
  request(original){
    let job;try{if(this.destroyed)fail('Coordinator was destroyed.');if(this.failure)throw this.failure;const meta=requestMetadata(original),source=identity(original.model);if(meta.sourceKey!==JSON.stringify([source.modelId,source.fingerprint]))fail('Source key does not match native model identity.');const input=validateStereographicInput(original.geometry,this.cap);nativeOwnership(input,original.model,this.cap);
      job={id:++this.serial,original,model:original.model,source,meta,input,abort:new AbortController(),settled:false};if(!this.ownerMatches(job)||!this.isCurrentRequest(original))throw cancelled('Request belongs to an obsolete source or pose.');
    }catch(error){return Promise.reject(error);}
    const promise=new Promise((resolve,reject)=>Object.assign(job,{resolve,reject}));this.latest=job.id;this.latestJob=job;this.settle(this.queued,cancelled('Queued pose was superseded.'));this.settle(this.active,cancelled('Active pose was superseded.'));this.queued=job;if(this.active?.publicationAbort&&!this.intermediateCurrent(this.active))this.active.publicationAbort.abort();this.pump();return promise;
  }
  capture(request){if(request?.phase!=='capture')return Promise.reject(new Error('Stereographic worker: Capture requires an explicit fine capture request.'));return this.request(request);}
  pump(){if(this.active||!this.queued||this.destroyed||this.failure)return;const job=this.queued;this.queued=null;this.active=job;if(!this.current(job)){this.settle(job,cancelled('Queued source or pose changed.'));this.active=null;return;}
    try{const geometry=copiedGeometry(job.input,inputTypes,{sourceCounts:job.input.sourceCounts}),message={type:'geometry-job',version:1,jobId:job.id,...job.meta,geometry};const transfer=Object.values(geometry).filter(value=>ArrayBuffer.isView(value)).map(value=>value.buffer);job.timer=this.setTimer(()=>this.fatal(new Error('Stereographic worker timed out.')),this.cap.timeoutMs);this.worker.postMessage(message,transfer);}catch(error){this.fatal(error);}
  }
  async receive(value){
    const job=this.active;if(!job||job.processing||!value)return;try{record(value,'worker response');}catch(error){this.fatal(error);return;}if(value.jobId!==job.id)return;job.processing=true;
    try{
      const intermediate=!this.current(job);
      if(intermediate&&!this.intermediateCurrent(job)){this.settle(job,cancelled('Late worker result belongs to an obsolete pose.'));return;}
      record(value,'worker response');if(value.version!==1||!['geometry-result','geometry-error'].includes(value.type)||['token','generation','sourceKey','frameKey','phase'].some(key=>value[key]!==job.meta[key]))fail('Worker response ownership does not match the active job.');
      if(value.type==='geometry-error')fail(text(value.message,'worker error',512));
      if(typeof value.complete!=='boolean'||value.exactPose!==true||!Number.isFinite(value.achievedTolerance)||value.achievedTolerance<0||value.achievedTolerance>job.meta.quality.tolerance)fail('Result pose or sampled-error tolerance is unqualified.');
      let missing=0;for(const key of ['unresolvedEdges','unresolvedTriangles','omittedEdges','omittedTriangles'])missing+=integer(value[key],key,this.cap.patches+this.cap.segments);if(value.complete&&missing)fail('Complete result reports missing primitives.');if(job.meta.phase==='capture'&&!value.complete)fail('Capture requires complete geometry.');
      const geometry=decodeStereographicOutput(value.geometry,job.input,this.cap);if(value.complete&&job.input.triangleCornerIds&&((value.clippedTriangles??0)>0||geometry.triangleResolution.includes(2)))fail('Complete conforming surface contains excluded pole leaves.');for(const [statuses,unresolved,omitted] of [[geometry.edgeResolution,value.unresolvedEdges,value.omittedEdges],[geometry.triangleResolution,value.unresolvedTriangles,value.omittedTriangles]]){if(statuses.reduce((n,s)=>n+(s===3),0)!==unresolved||statuses.reduce((n,s)=>n+(s===4),0)!==omitted)fail('Primitive resolution disagrees with completeness counters.');}if(!value.complete&&!geometry.diagnostics.length)fail('Partial geometry requires an explicit diagnostic.');
      const clippedSegments=integer(value.clippedSegments??0,'clipped segments',this.cap.segments*512),clippedTriangles=integer(value.clippedTriangles??0,'clipped triangles',this.cap.patches*65536);
      const publication=Object.freeze({jobId:job.id,...job.meta,model:job.model,source:job.source,complete:value.complete,exactPose:true,achievedTolerance:value.achievedTolerance,clippedSegments,clippedTriangles,intermediate,geometry});
      const isCurrent=()=>intermediate?this.intermediateCurrent(job):this.current(job);
      if(intermediate)job.publicationAbort=new AbortController();
      await this.publish(publicationCopy(publication),Object.freeze({signal:(job.publicationAbort??job.abort).signal,isCurrent}));
      if(!isCurrent()){this.settle(job,cancelled('Publication source or pose changed.'));return;}this.published=publication;if(!intermediate)this.settle(job,null,publication);
    }catch(error){this.settle(job,error);}finally{this.clearTimer(job.timer);if(this.active===job)this.active=null;this.pump();}
  }
  /** Source/picking ownership of the actually visible last publication. Pose
   * may have advanced while computing; never substitute pending picking IDs.
   */
  get pickingPublication(){return this.published&&this.ownerMatches({model:this.published.model,source:this.published.source,meta:this.published},{pose:false})?publicationCopy(this.published):null;}
  get pending(){return Object.freeze({active:this.active?.id??null,queued:this.queued?.id??null});}
  cancel(){this.latest=++this.serial;this.latestJob=null;this.active?.publicationAbort?.abort();this.settle(this.queued,cancelled('Cancelled.'));this.queued=null;this.settle(this.active,cancelled('Cancelled.'));}
  fatal(error){if(this.failure||this.destroyed)return;this.failure=error instanceof Error?error:new Error(String(error));this.settle(this.active,this.failure);this.settle(this.queued,this.failure);this.cancel();if(this.active)this.clearTimer(this.active.timer);this.active=null;this.worker.terminate();}
  destroy(){if(this.destroyed)return;this.cancel();this.destroyed=true;if(this.active)this.clearTimer(this.active.timer);this.active=null;this.published=null;this.worker.removeEventListener('message',this.message);this.worker.removeEventListener('error',this.workerError);this.worker.removeEventListener('messageerror',this.workerError);this.worker.terminate();}
}
