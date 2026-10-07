import test from 'node:test';
import assert from 'node:assert/strict';
import {selectStellationCells,StellationCellControls} from '../ui/stellation-cell-controls.mjs';
const graph=()=>({sourceFingerprint:'source-fingerprint',arrangementSha256:'owned-arrangement',nodes:[{id:0,selectable:true,outsidePlaneCount:0,supports:[]},{id:1,selectable:true,outsidePlaneCount:1,supports:[0]},{id:2,selectable:true,outsidePlaneCount:1,supports:[0]},{id:3,selectable:false,outsidePlaneCount:2,supports:[1,2]}],adjacency:{0:[1,2],1:[0,3],2:[0,3],3:[1,2]},exteriorSeedIds:[3]});
test('independent cavity/opening/unknown graph, exact source IDs, support and layer selection',()=>{
 assert.deepEqual(selectStellationCells(graph(),[1,2],'fill'),[0,1,2]);assert.deepEqual(selectStellationCells(graph(),[1],'fill'),[1]);assert.deepEqual(selectStellationCells(graph(),[],'supports',1),[0,1]);assert.deepEqual(selectStellationCells(graph(),[],'layer',1),[1,2]);
 const unknown=graph();unknown.exteriorSeedIds.push(0);assert.deepEqual(selectStellationCells(unknown,[1,2],'fill'),[1,2]);unknown.nodes[0].facetAdjacencyUnresolved=true;assert.throws(()=>selectStellationCells(unknown,[],'supports',1),/uncertain/);assert.throws(()=>selectStellationCells(graph(),[3],'fill'));
});
test('source-bound saved selection undo/redo refuses external selection changes and obsolete binding',()=>{
 const config={selectedRegions:[1,2]},control=Object.assign(Object.create(StellationCellControls.prototype),{receipt:{graph:graph()},context:{getConfig:()=>config,applySelection:()=>{}},verify:()=>{},render:()=>{},sync:()=>{},node:()=>({textContent:''})});
 control.apply('fill');assert.deepEqual(config.selectedRegions,[0,1,2]);assert.equal(config.cellSelectionHistory.steps[0].action,'fill');control.moveHistory(-1);assert.deepEqual(config.selectedRegions,[1,2]);control.moveHistory(1);assert.deepEqual(config.selectedRegions,[0,1,2]);
 config.selectedRegions=[1];assert.throws(()=>control.moveHistory(-1),/outside/);config.cellSelectionHistory.arrangementSha256='different';assert.equal(control.history(),null);
});
test('held native cell analysis rejects in-place source or arrangement geometry changes',async()=>{
 for(const edit of [state=>state.notes='changed',state=>state.arrangement.planes[0][3]=2,state=>state.view.stellation.boxScale=4,state=>state.view.stellation.planeIds=[1]]){
  const model={id:'source',dimension:3,embeddingDimension:3,vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],edges:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],faces:[[0,1,2],[0,1,3],[0,2,3],[1,2,3]],cells:[]},state={model,notes:'kept',view:{stellation:{boxScale:3,planeIds:null}},arrangement:{id:'arrangement',planes:[[1,0,0,0]],regions:[{}],source:{faceIds:[0,1,2,3]},parameters:{box_scale:3}}},document={id:'doc',states:[state],cursor:0},project={};let release;
  const control=Object.assign(Object.create(StellationCellControls.prototype),{context:{getState:()=>state,getDocument:()=>document,getProject:()=>project,getConfig:()=>state.view.stellation,isExporting:()=>false,run:()=>new Promise(resolve=>release=resolve)},busy:false,job:null,receipt:null,node:()=>({replaceChildren:()=>{}}),sync:()=>{},render:()=>{}});
  const pending=control.evaluate();edit(state);release({algorithmVersion:'0.1.0',sourceId:'source',arrangementId:'arrangement',nodes:[{}],links:[],arrangementSha256:'owned'});await assert.rejects(pending);assert.equal(control.receipt,null);
 }
});
