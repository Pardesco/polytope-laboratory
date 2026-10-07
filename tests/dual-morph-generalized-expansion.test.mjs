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
import sys,os,json,base64,tempfile
from pathlib import Path
import engine
if os.environ.get('POLYTOPE_STAGE_ENGINE'):engine.__path__.insert(0,os.environ['POLYTOPE_STAGE_ENGINE'])
from engine import server
from engine.generators import regular
from engine.formats import save_project,load_file
from engine import element_annotations as content
from engine.element_content_workflow import describe_content
results=[]
asset=next(iter(json.loads(Path('tests/fixtures/element-content-native-fixture.json').read_text(encoding='utf-8'))['descriptor']['assets'].values()))
for key in ['small-stellated-dodecahedron','great-dodecahedron','great-stellated-dodecahedron','great-icosahedron']:
 p=regular(key);p['metadata'].update(coordinateUnits='mm',historical={'literal':[.125,'retain']},offColors={kind:[{'encoding':'byte','values':[30,60,90,127]} for entry in p[kind]] for kind in ['vertices','edges','faces']})
 doc=content.new_document(p)
 for kind in ['vertex','edge','face']:doc=content.set_text(doc,p,kind,0,'<b>'+kind+'</b>',{'offsetMm':[1,2],'rotationDeg':7,'lineHeightMm':4})
 setting={'version':1,'enabled':True,'method':'expansion','center':None,'radius':1.,'ratio':.25,'duration':2.,'loop':False};context={'notes':'Literal star notes','unit':'mm'}
 prepared=server.dispatch({'op':'prepare-dual-morph','model':p,'params':{'settings':setting,'sourceContext':context}})
 frames={str(t):server.dispatch({'op':'evaluate-dual-morph','model':p,'params':{'prepared':prepared,'ratio':t,'sourceContext':context}}) for t in [0,.25,.75,1]}
 rejected=None
 try:server.dispatch({'op':'evaluate-dual-morph','model':p,'params':{'prepared':prepared,'ratio':1-1e-12,'sourceContext':context}})
 except Exception as error:rejected=str(error)
 project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'literal-doc','cursor':0,'states':[{'model':p,'view':{'coordinateUnit':'mm','elementAnnotations':doc,'dualMorph':prepared['settings']},'notes':context['notes']}]}]}
 with tempfile.TemporaryDirectory() as folder:
  path=Path(folder)/'star.polyproj';save_project(path,project);opened=load_file(path)['project']['documents'][0]['states'][0]
 png=content.set_texture(doc,p,0,base64.b64decode(asset['base64']))
 results.append({'key':key,'source':p,'document':doc,'descriptor':describe_content(p,doc),'pngDocument':png,'pngDescriptor':describe_content(p,png),'prepared':prepared,'frames':frames,'opened':opened,'nearEndpointDiagnostic':rejected})
