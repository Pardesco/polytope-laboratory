import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {AnimationControls} from '../ui/animation-controls.mjs';
import {TourControls} from '../ui/tour-controls.mjs';
import {createSequence} from '../ui/animation.mjs';
import {normalizeTour} from '../ui/tour.mjs';
import {AnimationTrackSessions} from '../ui/animation-track-controls.mjs';
import {numericControlFixture,deferred,flush} from './numeric-control-fixture.mjs';

globalThis.Option=class{constructor(text,value){this.textContent=text;this.value=value;}};
globalThis.cancelAnimationFrame=()=>{};
const observed=p=>p.then(value=>({value}),error=>({error}));
const allKeys=['duration','fps','loop','plane','turns','rotation','section','keyframe','play','start','end','time','png','webm','target','explosion','fold','explosion-direction','explosion-endpoint','explosion-pose','fold-pose','track-options','position','progress','cancel'];
function animation(){
  const h=numericControlFixture(AnimationControls.prototype,Object.fromEntries(allKeys.map(key=>[key,''])));
  h.nodes.duration.value='2';h.nodes.fps.value='4';h.nodes.plane.value='0';h.nodes.turns.value='1';h.nodes.target.value='base';h.nodes['explosion-direction'].value='radial';h.nodes['explosion-endpoint'].value='1';
  h.nodes.plane.options=[{value:'0'}];h.nodes.plane.selectedOptions=h.nodes.plane.options;h.nodes.target.querySelector=()=>({disabled:false});
  h.state.model.interpretation='convex-polytope';Object.assign(h.state.view,{animation:createSequence(h.state.view,2,4),sectionNormal:[0,0,1],sectionOffset:0});
  const dirty=[];Object.assign(h.context,{getModel:()=>h.state.model,markDirty:()=>dirty.push('dirty'),viewer:{setDisplay(){},draw(){}},capabilities:{explosion:true,fold:true},renderTracks(){},setStatus(){}});
  Object.assign(h.control,{nodes:h.nodes,container:{hidden:false,querySelectorAll:()=>Object.values(h.nodes)},time:0,generation:0,playing:false,exporting:false,trackSessions:new AnimationTrackSessions(h.context)});
  h.control.update();return {...h,dirty};
}
const transitionKeys=['duration','easing','angle','distance','tilt','orbits','spin','explosionSize','direction','components'];
function tour(){
  const keys=['event','duration','transition',...transitionKeys.map(key=>'transition-'+key),'transition-apply','add','replace','delete','up','down','prev','next','play','loop','scrub','position','fps','png','webm','close-preview','cancel-export','merge','save'];
  const h=numericControlFixture(TourControls.prototype,Object.fromEntries(keys.map(key=>[key,''])));
  for(const node of Object.values(h.nodes))node.replaceChildren=(...children)=>{node.children=children;};
  h.nodes.fps.value='4';h.project.tour=normalizeTour({version:1,cursor:0,events:[{id:'a',duration:1,transition:'instant',state:h.state},{id:'b',duration:2,transition:'instant',state:h.state}]});
  const dirty=[];Object.assign(h.context,{markDirty:()=>dirty.push('dirty'),setStatus(){}});
  Object.assign(h.control,{nodes:h.nodes,details:{querySelectorAll:()=>Object.entries(h.nodes).filter(([key])=>key.startsWith('transition')).map(([,node])=>node)},time:0,generation:0,playing:false,busy:false,showing:false,shownId:null});
  h.control.sync();return {...h,dirty};
}

