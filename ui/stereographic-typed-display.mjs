/** Lazy renderer views over ALREADY decoded/owned production publications.
 * Geometry buffers are borrowed: this helper never copies, transfers, detaches,
 * freezes or writes their elements. A frozen wrapper is not an immutable typed
 * array. The caller must keep exclusive ownership and must not mutate/retransfer
 * these buffers while displayed. Transport/native incidence validation remains
 * authoritative; this layer checks the display envelope and packed provenance.
 *
 * Integration: BufferAttribute may consume triangles/normals/segments directly;
 * surfaceColors uses patchOwnerAt (no point allocation); ray hit faceIndex uses
 * patchAt only for the hit; edge picking reads segments and edgeIds directly.
 * Bounds scan packed coordinates. No eager renderTriangles object expansion.
 */
import {STEREOGRAPHIC_WORKER_LIMITS} from './stereographic-worker-protocol.mjs';

const types={positions:Float32Array,vertexIds:Uint32Array,vertexFaces:Int32Array,vertexCells:Int32Array,vertexVisible:Uint8Array,segments:Float32Array,edgeIds:Uint32Array,edgeFaces:Int32Array,edgeCells:Int32Array,edgeInstanceIds:Uint32Array,edgeResolution:Uint8Array,triangles:Float32Array,normals:Float32Array,faceIds:Uint32Array,cellIds:Int32Array,triangleIds:Uint32Array,triangleInstanceIds:Uint32Array,triangleResolution:Uint8Array};
const ownerKeys=['vertexIds','vertexFaces','vertexCells','edgeIds','edgeFaces','edgeCells','edgeInstanceIds','faceIds','cellIds','triangleIds','triangleInstanceIds'];
const layoutKeys=[...ownerKeys,'vertexVisible','edgeResolution','triangleResolution'];
const fail=message=>{throw Error(`Stereographic typed display: ${message}`);};
const abort=()=>{throw Object.assign(Error('Stereographic typed display: Source or pose is stale.'),{name:'AbortError'});};
function data(value,label){if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).some(k=>typeof k!=='string')||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>d.get||d.set))fail(`${label} must be a plain data record.`);return value;}
function integer(n,label,max=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(n)||n<0||n>max)fail(`${label} is invalid or exceeds its bound.`);return n;}
function caps(overrides){data(overrides,'limits');const out={...STEREOGRAPHIC_WORKER_LIMITS};for(const [key,n] of Object.entries(overrides)){if(!(key in out)||!Number.isFinite(n)||n<=0||n>out[key])fail('Limits may only lower known caps.');out[key]=n;}return out;}
function jsonSnapshot(value){let nodes=0,chars=0;const path=new Set();function copy(v,depth){if(++nodes>100000||depth>32)fail('Pose metadata exceeds its bound.');if(v===null||typeof v==='boolean')return v;if(typeof v==='number'){if(!Number.isFinite(v))fail('Pose metadata must be finite JSON.');return v;}if(typeof v==='string'){chars+=v.length;if(chars>1048576)fail('Pose metadata exceeds its bound.');return v;}if(typeof v!=='object'||path.has(v))fail('Pose metadata must be finite acyclic JSON.');path.add(v);let out;if(Array.isArray(v)){if(v.length>100000||Object.keys(v).length!==v.length||Object.values(Object.getOwnPropertyDescriptors(v)).some(d=>d.get||d.set))fail('Pose arrays must be dense data.');out=v.map(x=>copy(x,depth+1));}else{data(v,'pose metadata');out={};for(const [key,x] of Object.entries(v)){chars+=key.length;if(chars>1048576)fail('Pose metadata exceeds its bound.');Object.defineProperty(out,key,{value:copy(x,depth+1),enumerable:true});}}path.delete(v);return Object.freeze(out);}return copy(value,0);}
function array(value,Type,label,maxBytes){if(!(value instanceof Type)||Object.getPrototypeOf(value)!==Type.prototype||!(value.buffer instanceof ArrayBuffer)||value.buffer.resizable===true||value.byteLength>maxBytes)fail(`${label} has an invalid typed representation or byte bound.`);try{new DataView(value.buffer,0,0);}catch{fail(`${label} has a detached buffer.`);}return value;}
function length(value,n,label){if(value.length!==n)fail(`${label} has a mismatched length.`);}
function id(n,max,label,optional=false){if(n< (optional?-1:0)||n>=max)fail(`${label} contains an invalid owner ID.`);}
function sameArrays(a,b,keys){return keys.every(key=>a[key].length===b[key].length&&a[key].every((n,i)=>n===b[key][i]));}
function point(array,offset){return Object.freeze([array[offset],array[offset+1],array[offset+2]]);}
function index(n,max){integer(n,'primitive index');if(n>=max)fail('Primitive index is out of range.');}

