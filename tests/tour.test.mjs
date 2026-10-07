import test from 'node:test';
import assert from 'node:assert/strict';
import {TOUR_LIMITS,createTour,normalizeTour,addTourEvent,replaceTourEvent,setTourDuration,setTourTransition,selectTourEvent,deleteTourEvent,moveTourEvent,mergeTours,tourDuration,tourEventStart,evaluateTour} from '../ui/tour.mjs';
import {normalizeTransition} from '../ui/transitions.mjs';
import {TourControls} from '../ui/tour-controls.mjs';

// Cartesian incidence is hand authored, independent of kernel generators.
const cube=()=>({model:{name:'Cube',dimension:3,embeddingDimension:3,interpretation:'convex-polytope',
  vertices:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
  edges:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],
  faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],cells:[],metadata:{sourceAsset:{key:'hand-cube',sha256:'retained-offline',colors:[10,20,30,128]}}},
  view:{angles:[0,0,0,0,0,0],cameraProjection:'orthographic'},notes:'Retained notes'});
const section=()=>{const state=cube();state.model.name='Central tesseract section';state.model.metadata.sourceNormal=[0,0,0,1];state.model.metadata.sourceDepth=0;state.model.provenance={sourceDimension:4,convexified:false};state.view.sectionOffset=.25;return state;};
const sequence=()=>addTourEvent(addTourEvent(createTour(),cube(),2,'cube'),section(),3,'section');

test('empty and legacy tours have deterministic evaluators and explicit immutable records',()=>{
  assert.deepEqual(normalizeTour(undefined),{version:1,events:[],cursor:0});
  assert.deepEqual(evaluateTour(createTour(),999),{index:-1,event:null,time:0,localTime:0,duration:0,ended:true});
  assert.equal(tourDuration(createTour()),0);assert.ok(Object.isFrozen(createTour().events));
  assert.throws(()=>tourEventStart(createTour(),0),/unavailable/);
});

test('saved geometry, view, notes, assets and lineage never alias caller data',()=>{
  const state=cube();state.operationNode='source-recipe';const bank=addTourEvent(createTour(),state,2,'one');
  state.model.vertices[0][0]=88;state.model.metadata.sourceAsset.colors.reverse();state.view.angles[0]=90;state.notes='mutated';
  assert.equal(bank.events[0].state.model.vertices[0][0],-1);assert.equal(bank.events[0].state.view.angles[0],0);assert.equal(bank.events[0].state.notes,'Retained notes');
  assert.equal(bank.events[0].state.operationNode,'source-recipe');assert.deepEqual(bank.events[0].state.model.metadata.sourceAsset.colors,[10,20,30,128]);
  assert.throws(()=>{bank.events[0].state.model.vertices[0][0]=7;},TypeError);
  const restored=normalizeTour(JSON.parse(JSON.stringify(bank)));assert.deepEqual(restored,bank);assert.notEqual(restored.events[0].state,bank.events[0].state);
});

test('source star cycles and RGBA survive JSON without convexification',()=>{
  const state={model:{name:'Pentagram',dimension:2,embeddingDimension:2,interpretation:'generalized-complex',vertices:[[1,0],[.30901699437494745,.9510565162951535],[-.8090169943749473,.5877852522924732],[-.8090169943749476,-.587785252292473],[.30901699437494723,-.9510565162951536]],edges:[[0,2],[2,4],[4,1],[1,3],[3,0]],faces:[[0,2,4,1,3]],cells:[],metadata:{offColors:{faces:[{encoding:'byte',values:[5,20,100,128]}]}}},view:{fillRule:'even-odd'}};
  const bank=normalizeTour(JSON.parse(JSON.stringify(addTourEvent(createTour(),state,5,'star'))));assert.deepEqual(bank.events[0].state,state);assert.deepEqual(bank.events[0].state.model.faces,[[0,2,4,1,3]]);
});

