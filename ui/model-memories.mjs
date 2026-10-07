/** Nine persisted model memories. All bank operations are immutable; retrieval
 * returns detached mutable state for ordinary document editing. */
export const MEMORY_LIMITS=Object.freeze({slots:9,depth:64,slotBytes:32*1024*1024,totalBytes:128*1024*1024,nodesPerSlot:2_000_000,totalNodes:8_000_000});
const trusted=new WeakMap(),encoder=new TextEncoder();
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const arrayKey=(key,length)=>Number.isInteger(Number(key))&&Number(key)>=0&&String(Number(key))===key&&Number(key)<length;
const fail=message=>{throw new Error(message);};

function slotIndex(slot){
  if(!Number.isInteger(slot)||slot<1||slot>MEMORY_LIMITS.slots)fail('Memory slot must be an integer from 1 to 9.');
  return slot-1;
}

/** Clone only JSON data, with a resource budget before serialization/allocation
 * can grow without limit. Getters, cycles and non-JSON values are refused. */
function cloneData(value,label,budget={bytes:0,nodes:0},ancestors=new Set(),depth=0){
  if(depth>MEMORY_LIMITS.depth)fail(`${label} exceeds the memory nesting limit.`);
  if(++budget.nodes>MEMORY_LIMITS.nodesPerSlot)fail(`${label} exceeds the memory item limit.`);
  let result;
  if(value===null||typeof value==='boolean'){result=value;budget.bytes+=value===null?4:value?4:5;}
  else if(typeof value==='number'){
    if(!Number.isFinite(value))fail(`${label} must contain finite numbers.`);
    result=value;budget.bytes+=String(value).length;
  }else if(typeof value==='string'){
    // Each code unit occupies at least one byte in its JSON representation.
    if(value.length>MEMORY_LIMITS.slotBytes-budget.bytes)fail(`${label} exceeds the 32 MiB memory-slot limit.`);
    result=value;budget.bytes+=encoder.encode(JSON.stringify(value)).length;
  }else{
    if(!Array.isArray(value)&&!plain(value))fail(`${label} must contain only plain JSON data.`);
    if(ancestors.has(value))fail(`${label} contains a circular reference.`);
    if(Object.getOwnPropertySymbols(value).length)fail(`${label} cannot contain symbol properties.`);
    ancestors.add(value);budget.bytes+=2;
    if(Array.isArray(value)){
      if(value.length>MEMORY_LIMITS.nodesPerSlot-budget.nodes)fail(`${label} exceeds the memory item limit.`);
      result=[];
      for(let index=0;index<value.length;index++){
        const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
        if(!descriptor||!('value' in descriptor))fail(`${label} must not contain sparse arrays or accessors.`);
        if(index)budget.bytes++;
        result.push(cloneData(descriptor.value,label,budget,ancestors,depth+1));
      }
      if(Object.keys(value).some(key=>!arrayKey(key,value.length)))fail(`${label} cannot contain custom array properties.`);
    }else{
      result={};let count=0;
      for(const key of Object.keys(value)){
        const descriptor=Object.getOwnPropertyDescriptor(value,key);
        if(!('value' in descriptor))fail(`${label} must not contain accessors.`);
        // Undefined object fields disappear on normal project JSON round trips.
        if(descriptor.value===undefined)continue;
        if(key.length>MEMORY_LIMITS.slotBytes-budget.bytes)fail(`${label} exceeds the 32 MiB memory-slot limit.`);
        budget.bytes+=encoder.encode(JSON.stringify(key)).length+1+(count++?1:0);
        const copied=cloneData(descriptor.value,label,budget,ancestors,depth+1);
        Object.defineProperty(result,key,{value:copied,writable:true,enumerable:true,configurable:true});
      }
    }
    ancestors.delete(value);
  }
  if(budget.bytes>MEMORY_LIMITS.slotBytes)fail(`${label} exceeds the 32 MiB memory-slot limit.`);
  return result;
}