/** snapshot refers to the ORIGINAL published job, including lagging interaction
 * poses. isCurrent is its transport publication guard, not a latest-angle test.
 * input is that job's validated input descriptor; no raw worker decode occurs.
 */
export function createStereographicTypedDisplay(publication,{input,snapshot,isCurrent,limits={}}={}){
  data(publication,'publication');data(snapshot,'snapshot');data(input,'validated input');const cap=caps(limits);
  if(typeof isCurrent!=='function')fail('A publication ownership guard is required.');if(!isCurrent())abort();
  const model=snapshot.model;if(!model||publication.model!==model)abort();
  const source=data(publication.source,'source identity'),modelId=model.id??null;
  if(modelId!==null&&(typeof modelId!=='string'||modelId.length>512)||typeof model.fingerprint!=='string'||!/^[0-9a-f]{64}$/.test(model.fingerprint))fail('Native source identity is invalid.');
  if(source.modelId!==modelId||source.fingerprint!==model.fingerprint||publication.sourceKey!==JSON.stringify([modelId,model.fingerprint]))abort();
  for(const key of ['sourceKey','frameKey','generation'])if(publication[key]!==snapshot[key])abort();
  if(typeof publication.frameKey!=='string'||!publication.frameKey.length||publication.frameKey.length>32768)fail('Frame key is unbounded.');
  integer(publication.generation,'generation');integer(publication.token,'token');integer(publication.jobId,'job ID');if(!publication.token||!publication.jobId)fail('Publication IDs must be positive.');
  if(!['interaction','idle','capture'].includes(publication.phase)||typeof publication.complete!=='boolean'||publication.exactPose!==true||typeof publication.intermediate!=='boolean'||publication.intermediate&&publication.phase!=='interaction')fail('Publication phase or exact-pose contract is invalid.');
  const quality=jsonSnapshot(publication.quality);if(quality?.phase!==publication.phase||!Number.isFinite(quality.tolerance)||quality.tolerance<1e-8||quality.tolerance>(publication.phase==='interaction'?.032:.004)||quality.criterion!=='adaptive-sampled-world-error'||quality.wholePrimitiveBound!==false||!['orthographic-criterion-conversion','unavailable'].includes(quality.pixelBound)||![true,false,null].includes(quality.budgetSatisfied)||!Number.isFinite(publication.achievedTolerance)||publication.achievedTolerance<0||publication.achievedTolerance>quality.tolerance)fail('Sampled-error quality metadata is invalid.');
  if(publication.phase==='capture'&&(!publication.complete||quality.budgetSatisfied===false))fail('Capture requires complete qualified geometry.');
  const g=data(publication.geometry,'decoded geometry'),sc=data(input.sourceCounts,'source counts');if(g.version!==1||input.version!==1)fail('Unknown geometry version.');
  for(const key of ['vertices','edges','faces','cells']){integer(sc[key],`source ${key}`,cap[`source${key[0].toUpperCase()}${key.slice(1)}`]);if(!Array.isArray(model[key])||model[key].length!==sc[key])fail('Native source counts do not match the validated input.');}integer(sc.triangles,'source triangles',cap.triangles);
  let bytes=0;const borrowed={};for(const [key,Type] of Object.entries(types)){borrowed[key]=array(g[key],Type,key,cap.bytes);bytes+=g[key].byteLength;if(bytes>cap.bytes)fail('Decoded geometry exceeds its byte cap.');}
  const {positions,segments,triangles,normals}=borrowed;for(const [arr,stride,label,max] of [[positions,3,'vertices',cap.vertices],[segments,6,'segments',cap.segments],[triangles,9,'patches',cap.patches]]){if(arr.length%stride)fail(`${label} stride is invalid.`);integer(arr.length/stride,label,max);}length(normals,triangles.length,'normals');
  for(const arr of [positions,segments,triangles,normals])for(const n of arr)if(!Number.isFinite(n)||Math.abs(n)>cap.coordinate)fail('Display coordinates/normals must be finite and bounded.');
  const nv=positions.length/3,ne=segments.length/6,nt=triangles.length/9;
  // Input is already decoded by transport; nevertheless check its slot arrays
  // before provenance lookups rather than allowing missing/sparse arrays.
  const inputTypes={vertexIds:Uint32Array,vertexFaces:Int32Array,vertexCells:Int32Array,vertexVisible:Uint8Array,edgeIds:Uint32Array,edgeFaces:Int32Array,edgeCells:Int32Array,edgeVisible:Uint8Array,faceIds:Uint32Array,cellIds:Int32Array,triangleIds:Uint32Array,triangleVisible:Uint8Array};
  let inputBytes=0;for(const [key,Type] of Object.entries(inputTypes)){array(input[key],Type,key,cap.bytes);inputBytes+=input[key].byteLength;if(inputBytes>cap.bytes)fail('Input ownership exceeds its byte cap.');}integer(input.edgeIds.length,'input edges',cap.edges);integer(input.faceIds.length,'input triangles',cap.triangles);
  for(const key of ['vertexIds','vertexFaces','vertexCells','vertexVisible'])length(borrowed[key],nv,key);length(input.vertexIds,nv,'input vertices');
  for(const [names,n] of [[['vertexFaces','vertexCells','vertexVisible'],nv],[['edgeFaces','edgeCells','edgeVisible'],input.edgeIds.length],[['cellIds','triangleIds','triangleVisible'],input.faceIds.length]])for(const key of names)length(input[key],n,`input ${key}`);
  for(let i=0;i<nv;i++){id(g.vertexIds[i],sc.vertices,'vertex');id(g.vertexFaces[i],sc.faces,'vertex face',true);id(g.vertexCells[i],sc.cells,'vertex cell',true);if(g.vertexIds[i]!==input.vertexIds[i]||g.vertexFaces[i]!==input.vertexFaces[i]||g.vertexCells[i]!==input.vertexCells[i]||![0,1].includes(g.vertexVisible[i])||![0,1].includes(input.vertexVisible[i])||g.vertexVisible[i]>input.vertexVisible[i])fail('Vertex ownership or masking was forged.');}
  function primitives(count,fields,instanceKey,sourceFields,inputMask,resolution,maxima){
    for(const key of [...fields,instanceKey])length(g[key],count,key);length(g[resolution],input[inputMask].length,resolution);const outputs=new Set();
    for(let i=0;i<count;i++){const slot=g[instanceKey][i];integer(slot,'instance ID',input[inputMask].length-1);if(input[inputMask][slot]!==1)fail('Output belongs to a masked primitive.');outputs.add(slot);for(let k=0;k<fields.length;k++){id(g[fields[k]][i],maxima[k],fields[k],fields[k].endsWith('Cells')||fields[k]==='cellIds'||fields[k]==='edgeFaces');if(g[fields[k]][i]!==input[sourceFields[k]][slot])fail('Output source/instance ownership was forged.');}}
    let unresolved=0,omitted=0,clipped=0;for(let i=0;i<g[resolution].length;i++){const s=g[resolution][i],mask=input[inputMask][i];if(![0,1].includes(mask)||s>4||!mask&&s!==0||mask&&s===0||s===1&&!outputs.has(i)||[0,2,4].includes(s)&&outputs.has(i))fail('Primitive resolution conflicts with masking or geometry.');unresolved+=s===3;omitted+=s===4;clipped+=s===2;}return Object.freeze({unresolved,omitted,clipped});
  }
  const edges=primitives(ne,['edgeIds','edgeFaces','edgeCells'],'edgeInstanceIds',['edgeIds','edgeFaces','edgeCells'],'edgeVisible','edgeResolution',[sc.edges,sc.faces,sc.cells]);
  const patches=primitives(nt,['faceIds','cellIds','triangleIds'],'triangleInstanceIds',['faceIds','cellIds','triangleIds'],'triangleVisible','triangleResolution',[sc.faces,sc.cells,sc.triangles]);
  const notes=g.diagnostics;if(!Array.isArray(notes)||notes.length>cap.diagnostics||Object.keys(notes).length!==notes.length||Object.values(Object.getOwnPropertyDescriptors(notes)).some(d=>d.get||d.set)||notes.some(x=>typeof x!=='string'||!x.trim()||x.length>cap.diagnosticLength))fail('Diagnostics are invalid or unbounded.');
  if((!publication.complete||edges.clipped||patches.clipped)&&!notes.length)fail('Partial/clipped geometry requires a diagnostic.');if(publication.complete&&(edges.unresolved+edges.omitted+patches.unresolved+patches.omitted))fail('Complete display contains unresolved/omitted primitives.');
  const view=jsonSnapshot(snapshot.view),diagnostics=Object.freeze([...notes]);if(!isCurrent()||model.fingerprint!==source.fingerprint||(model.id??null)!==source.modelId)abort();
  const owner=Object.freeze({modelId,fingerprint:source.fingerprint,sourceKey:publication.sourceKey,frameKey:publication.frameKey,generation:publication.generation,token:publication.token,jobId:publication.jobId});
  const display={...borrowed,sourceCounts:Object.freeze({...sc}),owner,view,quality,phase:publication.phase,intermediate:publication.intermediate,exactPose:true,complete:publication.complete,achievedTolerance:publication.achievedTolerance,diagnostics,clippedSegments:integer(publication.clippedSegments??0,'clipped segments',cap.segments*512),clippedTriangles:integer(publication.clippedTriangles??0,'clipped triangles',cap.patches*65536),counts:Object.freeze({vertices:nv,segments:ne,patches:nt,bytes}),resolution:Object.freeze({edges,patches}),
    patchOwnerAt(i){index(i,nt);return Object.freeze({face:borrowed.faceIds[i],cell:borrowed.cellIds[i]<0?undefined:borrowed.cellIds[i],sourceTriangle:borrowed.triangleIds[i],sourceInstance:borrowed.triangleInstanceIds[i]});},
    patchAt(i){const ownership=this.patchOwnerAt(i);return Object.freeze({...ownership,points:Object.freeze([0,1,2].map(k=>point(triangles,i*9+k*3))),normals:Object.freeze([0,1,2].map(k=>point(normals,i*9+k*3)))});},
    edgeAt(i){index(i,ne);return Object.freeze({edge:borrowed.edgeInstanceIds[i],sourceEdge:borrowed.edgeIds[i],face:borrowed.edgeFaces[i]<0?undefined:borrowed.edgeFaces[i],cell:borrowed.edgeCells[i]<0?undefined:borrowed.edgeCells[i],a:point(segments,i*6),b:point(segments,i*6+3)});}
  };return Object.freeze(display);
}