test('native expressions configure rotation duration, integer FPS and signed turns in one job',async()=>{
  const h=animation(),model=structuredClone(h.state.model);h.nodes.duration.value='sqrt(4)/2';h.nodes.fps.value='2^3';h.nodes.turns.value='-1/2';h.nodes.loop.checked=true;
  h.context.evaluateMany=async(expressions,{mode})=>JSON.parse(execFileSync('python',['-c',"import json,sys;from engine.server import dispatch;print(json.dumps(dispatch(json.loads(sys.argv[1]))['values']))",JSON.stringify({op:'expression-batch',params:{expressions,mode}})],{cwd:process.cwd(),windowsHide:true,encoding:'utf8'}));
  // One provider invocation contains all three expressions; native is the parser.
  const provider=h.context.evaluateMany,requests=[];h.context.evaluateMany=(parts,o)=>{requests.push([...parts]);return provider(parts,o);};
  await h.control.rotation();assert.deepEqual(requests,[['sqrt(4)/2','2^3','-1/2']]);assert.equal(h.state.view.animation.duration,1);assert.equal(h.state.view.animation.fps,8);assert.equal(h.state.view.animation.loop,true);assert.equal(h.state.view.animation.keyframes.at(-1).angles[0],-180);assert.deepEqual(h.state.model,model);assert.equal(h.dirty.length,1);
});

test('invalid rotation turns or frame domain never publish a preceding duration edit',async()=>{
  for(const [key,value] of [['turns','NaN'],['turns','1e100'],['fps','3/2'],['fps','61'],['duration','0'],['duration','301']]){
    const h=animation(),before=structuredClone(h.state);h.nodes.duration.value='1/2';h.nodes[key].value=value;await assert.rejects(h.control.rotation());assert.deepEqual(h.state,before);assert.equal(h.dirty.length,0);assert.equal(h.control.editing,false);
  }
});

test('animation expressions fence full source attrs and exact relevant fields while allowing observer motion',async()=>{
  for(const mutate of [h=>h.state.notes='edited',h=>h.state.model.metadata.offColors.faces[0].values[3]=.2,h=>h.state.view.coordinateUnit='cm',h=>h.document.id='changed',h=>h.document.states=[h.state],h=>h.setProject({...h.project}),h=>h.nodes.turns.value='2',h=>h.nodes.loop.checked=true,h=>h.state.view.animation=createSequence({},3,2)]){
    const h=animation(),gate=deferred();h.context.evaluateMany=()=>gate.promise;const before=h.state.view.animation,pending=observed(h.control.rotation());await flush();mutate(h);gate.resolve([2,4,1]);assert.ok((await pending).error);assert.equal(h.dirty.length,0);if(h.state.view.animation===before)assert.equal(h.state.view.animation.duration,2);
  }
  const h=animation(),gate=deferred();h.context.evaluateMany=()=>gate.promise;const pending=h.control.rotation();await flush();h.state.view.camera={latest:'keep'};h.state.view.angles[0]=30;gate.resolve([2,4,.5]);await pending;assert.deepEqual(h.state.view.camera,{latest:'keep'});assert.equal(h.state.view.animation.keyframes[0].angles[0],30);assert.equal(h.state.view.animation.keyframes[1].angles[0],210);
});

test('held animation entry disables controls, refuses bypass, cancels ignored providers and retries',async()=>{
  const h=animation(),gate=deferred();h.context.evaluateMany=()=>gate.promise;const before=structuredClone(h.state),pending=observed(h.control.rotation());await flush();assert.equal(h.nodes.png.disabled,true);assert.equal(h.nodes.cancel.hidden,false);await assert.rejects(h.control.scrub(.1),/numeric/);assert.throws(()=>h.control.play(),/numeric/);await assert.rejects(h.control.export('png'),/action/);
  h.control.cancel();assert.match((await pending).error.message,/cancel/i);assert.deepEqual(h.state,before);assert.equal(h.nodes.png.disabled,false);gate.resolve([2,4,999]);await flush();h.context.evaluateMany=async parts=>parts.map(Number);await h.control.rotation();assert.equal(h.state.view.animation.keyframes.at(-1).angles[0],360);
});

