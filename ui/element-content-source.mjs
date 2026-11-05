/** Exact browser-compatible equivalent of native portable annotation source. */
const fail=m=>{throw Error(`Element content source: ${m}`);};
const floatBits=new DataView(new ArrayBuffer(8));
const encoder=new TextEncoder();
export function pythonFloatHex(value){
  if(!Number.isFinite(value))fail('Source numbers must be finite binary64.');
  if(value===0)return '0x0.0p+0';
  // Synchronous scratch storage: capture both words before formatting. Every
  // binary64 bit is retained without allocating a buffer/BigInt per number.
  floatBits.setFloat64(0,value,false);
  const high=floatBits.getUint32(0,false),low=floatBits.getUint32(4,false);
  const exponent=(high>>>20)&2047,power=exponent?exponent-1023:-1022;
  const fraction=(high&0xfffff).toString(16).padStart(5,'0')+low.toString(16).padStart(8,'0');
  return `${high>>>31?'-':''}0x${exponent?'1':'0'}.${fraction}p${power>=0?'+':''}${power}`;
}
function compareKeys(a,b){const A=Array.from(a,c=>c.codePointAt(0)),B=Array.from(b,c=>c.codePointAt(0));for(let i=0;i<Math.min(A.length,B.length);i++)if(A[i]!==B[i])return A[i]-B[i];return A.length-B.length;}
export function portableContentSource(model,{maxJsonBytes=8*1024*1024,maxPortableBytes=64*1024*1024,maxChars=8*1024*1024}={}){
  // Emit the same tagged JSON directly, retaining bounded string fragments
  // rather than a second object/array tree for every source node.
  let visits=0,chars=0,bytes=0,chunk='',smallNumbers;const path=new Set(),parts=[];
  const emit=(text,ascii=true)=>{
    bytes+=(ascii||!/[\u0080-\uffff]/.test(text))?text.length:encoder.encode(text).length;
    if(bytes>maxPortableBytes)fail('Portable encoding exceeds its byte bound.');
    chunk+=text;if(chunk.length>=16384){parts.push(chunk);chunk='';}
  };
  const work=depth=>{if(++visits>250000||depth>64)fail('Source work bound exceeded.');};
  const string=value=>{chars+=value.length;if(chars>maxChars||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))fail('Source text exceeds finite Unicode bounds.');};
  function walk(value,depth=0){
    work(depth);
    if(value===null||typeof value==='boolean'){emit(value===null?'["scalar",null]':value?'["scalar",true]':'["scalar",false]');return;}
    if(typeof value==='number'){
      let text;
      // Incidence repeats small integer IDs. Reuse only their exact scalar
      // spelling inside this call, never source records or validation results.
      if(value>=0&&value<2048&&Number.isInteger(value)){
        smallNumbers??=Object.create(null);text=smallNumbers[value];
        if(text===undefined)smallNumbers[value]=text=`["number","${pythonFloatHex(value)}"]`;
      }else text=`["number","${pythonFloatHex(value)}"]`;
      emit(text);return;
    }
    if(typeof value==='string'){string(value);emit('["scalar",');emit(JSON.stringify(value),false);emit(']');return;}
    if(!value||typeof value!=='object'||path.has(value))fail('Source must be acyclic ordinary JSON.');
    path.add(value);
    if(Array.isArray(value)){
      // Each child consumes at least one visit. Refuse impossible wide arrays
      // before allocating their full descriptor table or walking their keys.
      if(value.length>250000-visits)fail('Source work bound exceeded.');
      const descriptors=Object.getOwnPropertyDescriptors(value);
      if(Object.keys(value).length!==value.length||Object.values(descriptors).some(d=>d.get||d.set))fail('Source arrays must be dense data.');
      emit('["array",[');
      for(let index=0;index<value.length;index++){
        if(!Object.hasOwn(descriptors,String(index))||!descriptors[index].enumerable)fail('Source arrays must be dense data.');
        if(index)emit(',');walk(descriptors[index].value,depth+1);
      }
    }else{
      if(![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).some(key=>typeof key!=='string')||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>d.get||d.set))fail('Source records must be ordinary data.');
      emit('["object",[');let count=0;
      for(const key of Object.keys(value).sort(compareKeys)){
        work(depth+1);string(key);if(count++)emit(',');emit('[');emit(JSON.stringify(key),false);emit(',');walk(value[key],depth+1);emit(']');
      }
    }
    emit(']]');path.delete(value);
  }
  walk(model);
  if(encoder.encode(JSON.stringify(model)).length>maxJsonBytes)fail('Original source exceeds its byte cap.');
  if(chunk)parts.push(chunk);return parts.join('');
}
export async function sha256Content(bytes){if(!globalThis.crypto?.subtle)fail('SHA-256 verification is unavailable.');const result=await crypto.subtle.digest('SHA-256',typeof bytes==='string'?new TextEncoder().encode(bytes):bytes);return Array.from(new Uint8Array(result),x=>x.toString(16).padStart(2,'0')).join('');}
export async function verifyContentDescriptor(model,descriptor,{signal,isCurrent=()=>true}={}){const check=()=>{if(signal?.aborted||!isCurrent())throw Object.assign(Error('Element content ownership changed.'),{name:'AbortError'});};check();const source=portableContentSource(model),hash=await sha256Content(source);check();if(portableContentSource(model)!==source)throw Object.assign(Error('Element content source attributes changed.'),{name:'AbortError'});if(descriptor?.version!==1||descriptor.sourceId!==model.id||descriptor.sourceFingerprint!==model.fingerprint||descriptor.sourceSha256!==hash||!Number.isFinite(descriptor.referenceEdgeLengthMm)||descriptor.referenceEdgeLengthMm<1||descriptor.referenceEdgeLengthMm>1000||!Array.isArray(descriptor.entries)||descriptor.entries.length>1024)fail('Native descriptor source or bounds mismatch.');return {hash,source,check:()=>{check();if(portableContentSource(model)!==source)throw Object.assign(Error('Element content full source changed.'),{name:'AbortError'});}};}