print(json.dumps(results))
`],{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:8*1024*1024}));

const canvas=()=>({width:0,height:0,getContext:()=>({clearRect(){},drawImage(){},save(){},restore(){},translate(){},rotate(){},measureText:t=>({width:t.length*7}),fillText(){}})});
const view=()=>({angles:[0,0,0,0,0,0],projection:'orthographic',cameraProjection:'orthographic',vertices:true,edges:true,faces:true,fillRule:'nonzero',surfaceColors:'source',surfaceOpacity:1,cellFacing:'all',cellShrink:1,coordinateUnit:'mm'});
function actualViewer(source){
  const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.draw=()=>{};v.stereographicWorkerFactory=()=>null;
  v.cameraProjection='orthographic';v.orthographicCamera=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);v.camera=v.orthographicCamera;
  v.camera.position.set(0,0,5);v.camera.lookAt(0,0,0);v.camera.updateMatrixWorld();v.controls={target:new THREE.Vector3(),update(){}};v.setModel(source);return v;
}
test('four regular stars expose only supported generalized expansion and source-owned moving text/PNG capture',async()=>{
  for(const original of fixtures){const f=structuredClone(original),before=structuredClone(f.source),v=actualViewer(f.source),display=view();
    assert.deepEqual(MORPH_SUPPORTED.filter(method=>morphEligible(f.source,method)),['sizing','expansion']);assert.equal(morphEligible({...f.source,dimension:4,embeddingDimension:4},'sizing'),false);
    try{
      const frame=f.frames['0.25'];const plan=planMorphElementContent(f.source,frame,f.descriptor.entries);assert.equal(plan.labels.size,3);
      for(const kind of ['vertex','edge','face'])assert.equal(plan.labels.get(kind+':0').length,kind==='edge'?4:kind==='vertex'?f.source.faces.filter(F=>F.includes(0)).length:1);
      v.setMorphFrame(frame,f.source,display);await v.setElementContent(f.descriptor,{sourceModel:f.source,makeCanvas:canvas});
      const sprites=v.elementContentLayer.group.children.filter(o=>o.isSprite);assert.equal(sprites.length,f.source.faces.filter(F=>F.includes(0)).length+5);
      for(const s of sprites){assert.equal(s.userData.domain,'dual-morph');assert.equal(s.userData.sourceId,f.source.id);const ids=s.userData.instanceVertexIds;
        const expected=v.normalized[ids[0]].map((_,k)=>ids.reduce((sum,i)=>sum+v.normalized[i][k]/ids.length,0));expected.forEach((x,k)=>assert.ok(Math.abs(s.position.toArray()[k]-x)<1e-7));}
      assert.equal((await v.prepareCapture()).elementContent.ready,true);
      for(const kind of ['vertex','edge','face']){const list=frame.sourceMaps[{vertex:'vertices',edge:'edges',face:'faces'}[kind]];for(let i=0;i<list.length;i++)assert.ok(morphSourceOwners(frame,kind,i).length>=1);}
      const pngPlan=planMorphElementContent(f.source,frame,f.pngDescriptor.entries);assert.equal(pngPlan.sheets.get(0).size,1);
      await v.setElementContent(f.pngDescriptor,{sourceModel:f.source,makeCanvas:canvas,decodeImage:async()=>({width:2,height:2,close(){}})});
      const mesh=v.elementContentLayer.group.children.find(o=>o.isMesh);assert.ok(mesh,f.key);assert.equal(mesh.userData.sourceFace,0);
      for(let i=3,a=mesh.geometry.attributes.color.array;i<a.length;i+=4)assert.ok(Math.abs(a[i]-127/255)<1e-7);
      assert.equal((await v.prepareCapture()).elementContent.ready,true);
      assert.throws(()=>planMorphElementContent(f.source,f.frames['1'],f.pngDescriptor.entries),/PNG has no output face/);
      assert.deepEqual(f.source,before);assert.deepEqual(f.opened.model,before);assert.deepEqual(f.opened.view.elementAnnotations,f.document);assert.equal(f.opened.view.dualMorph.method,'expansion');assert.equal(f.opened.notes,'Literal star notes');
    }finally{v.clear();}
  }
});

test('actual generalized expansion session retains frame/content/settings on unresolved math and fences source notes',async()=>{
  const f=structuredClone(fixtures[0]),state={model:f.source,view:{...view(),elementAnnotations:f.document},notes:'Literal star notes'};
  const document={id:'doc',cursor:0,states:[state]},project={active:0,documents:[document]},v=actualViewer(f.source),before=structuredClone(state);
  const context={mappedContent:true,getState:()=>state,getDocument:()=>document,getProject:()=>project,isExporting:()=>false,
    prepare:async()=>structuredClone(f.prepared),evaluate:async(m,p,t)=>{if(!f.frames[String(t)])throw Error(f.nearEndpointDiagnostic);return structuredClone(f.frames[String(t)]);},
    render:async(frame,o)=>renderMorphElementContent(v,frame,state,{...o,getState:()=>state,describe:async()=>structuredClone(f.descriptor),makeCanvas:canvas}),
    clear:()=>v.clearMorph(f.source,state.view),prepareCapture:()=>v.prepareCapture(),markDirty(){},onState(){}};
  const session=new DualMorphSession(context);
  try{
    await session.configure(f.prepared.settings);await session.seek(.75);await session.prepareCapture();assert.equal(v.morphFrame.ratio,.75);
    const priorModel=v.model,priorLayer=v.elementContentLayer,priorSettings=structuredClone(state.view.dualMorph);assert.match(f.nearEndpointDiagnostic,/near-collapsed|unresolved rank/);
    await assert.rejects(()=>session.seek(1-1e-12),/near-collapsed|unresolved rank/);assert.strictEqual(v.model,priorModel);assert.strictEqual(v.elementContentLayer,priorLayer);assert.deepEqual(state.view.dualMorph,priorSettings);assert.equal((await v.prepareCapture()).elementContent.ready,true);
    await session.seek(1);assert.deepEqual(v.model,f.prepared.descriptor.dual);assert.equal(v.elementContentLayer.group.children.filter(o=>o.isSprite).length,3);
    await session.seek(0);assert.deepEqual(v.model,f.source);assert.deepEqual(state.model,before.model);assert.deepEqual(state.view.elementAnnotations,before.view.elementAnnotations);
    state.notes='Changed';assert.throws(()=>session.seek(.25),/source|notes|changed/i);assert.equal(v.morphFrame.ratio,0);
    state.notes=before.notes;session.reset();assert.equal(state.view.dualMorph.enabled,false);assert.equal(v.morphFrame,null);
  }finally{v.clear();}
});
