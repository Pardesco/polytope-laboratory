/** GPL-3.0-or-later. Generalized animation nets come from native source-cycle
 * reconstruction, never from an endpoint-only renderer cache or convex hull. */
const fail=message=>{throw Error(message);};
export function boundedAnimationSignature(value,label='source ownership'){
  const text=JSON.stringify(value);
  if(typeof text!=='string'||text.length>32*1024*1024)fail(`Animation ${label} exceeds its 32 MiB snapshot bound.`);
  return text;
}
export const animationSourceSignature=state=>boundedAnimationSignature([state?.model,state?.notes??'',state?.documentMetadata??null]);
export const foldingPreparationSignature=state=>boundedAnimationSignature([state?.netLayout??null,state?.netHistory??null,state?.netSeparate??false],'net layout/history');
// Pose-owned fold fraction/display/cameras are deliberately absent. Source
// content and native reconstruction inputs must invalidate a retained cache.
export const foldingCacheSignature=state=>boundedAnimationSignature([animationSourceSignature(state),foldingPreparationSignature(state),state?.view?.elementAnnotations??null,state?.view?.coordinateUnit??'model',state?.view?.net?.root??0,state?.view?.net?.length??25,state?.view?.net?.tabs??true,state?.view?.net?.tabOptions??null],'fold cache ownership');
const area=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;

export function verifyGeneralizedFoldFill(model,net){
  if(net?.algorithmVersion!=='generalized-face-nets-0.23.0'||net.fillSemantics!=='simple-planar-source-faces'||net.validation?.allFacesRepresented!==true||net.validation?.areaPreserved!==true||net.foldValidation?.endpointReconstructed!==true)
    fail('Generalized folding requires native closed-shell reconstruction and simple planar source-face fill evidence.');
  if(!Array.isArray(net.faceTriangles)||net.faceTriangles.length>4000)fail('Generalized folding source-triangle count exceeds its bound.');
  const faces=new Map(net.faces.map(face=>[face.id,face])),areas=new Map(),seen=new Set();
  for(const triangle of net.faceTriangles){
    const face=faces.get(triangle?.face),refs=triangle?.sourceVertices;
    if(!face||!Array.isArray(refs)||refs.length!==3||new Set(refs).size!==3||refs.some(id=>!model.faces[face.id]?.includes(id)))fail('Generalized folding triangle lost its source corner ownership.');
    const key=triangle.face+':'+[...refs].sort((a,b)=>a-b).join(',');
    if(seen.has(key))fail('Generalized folding contains duplicate source triangles.');seen.add(key);
    const points=refs.map(id=>face.points[face.sourceVertices.indexOf(id)]),value=area(points);
    if(!Number.isFinite(value)||value<=0)fail('Generalized folding has a degenerate source triangle.');
    areas.set(face.id,(areas.get(face.id)||0)+value);
  }
  for(const face of net.faces){
    const expected=area(face.points),actual=areas.get(face.id)||0;
    if(!Number.isFinite(expected)||expected<=0||Math.abs(expected-actual)>Math.max(1,expected)*1e-7)
      fail('Generalized folding triangles do not fill every source polygon at its physical area.');
  }
  return true;
}
