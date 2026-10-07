import {NumericEntry} from './numeric-entry.mjs';
export class SphereProjectionControls{
  constructor(context){
    this.context=context;this.busy=false;this.entry=null;const panel=document.createElement('details');panel.id='sphere-projection-settings';
    panel.innerHTML='<summary>Project vertices onto sphere</summary><label>Center XYZ / XYZW (blank: vertex mean) <input id="sphere-project-center" maxlength="2200"></label><label>Radius (blank: mean source radius) <input id="sphere-project-radius" maxlength="512"></label><button id="sphere-project-apply">Project onto sphere</button><button id="sphere-project-cancel" hidden>Cancel projection</button><output id="sphere-project-status" aria-live="polite"></output><p>Retains source edges, faces, cells and content. Projection refuses newly nonplanar faces or cells; subdivide them explicitly first.</p>';
    document.getElementById('incidence-truncation-settings').after(panel);this.panel=panel;
    this.node('apply').onclick=context.guard(()=>this.apply());this.node('cancel').onclick=()=>this.cancel();this.sync();
  }
  node(key){return this.panel.querySelector('#sphere-project-'+key);}
  fields(){return {center:this.node('center').value,radius:this.node('radius').value};}
  async apply(){
    if(this.busy||this.context.isExporting())throw Error('Finish or cancel the current edit/export before sphere projection.');
    const model=this.context.getState()?.model;if(![3,4].includes(model?.dimension))throw Error('Choose intrinsic 3D or 4D source geometry.');
    const raw=this.fields(),fields={};if(raw.center.trim())fields.center={text:raw.center,kind:'vector',length:model.dimension,min:-1e100,max:1e100};
    if(raw.radius.trim())fields.radius={text:raw.radius,min:1e-8,max:1e100};
    if(!Object.keys(fields).length)fields.defaults={text:'0',min:0,max:0};
    const entry=new NumericEntry({...this.context,getTarget:()=>this.fields()});this.entry=entry;this.busy=true;this.sync();
    try{return await entry.run(fields,async(values,verify,{signal,source})=>{
      const params={center:values.center??null,radius:values.radius??null};verify();
      const result=await this.context.commit('sphere-project',params,'Project onto sphere',{signal,verifyPublication:verify,sourceSnapshot:source,expressionInputs:raw});
      this.node('status').textContent='Projected vertices; source incidence and planar faces/cells retained.';return result;
    });}finally{if(this.entry===entry)this.entry=null;this.busy=false;this.sync();}
  }
  cancel(){this.entry?.cancel();}
  sync(){const blocked=this.busy||this.context.isExporting(),model=this.context.getState()?.model;
    for(const input of this.panel.querySelectorAll('input'))input.disabled=blocked;
    this.node('apply').disabled=blocked||![3,4].includes(model?.dimension)||model.vertices.length>4096;
    this.node('cancel').hidden=!this.busy;this.node('cancel').disabled=!this.busy;
  }
}
