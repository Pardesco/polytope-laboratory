// SPDX-License-Identifier: GPL-3.0-only
import {applyBackground} from './viewer-background.mjs';
import * as THREE from 'three';
import {appearanceOptions} from './appearance-config.mjs';
import {radialPaint} from './prism-background.mjs';
import {isPrism} from './prism-look.mjs';
const backgroundPaints=new WeakMap();
function backgroundPaint(context,width,height,options){
  if(!['gradient','radial'].includes(options.backgroundMode))return options.background;
  let cache=backgroundPaints.get(context);if(!cache){cache=new Map();backgroundPaints.set(context,cache);}
  const key=width+':'+height+':'+options.backgroundMode+options.background+options.backgroundBottom;
  if(!cache.has(key)){
    if(cache.size>=16)cache.clear();
    const gradient=options.backgroundMode==='radial'?radialPaint(context,width,height,options):context.createLinearGradient(0,0,0,height);
    if(options.backgroundMode!=='radial'){gradient.addColorStop(0,options.background);gradient.addColorStop(1,options.backgroundBottom);}cache.set(key,gradient);
  }
  return cache.get(key);
}
export function createAppearanceLights(scene){
  const lights={hemisphere:new THREE.HemisphereLight(0xe9eff8,0x454b55,.85),
    key:new THREE.DirectionalLight(0xffffff,1.5),fill:new THREE.DirectionalLight(0xb9c8db,.48),
    ambient:new THREE.AmbientLight(0xffffff,.08)};
  lights.key.position.set(4,7,6);lights.fill.position.set(-5,1,-3);
  for(const light of Object.values(lights))scene.add(light);
  return lights;
}
export function applyViewerAppearance(viewer,view){
  const options=appearanceOptions(view?.appearance),lights=viewer.appearanceLights;
  if(viewer.renderer){viewer.renderer.toneMapping=isPrism(view)?THREE.ACESFilmicToneMapping:THREE.NoToneMapping;viewer.renderer.toneMappingExposure=1;}
  if(lights){
    lights.hemisphere.intensity=options.hemisphere;lights.ambient.intensity=options.ambient;
    lights.key.intensity=options.keyIntensity;lights.fill.intensity=options.fillIntensity;
    lights.key.position.fromArray(options.keyDirection);lights.fill.position.fromArray(options.fillDirection);
  }
  // Tour actors deliberately use transparent clear alpha. Preserve that alpha
  // while changing RGB; their compositor paints saved backgrounds separately.
  applyBackground(viewer,options);
  for(const mesh of [viewer.surface,viewer.edgeCylinders,viewer.vertexSpheres]){
    const material=mesh?.material;if(!material?.isMeshPhongMaterial)continue;
    material.specular.set(options.specular);material.shininess=view?.appearance===undefined&&mesh!==viewer.surface?24:options.shininess;
  }
  // Phong diffuse color multiplies existing pervertex RGB. Never replace its
  // attribute, alpha, opacity/depth policy, flatShading or computed smooth normals.
  viewer.surface?.material.color.set(options.tint);
  if(view?.appearance!==undefined){viewer.lines?.material.color.set(options.edgeColor);viewer.edgeCylinders?.material.color.set(options.edgeColor);}
  viewer.points?.material.color.set(options.vertexColor);viewer.vertexSpheres?.material.color.set(options.vertexColor);
  if(viewer.edgeCylinders?.material.emissive){viewer.edgeCylinders.material.emissive.set(options.edgeColor);viewer.edgeCylinders.material.emissiveIntensity=options.edgeGlow;}
  if(viewer.vertexSpheres?.material.specular&&options.vertexMetal){viewer.vertexSpheres.material.specular.set('#ffffff');viewer.vertexSpheres.material.shininess=180;}
  if(viewer.vertexSpheres?.material){
    const material=viewer.vertexSpheres.material,transparent=!options.vertexMetal;
    if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}
    material.opacity=options.vertexMetal?1:.85;material.depthWrite=options.vertexMetal;
  }
  return options;
}
export function compositeAppearanceBackground(context,width,height,layers){
  context.globalAlpha=1;context.fillStyle='#15191f';context.fillRect(0,0,width,height);
  for(const item of layers){
    context.globalAlpha=item.layer.transitionPose.opacity;
    const options=appearanceOptions(item.actor.state.view?.appearance);
    if(options.backgroundMode==='transparent')continue;
    context.fillStyle=backgroundPaint(context,width,height,options);context.fillRect(0,0,width,height);
  }
  context.globalAlpha=1;
}
