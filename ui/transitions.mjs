/** Presentation-only transition math. No renderer or saved geometry is changed. */
export const TRANSITION_METHODS=Object.freeze(['instant','sideways','orbit','shrink-grow','explode-grow','shrink-implode','explode-implode','combination']);
const trusted=new WeakSet();
const defaults={version:1,method:'instant',duration:0,easing:'smoothstep',angle:0,distance:2,tilt:0,orbits:1,spin:0,explosionSize:3,direction:1,components:[]};
const fail=message=>{throw new Error(message);};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
function record(value,keys,label,required=false){
  if(!plain(value)||Object.getOwnPropertySymbols(value).length)fail(`${label} requires a plain record.`);
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(Object.keys(descriptors).some(key=>!keys.includes(key)||!('value' in descriptors[key]))||required&&keys.some(key=>!descriptors[key]))fail(`${label} has unsupported fields or accessors.`);
  return Object.fromEntries(Object.entries(descriptors).map(([key,descriptor])=>[key,descriptor.value]));
}
function number(value,min,max,label){if(!Number.isFinite(value)||value<min||value>max)fail(`${label} must be finite and between ${min} and ${max}.`);return value;}
function list(value,max,label){
  if(!Array.isArray(value)||value.length>max||Object.getOwnPropertySymbols(value).length||Object.getOwnPropertyNames(value).some(key=>key!=='length'&&(!Number.isInteger(Number(key))||String(Number(key))!==key||Number(key)<0||Number(key)>=value.length)))fail(`${label} requires a bounded ordinary array.`);
  return Array.from({length:value.length},(_,index)=>{const descriptor=Object.getOwnPropertyDescriptor(value,String(index));if(!descriptor||!('value' in descriptor))fail(`${label} cannot contain holes or accessors.`);return descriptor.value;});
}
export function normalizeTransition(value={}){
  if(trusted.has(value))return value;
  const supplied=record(value,Object.keys(defaults),'Transition'),method=supplied.method??'instant';
  const result={...defaults,...supplied,method,duration:supplied.duration??(method==='instant'?0:.5)};
  if(result.version!==1||!TRANSITION_METHODS.includes(method))fail('Unsupported transition version or method.');
  number(result.duration,0,60,'Transition duration');if(method!=='instant'&&result.duration===0)fail('Animated transitions require positive duration.');if(method==='instant'&&result.duration!==0)fail('Instant transitions have zero duration.');
  if(!['linear','smoothstep','smootherstep'].includes(result.easing))fail('Unsupported transition easing.');
  number(result.angle,-360,360,'Movement angle');number(result.distance,0,100,'Movement distance');number(result.tilt,-180,180,'Orbit tilt');number(result.orbits,0,100,'Orbit count');number(result.spin,0,100,'Fade spin');number(result.explosionSize,1,100,'Explosion size');
  if(result.direction!==1&&result.direction!==-1)fail('Transition direction must be 1 or -1.');
  const components=list(result.components,4,'Transition components');
  if(method==='combination'){
    const allowed=['sideways','orbit','shrink-grow','explode-grow','shrink-implode','explode-implode'];
    if(!components.length||new Set(components).size!==components.length||components.some(item=>!allowed.includes(item)))fail('Combination requires distinct supported components.');
    if(components.filter(item=>item.includes('explode')||item.includes('implode')).length>1)fail('A combination allows only one explosion component.');
  }else if(components.length)fail('Only combinations accept component methods.');
  result.components=Object.freeze(components);Object.freeze(result);trusted.add(result);return result;
}
export function createTransition(method='instant',options={}){return normalizeTransition({...record(options,Object.keys(defaults),'Transition options'),method});}
const identity=()=>({translation:[0,0,0],angles:[0,0,0,0,0,0],scale:1,opacity:1,explosionFactor:1});
function freezePose(pose){pose.translation=Object.freeze(pose.translation.map(value=>value===0?0:value));pose.angles=Object.freeze(pose.angles.map(value=>value===0?0:value));return Object.freeze(pose);}
function pairAt(spec,p,progress=p){
  const outgoing=identity(),incoming=identity();outgoing.opacity=1-p;incoming.opacity=p;
  const methods=spec.method==='combination'?spec.components:[spec.method];
  for(const method of methods){
    if(method==='sideways'){
      const angle=spec.angle*Math.PI/180,axis=[-Math.cos(angle)*spec.direction,-Math.sin(angle)*spec.direction,0];
      for(let i=0;i<3;i++){outgoing.translation[i]+=axis[i]*spec.distance*p;incoming.translation[i]-=axis[i]*spec.distance*(1-p);}
    }
    if(method==='orbit'){
      const theta=2*Math.PI*spec.orbits*p*spec.direction,tilt=spec.tilt*Math.PI/180,axis=[Math.cos(theta),Math.sin(theta)*Math.cos(tilt),Math.sin(theta)*Math.sin(tilt)];
      for(let i=0;i<3;i++){outgoing.translation[i]+=axis[i]*spec.distance*p;incoming.translation[i]-=axis[i]*spec.distance*(1-p);}
    }
    if(['orbit','shrink-grow','shrink-implode'].includes(method))outgoing.scale*=1-p;
    if(['orbit','shrink-grow','explode-grow'].includes(method))incoming.scale*=p;
    if(['explode-grow','explode-implode'].includes(method))outgoing.explosionFactor=1+(spec.explosionSize-1)*p;
    if(['shrink-implode','explode-implode'].includes(method))incoming.explosionFactor=1+(spec.explosionSize-1)*(1-p);
  }
  // Integral of a linearly increasing spin rate ending at `spin` rev/s.
  outgoing.angles[1]=180*spec.spin*spec.duration*progress*progress*spec.direction;
  incoming.angles[1]=-180*spec.spin*spec.duration*(1-progress)*(1-progress)*spec.direction;
  return {outgoing,incoming};
}
function checkedPose(value){
  const pose=record(value,['translation','angles','scale','opacity','explosionFactor'],'Visual pose',true);
  pose.translation=list(pose.translation,3,'Translation');pose.angles=list(pose.angles,6,'Rotation angles');
  if(pose.translation.length!==3||pose.angles.length!==6)fail('Visual poses require three translation values and six rotation angles.');
  pose.translation.forEach(value=>number(value,-1e6,1e6,'Translation'));pose.angles.forEach(value=>number(value,-1e9,1e9,'Rotation angle'));
  number(pose.scale,0,100,'Visual scale');number(pose.opacity,0,1,'Visual opacity');number(pose.explosionFactor,1,100,'Explosion factor');return freezePose(pose);
}
export function captureTransition(frame){
  const fields=record(frame,['outgoing','incoming','time','progress','ended'],'Transition frame');
  if(!fields.outgoing||!fields.incoming)fail('A transition snapshot requires both visual poses.');
  return Object.freeze({outgoing:checkedPose(fields.outgoing),incoming:checkedPose(fields.incoming)});
}
/** Returns absolute-time visual poses. `initial` rebases an interrupted frame
 * continuously at time zero, retaining the new method's exact endpoint. */
