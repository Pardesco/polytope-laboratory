import test from 'node:test';
import assert from 'node:assert/strict';
import {TourControls} from '../ui/tour-controls.mjs';
import {normalizeTour,setTourTransition,tourEventStart} from '../ui/tour.mjs';
import {prepareAnimatedTourTimeline,evaluateAnimatedTour} from '../ui/animated-tour-timeline.mjs';
import {createSequence} from '../ui/animation.mjs';

const abort=()=>Object.assign(Error('Cancelled or stale tour pose'),{name:'AbortError'});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-12,`${actual} != ${expected}`);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(fn){for(let n=0;n<100;n++){if(fn())return;await tick();}assert.fail('Expected asynchronous control stage was not reached');}
const scheduled=new Map();let nextRAF=0;
globalThis.requestAnimationFrame=fn=>{const id=++nextRAF;scheduled.set(id,fn);return id;};
globalThis.cancelAnimationFrame=id=>scheduled.delete(id);
globalThis.Option=class{constructor(text,value){this.textContent=text;this.value=value;}};
globalThis.document={querySelector:()=>null,removeEventListener(){}};

function state(id){
  const model={id,name:id,dimension:3,embeddingDimension:3,interpretation:'generalized-complex',
    vertices:[[0,0,0],[2,0,0],[0,2,0]],edges:[[0,1],[1,2],[0,2]],faces:[[0,1,2]],cells:[],
    metadata:{coordinateUnits:'mm',offColors:{faces:[{encoding:'byte',values:[11,22,33,127]}],cells:[]}}};
  const view={angles:Array(6).fill(0),sectionOffset:0,coordinateUnit:'mm',viewportLayout:'single'};
  view.animation=createSequence(view,2,4);view.animation.keyframes[1].angles[0]=180;
  return {model,view,notes:'Keep '+id,sourceOperationNode:'source-only'};
}
function bank(version=2){return normalizeTour({version,cursor:0,events:['a','b','c'].map((id,i)=>({id,state:state(id),duration:i===0?1:2,
  transition:version===1?'instant':{method:i===2?'orbit':'sideways',duration:i===2?1:.5,easing:'linear'}}))});}

/** Real control methods, timeline and native export adapter, with an injectable
 * fine-publication boundary. Actual Viewer/WebGL adapter coverage lives in
 * animated-tour-renderer.test.mjs; this file does not claim GPU pixels. */
