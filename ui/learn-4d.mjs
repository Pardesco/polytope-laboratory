// SPDX-License-Identifier: GPL-3.0-only
import chapters from './learn-4d-lessons.json' with {type:'json'};
export const LEARN_4D_CHAPTERS=chapters;
export const LEARN_4D_ACTIONS=Object.freeze(['shape','projection','turn','slice','net','pair']);
export const lessonShapeParams=key=>key==='square'?{kind:'polygon',n:4}:{kind:'regular',key};
const canceled=()=>Object.assign(Error('Lesson action canceled.'),{name:'AbortError'});
const check=(signal,current)=>{if(signal.aborted||!current())throw canceled();};
const delay=(ms,signal)=>new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(canceled());
  const abort=()=>{clearTimeout(timer);reject(canceled());},timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
  signal.addEventListener('abort',abort,{once:true});
});
export async function waitForLessonReady(context,{signal,current}){
  const now=context.now??(()=>performance.now()),until=now()+(context.waitMs??10000);
  for(;;){
    check(signal,current);context.assertAvailable();
    if(!context.hasBackgroundWork?.())return;
    if(now()>=until)throw Error('Preparation is taking longer than expected. Try again in a moment.');
    await (context.waitDelay??delay)(50,signal);
  }
}

export class LessonPosition {
  constructor(content=chapters){this.chapters=content;this.steps=content.flatMap((chapter,c)=>chapter.steps.map((step,s)=>({chapter:c,step:s,content:step})));this.index=0;}
  get current(){return this.steps[this.index];}
  get last(){return this.index===this.steps.length-1;}
  move(delta){this.index=Math.max(0,Math.min(this.steps.length-1,this.index+delta));return this.current;}
  chapter(index){const at=this.steps.findIndex(step=>step.chapter===index);if(at<0)throw Error('Choose a lesson chapter.');this.index=at;return this.current;}
}

export async function performLessonAction(action,context,{signal,current,replay=false}={}){
  if(!LEARN_4D_ACTIONS.includes(action.kind))throw Error('This lesson action is unavailable.');
  check(signal,current);context.stop();
  const key=action.kind==='pair'&&replay&&context.shapeKey()===action.key?action.other:action.key;
  await context.load(key,{signal,current});check(signal,current);
  context.configure({angles:Array(6).fill(0),projection:'perspective',viewportLayout:'single',faces:!['cell120','cell600'].includes(key)});
  if(action.kind==='projection')context.projection(action.projection);
  else if(action.kind==='turn'){
    context.configure({angles:[0,0,24,0,18,0],rotationPlane:2,rotationSpeed:18});context.turn(action.playing);
  }else if(action.kind==='slice'){
    const normal=action.normal,values=context.depthRange(normal),count=context.sweepFrames??24;
    context.configure({viewportLayout:'split',derivedMode:'section',sectionNormal:[...normal]});
    context.fit({baseOnly:true});
    for(let i=0;i<=count;i++){
      check(signal,current);await context.section(values[0]+(values[1]-values[0])*i/count,{signal,current});
      check(signal,current);await (context.delay??delay)(160,signal);
    }
  }else if(action.kind==='net'){
    context.configure({angles:[0,0,24,0,18,0],viewportLayout:'split',derivedMode:'cell-net'});
    await context.net({signal,current});check(signal,current);
  }else if(action.kind!=='projection')context.configure({angles:key==='square'?Array(6).fill(0):key==='cube'?[15,25,0,0,0,0]:[0,0,24,0,18,0]});
  check(signal,current);context.fit();
}

