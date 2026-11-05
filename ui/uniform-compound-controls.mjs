import {NumericEntry} from './numeric-entry.mjs';
import {explainAvailability} from './availability-copy.mjs';
export const ROTATIONAL_UC=new Set([1,2,7,10,11,13,20,22,24,26,28]);
export class UniformCompoundControls{
  constructor(context,{mount=true}={}){
    this.context=context;this.busy=false;
    if(!mount)return;
    const panel=document.createElement('details');panel.id='uniform-compound-settings';
    panel.innerHTML='<summary>Uniform compounds (UC1–UC75)</summary><label>Skilling number <select id="uc-number"></select></label><label id="uc-angle-row">Rotation θ (degrees) <input id="uc-angle" value="17" maxlength="512"></label><details id="uc-polygon-options"><summary>Polygon and repetition (UC20–UC25)</summary><label>Polygon sides n (3–32) <input id="uc-n" value="5" maxlength="512"></label><label>Polygon step d <input id="uc-d" value="1" maxlength="512"></label><label>Repetition k (2–12) <input id="uc-k" value="2" maxlength="512"></label><p class="muted">Reduced n/d; n × k ≤ 128. Odd d for UC22/23; even d for UC24/25. Other prism compounds have fixed polygons.</p></details><div class="button-row"><button id="uc-create">Create compound</button><button id="uc-apply">Apply parameters</button></div><p class="muted">Separate colored components; numerical symmetry orbits. θ defaults to the attributed 17° representative. Apply parameters records Undo/Redo history on the current UC model.</p>';
    this.panel=panel;document.getElementById('construct-panel').append(panel);
    this.node('number').replaceChildren(...Array.from({length:75},(_,i)=>new Option('UC'+(i+1),String(i+1))));
    this.node('number').onchange=()=>{this.defaults();this.sync();};
    this.node('create').onclick=context.guard(()=>this.apply(false));this.node('apply').onclick=context.guard(()=>this.apply(true));this.sync();
  }
  node(key){return this.panel.querySelector('#uc-'+key);}
  fields(){return Object.fromEntries(['number','angle','n','d','k'].map(key=>[key,this.node(key).value]));}
  defaults(){const uc=Number(this.node('number').value);this.node('angle').value='17';this.node('n').value='5';this.node('d').value=uc===24||uc===25?'2':'1';this.node('k').value='2';}
  async apply(edit=false){
    const c=this.context;if(this.busy||c.isExporting())throw Error('Finish or cancel the current construction/export first.');
    const raw=this.fields(),uc=Number(raw.number),polygon=uc>=20&&uc<=25;
    if(edit&&c.getState()?.model.metadata?.ucNumber!==uc)throw Error('Open the selected UC compound before applying parameters.');
    const fields={uc:{text:raw.number,integer:true,min:1,max:75}};
    if(ROTATIONAL_UC.has(uc))fields.angleDegrees={text:raw.angle,min:-360,max:360};
    if(polygon)for(const [key,min,max] of [['n',3,32],['d',1,31],['k',2,12]])fields[key]={text:raw[key],integer:true,min,max};
    const entry=new NumericEntry({...c,getTarget:()=>this.fields()});this.entry=entry;this.busy=true;this.sync();
    try{return await entry.run(fields,(params,verify,{signal,source})=>{
      verify();const options={signal,sourceSnapshot:source,verifyPublication:verify};
      return edit?c.commit('uniform-compound',params,'Set UC'+uc+' parameters',options):c.generate('uniform-compound',params,options);
    });}finally{if(this.entry===entry)this.entry=null;this.busy=false;this.sync();}
  }
  cancel(){this.entry?.cancel();}
  sync(){
    if(!this.panel)return;
    const m=this.context.getState()?.model;
    if(m!==this.source){this.source=m;if(m?.metadata?.ucNumber){this.node('number').value=String(m.metadata.ucNumber);this.defaults();const p=m.metadata.uniformCompound?.parameters??{};for(const key of ['n','d','k'])if(p[key]!==undefined)this.node(key).value=String(p[key]);if(p.angleDegrees!==undefined)this.node('angle').value=String(p.angleDegrees);}}
    const records=this.context.getEntries?.()??[];
    for(const option of this.node('number').options??[]){const record=records.find(r=>r.key==='compound-uc'+option.value);if(record)option.textContent=record.name;}
    const uc=Number(this.node('number').value),blocked=this.busy||this.context.isExporting();
    this.node('angle-row').hidden=!ROTATIONAL_UC.has(uc);this.node('polygon-options').hidden=uc<20||uc>25;
    for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=blocked;
    this.node('apply').disabled=blocked||m?.metadata?.ucNumber!==uc;
    const reason=this.busy?'Finish or cancel the current construction.':'Finish or cancel export first.';
    explainAvailability(this.panel,reason,{'uc-apply':blocked?reason:'Open or create the selected UC compound before applying parameters.'});
  }
}
