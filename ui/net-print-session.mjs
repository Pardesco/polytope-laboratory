/** The renderer rechecks the reviewed source after private print preparation. */
export async function publishNetPrint(api,content,{packed,signal,verifyPublication}={}){
  const canceled=()=>Object.assign(Error('Net printing canceled.'),{name:'AbortError'});
  const verify=()=>{if(signal?.aborted)throw canceled();verifyPublication();};
  verify();const id=crypto.randomUUID();let rejectCancel;
  const canceledWork=new Promise((_,reject)=>{rejectCancel=reject;});
  const cancel=()=>{api.abortNetPrint(id).catch(()=>{});rejectCancel(canceled());};
  signal?.addEventListener('abort',cancel,{once:true});
  try{
    const ticket=await Promise.race([api.beginNetPrint(id,{packed,content}),canceledWork]);verify();
    if(ticket?.id!==id)throw Error('Prepared print document does not match this request.');
    return await Promise.race([api.commitNetPrint(id),canceledWork]);
  }finally{signal?.removeEventListener('abort',cancel);await api.abortNetPrint(id);}
}
