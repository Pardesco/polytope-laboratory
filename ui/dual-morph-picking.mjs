const kinds=['vertex','edge','face','cell'];
export function morphSourceOwners(frame,kind,index){
  const list=frame?.sourceMaps?.[{vertex:'vertices',edge:'edges',face:'faces',cell:'cells'}[kind]],owner=list?.[index];if(!owner)return [];
  const output=[],seen=new Set(),add=(rank,id,role)=>{if(!Number.isInteger(rank)||!Number.isInteger(id)||rank<0||rank>3||id<0)return;const key=rank+':'+id;if(!seen.has(key)){seen.add(key);output.push({kind:kinds[rank],id,role,sourceModelId:frame.sourceModelId,sourceFingerprint:frame.sourceFingerprint});}};
  if(owner.sourceVertex!==undefined){add(0,owner.sourceVertex,'source vertex');add(owner.sourceFacetRank,owner.sourceFacet,'source facet');}
  if(owner.sourceRank!==undefined)add(owner.sourceRank,owner.sourceElement,owner.component??'primal product');
  if(owner.dualRank!==undefined)add(frame.model.dimension-1-owner.dualRank,owner.dualOriginElement,'reciprocal product');
  for(const [field,rank] of [['sourceVertexIds',0],['sourceEdgeIds',1],['sourceFaceIds',2],['dualVertexSourceFaceIds',2],['dualEdgeSourceEdgeIds',1],['dualFaceSourceVertexIds',0]])for(const id of owner[field]??[])add(rank,id,field);
  for(const record of owner.owners??[])add(record.sourceRank,record.sourceElement,record.component);
  return output;
}
