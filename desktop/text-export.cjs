const fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {performance}=require('node:perf_hooks');

const TEXT_EXPORT_LIMITS=Object.freeze({bytes:32*1024*1024,sessions:4,expiryMs:5*60*1000});
const canceled=message=>Object.assign(new Error(message),{name:'AbortError'});
function requireValue(ok,message){if(!ok)throw new TypeError(message);}
function wellFormed(text){
  for(let i=0;i<text.length;i++){
    const n=text.charCodeAt(i);
    if(n>=0xd800&&n<=0xdbff){const next=text.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}
    else if(n>=0xdc00&&n<=0xdfff)return false;
  }
  return true;
}
function destination(value){
  requireValue(typeof value==='string'&&value.length>0&&value.length<=32767&&wellFormed(value)&&!/\x00|[\x01-\x1f]/.test(value),'Text export needs a literal valid file path.');
  requireValue(path.isAbsolute(value)&&!/[\\/]$/.test(value),'Text export needs an absolute file destination.');
  const file=path.resolve(value),base=path.basename(file);
  requireValue(base!=='.'&&base!=='..'&&file!==path.parse(file).root,'Text export needs a file destination.');
  if(process.platform==='win32')requireValue(!/[<>:"|?*]/.test(base)&&!/[. ]$/.test(base)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base),'Text export file name is invalid.');
  return file;
}

/** A renderer verifies its source after begin's dialog and before write.
 * Tickets authorize only the exact user-selected destination, once. */
function createTextExport({selectPath,io=fs,now=()=>performance.now(),randomId=randomUUID,ttlMs=TEXT_EXPORT_LIMITS.expiryMs,maxSessions=TEXT_EXPORT_LIMITS.sessions}={}){
  requireValue(typeof selectPath==='function','Text export needs a destination selector.');
  requireValue(Number.isFinite(ttlMs)&&ttlMs>0&&ttlMs<=TEXT_EXPORT_LIMITS.expiryMs,'Text export expiry is outside its bound.');
  requireValue(Number.isInteger(maxSessions)&&maxSessions>0&&maxSessions<=TEXT_EXPORT_LIMITS.sessions,'Text export session count is outside its bound.');
  requireValue(typeof now==='function'&&typeof randomId==='function','Text export needs clock and ticket functions.');
  const sessions=new Map(),pending=new Map();let closed=false;
  const time=()=>{const value=now();requireValue(Number.isFinite(value),'Text export clock is invalid.');return value;};
  const retire=(record,error)=>{if(!record.error)record.error=error;record.controller.abort();if(sessions.get(record.id)===record)sessions.delete(record.id);};
  const reap=()=>{const current=time();for(const record of sessions.values())if(current>=record.expires)retire(record,canceled('Text export ticket expired.'));};
  const check=record=>{reap();if(closed||record.error||record.controller.signal.aborted||sessions.get(record.id)!==record)throw record.error||canceled('Text export canceled.');};
  const listen=(record,signal)=>{const abort=()=>retire(record,canceled('Text export canceled.'));signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();return()=>signal?.removeEventListener('abort',abort);};
  const idValue=id=>requireValue(typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id),'Text export ticket is invalid.');
  async function begin(params,{signal}={}){
    requireValue(params&&typeof params==='object'&&!Array.isArray(params)&&Object.keys(params).length===2&&Object.hasOwn(params,'format')&&Object.hasOwn(params,'defaultName'),'Text export requires format and defaultName only.');
    const {format,defaultName}=params;
    requireValue(['csv','json','svg','pdf'].includes(format),'Text export format is unsupported.');
    requireValue(typeof defaultName==='string'&&defaultName.length>0&&defaultName.length<=240&&wellFormed(defaultName)&&!/[\\/:\x00-\x1f]/.test(defaultName)&&!['.','..'].includes(defaultName),'Text export default name must be a literal file name.');
    reap();if(closed)throw canceled('Text export is closed.');if(signal?.aborted)throw canceled('Text export canceled.');
    requireValue(sessions.size<maxSessions,'Finish or cancel the pending text exports first.');
    const id=randomId();idValue(id);requireValue(!sessions.has(id),'Text export ticket collision.');
    const record={id,format,expires:time()+ttlMs,state:'selecting',controller:new AbortController(),path:null,error:null};sessions.set(id,record);const remove=listen(record,signal);
    let rejectAbort;const interrupted=new Promise((_,reject)=>{rejectAbort=()=>reject(record.error||canceled('Text export canceled.'));record.controller.signal.addEventListener('abort',rejectAbort,{once:true});});
    try{
      check(record);
      const selected=await Promise.race([Promise.resolve().then(()=>{check(record);return selectPath({format,defaultName,signal:record.controller.signal});}),interrupted]);check(record);
      const value=typeof selected==='string'?selected:selected?.canceled===true?null:selected?.filePath;
      if(selected==null||value===null){retire(record,canceled('Text export destination selection canceled.'));return null;}
      record.path=destination(value);
      // Checking a confirmed existing directory never creates an output file.
      if(typeof io.stat==='function'){
        try{const info=await io.stat(record.path);check(record);requireValue(info.isFile(),'Text export needs a file destination.');}
        catch(error){if(error.code!=='ENOENT')throw error;}
      }
      check(record);record.state='ready';return {id,path:record.path};
    }catch(error){retire(record,error);throw error;}
    finally{remove();record.controller.signal.removeEventListener('abort',rejectAbort);}
  }
  async function write(id,text,{signal}={}){
    idValue(id);reap();const record=sessions.get(id);
    requireValue(record&&record.state==='ready','Text export ticket is unavailable or already used.');
    record.state='writing';const remove=listen(record,signal);let operation;
    try{
      check(record);
      let data;
      if(record.format==='pdf'){
        requireValue(text instanceof Uint8Array,'PDF export needs Buffer or Uint8Array bytes.');
        requireValue(text.byteLength<=TEXT_EXPORT_LIMITS.bytes,'PDF export output exceeds 32 MiB.');
        // Electron invoke transports binary output as Uint8Array. Copy only the
        // selected view before any await, so later caller mutation cannot alter it.
        data=Buffer.from(text);
      }else{
        requireValue(typeof text==='string'&&text.length<=TEXT_EXPORT_LIMITS.bytes&&wellFormed(text),'Text export needs literal well-formed Unicode text within 32 MiB.');
        requireValue(Buffer.byteLength(text,'utf8')<=TEXT_EXPORT_LIMITS.bytes,'Text export UTF-8 output exceeds 32 MiB.');
        data=Buffer.from(text,'utf8');
      }
      const key=process.platform==='win32'?record.path.toLowerCase():record.path,prior=pending.get(key)||Promise.resolve();
      operation=prior.catch(()=>{}).then(async()=>{
        check(record);const temporary=path.join(path.dirname(record.path),'.'+path.basename(record.path)+'.'+randomUUID()+'.text-export-pending');
        let handle,created=false,failure,result;
        try{
          handle=await io.open(temporary,'wx',0o600);created=true;check(record);
          await handle.writeFile(data);check(record);await handle.sync();check(record);await handle.close();handle=null;check(record);
          // Rename is the sole publication point. A prior destination stays
          // untouched until a complete fsynced sibling exists.
          await io.rename(temporary,record.path);result={path:record.path,format:record.format,bytes:data.length};
        }catch(error){failure=error;}
        finally{
          if(handle)try{await handle.close();}catch(error){failure??=error;}
          if(created)try{await io.unlink(temporary);}catch(error){if(error.code!=='ENOENT')failure??=error;}
        }
        if(failure)throw failure;return result;
      });
      pending.set(key,operation);
      try{return await operation;}finally{if(pending.get(key)===operation)pending.delete(key);}
    }finally{remove();retire(record,canceled('Text export ticket was consumed.'));}
  }
  function abort(id){idValue(id);reap();const record=sessions.get(id);if(!record)return false;retire(record,canceled('Text export canceled.'));return true;}
  function dispose(){closed=true;for(const record of sessions.values())retire(record,canceled('Text export is closed.'));}
  return {begin,write,abort,dispose};
}
module.exports={createTextExport,TEXT_EXPORT_LIMITS};
