import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {AnimationRenderer} from '../ui/animation-renderer.mjs';
import {AnimationControls} from '../ui/animation-controls.mjs';
import {AnimationTrackSessions} from '../ui/animation-track-controls.mjs';
import {normalizeSequence,evaluateSequence} from '../ui/animation.mjs';
import {prepareMorphAnimation} from '../ui/morph-animation-adapter.mjs';
import {DualMorphSession} from '../ui/dual-morph-session.mjs';
import {AnimatedTourRenderer} from '../ui/animated-tour-renderer.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const native=(script,input)=>JSON.parse(execFileSync('python',['-B','-c',script],{cwd:root,input:input&&JSON.stringify(input),windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024}));
const fixture=native(`import json,math,base64,sys
from pathlib import Path
from engine.generators import regular
from engine import element_annotations as c
p=regular('cube');p['metadata']['coordinateUnits']='mm'
d=c.set_text(c.new_document(p),p,'vertex',0,'<b>Moving source</b>')
asset_path=Path('tests/fixtures/element-content-native-fixture.json')
if not asset_path.exists():asset_path=Path('../../tests/fixtures/element-content-native-fixture.json')
asset=json.loads(asset_path.read_text(encoding='utf-8'))['descriptor']['assets']
png=c.set_texture(d,p,0,base64.b64decode(next(iter(asset.values()))['base64']))
view={'coordinateUnit':'mm','angles':[0]*6,'projection':'orthographic','cameraProjection':'orthographic','vertices':True,'edges':True,'faces':True,'surfaceOpacity':1,'cellFacing':'all','cellShrink':1,'sectionOffset':0,'elementAnnotations':d,'dualMorph':{'version':1,'enabled':True,'method':'expansion','center':None,'radius':math.sqrt(2),'ratio':.25,'duration':1,'loop':False}}
print(json.dumps({'state':{'model':p,'notes':'Original notes','view':view},'png':png}))`);
const requests=[];
const run=async(op,params,model)=>{requests.push({op,ratio:params.ratio});return native("import sys,json;from engine import server;print(json.dumps(server.dispatch(json.load(sys.stdin))))",{op,params,model});};
const sequence=(start=0,end=1)=>({version:3,duration:1,fps:2,loop:false,tracks:{morphRatio:{kind:'dual-morph',version:1}},keyframes:[{time:0,angles:[0,0,0,0,0,0],sectionOffset:0,morphRatio:start},{time:1,angles:[90,0,0,0,0,0],sectionOffset:0,morphRatio:end}]});
const makeCanvas=()=>({width:0,height:0,getContext:()=>({clearRect(){},drawImage(){},save(){},restore(){},translate(){},rotate(){},measureText:t=>({width:t.length*7}),fillText(){}})});
const bitmap=()=>({width:2,height:2,closed:false,close(){this.closed=true;}});
function environment(png=false){
 const state=structuredClone(fixture.state);state.view.animation=sequence(png?.25:0,png?.75:1);if(png)state.view.elementAnnotations=structuredClone(fixture.png);
 const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.draw=()=>{};v.stereographicWorkerFactory=()=>null;v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);v.orthographicCamera=new THREE.OrthographicCamera(-1.45,1.45,1.45,-1.45,.01,1000);v.cameraProjection='orthographic';v.camera=v.orthographicCamera;v.orthographicHalfHeight=1.45;v.controls={target:new THREE.Vector3(),enabled:true,enableDamping:true,update(){}};v.bindControls=()=>{};v.setModel(state.model);
 const context={getState:()=>state,getModel:()=>state.model,viewer:v,run,makeContentCanvas:makeCanvas,decodeContentImage:async()=>bitmap(),syncPose(){},display(){}};
 const renderer=new AnimationRenderer(context);Object.assign(context,{capabilities:()=>renderer.capabilities(),loadMorph:(m,s,o)=>renderer.loadMorph(m,s,o),renderTracks:(p,o)=>renderer.renderTracks(p,o)});
 return {state,v,context,renderer,tracks:new AnimationTrackSessions(context)};
}
test('v3 interpolates real ratio plus full-turn rotation; old schemas and unknown tracks remain strict',()=>{
 const s=normalizeSequence(sequence());assert.equal(evaluateSequence(s,.5).morphRatio,.5);assert.equal(evaluateSequence(s,.5).angles[0],45);
 assert.throws(()=>normalizeSequence({...s,version:2}),/unsupported|track/i);
 assert.throws(()=>normalizeSequence({...s,keyframes:s.keyframes.map(f=>({...f,morphRatio:2}))}),/ratio|range|between/i);
 const old={version:1,duration:1,fps:2,keyframes:s.keyframes.map(({morphRatio,...f})=>f)};assert.equal(normalizeSequence(old).version,1);
});
test('native sampled frames move actual Viewer content, preserve source, and restore original morph and rotation',async()=>{
 const e=environment(),source=structuredClone(e.state.model),view=structuredClone(e.state.view);requests.length=0;
 try{const s=await e.tracks.prepare(e.state.view.animation),positions=[];
  for(const time of [0,.5,1]){await s.apply(time,e.context.renderTracks);positions.push(JSON.stringify(e.v.model.vertices));assert.equal(e.v.morphFrame.ratio,time);assert.equal(e.v.view.angles[0],time*90);assert.ok((await e.v.prepareCapture()).elementContent.ready);assert.ok(e.v.elementContentLayer.group.children.some(o=>o.isSprite));}
  assert.equal(new Set(positions).size,3);assert.deepEqual(e.state.model,source);await s.restore(e.context.renderTracks);assert.deepEqual(e.state.view,view);assert.equal(e.v.morphFrame.ratio,.25);assert.ok(requests.filter(r=>r.op==='evaluate-dual-morph').length>=6);
 }finally{e.tracks.reset();e.v.clear();}
});
function controls(e,api){const c=Object.create(AnimationControls.prototype);Object.assign(c,{context:{...e.context,api},nodes:{target:{value:'base'},progress:{}},generation:0,time:.2,playing:false,exporting:false,editing:false,trackSessions:e.tracks,configure:async()=>{},update(){}});return c;}
test('PNG sequence stages distinct evaluated poses and restores on success or failed write; PNG endpoint refusal precedes Begin',async()=>{
 for(const fail of [false,true]){const e=environment(true),view=structuredClone(e.state.view),images=[];let aborted=0;
  const c=controls(e,{animationBegin:async()=>({id:'actual'}),animationWrite:async(id,n,image)=>{images.push(image);if(fail)throw Error('disk failed');},animationFinish:async()=>({path:'frames'}),animationAbort:async()=>{aborted++;}});e.v.image=()=>JSON.stringify([e.v.morphFrame.ratio,e.v.model.vertices,e.v.elementContentLayer.group.children.length]);
  try{if(fail)await assert.rejects(c.export('png'),/disk failed/);else await c.export('png');assert.deepEqual(e.state.view,view);assert.equal(e.v.morphFrame.ratio,.25);assert.equal(e.v.controls.enabled,true);assert.equal(e.v.controls.enableDamping,true);assert.equal(aborted,fail?1:0);if(!fail)assert.equal(new Set(images).size,3);}finally{e.tracks.reset();e.v.clear();}
 }
 const e=environment(true);e.state.view.animation=sequence(0,1);let begun=false;try{await assert.rejects(controls(e,{animationBegin:async()=>{begun=true;}}).export('png'),/PNG has no output face/);assert.equal(begun,false);assert.strictEqual(e.v.model,e.state.model);}finally{e.tracks.reset();e.v.clear();}
});
test('held PNG cancellation and in-place source edits cannot replace the previous published Viewer pose',async()=>{
 const e=environment(true);try{const s=await e.tracks.prepare(e.state.view.animation);await s.apply(0,e.context.renderTracks);const before=e.v.model,layer=e.v.elementContentLayer,image=bitmap();let release,enter;const gate=new Promise(r=>enter=r);e.context.decodeContentImage=()=>{enter();return new Promise(r=>release=r);};const ac=new AbortController();const pending=s.apply(.5,e.context.renderTracks,{signal:ac.signal});await gate;ac.abort();release(image);await assert.rejects(pending,/canceled|cancelled|changed/);assert.equal(image.closed,true);assert.strictEqual(e.v.model,before);assert.strictEqual(e.v.elementContentLayer,layer);
  e.state.notes='Edited notes';await assert.rejects(s.apply(.5,e.context.renderTracks),/source changed/);
 }finally{e.tracks.reset();e.v.clear();}
 const e2=environment();try{let resolve;const preparation=prepareMorphAnimation(e2.state,e2.state.view.animation,()=>new Promise(r=>resolve=r));e2.state.model.vertices[0][0]+=.1;resolve({});await assert.rejects(preparation,/source changed/);}finally{e2.v.clear();}
 const e3=environment();try{const s=await e3.tracks.prepare(e3.state.view.animation);let release,entered;const gate=new Promise(r=>entered=r),nativeRun=e3.context.run;e3.context.run=async(...args)=>{const frame=await nativeRun(...args);entered();await new Promise(r=>release=r);return frame;};const before=e3.v.model,pending=s.apply(.5,e3.context.renderTracks);await gate;e3.v.camera.position.x=2;release();await assert.rejects(pending,/camera|changed/);assert.strictEqual(e3.v.model,before);assert.equal(e3.v.camera.position.x,2);}finally{e3.tracks.reset();e3.v.clear();}
 const e4=environment();try{const s=sequence();s.tracks.fold={kind:'face-net'};await assert.rejects(prepareMorphAnimation(e4.state,s,run),/cannot combine/);s.tracks={morphRatio:{kind:'dual-morph',version:1}};s.keyframes[1].sectionOffset=1;await assert.rejects(prepareMorphAnimation(e4.state,s,run),/cross-section/);}finally{e4.v.clear();}
});
test('legacy morph owner accepts animation poses and remains capture/reset capable after restoration',async()=>{
 const e=environment(),document={id:'source',cursor:0,states:[e.state]},project={active:0,documents:[document]};
 const legacy=new DualMorphSession({mappedContent:true,getState:()=>e.state,getDocument:()=>document,getProject:()=>project,isExporting:()=>false,
  prepare:(m,settings,sourceContext)=>run('prepare-dual-morph',{settings,sourceContext},m),evaluate:(m,prepared,ratio,sourceContext)=>run('evaluate-dual-morph',{prepared,ratio,sourceContext},m),
  render:async()=>{},prepareCapture:o=>e.v.prepareCapture(o),clear:()=>e.v.clearMorph(e.state.model,e.state.view)});
 try{await legacy.configure(e.state.view.dualMorph);e.context.onMorphPose=(f,p)=>legacy.adoptAnimationPose(f,p);const s=await e.tracks.prepare(e.state.view.animation);await s.apply(.5,e.context.renderTracks);legacy.checked();await s.restore(e.context.renderTracks);legacy.checked();assert.equal(e.state.view.dualMorph.ratio,.25);}finally{legacy.invalidate();e.tracks.reset();e.v.clear();}
});
function outputCanvas(){const c={width:240,height:160,frame:null};c.getContext=()=>({save(){},restore(){},fillRect(){},drawImage(source){c.frame=structuredClone(source.frame);}});c.toDataURL=()=>JSON.stringify(c.frame);return c;}
test('actual animated-tour layers evaluate morph ratios before exact content capture and leave saved snapshots unchanged',async()=>{
 const original=structuredClone(fixture.state);original.view.animation=sequence(.25,.75);original.view.elementAnnotations=structuredClone(fixture.png);original.view.viewportLayout='single';const bank={version:2,cursor:0,events:[{id:'morph',state:structuredClone(original),duration:1,transition:{method:'instant'}}]},project={},actors=[],output=outputCanvas();
 const owner={project,tour:bank,sourceState:original};const renderer=new AnimatedTourRenderer({tour:bank,canvas:output,createCanvas:outputCanvas,getOwner:()=>owner,createLayer:({getState})=>{
  const e=environment(),other=environment();e.v.renderer={domElement:outputCanvas(),setClearColor(){}};other.v.renderer={domElement:outputCanvas(),setClearColor(){}};e.v.draw=()=>{e.v.renderer.domElement.frame={ratio:e.v.morphFrame?.ratio,labels:e.v.elementContentLayer?.group.children.length};};
  actors.push(e.v);return {...e.context,viewer:e.v,netViewer:other.v,getState,prepareLayout:async()=>{},dispose(){e.v.clear();other.v.clear();}};
 }});
 try{let p=await renderer.apply(.25);assert.equal(p.layers[0].view.dualMorph.ratio,.375);assert.equal(actors[0].morphFrame.ratio,.375);assert.ok(actors[0].elementContentLayer.group.children.some(o=>o.isMesh&&o.userData.sourceFace===0));assert.ok(output.frame.labels);p=await renderer.apply(.75);assert.equal(actors[0].morphFrame.ratio,.625);assert.ok(renderer.image(p));assert.deepEqual(bank.events[0].state,original);}finally{await renderer.close();}
});
