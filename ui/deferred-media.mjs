export function deferredMedia(loader,name){
  let pending;
  return async options=>{
    pending??=loader().catch(error=>{pending=null;throw error;});
    const module=await pending;
    options.check?.();
    return module[name](options);
  };
}
export const recordRenderedVideo=deferredMedia(()=>import('./video-recorder.mjs'),'recordRenderedVideo');
export const recordRenderedGif=deferredMedia(()=>import('./gif-encoder.mjs'),'recordRenderedGif');
