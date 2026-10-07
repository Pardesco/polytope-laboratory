import test from 'node:test';
import assert from 'node:assert/strict';
import {DualMorphSession} from '../ui/dual-morph-session.mjs';
import {DualMorphControls} from '../ui/dual-morph-controls.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve)),clone=structuredClone;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const settings=()=>({version:1,enabled:true,method:'expansion',center:null,radius:2,ratio:0,duration:2,loop:false});
function fixture(){
  const model={id:'literal-cube',fingerprint:'c'.repeat(64),dimension:3,embeddingDimension:3,interpretation:'convex-polytope',
    vertices:[[-1,-1,-1],[1,-1,-1],[-1,1,-1],[1,1,-1],[-1,-1,1],[1,-1,1],[-1,1,1],[1,1,1]],
    edges:[[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]],
    faces:[[0,2,3,1],[4,5,7,6],[0,1,5,4],[2,6,7,3],[0,4,6,2],[1,3,7,5]],cells:[],
    metadata:{coordinateUnits:'mm',offColors:{faces:[{encoding:'byte',values:[1,2,3,127]},null,null,null,null,null]},offlineAsset:{hash:'literal'}},numeric:{certified:false}};
  const state={model,notes:'original notes',view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0]}},doc={id:'document',states:[state],cursor:0};
  let project={id:'project',documents:[doc],active:0},exporting=false,now=0,callbacks=[],jobs=[],renders=[],errors=[],cleared=0,captured=0;
  const context={getState:()=>project.documents[project.active].states[project.documents[project.active].cursor],getDocument:()=>project.documents[project.active],getProject:()=>project,isExporting:()=>exporting,
    prepare:async(m,s,c)=>({settings:clone(s),sourceModelId:m.id,sourceFingerprint:m.fingerprint,sourceAttributesSha256:JSON.stringify(m),sourceContextSha256:JSON.stringify(c),descriptorSha256:'prepared',descriptor:{}}),
    evaluate:async(m,p,ratio)=>{jobs.push(ratio);return frame(p,ratio,m);},
    render:async(f,o)=>{assert.equal(o.isCurrent(),true);renders.push(f.ratio);},clear:()=>cleared++,prepareCapture:async o=>{assert.equal(o.isCurrent(),true);captured++;},onError:e=>errors.push(e),
    clock:{now:()=>now,request:f=>{callbacks.push(f);return callbacks.length;},cancel:()=>{callbacks=[];}}};
  const session=new DualMorphSession(context);
  return {state,model,doc,context,session,jobs,renders,errors,get project(){return project;},replaceProject:p=>project=p,setExport:v=>exporting=v,
    advance:async t=>{now=t;const next=callbacks;callbacks=[];next.forEach(f=>f());await tick();await tick();},get cleared(){return cleared;},get captured(){return captured;}};
}
function frame(p,ratio,model){return {ratio,method:p.settings.method,certified:false,model:clone(model),settings:{...clone(p.settings),ratio},binding:Object.fromEntries(['sourceModelId','sourceFingerprint','sourceAttributesSha256','sourceContextSha256','descriptorSha256'].map(k=>[k,p[k]]))};}

test('configure validates the actual candidate before publishing settings and mutates no source attributes',async()=>{
  const f=fixture(),source=clone(f.model),view=f.state.view;
  let sawBefore=false;f.context.render=async(frame)=>{assert.equal(view.dualMorph,undefined);sawBefore=true;};
  await f.session.configure(settings());assert.equal(sawBefore,true);assert.equal(view.dualMorph.enabled,true);assert.deepEqual(f.model,source);f.context.render=async()=>{};
  await f.session.seek(.5);assert.deepEqual(f.model,source);assert.equal(view.dualMorph.ratio,.5);
});

