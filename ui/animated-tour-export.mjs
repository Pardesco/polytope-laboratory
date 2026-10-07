/** Native bounded staging and the explicit-pose WebM encoder for
 * live animated tour composites. PNG times are exact; WebM owns explicit pose timestamps. */
import {animatedTourFrameTimes} from './animated-tour-timeline.mjs';
import {recordRenderedVideo} from './video-recorder.mjs';
const abort=()=>Object.assign(Error('Animated tour export cancelled or superseded.'),{name:'AbortError'});
export class AnimatedTourExporter{
  constructor({renderer,api,recordVideo=recordRenderedVideo,onProgress=()=>{},onExportStateChange=()=>{},onDiagnostic=()=>{}}){
    if(!renderer||!api||['animationBegin','animationWrite','animationFinish','animationAbort'].some(k=>typeof api[k]!=='function'))throw Error('Tour export needs the actual live renderer and native staging API.');
    Object.assign(this,{renderer,api,recordVideo,onProgress});this.onDiagnostic=message=>{try{onDiagnostic(message);}catch{}};
    this.onExportStateChange=value=>{try{onExportStateChange(value);}catch(error){this.onDiagnostic(error.message);}};this.exporting=false;this.generation=0;
  }
  cancel(){this.generation++;this.controller?.abort();this.renderer.cancel();if(this.recorder?.state!=='inactive')this.recorder?.stop();}
  async export(format,{fps=24,name='Animated tour'}={}){
    if(this.exporting)throw Error('An animated tour export is already running.');if(!['png','webm'].includes(format))throw Error('Tour export format must be PNG or WebM.');
    const {timeline}=this.renderer;if(timeline.duration<=0)throw Error('Add an event before exporting the tour.');
    // Current native manifest defines a uniform i/fps grid and caps duration
    // at300s. Do not omit duration or forge a manifest for boundary insertions.
    if(timeline.duration>300)throw Error('Current native tour capture is bounded to 300 seconds; the longer readable tour is retained.');
    const times=animatedTourFrameTimes(timeline,fps),previous=this.renderer.published?.time??null,generation=++this.generation,controller=new AbortController();
    const check=()=>{if(controller.signal.aborted||generation!==this.generation||!this.renderer.ownerCurrent())throw abort();};
    let session=null,result=null;this.controller=controller;this.exporting=true;this.onExportStateChange(true);
    try{
      check();session=await this.api.animationBegin({format,name,fps,duration:timeline.duration,frameCount:times.length});check();if(!session)return null;
      const renderFrame=async index=>{check();const p=await this.renderer.apply(times[index],{signal:controller.signal});check();if(p.complete!==true)throw Error('Tour export requires complete fine current-pose geometry.');if(!this.renderer.current(p))throw abort();return p;};
      if(format==='png'){
        for(let index=0;index<times.length;index++){const p=await renderFrame(index),image=this.renderer.image(p);check();await this.api.animationWrite(session.id,index,image);check();this.onProgress({format,index:index+1,frameCount:times.length,time:times[index]});await new Promise(resolve=>setTimeout(resolve,0));}
      }else{
        let index=0;
        await this.recordVideo({canvas:this.renderer.canvas,fps,frameCount:times.length,frameTimes:times,check,
          renderFrame:async n=>{index=n;await renderFrame(n);},
          writeChunk:async(n,data)=>{check();await this.api.animationWrite(session.id,n,data);check();},
          onRecorder:recorder=>{this.recorder=recorder;},progress:value=>this.onProgress({format,progress:value,frameCount:times.length,time:times[index]})});
      }
      check();result=await this.api.animationFinish(session.id);session=null;check();return result;
    }finally{
      controller.abort();this.renderer.cancel();
      // apply() settles only after guarded pending preparations return. Native
      // staging is discarded after that path, never before a pixel can arrive.
      if(session)await this.api.animationAbort(session.id).catch(error=>this.onDiagnostic(error.message));
      if(previous!==null&&this.renderer.ownerCurrent())try{await this.renderer.apply(previous);}catch(error){this.onDiagnostic(error.message);}
      if(this.controller===controller)this.controller=null;this.recorder=null;this.exporting=false;this.onExportStateChange(false);
    }
  }
}
