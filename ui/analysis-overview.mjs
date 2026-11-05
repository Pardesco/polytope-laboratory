import descriptions from './model-descriptions.json' with {type:'json'};
import {relatedEntries} from './library-navigation.mjs';

const fields=['vertices','edges','faces','cells'];
const plural=name=>({'cube':'cubes','tetrahedron':'tetrahedra','octahedron':'octahedra','dodecahedron':'dodecahedra','icosahedron':'icosahedra'}[name]??null);
const article=name=>/^[aeiou]/i.test(name)?'an':'a';
const familyText={
  Platonic:'A regular convex solid: all faces are matching regular polygons, with the same arrangement at every vertex.',
  Archimedean:'A convex solid with regular polygon faces and the same arrangement of faces at every vertex.',
  Catalan:'A convex solid whose faces are all alike, dual to an Archimedean solid.',
  Johnson:'A convex solid with regular polygon faces, from the Johnson solid family.',
  'Kepler-Poinsot':'A regular star polyhedron. Its faces or the arrangement around its vertices cross through themselves.',
  'Regular star':'A regular four-dimensional star polytope. Its intersecting boundary is kept as recorded faces and cells.'
};
export function describeModel(model,{construction}={}){
  if(construction)return `Made with “${construction.label}”${construction.sourceName?' from '+construction.sourceName:''}.`;
  const metadata=model.metadata??{},key=metadata.key;
  if(Object.hasOwn(descriptions,key))return descriptions[key];
  const kind=metadata.generatorFamily?.kind??metadata.generatorFamily?.family??metadata.generator??model.provenance?.generator?.kind??metadata.family?.toLowerCase();
  if(kind==='duoprism')return 'A four-dimensional shape made by taking the Cartesian product of two polygons.';
  if(kind==='antiprism-prism')return 'A four-dimensional prism with two matching antiprism ends joined by prism cells.';
  if(kind==='antiprism'||/antiprism/i.test(metadata.family??''))return 'Two matching polygon ends, turned relative to one another and joined by a band of triangles.';
  if(kind==='prism'||/prism/i.test(metadata.family??''))return 'Two matching parallel ends joined by side faces or cells.';
  if(familyText[metadata.family])return familyText[metadata.family];
  if(model.components?.length)return 'A compound of several shapes, shown together with their separate faces and edges.';
  if(model.interpretation==='surface-section')return 'A slice through the recorded faces of another shape. The result may contain separate curves or coplanar faces.';
  if(model.interpretation==='generalized-complex')return 'A shape described by its recorded vertices, edges, faces and cells. These may intersect or form an open surface.';
  if(model.interpretation==='convex-polytope')return model.dimension===4?'A convex four-dimensional shape. Its boundary is made of three-dimensional cells.':model.dimension===3?'A convex solid bounded by flat polygon faces.':'A convex shape in '+model.dimension+' dimensions.';
  return 'Explore the recorded vertices, edges and faces of this '+model.dimension+'D model.';
}
function cellsPerEdge(model){
  if(model.dimension!==4||model.interpretation!=='convex-polytope'||!model.edges?.length||model.edges.length>250000||!model.cells?.length)return null;
  const key=(a,b)=>a<b?a+':'+b:b+':'+a,counts=new Map(model.edges.map(([a,b])=>[key(a,b),0]));let visits=0;
  for(const cell of model.cells){
    const seen=new Set();
    for(const faceId of cell){const face=model.faces[faceId];if(!face)return null;
      for(let i=0;i<face.length;i++){if(++visits>250000)return null;seen.add(key(face[i],face[(i+1)%face.length]));}}
    for(const edge of seen){if(!counts.has(edge))return null;counts.set(edge,counts.get(edge)+1);}
  }
  const values=new Set(counts.values());return values.size===1&&[...values][0]>0?[...values][0]:null;
}
export function overviewData(model,{entries=[],types,construction,title}={}){
  if(!model)return null;
  const metadata=model.metadata??{},links=construction?[]:relatedEntries(model,entries),facts=[];
  const cells=links.filter(link=>link.relation==='Cell type'),onlyCell=cells.length===1&&cells[0].count===model.cells?.length?cells[0].entry.name.toLowerCase():null;
  if(onlyCell)facts.push(`Every cell is ${article(onlyCell)} ${onlyCell}.`);
  else if(model.faces?.length){const sides=new Set(model.faces.map(face=>face.length));if(sides.size===1)facts.push(`Every face has ${[...sides][0]} sides.`);}
  const incidence=cellsPerEdge(model);if(incidence)facts.push(`${incidence} ${plural(onlyCell)??'cells'} meet at every edge.`);
  const dual=links.find(link=>link.relation==='Dual');if(dual)facts.push(dual.entry.key===metadata.key?'It is its own dual.':`Its dual is the ${dual.entry.name}.`);
  if(types?.available&&types.complete&&types.closureVerified&&types.orientation==='all'&&Number.isSafeInteger(types.groupOrder)&&types.groupOrder>0)facts.push(`Symmetry order ${types.groupOrder.toLocaleString('en-US')} (numerical).`);
  else{const figure=links.find(link=>link.relation==='Vertex figure type');if(figure)facts.push(`Around each vertex: ${figure.entry.name} (vertex figure).`);}
  return {name:title?.trim()||model.name||'Untitled model',family:construction?'Constructed model':metadata.family||model.dimension+'D model',description:describeModel(model,{construction}),
    counts:fields.filter(field=>field!=='cells'||model.dimension===4).map(field=>({label:field,count:model[field]?.length??0})),facts};
}
export class AnalysisOverview{
  constructor(context){
    this.context=context;const doc=context.document;this.root=doc.createElement('section');this.root.id='analysis-overview';this.root.className='inspector-card analysis-overview';
    this.root.setAttribute('aria-labelledby','analysis-overview-heading');doc.getElementById('analysis').before(this.root);
  }
  sync(resultModel,types){
    const state=this.context.getState(),model=state?.model;if(resultModel&&model!==resultModel)return;
    if(this.owner!==state||this.model!==model){this.types=null;this.owner=state;this.model=model;}
    if(resultModel)this.types=types;
    const history=this.context.getDocument?.(),prior=history?.states?.[history.cursor-1];
    const operation=model?.provenance?.operation;
    const construction=prior?{label:state.label||operation||'Construction',sourceName:prior.model.name}:
      !model?.metadata?.key&&operation&&!['hull','import','parse-off'].includes(operation)?{label:state.label||operation.replaceAll('-',' ')}:undefined;
    const data=overviewData(model,{entries:this.context.getEntries?.()??[],types:this.types,construction,title:state?.view?.documentMetadata?.title});
    this.root.replaceChildren();if(!data)return;
    const make=(tag,text,id)=>{const node=this.context.document.createElement(tag);node.textContent=text;if(id)node.id=id;return node;};
    this.root.append(make('h2','Overview','analysis-overview-heading'),make('h3',data.name,'analysis-overview-name'),make('p',data.family,'analysis-overview-family'),make('p',data.description,'analysis-overview-description'));
    const counts=make('dl','','analysis-overview-counts');
    for(const {label,count} of data.counts){const item=make('div','');item.append(make('dt',label),make('dd',count.toLocaleString('en-US'),'analysis-overview-'+label));counts.append(item);}
    this.root.append(counts);
    if(data.facts.length){const list=make('ul','','analysis-overview-facts');list.append(...data.facts.map(text=>make('li',text)));this.root.append(list);}
  }
}

