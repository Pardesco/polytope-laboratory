const {randomUUID}=require('node:crypto');
const abort=()=>Object.assign(Error('File loading canceled.'),{name:'AbortError'});
const missingFile=error=>/ENOENT|no such file|cannot find|WinError 2|Errno 2/i.test(error.message);

// Own the dialog-to-worker gap as well as the actual native file read. Cancel
// cannot close the OS chooser, but it must prevent a late chooser from reading.
function createWorkspaceReads({chooseFile,read,recoveryPath,recoveryBackupPath,isInUse=()=>false,maxPending=40}){
  const pending=new Map();let closed=false;
  async function run(id,work){
    if(closed)throw Error('Workspace file loading is shutting down.');
    if(id===undefined)id=randomUUID();
    if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw Error('Use a bounded file load ID.');
    if(pending.has(id)||isInUse(id))throw Error('Duplicate job ID.');
    if(pending.size>=maxPending)throw Error('Finish or cancel pending file loads before opening more.');
    const job={cancelled:false};pending.set(id,job);
    const check=()=>{if(closed||job.cancelled||pending.get(id)!==job)throw abort();};
    try{return await work(id,check);}catch(error){check();throw error;}
    finally{if(pending.get(id)===job)pending.delete(id);}
  }
  return {
    has:id=>pending.has(id),
    cancel(id){const job=pending.get(id);if(!job)return false;job.cancelled=true;return true;},
    open(id){return run(id,async(id,check)=>{
      const selected=await chooseFile();check();if(!selected||selected.canceled)return null;
      const file=selected.filePaths?.[0];if(typeof file!=='string'||!file)throw Error('Choose a project or geometry file.');
      let result;try{result=await read(file,id);}catch(error){check();throw error;}
      check();return {...result,path:file};
    });},
    openPath(file,id){return run(id,async(id,check)=>{
      if(typeof file!=='string'||!file)throw Error('Choose a project or geometry file.');
      const result=await read(file,id);check();return {...result,path:file};
    });},
    recover(id){return run(id,async(id,check)=>{
      try{const result=await read(recoveryPath(),id);check();if(!result?.project)throw Error('Latest recovery snapshot does not contain a project.');return result;}
      catch(error){
        check();if(error.name==='AbortError'||/cancelled|canceled/i.test(error.message))throw error;
        const missing=missingFile(error);
        if(!recoveryBackupPath){if(missing)return null;throw error;}
        let previous;
        try{previous=await read(recoveryBackupPath(),id);check();}
        catch(backupError){
          check();if(backupError.name==='AbortError'||/cancelled|canceled/i.test(backupError.message))throw backupError;
          if(missing&&missingFile(backupError))return null;
          throw Error('No usable recovery snapshot. Latest: '+error.message+' Previous: '+backupError.message);
        }
        if(!previous?.project)throw Error('Previous recovery snapshot does not contain a project.');
        return {...previous,recoveryWarning:'Latest autosave could not be read ('+error.message+'). Recovered the previous snapshot; newer changes may be missing.'};
      }
    });},
    dispose(){closed=true;for(const job of pending.values())job.cancelled=true;}
  };
}
module.exports={createWorkspaceReads};
