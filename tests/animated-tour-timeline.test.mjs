import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTour,evaluateTour} from '../ui/tour.mjs';
import {prepareAnimatedTourTimeline,normalizeAnimatedTour,evaluateAnimatedTour,animatedTourFrameTimes,
  ANIMATED_TOUR_LIMITS} from '../ui/animated-tour-timeline.mjs';

function cube(id='cube'){
  return {id,name:id,dimension:3,embeddingDimension:3,interpretation:'generalized-complex',
    vertices:[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
    edges:[[0,1],[1,2],[2,3],[0,3],[4,5],[5,6],[6,7],[4,7],[0,4],[1,5],[2,6],[3,7]],
    faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],cells:[],
    metadata:{coordinateUnits:'mm',offlineAsset:{relativePath:'textures/a.png',sha256:'retained'},
      offColors:{faces:[{encoding:'byte',values:[25,80,210,127]},null,null,null,null,{encoding:'unit',values:[.1,.4,.7,.25]}],cells:[]}},
    numeric:{mode:'float64-approximate',certified:false}};
}
function star(){
  const m=cube('ordered-star');m.dimension=m.embeddingDimension=2;
  m.vertices=Array.from({length:5},(_,i)=>[Math.cos(2*Math.PI*i/5),Math.sin(2*Math.PI*i/5)]);
  m.faces=[[0,2,4,1,3]];m.edges=[[0,2],[2,4],[4,1],[1,3],[3,0]];m.metadata.rawSymbol='5/2';
  m.metadata.offColors.faces=[{encoding:'byte',values:[30,40,200,126]}];return m;
}
const state=(model=cube(),animation)=>({model,notes:'Independent source notes',operationNode:'inert-lineage',
  view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0],camera:{position:[3,4,5],projection:'orthographic'},
    ...animation?{animation}:{}}});
const event=(id,duration,transition={method:'instant'},snapshot=state(cube(id)))=>({id,state:snapshot,duration,transition});
const tour=(events,cursor=0)=>({version:2,events,cursor});
const plan=(events,opts)=>prepareAnimatedTourTimeline(tour(events),opts);
const near=(a,b)=>assert.ok(Math.abs(a-b)<=1e-12,`${a} != ${b}`);
const animation=(fps=24,loop=false)=>({version:2,duration:2,fps,loop,
  tracks:{explosion:{direction:'radial'},fold:{kind:'face-net'}},keyframes:[
    {time:0,angles:[0,0,0,0,0,0],sectionOffset:-2,explosionAmount:0,foldFraction:0},
    {time:2,angles:[360,0,0,0,0,0],sectionOffset:2,explosionAmount:.5,foldFraction:1}]});

