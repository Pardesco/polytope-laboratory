import test from 'node:test';
import assert from 'node:assert/strict';
import {createSequence} from '../ui/animation.mjs';
import {requireTrackCapabilities,createTrackSweep,AnimationTrackSessions,captureAnimationView} from '../ui/animation-track-controls.mjs';

test('fractional sweep duration preserves the requested endpoint exactly',()=>{
  const sequence=createTrackSweep(createSequence({},.2,10),'explosion',{amount:.35});
  assert.equal(sequence.keyframes[0].explosionAmount,0);
  assert.equal(sequence.keyframes.at(-1).explosionAmount,.35);
});
import {AnimationControls} from '../ui/animation-controls.mjs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cube=()=>({id:'literal-cube',fingerprint:'a'.repeat(64),dimension:3,embeddingDimension:3,interpretation:'convex-polytope',vertices:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],edges:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],cells:[]});
const state=()=>({model:cube(),view:{angles:Array(6).fill(0),sectionOffset:0,animation:createSequence({},2,4)}});

test('capabilities require actual rendering and preserve unsupported saved sequence',()=>{
  const sequence=createTrackSweep(createSequence({},2,4),'explosion'),saved=structuredClone(sequence);
  assert.throws(()=>requireTrackCapabilities(sequence,{}),/retained/);assert.throws(()=>requireTrackCapabilities(sequence,{capabilities:{explosion:true}}),/retained/);
  assert.deepEqual(requireTrackCapabilities(sequence,{capabilities:()=>({explosion:true}),renderTracks(){}}),sequence);assert.deepEqual(sequence,saved);
  const combined=createTrackSweep(sequence,'fold');assert.throws(()=>requireTrackCapabilities(combined,{capabilities:{explosion:true},renderTracks(){}}),/fold/);
  assert.equal(requireTrackCapabilities(createSequence(),{}).version,1);
});
test('adding explosion/fold sweeps retains rotation/depth and supports explicit radial policy',()=>{
  const original=createSequence({sectionOffset:2},2,4),explosion=createTrackSweep(original,'explosion',{direction:'radial',amount:3}),combined=createTrackSweep(explosion,'fold');
  assert.equal(combined.tracks.explosion.direction,'radial');assert.equal(combined.keyframes[1].explosionAmount,3);assert.equal(combined.keyframes[1].foldFraction,1);assert.deepEqual(combined.keyframes[1].angles,original.keyframes[1].angles);assert.equal(combined.keyframes[0].sectionOffset,2);
  for(const amount of [-1,11,Infinity])assert.throws(()=>createTrackSweep(original,'explosion',{amount}),/range/);assert.throws(()=>createTrackSweep(original,'unknown'),/Choose/);
});
test('candidate preflight leaves sequence and pose unchanged; saved sequence can prepare and render',async()=>{
  const source=state(),before=structuredClone(source),sequence=createTrackSweep(source.view.animation,'explosion'),rendered=[];
  const sessions=new AnimationTrackSessions({getState:()=>source,capabilities:{explosion:true},renderTracks:async(pose,guards)=>{assert.ok(guards.isCurrent());rendered.push(pose.frame.explosionAmount);source.view=structuredClone(pose.view);}});
  await sessions.prepare(sequence,{preflight:true});assert.deepEqual(source,before);source.view.animation=sequence;await sessions.apply(sequence,1);await sessions.apply(sequence,2);assert.deepEqual(rendered,[.5,1]);sessions.reset();
});
test('unsupported geometry and native errors do not publish a candidate',async()=>{
  const source=state();source.model.interpretation='generalized-complex';const before=structuredClone(source),sequence=createTrackSweep(source.view.animation,'explosion');
  const sessions=new AnimationTrackSessions({getState:()=>source,capabilities:{explosion:true},renderTracks(){throw Error('must not render');}});
  await assert.rejects(()=>sessions.prepare(sequence,{preflight:true}),/direction semantics/);assert.deepEqual(source,before);sessions.reset();
});
test('controller generation guard reaches async renderer and reset aborts publication',async()=>{
  const source=state(),sequence=createTrackSweep(source.view.animation,'explosion');source.view.animation=sequence;let release,guard,published=0,current=true;
  const sessions=new AnimationTrackSessions({getState:()=>source,capabilities:{explosion:true},renderTracks:async(_,guards)=>{guard=guards;await new Promise(resolve=>{release=resolve;});if(guards.isCurrent())published++;}});
  const pending=sessions.apply(sequence,1,()=>current);await new Promise(resolve=>setImmediate(resolve));current=false;assert.equal(guard.isCurrent(),false);sessions.reset();release();await assert.rejects(()=>pending,/cancelled/);assert.equal(published,0);
});
test('exact legacy view restoration removes absent fields and refuses changed camera or source',()=>{
  const source=state(),original=structuredClone(source.view),snapshot=captureAnimationView(source,()=>source);source.view.explosionAmount=1;source.view.sectionAlignment={temporary:1};snapshot.accept();assert.equal(snapshot.restore(),true);assert.deepEqual(source.view,original);
  const stale=captureAnimationView(source,()=>source);source.view.camera={changed:true};assert.equal(stale.restore(),false);assert.deepEqual(source.view.camera,{changed:true});
  let current=source;const switched=captureAnimationView(source,()=>current);current=state();assert.equal(switched.restore(),false);source.model.fingerprint='b'.repeat(64);assert.equal(snapshot.restore(),false);
});

