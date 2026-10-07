import {NumericEntry} from './numeric-entry.mjs';
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';

const eligible=m=>Boolean(m?.dimension===3&&(m.embeddingDimension??3)===3&&['convex-polytope','generalized-complex'].includes(m.interpretation)&&m.vertices?.length<=256);
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export class ExactSectionControls{
  constructor(context,{anchor='fitting-settings'}={}){
    this.context=context;this.busy=false;this.previewData=null;
    const panel=document.createElement('details');panel.id='exact-section-settings';
    panel.innerHTML='<summary>Exact rational surface section (3D)</summary><label>Plane coefficients n (n·XYZ = b) <input id="exact-section-normal" value="0, 0, 1" maxlength="2200"></label><label>Right-hand side b <input id="exact-section-offset" value="0" maxlength="512"></label><label>Source-face winding <select id="exact-section-fill"><option value="nonzero">Nonzero</option><option value="even-odd">Even-odd</option></select></label><button id="preview-exact-section">Compute section</button><output id="exact-section-result" aria-live="polite"></output><button id="adopt-exact-section" disabled>Adopt surface section</button><button id="cancel-exact-section" hidden>Cancel section</button>';
    document.getElementById(anchor).after(panel);this.panel=panel;
    this.node('preview-exact-section').onclick=context.guard(()=>this.preview());this.node('adopt-exact-section').onclick=context.guard(()=>this.adopt());
    this.node('cancel-exact-section').onclick=()=>this.cancel();for(const id of ['normal','offset','fill'])this.node('exact-section-'+id).onchange=()=>this.sync();this.sync();
  }
  node(id){return this.panel.querySelector('#'+id);}
  fields(){return Object.fromEntries(['normal','offset','fill'].map(id=>[id,this.node('exact-section-'+id).value]));}
  history(){return JSON.stringify(this.context.getDocument()?.operationHistory??null);}
  validPreview(){const cached=this.previewData;if(!cached)return false;
    verifyNativeSource(this.context,cached.owner);
    if(this.history()!==cached.history||JSON.stringify(this.fields())!==cached.fields)throw Error('Exact section source history or plane changed. Compute a new section.');return true;
  }
  async execute(adopting){
    if(this.busy)throw Error('Finish or cancel the current section first.');
    if(!eligible(this.context.getState()?.model))throw Error('Choose finite XYZ3D source faces with at most 256 vertices.');
    if(adopting&&(!this.validPreview()||!this.previewData.packet.model))throw Error('Compute a nonempty current section before adoption.');
    const owner=captureNativeSource(this.context),history=this.history(),input=this.fields();
    if(!['nonzero','even-odd'].includes(input.fill))throw Error('Choose a source-face winding rule.');
    const entry=new NumericEntry({...this.context,getTarget:()=>this.fields()});this.numericEntry=entry;this.busy=true;
    if(!adopting)this.previewData=null;this.sync();
    try{return await entry.run({normal:{text:input.normal,kind:'vector',mode:'rational',length:3,nonzero:true},offset:{text:input.offset,mode:'rational'}},
      async(values,verify,{signal,source})=>{
        const check=()=>{verify();if(this.history()!==history)throw Error('Exact section source history changed. Repeat the computation.');};
        const params={normal:values.normal,offset:values.offset,fill_rule:input.fill};check();
        if(adopting){const model=await this.context.commit('exact-surface-section',params,'Exact surface section',
            {signal,verifyPublication:check,sourceSnapshot:source,expressionInputs:input});this.previewData=null;return model;}
        const packet=await this.context.preview('exact-surface-section-preview',params,{signal,verifyPublication:check,sourceSnapshot:source});check();
        if(!packet?.exact?.exactConstruction||packet.exact.sourceModelId!==source.id||canonical(packet.exact.sourceModel)!==canonical(source)||
           !['empty','surface-intersection','point-tangency'].includes(packet.status))throw Error('Native exact section source receipt is malformed.');
        if(packet.model&&(packet.model.dimension!==2||packet.model.embeddingDimension!==3||packet.model.interpretation!=='surface-section'||!Array.isArray(packet.model.rationalCoordinates)))
          throw Error('Native exact section world XYZ geometry is malformed.');
        this.previewData={owner,history,fields:JSON.stringify(input),packet};
        this.node('exact-section-result').textContent=packet.model?`${packet.model.vertices.length} exact points · ${packet.model.edges.length} segments · ${packet.model.faces.length} coplanar faces; world XYZ display`:'Empty exact section.';
        return packet;
      });}finally{if(this.numericEntry===entry)this.numericEntry=null;this.busy=false;this.sync();}
  }
  preview(){return this.execute(false);}
  adopt(){return this.execute(true);}
  cancel(){this.numericEntry?.cancel();}
  sync(){const blocked=this.busy||Boolean(this.context.isExporting?.());
    for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=blocked;
    this.node('preview-exact-section').disabled=blocked||!eligible(this.context.getState()?.model);
    let current=false;try{current=this.validPreview();}catch{this.previewData=null;this.node('exact-section-result').textContent='Source or plane changed; compute a new section.';}
    this.node('adopt-exact-section').disabled=blocked||!current||!this.previewData.packet.model;
    this.node('cancel-exact-section').hidden=!this.busy;this.node('cancel-exact-section').disabled=!this.busy;
  }
}
