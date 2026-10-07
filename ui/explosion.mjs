/** Source-space entity instances; observation frames/projection come later. */
import {resolveSourcePlanes} from './cell-facing.mjs';
import {foldPositions} from './net-motion.mjs';

export const EXPLOSION_LIMITS=Object.freeze({vertices:20000,entities:10000,incidences:1000000,supportTests:8000000,amount:10});
const EPS=1e-8,SUPPORT_EPS=8e-8;
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const finitePoint=(point,dimension)=>Array.isArray(point)&&point.length===dimension&&point.every(Number.isFinite);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function rank(rows,dimension){
  const basis=[];
  for(const input of rows){const row=[...input];for(let pass=0;pass<2;pass++)for(const old of basis){const coefficient=dot(row,old);for(let i=0;i<dimension;i++)row[i]-=coefficient*old[i];}const length=Math.hypot(...row);if(length>EPS)basis.push(row.map(x=>x/length));if(basis.length===dimension)break;}
  return basis.length;
}
function refs(value,count,label,minimum=1){
  if(!Array.isArray(value)||value.length<minimum||new Set(value).size!==value.length||value.some(id=>!Number.isInteger(id)||id<0||id>=count))throw Error(`${label} has invalid ordered source references.`);
  return [...value];
}
function faceNormal(points,sourceIds,faceId){
  const base=points[sourceIds[0]];let normal;
  for(let i=1;i<sourceIds.length-1;i++){const candidate=cross(sub(points[sourceIds[i]],base),sub(points[sourceIds[i+1]],base)),length=Math.hypot(...candidate);if(length>EPS){normal=candidate.map(x=>x/length);break;}}
  if(!normal)throw Error(`Face ${faceId} has no resolved plane normal.`);
  let offset=dot(normal,base);if(offset<0){normal=normal.map(x=>-x);offset=-offset;}
  if(offset<=SUPPORT_EPS)throw Error(`Face ${faceId} has ambiguous outward orientation.`);
  const members=new Set(sourceIds);for(let i=0;i<points.length;i++){const residual=dot(normal,points[i])-offset;if(residual>SUPPORT_EPS||members.has(i)&&Math.abs(residual)>SUPPORT_EPS||!members.has(i)&&Math.abs(residual)<=SUPPORT_EPS)throw Error(`Face ${faceId} fails complete convex source-plane support checks.`);}
  let sign=0,totalTurn=0;
  for(let i=0;i<sourceIds.length;i++){
    const a=points[sourceIds[i]],b=points[sourceIds[(i+1)%sourceIds.length]],c=points[sourceIds[(i+2)%sourceIds.length]],first=sub(b,a),second=sub(c,b),turn=dot(cross(first,second),normal);
    if(Math.hypot(...first)<=EPS)throw Error(`Face ${faceId} has an unresolved boundary edge.`);
    totalTurn+=Math.atan2(turn,dot(first,second));
    if(Math.abs(turn)>EPS){const next=Math.sign(turn);if(sign&&next!==sign)throw Error(`Face ${faceId} has nonconvex or ambiguous ordered boundary directions.`);sign=next;}
  }
  if(Math.abs(Math.abs(totalTurn)-2*Math.PI)>1e-6)throw Error(`Face ${faceId} has a self-crossing or ambiguous ordered boundary.`);
  return normal;
}

/** Resolve once, retaining detached source entity data and unit outward vectors.
 * `normal`: displacement amount * source radius along support-plane normal.
 * `radial`: displacement amount * (entity centroid - vertex-average center).
 */