/** Source binding + ordered owner slots; sufficient for surface color caching.
 * It deliberately ignores coordinates, normals, quality and resolution.
 */
export function sameTypedDisplayOwners(a,b){return Boolean(a&&b&&a.owner.sourceKey===b.owner.sourceKey&&sameArrays(a,b,ownerKeys));}
/** Equality of packed primitive/owner layout, NOT equality of geometric pose.
 * Segments and patches are independent draw primitives, with no shared indices.
 */
export function sameTypedDisplayLayout(a,b){return sameTypedDisplayOwners(a,b)&&sameArrays(a,b,layoutKeys);}

/** Conservative finite AABB and enclosing sphere. Hidden vertex slots do not
 * enlarge bounds; all retained arc/patch coordinates do. null means no geometry.
 */
export function typedDisplayBounds(display){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let points=0;
  function include(arr,offset){points++;for(let k=0;k<3;k++){const n=arr[offset+k];if(!Number.isFinite(n))fail('Borrowed buffers were mutated to nonfinite coordinates.');if(n<min[k])min[k]=n;if(n>max[k])max[k]=n;}}
  for(let i=0;i<display.vertexVisible.length;i++)if(display.vertexVisible[i])include(display.positions,i*3);for(const arr of [display.segments,display.triangles])for(let i=0;i<arr.length;i+=3)include(arr,i);
  if(!points)return null;const center=min.map((n,k)=>(n+max[k])/2),radius=Math.hypot(...max.map((n,k)=>(n-min[k])/2));return Object.freeze({min:Object.freeze(min),max:Object.freeze(max),center:Object.freeze(center),radius,points});
}
