// Unmounted bounded VP8-only streaming WebM writer. No bitstream transcoding.
const LIMIT=32*1024*1024,TOTAL=512*1024*1024;
const fail=message=>{throw Error(message);};
const integer=(x,min,max,label)=>Number.isSafeInteger(x)&&x>=min&&x<=max?x:fail('Invalid '+label+'.');
function uint(value){integer(value,0,Number.MAX_SAFE_INTEGER,'EBML integer');const out=[];do{out.unshift(value%256);value=Math.floor(value/256);}while(value);return Uint8Array.from(out);}
function size(value){integer(value,0,TOTAL,'element size');let n=1;while(value>=2**(7*n)-1)n++;const out=new Uint8Array(n);for(let i=n-1;i>=0;i--){out[i]=value%256;value=Math.floor(value/256);}out[0]|=1<<(8-n);return out;}
function join(...parts){const length=parts.reduce((n,p)=>n+p.length,0);if(length>LIMIT)fail('WebM chunk exceeds 32 MiB.');const out=new Uint8Array(length);let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
const element=(id,data)=>join(uint(id),size(data.length),data),number=(id,n)=>element(id,uint(n));
const text=(id,s)=>element(id,new TextEncoder().encode(s));
function float(id,x){if(!Number.isFinite(x)||x<0)fail('Invalid duration.');const data=new Uint8Array(8);new DataView(data.buffer).setFloat64(0,x);return element(id,data);}
const master=(id,...children)=>element(id,join(...children));
const seek=(id,position)=>master(0x4dbb,element(0x53ab,uint(id)),number(0x53ac,position));

export class VP8WebmWriter{
  constructor({width,height,fps,timestamps,durations,maximumBytes=TOTAL}){
    integer(width,1,8192,'width');integer(height,1,8192,'height');integer(fps,1,60,'fps');
    integer(maximumBytes,1,TOTAL,'byte budget');
    if(!Array.isArray(timestamps)||!Array.isArray(durations)||timestamps.length!==durations.length||timestamps.length<1||timestamps.length>18001)fail('Invalid bounded frame timeline.');
    timestamps.forEach((t,i)=>{integer(t,0,300000000,'timestamp');integer(durations[i],1,1000000,'frame duration');if(i&&t<=timestamps[i-1])fail('Video timestamps must increase.');});
    this.timestamps=timestamps.slice();this.durations=durations.slice();this.maximumBytes=maximumBytes;this.total=0;this.position=0;this.index=0;this.cues=[];this.started=false;this.finished=false;
    const ebml=master(0x1a45dfa3,number(0x4286,1),number(0x42f7,1),number(0x42f2,4),number(0x42f3,8),text(0x4282,'webm'),number(0x4287,2),number(0x4285,2));
    this.info=master(0x1549a966,number(0x2ad7b1,1000),float(0x4489,timestamps.at(-1)+durations.at(-1)),text(0x4d80,'Polytope VP8 prototype'),text(0x5741,'Polytope VP8 prototype'));
    this.tracks=master(0x1654ae6b,master(0xae,number(0xd7,1),number(0x73c5,1),number(0x83,1),number(0x9c,0),text(0x86,'V_VP8'),
      number(0x23e383,Math.round(1e9/fps)),master(0xe0,number(0xb0,width),number(0xba,height),number(0x54b0,width),number(0x54ba,height))));
    // Unknown-sized Segment permits native append-only staging. Metadata's
    // positions are known now; cues and their final seek entry follow frames.
    const head=master(0x114d9b74,seek(0x1549a966,0),seek(0x1654ae6b,this.info.length));
    this.metadata=join(this.info,this.tracks,head);
    this.header=join(ebml,uint(0x18538067),Uint8Array.from([1,255,255,255,255,255,255,255]),this.metadata);
  }
  account(bytes){if(this.total+bytes.length>this.maximumBytes)fail('WebM exceeds the bounded output size.');this.total+=bytes.length;return bytes;}
  begin(){if(this.started)fail('WebM header already emitted.');this.started=true;this.position=this.metadata.length;return this.account(this.header.slice());}
  frame({timestamp,type,data}){
    if(!this.started||this.finished||this.index>=this.timestamps.length)fail('Unexpected video frame.');
    if(timestamp!==this.timestamps[this.index])fail('Encoder output timestamp does not own the submitted pose.');
    if(type!=='key'&&type!=='delta'||this.index===0&&type!=='key')fail('Invalid initial/keyframe type.');
    if(!(data instanceof Uint8Array)||Object.getPrototypeOf(data)!==Uint8Array.prototype||data.length<1||data.length>LIMIT-1024)fail('Invalid bounded VP8 payload.');
    // One finite Cluster per frame makes signed relative timecode exactly0;
    // absolute microsecond timestamps have no int16 wrap or pose-time alias.
    const block=element(0xa3,join(Uint8Array.from([0x81,0,0,type==='key'?0x80:0]),data));
    const result=master(0x1f43b675,number(0xe7,timestamp),block);
    if(type==='key')this.cues.push({time:timestamp,position:this.position});
    this.position+=result.length;this.index++;return this.account(result);
  }
  finish(){
    if(!this.started||this.finished||this.index!==this.timestamps.length)fail('Encoded video is incomplete.');
    const position=this.position;
    const cues=master(0x1c53bb6b,...this.cues.map(c=>master(0xbb,number(0xb3,c.time),master(0xb7,number(0xf7,1),number(0xf1,c.position)))));
    const result=join(cues,master(0x114d9b74,seek(0x1c53bb6b,position)));
    this.finished=true;this.position+=result.length;return this.account(result);
  }
}
