import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {WorkspaceNumericControls} from '../ui/workspace-numeric-controls.mjs';
import {Viewer} from '../ui/viewer.js';

const root=process.env.POLYTOPE_TEST_ROOT??fileURLToPath(new URL('../',import.meta.url));
const fixtures=JSON.parse(execFileSync('python',['-B','-c',`
import sys,os,json,runpy
from pathlib import Path
import engine
if os.environ.get('POLYTOPE_STAGE_ENGINE'):engine.__path__.insert(0,os.environ['POLYTOPE_STAGE_ENGINE'])
from engine import server
from engine.generators import regular
from engine.catalog import load_catalog_model
from engine.recipes import run_recipe
test_file=Path(os.environ['POLYTOPE_STAGE_ENGINE']).parent/'production-tests/test_incidence_dual_4d.py' if os.environ.get('POLYTOPE_STAGE_ENGINE') else Path('tests/test_incidence_dual_4d.py')
helper=runpy.run_path(str(test_file))
p=helper['color_source'](helper['literal_concave_4d_boundary']())
state={'model':p,'view':{'coordinateUnit':'cm','angles':[0]*6,'derivedMode':'section'},'notes':'Literal source notes'}
doc={'id':'source-doc','cursor':0,'states':[state]}
result=run_recipe(doc,'incidence-dual',{'center':[1.25,1.25,0,0],'radius':2},server.dispatch)
star=helper['color_source'](load_catalog_model('miratope-grand-hexacosichoron'))
print(json.dumps({'document':doc,'result':result,'tesseract':server.dispatch({'op':'incidence-dual','model':helper['color_source'](regular('tesseract')),'params':{}}),'star':server.dispatch({'op':'incidence-dual','model':star,'params':{}})}))
`],{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:16*1024*1024}));

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){
  let document=structuredClone(fixtures.document);const project={active:0,documents:[document]},nodes={'incidence-dual-center':{value:'5/4, 5/4, 0, 0'},'incidence-dual-radius':{value:'sqrt(4)'}};
  const calls=[];const context={getState:()=>document.states[document.cursor],getDocument:()=>document,getProject:()=>project,isExporting:()=>false,getInput:id=>nodes[id],
    evaluateMany:async expressions=>{calls.push(['expressions',expressions]);return expressions.map(x=>({'sqrt(4)':2,'5/4':1.25,'0':0})[x]??Number(x));},
    commit:async(op,params,label,options)=>{options.verifyPublication();assert.equal(op,'incidence-dual');assert.deepEqual(params,{radius:2,center:[1.25,1.25,0,0]});calls.push(['commit',op,params]);options.verifyPublication();document=structuredClone(fixtures.result);project.documents[0]=document;return document;}};
  return {context,calls,nodes,get document(){return document;},controls:new WorkspaceNumericControls(context)};
}

test('four-coordinate numeric construction adopts actual native full-cell dual and fences held source/field changes',async()=>{
  const f=fixture(),source=structuredClone(f.document.states[0]);const output=await f.controls.incidenceDual();
  assert.deepEqual(f.calls[0],['expressions',['sqrt(4)','5/4','5/4','0','0']]);assert.equal(output.cursor,1);
  const state=output.states[1];assert.deepEqual(output.states[0].model,source.model);assert.equal(state.notes,source.notes);assert.equal(state.view.coordinateUnit,'cm');assert.equal(state.view.derivedMode,'incidence-dual');
  assert.deepEqual(state.model.provenance.parameters,{center:[1.25,1.25,0,0],radius:2});assert.equal(state.model.cells.length,24);
  for(const change of ['notes','RGBA','target','cancel']){
    const g=fixture(),gate=deferred(),evaluate=g.context.evaluateMany;g.context.evaluateMany=async x=>{await gate.promise;return evaluate(x);};const pending=g.controls.incidenceDual();
    if(change==='notes')g.document.states[0].notes='Changed';
    if(change==='RGBA')g.document.states[0].model.metadata.offColors.cells[0].values[3]=126;
    if(change==='target')g.nodes['incidence-dual-center'].value='0,0,0,0';
    if(change==='cancel')g.controls.cancel();gate.resolve();
    await assert.rejects(pending,/changed|Canceled|cancel/i);assert.equal(g.document.cursor,0);assert.equal(g.calls.filter(c=>c[0]==='commit').length,0);
  }
  const wrong=fixture();wrong.nodes['incidence-dual-center'].value='0,0,0';await assert.rejects(()=>wrong.controls.incidenceDual(),/4 expressions/i);assert.equal(wrong.calls.length,0);
});

function viewer(model){
  const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.draw=()=>{};v.stereographicWorkerFactory=()=>null;
  v.cameraProjection='orthographic';v.orthographicCamera=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);v.camera=v.orthographicCamera;
  v.camera.position.set(0,0,5);v.camera.lookAt(0,0,0);v.camera.updateMatrixWorld();v.controls={target:new THREE.Vector3(),update(){}};v.setModel(model);return v;
}
test('actual Viewer publishes complete convex/nonconvex/star 4D dual cells with literal colors and capture readiness',async()=>{
  for(const model of [fixtures.tesseract,fixtures.result.states[1].model,fixtures.star]){
    const source=structuredClone(model),v=viewer(model);
    try{
      v.setDisplay({angles:[0,0,24,0,18,0],projection:'orthographic',cameraProjection:'orthographic',vertices:true,edges:true,faces:true,fillRule:'nonzero',cellFacing:'all',cellShrink:1,surfaceColors:'source',surfaceOpacity:.5});
      assert.equal(v.visibility.activeCells.length,model.cells.length);assert.ok(v.triangles.length>0);assert.equal(v.surfaceGeometry.attributes.color.itemSize,4);
      for(let i=3,a=v.surfaceGeometry.attributes.color.array;i<a.length;i+=4)assert.ok(Math.abs(a[i]-127/255)<1e-7);
      assert.equal(model.metadata.elementSourceMaps.cells.length,model.cells.length);assert.ok(v.publishedPickState);assert.ok(await v.prepareCapture());assert.deepEqual(model,source);
    }finally{v.clear();}
  }
});
