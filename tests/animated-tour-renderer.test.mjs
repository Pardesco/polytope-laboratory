import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {AnimatedTourRenderer,animatedTourPresentationMatrix} from '../ui/animated-tour-renderer.mjs';
import {createSequence,withSequenceTracks} from '../ui/animation.mjs';
import {runStereographicWorkerJob,stereographicWorkerTransferables} from '../ui/stereographic-worker-geometry.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
async function until(fn){for(let n=0;n<100;n++){if(fn())return;await tick();}assert.fail('Expected async stage was not reached.');}
function cube(id='a'){
  return {id,name:id,fingerprint:(id==='a'?'a':'b').repeat(64),dimension:3,embeddingDimension:3,interpretation:'convex-polytope',
    vertices:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
    edges:[[0,1],[1,2],[2,3],[0,3],[4,5],[5,6],[6,7],[4,7],[0,4],[1,5],[2,6],[3,7]],
    faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],cells:[],
    metadata:{coordinateUnits:'mm',offlineAsset:{relativePath:'textures/local.png',hash:'source-only'},
      offColors:{faces:[{encoding:'byte',values:[25,80,210,127]},null,null,null,null,{encoding:'unit',values:[.1,.4,.7,.25]}],cells:[]}},numeric:{mode:'float64-approximate',certified:false}};
}
const camera={position:[0,0,8],target:[0,0,0],projection:'orthographic',zoom:1,up:[0,1,0],orthographicHalfHeight:2};
function state(id='a',{animation=true,tracks,model=cube(id),projection='orthographic',layout='single'}={}){
  const view={angles:Array(6).fill(0),sectionOffset:0,derivedMode:'dual',projection,cameraProjection:'orthographic',viewportLayout:layout,
    camera:structuredClone(camera),derivedCamera:structuredClone(camera),surfaceOpacity:.8,surfaceColors:'source',coordinateUnit:'mm',net:{root:0,length:2,tabs:false},extra:{retained:true}};
  if(animation){view.animation=createSequence(view,2,4);view.animation.keyframes[1].angles[0]=180;if(tracks){view.animation=withSequenceTracks(view.animation,tracks);if(tracks.explosion)view.animation.keyframes[1].explosionAmount=.5;if(tracks.fold)view.animation.keyframes[1].foldFraction=1;}}
  return {model,view,notes:`Notes ${id}`,operationNode:'retained-inert-lineage'};
}
const tour=(a=state(),b=state('b'),transition={method:'sideways',duration:.5,easing:'linear',distance:2})=>({version:2,cursor:0,events:[{id:'first',state:a,duration:1,transition},{id:'second',state:b,duration:2,transition:{method:'instant'}}]});
function canvas(log,name='output'){
  const c={name,width:400,height:300,frame:null,log};
  const ctx={globalAlpha:1,save(){log.push({kind:'save',name});},restore(){log.push({kind:'restore',name});},fillRect(){log.push({kind:'background',name});},drawImage(source,...rect){log.push({kind:'copy',name,source:source.name,frame:structuredClone(source.frame),alpha:this.globalAlpha,rect});c.frame=structuredClone(source.frame);}};
  c.getContext=()=>ctx;c.toDataURL=()=>`data:image/png;base64,${Buffer.from(JSON.stringify(c.frame)).toString('base64')}`;return c;
}
class HeldWorker{
  constructor(){this.listeners=new Map();this.jobs=[];}
  addEventListener(k,f){this.listeners.set(k,f);}removeEventListener(k){this.listeners.delete(k);}terminate(){this.terminated=true;}
  postMessage(j,b){this.jobs.push(structuredClone(j,{transfer:b}));}
  reply(){const r=runStereographicWorkerJob(this.jobs.shift());assert.equal(r.type,'geometry-result',r.message);this.listeners.get('message')?.({data:structuredClone(r,{transfer:stereographicWorkerTransferables(r)})});}
}
function actualViewer(log,name,worker){
  const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.setModel(cube());v.supportsExplosion=true;
  v.cameraProjection='orthographic';v.orthographicHalfHeight=2;v.aspect=4/3;v.camera=new THREE.OrthographicCamera(-8/3,8/3,2,-2,.01,1000);v.orthographicCamera=v.camera;v.perspectiveCamera=new THREE.PerspectiveCamera(38,4/3,.01,1000);v.camera.position.set(0,0,8);v.camera.lookAt(0,0,0);v.camera.updateMatrixWorld();
  v.controls={target:new THREE.Vector3(),enabled:true,enableDamping:true,update(){}};v.bindControls=()=>{};
  const c=canvas(log,name);c.getBoundingClientRect=()=>({width:400,height:300});v.renderer={domElement:c,setClearColor:(color,alpha)=>log.push({kind:'clear-alpha',name,alpha}),render(){c.frame={sourceId:v.model?.id,angles:structuredClone(v.view?.angles),points:structuredClone(v.projected?.slice(0,2)),matrix:v.group.matrix.toArray()};log.push({kind:'draw',name});}};
  v.stereographicWorkerFactory=()=>worker??null;v.stereographicWorkerClock={now:()=>0,setTimer:()=>1,clearTimer(){}};return v;
}
function net(model){
  const q=Math.SQRT1_2,translations=[[0,0,-1],[0,0,1],[0,-1,0],[1,0,0],[0,1,0],[-1,0,0]];
  return {algorithmVersion:'0.3.0',units:'mm',sourceFingerprint:model.fingerprint,scale:1,referenceEdgeLengthMm:2,sourceFaceCount:6,sourceEdges:structuredClone(model.edges),targetVertices:structuredClone(model.vertices),traversalOrder:[0,1,2,3,4,5],
    components:model.faces.map((_,id)=>({root:id,targetQuaternion:id<2?[0,0,0,1]:id===2||id===4?[q,0,0,q]:[0,q,0,q],targetTranslation:translations[id]})),
    faces:model.faces.map((ids,id)=>({id,sourceVertices:[...ids],points:ids.map(v=>{const [x,y,z]=model.vertices[v];return id<2?[x,y]:id===2||id===4?[x,z]:[-z,y];}),parent:null,parentHinge:null,foldAngle:0,component:id}))};
}
function harness(bank=tour(),{worker,gateCapture,run,loop=false,prepareLayout}={}){
  const log=[],output=canvas(log),actors=[],sourceState=state('original',{animation:false}),original=structuredClone(sourceState),project={tour:bank},owner={project,tour:bank,sourceState};
  const renderer=new AnimatedTourRenderer({tour:bank,loop,canvas:output,createCanvas:()=>canvas(log,'scratch'),getOwner:()=>owner,
    createLayer:({slot,getState})=>{
      const viewer=actualViewer(log,`base${slot}`,worker),netViewer=actualViewer(log,`derived${slot}`),actor={viewer,netViewer,getState};actors.push(actor);
      if(gateCapture){const original=viewer.prepareCapture.bind(viewer);viewer.prepareCapture=async guards=>{log.push({kind:'capture-wait',guards});await gateCapture.promise;return original(guards);};}
      return {viewer,netViewer,run:async(op,params,model,label,o)=>{log.push({kind:'native',op,source:model.id});if(run)return run(op,params,model,label,o);if(op==='net')return net(model);throw Error(`Unexpected native job ${op}`);},
        prepareLayout:async(view,o)=>{assert.ok(o.isCurrent());log.push({kind:'layout',layout:view.viewportLayout,source:getState().model.id});if(prepareLayout)await prepareLayout(view,o,actor);},
        refreshDerived:async o=>{assert.ok(o.isCurrent());log.push({kind:'derived'});},
        refreshSection:async o=>{assert.ok(o.isCurrent());const z=getState().view.sectionOffset;const model={id:'literal-section',dimension:2,embeddingDimension:3,interpretation:'generalized-complex',vertices:[[-1,-1,z],[1,-1,z],[1,1,z],[-1,1,z]],edges:[[0,1],[1,2],[2,3],[0,3]],faces:[[0,1,2,3]],cells:[]};netViewer.setModel(model);netViewer.setDisplay({...getState().view,angles:Array(6).fill(0),projection:'orthographic'});log.push({kind:'section',z});},
        dispose(){actor.disposed=true;actor.stateAtDispose=structuredClone(getState());viewer.clear();netViewer.clear();}};
    }});
  return {renderer,log,output,actors,owner,project,sourceState,original,bank};
}
test('actual saved rotation advances inside a hold; both live transition models retain terminal/initial poses',async()=>{
  const h=harness(),before=structuredClone(h.bank);try{
    let p=await h.renderer.apply(.5);assert.equal(p.layers[0].view.angles[0],45);near(h.actors[0].viewer.projected[0].point[0],0);
    p=await h.renderer.apply(1.25);assert.deepEqual(p.layers.map(l=>[l.role,l.view.angles[0],l.transitionPose.translation[0],l.transitionPose.opacity]),[['outgoing',90,-1,.5],['incoming',0,1,.5]]);
    assert.equal(h.actors.length,2);const copies=h.log.filter(e=>e.kind==='copy'&&e.name==='scratch').slice(-2);assert.deepEqual(copies.map(c=>[c.frame.sourceId,c.frame.angles[0],c.alpha]),[['a',90,.5],['b',0,.5]]);
    assert.ok(h.renderer.current(p));assert.match(h.renderer.image(p),/^data:image\/png/);assert.deepEqual(h.sourceState,h.original);assert.deepEqual(h.bank,before);
  }finally{await h.renderer.close();}
});
test('sparse/reordered absolute seeks reproduce exact Three display coordinates and composed transforms',async()=>{
  const h=harness();try{await h.renderer.apply(.5);const first=structuredClone(h.actors[0].viewer.projected);await h.renderer.apply(3.5);await h.renderer.apply(1.25);await h.renderer.apply(.5);assert.deepEqual(h.actors[0].viewer.projected,first);assert.equal(h.renderer.published.time,.5);}finally{await h.renderer.close();}
});
test('complete event attributes, source RGBA, notes, units and inert lineage stay detached through playback and close',async()=>{
  const h=harness(),before=structuredClone(h.bank);await h.renderer.apply(.5);const actor=h.actors[0];assert.notStrictEqual(actor.getState().model,h.bank.events[0].state.model);assert.deepEqual(actor.getState().model,h.bank.events[0].state.model);
  assert.equal(actor.viewer.surface.material.opacity,.8);assert.ok(Math.abs(actor.viewer.surfaceGeometry.getAttribute('color').array[3]-127/255)<1e-7);await h.renderer.close();assert.equal(actor.disposed,true);assert.deepEqual(actor.stateAtDispose.view,h.bank.events[0].state.view);assert.deepEqual(h.bank,before);assert.deepEqual(h.sourceState,h.original);assert.equal(actor.viewer.controls.enabled,true);
});
test('postprojection SO3 matrix uses the existing signed XZ convention and never edits mathematical points',()=>{
  const p={translation:[2,-1,3],angles:[0,90,0,0,0,0],scale:.5};const x=new THREE.Vector3(1,0,0).applyMatrix4(animatedTourPresentationMatrix(p));near(x.x,2);near(x.y,-1);near(x.z,3.5);
  assert.throws(()=>animatedTourPresentationMatrix({...p,angles:[0,0,90,0,0,0]}),/4D/);assert.throws(()=>animatedTourPresentationMatrix({...p,scale:2}),/scale/);
});
test('actual source-space explosion track remains animated rather than replaced with a static event image',async()=>{
  const s=state('a',{tracks:{explosion:{direction:'normal'}}}),h=harness(tour(s));try{await h.renderer.apply(.5);const v=h.actors[0].viewer;near(v.explosionDisplay.amount,.125);assert.equal(v.pointGeometry.getAttribute('position').count,24);await h.renderer.apply(1);near(v.explosionDisplay.amount,.25);assert.deepEqual(h.bank.events[0].state.model,s.model);}finally{await h.renderer.close();}
});
test('radial outgoing transition composes multiplicatively with a saved radial explosion amount',async()=>{
  const s=state('a',{tracks:{explosion:{direction:'radial'}}}),h=harness(tour(s,state('b'),{method:'explode-grow',duration:1,easing:'linear',explosionSize:3}));try{await h.renderer.apply(1.5);near(h.actors[0].viewer.explosionDisplay.amount,1.5);assert.equal(h.renderer.published.layers[0].view.explosionAmount,.25);assert.equal(h.actors[0].viewer.explosionDisplay.direction,'radial');}finally{await h.renderer.close();}
});
test('unsupported mixed normal/radial, folded explosion, generalized directions and bounds refuse before scenes are created',()=>{
  assert.throws(()=>harness(tour(state('a',{tracks:{explosion:{direction:'normal'}}}),state('b'),{method:'explode-grow',duration:1})),/normal explosion/);
  assert.throws(()=>harness(tour(state('a',{tracks:{fold:{kind:'face-net'}}}),state('b'),{method:'explode-grow',duration:1})),/folding/);
  const generalized=state();generalized.model.interpretation='generalized-complex';assert.throws(()=>harness(tour(generalized,state('b'),{method:'explode-grow',duration:1})),/generalized/);
  assert.throws(()=>harness(tour(state(),state('b'),{method:'explode-grow',duration:1,explosionSize:12})),/amount-10/);
});
test('actual rigid net folding renders source-bound derived panes and reuses cached native net across event revisits',async()=>{
  const s=state('a',{tracks:{fold:{kind:'face-net'}}}),h=harness(tour(s));try{
    await h.renderer.apply(.5);const actor=h.actors[0];assert.equal(actor.getState().view.viewportLayout,'split');near(actor.getState().view.net.fraction,.25);assert.equal(actor.netViewer.net.algorithmVersion,'0.3.0');
    assert.equal(h.log.filter(c=>c.kind==='copy'&&c.name==='scratch').length,2);await h.renderer.apply(3.5);await h.renderer.apply(.75);assert.equal(h.log.filter(c=>c.kind==='native'&&c.op==='net').length,1);near(h.actors[0].getState().view.foldFraction,.375);
  }finally{await h.renderer.close();}
});
test('saved section depth recomputes a genuine derived section before composite capture',async()=>{
  const s=state();s.view.derivedMode='section';s.view.viewportLayout='split';s.view.animation.keyframes[0].sectionOffset=-1;s.view.animation.keyframes[1].sectionOffset=1;
  const h=harness(tour(s));try{await h.renderer.apply(.5);const actor=h.actors[0];near(actor.netViewer.model.vertices[0][2],-.5);assert.ok(h.log.find(c=>c.kind==='section'&&c.z===-.5));const copies=h.log.filter(c=>c.kind==='copy'&&c.name==='scratch');assert.equal(copies.length,2);assert.equal(copies[1].frame.sourceId,'literal-section');}finally{await h.renderer.close();}
});
test('held fine preparation blocks all visible canvas publication until completion',async()=>{
  const gate=deferred(),h=harness(undefined,{gateCapture:gate});const applied=h.renderer.apply(.5);await until(()=>h.log.some(c=>c.kind==='capture-wait'));assert.equal(h.log.some(c=>c.kind==='copy'),false);assert.equal(h.renderer.published,null);gate.resolve();assert.equal((await applied).complete,true);await h.renderer.close();
});
test('source/project/tour/view/RGBA/notes changes independently reject stale deferred capture',async()=>{
  for(const change of [h=>h.owner.project={},h=>h.owner.tour={},h=>h.owner.sourceState=state(),h=>h.sourceState.notes='Changed',h=>h.sourceState.view.coordinateUnit='cm',h=>h.sourceState.model.metadata.offColors.faces[0].values[3]=126]){
    const gate=deferred(),h=harness(undefined,{gateCapture:gate}),applied=h.renderer.apply(.5),refused=assert.rejects(applied,/changed|stale|cancel|current/i);await until(()=>h.log.some(c=>c.kind==='capture-wait'));change(h);const changed=structuredClone(h.owner.sourceState);gate.resolve();await refused;assert.equal(h.log.some(c=>c.kind==='copy'),false);await h.renderer.close();assert.deepEqual(h.owner.sourceState,changed);
  }
});
test('cancellation fences ignored late preparation and restores exact preview view property presence before disposal',async()=>{
  const gate=deferred(),h=harness(undefined,{gateCapture:gate}),applied=h.renderer.apply(.5),refused=assert.rejects(applied,/changed|cancel|current/i);await until(()=>h.log.some(c=>c.kind==='capture-wait'));h.renderer.cancel();gate.resolve();await refused;await h.renderer.close();assert.equal(h.log.some(c=>c.kind==='copy'),false);assert.deepEqual(h.actors[0].stateAtDispose.view,h.bank.events[0].state.view);assert.deepEqual(h.sourceState,h.original);
});
test('one active and one latest queued seek coalesce without publishing a stale frame',async()=>{
  const gate=deferred(),h=harness(undefined,{gateCapture:gate}),first=h.renderer.apply(.1),r1=assert.rejects(first,/changed|cancel|current/i);await until(()=>h.log.some(c=>c.kind==='capture-wait'));
  const second=h.renderer.apply(.2),r2=assert.rejects(second,/superseded/),third=h.renderer.apply(.3);assert.ok(h.renderer.active);assert.equal(h.renderer.queued.frame.time,.3);gate.resolve();await r1;await r2;assert.equal((await third).time,.3);assert.deepEqual(h.log.filter(c=>c.kind==='copy'&&c.name==='output').length,1);await h.renderer.close();
});
test('an actual held S3 Worker fine request must finish before live canvas copying',async()=>{
  const model={id:'literal-s3',fingerprint:'c'.repeat(64),dimension:4,embeddingDimension:4,interpretation:'generalized-complex',vertices:[[1,0,0,0],[-1,0,0,0],[0,1,0,0],[0,-1,0,0],[0,0,1,0],[0,0,-1,0],[0,0,0,1],[0,0,0,-1]],edges:[[0,2],[2,4],[4,0]],faces:[[0,2,4]],cells:[]},worker=new HeldWorker(),h=harness(tour(state('a',{model,projection:'stereographic'})),{worker});
  const applied=h.renderer.apply(.5);await until(()=>worker.jobs.length===1);assert.equal(h.log.some(c=>c.kind==='copy'),false);worker.reply();await until(()=>worker.jobs.length===1);assert.equal(worker.jobs[0].phase,'capture');assert.equal(h.log.some(c=>c.kind==='copy'),false);worker.reply();const p=await applied;assert.equal(p.complete,true);assert.equal(h.actors[0].viewer.stereographicGeometry.packed.phase,'capture');await h.renderer.close();
});
test('a stale published token or externally resized output cannot be returned as an exact image',async()=>{
  const h=harness();const first=await h.renderer.apply(.5);await h.renderer.apply(.6);assert.throws(()=>h.renderer.image(first),/exact|current/);h.output.width=401;await assert.rejects(h.renderer.apply(.7),/canvas size/);await h.renderer.close();
});
test('private preview source edits and camera drift are independently fenced around fine preparation',async()=>{
  for(const change of [a=>a.getState().model.vertices[0][0]=-.9,a=>a.viewer.camera.position.x=1,a=>a.getState().notes='Changed preview note']){
    const g=deferred(),h=harness(undefined,{gateCapture:g}),applied=h.renderer.apply(.5),refused=assert.rejects(applied,/changed|stale|current/i);await until(()=>h.log.some(c=>c.kind==='capture-wait'));change(h.actors[0]);g.resolve();await refused;assert.equal(h.log.some(c=>c.kind==='copy'),false);await h.renderer.close();assert.deepEqual(h.sourceState,h.original);
  }
});
test('published view descriptors are detached frozen records and later preview camera edits invalidate exact image access',async()=>{
  const h=harness();try{const p=await h.renderer.apply(.5);assert.throws(()=>p.layers[0].view.extra.retained=false,TypeError);assert.deepEqual(h.bank.events[0].state.view.extra,{retained:true});h.actors[0].viewer.camera.position.y=.1;assert.equal(h.renderer.current(p),false);assert.throws(()=>h.renderer.image(p),/exact|current/);}finally{await h.renderer.close();}
});
test('closure rejects new requests while a provider ignoring abort is still draining',async()=>{
  const g=deferred(),h=harness(undefined,{gateCapture:g}),applied=h.renderer.apply(.5),refused=assert.rejects(applied,/cancel|current|changed/i);await until(()=>h.log.some(c=>c.kind==='capture-wait'));const closed=h.renderer.close();await assert.rejects(h.renderer.apply(.6),/current/);g.resolve();await refused;await closed;assert.equal(h.actors[0].disposed,true);assert.equal(h.log.some(c=>c.kind==='copy'),false);
});

