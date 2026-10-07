/** Intrinsic selected-entity direction stays separate from the observer camera. */
import {NumericEntry} from './numeric-entry.mjs';
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
const abort=()=>Object.assign(Error('Orientation edit canceled.'),{name:'AbortError'});
function selectionSignature(value){
  let nodes=0;
  const clone=(value,depth)=>{
    if(++nodes>2048||depth>16)throw Error('Orientation selection exceeds its bounded target signature.');
    if(value===null||typeof value==='string'||typeof value==='boolean')return value;
    if(typeof value==='number'&&Number.isFinite(value))return value;
    if(!value||typeof value!=='object'||Object.getOwnPropertySymbols(value).length)throw Error('Orientation selection requires finite plain JSON.');
    const descriptors=Object.getOwnPropertyDescriptors(value);
    if(Object.values(descriptors).some(row=>!('value' in row)))throw Error('Orientation selection cannot contain accessors.');
    if(Array.isArray(value)){
      if(Object.getPrototypeOf(value)!==Array.prototype||value.length>2048||Object.keys(value).length!==value.length||Object.getOwnPropertyNames(value).length!==value.length+1)throw Error('Orientation selection requires bounded ordinary arrays.');
      return Array.from({length:value.length},(_,i)=>{if(!descriptors[i])throw Error('Orientation selection cannot contain holes.');return clone(descriptors[i].value,depth+1);});
    }
    if(![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Orientation selection requires plain records.');
    return Object.fromEntries(Object.entries(descriptors).map(([key,row])=>[key,clone(row.value,depth+1)]));
  };
  const text=JSON.stringify(clone(value,0));if(new TextEncoder().encode(text).length>65536)throw Error('Orientation selection exceeds 64 KiB.');return text;
}
function waitFor(promise,signal){return new Promise((resolve,reject)=>{
  const canceled=()=>{signal.removeEventListener('abort',canceled);reject(abort());};
  if(signal.aborted)return canceled();signal.addEventListener('abort',canceled,{once:true});
  Promise.resolve(promise).then(value=>{signal.removeEventListener('abort',canceled);resolve(value);},error=>{signal.removeEventListener('abort',canceled);reject(error);});
});}
export class EntityOrientationControls {
  constructor(context){
    this.context=context;this.busy=false;this.generation=0;
    this.root=document.createElement('div');this.root.id='entity-orientation-controls';
    this.root.innerHTML='<label>Orient <select id="orientation-source"><option value="selection">Selection</option><option value="measurement">Measurement A</option></select></label><div class="net-history"><button id="entity-first">First</button><button id="entity-last">Last</button><button id="entity-orientation-clear">Clear</button></div><details class="context-help"><summary>Direction</summary><input id="orientation-direction" placeholder="Optional X, Y, Z, W expressions" aria-label="Explicit intrinsic orientation direction"><p class="muted">Use top-level commas or semicolons between four expressions. Blank uses native inference. Centered items need an explicit perpendicular direction. First faces toward +W; Last toward -W.</p></details><output id="entity-orientation-result"></output>';
    document.getElementById('selection-info').after(this.root);
    this.nodes=Object.fromEntries([...this.root.querySelectorAll('[id]')].map(node=>[node.id,node]));
    for(const mode of ['first','last'])this.nodes['entity-'+mode].onclick=context.guard(()=>this.apply(mode));
    this.nodes['entity-orientation-clear'].onclick=context.guard(()=>this.clear());
    this.sync();
  }
  canEdit(){return this.context.getState()?.model.dimension===4&&!this.context.isExporting?.()&&!this.busy;}
  sync(){
    const state=this.context.getState(),frame=state?.view.orientationFrame;
    this.root.hidden=state?.model.dimension!==4;
    for(const node of this.root.querySelectorAll('button,input,select'))node.disabled=!this.canEdit();
    this.nodes['entity-orientation-clear'].disabled=!this.canEdit()||!frame;
    this.nodes['entity-orientation-result'].textContent=frame?`${frame.entity.kind} ${frame.entity.index??frame.sourceVertexIds.join(', ')}: ${frame.mode}`:'';
  }
  clear(){if(!this.canEdit())throw Error('Finish or cancel the current operation before changing orientation.');this.context.clear();this.sync();}
  inputs(){return {direction:this.nodes['orientation-direction'].value,source:this.nodes['orientation-source'].value};}
  target(){return {fields:this.inputs(),selection:this.context.getTarget?.()??null};}
  cancelNumeric(){this.generation=(this.generation??0)+1;this.active?.controller.abort();this.numericEntry?.cancel();}
  async apply(mode){
    if(!this.canEdit())throw Error('Finish or cancel the current operation before changing orientation.');
    if(!['first','last'].includes(mode))throw Error('Choose First or Last orientation.');
    const inputs=this.inputs();if(!['selection','measurement'].includes(inputs.source))throw Error('Choose Selection or Measurement A.');
    const owner=captureNativeSource(this.context),model=owner.state.model,signature=selectionSignature(this.target()),
      job={generation:(this.generation??0)+1,controller:new AbortController()};
    this.generation=job.generation;this.active=job;this.busy=true;this.sync();
    const checkSource=()=>{
      if(this.active!==job||this.generation!==job.generation||job.controller.signal.aborted)throw abort();
      verifyNativeSource(this.context,owner);if(this.context.getState().model!==model)throw Error('Orientation source model ownership changed.');
    };
    const verify=()=>{checkSource();if(selectionSignature(this.target())!==signature)throw Error('Orientation source selection or direction fields changed. Repeat the edit.');};
    const publish=async(direction,check,signal)=>{
      check();const result=await waitFor(this.context.apply(mode,inputs.source,direction,
        {signal,verifyPublication:check,sourceSnapshot:JSON.parse(owner.modelSignature),expressionInputs:inputs}),signal);
      // The callback must check after its native await, before publishing the
      // frame. Its own accepted orientationFrame edit is intentionally allowed.
      checkSource();return result;
    };
    try{
      verify();if(!inputs.direction.trim())return await publish(undefined,verify,job.controller.signal);
      const entry=this.numericEntry=new NumericEntry({...this.context,getTarget:()=>this.target()});
      return await entry.run({direction:{text:inputs.direction,kind:'vector',length:4,nonzero:true}},
        (values,check,{signal})=>publish([...values.direction],()=>{check();verify();},signal),{signal:job.controller.signal});
    }finally{if(this.active===job){this.active=null;this.numericEntry=null;this.busy=false;this.sync();}}
  }
}
