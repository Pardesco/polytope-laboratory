import test from 'node:test';
import assert from 'node:assert/strict';
import {TRANSITION_METHODS,createTransition,normalizeTransition,evaluateTransition,captureTransition,explosionOffsets} from '../ui/transitions.mjs';
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
const canonical=pose=>{assert.deepEqual(pose.translation,[0,0,0]);assert.deepEqual(pose.angles,[0,0,0,0,0,0]);assert.equal(pose.scale,1);assert.equal(pose.opacity,1);assert.equal(pose.explosionFactor,1);};

test('every method retains exact visible identity at both ends and detached immutable poses',()=>{
  for(const method of TRANSITION_METHODS){
    const options=method==='combination'?{components:['sideways','orbit','shrink-grow','explode-implode']}:{},spec=createTransition(method,options);
    const first=evaluateTransition(spec,method==='instant'?-1:0),last=evaluateTransition(spec,99);
    canonical(first.outgoing);canonical(last.incoming);assert.equal(first.incoming.opacity,0);assert.equal(last.outgoing.opacity,0);assert.equal(last.ended,true);
    assert.ok(Object.isFrozen(spec)&&Object.isFrozen(first)&&Object.isFrozen(last.incoming.angles));assert.throws(()=>{last.incoming.translation[0]=1;},TypeError);
  }
});

test('instant changes at zero without an invented fade duration',()=>{
  assert.equal(evaluateTransition(createTransition(),-0.1).progress,0);assert.equal(evaluateTransition(createTransition(),0).progress,1);
  assert.throws(()=>createTransition('instant',{duration:1}),/zero duration/);assert.throws(()=>createTransition('sideways',{duration:0}),/positive duration/);
});

test('sideways displacement is absolute and movement angle/inverse are independent analytic axes',()=>{
  const spec=createTransition('sideways',{duration:2,easing:'linear',distance:4});
  const frame=evaluateTransition(spec,.5);assert.deepEqual(frame.outgoing.translation,[-1,0,0]);assert.deepEqual(frame.incoming.translation,[3,0,0]);
  const vertical=evaluateTransition(createTransition('sideways',{duration:1,easing:'linear',distance:4,angle:90}),.5);close(vertical.outgoing.translation[0],0);close(vertical.outgoing.translation[1],-2);
  const inverse=evaluateTransition({...spec,direction:-1},.5);assert.deepEqual(inverse.outgoing.translation,[1,0,0]);assert.deepEqual(inverse.incoming.translation,[-3,0,0]);
  evaluateTransition(spec,2);evaluateTransition(spec,0);assert.deepEqual(evaluateTransition(spec,.5),frame);
});

test('tilted orbit has opposite radial centers, analytic quarter turn and shrink-grow sizes',()=>{
  const frame=evaluateTransition(createTransition('orbit',{duration:1,easing:'linear',distance:4,orbits:1,tilt:90}),.25);
  close(frame.outgoing.translation[0],0);close(frame.outgoing.translation[1],0);close(frame.outgoing.translation[2],1);
  close(frame.incoming.translation[2],-3);assert.equal(frame.outgoing.scale,.75);assert.equal(frame.incoming.scale,.25);
});

test('shrink and the three explosion combinations keep entity expansion separate from visual scale',()=>{
  const values=method=>evaluateTransition(createTransition(method,{duration:1,easing:'linear',explosionSize:5}),.25);
  const shrink=values('shrink-grow');assert.equal(shrink.outgoing.scale,.75);assert.equal(shrink.incoming.scale,.25);
  const grow=values('explode-grow');assert.equal(grow.outgoing.explosionFactor,2);assert.equal(grow.outgoing.scale,1);assert.equal(grow.incoming.scale,.25);assert.equal(grow.incoming.explosionFactor,1);
  const implode=values('shrink-implode');assert.equal(implode.outgoing.scale,.75);assert.equal(implode.incoming.explosionFactor,4);assert.equal(implode.incoming.scale,1);
  const both=values('explode-implode');assert.equal(both.outgoing.explosionFactor,2);assert.equal(both.incoming.explosionFactor,4);assert.equal(both.incoming.scale,1);
});

test('accelerating fade spin is integrated in degrees, with exact final incoming orientation',()=>{
  const spec=createTransition('sideways',{duration:2,easing:'linear',spin:3});const mid=evaluateTransition(spec,1);
  assert.equal(mid.outgoing.angles[1],270);assert.equal(mid.incoming.angles[1],-270);assert.equal(evaluateTransition(spec,2).outgoing.angles[1],1080);assert.equal(evaluateTransition(spec,2).incoming.angles[1],0);
});

