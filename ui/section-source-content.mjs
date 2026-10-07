/** Literal rank-loss content on complete ordinary-cell section regions. */
import {portableContentSource} from './element-content-source.mjs';
import {contentPresentationFrame} from './element-content-mapping.mjs';
const names={vertex:'vertices',edge:'edges',face:'faces',cell:'cells'},eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=m=>{throw Error('Section source content: '+m);};
const sub=(a,b)=>a.map((x,k)=>x-b[k]),norm=p=>Math.hypot(...p),mean=P=>P[0].map((_,k)=>P.reduce((s,p)=>s+p[k]/P.length,0));
const finite=(p,n)=>Array.isArray(p)&&p.length===n&&p.every(Number.isFinite);
export const hasSectionSourceContent=model=>model?.metadata?.sectionSourceContent?.version===1;
export function verifySectionSourcePose(viewer,state){
 if(!hasSectionSourceContent(viewer.model))return;
 const plane=viewer.model.metadata.sectionSourceContent.plane,raw=state?.view?.sectionNormal;
 const length=finite(raw,4)?norm(raw):0;
 if(state?.view?.derivedMode!=='cell-section'||!length||norm(sub(raw.map(x=>x/length),plane.normal))>1e-7||(state.view.sectionOffset??0)!==plane.offset||(state.view.fillRule??'nonzero')!==viewer.model.provenance.parameters.fill_rule)fail('Section content belongs to a different saved plane/fill rule. Wait for the current section.');
}
const emptySections=new WeakMap();
export function rememberSectionSource(viewer,packet,source){
 emptySections.delete(viewer);
 if(packet?.status==='empty'&&packet.model===null&&packet.sectionSourceContent?.version===1){
  emptySections.set(viewer,{source:portableContentSource(source),packet:structuredClone(packet.sectionSourceContent)});
 }
}
export function hasEmptySectionSource(viewer){return !viewer.model&&emptySections.has(viewer);}
export async function prepareEmptySectionSourceContent(viewer,state,{signal,isCurrent=()=>true}={}){
 if(!hasEmptySectionSource(viewer))return null;
 const owned=emptySections.get(viewer),signature=JSON.stringify([state.model,state.notes,state.view.coordinateUnit,state.view.elementAnnotations,state.view.sectionNormal,state.view.sectionOffset]);
 const check=()=>{if(signal?.aborted||!isCurrent()||emptySections.get(viewer)!==owned||viewer.model||signature!==JSON.stringify([state.model,state.notes,state.view.coordinateUnit,state.view.elementAnnotations,state.view.sectionNormal,state.view.sectionOffset]))throw Object.assign(Error('Empty section content ownership changed.'),{name:'AbortError'});};
 check();if(portableContentSource(state.model)!==owned.source||owned.packet.sourceId!==state.model.id||owned.packet.sourceFingerprint!==state.model.fingerprint||state.view.derivedMode!=='cell-section')fail('Empty section source differs.');
 const raw=state.view.sectionNormal,length=finite(raw,4)?norm(raw):0;if(!length||norm(sub(raw.map(x=>x/length),owned.packet.plane.normal))>1e-7||state.view.sectionOffset!==owned.packet.plane.offset)fail('Empty section plane changed.');
 if(state.view.elementAnnotations?.entries.some(entry=>entry.texture))fail('Requested PNG has no surviving whole affine source face sheet in this empty section.');
 await viewer.setElementContent(null,{signal,isCurrent});check();return {ready:true,emptySection:true,sourceSha256:owned.packet.sourceSha256};
}

