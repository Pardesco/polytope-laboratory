import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {prepareElementContent} from '../ui/element-content-lifecycle.mjs';
import {createAnimatedTourLayerFactory} from '../ui/animated-tour-layer.mjs';
import {prepareAnimationAdapters} from '../ui/animation-adapters.mjs';
import {AnimationRenderer} from '../ui/animation-renderer.mjs';
import {createSequence} from '../ui/animation.mjs';
const stage=fileURLToPath(new URL('../',import.meta.url));
const fixtures=JSON.parse(execFileSync('python',['-B','-c',`
import json,io,runpy
from PIL import Image
from engine import element_annotations as content
from engine.generators import regular
from engine.ordinary_cell_sections import ordinary_cell_section
from engine.element_content_workflow import describe_content
h=runpy.run_path('tests/test_ordinary_cell_sections.py')
out=[]
for source,normal,offset in [(regular('tesseract'),[0,0,0,1],0),(h['disjoint_source'](),[0,1,0,0],2),(h['hole_source'](),[0,0,1,0],0)]:
 source['metadata']['offColors']={'faces':[{'encoding':'byte','values':[20,80,140,127]} for _ in source['faces']]}
 doc=content.new_document(source)
 for kind,field in [('vertex','vertices'),('edge','edges'),('face','faces'),('cell','cells')]:
  for i in range(len(source[field])):doc=content.set_text(doc,source,kind,i,'<b>'+kind+'</b><sub>'+str(i)+'</sub>')
 result=ordinary_cell_section(source,normal,offset)
 out.append({'source':source,'document':doc,'descriptor':describe_content(source,doc),'result':result,'normal':normal,'offset':offset})
source=out[0]['source'];whole=ordinary_cell_section(source,[0,0,0,1],-1)
face=whole['model']['metadata']['sectionSourceContent']['wholeFaceSheets'][0]['sourceFace']
image=Image.new('RGBA',(2,2));image.putdata([(255,0,0,255),(0,255,0,128),(0,0,255,0),(255,255,0,64)]);data=io.BytesIO();image.save(data,format='PNG')
doc=content.set_texture(content.set_text(content.new_document(source),source,'face',face,'<i>Whole sheet</i>'),source,face,data.getvalue())
out.append({'source':source,'document':doc,'descriptor':describe_content(source,doc),'result':whole,'normal':[0,0,0,1],'offset':-1})
print(json.dumps(out))
`],{cwd:stage,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024}));
const display={angles:[0,0,0,0,0,0],projection:'orthographic',cameraProjection:'orthographic',faces:true,edges:true,vertices:true,fillRule:'nonzero',surfaceColors:'source',surfaceOpacity:1,cellShrink:1,cellFacing:'all'};
const makeCanvas=()=>({width:0,height:0,getContext:()=>({clearRect(){},drawImage(){},save(){},restore(){},translate(){},rotate(){},measureText(t){return {width:t.length*7};},fillText(){}})});
const options={makeCanvas,decodeImage:async()=>({width:2,height:2,close(){}})};
function actualViewer(model){const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.draw=()=>{};v.stereographicWorkerFactory=()=>null;v.bindControls=()=>{};
 v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);v.orthographicCamera=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);v.camera=v.orthographicCamera;v.cameraProjection='orthographic';v.controls={target:new THREE.Vector3(),update(){},dispose(){}};v.renderer={setClearColor(){},dispose(){},forceContextLoss(){}};v.setModel(model);return v;}
const state=f=>({model:f.source,view:{...display,derivedMode:'cell-section',viewportLayout:'split',sectionNormal:f.normal,sectionOffset:f.offset,coordinateUnit:'mm',elementAnnotations:f.document},notes:'Literal notes'});
const sprites=v=>v.elementContentLayer.group.children.filter(o=>o.isSprite);
const receiptKey=o=>`${o.userData.sourceKind}:${o.userData.sourceIndex}`;

