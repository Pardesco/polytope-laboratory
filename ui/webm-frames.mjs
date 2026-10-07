// Count complete video blocks in a streamed WebM container. Metadata chunks
// alone do not establish that a canvas frame reached the encoder.
const MASTER=new Set([0x1a45dfa3,0x18538067,0x1f43b675,0xa0]);
function vint(bytes,offset,{id=false}={}){
  if(offset>=bytes.length)return null;
  const first=bytes[offset];if(!first)throw new Error('Invalid WebM element header.');
  let width=1,mask=0x80;while(!(first&mask)){width++;mask>>=1;}
  if(width>(id?4:8))throw new Error('Invalid WebM element header.');
  if(offset+width>bytes.length)return null;
  let value=id?first:first&(mask-1),unknown=!id&&value===mask-1;
  for(let index=1;index<width;index++){value=value*256+bytes[offset+index];unknown=unknown&&bytes[offset+index]===255;}
  if(!unknown&&!Number.isSafeInteger(value))throw new Error('WebM element size exceeds the supported range.');
  return {width,value:unknown?null:value};
}

export class WebmFrameCounter {
  constructor(){this.pending=new Uint8Array();this.position=0;this.frames=0;this.cluster=false;this.clusterEnd=null;}
  feed(chunk){
    const bytes=new Uint8Array(this.pending.length+chunk.length);bytes.set(this.pending);bytes.set(chunk,this.pending.length);
    if(bytes.length>64*1024*1024)throw new Error('WebM parsing buffer exceeds the export limit.');
    let offset=0;
    while(offset<bytes.length){
      const absolute=this.position+offset;
      if(this.clusterEnd!==null&&absolute>=this.clusterEnd){this.cluster=false;this.clusterEnd=null;}
      const identifier=vint(bytes,offset,{id:true});if(!identifier)break;
      const size=vint(bytes,offset+identifier.width);if(!size)break;
      const header=identifier.width+size.width,start=offset+header,id=identifier.value;
      if(size.value!==null&&size.value>512*1024*1024)throw new Error('WebM element exceeds the export limit.');
      if(size.value===null&&id!==0x18538067&&id!==0x1f43b675)throw new Error('Unsupported unknown WebM element size.');
      if(MASTER.has(id)){
        if(id===0x1f43b675){this.cluster=true;this.clusterEnd=size.value===null?null:this.position+start+size.value;}
        offset=start;continue;
      }
      if(start+size.value>bytes.length)break;
      if(this.cluster&&(id===0xa3||id===0xa1)){
        const block=bytes.subarray(start,start+size.value),track=vint(block,0);
        if(!track||track.value===null||track.value<1||block.length<=track.width+3)throw new Error('Invalid WebM video block.');
        if(block[track.width+2]&6)throw new Error('Unsupported laced WebM video block.');
        this.frames++;
      }
      offset=start+size.value;
    }
    this.position+=offset;this.pending=bytes.slice(offset);return this.frames;
  }
}
