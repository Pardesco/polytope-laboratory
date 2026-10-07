/** Source-bound annotation preparation for independent capture viewers. */
const jobs=new WeakMap();
const clone=structuredClone;
const abort=()=>Object.assign(Error('Element content preparation canceled or changed.'),{name:'AbortError'});
export const contentSignature=state=>JSON.stringify([state?.model,state?.view?.elementAnnotations??null,state?.notes??'',state?.view?.coordinateUnit??'model']);
export const contentParameters=state=>state?.view?.elementAnnotations?{element_annotations:clone(state.view.elementAnnotations)}:{};

export function invalidateElementContent(viewer){const job=jobs.get(viewer);job?.controller.abort();jobs.delete(viewer);}

export async function prepareElementContent(viewer,state,{describe,signal,isCurrent,referenceEdgeMm=25,canMap=true}={}){
  if(typeof viewer?.setElementContent!=='function'){
    if(state?.view?.elementAnnotations?.entries.length)throw Error('Element content renderer is unavailable.');
    return {ready:true};
  }
  const signature=contentSignature(state),key=JSON.stringify([signature,referenceEdgeMm]);
  const verify=()=>{if(signal?.aborted||isCurrent?.()===false||contentSignature(state)!==signature)throw abort();};
  verify();
  if(!canMap&&state?.view?.elementAnnotations?.entries.length){
    invalidateElementContent(viewer);await viewer.setElementContent(null);verify();
    throw Error('Requested element content has no verified mapping to this derived presentation.');
  }
  let job=jobs.get(viewer);
  if(job?.key!==key||job.failed||job.controller.signal.aborted||job.current?.()===false||!job.pending&&(job.layer!==viewer.elementContentLayer||job.model!==viewer.model||job.net!==viewer.net||job.cellNet!==viewer.cellNet)){
    invalidateElementContent(viewer);job={key,pending:true,controller:new AbortController()};jobs.set(viewer,job);
    const current=()=>{try{verify();return jobs.get(viewer)===job&&!job.controller.signal.aborted;}catch{return false;}};
    job.current=current;
    job.promise=(async()=>{
      const options={sourceModel:clone(state.model),signal:job.controller.signal,isCurrent:current};
      await viewer.setElementContent(null,options);if(!current())throw abort();
      const document=state.view?.elementAnnotations;
      let descriptor=null;
      if(document?.entries.length){
        if(typeof describe!=='function')throw Error('Native element content descriptor is unavailable.');
        descriptor=await describe(options.sourceModel,{document:clone(document),reference_edge_mm:referenceEdgeMm},options);
        if(!current())throw abort();
      }
      const result=await viewer.setElementContent(descriptor,options);if(!current())throw abort();
      if(result?.ready===false)throw Error(result.diagnostic||'Requested element content cannot be rendered.');
      job.layer=viewer.elementContentLayer;job.model=viewer.model;job.net=viewer.net;job.cellNet=viewer.cellNet;
      return result??{ready:true};
    })().catch(error=>{job.failed=true;throw error;}).finally(()=>{job.pending=false;});
  }
  const cancel=()=>job.controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  try{const result=await job.promise;verify();return result;}
  finally{signal?.removeEventListener('abort',cancel);}
}

export function attachElementContentCapture(viewer,{getState,describe,canMap=()=>true,referenceEdgeMm=()=>25,isCurrent=()=>true}){
  const capture=viewer.prepareCapture.bind(viewer);
  const wrapped=async(options={})=>{
    const state=getState(),current=()=>getState()===state&&isCurrent()&&options.isCurrent?.()!==false;
    await prepareElementContent(viewer,state,{describe,...options,isCurrent:current,canMap:canMap(viewer),referenceEdgeMm:referenceEdgeMm(viewer)});
    if(!current()||options.signal?.aborted)throw abort();
    const result=await capture({...options,isCurrent:current});if(!current()||options.signal?.aborted)throw abort();return result;
  };
  viewer.prepareCapture=wrapped;
  return ()=>{invalidateElementContent(viewer);if(viewer.prepareCapture===wrapped)viewer.prepareCapture=capture;};
}