function validateModel(model,label){
  if(!plain(model))fail(`${label} requires a source model.`);
  if(!Number.isInteger(model.dimension)||model.dimension<2||model.dimension>4)fail(`${label} model dimension must be 2, 3 or 4.`);
  const embedding=model.embeddingDimension??model.dimension;
  if(!Number.isInteger(embedding)||embedding<model.dimension||embedding>4)fail(`${label} has an invalid embedding dimension.`);
  if(!Array.isArray(model.vertices)||model.vertices.length<1||model.vertices.length>20000)fail(`${label} requires 1 to 20,000 vertices.`);
  for(const point of model.vertices)if(!Array.isArray(point)||point.length!==embedding||point.some(value=>typeof value!=='number'||!Number.isFinite(value)))fail(`${label} has invalid source coordinates.`);
  const index=(value,count)=>Number.isInteger(value)&&value>=0&&value<count;
  if(!Array.isArray(model.edges)||!Array.isArray(model.faces)||(model.cells!==undefined&&!Array.isArray(model.cells)))fail(`${label} requires source edge, face and cell arrays.`);
  const edgeKeys=new Set();
  for(const [id,edge] of model.edges.entries()){
    if(!Array.isArray(edge)||edge.length!==2||edge[0]===edge[1]||edge.some(value=>!index(value,model.vertices.length)))fail(`${label} edge ${id} has invalid endpoints.`);
    const key=edge[0]<edge[1]?edge.join(','):[edge[1],edge[0]].join(',');
    if(edgeKeys.has(key))fail(`${label} has duplicate source edges.`);edgeKeys.add(key);
  }
  for(const [id,face] of model.faces.entries()){
    if(!Array.isArray(face)||face.length<3||new Set(face).size!==face.length||face.some(value=>!index(value,model.vertices.length)))fail(`${label} face ${id} has an invalid ordered boundary.`);
    for(let offset=0;offset<face.length;offset++){
      const a=face[offset],b=face[(offset+1)%face.length],key=a<b?`${a},${b}`:`${b},${a}`;
      if(!edgeKeys.has(key))fail(`${label} face ${id} references a missing source edge.`);
    }
  }
  for(const [id,cell] of (model.cells||[]).entries())if(!Array.isArray(cell)||!cell.length||new Set(cell).size!==cell.length||cell.some(value=>!index(value,model.faces.length)))fail(`${label} cell ${id} has invalid source face references.`);
  if(model.validation?.passed===false)fail(`${label} model has failed source validation.`);
  if(model.convexPieces!==undefined){
    if(!Array.isArray(model.convexPieces)||model.convexPieces.length>2048)fail(`${label} has invalid source-region pieces.`);
    model.convexPieces.forEach((piece,index)=>validateModel(piece,`${label} piece ${index}`));
  }
  // Convexity, closure, rank and numeric certificates remain engine contracts.
  // In particular, star cycles and generalized open surfaces are not replaced.
}

function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function cloneEntry(state,source,label){
  if(!plain(state)||!plain(source))fail(`${label} requires plain state and source records.`);
  const budget={bytes:0,nodes:0},entry=cloneData({state,source},label,budget);
  validateModel(entry.state.model,label);
  if(!plain(entry.state.view))fail(`${label} requires a saved view record.`);
  return {entry:freeze(entry),...budget};
}
function makeBank(slots,sizes){
  // Empty slot and enclosing bank punctuation also consume serialized bytes.
  const bytes=JSON.stringify({version:1,slots:[]}).length+8+sizes.reduce((sum,size)=>sum+(size?.bytes??4),0),nodes=3+sizes.reduce((sum,size)=>sum+(size?.nodes??1),0);
  if(bytes>MEMORY_LIMITS.totalBytes||nodes>MEMORY_LIMITS.totalNodes)fail('Model memories exceed the 128 MiB total or eight-million-item limit.');
  const bank=freeze({version:1,slots});trusted.set(bank,sizes);return bank;
}

