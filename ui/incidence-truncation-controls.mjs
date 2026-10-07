import {NumericEntry} from './numeric-entry.mjs';
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';

const eligible=m=>Boolean(m?.dimension===3&&(m.embeddingDimension??3)===3&&['convex-polytope','generalized-complex'].includes(m.interpretation)&&m.vertices?.length<=256);
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export class IncidenceTruncationControls{
  constructor(context,{anchor='exact-section-settings'}={}){
    this.context=context;this.busy=false;this.previewData=null;
    const panel=document.createElement('details');panel.id='incidence-truncation-settings';
    panel.innerHTML='<summary>Truncation / quasitruncation (3D)</summary><label>Depth method <select id="incidence-cut-preset"><option value="normal">Keep largest regular face regular</option><option value="quasi">Regular-face quasitruncation</option><option value="rectify">Edge midpoint rectification</option><option value="manual">Manual edge-cut fraction</option></select></label><label>Manual fraction <input id="incidence-cut-amount" value="1/3" maxlength="512"></label><label>Reference face ID (blank = largest regular face) <input id="incidence-cut-reference" value="" maxlength="512"></label><label>New cap colors <select id="incidence-cut-colors"><option value="inherit">Inherit common incident color</option><option value="none">Unassigned</option></select></label><button id="preview-incidence-cut">Preview edge cut</button><output id="incidence-cut-result" aria-live="polite"></output><button id="adopt-incidence-cut" disabled>Adopt edge cut</button><button id="cancel-incidence-cut" hidden>Cancel edge cut</button>';
    document.getElementById(anchor).after(panel);this.panel=panel;
    this.node('preview-incidence-cut').onclick=context.guard(()=>this.preview());this.node('adopt-incidence-cut').onclick=context.guard(()=>this.adopt());
    this.node('cancel-incidence-cut').onclick=()=>this.cancel();for(const id of ['preset','amount','reference','colors'])this.node('incidence-cut-'+id).onchange=()=>this.sync();this.sync();
  }
  node(id){return this.panel.querySelector('#'+id);}
  fields(){return Object.fromEntries(['preset','amount','reference','colors'].map(id=>[id,this.node('incidence-cut-'+id).value]));}
  history(){return JSON.stringify(this.context.getDocument()?.operationHistory??null);}
  validPreview(){const cached=this.previewData;if(!cached)return false;verifyNativeSource(this.context,cached.owner);
    if(this.history()!==cached.history||JSON.stringify(this.fields())!==cached.fields)throw Error('Edge-cut source history or depth changed. Compute a new preview.');return true;}
  async execute(adopting){
    if(this.busy)throw Error('Finish or cancel the current edge cut first.');
    if(!eligible(this.context.getState()?.model))throw Error('Choose a closed intrinsic XYZ3D surface with at most 256 vertices.');
    if(adopting&&!this.validPreview())throw Error('Compute a current edge-cut preview before adoption.');
    const owner=captureNativeSource(this.context),history=this.history(),input=this.fields();
    if(!['normal','quasi','rectify','manual'].includes(input.preset)||!['inherit','none'].includes(input.colors))throw Error('Choose supported edge-cut depth and cap colors.');
    const fields={amount:{text:input.preset==='manual'?input.amount:'0',min:0,max:1024}};
    if(input.reference.trim()&&['normal','quasi'].includes(input.preset))fields.reference={text:input.reference,min:0,max:511,integer:true};
    const entry=new NumericEntry({...this.context,getTarget:()=>this.fields()});this.numericEntry=entry;this.busy=true;
    if(!adopting)this.previewData=null;this.sync();
    try{return await entry.run(fields,async(values,verify,{signal,source})=>{
      const check=()=>{verify();if(this.history()!==history)throw Error('Edge-cut source history changed. Repeat the computation.');};
      const params={preset:input.preset,amount:values.amount,reference_face:values.reference??null,cap_colors:input.colors};check();
      if(adopting){const model=await this.context.commit('incidence-truncate',params,'Source-incidence edge cut',
          {signal,verifyPublication:check,sourceSnapshot:source,expressionInputs:input});this.previewData=null;return model;}
      const packet=await this.context.preview('incidence-truncate-preview',params,{signal,verifyPublication:check,sourceSnapshot:source});check();
      const info=packet?.construction,model=packet?.model;
      if(!info||info.sourceModelId!==source.id||canonical(info.sourceModel)!==canonical(source)||!info.closedIncidence||info.hullUsed!==false||
          model?.dimension!==3||model.embeddingDimension!==3||!model.validation?.passed||canonical(model.metadata?.incidenceTruncation)!==canonical(info))
        throw Error('Native edge-cut geometry or source receipt is malformed.');
      this.previewData={owner,history,fields:JSON.stringify(input),packet};
      this.node('incidence-cut-result').textContent=`Fraction ${info.parameters.amount.toPrecision(8)} · ${model.vertices.length} vertices · ${model.faces.length} faces. ${info.solidInteriorInferred?'Qualified convex boundary.':'Closed incidence; intersecting surface/winding may remain.'}`;
      return packet;
    });}finally{if(this.numericEntry===entry)this.numericEntry=null;this.busy=false;this.sync();}
  }
  preview(){return this.execute(false);}
  adopt(){return this.execute(true);}
  cancel(){this.numericEntry?.cancel();}
  sync(){const blocked=this.busy||Boolean(this.context.isExporting?.());
    for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=blocked;
    const preset=this.node('incidence-cut-preset').value;
    this.node('incidence-cut-amount').disabled=blocked||preset!=='manual';
    this.node('incidence-cut-reference').disabled=blocked||!['normal','quasi'].includes(preset);
    this.node('preview-incidence-cut').disabled=blocked||!eligible(this.context.getState()?.model);
    let current=false;try{current=this.validPreview();}catch{this.previewData=null;this.node('incidence-cut-result').textContent='Source or depth changed; compute a new edge cut.';}
    this.node('adopt-incidence-cut').disabled=blocked||!current;
    this.node('cancel-incidence-cut').hidden=!this.busy;this.node('cancel-incidence-cut').disabled=!this.busy;
  }
}