test('absolute seek has exact boundaries, clamping and reproducible end poses',()=>{
  const bank=sequence();assert.equal(tourDuration(bank),5);assert.equal(tourEventStart(bank,1),2);
  for(const [time,index,localTime,ended] of [[-4,0,0,false],[0,0,0,false],[1.25,0,1.25,false],[2,1,0,false],[4.5,1,2.5,false],[5,1,3,true],[900,1,3,true]]){
    const result=evaluateTour(bank,time);assert.deepEqual([result.index,result.localTime,result.ended],[index,localTime,ended]);assert.equal(result.event,bank.events[index]);
  }
  const target=evaluateTour(bank,4.5);for(const time of [1,3,0,900])evaluateTour(bank,time);assert.deepEqual(evaluateTour(bank,4.5),target);
  assert.throws(()=>evaluateTour(bank,NaN),/finite/);assert.throws(()=>evaluateTour(bank,Infinity),/finite/);
});

test('looping uses absolute modulo time including negative seek and total boundary',()=>{
  const bank=sequence();for(const time of [0,5,10,500])assert.deepEqual([evaluateTour(bank,time,{loop:true}).index,evaluateTour(bank,time,{loop:true}).localTime],[0,0]);
  assert.deepEqual([evaluateTour(bank,-1,{loop:true}).index,evaluateTour(bank,-1,{loop:true}).localTime],[1,2]);
  assert.equal(evaluateTour(bank,1002,{loop:true}).index,1);assert.equal(evaluateTour(bank,5,{loop:true}).ended,false);
});

test('replace, duration, reorder and delete preserve prior banks and selected identity',()=>{
  const bank=sequence(),before=JSON.stringify(bank),selected=selectTourEvent(bank,0);
  const moved=moveTourEvent(selected,0,1);assert.deepEqual(moved.events.map(event=>event.id),['section','cube']);assert.equal(moved.cursor,1);
  assert.deepEqual(moveTourEvent(moved,1,-1),selected);
  const replaced=replaceTourEvent(bank,1,cube(),.125);assert.equal(replaced.events[1].id,'section');assert.equal(replaced.events[1].duration,.125);assert.equal(replaced.events[1].state.model.name,'Cube');
  assert.equal(setTourDuration(bank,0,.25).events[0].duration,.25);assert.equal(deleteTourEvent(bank,0).cursor,0);assert.deepEqual(deleteTourEvent(deleteTourEvent(bank,1),0),createTour());assert.equal(JSON.stringify(bank),before);
  for(const index of [-1,2,.5,'0'])assert.throws(()=>replaceTourEvent(bank,index,cube()),/unavailable/);
  assert.throws(()=>moveTourEvent(bank,0,-1),/unavailable/);assert.throws(()=>moveTourEvent(bank,0,2),/direction/);
});

test('merging detaches untrusted banks and deterministically renames ID collisions',()=>{
  const bank=sequence(),imported=JSON.parse(JSON.stringify(bank));const merged=mergeTours(bank,imported);
  assert.deepEqual(merged.events.map(event=>event.id),['cube','section','cube~1','section~1']);assert.equal(merged.cursor,1);
  imported.events[0].state.model.vertices[0][0]=333;assert.equal(merged.events[2].state.model.vertices[0][0],-1);assert.equal(bank.events.length,2);
  assert.deepEqual(mergeTours(bank,createTour()),bank);
  const longId='x'.repeat(128),one=addTourEvent(createTour(),cube(),1,longId);const twice=mergeTours(one,one);assert.equal(twice.events[1].id.length,128);assert.ok(twice.events[1].id.endsWith('~1'));
});

test('unsupported transitions, finite durations, malformed cursors and records reject',()=>{
  for(const value of [null,false,{}, {version:true,events:[],cursor:0},{version:1,events:[],cursor:1},{...createTour(),extra:true}])assert.throws(()=>normalizeTour(value));
  for(const duration of [0,-1,NaN,Infinity,true,'2',3601])assert.throws(()=>addTourEvent(createTour(),cube(),duration,'x'),/duration/);
  const bank=JSON.parse(JSON.stringify(sequence()));bank.events[0].transition='fade';assert.throws(()=>normalizeTour(bank),/Only instant/);
  bank.events[0].transition='instant';bank.events[1].id=bank.events[0].id;assert.throws(()=>normalizeTour(bank),/unique/);
  for(const id of ['',7,'x'.repeat(129)])assert.throws(()=>addTourEvent(createTour(),cube(),1,id),/IDs/);
  const invalid=cube();invalid.model.faces[0][0]=99;assert.throws(()=>addTourEvent(createTour(),invalid));
});

