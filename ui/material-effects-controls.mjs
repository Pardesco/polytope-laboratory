// SPDX-License-Identifier: GPL-3.0-only
import {NumericEntry} from './numeric-entry.mjs';
import {effectsOptions} from './effects-config.mjs';
export class MaterialEffectsControls{
  constructor(context){
    this.context=context;this.entry=null;this.busy=false;
    const panel=document.createElement('details');panel.id='material-effects-settings';
    panel.innerHTML='<summary>Bump and environment</summary><label>Procedural bump <select id="effects-bump"><option value="none">Off</option><option value="waves">Waves</option><option value="pebbles">Pebbles</option></select></label><label>Bump height · normalized display units <input id="effects-bumpStrength" type="text" maxlength="512"></label><label>Repeats per normalized display unit <input id="effects-bumpFrequency" type="text" maxlength="512"></label><label>Environment <select id="effects-reflection"><option value="none">Off</option><option value="studio">Built-in studio</option></select></label><label>Environment mode <select id="effects-environmentMode"><option value="reflection">Reflection</option><option value="refraction">Environment-only refraction</option></select></label><label>Refractive index · 1..3 <input id="effects-refractiveIndex" type="text" maxlength="512"></label><label>Environment blend · 0..1 <input id="effects-reflectivity" type="text" maxlength="512"></label><p>Bump follows displayed 3D object coordinates. Reflection and refraction sample a fixed studio. Refraction does not trace rays through the object.</p><div class="button-row"><button id="effects-apply">Apply effects</button><button id="effects-reset">Turn off</button><button id="effects-cancel">Cancel edit</button></div><output id="effects-status" aria-live="polite"></output>';
    (context.mount??(p=>document.getElementById('material-lighting-settings').after(p)))(panel);this.panel=panel;
    this.node('apply').onclick=context.guard(()=>this.apply());this.node('reset').onclick=context.guard(()=>this.reset());
    this.node('cancel').onclick=context.guard(()=>this.cancelNumeric());
    for(const key of ['reflection','environmentMode'])this.node(key).onchange=context.guard(()=>this.syncOpticsInputs());
    this.sync();
  }
  node(key){return this.panel.querySelector('#effects-'+key);}
  read(){return Object.fromEntries(['bump','reflection','bumpStrength','bumpFrequency','reflectivity','environmentMode','refractiveIndex'].map(k=>[k,this.node(k).value]));}
  requireEditable(){if(this.busy||this.context.isExporting())throw Error('Finish or cancel the current edit/export before material effects.');}
  reset(){this.requireEditable();this.context.getState().view.materialEffects=effectsOptions();this.context.display();this.context.markDirty();this.sync();}
  async apply(){
    this.requireEditable();const raw=this.read();effectsOptions({bump:raw.bump,reflection:raw.reflection,environmentMode:raw.environmentMode});
    const entry=new NumericEntry({...this.context,getTarget:()=>({form:this.read(),effects:this.context.getState()?.view.materialEffects??null})});
    this.entry=entry;this.busy=true;this.sync();
    try{return await entry.run({bumpStrength:{text:raw.bumpStrength,min:0,max:.1},bumpFrequency:{text:raw.bumpFrequency,min:1,max:32},reflectivity:{text:raw.reflectivity,min:0,max:1},refractiveIndex:{text:raw.refractiveIndex,min:1,max:3}},(values,verify)=>{
      const settings=effectsOptions({version:1,...values,bump:raw.bump,reflection:raw.reflection,environmentMode:raw.environmentMode});verify();
      this.context.getState().view.materialEffects=settings;this.context.display();this.context.markDirty();
      this.node('status').textContent='Applied material effects. Captures wait for environment decoding.';
    });}finally{if(this.entry===entry)this.entry=null;this.busy=false;this.sync();}
  }
  cancelNumeric(){this.entry?.cancel();}
  syncOpticsInputs(){this.node('refractiveIndex').disabled=this.busy||this.context.isExporting()||this.node('reflection').value==='none'||this.node('environmentMode').value!=='refraction';}
  sync(){
    const state=this.context.getState();if(!state)return;
    const options=effectsOptions(state.view.materialEffects),disabled=this.busy||this.context.isExporting();
    for(const k of ['bump','reflection','bumpStrength','bumpFrequency','reflectivity','environmentMode','refractiveIndex']){
      const node=this.node(k);if(!this.busy&&document.activeElement!==node)node.value=String(options[k]);node.disabled=disabled;
    }
    this.syncOpticsInputs();
    this.node('apply').disabled=disabled;this.node('reset').disabled=disabled;this.node('cancel').disabled=!this.busy;
  }
}
