import {DualMorphSession,MORPH_INVENTORY,morphEligible} from './dual-morph-session.mjs';
import {NumericEntry} from './numeric-entry.mjs';
export class DualMorphControls extends DualMorphSession{
  constructor(context,{mount=true}={}){
    super(context);if(!mount)return;
    const panel=document.createElement('details');panel.id='dual-morph-settings';
    panel.innerHTML='<summary>Dual morph</summary><label>Method <select id="dual-morph-method"></select></label><label>Center <input id="dual-morph-center" maxlength="2200" placeholder="Source vertex mean"></label><label>Radius <input id="dual-morph-radius" maxlength="512" value="1"></label><label>Ratio <input id="dual-morph-ratio" maxlength="512" value="0"></label><label>Seconds <input id="dual-morph-duration" maxlength="512" value="5"></label><label><input id="dual-morph-loop" type="checkbox">Loop</label><div><button id="dual-morph-apply">Apply</button><button id="dual-morph-play">Play</button><button id="dual-morph-pause">Pause</button><button id="dual-morph-reset">Reset</button></div><input id="dual-morph-scrub" aria-label="Morph ratio" type="range" min="0" max="1" step="0.001" value="0"><output id="dual-morph-result"></output>';
    document.getElementById('animation-settings').after(panel);this.panel=panel;
    const select=panel.querySelector('select');for(const method of MORPH_INVENTORY){const option=document.createElement('option');option.value=method;option.textContent=method.replaceAll('-',' ')+(method==='via-snub'?' (unverified resource)':'');select.append(option);}
    const guarded=fn=>context.guard?context.guard(fn):fn;
    panel.querySelector('#dual-morph-apply').onclick=guarded(()=>this.applyInputs());
    panel.querySelector('#dual-morph-play').onclick=guarded(()=>this.play());panel.querySelector('#dual-morph-pause').onclick=()=>this.pause();panel.querySelector('#dual-morph-reset').onclick=guarded(()=>this.reset());
    panel.querySelector('#dual-morph-scrub').oninput=guarded(()=>this.seek(Number(panel.querySelector('#dual-morph-scrub').value)));
    this.sync();
  }
  read(){const get=id=>this.panel.querySelector('#dual-morph-'+id);return {method:get('method').value,center:get('center').value,radius:get('radius').value,ratio:get('ratio').value,duration:get('duration').value,loop:get('loop').checked};}
  async applyInputs(){
    this.blocked();if(this.configuration||this.numericEntry)throw Error('Finish the current morph preparation first.');
    const input=this.read(),dimension=this.context.getState()?.model.embeddingDimension??this.context.getState()?.model.dimension;
    const fields={radius:{text:input.radius,exclusiveMin:true,min:0},ratio:{text:input.ratio,min:0,max:1},duration:{text:input.duration,exclusiveMin:true,min:0,max:3600}};
    if(input.center.trim())fields.center={kind:'vector',text:input.center,length:dimension};
    const entry=new NumericEntry({...this.context,getTarget:()=>this.read()});this.numericEntry=entry;this.sync();
    try{return await entry.run(fields,(values,verify,{signal})=>this.configure({version:1,enabled:true,method:input.method,center:values.center??null,radius:values.radius,ratio:values.ratio,duration:values.duration,loop:input.loop},{signal,verifyPublication:verify}));}
    finally{if(this.numericEntry===entry)this.numericEntry=null;this.sync();}
  }
  cancelNumeric(){this.numericEntry?.cancel();}
  sync(){
    if(this.owner&&!this.context.isExporting?.()){try{this.checked();}catch{this.invalidate();}}
    if(this.context.isExporting?.()){if(this.playing)this.pause();this.configuration?.abort();this.active?.controller.abort();}
    if(!this.panel)return;
    const source=this.context.getState(),saved=source?.view.dualMorph,blocked=Boolean(this.context.isExporting?.()),busy=Boolean(this.configuration||this.numericEntry);
    for(const option of this.panel.querySelector('select').options)option.disabled=!morphEligible(source?.model,option.value);
    for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=blocked||busy;
    this.panel.querySelector('#dual-morph-play').disabled=blocked||busy||!this.prepared||this.playing;
    this.panel.querySelector('#dual-morph-pause').disabled=!this.playing;
    this.panel.querySelector('#dual-morph-reset').disabled=blocked||busy||!this.prepared;
    this.panel.querySelector('#dual-morph-scrub').disabled=blocked||busy||!this.prepared;
    this.panel.querySelector('#dual-morph-result').textContent=saved?.enabled?`${saved.method} · ${Number(saved.ratio).toFixed(3)} · approximate`:'Source geometry';
    const set=(id,value)=>{const node=this.panel.querySelector('#dual-morph-'+id);if(document.activeElement!==node&&!busy)node.value=value;};
    if(saved){set('method',saved.method);set('center',saved.center?.join(', ')??'');set('radius',saved.radius);set('ratio',saved.ratio);set('duration',saved.duration);set('scrub',saved.ratio);if(document.activeElement!==this.panel.querySelector('#dual-morph-loop'))this.panel.querySelector('#dual-morph-loop').checked=saved.loop;}
  }
}
