import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {DualMorphSession} from '../ui/dual-morph-session.mjs';
import {planMorphElementContent,morphLabelAnchors} from '../ui/morph-element-content.mjs';
import {renderMorphElementContent} from '../ui/morph-element-content-renderer.mjs';

const root=process.env.POLYTOPE_TEST_ROOT??fileURLToPath(new URL('../',import.meta.url));
const fixtures=JSON.parse(execFileSync('python',['-B','-c',`
import sys,json,math,base64,tempfile
from pathlib import Path
from engine.generators import regular
from engine import element_annotations as content
from engine.element_content_workflow import describe_content
from engine import server
from engine.formats import save_project,load_file
def build(name):
 p=regular(name);p['metadata'].update(coordinateUnits='mm',historical={'literal':[.125,'retain']},offColors={'faces':[{'encoding':'byte','values':[20,40,80,127]} for f in p['faces']]})
 doc=content.new_document(p)
 for kind in ['vertex','edge','face']+(['cell'] if name=='tesseract' else []):doc=content.set_text(doc,p,kind,0,'<b>'+kind+'</b><sup>2</sup>',{'offsetMm':[1,2],'rotationDeg':7,'lineHeightMm':4})
 desc=describe_content(p,doc)
 settings={'version':1,'enabled':True,'method':'expansion','center':None,'radius':math.sqrt(2),'ratio':.25,'duration':2,'loop':False}
 frames={};plans={}
 for method in (['sizing','truncation','augmentation','expansion','tilting-quads','tilting-triangles','tilting-to-compound','tilting-to-rectify'] if name=='cube' else ['expansion']):
  setting={**settings,'method':method};context={'notes':'Original notes','unit':'mm'}
  prepared=server.dispatch({'op':'prepare-dual-morph','model':p,'params':{'settings':setting,'sourceContext':context}})
  plans[method]=prepared
  frames[method]=server.dispatch({'op':'evaluate-dual-morph','model':p,'params':{'prepared':prepared,'ratio':.25,'sourceContext':context}})
  if method=='expansion':
   for ratio in (0,1):frames['endpoint'+str(ratio)]=server.dispatch({'op':'evaluate-dual-morph','model':p,'params':{'prepared':prepared,'ratio':ratio,'sourceContext':context}})
 view={'coordinateUnit':'mm','angles':[0]*6,'projection':'orthographic','vertices':True,'edges':True,'faces':True,'surfaceColors':'source','surfaceOpacity':1,'cellFacing':'all','cellShrink':1,'elementAnnotations':doc,'dualMorph':settings}
 state={'model':p,'view':view,'notes':'Original notes'}
 project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'content-doc','cursor':0,'states':[state]}]}
 with tempfile.TemporaryDirectory() as folder:
  path=Path(folder)/'morph.polyproj';save_project(path,project);opened=load_file(path)['project']['documents'][0]['states'][0]
 assert opened['view']['elementAnnotations']==doc and opened['view']['dualMorph']==settings and opened['notes']==state['notes']
 result={'source':p,'document':doc,'descriptor':desc,'frames':frames,'prepared':plans,'state':state,'opened':opened}
 if name=='cube':
  fixture=json.loads(Path('tests/fixtures/element-content-native-fixture.json').read_text(encoding='utf-8'));asset=next(iter(fixture['descriptor']['assets'].values()))
  pngdoc=content.set_texture(doc,p,0,base64.b64decode(asset['base64']));result.update(pngDocument=pngdoc,pngDescriptor=describe_content(p,pngdoc))
 return result
print(json.dumps({'cube':build('cube'),'tesseract':build('tesseract')}))
`],{cwd:root,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024}));

const makeCanvas=()=>({width:0,height:0,getContext:()=>({clearRect(){},drawImage(){},save(){},restore(){},translate(){},rotate(){},measureText:t=>({width:t.length*7}),fillText(){}})});
const bitmap=()=>({width:2,height:2,closed:false,close(){this.closed=true;}});
const close=(a,b)=>a.forEach((x,k)=>assert.ok(Math.abs(x-b[k])<1e-7,`${a} != ${b}`));
function actualViewer(source){const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.draw=()=>{};v.stereographicWorkerFactory=()=>null;v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);v.orthographicCamera=new THREE.OrthographicCamera(-1.45,1.45,1.45,-1.45,.01,1000);v.cameraProjection='orthographic';v.camera=v.orthographicCamera;v.orthographicHalfHeight=1.45;v.controls={target:new THREE.Vector3(),update(){}};v.bindControls=()=>{};v.setModel(source);return v;}
const labels=v=>v.elementContentLayer.group.children.filter(o=>o.isSprite);
const options=(state,descriptor)=>({getState:()=>state,isCurrent:()=>true,makeCanvas,decodeImage:async()=>bitmap(),describe:async()=>structuredClone(descriptor)});

