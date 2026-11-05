import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Learn4D,LessonPosition,LEARN_4D_CHAPTERS,LEARN_4D_ACTIONS,performLessonAction,lessonShapeParams,createLessonWorkspace,mountLearn4DCard,waitForLessonReady} from '../ui/learn-4d.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
class Node {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.listeners={};this.hidden=false;this.isConnected=true;this.classes=new Set();this.classList={add:k=>this.classes.add(k),remove:k=>this.classes.delete(k),contains:k=>this.classes.has(k)};}
  append(...nodes){this.children.push(...nodes);}
  prepend(node){this.children.unshift(node);}
  setAttribute(key,value){this.attributes[key]=String(value);}
  addEventListener(key,fn){this.listeners[key]=fn;}
  set innerHTML(value){this.html=value;this.children=[...value.matchAll(/<(\w+)\b[^>]*id="([^"]+)"[^>]*>/g)].map(m=>Object.assign(new Node(m[1]),{id:m[2]}));}
  querySelector(selector){return this.children.find(n=>n.id===selector.slice(1));}
  focus(){this.focused=true;}
}
function actionFixture(){
  const calls=[];let key=null;
  const context={stop:()=>calls.push(['stop']),load:async k=>{key=k;calls.push(['load',k]);},shapeKey:()=>key,configure:v=>calls.push(['configure',v]),projection:p=>calls.push(['projection',p]),turn:p=>calls.push(['turn',p]),depthRange:()=>[-2,2],section:async d=>calls.push(['section',d]),net:async()=>calls.push(['net']),fit:()=>calls.push(['fit']),delay:async()=>{},sweepFrames:4};
  const controller=new AbortController(),options={signal:controller.signal,current:()=>true};return {context,calls,options,controller};
}
function panelFixture(){
  const body=new Node(),host=new Node(),focus=new Node('button'),document={body,activeElement:focus,createElement:t=>new Node(t),querySelector:s=>s==='main'?host:document.modal,listeners:{},addEventListener(k,fn){this.listeners[k]=fn;}};
  const a=actionFixture(),sessions=[],ends=[];let exporting=false,owner=true;
  const context={...a.context,document,assertAvailable(){if(exporting)throw Error('Finish export.');},begin(){const s={};sessions.push(s);return s;},owns:s=>owner&&sessions.at(-1)===s,end:(s,o)=>ends.push([s,o]),isExporting:()=>exporting};
  const panel=new Learn4D(context);return {...a,panel,document,focus,sessions,ends,setExport:v=>exporting=v,setOwner:v=>owner=v};
}
function workspaceFixture({empty=false,dirty=false}={}){
  const original={id:'original',cursor:0,states:[{model:{name:'Original'},view:{angles:[1,2,3,4,5,6],projection:'stereographic',sectionOffset:.4},notes:'Keep me'}]},project={documents:empty?[]:[original],active:0,memories:{original:true}},calls=[];
  let activeProject=project,isDirty=dirty,exporting=false,rotation=false,id=0;
  const c={getProject:()=>activeProject,getDocument:()=>activeProject.documents[activeProject.active],getState:()=>c.getDocument()?.states[c.getDocument().cursor],getDirty:()=>isDirty,setDirty:v=>isDirty=v,uid:()=>String(++id),
    isExporting:()=>exporting,isRotating:()=>rotation,resumeRotation:()=>rotation=true,stop:()=>rotation=false,run:async(_op,p)=>({name:p.key??'square',vertices:[[-1,-1,-1,-1],[1,1,1,1]],dimension:4}),initialState:(model,label)=>({model,label,view:{}}),markDirty:()=>{isDirty=true;},markViewDirty:()=>{isDirty=true;},render:()=>calls.push('render'),updateView(){},updateSectionInputs(){},refreshDerived:async()=>{},fit(){},viewport:{setDisplayOption(){},toggle(){}}};
  const workspace=createLessonWorkspace(c);return {workspace,c,project,original,calls,getDirty:()=>isDirty,setProject:p=>activeProject=p,setExport:v=>exporting=v,setRotation:v=>rotation=v,isRotating:()=>rotation};
}
const actionOptions=()=>({signal:new AbortController().signal,current:()=>true});