test('track endpoint expression and settings remain atomic across async geometry preflight',async()=>{
  const h=animation(),gate=deferred(),before=structuredClone(h.state);let candidate;
  h.nodes.duration.value='1/2';h.nodes['explosion-endpoint'].value='32/2';await assert.rejects(h.control.addTrack('explosion'),/domain/);assert.deepEqual(h.state,before);
  h.nodes.duration.value='1/2';h.nodes['explosion-endpoint'].value='1/2';h.control.trackSessions.prepare=async value=>{candidate=value;await gate.promise;};
  const pending=observed(h.control.addTrack('explosion'));await flush();assert.equal(candidate.duration,.5);assert.equal(candidate.keyframes.at(-1).explosionAmount,.5);assert.deepEqual(h.state,before);h.nodes['explosion-direction'].value='normal';gate.resolve();assert.ok((await pending).error);assert.deepEqual(h.state,before);
});

test('recording and section sweep evaluate FPS and duration before publishing valid candidates',async()=>{
  const h=animation();h.control.time=1;h.nodes.duration.value='1/2';h.nodes.fps.value='sqrt(4)';await h.control.record();assert.equal(h.control.time,.5);assert.equal(h.state.view.animation.fps,2);assert.equal(h.state.view.animation.duration,.5);
  h.nodes.duration.value='1+1';await h.control.section();assert.equal(h.state.view.animation.duration,2);assert.equal(h.state.view.animation.keyframes[0].sectionOffset,0);assert.equal(h.state.view.animation.keyframes.at(-1).sectionOffset,1);assert.equal(h.nodes.target.value,'section');
});

test('tour event add, replace and duration edit evaluate expressions without aliasing snapshots',async()=>{
  const h=tour(),source=structuredClone(h.state);h.nodes.duration.value='1/2';await h.control.add();assert.equal(h.project.tour.events.length,3);assert.equal(h.project.tour.events.at(-1).duration,.5);assert.deepEqual(h.project.tour.events.at(-1).state,source);
  h.nodes.duration.value='sqrt(4)';await h.control.replace();assert.equal(h.project.tour.events.at(-1).duration,2);h.nodes.duration.value='2+3';await h.control.setDuration();assert.equal(h.project.tour.events.at(-1).duration,5);assert.deepEqual(h.state,source);
});

test('every transition scalar is native evaluated together and final direction/components invariants stay strict',async()=>{
  const h=tour(),snapshots=structuredClone(h.project.tour.events.map(e=>e.state));h.nodes.transition.value='combination';h.nodes['transition-components'].value='sideways, orbit';h.nodes['transition-duration'].value='1/2';h.nodes['transition-angle'].value='-90';h.nodes['transition-distance'].value='sqrt(4)';h.nodes['transition-tilt'].value='45';h.nodes['transition-orbits'].value='1/2';h.nodes['transition-spin'].value='sqrt(9)';h.nodes['transition-explosionSize'].value='2+3';h.nodes['transition-direction'].value='-1';
  await h.control.applyTransition();assert.equal(h.expressionCalls.length,1);assert.equal(h.expressionCalls[0].parts.length,8);assert.deepEqual({...h.project.tour.events[0].transition},{version:1,method:'combination',duration:.5,easing:'smoothstep',angle:-90,distance:2,tilt:45,orbits:.5,spin:3,explosionSize:5,direction:-1,components:['sideways','orbit']});assert.deepEqual(h.project.tour.events.map(e=>e.state),snapshots);
  for(const [key,value] of [['direction','0'],['direction','1/2'],['angle','361'],['distance','-1'],['tilt','181'],['orbits','101'],['spin','-1'],['explosionSize','0'],['duration','0']]){
    const before=h.project.tour;h.nodes.transition.value='sideways';h.nodes['transition-'+key].value=value;await assert.rejects(h.control.applyTransition());assert.strictEqual(h.project.tour,before);
  }
});

test('instant transition ignores inactive duration but evaluates the retained numeric options',async()=>{
  const h=tour();h.nodes['transition-duration'].value='not active';h.nodes['transition-angle'].value='2+3';await h.control.applyTransition();assert.equal(h.project.tour.events[0].transition.duration,0);assert.equal(h.project.tour.events[0].transition.angle,5);assert.equal(h.expressionCalls[0].parts.length,7);
});

