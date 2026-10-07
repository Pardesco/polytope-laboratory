import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import * as THREE from 'three';
const root=process.env.POLYTOPE_TEST_ROOT??fileURLToPath(new URL('../',import.meta.url));
const {Viewer}=await import(pathToFileURL(join(root,'ui/viewer.js')));
const {CoincidicRegimentControls,arrangementEligible}=await import(pathToFileURL(join(process.env.POLYTOPE_STAGE_UI??join(root,'ui'),'coincidic-regiment-controls.mjs')));
const {prepareHistoryCommit,verifyHistoryPublication,preserveHistoryObserver}=await import(pathToFileURL(join(root,'ui/history-workflow.mjs')));
const bootstrap=`import sys,os,json,runpy
import engine
if os.environ.get('POLYTOPE_STAGE_ENGINE'):engine.__path__.insert(0,os.environ['POLYTOPE_STAGE_ENGINE'])
from engine import server
`;
function native(code,input){return JSON.parse(execFileSync('python',['-B','-c',bootstrap+code],{cwd:root,input:input===undefined?undefined:JSON.stringify(input),encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:24*1024*1024}));}
const fixture=native(`helper=runpy.run_path(os.environ.get('POLYTOPE_STAGE_TESTS','tests/test_coincidic_regiments.py'))
project=helper['supplied_project']()
params={'otherState':project['documents'][1]['states'][0],'options':{'relativeTolerance':1e-8}}
recorded=server.dispatch({'op':'recipe-run','params':{'document':project['documents'][0],'operation':'coincidic-record','parameters':params,'label':'Saved comparison'}})
compound=server.dispatch({'op':'recipe-run','params':{'document':project['documents'][0],'operation':'coincidic-compound','parameters':params,'label':'Literal comparison compound'}})
from engine.element_content_workflow import describe_content
state=compound['states'][compound['cursor']]
print(json.dumps({'project':project,'recorded':recorded,'compound':compound,'descriptor':describe_content(state['model'],state['view']['elementAnnotations'])}))
`);

function context(){
 const project=structuredClone(fixture.project);let gate,publications=0,options;
 const c={getProject:()=>project,getDocument:()=>project.documents[project.active],getState:()=>project.documents[project.active].states[project.documents[project.active].cursor],isExporting:()=>c.exporting??false,setStatus:value=>{c.status=value;},navigateDocument:id=>{project.active=project.documents.findIndex(d=>d.id===id);},onSelect:(kind,index)=>{c.selection={kind,index,documentId:c.getDocument().id};},restoreState:async state=>{c.restored=state;return state;}};
 c.commit=async(op,params,label,o)=>{options=o;assert.equal(params.otherState.model.id,fixture.project.documents[1].states[0].model.id);
  const request={...c,verifyPublication:o.verifyPublication,run:async()=>gate?await gate:structuredClone(op==='coincidic-record'?fixture.recorded:fixture.compound)};
  const prepared=await prepareHistoryCommit(request,op,params,label);verifyHistoryPublication(request,prepared);preserveHistoryObserver(prepared);project.documents[prepared.index]=prepared.result;publications++;return prepared.result;};
 const controls=new CoincidicRegimentControls(c,{mount:false});controls.selection=project.documents[1].id;
 return {c,project,controls,hold:promise=>{gate=promise;},get options(){return options;},get publications(){return publications;}};
}

test('actual native JSON-number recipe/replay and opened-pair controller preserve source rank owners, notes/units, saved navigation and explicit compound topology',async()=>{
 assert.equal(arrangementEligible(fixture.project.documents[0].states[0].model),true);assert.equal(arrangementEligible({dimension:3}),false);
 const good=context(),before=structuredClone(good.project);await good.controls.perform();
 assert.equal(good.publications,1);assert.deepEqual(good.project.documents[1],before.documents[1]);assert.match(good.c.status,/edges differ/);
 const a=good.c.getState();assert.deepEqual(a.model,before.documents[0].states[0].model);assert.equal(a.view.coincidicComparison.receipt.sameVertexArrangement,true);
 await good.controls.restore();assert.deepEqual(good.c.restored,a.view.coincidicComparison.sourceStates[1]);good.controls.inspect('a');assert.deepEqual(good.c.selection,{kind:'vertex',index:0,documentId:good.project.documents[0].id});
 good.controls.inspect('b');assert.equal(good.project.active,1);assert.deepEqual(good.c.selection,{kind:'vertex',index:0,documentId:good.project.documents[1].id});
 const stale=context();await stale.controls.perform();stale.project.documents[1].states[0].model.metadata.offColors.vertices[0].values[3]=11;assert.throws(()=>stale.controls.inspect('b'),/attributes differ/);assert.equal(stale.project.active,0);
 const compound=context();await compound.controls.perform('coincidic-compound');const state=compound.c.getState();assert.equal(state.model.vertices.length,32);assert.equal(state.view.elementAnnotations.entries.length,8);assert.equal(state.view.coordinateUnit,'mm');
 const replay=native(`result=server.dispatch({'op':'recipe-replay','params':{'document':json.load(sys.stdin)}})
print(json.dumps(result))`,compound.project.documents[0]);assert.deepEqual(replay.states[replay.cursor].model,state.model);assert.deepEqual(replay.states[replay.cursor].view.elementAnnotations,state.view.elementAnnotations);
});

