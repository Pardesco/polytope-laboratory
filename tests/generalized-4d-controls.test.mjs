import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {IncidenceTruncationControls} from '../ui/incidence-truncation-controls.mjs';
import {DerivedViewControls,derivedInputKey} from '../ui/derived-view-controls.mjs';
import {Viewer} from '../ui/viewer.js';

function cutFixture(){
  const nodes=Object.fromEntries(Object.entries({preset:'normal',amount:'1/3',reference:'',colors:'inherit'}).map(([id,value])=>['incidence-cut-'+id,{value}]));
  nodes['incidence-cut-preset'].options=['normal','quasi','rectify','manual'].map(value=>({value}));
  for(const id of ['preview-incidence-cut','adopt-incidence-cut','cancel-incidence-cut','incidence-cut-result'])nodes[id]={textContent:'',disabled:false};
  const model={id:'source4',dimension:4,embeddingDimension:4,interpretation:'generalized-complex',
    vertices:[[0,0,0,0],[1,0,0,0],[0,1,0,0],[0,0,1,0]],edges:[[0,1],[1,2],[0,2],[0,3],[1,3],[2,3]],
    faces:[[0,1,2],[0,1,3],[1,2,3],[0,2,3]],cells:[[0,1,2,3]],metadata:{coordinateUnits:'mm'}};
  const state={model,view:{coordinateUnit:'mm'},notes:'Original'},doc={id:'doc',cursor:0,states:[state]},project={active:0,documents:[doc]},calls=[];
  const context={getState:()=>state,getDocument:()=>doc,getProject:()=>project,isExporting:()=>false,
    evaluateMany:async inputs=>inputs.map(t=>t==='1/3'?1/3:Number(t)),
    preview:async(op,params,options)=>{options.verifyPublication();calls.push([op,params]);
      const construction={sourceModelId:model.id,sourceModel:structuredClone(model),parameters:{amount:params.amount},closedIncidence:true,hullUsed:false,solidInteriorInferred:false};
      return {construction,model:{...structuredClone(model),vertices:Array(20).fill([]),faces:Array(30).fill([]),cells:Array(10).fill([]),validation:{passed:true},metadata:{incidenceTruncation:structuredClone(construction)}}};},
    commit:async(op,params,label,options)=>{options.verifyPublication();calls.push([op,params]);return 'adopted';}};
  const panel={querySelector:s=>nodes[s.slice(1)],querySelectorAll:()=>Object.values(nodes)};
  const controls=Object.assign(Object.create(IncidenceTruncationControls.prototype),{context,panel,busy:false,previewData:null});controls.sync();
  return {controls,nodes,state,context,calls};
}

test('4D cut controls select admissible presets, evaluate expressions and adopt through history callback',async()=>{
  const f=cutFixture();assert.equal(f.nodes['incidence-cut-preset'].value,'manual');
  assert.deepEqual(f.nodes['incidence-cut-preset'].options.filter(n=>n.disabled).map(n=>n.value),['normal','quasi']);
  await f.controls.preview();assert.equal(f.calls[0][1].amount,1/3);assert.match(f.nodes['incidence-cut-result'].textContent,/10 cells/);
  assert.equal(await f.controls.adopt(),'adopted');assert.equal(f.calls[1][0],'incidence-truncate');
  f.nodes['incidence-cut-preset'].value='rectify';await f.controls.preview();assert.equal(f.calls[2][1].amount,.5);
  f.nodes['incidence-cut-preset'].value='manual';f.nodes['incidence-cut-amount'].value='0';await assert.rejects(f.controls.preview(),/declared domain/i);
  f.nodes['incidence-cut-amount'].value='.6';await assert.rejects(f.controls.preview(),/declared domain/i);
});

test('4D preview loses adoption authority after source attributes or depth change',async()=>{
  const f=cutFixture();await f.controls.preview();f.state.notes='changed';
  await assert.rejects(f.controls.adopt(),/changed/);assert.equal(f.calls.length,1);
  const g=cutFixture();await g.controls.preview();g.nodes['incidence-cut-amount'].value='.4';
  await assert.rejects(g.controls.adopt(),/changed/);assert.equal(g.calls.length,1);
});

test('vertex-figure selectors persist applied settings and enter derived request ownership',()=>{
  const nodes=new Map(),getInput=id=>{if(!nodes.has(id))nodes.set(id,{value:''});return nodes.get(id);};
  const state={model:{dimension:4,vertices:Array(16).fill([])},view:{derivedMode:'vertex-figure',entity:0}};let invalidated=0,dirty=0,refresh=0,exporting=false;
  const controls=new DerivedViewControls({getInput,getState:()=>state,guard:f=>f,isExporting:()=>exporting,getDerived:()=>null,
    invalidate:()=>invalidated++,markDirty:()=>dirty++,refreshDerived:()=>refresh++});
  controls.sync();assert.equal(getInput('vertex-figure-mode').value,'slicing');assert.equal(getInput('vertex-figure-placement').disabled,true);
  const before=derivedInputKey(state.view);getInput('vertex-figure-mode').value='combinatorial';getInput('vertex-figure-mode').onchange();
  assert.equal(state.view.vertexFigureMode,'combinatorial');assert.notEqual(derivedInputKey(state.view),before);
  assert.equal(getInput('vertex-figure-placement').disabled,false);
  getInput('vertex-figure-placement').value='unit-distance';getInput('vertex-figure-placement').onchange();
  assert.equal(state.view.vertexFigurePlacement,'unit-distance');assert.equal(invalidated,2);assert.equal(dirty,2);assert.equal(refresh,2);
  exporting=true;getInput('vertex-figure-mode').value='slicing';assert.throws(()=>getInput('vertex-figure-mode').onchange(),/export/);
  assert.equal(state.view.vertexFigureMode,'combinatorial');
});

test('native star net displays intact pentagrams, shrink and matching face copies in production Viewer',()=>{
  const bootstrap=`import json\nfrom engine import server\nfrom engine.catalog import load_catalog_model\nm=load_catalog_model('miratope-stellated-hecatonicosachoron')\nprint(json.dumps(server.dispatch({'op':'cell-net','model':m})))`;
  const net=JSON.parse(execFileSync('python',['-B','-c',bootstrap],{cwd:fileURLToPath(new URL('../',import.meta.url)),windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024}));
  assert.equal(net.cells.length,120);assert.equal(net.cellQualification.starFacesRepresented,720);
  const v=Object.create(Viewer.prototype);v.group=new THREE.Group();
  try{
    v.setCellNet(net,.7);assert.equal(v.cellFaceOwners.length,1440);assert.equal(v.model.faces.length,1440);
    assert.ok(v.sourceTriangles.length>1440);assert.equal(v.fillDiagnostics.length,0);
    let selected;v.select=ids=>selected=ids;v.selectCellSource('face',0);
    assert.equal(v.cellFaceOwners.filter(o=>o.face===0).length,2);assert.equal(selected.length,10);
    assert.equal(new Set(selected.map(i=>v.cellVertexSources[i])).size,5);
    const before=structuredClone(net.cells);v.setCellNet(net,.3);assert.deepEqual(net.cells,before);
  }finally{v.clear();}
});
