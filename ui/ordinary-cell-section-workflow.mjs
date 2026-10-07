/** Source-owned complete-cell section preview and history promotion. */
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
import {captureContentHistoryPublication} from './element-content-history.mjs';
import {prepareHistoryCommit,verifyHistoryPublication} from './history-workflow.mjs';
const abort=()=>Object.assign(Error('Cell-section request canceled or superseded.'),{name:'AbortError'});
const clone=structuredClone,signature=JSON.stringify;
const plane=state=>signature([state.view.sectionNormal,state.view.sectionOffset,state.view.fillRule??'nonzero']);
export class OrdinaryCellSectionWorkflow{
 constructor(context){this.context=context;this.generation=0;this.receipts=new WeakMap();this.active=null;}
 cancel(){this.generation++;this.active?.abort();this.active=null;}
 async evaluate(parameters,{signal,isCurrent=()=>true,exportOwner}={}){
  this.cancel();const generation=this.generation,controller=new AbortController();this.active=controller;
  const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  if(exportOwner!==undefined&&typeof exportOwner!=='function')throw Error('Cell-section export requires an owned current exporter.');
  const readContext=exportOwner?{...this.context,isExporting:()=>false}:this.context;
  if(exportOwner&&exportOwner()!==true)throw abort();
  const owner=captureNativeSource(readContext),content=captureContentHistoryPublication(readContext),ownedPlane=plane(owner.state);
  const verify=()=>{if(generation!==this.generation||controller.signal.aborted||!isCurrent()||exportOwner&&exportOwner()!==true)throw abort();verifyNativeSource(readContext,owner);content();if(plane(owner.state)!==ownedPlane)throw Error('Cell-section plane or fill rule changed. Evaluate it again.');};
  try{
   verify();const params={...clone(parameters),section_domain:'ordinary-cells'};
   const result=await this.context.run('section',params,JSON.parse(owner.modelSignature),'Evaluate complete ordinary 4D cell section',{signal:controller.signal});verify();
   this.receipts.set(result,{owner,content,params,ownedPlane,resultSignature:signature(result),generation});return result;
  }finally{signal?.removeEventListener('abort',cancel);if(this.active===controller)this.active=null;}
 }
 async promote(result){
  const receipt=this.receipts.get(result);if(!receipt?.resultSignature||!result?.model)throw Error('Evaluate a complete cell-section model before promoting it.');
  const controller=new AbortController();this.active?.abort();this.active=controller;
  const verify=()=>{if(receipt.generation!==this.generation||controller.signal.aborted)throw abort();verifyNativeSource(this.context,receipt.owner);receipt.content();if(plane(receipt.owner.state)!==receipt.ownedPlane||signature(result)!==receipt.resultSignature)throw Error('Cell-section plane, source, result or ownership changed. Evaluate it again.');};
  const context={...this.context,verifyPublication:verify,run:(op,params,model,label)=>this.context.run(op,params,model,label,{signal:controller.signal})};
  try{
   verify();const prepared=await prepareHistoryCommit(context,'section',clone(receipt.params),'Promote complete ordinary 4D cell section');
   verifyHistoryPublication(context,prepared,{opening:true});verify();
   if(signature(prepared.result.states[prepared.result.cursor].model)!==signature(result.model))throw Error('Native cell-section preview and history reconstruction differ. Evaluate it again.');
   this.context.publishHistory(prepared.result);return prepared.result;
  }finally{if(this.active===controller)this.active=null;}
 }
}