test('JSON normalization rejects sparse, accessor and custom arrays without executing getters',()=>{
  let calls=0;const events=[];Object.defineProperty(events,'0',{get(){calls++;return {};}});events.length=1;
  assert.throws(()=>normalizeTour({version:1,events,cursor:0}),/accessors/);assert.equal(calls,0);
  assert.throws(()=>normalizeTour({version:1,events:Array(1),cursor:0}),/sparse/);
  const record={version:1,events:[],cursor:0};Object.defineProperty(record,'cursor',{get(){calls++;return 0;}});assert.throws(()=>normalizeTour(record),/accessors/);assert.equal(calls,0);
  const custom=[];custom['01']=null;assert.throws(()=>normalizeTour({version:1,events:custom,cursor:0}),/custom/);
});

test('event count, UTF8 bytes, nesting and whole-bank bytes are bounded',()=>{
  let bank=createTour();for(let index=0;index<100;index++)bank=addTourEvent(bank,cube(),1,`event-${index}`);assert.throws(()=>addTourEvent(bank,cube()),/100 events/);assert.throws(()=>mergeTours(bank,sequence()),/100 events/);
  const deep=cube();let item=deep.view;for(let index=0;index<64;index++)item=item.child={};assert.throws(()=>addTourEvent(createTour(),deep),/nesting/);
  const oversized=cube();oversized.notes='\u20ac'.repeat(Math.ceil(TOUR_LIMITS.eventBytes/3));assert.throws(()=>addTourEvent(createTour(),oversized),/32 MiB/);
  const large=cube();large.notes='x'.repeat(16*1024*1024);let big=createTour();for(let index=0;index<7;index++)big=addTourEvent(big,large,1,`big-${index}`);assert.throws(()=>addTourEvent(big,large,1,'too-big'),/128 MiB/);assert.equal(big.events.length,7);
});

function controlsFixture({showEvent,isExporting,importTour}={}){
  let current=cube(),dirty=0,project={tour:sequence()};
  const controls=Object.create(TourControls.prototype);Object.assign(controls,{playing:false,busy:false,showing:false,generation:0,time:0,shownId:null,nodes:{duration:{value:'5'},play:{},scrub:{},position:{}}});
  controls.context={getProject:()=>project,getState:()=>current,markDirty:()=>dirty++,isExporting:isExporting||(()=>false),importTour,showEvent:showEvent||(async state=>{current=state;})};
  controls.observedTour=project.tour;controls.sync=()=>{};
  return {controls,project,current:()=>current,setCurrent:value=>{current=value;},setProject:value=>{project=value;},dirty:()=>dirty};
}

test('UI native show failure cannot publish a different cursor or mutate saved snapshots',async()=>{
  const fixture=controlsFixture({showEvent:async snapshot=>{snapshot.model.vertices[0][0]=88;throw new Error('Native certificate rejected.');}}),bank=fixture.project.tour;
  await assert.rejects(()=>fixture.controls.seek(0,true),/certificate rejected/);assert.equal(fixture.project.tour,bank);assert.equal(bank.cursor,1);assert.equal(bank.events[0].state.model.vertices[0][0],-1);assert.equal(fixture.controls.showing,false);assert.equal(fixture.dirty(),0);
});

test('UI seek passes detached state and publishes selection only after native success',async()=>{
  const fixture=controlsFixture(),bank=fixture.project.tour;let passed;
  fixture.controls.context.showEvent=async(snapshot,label,options)=>{passed=options;assert.equal(fixture.project.tour,bank);assert.equal(label,'Tour 1: Cube');fixture.setCurrent(snapshot);};
  await fixture.controls.seek(0,true);assert.equal(fixture.project.tour.cursor,0);assert.equal(fixture.dirty(),1);assert.ok(passed.isCurrent());assert.equal(passed.signal.aborted,false);
  fixture.current().model.vertices[0][0]=100;assert.equal(fixture.project.tour.events[0].state.model.vertices[0][0],-1);
});

