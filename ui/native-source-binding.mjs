// Full model attributes bind a construction; observer motion remains independent.
import {storeMemory} from './model-memories.mjs';
import {memorySourceSignature} from './memory-source-signature.mjs';
const captures=new WeakMap();
function field(value,key){
  if(value===null||value===undefined)return undefined;
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(descriptor&&!('value' in descriptor))throw Error('Construction source fields must not contain accessors.');
  return descriptor?.value;
}
const unit=state=>field(field(state,'view'),'coordinateUnit')??field(field(field(state,'model'),'metadata'),'coordinateUnits')??'model';
function snapshot(context,{signatureOnly=false}={}){
  const state=context.getState(),document=context.getDocument(),model=field(state,'model');
  if(!model||!document)throw Error('Choose a source model.');
  const documentId=field(document,'id'),source={documentId,modelId:field(model,'id')};
  const entry=signatureOnly?memorySourceSignature(state,source):storeMemory(undefined,1,state,source).slots[0];
  return {project:context.getProject(),document,documentId,states:field(document,'states'),state,cursor:field(document,'cursor'),
    modelSignature:signatureOnly?entry.modelSignature:JSON.stringify(entry.state.model),notes:signatureOnly?entry.notes:entry.state.notes,unit:unit(state)};
}
export function captureNativeSource(context){
  if(context.isExporting?.())throw Error('Finish animation export before constructing geometry.');
  const owner=snapshot(context);captures.set(owner,owner.modelSignature);return owner;
}
export function verifyNativeSource(context,owner){
  if(context.isExporting?.())throw Error('Construction cannot publish during animation export.');
  // Only a real validated capture may supply the comparison certificate. Full
  // literal content and memory resource bounds are checked on every call.
  if(!captures.has(owner)||captures.get(owner)!==owner.modelSignature)throw Error('The construction source owner changed. Repeat the construction.');
  const current=snapshot(context,{signatureOnly:true});
  for(const key of ['project','document','documentId','states','state','cursor','modelSignature','notes','unit'])
    if(current[key]!==owner[key])throw Error('The source, units, notes, or attributes changed. Repeat the construction.');
}
