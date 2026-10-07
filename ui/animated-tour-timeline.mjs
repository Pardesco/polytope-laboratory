/** ANIM-03 absolute presentation planner. Native snapshot validation and
 * actual multi-layer renderer/capture qualification are separate contracts. */
import {normalizeTour,TOUR_LIMITS} from './tour.mjs';
import {normalizeTransition,evaluateTransition} from './transitions.mjs';
import {normalizeSequence,evaluateNormalized,ANIMATION_LIMITS} from './animation.mjs';

export const ANIMATED_TOUR_LIMITS=Object.freeze({events:TOUR_LIMITS.events,
  bytes:TOUR_LIMITS.totalBytes,intervals:200,duration:366000,
  frames:ANIMATION_LIMITS.frames,fps:ANIMATION_LIMITS.fps});
const owned=new WeakMap(),encoder=new TextEncoder();
const fail=message=>{throw Error(message);};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
function fields(value,names,label){
  if(!plain(value)||Object.getOwnPropertySymbols(value).length)fail(`${label} requires a plain record.`);
  const d=Object.getOwnPropertyDescriptors(value);
  if(Object.keys(d).some(key=>!names.includes(key)||!('value' in d[key]))||names.some(key=>!d[key]))
    fail(`${label} has missing/unsupported fields or accessors.`);
  return Object.fromEntries(names.map(key=>[key,d[key].value]));
}
function array(value,max,label){
  if(!Array.isArray(value)||value.length>max||Object.getOwnPropertySymbols(value).length||
    Object.getOwnPropertyNames(value).some(key=>key!=='length'&&(!Number.isInteger(Number(key))||
      Number(key)<0||Number(key)>=value.length||String(Number(key))!==key)))fail(`${label} requires a bounded ordinary array.`);
  return Array.from({length:value.length},(_,index)=>{
    const d=Object.getOwnPropertyDescriptor(value,String(index));
    if(!d||!('value' in d))fail(`${label} cannot contain holes or accessors.`);return d.value;
  });
}
function freeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))freeze(child);Object.freeze(value);
  }return value;
}
const identity=evaluateTransition(normalizeTransition({method:'instant'}),0).incoming;

/** Detached v2 envelope. v1 instant tours migrate without rewriting snapshots.
 * In v2, an event's transition is the outgoing transition to its next event. */
export function normalizeAnimatedTour(value){
  const input=fields(value,['version','events','cursor'],'Animated tour');
  if(input.version===1){
    const legacy=normalizeTour(value);
    return Object.freeze({version:2,cursor:legacy.cursor,events:Object.freeze(legacy.events.map(event=>
      Object.freeze({...event,transition:normalizeTransition({method:'instant'})})))});
  }
  if(input.version!==2)fail('Unsupported animated tour version; only legacy1 and animated2 are readable.');
  const events=array(input.events,ANIMATED_TOUR_LIMITS.events,'Animated tour events').map((value,index)=>{
    const event=fields(value,['id','state','duration','transition'],`Animated tour event ${index}`);
    return {...event,transition:normalizeTransition(event.transition)};
  });
  // Reuse authoritative bounded renderer-side snapshot cloning and incidence
  // syntax checks. This is NOT native geometric/certificate qualification.
  const snapshots=normalizeTour({version:1,cursor:input.cursor,
    events:events.map(event=>({...event,transition:'instant'}))});
  const result=Object.freeze({version:2,cursor:snapshots.cursor,events:Object.freeze(snapshots.events.map((event,index)=>
    Object.freeze({...event,transition:events[index].transition})))});
  if(encoder.encode(JSON.stringify(result)).length>ANIMATED_TOUR_LIMITS.bytes)
    fail('Animated tour, including transitions, exceeds the 128 MiB limit.');
  return result;
}

/** One owned immutable hold/transition partition; prepare once per tour edit.
 * Hold durations exclude transitions. A final transition is included only in
 * looping timelines, where it leads back to event0. No inherited layout yet. */