test('native eight-method ownership plans retain literal source identities, reciprocal endpoints and project content',()=>{
  const f=fixtures.cube;
  for(const [method,frame] of Object.entries(f.frames)){
    const plan=planMorphElementContent(f.source,frame,f.descriptor.entries);
    assert.equal(plan.labels.size,3,method);assert.ok(plan.labels.get('vertex:0').length,method);assert.ok(plan.labels.get('edge:0').length,method);assert.ok(plan.labels.get('face:0').length,method);
  }
  assert.deepEqual(f.opened.view.elementAnnotations,f.document);assert.equal(f.opened.view.dualMorph.enabled,true);assert.equal(f.opened.notes,'Original notes');
  const endpoint=planMorphElementContent(f.source,f.frames.endpoint1,f.descriptor.entries);
  assert.equal(endpoint.labels.get('vertex:0')[0].outputRank,2);assert.equal(endpoint.labels.get('face:0')[0].outputRank,0);
  const noGuess=structuredClone(f.frames.expansion);for(const list of Object.values(noGuess.sourceMaps))if(Array.isArray(list))for(const owner of list){
    delete owner.sourceVertex;delete owner.sourceFacet;delete owner.sourceRank;delete owner.sourceElement;delete owner.dualRank;delete owner.dualOriginElement;owner.sourceFaceIds=[0];owner.sourceVertexIds=[0];owner.sourceEdgeIds=[0];}
  assert.throws(()=>planMorphElementContent(f.source,noGuess,f.descriptor.entries),/no declared moving owner/);
  assert.throws(()=>planMorphElementContent(f.source,f.frames.expansion,f.descriptor.entries,{maxOccurrences:1}),/occurrence bound/);
});

test('actual production Viewer repeats moving vertex/edge/face text and follows the published pose in 3D/4D',async()=>{
  for(const [name,method] of [['cube','expansion'],['cube','tilting-triangles'],['tesseract','expansion']]){
    const f=structuredClone(fixtures[name]),v=actualViewer(f.source);f.state.model=f.source;f.state.view.cameraProjection='orthographic';const frame=f.frames[method];
    try{
      await renderMorphElementContent(v,frame,f.state,options(f.state,f.descriptor));
      const sprites=labels(v);assert.ok(sprites.some(s=>s.userData.sourceKind==='vertex'));assert.ok(sprites.some(s=>s.userData.sourceKind==='edge'));assert.ok(sprites.some(s=>s.userData.sourceKind==='face'));
      assert(sprites.every(s=>s.material.map.flipY),'Billboard labels retain the canvas top-to-bottom text orientation.');
      if(name==='cube'&&method==='expansion')assert.equal(sprites.filter(s=>s.userData.sourceKind==='vertex').length,3);
      if(name==='tesseract')assert.ok(sprites.some(s=>s.userData.sourceKind==='cell'));
      for(const sprite of sprites){const ids=sprite.userData.instanceVertexIds,p=v.normalized[ids[0]].map((_,k)=>ids.reduce((sum,id)=>sum+v.normalized[id][k]/ids.length,0));close(sprite.position.toArray(),p.slice(0,3));assert.equal(sprite.userData.sourceId,f.source.id);assert.equal(sprite.userData.domain,'dual-morph');}
      assert.ok((await v.prepareCapture()).elementContent.ready);assert.equal(v.elementContentDiagnostic,null);
      const before=labels(v).map(s=>s.position.toArray()),published=v.publishedPickState;v.view={...v.view,angles:[90,0,0,0,0,0]};v.elementContentLayer.rebuild();assert.deepEqual(labels(v).map(s=>s.position.toArray()),before);
      const plan=v.elementContentLayer.morphPlan;assert.equal(morphLabelAnchors(plan,{...published,view:{...published.view,vertices:false,edges:false,faces:false}}).size,0);
    }finally{v.clear();}
  }
});

test('complete affine source-face PNG sheets render on sizing/expansion, unsupported faces fail before replacing content',async()=>{
  const f=structuredClone(fixtures.cube),state=f.state;state.model=f.source;state.view.elementAnnotations=f.pngDocument;
  const v=actualViewer(f.source),o=options(state,f.pngDescriptor);
  try{
    for(const method of ['sizing','expansion']){
      await renderMorphElementContent(v,f.frames[method],state,o);const mesh=v.elementContentLayer.group.children.find(o=>o.isMesh);assert.ok(mesh);
      assert.equal(mesh.userData.sourceFace,0);assert.equal(v.elementContentDiagnostic,null);
      for(let i=3,a=mesh.geometry.attributes.color.array;i<a.length;i+=4)assert.ok(Math.abs(a[i]-127/255)<1e-7);
      assert.ok((await v.prepareCapture()).elementContent.ready);
    }
    const model=v.model,layer=v.elementContentLayer,children=[...layer.group.children];
    await assert.rejects(()=>renderMorphElementContent(v,f.frames['tilting-triangles'],state,o),/PNG.*correspondence|PNG.*owner/);
    await assert.rejects(()=>renderMorphElementContent(v,f.frames.endpoint1,state,o),/PNG has no output face/);
    assert.strictEqual(v.model,model);assert.strictEqual(v.elementContentLayer,layer);assert.deepEqual(layer.group.children,children);
    const wrong=structuredClone(f.frames.expansion);const fi=[...layer.morphPlan.sheets.get(0).keys()][0];wrong.model.vertices[wrong.model.faces[fi][2]][0]+=.2;
    assert.throws(()=>planMorphElementContent(f.source,wrong,f.pngDescriptor.entries),/affine source sheet/);
  }finally{v.clear();}
});

