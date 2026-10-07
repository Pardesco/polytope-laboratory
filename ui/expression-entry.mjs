/** Real-valued input uses the native expression parser. IDs and polygon symbols
 * remain literal inputs. Nothing is published until all values are evaluated. */
import {storeMemory} from './model-memories.mjs';

export const EXPRESSION_ENTRY_LIMITS=Object.freeze({characters:512,values:32,magnitude:1e100});
const literal=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const fail=message=>{throw Error(message);};
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=EXPRESSION_ENTRY_LIMITS.magnitude;

/** Commas in min/max/function calls belong to the expression, not the vector.
 * Legacy whitespace-separated numeric vectors are unambiguous only for literals. */
export function splitExpressionVector(text,length=3){
  if(typeof text!=='string'||!Number.isInteger(length)||length<1||length>EXPRESSION_ENTRY_LIMITS.values)
    fail('Use a bounded vector of expression entries.');
  if(text.length>length*(EXPRESSION_ENTRY_LIMITS.characters+1))fail('Vector expressions exceed the input limit.');
  const parts=[];let depth=0,start=0,delimited=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(char==='('){if(++depth>64)fail('Vector expressions exceed the nesting limit.');}
    else if(char===')'){if(--depth<0)fail('Vector expressions have unbalanced parentheses.');}
    else if((char===','||char===';')&&depth===0){parts.push(text.slice(start,i).trim());start=i+1;delimited=true;}
  }
  if(depth!==0)fail('Vector expressions have unbalanced parentheses.');
  parts.push(text.slice(start).trim());
  if(!delimited&&length>1){
    const tokens=text.trim().split(/\s+/);
    if(tokens.length===length&&tokens.every(token=>literal.test(token)))parts.splice(0,parts.length,...tokens);
  }
  if(parts.length!==length||parts.some(part=>!part||part.length>EXPRESSION_ENTRY_LIMITS.characters))
    fail(`Enter ${length} expressions separated by commas or semicolons; use parentheses for function arguments.`);
  return parts;
}

function available(context){
  if(context.isExporting?.())fail('Finish animation export before editing net values.');
  if(context.isBusy?.())fail('Finish the current operation before editing net values.');
}
function signature(state,model){
  // The existing bounded JSON clone checks resources/accessors before stringify.
  // Full attributes, RGBA, units, observer pose and notes all bind this edit.
  return JSON.stringify(storeMemory(undefined,1,{model,view:state.view,notes:state.notes??''},{}).slots[0].state);
}
export function captureExpressionOwner(context){
  available(context);
  const state=context.getState?.(),model=context.getModel?.()??state?.model;
  if(!state?.model||!state.view||!model)fail('Choose a source model before editing net values.');
  if(model!==state.model)fail('The active net source must be the current document model.');
  const document=context.getDocument?.();
  return {state,model,stateModel:state.model,view:state.view,project:context.getProject?.(),document,
    documentId:document?.id,states:document?.states,cursor:document?.cursor,
    signature:signature(state,model),netLayout:state.netLayout,cellNetLayout:state.cellNetLayout,
    netPages:state.netPages,netHistory:state.netHistory,cellNetHistory:state.cellNetHistory};
}
export function verifyExpressionOwner(context,owner){
  available(context);
  const state=context.getState?.(),model=context.getModel?.()??state?.model,document=context.getDocument?.();
  if(state!==owner.state||model!==owner.model||state?.model!==owner.stateModel||state?.view!==owner.view||
    context.getProject?.()!==owner.project||document!==owner.document||document?.id!==owner.documentId||
    document?.states!==owner.states||document?.cursor!==owner.cursor||
    ['netLayout','cellNetLayout','netPages','netHistory','cellNetHistory'].some(key=>state?.[key]!==owner[key]))
    fail('The workspace, source, or net changed while evaluating expressions. Repeat the edit.');
  if(signature(state,model)!==owner.signature)
    fail('The source attributes, view, units, or notes changed while evaluating expressions. Repeat the edit.');
}

export class ExpressionEntry{
  constructor(context){this.context=context;this.busy=false;}
  /** fields: {name: expression | expression[]}; publish(values,verify,owner).
   * A native-await publisher must call verify immediately before its mutation. */
  async run(fields,publish){
    if(this.busy)fail('Finish the current expression edit first.');
    if(typeof this.context.number!=='function')fail('Native expression entry is unavailable.');
    if(!fields||Object.getPrototypeOf(fields)!==Object.prototype||typeof publish!=='function')fail('Use named expression fields and a publisher.');
    const keys=Object.keys(fields);if(keys.length>EXPRESSION_ENTRY_LIMITS.values)fail('Expression input exceeds the 32-value limit.');
    const entries=keys.map(name=>{
      const descriptor=Object.getOwnPropertyDescriptor(fields,name);
      if(!('value' in descriptor))fail('Expression fields must contain plain values, not accessors.');
      return [name,descriptor.value];
    });let count=0;
    const inputs=entries.map(([name,input])=>{
      const vector=Array.isArray(input);
      if(vector&&input.length>EXPRESSION_ENTRY_LIMITS.values-count)fail('Expression input exceeds the 32-value limit.');
      const parts=vector?Array.from({length:input.length},(_,i)=>{
        const descriptor=Object.getOwnPropertyDescriptor(input,String(i));
        if(!descriptor||!('value' in descriptor))fail('Vector expressions require plain entries, not sparse arrays or accessors.');
        return descriptor.value;
      }):[input];count+=parts.length;
      if(!name||!parts.length||parts.some(text=>typeof text!=='string'||!text.trim()||text.length>EXPRESSION_ENTRY_LIMITS.characters))
        fail('Each real-valued entry requires an expression of at most 512 characters.');
      return [name,parts.map(text=>text.trim()),vector];
    });
    if(!count||count>EXPRESSION_ENTRY_LIMITS.values)fail('Expression input exceeds the 32-value limit.');
    const owner=captureExpressionOwner(this.context),verify=()=>verifyExpressionOwner(this.context,owner),values={};
    this.busy=true;
    try{
      for(const [name,parts,vector] of inputs){
        const evaluated=[];
        for(const text of parts){
          verify();const value=await this.context.number(text);verify();
          if(!finite(value))fail('Expression values must be finite real numbers bounded to 1e100.');
          evaluated.push(value);
        }
        Object.defineProperty(values,name,{value:vector?evaluated:evaluated[0],enumerable:true});
      }
      verify();return await publish(values,verify,owner);
    }finally{this.busy=false;}
  }
}
