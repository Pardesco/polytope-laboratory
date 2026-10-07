export function sourceModel(dimension=3){
  const vertices=dimension===2?[[0,0],[1,0],[0,1]]:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]];
  return {id:'source-fixture',dimension,embeddingDimension:dimension,vertices,
    edges:dimension===2?[[0,1],[1,2],[2,0]]:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],
    faces:dimension===2?[[0,1,2]]:[[0,2,1],[0,1,3],[1,2,3],[2,0,3]],cells:[],
    metadata:{coordinateUnits:'mm',offColors:{faces:Array.from({length:dimension===2?1:4},()=>({encoding:'unit',values:[.2,.4,.6,.8]})),cells:[]}}};
}
export function sourceContext(dimension=3){
  let state={model:sourceModel(dimension),view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0],camera:{zoom:1}},notes:'owned source'},exporting=false;
  let document={id:'document-fixture',states:[state],cursor:0},project={documents:[document],activeDocumentId:document.id};
  return {getState:()=>state,getDocument:()=>document,getProject:()=>project,isExporting:()=>exporting,
    setState(value){state=value;document.states[0]=value;},setExport(value){exporting=value;},
    swapDocument(){document={...document,states:[state]};project.documents=[document];},
    swapProject(){project={...project,documents:[document]};}};
}
export function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
export const tick=()=>new Promise(done=>setImmediate(done));

export function controlFixture(Controller){
  const product=Controller.name==='ProductControls',antiprism=Controller.name==='AntiprismControls';
  const values=product?{'product-left-symbol':'6/-2','product-left-radius':'sqrt(4)',
    'product-right-symbol':'5/3','product-right-radius':'3','polygon-prism-height':'sqrt(4)',
    'generate-polygon-product':'','make-polygon-prism':''}:antiprism?{
    'antiprism-symbol':' 6/-2 ','antiprism-base-sizing':'radius','antiprism-base-size':'sqrt(4)',
    'antiprism-elevation':'equal-triangle','antiprism-elevation-value':'unused',
    'antiduoprism-height':'3','polyhedron-prism-height':'sqrt(4)',
    'antiprism-base-size-name':'','antiprism-elevation-name':'','antiprism-elevation-input':'',
    'generate-antiprism':'','generate-antiduoprism':'','make-polyhedron-prism':''}:{
    'coincidence-tolerance':'sqrt(4)','face-weld':'','blend-face-ids':'0, 1; 2',
    'face-color-policy':'first-source','face-edit-evidence':'original evidence',
    'coincidence-analyze':'','coincidence-remove':'','blend-faces':''};
  const nodes=Object.fromEntries(Object.entries(values).map(([id,value])=>[id,{value,disabled:false,hidden:false,checked:true,textContent:id==='face-edit-evidence'?value:''}]));
  const owner=sourceContext(product?2:3),publications=[],options=[],controls=Object.create(Controller.prototype);
  const result={pairs:[[0,1]],unpairedFaceIds:[2,3],welding:{tolerance:2}};
  const context={...owner,evaluateMany:async entries=>entries.map(text=>text==='sqrt(4)'?2:Number(text)),
    generate:async(...args)=>{const opts=args.at(-1);opts.verifyPublication();options.push(opts);publications.push(['generate',...args.slice(0,-1)]);return result;},
    commit:async(op,params,label,opts)=>{opts.verifyPublication();options.push(opts);publications.push(['commit',op,params,label]);return result;},
    analyze:async(source,params,opts)=>{opts.verifyPublication();options.push(opts);publications.push(['analyze',source,params]);return result;}};
  Object.assign(controls,{context,busy:false,panel:{querySelector:selector=>nodes[selector.slice(1)],querySelectorAll:()=>Object.values(nodes)},
    generateButton:nodes['generate-polygon-product'],prismButton:nodes[product?'make-polygon-prism':'make-polyhedron-prism'],
    baseSizing:nodes['antiprism-base-sizing'],elevation:nodes['antiprism-elevation'],baseName:nodes['antiprism-base-size-name'],
    elevationName:nodes['antiprism-elevation-name'],elevationRow:nodes['antiprism-elevation-input']});
  controls.sync();return {controls,nodes,owner,publications,options,result};
}
