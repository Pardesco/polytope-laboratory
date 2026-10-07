import test from 'node:test';
import assert from 'node:assert/strict';
import {VertexFigureConstructionControls} from '../ui/vertex-figure-construction-controls.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){
 const model={id:'literal-source',dimension:3,embeddingDimension:3,interpretation:'convex-polytope',vertices:[[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]],edges:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],faces:[[0,1,2],[0,3,1],[0,2,3],[1,3,2]],cells:[],metadata:{coordinateUnits:'mm',offColors:{faces:Array(4).fill(null)}}};
 const state={model,view:{coordinateUnit:'mm',elementAnnotations:{entries:[]}},notes:'Original figure notes'},document={id:'source-document',states:[state],cursor:0};let project={documents:[document],active:0},exporting=false;
 const defaults={'vertex-figure-domain':'regular-convex','vertex-figure-candidate':'regular:tesseract','vertex-figure-output-length':'sqrt(4)','vertex-figure-search':'','construct-from-vertex-figure':'','vertex-figure-cancel':'','vertex-figure-construction-status':''};
 const nodes=Object.fromEntries(Object.entries(defaults).map(([id,value])=>[id,{value,disabled:false,hidden:false,dataset:{},replaceChildren(...children){this.children=children;},prepend(child){this.children=[child,...this.children];}}]));
 const receipt={algorithmVersion:'0.1.0',sourceId:model.id,status:'ambiguous',candidates:[{id:'regular:simplex4',name:'5-cell',counts:{vertices:5,cells:5}},{id:'regular:tesseract',name:'Tesseract',counts:{vertices:16,cells:8}}]},output={id:'built',name:'Constructed',dimension:4,embeddingDimension:4,metadata:{vertexFigureConstruction:{candidate:{id:'regular:tesseract'}}}},calls=[],published=[];
 const context={getState:()=>state,getDocument:()=>document,getProject:()=>project,isExporting:()=>exporting,evaluateMany:async texts=>texts.map(t=>t==='sqrt(4)'?2:Number(t)),run:async(...args)=>{calls.push(args);return args[0]==='vertex-figure-candidates'?structuredClone(receipt):structuredClone(output);},addDocument:(...args)=>published.push(args)};
 const controls=Object.assign(Object.create(VertexFigureConstructionControls.prototype),{context,panel:{querySelector:s=>nodes[s.slice(1)],querySelectorAll:()=>Object.values(nodes)},busy:false,generation:0,active:null,result:null,destroyed:false});controls.sync();
 return {controls,nodes,state,context,calls,published,receipt,output,setProject:value=>project=value,setExport:value=>exporting=value};
}
globalThis.document={createElement:()=>({})};
test('ambiguous scan requires explicit selection and construction uses native numeric input in a new document',async()=>{
 const f=fixture(),before=structuredClone(f.state);await f.controls.search();assert.equal(f.nodes['vertex-figure-candidate'].value,'');assert.equal(f.nodes['construct-from-vertex-figure'].disabled,true);await assert.rejects(f.controls.construct(),/Select one explicit/);
 f.nodes['vertex-figure-candidate'].value='regular:tesseract';f.controls.sync();await f.controls.construct();assert.deepEqual(f.calls[1].slice(0,2),['construct-from-vertex-figure',{candidate:'regular:tesseract',edge_length:2}]);assert.equal(f.published.length,1);assert.deepEqual(f.state,before);
});
test('held candidate search discards source metadata/content and workspace changes',async()=>{
 for(const mutate of [f=>f.state.model.metadata.coordinateUnits='cm',f=>f.state.notes+='changed',f=>f.state.view.elementAnnotations.entries.push({kind:'vertex',index:0}),f=>f.setProject({documents:[]})]){
  const f=fixture(),gate=deferred();f.context.run=()=>gate.promise;const pending=f.controls.search();mutate(f);gate.resolve(f.receipt);await assert.rejects(pending,/changed/);assert.equal(f.controls.result,null);assert.equal(f.published.length,0);
 }
});
test('held build and cancellation cannot publish a stale completion',async()=>{
 for(const mutate of [f=>f.controls.cancel(),f=>f.state.model.metadata.offColors.faces[0]={encoding:'unit',values:[1,0,0,.5]},f=>f.setExport(true)]){
  const f=fixture();await f.controls.search();f.nodes['vertex-figure-candidate'].value='regular:tesseract';const gate=deferred(),entered=deferred();f.context.run=()=>{entered.resolve();return gate.promise;};const pending=f.controls.construct();await entered.promise;mutate(f);gate.resolve(f.output);await assert.rejects(pending);assert.equal(f.published.length,0);
 }
});
