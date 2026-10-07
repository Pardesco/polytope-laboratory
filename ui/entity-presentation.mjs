/** Display-only source-entity primitives and per-cell surface interpolation.
 * Radii are dimensionless units in the projected normalized 3D display.
 * Cell shrink uses intrinsic source points before normalization/projection.
 */
export const PRESENTATION_LIMITS=Object.freeze({spheres:20000,cylinders:30000,cellTriangles:250000,cellVertexVisits:1000000});
export const PRESENTATION_DEFAULTS=Object.freeze({vertexStyle:'point',edgeStyle:'line',vertexRadius:.015,edgeRadius:.006,cellShrink:1});

export function presentationOptions(view={}){
  const options={...PRESENTATION_DEFAULTS},diagnostics=[];
  for(const [field,values] of [['vertexStyle',['point','sphere']],['edgeStyle',['line','cylinder']]]){
    if(view[field]!==undefined){if(values.includes(view[field]))options[field]=view[field];else diagnostics.push(`Unsupported ${field}; using ${options[field]}.`);}
  }
  for(const field of ['vertexRadius','edgeRadius'])if(view[field]!==undefined){
    if(Number.isFinite(view[field])&&view[field]>0&&view[field]<=.5)options[field]=view[field];
    else diagnostics.push(`Invalid ${field}; radius must be positive and at most 0.5 normalized display units.`);
  }
  if(view.cellShrink!==undefined){
    if(Number.isFinite(view.cellShrink)&&view.cellShrink>0&&view.cellShrink<=1)options.cellShrink=view.cellShrink;
    else diagnostics.push('Invalid cell shrink; displaying full-size source faces.');
  }
  return {...options,diagnostics};
}

/** Visible source references only; virtual fill crossings never become rods/balls. */
export function primitiveInstances(model,projected,visibility,{spheres=false,cylinders=false,edgeSegments=null,limits=PRESENTATION_LIMITS}={}){
  const vertices=[],edges=[],diagnostics=[];let collapsedEdges=0,vertexCount=0,edgeCount=0;
  if(spheres)projected.forEach((p,vertex)=>{if(!p.clipped&&visibility.vertices[vertex]){vertexCount++;if(vertexCount<=limits.spheres)vertices.push({vertex,point:[...p.point]});}});
  const rod=(start,end,edge,vertices)=>{
    const delta=end.map((x,i)=>x-start[i]),length=Math.hypot(...delta);
    if(length<=1e-12){collapsedEdges++;return;}
    edgeCount++;if(edgeCount<=limits.cylinders)edges.push({edge,vertices:[...vertices],midpoint:start.map((x,i)=>(x+end[i])/2),direction:delta.map(x=>x/length),length});
  };
  if(cylinders){
    if(edgeSegments)edgeSegments.forEach(segment=>{if(visibility.edges[segment.edge])rod(segment.a,segment.b,segment.edge,model.edges[segment.edge]);});
    else model.edges.forEach(([a,b],edge)=>{if(visibility.edges[edge]&&!projected[a].clipped&&!projected[b].clipped)rod(projected[a].point,projected[b].point,edge,[a,b]);});
  }
  let sphereSupported=true,cylinderSupported=true;
  if(vertexCount>limits.spheres){vertices.length=0;sphereSupported=false;diagnostics.push('Sphere instance resource limit exceeded; using source points.');}
  if(edgeCount>limits.cylinders){edges.length=0;cylinderSupported=false;diagnostics.push('Cylinder instance resource limit exceeded; using source lines.');}
  return {vertices,edges,sphereSupported,cylinderSupported,collapsedEdges,diagnostics};
}

/** Filled source triangles may contain virtual crossing points in intrinsic units. */
export function cellFaceInstances(model,sourceTriangles,activeCellIds,shrink=1,{faceOwners=null,limits=PRESENTATION_LIMITS}={}){
  const fallback=reason=>({triangles:sourceTriangles,effectiveShrink:1,cellInstances:0,diagnostics:reason?[reason]:[]});
  if(!Number.isFinite(shrink)||shrink<=0||shrink>1)return fallback('Invalid cell shrink; displaying full-size source faces.');
  if(shrink===1)return fallback(null);
  if(model.dimension!==4||(model.embeddingDimension??model.dimension)!==4||!model.cells?.length)return fallback('Cell shrink requires source cells in intrinsic 4D; displaying full-size faces.');
  if(!Array.isArray(activeCellIds)||new Set(activeCellIds).size!==activeCellIds.length||activeCellIds.some(id=>!Number.isInteger(id)||id<0||id>=model.cells.length))return fallback('Invalid active source-cell IDs; displaying full-size faces.');
  const active=new Set(activeCellIds);
  if(!faceOwners){faceOwners=Array.from({length:model.faces.length},()=>[]);model.cells.forEach((cell,id)=>cell.forEach(face=>faceOwners[face].push(id)));}
  let count=0;
  for(const triangle of sourceTriangles){count+=faceOwners[triangle.face].length?faceOwners[triangle.face].filter(id=>active.has(id)).length:1;if(count>limits.cellTriangles)return fallback('Cell surface instance resource limit exceeded; displaying full-size source faces.');}
  const centers=new Map();let visits=0;
  for(const id of activeCellIds){
    const ids=new Set();for(const face of model.cells[id]){visits+=model.faces[face].length;if(visits>limits.cellVertexVisits)return fallback('Cell-center traversal resource limit exceeded; displaying full-size source faces.');model.faces[face].forEach(v=>ids.add(v));}
    if(!ids.size)return fallback('A source cell has no vertices; displaying full-size faces.');
    const center=Array(4).fill(0);for(const v of ids)model.vertices[v].forEach((x,k)=>center[k]+=x/ids.size);centers.set(id,center);
  }
  const triangles=[],instanced=new Set();let unowned=0;
  for(const triangle of sourceTriangles){
    const owners=faceOwners[triangle.face].filter(id=>active.has(id));
    if(!owners.length){
      if(!faceOwners[triangle.face].length){triangles.push({...triangle,cell:null});unowned++;}
      continue;
    }
    for(const cell of owners){
      const center=centers.get(cell);instanced.add(cell);
      triangles.push({face:triangle.face,cell,sourceVertices:triangle.vertices?[...triangle.vertices]:undefined,
        ...(triangle.presentationCornerIds?{presentationCornerIds:[...triangle.presentationCornerIds]}:{}),
        points:triangle.points.map(point=>point.map((x,k)=>center[k]+shrink*(x-center[k])))});
    }
  }
  return {triangles,effectiveShrink:shrink,cellInstances:instanced.size,diagnostics:unowned?[`${unowned} unowned source triangles remain full-size during cell shrink.`]:[]};
}
