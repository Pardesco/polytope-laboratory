/** Read-only source-owned measurement publication; observer motion is independent. */
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
import {portableContentSource,sha256Content} from './element-content-source.mjs';
const abort=()=>Object.assign(Error('Measurement canceled or superseded.'),{name:'AbortError'});
const content=state=>JSON.stringify([state.view?.elementAnnotations??null,state.view?.elementContentDetached??null,state.view?.documentMetadata??null]);
export class SourceMeasurementSession{
 constructor(context){this.context=context;this.generation=0;this.active=null;}
 cancel(){this.generation++;this.active?.abort();this.active=null;}
 async run(op,params,run,label,{getTarget=()=>null,isCurrent=()=>true}={}){
  this.cancel();const generation=this.generation,controller=new AbortController();this.active=controller;
  const owner=captureNativeSource(this.context),annotations=content(owner.state),target=JSON.stringify(getTarget());
  const verify=()=>{if(controller.signal.aborted||generation!==this.generation||!isCurrent())throw abort();verifyNativeSource(this.context,owner);if(content(owner.state)!==annotations||JSON.stringify(getTarget())!==target)throw Error('Measurement source content or selected targets changed. Repeat the measurement.');};
  try{verify();const source=JSON.parse(owner.modelSignature),result=await run(op,structuredClone(params),source,label,{signal:controller.signal,isCurrent:()=>{try{verify();return true;}catch{return false;}}});verify();
   if(result.boundedDistanceEvidence?.sourceSha256){const hash=await sha256Content(portableContentSource(source));verify();if(hash!==result.boundedDistanceEvidence.sourceSha256)throw Error('Measurement result belongs to another full source snapshot.');}
   return {result,verify};
  }finally{if(this.active===controller)this.active=null;}
 }
}
