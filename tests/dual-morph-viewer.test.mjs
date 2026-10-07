import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Viewer} from '../ui/viewer.js';
import {morphSourceOwners} from '../ui/dual-morph-picking.mjs';
import {DualMorphSession} from '../ui/dual-morph-session.mjs';
const stage=fileURLToPath(new URL('../',import.meta.url));
const data=JSON.parse(execFileSync('python',['-B','-c',`import json
from engine.generators import regular
from engine.dual_morph import dispatch_dual_morph
out={}
for key in ('cube','tesseract'):
 m=regular(key);m['metadata']['coordinateUnits']='mm';m['metadata']['offColors']={'faces':[{'encoding':'byte','values':[50,100,150,127]}]+[None]*(len(m['faces'])-1)}
 c={'notes':'Original notes','unit':'mm'};frames={}
 for method in ('sizing','truncation','expansion','tilting-quads') if key=='cube' else ('expansion','tilting-quads'):
  s=dict(version=1,enabled=True,method=method,center=None,radius=2**.5,ratio=0.,duration=2.,loop=False)
  p=dispatch_dual_morph({'op':'prepare-dual-morph','model':m,'params':{'settings':s,'sourceContext':c}})
  frames[method]=[dispatch_dual_morph({'op':'evaluate-dual-morph','model':m,'params':{'prepared':p,'ratio':t,'sourceContext':c}}) for t in (0.,.25,.5,.75,1.)]
 out[key]={'source':m,'frames':frames}
print(json.dumps(out))`],{cwd:stage,windowsHide:true,encoding:'utf8',timeout:30000}));

function viewer(model){
  const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.setModel(model);v.cameraProjection='orthographic';v.orthographicHalfHeight=2;
  v.camera=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);v.orthographicCamera=v.camera;v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);
  v.camera.position.set(0,0,5);v.camera.lookAt(0,0,0);v.camera.updateMatrixWorld();v.controls={target:new THREE.Vector3(),update(){}};
  v.renderer={domElement:{getBoundingClientRect:()=>({width:400,height:400})},render(){}};return v;
}
const view={projection:'orthographic',angles:[0,0,0,0,0,0],faces:true,edges:true,vertices:true,surfaceColors:'source',surfaceOpacity:1};

test('actual Viewer displays native sizing layers in the same group with original source normalization',()=>{
  const {source,frames}=data.cube,v=viewer(source),before=structuredClone(source),group=v.group,center=[...v.center],radius=v.radius;
  const frame=frames.sizing[1];v.setMorphFrame(frame,source,view);
  assert.strictEqual(v.group,group);assert.strictEqual(v.morphSource,source);assert.strictEqual(v.model,frame.model);assert.deepEqual(v.center,center);assert.equal(v.radius,radius);
  assert.deepEqual(v.normalized[0],source.vertices[0].map(x=>.75*x/radius));assert.notEqual(v.radius,Math.max(...frame.model.vertices.map(x=>Math.hypot(...x))));
  assert.equal(v.surfaceGeometry.attributes.position.count>0,true);assert.deepEqual(source,before);v.clear();
});

test('native changing truncation incidence is rebuilt at each pose; no stale vertex interpolation or buffer count',()=>{
  const {source,frames}=data.cube,v=viewer(source);
  for(const [i,expected] of [[1,[24,36,14]],[2,[12,24,14]],[3,[24,36,14]],[4,[6,12,8]]]){
    v.setMorphFrame(frames.truncation[i],source,view);assert.deepEqual([v.model.vertices.length,v.model.edges.length,v.model.faces.length],expected);
    assert.equal(v.pointGeometry.attributes.position.count,expected[0]);assert.equal(v.edgeGeometry.attributes.position.count,expected[1]*2);
  }v.clear();
});

test('raw RGBA, notes/units ancestry and mapped colors survive actual fill buffers',()=>{
  const {source,frames}=data.cube,before=structuredClone(source),v=viewer(source),frame=frames.sizing[2];v.setMorphFrame(frame,source,view);
  const sourceFace=v.sourceTriangles.findIndex(t=>t.face===0),triangle=v.sourceTriangles[sourceFace],buffer=v.surfaceGeometry.attributes.color.array;
  assert.ok(triangle);const linear=new THREE.Color().setRGB(50/255,100/255,150/255,THREE.SRGBColorSpace).toArray();
  assert.equal(v.surfaceGeometry.attributes.color.itemSize,4);
  for(let c=0;c<3;c++)assert.ok(Math.abs(buffer[sourceFace*12+c]-linear[c])<2e-7);
  assert.ok(Math.abs(buffer[sourceFace*12+3]-127/255)<1e-7);assert.equal(v.surfaceVertexAlpha,true);
  assert.equal(frame.model.metadata.offColors.faces[0].values[3],127);assert.equal(source.metadata.coordinateUnits,'mm');assert.deepEqual(source,before);v.clear();
});

test('source vertex selection highlights every duplicated expansion flag and persists across frame rebuilds',()=>{
  const {source,frames}=data.cube,v=viewer(source);v.select([0]);v.setMorphFrame(frames.expansion[2],source,view);
  const expected=frames.expansion[2].sourceMaps.vertices.flatMap((owner,i)=>owner.sourceVertex===0?[i]:[]);
  assert.equal(expected.length,3);assert.deepEqual(v.selected,expected);assert.equal(v.highlightGeometry.attributes.position.count,3);
  v.setMorphFrame(frames.expansion[3],source,view);assert.deepEqual(v.selected,expected);assert.deepEqual(v.morphSelectedSourceIds,[0]);
  v.setDisplay({...view,angles:[33,0,0,0,0,0]});assert.deepEqual(v.selected,expected);v.clear();
});