export class Learn4D {
  constructor(context){
    this.context=context;this.document=context.document??document;this.position=new LessonPosition();this.sequence=0;
    const panel=this.document.createElement('aside');this.panel=panel;panel.id='learn-4d-panel';panel.hidden=true;panel.setAttribute('aria-labelledby','learn-4d-title');
    panel.innerHTML='<header><div><p class="learn-eyebrow">A NEW WAY TO SEE</p><h2 id="learn-4d-title">Learn 4D</h2></div><button id="learn-4d-close" aria-label="Exit Learn 4D">Exit</button></header><div class="learn-content"><p class="learn-copy">Learning copy · temporary document<br>Exit returns to your previous document.</p><label for="learn-4d-chapter">Explore a chapter</label><select id="learn-4d-chapter"></select><div class="learn-progress"><span id="learn-4d-progress-text"></span><progress id="learn-4d-progress" aria-label="Lesson progress"></progress></div><article aria-labelledby="learn-4d-step-title"><p id="learn-4d-chapter-title" class="learn-eyebrow"></p><h3 id="learn-4d-step-title" tabindex="-1"></h3><p id="learn-4d-text"></p></article><button id="learn-4d-action" class="accent wide"></button><div class="learn-try"><strong>Try it yourself</strong><p id="learn-4d-hint"></p><button id="learn-4d-pause">Pause motion</button></div><output id="learn-4d-status" role="status" aria-live="polite"></output></div><footer><button id="learn-4d-back">Back</button><button id="learn-4d-next" class="accent">Next</button></footer><p class="learn-copy">Esc to exit · Your experiments in this copy are discarded on exit.</p>';
    (context.host??this.document.querySelector('main')).append(panel);
    this.scroll=panel.querySelector('.learn-content');
    this.nodes=Object.fromEntries(['close','chapter','progress-text','progress','chapter-title','step-title','text','action','hint','pause','status','back','next'].map(id=>[id,panel.querySelector('#learn-4d-'+id)]));
    chapters.forEach((chapter,i)=>{const option=this.document.createElement('option');option.value=String(i);option.textContent=(i+1)+'. '+chapter.title;this.nodes.chapter.append(option);});
    this.nodes.close.onclick=()=>this.close();this.nodes.back.onclick=()=>this.navigate(-1);this.nodes.next.onclick=()=>this.position.last?this.close():this.navigate(1);
    this.nodes.chapter.onchange=()=>{this.position.chapter(Number(this.nodes.chapter.value));return this.showStep();};
    this.nodes.action.onclick=()=>this.session?this.act(true):this.prepare();this.nodes.pause.onclick=()=>{this.cancel();context.stop();this.nodes.status.textContent='Paused. Explore the view, or replay this step.';};
    this.document.addEventListener('keydown',event=>{if(this.panel.hidden||event.key!=='Escape'||this.document.querySelector('dialog[open]'))return;event.preventDefault();event.stopImmediatePropagation();this.close();},true);
  }
  async open(){
    if(!this.panel.hidden){this.nodes['step-title'].focus();return;}
    this.context.assertAvailable();this.previousFocus=this.document.activeElement;this.entryProject=this.context.getProject?.();this.context.dismissWelcome?.();
    this.panel.hidden=false;this.document.body.classList.add('learn-4d-active');this.position=new LessonPosition();this.renderStep();this.context.refitLayout?.();return this.prepare();
  }
  async prepare(){
    this.cancel();const controller=new AbortController();this.preparing=controller;
    const current=()=>!this.panel.hidden&&this.preparing===controller&&this.context.getProject?.()===this.entryProject;
    for(const id of ['chapter','back','next','pause','action'])this.nodes[id].disabled=true;
    this.nodes.status.textContent='Preparing…';
    try{
      await waitForLessonReady(this.context,{signal:controller.signal,current});check(controller.signal,current);this.context.assertAvailable();
      this.session=this.context.begin();this.preparing=null;
      for(const id of ['chapter','next','pause'])this.nodes[id].disabled=false;
      return this.showStep();
    }catch(error){
      if(current()){this.nodes.action.disabled=false;this.nodes.action.textContent='Try again';this.nodes.status.textContent=error.name==='AbortError'?'Preparation paused. Try again when ready.':error.message;}
    }finally{if(this.preparing===controller)this.preparing=null;}
  }
  cancel(){++this.sequence;this.preparing?.abort();this.controller?.abort();this.controller=null;this.nodes.action.disabled=false;}
  close({restore=true}={}){
    if(this.panel.hidden)return;
    if(this.context.isExporting()){this.cancel();this.nodes.status.textContent='Finish or cancel export, then exit the lesson.';return;}
    this.cancel();if(this.session)this.context.stop();this.panel.hidden=true;this.document.body.classList.remove('learn-4d-active');
    const session=this.session;this.session=null;this.entryProject=null;if(session)this.context.end(session,{restore});this.context.refitLayout?.();
    if(restore&&this.previousFocus?.isConnected)this.previousFocus.focus({preventScroll:true});
  }
  sync(){if(!this.panel.hidden&&(this.session?!this.context.owns(this.session):this.context.getProject?.()!==this.entryProject))this.close({restore:false});}
  navigate(delta){this.position.move(delta);return this.showStep();}
  renderStep(){
    const {chapter,step,content}=this.position.current,n=this.nodes;
    n.chapter.value=String(chapter);n['chapter-title'].textContent='CHAPTER '+(chapter+1)+' / '+chapters.length;
    n['step-title'].textContent=content.title;n.text.textContent=content.text;n.hint.textContent=content.hint;n.action.textContent=content.button;
    n.progress.max=this.position.steps.length;n.progress.value=this.position.index+1;
    n['progress-text'].textContent='Step '+(step+1)+' of '+chapters[chapter].steps.length+' · '+(this.position.index+1)+' / '+this.position.steps.length+' overall';
    n.back.disabled=this.position.index===0;n.next.textContent=this.position.last?'Finish':'Next';n['step-title'].focus({preventScroll:true});if(this.scroll)this.scroll.scrollTop=0;
  }
  showStep(){this.renderStep();return this.act();}
  async act(replay=false){
    this.cancel();const sequence=this.sequence,session=this.session,controller=new AbortController();this.controller=controller;
    const current=()=>!this.panel.hidden&&this.sequence===sequence&&this.context.owns(session)&&!this.context.isExporting();
    this.nodes.action.disabled=true;this.nodes.status.textContent='Preparing the live view…';
    try{
      await performLessonAction(this.position.current.content.action,this.context,{signal:controller.signal,current,replay});
      if(current())this.nodes.status.textContent='Ready to explore. Use Next when you are ready.';
    }catch(error){if(current()&&error.name!=='AbortError')this.nodes.status.textContent=error.message+' Use the action button to try again.';}
    finally{if(this.controller===controller){this.controller=null;this.nodes.action.disabled=false;}}
  }
}