test('UI pause aborts an in-flight preview and suppresses stale cursor publication',async()=>{
  let release,options;const pending=new Promise(resolve=>{release=resolve;});const fixture=controlsFixture({showEvent:async(_,__,value)=>{options=value;await pending;}}),bank=fixture.project.tour;
  const action=fixture.controls.seek(0,true);fixture.controls.pause();assert.equal(options.signal.aborted,true);assert.equal(options.isCurrent(),false);release();await action;assert.equal(fixture.project.tour,bank);assert.equal(fixture.dirty(),0);
});

test('UI project replacement suppresses stale native preview selection',async()=>{
  let release,options;const fixture=controlsFixture({showEvent:async(_,__,value)=>{options=value;await new Promise(resolve=>{release=resolve;});}}),bank=fixture.project.tour;
  const action=fixture.controls.seek(0,true);fixture.setProject({tour:createTour()});assert.equal(options.isCurrent(),false);release();await action;assert.equal(fixture.project.tour,bank);assert.equal(fixture.dirty(),0);
});

test('UI invalid merge and export guard preserve bank and clear busy state',async()=>{
  const fixture=controlsFixture({importTour:async()=>({version:1,events:[],cursor:99})}),bank=fixture.project.tour;await assert.rejects(()=>fixture.controls.merge(),/cursor/);assert.equal(fixture.project.tour,bank);assert.equal(fixture.controls.busy,false);
  const blocked=controlsFixture({isExporting:()=>true});for(const action of [()=>blocked.controls.add(),()=>blocked.controls.seek(0),()=>blocked.controls.play(),()=>blocked.controls.merge()])await assert.rejects(action,/animation export/);assert.equal(blocked.dirty(),0);
});

function animated(){
  const source=sequence(),state=structuredClone(source.events[0].state);
  state.model.id='exact-source';state.model.metadata.coordinateUnits='mm';
  state.view.coordinateUnit='mm';state.view.animation={version:2,duration:2,fps:24,loop:false,
    tracks:{explosion:{direction:'radial'},fold:{kind:'face-net'}},keyframes:[
      {time:0,angles:[0,0,0,0,0,0],sectionOffset:-2,explosionAmount:0,foldFraction:0},
      {time:2,angles:[360,0,0,0,0,0],sectionOffset:2,explosionAmount:.5,foldFraction:1}]};
  state.operationNode='saved-lineage';
  return normalizeTour({version:2,cursor:0,events:[{...source.events[0],state,
    transition:{method:'combination',duration:.75,direction:-1,distance:4,
      angle:-35,components:['sideways','explode-grow']}},
    {...source.events[1],transition:{method:'orbit',duration:.5}}]});
}

test('v2 snapshots, tracks, RGBA and all normalized outgoing transition options survive JSON',()=>{
  const bank=animated(),restored=normalizeTour(JSON.parse(JSON.stringify(bank)));
  assert.equal(restored.version,2);assert.deepEqual(restored,bank);
  const event=restored.events[0];assert.equal(event.state.model.id,'exact-source');
  assert.equal(event.state.operationNode,'saved-lineage');assert.equal(event.state.model.metadata.coordinateUnits,'mm');
  assert.deepEqual(event.state.model.metadata.sourceAsset.colors,[10,20,30,128]);
  assert.equal(event.state.view.animation.keyframes[1].angles[0],360);
  assert.equal(event.transition.method,'combination');assert.equal(event.transition.direction,-1);
  assert.deepEqual(event.transition.components,['sideways','explode-grow']);
  assert.ok(Object.isFrozen(event.transition.components));assert.ok(Object.isFrozen(event.state.view.animation));
});

