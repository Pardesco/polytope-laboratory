import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {OrdinaryCellSectionWorkflow} from '../ui/ordinary-cell-section-workflow.mjs';
import {AnimationRenderer} from '../ui/animation-renderer.mjs';
import {createAnimatedTourLayerFactory} from '../ui/animated-tour-layer.mjs';

const root=process.env.POLYTOPE_TEST_ROOT??fileURLToPath(new URL('../',import.meta.url));
const fixtures=JSON.parse(execFileSync('python',['-B','-c',`
import sys,os,json,runpy
from pathlib import Path
import engine
if os.environ.get('POLYTOPE_STAGE_ENGINE'):engine.__path__.insert(0,os.environ['POLYTOPE_STAGE_ENGINE'])
from engine import server,element_annotations as content
from engine.recipes import run_recipe
from engine.generators import regular
from engine.geometry import identity,validate
helper=runpy.run_path(os.environ.get('POLYTOPE_STAGE_TESTS','tests/test_ordinary_cell_sections.py'))
results=[]
tess=regular('tesseract');tess['interpretation']='generalized-complex';tess.pop('measure',None);tess['fingerprint']=identity(tess);tess['validation']=validate(tess)
for p,normal in [(helper['color'](helper['literal']()),[0,0,0,1]),(helper['color'](tess),[0,0,0,1]),(helper['hole_source'](),[0,0,1,0])]:
 annotations=content.set_text(content.new_document(p),p,'cell',0,'Original source label')
 state={'model':p,'view':{'coordinateUnit':'cm','derivedMode':'cell-section','sectionNormal':normal,'sectionOffset':0,'fillRule':'nonzero','elementAnnotations':annotations},'notes':'Literal source notes'}
 document={'id':'source','cursor':0,'states':[state]};params={'normal':normal,'offset':0,'fill_rule':'nonzero','section_domain':'ordinary-cells'}
 result=server.dispatch({'op':'section','model':p,'params':params})
 history=run_recipe(document,'section',params,server.dispatch,'Promote complete ordinary 4D cell section')
 moved=server.dispatch({'op':'section','model':p,'params':{**params,'offset':.4}})
 results.append({'state':state,'document':document,'params':params,'result':result,'history':history,'moved':moved})
print(json.dumps(results))
`],{cwd:root,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024}));
const display={angles:[0,0,0,0,0,0],projection:'orthographic',cameraProjection:'orthographic',vertices:true,edges:true,faces:true,surfaceColors:'source',surfaceOpacity:1,cellFacing:'all',cellShrink:1,fillRule:'nonzero'};
function actualViewer(source){const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.draw=()=>{};v.stereographicWorkerFactory=()=>null;
 v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);v.orthographicCamera=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);v.cameraProjection='orthographic';v.camera=v.orthographicCamera;v.controls={target:new THREE.Vector3(),update(){}};v.bindControls=()=>{};v.setModel(source);return v;}
function context(f){const state=f.state,doc=f.document;doc.states[0]=state;const project={active:0,documents:[doc]},published=[];
 const c={getState:()=>state,getDocument:()=>doc,getProject:()=>project,isExporting:()=>false,
  run:async(op,params)=>structuredClone(op==='section'?f.result:f.history),publishHistory:document=>{published.push(document);project.documents.push(document);}};
 return {state,doc,project,published,c};}

test('native complete concave/holed sections drive production Viewer colors and source-owned history promotion; held source/cancel/result edits refuse',async()=>{
 for(const original of fixtures){const f=structuredClone(original),{state,doc,project,published,c}=context(f),before=structuredClone(doc),workflow=new OrdinaryCellSectionWorkflow(c);
  const result=await workflow.evaluate(f.params);assert.equal(result.status,'ordinary-cell-section');const v=actualViewer(result.model);
  try{
   v.setDisplay(display);assert.equal(v.fillDiagnostics.length,0);assert.ok(v.surfaceGeometry.attributes.position.count>0);
   for(let i=3,a=v.surfaceGeometry.attributes.color.array;i<a.length;i+=4)assert.ok(Math.abs(a[i]-127/255)<1e-7);
   await v.prepareCapture();const promoted=await workflow.promote(result);assert.equal(published.length,1);assert.deepEqual(doc,before);assert.equal(project.documents.length,2);
   const adopted=promoted.states[promoted.cursor];assert.deepEqual(adopted.model,result.model);assert.equal(adopted.notes,state.notes);assert.equal(adopted.view.coordinateUnit,'cm');assert.equal(adopted.view.elementAnnotations.entries.length,0);assert.equal(adopted.view.elementContentDetached.at(-1).document.entries[0].text.markup,'Original source label');
  }finally{v.clear();}
 }
 for(const mutate of ['notes','unit','color','annotation','plane','cancel']){
  const f=structuredClone(fixtures[0]),{state,c}=context(f);let release,published=0;c.publishHistory=()=>published++;c.run=()=>new Promise(r=>release=r);
  const workflow=new OrdinaryCellSectionWorkflow(c),pending=workflow.evaluate(f.params);await new Promise(r=>setImmediate(r));
  if(mutate==='notes')state.notes='changed';else if(mutate==='unit')state.view.coordinateUnit='in';else if(mutate==='color')state.model.metadata.offColors.faces[0].values[3]=126;
  else if(mutate==='annotation')state.view.elementAnnotations.entries[0].text.markup='changed';else if(mutate==='plane')state.view.sectionOffset=.1;else workflow.cancel();
  release(f.result);await assert.rejects(()=>pending,/changed|canceled|superseded/i);assert.equal(published,0);
 }
 const f=structuredClone(fixtures[0]),{c,published}=context(f),workflow=new OrdinaryCellSectionWorkflow(c),result=await workflow.evaluate(f.params);result.model.vertices[0][0]+=.01;
 await assert.rejects(()=>workflow.promote(result),/ownership changed|result.*changed/);assert.equal(published.length,0);
});

