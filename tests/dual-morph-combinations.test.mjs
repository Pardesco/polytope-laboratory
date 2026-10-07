import test from 'node:test';
import assert from 'node:assert/strict';
import {requireNoEnabledDualMorph,requireNoTourDualMorph} from '../ui/dual-morph-combinations.mjs';
import {AnimationControls} from '../ui/animation-controls.mjs';
import {AnimationRenderer} from '../ui/animation-renderer.mjs';
import {AnimatedTourRenderer} from '../ui/animated-tour-renderer.mjs';
import {createSequence} from '../ui/animation.mjs';
const saved=()=>({model:{id:'source',fingerprint:'a'.repeat(64),name:'Source',dimension:3,embeddingDimension:3,vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],edges:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],faces:[[0,1,2],[0,3,1],[0,2,3],[1,3,2]],cells:[],metadata:{coordinateUnits:'mm',retained:{rgba:[50,100,150,127]}}},notes:'Original notes',view:{angles:Array(6).fill(0),sectionOffset:0,dualMorph:{version:1,enabled:true,method:'expansion',center:null,radius:1,ratio:.25,duration:2,loop:false}}});
test('enabled-morph refusal retains the complete saved source/settings and readable disabled configurations',()=>{
  const s=saved(),before=structuredClone(s);assert.throws(()=>requireNoEnabledDualMorph(s),/Reset.*saved settings are retained/);assert.deepEqual(s,before);
  assert.doesNotThrow(()=>requireNoEnabledDualMorph({...s,view:{...s.view,dualMorph:{...s.view.dualMorph,enabled:false}}}));assert.doesNotThrow(()=>requireNoEnabledDualMorph({view:{}}));
  assert.throws(()=>requireNoTourDualMorph({tour:{events:[{state:{view:{}}},{state:s}]}}),/Animated tour/);assert.deepEqual(s,before);
});
test('animation play/scrub/export/track edits refuse before pausing a morph or changing source/saved banks',async()=>{
  const s=saved(),before=structuredClone(s),c=Object.create(AnimationControls.prototype);let calls=0;
  c.context={getState:()=>s,isExporting:()=>false,stopLegacy:()=>calls++};c.pause=()=>calls++;c.configure=()=>{calls++;};c.numericAction=()=>{calls++;};
  assert.throws(()=>c.play(),/enabled dual morph/);for(const fn of [()=>c.scrub(0),()=>c.export('png'),()=>c.addTrack('fold'),()=>c.trackPose('explosionAmount',1)])await assert.rejects(fn,/enabled dual morph/);
  c.assertActive=()=>{};await assert.rejects(()=>c.apply(createSequence(s.view),0,s,0),/enabled dual morph/);assert.equal(calls,0);assert.deepEqual(s,before);
});
test('animation renderer refuses current or restored-pose enabled morph before geometry/view mutation',async()=>{
  const s=saved(),before=structuredClone(s),r=new AnimationRenderer({getState:()=>s});let calls=0;r.applyExplosion=()=>calls++;
  const pose={source:{modelId:s.model.id,fingerprint:s.model.fingerprint},view:{angles:Array(6).fill(0)}};
  await assert.rejects(()=>r.renderTracks(pose),/enabled dual morph/);assert.equal(calls,0);assert.deepEqual(s,before);
  s.view.dualMorph.enabled=false;const after=structuredClone(s);await assert.rejects(()=>r.renderTracks({...pose,view:{dualMorph:before.view.dualMorph}}),/enabled dual morph/);assert.equal(calls,0);assert.deepEqual(s,after);
});
test('animated tour preflight refuses enabled event before creating/clearing layers or obtaining canvases',()=>{
  const s=saved(),before=structuredClone(s),tour={version:2,cursor:0,events:[{id:'morph-event',state:s,duration:1,transition:{method:'instant'}}]};let calls=0;
  assert.throws(()=>new AnimatedTourRenderer({tour,canvas:{getContext:()=>{calls++;}},createCanvas:()=>{calls++;},createLayer:()=>{calls++;},getOwner:()=>{calls++;}}),/Animated tour.*enabled dual morph/);assert.equal(calls,0);assert.deepEqual(s,before);
});
test('late tour-layer enabled-morph request refuses before clearing an installed source actor',async()=>{
  const r=Object.create(AnimatedTourRenderer.prototype),s=saved();let calls=0;const actor={session:{destroy:()=>calls++},renderer:{clearTracks:()=>calls++}};
  await assert.rejects(()=>r.install(actor,{state:s,index:0},{}),/Animated tour layer/);assert.equal(calls,0);
});