test('six short chapters have 16 bounded, named steps and exactly one supported viewport action each',()=>{
  assert.equal(LEARN_4D_CHAPTERS.length,6);assert.equal(new LessonPosition().steps.length,16);
  for(const chapter of LEARN_4D_CHAPTERS){assert.ok(chapter.steps.length>=2&&chapter.steps.length<=4);for(const step of chapter.steps){for(const field of ['title','text','hint','button'])assert.ok(step[field].length>0);assert.ok(LEARN_4D_ACTIONS.includes(step.action.kind));assert.ok(step.text.length<480);}}
  assert.deepEqual(lessonShapeParams('square'),{kind:'polygon',n:4});assert.deepEqual(lessonShapeParams('cell120'),{kind:'regular',key:'cell120'});
});
test('Back, Next and chapter jumps preserve boundaries and include the entire family',()=>{
  const p=new LessonPosition();p.move(-1);assert.equal(p.index,0);p.chapter(5);assert.equal(p.current.content.action.key,'simplex4');
  assert.deepEqual(p.steps.slice(p.index).flatMap(s=>[s.content.action.key,...s.content.action.other?[s.content.action.other]:[]]),['simplex4','cross4','cell24','cell120','cell600']);
  while(!p.last)p.move(1);assert.equal(p.index,15);p.move(1);assert.equal(p.index,15);assert.throws(()=>p.chapter(10),/Choose/);
});
test('every content action maps to live bridge calls, with perspective/parallel/curved modes kept distinct',async()=>{
  for(const {content} of new LessonPosition().steps){const f=actionFixture();await performLessonAction(content.action,f.context,f.options);assert.equal(f.calls[0][0],'stop');assert.deepEqual(f.calls[1],['load',content.action.key]);assert.equal(f.calls.at(-1)[0],'fit');}
  for(const projection of ['perspective','orthographic','stereographic']){const f=actionFixture();await performLessonAction({kind:'projection',key:'tesseract',projection},f.context,f.options);assert.ok(f.calls.some(c=>c[0]==='projection'&&c[1]===projection));assert.deepEqual(f.calls.find(c=>c[0]==='configure')[1].angles,[0,0,0,0,0,0]);}
});
test('turns use XW and 18 degrees/sec, manual turn step pauses, and 3D poses avoid fourth-axis planes',async()=>{
  for(const playing of [true,false]){const f=actionFixture();await performLessonAction({kind:'turn',key:'tesseract',playing},f.context,f.options);assert.deepEqual(f.calls.find(c=>c[0]==='turn'),['turn',playing]);assert.ok(f.calls.some(c=>c[1]?.rotationPlane===2&&c[1]?.rotationSpeed===18));}
  const f=actionFixture();await performLessonAction({kind:'shape',key:'cube'},f.context,f.options);const angles=f.calls.filter(c=>c[1]?.angles).at(-1)[1].angles;assert.equal(angles[2]+angles[4]+angles[5],0);
});
test('slice sweeps are serial native evaluations through the complete bounded interval',async()=>{
  const f=actionFixture(),gate=deferred();let inFlight=0,max=0;
  f.context.section=async d=>{inFlight++;max=Math.max(max,inFlight);if(d===-2)await gate.promise;f.calls.push(['section',d]);inFlight--;};
  const pending=performLessonAction({kind:'slice',key:'tesseract',normal:[.5,.5,.5,.5]},f.context,f.options);await Promise.resolve();assert.equal(inFlight,1);gate.resolve();await pending;
  assert.equal(max,1);assert.deepEqual(f.calls.filter(c=>c[0]==='section').map(c=>c[1]),[-2,-1,0,1,2]);
});
test('canceling a sweep or losing ownership prevents more native work and final fitting',async()=>{
  const f=actionFixture();f.context.section=async()=>f.controller.abort();
  await assert.rejects(performLessonAction({kind:'slice',key:'cell24',normal:[0,0,0,1]},f.context,f.options),{name:'AbortError'});assert.equal(f.calls.filter(c=>c[0]==='fit').length,1,'fit the split layout before the sweep, never after cancellation');
  const g=actionFixture();await assert.rejects(performLessonAction({kind:'shape',key:'cube'},g.context,{...g.options,current:()=>false}),{name:'AbortError'});assert.equal(g.calls.length,0);
});
test('the final dual pair switches real source keys on replay and uses edge-only rendering',async()=>{
  const f=actionFixture(),action={kind:'pair',key:'cell120',other:'cell600'};
  await performLessonAction(action,f.context,f.options);await performLessonAction(action,f.context,{...f.options,replay:true});await performLessonAction(action,f.context,{...f.options,replay:true});
  assert.deepEqual(f.calls.filter(c=>c[0]==='load').map(c=>c[1]),['cell120','cell600','cell120']);assert.ok(f.calls.filter(c=>c[1]?.faces!==undefined).every(c=>c[1].faces===false));
});
test('panel stays closed at startup, exposes progress and chapter selection, and Esc restores focus',async()=>{
  const f=panelFixture();assert.equal(f.panel.panel.hidden,true);assert.equal(f.sessions.length,0);await f.panel.open();
  assert.equal(f.panel.panel.hidden,false);assert.equal(f.panel.nodes.chapter.children.length,6);assert.equal(f.panel.nodes.progress.value,1);assert.match(f.panel.nodes['progress-text'].textContent,/1 \/ 16/);assert.equal(f.panel.nodes.back.disabled,true);
  await f.panel.navigate(1);assert.equal(f.panel.nodes.progress.value,2);const event={key:'Escape',preventDefault(){this.prevented=true;},stopImmediatePropagation(){}};
  f.document.modal=new Node('dialog');f.document.listeners.keydown(event);assert.equal(f.panel.panel.hidden,false);f.document.modal=null;f.document.listeners.keydown(event);
  assert.ok(event.prevented);assert.ok(f.panel.panel.hidden);assert.equal(f.ends[0][1].restore,true);assert.ok(f.focus.focused);
});
test('Next on the final step finishes; chapter selector and Back both drive the viewport',async()=>{
  const f=panelFixture();await f.panel.open();f.panel.nodes.chapter.value='5';await f.panel.nodes.chapter.onchange();assert.equal(f.panel.position.current.chapter,5);
  await f.panel.navigate(1);await f.panel.nodes.back.onclick();assert.equal(f.panel.position.current.step,0);f.panel.position.move(99);await f.panel.showStep();assert.equal(f.panel.nodes.next.textContent,'Finish');f.panel.nodes.next.onclick();assert.ok(f.panel.panel.hidden);
});
test('late action completions cannot publish after Back, Pause or Exit',async()=>{
  const f=panelFixture(),gate=deferred();f.panel.context.load=async()=>gate.promise;
  const opening=f.panel.open();f.panel.close();gate.resolve();await opening;assert.ok(f.panel.panel.hidden);assert.ok(!f.calls.some(c=>c[0]==='fit'));
  const g=panelFixture();await g.panel.open();g.panel.nodes.pause.onclick();assert.match(g.panel.nodes.status.textContent,/Paused/);assert.equal(g.panel.nodes.action.disabled,false);g.panel.close();
});
test('native failure stays local and retry remains available; export prevents exit until the source is released',async()=>{
  const f=panelFixture();f.panel.context.load=async()=>{throw Error('Native test error');};await f.panel.open();assert.match(f.panel.nodes.status.textContent,/Native test error/);assert.equal(f.panel.nodes.action.disabled,false);
  f.setExport(true);f.panel.close();assert.equal(f.panel.panel.hidden,false);assert.match(f.panel.nodes.status.textContent,/Finish or cancel export/);f.setExport(false);f.panel.close();
});
test('navigation ends the lesson without jumping away from the newly selected document',async()=>{
  const f=panelFixture();await f.panel.open();f.setOwner(false);f.panel.sync();assert.ok(f.panel.panel.hidden);assert.equal(f.ends[0][1].restore,false);
});
test('scratch document has its own source state, restores exact original content and dirty status',async()=>{
  for(const dirty of [false,true]){const f=workspaceFixture({dirty}),before=structuredClone(f.project),s=f.workspace.begin();await f.workspace.load('tesseract',actionOptions());
    assert.equal(f.project.documents.length,2);assert.equal(f.c.getDocument().id,s.documentId);assert.equal(f.original.states[0].notes,'Keep me');assert.ok(f.c.getState().view.documentMetadata.title.startsWith('Learn 4D'));
    f.c.getState().notes='Experiment';await f.workspace.load('cell24',actionOptions());assert.equal(f.project.documents.length,2);f.workspace.end(s,{restore:true});assert.deepEqual(f.project,before);assert.equal(f.getDirty(),dirty);}
});
test('opening and exiting from an empty workspace removes the only temporary tab',async()=>{
  const f=workspaceFixture({empty:true}),before=structuredClone(f.project),s=f.workspace.begin();await f.workspace.load('square',actionOptions());f.workspace.end(s,{restore:true});assert.deepEqual(f.project,before);assert.equal(f.getDirty(),false);
});
test('source generation caches only within a lesson and refuses changed document state after await',async()=>{
  const f=workspaceFixture(),s=f.workspace.begin(),gate=deferred();f.c.run=async()=>gate.promise;
  const pending=f.workspace.load('cube',actionOptions());f.original.cursor=1;f.original.states.push({model:{name:'Changed'},view:{}});gate.resolve({name:'Cube'});
  await assert.rejects(pending,/learning copy changed/);assert.equal(f.project.documents.length,1);f.workspace.end(s,{restore:true});assert.equal(f.getDirty(),true);
  const g=workspaceFixture();let runs=0;g.c.run=async()=>{runs++;return {name:'Tesseract'};};const owner=g.workspace.begin();await g.workspace.load('tesseract',actionOptions());await g.workspace.load('tesseract',actionOptions());assert.equal(runs,1);g.workspace.end(owner,{restore:true});
});
test('tab switches, project replacement, document limit and stale responses never overwrite user work',async()=>{
  const f=workspaceFixture(),s=f.workspace.begin();await f.workspace.load('cube',actionOptions());const extra={id:'extra',states:[{model:{name:'Extra'},view:{}}],cursor:0};f.project.documents.push(extra);f.project.active=2;
  assert.equal(f.workspace.owns(s),false);f.workspace.end(s,{restore:false});assert.equal(f.c.getDocument(),extra);assert.ok(f.project.documents.includes(f.original));assert.equal(f.getDirty(),true);
  const g=workspaceFixture(),owner=g.workspace.begin();g.setProject({documents:[],active:0});g.workspace.end(owner,{restore:true});assert.equal(g.project.documents.length,1);
  const h=workspaceFixture();h.project.documents=Array.from({length:100},(_,i)=>({...h.original,id:String(i)}));assert.throws(()=>h.workspace.begin(),/Close a document/);
});
test('4D slicing uses source-coordinate support bounds and preserves original rotation on exit',async()=>{
  const f=workspaceFixture();f.setRotation(true);const s=f.workspace.begin();assert.equal(f.isRotating(),false);await f.workspace.load('tesseract',actionOptions());assert.deepEqual(f.workspace.depthRange([.5,.5,.5,.5]),[-2.32,2.32]);
  f.c.fit=options=>assert.deepEqual(options,{baseOnly:true});f.workspace.fit({baseOnly:true});f.workspace.end(s,{restore:true});assert.equal(f.isRotating(),true);
});
test('welcome card is additive and deduplicated, with an accessible native button',()=>{
  const host=new Node(),doc={getElementById:id=>id==='welcome-tours'?host:host.children.find(n=>n.id===id),createElement:t=>new Node(t)};let opens=0;
  mountLearn4DCard(doc,()=>opens++);mountLearn4DCard(doc,()=>opens++);assert.equal(host.children.length,1);assert.equal(host.children[0].tagName,'BUTTON');host.children[0].onclick();assert.equal(opens,1);
});
test('renderer and native Help menu mount actions with existing viewport functions and IDs',async()=>{
  const [app,main,html,viewport,bindings]=await Promise.all(['ui/app.js','desktop/main.cjs','ui/index.html','ui/viewport-controls.mjs','desktop/command-bindings.json'].map(p=>readFile(new URL('../'+p,import.meta.url),'utf8')));
  for(const phrase of ['window.openLearn4D','actions.learn4d','mountLearn4DCard','new Learn4D','refreshDerived','setDisplayOption'])assert.ok(app.includes(phrase)||viewport.includes(phrase),phrase);
  assert.match(main,/label:'Learn 4D',click:\(\)=>action\('learn4d'\)/);assert.equal(JSON.parse(bindings).learn4d.label,'Learn 4D');
  for(const id of ['projection','section-offset','section-depth','derived-mode'])assert.ok(html.includes('id="'+id+'"'),id);
  for(const method of ['toggle()','stop()','setDisplayOption(','sync()'])assert.ok(viewport.includes(method),method);
});