export function resolveExplosion(model,{direction='normal',planeCache}={}){
  const rejected=reason=>({supported:false,diagnostic:`Explosion unavailable: ${reason}`,entities:null});
  try{
    if(!['normal','radial'].includes(direction))throw Error('direction must be normal or explicitly radial.');
    const dimension=model?.dimension;
    if(![3,4].includes(dimension)||(model.embeddingDimension??dimension)!==dimension)throw Error('requires an intrinsic 3D or 4D source.');
    if(model.interpretation!=='convex-polytope')throw Error('generalized or compound sources need explicit entity-direction semantics.');
    const {vertices,faces,cells}=model;
    if(!Array.isArray(vertices)||!vertices.length||!vertices.every(point=>finitePoint(point,dimension))||!Array.isArray(faces)||!faces.length||!faces.every(Array.isArray))throw Error('source geometry tables are malformed.');
    const count=dimension===3?faces.length:cells?.length;
    if(!Number.isInteger(count)||count<1||dimension===4&&!cells.every(Array.isArray))throw Error('source cell incidence is missing.');
    const incidence=faces.reduce((sum,face)=>sum+face.length,0)+(dimension===4?cells.reduce((sum,cell)=>sum+cell.length,0):0);
    if(vertices.length>EXPLOSION_LIMITS.vertices||count>EXPLOSION_LIMITS.entities||incidence>EXPLOSION_LIMITS.incidences||vertices.length*count>EXPLOSION_LIMITS.supportTests)throw Error('source/support resource limit exceeded.');
    const center=Array(dimension).fill(0);vertices.forEach(point=>point.forEach((value,i)=>center[i]+=value/vertices.length));
    let radius=0;for(const point of vertices)radius=Math.max(radius,Math.hypot(...sub(point,center)));
    if(!finitePoint(center,dimension)||!Number.isFinite(radius)||radius<=0)throw Error('finite source normalization is unresolved.');
    const normalized=vertices.map(point=>sub(point,center).map(value=>value/radius));
    if(rank(normalized,dimension)!==dimension)throw Error('source coordinates do not span the declared full dimension.');
    const sourceFaces=faces.map((face,id)=>refs(face,vertices.length,`Face ${id}`,3)),faceSets=new Set(sourceFaces.map(face=>[...face].sort((a,b)=>a-b).join(',')));
    if(faceSets.size!==sourceFaces.length)throw Error('source contains repeated face incidence.');
    let normals;
    if(dimension===3)normals=sourceFaces.map((face,id)=>faceNormal(normalized,face,id));
    else if(direction==='normal'){
      const verified=resolveSourcePlanes(model,planeCache);if(!verified.supported)throw Error(verified.diagnostic);
      normals=verified.planes.map(plane=>[...plane.normal]);
    }
    let visits=0;const entities=[];
    for(let id=0;id<count;id++){
      const sourceFaceIds=dimension===3?[id]:refs(cells[id],sourceFaces.length,`Cell ${id}`,4);
      visits+=sourceFaceIds.reduce((sum,face)=>sum+sourceFaces[face].length,0);if(visits>EXPLOSION_LIMITS.incidences)throw Error('cell-vertex traversal resource limit exceeded.');
      const sourceVertexIds=dimension===3?[...sourceFaces[id]]:[...new Set(sourceFaceIds.flatMap(face=>sourceFaces[face]))].sort((a,b)=>a-b);
      if(dimension===4&&rank(sourceVertexIds.map(index=>sub(normalized[index],normalized[sourceVertexIds[0]])),4)!==3)throw Error(`Cell ${id} does not span a rank-3 hyperplane.`);
      const centroid=Array(dimension).fill(0);for(const index of sourceVertexIds)normalized[index].forEach((value,i)=>centroid[i]+=value/sourceVertexIds.length);
      const radialLength=Math.hypot(...centroid);if(direction==='radial'&&radialLength<=EPS)throw Error(`Entity ${id} has an ambiguous radial direction at the model center.`);
      const vector=direction==='normal'?normals[id]:centroid.map(value=>value/radialLength),multiplier=direction==='normal'?1:radialLength;
      const local=new Map(sourceVertexIds.map((source,index)=>[source,index]));
      const color=model.metadata?.offColors?.[dimension===3?'faces':'cells']?.[id];
      entities.push({id,kind:dimension===3?'face':'cell',sourceVertexIds,sourceFaceIds,sourceCycles:sourceFaceIds.map(face=>[...sourceFaces[face]]),faces:sourceFaceIds.map(face=>sourceFaces[face].map(source=>local.get(source))),points:sourceVertexIds.map(index=>[...vertices[index]]),direction:[...vector],distanceMultiplier:multiplier,...(color!==undefined?{sourceColor:structuredClone(color)}:{})});
    }
    return freeze({supported:true,diagnostic:null,direction,dimension,normalization:{center,radius},sourceFingerprint:model.fingerprint??null,entities});
  }catch(error){return rejected(error.message);}
}

/** Fresh entity buffers at absolute amount; shared mathematical vertices are
 * duplicated by entity, never edited in the source model or resolver snapshot. */
export function explosionGeometry(resolved,amount){
  if(!Number.isFinite(amount)||amount<0||amount>EXPLOSION_LIMITS.amount)throw Error('Explosion amount must be finite in [0,10].');
  if(!resolved?.supported)throw Error(resolved?.diagnostic||'Explosion source directions are unavailable.');
  const radius=resolved.normalization.radius;
  const entities=resolved.entities.map(entity=>{
    const distance=radius*amount*entity.distanceMultiplier,translation=entity.direction.map(value=>value*distance);
    const points=entity.points.map(point=>point.map((value,i)=>amount===0?value:value+translation[i]));
    if(!translation.every(Number.isFinite)||points.some(point=>!point.every(Number.isFinite)))throw Error('Explosion exceeds finite coordinate range.');
    return {...entity,sourceVertexIds:[...entity.sourceVertexIds],sourceFaceIds:[...entity.sourceFaceIds],sourceCycles:entity.sourceCycles.map(face=>[...face]),faces:entity.faces.map(face=>[...face]),points,direction:[...entity.direction],translation,...(entity.sourceColor!==undefined?{sourceColor:structuredClone(entity.sourceColor)}:{})};
  });
  return {dimension:resolved.dimension,amount,direction:resolved.direction,sourceFingerprint:resolved.sourceFingerprint,normalization:{center:[...resolved.normalization.center],radius},entities};
}

