/** Native ear triangles retain source face corners so folding never leaves
 * concave virtual paint vertices behind in the original flat plane. */
export function netSourceSurfaces(net,{faceIds}={}){
  if(!Array.isArray(net?.faceTriangles))throw Error('Generalized net source triangles are missing.');
  const faces=new Map(),selected=new Set(faceIds??net.faces.map(f=>f.id));let offset=0;
  for(const face of net.faces){faces.set(face.id,{face,offset});offset+=face.points.length;}
  const triangles=[];
  for(const item of net.faceTriangles){
    const record=faces.get(item.face);
    if(!record||!Array.isArray(item.sourceVertices)||item.sourceVertices.length!==3)throw Error('Net triangle has an invalid source face.');
    const local=item.sourceVertices.map(v=>record.face.sourceVertices.indexOf(v));
    if(local.some(i=>i<0)||new Set(local).size!==3)throw Error('Net triangle has an invalid source corner.');
    if(!selected.has(item.face))continue;
    triangles.push({face:item.face,vertices:local.map(i=>record.offset+i),points:local.map(i=>[...record.face.points[i],0])});
  }
  return {triangles,diagnostics:[],filledFaces:new Set(triangles.map(t=>t.face)).size};
}