test('actual native net fetch occurs once across candidate validation, saved session and interrupted replay',async()=>{
  const program="import sys,json;from engine.nets import unfold;from engine.geometry import identity;m=json.load(sys.stdin);m['fingerprint']=identity(m);print(json.dumps({'model':m,'net':unfold(m,edge_length_mm=25,tabs=False)}))";
  const result=JSON.parse(execFileSync('python',['-c',program],{cwd:fileURLToPath(new URL('..',import.meta.url)),input:JSON.stringify(cube()),encoding:'utf8'}));
  const source=state();source.model=result.model;const candidate=createTrackSweep(source.view.animation,'fold');let fetches=0;
  const sessions=new AnimationTrackSessions({getState:()=>source,capabilities:{fold:true},loadNet:async()=>{fetches++;return result.net;},renderTracks:async(pose,guards)=>{assert.ok(guards.isCurrent());source.view=structuredClone(pose.view);}});
  await sessions.prepare(candidate,{preflight:true});source.view.animation=candidate;await sessions.apply(candidate,1);sessions.interrupt();await sessions.apply(candidate,2);assert.equal(fetches,1);assert.equal(source.view.net.fraction,1);assert.equal(source.view.derivedMode,'net');sessions.reset();
});

function exportFixture({cancel=false,externalChange=false}={}){
  const source=state(),original=structuredClone(source.view);source.view.animation=createTrackSweep(source.view.animation,'explosion');source.view.animation.duration=.1;source.view.animation.fps=10;source.view.animation.keyframes[1].time=.1;
  const saved=structuredClone(source.view),writes=[],rendered=[],events=[];let poseAmount=null,controls,aborted=0;
  const viewer={renderer:{domElement:{}},controls:{enabled:true,enableDamping:true,update(){}},setDisplay(){},draw(){},image(){events.push('image');assert.notEqual(poseAmount,null);return 'pose:'+poseAmount;}};
  const doc={id:'doc',states:[source],cursor:0},project={documents:[doc]};const context={getProject:()=>project,getDocument:()=>doc,evaluateMany:async entries=>entries.map(Number),getState:()=>source,getModel:()=>source.model,viewer,capabilities:{explosion:true},renderTracks:async(pose,guards)=>{
    await new Promise(resolve=>setTimeout(resolve,2));if(!guards.isCurrent())throw Error('stale renderer');source.view=structuredClone(pose.view);poseAmount=pose.frame.explosionAmount;rendered.push({amount:poseAmount,restoring:pose.restoring});events.push('render');
  },api:{animationBegin:async()=>({id:'session'}),animationWrite:async(_,index,data)=>{writes.push({index,data});if(cancel)controls.cancel();if(externalChange)source.view.camera={manual:'kept'};},animationFinish:async()=>({path:'frames'}),animationAbort:async()=>{aborted++;}},setStatus(){}};
  controls=Object.create(AnimationControls.prototype);Object.assign(controls,{context,trackSessions:new AnimationTrackSessions(context),time:.025,generation:0,playing:false,exporting:false,update(){},nodes:{duration:{value:.1},fps:{value:10},loop:{checked:false},target:{value:'base'},progress:{textContent:''}}});
  return {source,saved,original,writes,rendered,events,controls,viewer,get aborted(){return aborted;}};
}
test('PNG export awaits qualified rendering and restores exact original view/absent scalar fields',async()=>{
  const f=exportFixture();await f.controls.export('png');assert.deepEqual(f.writes,[{index:0,data:'pose:0'},{index:1,data:'pose:1'}]);assert.deepEqual(f.source.view,f.saved);assert.equal(Object.hasOwn(f.source.view,'explosionAmount'),false);assert.deepEqual(f.events,['render','image','render','image','render']);assert.equal(f.rendered.at(-1).restoring,true);assert.equal(f.viewer.controls.enabled,true);assert.equal(f.controls.exporting,false);
});
test('export cancellation restores qualified source pose and aborts native temporary session',async()=>{
  const f=exportFixture({cancel:true});await f.controls.export('png');assert.equal(f.writes.length,1);assert.equal(f.aborted,1);assert.deepEqual(f.source.view,f.saved);assert.equal(f.controls.exporting,false);assert.equal(f.viewer.controls.enableDamping,true);
});
test('external camera edit during export prevents old-view restoration',async()=>{
  const f=exportFixture({externalChange:true});await assert.rejects(()=>f.controls.export('png'),/source view changed/);assert.deepEqual(f.source.view.camera,{manual:'kept'});assert.equal(f.aborted,1);assert.equal(f.controls.exporting,false);
});