test('combinations add translations, multiply scale and retain exactly one explosion family',()=>{
  const frame=evaluateTransition(createTransition('combination',{duration:1,easing:'linear',components:['sideways','orbit','shrink-grow','explode-implode'],distance:4,orbits:0,explosionSize:3}),.5);
  assert.deepEqual(frame.outgoing.translation,[0,0,0]);assert.deepEqual(frame.incoming.translation,[0,0,0]);assert.equal(frame.outgoing.scale,.25);assert.equal(frame.incoming.scale,.25);assert.equal(frame.outgoing.explosionFactor,2);
  assert.throws(()=>createTransition('combination',{components:['explode-grow','shrink-implode']}),/one explosion/);
});

test('smoothstep and smootherstep are symmetric, bounded and deterministic under seeks',()=>{
  for(const easing of ['linear','smoothstep','smootherstep']){
    const spec=createTransition('shrink-grow',{duration:1,easing});const a=evaluateTransition(spec,.2),b=evaluateTransition(spec,.8);
    close(a.incoming.scale+b.incoming.scale,1);assert.equal(evaluateTransition(spec,.5).incoming.scale,.5);assert.equal(evaluateTransition(spec,-999).progress,0);assert.equal(evaluateTransition(spec,999).progress,1);
    const start=evaluateTransition(spec,0);assert.equal(start.ended,false);assert.ok(a.incoming.scale>=0&&a.incoming.scale<=1);
  }
});

test('interruption snapshot rebases a new transition continuously and reaches its exact new endpoint',()=>{
  const frame=evaluateTransition(createTransition('orbit',{duration:1,easing:'linear',spin:2}),.3),snapshot=captureTransition(frame);
  const replacement=createTransition('sideways',{duration:2,distance:7});const start=evaluateTransition(replacement,0,{initial:snapshot});assert.deepEqual(start.outgoing,frame.outgoing);assert.deepEqual(start.incoming,frame.incoming);
  const last=evaluateTransition(replacement,2,{initial:snapshot});assert.deepEqual(last,evaluateTransition(replacement,2));
  assert.notEqual(snapshot.outgoing,frame.outgoing);assert.notEqual(snapshot.outgoing.angles,frame.outgoing.angles);assert.ok(Object.isFrozen(snapshot));assert.throws(()=>{snapshot.outgoing.scale=9;},TypeError);
});

test('Cartesian face explosion translates centroids, preserving source coordinates and dimensions',()=>{
  const source=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],before=structuredClone(source);
  assert.deepEqual(explosionOffsets(source,2,[0,0,0]),source);assert.deepEqual(source,before);assert.deepEqual(explosionOffsets(source,1,[0,0,0]),Array.from({length:6},()=>[0,0,0]));
  assert.deepEqual(explosionOffsets([[10,20,30,41],[10,20,30,39]],3,[10,20,30,40]),[[0,0,0,2],[0,0,0,-2]]);
  assert.throws(()=>explosionOffsets([[1,2,3]],2,[0,0]),/dimension mismatch/);assert.throws(()=>explosionOffsets([[NaN,0]],2,[0,0]),/finite/);
});

test('interrupted combinations never produce negative scale or invalid alpha from a vanished pose',()=>{
  const snapshot=captureTransition(evaluateTransition(createTransition('shrink-grow'),.5));
  const target=createTransition('combination',{components:['orbit','shrink-grow','explode-implode'],duration:1,easing:'smootherstep'});
  for(let index=0;index<=100;index++){
    const frame=evaluateTransition(target,index/100,{initial:snapshot});
    for(const role of ['outgoing','incoming']){assert.ok(frame[role].scale>=0&&frame[role].scale<=1);assert.ok(frame[role].opacity>=0&&frame[role].opacity<=1);assert.ok(frame[role].explosionFactor>=1&&frame[role].explosionFactor<=3);}
  }
});

test('invalid versions, methods, durations, options, cycles and array accessors reject explicitly',()=>{
  for(const bad of [null,false,{version:2},{method:'random'},{duration:Infinity},{method:'orbit',duration:61},{method:'orbit',spin:-1},{method:'orbit',explosionSize:.5},{method:'orbit',direction:0},{method:'orbit',unknown:1},{method:'combination',components:[]},{method:'combination',components:['orbit','orbit']},{method:'sideways',components:['orbit']}])assert.throws(()=>normalizeTransition(bad));
  for(const time of [NaN,Infinity,'1'])assert.throws(()=>evaluateTransition({},time),/finite/);
  let calls=0;const record={};Object.defineProperty(record,'method',{get(){calls++;return 'orbit';}});assert.throws(()=>normalizeTransition(record),/accessors/);assert.equal(calls,0);
  const components=[];Object.defineProperty(components,'0',{get(){calls++;return 'orbit';}});components.length=1;assert.throws(()=>createTransition('combination',{components}),/accessors/);assert.equal(calls,0);
});