test('legacy instant tour migration preserves absolute evaluator boundary/loop/end behavior',()=>{
  const legacy=normalizeTour({version:1,cursor:1,events:[
    {...event('cube',1),transition:'instant'},{...event('star',2,undefined,state(star())),transition:'instant'}]});
  for(const loop of [false,true]){
    const timeline=prepareAnimatedTourTimeline(legacy,{loop});assert.equal(timeline.tour.version,2);assert.equal(timeline.tour.cursor,1);
    for(const time of [-7,-1,0,.25,1,1.5,3,7]){
      const old=evaluateTour(legacy,time,{loop}),sample=evaluateAnimatedTour(timeline,time);
      assert.equal(sample.index,old.index);near(sample.localTime,old.localTime);assert.equal(sample.ended,old.ended);
      assert.deepEqual(sample.layers[0].state,old.event.state);
    }
  }
});
test('event hold durations exclude transitions; literal partition and exact interior boundaries',()=>{
  const timeline=plan([event('a',1,{method:'sideways',duration:.5,easing:'linear'}),event('b',2)]);
  assert.equal(timeline.duration,3.5);assert.deepEqual(timeline.eventStarts,[0,1.5]);
  assert.deepEqual(timeline.intervals.map(i=>[i.kind,i.index,i.start,i.end]),[['hold',0,0,1],['transition',0,1,1.5],['hold',1,1.5,3.5]]);
  assert.equal(evaluateAnimatedTour(timeline,1).phase,'transition');assert.equal(evaluateAnimatedTour(timeline,1).localTime,0);
  const next=evaluateAnimatedTour(timeline,1.5);assert.equal(next.index,1);assert.equal(next.phase,'hold');assert.equal(next.localTime,0);
  const end=evaluateAnimatedTour(timeline,999);assert.equal(end.time,3.5);assert.equal(end.localTime,2);assert.equal(end.ended,true);
});
test('sideways midpoint has two independently bound sources and analytic visual poses',()=>{
  const timeline=plan([event('a',1,{method:'sideways',duration:2,easing:'linear',distance:4}),event('b',1)]);
  const sample=evaluateAnimatedTour(timeline,2);assert.equal(sample.phase,'transition');
  assert.deepEqual(sample.layers.map(l=>[l.eventId,l.modelId,l.role,l.localTime]),[['a','a','outgoing',1],['b','b','incoming',0]]);
  assert.deepEqual(sample.layers[0].transitionPose.translation,[-2,0,0]);assert.deepEqual(sample.layers[1].transitionPose.translation,[2,0,0]);
  assert.equal(sample.layers[0].transitionPose.opacity,.5);assert.equal(sample.layers[1].transitionPose.opacity,.5);
});
test('saved v2 rotation/depth/explosion/fold tracks share absolute event-local time',()=>{
  const timeline=plan([event('a',1,{method:'shrink-grow',duration:.5,easing:'linear'},state(cube('a'),animation())),
    event('b',2,{method:'instant'},state(cube('b'),animation()))]);
  const middle=evaluateAnimatedTour(timeline,.5).layers[0].animation;
  assert.equal(middle.time,.5);assert.deepEqual(middle.frame.angles,[90,0,0,0,0,0]);
  assert.equal(middle.frame.sectionOffset,-1);assert.equal(middle.frame.explosionAmount,.125);assert.equal(middle.frame.foldFraction,.25);
  const transition=evaluateAnimatedTour(timeline,1.25);
  assert.equal(transition.layers[0].animation.time,1);assert.equal(transition.layers[0].animation.frame.angles[0],180);
  assert.equal(transition.layers[1].animation.time,0);assert.equal(transition.layers[1].animation.frame.angles[0],0);
  assert.equal(transition.layers[0].transitionPose.scale,.5);assert.equal(transition.layers[1].transitionPose.scale,.5);
  assert.equal(evaluateAnimatedTour(timeline,2.5).layers[0].animation.time,1);
});
test('nonlooping saved animation clamps; looping saved animation repeats exact period',()=>{
  const timeline=plan([event('a',5,undefined,state(cube('a'),animation())),event('b',5,undefined,state(cube('b'),animation(24,true)))]);
  assert.equal(evaluateAnimatedTour(timeline,4).layers[0].animation.time,2);
  assert.equal(evaluateAnimatedTour(timeline,7).layers[0].animation.time,0);
  assert.equal(evaluateAnimatedTour(timeline,7.5).layers[0].animation.time,.5);
});
test('elapsed-time poses are invariant to sparse/reordered requests and track/export FPS',()=>{
  const a=plan([event('a',2,undefined,state(cube('a'),animation(12)))]),b=plan([event('a',2,undefined,state(cube('a'),animation(60)))]);
  const expected=evaluateAnimatedTour(a,1).layers[0].animation.frame;
  for(const time of [2,0,.017,1.999,.5])evaluateAnimatedTour(a,time);
  assert.deepEqual(evaluateAnimatedTour(a,1).layers[0].animation.frame,expected);
  assert.deepEqual(evaluateAnimatedTour(b,1).layers[0].animation.frame,expected);
  for(const fps of [12,24,60]){
    const exact=animatedTourFrameTimes(a,fps).find(t=>t===1);assert.equal(exact,1);
    assert.deepEqual(evaluateAnimatedTour(a,exact).layers[0].animation.frame,expected);
  }
});
test('loop closing transition leads to first event; final transition omitted for nonlooping playback',()=>{
  const events=[event('a',1,{method:'sideways',duration:.5}),event('b',2,{method:'shrink-grow',duration:.25,easing:'linear'})];
  const once=plan(events),loop=plan(events,{loop:true});assert.equal(once.duration,3.5);assert.equal(loop.duration,3.75);
  const half=evaluateAnimatedTour(loop,-.125);assert.equal(half.phase,'transition');
  assert.deepEqual(half.layers.map(l=>l.eventId),['b','a']);assert.equal(half.layers[0].transitionPose.opacity,.5);
  assert.equal(evaluateAnimatedTour(loop,3.75).time,0);assert.equal(evaluateAnimatedTour(loop,3.75).layers[0].eventId,'a');
  assert.equal(evaluateAnimatedTour(once,3.5).ended,true);assert.equal(evaluateAnimatedTour(once,3.5).layers.length,1);
});
test('single-event looping transition has separate roles even when source snapshot is shared',()=>{
  const timeline=plan([event('same',1,{method:'orbit',duration:1})],{loop:true});
  const sample=evaluateAnimatedTour(timeline,1.5);assert.equal(sample.layers.length,2);
  assert.equal(sample.layers[0].state,sample.layers[1].state);assert.notEqual(sample.layers[0].role,sample.layers[1].role);
});
test('positive tiny loop times retain their representable remainder instead of rounding to zero',()=>{
  const timeline=plan([event('a',3600)],{loop:true});
  for(const time of [Number.MIN_VALUE,1e-20,1e-12]){
    const sample=evaluateAnimatedTour(timeline,time);assert.equal(sample.time,time);assert.equal(sample.localTime,time);
  }
});
test('nonlooping endpoint reproduces literal event duration despite cumulative subtraction rounding',()=>{
  const timeline=plan([event('a',.1,{method:'sideways',duration:.2}),event('b',.1)]);
  assert.notEqual(timeline.duration-timeline.eventStarts[1],.1);
  const end=evaluateAnimatedTour(timeline,timeline.duration);assert.equal(end.localTime,.1);assert.equal(end.layers[0].localTime,.1);
});
test('event/transition exact sample endpoints and optional nongrid boundaries remain distinct',()=>{
  const timeline=plan([event('a',.1,{method:'sideways',duration:.15}),event('b',.1)]);
  assert.deepEqual(animatedTourFrameTimes(timeline,10),[0,.1,.2,.3,.35]);
  assert.deepEqual(animatedTourFrameTimes(timeline,10,{includeBoundaries:true}),[0,.1,.2,.25,.3,.35]);
  assert.equal(evaluateAnimatedTour(timeline,.1).phase,'transition');assert.equal(evaluateAnimatedTour(timeline,.25).layers[0].eventId,'b');
});
test('state ownership is detached, deep frozen and includes ordered star incidence/assets/lineage',()=>{
  const input=tour([event('star',1,undefined,state(star()))]),before=structuredClone(input);
  const timeline=prepareAnimatedTourTimeline(input),sample=evaluateAnimatedTour(timeline,.5),snapshot=sample.layers[0].state;
  assert.deepEqual(input,before);assert.equal(Object.isFrozen(input),false);assert.equal(Object.isFrozen(input.events[0].state.model.metadata),false);
  assert.deepEqual(snapshot,before.events[0].state);assert.deepEqual(snapshot.model.faces,[[0,2,4,1,3]]);
  assert.throws(()=>snapshot.model.vertices[0][0]=99,TypeError);assert.throws(()=>sample.layers.push(null),TypeError);
  input.events[0].state.model.metadata.offColors.faces[0].values[3]=0;input.events[0].state.notes='changed';
  assert.equal(snapshot.model.metadata.offColors.faces[0].values[3],126);assert.equal(snapshot.notes,'Independent source notes');
});
test('owned snapshots and sequences are reused per frame; animation frames and transition poses are independent',()=>{
  const timeline=plan([event('a',2,undefined,state(cube('a'),animation()))]),a=evaluateAnimatedTour(timeline,.25),b=evaluateAnimatedTour(timeline,.75);
  assert.equal(a.layers[0].state,b.layers[0].state);assert.equal(a.layers[0].animation.sequence,b.layers[0].animation.sequence);
  assert.notEqual(a.layers[0].animation.frame,b.layers[0].animation.frame);assert.equal(Object.isFrozen(a.layers[0].animation.frame.angles),true);
  assert.equal(a.layers[0].state.view.animation.keyframes[0].angles[0],0);
});
test('empty tour has explicit empty result and one mathematical frame request',()=>{
  const timeline=plan([],{loop:true});assert.deepEqual(evaluateAnimatedTour(timeline,99),{time:0,duration:0,index:-1,phase:'empty',localTime:0,ended:true,layers:[]});
  assert.deepEqual(animatedTourFrameTimes(timeline,60),[0]);
});
test('transition combination delegates checked presentation math without changing model dimension',()=>{
  const timeline=plan([event('star',1,{method:'combination',duration:2,easing:'linear',distance:4,explosionSize:5,
    components:['sideways','explode-grow']},state(star())),event('cube',1)]);
  const sample=evaluateAnimatedTour(timeline,2);assert.equal(sample.layers[0].state.model.dimension,2);
  assert.equal(sample.layers[0].transitionPose.explosionFactor,3);assert.equal(sample.layers[1].transitionPose.scale,.5);
  assert.deepEqual(sample.layers[0].transitionPose.translation,[-2,0,0]);assert.deepEqual(sample.layers[0].state.model.faces,[[0,2,4,1,3]]);
});
test('a 3D to 4D presentation plan retains literal fourth coordinates and six-plane rotation track',()=>{
  const model=cube('literal4-simplex');model.dimension=model.embeddingDimension=4;
  model.vertices=[[0,0,0,0],[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
  model.edges=[];model.faces=[];
  for(let a=0;a<5;a++)for(let b=a+1;b<5;b++){
    model.edges.push([a,b]);for(let c=b+1;c<5;c++)model.faces.push([a,b,c]);
  }
  model.cells=Array.from({length:5},(_,omitted)=>model.faces.flatMap((face,index)=>face.includes(omitted)?[]:[index]));
  model.metadata.offColors={faces:Array(10).fill(null),cells:Array(5).fill(null)};
  const spin={version:1,duration:2,fps:24,keyframes:[
    {time:0,angles:[0,0,0,0,0,0],sectionOffset:0},{time:2,angles:[0,0,0,360,0,0],sectionOffset:1}]};
  const timeline=plan([event('a',1,{method:'sideways',duration:1}),event('four',2,undefined,state(model,spin))]);
  const transition=evaluateAnimatedTour(timeline,1.5);assert.equal(transition.layers[0].state.model.dimension,3);
  assert.equal(transition.layers[1].state.model.dimension,4);assert.deepEqual(transition.layers[1].state.model.vertices,model.vertices);
  const middle=evaluateAnimatedTour(timeline,3).layers[0];assert.equal(middle.animation.frame.angles[3],180);
  assert.equal(middle.animation.frame.sectionOffset,.5);assert.deepEqual(middle.state.model.cells,model.cells);
});
test('invalid saved animation fails even in an event not initially shown; caller data stays unchanged',()=>{
  const broken=animation();broken.keyframes[1].foldFraction=2;
  const input=tour([event('a',1),event('bad',1,undefined,state(cube('bad'),broken))]),before=structuredClone(input);
  assert.throws(()=>prepareAnimatedTourTimeline(input),/event 1 \(bad\).*foldFraction/);assert.deepEqual(input,before);
});
test('unknown/missing version, fields, unsupported transition and bad event/sequence parameters refuse',()=>{
  const source=tour([event('a',1)]);
  for(const change of [x=>x.version=3,x=>x.extra='ignored',x=>delete x.cursor,x=>x.events[0].transition={method:'morph'},
    x=>x.events[0].transition='instant',x=>x.events[0].duration=0,x=>x.cursor=1,x=>x.events[0].extra=true]){
    const input=structuredClone(source);change(input);assert.throws(()=>prepareAnimatedTourTimeline(input));
  }
});
test('accessors and sparse/custom arrays are refused without executing getter bodies',()=>{
  let calls=0;const input=tour([event('a',1)]);
  Object.defineProperty(input,'version',{get(){calls++;return 2;}});assert.throws(()=>prepareAnimatedTourTimeline(input),/accessor/);assert.equal(calls,0);
  const source=tour([event('a',1)]);Object.defineProperty(source.events[0],'transition',{get(){calls++;return {method:'instant'};}});
  assert.throws(()=>prepareAnimatedTourTimeline(source),/accessor/);assert.equal(calls,0);
  const sparse=Array(1);assert.throws(()=>prepareAnimatedTourTimeline(tour(sparse)),/holes/);
  const custom=[event('a',1)];custom.extra='ignored';assert.throws(()=>prepareAnimatedTourTimeline(tour(custom)),/ordinary array/);
});
test('invalid model source incidence, nonfinite metadata and duplicate event IDs refuse',()=>{
  const bad=cube();bad.faces[0][0]=99;assert.throws(()=>plan([event('a',1,undefined,state(bad))]));
  const nonfinite=cube();nonfinite.metadata.residual=Infinity;assert.throws(()=>plan([event('a',1,undefined,state(nonfinite))]));
  assert.throws(()=>plan([event('a',1),event('a',1)]),/unique/);
});
test('event, FPS and frame count resource bounds are enforced before large sampling',()=>{
  assert.throws(()=>plan(Array.from({length:101},(_,i)=>event(String(i),1))),/bounded/);
  const timeline=plan([event('a',300)]);assert.equal(animatedTourFrameTimes(timeline,60).length,ANIMATED_TOUR_LIMITS.frames);
  assert.throws(()=>animatedTourFrameTimes(plan([event('a',301)]),60),/18001/);
  for(const fps of [0,1.5,61,Infinity,'24',true])assert.throws(()=>animatedTourFrameTimes(timeline,fps),/FPS/);
  assert.throws(()=>animatedTourFrameTimes(timeline,24,{includeBoundaries:1}),/boolean/);
});
test('maximum readable loop partition is bounded and optional boundaries cannot exceed capture count',()=>{
  const timeline=plan(Array.from({length:100},(_,i)=>event(String(i),3600,{method:'sideways',duration:60})),{loop:true});
  assert.equal(timeline.duration,ANIMATED_TOUR_LIMITS.duration);assert.equal(timeline.intervals.length,ANIMATED_TOUR_LIMITS.intervals);
  assert.throws(()=>animatedTourFrameTimes(timeline,1),/18001/);
  const exactLimit=plan([event('a',.0001,{method:'sideways',duration:.0001}),event('b',299.9998)]);
  assert.equal(animatedTourFrameTimes(exactLimit,60).length,18001);
  assert.throws(()=>animatedTourFrameTimes(exactLimit,60,{includeBoundaries:true}),/boundaries.*18001/);
});
test('positive event durations that collapse into a previous large timestamp refuse explicitly',()=>{
  assert.throws(()=>plan([event('a',3600),event('tiny',Number.MIN_VALUE)]),/Float64 resolution/);
});
test('foreign/forged timelines and nonfinite/non-numeric elapsed seconds are refused',()=>{
  const timeline=plan([event('a',1)]);
  assert.throws(()=>evaluateAnimatedTour({...timeline},0),/owned/);assert.throws(()=>animatedTourFrameTimes(structuredClone(timeline),24),/owned/);
  for(const time of [NaN,Infinity,-Infinity,'1',true])assert.throws(()=>evaluateAnimatedTour(timeline,time),/finite/);
  assert.throws(()=>prepareAnimatedTourTimeline(tour([event('a',1)]),{loop:1}),/boolean/);
});
test('normalization retains complete snapshots without modifying caller transition definitions',()=>{
  const input=tour([event('a',1,{method:'sideways',duration:.25,easing:'linear'})]),before=structuredClone(input),normal=normalizeAnimatedTour(input);
  assert.deepEqual(input,before);assert.equal(Object.isFrozen(input.events[0].transition),false);
  assert.deepEqual(normal.events[0].state,before.events[0].state);assert.equal(Object.isFrozen(normal.events[0].transition),true);
});