export function prepareAnimatedTourTimeline(value,{loop=false}={}){
  if(typeof loop!=='boolean')fail('Animated tour loop must be boolean.');
  const tour=normalizeAnimatedTour(value),animations=tour.events.map((event,index)=>{
    if(event.state.view.animation===undefined)return null;
    try{return freeze(normalizeSequence(event.state.view.animation));}
    catch(error){fail(`Animated tour event ${index} (${event.id}) has an invalid saved animation: ${error.message}`);}
  });
  const intervals=[],eventStarts=[];let duration=0;
  const append=(kind,index,length,nextIndex)=>{
    const start=duration,end=start+length;
    if(!Number.isFinite(end)||end<=start||end>ANIMATED_TOUR_LIMITS.duration)
      fail('Tour intervals exceed duration limits or lose positive duration at Float64 resolution.');
    intervals.push(Object.freeze({kind,index,start,end,duration:length,...kind==='transition'?{nextIndex}:{}}));duration=end;
  };
  for(const [index,event] of tour.events.entries()){
    eventStarts.push(duration);append('hold',index,event.duration);
    if(event.transition.duration>0&&(index<tour.events.length-1||loop))
      append('transition',index,event.transition.duration,(index+1)%tour.events.length);
  }
  if(intervals.length>ANIMATED_TOUR_LIMITS.intervals)fail('Tour interval resource limit exceeded.');
  const result=Object.freeze({version:1,tour,loop,duration,
    intervals:Object.freeze(intervals),eventStarts:Object.freeze(eventStarts),
    scope:'presentation plan; source geometry unchanged; native/render/capture qualification required'});
  owned.set(result,{animations});return result;
}
function checked(timeline){
  const data=owned.get(timeline);if(!data)fail('Use an owned prepared animated tour timeline; foreign or forged plans are unsupported.');
  return data;
}
function layer(timeline,data,index,localTime,role,pose){
  const event=timeline.tour.events[index],sequence=data.animations[index];let animation=null;
  if(sequence){
    const time=sequence.loop?localTime%sequence.duration:Math.min(localTime,sequence.duration);
    animation=Object.freeze({sequence,time,frame:freeze(evaluateNormalized(sequence,time))});
  }
  return Object.freeze({index,eventId:event.id,role,localTime,state:event.state,
    modelId:event.state.model.id??null,modelFingerprint:event.state.model.fingerprint??null,
    animation,transitionPose:pose});
}

/** Absolute elapsed seconds: no previous frame or requested FPS affects a pose.
 * During a transition outgoing holds its terminal animation pose, incoming its
 * initial pose; incoming animation advances only once its hold begins.
 * Exact interior boundaries select the interval on the right. */
export function evaluateAnimatedTour(timeline,time){
  const data=checked(timeline);if(typeof time!=='number'||!Number.isFinite(time))fail('Tour elapsed time must be finite.');
  const duration=timeline.duration;
  if(!timeline.tour.events.length)return Object.freeze({time:0,duration:0,index:-1,phase:'empty',localTime:0,ended:true,layers:Object.freeze([])});
  if(timeline.loop){
    // Avoid adding a large period to a positive tiny remainder: that addition
    // can erase an otherwise representable positive elapsed time.
    const remainder=time%duration;time=remainder<0?remainder+duration:remainder;
    if(time===duration||time===0)time=0;
  }else time=Math.max(0,Math.min(time,duration));
  const interval=timeline.intervals.find(interval=>time<interval.end)??timeline.intervals.at(-1);
  // Cumulative Float64 timestamps may subtract to a neighboring value. A
  // literal terminal request must still reproduce the saved event endpoint.
  const localTime=time===interval.end?interval.duration:Math.min(interval.duration,time-interval.start);
  let layers;
  if(interval.kind==='hold')layers=[layer(timeline,data,interval.index,localTime,'active',identity)];
  else{
    const event=timeline.tour.events[interval.index],poses=evaluateTransition(event.transition,localTime);
    layers=[layer(timeline,data,interval.index,event.duration,'outgoing',poses.outgoing),
      layer(timeline,data,interval.nextIndex,0,'incoming',poses.incoming)];
  }
  return Object.freeze({time,duration,index:interval.index,phase:interval.kind,localTime,
    ended:!timeline.loop&&time===duration,layers:Object.freeze(layers)});
}

/** Exact mathematical sample requests, not a video-encoder timing promise.
 * Includes both endpoints. Optional boundaries retain exact stored interval
 * times without epsilon-merging them into nearby frame-grid values. */
export function animatedTourFrameTimes(timeline,fps,{includeBoundaries=false}={}){
  checked(timeline);
  if(!Number.isInteger(fps)||fps<1||fps>ANIMATED_TOUR_LIMITS.fps)fail('Tour sample FPS must be a literal integer 1..60.');
  if(typeof includeBoundaries!=='boolean')fail('Tour boundary sampling must be boolean.');
  const count=Math.ceil(timeline.duration*fps);
  if(count+1>ANIMATED_TOUR_LIMITS.frames)fail('Requested tour sample count exceeds the 18001-frame limit.');
  const times=new Set();for(let index=0;index<=count;index++)times.add(Math.min(index/fps,timeline.duration));
  if(includeBoundaries)for(const interval of timeline.intervals){times.add(interval.start);times.add(interval.end);}
  if(times.size>ANIMATED_TOUR_LIMITS.frames)fail('Tour boundaries exceed the 18001-frame sample limit.');
  return Object.freeze([...times].sort((a,b)=>a-b));
}
