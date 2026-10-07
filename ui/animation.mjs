/** Saved, deterministic animation tracks. Angles are degrees and interpolate
 * directly (0 -> 360 is a complete turn, rather than a shortest-path shortcut). */
export const ANIMATION_LIMITS = Object.freeze({duration:300, fps:60, keyframes:256, frames:18001, explosionAmount:10});

function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);}
function fields(value,allowed,label){
  if(!plain(value)||Object.getOwnPropertySymbols(value).length)throw new Error(`${label} requires a plain record.`);
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(Object.keys(descriptors).some(key=>!allowed.includes(key)||!('value' in descriptors[key])))throw new Error(`${label} has unsupported fields or accessors.`);
  return Object.fromEntries(Object.entries(descriptors).map(([key,item])=>[key,item.value]));
}
function ordinaryArray(value,label){
  if(!Array.isArray(value)||Object.getOwnPropertySymbols(value).length||Object.getOwnPropertyNames(value).some(key=>key!=='length'&&(!Number.isInteger(Number(key))||String(Number(key))!==key||Number(key)<0||Number(key)>=value.length)))throw new Error(`${label} requires an ordinary array.`);
  return Array.from({length:value.length},(_,index)=>{const descriptor=Object.getOwnPropertyDescriptor(value,String(index));if(!descriptor||!('value' in descriptor))throw new Error(`${label} cannot contain holes or accessors.`);return descriptor.value;});
}
function normalizeTracks(value){
  const tracks=fields(value,['explosion','fold'],'Animation tracks'),result={};
  if(tracks.explosion!==undefined){
    const options=fields(tracks.explosion,['direction'],'Explosion track');
    if(!['normal','radial'].includes(options.direction))throw new Error('Explosion track direction must be normal or radial.');
    result.explosion={direction:options.direction};
  }
  if(tracks.fold!==undefined){
    const options=fields(tracks.fold,['kind'],'Fold track');
    if(options.kind!=='face-net')throw new Error('Only rigid 3D face-net folding tracks are supported; partial 4D cell-net folding is unavailable.');
    result.fold={kind:'face-net'};
  }
  if(!Object.keys(result).length)throw new Error('Version 2 animations require at least one supported track.');
  return result;
}
function trackValue(value,name){
  finite(value,name==='explosionAmount'?'Explosion amount':'Fold fraction');
  const max=name==='explosionAmount'?ANIMATION_LIMITS.explosionAmount:1;
  if(value<0||value>max)throw new Error(`${name} must be in [0,${max}].`);
  return value;
}

function finite(value, label) {
  if(typeof value !== 'number' || !Number.isFinite(value))throw new Error(`${label} must be a finite number.`);
  return value;
}

export function normalizeSequence(value) {
  value=fields(value,['version','duration','fps','loop','keyframes','tracks'],'Animation sequence');
  if(value.version!==1&&value.version!==2)throw new Error('Unsupported animation sequence version.');
  const tracks=value.version===2?normalizeTracks(value.tracks):null;
  if(value.version===1&&value.tracks!==undefined)throw new Error('Additional animation tracks require version 2.');
  const duration=finite(value.duration,'Animation duration'),fps=finite(value.fps,'Animation frame rate');
  if(duration<=0 || duration>ANIMATION_LIMITS.duration)throw new Error('Animation duration must be greater than zero and at most 300 seconds.');
  if(!Number.isInteger(fps) || fps<1 || fps>ANIMATION_LIMITS.fps)throw new Error('Animation frame rate must be an integer from 1 to 60.');
  if(!Array.isArray(value.keyframes) || value.keyframes.length<2 || value.keyframes.length>ANIMATION_LIMITS.keyframes)throw new Error('Animation requires 2 to 256 keyframes.');
  const names=['time','angles','sectionOffset',...(tracks?.explosion?['explosionAmount']:[]),...(tracks?.fold?['foldFraction']:[])];
  const inputFrames=ordinaryArray(value.keyframes,'Animation keyframes');
  const keyframes=inputFrames.map((input,index)=>{
    const frame=fields(input,names,'Animation keyframe');
    const time=finite(frame.time,'Keyframe time');
    if(time<0 || time>duration || (index && time<=inputFrames[index-1].time))throw new Error('Keyframe times must increase strictly within the animation duration.');
    if(!Array.isArray(frame.angles) || frame.angles.length!==6)throw new Error('Every keyframe requires six rotation angles.');
    const angles=ordinaryArray(frame.angles,'Rotation angles').map(angle=>finite(angle,'Rotation angle'));
    if(angles.some(angle=>Math.abs(angle)>1e6))throw new Error('Rotation angles exceed the supported range.');
    return {time,angles,sectionOffset:finite(frame.sectionOffset,'Section depth'),...(tracks?.explosion?{explosionAmount:trackValue(frame.explosionAmount,'explosionAmount')}:{}),...(tracks?.fold?{foldFraction:trackValue(frame.foldFraction,'foldFraction')}:{})};
  });
  if(keyframes[0].time!==0 || keyframes.at(-1).time!==duration)throw new Error('Animation keyframes must include time zero and the exact duration.');
  if(value.loop!==undefined && typeof value.loop!=='boolean')throw new Error('Animation loop must be a boolean.');
  return {version:value.version,duration,fps,loop:value.loop===true,...(tracks?{tracks}:{}),keyframes};
}