test('native math/preparation/forged-frame refusal publishes no saved bank or display',async()=>{
  for(const stage of ['prepare','evaluate','binding']){const f=fixture();
    if(stage==='binding'){const evaluate=f.context.evaluate;f.context.evaluate=async(...a)=>{const result=await evaluate(...a);result.binding.sourceContextSha256='forged';return result;};}
    else f.context[stage]=async()=>{throw Error('Polar singularity / unresolved topology.');};
    await assert.rejects(f.session.configure(settings()),/singularity|identity/);assert.equal(f.state.view.dualMorph,undefined);assert.deepEqual(f.renders,[]);
  }
});

test('full source, units, notes and ownership are fenced after held native preparation',async()=>{
  const changes=[f=>f.model.id='new',f=>f.model.metadata.offColors.faces[0].values[3]=126,f=>f.model.metadata.offlineAsset.hash='changed',
    f=>f.state.notes='edited',f=>f.state.view.coordinateUnit='cm',f=>f.model.metadata.coordinateUnits='cm',f=>f.doc.id='new',f=>f.doc.states=[...f.doc.states],f=>f.replaceProject({...f.project}),
    f=>{f.doc.states.push(clone(f.state));f.doc.cursor=1;}];
  for(const change of changes){const f=fixture(),held=deferred(),native=f.context.prepare;f.context.prepare=async(...args)=>{const p=await native(...args);await held.promise;return p;};
    const request=f.session.configure(settings());await tick();change(f);held.resolve();await assert.rejects(request,/changed/);assert.equal(f.state.view.dualMorph,undefined);assert.deepEqual(f.renders,[]);
  }
});

test('observer motion and unrelated document edits survive held preparation without view overwrite',async()=>{
  const f=fixture(),held=deferred(),native=f.context.prepare;f.context.prepare=async(...a)=>{const p=await native(...a);await held.promise;return p;};
  const request=f.session.configure(settings());await tick();f.state.view.angles[0]=35;f.state.view.camera={zoom:4};f.project.memories={unrelated:'edit'};
  held.resolve();await request;assert.equal(f.state.view.angles[0],35);assert.deepEqual(f.state.view.camera,{zoom:4});
});

test('method/radius/duration edits while evaluation is held reject late publication',async()=>{
  for(const key of ['method','radius','duration','ratio']){const f=fixture();await f.session.configure(settings());const held=deferred(),native=f.context.evaluate;
    f.context.evaluate=async(...a)=>{const p=await native(...a);await held.promise;return p;};const request=f.session.seek(.5);await tick();
    f.state.view.dualMorph[key]=key==='method'?'sizing':key==='ratio'?.7:7;held.resolve();await assert.rejects(request,/stale|changed|superseded/);assert.deepEqual(f.renders,[0]);
  }
});

test('strict exact requests coalesce one active plus latest pending; discarded poses never render',async()=>{
  const f=fixture();await f.session.configure(settings());const held=deferred(),native=f.context.evaluate;let calls=0;
  f.context.evaluate=async(...a)=>{const p=await native(...a);if(calls++===0)await held.promise;return p;};
  const first=f.session.seek(.2),second=f.session.seek(.4),third=f.session.seek(.6);const firstNo=assert.rejects(first,/superseded/),secondNo=assert.rejects(second,/superseded/);
  assert.equal(f.session.active.job.ratio,.2);assert.equal(f.session.queued.ratio,.6);held.resolve();await Promise.all([firstNo,secondNo,third]);assert.deepEqual(f.renders,[0,.6]);assert.deepEqual(f.jobs,[0,.2,.6]);
});

test('continuous playback may publish complete intermediate poses with coherent source ownership',async()=>{
  const f=fixture();await f.session.configure(settings());const held=deferred(),native=f.context.evaluate;let calls=0;
  f.context.evaluate=async(...a)=>{const p=await native(...a);if(calls++===0)await held.promise;return p;};
  const first=f.session.seek(.2,{exact:false}),second=f.session.seek(.4,{exact:false}),last=f.session.seek(.6,{exact:false});const skipped=assert.rejects(second,/superseded/);
  held.resolve();await Promise.all([first,last,skipped]);assert.deepEqual(f.renders,[0,.2,.6]);assert.equal(f.state.view.dualMorph.ratio,.6);
});