test('actual point and edge picks expose original owners instead of misusing display indices',()=>{
  const {source,frames}=data.cube,v=viewer(source),frame=frames.expansion[2];v.setMorphFrame(frame,source,{...view,pickKind:'vertex'});
  let received;v.onMorphPick=(owners,kind,id)=>received={owners,kind,id};v.onPick=()=>assert.fail('Display index was passed as original source index.');
  const index=0,ndc=new THREE.Vector3(...v.projected[index].point).project(v.camera),result=v.pickAt((ndc.x+1)*200,(1-ndc.y)*200);
  assert.equal(result.picked.kind,'vertex');assert.equal(received.kind,'vertex');assert.ok(received.owners.some(x=>x.kind==='vertex'));assert.ok(received.owners.some(x=>x.kind==='face'));assert.deepEqual(result.sourceOwners,morphSourceOwners(frame,'vertex',result.picked.id));
  const owners=morphSourceOwners(frame,'edge',0);assert.ok(owners.length>0);for(const owner of owners)assert.ok(source[{vertex:'vertices',edge:'edges',face:'faces',cell:'cells'}[owner.kind]][owner.id]);v.clear();
});

test('4D original source observation frame remains valid while display model fingerprint changes',()=>{
  const {source,frames}=data.tesseract,v=viewer(source),frame=frames.expansion[2];
  const orientationFrame={sourceFingerprint:source.fingerprint,matrix:[[0,-1,0,0],[1,0,0,0],[0,0,1,0],[0,0,0,1]]};
  const status=v.setMorphFrame(frame,source,{...view,orientationFrame});assert.equal(status.orientationApplied,true);assert.equal(status.orientationDiagnostic,null);
  assert.notEqual(frame.model.fingerprint,source.fingerprint);assert.strictEqual(v.publishedPickState.morphFrame,frame);v.clear();
});

test('reciprocal endpoints and all method owner lists refer only to retained source entities',()=>{
  for(const {source,frames} of Object.values(data))for(const method of Object.keys(frames))for(const frame of frames[method]){
    for(const [kind,field] of [['vertex','vertices'],['edge','edges'],['face','faces'],['cell','cells']])for(let i=0;i<frame.model[field].length;i++){
      const owners=morphSourceOwners(frame,kind,i);assert.ok(owners.length,`${method} ${frame.ratio} ${kind} ${i}`);
      for(const owner of owners){assert.equal(owner.sourceModelId,source.id);assert.equal(owner.sourceFingerprint,source.fingerprint);assert.ok(source[{vertex:'vertices',edge:'edges',face:'faces',cell:'cells'}[owner.kind]][owner.id]);}
    }
  }
});

test('stale/aborted/foreign frame publication leaves original Viewer untouched; clear restores source with latest camera pose',()=>{
  const {source,frames}=data.cube,v=viewer(source),frame=frames.expansion[2],before=v.model;
  for(const options of [{isCurrent:()=>false},{signal:AbortSignal.abort()}])assert.throws(()=>v.setMorphFrame(frame,source,view,options),/canceled/);
  assert.strictEqual(v.model,before);assert.throws(()=>v.setMorphFrame({...frame,sourceFingerprint:'0'.repeat(64)},source,view),/source differs/);assert.strictEqual(v.model,before);
  v.setMorphFrame(frame,source,view);const camera=v.camera;camera.zoom=3;v.clearMorph(source,{...view,angles:[12,0,0,0,0,0]});
  assert.strictEqual(v.model,source);assert.strictEqual(v.camera,camera);assert.equal(v.camera.zoom,3);assert.equal(v.view.angles[0],12);assert.equal(v.morphFrame,null);v.clear();
});

test('actual production native dispatch -> controller -> Viewer -> saved settings reconstruction preserves the mathematical source',async()=>{
  const native=request=>JSON.parse(execFileSync('python',['-B','-c','import json,sys;from engine.server import dispatch;print(json.dumps(dispatch(json.loads(sys.stdin.read()))))'],{cwd:stage,windowsHide:true,encoding:'utf8',input:JSON.stringify(request),timeout:30000}));
  const source=structuredClone(data.cube.source),state={model:source,view:{...view,coordinateUnit:'mm'},notes:'Original exact notes'},document={id:'native-document',cursor:0,states:[state]},project={documents:[document],active:0},before=structuredClone(source),v=viewer(source);
  const context={getState:()=>state,getDocument:()=>document,getProject:()=>project,
    prepare:async(model,settings,sourceContext)=>native({op:'prepare-dual-morph',model,params:{settings,sourceContext}}),
    evaluate:async(model,prepared,ratio,sourceContext)=>native({op:'evaluate-dual-morph',model,params:{prepared,ratio,sourceContext}}),
    render:(frame,options)=>v.setMorphFrame(frame,source,state.view,options),clear:()=>v.clearMorph(source,state.view),clock:{cancel(){}}};
  const session=new DualMorphSession(context);await session.configure({version:1,enabled:true,method:'truncation',center:null,radius:2**.5,ratio:.25,duration:2,loop:false});
  assert.equal(v.model.vertices.length,24);await session.seek(.5);assert.equal(v.model.vertices.length,12);assert.equal(state.view.dualMorph.ratio,.5);
  session.invalidate();assert.strictEqual(v.model,source);await session.restoreSaved();assert.equal(v.model.vertices.length,12);assert.deepEqual(source,before);assert.equal(state.notes,'Original exact notes');assert.equal(document.states.length,1);v.clear();
});