test('each installed event and effective fold pose sizes actual panes before capture, including a return to single',async()=>{
  const s=state('a',{tracks:{fold:{kind:'face-net'}}}),h=harness(tour(s),{prepareLayout:async(view,o,actor)=>{
    const width=view.viewportLayout==='split'?200:400;
    for(const v of [actor.viewer,actor.netViewer]){v.renderer.domElement.width=width;v.aspect=width/300;}
  }});
  try{
    await h.renderer.apply(.5);assert.deepEqual(h.log.filter(e=>e.kind==='layout').map(e=>e.layout),['single','split']);assert.equal(h.actors[0].viewer.renderer.domElement.width,200);
    const capture=h.log.findIndex(e=>e.kind==='copy');assert.ok(h.log.findIndex(e=>e.kind==='layout'&&e.layout==='split')<capture);
    await h.renderer.apply(3.5);assert.equal(h.actors[0].viewer.renderer.domElement.width,400);assert.deepEqual(h.log.filter(e=>e.kind==='layout').slice(-2).map(e=>[e.layout,e.source]),[['single','b'],['single','b']]);
  }finally{await h.renderer.close();}
});

test('a held layout resize cannot publish or set the retired event model after source ownership changes',async()=>{
  const gate=deferred(),h=harness(undefined,{prepareLayout:()=>gate.promise}),pending=h.renderer.apply(.5),refused=assert.rejects(pending,/changed|stale|current/i);
  await until(()=>h.log.some(e=>e.kind==='layout'));const initialModel=h.actors[0].viewer.model,initialView=structuredClone(h.actors[0].viewer.view);h.owner.project={};gate.resolve();await refused;assert.equal(h.log.some(e=>e.kind==='copy'),false);assert.strictEqual(h.actors[0].viewer.model,initialModel);assert.deepEqual(h.actors[0].viewer.view,initialView);await h.renderer.close();
});
