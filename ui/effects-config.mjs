// SPDX-License-Identifier: GPL-3.0-only
export const EFFECT_DEFAULTS=Object.freeze({version:1,bump:'none',bumpStrength:.015,bumpFrequency:12,
  reflection:'none',reflectivity:.2,environmentMode:'reflection',refractiveIndex:1.5});
export function effectsOptions(value=undefined){
  if(value===undefined)return {...EFFECT_DEFAULTS};
  if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||
    Object.getOwnPropertySymbols(value).length)throw Error('Saved material effects require a plain record.');
  const d=Object.getOwnPropertyDescriptors(value);
  if(Object.keys(d).some(k=>!Object.hasOwn(EFFECT_DEFAULTS,k))||Object.values(d).some(x=>!('value' in x)))
    throw Error('Saved material effects have unsupported fields.');
  const o={...EFFECT_DEFAULTS,...value};
  if(o.version!==1||!['none','waves','pebbles'].includes(o.bump)||!['none','studio'].includes(o.reflection)||!['reflection','refraction'].includes(o.environmentMode))
    throw Error('Unsupported material effect version or built-in asset.');
  for(const [key,min,max] of [['bumpStrength',0,.1],['bumpFrequency',1,32],['reflectivity',0,1],['refractiveIndex',1,3]])
    if(typeof o[key]!=='number'||!Number.isFinite(o[key])||o[key]<min||o[key]>max)
      throw Error(`${key} must be finite between ${min} and ${max}.`);
  return o;
}

// Independent CPU definition of the same analytic object-space height field.
export function heightGradient(point,kind,frequency){
  const k=2*Math.PI*frequency,s=point.map(x=>Math.sin(k*x)),c=point.map(x=>Math.cos(k*x));
  if(kind==='waves')return {height:s[0]*s[1]*s[2],gradient:[k*c[0]*s[1]*s[2],k*s[0]*c[1]*s[2],k*s[0]*s[1]*c[2]]};
  if(kind==='pebbles')return {height:(c[0]+c[1]+c[2])/3,gradient:s.map(x=>-k*x/3)};
  return {height:0,gradient:[0,0,0]};
}