export function evaluateTransition(value,time,{initial}={}){
  const spec=normalizeTransition(value);if(!Number.isFinite(time))fail('Transition time must be finite.');
  const progress=spec.duration===0?(time<0?0:1):Math.max(0,Math.min(1,time/spec.duration));
  const eased=spec.easing==='smoothstep'?progress*progress*(3-2*progress):spec.easing==='smootherstep'?progress**3*(progress*(progress*6-15)+10):progress,p=Math.max(0,Math.min(1,eased));
  const poses=pairAt(spec,p,progress);
  if(initial){
    const start=captureTransition(initial),natural=pairAt(spec,0),terminal=pairAt(spec,1);
    if(progress===0)return Object.freeze({...start,time:0,progress:0,ended:false});
    for(const role of ['outgoing','incoming'])for(const key of ['translation','angles','scale','opacity','explosionFactor']){
      if(Array.isArray(poses[role][key]))poses[role][key]=poses[role][key].map((value,index)=>value+(start[role][key][index]-natural[role][key][index])*(1-p));
      else {
        const a=natural[role][key],b=terminal[role][key],fraction=a===b?p:Math.max(0,Math.min(1,(poses[role][key]-a)/(b-a)));
        poses[role][key]=start[role][key]+(b-start[role][key])*fraction;
      }
    }
  }
  return Object.freeze({outgoing:freezePose(poses.outgoing),incoming:freezePose(poses.incoming),time:spec.duration*progress,progress,ended:progress===1});
}
/** Independent face/cell displacement, before any projection. The caller
 * supplies source centroids; original source vertex/index buffers stay intact. */
export function explosionOffsets(centroids,factor,center){
  const points=list(centroids,100000,'Entity centroids');number(factor,1,100,'Explosion factor');
  center=list(center,4,'Explosion center');if(center.length<2)fail('Explosion center must have dimension 2, 3 or 4.');center.forEach(value=>number(value,-1e100,1e100,'Center coordinate'));
  return Object.freeze(points.map(point=>{point=list(point,4,'Entity centroid');if(point.length!==center.length)fail('Explosion centroid dimension mismatch.');return Object.freeze(point.map((value,index)=>{const offset=(number(value,-1e100,1e100,'Centroid coordinate')-center[index])*(factor-1);return offset===0?0:offset;}));}));
}