function externalExportFixture(){
  const source=state(),events=[],nodes=Object.fromEntries(['duration','fps','loop','rotation','section','keyframe','play','start','end','time','png','webm','fit','target','turns','plane','explosion','fold','explosion-direction','explosion-endpoint','explosion-pose','fold-pose','morph','morph-pose','morph-endpoint','track-options','position','cancel','progress'].map(key=>[key,{value:'',checked:false,disabled:false,hidden:false,textContent:''}]));
  nodes.plane.options=Array.from({length:6},(_,i)=>({value:String(i),disabled:false}));nodes.plane.value='0';Object.defineProperty(nodes.plane,'selectedOptions',{get:()=>[nodes.plane.options[Number(nodes.plane.value)]]});
  nodes.target.value='base';const netOption={disabled:false};nodes.target.querySelector=()=>netOption;nodes.turns.value='1';nodes['explosion-direction'].value='normal';nodes['explosion-endpoint'].value='1';
  const doc={id:'doc',states:[source],cursor:0},project={documents:[doc]};let external=false;const viewer={setDisplay:()=>events.push('display'),draw:()=>events.push('draw')},context={getProject:()=>project,getDocument:()=>doc,evaluateMany:async entries=>entries.map(Number),getState:()=>source,getModel:()=>source.model,
    isExporting:()=>external,capabilities:{explosion:true,fold:true},viewer,sectionViewer:viewer,renderTracks:async(pose,guards)=>{assert.ok(guards.isCurrent());source.view=structuredClone(pose.view);events.push('render');},
    markDirty:()=>events.push('dirty'),setStatus:value=>events.push(value),api:{animationBegin:async()=>{events.push('native:begin');return {id:'must-not-open'};}}};
  const controls=Object.assign(Object.create(AnimationControls.prototype),{context,trackSessions:new AnimationTrackSessions(context),nodes,container:{hidden:false,querySelectorAll:()=>Object.values(nodes)},time:0,generation:0,playing:false,exporting:false});controls.update();
  return {source,controls,context,nodes,events,setExternal:value=>external=value};
}

test('other export disables every sequence/edit/play/capture control, then restores dimension and track eligibility',()=>{
  const f=externalExportFixture(),before=structuredClone(f.source);f.setExternal(true);f.controls.update();
  for(const key of ['duration','fps','loop','rotation','section','keyframe','play','start','end','time','png','webm','fit','target','turns','plane','explosion','fold','explosion-direction','explosion-endpoint','explosion-pose','fold-pose','morph','morph-pose','morph-endpoint'])assert.equal(f.nodes[key].disabled,true,key);
  assert.equal(f.nodes.cancel.hidden,true,'The separate tour Cancel button owns its export');assert.deepEqual(f.source,before);f.setExternal(false);f.controls.update();
  for(const key of ['duration','fps','rotation','section','play','png','webm','explosion','fold'])assert.equal(f.nodes[key].disabled,false,key);
  assert.equal(f.nodes['explosion-pose'].disabled,true);assert.equal(f.nodes['fold-pose'].disabled,true);assert.equal(f.nodes.plane.options[2].disabled,true);assert.equal(f.nodes.target.querySelector().disabled,true);assert.deepEqual(f.source,before);
  f.controls.exporting=true;f.controls.update();assert.equal(f.nodes.png.disabled,true);assert.equal(f.nodes.cancel.hidden,false,'Own cancellation remains available');
});

