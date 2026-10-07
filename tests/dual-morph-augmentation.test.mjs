import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DualMorphSession,MORPH_SUPPORTED,morphEligible} from '../ui/dual-morph-session.mjs';
import {Viewer} from '../ui/viewer.js';
import {morphSourceOwners} from '../ui/dual-morph-picking.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const native=request=>JSON.parse(execFileSync('python',['-B','-c','import json,sys;from engine.server import dispatch;print(json.dumps(dispatch(json.loads(sys.stdin.read()))))'],{cwd:root,windowsHide:true,encoding:'utf8',input:JSON.stringify(request),timeout:30000}));
const model=native({op:'generate',params:{kind:'regular',key:'cube'}});model.metadata.coordinateUnits='mm';model.metadata.historical={literal:[.125,'retain']};model.metadata.offColors={faces:model.faces.map(()=>({encoding:'byte',values:[50,100,150,127]}))};
const setting={version:1,enabled:true,method:'augmentation',center:null,radius:Math.SQRT2,ratio:.25,duration:2,loop:false};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function actualViewer(source){
  const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.setModel(source);v.cameraProjection='orthographic';v.orthographicHalfHeight=2;
  v.camera=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);v.orthographicCamera=v.camera;v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);v.camera.position.set(0,0,5);v.camera.lookAt(0,0,0);v.camera.updateMatrixWorld();v.controls={target:new THREE.Vector3(),update(){}};v.renderer={domElement:{getBoundingClientRect:()=>({width:400,height:400})},render(){}};return v;
}
function fixture(){
  const state={model:structuredClone(model),notes:'Original exact notes.',view:{coordinateUnit:'mm',projection:'orthographic',angles:Array(6).fill(0),faces:true,vertices:true,edges:true,surfaceColors:'source',surfaceOpacity:1}},document={id:'source-document',cursor:0,states:[]};document.states=[state];const project={format:'polytope-laboratory',version:1,active:0,documents:[document]},viewer=actualViewer(state.model),renders=[],calls=[];
  const context={getState:()=>state,getDocument:()=>document,getProject:()=>project,isExporting:()=>false,
    prepare:async(m,settings,sourceContext,o)=>{calls.push('prepare');return native({op:'prepare-dual-morph',model:m,params:{settings,sourceContext}});},
    evaluate:async(m,prepared,ratio,sourceContext,o)=>{calls.push('evaluate');return native({op:'evaluate-dual-morph',model:m,params:{prepared,ratio,sourceContext}});},
    render:(frame,o)=>{renders.push(frame.ratio);return viewer.setMorphFrame(frame,state.model,state.view,o);},
    clear:()=>viewer.clearMorph(state.model,state.view),prepareCapture:o=>viewer.prepareCapture(o),onState(){},markDirty(){}};
  const session=new DualMorphSession(context);return {state,document,project,viewer,session,context,renders,calls};
}
test('eight-mode inventory retains augmentation preparation/evaluation/controller/source attributes and owners',async()=>{
  const f=fixture(),before=structuredClone(f.state);assert.deepEqual(MORPH_SUPPORTED,['sizing','truncation','augmentation','expansion','tilting-quads','tilting-triangles','tilting-to-compound','tilting-to-rectify']);assert.deepEqual(MORPH_SUPPORTED.filter(method=>morphEligible(f.state.model,method)),MORPH_SUPPORTED);assert.deepEqual(MORPH_SUPPORTED.filter(method=>morphEligible({...f.state.model,dimension:4,embeddingDimension:4},method)),['expansion','tilting-quads']);
  try{
    const first=await f.session.configure(setting);assert.equal(first.method,'augmentation');assert.equal(f.viewer.model.vertices.length,14);assert.equal(f.viewer.model.faces.length,24);assert.equal(f.viewer.surfaceVertexAlpha,true);assert.equal(f.viewer.surfaceGeometry.attributes.color.itemSize,4);assert.deepEqual(f.state.model,before.model);assert.equal(f.state.notes,before.notes);assert.equal(f.state.view.coordinateUnit,'mm');
    for(const ratio of [.5,.75,.25]){const frame=await f.session.seek(ratio);assert.equal(frame.model.faces.length,ratio===.5?12:24);assert.equal(f.state.view.dualMorph.ratio,ratio);assert.deepEqual(f.state.model,before.model);for(const [kind,field] of [['vertex','vertices'],['edge','edges'],['face','faces']])for(let i=0;i<frame.model[field].length;i++){const owners=morphSourceOwners(frame,kind,i);assert.ok(owners.length);for(const owner of owners)assert.ok(f.state.model[{vertex:'vertices',edge:'edges',face:'faces'}[owner.kind]][owner.id]);}}
    await f.session.prepareCapture();assert.equal(f.viewer.morphFrame.ratio,.25);assert.equal(f.renders.at(-1),.25);
    const saved=native({op:'validate-project',params:{project:f.project}}),restored=saved.documents[0].states[0];assert.deepEqual(restored.model.metadata,before.model.metadata);assert.equal(restored.notes,before.notes);assert.equal(restored.view.dualMorph.method,'augmentation');assert.equal(restored.view.dualMorph.ratio,.25);assert.equal(restored.model.vertices.length,8);
  }finally{f.session.invalidate();f.viewer.clear();}
});
test('requested text/PNG annotations block every supported morph before native preparation or saved-bank mutation',async()=>{
  for(const method of MORPH_SUPPORTED){const f=fixture();f.state.view.elementAnnotations={version:1,entries:[{kind:'face',index:0,text:{markup:'Requested label',placement:{}},texture:null}]};const before=structuredClone(f.state);
    try{await assert.rejects(()=>f.session.configure({...setting,method}),/text\/PNG annotations.*reset.*not yet qualified/);assert.deepEqual(f.calls,[]);assert.deepEqual(f.renders,[]);assert.deepEqual(f.state,before);assert.strictEqual(f.viewer.model,f.state.model);}finally{f.viewer.clear();}}
});
test('late requested content refuses ignored native results and exact capture while preserving the mathematical source',async()=>{
  const f=fixture(),gate=deferred(),evaluate=f.context.evaluate;let started=false;f.context.evaluate=async(...args)=>{const result=await evaluate(...args);started=true;await gate.promise;return result;};
  const pending=f.session.configure(setting);const outcome=pending.then(()=>assert.fail('Annotated source must not publish.'),e=>e);
  while(!started)await new Promise(resolve=>setImmediate(resolve));f.state.view.elementAnnotations={entries:[{kind:'face',index:0,text:null,texture:{asset:'literal-source-png'}}]};gate.resolve();const error=await outcome;assert.match(error.message,/text\/PNG annotations/);assert.deepEqual(f.renders,[]);assert.equal(f.state.view.dualMorph,undefined);assert.strictEqual(f.viewer.model,f.state.model);f.viewer.clear();
  const g=fixture();try{await g.session.configure(setting);const before=structuredClone(g.state.model);g.state.view.elementAnnotations={entries:[{kind:'vertex',index:0,text:{markup:'Required'},texture:null}]};await assert.rejects(()=>g.session.prepareCapture(),/text\/PNG annotations/);assert.deepEqual(g.state.model,before);assert.equal(g.state.view.dualMorph.enabled,true);}finally{g.session.invalidate();g.viewer.clear();}
});
test('empty annotation document and detached old-source content do not become requested morph overlays',async()=>{
  const f=fixture();f.state.view.elementAnnotations={entries:[]};f.state.view.elementContentDetached=[{reason:'Old source',annotations:{entries:[{text:{markup:'Archived'}}]}}];const archive=structuredClone(f.state.view.elementContentDetached);
  try{await f.session.configure(setting);assert.deepEqual(f.state.view.elementContentDetached,archive);assert.equal(f.state.view.dualMorph.method,'augmentation');}finally{f.session.invalidate();f.viewer.clear();}
});