test('setting a transition explicitly upgrades v1 without altering stored source snapshots',()=>{
  const legacy=sequence(),before=JSON.stringify(legacy),options={method:'orbit',duration:1.25,
    easing:'smootherstep',tilt:-25,orbits:3,spin:2,direction:-1};
  const bank=setTourTransition(legacy,0,options);
  assert.equal(bank.version,2);assert.equal(bank.cursor,0);
  assert.equal(bank.events[0].state,legacy.events[0].state);
  assert.equal(bank.events[1].state,legacy.events[1].state);
  assert.deepEqual(bank.events[0].transition,normalizeTransition(options));
  assert.deepEqual(bank.events[1].transition,normalizeTransition({method:'instant'}));
  options.method='morph';assert.equal(bank.events[0].transition.method,'orbit');
  assert.equal(JSON.stringify(legacy),before);
  const instant=setTourTransition(bank,0,{method:'instant'});assert.equal(instant.version,2);
  assert.equal(instant.events[0].transition.duration,0);assert.equal(bank.events[0].transition.duration,1.25);
});

test('v2 add/replace/duration/select/move/delete retain transitions and version even when empty',()=>{
  const bank=animated(),before=JSON.stringify(bank),added=addTourEvent(bank,cube(),1,'new');
  assert.equal(added.version,2);assert.deepEqual(added.events[2].transition,normalizeTransition({method:'instant'}));
  const replaced=replaceTourEvent(bank,0,section(),.25);
  assert.equal(replaced.version,2);assert.deepEqual(replaced.events[0].transition,bank.events[0].transition);
  assert.equal(setTourDuration(bank,0,10).events[0].transition.duration,.75);
  assert.equal(selectTourEvent(bank,1).version,2);
  const moved=moveTourEvent(bank,0,1);assert.equal(moved.cursor,1);
  assert.equal(moved.events[1].transition,bank.events[0].transition);
  const removed=deleteTourEvent(moved,0);assert.equal(removed.version,2);
  assert.equal(removed.events[0].transition.method,'combination');
  assert.deepEqual(deleteTourEvent(removed,0),{version:2,events:[],cursor:0});
  assert.equal(JSON.stringify(bank),before);
});

test('mixed v1/v2 merges explicitly upgrade either direction while retaining transitions and ID collision policy',()=>{
  const legacy=sequence(),bank=animated(),before=[JSON.stringify(legacy),JSON.stringify(bank)];
  for(const [left,right] of [[legacy,bank],[bank,legacy]]){
    const merged=mergeTours(left,right);assert.equal(merged.version,2);
    assert.deepEqual(merged.events.map(event=>event.id),['cube','section','cube~1','section~1']);
    assert.equal(merged.cursor,left.cursor);
    assert.equal(merged.events[left.version===2?0:2].transition.method,'combination');
    assert.equal(merged.events[left.version===1?0:2].transition.method,'instant');
  }
  assert.equal(mergeTours(createTour(),{version:2,events:[],cursor:0}).version,2);
  assert.equal(mergeTours(bank,createTour()).version,2);
  assert.deepEqual([JSON.stringify(legacy),JSON.stringify(bank)],before);
});

test('v2 nonlooping duration/start include outgoing transitions except final and legacy evaluator refuses collapse',()=>{
  const bank=animated();assert.equal(tourDuration(bank),5.75);assert.equal(tourEventStart(bank,1),2.75);
  assert.equal(tourDuration(setTourTransition(bank,1,{method:'orbit',duration:60})),5.75);
  assert.equal(tourEventStart(setTourTransition(bank,0,{method:'sideways',duration:.125}),1),2.125);
  assert.throws(()=>evaluateTour(bank,2.25),/timeline evaluator/);
  assert.deepEqual(evaluateTour(sequence(),2).event.state,section());
});

test('v2 malformed transition updates and imports reject atomically without invoking accessors',()=>{
  const bank=animated(),before=JSON.stringify(bank);
  for(const transition of ['instant',null,{method:'morph'},{method:'orbit',duration:0},
      {method:'combination',components:['orbit','orbit']},
      {method:'combination',components:['explode-grow','shrink-implode']},
      {method:'sideways',distance:Infinity},{direction:true}]){
    assert.throws(()=>setTourTransition(bank,0,transition));
    const imported=JSON.parse(before);imported.events[1].transition=transition;
    assert.throws(()=>normalizeTour(imported));
  }
  let calls=0;const transition={};Object.defineProperty(transition,'method',{get(){calls++;return 'orbit';}});
  assert.throws(()=>setTourTransition(bank,0,transition),/accessors/);assert.equal(calls,0);
  assert.equal(JSON.stringify(bank),before);
});
