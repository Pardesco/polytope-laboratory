/** Immutable saved slideshow events. Geometry is always a retained snapshot. */
import {createMemories,storeMemory} from './model-memories.mjs';
import {normalizeTransition} from './transitions.mjs';

export const TOUR_LIMITS=Object.freeze({events:100,eventBytes:32*1024*1024,totalBytes:128*1024*1024,depth:64,values:8_000_000,duration:3600});
const trusted=new WeakMap(),encoder=new TextEncoder();
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const fail=message=>{throw new Error(message);};
function fields(value,keys,label){
  if(!plain(value)||Object.getOwnPropertySymbols(value).length)fail(`${label} requires a plain versioned record.`);
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(Object.keys(descriptors).some(key=>!keys.includes(key))||keys.some(key=>!descriptors[key]||!('value' in descriptors[key])))fail(`${label} has unsupported fields or accessors.`);
  return Object.fromEntries(keys.map(key=>[key,descriptors[key].value]));
}
function countValues(value,depth=0){
  if(depth>TOUR_LIMITS.depth)fail('Tour exceeds its nesting limit.');
  let count=1;
  if(value&&typeof value==='object')for(const item of Object.values(value)){count+=countValues(item,depth+1);if(count>TOUR_LIMITS.values)fail('Tour exceeds its item limit.');}
  return count;
}
function event(value,version=1){
  const input=fields(value,['id','state','duration','transition'],'Tour event');
  if(typeof input.id!=='string'||!input.id||input.id.length>128)fail('Tour event IDs require 1–128 characters.');
  if(!Number.isFinite(input.duration)||input.duration<=0||input.duration>TOUR_LIMITS.duration)fail('Tour event duration must be greater than zero and at most 3600 seconds.');
  if(version===1){if(input.transition!=='instant')fail('Only instant tour transitions are implemented in version 1.');}
  else input.transition=normalizeTransition(input.transition);
  // The memory core supplies bounded JSON ownership and source incidence
  // validation, including generalized/star geometry and offline metadata.
  const state=storeMemory(createMemories(),1,input.state).slots[0].state;
  const result=Object.freeze({...input,state});
  const bytes=encoder.encode(JSON.stringify(result)).length;
  if(bytes>TOUR_LIMITS.eventBytes)fail('Tour event exceeds its 32 MiB limit.');
  return {event:result,bytes,values:countValues(result,2)};
}
function assemble(events,cursor,sizes,version=1){
  if(events.length>TOUR_LIMITS.events)fail('Tours allow at most 100 events.');
  if(!Number.isInteger(cursor)||(events.length?cursor<0||cursor>=events.length:cursor!==0))fail('Invalid tour cursor.');
  const ids=new Set();let bytes=encoder.encode(JSON.stringify({version,events:[],cursor})).length,values=4;
  for(let index=0;index<events.length;index++){
    if(ids.has(events[index].id))fail('Tour event IDs must be unique.');ids.add(events[index].id);
    bytes+=sizes[index].bytes+(index?1:0);values+=sizes[index].values;
    if(bytes>TOUR_LIMITS.totalBytes)fail('Tour exceeds its 128 MiB total limit.');
    if(values>TOUR_LIMITS.values)fail('Tour exceeds its item limit.');
  }
  const result=Object.freeze({version,events:Object.freeze([...events]),cursor});trusted.set(result,{sizes:[...sizes],bytes,values});return result;
}
export function createTour(){return assemble([],0,[]);}
export function normalizeTour(value){
  if(value===undefined)return createTour();if(trusted.has(value))return value;
  const input=fields(value,['version','events','cursor'],'Tour');
  if(![1,2].includes(input.version)||!Array.isArray(input.events)||input.events.length>TOUR_LIMITS.events)fail('Tours require version 1 or 2 and at most 100 events.');
  if(Object.getOwnPropertySymbols(input.events).length||Object.getOwnPropertyNames(input.events).some(key=>key!=='length'&&(!Number.isInteger(Number(key))||Number(key)<0||String(Number(key))!==key||Number(key)>=input.events.length)))fail('Tour events cannot have custom array fields.');
  const events=[],sizes=[];let bytes=encoder.encode(JSON.stringify({version:input.version,events:[],cursor:input.cursor})).length,values=4;
  for(let index=0;index<input.events.length;index++){
    const descriptor=Object.getOwnPropertyDescriptor(input.events,String(index));if(!descriptor||!('value' in descriptor))fail('Tour events cannot be sparse or contain accessors.');
    const checked=event(descriptor.value,input.version);events.push(checked.event);sizes.push(checked);
    bytes+=checked.bytes+(index?1:0);values+=checked.values;
    if(bytes>TOUR_LIMITS.totalBytes||values>TOUR_LIMITS.values)fail('Tour exceeds its total resource limit.');
  }
  return assemble(events,input.cursor,sizes,input.version);
}
// Upgrade is explicit and only changes transition representation. Existing
// trusted immutable snapshots retain identity, ownership and source geometry.
function animated(tour){
  if(tour.version===2)return tour;
  const sizes=trusted.get(tour).sizes.map((old,index)=>transitionEvent(tour.events[index],old,{method:'instant'}));
  return assemble(sizes.map(row=>row.event),tour.cursor,sizes,2);
}
function transitionEvent(old,size,transition){
  transition=normalizeTransition(transition);
  const result=Object.freeze({...old,transition});
  const bytes=size.bytes+encoder.encode(JSON.stringify(transition)).length-encoder.encode(JSON.stringify(old.transition)).length;
  if(bytes>TOUR_LIMITS.eventBytes)fail('Tour event exceeds its 32 MiB limit.');
  return {event:result,bytes,values:size.values+countValues(transition,3)-countValues(old.transition,3)};
}
function indexOf(tour,index){if(!Number.isInteger(index)||index<0||index>=tour.events.length)fail('Tour event is unavailable.');return index;}
export function addTourEvent(value,state,duration=5,id=globalThis.crypto?.randomUUID?.()||`event-${Date.now()}-${Math.random()}`){
  const tour=normalizeTour(value);if(tour.events.length>=TOUR_LIMITS.events)fail('Tours allow at most 100 events.');
  const checked=event({id,state,duration,transition:tour.version===1?'instant':{method:'instant'}},tour.version),sizes=trusted.get(tour).sizes;
  return assemble([...tour.events,checked.event],tour.events.length,[...sizes,checked],tour.version);
}
export function replaceTourEvent(value,index,state,duration){
  const tour=normalizeTour(value);indexOf(tour,index);const old=tour.events[index];
  const checked=event({...old,state,duration:duration??old.duration},tour.version),events=[...tour.events],sizes=[...trusted.get(tour).sizes];events[index]=checked.event;sizes[index]=checked;
  return assemble(events,index,sizes,tour.version);
}
export function setTourDuration(value,index,duration){const tour=normalizeTour(value);indexOf(tour,index);return replaceTourEvent(tour,index,tour.events[index].state,duration);}
export function setTourTransition(value,index,transition){
  let tour=normalizeTour(value);indexOf(tour,index);transition=normalizeTransition(transition);tour=animated(tour);
  const sizes=[...trusted.get(tour).sizes],events=[...tour.events],checked=transitionEvent(events[index],sizes[index],transition);
  events[index]=checked.event;sizes[index]=checked;return assemble(events,index,sizes,2);
}
export function selectTourEvent(value,index){const tour=normalizeTour(value);indexOf(tour,index);return assemble(tour.events,index,trusted.get(tour).sizes,tour.version);}
export function deleteTourEvent(value,index){
  const tour=normalizeTour(value);indexOf(tour,index);const events=tour.events.filter((_,i)=>i!==index),sizes=trusted.get(tour).sizes.filter((_,i)=>i!==index);
  return assemble(events,Math.max(0,Math.min(tour.cursor-(index<tour.cursor?1:0),events.length-1)),sizes,tour.version);
}
export function moveTourEvent(value,index,delta){
  const tour=normalizeTour(value);indexOf(tour,index);if(delta!==-1&&delta!==1)fail('Tour move direction must be -1 or 1.');
  const target=index+delta;indexOf(tour,target);const events=[...tour.events],sizes=[...trusted.get(tour).sizes],selected=tour.events[tour.cursor].id;
  [events[index],events[target]]=[events[target],events[index]];[sizes[index],sizes[target]]=[sizes[target],sizes[index]];
  return assemble(events,events.findIndex(item=>item.id===selected),sizes,tour.version);
}
export function mergeTours(value,imported){
  let tour=normalizeTour(value),other=normalizeTour(imported);if(tour.events.length+other.events.length>TOUR_LIMITS.events)fail('Merged tour exceeds 100 events.');
  if(tour.version===2||other.version===2){tour=animated(tour);other=animated(other);}
  const events=[...tour.events],sizes=[...trusted.get(tour).sizes],ids=new Set(events.map(item=>item.id));
  for(let index=0;index<other.events.length;index++){
    const original=other.events[index];let id=original.id,suffix=1;
    while(ids.has(id)){const tail=`~${suffix++}`;id=original.id.slice(0,128-tail.length)+tail;}
    ids.add(id);events.push(id===original.id?original:Object.freeze({...original,id}));
    const checked=trusted.get(other).sizes[index];sizes.push({...checked,bytes:checked.bytes+encoder.encode(JSON.stringify(id)).length-encoder.encode(JSON.stringify(original.id)).length});
  }
  return assemble(events,tour.cursor,sizes,tour.version);
}
export function tourDuration(value){const tour=normalizeTour(value);return tour.events.reduce((total,event,index)=>total+event.duration+(tour.version===2&&index<tour.events.length-1?event.transition.duration:0),0);}
export function tourEventStart(value,index){const tour=normalizeTour(value);indexOf(tour,index);return tour.events.slice(0,index).reduce((time,event)=>time+event.duration+(tour.version===2?event.transition.duration:0),0);}
/** Boundary convention: an exact interior boundary selects the next event;
 * the exact nonlooping end selects the last event with localTime=duration. */
export function evaluateTour(value,time,{loop=false}={}){
  const tour=normalizeTour(value);if(!Number.isFinite(time))fail('Tour time must be finite.');
  if(tour.version===2)fail('Animated tours require the animated-tour timeline evaluator; instant evaluation cannot render saved transitions.');
  const duration=tourDuration(tour);if(!tour.events.length)return {index:-1,event:null,time:0,localTime:0,duration:0,ended:true};
  time=loop?((time%duration)+duration)%duration:Math.max(0,Math.min(time,duration));
  let start=0,index=tour.events.length-1;
  for(let i=0;i<tour.events.length;i++){if(time<start+tour.events[i].duration){index=i;break;}if(i<tour.events.length-1)start+=tour.events[i].duration;}
  const selected=tour.events[index];return {index,event:selected,time,localTime:time-start,duration,ended:!loop&&time===duration};
}