test('complete-cell derived mode refreshes depth animation and independent saved tour native routing without changing other mode fences',async()=>{
 const f=structuredClone(fixtures[0]),state=f.state;state.view={...display,...state.view};delete state.view.elementAnnotations;
 let refreshed=0,drawn=0;const base=actualViewer(state.model),derived=actualViewer(f.result.model);derived.draw=()=>drawn++;
 const renderer=new AnimationRenderer({getState:()=>state,viewer:base,netViewer:derived,display(){},refreshSection:async()=>{refreshed++;derived.setModel(f.moved.model);derived.setDisplay(display);}});
 try{await renderer.renderTracks({source:{modelId:state.model.id,fingerprint:state.model.fingerprint},view:{...state.view,sectionOffset:.4},frame:{sectionOffset:.4},foldNet:null,baseExplosion:null},{});assert.equal(refreshed,1);assert.equal(state.view.sectionOffset,.4);assert.strictEqual(derived.model,f.moved.model);assert.ok(drawn>0);}
 finally{base.clear();derived.clear();}
 const calls=[],nodes=[],createElement=()=>({dataset:{},style:{},append(){},remove(){}}),host={append(node){nodes.push(node);}};
 class LayerViewer{constructor(){this.renderer={dispose(){},forceContextLoss(){}};this.controls={dispose(){}};this.model=null;}clear(){}resize(){}setModel(model){this.model=model;}setDisplay(view){this.view=view;}restoreCamera(){}fit(){}draw(){}async prepareCapture(){return {};}}
 let held=false,release;const factory=createAnimatedTourLayerFactory({host,createElement,ViewerClass:LayerViewer,run:async(op,params,model)=>{calls.push({op,params,model});return held?new Promise(resolve=>release=resolve):structuredClone(f.moved);}});
 const layer=factory({slot:0,getState:()=>state,width:320,height:200,isCurrent:()=>true});
 try{await layer.refreshDerived();assert.equal(calls.length,1);assert.equal(calls[0].op,'section');assert.equal(calls[0].params.section_domain,'ordinary-cells');assert.equal(calls[0].params.offset,.4);assert.strictEqual(calls[0].model,state.model);assert.deepEqual(layer.netViewer.model,f.moved.model);
  const previous=layer.netViewer.model;held=true;const pending=layer.refreshDerived();await new Promise(r=>setImmediate(r));state.view.sectionOffset=.6;release(f.result);await assert.rejects(()=>pending,/cancelled/);assert.strictEqual(layer.netViewer.model,previous);
 }
 finally{layer.dispose();}
});


test('owned exporter may read complete sections while construction and promotion remain blocked; lost ownership refuses late replies',async()=>{
 const f=structuredClone(fixtures[0]),{c,published}=context(f);c.isExporting=()=>true;
 const workflow=new OrdinaryCellSectionWorkflow(c);
 await assert.rejects(()=>workflow.evaluate(f.params),/Finish animation export/);
 let owned=true;
 const result=await workflow.evaluate(f.params,{exportOwner:()=>owned});assert.equal(result.status,'ordinary-cell-section');
 await assert.rejects(()=>workflow.promote(result),/during animation export/);assert.equal(published.length,0);
 let release;c.run=()=>new Promise(resolve=>release=resolve);
 const pending=workflow.evaluate(f.params,{exportOwner:()=>owned});await new Promise(resolve=>setImmediate(resolve));owned=false;release(f.result);
 await assert.rejects(()=>pending,/canceled|superseded/);assert.equal(published.length,0);
});