test('play uses absolute elapsed time, independent of RAF cadence; loop and final endpoint are deterministic',async()=>{
  for(const times of [[500,1000,2000],[2000]]){const f=fixture();await f.session.configure(settings());f.session.play();for(const t of times)await f.advance(t);assert.equal(f.state.view.dualMorph.ratio,1);assert.equal(f.session.playing,false);}
  const f=fixture(),s=settings();s.loop=true;await f.session.configure(s);f.session.play();await f.advance(4500);assert.equal(f.state.view.dualMorph.ratio,.25);assert.equal(f.session.playing,true);f.session.pause();
});

test('pause/cancel stop ignored-provider native jobs; reset restores source without old view restoration',async()=>{
  for(const operation of ['pause','cancel','reset']){const f=fixture();await f.session.configure(settings());const held=deferred(),native=f.context.evaluate;
    f.context.evaluate=async(...a)=>{const result=await native(...a);await held.promise;return result;};const pending=f.session.seek(.5),rejected=assert.rejects(pending,/canceled|stale|superseded/);
    await tick();f.state.view.camera={zoom:9};f.session[operation]();held.resolve();await rejected;assert.deepEqual(f.renders,[0]);assert.deepEqual(f.state.view.camera,{zoom:9});
    if(operation==='reset'){assert.equal(f.state.view.dualMorph.enabled,false);assert.equal(f.cleared,1);}
  }
});

test('saved settings reconstruct deterministically; unsupported modes and combined masks are diagnosed',async()=>{
  const f=fixture();f.state.view.dualMorph={...settings(),ratio:.5};await f.session.restoreSaved();assert.deepEqual(f.renders,[.5]);
  const g=fixture();g.state.view.dualMorph={...settings(),method:'via-snub'};await assert.rejects(g.session.restoreSaved(),/unavailable/);assert.equal(g.state.view.dualMorph.method,'via-snub');
  for(const v of [{hiddenCells:[0]},{isolatedCell:0},{cellShrink:.5},{explosionAmount:.5}]){const h=fixture();Object.assign(h.state.view,v);await assert.rejects(h.session.configure(settings()),/combined source masks/);}
});

test('late source mask/shrink changes cannot apply original source IDs to changing display topology',async()=>{
  for(const field of [{hiddenCells:[0]},{cellShrink:.5},{cellFacing:'front'},{explosionAmount:.2}]){const f=fixture();await f.session.configure(settings());Object.assign(f.state.view,field);assert.throws(()=>f.session.seek(.5),/combined source masks/);assert.deepEqual(f.renders,[0]);}
});

test('capture awaits exact current pose then viewer fine capture; abort and stale source cannot acknowledge capture',async()=>{
  const f=fixture();await f.session.configure(settings());await f.session.seek(.5);const held=deferred();let entered=false;
  f.context.prepareCapture=async o=>{entered=true;await held.promise;assert.equal(o.isCurrent(),false);};const capture=f.session.prepareCapture();await tick();assert.equal(entered,true);f.state.notes='edited';held.resolve();await assert.rejects(capture,/changed/);
  const g=fixture();await g.session.configure(settings());const waiting=deferred(),native=g.context.evaluate;g.context.evaluate=async(...a)=>{const frame=await native(...a);await waiting.promise;return frame;};
  const controller=new AbortController(),request=g.session.prepareCapture({signal:controller.signal});await tick();controller.abort();await assert.rejects(request,/canceled/);waiting.resolve();await tick();assert.deepEqual(g.renders,[0]);assert.equal(g.captured,0);
});

