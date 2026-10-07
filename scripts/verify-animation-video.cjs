// Optional independent verification using FFprobe/FFmpeg. Production WebM
// export uses the browser encoder and does not require these executables.
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const execute=promisify(execFile);
async function raw(file){return (await execute('ffmpeg',['-v','error','-i',file,'-vsync','0','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{encoding:'buffer',maxBuffer:64*1024*1024,windowsHide:true})).stdout;}
function rmse(a,b){assert.equal(a.length,b.length);let sum=0;for(let index=0;index<a.length;index++)sum+=(a[index]-b[index])**2;return Math.sqrt(sum/a.length);}
function contentPixels(bytes,reference){const background=reference.subarray(0,3);let count=0;for(let index=0;index<bytes.length;index+=3)if(Math.abs(bytes[index]-background[0])+Math.abs(bytes[index+1]-background[1])+Math.abs(bytes[index+2]-background[2])>30)count++;return count;}
async function main(){
  const folder=path.resolve(process.argv[2]||'');if(!process.argv[2])throw new Error('Pass the animation smoke artifacts folder.');
  const video=path.join(folder,'rotation.webm');
  const {stdout}=await execute('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=codec_name,width,height,nb_read_frames','-of','json',video],{encoding:'utf8',windowsHide:true});
  const stream=JSON.parse(stdout).streams[0];assert.ok(Number(stream.nb_read_frames)>=2,'Both endpoint frames must decode.');
  const frames=await raw(video),bytes=stream.width*stream.height*3,first=frames.subarray(0,bytes),last=frames.subarray(frames.length-bytes);
  const expectedFirst=await raw(path.join(folder,'video-expected.frames','frame-000000.png'));
  const expectedLast=await raw(path.join(folder,'video-expected.frames','frame-000001.png'));
  const firstMatch=rmse(first,expectedFirst),lastMatch=rmse(last,expectedLast),firstOther=rmse(first,expectedLast),lastOther=rmse(last,expectedFirst);
  assert.ok(firstMatch<8&&lastMatch<8,`Decoded frames must match their expected PNG poses within compression tolerance (${firstMatch}, ${lastMatch}).`);
  assert.ok(firstOther>firstMatch+.25&&lastOther>lastMatch+.25,'Decoded endpoints must match their own expected poses more closely than the opposite poses.');
  const firstContent=contentPixels(first,expectedFirst),lastContent=contentPixels(last,expectedLast);assert.ok(firstContent>500&&lastContent>500,'Decoded endpoints must contain visible model pixels.');
  const result={passed:true,...stream,firstPoseRmse:firstMatch,endPoseRmse:lastMatch,firstOppositePoseRmse:firstOther,endOppositePoseRmse:lastOther,firstModelPixels:firstContent,endModelPixels:lastContent};
  await fs.writeFile(path.join(folder,'video-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
