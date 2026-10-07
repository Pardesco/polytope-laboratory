import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {DualMorphSession,MORPH_SUPPORTED,morphEligible} from '../ui/dual-morph-session.mjs';
import {planMorphElementContent} from '../ui/morph-element-content.mjs';
import {renderMorphElementContent} from '../ui/morph-element-content-renderer.mjs';
import {morphSourceOwners} from '../ui/dual-morph-picking.mjs';

const root=process.env.POLYTOPE_TEST_ROOT??fileURLToPath(new URL('../',import.meta.url));
const fixtures=JSON.parse(execFileSync('python',['-B','-c',`
import sys,os,json,base64,runpy
from pathlib import Path
import engine
if os.environ.get('POLYTOPE_STAGE_ENGINE'):engine.__path__.insert(0,os.environ['POLYTOPE_STAGE_ENGINE'])
from engine import server
from engine.generators import regular
from engine.geometry import identity
from engine.catalog import load_catalog_model
from engine import element_annotations as content
from engine.element_content_workflow import describe_content
helper=runpy.run_path('tests/test_incidence_dual_4d.py')
asset=next(iter(json.loads(Path('tests/fixtures/element-content-native-fixture.json').read_text(encoding='utf-8'))['descriptor']['assets'].values()))
tess=regular('tesseract');tess['interpretation']='generalized-complex';tess['fingerprint']=identity(tess)
results=[]
for p in [helper['literal_concave_4d_boundary'](),tess,load_catalog_model(helper['STAR'])]:
 p=helper['color_source'](p);doc=content.new_document(p)
 for kind in ['vertex','edge','face','cell']:doc=content.set_text(doc,p,kind,0,'<b>'+kind+'</b>',{'offsetMm':[1,2],'rotationDeg':7,'lineHeightMm':4})
 setting={'version':1,'enabled':True,'method':'expansion','center':None,'radius':1.,'ratio':.25,'duration':2.,'loop':False};context={'notes':'Literal source notes','unit':'mm'}
 prepared=server.dispatch({'op':'prepare-dual-morph','model':p,'params':{'settings':setting,'sourceContext':context}})
 frames={str(t):server.dispatch({'op':'evaluate-dual-morph','model':p,'params':{'prepared':prepared,'ratio':t,'sourceContext':context}}) for t in ([.25] if p is not tess and p['id']!= 'literal-concave-4d' else [0,.25,.75,1])}
 rejected=None
 if p['id']=='literal-concave-4d':
  try:server.dispatch({'op':'evaluate-dual-morph','model':p,'params':{'prepared':prepared,'ratio':1-1e-12,'sourceContext':context}})
  except Exception as error:rejected=str(error)
 png=content.set_texture(doc,p,0,base64.b64decode(asset['base64']))
 results.append({'source':p,'document':doc,'descriptor':describe_content(p,doc),'pngDocument':png,'pngDescriptor':describe_content(p,png),'prepared':prepared,'frames':frames,'nearEndpointDiagnostic':rejected})
print(json.dumps(results))
`],{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:24*1024*1024}));

const canvas=()=>({width:0,height:0,getContext:()=>({clearRect(){},drawImage(){},save(){},restore(){},translate(){},rotate(){},measureText:t=>({width:t.length*7}),fillText(){}})});
const view=()=>({angles:[17,23,31,11,19,13],projection:'orthographic',cameraProjection:'orthographic',vertices:true,edges:true,faces:true,fillRule:'nonzero',surfaceColors:'source',surfaceOpacity:1,cellFacing:'all',cellShrink:1,coordinateUnit:'mm'});
function actualViewer(source){
 const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.draw=()=>{};v.stereographicWorkerFactory=()=>null;
 v.cameraProjection='orthographic';v.orthographicCamera=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);v.camera=v.orthographicCamera;
 v.camera.position.set(0,0,5);v.camera.lookAt(0,0,0);v.camera.updateMatrixWorld();v.controls={target:new THREE.Vector3(),update(){}};v.bindControls=()=>{};v.setModel(source);return v;
}
const contentOptions=(state,descriptor)=>({getState:()=>state,isCurrent:()=>true,describe:async()=>structuredClone(descriptor),makeCanvas:canvas,decodeImage:async()=>({width:2,height:2,close(){}})});

