import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {DensitySectionWorkflow,DensitySectionControls,densitySectionParameters,densitySectionDisplay} from '../ui/density-section-controls.mjs';
import {derivedInputKey} from '../ui/derived-view-controls.mjs';
import {createAnimatedTourLayerFactory} from '../ui/animated-tour-layer.mjs';
import {AnimationRenderer} from '../ui/animation-renderer.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const native=JSON.parse(execFileSync('python',['-B','-c',`
import json
from engine.star_polyhedra import kepler_poinsot
from engine.generators import regular
from engine.server import dispatch
from engine.recipes import run_recipe
result=[]
for source in [kepler_poinsot('great-dodecahedron'),regular('tesseract')]:
 normal=[.17,.23,1] if source['dimension']==3 else [0,0,0,1]
 view=dict(derivedMode='section',sectionNormal=normal,sectionOffset=.137,coordinateUnit='cm',fillRule='even-odd',densitySection=dict(enabled=True,rule='nonzero',threshold=1))
 state=dict(model=source,view=view,notes='Literal source notes');document=dict(id='source',cursor=0,states=[state])
 params=dict(normal=normal,offset=.137,section_domain='density',fill_rule='nonzero',density_threshold=1)
 preview=dispatch(dict(op='section',model=source,params=params));history=run_recipe(document,'section',params,dispatch,'Promote filled density section')
 result.append(dict(state=state,document=document,params=params,preview=preview,history=history))
