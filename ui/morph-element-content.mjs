/** Explicit morph ownership and source-corner affine sheets. No proximity matching. */
import {portableContentSource} from './element-content-source.mjs';
import {validateContentFaceFrame,contentPresentationFrame} from './element-content-mapping.mjs';

const names=['vertices','edges','faces','cells'],kinds=['vertex','edge','face','cell'];
const fail=m=>{throw Error(`Morph element content: ${m}`);};
const finite=p=>Array.isArray(p)&&p.every(Number.isFinite),sub=(a,b)=>a.map((x,k)=>x-b[k]),norm=p=>Math.hypot(...p);
const key=(kind,index)=>`${kind}:${index}`;
const signature=frame=>portableContentSource(frame,{maxJsonBytes:32*1024*1024,maxPortableBytes:128*1024*1024,maxChars:32*1024*1024});

function claims(source,frame,owner,rank){
  if(!owner||typeof owner!=='object'||Array.isArray(owner))fail('Native output owner record is missing.');
  const found=new Map(),add=(r,i,role)=>{
    if(!Number.isInteger(r)||r<0||r>=source.dimension||!Number.isInteger(i)||i<0||i>=source[names[r]].length)
      fail('Native map declares an invalid literal source identity.');
    found.set(key(kinds[r],i),{kind:kinds[r],index:i,role});
  };
  const direct=record=>{if(record.sourceRank!==undefined||record.sourceElement!==undefined)add(record.sourceRank,record.sourceElement,'declared source owner');};
  direct(owner);
  if(owner.sourceVertex!==undefined)add(0,owner.sourceVertex,'source vertex flag');
  if(owner.sourceFacet!==undefined)add(owner.sourceFacetRank,owner.sourceFacet,'source facet flag');
  if(owner.dualRank!==undefined)add(source.dimension-1-owner.dualRank,owner.dualOriginElement,'declared reciprocal owner');
  if(owner.owners!==undefined){if(!Array.isArray(owner.owners)||owner.owners.length>64)fail('Owner list exceeds its bound.');for(const record of owner.owners)direct(record);}
  // These two native kernels explicitly compute original edge incidence from
  // active support-plane sets. Require a unique matching rank, not face ancestry.
  if(['truncation','augmentation'].includes(frame.method)){
    const fields=rank===1?['sourceEdgeIds','dualEdgeSourceEdgeIds']:rank===0&&frame.method==='truncation'?['sourceVertexIds']:[];
    for(const field of fields)if(owner[field]?.length===1)add(rank,owner[field][0],'unique active-support '+field);
  }
  return [...found.values()];
}

function elementVertices(model,rank,index){
  if(rank===0)return [index];
  if(rank===3)return [...new Set(model.cells[index].flatMap(f=>model.faces[f]))].sort((a,b)=>a-b);
  return model[names[rank]][index];
}