test('literal 4D generalized ownership maps follow all source ranks; only complete affine original face sheets carry PNG',async()=>{
 for(const f of fixtures){
  assert.deepEqual(MORPH_SUPPORTED.filter(method=>morphEligible(f.source,method)),['expansion']);const frame=f.frames['0.25'];
  if(frame.model.vertices.length===2400){
   // Complete native geometry is supported. Its attributed frame exceeds
   // the existing portable annotation signature work cap; retain that cap
   // and diagnose content atomically rather than silently dropping it.
   assert.throws(()=>planMorphElementContent(f.source,frame,f.descriptor.entries),/Source work bound exceeded/);
   assert.equal(frame.sourceMaps.cells.length,2640);continue;
  }
  const plan=planMorphElementContent(f.source,frame,f.descriptor.entries);assert.equal(plan.labels.size,4);
  assert.equal(plan.labels.get('vertex:0').length,frame.sourceMaps.vertices.filter(m=>m.sourceVertex===0).length);
  assert.equal(plan.labels.get('cell:0').length,1);
  for(const kind of ['vertex','edge','face','cell']){const list=frame.sourceMaps[{vertex:'vertices',edge:'edges',face:'faces',cell:'cells'}[kind]];
   for(let i=0;i<list.length;i++)assert.ok(morphSourceOwners(frame,kind,i).length>=1);}
  const png=planMorphElementContent(f.source,frame,f.pngDescriptor.entries);assert.equal(png.sheets.get(0).size,2);
  assert.ok(frame.sourceMaps.faces.some(m=>m.dualRank===1&&m.dualOriginElement===0&&m.sourceSheetFace===null),'Mixed rectangles legitimately own the face factor but are not its image sheet.');
  for(const index of png.sheets.get(0).keys()){assert.equal(frame.sourceMaps.faces[index].sourceSheetFace,0);assert.equal(frame.sourceMaps.faces[index].sourceRank,2);}
 }
 // Actual production Viewer/presentation/content renderer: a literal concave
 // boundary and a generalized tesseract. Star ownership math is covered above.
 for(const original of fixtures.slice(0,2)){
  const f=structuredClone(original),state={model:f.source,view:{...view(),elementAnnotations:f.document},notes:'Literal source notes'},v=actualViewer(f.source);
  try{
   await renderMorphElementContent(v,f.frames['0.25'],state,contentOptions(state,f.descriptor));
   const sprites=v.elementContentLayer.group.children.filter(o=>o.isSprite);for(const kind of ['vertex','edge','face','cell'])assert.ok(sprites.some(s=>s.userData.sourceKind===kind));
   for(const s of sprites){const ids=s.userData.instanceVertexIds,expected=v.projected[ids[0]].point.map((_,k)=>ids.reduce((sum,id)=>sum+v.projected[id].point[k]/ids.length,0));expected.forEach((x,k)=>assert.ok(Math.abs(s.position.toArray()[k]-x)<1e-7));assert.equal(s.userData.sourceId,f.source.id);}
   assert.equal((await v.prepareCapture()).elementContent.ready,true);
   state.view.elementAnnotations=f.pngDocument;await renderMorphElementContent(v,f.frames['0.75'],state,contentOptions(state,f.pngDescriptor));
   const mesh=v.elementContentLayer.group.children.find(o=>o.isMesh);assert.ok(mesh);assert.equal(mesh.userData.sourceFace,0);
   for(let i=3,a=mesh.geometry.attributes.color.array;i<a.length;i+=4)assert.ok(Math.abs(a[i]-127/255)<1e-7);
   assert.equal((await v.prepareCapture()).elementContent.ready,true);
   const priorModel=v.model,priorLayer=v.elementContentLayer;
   await assert.rejects(()=>renderMorphElementContent(v,f.frames['1'],state,contentOptions(state,f.pngDescriptor)),/PNG has no output face/);
   assert.strictEqual(v.model,priorModel);assert.strictEqual(v.elementContentLayer,priorLayer);
   const corrupt=structuredClone(f.frames['0.75']),index=[...v.elementContentLayer.morphPlan.sheets.get(0).keys()][0];corrupt.model.vertices[corrupt.model.faces[index][2]][0]+=.15;
   assert.throws(()=>planMorphElementContent(f.source,corrupt,f.pngDescriptor.entries),/affine source sheet/);
   const dishonest=structuredClone(f.frames['0.25']);for(const owner of dishonest.sourceMaps.faces)if(owner.sourceRank===1&&owner.dualRank===1&&owner.dualOriginElement===0)owner.sourceSheetFace=0;
   assert.throws(()=>planMorphElementContent(f.source,dishonest,f.pngDescriptor.entries),/source-corner correspondence|ordered source cycle/);
  }finally{v.clear();}
 }
});

