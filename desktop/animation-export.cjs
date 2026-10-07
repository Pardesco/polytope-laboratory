const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');

const LIMITS=Object.freeze({frames:18001,chunkBytes:32*1024*1024,totalBytes:512*1024*1024,pixels:33554432});
const PNG_SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
const WEBM_SIGNATURE=Buffer.from([0x1a,0x45,0xdf,0xa3]);

function validateExportOptions(options){
  if(!options || !['png','webm'].includes(options.format))throw new Error('Animation export format must be PNG or WebM.');
  if(!Number.isInteger(options.fps) || options.fps<1 || options.fps>60)throw new Error('Animation frame rate must be from 1 to 60.');
  if(!Number.isInteger(options.frameCount) || options.frameCount<2 || options.frameCount>LIMITS.frames)throw new Error('Invalid animation frame count.');
  if(options.duration!==undefined && (typeof options.duration!=='number' || !Number.isFinite(options.duration) || options.duration<=0 || options.duration>300 || Math.ceil(options.duration*options.fps)+1!==options.frameCount))throw new Error('Invalid animation duration or frame count.');
  const name=typeof options.name==='string'?options.name.replace(/[^a-zA-Z0-9 _-]/g,'').slice(0,100):'Polytope';
  return {format:options.format,fps:options.fps,frameCount:options.frameCount,name:name||'Polytope',...(options.duration===undefined?{}:{duration:options.duration})};
}

function decodeChunk(data,format){
  let buffer;
  if(format==='png'){
    if(typeof data!=='string' || !/^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length>Math.ceil(LIMITS.chunkBytes*4/3)+30)throw new Error('Invalid PNG frame.');
    buffer=Buffer.from(data.slice(22),'base64');
    if(buffer.length<33 || !buffer.subarray(0,8).equals(PNG_SIGNATURE) || buffer.readUInt32BE(8)!==13 || buffer.toString('ascii',12,16)!=='IHDR')throw new Error('Invalid PNG header.');
    const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20);
    if(!width || !height || width>8192 || height>8192 || width*height>LIMITS.pixels)throw new Error('PNG frame dimensions exceed the export limit.');
  }else{
    if(!(data instanceof Uint8Array) && !Buffer.isBuffer(data) && !(data instanceof ArrayBuffer))throw new Error('Invalid WebM chunk.');
    if(data.byteLength>LIMITS.chunkBytes)throw new Error('Animation chunk exceeds the 32 MiB limit.');
    buffer=Buffer.from(data instanceof ArrayBuffer?new Uint8Array(data):data);
  }
  if(!buffer.length || buffer.length>LIMITS.chunkBytes)throw new Error('Animation chunk exceeds the 32 MiB limit.');
  return buffer;
}

/** outputPath must come exclusively from a native dialog in the trusted main
 * process. Renderer IPC carries only the returned opaque session identifier. */
function createAnimationExportManager(){
  const sessions=new Map();
  let opening=0;
  async function begin(options,outputPath){
    const spec=validateExportOptions(options);
    if(sessions.size+opening>=2)throw new Error('Finish or cancel existing animation exports first.');
    if(typeof outputPath!=='string' || !path.isAbsolute(outputPath))throw new Error('Choose an absolute animation destination using the native dialog.');
    const resolved=path.resolve(outputPath);
    if(resolved===path.parse(resolved).root)throw new Error('Choose a file or a new frames folder.');
    opening++;
    try{
    if(spec.format==='png'){
      try{await fs.lstat(resolved);throw new Error('Choose a new frames folder; existing folders are never overwritten.');}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    const id=crypto.randomUUID(),temporary=await fs.mkdtemp(path.join(path.dirname(resolved),'.polytope-animation-'));
    let file;
    try{if(spec.format==='webm')file=await fs.open(path.join(temporary,'video.webm'),'wx');}
    catch(error){await fs.rm(temporary,{recursive:true,force:true});throw error;}
    sessions.set(id,{...spec,outputPath:resolved,temporary,file,count:0,bytes:0,headerBytes:0,busy:false});
    return {id,format:spec.format};
    }finally{opening--;}
  }
  function get(id){if(typeof id!=='string' || !sessions.has(id))throw new Error('Unknown or finished animation export.');return sessions.get(id);}
  async function lock(id,operation){const session=get(id);if(session.busy)throw new Error('An animation write is already in progress.');session.busy=true;let release;session.idle=new Promise(resolve=>{release=resolve;});try{return await operation(session);}finally{session.busy=false;release();}}
  async function write(id,index,data){return lock(id,async session=>{
    if(!Number.isInteger(index) || index!==session.count)throw new Error('Animation chunks must arrive in consecutive order.');
    if(session.format==='png' && index>=session.frameCount)throw new Error('Too many animation frames.');
    if(session.format==='webm' && index>LIMITS.frames*4)throw new Error('Too many WebM chunks.');
    const buffer=decodeChunk(data,session.format);
    if(session.bytes+buffer.length>LIMITS.totalBytes)throw new Error('Animation export exceeds the 512 MiB limit.');
    const headerCount=session.format==='webm'?Math.min(buffer.length,4-session.headerBytes):0;
    if(headerCount && !buffer.subarray(0,headerCount).equals(WEBM_SIGNATURE.subarray(session.headerBytes,session.headerBytes+headerCount)))throw new Error(`Invalid WebM header (${buffer.subarray(0,8).toString('hex')}; ${buffer.length} bytes).`);
    if(session.format==='png')await fs.writeFile(path.join(session.temporary,`frame-${String(index).padStart(6,'0')}.png`),buffer,{flag:'wx'});
    else await session.file.writeFile(buffer);
    session.count++;session.bytes+=buffer.length;session.headerBytes+=headerCount;
    return {count:session.count,bytes:session.bytes};
  });}
  async function finish(id){return lock(id,async session=>{
    if(!session.count || session.format==='png' && session.count!==session.frameCount || session.format==='webm' && session.headerBytes<4)throw new Error('Animation export is incomplete.');
    if(session.file){await session.file.close();session.file=null;await fs.rename(path.join(session.temporary,'video.webm'),session.outputPath);await fs.rmdir(session.temporary);}
    else{
      await fs.writeFile(path.join(session.temporary,'sequence.json'),JSON.stringify({version:1,name:session.name,fps:session.fps,frameCount:session.count,duration:session.duration,firstFrame:'frame-000000.png',endpointIncluded:true,...(session.duration===undefined?{}:{frameTimes:Array.from({length:session.count},(_,index)=>Math.min(index/session.fps,session.duration))})},null,2),{flag:'wx'});
      try{await fs.lstat(session.outputPath);throw new Error('The frames destination already exists.');}catch(error){if(error.code!=='ENOENT')throw error;}
      await fs.rename(session.temporary,session.outputPath);
    }
    sessions.delete(id);return {path:session.outputPath,frameCount:session.frameCount,bytes:session.bytes};
  });}
  async function abort(id){if(!sessions.has(id))return false;const session=get(id);if(session.busy)await session.idle;if(!sessions.has(id))return false;return lock(id,async session=>{if(session.file)await session.file.close();await fs.rm(session.temporary,{recursive:true,force:true});sessions.delete(id);return true;});}
  async function abortAll(){await Promise.allSettled([...sessions.keys()].map(abort));}
  return {begin,write,finish,abort,abortAll};
}

module.exports={createAnimationExportManager,validateExportOptions,decodeChunk,LIMITS};
