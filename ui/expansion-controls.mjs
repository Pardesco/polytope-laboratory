import {NumericEntry} from './numeric-entry.mjs';

const eligible=model=>Boolean([3,4].includes(model?.dimension)&&(model.embeddingDimension??model.dimension)===model.dimension&&model.interpretation==='convex-polytope');
export class ExpansionControls{
  constructor(context,{anchor='convex-core-settings'}={}){
    this.context=context;this.busy=false;
    const panel=document.createElement('details');panel.id='expansion-settings';
    panel.innerHTML='<summary>Expand / runcinate (3D / 4D)</summary><label>Ratio (0 to 1) <input id="expansion-ratio" value="1/2" maxlength="512"></label><label>Reciprocal radius <input id="expansion-radius" value="1" maxlength="512"></label><label>Center (blank: vertex mean) <input id="expansion-center" placeholder="x, y, z (4D: add w)" maxlength="2200"></label><label>Colors <select id="expansion-colors"><option value="source">Source colors</option><option value="complement">Complement new edge faces</option><option value="none">Clear colors</option></select></label><button id="make-expansion">Construct expansion</button>';
    document.getElementById(anchor).after(panel);this.panel=panel;
    panel.querySelector('button').onclick=context.guard(()=>this.construct());this.sync();
  }
  async construct(){
    if(this.busy)throw Error('Finish the current expansion first.');
    if(!eligible(this.context.getState()?.model))throw Error('Choose an intrinsic convex 3D or 4D source.');
    const read=()=>Object.fromEntries(['ratio','radius','center','colors'].map(key=>[key,this.panel.querySelector('#expansion-'+key).value]));
    const input=read();if(!['source','complement','none'].includes(input.colors))throw Error('Choose an expansion color policy.');
    const fields={ratio:{text:input.ratio,min:0,max:1},radius:{text:input.radius,min:0,exclusiveMin:true}};
    if(input.center.trim())fields.center={text:input.center,kind:'vector',length:this.context.getState().model.dimension};
    const entry=new NumericEntry({...this.context,getTarget:read});this.numericEntry=entry;this.busy=true;this.sync();
    try{return await entry.run(fields,(values,verify,{signal,source})=>{
      verify();return this.context.commit('expand-runcinate',{ratio:values.ratio,radius:values.radius,center:values.center??null,color_policy:input.colors},
        'Expand / runcinate',{signal,verifyPublication:verify,sourceSnapshot:source,expressionInputs:input});
    });}finally{if(this.numericEntry===entry)this.numericEntry=null;this.busy=false;this.sync();}
  }
  cancel(){this.numericEntry?.cancel();}
  sync(){const blocked=this.busy||Boolean(this.context.isExporting?.());
    for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=blocked;
    this.panel.querySelector('button').disabled=blocked||!eligible(this.context.getState()?.model);
  }
}