export function evaluateSequence(value,time) {
  const sequence=normalizeSequence(value);
  return evaluateNormalized(sequence,finite(time,'Animation time'));
}

export function evaluateNormalized(sequence,time) {
  time=Math.max(0,Math.min(sequence.duration,finite(time,'Animation time')));
  const frames=sequence.keyframes;
  if(time===0)return {...frames[0],angles:[...frames[0].angles]};
  if(time===sequence.duration)return {...frames.at(-1),angles:[...frames.at(-1).angles]};
  let high=frames.findIndex(frame=>frame.time>=time),a=frames[high-1],b=frames[high];
  const fraction=(time-a.time)/(b.time-a.time);
  const frame={time,angles:a.angles.map((angle,index)=>angle+(b.angles[index]-angle)*fraction),sectionOffset:a.sectionOffset===b.sectionOffset?a.sectionOffset:(1-fraction)*a.sectionOffset+fraction*b.sectionOffset};
  for(const name of ['explosionAmount','foldFraction'])if(Object.hasOwn(a,name))frame[name]=a[name]==b[name]?a[name]:(1-fraction)*a[name]+fraction*b[name];
  return frame;
}

/** Exact frame samples include both endpoints, even for fractional durations. */
export function sequenceFrameTimes(value) {
  const sequence=normalizeSequence(value),times=[];
  const count=Math.ceil(sequence.duration*sequence.fps);
  for(let index=0;index<=count;index++)times.push(Math.min(index/sequence.fps,sequence.duration));
  return times;
}

export function createSequence(view={},duration=8,fps=24,{tracks}={}) {
  const angles=Array.from({length:6},(_,index)=>Number(view.angles?.[index]||0));
  const sectionOffset=Number(view.sectionOffset||0),end=[...angles];
  end[0]+=360;
  const sequence=normalizeSequence({version:1,duration,fps,loop:false,keyframes:[{time:0,angles,sectionOffset},{time:duration,angles:end,sectionOffset}]});
  return tracks?withSequenceTracks(sequence,tracks,view):sequence;
}

/** Explicit migration retains v1 angles/depth. Empty tracks explicitly remove
 * presentation tracks and downgrade to v1; source geometry is never modified. */
export function withSequenceTracks(value,options,defaults={}){
  const sequence=normalizeSequence(value),supplied=fields(options,['explosion','fold'],'Animation tracks');
  const tracks=Object.keys(supplied).length?normalizeTracks(supplied):null;
  const keyframes=sequence.keyframes.map(frame=>({time:frame.time,angles:[...frame.angles],sectionOffset:frame.sectionOffset,...(tracks?.explosion?{explosionAmount:frame.explosionAmount??defaults.explosionAmount??0}:{}),...(tracks?.fold?{foldFraction:frame.foldFraction??defaults.foldFraction??0}:{})}));
  return normalizeSequence({version:tracks?2:1,duration:sequence.duration,fps:sequence.fps,loop:sequence.loop,...(tracks?{tracks}:{}),keyframes});
}

export function setSequenceKeyframe(value,time,view) {
  const sequence=normalizeSequence(value);
  finite(time,'Keyframe time');
  if(time<0 || time>sequence.duration)throw new Error('Keyframe time is outside the sequence.');
  const old=evaluateNormalized(sequence,time);
  const frame={time,angles:[...view.angles],sectionOffset:view.sectionOffset,...(sequence.tracks?.explosion?{explosionAmount:view.explosionAmount??old.explosionAmount}:{}),...(sequence.tracks?.fold?{foldFraction:view.foldFraction??old.foldFraction}:{})};
  const index=sequence.keyframes.findIndex(candidate=>Math.abs(candidate.time-time)<1e-8);
  if(index>=0)sequence.keyframes[index]=frame;
  else sequence.keyframes.push(frame);
  sequence.keyframes.sort((a,b)=>a.time-b.time);
  return normalizeSequence(sequence);
}

export function resizeSequence(value,duration) {
  const sequence=normalizeSequence(value);
  finite(duration,'Animation duration');
  const scale=duration/sequence.duration;
  return normalizeSequence({...sequence,duration,keyframes:sequence.keyframes.map((frame,index)=>({...frame,time:index===sequence.keyframes.length-1?duration:frame.time*scale}))});
}
