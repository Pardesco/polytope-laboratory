import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {buildSelectionHighlight,entityVertices} from '../ui/selection-highlight.mjs';
import {HoverGate,HoverIdentification} from '../ui/hover-identification.mjs';
import {startupView} from '../ui/startup-view.mjs';
import {ViewportControls} from '../ui/viewport-controls.mjs';
import {resolveExplosion,explosionGeometry} from '../ui/explosion.mjs';
import {runStereographicWorkerJob,stereographicWorkerTransferables} from '../ui/stereographic-worker-geometry.mjs';
import {fakeRenderer} from './helpers/fake-renderer.mjs';
import {navigationDisplayHarness} from './helpers/navigation-display.mjs';

const cases=JSON.parse(readFileSync(new URL('./fixtures/element-content-native-cases.json',import.meta.url),'utf8'));
const quad=[0,0,0,1,0,0,1,1,0,0,0,0,1,1,0,0,1,0];
test('edge sets use every displayed segment with that source ID, without invented endpoint chords',()=>{
  const result=buildSelectionHighlight({kind:'edge',indices:[2,2,5],edgePositions:[0,0,0,1,1,0,1,1,0,0,2,0,4,4,0,5,5,0],edgeIds:[2,2,9]});
  assert.deepEqual(result.lines,[0,0,0,1,1,0,1,1,0,0,2,0]);assert.deepEqual(result.fill,[]);
});
test('face fill and outline discard the interior triangulation diagonal; sets deduplicate source IDs',()=>{
  const result=buildSelectionHighlight({kind:'face',indices:[4,4],surfacePositions:quad,triangles:[{face:4},{face:4}]});
  assert.deepEqual(result.fill,quad);assert.equal(result.lines.length,24);
  for(let i=0;i<result.lines.length;i+=6){const [x,y,,a,b]=result.lines.slice(i,i+6);assert.ok(x===a||y===b);}
});
test('cell sets honor active source owners and explicit exploded/shrunk cell ownership',()=>{
  const context={kind:'cell',indices:[1,2],surfacePositions:[...quad,...quad],triangles:[{face:0},{face:0},{face:0,cell:3},{face:0,cell:2}],faceOwners:[[1,2,3]],activeCells:[1,2]};
  assert.equal(buildSelectionHighlight(context).fill.length,27);
  assert.equal(buildSelectionHighlight({...context,activeCells:[]}).fill.length,0);
  assert.equal(buildSelectionHighlight({...context,limit:1}).fill.length,0);
  assert.match(buildSelectionHighlight({...context,limit:1}).diagnostic,/vertex dots/);
});
function viewer(model=cases.fourD.source){
  const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.setModel(structuredClone(model));v.cameraProjection='orthographic';v.orthographicHalfHeight=2;
  v.camera=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);v.camera.position.set(0,0,6);v.camera.lookAt(0,0,0);v.camera.updateMatrixWorld();v.renderer=fakeRenderer({width:400,height:400});v.controls={target:new THREE.Vector3(),update(){}};
  v.stereographicWorkerFactory=()=>null;return v;
}
const positions=v=>Array.from(v.selectionFill.geometry.attributes.position.array);
for(const projection of ['orthographic','perspective','stereographic'])test(`${projection}: real edge/face/cell set highlights follow display rotations and hidden cells`,()=>{
  const v=viewer(),before=JSON.stringify(v.model),view={projection,angles:[13,5,19,7,11,3],faces:true,edges:true,vertices:true};
  try{
    v.setDisplay(view);v.selectEntities('edge',[0,1]);assert.equal(v.selectionLines.material.linewidth,4);assert.ok(v.selectionLines.visible);assert.equal(v.selectionFill.visible,false);
    v.selectEntities('face',[0,1]);assert.ok(v.selectionFill.visible);const first=positions(v);assert.ok(first.length>0);assert.ok(v.selectionLines.visible);
    v.setDisplay({...view,angles:[23,8,29,3,9,11]});assert.notDeepEqual(positions(v),first);assert.ok(positions(v).every(Number.isFinite));
    v.selectEntities('cell',[0]);assert.ok(v.selectionFill.visible);v.setDisplay({...view,hiddenCells:[0]});assert.equal(v.selectionFill.visible,false);
    v.selectEntities('vertex',[0]);assert.equal(v.selectionLines.visible,false);assert.equal(v.selectionFill.visible,false);assert.equal(v.highlightGeometry.attributes.position.count,1);
    assert.equal(JSON.stringify(v.model),before);assert.throws(()=>v.selectEntities('face',[-1]),/valid source/);
  }finally{v.clear();}
});
test('exploded highlights follow repeated source copies, cell shrink and active masks',()=>{
  const v=viewer(),resolved=resolveExplosion(v.model,{direction:'radial'});
  try{
    v.setExplosion(explosionGeometry(resolved,.6));v.setDisplay({projection:'perspective',angles:[10,0,17,0,9,0],cellShrink:.7});v.selectEntities('edge',[0]);assert.ok(v.selectionLines.geometry.instanceCount>1);
    v.selectEntities('cell',[0]);assert.ok(v.selectionFill.visible);assert.equal(v.selected.length,entityVertices(v.model,'cell',[0]).length);
    v.setDisplay({...v.view,isolatedCell:1});assert.equal(v.selectionFill.visible,false);
  }finally{v.clear();}
});
test('packed worker publication rebuilds selected face fill from the exact published triangle buffer',async()=>{
  const v=viewer(),worker={jobs:[],listeners:new Map(),addEventListener(t,f){this.listeners.set(t,f);},removeEventListener(t){this.listeners.delete(t);},postMessage(job,buffers){this.jobs.push(structuredClone(job,{transfer:buffers}));},terminate(){}};
  v.stereographicWorkerFactory=()=>worker;v.stereographicWorkerClock={now:()=>0,setTimer:()=>1,clearTimer(){}};
  try{
    v.selectEntities('face',[0]);v.setDisplay({projection:'stereographic',angles:[13,0,24,0,17,0],faces:true});
    for(let count=0;count<10;count++){if(worker.jobs.length){const result=runStereographicWorkerJob(worker.jobs.shift());assert.equal(result.type,'geometry-result',result.message);worker.listeners.get('message')({data:structuredClone(result,{transfer:stereographicWorkerTransferables(result)})});}await new Promise(r=>setImmediate(r));if(v.publishedPickState?.packedDisplay&&!worker.jobs.length)break;}
    assert.ok(v.publishedPickState.packedDisplay);assert.ok(v.selectionFill.visible);const expected=[],published=v.publishedPickState;
    for(let i=0;i<published.pickingTriangles.length;i++)if(published.pickingTriangles[i].face===0)expected.push(...v.surfaceGeometry.attributes.position.array.slice(i*9,i*9+9));
    assert.deepEqual(positions(v),expected);
  }finally{v.clear();}
});
test('morph frames preserve source face sets when source ownership exists and use dots otherwise',()=>{
  const source=structuredClone(cases.net.source),v=viewer(source),frame={model:structuredClone(source),sourceModelId:source.id,sourceFingerprint:source.fingerprint,sourceMaps:{vertices:source.vertices.map((_,i)=>({sourceRank:0,sourceElement:i})),faces:source.faces.map((_,i)=>({sourceRank:2,sourceElement:i}))}};
  v.draw=()=>{};
  try{v.selectEntities('face',[0]);v.setMorphFrame(frame,source,{angles:Array(6).fill(0)});assert.deepEqual(v.selectedEntities,{kind:'face',indices:[0]});assert.ok(v.selectionFill.visible);
    const unmapped={...frame,sourceMaps:{...frame.sourceMaps,faces:[]}};v.setMorphFrame(unmapped,source,{angles:Array(6).fill(0)});assert.ok(!v.selectionFill?.visible);assert.ok(v.highlightGeometry.attributes.position.count>0);
  }finally{v.clear();}
});
test('hover uses the same nearest pick but neither selects nor advances the repeated-click cycle',()=>{
  const v=viewer(),calls=[];v.onPick=(...args)=>calls.push(args);v.setDisplay({vertices:true,pickKind:'vertex',angles:[10,0,23,0,17,0]});
  try{const point=new THREE.Vector3(...v.projected[0].point).project(v.camera),x=(point.x+1)*200,y=(1-point.y)*200;
    const hover=v.pickAt(x,y,{hover:true});assert.ok(hover.picked);assert.equal(calls.length,0);assert.equal(v.sourcePickCycle?.previous??null,null);
    const click=v.pickAt(x,y);assert.deepEqual(click.picked,hover.picked);assert.equal(calls.length,1);const previous=structuredClone(v.sourcePickCycle.previous);v.pickAt(x,y,{hover:true});assert.deepEqual(v.sourcePickCycle.previous,previous);
  }finally{v.clear();}
});
test('hover gate throttles work and suppresses drag/playback/export even within throttle interval',()=>{
  const gate=new HoverGate(100);assert.equal(gate.allow(0),true);assert.equal(gate.allow(50),false);assert.equal(gate.allow(100),true);
  for(const flag of ['dragging','playing','exporting']){assert.equal(gate.allow(150,{[flag]:true}),false);assert.equal(gate.allow(151),true);}
});
test('mounted hover hides stale output and performs no picks during gestures or playback',()=>{
  const listeners=new Map(),node={hidden:true,remove(){}},canvas={addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k),getBoundingClientRect:()=>({left:0,top:0})};
  let blocked=false,picks=0;const v={renderer:{domElement:canvas},container:{append(){}},publishedPickState:{},pickAt:()=>{picks++;return {picked:{kind:'edge',id:10}};}};
  const hover=new HoverIdentification({viewer:v,blocked:()=>blocked,describe:()=> 'Edge 10 · length 2 u',createElement:()=>node});
  listeners.get('pointermove')({clientX:20,clientY:30});assert.equal(node.hidden,false);assert.equal(node.textContent,'Edge 10 · length 2 u');
  listeners.get('pointerdown')({});listeners.get('pointermove')({clientX:21,clientY:30});assert.equal(node.hidden,true);assert.equal(picks,1);
  listeners.get('pointerup')({});blocked=true;listeners.get('pointermove')({clientX:21,clientY:30});hover.sync();assert.equal(picks,1);
  blocked=false;hover.gate.last=-Infinity;listeners.get('pointermove')({clientX:21,clientY:30});v.publishedPickState={};hover.sync();assert.equal(node.hidden,true);hover.destroy();assert.equal(listeners.size,0);
});
test('startup view is a perspective-only override with gentle XW spin, and saved/model defaults stay intact',()=>{
  const saved={projection:'orthographic',rotationPlane:4,rotationSpeed:12,angles:[1,2,3,4,5,6],camera:{zoom:2}},before=structuredClone(saved),startup=startupView(saved);
  assert.deepEqual(saved,before);assert.equal(startup.projection,'perspective');assert.equal(startup.rotationPlane,2);assert.equal(startup.rotationSpeed,4);assert.deepEqual(startup.camera,saved.camera);
  let displays=0;const controls=Object.assign(Object.create(ViewportControls.prototype),{context:{getState:()=>({view:startup}),isExporting:()=>false,display:()=>displays++,syncPose(){}},syncPlaying(){}});
  controls.startStartupRotation();controls.tick(.25);assert.equal(startup.angles[2],4);assert.equal(displays,1);controls.stop();assert.equal(controls.playing,false);assert.equal(controls.startupRotation,false);
  const app=readFileSync(new URL('../ui/app.js',import.meta.url),'utf8');assert.match(app,/doc\(\)\.states\.length===1&&doc\(\)\.cursor===0&&!state\(\)\.view\.entitySelection\)\{Object\.assign\(state\(\)\.view,startupView\(state\(\)\.view\)\)/);
  // The startup override keeps the view object identity so in-flight derived/section requests bound to it still publish.
  assert.doesNotMatch(app,/state\(\)\.view=startupView/);assert.doesNotMatch(app.slice(app.indexOf('function adopt('),app.indexOf('function adopt(')+800),/startupView/);
});
test('throttled hover identifies the final cursor position and cancels pending work on leave',()=>{
  const listeners=new Map(),node={hidden:true,remove(){}},canvas={addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k),getBoundingClientRect:()=>({left:0,top:0})};
  let time=0,pending,cleared=0;const picks=[],v={renderer:{domElement:canvas},container:{append(){}},publishedPickState:{},pickAt:x=>{picks.push(x);return {picked:{id:x}};}};
  const hover=new HoverIdentification({viewer:v,describe:r=>String(r.picked.id),createElement:()=>node,now:()=>time,setTimer:fn=>{pending=fn;return 1;},clearTimer:()=>{pending=null;cleared++;}});
  listeners.get('pointermove')({clientX:1,clientY:0});time=50;listeners.get('pointermove')({clientX:2,clientY:0});time=70;listeners.get('pointermove')({clientX:3,clientY:0});assert.deepEqual(picks,[1]);assert.equal(node.hidden,true);
  time=100;pending();assert.deepEqual(picks,[1,3]);assert.equal(node.textContent,'3');time=120;listeners.get('pointermove')({clientX:4,clientY:0});listeners.get('pointerleave')();assert.equal(pending,null);assert.ok(cleared);hover.destroy();
});
test('workspace navigation restores saved entity sets before its single display',async()=>{
  const app=readFileSync(new URL('../ui/app.js',import.meta.url),'utf8'),saved={model:structuredClone(cases.fourD.source),notes:'',view:{angles:[10,0,20,0,15,0],projection:'perspective',faces:true,edges:true,vertices:true,sectionNormal:[0,0,0,1],sectionOffset:0,derivedMode:'section',entitySelection:{kind:'face',indices:[0,1]}}},f=navigationDisplayHarness(app,saved);
  try{f.scope.renderWorkspace();await f.settle();assert.equal(f.counts.displays,1);assert.equal(f.counts.dirty,0);assert.deepEqual(f.v.selectedEntities,{kind:'face',indices:[0,1]});assert.ok(f.v.selectionFill.visible);assert.equal(f.get('selection-summary').textContent,'2 source face elements selected');}finally{f.close();}
});
test('a deliberate net edit ends the introductory spin but ordinary user rotation still blocks it',()=>{
  const app=readFileSync(new URL('../ui/app.js',import.meta.url),'utf8'),source=app.match(/const netEditBusy=(\(\)=>\{[^\n]*\});/);assert.ok(source);
  assert.equal(app.match(/new (?:Cell)?NetEditor\(\{[^\n]*?isBusy:netEditBusy/g)?.length,2);
  const controls=Object.assign(Object.create(ViewportControls.prototype),{context:{},syncPlaying(){}}),busy=new Function('viewportControls','animation','tours','return '+source[1])(controls,{playing:false},{playing:false});
  controls.startStartupRotation();assert.equal(busy(),false);assert.equal(controls.playing,false);assert.equal(controls.startupRotation,false);
  controls.playing=true;assert.equal(busy(),true);assert.equal(controls.playing,true);
});