test('programmatic bypass of all public animation mutations/poses/exports refuses another export before changing source',async()=>{
  for(const action of [f=>f.controls.save(f.source.view.animation),f=>f.controls.configure(),f=>f.controls.rotation(),f=>f.controls.section(),f=>f.controls.record(),f=>f.controls.addTrack('explosion'),f=>f.controls.trackPose('explosionAmount',.5),f=>f.controls.scrub(.5),f=>f.controls.play(),f=>f.controls.export('png'),f=>f.controls.export('webm'),f=>f.controls.apply(f.source.view.animation,.5,f.source,0)]){
    const f=externalExportFixture(),before=structuredClone(f.source);f.setExternal(true);await assert.rejects(async()=>action(f),/other export/);assert.deepEqual(f.source,before);assert.deepEqual(f.events,[]);assert.equal(f.controls.generation,0);assert.equal(f.controls.exporting,false);
  }
});

test('other export beginning during track candidate preflight prevents saving the late sequence',async()=>{
  let release;const f=externalExportFixture(),before=structuredClone(f.source),gate=new Promise(resolve=>release=resolve);f.controls.trackSessions.prepare=()=>gate;
  const pending=f.controls.addTrack('explosion');await new Promise(resolve=>setImmediate(resolve));f.setExternal(true);f.controls.update();release();await assert.rejects(pending,/export/);assert.deepEqual(f.source,before);assert.ok(!f.events.includes('dirty'));assert.equal(f.nodes.png.disabled,true);
  f.setExternal(false);await f.controls.addTrack('explosion');assert.equal(f.source.view.animation.tracks.explosion.direction,'normal');assert.equal(f.nodes.png.disabled,false);
});

test('other export beginning during pose preflight prevents a late keyframe save',async()=>{
  const f=externalExportFixture();f.source.view.animation=createTrackSweep(f.source.view.animation,'explosion');const before=structuredClone(f.source);let release;f.controls.trackSessions.prepare=()=>new Promise(resolve=>release=resolve);
  const pending=f.controls.trackPose('explosionAmount',.5);await new Promise(resolve=>setImmediate(resolve));f.setExternal(true);release();await assert.rejects(pending,/export/);assert.deepEqual(f.source,before);assert.ok(!f.events.includes('dirty'));
});

test('pending real track-renderer callback sees another export fence before publishing its deferred pose',async()=>{
  const f=externalExportFixture();f.source.view.animation=createTrackSweep(f.source.view.animation,'explosion');const before=structuredClone(f.source);let release,guard;
  f.context.renderTracks=async(pose,guards)=>{guard=guards;await new Promise(resolve=>release=resolve);if(!guards.isCurrent())throw Error('Cancelled deferred track pose');f.source.view=structuredClone(pose.view);};
  const pending=f.controls.apply(f.source.view.animation,1,f.source,0),rejected=assert.rejects(pending,/cancel/i);for(let i=0;i<20&&!guard;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(guard);f.setExternal(true);assert.equal(guard.isCurrent(),false);release();await rejected;assert.deepEqual(f.source,before);
});

test('an already scheduled animation frame cannot mutate the source after another export begins',async t=>{
  const saved=Object.getOwnPropertyDescriptor(globalThis,'requestAnimationFrame'),savedCancel=Object.getOwnPropertyDescriptor(globalThis,'cancelAnimationFrame');let frame;
  globalThis.requestAnimationFrame=callback=>{frame=callback;return 1;};globalThis.cancelAnimationFrame=()=>{};
  t.after(()=>{for(const [key,value] of [['requestAnimationFrame',saved],['cancelAnimationFrame',savedCancel]])if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];});
  const f=externalExportFixture(),before=structuredClone(f.source);f.controls.play();assert.equal(f.controls.playing,true);f.setExternal(true);f.controls.update();await frame(performance.now()+500);assert.deepEqual(f.source,before);assert.equal(f.controls.playing,false);assert.ok(f.events.some(e=>String(e).includes('other export')));assert.equal(f.nodes.play.disabled,true);
});

test('own export uses a distinct false other-export flag and retains apply, native staging, cancellation and restoration',async()=>{
  const f=exportFixture(),flags=[];f.controls.context.isExporting=()=>{flags.push(f.controls.exporting);return false;};await f.controls.export('png');assert.ok(flags.includes(true));assert.equal(f.writes.length,2);assert.equal(f.controls.exporting,false);assert.deepEqual(f.source.view,f.saved);assert.equal(f.aborted,0);
  const cancelled=exportFixture({cancel:true});cancelled.controls.context.isExporting=()=>false;await cancelled.controls.export('png');assert.equal(cancelled.aborted,1);assert.equal(cancelled.controls.exporting,false);assert.deepEqual(cancelled.source.view,cancelled.saved);
});