export function planSectionSourceContent(source,model,entries,sourceHash){
 const data=model.metadata?.sectionSourceContent;
 if(!data||data.version!==1||data.sourceId!==source.id||data.sourceFingerprint!==source.fingerprint||data.sourceSha256!==sourceHash||model.provenance?.operation!=='section'||model.provenance.convexified!==false)fail('Native source binding differs.');
 if(!Array.isArray(data.occurrences)||data.occurrences.length>100000||!Array.isArray(data.wholeFaceSheets)||data.wholeFaceSheets.length>20000)fail('Native correspondence exceeds its bound.');
 const signature=portableContentSource(model),sourceSignature=portableContentSource(source),plane=data.plane;
 if(!finite(plane?.normal,4)||!finite(plane.origin,4)||!Number.isFinite(plane.offset)||!Array.isArray(plane.basis)||plane.basis.length!==4||!plane.basis.every(p=>finite(p,3)))fail('Section embedding is invalid.');
 const dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0),columns=[0,1,2].map(k=>plane.basis.map(row=>row[k]));
 if(Math.abs(norm(plane.normal)-1)>1e-7||norm(sub(plane.origin,plane.normal.map(x=>x*plane.offset)))>1e-7||columns.some((c,k)=>Math.abs(dot(c,plane.normal))>1e-7||columns.some((d,j)=>Math.abs(dot(c,d)-(j===k?1:0))>1e-7)))fail('Section embedding is not an orthonormal source plane.');
 const refs=model.metadata.sourceReferences,edgeRefs=model.metadata.edgeSourceReferences,faceRefs=model.metadata.faceSourceReferences,regions=model.metadata.cellSectionRegions;
 if(!Array.isArray(refs)||refs.length!==model.vertices.length||!Array.isArray(edgeRefs)||edgeRefs.length!==model.edges.length||!Array.isArray(faceRefs)||faceRefs.length!==model.faces.length||!Array.isArray(regions))fail('Literal native source maps are missing.');
 const span=Math.max(...[0,1,2,3].map(k=>Math.max(...source.vertices.map(p=>p[k]))-Math.min(...source.vertices.map(p=>p[k]))));
 const tol=Math.max(span*1e-7,Number.EPSILON*64*Math.max(1,...source.vertices.map(p=>norm(p))));
 const world=model.vertices.map((p,v)=>{
  if(!finite(p,3)||!Array.isArray(refs[v])||!refs[v].length||refs[v].length>64)fail('Cut vertex source references are invalid.');
  const q=plane.origin.map((x,k)=>x+dot(plane.basis[k],p));
  for(const r of refs[v]){
   if(!Number.isInteger(r.edge)||!source.edges[r.edge])fail('Cut vertex lacks a literal source edge.');
   const [a,b]=source.edges[r.edge];let expected;
   if(r.vertex!==undefined){if(![a,b].includes(r.vertex))fail('Plane vertex is not on its declared source edge.');expected=source.vertices[r.vertex];}
   else{if(!Number.isFinite(r.parameter)||r.parameter<=0||r.parameter>=1)fail('Cut edge parameter is invalid.');expected=source.vertices[a].map((x,k)=>x+r.parameter*(source.vertices[b][k]-x));}
   if(norm(sub(q,expected))>tol||Math.abs(dot(expected,plane.normal)-plane.offset)>tol)fail('Cut coordinates do not reconstruct their source owner.');
  }return q;
 });
 const expected=[],add=(sourceKind,sourceIndex,targetKind,targetIds,extra={})=>expected.push({sourceKind,sourceIndex,targetKind,targetIds,...extra});
 refs.forEach((R,v)=>{for(const e of [...new Set(R.map(r=>r.edge))].sort((a,b)=>a-b))add('edge',e,'vertex',[v]);for(const original of [...new Set(R.filter(r=>r.vertex!==undefined).map(r=>r.vertex))].sort((a,b)=>a-b))add('vertex',original,'vertex',[v]);});
 edgeRefs.forEach((R,e)=>{
  if(!Array.isArray(R)||R.length>64)fail('Boundary source references are invalid.');
  for(const f of [...new Set(R.filter(r=>r.face!==undefined).map(r=>r.face))].sort((a,b)=>a-b)){
   if(!source.faces[f]||model.edges[e].some(v=>refs[v].some(r=>r.vertex!==undefined?!source.faces[f].includes(r.vertex):!source.edges[r.edge].every(id=>source.faces[f].includes(id)))))fail('Cut boundary differs from original face incidence.');
   add('face',f,'edge',[e]);
  }
 });
 for(const region of regions){
  if(!source.cells[region.sourceCell]||!Array.isArray(region.outputFaces)||!region.outputFaces.length||region.outputFaces.some(f=>!model.faces[f]||!faceRefs[f].cells.includes(region.sourceCell)))fail('Complete section region source cell differs.');
  if(region.coplanarCell)for(const f of region.outputFaces)add('cell',region.sourceCell,'face',[f],{component:f,coplanarCell:true});
  else add('cell',region.sourceCell,'face',region.outputFaces,{component:region.component,hasHoles:Boolean(region.holes.length)});
 }
 if(!eq(expected,data.occurrences))fail('Declared content occurrences differ from literal source maps.');
 const sheets=new Map(),bySource=new Map();
 for(const sheet of data.wholeFaceSheets){
  const ids=model.faces[sheet.outputFace],original=source.faces[sheet.sourceFace];
  if(!ids||!original||sheets.has(sheet.outputFace)||faceRefs[sheet.outputFace].coplanarFace!==sheet.sourceFace||faceRefs[sheet.outputFace].holeTessellation||ids.length!==original.length)fail('Whole affine face sheet is incomplete.');
  const corners=ids.map(v=>{const owned=[...new Set(refs[v].filter(r=>r.vertex!==undefined).map(r=>r.vertex))];if(owned.length!==1)fail('Whole sheet source corner is ambiguous.');return owned[0];});
  const start=original.indexOf(corners[0]),n=original.length;
  if(start<0||!eq(corners,sheet.sourceVertexIds)||![1,-1].some(direction=>eq(corners,original.map((_,j)=>original[(start+direction*j+n)%n]))))fail('Whole face ordered source cycle differs.');
  for(let j=0;j<n;j++)if(norm(sub(world[ids[j]],source.vertices[corners[j]]))>tol)fail('Whole source face is not genuinely surviving.');
  sheets.set(sheet.outputFace,sheet.sourceFace);if(!bySource.has(sheet.sourceFace))bySource.set(sheet.sourceFace,[]);bySource.get(sheet.sourceFace).push(sheet.outputFace);
 }
 for(const entry of entries)if(entry.texture&&!bySource.has(entry.index))fail(`Face ${entry.index} PNG has no surviving whole affine source face sheet at this section plane.`);
 return {source,model,data,sheets,bySource,check(){if(portableContentSource(model)!==signature||portableContentSource(source)!==sourceSignature)fail('Section/source ownership changed.');}};
}

