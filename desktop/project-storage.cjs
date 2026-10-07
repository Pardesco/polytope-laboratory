const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');

// Serialize publication to each destination while allowing independent files.
function createProjectStorage({writeProject,io=fs}={}){
  if(typeof writeProject!=='function')throw new TypeError('A validated project writer is required.');
  const pending=new Map();
  async function publish(destination,project,{backup=true}={}){
    const file=path.resolve(destination),key=process.platform==='win32'?file.toLowerCase():file;
    const prior=pending.get(key)||Promise.resolve();
    const next=prior.catch(()=>{}).then(async()=>{
      const token=randomUUID(),temporary=path.join(path.dirname(file),'.'+path.basename(file)+'.'+token+'.pending');
      const backupTemporary=temporary+'.backup';
      try{
        // Source validation and a complete fsynced file precede any old-file changes.
        await writeProject(temporary,project);
        if(backup){
          let copied=false;
          try{await io.copyFile(file,backupTemporary,1);copied=true;}
          catch(error){if(error.code!=='ENOENT')throw error;}
          if(copied){const handle=await io.open(backupTemporary,'r+');try{await handle.sync();}finally{await handle.close();}await io.rename(backupTemporary,file+'.bak');}
        }
        await io.rename(temporary,file);
        return {path:destination};
      }finally{
        for(const name of [temporary,backupTemporary])try{await io.unlink(name);}catch(error){if(error.code!=='ENOENT')throw error;}
      }
    });
    pending.set(key,next);
    try{return await next;}finally{if(pending.get(key)===next)pending.delete(key);}
  }
  return {publish};
}
module.exports={createProjectStorage};
