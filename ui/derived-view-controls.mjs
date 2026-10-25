const MODES=new Set(['section','cell-section','dual','incidence-dual','vertex-figure','cell','face','net','cell-net','stellation','section-evidence']);
const sectionMode=mode=>mode==='section'||mode==='cell-section';
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
  return JSON.stringify([view.derivedMode,...sectionMode(view.derivedMode)?[view.sectionNormal,view.sectionOffset,view.fillRule||'nonzero']:
    ['vertex-figure','cell','face'].includes(view.derivedMode)?[view.entity??0]:[]]);
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
  }
  cancel(){this.generation++;clearTimeout(this.timer);this.timer=null;}
  restoreInputs(){
    const v=this.context.getState()?.view;if(!v)return;
    for(const [id,value] of [['derived-mode',v.derivedMode],['section-normal',v.sectionNormal?.join(', ')??''],['section-depth',v.sectionOffset??0],['section-offset',v.sectionOffset??0],['entity-id',v.entity??0]])this.$(id).value=String(value);
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
  setOffset(text){
    const s=this.editable(),value=typeof text==='string'?text.trim():'',offset=Number(value);
    if(!sectionMode(s.view.derivedMode)||!value||!Number.isFinite(offset)||Math.abs(offset)>1e100){this.$('section-offset').value=String(s.view.sectionOffset);throw Error('Choose a finite depth for a section view.');}
    this.cancel();s.view.sectionOffset=offset;delete s.view.sectionAlignment;this.$('section-depth').value=String(offset);this.changed();
    const generation=this.generation,model=s.model,document=this.context.getDocument?.(),project=this.context.getProject?.(),key=derivedInputKey(s.view);
    this.timer=setTimeout(this.context.guard(async()=>{
      this.timer=null;if(generation!==this.generation||this.context.isExporting?.()||this.context.getState()!==s||s.model!==model||this.context.getDocument?.()!==document||this.context.getProject?.()!==project||derivedInputKey(s.view)!==key)return;
      await this.context.refreshDerived();
    }),200);
  }
  apply(next){
    this.editable();this.cancel();
    const job={state:this.context.getState()};this.pending=job;this.sync();this.context.onAvailabilityChange?.();
    const finish=()=>{if(this.pending===job){this.pending=null;this.sync();this.context.onAvailabilityChange?.();}};
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
    const s=this.context.getState();if(s!==this.source){this.cancel();if(this.pending&&this.pending.state!==s)this.context.cancelPlane?.();this.source=s;}
    const blocked=!s||Boolean(this.context.isExporting?.())||Boolean(this.pending),mode=s?.view.derivedMode,domain=s&&derivedEntityDomain(s.model,mode);
    for(const id of ['derived-mode','section-normal','section-depth','section-offset','apply-section','section-events'])this.$(id).disabled=blocked;
    this.$('entity-id').disabled=blocked||!domain?.count;this.$('entity-id').max=String(Math.max(0,(domain?.count??1)-1));this.$('entity-id').ariaLabel=domain?'Source '+domain.kind+' index':'Derived source entity index';
    this.$('promote').disabled=blocked||!this.context.getDerived();
    const label=this.$('derived-entity-label');if(label)label.textContent=domain?domain.kind[0].toUpperCase()+domain.kind.slice(1)+' index':'Source index';
    const note=this.$('derived-input-note');if(note)note.textContent=sectionMode(mode)?'Plane depth uses intrinsic source coordinates. Next vertex wraps to the first level.':domain?domain.count?`Source ${domain.kind} indices: 0 to ${domain.count-1}.`:`This source has no ${domain.kind} indices.`:'';
    if(this.pending&&note)note.textContent='Evaluating the plane. Promotion and derived export will be available when it finishes.';
  }
}
