/** Billboard occurrences use explicit source incidence and the published pose.
 * Coincident corners are intentionally separate occurrences; no proximity welds. */
const fail=message=>{throw Error(`Element label lineage: ${message}`);};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const key=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
const mean=points=>points[0].map((_,k)=>points.reduce((sum,p)=>sum+p[k]/points.length,0));
const names={vertex:'vertices',edge:'edges',cell:'cells'};
export function contentLabelAnchors(source,renderer,published,entries,{maxIncidences=1000000,maxAnchors=4096}={}){
  const recipe=published.contentRecipe,view=published.view,visibility=published.visibility;
  if(!recipe||!Array.isArray(recipe.normalized)||!Number.isFinite(recipe.radius)||recipe.radius<=0)fail('published normalization is missing.');
  const requested=new Set(entries.filter(e=>e.kind!=='face').map(e=>`${e.kind}:${e.index}`)),result=new Map();let visited=0,count=0;
  if(!requested.size)return result;
  const points=recipe.normalized,dimension=renderer.embeddingDimension??renderer.dimension;
  const point=id=>{const p=points[id];if(!Array.isArray(p)||p.length!==dimension||!p.every(Number.isFinite))fail('published occurrence has invalid coordinates.');return p;};
  const add=(kind,index,ids,owner,scale=1/recipe.radius)=>{
    if(++visited>maxIncidences)fail('occurrence traversal limit exceeded.');
    const entryKey=`${kind}:${index}`;if(!requested.has(entryKey)||kind==='edge'&&view.edges===false)return;
    if(!names[kind]||!Number.isInteger(index)||index<0||index>=source[names[kind]].length)fail('invalid source owner.');
    if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||!Number.isFinite(scale)||scale<=0)fail('invalid occurrence receipt.');
    if(++count>maxAnchors)fail('visible label occurrence limit exceeded.');
    const receipt={sourceKind:kind,sourceIndex:index,sourceId:source.id,...owner,instanceVertexIds:[...ids]};
    if(!result.has(entryKey))result.set(entryKey,[]);result.get(entryKey).push({anchor:mean(ids.map(point)),scale,receipt});
  };
  const net=recipe.net,cellNet=recipe.cellNet,explosion=recipe.explosionDisplay;
  if(net||cellNet){
    const arrangement=net||cellNet;
    if(arrangement.sourceId!==source.id||arrangement.sourceFingerprint!==source.fingerprint)fail('net source ownership differs.');
    const edgeLookup=new Map();source.edges.forEach((edge,i)=>{const pair=key(...edge);if(edgeLookup.has(pair))fail('ambiguous source edge incidence.');edgeLookup.set(pair,i);});
    if(points.length!==renderer.vertices.length)fail('net published vertex count differs.');
    let vertexOffset=0,faceOffset=0,edgeOffset=0;
    const seen=new Set(),owners=net?net.faces:cellNet.cells;
    if(!Array.isArray(owners)||owners.length!==(net?source.faces:source.cells).length)fail('net source coverage differs.');
    for(const owner of owners){
      const sourceIds=owner.sourceVertices;
      if(!Number.isInteger(owner.id)||owner.id<0||owner.id>=(net?source.faces:source.cells).length||seen.has(owner.id))fail('duplicate/invalid net owner.');seen.add(owner.id);
      const expected=net?source.faces[owner.id]:[...new Set(source.cells[owner.id].flatMap(f=>source.faces[f]))].sort((a,b)=>a-b);
      if(!equal(sourceIds,expected)||owner.points.length!==sourceIds.length)fail('net ordered source vertices differ.');
      const localFaces=net?[{id:owner.id,vertices:sourceIds.map((_,i)=>i)}]:owner.faces;
      if(!Array.isArray(localFaces)||!equal(localFaces.map(f=>f.id),net?[owner.id]:source.cells[owner.id]))fail('net source face coverage differs.');
      let cellVisible=false;
      for(const face of localFaces){
        const ids=face.vertices.map(i=>{if(!Number.isInteger(i)||i<0||i>=sourceIds.length)fail('invalid local corner.');return vertexOffset+i;});
        if(!equal(face.vertices.map(i=>sourceIds[i]),source.faces[face.id])||!equal(renderer.faces[faceOffset],ids))fail('net ordered face correspondence differs.');
        if(cellNet&&(!equal(recipe.cellFaceOwners?.[faceOffset],{cell:owner.id,face:face.id})||ids.some((id,j)=>recipe.cellVertexSources?.[id]!==source.faces[face.id][j])))fail('cell net published owner map differs.');
        const visible=visibility.faces[faceOffset]!==false;cellVisible ||= visible;
        for(let j=0;j<ids.length;j++){
          const a=ids[j],b=ids[(j+1)%ids.length],sourceEdge=edgeLookup.get(key(sourceIds[face.vertices[j]],sourceIds[face.vertices[(j+1)%ids.length]]));
          if(sourceEdge===undefined||!equal(renderer.edges[edgeOffset],[a,b]))fail('net edge correspondence differs.');
          if(net&&face.vertices.length!==owner.edges.length||net&&owner.edges[j].id!==sourceEdge)fail('net supplied edge owner differs.');
          if(visible&&visibility.edges[edgeOffset]!==false)add('edge',sourceEdge,[a,b],{domain:net?'face-net':'cell-net',ownerFace:face.id,ownerCell:net?null:owner.id,localEdge:edgeOffset},net?net.scale/recipe.netRadius:1/recipe.radius);
          edgeOffset++;
        }
        faceOffset++;
      }
      for(let j=0;j<sourceIds.length;j++)if(visibility.vertices[vertexOffset+j]!==false)add('vertex',sourceIds[j],[vertexOffset+j],{domain:net?'face-net':'cell-net',ownerFace:net?owner.id:null,ownerCell:net?null:owner.id},net?net.scale/recipe.netRadius:1/recipe.radius);
      if(cellNet&&cellVisible)add('cell',owner.id,sourceIds.map((_,j)=>vertexOffset+j),{domain:'cell-net',ownerCell:owner.id});
      vertexOffset+=sourceIds.length;
    }
    if(vertexOffset!==points.length||faceOffset!==renderer.faces.length||edgeOffset!==renderer.edges.length)fail('net occurrence coverage differs.');
  }else if(explosion){
    if(explosion.sourceModel?.id!==source.id||explosion.sourceModel?.fingerprint!==source.fingerprint)fail('explosion source ownership differs.');
    const instancePoint=id=>{const p=explosion.normalized[id];if(!Array.isArray(p)||p.length!==dimension||!p.every(Number.isFinite))fail('invalid explosion coordinates.');return p;};
    const emit=(kind,index,ids,owner)=>{
      if(++visited>maxIncidences)fail('occurrence traversal limit exceeded.');
      const entryKey=`${kind}:${index}`;if(!requested.has(entryKey)||kind==='edge'&&view.edges===false)return;
      if(++count>maxAnchors)fail('visible label occurrence limit exceeded.');
      if(!result.has(entryKey))result.set(entryKey,[]);result.get(entryKey).push({anchor:mean(ids.map(instancePoint)),scale:1/recipe.radius,receipt:{sourceKind:kind,sourceIndex:index,sourceId:source.id,domain:'explosion',...owner,instanceVertexIds:[...ids]}});
    };
    for(const v of explosion.vertices)if(published.instanceVisibility?.vertices[v.instance])emit('vertex',v.sourceVertex,[v.instance],{entityId:v.entityId,ownerFace:v.sourceFace,ownerCell:v.cell});
    for(const e of explosion.edges)if(published.instanceVisibility?.edges[e.instance]){if(!equal(e.sourceVertexIds,source.edges[e.sourceEdge])||!equal(e.vertices.map(i=>explosion.vertices[i].sourceVertex),e.sourceVertexIds))fail('explosion edge lineage differs.');emit('edge',e.sourceEdge,e.vertices,{entityId:e.entityId,ownerFace:e.sourceFace,ownerCell:e.cell});}
    for(const entity of explosion.entities)if(entity.cell!==null&&visibility.activeCellSet.has(entity.cell)){const expected=[...new Set(source.cells[entity.cell].flatMap(f=>source.faces[f]))].sort((a,b)=>a-b);if(!equal(entity.vertices.map(i=>explosion.vertices[i].sourceVertex),expected))fail('explosion cell lineage differs.');emit('cell',entity.cell,entity.vertices,{entityId:entity.entityId,ownerCell:entity.cell});}
  }else{
    for(const entry of entries){const {kind,index,sourceVertexIds}=entry;if(kind==='face')continue;
      if(kind==='vertex'&&!visibility.vertices[index]||kind==='edge'&&!visibility.edges[index]||kind==='cell'&&!visibility.activeCellSet.has(index))continue;
      add(kind,index,sourceVertexIds,{domain:'source'});
    }
  }
  return result;
}
