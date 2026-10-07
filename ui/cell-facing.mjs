/** Verified convex source planes and dynamic 4D observer-facing classification.
 * Source geometry is immutable; persisted masks/eye/display planes are ignored.
 */
import {rotate} from './projection.js';

const EPS=1e-8,SUPPORT_EPS=8e-8;
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const finite4=p=>Array.isArray(p)&&p.length===4&&p.every(Number.isFinite);
const validHash=p=>typeof p==='string'&&/^[0-9a-f]{64}$/.test(p);
const identity=()=>Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>+(i===j)));
export const CELL_FACING_LIMITS=Object.freeze({vertices:20000,incidences:1000000,cells:10000,supportTests:8000000,cellVertexVisits:1000000});

function rank(points){
  const rows=[];
  for(const point of points){
    const candidate=[...point];
    for(let pass=0;pass<2;pass++)for(const row of rows){const coefficient=dot(candidate,row);for(let k=0;k<4;k++)candidate[k]-=coefficient*row[k];}
    const length=Math.hypot(...candidate);
    if(length>EPS)rows.push(candidate.map(x=>x/length));
    if(rows.length===4)break;
  }
  return rows.length;
}

function determinant(matrix){
  const rows=matrix.map(row=>[...row]);let result=1;
  for(let i=0;i<4;i++){
    let pivot=i;for(let j=i+1;j<4;j++)if(Math.abs(rows[j][i])>Math.abs(rows[pivot][i]))pivot=j;
    if(!rows[pivot][i])return 0;
    if(pivot!==i){[rows[pivot],rows[i]]=[rows[i],rows[pivot]];result=-result;}
    const value=rows[i][i];result*=value;
    for(let j=i+1;j<4;j++){const factor=rows[j][i]/value;for(let k=i+1;k<4;k++)rows[j][k]-=factor*rows[i][k];}
  }
  return result;
}

function checkedMatrix(matrix){
  if(matrix===null||matrix===undefined)return identity();
  if(!Array.isArray(matrix)||matrix.length!==4||!matrix.every(finite4))throw Error('Display matrix must be finite 4 by 4 SO(4).');
  for(let i=0;i<4;i++)for(let j=0;j<4;j++)if(Math.abs(dot(matrix[i],matrix[j])-(i===j?1:0))>EPS)throw Error('Display matrix is not orthogonal within 1e-8.');
  if(Math.abs(determinant(matrix)-1)>EPS)throw Error('Display matrix must have determinant +1 within 1e-8.');
  return matrix.map(row=>[...row]);
}

/** Existing angle rotations occur after the saved row-major source frame. */
export function composeDisplayMatrix(matrix=null,angles=[]){
  const frame=checkedMatrix(matrix);
  if(!Array.isArray(angles)||angles.length>6||!angles.every(Number.isFinite))throw Error('Display angles must be at most six finite degree values.');
  const columns=Array.from({length:4},(_,i)=>rotate(frame.map(row=>row[i]),angles));
  return Array.from({length:4},(_,i)=>columns.map(column=>column[i]));
}