test('actual Viewer labels use every native cut owner; split and holed cells retain region identity and text formatting',async()=>{
 for(const original of fixtures.slice(0,3)){
  const f=structuredClone(original),before=JSON.stringify(f.source),v=actualViewer(f.result.model);
  try{v.setDisplay(display);await v.setElementContent(f.descriptor,{...options,sourceModel:f.source});assert.equal(v.elementContentDiagnostic,null);
   const records=f.result.model.metadata.sectionSourceContent.occurrences;assert.equal(sprites(v).length,records.length);
   for(const sprite of sprites(v)){const r=sprite.userData;assert.equal(r.domain,'ordinary-cell-section');assert.equal(r.sourceId,f.source.id);assert.ok(records.some(o=>o.sourceKind===r.sourceKind&&o.sourceIndex===r.sourceIndex&&o.targetKind===r.targetKind&&JSON.stringify(o.targetIds)===JSON.stringify(r.targetIds)));}
   assert.ok(v.elementContentLayer.textures.get('cell:0').entry.runs.some(r=>r.style.bold));
   if(f.normal[1]){const caps=sprites(v).filter(o=>receiptKey(o)==='cell:0');assert.equal(caps.length,2);assert.notEqual(caps[0].userData.component,caps[1].userData.component);}
   if(f.normal[2]){const caps=sprites(v).filter(o=>receiptKey(o)==='cell:0');assert.equal(caps.length,1);assert.equal(caps[0].userData.targetIds.length,8);assert.equal(caps[0].userData.instanceVertexIds.length,3);}
   assert.ok((await v.prepareCapture()).elementContent.ready);v.setDisplay({...display,angles:[13,7,0,3,0,0]});assert.equal(v.elementContentDiagnostic,null);assert.ok((await v.prepareCapture()).elementContent.ready);assert.equal(JSON.stringify(f.source),before);
  }finally{v.clear();}
 }
});

test('whole affine coplanar source face PNG preserves UV/orientation/alpha; transverse mapping and forged source owners refuse atomically',async()=>{
 const f=structuredClone(fixtures[3]),v=actualViewer(f.result.model);
 try{v.setDisplay(display);await v.setElementContent(f.descriptor,{...options,sourceModel:f.source});assert.equal(v.elementContentDiagnostic,null);const mesh=v.elementContentLayer.group.children.find(o=>o.isMesh);assert.ok(mesh);assert.equal(mesh.userData.sourceFace,f.descriptor.entries[0].index);assert.equal(mesh.material.map.flipY,false);for(let i=3,a=mesh.geometry.attributes.color.array;i<a.length;i+=4)assert.ok(Math.abs(a[i]-127/255)<1e-7);assert.ok(sprites(v).every(o=>o.userData.targetKind==='edge'));
  for(const u of mesh.geometry.attributes.uv.array)assert.ok(u>=-1e-6&&u<=1+1e-6);assert.ok((await v.prepareCapture()).elementContent.ready);
  v.setModel(fixtures[0].result.model);v.setDisplay(display);await assert.rejects(v.setElementContent(f.descriptor,{...options,sourceModel:f.source}),/no surviving whole affine/);assert.equal(v.elementContentLayer.group.children.length,0);await assert.rejects(v.prepareCapture(),/whole affine/);
  const bad=structuredClone(fixtures[0].result.model);bad.metadata.sectionSourceContent.occurrences[0].sourceIndex=0;bad.metadata.sectionSourceContent.occurrences[0].sourceKind='vertex';v.setModel(bad);await assert.rejects(v.setElementContent(fixtures[0].descriptor,{...options,sourceModel:f.source}),/differ/);
 }finally{v.clear();}
});

