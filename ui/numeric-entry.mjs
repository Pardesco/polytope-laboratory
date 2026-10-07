/** Atomic numeric entry. Native expressions -> detached, domain-checked values.
 * One owner covers every <=32-item batch, including 20,000-point hulls. */
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
import {splitExpressionVector} from './expression-entry.mjs';

export const NUMERIC_ENTRY_LIMITS=Object.freeze({characters:512,fields:64,values:80000,rows:20000,
  columns:4,batch:32,magnitude:1e100,textBytes:128*1024*1024,rationalCharacters:8192,rationalBits:12000});
const fail=message=>{throw Error(message);};
const abort=()=>Object.assign(Error('Expression edit canceled.'),{name:'AbortError'});
const encoder=new TextEncoder();
export function exactRational(value){
  if(typeof value!=='string'||value.length>NUMERIC_ENTRY_LIMITS.rationalCharacters||
      !/^-?(?:0|[1-9]\d*)(?:\/[1-9]\d*)?$/.test(value))fail('Native rational expressions require bounded canonical exact rational strings.');
  const [top,bottom='1']=value.split('/'),numerator=BigInt(top),denominator=BigInt(bottom);
  if((numerator<0n?-numerator:numerator).toString(2).length>NUMERIC_ENTRY_LIMITS.rationalBits||
      denominator.toString(2).length>NUMERIC_ENTRY_LIMITS.rationalBits)
    fail('Native rational expressions exceed the 12,000-bit arithmetic bound.');
  let a=numerator<0n?-numerator:numerator,b=denominator;
  while(b){const next=a%b;a=b;b=next;}
  if(value==='-0'||top==='-0'||a!==1n||bottom==='1'&&value.includes('/'))
    fail('Native rational expressions require reduced canonical exact rational strings.');
  return {numerator,denominator};
}
function rationalBoundary(value){
  if(typeof value==='number'){
    if(!Number.isSafeInteger(value))fail('Exact rational numerical bounds must be safe integers or canonical rational strings.');
    return {numerator:BigInt(value),denominator:1n};
  }
  return exactRational(value);
}
const compareRational=(left,right)=>{
  const difference=left.numerator*right.denominator-right.numerator*left.denominator;
  return difference<0n?-1:difference>0n?1:0;
};
function record(value,label){
  if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||
     Object.getOwnPropertySymbols(value).length)fail(`${label} requires a plain record.`);
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(Object.values(descriptors).some(item=>!('value' in item)))fail(`${label} cannot contain accessors.`);
  return Object.fromEntries(Object.entries(descriptors).map(([key,item])=>[key,item.value]));
}
function array(value,label,max){
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>max||
     Object.getOwnPropertySymbols(value).length||Object.getOwnPropertyNames(value).length!==value.length+1)
    fail(`${label} requires a bounded ordinary array.`);
  return Array.from({length:value.length},(_,i)=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,String(i));
    if(!descriptor||!('value' in descriptor))fail(`${label} cannot contain holes or accessors.`);
    return descriptor.value;
  });
}
function targetSignature(value){
  let nodes=0;
  const clone=(value,depth)=>{
    if(++nodes>2048||depth>16)fail('Expression target signature exceeds its bound.');
    if(value===null||typeof value==='boolean'||typeof value==='string')return value;
    if(typeof value==='number'&&Number.isFinite(value))return value;
    if(Array.isArray(value))return array(value,'Target fields',2048).map(v=>clone(v,depth+1));
    return Object.fromEntries(Object.entries(record(value,'Target fields')).map(([key,v])=>[key,clone(v,depth+1)]));
  };
  const text=JSON.stringify(clone(value,0));
  if(encoder.encode(text).length>65536)fail('Expression target signature exceeds 64 KiB.');
  return text;
}
function lengths(value){
  const values=typeof value==='number'?[value]:array(value,'Vector lengths',4);
  if(!values.length||values.some(x=>!Number.isSafeInteger(x)||x<1||x>4)||new Set(values).size!==values.length)
    fail('Vector lengths must be distinct integers from 1 to 4.');
  return values;
}
function split(text,allowed){
  if(typeof text!=='string')fail('Numeric entries require text expressions.');
  for(const length of allowed){try{return splitExpressionVector(text,length);}catch{/* Try another declared dimension. */}}
  fail(`Enter ${allowed.join(' or ')} expressions separated at top-level commas/semicolons; whitespace is supported only between numeric literals.`);
}
function stageFields(fields){
  const entries=Object.entries(record(fields,'Expression fields'));
  if(!entries.length||entries.length>NUMERIC_ENTRY_LIMITS.fields)fail('Use 1 to 64 named expression fields.');
  let total=0,bytes=0;
  const staged=entries.map(([name,input])=>{
    if(!name||name.length>128)fail('Use bounded field names.');
    const spec=record(input,'Expression field');
    if(Object.keys(spec).some(key=>!['kind','mode','text','length','min','max','exclusiveMin','integer','nonzero'].includes(key)))
      fail('Expression field has unsupported options.');
    if(typeof spec.text!=='string'||!spec.text.trim())fail(`${name}: enter numeric expressions.`);
    if(spec.text.length>NUMERIC_ENTRY_LIMITS.textBytes)fail('Expression text exceeds the input bound.');
    bytes+=encoder.encode(spec.text).length;if(bytes>NUMERIC_ENTRY_LIMITS.textBytes)fail('Expression text exceeds 128 MiB.');
    const kind=spec.kind??'scalar';let parts,rows;
    if(kind==='scalar')parts=[spec.text.trim()];
    else if(kind==='vector')parts=split(spec.text,lengths(spec.length));
    else if(kind==='rows'){
      const allowed=lengths(spec.length),lines=spec.text.trim().split(/\r?\n+/).filter(line=>line.trim());
      if(!lines.length||lines.length>NUMERIC_ENTRY_LIMITS.rows)fail('Use 1 to 20,000 coordinate rows.');
      rows=lines.map(line=>split(line,allowed));
      if(rows.some(row=>row.length!==rows[0].length))fail('Coordinate rows must have one consistent dimension.');
      parts=rows.flat();
    }else fail('Unsupported expression field kind.');
    if(parts.some(text=>!text||text.length>NUMERIC_ENTRY_LIMITS.characters))
      fail('Each numeric expression must contain 1 to 512 characters.');
    total+=parts.length;if(total>NUMERIC_ENTRY_LIMITS.values)fail('Expression input exceeds 80,000 values.');
    for(const key of ['integer','exclusiveMin','nonzero'])if(spec[key]!==undefined&&typeof spec[key]!=='boolean')
      fail(`${name}: ${key} must be boolean.`);
    const mode=spec.mode??'real';if(!['real','rational'].includes(mode))fail('Unsupported expression numerical mode.');
    let min,max;
    if(mode==='rational'){
      min=spec.min===undefined?null:rationalBoundary(spec.min);max=spec.max===undefined?null:rationalBoundary(spec.max);
      if(min&&max&&compareRational(min,max)>0)fail(`${name}: invalid rational domain.`);
    }else{
      min=spec.min??-NUMERIC_ENTRY_LIMITS.magnitude;max=spec.max??NUMERIC_ENTRY_LIMITS.magnitude;
      if(typeof min!=='number'||typeof max!=='number'||!Number.isFinite(min)||!Number.isFinite(max)||min>max||
         Math.abs(min)>NUMERIC_ENTRY_LIMITS.magnitude||Math.abs(max)>NUMERIC_ENTRY_LIMITS.magnitude)
        fail(`${name}: invalid numerical domain.`);
    }
    return {name,parts,kind,mode,width:rows?.[0].length,spec,min,max};
  });
  return staged;
}
function waitFor(promise,signal){
  return new Promise((resolve,reject)=>{
    const canceled=()=>{signal.removeEventListener('abort',canceled);reject(abort());};
    if(signal.aborted)return canceled();signal.addEventListener('abort',canceled,{once:true});
    Promise.resolve(promise).then(value=>{signal.removeEventListener('abort',canceled);resolve(value);},
      error=>{signal.removeEventListener('abort',canceled);reject(error);});
  });
}

