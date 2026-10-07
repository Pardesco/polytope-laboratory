import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {catalogMatches} from '../ui/catalog-query.mjs';
import {SourceReflectionControls,reflectionEligible} from '../ui/source-reflection-controls.mjs';
import {prepareHistoryCommit,verifyHistoryPublication,preserveHistoryObserver} from '../ui/history-workflow.mjs';

const root=process.env.POLYTOPE_TEST_ROOT??fileURLToPath(new URL('../',import.meta.url));
const fixture=JSON.parse(execFileSync('python',['-B','-c',`
import sys,os,json,runpy
from pathlib import Path
import engine
if os.environ.get('POLYTOPE_STAGE_ENGINE'):engine.__path__.insert(0,os.environ['POLYTOPE_STAGE_ENGINE'])
from engine import catalog
catalog.DATA=Path.cwd()/'engine/catalog_data'
from engine import server
from engine.recipes import run_recipe
from engine.element_content_workflow import describe_content
helper=runpy.run_path(os.environ.get('POLYTOPE_STAGE_TESTS','tests/test_uniform_snub_variants.py'))
document=helper['content_document']();result=run_recipe(document,'reflect-source',{'axis':0},server.dispatch,'Reflected source form')
state=result['states'][result['cursor']]
rows=[r for r in catalog.get_catalog() if r['key'].startswith('antiprism-u') or r['key']=='antiprism-skilling']
print(json.dumps({'document':document,'result':result,'descriptor':describe_content(state['model'],state['view']['elementAnnotations']),
 'registry':rows,'skilling':catalog.load_catalog_model('antiprism-skilling')}))
`],{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:8*1024*1024}));
const painted=[];
const canvas=()=>({width:0,height:0,getContext:()=>({clearRect(){},drawImage(){},save(){},restore(){},translate(){},rotate(){},measureText:t=>({width:t.length*7}),fillText:text=>painted.push(text)})});
function actualViewer(model){const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.draw=()=>{};v.stereographicWorkerFactory=()=>null;
 v.cameraProjection='orthographic';v.orthographicCamera=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);v.camera=v.orthographicCamera;
 v.camera.position.set(0,0,5);v.camera.lookAt(0,0,0);v.camera.updateMatrixWorld();v.controls={target:new THREE.Vector3(),update(){}};v.setModel(model);return v;}
const display={angles:[0,0,0,0,0,0],projection:'orthographic',cameraProjection:'orthographic',coordinateUnit:'cm',surfaceColors:'source',surfaceOpacity:1,vertices:true,edges:true,faces:true,fillRule:'nonzero'};

test('named U/name/literal Wythoff searches expose source/reflected forms and explicitly achiral snubs; production Viewer captures retained text/PNG and exceptional source',async()=>{
 const registry=fixture.registry;
 for(const number of [12,29,32,40,46,57,60,64,69,72,74,75]){
  const matches=registry.filter(r=>catalogMatches(r,'"U'+number+'" reflected'));assert.equal(matches.length,1);assert.equal(matches[0].key,'antiprism-u'+number+'-mirror');
  assert.equal(matches[0].chiralityEvidence.complete,true);assert.equal(matches[0].chiral,![32,72,75].includes(number));
 }
 for(const query of ['small snub icosicosidodecahedron reflected','"|5/2 3 3" reflected','|5/233 reflected'])assert.equal(registry.find(r=>catalogMatches(r,query)).key,'antiprism-u32-mirror');
 assert.equal(registry.find(r=>catalogMatches(r,'Skilling')).key,'antiprism-skilling');assert.equal(registry.find(r=>catalogMatches(r,'great disnub dirhombidodecahedron')).key,'antiprism-skilling');
 for(const key of ['antiprism-u1','antiprism-u6','antiprism-u34','antiprism-u75']){const r=registry.find(r=>r.key===key);assert.ok(r.symbol);assert.ok(catalogMatches(r,r.symbol));}
 const state=fixture.result.states[fixture.result.cursor],v=actualViewer(state.model);
 try{v.setDisplay(display);assert.equal(v.fillDiagnostics.length,0);await v.setElementContent(fixture.descriptor,{sourceModel:state.model,makeCanvas:canvas,decodeImage:async()=>({width:2,height:2,close(){}})});
  const sprites=v.elementContentLayer.group.children.filter(o=>o.isSprite);assert.equal(sprites.length,2);const mesh=v.elementContentLayer.group.children.find(o=>o.isMesh);assert.ok(mesh);assert.ok(painted.includes('Original face'));
  assert.equal(mesh.userData.sourceFace,0);assert.equal(mesh.userData.sourceId,state.model.id);
  for(let i=3,a=mesh.geometry.attributes.color.array;i<a.length;i+=4)assert.ok(Math.abs(a[i]-127/255)<1e-7);
  assert.equal((await v.prepareCapture()).elementContent.ready,true);
 }finally{v.clear();}
 const exceptional=actualViewer(fixture.skilling);try{exceptional.setDisplay(display);assert.equal(exceptional.fillDiagnostics.length,0);assert.equal(exceptional.model.faces.length,204);}finally{exceptional.clear();}
});

