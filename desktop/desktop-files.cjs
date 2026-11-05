const path=require('node:path');
const fs=require('node:fs/promises');
const {randomUUID}=require('node:crypto');
const extensions=new Set(['.polyproj','.off','.dxf','.json']);
function filePath(value,{cwd=process.cwd(),paths=path}={}){
  if(typeof value!=='string'||!value||value.length>32768||/[\x00-\x1f]/.test(value))return null;
  if(value.startsWith('"')&&value.endsWith('"'))value=value.slice(1,-1);
  if(!value||value.startsWith('-')||/^[a-z][a-z\d+.-]*:/i.test(value)&&! /^[a-z]:[\\/]/i.test(value))return null;
  if(!extensions.has(paths.extname(value).toLowerCase()))return null;
  return paths.resolve(cwd,value);
}
function parseFileArguments(argv,{packaged=true,cwd=process.cwd(),paths=path}={}){
  if(!Array.isArray(argv))return [];
  const result=[],seen=new Set();let positional=false,skipValue=false;
  for(const arg of argv.slice(packaged?1:2)){
    if(skipValue){skipValue=false;if(typeof arg==='string'&&!arg.startsWith('-'))continue;}
    if(arg==='--'){positional=true;continue;}
    if(typeof arg!=='string')continue;
    if(!positional&&arg.startsWith('-')){skipValue=!arg.includes('=')&&!['--updated','--no-sandbox','--disable-gpu'].includes(arg);continue;}
    const file=filePath(arg,{cwd,paths});if(!file)continue;
    const key=file.toLowerCase();if(!seen.has(key)){seen.add(key);result.push(file);}
    if(result.length===10)break;
  }
  return result;
}
function createRecentFiles({file,io=fs,paths=path}){
  let entries=[],loaded=false,serial=Promise.resolve(),notice='';
  const key=value=>value.toLowerCase();
  async function load(){
    if(loaded)return;loaded=true;
    try{const data=JSON.parse(await io.readFile(file,'utf8'));if(!Array.isArray(data))throw Error('Invalid recent list');
      for(const item of data){const resolved=filePath(item,{paths});if(resolved&&paths.isAbsolute(item)&&!entries.some(p=>key(p)===key(resolved)))entries.push(resolved);if(entries.length===10)break;}
    }catch(error){if(error.code!=='ENOENT')notice='Recent files could not be read; starting a new list.';}
  }
  async function persist(){
    const temporary=file+'.tmp';await io.mkdir(paths.dirname(file),{recursive:true});
    try{await io.writeFile(temporary,JSON.stringify(entries),'utf8');await io.rename(temporary,file);}
    finally{await io.unlink(temporary).catch(()=>{});}
  }
  function task(work){const next=serial.catch(()=>{}).then(async()=>{await load();return work();});serial=next;return next;}
  return {
    add(value){return task(async()=>{const resolved=filePath(value,{paths});if(!resolved)throw Error('Choose a supported project or geometry file.');entries=[resolved,...entries.filter(p=>key(p)!==key(resolved))].slice(0,10);await persist();return entries.slice();});},
    list(){return task(async()=>{
      const missing=[];for(const entry of entries)try{const stat=await io.stat(entry);if(!stat.isFile())missing.push(entry);}catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))missing.push(entry);}
      if(missing.length){entries=entries.filter(p=>!missing.includes(p));await persist();notice=`Removed ${missing.length} missing file${missing.length===1?'':'s'} from Open Recent: ${missing.map(p=>paths.basename(p)).join(', ')}`;}
      const message=notice;notice='';return {files:entries.slice(),message};
    });}
  };
}
// Only main-created tokens authorize a path. Renderer callers cannot supply one.
function createOpenRequests({id=randomUUID,limit=40}={}){
  const pending=new Map(),queue=[];
  return {
    enqueue(file){if(pending.size>=limit)throw Error('Finish pending file opens before opening more.');const token=id();pending.set(token,file);queue.push(token);return token;},
    take(){return queue.shift()??null;},
    discard(token){pending.delete(token);const index=queue.indexOf(token);if(index>=0)queue.splice(index,1);},
    consume(token){if(typeof token!=='string'||!pending.has(token))throw Error('This file request expired. Open it again from File.');const file=pending.get(token);pending.delete(token);const index=queue.indexOf(token);if(index>=0)queue.splice(index,1);return file;},
    get size(){return pending.size;}
  };
}
function focusExistingWindow(window,hidden){
  if(hidden||!window||window.isDestroyed())return;
  if(window.isMinimized())window.restore();window.show();window.focus();
}
module.exports={filePath,parseFileArguments,createRecentFiles,createOpenRequests,focusExistingWindow};