export function mountLearn4DCard(doc,open){
  if(doc.getElementById('welcome-learn-4d'))return;
  const host=doc.getElementById('welcome-tours')??doc.getElementById('welcome-primary');if(!host)return;
  const button=doc.createElement('button');button.id='welcome-learn-4d';button.className='learn-welcome-card';button.type='button';
  const title=doc.createElement('strong'),caption=doc.createElement('span');title.textContent='Learn 4D';caption.textContent='Six short chapters. Real shapes. A new way to see.';button.append(title,caption);button.onclick=open;host.prepend(button);
}

const workspaceSignature=(project,id)=>JSON.stringify({...project,active:0,documents:project.documents.filter(d=>d.id!==id)});
export function createLessonWorkspace(c){
  let session=null,key=null,source=null;
  const owns=s=>!!s&&s===session&&c.getProject()===s.project&&(s.documentId?c.getDocument()?.id===s.documentId:c.getDocument()===s.previous);
  const requireOwner=()=>{if(!owns(session)||c.isExporting())throw canceled();};
  return {
    ...c,owns,shapeKey:()=>c.getState()?.model===source?key:null,
    begin(){
      const project=c.getProject();
      if(project.documents.length>=100)throw Error('Close a document before opening Learn 4D.');
      session={project,previous:c.getDocument(),dirty:c.getDirty(),signature:workspaceSignature(project),rotating:c.isRotating(),models:new Map()};
      c.stop();return session;
    },
    end(s,{restore}){
      if(s!==session)return;session=null;key=null;source=null;
      if(c.getProject()!==s.project)return;
      const project=s.project,active=c.getDocument(),at=project.documents.findIndex(d=>d.id===s.documentId);
      if(at>=0)project.documents.splice(at,1);
      const target=restore?s.previous:active;
      project.active=Math.max(0,project.documents.findIndex(d=>d===target||d.id===target?.id));
      c.markDirty();
      const unchanged=workspaceSignature(project)===s.signature;
      if(unchanged)c.setDirty(s.dirty);
      c.render();
      if(restore&&s.rotating&&c.getDocument()?.id===s.previous?.id)c.resumeRotation();
    },
    async load(next,{signal,current}){
      requireOwner();const s=session,before=c.getState();let model=s.models.get(next);
      if(!model){model=await c.run('generate',lessonShapeParams(next),null,'Learn 4D: '+next,{signal});check(signal,current);s.models.set(next,model);}
      check(signal,current);requireOwner();if(c.getState()!==before)throw Error('The learning copy changed. Replay this step to continue.');
      const state=c.initialState(model,'Learn 4D');state.view.documentMetadata={title:'Learn 4D · '+(next==='square'?'Square':model.name)};
      const project=s.project;
      if(!s.documentId){
        if(project.documents.length>=100)throw Error('Close a document before opening the learning copy.');
        s.documentId=c.uid();project.documents.push({id:s.documentId,cursor:0,states:[state]});project.active=project.documents.length-1;
      }else{const at=project.documents.findIndex(d=>d.id===s.documentId);project.documents[at]={id:s.documentId,cursor:0,states:[state]};}
      source=model;key=next;c.markDirty();c.render();
    },
    configure(patch){requireOwner();const view=c.getState().view;Object.assign(view,patch);
      view.presentation=view.faces?'translucent':'wireframe';view.surfaceOpacity=.22;view.edges=true;view.vertices=false;
      c.updateSectionInputs();c.updateView();c.markViewDirty();
    },
    projection(value){requireOwner();c.viewport.setDisplayOption('projection',value);},
    turn(playing){requireOwner();if(playing)c.viewport.toggle();},
    depthRange(normal){
      const levels=c.getState().model.vertices.map(v=>v.reduce((sum,x,i)=>sum+x*normal[i],0)),lo=Math.min(...levels),hi=Math.max(...levels),pad=(hi-lo)*.08;
      return [lo-pad,hi+pad];
    },
    async section(offset,{signal,current}){
      requireOwner();c.getState().view.sectionOffset=offset;c.updateSectionInputs();c.markViewDirty();
      await c.refreshDerived({throwOnError:true,signal,isCurrent:current});
    },
    async net({signal,current}){requireOwner();await c.refreshDerived({throwOnError:true,signal,isCurrent:current});},
    fit(options){requireOwner();c.fit(options);}
  };
}
