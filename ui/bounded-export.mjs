// Native exports remain private until the originating source is rechecked.
export async function publishBoundedExport(api,format,payload,{signal,verifyPublication,defaultName='Supporting panels'}={}){
  const verify=()=>{
    if(signal?.aborted)throw Object.assign(Error('Export canceled.'),{name:'AbortError'});
    verifyPublication?.();
  };
  verify();let ticket;
  const abort=()=>{if(ticket)api.abortTextExport(ticket.id).catch(()=>{});};
  signal?.addEventListener('abort',abort,{once:true});
  try{
    ticket=await api.beginTextExport({format,defaultName:defaultName+'.'+format});
    verify();if(!ticket)return null;
    let data=payload;
    if(format==='pdf'){
      data=await api.renderPackedNetPdf(payload);
      verify();
    }
    verify();
    const result=await api.writeTextExport(ticket.id,data);
    ticket=null;
    return result;
  }finally{
    signal?.removeEventListener('abort',abort);
    if(ticket)await api.abortTextExport(ticket.id);
  }
}
