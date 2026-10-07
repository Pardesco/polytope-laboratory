// SPDX-License-Identifier: GPL-3.0-only
export const APPEARANCE_DEFAULTS=Object.freeze({version:1,preset:'classic',theme:'dark',
  tint:'#ffffff',specular:'#18202a',shininess:30,ambient:.08,hemisphere:.85,
  keyIntensity:1.5,fillIntensity:.48,keyDirection:Object.freeze([4,7,6]),fillDirection:Object.freeze([-5,1,-3]),
  background:'#15191f',edgeColor:'#9eafc0',vertexColor:'#c8d2dd'});
export const MATERIAL_PRESETS=Object.freeze({
  classic:Object.freeze({tint:'#ffffff',specular:'#18202a',shininess:30}),
  matte:Object.freeze({tint:'#ffffff',specular:'#000000',shininess:0}),
  polished:Object.freeze({tint:'#ffffff',specular:'#b8c4d4',shininess:160}),
  warm:Object.freeze({tint:'#ffd6a8',specular:'#806040',shininess:70})});
export const THEME_PRESETS=Object.freeze({
  dark:Object.freeze({background:'#15191f',edgeColor:'#9eafc0',vertexColor:'#c8d2dd'}),
  light:Object.freeze({background:'#e9edf2',edgeColor:'#263447',vertexColor:'#253347'}),
  paper:Object.freeze({background:'#ffffff',edgeColor:'#202020',vertexColor:'#202020'})});
const fail=message=>{throw Error(message);};
const color=value=>typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value);
export function appearanceOptions(value=undefined){
  if(value===undefined)return {...APPEARANCE_DEFAULTS,keyDirection:[4,7,6],fillDirection:[-5,1,-3]};
  if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||
    Object.getOwnPropertySymbols(value).length)fail('Saved appearance requires a bounded plain record.');
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(Object.keys(descriptors).some(key=>!Object.hasOwn(APPEARANCE_DEFAULTS,key))||
    Object.values(descriptors).some(field=>!('value' in field)))fail('Saved appearance has unsupported fields.');
  const options={...APPEARANCE_DEFAULTS,...value};
  if(options.version!==1||!['classic','matte','polished','warm','custom'].includes(options.preset)||
    !['dark','light','paper','custom'].includes(options.theme))fail('Unsupported saved appearance version or preset.');
  for(const key of ['tint','specular','background','edgeColor','vertexColor']){
    if(!color(options[key]))fail(`${key} requires a six-digit hexadecimal color.`);
    options[key]=options[key].toLowerCase();
  }
  for(const [key,max] of [['shininess',512],['ambient',5],['hemisphere',5],['keyIntensity',10],['fillIntensity',10]])
    if(typeof options[key]!=='number'||!Number.isFinite(options[key])||options[key]<0||options[key]>max)
      fail(`${key} must be finite between 0 and ${max}.`);
  for(const key of ['keyDirection','fillDirection']){
    const v=options[key];
    if(!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length!==3||
      Object.getOwnPropertySymbols(v).length||Object.getOwnPropertyNames(v).length!==4||
      [0,1,2].some(i=>!Object.hasOwn(v,i)||!('value' in Object.getOwnPropertyDescriptor(v,String(i))))||
      v.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>100)||Math.hypot(...v)<1e-6)
      fail(`${key} requires three finite coordinates within ±100 and nonzero length.`);
    options[key]=[...v];
  }
  return options;
}
export function materialPreset(name,current){
  if(!Object.hasOwn(MATERIAL_PRESETS,name))fail('Choose an implemented material preset.');
  return appearanceOptions({...appearanceOptions(current),...MATERIAL_PRESETS[name],preset:name});
}
export function themePreset(name,current){
  if(!Object.hasOwn(THEME_PRESETS,name))fail('Choose an implemented viewport theme.');
  return appearanceOptions({...appearanceOptions(current),...THEME_PRESETS[name],theme:name});
}
export function appearanceBackground(view){return appearanceOptions(view?.appearance).background;}
