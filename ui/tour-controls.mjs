import {NumericEntry} from './numeric-entry.mjs';
import {createTour,normalizeTour,addTourEvent,replaceTourEvent,setTourDuration,selectTourEvent,deleteTourEvent,moveTourEvent,mergeTours,tourDuration,tourEventStart,evaluateTour} from './tour.mjs';
import {setTourTransition} from './tour.mjs';
import {prepareAnimatedTourTimeline,evaluateAnimatedTour} from './animated-tour-timeline.mjs';
import {TRANSITION_METHODS,normalizeTransition} from './transitions.mjs';
import {AnimatedTourExporter} from './animated-tour-export.mjs';

export class TourControls {
  constructor(context){
    this.context=context;this.playing=false;this.busy=false;this.showing=false;this.generation=0;this.time=0;this.shownId=null;
    const shelf=document.querySelector('.workspace-shelf');if(!shelf)throw new Error('Tours require the workspace shelf.');
    this.details=document.createElement('details');this.details.id='tour-settings';this.details.className='workspace-disclosure';
    this.details.innerHTML=`<summary>Tours</summary><div class="settings-body" id="tour-controls">
      <label>Event <select id="tour-event" aria-label="Tour event"></select></label>
      <label>Duration <input id="tour-duration" type="text" maxlength="512" value="5"> s</label>
      <label>Outgoing transition <select id="tour-transition">${TRANSITION_METHODS.map(method=>`<option value="${method}">${method.replaceAll('-',' ')}</option>`).join('')}</select></label>
      <details><summary>Transition parameters</summary><label>Transition time <input id="tour-transition-duration" type="text" maxlength="512" value="0.5"> s</label>
      <label>Easing <select id="tour-transition-easing"><option>smoothstep</option><option>linear</option><option>smootherstep</option></select></label>
      ${[['angle',0],['distance',2],['tilt',0],['orbits',1],['spin',0],['explosionSize',3],['direction',1]].map(([key,value])=>`<label>${key==='explosionSize'?'Explosion factor':key} <input id="tour-transition-${key}" type="text" maxlength="512" value="${value}"></label>`).join('')}
      <label>Combination methods <input id="tour-transition-components" placeholder="sideways, shrink-grow"></label></details>
      <button id="tour-transition-apply">Apply transition</button>
      <div class="tour-edit-row"><button id="tour-add">Add</button><button id="tour-replace">Replace</button><button id="tour-delete">Delete</button><button id="tour-up">Up</button><button id="tour-down">Down</button></div>
      <div class="tour-play-row"><button id="tour-prev">Prev</button><button id="tour-play">Play</button><button id="tour-next">Next</button><label><input id="tour-loop" type="checkbox"> Loop</label></div>
      <input id="tour-scrub" type="range" min="0" max="0" step="0.001" value="0" aria-label="Tour time"><output id="tour-position">0.000 / 0.000 s</output>
      <div class="tour-play-row"><label>FPS <input id="tour-fps" type="text" maxlength="512" value="24"></label><button id="tour-png">PNG frames</button><button id="tour-webm">WebM</button><button id="tour-close-preview">Close preview</button><button id="tour-cancel-export" hidden>Cancel export</button></div></div>`;
    if(typeof context.importTour==='function'){const merge=document.createElement('button');merge.id='tour-merge';merge.textContent='Merge';this.details.querySelector('.tour-edit-row').append(merge);}
    if(typeof context.exportTour==='function'){const save=document.createElement('button');save.id='tour-save';save.textContent='Save tour';this.details.querySelector('.tour-edit-row').append(save);}
    shelf.insertBefore(this.details,shelf.querySelector('#history-settings'));
    this.nodes=Object.fromEntries([...this.details.querySelectorAll('[id]')].map(node=>[node.id.replace('tour-',''),node]));
    this.nodes.controls.style.width='min(460px, 100%)';this.nodes.controls.style.display='grid';this.nodes.controls.style.gap='8px';
    for(const row of this.details.querySelectorAll('.tour-edit-row,.tour-play-row')){row.style.display='flex';row.style.flexWrap='wrap';row.style.gap='5px';for(const button of row.querySelectorAll('button'))button.style.flex='1';}
    const wrap=fn=>context.guard?context.guard(fn):async(...args)=>{try{return await fn(...args);}catch(error){context.setStatus?.(error.message);}};
    this.actions={add:wrap(()=>this.add()),replace:wrap(()=>this.replace()),delete:wrap(()=>this.edit((tour,index)=>deleteTourEvent(tour,index))),up:wrap(()=>this.edit((tour,index)=>moveTourEvent(tour,index,-1))),down:wrap(()=>this.edit((tour,index)=>moveTourEvent(tour,index,1))),prev:wrap(()=>this.step(-1)),next:wrap(()=>this.step(1)),play:wrap(()=>this.playing?this.pause():this.play()),merge:wrap(()=>this.merge()),save:wrap(()=>this.save()),seek:wrap(time=>this.seek(time))};
    for(const key of ['add','replace','delete','up','down','prev','next','play','merge','save'])if(this.nodes[key])this.nodes[key].onclick=()=>this.actions[key]();
    this.nodes['transition-apply'].onclick=wrap(()=>this.applyTransition());
    this.nodes.png.onclick=wrap(()=>this.export('png'));this.nodes.webm.onclick=wrap(()=>this.export('webm'));
    this.nodes['close-preview'].onclick=wrap(()=>this.closePreview());this.nodes['cancel-export'].onclick=()=>this.numericEditing?this.cancel():this.exporter?.cancel();
    this.nodes.event.onchange=wrap(()=>this.seek(tourEventStart(this.bank(),Number(this.nodes.event.value)),true));
    this.nodes.duration.onchange=wrap(()=>this.setDuration());
    this.nodes.scrub.oninput=()=>this.actions.seek(Number(this.nodes.scrub.value));
    this.nodes.loop.onchange=()=>{this.pause();this.retireRenderer();this.sync();};
    this.frame=wrap(now=>this.tick(now));this.keyHandler=event=>this.onKey(event);document.addEventListener('keydown',this.keyHandler);this.sync();
  }
  bank(project=this.context.getProject()){if(!project)throw new Error('Open a project before using tours.');const tour=normalizeTour(project.tour);project.tour=tour;return tour;}
  sync(){
    const project=this.context.getProject(),state=this.context.getState();let tour;
    try{if(project)tour=this.bank(project);}catch(error){this.context.setStatus?.(error.message);}
    const changedProject=project!==this.observedProject;
    if(this.observedProject&&(changedProject||(!this.showing&&state!==this.observedState)||(tour!==this.observedTour))){this.pause();this.retireRenderer();}
    if(changedProject){this.animatedIndex=null;this.shownId=null;this.time=tour?.events.length?tourEventStart(tour,tour.cursor):0;}
    if(this.context.isExporting?.())this.pause();
    this.observedProject=project;this.observedState=state;this.observedTour=tour;
    const index=tour?this.selectedIndex(tour):0,events=tour?.events||[],disabled=this.busy||this.showing||this.context.isExporting?.()||!tour;
    this.nodes.event.replaceChildren(...events.map((event,i)=>new Option(`${i+1}: ${event.state.model.name||'Model'}`,String(i))));this.nodes.event.value=String(index);
    this.nodes.event.disabled=disabled||!events.length;this.nodes.duration.disabled=disabled||!events.length;if(!this.numericEditing&&globalThis.document?.activeElement!==this.nodes.duration)this.nodes.duration.value=String(events[index]?.duration||5);
    for(const action of ['replace','delete','up','down','prev','next','play','save'])if(this.nodes[action])this.nodes[action].disabled=disabled||!events.length;
    this.nodes.play.disabled=this.context.isExporting?.()||!events.length||(!this.playing&&(this.busy||this.showing));
    this.nodes.add.disabled=disabled||!state||events.length>=100;
    if(this.nodes.merge)this.nodes.merge.disabled=disabled||events.length>=100;
    this.nodes.up.disabled ||= index===0;this.nodes.prev.disabled ||= index===0;
    this.nodes.down.disabled ||= index===events.length-1;this.nodes.next.disabled ||= index===events.length-1;
    this.nodes.loop.disabled=disabled;this.nodes.scrub.disabled=disabled||!events.length;this.nodes.scrub.max=String(tour?this.total(tour):0);
    const transition=normalizeTransition(events[index]?.transition==='instant'||!events[index]?{method:'instant'}:events[index].transition);
    if(!this.numericEditing){if(globalThis.document?.activeElement!==this.nodes.transition)this.nodes.transition.value=transition.method;
    for(const key of ['duration','easing','angle','distance','tilt','orbits','spin','explosionSize','direction'])if(globalThis.document?.activeElement!==this.nodes['transition-'+key])this.nodes['transition-'+key].value=String(transition[key]);
    if(globalThis.document?.activeElement!==this.nodes['transition-components'])this.nodes['transition-components'].value=transition.components.join(', ');}
    for(const node of this.details.querySelectorAll('[id^="tour-transition"]'))node.disabled=disabled||!events.length;
    for(const key of ['png','webm','fps'])this.nodes[key].disabled=disabled||!events.length||!this.context.createRenderer;
    this.nodes['close-preview'].disabled=!this.renderer||Boolean(this.exporter?.exporting);
    this.nodes['cancel-export'].hidden=!(this.exporter?.exporting||this.numericEditing);this.nodes['cancel-export'].textContent=this.numericEditing?'Cancel numeric edit':'Cancel export';
    this.time=Math.min(this.time,tour?this.total(tour):0);this.position();this.nodes.play.textContent=this.playing?'Pause':'Play';
  }
  total(tour=this.bank()){return tour.version===2?prepareAnimatedTourTimeline(tour,{loop:Boolean(this.nodes.loop?.checked)}).duration:tourDuration(tour);}
  selectedIndex(tour=this.bank()){return tour.version===2&&this.renderer?.ownerCurrent()&&Number.isInteger(this.animatedIndex)?this.animatedIndex:tour.cursor;}
  position(){const total=this.observedTour?this.total(this.observedTour):0;this.nodes.scrub.max=String(total);this.nodes.scrub.value=String(this.time);this.nodes.position.textContent=`${this.time.toFixed(3)} / ${total.toFixed(3)} s`;}
  pause(){this.playing=false;this.generation++;if(this.raf)cancelAnimationFrame(this.raf);this.raf=null;this.abort?.abort();this.abort=null;if(!this.exporter?.exporting)this.renderer?.cancel();if(this.nodes?.play)this.nodes.play.textContent='Play';}
  numericInputs(keys){return Object.fromEntries(keys.map(key=>[key,String(this.nodes[key].value)]));}
  async numericAction(keys,fields,publish){
    this.assertAvailable();this.pause();
    const project=this.context.getProject(),tour=this.bank(project),index=this.selectedIndex(tour),generation=this.generation,inputs=this.numericInputs(keys),loop=Boolean(this.nodes.loop?.checked);
    const current=()=>{if(this.generation!==generation||project!==this.context.getProject()||project.tour!==tour||this.selectedIndex(tour)!==index||Boolean(this.nodes.loop?.checked)!==loop)throw Error('The tour, selected event, or playback settings changed. Repeat the edit.');};
    const entry=this.numericEntry=new NumericEntry({...this.context,isExporting:()=>Boolean(this.context.isExporting?.()),getTarget:()=>this.numericInputs(keys)});
    entry.context.getTarget=()=>this.numericInputs(keys);
    this.busy=true;this.numericEditing=true;this.sync();
    try{return await entry.run(fields(inputs),(values,verify,options)=>{const check=()=>{verify();current();};check();return publish(values,{project,tour,index,check,...options});});}
    finally{this.numericEditing=false;this.busy=false;this.sync();}
  }
  transitionInput(values){
    if(!values)throw Error('Evaluate transition numeric fields before applying them.');
    const method=this.nodes.transition.value,options={method,...values,duration:method==='instant'?0:values.duration,components:method==='combination'?this.nodes['transition-components'].value.split(',').map(s=>s.trim()).filter(Boolean):[]};
    options.easing=this.nodes['transition-easing'].value;return normalizeTransition(options);
  }
  async applyTransition(){
    const keys=['transition','transition-components','transition-easing',...['duration','angle','distance','tilt','orbits','spin','explosionSize','direction'].map(key=>'transition-'+key)];
    return this.numericAction(keys,inputs=>Object.fromEntries([
      ...(inputs.transition==='instant'?[]:[['duration',{text:inputs['transition-duration'],min:0,exclusiveMin:true,max:60}]]),
      ...[['angle',-360,360],['distance',0,100],['tilt',-180,180],['orbits',0,100],['spin',0,100],['explosionSize',1,100],['direction',-1,1]].map(([key,min,max])=>[key,{text:inputs['transition-'+key],min,max}])
    ]), (values,{project,tour,index})=>{const updated=setTourTransition(tour,index,this.transitionInput(values));this.publish(project,updated);this.time=tourEventStart(updated,updated.cursor);this.shownId=null;this.position();});
  }
  async durationAction(operation){return this.numericAction(['duration'],inputs=>({duration:{text:inputs.duration,min:0,exclusiveMin:true,max:3600}}),
    (values,{project,tour,index})=>{const updated=operation(tour,index,values.duration);this.publish(project,updated);this.time=updated.events.length?tourEventStart(updated,updated.cursor):0;this.shownId=null;this.position();});}
  async setDuration(){return this.durationAction((tour,index,duration)=>setTourDuration(tour,index,duration));}
  retireRenderer(){const renderer=this.renderer;if(!renderer)return;this.renderer=null;this.exporter?.cancel();this.exporter=null;renderer.close().catch(error=>this.context.setStatus?.(error.message));}
  invalidatePreview(){if(this.renderer&&!this.renderer.ownerCurrent()){this.pause();this.retireRenderer();}}
  closePreview(){if(this.exporter?.exporting)throw Error('Cancel tour export before closing its preview.');this.pause();this.retireRenderer();this.sync();}
  ensureRenderer(){
    const tour=this.bank(),loop=Boolean(this.nodes.loop.checked);
    if(this.renderer&&(!this.renderer.ownerCurrent()||this.renderer.timeline.loop!==loop)){this.retireRenderer();}
    if(!this.renderer){if(!this.context.createRenderer)throw Error('Live animated tour rendering is unavailable.');this.renderer=this.context.createRenderer(tour,{loop});}
    return this.renderer;
  }
  async showAnimated(time,generation){
    const renderer=this.ensureRenderer();this.showing=true;const controller=new AbortController();this.abort=controller;this.sync();
    try{const result=await renderer.apply(time,{signal:controller.signal});if(generation!==this.generation)return;
      const sample=evaluateAnimatedTour(renderer.timeline,time);this.animatedIndex=sample.index;this.time=sample.time;this.nodes.event.value=String(sample.index);this.position();return result;
    }finally{this.showing=false;if(this.abort===controller)this.abort=null;this.sync();}
  }
  async export(format){
    const fps=await this.numericAction(['fps'],inputs=>({fps:{text:inputs.fps,min:1,max:60,integer:true}}),values=>values.fps);
    this.assertAvailable();this.pause();this.context.stopOther?.();const renderer=this.ensureRenderer();
    const exporter=new AnimatedTourExporter({renderer,api:this.context.api,onProgress:value=>{
      const count=value.index??value.progress;
      this.context.setStatus?.(typeof count==='number'?`Tour ${format}: ${count} / ${value.frameCount}`:String(count));
    },onExportStateChange:value=>{this.busy=value;this.context.onExportStateChange?.(value);this.sync();},onDiagnostic:message=>this.context.setStatus?.(message)});
    this.exporter=exporter;
    try{const result=await exporter.export(format,{fps,name:'Polyhedral tour'});if(result)this.context.setStatus?.('Exported tour '+(result.path||result.directory||''));return result;}
    finally{if(this.exporter===exporter)this.exporter=null;this.busy=false;this.sync();}
  }
  assertAvailable(){if(this.busy||this.showing)throw new Error('A tour action is already running.');if(this.context.isExporting?.())throw new Error('Finish animation export before changing tours.');}
  publish(project,tour){if(project!==this.context.getProject())throw new Error('Project changed while the tour action ran.');this.retireRenderer();this.animatedIndex=null;project.tour=tour;this.observedTour=tour;this.context.markDirty();this.sync();}
  async edit(fn){this.assertAvailable();this.pause();const project=this.context.getProject(),tour=this.bank(project),updated=fn(tour,this.selectedIndex(tour));this.publish(project,updated);this.time=updated.events.length?tourEventStart(updated,updated.cursor):0;this.shownId=null;this.position();}
  async add(){return this.durationAction((tour,index,duration)=>addTourEvent(tour,this.context.getState(),duration));}
  async replace(){return this.durationAction((tour,index,duration)=>replaceTourEvent(tour,index,this.context.getState(),duration));}
  async merge(){
    this.assertAvailable();this.pause();if(!this.context.importTour)throw new Error('Tour import is unavailable.');
    const project=this.context.getProject(),original=this.bank(project);this.busy=true;this.sync();
    try{const imported=await this.context.importTour();if(imported){if(project.tour!==original)throw new Error('Tour changed while import ran.');this.publish(project,mergeTours(original,imported));}}finally{this.busy=false;this.sync();}
  }
  async save(){this.assertAvailable();if(!this.context.exportTour)throw new Error('Tour save is unavailable.');this.pause();this.busy=true;this.sync();try{await this.context.exportTour(JSON.parse(JSON.stringify(this.bank())));}finally{this.busy=false;this.sync();}}
  async step(delta){const tour=this.bank();return this.seek(tourEventStart(tour,this.selectedIndex(tour)+delta),true);}
  async show(sample,generation,force=false){
    if(!sample.event||(this.shownId===sample.event.id&&!force))return;
    const project=this.context.getProject(),tour=this.bank(project);this.showing=true;this.abort=new AbortController();this.sync();
    try{
      await this.context.showEvent(JSON.parse(JSON.stringify(sample.event.state)),`Tour ${sample.index+1}: ${sample.event.state.model.name||'Model'}`,{signal:this.abort.signal,isCurrent:()=>generation===this.generation&&project===this.context.getProject()});
      if(generation!==this.generation||project!==this.context.getProject())return;
      this.shownId=sample.event.id;this.observedState=this.context.getState();
      if(project.tour!==tour)throw new Error('Tour changed while its event was loading.');
      if(tour.cursor!==sample.index)this.publish(project,selectTourEvent(tour,sample.index));
    }finally{this.showing=false;this.abort=null;this.sync();}
  }
  async seek(time,force=false){
    this.assertAvailable();this.pause();this.context.stopOther?.();const generation=this.generation,tour=this.bank();
    if(tour.version===2)return this.showAnimated(time,generation);
    const sample=evaluateTour(tour,time);this.time=sample.time;this.position();await this.show(sample,generation,force);
  }
  async play(){
    this.assertAvailable();const tour=this.bank();if(!tour.events.length)throw new Error('Add an event before playing the tour.');
    this.pause();this.context.stopOther?.();if(this.time>=this.total(tour))this.time=0;
    this.sequence=tour;this.origin=performance.now()-this.time*1000;this.playing=true;const generation=this.generation;this.nodes.play.textContent='Pause';
    try{if(tour.version===2)await this.showAnimated(this.time,generation);else await this.show(evaluateTour(tour,this.time),generation,true);}catch(error){this.pause();throw error;}
    if(this.playing&&generation===this.generation)this.raf=requestAnimationFrame(this.frame);
  }
  async tick(now){
    if(!this.playing)return;const generation=this.generation;
    if(this.sequence.version===2){
      try{const renderer=this.ensureRenderer(),sample=evaluateAnimatedTour(renderer.timeline,(now-this.origin)/1000);await this.showAnimated(sample.time,generation);
        if(generation!==this.generation||!this.playing)return;if(sample.ended){this.pause();this.sync();}else this.raf=requestAnimationFrame(this.frame);return;
      }catch(error){this.pause();throw error;}
    }
    const sample=evaluateTour(this.sequence,(now-this.origin)/1000,{loop:this.nodes.loop.checked});this.time=sample.time;this.position();
    try{await this.show(sample,generation);}catch(error){this.pause();throw error;}
    if(generation!==this.generation||!this.playing)return;
    if(sample.ended){this.pause();this.sync();}else this.raf=requestAnimationFrame(this.frame);
  }
  onKey(event){
    if(event.defaultPrevented||event.repeat||event.metaKey||!event.ctrlKey||!event.altKey||event.shiftKey||this.busy||this.showing||this.context.isExporting?.()||event.getModifierState?.('AltGraph'))return;
    if(event.target?.isContentEditable||event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')||document.querySelector('dialog[open]'))return;
    const action={ArrowLeft:'prev',ArrowRight:'next',' ':'play',t:'add',T:'add'}[event.key];if(!action)return;event.preventDefault();this.actions[action]();
  }
  cancelNumeric(){this.numericEntry?.cancel();}
  cancel(){this.cancelNumeric();this.pause();this.exporter?.cancel();}
  destroy(){this.numericEntry?.destroy();this.pause();this.retireRenderer();document.removeEventListener('keydown',this.keyHandler);this.details.remove();}
}
