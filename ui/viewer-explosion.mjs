/** Display instances in the ORIGINAL source normalization. Never a new model.
 * Projection/camera clipping happens later; picking uses the explicit maps.
 */
import {buildFaceSurfaces} from './face-fill.mjs';
import {createMemories,storeMemory} from './model-memories.mjs';

export const EXPLOSION_DISPLAY_LIMITS=Object.freeze({entities:10000,vertices:100000,edges:200000,faces:100000,triangles:250000,incidences:1000000});
const fail=message=>{throw Error(`Explosion display unavailable: ${message}`);};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const key=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
const point=(value,d)=>Array.isArray(value)&&value.length===d&&value.every(Number.isFinite);
const copy=value=>structuredClone(value);
const ownedState=state=>storeMemory(createMemories(),1,state).slots[0].state;
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

function checkedLimits(input){
  const result={...EXPLOSION_DISPLAY_LIMITS};
  if(input!==undefined){
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!Object.hasOwn(result,k)))fail('invalid resource limits.');
    for(const [field,value] of Object.entries(input)){
      if(!Number.isInteger(value)||value<1||value>result[field])fail('resource limits must be positive bounded integers.');result[field]=value;
    }
  }
  return result;
}
function rgba(record,label){
  if(record===null||record===undefined)return null;
  if(!record||!['unit','byte'].includes(record.encoding)||!Array.isArray(record.values)||![3,4].includes(record.values.length))fail(`${label} has malformed source RGB/RGBA.`);
  const bound=record.encoding==='byte'?255:1;
  if(record.values.some(v=>!Number.isFinite(v)||v<0||v>bound||record.encoding==='byte'&&!Number.isInteger(v)))fail(`${label} has out-of-range source RGB/RGBA.`);
  const result=record.values.map(v=>v/bound);if(result.length===3)result.push(1);return result;
}
function colors(model){
  const input=model.metadata?.offColors??{},result={};
  for(const field of ['vertices','edges','faces','cells']){
    const values=input[field];
    if(values===undefined){result[field]=null;continue;}
    if(!Array.isArray(values)||values.length!==(model[field]?.length??0))fail(`source ${field} color count differs from geometry.`);
    result[field]=values.map((record,id)=>rgba(record,`${field} ${id}`));
  }
  return result;
}
function sourceSnapshot(model){
  const saved=ownedState({model,view:{}}).model,d=saved.embeddingDimension??saved.dimension;
  if(![3,4].includes(saved.dimension)||d!==saved.dimension)fail('entity instances require intrinsic 3D faces or 4D cells.');
  if(saved.id!=null&&typeof saved.id!=='string'||saved.fingerprint!=null&&(typeof saved.fingerprint!=='string'||!/^[0-9a-f]{64}$/.test(saved.fingerprint)))fail('source identity is malformed.');
  return saved;
}
function originalNormalization(model,supplied){
  const d=model.dimension,center=Array(d).fill(0);model.vertices.forEach(p=>p.forEach((x,k)=>center[k]+=x/model.vertices.length));
  let radius=0;for(const p of model.vertices)radius=Math.max(radius,Math.hypot(...p.map((x,k)=>x-center[k])));
  if(!point(center,d)||!Number.isFinite(radius)||radius<=0||!point(supplied?.center,d)||!Number.isFinite(supplied.radius)||supplied.radius<=0||Math.abs(supplied.radius/radius-1)>1e-10||center.some((x,k)=>Math.abs((x-supplied.center[k])/radius)>1e-10))fail('normalization must retain the original source center and radius.');
  // Use the captured source convention, never fit translated instances.
  return {center,radius};
}

/** Explicit supplied presentation instances may contain generalized cycles.
 * This helper validates translations/incidence; it does not invent directions
 * or claim generalized explosion support. Empty/subset entity lists are valid.
 */