export function createMemories(){return makeBank(Array(MEMORY_LIMITS.slots).fill(null),Array(MEMORY_LIMITS.slots).fill(null));}
export function normalizeMemories(value){
  if(value===undefined)return createMemories();
  if(trusted.has(value))return value;
  if(!plain(value)||Object.getOwnPropertySymbols(value).length||Object.keys(value).some(key=>!['version','slots'].includes(key)))fail('Unsupported model memories: expected version 1 and nine slots.');
  const versionField=Object.getOwnPropertyDescriptor(value,'version'),slotsField=Object.getOwnPropertyDescriptor(value,'slots');
  if(!versionField||!slotsField||!('value' in versionField)||!('value' in slotsField)||versionField.value!==1||!Array.isArray(slotsField.value)||slotsField.value.length!==MEMORY_LIMITS.slots)fail('Unsupported model memories: expected version 1 and nine slots.');
  const sourceSlots=slotsField.value;
  if(Object.getOwnPropertySymbols(sourceSlots).length||Object.keys(sourceSlots).some(key=>!arrayKey(key,MEMORY_LIMITS.slots)))fail('Model memories must contain nine explicit slots.');
  const slots=[],sizes=[];let totalBytes=JSON.stringify({version:1,slots:[]}).length+8,totalNodes=3;
  for(let index=0;index<MEMORY_LIMITS.slots;index++){
    const descriptor=Object.getOwnPropertyDescriptor(sourceSlots,String(index));
    if(!descriptor||!('value' in descriptor))fail('Model memories must contain nine explicit slots.');
    const item=descriptor.value;
    if(item===null){slots.push(null);sizes.push(null);totalBytes+=4;totalNodes++;continue;}
    if(!plain(item))fail(`Memory ${index+1} has an invalid snapshot.`);
    // Clone the complete entry first so getters cannot escape validation.
    const budget={bytes:0,nodes:0},entry=cloneData(item,`Memory ${index+1}`,budget);
    if(!plain(entry.source))fail(`Memory ${index+1} requires a source record.`);
    if(!plain(entry.state)||!plain(entry.state.view))fail(`Memory ${index+1} requires a saved state and view.`);
    validateModel(entry.state.model,`Memory ${index+1}`);
    totalBytes+=budget.bytes;totalNodes+=budget.nodes;
    if(totalBytes>MEMORY_LIMITS.totalBytes||totalNodes>MEMORY_LIMITS.totalNodes)fail('Model memories exceed the 128 MiB total or eight-million-item limit.');
    slots.push(freeze(entry));sizes.push(budget);
  }
  return makeBank(slots,sizes);
}
export function storeMemory(value,slot,state,source={}){
  const index=slotIndex(slot),bank=normalizeMemories(value),copied=cloneEntry(state,source,`Memory ${slot}`);
  const slots=bank.slots.slice(),sizes=trusted.get(bank).slice();slots[index]=copied.entry;sizes[index]={bytes:copied.bytes,nodes:copied.nodes};
  return makeBank(slots,sizes);
}
export function retrieveMemoryEntry(value,slot){
  const index=slotIndex(slot),bank=normalizeMemories(value),entry=bank.slots[index];
  if(entry===null)fail(`Memory ${slot} is empty. Store a model before retrieving or swapping it.`);
  return cloneData(entry,`Memory ${slot}`);
}
export function retrieveMemory(value,slot){return retrieveMemoryEntry(value,slot).state;}
export function swapMemory(value,slot,state,source={}){
  const entry=retrieveMemoryEntry(value,slot),memories=storeMemory(value,slot,state,source);
  return {memories,state:entry.state,source:entry.source};
}
export function clearMemory(value,slot){
  const index=slotIndex(slot),bank=normalizeMemories(value),slots=bank.slots.slice(),sizes=trusted.get(bank).slice();slots[index]=null;sizes[index]=null;
  return makeBank(slots,sizes);
}
export function clearMemories(value){normalizeMemories(value);return createMemories();}
