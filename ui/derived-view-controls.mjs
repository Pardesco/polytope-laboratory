const MODES=new Set(['section','cell-section','dual','incidence-dual','vertex-figure','cell','face','net','cell-net','stellation','section-evidence']);
const sectionMode=mode=>mode==='section'||mode==='cell-section';
/** Only the latest derived request may keep native work alive. Parent signals
 * belong to animation/export callers and must never be aborted by this owner. */
export class DerivedWork {
  cancel(){const active=this.active;this.active=null;if(active){active.detach();active.controller.abort();}}
  begin(parent){
    this.cancel();
    const controller=new AbortController(),abort=()=>controller.abort();
    const job={controller,signal:controller.signal,detach:()=>parent?.removeEventListener('abort',abort)};
    parent?.addEventListener('abort',abort,{once:true});if(parent?.aborted)abort();
    this.active=job;return job;
  }
  finish(job){job.detach();if(this.active===job)this.active=null;}
}
export function derivedEntityDomain(model,mode){
  const kind=mode==='vertex-figure'?'vertex':mode==='face'||mode==='cell'&&model.dimension!==4?'face':mode==='cell'?'cell':null;
  return kind?{kind,count:model[{vertex:'vertices',face:'faces',cell:'cells'}[kind]]?.length??0}:null;
}
export function derivedEntityIndex(text,count){
  const value=typeof text==='string'?text.trim():'',index=Number(value);
  if(!Number.isSafeInteger(count)||count<1)throw Error('This source has no available entities for this view.');
  if(!/^\d+$/.test(value)||!Number.isSafeInteger(index)||index>=count)throw Error(`Choose a literal source index from 0 to ${count-1}.`);
  return index;
}
/** Bind native derived results to the parameters that actually produced them. */
export function derivedInputKey(view){
  return JSON.stringify([view.derivedMode,...sectionMode(view.derivedMode)?[view.sectionNormal,view.sectionOffset,view.fillRule||'nonzero',view.densitySection??null]:
    ['vertex-figure','cell','face'].includes(view.derivedMode)?[view.entity??0,...view.derivedMode==='vertex-figure'?[view.vertexFigureMode||'slicing',view.vertexFigurePlacement||'midpoint']:[]]:[]]);
}
export class DerivedViewControls{
  constructor(context){
    this.context=context;this.$=context.getInput;this.generation=0;
    const wrap=context.guard;
    this.$('derived-mode').onchange=wrap(()=>this.setMode(this.$('derived-mode').value));
    this.$('entity-id').onchange=wrap(()=>this.setEntity(this.$('entity-id').value));
    this.$('section-offset').oninput=wrap(()=>this.setOffset(this.$('section-offset').value));
    this.$('apply-section').onclick=wrap(()=>this.apply(false));this.$('section-events').onclick=wrap(()=>this.apply(true));
    this.$('promote').onclick=wrap(()=>this.promote());
    for(const [id,field,options] of [['vertex-figure-mode','vertexFigureMode',['slicing','combinatorial']],['vertex-figure-placement','vertexFigurePlacement',['midpoint','unit-distance']]]){
      const node=this.$(id);if(node)node.onchange=wrap(()=>this.setFigureOption(id,field,options));
    }
  }
  cancel(){this.generation++;clearTimeout(this.timer);this.timer=null;this.live=null;this.context.onActivityChange?.();}
  cancelEvaluation(){
    this.cancel();const pending=this.pending;this.pending=null;
    if(pending)this.context.cancelPlane?.();
    this.sync();this.context.onAvailabilityChange?.();this.context.onActivityChange?.();
  }
  restoreInputs(){
    const v=this.context.getState()?.view;if(!v)return;
    for(const [id,value] of [['derived-mode',v.derivedMode],['section-normal',v.sectionNormal?.join(', ')??''],['section-depth',v.sectionOffset??0],['section-offset',v.sectionOffset??0],['entity-id',v.entity??0]])this.$(id).value=String(value);
    for(const [id,value] of [['vertex-figure-mode',v.vertexFigureMode||'slicing'],['vertex-figure-placement',v.vertexFigurePlacement||'midpoint']]){const node=this.$(id);if(node)node.value=value;}
  }
  editable(){
    if(this.context.isExporting?.()){this.restoreInputs();throw Error('Finish animation export before changing the derived view.');}
    const state=this.context.getState();if(!state?.model)throw Error('Choose a source model first.');
    if(this.pending){this.$('derived-mode').value=state.view.derivedMode;this.$('entity-id').value=String(state.view.entity??0);this.$('section-offset').value=String(state.view.sectionOffset);throw Error('Finish the current plane evaluation first.');}return state;
  }
  changed(){this.context.invalidate();this.context.markDirty();this.sync();this.context.syncViewport?.();}
  setMode(mode){
    const s=this.editable();if(!MODES.has(mode)){this.$('derived-mode').value=s.view.derivedMode;throw Error('Choose an available derived view.');}
    this.cancel();s.view.derivedMode=mode;
    const domain=derivedEntityDomain(s.model,mode);if(domain&&(!Number.isSafeInteger(s.view.entity)||s.view.entity<0||s.view.entity>=domain.count))s.view.entity=0;
    this.$('entity-id').value=String(s.view.entity??0);this.changed();return this.context.refreshDerived();
  }
  setEntity(text){
    const s=this.editable(),domain=derivedEntityDomain(s.model,s.view.derivedMode);let index;
    try{if(!domain)throw Error('Choose a cell, face or vertex-figure view to select a source index.');index=derivedEntityIndex(text,domain.count);}
    catch(error){this.$('entity-id').value=String(s.view.entity??0);throw error;}
    this.cancel();s.view.entity=index;this.changed();return this.context.refreshDerived();
  }
  setFigureOption(id,field,options){
    const s=this.editable(),value=this.$(id).value;
    if(!options.includes(value))throw Error('Choose a supported vertex-figure option.');
    this.cancel();s.view[field]=value;this.changed();return this.context.refreshDerived();
  }
  setOffset(text){
    const s=this.editable(),value=typeof text==='string'?text.trim():'',offset=Number(value);
    if(!sectionMode(s.view.derivedMode)||!value||!Number.isFinite(offset)||Math.abs(offset)>1e100){this.$('section-offset').value=String(this.live?.offset??s.view.sectionOffset);throw Error('Choose a finite depth for a section view.');}
    this.$('section-depth').value=String(offset);
    // Live dragging: while one plane evaluates, only remember the newest depth.
    // Each depth is committed when the previous evaluation finishes, so results
    // are never cancelled mid-flight or discarded as stale while the slider moves.
    const live=this.live;
    if(live&&live.state===s&&live.model===s.model&&live.generation===this.generation){live.offset=offset;return;}
    this.cancel();
    const next={state:s,model:s.model,offset,generation:this.generation,document:this.context.getDocument?.(),project:this.context.getProject?.()};this.live=next;
    const owned=()=>this.live===next&&next.generation===this.generation&&!this.pending&&!this.context.isExporting?.()&&this.context.getState()===s&&s.model===next.model&&this.context.getDocument?.()===next.document&&this.context.getProject?.()===next.project&&sectionMode(s.view.derivedMode);
    next.promise=(async()=>{
      try{
        let committed;
        while(owned()&&next.offset!==committed){
          committed=next.offset;s.view.sectionOffset=committed;delete s.view.sectionAlignment;this.changed();
          await this.context.refreshDerived();
        }
      }finally{if(this.live===next)this.live=null;this.context.onActivityChange?.();}
    })();
    this.context.onActivityChange?.();
    return next.promise;
  }
  apply(next){
    this.editable();this.cancel();
    const job={state:this.context.getState()};this.pending=job;this.sync();this.context.onActivityChange?.();this.context.onAvailabilityChange?.();
    const finish=()=>{if(this.pending===job){this.pending=null;this.sync();this.context.onActivityChange?.();this.context.onAvailabilityChange?.();}};
    try{return Promise.resolve(this.context.applyPlane(next)).finally(finish);}catch(error){finish();throw error;}
  }
  promote(){this.editable();if(!this.context.getDerived())throw Error('Evaluate a current derived result before promoting it.');this.cancel();return this.context.promote();}
  onExportStateChange(){
    const exporting=Boolean(this.context.isExporting?.()),state=this.context.getState();
    if(exporting&&!this.exporting&&state)this.exportDraft={state,model:state.model,key:derivedInputKey(state.view),unit:state.view.coordinateUnit,
      normal:this.$('section-normal').value,depth:this.$('section-depth').value};
    this.cancel();if(exporting&&this.pending)this.context.cancelPlane?.();this.restoreInputs();
    const draft=this.exportDraft;
    if(!exporting&&this.exporting){
      if(draft&&state&&draft.state===state&&draft.model===state.model&&draft.key===derivedInputKey(state.view)&&draft.unit===state.view.coordinateUnit){this.$('section-normal').value=draft.normal;this.$('section-depth').value=draft.depth;}
      this.exportDraft=null;
    }
    this.exporting=exporting;this.sync();
  }
  sync(){
    this.context.syncDensity?.();
    const s=this.context.getState();if(s!==this.source){this.cancel();if(this.pending&&this.pending.state!==s)this.context.cancelPlane?.();this.source=s;}
    const blocked=!s||Boolean(this.context.isExporting?.())||Boolean(this.pending),mode=s?.view.derivedMode,domain=s&&derivedEntityDomain(s.model,mode);
    const figureOptions=this.$('vertex-figure-options');if(figureOptions)figureOptions.hidden=mode!=='vertex-figure';
    for(const [id,field,fallback] of [['vertex-figure-mode','vertexFigureMode','slicing'],['vertex-figure-placement','vertexFigurePlacement','midpoint']]){
      const node=this.$(id);if(node){node.value=s?.view[field]||fallback;node.disabled=blocked||mode!=='vertex-figure'||id==='vertex-figure-placement'&&(s?.view.vertexFigureMode||'slicing')!=='combinatorial';}
    }
    for(const id of ['derived-mode','section-normal','section-depth','section-offset','apply-section','section-events'])this.$(id).disabled=blocked;
    this.$('entity-id').disabled=blocked||!domain?.count;this.$('entity-id').max=String(Math.max(0,(domain?.count??1)-1));this.$('entity-id').ariaLabel=domain?'Source '+domain.kind+' index':'Derived source entity index';
    this.$('promote').disabled=blocked||!this.context.getDerived();
    const label=this.$('derived-entity-label');if(label)label.textContent=domain?domain.kind[0].toUpperCase()+domain.kind.slice(1)+' index':'Source index';
    const note=this.$('derived-input-note');if(note)note.textContent=sectionMode(mode)?'Plane depth uses intrinsic source coordinates. Next vertex wraps to the first level.':domain?domain.count?`Source ${domain.kind} indices: 0 to ${domain.count-1}.`:`This source has no ${domain.kind} indices.`:'';
    if(note&&mode==='section'&&s?.view.densitySection?.enabled)note.textContent='Filled density requires an off-vertex plane. Move depth away from vertex levels; Next vertex may refuse contacts.';
    if(this.pending&&note)note.textContent='Evaluating the plane. Promotion and derived export will be available when it finishes.';
  }
}
