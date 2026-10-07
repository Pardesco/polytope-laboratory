import {NumericEntry} from './numeric-entry.mjs';
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';

const ids=['mode','target','faces','evaluations','residual','solver'];
const eligible=m=>Boolean([3,4].includes(m?.dimension)&&(m.embeddingDimension??m.dimension)===m.dimension&&m.interpretation==='convex-polytope'&&m.vertices?.length<=64);
const wait=(promise,signal)=>new Promise((resolve,reject)=>{
  const canceled=()=>{signal.removeEventListener('abort',canceled);reject(Object.assign(Error('Geometry fitting canceled.'),{name:'AbortError'}));};
  if(signal.aborted)return canceled();signal.addEventListener('abort',canceled,{once:true});
  Promise.resolve(promise).then(value=>{signal.removeEventListener('abort',canceled);resolve(value);},error=>{signal.removeEventListener('abort',canceled);reject(error);});
});

export class FittingControls{
  constructor(context,{anchor='expansion-settings'}={}){
    this.context=context;this.busy=false;this.previewData=null;
    const panel=document.createElement('details');panel.id='fitting-settings';
    panel.innerHTML='<summary>Fit geometric conditions</summary><label>Condition <select id="fitting-mode"><option value="regular-faces">Make selected faces regular</option><option value="equal-edges">Make all edges equal</option><option value="equal-areas">Make all faces equal area</option></select></label><label>Target length / area (blank: source mean) <input id="fitting-target" maxlength="512"></label><label>Regular face IDs (blank: all; JSON array) <input id="fitting-faces" placeholder="[0, 2]" maxlength="4096"></label><label>Evaluation limit <input id="fitting-evaluations" value="100" maxlength="512"></label><label>Residual tolerance <input id="fitting-residual" value="1e-7" maxlength="512"></label><label>Solver tolerance <input id="fitting-solver" value="1e-11" maxlength="512"></label><button id="preview-fitting">Solve preview</button><output id="fitting-result" style="white-space:pre-line" aria-live="polite"></output><label><input id="accept-fitting-near-miss" type="checkbox">Accept a valid candidate with unresolved targets</label><button id="adopt-fitting" disabled>Adopt fitted model</button><button id="cancel-fitting" hidden>Cancel fit</button>';
    document.getElementById(anchor).after(panel);this.panel=panel;
    panel.querySelector('#preview-fitting').onclick=context.guard(()=>this.preview());
    panel.querySelector('#adopt-fitting').onclick=context.guard(()=>this.adopt());
    panel.querySelector('#cancel-fitting').onclick=()=>this.cancel();
    for(const id of ids)this.node('fitting-'+id).onchange=()=>this.sync();
    this.node('accept-fitting-near-miss').onchange=()=>this.sync();this.sync();
  }
  node(id){return this.panel.querySelector('#'+id);}
  fields(){return Object.fromEntries(ids.map(id=>[id,this.node('fitting-'+id).value]));}
  history(){return JSON.stringify(this.context.getDocument()?.operationHistory??null);}
  validPreview(){
    const cached=this.previewData;if(!cached)return false;
    verifyNativeSource(this.context,cached.owner);
    if(this.history()!==cached.history||JSON.stringify(this.fields())!==cached.fields)throw Error('Fitting source history or controls changed. Solve a new preview.');
    return true;
  }
  async execute(adopting){
    if(this.busy)throw Error('Finish or cancel the current fit first.');
    if(!eligible(this.context.getState()?.model))throw Error('Choose an intrinsic convex 3D or 4D source with at most 64 vertices.');
    if(adopting&&!this.validPreview())throw Error('Solve a current preview before adoption.');
    const cached=this.previewData,owner=captureNativeSource(this.context),history=this.history(),input=this.fields();
    const accepted=Boolean(this.node('accept-fitting-near-miss').checked);
    if(adopting&&(!cached.packet.model||!cached.packet.evidence.geometricValidity.passed))throw Error('Invalid fitted candidates cannot be adopted.');
    if(adopting&&!cached.packet.evidence.requestedConstraintsSatisfied&&!accepted)throw Error('Explicitly accept the valid candidate with unresolved targets.');
    if(!['regular-faces','equal-edges','equal-areas'].includes(input.mode))throw Error('Choose a geometric fitting condition.');
    let face_ids=null;
    if(input.mode==='regular-faces'&&input.faces.trim()){
      try{face_ids=JSON.parse(input.faces);}catch{throw Error('Enter regular face IDs as a JSON array.');}
      if(!Array.isArray(face_ids)||!face_ids.length||face_ids.some(i=>!Number.isInteger(i)||i<0||i>=this.context.getState().model.faces.length)||new Set(face_ids).size!==face_ids.length)
        throw Error('Choose distinct literal source face IDs.');
    }
    const fields={max_evaluations:{text:input.evaluations,integer:true,min:1,max:400},residual_tolerance:{text:input.residual,min:1e-10,max:1e-3},solver_tolerance:{text:input.solver,min:1e-13,max:1e-3}};
    if(input.mode!=='regular-faces'&&input.target.trim())fields.target={text:input.target,min:1e-100,max:1e100};
    const read=()=>({fields:this.fields(),accepted:adopting?Boolean(this.node('accept-fitting-near-miss').checked):false});
    const entry=new NumericEntry({...this.context,getTarget:read});this.numericEntry=entry;this.busy=true;
    if(!adopting)this.previewData=null;this.sync();
    try{return await entry.run(fields,async(values,verify,{signal,source})=>{
      const check=()=>{verify();if(this.history()!==history)throw Error('Fitting source history changed. Repeat the solve.');};
      const params={mode:input.mode,...values,face_ids};check();
      if(adopting){
        const result=await wait(this.context.commit('geometry-fit',{...params,adoption:accepted?'valid-near-miss':'constraints-satisfied'},'Fit geometric conditions',
          {signal,verifyPublication:check,sourceSnapshot:source,expressionInputs:input}),signal);
        this.previewData=null;return result;
      }
      const packet=await wait(this.context.preview('geometry-fit-preview',params,{signal,verifyPublication:check,sourceSnapshot:source}),signal);check();
      if(!packet?.evidence||typeof packet.evidence.requestedConstraintsSatisfied!=='boolean'||typeof packet.evidence.geometricValidity?.passed!=='boolean'||
         packet.evidence.sourceModelId!==source.id||!Number.isFinite(packet.evidence.residuals?.maximum)||!Number.isFinite(packet.evidence.residuals?.rms)||
         Boolean(packet.model)!==packet.evidence.geometricValidity.passed)throw Error('Native fitting preview is malformed.');
      if(packet.model&&['edges','faces','cells'].some(key=>JSON.stringify(packet.model[key])!==JSON.stringify(source[key])))throw Error('Fitting preview changed literal source incidence.');
      this.previewData={owner,history,fields:JSON.stringify(input),packet};this.show(packet);return packet;
    });}finally{if(this.numericEntry===entry)this.numericEntry=null;this.busy=false;this.sync();}
  }
  preview(){return this.execute(false);}
  adopt(){return this.execute(true);}
  show(packet){const e=packet.evidence,r=e.residuals;
    this.node('fitting-result').textContent=`${packet.model?(e.requestedConstraintsSatisfied?'Targets satisfied':'Targets unresolved'):'Invalid fitted boundary'}\nMax ${r.maximum.toExponential(3)} · RMS ${r.rms.toExponential(3)} · planarity ${r.maximumPlanarity.toExponential(3)}\n${packet.status} · ${e.solverTermination.evaluations} evaluations${packet.model?'':'\n'+e.geometricValidity.diagnostics.join(' ')}`;
  }
  cancel(){this.numericEntry?.cancel();}
  sync(){const blocked=this.busy||Boolean(this.context.isExporting?.());
    for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=blocked;
    this.node('preview-fitting').disabled=blocked||!eligible(this.context.getState()?.model);
    this.node('fitting-target').disabled=blocked||this.node('fitting-mode').value==='regular-faces';
    this.node('fitting-faces').disabled=blocked||this.node('fitting-mode').value!=='regular-faces';
    let current=false;try{current=this.validPreview();}catch{this.previewData=null;this.node('fitting-result').textContent='Source or controls changed; solve a new preview.';}
    const valid=current&&Boolean(this.previewData.packet.model),unresolved=valid&&!this.previewData.packet.evidence.requestedConstraintsSatisfied;
    this.node('adopt-fitting').disabled=blocked||!valid||unresolved&&!this.node('accept-fitting-near-miss').checked;
    this.node('accept-fitting-near-miss').disabled=blocked||!unresolved;
    this.node('cancel-fitting').hidden=!this.busy;this.node('cancel-fitting').disabled=!this.busy;
  }
}