test('held PNG decoding and native preparation cannot publish after source color/content/unit/notes or renderer ownership changes',async()=>{
 const f=structuredClone(fixtures[3]),v=actualViewer(f.result.model);let release;
 try{const pending=v.setElementContent(f.descriptor,{...options,sourceModel:f.source,decodeImage:()=>new Promise(r=>release=r)});while(!release)await new Promise(r=>setImmediate(r));f.source.metadata.changed=true;release({width:2,height:2,close(){}});await assert.rejects(pending,/source|ownership/i);assert.equal(v.elementContentLayer.group.children.length,0);}finally{v.clear();}
 for(const field of ['notes','coordinateUnit','elementAnnotations']){
  const x=structuredClone(fixtures[0]),s=state(x),viewer=actualViewer(x.result.model);viewer.setElementContent=((base)=> (descriptor,o)=>base.call(viewer,descriptor,{...options,...o}))(Viewer.prototype.setElementContent);
  let finish;const pending=prepareElementContent(viewer,s,{describe:()=>new Promise(r=>finish=r)});while(!finish)await new Promise(r=>setImmediate(r));if(field==='notes')s.notes='changed';else if(field==='coordinateUnit')s.view.coordinateUnit='in';else s.view.elementAnnotations.entries[0].text.markup='changed';finish(x.descriptor);await assert.rejects(pending,/changed|cancel/i);viewer.clear();
 }
});

test('saved section depth animation and independent tour layers prepare actual native mapped content without a morph ratio',async()=>{
 const f=structuredClone(fixtures[0]),s=state(f);s.view.sectionNormal=[.2,.3,.4,1];s.view.animation=createSequence(s.view,1,2);s.view.animation.keyframes[1].sectionOffset=.4;
 const section=params=>JSON.parse(execFileSync('python',['-B','-c',`import json,sys;from engine.ordinary_cell_sections import ordinary_cell_section;r=json.load(sys.stdin);print(json.dumps(ordinary_cell_section(r['source'],r['normal'],r['offset'])))`],{cwd:stage,windowsHide:true,input:JSON.stringify({source:s.model,normal:s.view.sectionNormal,offset:params.offset}),encoding:'utf8',timeout:10000,maxBuffer:8*1024*1024}));
 const calls=[],created=[],nodes=[],createElement=()=>({dataset:{},style:{},append(){},remove(){}});
 class LayerViewer{constructor(){const v=actualViewer(null);v.resize=()=>{};v.fit=()=>{};v.restoreCamera=()=>{};v.setElementContent=((base)=>(descriptor,o)=>base.call(v,descriptor,{...options,...o}))(Viewer.prototype.setElementContent);created.push(v);return v;}}
 const run=async(op,params)=>{calls.push(op);return op==='section'?section(params):structuredClone(f.descriptor);};
 const factory=createAnimatedTourLayerFactory({host:{append(n){nodes.push(n);}},createElement,ViewerClass:LayerViewer,run}),layer=factory({slot:0,getState:()=>s,width:320,height:240,isCurrent:()=>true});
 try{layer.viewer.setModel(s.model);await layer.refreshDerived();assert.ok(sprites(layer.netViewer).length);const oldModel=layer.netViewer.model;
  const session=await prepareAnimationAdapters({state:s}),renderer=new AnimationRenderer({getState:()=>s,...layer,display(){layer.viewer.setDisplay(s.view);}});
  await session.apply(1,(pose,o)=>renderer.renderTracks(pose,o));assert.equal(s.view.sectionOffset,.4);assert.notDeepEqual(layer.netViewer.model.vertices,oldModel.vertices);assert.ok(sprites(layer.netViewer).length);assert.ok((await layer.netViewer.prepareCapture()).elementContent.ready);
  await session.restore((pose,o)=>renderer.renderTracks(pose,o));assert.equal(s.view.sectionOffset,0);assert.deepEqual(layer.netViewer.model.vertices,oldModel.vertices);assert.ok(calls.filter(op=>op==='element-content-describe').length>=2);session.destroy();s.view.sectionOffset=3;await layer.refreshDerived();assert.equal(layer.netViewer.model,null);assert.equal((await layer.netViewer.prepareCapture()).complete,true);s.view.elementAnnotations=structuredClone(fixtures[3].document);await assert.rejects(layer.netViewer.prepareCapture(),/PNG.*no surviving whole affine/);
 }finally{layer.dispose();}
});