/** Verify cached planes once against current source points and cell incidence. */
export function resolveSourcePlanes(model,cache){
  const rejected=reason=>({supported:false,planes:null,diagnostic:`Cell facing unavailable: ${reason}`});
  if(model?.dimension!==4||(model.embeddingDimension??model.dimension)!==4)return rejected('requires an intrinsic 4D source.');
  if(model.interpretation!=='convex-polytope')return rejected('generalized cells require explicit source-orientation semantics.');
  if(!cache||!validHash(model.fingerprint)||cache.sourceFingerprint!==model.fingerprint)return rejected('validated source geometry fingerprint does not match the plane cache.');
  if(cache.algorithmVersion!=='cell-facing-1')return rejected('plane cache algorithm is unsupported.');
  const {vertices,faces,cells}=model;
  if(!Array.isArray(vertices)||!vertices.length||!vertices.every(finite4)||!Array.isArray(faces)||!Array.isArray(cells)||!cells.length||!faces.every(Array.isArray)||!cells.every(Array.isArray))return rejected('source coordinate/incidence tables are malformed.');
  const incidences=faces.reduce((sum,f)=>sum+f.length,0)+cells.reduce((sum,c)=>sum+c.length,0)+2*(model.edges?.length||0);
  if(vertices.length>CELL_FACING_LIMITS.vertices||cells.length>CELL_FACING_LIMITS.cells||incidences>CELL_FACING_LIMITS.incidences||vertices.length*cells.length>CELL_FACING_LIMITS.supportTests)return rejected('source/support resource limit exceeded.');
  const center=Array(4).fill(0);vertices.forEach(p=>p.forEach((x,i)=>center[i]+=x/vertices.length));
  let radius=0;for(const p of vertices)radius=Math.max(radius,Math.hypot(...p.map((x,i)=>x-center[i])));
  if(!finite4(center)||!Number.isFinite(radius)||radius<=0)return rejected('source center/radius normalization is unresolved.');
  const q=vertices.map(p=>p.map((x,i)=>(x-center[i])/radius));
  if(rank(q)!==4)return rejected('source coordinates do not span full affine rank 4.');
  const normalization=cache.normalization;
  if(!finite4(normalization?.center)||!Number.isFinite(normalization.radius)||Math.abs(normalization.radius/radius-1)>EPS||normalization.center.some((x,i)=>Math.abs((x-center[i])/radius)>EPS))return rejected('cached normalization does not match source geometry.');
  if(!Array.isArray(cache.sourceCellIds)||cache.sourceCellIds.length!==cells.length||cache.sourceCellIds.some((id,i)=>id!==i)||!Array.isArray(cache.cells)||cache.cells.length!==cells.length)return rejected('plane cache must cover every ordered source cell.');
  const planes=[];let visits=0;
  for(let cell=0;cell<cells.length;cell++){
    const ids=new Set();
    if(!cells[cell].length||new Set(cells[cell]).size!==cells[cell].length)return rejected(`cell ${cell} has malformed source face incidence.`);
    for(const faceId of cells[cell]){
      if(!Number.isInteger(faceId)||faceId<0||faceId>=faces.length)return rejected(`cell ${cell} has invalid source face IDs.`);
      const face=faces[faceId];visits+=face.length;
      if(visits>CELL_FACING_LIMITS.cellVertexVisits)return rejected('cell-vertex traversal resource limit exceeded.');
      if(face.length<3||new Set(face).size!==face.length||face.some(v=>!Number.isInteger(v)||v<0||v>=vertices.length))return rejected(`cell ${cell} has invalid source vertex IDs.`);
      face.forEach(v=>ids.add(v));
    }
    const sourceIds=[...ids].sort((a,b)=>a-b),record=cache.cells[cell],plane=record?.normalizedPlane;
    if(record?.cell!==cell||!Array.isArray(record.sourceVertexIds)||record.sourceVertexIds.length!==sourceIds.length||record.sourceVertexIds.some((v,i)=>v!==sourceIds[i]))return rejected(`cell ${cell} source vertices do not match cached references.`);
    if(!finite4(plane?.normal)||!Number.isFinite(plane.offset)||plane.offset<=SUPPORT_EPS||Math.abs(dot(plane.normal,plane.normal)-1)>EPS)return rejected(`cell ${cell} has no finite unit outward plane.`);
    const cellPoints=sourceIds.map(v=>q[v].map((x,i)=>x-q[sourceIds[0]][i]));
    if(rank(cellPoints)!==3)return rejected(`cell ${cell} does not span a rank-3 hyperplane.`);
    for(let v=0;v<q.length;v++){
      const residual=dot(plane.normal,q[v])-plane.offset;
      if(residual>SUPPORT_EPS||Math.abs(residual)<=SUPPORT_EPS&&!ids.has(v)||ids.has(v)&&Math.abs(residual)>SUPPORT_EPS)return rejected(`cell ${cell} cached plane fails complete source support checks.`);
    }
    planes.push({cell,normal:[...plane.normal],offset:plane.offset});
  }
  return {supported:true,planes,sourceFingerprint:model.fingerprint,normalization:{center,radius},diagnostic:null,diagnostics:Array.isArray(cache.diagnostics)?cache.diagnostics.filter(x=>typeof x==='string').slice(0,100):[]};
}

/** Recompute facing from verified planes; saved cached masks are never used. */
export function classifyCellFacing(resolved,{matrix=null,angles=[],projection='orthographic',eye=null,direction=null,grazingTolerance=1e-8}={}){
  const rejected=reason=>({supported:false,diagnostic:`Cell facing unavailable: ${reason}`,masks:null});
  if(!resolved?.supported||!Array.isArray(resolved.planes))return rejected(resolved?.diagnostic||'verified source planes are missing.');
  try{
    if(!['orthographic','perspective','stereographic'].includes(projection))throw Error('projection is unsupported.');
    if(!Number.isFinite(grazingTolerance)||grazingTolerance<=0||grazingTolerance>1e-3)throw Error('grazing tolerance must be positive and at most 1e-3.');
    const composite=composeDisplayMatrix(matrix,angles);
    let observer,band=grazingTolerance;
    if(projection==='orthographic'){
      if(eye!==null&&eye!==undefined)throw Error('parallel observers use direction, not a finite eye.');
      observer=direction??[0,0,0,1];
      if(!finite4(observer))throw Error('observer direction must be finite and four-dimensional.');
      const scale=Math.max(...observer.map(Math.abs));if(!scale)throw Error('observer direction must be nonzero.');
      observer=observer.map(x=>x/scale);const length=Math.hypot(...observer);observer=observer.map(x=>x/length);
    }else{
      if(direction!==null&&direction!==undefined)throw Error('finite-eye observers do not use a parallel direction.');
      observer=eye??[0,0,0,projection==='perspective'?3:1.05];
      if(!finite4(observer)||!Number.isFinite(Math.hypot(...observer)))throw Error('observer eye must be finite and four-dimensional.');
      band*=Math.max(1,Math.hypot(...observer));
    }
    const cells=resolved.planes.map(plane=>{
      const normal=composite.map(row=>dot(row,plane.normal));
      const scale=Math.max(1,...observer.map(Math.abs));
      const signedFacing=projection==='orthographic'?dot(normal,observer):(dot(normal,observer.map(x=>x/scale))-plane.offset/scale)*scale;
      if(!Number.isFinite(signedFacing))throw Error('observer/plane arithmetic exceeds finite precision.');
      return {cell:plane.cell,displayPlane:{normal,offset:plane.offset},signedFacing,facing:signedFacing>band?'front':signedFacing< -band?'back':'grazing'};
    });
    const masks=Object.fromEntries(['front','back','grazing'].map(kind=>[kind,cells.map(cell=>cell.facing===kind)]));
    return {supported:true,diagnostic:null,cells,masks,sourceCellIds:cells.map(cell=>cell.cell),...Object.fromEntries(Object.keys(masks).map(kind=>[kind+'CellIds',cells.filter(cell=>cell.facing===kind).map(cell=>cell.cell)])),classificationTolerance:band,matrix:composite};
  }catch(error){return rejected(error.message);}
}