test('first click shows Preparing while background jobs settle, then creates one lesson document',async()=>{
  const f=panelFixture(),gate=deferred();let busy=true;
  f.panel.context.hasBackgroundWork=()=>busy;f.panel.context.waitDelay=()=>gate.promise;
  const opening=f.panel.open();assert.equal(f.panel.panel.hidden,false);assert.equal(f.panel.nodes.status.textContent,'Preparing…');assert.equal(f.sessions.length,0);assert.equal(f.panel.nodes.next.disabled,true);
  await f.panel.open();assert.equal(f.sessions.length,0);f.panel.sync();assert.equal(f.panel.panel.hidden,false);
  busy=false;gate.resolve();await opening;assert.equal(f.sessions.length,1);assert.match(f.panel.nodes.status.textContent,/Ready/);assert.equal(f.panel.nodes.next.disabled,false);f.panel.close();
});
test('Exit and Esc cancel background preparation without beginning a late lesson',async()=>{
  for(const escape of [false,true]){const f=panelFixture(),gate=deferred();f.panel.context.hasBackgroundWork=()=>true;f.panel.context.waitDelay=()=>gate.promise;
    const opening=f.panel.open();if(escape)f.document.listeners.keydown({key:'Escape',preventDefault(){},stopImmediatePropagation(){}});else f.panel.nodes.close.onclick();
    gate.resolve();await opening;assert.equal(f.sessions.length,0);assert.equal(f.ends.length,0);assert.equal(f.panel.panel.hidden,true);
  }
});
test('preparation times out within its bound and offers a working retry',async()=>{
  const f=panelFixture();let now=0,busy=true;Object.assign(f.panel.context,{hasBackgroundWork:()=>busy,now:()=>now,waitMs:100,waitDelay:async()=>{now+=50;}});
  await f.panel.open();assert.equal(now,100);assert.match(f.panel.nodes.status.textContent,/taking longer/);assert.equal(f.sessions.length,0);assert.equal(f.panel.nodes.action.disabled,false);
  busy=false;await f.panel.nodes.action.onclick();assert.equal(f.sessions.length,1);assert.match(f.panel.nodes.status.textContent,/Ready/);f.panel.close();
});
test('exclusive work is refused immediately and rechecked after a background wait',async()=>{
  const f=panelFixture();f.setExport(true);await assert.rejects(f.panel.open(),/Finish export/);assert.equal(f.panel.panel.hidden,true);
  const g=panelFixture(),gate=deferred();g.panel.context.hasBackgroundWork=()=>true;g.panel.context.waitDelay=()=>gate.promise;const opening=g.panel.open();g.setExport(true);gate.resolve();await opening;
  assert.equal(g.sessions.length,0);assert.match(g.panel.nodes.status.textContent,/Finish export/);g.setExport(false);g.panel.close();
  const h=panelFixture(),queued=h.panel.open();h.setExport(true);await queued;assert.equal(h.sessions.length,0);assert.match(h.panel.nodes.status.textContent,/Finish export/);h.setExport(false);h.panel.close();
});
test('project replacement cancels preparation; a canceled signal starts no readiness checks',async()=>{
  const f=panelFixture(),gate=deferred();let project={};f.panel.context.getProject=()=>project;f.panel.context.hasBackgroundWork=()=>true;f.panel.context.waitDelay=()=>gate.promise;
  const opening=f.panel.open();project={};f.panel.sync();gate.resolve();await opening;assert.equal(f.panel.panel.hidden,true);assert.equal(f.sessions.length,0);
  const controller=new AbortController();controller.abort();await assert.rejects(waitForLessonReady({assertAvailable(){throw Error('must not run');}},{signal:controller.signal,current:()=>true}),{name:'AbortError'});
});
test('entry and exit refit after their layout change, with the original document restored before exit fitting',async()=>{
  const f=panelFixture();let fitted=0;f.panel.context.refitLayout=()=>{assert.equal(f.panel.panel.hidden,fitted===1);assert.equal(f.document.body.classList.contains('learn-4d-active'),fitted===0);assert.equal(f.ends.length,fitted);fitted++;};await f.panel.open();f.panel.close();assert.equal(fitted,2);
});