export function prepareEntityDisplayBuffers(model,instances,{fillRule='nonzero',limits:limitInput}={}){
  const limits=checkedLimits(limitInput),saved=sourceSnapshot(model);
  const data=ownedState({model:saved,view:{instances}}).view.instances,d=saved.dimension;
  if(!data||data.sourceFingerprint!==(saved.fingerprint??null)||!Array.isArray(data.entities)||data.entities.length>limits.entities)fail('presentation source fingerprint or entity bound is invalid.');
  const normalization=originalNormalization(saved,data.normalization),{center,radius}=normalization;
  const source=freeze({modelId:saved.id??null,fingerprint:saved.fingerprint??null,dimension:d,embeddingDimension:d});
  const palette=colors(saved),edgeLookup=new Map(saved.edges.map(([a,b],id)=>[key(a,b),id]));
  const prepared=[],seen=new Set(),selectedFaces=new Set();let visits=0,vertexCount=0,edgeCount=0,faceCount=0;
  for(const entity of data.entities){
    const cell=d===4?entity?.id:null,expectedFaces=d===3?[entity?.id]:saved.cells?.[cell];
    if(!entity||!Number.isInteger(entity.id)||seen.has(entity.id)||entity.kind!==(d===3?'face':'cell')||!Array.isArray(expectedFaces)||entity.id<0||entity.id>=(d===3?saved.faces.length:saved.cells.length)||!equal(entity.sourceFaceIds,expectedFaces))fail('entity role does not retain complete ordered source face/cell incidence.');
    seen.add(entity.id);
    const cycles=expectedFaces.map(id=>saved.faces[id]),sourceVertices=d===3?[...cycles[0]]:[...new Set(cycles.flat())].sort((a,b)=>a-b);
    if(!equal(entity.sourceVertexIds,sourceVertices)||!equal(entity.sourceCycles,cycles)||!point(entity.translation,d)||!Array.isArray(entity.points)||entity.points.length!==sourceVertices.length)fail('entity vertex/cycle references or translation are malformed.');
    const local=new Map(sourceVertices.map((v,id)=>[v,id])),expectedLocal=cycles.map(cycle=>cycle.map(v=>local.get(v)));
    if(!equal(entity.faces,expectedLocal))fail('local face buffers differ from ordered source cycles.');
    const ownerColor=saved.metadata?.offColors?.[d===3?'faces':'cells']?.[entity.id];
    if(entity.sourceColor!==undefined&&!equal(entity.sourceColor,ownerColor))fail('entity color differs from its source owner.');
    for(let i=0;i<sourceVertices.length;i++){
      const p=entity.points[i],sourcePoint=saved.vertices[sourceVertices[i]];
      if(!point(p,d)||sourcePoint.some((x,k)=>!Number.isFinite(x+entity.translation[k])||Math.abs((p[k]-(x+entity.translation[k]))/radius)>1e-10))fail('entity points must be a uniform source-space translation.');
    }
    const entityEdges=new Map(),vertexFaces=new Map(sourceVertices.map(v=>[v,[]]));
    for(const face of expectedFaces){
      selectedFaces.add(face);const cycle=saved.faces[face];visits+=cycle.length;
      if(visits>limits.incidences)fail('source incidence resource limit exceeded.');
      cycle.forEach((a,i)=>{vertexFaces.get(a).push(face);const b=cycle[(i+1)%cycle.length],edge=edgeLookup.get(key(a,b));if(edge===undefined)fail('source boundary has no corresponding source edge.');if(!entityEdges.has(edge))entityEdges.set(edge,[]);entityEdges.get(edge).push(face);});
    }
    vertexCount+=sourceVertices.length;edgeCount+=entityEdges.size;faceCount+=expectedFaces.length;
    if(vertexCount>limits.vertices||edgeCount>limits.edges||faceCount>limits.faces)fail('duplicated instance resource limit exceeded.');
    prepared.push({entity,cell,sourceVertices,local,entityEdges,vertexFaces,expectedFaces});
  }
  const fill=buildFaceSurfaces(saved,fillRule,{faceIds:[...selectedFaces]});
  const byFace=new Map();for(const triangle of fill.triangles){if(!byFace.has(triangle.face))byFace.set(triangle.face,[]);byFace.get(triangle.face).push(triangle);}
  let triangleCount=0;for(const p of prepared)for(const face of p.expectedFaces)triangleCount+=byFace.get(face)?.length??0;
  if(triangleCount>limits.triangles)fail('duplicated surface triangle resource limit exceeded.');
  const vertices=[],edges=[],faces=[],triangles=[],normalized=[],edgeIndices=[];
  const vertexInstancesBySource=Array.from({length:saved.vertices.length},()=>[]),edgeInstancesBySource=Array.from({length:saved.edges.length},()=>[]),faceInstancesBySource=Array.from({length:saved.faces.length},()=>[]),cellInstancesBySource=Array.from({length:saved.cells?.length??0},()=>[]);
  const normalize=p=>{const result=p.map((x,k)=>(x-center[k])/radius);if(!point(result,d))fail('normalized presentation coordinates exceed finite range.');return result;};
  const translated=(p,t)=>p.map((x,k)=>t[k]===0?x:x+t[k]);
  const entityRecords=[];
  for(const p of prepared){
    const {entity,cell,sourceVertices,local,entityEdges,vertexFaces,expectedFaces}=p,base=vertices.length;
    const owner={entityId:entity.id,sourceFace:d===3?entity.id:null,sourceCell:cell,cell};
    const entityRecord={...owner,kind:entity.kind,sourceFaceIds:[...expectedFaces],vertices:[],edges:[],faces:[],triangles:[]};
    if(cell!==null)cellInstancesBySource[cell].push(entityRecords.length);
    for(let localId=0;localId<sourceVertices.length;localId++){
      const sourceVertex=sourceVertices[localId],id=vertices.length,sourceFaceIds=[...vertexFaces.get(sourceVertex)];
      const intrinsic=[...entity.points[localId]],q=normalize(intrinsic),color=palette.vertices?.[sourceVertex]??null;
      vertices.push({instance:id,...owner,sourceVertex,vertex:sourceVertex,sourceFaceIds,point:intrinsic,normalized:[...q],rgba:color?[...color]:null});normalized.push(q);vertexInstancesBySource[sourceVertex].push(id);entityRecord.vertices.push(id);
    }
    for(const [sourceEdge,sourceFaceIds] of entityEdges){
      const id=edges.length,sourceVertexIds=saved.edges[sourceEdge],instanceVertices=sourceVertexIds.map(v=>base+local.get(v)),color=palette.edges?.[sourceEdge]??null;
      edges.push({instance:id,...owner,sourceEdge,edge:sourceEdge,sourceFaceIds:[...sourceFaceIds],sourceVertexIds:[...sourceVertexIds],vertices:instanceVertices,points:instanceVertices.map(v=>[...vertices[v].point]),normalized:instanceVertices.map(v=>[...normalized[v]]),rgba:color?[...color]:null});edgeIndices.push([...instanceVertices]);edgeInstancesBySource[sourceEdge].push(id);entityRecord.edges.push(id);
    }
    for(const sourceFace of expectedFaces){
      const id=faces.length,sourceVertexIds=saved.faces[sourceFace],instanceVertices=sourceVertexIds.map(v=>base+local.get(v));
      const color=palette.faces?.[sourceFace]??(cell!==null?palette.cells?.[cell]:null)??null;
      faces.push({instance:id,...owner,sourceFace,face:sourceFace,sourceVertexIds:[...sourceVertexIds],vertices:instanceVertices,sourceEdgeIds:sourceVertexIds.map((a,i)=>edgeLookup.get(key(a,sourceVertexIds[(i+1)%sourceVertexIds.length]))),rgba:color?[...color]:null});faceInstancesBySource[sourceFace].push(id);entityRecord.faces.push(id);
      for(const sourceTriangle of byFace.get(sourceFace)??[]){
        const triangleId=triangles.length,points=sourceTriangle.points.map(q=>translated(q,entity.translation));
        const record={instance:triangleId,...owner,sourceFace,face:sourceFace,faceInstance:id,points,normalized:points.map(normalize),sourceVertices:sourceTriangle.vertices?[...sourceTriangle.vertices]:null,rgba:color?[...color]:null,
          ...(sourceTriangle.presentationCornerIds?{presentationCornerIds:[...sourceTriangle.presentationCornerIds]}:{})};
        if(sourceTriangle.vertices)record.vertices=sourceTriangle.vertices.map(v=>base+local.get(v));
        triangles.push(record);entityRecord.triangles.push(triangleId);
      }
    }
    entityRecords.push(entityRecord);
  }
  const diagnosticByFace=new Map(fill.diagnostics.map(diagnostic=>[diagnostic.face,diagnostic]));
  const diagnostics=[];for(const p of prepared)for(const face of p.expectedFaces)if(diagnosticByFace.has(face))diagnostics.push({...diagnosticByFace.get(face),entityId:p.entity.id,cell:p.cell});
  return {sourceModel:model,source,normalization:{center:[...center],radius},vertices,normalized,edges,edgeIndices,faces,triangles,entities:entityRecords,
    vertexInstancesBySource,edgeInstancesBySource,faceInstancesBySource,cellInstancesBySource,
    sourceVertexIds:vertices.map(v=>v.sourceVertex),sourceEdgeIds:edges.map(e=>e.sourceEdge),sourceFaceIds:faces.map(f=>f.sourceFace),sourceCellIds:entityRecords.map(e=>e.sourceCell),
    diagnostics,fillRule,colorSpace:'srgb',semantics:'source-referenced translated presentation instances; no mathematical model or filled-volume change'};
}

/** Supported automatic explosion payloads. Generalized directions remain an
 * upstream resolver diagnostic even though explicit cycle filling is generic.
 */
export function prepareExplosionDisplay(model,geometry,options={}){
  if(model?.interpretation!=='convex-polytope')fail('generalized or compound sources need explicit entity-direction semantics.');
  if(!geometry||geometry.dimension!==model.dimension||!['normal','radial'].includes(geometry.direction)||!Number.isFinite(geometry.amount)||geometry.amount<0||geometry.amount>10||!Array.isArray(geometry.entities)||geometry.entities.length!==(model.dimension===3?model.faces?.length:model.cells?.length))fail('invalid automatic explosion payload or coverage.');
  if(geometry.amount===0&&geometry.entities.some(e=>!Array.isArray(e.translation)||e.translation.some(v=>v!==0)))fail('zero explosion must preserve source coordinates.');
  const result=prepareEntityDisplayBuffers(model,geometry,options);
  if(geometry.amount===0&&result.vertices.some(v=>v.point.some((x,k)=>x!==model.vertices[v.sourceVertex][k])))fail('zero explosion must preserve exact source coordinates.');
  return {...result,amount:geometry.amount,direction:geometry.direction};
}
