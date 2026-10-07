/** Bind history reads to source-owned content while observer pose may change. */
const signature=state=>JSON.stringify([state?.model,state?.notes??'',state?.view?.coordinateUnit??'model',
  ...['elementAnnotations','elementContentDetached','elementContentTransfer','documentMetadata'].map(field=>state?.view?.[field]??null)]);

export function captureContentHistoryPublication(context){
  const state=context.getState(),owned=signature(state);
  return ()=>{
    if(context.getState()!==state||signature(state)!==owned)
      throw Error('Source element content, notes, units, or attributes changed during history replay or branch. Repeat it from the current source.');
  };
}