test('tour expression publication refuses source, bank, selection, loop, field and export changes',async()=>{
  for(const mutate of [h=>h.state.notes='edited',h=>h.state.model.metadata.offColors.faces[0].values[3]=.1,h=>h.state.view.coordinateUnit='cm',h=>h.document.cursor=1,h=>h.document.id='other',h=>h.setProject({...h.project}),h=>h.project.tour=normalizeTour({...h.project.tour,cursor:1}),h=>h.nodes.duration.value='9',h=>h.nodes.loop.checked=true,h=>h.setExport(true)]){
    const h=tour(),gate=deferred();h.nodes.duration.value='1/2';h.context.evaluateMany=()=>gate.promise;const before=h.project.tour,pending=observed(h.control.add());await flush();mutate(h);gate.resolve([.5]);assert.ok((await pending).error);assert.equal(h.dirty.length,0);if(h.project.tour===before)assert.equal(h.project.tour.events.length,2);
  }
});

test('tour busy cancellation returns controls and late results cannot add events; pose-only edits remain',async()=>{
  const h=tour(),gate=deferred();h.context.evaluateMany=()=>gate.promise;const before=h.project.tour,pending=observed(h.control.add());await flush();assert.equal(h.nodes.add.disabled,true);assert.equal(h.nodes['cancel-export'].hidden,false);await assert.rejects(h.control.seek(.1),/running/);await assert.rejects(h.control.applyTransition(),/running/);h.control.cancel();assert.match((await pending).error.message,/cancel/i);assert.strictEqual(h.project.tour,before);assert.equal(h.nodes.add.disabled,false);gate.resolve([.5]);await flush();assert.strictEqual(h.project.tour,before);
  const second=deferred();h.context.evaluateMany=()=>second.promise;h.nodes.duration.value='1/2';const retry=h.control.add();await flush();h.state.view.camera={latest:true};h.state.view.angles[0]=17;h.project.memories={unrelated:true};second.resolve([.5]);await retry;assert.deepEqual(h.state.view.camera,{latest:true});assert.equal(h.project.tour.events.at(-1).state.view.angles[0],17);
});

test('tour export FPS expressions obey integer bounds before renderer/native session creation',async()=>{
  for(const value of ['0','61','3/2','NaN']){const h=tour();h.nodes.fps.value=value;let calls=0;h.context.createRenderer=()=>{calls++;throw Error('must not construct');};const before=h.project.tour;await assert.rejects(h.control.export('png'));assert.equal(calls,0);assert.strictEqual(h.project.tour,before);assert.equal(h.control.busy,false);}
});


test('focused uncommitted expressions survive ordinary animation/tour inspector refresh',()=>{
  const saved=Object.getOwnPropertyDescriptor(globalThis,'document');
  try{
    const h=animation();h.nodes.duration.value='sqrt(4)/';globalThis.document={activeElement:h.nodes.duration};h.control.update();assert.equal(h.nodes.duration.value,'sqrt(4)/');
    h.nodes.fps.value='2^';globalThis.document.activeElement=h.nodes.fps;h.control.update();assert.equal(h.nodes.fps.value,'2^');
    const t=tour();for(const key of ['duration','transition-duration','transition-angle','transition-distance','transition-components']){
      t.nodes[key].value='uncommitted';globalThis.document.activeElement=t.nodes[key];t.control.sync();assert.equal(t.nodes[key].value,'uncommitted');
    }
  }finally{if(saved)Object.defineProperty(globalThis,'document',saved);else delete globalThis.document;}
});

test('cancelNumeric aborts only numeric work, preserving unrelated export cancellation ownership',async()=>{
  for(const build of [animation,tour]){
    const h=build(),gate=deferred();h.context.evaluateMany=()=>gate.promise;const pending=observed(h.control instanceof AnimationControls?h.control.configure():h.control.add());await flush();
    h.control.exportAbort=false;let stopped=0;h.control.exportRecorder={state:'recording',stop:()=>stopped++};h.control.exporter={cancel:()=>stopped++};h.control.cancelNumeric();
    assert.match((await pending).error.message,/cancel/i);assert.equal(h.control.exportAbort,false);assert.equal(stopped,0);gate.resolve([2,4]);
  }
});