test('held descriptor/assets, changed annotations and forged ownership cannot publish or silently omit content',async()=>{
  const f=structuredClone(fixtures.cube),state=f.state;state.model=f.source;const v=actualViewer(f.source);
  try{
    let release;const before=v.model,c=new AbortController(),o={...options(state,f.descriptor),signal:c.signal,describe:()=>new Promise(r=>release=r)};
    const pending=renderMorphElementContent(v,f.frames.expansion,state,o);await new Promise(r=>setImmediate(r));c.abort();release(f.descriptor);await assert.rejects(pending,/canceled|changed/);assert.strictEqual(v.model,before);
    const g=structuredClone(fixtures.cube),s=g.state;s.model=g.source;const broken=structuredClone(g.descriptor);broken.entries.pop();
    await assert.rejects(()=>renderMorphElementContent(v,g.frames.expansion,s,options(s,broken)),/omitted or changed/);assert.strictEqual(v.model,before);
    const document={id:'source',cursor:0,states:[state]},project={active:0,documents:[document]},setting=state.view.dualMorph;
    const session=new DualMorphSession({mappedContent:true,getState:()=>state,getDocument:()=>document,getProject:()=>project,isExporting:()=>false,
      prepare:async()=>({settings:setting}),evaluate:async()=>{state.view.elementAnnotations=structuredClone(state.view.elementAnnotations);state.view.elementAnnotations.entries[0].text.markup='Changed';return {};},render:()=>assert.fail('Changed annotations must not publish'),onState(){}});
    await assert.rejects(()=>session.configure(setting),/element annotations changed/);
    state.view.elementAnnotations=f.pngDocument;let decodeRelease,entered;const gate=new Promise(r=>entered=r),image=bitmap();
    const late=renderMorphElementContent(v,f.frames.expansion,state,{...options(state,f.pngDescriptor),decodeImage:()=>{entered();return new Promise(r=>decodeRelease=r);}});
    await gate;state.notes='Changed notes';decodeRelease(image);await assert.rejects(late,/changed/);assert.equal(image.closed,true);assert.strictEqual(v.model,before);
  }finally{v.clear();}
});

test('installed adapter contract enables annotated session preparation, endpoint seeking, exact capture and source reset',async()=>{
  const f=structuredClone(fixtures.cube),state=f.state;state.model=f.source;
  const document={id:'source',cursor:0,states:[state]},project={active:0,documents:[document]},v=actualViewer(f.source),before=structuredClone(state.model);
  const session=new DualMorphSession({mappedContent:true,getState:()=>state,getDocument:()=>document,getProject:()=>project,isExporting:()=>false,
    prepare:async(m,s)=>structuredClone(f.prepared[s.method]),
    evaluate:async(m,p,ratio)=>structuredClone(f.frames[ratio===1?'endpoint1':p.settings.method]),
    render:(frame,o)=>renderMorphElementContent(v,frame,state,{...options(state,f.descriptor),...o}),
    prepareCapture:o=>v.prepareCapture(o),clear:()=>v.clearMorph(state.model,state.view),onState(){},markDirty(){}});
  try{
    await session.configure(state.view.dualMorph);assert.equal(state.view.dualMorph.ratio,.25);assert.ok(labels(v).length>3);
    await session.seek(1);assert.equal(state.view.dualMorph.ratio,1);assert.ok(labels(v).some(s=>s.userData.sourceKind==='vertex'&&s.userData.outputKind==='face'));
    assert.ok(labels(v).some(s=>s.userData.sourceKind==='face'&&s.userData.outputKind==='vertex'));await session.prepareCapture();
    assert.deepEqual(state.model,before);assert.deepEqual(state.view.elementAnnotations,f.document);
    session.reset();assert.equal(state.view.dualMorph.enabled,false);assert.strictEqual(v.model,state.model);assert.equal(v.morphFrame,null);
    await v.setElementContent(f.descriptor,{sourceModel:state.model,makeCanvas});assert.equal(v.elementContentDiagnostic,null);
  }finally{session.invalidate();v.clear();}
});