function fixture({version=2,gate,writeGate}={}){
  const nodes=Object.fromEntries(['controls','event','duration','transition','transition-duration','transition-easing','transition-angle','transition-distance','transition-tilt','transition-orbits','transition-spin','transition-explosionSize','transition-direction','transition-components','transition-apply','add','replace','delete','up','down','prev','next','play','loop','scrub','position','fps','png','webm','close-preview','cancel-export','merge','save'].map(key=>[key,{value:'',disabled:false,hidden:false,checked:false,textContent:'',replaceChildren(...children){this.children=children;}}]));
  nodes.fps.value='2';const source=state('original'),doc={id:'doc',cursor:0,states:[source]};let project={tour:bank(version),documents:[doc],active:0},exportBusy=false;
  const calls=[],renderers=[],writes=[],status=[];
  const context={getDocument:()=>project.documents[project.active],evaluateMany:async entries=>entries.map(Number),getProject:()=>project,getState:()=>project.documents[project.active].states[project.documents[project.active].cursor],
    isExporting:()=>exportBusy,setStatus:s=>status.push(s),markDirty:()=>calls.push(['dirty']),stopOther:()=>calls.push(['stop-other']),
    importTour:async()=>bank(1),exportTour:async t=>calls.push(['save-tour',t]),
    showEvent:async(snapshot,label,o)=>{calls.push(['show-v1',snapshot,label,o]);if(gate)await gate.promise;if(!o.isCurrent()||o.signal.aborted)throw abort();doc.states=[snapshot];doc.cursor=0;},
    onExportStateChange:value=>{exportBusy=value;calls.push(['export-busy',value]);},
    api:{animationBegin:async options=>{calls.push(['begin',options]);return {id:'session'};},animationWrite:async(...args)=>{writes.push(args);if(writeGate)await writeGate.promise;},animationFinish:async id=>{calls.push(['finish',id]);return {directory:'saved.frames'};},animationAbort:async id=>calls.push(['abort',id])},
    createRenderer:(tour,{loop})=>{
      const ownedProject=project,ownedTour=project.tour,ownedState=context.getState(),signature=JSON.stringify(ownedState),timeline=prepareAnimatedTourTimeline(tour,{loop});let generation=0,closed=false;
      const renderer={timeline,canvas:{toDataURL:()=> 'data:image/png;base64,AA=='},published:null,
        ownerCurrent:()=>!closed&&project===ownedProject&&project.tour===ownedTour&&context.getState()===ownedState&&JSON.stringify(ownedState)===signature,
        async apply(time,{signal}={}){const token=++generation;calls.push(['apply',time,loop]);if(gate)await gate.promise;if(signal?.aborted||token!==generation||!renderer.ownerCurrent())throw abort();
          const sample=evaluateAnimatedTour(timeline,time);renderer.published={...sample,complete:true,token};return renderer.published;},
        current:p=>p===renderer.published&&p.token===generation&&renderer.ownerCurrent(),image:p=>{if(!renderer.current(p))throw abort();return renderer.canvas.toDataURL();},
        cancel:()=>{generation++;calls.push(['cancel-renderer']);},close:async()=>{closed=true;generation++;calls.push(['close-renderer']);}};
      renderers.push(renderer);return renderer;
    }};
  const controls=Object.assign(Object.create(TourControls.prototype),{context,nodes,details:{querySelectorAll:()=>Object.entries(nodes).filter(([key])=>key.startsWith('transition')).map(([,node])=>node)},
    playing:false,busy:false,showing:false,generation:0,time:0,shownId:null,frame:now=>controls.tick(now)});controls.sync();
  return {controls,context,nodes,calls,writes,status,renderers,source,doc,get project(){return project;},setProject:value=>project=value,setExport:value=>exportBusy=value};
}

test('v2 seek applies real absolute saved-track poses and transition layers without publishing cursor/source edits',async()=>{
  const h=fixture(),before=structuredClone(h.project);await h.controls.seek(.5);assert.equal(h.controls.renderer.published.layers[0].animation.frame.angles[0],45);
  await h.controls.seek(1.25);assert.deepEqual(h.controls.renderer.published.layers.map(l=>[l.role,l.animation.frame.angles[0],l.transitionPose.opacity]),[['outgoing',90,.5],['incoming',0,.5]]);
  assert.equal(h.controls.time,1.25);assert.deepEqual(h.project,before);assert.equal(h.calls.filter(c=>c[0]==='show-v1').length,0);h.controls.closePreview();
});

test('v1 legacy seek retains detached showEvent behavior and literal instant storage',async()=>{
  const h=fixture({version:1}),source=structuredClone(h.source);await h.controls.seek(1.5);assert.equal(h.renderers.length,0);assert.equal(h.calls.filter(c=>c[0]==='show-v1').length,1);
  assert.equal(h.project.tour.version,1);assert.equal(h.project.tour.cursor,1);assert.equal(h.project.tour.events[1].transition,'instant');assert.deepEqual(h.source,source);assert.notStrictEqual(h.context.getState().model,h.project.tour.events[1].state.model);
});

test('v2 play uses elapsed time instead of accumulated frames and stops at an exact end',async()=>{
  const h=fixture(),before=structuredClone(h.project);await h.controls.play();const origin=h.controls.origin;
  await h.controls.tick(origin+500);near(h.controls.time,.5);await h.controls.tick(origin+1250);near(h.controls.time,1.25);assert.equal(h.controls.renderer.published.phase,'transition');
  await h.controls.tick(origin+99999);assert.equal(h.controls.time,6);assert.equal(h.controls.playing,false);assert.deepEqual(h.project,before);h.controls.closePreview();
});

