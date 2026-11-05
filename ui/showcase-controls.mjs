import gallery from './welcome-gallery.json';
import {NumericEntry} from './numeric-entry.mjs';
import {createStatus} from './status.mjs';
import {buildPresentationPlaylist,PresentationPlayback} from './presentation.mjs';
import {holdPresentationLayout} from './presentation-layout.mjs';
import {PresentationRenderer} from './presentation-renderer.mjs';
import {AnimatedTourRenderer} from './animated-tour-renderer.mjs';
import {createAnimatedTourLayerFactory} from './animated-tour-layer.mjs';
import {AnimatedTourExporter} from './animated-tour-export.mjs';
import {mediaControls,readMediaControls} from './media-export-options.mjs';
import './presentation.css';

const cancelled=()=>Object.assign(Error('Presentation cancelled.'),{name:'AbortError'});
export class ShowcaseControls{
  constructor(context){
    this.context=context;this.busy=false;this.active=false;
    this.details=document.createElement('details');this.details.id='presentation-settings';this.details.className='workspace-disclosure';this.details.setAttribute('name','viewport-tools');
    this.details.innerHTML=`<summary>Presentation</summary><div class="settings-body">
      <label>Playlist <select id="presentation-source"><option value="current">Current model</option><option value="tour">Current tour</option><option value="gallery">Featured gallery</option><option value="library">Library family / search results</option></select></label>
      <label>Seconds per slide <input id="presentation-duration" type="text" maxlength="512" value="8"></label>
      <label>Transition seconds <input id="presentation-transition" type="text" maxlength="512" value="0.8"></label>
      <label><input id="presentation-loop" type="checkbox" checked> Repeat playlist</label>
      <label><input id="presentation-captions" type="checkbox" checked> Captions</label>
      <button id="presentation-start">Start presentation (F5)</button>
      <p class="muted">Esc exits · ← / → slides · Space pauses · C captions. Tours keep their saved durations and animations. Native dual pairs morph; other slides cross-fade. Library playlists use all filtered results (maximum 100).</p>
      <details><summary>Record presentation</summary>${mediaControls('presentation')}
      <label>FPS <input id="presentation-fps" type="text" maxlength="512" value="24"></label>
      <button id="presentation-record">Record presentation</button><p class="muted">Records one pass with captions at exact frame times. Maximum 300 seconds including transitions. Export preferences are temporary.</p></details></div>`;
    document.querySelector('.workspace-shelf').append(this.details);
    const button=document.createElement('button');button.id='presentation';button.textContent='Presentation';button.title='Presentation (F5)';button.onclick=context.guard(()=>this.enter());document.querySelector('.workspace-actions').prepend(button);
    this.nodes=Object.fromEntries([...this.details.querySelectorAll('[id]')].map(n=>[n.id.replace('presentation-',''),n]));
    this.nodes.source.onchange=()=>{this.nodes.duration.disabled=this.nodes.source.value==='tour';};
    this.root=document.createElement('section');this.root.id='presentation-showcase';this.root.hidden=true;this.root.tabIndex=-1;this.root.setAttribute('aria-label','Presentation');
    this.root.innerHTML='<canvas id="presentation-canvas" aria-label="Rotating polytope presentation"></canvas><p id="presentation-status" role="status"></p><div class="presentation-hud"><button id="presentation-prev" aria-label="Previous slide">←</button><button id="presentation-pause">Pause</button><button id="presentation-next" aria-label="Next slide">→</button><button id="presentation-toggle-captions" aria-pressed="true">Captions</button><button id="presentation-exit">Exit (Esc)</button></div>';
    this.root.addEventListener('pointermove',()=>this.showHud());
    for(const type of ['pointerdown','click'])this.root.addEventListener(type,event=>event.stopPropagation());
    document.body.append(this.root);this.canvas=this.root.querySelector('canvas');this.status=this.root.querySelector('#presentation-status');
    const bind=(id,fn)=>this.root.querySelector('#presentation-'+id).onclick=context.guard(fn);
    bind('prev',()=>this.navigate(-1));bind('next',()=>this.navigate(1));bind('pause',()=>this.pause());bind('toggle-captions',()=>this.toggleCaptions());bind('exit',()=>this.exit());
    this.nodes.start.onclick=context.guard(()=>this.enter());this.nodes.record.onclick=context.guard(()=>this.enter({record:true}));
    this.key=event=>this.onKey(event);document.addEventListener('keydown',this.key,true);
  }
  inputs(){return Object.fromEntries(['source','duration','transition','fps','loop','captions'].map(k=>[k,['loop','captions'].includes(k)?this.nodes[k].checked:this.nodes[k].value]));}
  async enter({record=false}={}){
    if(this.busy){if(this.active&&!this.exporter)return this.exit();return;}
    const c=this.context;
    if(c.isExporting())throw Error('Finish export before starting a presentation.');
    if(!c.getState())throw Error('Choose a model before starting a presentation.');
    if(document.querySelector?.('dialog[open]'))throw Error('Close the open dialog before starting a presentation.');
    if((await c.api.startupInfo?.())?.hidden)return;
    // Recheck after startup IPC; rapid F5 presses must not create two owners.
    if(this.busy)return;
    c.assertAvailable();this.busy=true;const controller=this.controller=new AbortController(),signal=controller.signal;
    let releasePlayback;
    try{
      releasePlayback=c.suspend();this.releasePlayback=releasePlayback;
      this.restoreLayout=holdPresentationLayout(document,this.root);this.root.focus();
      this.preparationStatus??=createStatus(text=>{this.status.textContent=text;});this.preparationStatus.set('');
      this.preparationProgress=this.preparationStatus.defer('Preparing presentation… Esc cancels.');
      const input=this.inputs(),project=c.getProject(),sourceState=c.getState(),documentOwner=c.getDocument(),sourceTour=project.tour;
      const check=()=>{if(signal.aborted||c.getProject()!==project||c.getState()!==sourceState||c.getDocument()!==documentOwner||project.tour!==sourceTour)throw cancelled();};
      const entry=this.numeric=new NumericEntry({...c,getTarget:()=>this.inputs()});
      const values=await entry.run({...input.source==='tour'?{}:{duration:{text:input.duration,min:0,exclusiveMin:true,max:300}},transitionDuration:{text:input.transition,min:0,exclusiveMin:true,max:10},...(record?{fps:{text:input.fps,min:1,max:60,integer:true}}:{})},(values,verify)=>{verify();check();return values;},{signal});
      check();this.numeric=null;c.lock(true);this.locked=true;check();
      const entries=input.source==='gallery'?gallery:input.source==='library'?c.libraryEntries():[];
      this.playlist=await buildPresentationPlaylist({source:input.source,state:sourceState,tour:sourceTour,entries,read:c.read,viewForModel:c.viewForModel,...values,signal,check});check();
      this.nativeRequest=c.api.presentationWindow(true);const entered=await this.nativeRequest;this.nativeEntered=entered;check();
      if(!entered)throw Error('Presentation fullscreen is unavailable in this window.');
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));check();
      const bounds=this.root.getBoundingClientRect(),scale=Math.min(1,4096/bounds.width,4096/bounds.height);
      this.canvas.width=Math.max(1,Math.floor(bounds.width*scale));this.canvas.height=Math.max(1,Math.floor(bounds.height*scale));
      this.host=document.createElement('div');this.host.style.position='fixed';document.body.append(this.host);this.host.inert=true;this.host.setAttribute('aria-hidden','true');
      this.getOwner=()=>({project:c.getProject(),tour:c.getProject().tour,sourceState:c.getState(),document:c.getDocument()});
      this.captions=input.captions;
      let liveTour=this.playlist.tour;
      if(input.source==='current'&&input.loop){const event=liveTour.events[0];liveTour={...liveTour,events:[{...event,duration:event.state.view.animation.duration}]};}
      this.playback=new PresentationPlayback(liveTour,{loop:input.loop});
      this.renderer=this.createRenderer(liveTour,this.canvas,input.loop);this.active=true;await this.renderer.apply(0,{signal});check();
      this.preparationStatus.settle(this.preparationProgress);this.status.textContent='';this.syncHud();this.showHud();
      if(record){this.recording=this.record(values.fps,signal);await this.recording;this.recording=null;check();}
      else{this.playback.play();this.schedule();}
    }catch(error){if(this.controller===controller)await this.exit();throw error;}
  }
  createRenderer(tour,canvas,loop=false){
    return new PresentationRenderer(new AnimatedTourRenderer({tour,loop,canvas,getOwner:this.getOwner,createLayer:createAnimatedTourLayerFactory({host:this.host,run:this.context.run}),onDiagnostic:message=>this.status.textContent=message}),this.playlist.captions,{visible:()=>this.captions});
  }
  async record(fps,signal){
    const canvas=document.createElement('canvas');canvas.width=this.canvas.width;canvas.height=this.canvas.height;
    const seed=this.createRenderer(this.playlist.tour,canvas),options=readMediaControls(this.nodes);
    const exporter=this.exporter=new AnimatedTourExporter({renderer:seed,api:this.context.api,onProgress:p=>{this.status.textContent=`Recording ${options.format}: ${p.index??p.progress} / ${p.frameCount} · Esc cancels`;},onDiagnostic:message=>this.status.textContent=message});
    const cancel=()=>exporter.cancel();signal.addEventListener('abort',cancel,{once:true});this.syncHud();
    try{const result=await exporter.export(options.format,{...options,fps,name:'Polytope presentation'});this.status.textContent=result?'Presentation saved: '+(result.path??result.directory??''):'Recording cancelled.';}
    finally{signal.removeEventListener('abort',cancel);await seed.close();if(this.exporter===exporter)this.exporter=null;this.syncHud();}
  }
  syncHud(){
    const paused=!this.playback?.playing;
    this.root.querySelector('#presentation-pause').textContent=paused?'Play':'Pause';
    this.root.querySelector('#presentation-toggle-captions').setAttribute('aria-pressed',String(!!this.captions));
    for(const id of ['prev','next','pause','toggle-captions'])this.root.querySelector('#presentation-'+id).disabled=!this.active||!!this.exporter;
  }
  showHud(){this.root.dataset.controls='visible';clearTimeout(this.hudTimer);this.hudTimer=setTimeout(()=>{delete this.root.dataset.controls;},2400);}
  schedule(){if(this.raf||!this.active||!this.playback.playing||this.exporter)return;this.raf=requestAnimationFrame(()=>{this.raf=null;this.render();});}
  async render(){
    if(this.rendering){this.pending=true;return;}
    if(!this.active||this.exporter)return;
    const renderer=this.renderer,signal=this.controller.signal;this.rendering=true;
    try{
      do{this.pending=false;const sample=this.playback.sample();await renderer.apply(sample.time,{signal});if(signal.aborted||renderer!==this.renderer)return;const caption=this.playlist.captions[sample.index];if(caption)this.canvas.setAttribute('aria-label',[caption.title,caption.description,caption.facts].join('. '));}while(this.pending);
      this.syncHud();this.schedule();
    }catch(error){if(!signal.aborted){await this.exit();this.context.setStatus(error.message);}}
    finally{this.rendering=false;}
  }
  navigate(delta){if(!this.active||this.exporter)return;this.playback.step(delta);this.render();}
  pause(){if(!this.active||this.exporter)return;this.playback.toggle();this.syncHud();this.render();}
  toggleCaptions(){if(!this.active||this.exporter)return;this.captions=!this.captions;this.syncHud();this.render();}
  onKey(event){
    if(!this.busy){
      if(event.key==='F5'&&!event.repeat&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!event.shiftKey&&!event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')&&!document.querySelector('dialog[open]')){event.preventDefault();this.context.guard(()=>this.enter())();}
      return;
    }
    // Own keys before workspace shortcuts can alter hidden documents or layouts.
    event.stopImmediatePropagation();event.preventDefault();
    if(event.repeat)return;
    this.showHud();
    if(event.key==='Escape'||event.key==='F5'){this.context.guard(()=>this.exit())();return;}
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.key==='ArrowLeft')this.navigate(-1);else if(event.key==='ArrowRight')this.navigate(1);else if(event.code==='Space'||event.key===' ')this.pause();else if(event.key.toLowerCase()==='c')this.toggleCaptions();
    else if(event.key==='Tab'){const buttons=[...this.root.querySelectorAll('button')].filter(n=>!n.disabled),index=buttons.indexOf(document.activeElement);buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();}
  }
  async exit(){
    if(this.exiting)return this.exiting;
    if(!this.busy)return;
    this.exiting=this.finishExit();try{await this.exiting;}finally{this.exiting=null;}
  }
  async finishExit(){
    this.preparationStatus?.settle(this.preparationProgress);
    this.active=false;this.controller?.abort();this.numeric?.cancel();this.exporter?.cancel();this.playback?.pause();cancelAnimationFrame(this.raf);this.raf=null;clearTimeout(this.hudTimer);
    const renderer=this.renderer;this.renderer=null;
    try{await this.recording?.catch(()=>{});await renderer?.close();}
    finally{
      try{const entered=this.nativeRequest?await this.nativeRequest.catch(()=>false):this.nativeEntered;if(entered)await this.context.api.presentationWindow(false);}
      finally{
        this.nativeEntered=false;this.nativeRequest=null;this.recording=null;this.host?.remove();this.host=null;this.restoreLayout?.();this.restoreLayout=null;
        if(this.locked){this.locked=false;this.context.lock(false);}
        this.releasePlayback?.();this.releasePlayback=null;this.busy=false;
      }
    }
  }
}
