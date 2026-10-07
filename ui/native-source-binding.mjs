// Full model attributes bind a construction; observer motion remains independent.
import {storeMemory} from './model-memories.mjs';
const unit=state=>state.view?.coordinateUnit??state.model?.metadata?.coordinateUnits??'model';
function snapshot(context){
  const state=context.getState(),document=context.getDocument();
  if(!state?.model||!document)throw Error('Choose a source model.');
  const entry=storeMemory(undefined,1,state,{documentId:document.id,modelId:state.model.id}).slots[0];
  return {project:context.getProject(),document,documentId:document.id,states:document.states,state,cursor:document.cursor,
    modelSignature:JSON.stringify(entry.state.model),notes:entry.state.notes,unit:unit(state)};
}
export function captureNativeSource(context){
  if(context.isExporting?.())throw Error('Finish animation export before constructing geometry.');
  return snapshot(context);
}
export function verifyNativeSource(context,owner){
  if(context.isExporting?.())throw Error('Construction cannot publish during animation export.');
  const current=snapshot(context);
  for(const key of ['project','document','documentId','states','state','cursor','modelSignature','notes','unit'])
    if(current[key]!==owner[key])throw Error('The source, units, notes, or attributes changed. Repeat the construction.');
}