print(json.dumps(result))
`],{cwd:root,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024}));

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(index=0){
 const f=structuredClone(native[index]),state=f.state,document=f.document;document.states[0]=state;
 const project={active:0,documents:[document]},published=[],calls=[];
 const context={getState:()=>state,getDocument:()=>document,getProject:()=>project,isExporting:()=>false,
  run:async(op,params,m,label,options)=>{calls.push({op,params,m,label,options});return structuredClone(op==='section'?f.preview:f.history);},
  publishHistory:result=>{published.push(result);project.documents.push(result);}};
 return {...f,context,project,published,calls};
}
function viewer(model){
 const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.draw=()=>{};v.stereographicWorkerFactory=()=>null;
 v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);v.orthographicCamera=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);
 v.cameraProjection='orthographic';v.camera=v.orthographicCamera;v.controls={target:new THREE.Vector3(),update(){}};v.bindControls=()=>{};v.setModel(model);return v;
}

test('native filled regions render density colors, opaque faces and selected boundary curves through production Viewer',()=>{
 for(const f of native){const m=f.preview.model,v=viewer(m);try{
  v.setDisplay({angles:Array(6).fill(0),projection:'orthographic',faces:true,edges:true,vertices:false,...densitySectionDisplay(m)});
  assert.equal(v.fillDiagnostics.length,0);assert.ok(v.surfaceGeometry.attributes.position.count>0);
  assert.equal(v.surface.material.opacity,1);assert.equal(v.surface.material.depthWrite,true);
  const colors=v.surfaceGeometry.attributes.color.array,expected=new THREE.Color().setRGB(.2,.65,.95,THREE.SRGBColorSpace).r;assert.ok(Array.from(colors).some((c,i)=>i%4===0&&Math.abs(c-expected)<1e-6));
  if(m.metadata.densitySection.boundaryEdges)assert.equal(v.visibility.edges.filter(Boolean).length,m.metadata.densitySection.boundaryEdges.length);
 }finally{v.clear();}}
});

test('filled preview promotion uses native history reconstruction and preserves the original source document',async()=>{
 for(let i=0;i<native.length;i++){
  const f=fixture(i),before=structuredClone(f.document),flow=new DensitySectionWorkflow(f.context);
  const result=await flow.evaluate();assert.deepEqual(f.calls[0].params,f.params);assert.deepEqual(f.document,before);
  const history=await flow.promote(result);assert.equal(f.published.length,1);assert.deepEqual(f.document,before);
  assert.equal(f.calls[1].op,'recipe-run');assert.equal(f.calls[1].params.operation,'section');assert.deepEqual(f.calls[1].params.parameters,f.params);
  assert.deepEqual(history.states[history.cursor].model,result.model);assert.equal(history.states[history.cursor].notes,'Literal source notes');
 }
});

test('held replies reject changed plane, density policy, notes, colors and cancellation before publication',async()=>{
 for(const mutate of [f=>f.state.view.sectionOffset=.3,f=>f.state.view.densitySection.rule='threshold',f=>f.state.notes='edited',f=>f.state.model.metadata.color='edited',(_f,flow)=>flow.cancelActive()]){
  const f=fixture(),flow=new DensitySectionWorkflow(f.context);let resolve;f.context.run=()=>new Promise(r=>resolve=r);
  const pending=flow.evaluate();await tick();mutate(f,flow);resolve(f.preview);await assert.rejects(pending,/changed|canceled|superseded/i);assert.equal(f.published.length,0);
 }
});

test('promotion rejects edited receipts, history selection, source content, density threshold, capacity and late cancellation',async()=>{
 for(const mutate of [f=>f.state.view.densitySection.threshold=2,f=>f.state.view.documentMetadata={title:'edited'},f=>f.document.cursor=1,
  (_f,_flow,result)=>result.model.vertices[0][0]+=1,f=>f.project.documents.push(...Array.from({length:99},()=>({})))]){
  const f=fixture(),flow=new DensitySectionWorkflow(f.context),result=await flow.evaluate();mutate(f,flow,result);
  await assert.rejects(flow.promote(result),/changed|Close a document|source/i);assert.equal(f.published.length,0);
 }
 const f=fixture(),flow=new DensitySectionWorkflow(f.context),result=await flow.evaluate();let resolve;
 f.context.run=()=>new Promise(r=>resolve=r);const pending=flow.promote(result);await tick();flow.cancelActive();resolve(f.history);
 await assert.rejects(pending,/canceled|superseded/i);assert.equal(f.published.length,0);
});

test('active-only cancellation preserves completed receipts and owned export may read but cannot promote',async()=>{
 const f=fixture(),flow=new DensitySectionWorkflow(f.context),result=await flow.evaluate();assert.equal(flow.cancelActive(),false);await flow.promote(result);
 const g=fixture(),exportFlow=new DensitySectionWorkflow(g.context);g.context.isExporting=()=>true;let owns=true;
 await assert.rejects(exportFlow.evaluate(),/export/i);const read=await exportFlow.evaluate({exportOwner:()=>owns});
 await assert.rejects(exportFlow.promote(read),/export/i);
 let resolve;g.context.run=()=>new Promise(r=>resolve=r);const pending=exportFlow.evaluate({exportOwner:()=>owns});await tick();owns=false;resolve(g.preview);
 await assert.rejects(pending,/canceled|superseded/i);
});

test('filled plane parameters and request ownership retain signed fill settings independently of source-face fill',()=>{
 const f=fixture(),v=f.state.view,key=derivedInputKey(v);assert.deepEqual(densitySectionParameters(v),f.params);
 for(const mutate of [v=>v.densitySection.threshold=2,v=>v.densitySection.rule='even-odd',v=>v.densitySection.enabled=false]){
  const changed=structuredClone(v);mutate(changed);assert.notEqual(derivedInputKey(changed),key);
 }
 v.densitySection.enabled=false;assert.deepEqual(densitySectionParameters(v),{normal:v.sectionNormal,offset:.137,fill_rule:'even-odd'});
});

function fakeDocument(){
 const doc={nodes:{},getElementById(id){return this.nodes[id];},createElement(tag){
  const node={tagName:tag.toUpperCase(),ownerDocument:this,style:{},children:[],value:'',disabled:false,hidden:false,
   append(...children){this.children.push(...children);},after(...children){this.afterNodes=children;},replaceChildren(...children){this.children=children;},setAttribute(k,v){this[k]=v;},
   querySelector(id){return this.nodes?.[id.slice(1)];},querySelectorAll(){return Object.values(this.nodes??{}).filter(n=>['INPUT','SELECT','BUTTON'].includes(n.tagName));}};
  Object.defineProperty(node,'innerHTML',{set(html){this.nodes={};for(const m of html.matchAll(/<(input|select|button)[^>]*id="([^"]+)"[^>]*>/g)){const n=doc.createElement(m[1]);n.id=m[2];n.value=/value="([^"]*)"/.exec(m[0])?.[1]??'';this.nodes[n.id]=n;}}});return node;
 }};
 for(const id of ['derived-mode','analysis','derived-status'])doc.nodes[id]=doc.createElement('div');return doc;
}

test('mounted Section mode control and collapsed Analysis settings use NumericEntry, persist policy, show legend and lock during export',async()=>{
 const f=fixture(),document=fakeDocument(),refreshed=[];let dirty=0,shown=0;
 const context={...f.context,document,guard:fn=>fn,markDirty:()=>dirty++,showSection:()=>shown++,refreshDerived:async options=>refreshed.push(options),evaluateMany:async parts=>parts.map(p=>p==='1 + 1'?2:Number(p))};
 const controls=new DensitySectionControls(context);assert.equal(controls.select.id,'section-density-mode');assert.equal(controls.panel.id,'density-section-settings');assert.notEqual(controls.panel.open,true);
 controls.select.value='surface';await controls.setMode();assert.equal(f.state.view.densitySection.enabled,false);
 controls.node('section-density-rule').value='threshold';controls.node('section-density-threshold').value='1 + 1';await controls.apply();
 assert.deepEqual(f.state.view.densitySection,{enabled:true,rule:'threshold',threshold:2});assert.equal(dirty,2);assert.equal(shown,2);assert.equal(refreshed.length,2);
 controls.show(f.preview);assert.equal(controls.legend.hidden,false);assert.ok(controls.legend.children.length>=2);
 controls.show(null);assert.equal(controls.legend.hidden,true);
 context.isExporting=()=>true;controls.sync();assert.equal(controls.select.disabled,true);await assert.rejects(controls.apply(),/export/);
});

test('saved filled sections route the same density parameters and boundary display through independent tour layers and depth animation',async()=>{
 const f=fixture(),calls=[],viewers=[];let state=f.state;
 class MockViewer{constructor(){viewers.push(this);this.renderer={dispose(){},forceContextLoss(){}};}resize(){}setModel(m){this.model=m;}setSectionModel(m,source){this.model=m;this.source=source;}setDisplay(v){this.view=v;}draw(){}fit(){}clear(){}async prepareCapture(){return {};}}
 const createElement=()=>({dataset:{},style:{},append(){},remove(){}}),host={append(){}};
 const factory=createAnimatedTourLayerFactory({host,ViewerClass:MockViewer,createElement,run:async(op,params)=>{calls.push({op,params});return f.preview;}});
 const layer=factory({slot:1,getState:()=>state,width:500,height:300});
 try{await layer.refreshDerived();assert.deepEqual(calls[0],{op:'section',params:f.params});assert.equal(layer.netViewer.view.surfaceColors,'source');assert.equal(layer.netViewer.view.fillRule,'nonzero');}
 finally{layer.dispose();}
 let refresh=0;const v={draw(){}},renderer=new AnimationRenderer({getState:()=>state,viewer:v,netViewer:v,display(){},refreshSection:async()=>refresh++});
 await renderer.renderTracks({source:{modelId:state.model.id,fingerprint:state.model.fingerprint},view:{...state.view,sectionOffset:.4},frame:{sectionOffset:.4},foldNet:null,baseExplosion:null},{});
 assert.equal(refresh,1);assert.equal(state.view.sectionOffset,.4);assert.equal(state.view.derivedMode,'section');assert.equal(state.view.densitySection.enabled,true);
});
