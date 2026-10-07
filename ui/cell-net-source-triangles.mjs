/** Display triangles reference intact source cell corners. They do not replace
 * mathematical cells or their ordered faces; shrink remains a surface gesture. */
export function cellNetSourceSurfaces(net,{faceIds}={}){
  if(!Array.isArray(net?.sourceFaceTriangles))throw Error('Ordinary cell-net face triangles are missing.');
  const byFace=new Map();
  for(const item of net.sourceFaceTriangles){
    if(!Number.isInteger(item.face)||!Array.isArray(item.sourceVertices)||item.sourceVertices.length!==3||new Set(item.sourceVertices).size!==3)throw Error('Cell-net display triangle has invalid source corners.');
    if(!byFace.has(item.face))byFace.set(item.face,[]);byFace.get(item.face).push(item.sourceVertices);
  }
  const requested=faceIds===undefined?null:new Set(faceIds),triangles=[];let offset=0,displayFace=0,filledFaces=0;
  for(const cell of net.cells){
    const local=new Map(cell.sourceVertices.map((v,i)=>[v,i]));
    for(const face of cell.faces){
      const sourceTriangles=byFace.get(face.id);
      if(!sourceTriangles?.length)throw Error('Cell-net source face has no qualified display triangles.');
      if(requested===null||requested.has(displayFace)){
        const boundary=new Set(face.vertices.map(i=>cell.sourceVertices[i]));
        for(const ids of sourceTriangles){
          if(ids.some(v=>!local.has(v)||!boundary.has(v)))throw Error('Cell-net display triangle differs from the owning source face.');
          const indices=ids.map(v=>local.get(v));triangles.push({face:displayFace,vertices:indices.map(i=>offset+i),points:indices.map(i=>[...cell.points[i]])});
        }
        filledFaces++;
      }
      displayFace++;
    }
    offset+=cell.points.length;
  }
  return {triangles,diagnostics:[],filledFaces};
}