test('Pause cancels a held fine seek and prevents late UI publication while preserving source',async()=>{
  const gate=deferred(),h=fixture({gate}),before=structuredClone(h.project),pending=h.controls.seek(.5),refused=assert.rejects(pending,/cancel|stale/i);
  await until(()=>h.controls.showing);for(const key of ['add','replace','png','webm','scrub','transition-apply'])assert.equal(h.nodes[key].disabled,true,key);h.controls.pause();assert.equal(h.controls.abort,null);gate.resolve();await refused;assert.equal(h.controls.time,0);assert.equal(h.nodes.png.disabled,false);assert.equal(h.nodes.scrub.disabled,false);assert.deepEqual(h.project,before);h.controls.closePreview();
});

test('project switch and full source attribute mutations fence held preview output',async()=>{
  for(const mutate of [h=>h.setProject({...h.project}),h=>h.source.notes='edited',h=>h.source.model.metadata.offColors.faces[0].values[3]=126,h=>h.source.view.coordinateUnit='cm']){
    const gate=deferred(),h=fixture({gate}),pending=h.controls.seek(.5),refused=assert.rejects(pending,/cancel|stale/i);await until(()=>h.controls.showing);mutate(h);const after=structuredClone(h.project);gate.resolve();await refused;h.controls.invalidatePreview();assert.equal(h.controls.renderer,null);assert.deepEqual(h.project,after);
  }
});

test('transition edit upgrades v1 with separate positive transition duration and retains literal snapshots',async()=>{
  const h=fixture({version:1}),before=structuredClone(h.project.tour.events.map(e=>e.state));h.nodes.transition.value='sideways';h.nodes['transition-duration'].value='.75';
  await h.controls.applyTransition();assert.equal(h.project.tour.version,2);assert.equal(h.project.tour.events[0].duration,1);assert.equal(h.project.tour.events[0].transition.duration,.75);assert.deepEqual(h.project.tour.events.map(e=>e.state),before);assert.equal(h.nodes.scrub.max,'5.75');
});

test('invalid transition combinations/durations refuse atomically and a valid request recovers',async()=>{
  const h=fixture(),before=h.project.tour;
  for(const [method,duration,components] of [['sideways','0',''],['sideways','NaN',''],['combination','1','explode-grow,explode-implode'],['combination','1','sideways,sideways']]){
    h.nodes.transition.value=method;h.nodes['transition-duration'].value=duration;h.nodes['transition-components'].value=components;
    await assert.rejects(h.controls.applyTransition());assert.strictEqual(h.project.tour,before);
  }
  h.nodes.transition.value='instant';h.nodes['transition-duration'].value='9';await h.controls.applyTransition();assert.equal(h.project.tour.events[0].transition.duration,0);
});

test('global export state blocks tour edits and playback without changing source',async()=>{
  const h=fixture(),before=structuredClone(h.project);h.setExport(true);h.controls.sync();for(const key of ['add','replace','delete','play','png','webm','transition-apply'])assert.equal(h.nodes[key].disabled,true);
  await assert.rejects(h.controls.seek(.5),/export/i);await assert.rejects(h.controls.add(),/export/i);await assert.rejects(h.controls.export('png'),/export/i);assert.deepEqual(h.project,before);h.setExport(false);h.controls.sync();assert.equal(h.nodes.png.disabled,false);
});

test('real PNG export adapter holds global busy, emits the exact grid, restores prior time and retains source',async()=>{
  const gate=deferred(),h=fixture({writeGate:gate}),before=structuredClone(h.project);await h.controls.seek(.5);const pending=h.controls.export('png');await until(()=>h.writes.length===1);
  assert.equal(h.controls.exporter.exporting,true);assert.equal(h.nodes['cancel-export'].hidden,false);assert.equal(h.nodes['close-preview'].disabled,true);assert.throws(()=>h.controls.closePreview(),/export/i);await assert.rejects(h.controls.seek(1),/running|export/i);
  gate.resolve();await pending;assert.equal(h.writes.length,13);assert.deepEqual(h.writes.map(row=>row[1]),Array.from({length:13},(_,i)=>i));assert.equal(h.calls.find(c=>c[0]==='begin')[1].duration,6);assert.equal(h.controls.renderer.published.time,.5);assert.equal(h.controls.busy,false);assert.equal(h.nodes.png.disabled,false);assert.deepEqual(h.project,before);h.controls.closePreview();
});