export class NumericEntry{
  constructor(context){this.context=context;this.busy=false;this.generation=0;this.destroyed=false;}
  available(){
    if(this.destroyed)throw abort();
    if(this.context.isExporting?.())fail('Finish export before editing numeric fields.');
    if(this.context.isBusy?.())fail('Finish the other numeric operation first.');
  }
  cancel(){this.generation++;this.active?.controller.abort();}
  destroy(){this.destroyed=true;this.cancel();}
  /** evaluateMany(strings,{mode,signal}) -> ordinary number[] / canonical string[]
   * <=80,000 total. One native job per mode prevents cold-process-per-chunk hulls.
   * evaluateBatch(strings,{signal}) -> ordinary finite-number array <=32.
   * evaluateRationalBatch(strings,{signal}) -> canonical exact string[] <=32.
   * number(string,{signal}) is a sequential compatibility fallback.
   * publish(values,verify,{signal,source}) must verify AFTER any native await,
   * immediately BEFORE mutation, and write only its target in the current view. */
  async run(fields,publish,{signal,validate}={}){
    this.available();if(this.busy)fail('Finish or cancel the current numeric edit first.');
    if(typeof publish!=='function'||validate!==undefined&&typeof validate!=='function')fail('Use an expression publisher and optional domain validator.');
    const staged=stageFields(fields),owner=captureNativeSource(this.context),model=owner.state.model;
    for(const field of staged){
      if(typeof this.context.evaluateMany==='function')continue;
      if(field.mode==='rational'&&typeof this.context.evaluateRationalBatch!=='function')
        fail('Native exact rational expression evaluation is unavailable.');
      if(field.mode==='real'&&typeof this.context.evaluateBatch!=='function'&&typeof this.context.number!=='function')
        fail('Native expression evaluation is unavailable.');
    }
    const target=this.context.getTarget?targetSignature(this.context.getTarget()):null;
    const job={controller:new AbortController(),generation:++this.generation,owner};
    const cancel=()=>job.controller.abort();if(signal?.aborted)throw abort();signal?.addEventListener('abort',cancel,{once:true});
    this.active=job;this.busy=true;
    const verify=()=>{
      if(this.destroyed||this.active!==job||this.generation!==job.generation||job.controller.signal.aborted)throw abort();
      this.available();verifyNativeSource(this.context,owner);
      if(this.context.getState().model!==model)fail('The source model ownership changed. Repeat the edit.');
      if(this.context.getTarget&&targetSignature(this.context.getTarget())!==target)
        fail('The numeric target fields changed. Repeat the edit.');
    };
    try{
      const flat=[],groups=new Map();
      for(const field of staged)for(const text of field.parts){
        if(!groups.has(field.mode))groups.set(field.mode,[]);
        groups.get(field.mode).push({text,index:flat.length});flat.push(text);
      }
      const evaluated=Array(flat.length);
      for(const [mode,group] of groups){
        const step=typeof this.context.evaluateMany==='function'?group.length:NUMERIC_ENTRY_LIMITS.batch;
        for(let offset=0;offset<group.length;offset+=step){
          verify();const items=group.slice(offset,offset+step),batch=Object.freeze(items.map(item=>item.text));let values;
          const evaluate=this.context.evaluateMany??(mode==='rational'?this.context.evaluateRationalBatch:this.context.evaluateBatch);
          if(typeof evaluate==='function'){
            values=array(await waitFor(evaluate.call(this.context,batch,{mode,signal:job.controller.signal}),job.controller.signal),
              'Native expression results',step);verify();
          }else{
            values=[];for(const text of batch){verify();values.push(await waitFor(this.context.number(text,{signal:job.controller.signal}),job.controller.signal));verify();}
          }
          if(values.length!==batch.length)fail('Native expression results must match all input entries.');
          if(mode==='rational')values.forEach(exactRational);
          else if(values.some(value=>typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>NUMERIC_ENTRY_LIMITS.magnitude))
            fail('Native expression results must contain finite numbers bounded to 1e100.');
          items.forEach((item,index)=>{evaluated[item.index]=values[index];});
          if(offset+batch.length<group.length&&this.context.yieldBetweenBatches){
            await waitFor(this.context.yieldBetweenBatches({signal:job.controller.signal}),job.controller.signal);verify();
          }
        }
      }
      const result={};let offset=0;
      for(const field of staged){
        const values=evaluated.slice(offset,offset+field.parts.length);offset+=values.length;
        const domainInvalid=field.mode==='rational'?values.some(value=>{
          const exact=exactRational(value);
          return field.min&&(compareRational(exact,field.min)<0||field.spec.exclusiveMin&&compareRational(exact,field.min)===0)||
            field.max&&compareRational(exact,field.max)>0||field.spec.integer&&exact.denominator!==1n;
        }):values.some(value=>value<field.min||value>field.max||field.spec.exclusiveMin&&value===field.min||
            field.spec.integer&&!Number.isSafeInteger(value));
        if(domainInvalid)fail(`${field.name}: result is outside the declared ${field.spec.integer?'integer ':''}domain.`);
        if(field.spec.nonzero&&!values.some(value=>field.mode==='rational'?exactRational(value).numerator!==0n:value!==0))
          fail(`${field.name}: the vector must be nonzero.`);
        let value;
        if(field.kind==='scalar')value=values[0];
        else if(field.kind==='vector')value=Object.freeze(values);
        else{value=[];for(let i=0;i<values.length;i+=field.width)value.push(Object.freeze(values.slice(i,i+field.width)));Object.freeze(value);}
        Object.defineProperty(result,field.name,{value,enumerable:true});
      }
      Object.freeze(result);verify();if(validate)validate(result);verify();
      const value=await waitFor(publish(result,verify,{signal:job.controller.signal,source:JSON.parse(owner.modelSignature)}),job.controller.signal);
      // Publisher may intentionally change its target; do not compare it afterward.
      return value;
    }finally{
      signal?.removeEventListener('abort',cancel);
      if(this.active===job){this.active=null;this.busy=false;}
    }
  }
}
// Retain the staged prototype names for callers migrating together.
export {NumericEntry as MainViewportExpressionEntry};
export const MAIN_EXPRESSION_LIMITS=NUMERIC_ENTRY_LIMITS;
