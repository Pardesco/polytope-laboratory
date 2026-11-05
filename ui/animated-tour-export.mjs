/** Native bounded staging and the explicit-pose WebM encoder for
 * live animated tour composites. PNG times are exact; WebM owns explicit pose timestamps. */
import {animatedTourFrameTimes} from './animated-tour-timeline.mjs';
import {recordRenderedVideo} from './deferred-media.mjs';
import {recordRenderedGif} from './deferred-media.mjs';
import {mediaExportOptions,createMediaSurface} from './media-export-options.mjs';
const abort=()=>Object.assign(Error('Animated tour export cancelled or superseded.'),{name:'AbortError'});
export class AnimatedTourExporter{
  constructor({renderer,api,recordVideo=recordRenderedVideo,onProgress=()=>{},onExportStateChange=()=>{},onDiagnostic=()=>{}}){
    if(!renderer||!api||['animationBegin','animationWrite','animationFinish','animationAbort'].some(k=>typeof api[k]!=='function'))throw Error('Tour export needs the actual live renderer and native staging API.');
    Object.assign(this,{renderer,api,recordVideo,onProgress});this.onDiagnostic=message=>{try{onDiagnostic(message);}catch{}};
    this.onExportStateChange=value=>{try{onExportStateChange(value);}catch(error){this.onDiagnostic(error.message);}};this.exporting=false;this.generation=0;
  }
  cancel(){this.generation++;this.controller?.abort();this.renderer.cancel();this.captureRenderer?.cancel();if(this.recorder?.state!=='inactive')this.recorder?.stop();}
  async export(format,{fps=24,name='Animated tour',...value}={}){
    if(this.exporting)throw Error('An animated tour export is already running.');const options=mediaExportOptions({...value,format});
    const {timeline}=this.renderer;if(timeline.duration<=0)throw Error('Add an event before exporting the tour.');
    // Current native manifest defines a uniform i/fps grid and caps duration
    // at300s. Do not omit duration or forge a manifest for boundary insertions.
    if(timeline.duration>300)throw Error('Current native tour capture is bounded to 300 seconds; the longer readable tour is retained.');
    const times=animatedTourFrameTimes(timeline,fps),previous=this.renderer.published?.time??null,generation=++this.generation,controller=new AbortController();
    const check=()=>{if(controller.signal.aborted||generation!==this.generation||!this.renderer.ownerCurrent())throw abort();};
    let session=null,result=null,renderer=this.renderer,surface=null;this.controller=controller;this.exporting=true;this.onExportStateChange(true);
    try{
      if(this.renderer.createExportRenderer){renderer=this.renderer.createExportRenderer(options);this.captureRenderer=renderer;}
      check();session=await this.api.animationBegin({format,name,fps,duration:timeline.duration,frameCount:times.length});check();if(!session)return null;
      const renderFrame=async index=>{check();const p=await renderer.apply(times[index],{signal:controller.signal});check();if(p.complete!==true)throw Error('Tour export requires complete fine current-pose geometry.');if(!renderer.current(p))throw abort();return p;};
      surface=renderer===this.renderer&&(options.size!=='viewport'||['mp4','gif'].includes(format))?createMediaSurface(renderer.canvas,options):null;
      if(format==='png'){
        for(let index=0;index<times.length;index++){const p=await renderFrame(index);if(surface)surface.copy();const image=surface?surface.canvas.toDataURL('image/png'):renderer.image(p);check();await this.api.animationWrite(session.id,index,image);check();this.onProgress({format,index:index+1,frameCount:times.length,time:times[index]});await new Promise(resolve=>setTimeout(resolve,0));}
      }else{
        let index=0;
        await (format==='gif'?recordRenderedGif:this.recordVideo)({...options,canvas:surface?.canvas||renderer.canvas,fps,frameCount:times.length,frameTimes:times,check,
          renderFrame:async n=>{index=n;await renderFrame(n);check();surface?.copy();check();},
          writeChunk:async(n,data)=>{check();await this.api.animationWrite(session.id,n,data);check();},
          onRecorder:recorder=>{this.recorder=recorder;},progress:value=>this.onProgress({format,progress:value,frameCount:times.length,time:times[index]})});
      }
      check();result=await this.api.animationFinish(session.id);session=null;check();return result;
    }finally{
      controller.abort();renderer.cancel();
      // apply() settles only after guarded pending preparations return. Native
      // staging is discarded after that path, never before a pixel can arrive.
      if(session)await this.api.animationAbort(session.id).catch(error=>this.onDiagnostic(error.message));
      surface?.dispose?.();if(renderer!==this.renderer)await renderer.close().catch(error=>this.onDiagnostic(error.message));this.captureRenderer=null;
      if(renderer===this.renderer&&previous!==null&&this.renderer.ownerCurrent())try{await this.renderer.apply(previous);}catch(error){this.onDiagnostic(error.message);}
      if(this.controller===controller)this.controller=null;this.recorder=null;this.exporting=false;this.onExportStateChange(false);
    }
  }
}