function affineSheet(source,frame,entry,outputFace,cornerClaims){
  const original=validateContentFaceFrame(source,entry),ids=frame.model.faces[outputFace];
  if(ids.length!==entry.sourceVertexIds.length)fail(`Face ${entry.index} PNG has no complete source-corner correspondence on output face ${outputFace}.`);
  const owners=ids.map(id=>cornerClaims[id].filter(r=>r.kind==='vertex').map(r=>r.index));
  if(owners.some(ids=>ids.length!==1))fail(`Face ${entry.index} PNG corners have no unique source vertex owner.`);
  const supplied=owners.map(ids=>ids[0]),expected=entry.sourceVertexIds;
  const start=expected.indexOf(supplied[0]),n=expected.length;
  if(start<0||![1,-1].some(direction=>supplied.every((v,i)=>v===expected[(start+direction*i+n*n)%n])))
    fail(`Face ${entry.index} PNG ordered source cycle differs; no coordinate matching is performed.`);
  const outputBySource=new Map(supplied.map((v,i)=>[v,frame.model.vertices[ids[i]]])),origin=outputBySource.get(expected[0]);
  const second=outputBySource.get(expected[1]),pivot=outputBySource.get(expected[original.pivot]);
  const den=original.xy[1][0],dv=original.xy[original.pivot][1];
  if(!den||!dv)fail('Source face tangent correspondence is degenerate.');
  const u=sub(second,origin).map(x=>x/den),v=sub(pivot,origin).map((x,k)=>(x-u[k]*original.xy[original.pivot][0])/dv);
  const uu=u.reduce((s,x)=>s+x*x,0),vv=v.reduce((s,x)=>s+x*x,0),uv=u.reduce((s,x,k)=>s+x*v[k],0);
  if(!finite(origin)||!finite(u)||!finite(v)||uu*vv-uv*uv<=1e-12*uu*vv||uu===0||vv===0)fail('Mapped face tangent frame is collapsed.');
  const scale=Math.max(1,...ids.map(id=>norm(sub(frame.model.vertices[id],origin))));
  for(let i=0;i<n;i++){
    const reconstructed=origin.map((x,k)=>x+u[k]*original.xy[i][0]+v[k]*original.xy[i][1]);
    if(norm(sub(reconstructed,outputBySource.get(expected[i])))>scale*1e-8)fail(`Face ${entry.index} PNG corners do not reconstruct an affine source sheet.`);
  }
  return {...original,origin:origin.slice(),u,v,outputFace,sourceVertexIds:expected.slice(),outputVertexIds:ids.slice()};
}

export function planMorphElementContent(source,frame,entries,{maxOccurrences=4096,maxIncidences=1000000}={}){
  if(!source||![3,4].includes(source.dimension)||!frame?.model||frame.sourceModelId!==source.id||frame.sourceFingerprint!==source.fingerprint||
      frame.model.dimension!==source.dimension||(frame.model.embeddingDimension??frame.model.dimension)!==(source.embeddingDimension??source.dimension))
    fail('Frame and original content source differ.');
  if(!Array.isArray(entries)||entries.length>1024)fail('Requested entry bound exceeded.');
  const sourceSignature=portableContentSource(source),frameSignature=signature(frame),occurrences=new Map(),allClaims=[];
  let visited=0;
  for(let rank=0;rank<source.dimension;rank++){
    const list=frame.sourceMaps?.[names[rank]],elements=frame.model[names[rank]];
    if(!Array.isArray(list)||list.length!==elements.length||list.length>32000)fail('Native map does not cover every output '+names[rank]+'.');
    const rankClaims=[];
    for(let index=0;index<list.length;index++){
      const declared=claims(source,frame,list[index],rank),ids=elementVertices(frame.model,rank,index);
      if((visited+=ids.length+declared.length)>maxIncidences)fail('Owner/occurrence traversal bound exceeded.');
      if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(v=>!Number.isInteger(v)||!frame.model.vertices[v]))fail('Output element corner incidence is invalid.');
      rankClaims.push(declared);
      for(const owner of declared){const entryKey=key(owner.kind,owner.index);if(!occurrences.has(entryKey))occurrences.set(entryKey,[]);
        occurrences.get(entryKey).push({outputRank:rank,outputIndex:index,ids:ids.slice(),role:owner.role});}
    }
    allClaims.push(rankClaims);
  }
  const labels=new Map(),sheets=new Map(),faceOwners=new Map();let count=0;
  for(const entry of entries){
    const rank=kinds.indexOf(entry.kind);
    if(rank<0||!Number.isInteger(entry.index)||entry.index<0||entry.index>=source[names[rank]].length)fail('Requested original source identity is invalid.');
    const found=occurrences.get(key(entry.kind,entry.index))??[];
    if(!found.length)fail(`Requested ${entry.kind} ${entry.index} has no declared moving owner at ratio ${frame.ratio}; reset the morph to restore its source content.`);
    if(entry.texture){
      if(entry.kind!=='face')fail('Only source faces may own PNG sheets.');
      const faces=found.filter(r=>r.outputRank===2&&(!Object.hasOwn(frame.sourceMaps.faces[r.outputIndex],'sourceSheetFace')||frame.sourceMaps.faces[r.outputIndex].sourceSheetFace===entry.index));
      if(!faces.length)fail(`Face ${entry.index} PNG has no output face at ratio ${frame.ratio}; reset the morph or choose a pose with a mapped source face.`);
      const mapped=new Map();for(const occurrence of faces){mapped.set(occurrence.outputIndex,affineSheet(source,frame,entry,occurrence.outputIndex,allClaims[0]));
        if(faceOwners.has(occurrence.outputIndex)&&faceOwners.get(occurrence.outputIndex)!==entry.index)fail('An output face has conflicting source PNG owners.');
        faceOwners.set(occurrence.outputIndex,entry.index);if(++count>maxOccurrences)fail('Visible content occurrence bound exceeded.');}
      sheets.set(entry.index,mapped);
    }else if(entry.text){
      const same=found.filter(r=>r.outputRank===rank),selected=same.length?same:found.filter(r=>r.outputRank===Math.max(...found.map(x=>x.outputRank)));
      if((count+=selected.length)>maxOccurrences)fail('Moving label occurrence bound exceeded.');
      labels.set(key(entry.kind,entry.index),selected);
    }
  }
  return {source,frame,labels,sheets,faceOwners,check(){
    if(portableContentSource(source)!==sourceSignature||signature(frame)!==frameSignature)throw Object.assign(Error('Morph content source, geometry or owner maps changed.'),{name:'AbortError'});
  }};
}