test('held pair publication rejects changes to either literal source, notes, units, content, selected document, options, export and cancel; observer motion stays independent',async()=>{
 const mutations=[
  x=>{x.c.getState().model.metadata.offColors.faces[0].values[3]=99;},
  x=>{x.project.documents[1].states[0].model.vertices[0][0]=4;},
  x=>{x.project.documents[1].states[0].notes+=' changed';},
  x=>{x.project.documents[1].states[0].view.coordinateUnit='cm';},
  x=>{x.project.documents[1].states[0].view.elementAnnotations.entries[0].text.markup='different';},
  x=>{x.project.active=1;},x=>{x.project.documents.pop();},x=>{x.controls.selection='missing';},
  x=>{x.controls.readOptions=()=>({relativeTolerance:1e-6});},x=>{x.c.exporting=true;},x=>{x.controls.cancel();}
 ];
 for(const mutate of mutations){const held=context();let release;held.hold(new Promise(r=>{release=r;}));const pending=held.controls.perform();mutate(held);release(structuredClone(fixture.recorded));await assert.rejects(pending);assert.equal(held.publications,0);}
 const moving=context();let release;moving.hold(new Promise(r=>{release=r;}));const pending=moving.controls.perform();moving.c.getState().view.angles[0]=.2;moving.project.documents[1].states[0].view.angles[1]=.4;release(structuredClone(fixture.recorded));await pending;assert.equal(moving.publications,1);assert.equal(moving.c.getState().view.angles[0],.2);
});

test('production Viewer prepares capture of both source-owned text and PNG on literal4D compound faces with retained raw RGBA',async()=>{
 const state=fixture.compound.states[fixture.compound.cursor],v=Object.create(Viewer.prototype),painted=[];
 v.group=new THREE.Group();v.draw=()=>{};v.stereographicWorkerFactory=()=>null;v.cameraProjection='orthographic';
 v.orthographicCamera=new THREE.OrthographicCamera(-4,4,4,-4,.01,1000);v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);v.camera=v.orthographicCamera;v.camera.position.set(0,0,8);v.camera.lookAt(0,0,0);v.camera.updateMatrixWorld();v.controls={target:new THREE.Vector3(),update(){}};
 v.setModel(state.model);
 const canvas=()=>({width:0,height:0,getContext:()=>({clearRect(){},drawImage(){},save(){},restore(){},translate(){},rotate(){},measureText:t=>({width:t.length*7}),fillText:text=>painted.push(text)})});
 try{
  v.setDisplay({angles:[.2,.3,.1,.4,.5,.2],projection:'orthographic',cameraProjection:'orthographic',coordinateUnit:'mm',surfaceColors:'source',surfaceOpacity:1,vertices:true,edges:true,faces:true,fillRule:'nonzero'});
  await v.setElementContent(fixture.descriptor,{sourceModel:state.model,makeCanvas:canvas,decodeImage:async()=>({width:2,height:2,close(){}})});
  const textures=v.elementContentLayer.group.children.filter(o=>o.isMesh);assert.equal(textures.length,2);const faceOffset=fixture.project.documents[0].states[0].model.faces.length;
  assert.deepEqual(textures.map(o=>o.userData.sourceFace).sort((a,b)=>a-b),[0,faceOffset]);
  for(const mesh of textures){assert.equal(mesh.userData.sourceId,state.model.id);for(let i=3,a=mesh.geometry.attributes.color.array;i<a.length;i+=4)assert.ok(Math.abs(a[i]-127/255)<1e-7);}
  assert.ok(painted.includes('Source 0 vertex'));assert.ok(painted.includes('Source 1 face'));assert.equal((await v.prepareCapture()).elementContent.ready,true);
 }finally{v.clear();}
});
