// SPDX-License-Identifier: GPL-3.0-only
import * as THREE from 'three';
import {effectsOptions} from './effects-config.mjs';
import {configureProceduralBump} from './procedural-bump.mjs';
export const STUDIO_URLS=Object.freeze([
  new URL('./assets/studio-cube/px.png',import.meta.url).href,new URL('./assets/studio-cube/nx.png',import.meta.url).href,
  new URL('./assets/studio-cube/py.png',import.meta.url).href,new URL('./assets/studio-cube/ny.png',import.meta.url).href,
  new URL('./assets/studio-cube/pz.png',import.meta.url).href,new URL('./assets/studio-cube/nz.png',import.meta.url).href]);
const abort=()=>Object.assign(Error('Material effect source or configuration changed.'),{name:'AbortError'});
const encoder=new TextEncoder();
const signature=view=>JSON.stringify(effectsOptions(view?.materialEffects));
function modelSignature(viewer){
  const text=JSON.stringify(viewer.model);
  if(typeof text!=='string'||text.length>16*1024*1024||encoder.encode(text).byteLength>16*1024*1024)
    throw Error('Material environment source snapshot exceeds 16 MiB.');
  return text;
}
const defaultLoader=(urls,onLoad,onError)=>new THREE.CubeTextureLoader().load(urls,onLoad,undefined,onError);

export function createMaterialEffectOwner(viewer,{loadCube=defaultLoader}={}){
  const owner={model:viewer.model,sourceSignature:modelSignature(viewer),configSignature:signature(viewer.view),
    texture:null,state:'pending',disposed:false,textureDisposed:false,error:null};
  let resolve,reject;
  owner.ready=new Promise((yes,no)=>{resolve=yes;reject=no;});owner.ready.catch(()=>{});
  const disposeTexture=()=>{if(owner.texture&&!owner.textureDisposed){owner.texture.dispose();owner.textureDisposed=true;}};
  const fail=error=>{
    if(owner.state!=='pending')return;
    clearTimeout(owner.timer);owner.state='failed';owner.error=error;disposeTexture();reject(error);
  };
  owner.dispose=()=>{
    if(owner.disposed)return;
    owner.disposed=true;clearTimeout(owner.timer);
    if(owner.state==='pending'){owner.state='disposed';reject(abort());}
    disposeTexture();
  };
  owner.timer=setTimeout(()=>fail(Error('Built-in studio environment decoding timed out after 10 seconds.')),10000);
  try{
    owner.texture=loadCube([...STUDIO_URLS],texture=>{
      if(owner.disposed||owner.state!=='pending'){disposeTexture();return;}
      try{
        if(viewer.materialEffectsOwner!==owner||viewer.model!==owner.model||modelSignature(viewer)!==owner.sourceSignature||
          signature(viewer.view)!==owner.configSignature)throw abort();
        if(texture!==owner.texture||texture.images?.length!==6||texture.images.some(image=>
          (image.naturalWidth??image.width)!==32||(image.naturalHeight??image.height)!==32))
          throw Error('Built-in studio cube must decode six 32 by 32 images.');
        texture.colorSpace=THREE.SRGBColorSpace;texture.mapping=THREE.CubeReflectionMapping;
        clearTimeout(owner.timer);owner.state='ready';resolve(texture);
        applyMaterialEffects(viewer,viewer.view);viewer.draw?.();viewer.onDisplay?.(viewer.lastDisplayStatus??{});
      }catch(error){fail(error);viewer.appearanceEffectsDiagnostic=error.message;viewer.onDisplay?.(viewer.lastDisplayStatus??{});}
    },()=>fail(Error('Built-in studio environment could not be decoded.')));
  }catch(error){fail(error);}
  return owner;
}

export function disposeMaterialEffects(viewer){
  const owner=viewer.materialEffectsOwner,material=viewer.surface?.material;
  if(owner){
    if(material?.envMap===owner.texture){material.envMap=null;material.combine=THREE.MultiplyOperation;material.needsUpdate=true;}
    owner.dispose();viewer.materialEffectsOwner=null;
  }
  if(material)configureProceduralBump(material,{bump:'none',bumpStrength:0});
  viewer.appearanceEffectsDiagnostic=null;
}

export function applyMaterialEffects(viewer,view,{loadCube=defaultLoader}={}){
  const options=effectsOptions(view?.materialEffects),material=viewer.surface?.material;
  if(!material?.isMeshPhongMaterial||!viewer.model)return options;
  configureProceduralBump(material,options);
  let owner=viewer.materialEffectsOwner;
  if(options.reflection==='none'){
    if(owner){if(material.envMap===owner.texture){material.envMap=null;material.combine=THREE.MultiplyOperation;material.needsUpdate=true;}owner.dispose();viewer.materialEffectsOwner=null;}
    viewer.appearanceEffectsDiagnostic=null;return options;
  }
  if(owner&&(owner.model!==viewer.model||owner.disposed||owner.state==='pending'&&owner.configSignature!==signature(view))){
    if(material.envMap===owner.texture){material.envMap=null;material.needsUpdate=true;}
    owner.dispose();viewer.materialEffectsOwner=null;owner=null;
  }
  if(!owner){
    // Viewer sets its saved view before this call; explicit tests may pass an
    // equivalent retained view. No caller can select arbitrary texture URLs.
    if(signature(viewer.view)!==signature(view))throw abort();
    viewer.materialEffectsOwner=owner=createMaterialEffectOwner(viewer,{loadCube});
  }
  if(owner.state==='ready'){
    const mapping=options.environmentMode==='refraction'?THREE.CubeRefractionMapping:THREE.CubeReflectionMapping;
    if(material.envMap!==owner.texture||material.combine!==THREE.MixOperation||owner.texture.mapping!==mapping){
      owner.texture.mapping=mapping;material.envMap=owner.texture;material.combine=THREE.MixOperation;material.needsUpdate=true;
    }
    material.refractionRatio=1/options.refractiveIndex;
    material.reflectivity=options.reflectivity;viewer.appearanceEffectsDiagnostic=null;
  }else viewer.appearanceEffectsDiagnostic=owner.error?.message??'Loading built-in studio environment…';
  return options;
}

function waitFor(promise,signal){
  if(!signal)return promise;
  if(signal.aborted)return Promise.reject(abort());
  return new Promise((resolve,reject)=>{
    const stopped=()=>{cleanup();reject(abort());},cleanup=()=>signal.removeEventListener('abort',stopped);
    signal.addEventListener('abort',stopped,{once:true});
    promise.then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
  });
}

export async function prepareMaterialEffects(viewer,{signal,isCurrent=()=>true}={}){
  if(signal?.aborted||!isCurrent())throw abort();
  const view=viewer.view,model=viewer.model,settings=signature(view);
  const options=applyMaterialEffects(viewer,view);
  if(options.reflection==='none')return {complete:true,reflection:'none',bump:options.bump,environmentMode:options.environmentMode,refractionRatio:1/options.refractiveIndex};
  const owner=viewer.materialEffectsOwner,before=modelSignature(viewer);
  if(!owner)throw Error('Requested studio environment has no owned surface.');
  await waitFor(owner.ready,signal);
  if(signal?.aborted||!isCurrent()||viewer.model!==model||modelSignature(viewer)!==before||signature(viewer.view)!==settings||
    viewer.materialEffectsOwner!==owner||owner.disposed||owner.state!=='ready')throw abort();
  applyMaterialEffects(viewer,viewer.view);
  return {complete:true,reflection:'studio',bump:options.bump,environmentMode:options.environmentMode,refractionRatio:1/options.refractiveIndex};
}
