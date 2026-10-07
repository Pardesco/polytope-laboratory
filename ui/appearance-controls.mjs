// SPDX-License-Identifier: GPL-3.0-only
import {NumericEntry} from './numeric-entry.mjs';
import {appearanceOptions,materialPreset,themePreset} from './appearance-config.mjs';
const scalarBounds={shininess:512,ambient:5,hemisphere:5,keyIntensity:10,fillIntensity:10};
const colorFields=['tint','specular','background','edgeColor','vertexColor'];
const directions=['keyDirection','fillDirection'];
const label={shininess:'Highlight sharpness',ambient:'Ambient light',hemisphere:'Sky/ground light',
  keyIntensity:'Key light',fillIntensity:'Fill light',tint:'Surface tint · multiplies source colors',
  specular:'Highlight color',background:'Background',edgeColor:'Edges',vertexColor:'Vertices',
  keyDirection:'Key light position',fillDirection:'Fill light position'};
export class AppearanceControls{
  constructor(context){
    this.context=context;this.busy=false;this.entry=null;
    const panel=document.createElement('details');panel.id='material-lighting-settings';
    panel.innerHTML='<summary>Material and lighting</summary><label>Material <select id="appearance-preset"><option value="classic">Classic</option><option value="matte">Matte</option><option value="polished">Polished</option><option value="warm">Warm tint</option><option value="custom">Custom</option></select></label><label>Viewport theme <select id="appearance-theme"><option value="dark">Dark</option><option value="light">Light</option><option value="paper">Paper</option><option value="custom">Custom</option></select></label>'+colorFields.map(key=>`<label>${label[key]} <input id="appearance-${key}" type="color"></label>`).join('')+Object.keys(scalarBounds).map(key=>`<label>${label[key]} <input id="appearance-${key}" type="text" maxlength="512"></label>`).join('')+directions.map(key=>`<label>${label[key]} <input id="appearance-${key}" type="text" maxlength="1536"></label>`).join('')+'<p>Light positions point toward the model center in displayed 3D space.</p><div class="button-row"><button id="appearance-apply">Apply</button><button id="appearance-reset">Reset</button><button id="appearance-cancel">Cancel edit</button></div><output id="appearance-status" aria-live="polite"></output>';
    (context.mount??(p=>document.getElementById('surface-settings').append(p)))(panel);this.panel=panel;
    for(const action of ['apply','reset','cancel'])this.node(action).onclick=context.guard(()=>action==='apply'?this.apply():action==='reset'?this.reset():this.cancelNumeric());
    this.node('preset').onchange=context.guard(()=>this.applyPreset('material',this.node('preset').value));
    this.node('theme').onchange=context.guard(()=>this.applyPreset('theme',this.node('theme').value));
    this.sync();
  }
  node(key){return this.panel.querySelector('#appearance-'+key);}
  read(){return Object.fromEntries([...colorFields,...Object.keys(scalarBounds),...directions].map(key=>[key,this.node(key).value]));}
  requireEditable(){if(this.busy||this.context.isExporting())throw Error('Finish or cancel the current edit/export before changing appearance.');}
  publish(value){this.context.getState().view.appearance=appearanceOptions(value);this.context.display();this.context.markDirty();}
  applyPreset(kind,name){
    this.requireEditable();if(name==='custom')return;
    const current=this.context.getState().view.appearance;
    this.publish(kind==='material'?materialPreset(name,current):themePreset(name,current));this.sync();
  }
  reset(){this.requireEditable();this.publish(appearanceOptions());this.sync();}
  async apply(){
    this.requireEditable();const raw=this.read(),fields={};
    for(const [key,max] of Object.entries(scalarBounds))fields[key]={text:raw[key],min:0,max};
    for(const key of directions)fields[key]={kind:'vector',length:3,text:raw[key],min:-100,max:100,nonzero:true};
    const context={...this.context,getTarget:()=>({form:this.read(),appearance:this.context.getState()?.view.appearance??null})};
    const entry=new NumericEntry(context);this.entry=entry;this.busy=true;this.sync();
    try{return await entry.run(fields,(values,verify)=>{
      const options=appearanceOptions({...Object.fromEntries(colorFields.map(key=>[key,raw[key]])),
        ...values,preset:'custom',theme:'custom',version:1});
      verify();this.publish(options);this.node('status').textContent='Applied material, lights and viewport theme.';
    });}finally{if(this.entry===entry)this.entry=null;this.busy=false;this.sync();}
  }
  cancelNumeric(){this.entry?.cancel();}
  sync(){
    const state=this.context.getState();if(!state)return;
    const options=appearanceOptions(state.view.appearance),disabled=this.context.isExporting()||this.busy;
    for(const key of ['preset','theme',...colorFields,...Object.keys(scalarBounds),...directions]){
      const node=this.node(key);if(!this.busy&&document.activeElement!==node)node.value=Array.isArray(options[key])?options[key].join(', '):String(options[key]);
      node.disabled=disabled;
    }
    this.node('apply').disabled=disabled;this.node('reset').disabled=disabled;this.node('cancel').disabled=!this.busy;
  }
}
