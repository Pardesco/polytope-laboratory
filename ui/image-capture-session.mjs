import {pngCaptureOptions} from './png-capture-options.mjs';
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
import {holdObservationControls} from './observation-controls.mjs';
const abort=()=>Object.assign(Error('Image capture canceled or superseded.'),{name:'AbortError'});
export async function saveReviewedImage(api,image,defaultName,{verify,signal}={}){
  const id=crypto.randomUUID();let rejectCancel;
  const canceled=new Promise((_,reject)=>{rejectCancel=reject;});canceled.catch(()=>{});
  const cancel=()=>{api.abortImageExport(id).catch(()=>{});rejectCancel(abort());};
  const check=()=>{if(signal?.aborted)throw abort();verify?.();};
  const wait=work=>Promise.race([work,canceled]);
  signal?.addEventListener('abort',cancel,{once:true});
  try{
    check();const ticket=await wait(api.beginImageExport(id,{format:'png',defaultName}));check();
    if(!ticket)return null;if(ticket.id!==id)throw Error('Image destination does not match this capture.');
    return await wait(api.writeImageExport(id,image));
  }finally{signal?.removeEventListener('abort',cancel);await api.abortImageExport(id);}
}
export class ImageCaptureSession{
  constructor(context){this.context=context;this.busy=false;this.controller=null;}
  async run(){
    const c=this.context;if(c.isExporting())throw Error('Finish animation export before capturing an image.');
    if(this.busy)throw Error('Finish or cancel the current image capture first.');
    const options=pngCaptureOptions(c.getOptions?.());
    const controller=new AbortController(),signal=controller.signal,id=crypto.randomUUID();this.controller=controller;this.busy=true;
    let observation,rejectCancel;const canceled=new Promise((_,reject)=>{rejectCancel=reject;});canceled.catch(()=>{});
    const cancel=()=>{c.api.abortImageExport(id).catch(()=>{});rejectCancel(abort());};signal.addEventListener('abort',cancel,{once:true});
    const wait=work=>Promise.race([work,canceled]);
    try{
      c.onState?.();c.stop();observation=holdObservationControls([c.viewer]);
      const owner=captureNativeSource(c),view=JSON.stringify(owner.state.view),display=JSON.stringify(c.getDisplay?.());
      const verify=()=>{if(signal.aborted)throw abort();verifyNativeSource(c,owner);if(JSON.stringify(owner.state.view)!==view||JSON.stringify(c.getDisplay?.())!==display)throw Error('View changed while preparing the image. Capture it again.');};
      this.verify=verify;
      const isCurrent=()=>{try{verify();return true;}catch{return false;}};
      verify();await wait(c.prepare({signal,isCurrent}));verify();
      const image=c.image(options);verify();
      const ticket=await wait(c.api.beginImageExport(id,{format:'png',defaultName:'Polytope.png'}));verify();
      if(!ticket)return null;if(ticket.id!==id)throw Error('Image destination does not match this capture.');
      const result=await wait(c.api.writeImageExport(id,image));
      if(isCurrent())c.onSaved?.(result);return result;
    }finally{
      signal.removeEventListener('abort',cancel);try{await c.api.abortImageExport(id);}finally{observation?.release();if(this.controller===controller){this.verify=null;this.controller=null;this.busy=false;c.onState?.();}}
    }
  }
  cancel(){this.controller?.abort();}
  sync(){if(this.busy&&this.verify){try{this.verify();}catch{this.cancel();}}}
}