/** Reuse authoritative net hinge descriptors and the existing rigid solver.
 * A 4D whole-cell net is a distinct representation and is never interpolated. */
export function foldTrackPositions(net,fraction){
  if(!Number.isFinite(fraction)||fraction<0||fraction>1)throw Error('Fold fraction must be finite in [0,1].');
  if(net?.cells||net?.algorithmVersion==='0.4.0')throw Error('Partial 4D cell-net folding is unavailable.');
  if(!net||!['0.3.0','generalized-face-nets-0.23.0'].includes(net.algorithmVersion)||!Array.isArray(net.faces)||!net.faces.length||!Array.isArray(net.components)||!Array.isArray(net.traversalOrder)||!Array.isArray(net.sourceEdges)||!Array.isArray(net.targetVertices)||!net.targetVertices.length)throw Error('Folding requires a validated rigid 3D face-net descriptor.');
  if(net.faces.length>EXPLOSION_LIMITS.entities||net.targetVertices.length>EXPLOSION_LIMITS.vertices||net.faces.reduce((sum,face)=>sum+(face?.points?.length||0),0)>EXPLOSION_LIMITS.incidences)throw Error('Fold descriptor resource limit exceeded.');
  if(!net.targetVertices.every(point=>finitePoint(point,3)))throw Error('Fold target vertices must be finite 3D points.');
  const ids=new Set(),faces=new Map();
  for(const face of net.faces){
    if(!Number.isInteger(face.id)||face.id<0||ids.has(face.id)||!Array.isArray(face.points)||face.points.length<3||!face.points.every(point=>finitePoint(point,2))||!Number.isFinite(face.foldAngle??0)||Math.abs(face.foldAngle??0)>Math.PI*2)throw Error('Invalid rigid face-net record.');
    refs(face.sourceVertices,net.targetVertices.length,`Fold face ${face.id}`,3);if(face.points.length!==face.sourceVertices.length)throw Error('Fold face coordinate/incidence counts differ.');ids.add(face.id);faces.set(face.id,face);
  }
  if(net.traversalOrder.length!==ids.size||new Set(net.traversalOrder).size!==ids.size||net.traversalOrder.some(id=>!ids.has(id)))throw Error('Fold traversal must cover each face once.');
  const roots=new Map();
  for(const component of net.components){
    if(roots.has(component.root)||!ids.has(component.root)||!finitePoint(component.targetQuaternion,4)||Math.abs(Math.hypot(...component.targetQuaternion)-1)>EPS||!finitePoint(component.targetTranslation,3))throw Error('Invalid rigid fold root pose.');roots.set(component.root,component);
  }
  const visited=new Set();
  for(const id of net.traversalOrder){
    const face=faces.get(id);
    if(face.parent===null){if(!roots.has(id))throw Error('Fold root pose is missing.');}
    else{
      if(!visited.has(face.parent)||!Number.isInteger(face.parentHinge)||face.parentHinge<0||face.parentHinge>=net.sourceEdges.length)throw Error('Fold parent/hinge dependency order is invalid.');
      const hinge=refs(net.sourceEdges[face.parentHinge],net.targetVertices.length,'Fold hinge',2);if(hinge.length!==2||hinge.some(source=>!face.sourceVertices.includes(source)||!faces.get(face.parent).sourceVertices.includes(source)))throw Error('Fold hinge does not join both incident faces.');
      const parent=faces.get(face.parent),a=parent.points[parent.sourceVertices.indexOf(hinge[0])],b=parent.points[parent.sourceVertices.indexOf(hinge[1])],length=Math.hypot(...sub(b,a));if(!length)throw Error('Fold hinge is geometrically singular.');
      for(const source of hinge)if(Math.hypot(...sub(parent.points[parent.sourceVertices.indexOf(source)],face.points[face.sourceVertices.indexOf(source)]))>Math.max(1,length)*1e-7)throw Error('Flat fold descriptors have a disconnected hinge.');
    }
    visited.add(id);
  }
  const result=foldPositions(net,fraction).map(face=>({...face,sourceVertices:[...face.sourceVertices],points:face.points.map(point=>[...point])}));
  if(result.some(face=>face.points.some(point=>!finitePoint(point,3))))throw Error('Fold pose exceeds finite coordinate range.');
  return result;
}