export function organizeAnalysisOverview(doc){
  const overview=doc.getElementById('analysis-overview'),analysis=doc.getElementById('analysis');if(!overview||!analysis)return false;
  let measurements=doc.getElementById('analysis-measurements');
  if(!measurements){
    measurements=doc.createElement('details');measurements.id='analysis-measurements';measurements.className='inspector-group';
    const summary=doc.createElement('summary');summary.textContent='Model measurements';measurements.append(summary);analysis.before(measurements);measurements.append(analysis);
  }
  let heading=doc.getElementById('analysis-details-heading');
  if(!heading){heading=doc.createElement('h2');heading.id='analysis-details-heading';heading.textContent='Details';}
  const top=[overview,doc.getElementById('element-types'),doc.getElementById('library-related'),heading].filter(Boolean);measurements.before(...top);
  if(!doc.getElementById('analysis-type-evidence')){const evidence=doc.createElement('section');evidence.id='analysis-type-evidence';evidence.setAttribute('data-expert','');measurements.after(evidence);}
  let anchor=measurements;
  for(const id of ['information-panel','analysis-type-evidence','density-section-controls','polychoron-relationships']){const node=doc.getElementById(id);if(node){anchor.after(node);anchor=node;}}
  for(const id of ['polychoron-relationships','generalized-density-controls','density-section-controls'])doc.getElementById(id)?.setAttribute('data-expert','');
  return true;
}