test('cancelled native writes abort staging and release global busy without restoring a changed owner',async()=>{
  const gate=deferred(),h=fixture({writeGate:gate});await h.controls.seek(.5);const pending=h.controls.export('png'),refused=assert.rejects(pending,/cancel|superseded/i);await until(()=>h.writes.length===1);
  h.source.notes='new user note';h.controls.exporter.cancel();gate.resolve();await refused;assert.equal(h.calls.filter(c=>c[0]==='abort').length,1);assert.equal(h.calls.filter(c=>c[0]==='finish').length,0);assert.equal(h.controls.busy,false);assert.equal(h.source.notes,'new user note');h.controls.invalidatePreview();assert.equal(h.controls.renderer,null);
});

test('close preview and destroy retire private renderers without overwriting original source',async()=>{
  const h=fixture(),before=structuredClone(h.project);await h.controls.seek(.5);h.controls.closePreview();assert.equal(h.controls.renderer,null);assert.equal(h.calls.filter(c=>c[0]==='close-renderer').length,1);assert.deepEqual(h.project,before);
  await h.controls.seek(.6);h.controls.details.remove=()=>h.calls.push(['remove-panel']);h.controls.destroy();assert.equal(h.calls.filter(c=>c[0]==='close-renderer').length,2);assert.deepEqual(h.project,before);
});

test('v2 Next/Prev use the displayed transient event instead of the untouched bank cursor',async()=>{
  const h=fixture();await h.controls.seek(0);await h.controls.step(1);assert.equal(h.controls.time,tourEventStart(h.project.tour,1));await h.controls.step(1);assert.equal(h.controls.time,tourEventStart(h.project.tour,2));await h.controls.step(-1);assert.equal(h.controls.time,tourEventStart(h.project.tour,1));assert.equal(h.project.tour.cursor,0);h.controls.closePreview();
});

test('sync and edits address the displayed animated event and retire its old owner before saving selection',async()=>{
  const h=fixture(),before=structuredClone(h.project.tour);await h.controls.seek(tourEventStart(h.project.tour,2));h.controls.sync();assert.equal(h.nodes.event.value,'2');assert.equal(h.nodes.transition.value,'orbit');assert.equal(h.nodes.prev.disabled,false);assert.equal(h.nodes.next.disabled,true);
  await h.controls.edit((tour,index)=>setTourTransition(tour,index,{method:'instant'}));assert.equal(h.project.tour.cursor,2);assert.equal(h.project.tour.events[2].transition.method,'instant');assert.deepEqual(h.project.tour.events.slice(0,2),before.events.slice(0,2));assert.equal(h.controls.renderer,null);assert.equal(h.calls.filter(c=>c[0]==='close-renderer').length,1);assert.deepEqual(h.project.tour.events.map(e=>e.state),before.events.map(e=>e.state));
});

test('changing Loop recreates renderer ownership while keeping the source and saved tour unchanged',async()=>{
  const h=fixture(),before=structuredClone(h.project);await h.controls.seek(.5);const first=h.controls.renderer;h.nodes.loop.checked=true;await h.controls.seek(6.5);assert.notStrictEqual(h.controls.renderer,first);assert.equal(h.controls.renderer.timeline.duration,7);assert.equal(h.calls.filter(c=>c[0]==='close-renderer').length,1);assert.deepEqual(h.project,before);h.controls.closePreview();
});

test('loop controls include the last outgoing transition in total and retain its phase across sync',async()=>{
  const h=fixture();h.nodes.loop.checked=true;await h.controls.play();assert.equal(h.controls.renderer.timeline.duration,7);await h.controls.tick(h.controls.origin+6500);near(h.controls.time,6.5);assert.equal(h.controls.renderer.published.phase,'transition');assert.equal(h.nodes.scrub.max,'7');h.controls.sync();near(h.controls.time,6.5);assert.match(h.nodes.position.textContent,/\/ 7\.000 s$/);await h.controls.tick(h.controls.origin+7250);near(h.controls.time,.25);assert.equal(h.controls.playing,true);h.controls.closePreview();
});