export const morphPatchSourceFace=(plan,outputFace)=>plan.faceOwners.get(outputFace);

export function morphLabelAnchors(plan,published){
  plan.check();if(published.morphFrame!==plan.frame)fail('Published morph frame differs from requested content.');
  const {normalized,radius,net,cellNet,explosionDisplay}=published.contentRecipe??{};
  if(net||cellNet||explosionDisplay||!Array.isArray(normalized)||normalized.length!==plan.frame.model.vertices.length||!Number.isFinite(radius)||radius<=0)
    fail('Published morph normalization/combined presentation is unsupported.');
  const result=new Map(),view=published.view,visible=published.visibility;
  for(const [entryKey,list] of plan.labels){const [kind,indexText]=entryKey.split(':');
    if(kind==='vertex'&&view.vertices!==true||kind==='edge'&&view.edges===false||['face','cell'].includes(kind)&&view.faces===false)continue;
    for(const occurrence of list){const {outputRank:r,outputIndex:i,ids}=occurrence;
      if(r===3?!visible.activeCellSet.has(i):visible[names[r]][i]===false)continue;
      const points=ids.map(id=>normalized[id]);if(points.some(p=>!finite(p)))fail('Published mapped label coordinate is invalid.');
      const anchor=points[0].map((_,k)=>points.reduce((sum,p)=>sum+p[k]/points.length,0));
      if(!result.has(entryKey))result.set(entryKey,[]);result.get(entryKey).push({anchor,scale:1/radius,
        receipt:{domain:'dual-morph',sourceId:plan.source.id,sourceKind:kind,sourceIndex:Number(indexText),
                 morphMethod:plan.frame.method,morphRatio:plan.frame.ratio,outputKind:kinds[r],outputIndex:i,
                 ownerRole:occurrence.role,instanceVertexIds:ids.slice()}});
    }
  }
  return result;
}

export function morphFacePresentationFrame(plan,entry,outputFace,recipe,view,pose){
  plan.check();const sheet=plan.sheets.get(entry.index)?.get(outputFace);
  if(!sheet)fail(`Face ${entry.index} has no verified affine sheet for output face ${outputFace}.`);
  return contentPresentationFrame(sheet,{center:recipe.center,radius:recipe.radius,matrix:pose.matrix,angles:view.angles||[]});
}