test('actual reflection recipe controls preserve source owners and history; held model/notes/units/content/selection/export/cancel fences refuse publication',async()=>{
 const replayed=JSON.parse(execFileSync('python',['-B','-c',`
import sys,os,json
from pathlib import Path
import engine
if os.environ.get('POLYTOPE_STAGE_ENGINE'):engine.__path__.insert(0,os.environ['POLYTOPE_STAGE_ENGINE'])
from engine import catalog,server
catalog.DATA=Path.cwd()/'engine/catalog_data'
result=server.dispatch({'op':'recipe-replay','params':{'document':json.load(sys.stdin)}})
print(json.dumps(result))
`],{cwd:root,encoding:'utf8',input:JSON.stringify(fixture.result),windowsHide:true,timeout:30000,maxBuffer:8*1024*1024}));
 assert.deepEqual(replayed.states[replayed.cursor].model,fixture.result.states[fixture.result.cursor].model);
 function context(){const project={active:0,documents:[structuredClone(fixture.document)]};let gate,options,publications=0;
  const c={getProject:()=>project,getDocument:()=>project.documents[project.active],getState:()=>project.documents[project.active].states[project.documents[project.active].cursor],isExporting:()=>c.exporting??false};
  c.commit=async(op,params,label,o)=>{options=o;assert.equal(op,'reflect-source');assert.deepEqual(params,{axis:0});
   const request={...c,verifyPublication:o.verifyPublication,run:async()=>gate?await gate:structuredClone(fixture.result)};
   const prepared=await prepareHistoryCommit(request,op,params,label);verifyHistoryPublication(request,prepared);preserveHistoryObserver(prepared);project.documents[prepared.index]=prepared.result;publications++;return prepared.result;};
  return {c,project,hold:promise=>{gate=promise;},get options(){return options;},get publications(){return publications;}};
 }
 const good=context(),originalState=good.c.getState(),before=structuredClone(originalState),controls=new SourceReflectionControls(good.c,{mount:false});await controls.reflect(0);
 assert.deepEqual(originalState,before);assert.deepEqual(good.project.documents[0].states[0].model,before.model);assert.equal(good.c.getState().notes,before.notes);assert.equal(good.c.getState().view.coordinateUnit,'cm');assert.equal(good.publications,1);
 for(const change of [f=>{f.c.getState().model.metadata.offColors.faces[0].values[0]++;},f=>{f.c.getState().notes+=' changed';},f=>{f.c.getState().view.coordinateUnit='mm';},f=>{f.c.getState().view.elementAnnotations.entries[0].text.markup='<b>changed</b>';},f=>{f.project.active=1;f.project.documents.push(structuredClone(fixture.document));},f=>{f.c.exporting=true;},f=>{f.controls.cancel();}]){
  const f=context();f.controls=new SourceReflectionControls(f.c,{mount:false});let release;f.hold(new Promise(resolve=>{release=resolve;}));const pending=f.controls.reflect();await Promise.resolve();change(f);release(structuredClone(fixture.result));
  await assert.rejects(pending,/changed|Source|source|export|canceled/);assert.equal(f.publications,0);assert.equal(f.controls.busy,false);
 }
 assert.equal(reflectionEligible(fixture.skilling),true);assert.equal(reflectionEligible({...fixture.skilling,dimension:4,embeddingDimension:4}),false);
 await assert.rejects(controls.reflect(true),/coordinate reflection plane/);
});