test('external export blocks programmatic configure/play/seek/reset/capture and native late publication',async()=>{
  const f=fixture();await f.session.configure(settings());f.setExport(true);
  for(const fn of [()=>f.session.configure(settings()),()=>f.session.prepareCapture()])await assert.rejects(fn(),/export/);
  for(const fn of [()=>f.session.play(),()=>f.session.seek(.2),()=>f.session.reset()])assert.throws(fn,/export/);
  f.setExport(false);await f.session.seek(.2);assert.equal(f.state.view.dualMorph.ratio,.2);
});

function controls(f){
  globalThis.document={activeElement:null};const nodes=new Map();for(const id of ['method','center','radius','ratio','duration','loop','apply','play','pause','reset','scrub','result'])nodes.set(id,{value:({method:'expansion',center:'0, 0, 0',radius:'sqrt(4)',ratio:'1/4',duration:'1+1',scrub:'0'})[id]??'',checked:false,disabled:false});
  nodes.get('method').options=['sizing','truncation','augmentation','expansion','tilting-quads','tilting-triangles','tilting-to-compound','tilting-to-rectify','via-snub'].map(value=>({value}));
  const c=new DualMorphControls(f.context,{mount:false});c.panel={querySelector:s=>nodes.get(s==='select'?'method':s.replace('#dual-morph-','')),querySelectorAll:()=>[...nodes.values()]};return {c,nodes};
}
test('controls batch numeric expressions atomically, retain center shape and restore busy/export disabled nodes',async()=>{
  const f=fixture(),{c,nodes}=controls(f);let batch;f.context.evaluateMany=async expressions=>{batch=expressions;return expressions.map(x=>({'sqrt(4)':2,'1/4':.25,'1+1':2,'0':0})[x]);};
  await c.applyInputs();assert.deepEqual(batch,['sqrt(4)','1/4','1+1','0','0','0']);assert.equal(f.state.view.dualMorph.ratio,.25);assert.deepEqual(f.state.view.dualMorph.center,[0,0,0]);
  f.setExport(true);c.sync();assert.equal(nodes.get('apply').disabled,true);assert.equal(nodes.get('play').disabled,true);f.setExport(false);c.sync();assert.equal(nodes.get('apply').disabled,false);
  assert.deepEqual(nodes.get('method').options.map(({value,disabled})=>[value,disabled]),[['sizing',false],['truncation',false],['augmentation',false],['expansion',false],['tilting-quads',false],['tilting-triangles',false],['tilting-to-compound',false],['tilting-to-rectify',false],['via-snub',true]]);
  const four=fixture();four.state.model.dimension=4;four.state.model.embeddingDimension=4;const other=controls(four);other.c.sync();
  assert.deepEqual(other.nodes.get('method').options.map(({value,disabled})=>[value,disabled]),[['sizing',true],['truncation',true],['augmentation',true],['expansion',false],['tilting-quads',false],['tilting-triangles',true],['tilting-to-compound',true],['tilting-to-rectify',true],['via-snub',true]]);
});
test('held expression/native form changes and cancel reject publication; camera-only motion remains allowed',async()=>{
  for(const change of ['expression','native','cancel']){const f=fixture(),{c,nodes}=controls(f),held=deferred();
    f.context.evaluateMany=async xs=>{if(change==='expression'||change==='cancel')await held.promise;return xs.map(x=>({'sqrt(4)':2,'1/4':.25,'1+1':2,'0':0})[x]);};
    if(change==='native'){const native=f.context.prepare;f.context.prepare=async(...a)=>{const p=await native(...a);await held.promise;return p;};}
    const pending=c.applyInputs();await tick();if(change==='cancel')c.cancelNumeric();else nodes.get('radius').value='3';held.resolve();await assert.rejects(pending,/changed|cancel|settings/);assert.equal(f.state.view.dualMorph,undefined);assert.deepEqual(f.renders,[]);
  }
});