export function sectionLabelAnchors(plan,published,entries){
 plan.check();const result=new Map(),recipe=published.contentRecipe,visibility=published.visibility,view=published.view;
 if(!recipe?.normalized||!Number.isFinite(recipe.radius)||recipe.radius<=0)fail('Published section normalization is missing.');
 const requested=new Set(entries.filter(e=>e.text).map(e=>`${e.kind}:${e.index}`));let count=0;
 for(const occurrence of plan.data.occurrences){
  const key=`${occurrence.sourceKind}:${occurrence.sourceIndex}`;if(!requested.has(key))continue;
  let ids;
  if(occurrence.targetKind==='vertex'){
   if(!visibility.vertices[occurrence.targetIds[0]])continue;ids=occurrence.targetIds;
  }else if(occurrence.targetKind==='edge'){
   const e=occurrence.targetIds[0];if(view.edges===false||!visibility.edges[e])continue;ids=plan.model.edges[e];
  }else{
   if(view.faces===false||occurrence.targetIds.every(f=>!visibility.faces[f]))continue;
   // An actual rendered triangle keeps a holed/concave region's anchor on
   // its sheet, instead of averaging corners into empty space.
   let best=null,area=-1;
   for(const t of published.triangles??[]){if(!occurrence.targetIds.includes(t.face)||!visibility.faces[t.face]||!t.vertices)continue;
    const [a,b,c]=t.vertices.map(v=>recipe.normalized[v]),u=sub(b,a),w=sub(c,a),cross=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],size=norm(cross);if(size>area){area=size;best=t.vertices;}}
   if(!best)fail('Visible complete cell region has no literal rendered triangle anchor.');ids=best;
  }
  if(++count>4096)fail('Visible section label count exceeds 4096.');
  if(!result.has(key))result.set(key,[]);
  result.get(key).push({anchor:mean(ids.map(v=>recipe.normalized[v])),scale:1/recipe.radius,receipt:{sourceKind:occurrence.sourceKind,sourceIndex:occurrence.sourceIndex,sourceId:plan.source.id,domain:'ordinary-cell-section',targetKind:occurrence.targetKind,targetIds:[...occurrence.targetIds],component:occurrence.component??null,instanceVertexIds:[...ids]}});
 }return result;
}

export function sectionFacePresentationFrame(plan,frame,outputFace,recipe,view,pose){
 plan.check();if(!plan.sheets.has(outputFace))fail('Requested PNG patch has no verified surviving whole face.');
 const plane=plan.data.plane,to3=p=>[0,1,2].map(k=>p.reduce((s,x,j)=>s+x*plane.basis[j][k],0));
 const mapped={...frame,origin:to3(sub(frame.origin,plane.origin)),u:to3(frame.u),v:to3(frame.v)};
 return contentPresentationFrame(mapped,{center:recipe.center,radius:recipe.radius,matrix:pose.matrix,angles:view.angles||[]});
}
