import test from 'node:test';
import assert from 'node:assert/strict';
import {ElementLabelPresetsControls} from '../ui/element-label-presets-controls.mjs';
function fixture(){
 const model={id:'literal',dimension:3,embeddingDimension:3,vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],edges:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],faces:[[0,1,2],[0,1,3],[0,2,3],[1,2,3]],cells:[],metadata:{literalRGBA:[.1,.2,.3,.4]}},state={model,view:{coordinateUnit:'mm',elementAnnotations:{entries:[]}},notes:'Retained'},document={id:'doc',states:[state],cursor:0};let project={},shown=[2,0],exporting=false;
 const defaults={kind:'face',type:'ids','target-mode':'shown','target-ids':'2,0',prefix:'',color:'auto','base':'0',decimals:'3',overwrite:false,preview:'',apply:'',cancel:'',output:'',status:''},nodes=Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,{value:typeof v==='string'?v:'',checked:v===true,disabled:false,hidden:false}])),calls=[],receipt={algorithmVersion:'0.1.0',sourceId:model.id,kind:'face',rows:[{sourceIndex:2,text:'F2'}],skippedExistingIds:[0],parameters:{action:'list',kind:'face',targetIds:[2],lines:['F<sub>2</sub>']}};
 const context={getState:()=>state,getDocument:()=>document,getProject:()=>project,isExporting:()=>exporting,visibleTargets:()=>shown.slice(),run:async(...args)=>{calls.push(args);return structuredClone(receipt);},commit:async(...args)=>{args[3].verifyPublication();calls.push(args);return {recorded:true};}},controls=Object.assign(Object.create(ElementLabelPresetsControls.prototype),{context,panel:{querySelector:s=>nodes[s.replace('#label-preset-','')],querySelectorAll:()=>Object.values(nodes)},busy:false,active:null,preview:null,generation:0,destroyed:false});controls.sync();
 return {controls,context,state,nodes,calls,receipt,setShown:ids=>shown=ids,setProject:p=>project=p,setExport:v=>exporting=v};
}
test('preset preview keeps source target IDs and applies exactly one existing content history recipe',async()=>{
 const f=fixture(),before=structuredClone(f.state);await f.controls.prepare();assert.deepEqual(f.calls[0][1].target_ids,[2,0]);assert.equal(f.calls[0][1].overwrite,false);await f.controls.apply();assert.equal(f.calls.length,2);assert.deepEqual(f.calls[1].slice(0,2),['element-content',f.receipt.parameters]);assert.deepEqual(f.state,before);
});
test('held native preview and prepared application refuse changed source/content/units/shown targets',async()=>{
 for(const change of [f=>f.state.model.metadata.literalRGBA[3]=.8,f=>f.state.view.coordinateUnit='cm',f=>f.state.view.elementAnnotations.entries.push({kind:'face',index:0}),f=>f.setShown([1]),f=>f.setProject({changed:true})]){
  const f=fixture();let release;f.context.run=()=>new Promise(r=>release=r);const pending=f.controls.prepare();change(f);release(f.receipt);await assert.rejects(pending);assert.equal(f.controls.preview,null);
 }
 const f=fixture();await f.controls.prepare();f.nodes.base.value='1';await assert.rejects(f.controls.apply(),/changed/);assert.equal(f.calls.length,1);
});
