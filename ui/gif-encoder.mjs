const require=(ok,message)=>{if(!ok)throw Error(message);};
const word=n=>[n&255,n>>8&255];
const ascii=s=>Array.from(s,c=>c.charCodeAt(0));
export function gifHistogram(rgba,histogram=new Uint32Array(32768)){
  require(rgba instanceof Uint8Array||rgba instanceof Uint8ClampedArray,'GIF pixels must be bytes.');require(rgba.length%4===0&&histogram.length===32768,'Invalid GIF pixels or histogram.');
  // Bound palette analysis cost independently of output dimensions.
  const step=Math.max(1,Math.ceil(rgba.length/4/65536));
  for(let p=0;p<rgba.length;p+=4*step){const key=(rgba[p]>>3)<<10|(rgba[p+1]>>3)<<5|rgba[p+2]>>3;histogram[key]++;}
  return histogram;
}
export function gifPalette(histogram,maxColors=256){
  require(Number.isInteger(maxColors)&&maxColors>=2&&maxColors<=256&&histogram.length===32768,'GIF palette requires 2 to 256 colors.');
  const points=[];histogram.forEach((n,key)=>{if(n)points.push({n,c:[(key>>10)*8+4,(key>>5&31)*8+4,(key&31)*8+4]});});
  if(!points.length)return [[0,0,0],[255,255,255]];
  const box=p=>{const low=[255,255,255],high=[0,0,0];let weight=0;for(const v of p){weight+=v.n;for(let a=0;a<3;a++){low[a]=Math.min(low[a],v.c[a]);high[a]=Math.max(high[a],v.c[a]);}}const ranges=high.map((v,a)=>v-low[a]);return {p,weight,axis:ranges.indexOf(Math.max(...ranges)),score:Math.max(...ranges)*weight};};
  const boxes=[box(points)];
  while(boxes.length<maxColors){let at=-1;for(let i=0;i<boxes.length;i++)if(boxes[i].p.length>1&&(at<0||boxes[i].score>boxes[at].score))at=i;if(at<0)break;
    const b=boxes[at];b.p.sort((x,y)=>x.c[b.axis]-y.c[b.axis]);let sum=0,split=1;for(;split<b.p.length;split++){sum+=b.p[split-1].n;if(sum>=b.weight/2)break;}split=Math.min(split,b.p.length-1);boxes.splice(at,1,box(b.p.slice(0,split)),box(b.p.slice(split)));}
  const palette=boxes.map(b=>[0,1,2].map(a=>Math.round(b.p.reduce((n,v)=>n+v.c[a]*v.n,0)/b.weight)));
  if(palette.length===1)palette.push([...palette[0]]);return palette;
}
const BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
export function gifIndices(rgba,width,palette,dither=false){
  require(Number.isInteger(width)&&width>0&&rgba.length%(width*4)===0&&palette.length>=2&&palette.length<=256,'Invalid GIF palette or image size.');
  const lookup=new Int16Array(32768).fill(-1),indices=new Uint8Array(rgba.length/4);
  for(let i=0;i<indices.length;i++){
    const offset=dither?(BAYER[((i/width|0)&3)*4+(i%width&3)]-7.5)*2:0;
    const c=[0,1,2].map(a=>Math.max(0,Math.min(255,rgba[i*4+a]+offset))>>3),key=c[0]<<10|c[1]<<5|c[2];let best=lookup[key];
    if(best<0){let distance=Infinity;for(let p=0;p<palette.length;p++){const d=palette[p].reduce((sum,v,a)=>sum+(v-(c[a]*8+4))**2,0);if(d<distance){distance=d;best=p;}}lookup[key]=best;}indices[i]=best;
  }return indices;
}
export function gifLzw(indices,minCodeSize){
  const clear=1<<minCodeSize,end=clear+1,out=[];let bits=0,count=0,size=minCodeSize+1,next=end+1,dict=new Map();
  const emit=code=>{bits|=code<<count;count+=size;while(count>=8){out.push(bits&255);bits>>>=8;count-=8;}};
  emit(clear);let prefix=indices[0];
  for(let i=1;i<indices.length;i++){const suffix=indices[i],key=prefix*256+suffix,found=dict.get(key);if(found!==undefined){prefix=found;continue;}
    emit(prefix);
    // Decoder dictionary trails the encoder by one entry.
    if(next>=(1<<size)&&size<12)size++;
    if(next<4096)dict.set(key,next++);else{emit(clear);dict=new Map();size=minCodeSize+1;next=end+1;}prefix=suffix;
  }
  emit(prefix);if(next>=(1<<size)&&size<12)size++;emit(end);if(count)out.push(bits&255);
  const blocks=[minCodeSize];for(let i=0;i<out.length;i+=255)blocks.push(Math.min(255,out.length-i),...out.slice(i,i+255));blocks.push(0);return Uint8Array.from(blocks);
}
function colorTable(palette){const size=2**Math.ceil(Math.log2(palette.length)),bytes=new Uint8Array(size*3);palette.forEach((c,i)=>bytes.set(c,i*3));return {bytes,bits:Math.log2(size)};}
function join(...parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
export class GifWriter{
  constructor({width,height,loopCount=0,palette=null,maximumBytes=512*1024*1024}){require(Number.isInteger(width)&&width>0&&width<=8192&&Number.isInteger(height)&&height>0&&height<=8192&&width*height<=33554432&&Number.isInteger(loopCount)&&loopCount>=0&&loopCount<=65535,'Invalid GIF dimensions or loop count.');Object.assign(this,{width,height,loopCount,palette,maximumBytes});this.total=0;this.frames=0;}
  account(bytes){require(bytes.length<=32*1024*1024&&this.total+bytes.length<=this.maximumBytes,'GIF exceeds export byte budget.');this.total+=bytes.length;return bytes;}
  begin(){require(!this.started,'GIF already started.');this.started=true;const table=this.palette?colorTable(this.palette):null;return this.account(join(ascii('GIF89a'),word(this.width),word(this.height),[table?0xf0|table.bits-1:0x70,0,0],table?.bytes||[],[0x21,0xff,11],ascii('NETSCAPE2.0'),[3,1,...word(this.loopCount),0]));}
  frame(rgba,delay,{palette=this.palette||gifPalette(gifHistogram(rgba)),dither=false}={}){require(this.started&&!this.finished&&rgba.length===this.width*this.height*4&&Number.isInteger(delay)&&delay>=1&&delay<=65535,'Invalid GIF frame or delay.');const table=colorTable(palette),local=!this.palette;this.frames++;
    return this.account(join([0x21,0xf9,4,4,...word(delay),0,0,0x2c,0,0,0,0,...word(this.width),...word(this.height),local?0x80|table.bits-1:0],local?table.bytes:[],gifLzw(gifIndices(rgba,this.width,palette,dither),Math.max(2,table.bits))));}
  finish(){require(this.started&&!this.finished&&this.frames>0,'GIF has no complete frames.');this.finished=true;return this.account(Uint8Array.of(0x3b));}
}
export async function recordRenderedGif({canvas,fps,frameCount,frameTimes,renderFrame,writeChunk,check=()=>{},progress=()=>{},onRecorder=()=>{},palette='frame',dither=false,loopCount=0,maximumBytes}){
  require(Number.isInteger(fps)&&fps>=1&&fps<=60&&Number.isInteger(frameCount)&&frameCount>0&&frameCount<=18001&&['frame','global'].includes(palette),'Invalid GIF sampling or palette.');
  const times=frameTimes||Array.from({length:frameCount},(_,i)=>i/fps);require(times.length===frameCount&&times[0]===0&&times.every((t,i)=>Number.isFinite(t)&&t>=0&&t<=300&&(!i||t>times[i-1])),'Invalid GIF source times.');
  const context=canvas.getContext('2d',{willReadFrequently:true}),width=canvas.width,height=canvas.height;require(context,'GIF pixel capture unavailable.');let stopped=false,index=0;
  const guard=()=>{check();require(!stopped,'GIF export cancelled.');require(canvas.width===width&&canvas.height===height,'GIF canvas size changed.');};
  const pixels=async n=>{guard();await renderFrame(n);guard();return context.getImageData(0,0,width,height).data;};
  const write=async bytes=>{guard();await writeChunk(index++,bytes);guard();await new Promise(resolve=>setTimeout(resolve,0));guard();};
  onRecorder({get state(){return stopped?'inactive':'recording';},stop(){stopped=true;}});
  try{let colors=null;if(palette==='global'){const histogram=new Uint32Array(32768);for(let n=0;n<frameCount;n++){gifHistogram(await pixels(n),histogram);progress(`Palette frame ${n+1} / ${frameCount}`);await new Promise(resolve=>setTimeout(resolve,0));}colors=gifPalette(histogram);}
    const writer=new GifWriter({width,height,loopCount,palette:colors,maximumBytes});await write(writer.begin());
    for(let n=0;n<frameCount;n++){const delay=Math.max(1,Math.round(100*(n+1<frameCount?times[n+1]-times[n]:1/fps)));await write(writer.frame(await pixels(n),delay,{dither}));progress(n+1);}await write(writer.finish());return {method:'gif-median-cut',encodedFrames:frameCount,bytes:writer.total,sourceTimes:times.slice()};
  }finally{stopped=true;onRecorder(null);}
}
