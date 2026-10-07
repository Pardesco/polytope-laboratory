// Decode native frames without FFmpeg's default frame-rate duplication or an
// output-sized memory buffer. Keep just the first, last and current RGB frame.
const {spawn}=require('node:child_process');
async function decodeEndpoints(command,file,width,height){
  const size=width*height*3;
  if(!Number.isSafeInteger(size)||size<3||size>4096*4096*3)throw Error('Invalid endpoint proof dimensions.');
  return new Promise((resolve,reject)=>{
    const child=spawn(command,['-v','error','-i',file,'-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true});
    const frame=Buffer.alloc(size);let offset=0,count=0,first,last,stderr='',settled=false;
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(result);};
    const timer=setTimeout(()=>{child.kill();finish(Error('Endpoint decoding exceeded 30 seconds.'));},30000);
    child.on('error',error=>finish(error));
    child.stderr.on('data',chunk=>{if(stderr.length<65536)stderr+=chunk.toString();});
    child.stdout.on('data',chunk=>{
      for(let start=0;start<chunk.length;){
        const length=Math.min(size-offset,chunk.length-start);
        chunk.copy(frame,offset,start,start+length);offset+=length;start+=length;
        if(offset===size){count++;if(!first)first=Buffer.from(frame);last=Buffer.from(frame);offset=0;}
      }
    });
    child.on('close',code=>{
      if(code!==0)return finish(Error(`Endpoint decoding exited ${code}: ${stderr}`));
      if(offset||count<2)return finish(Error(`Incomplete endpoint frame stream (${count} frames, ${offset} trailing bytes).`));
      finish(null,{first,last,count});
    });
  });
}
module.exports={decodeEndpoints};
