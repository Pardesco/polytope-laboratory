// Optional independent codec verification; FFmpeg is not an app dependency.
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {AVCMp4Writer} from '../ui/avc-mp4.mjs';
import {GifWriter} from '../ui/gif-encoder.mjs';
const directory=path.resolve(process.argv[2]||'artifacts/w36-media-verification');await mkdir(directory,{recursive:true});
const run=(tool,args)=>execFileSync(tool,args,{windowsHide:true,encoding:'utf8'});
const raw=path.join(directory,'reference.h264');
run('ffmpeg',['-y','-v','error','-f','lavfi','-i','testsrc=size=64x48:rate=12','-frames:v','3','-c:v','libx264','-profile:v','baseline','-pix_fmt','yuv420p','-x264-params','aud=1:bframes=0:keyint=1','-f','h264',raw]);
const data=await readFile(raw),starts=[];
for(let i=0;i<data.length-3;i++)if(data[i]===0&&data[i+1]===0&&(data[i+2]===1||data[i+2]===0&&data[i+3]===1)){const length=data[i+2]===1?3:4;starts.push({start:i,data:i+length});i+=length-1;}
const nals=starts.map((s,i)=>data.subarray(s.data,starts[i+1]?.start??data.length)),sps=nals.find(n=>(n[0]&31)===7),pps=nals.find(n=>(n[0]&31)===8);
const u16=n=>Buffer.from([n>>8,n&255]),u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
const description=Buffer.concat([Buffer.from([1,sps[1],sps[2],sps[3],255,225]),u16(sps.length),sps,Buffer.from([1]),u16(pps.length),pps]);
const samples=[];let current=[];for(const nal of nals){const type=nal[0]&31;if(type===9){if(current.length)samples.push(Buffer.concat(current));current=[];}else if(![7,8].includes(type))current.push(u32(nal.length),nal);}if(current.length)samples.push(Buffer.concat(current));assert.equal(samples.length,3);
const mp4=new AVCMp4Writer({width:64,height:48,fps:12,timestamps:[0,83333,166667]}),parts=[mp4.begin()];samples.forEach((sample,i)=>parts.push(mp4.frame({timestamp:Math.round(i*1e6/12),type:'key',data:new Uint8Array(sample),description})));parts.push(mp4.finish());await writeFile(path.join(directory,'verified.mp4'),Buffer.concat(parts));
const gif=new GifWriter({width:64,height:48,loopCount:0}),images=[gif.begin()];
for(let frame=0;frame<3;frame++){const pixels=Uint8ClampedArray.from({length:64*48*4},(_,i)=>i%4===3?255:(i*13+frame*61)%256);images.push(gif.frame(pixels,8,{dither:true}));}images.push(gif.finish());await writeFile(path.join(directory,'verified.gif'),Buffer.concat(images));
const report={};for(const format of ['mp4','gif']){const file=path.join(directory,'verified.'+format);run('ffmpeg',['-v','error','-i',file,'-f','null','-']);const probe=JSON.parse(run('ffprobe',['-v','error','-count_frames','-show_entries','stream=codec_name,width,height,pix_fmt,r_frame_rate,nb_read_frames','-of','json',file]));const stream=probe.streams[0];assert.equal(Number(stream.nb_read_frames),3);assert.equal(stream.width,64);assert.equal(stream.height,48);report[format]=stream;}assert.equal(report.mp4.pix_fmt,'yuv420p');assert.equal(report.mp4.codec_name,'h264');await writeFile(path.join(directory,'verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
