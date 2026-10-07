import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {VP8WebmWriter} from '../ui/vp8-webm.mjs';
import {WebmFrameCounter} from '../ui/webm-frames.mjs';
const ffmpeg=process.env.POLYTOPE_FFMPEG||'ffmpeg',ffprobe=process.env.POLYTOPE_FFPROBE||'ffprobe';
const options={windowsHide:true,timeout:10000,maxBuffer:8*1024*1024};
const available=[ffmpeg,ffprobe].every(command=>spawnSync(command,['-version'],options).status===0);
const run=(command,args,input)=>{const r=spawnSync(command,args,{...options,input});assert.equal(r.status,0,r.stderr?.toString()||r.error?.message);return r.stdout;};

test('real VP8 packet payloads mux to decodable exact timestamp/keyframe WebM with every independent source endpoint', {skip:!available},()=>{
  const width=32,height=24,fps=8,colors=[[210,35,45],[40,200,65],[35,60,220],[180,70,205]];
  const inputs=colors.map(color=>{const rgb=Buffer.alloc(width*height*3);for(let at=0;at<rgb.length;at+=3)rgb.set(color,at);return rgb;});
  const ivf=run(ffmpeg,['-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',`${width}x${height}`,'-r',String(fps),'-i','pipe:0',
    '-frames:v','4','-c:v','libvpx','-deadline','good','-lag-in-frames','0','-auto-alt-ref','0','-f','ivf','pipe:1'],Buffer.concat(inputs));
  assert.equal(ivf.subarray(0,4).toString(),'DKIF');assert.equal(ivf.subarray(8,12).toString(),'VP80');
  const packets=[];let offset=32;
  while(offset<ivf.length){const size=ivf.readUInt32LE(offset),stamp=ivf.readBigUInt64LE(offset+4);offset+=12;assert.ok(offset+size<=ivf.length);packets.push({stamp:Number(stamp),data:ivf.subarray(offset,offset+size)});offset+=size;}
  assert.equal(packets.length,4);
  const timestamps=[0,125000,250000,375000],writer=new VP8WebmWriter({width,height,fps,timestamps,durations:Array(4).fill(125000)}),chunks=[writer.begin()];
  packets.forEach((p,index)=>{assert.equal(p.stamp,index);chunks.push(writer.frame({timestamp:timestamps[index],type:p.data[0]&1?'delta':'key',data:Uint8Array.from(p.data)}));});chunks.push(writer.finish());
  const bytes=Buffer.concat(chunks),counter=new WebmFrameCounter();for(const data of chunks)counter.feed(data);assert.equal(counter.frames,4);
  const proof=JSON.parse(run(ffprobe,['-v','error','-f','matroska','-i','pipe:0','-show_entries','stream=codec_name,width,height:frame=pts_time,key_frame','-of','json'],bytes).toString());
  assert.equal(proof.streams[0].codec_name,'vp8');assert.equal(proof.streams[0].width,width);assert.equal(proof.streams[0].height,height);
  assert.deepEqual(proof.frames.map(f=>Number(f.pts_time)),timestamps.map(t=>t/1e6));assert.equal(proof.frames[0].key_frame,1);
  const decoded=run(ffmpeg,['-v','error','-f','matroska','-i','pipe:0','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],bytes),size=width*height*3;
  assert.equal(decoded.length,4*size);
  for(let index=0;index<4;index++){
    const frame=decoded.subarray(index*size,(index+1)*size),errors=inputs.map(reference=>frame.reduce((sum,value,n)=>sum+Math.abs(value-reference[n]),0)/size);
    assert.equal(errors.indexOf(Math.min(...errors)),index,'Every decoded pose must match its unique source among ALL candidates.');
    assert.ok(errors[index]<5);assert.ok(errors.every((e,n)=>n===index||e>40));
  }
});

test('timestamp microsecond precision does not truncate irregular literal endpoints', {skip:!available},()=>{
  const pixels=Buffer.alloc(16*16*3,190),ivf=run(ffmpeg,['-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','16x16','-r','24','-i','pipe:0',
    '-frames:v','2','-c:v','libvpx','-lag-in-frames','0','-f','ivf','pipe:1'],Buffer.concat([pixels,pixels]));
  let at=32;const packets=[];while(at<ivf.length){const size=ivf.readUInt32LE(at);at+=12;packets.push(ivf.subarray(at,at+size));at+=size;}
  const writer=new VP8WebmWriter({width:16,height:16,fps:24,timestamps:[0,137531],durations:[137531,41667]}),chunks=[writer.begin()];
  packets.forEach((data,index)=>chunks.push(writer.frame({timestamp:index?137531:0,type:data[0]&1?'delta':'key',data:Uint8Array.from(data)})));chunks.push(writer.finish());
  const proof=JSON.parse(run(ffprobe,['-v','error','-i','pipe:0','-show_entries','frame=pts_time','-of','json'],Buffer.concat(chunks)).toString());
  assert.deepEqual(proof.frames.map(f=>Number(f.pts_time)),[0,.137531]);
});
