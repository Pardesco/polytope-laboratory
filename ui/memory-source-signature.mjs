/** Inspect the same literal JSON and resource envelope as a memory entry,
 * retaining only its model signature. Used after a validated source capture.
 * No source getter, toJSON hook, clone, frozen bank or fingerprint is trusted. */
import {MEMORY_LIMITS} from './model-memories.mjs';
const encoder=new TextEncoder();
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const arrayKey=(key,length)=>Number.isInteger(Number(key))&&Number(key)>=0&&String(Number(key))===key&&Number(key)<length;
const fail=message=>{throw Error(`Memory 1 ${message}`);};

export function memorySourceSignature(state,source){
  if(!plain(state)||!plain(source))fail('requires plain state and source records.');
  const budget={bytes:0,nodes:0},ancestors=new Set(),chunks=[];let chunk='',modelPresent=false,viewPresent=false,notes;
  // Bound intermediate string fragments instead of retaining one token per
  // model node. Final model text is within the entry's 32 MiB JSON budget.
  const emit=text=>{chunk+=text;if(chunk.length>=16384){chunks.push(chunk);chunk='';}};
  const check=()=>{if(budget.bytes>MEMORY_LIMITS.slotBytes)fail('exceeds the 32 MiB memory-slot limit.');};
  const walk=(value,depth,collect=false,isState=false)=>{
    if(depth>MEMORY_LIMITS.depth)fail('exceeds the memory nesting limit.');
    if(++budget.nodes>MEMORY_LIMITS.nodesPerSlot)fail('exceeds the memory item limit.');
    if(value===null||typeof value==='boolean'){
      const text=value===null?'null':value?'true':'false';budget.bytes+=text.length;check();if(collect)emit(text);return;
    }
    if(typeof value==='number'){
      if(!Number.isFinite(value))fail('must contain finite numbers.');
      const text=String(value);budget.bytes+=text.length;check();if(collect)emit(text);return;
    }
    if(typeof value==='string'){
      if(value.length>MEMORY_LIMITS.slotBytes-budget.bytes)fail('exceeds the 32 MiB memory-slot limit.');
      const text=JSON.stringify(value);budget.bytes+=encoder.encode(text).length;check();if(collect)emit(text);return;
    }
    if(!Array.isArray(value)&&!plain(value))fail('must contain only plain JSON data.');
    if(ancestors.has(value))fail('contains a circular reference.');
    if(Object.getOwnPropertySymbols(value).length)fail('cannot contain symbol properties.');
    ancestors.add(value);budget.bytes+=2;check();
    if(Array.isArray(value)){
      if(value.length>MEMORY_LIMITS.nodesPerSlot-budget.nodes)fail('exceeds the memory item limit.');
      if(collect)emit('[');
      for(let index=0;index<value.length;index++){
        const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
        if(!descriptor||!('value' in descriptor))fail('must not contain sparse arrays or accessors.');
        if(index){budget.bytes++;check();if(collect)emit(',');}
        walk(descriptor.value,depth+1,collect);
      }
      if(Object.keys(value).some(key=>!arrayKey(key,value.length)))fail('cannot contain custom array properties.');
      if(collect)emit(']');
    }else{
      if(collect)emit('{');let count=0;
      for(const key of Object.keys(value)){
        const descriptor=Object.getOwnPropertyDescriptor(value,key);
        if(!('value' in descriptor))fail('must not contain accessors.');
        if(descriptor.value===undefined)continue;
        if(key.length>MEMORY_LIMITS.slotBytes-budget.bytes)fail('exceeds the 32 MiB memory-slot limit.');
        const text=JSON.stringify(key);budget.bytes+=encoder.encode(text).length+1+(count?1:0);check();
        if(collect)emit((count?',':'')+text+':');count++;
        const model=isState&&key==='model';
        if(model)modelPresent=true;
        if(isState&&key==='view')viewPresent=plain(descriptor.value);
        // The previous snapshot returned a new object for object-valued notes
        // at each check. Such notes therefore never compare equal to capture.
        if(isState&&key==='notes')notes=descriptor.value!==null&&typeof descriptor.value==='object'?{}:descriptor.value;
        walk(descriptor.value,depth+1,collect||model,value===entry&&key==='state');
      }
      if(collect)emit('}');
    }
    ancestors.delete(value);check();
  };
  const entry={state,source};walk(entry,0);
  if(!modelPresent)fail('requires a source model.');
  if(!viewPresent)fail('requires a saved view record.');
  if(chunk)chunks.push(chunk);
  return {modelSignature:chunks.join(''),notes};
}