test('actual native 4D session retains prior display/annotations/settings on unresolved pose; literal endpoints reverse rank ownership',async()=>{
 const f=structuredClone(fixtures[0]),state={model:f.source,view:{...view(),elementAnnotations:f.document},notes:'Literal source notes'};
 const doc={id:'doc',cursor:0,states:[state]},project={active:0,documents:[doc]},v=actualViewer(f.source),before=structuredClone(state);
 const session=new DualMorphSession({mappedContent:true,getState:()=>state,getDocument:()=>doc,getProject:()=>project,isExporting:()=>false,
  prepare:async()=>structuredClone(f.prepared),evaluate:async(m,p,t)=>{if(!f.frames[String(t)])throw Error(f.nearEndpointDiagnostic);return structuredClone(f.frames[String(t)]);},
  render:async(frame,o)=>renderMorphElementContent(v,frame,state,{...contentOptions(state,f.descriptor),...o}),
  clear:()=>v.clearMorph(f.source,state.view),prepareCapture:()=>v.prepareCapture(),markDirty(){},onState(){}});
 try{
  await session.configure(f.prepared.settings);await session.seek(.75);await session.prepareCapture();assert.equal(v.morphFrame.ratio,.75);
  const priorModel=v.model,priorLayer=v.elementContentLayer,priorSettings=structuredClone(state.view.dualMorph);
  await assert.rejects(()=>session.seek(1-1e-12),/near-collapsed|unresolved/);assert.strictEqual(v.model,priorModel);assert.strictEqual(v.elementContentLayer,priorLayer);assert.deepEqual(state.view.dualMorph,priorSettings);
  await session.seek(1);assert.deepEqual(v.model,f.prepared.descriptor.dual);assert.equal(v.elementContentLayer.group.children.filter(o=>o.isSprite).length,4);
  const reciprocal=planMorphElementContent(f.source,f.frames['1'],f.descriptor.entries);for(const [key,occurrences] of reciprocal.labels){assert.equal(occurrences.length,1);assert.equal(occurrences[0].outputRank,3-['vertex','edge','face','cell'].indexOf(key.split(':')[0]));}
  await session.seek(0);assert.deepEqual(v.model,f.source);assert.deepEqual(state.model,before.model);assert.deepEqual(state.view.elementAnnotations,before.view.elementAnnotations);
  state.view.elementAnnotations.entries[0].text.markup='changed';assert.throws(()=>session.seek(.25),/annotations changed/);assert.equal(v.morphFrame.ratio,0);
  state.view.elementAnnotations=before.view.elementAnnotations;session.reset();assert.equal(state.view.dualMorph.enabled,false);
 }finally{v.clear();}
});
