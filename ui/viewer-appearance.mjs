// SPDX-License-Identifier: GPL-3.0-only
import * as THREE from 'three';
import {appearanceOptions,appearanceBackground} from './appearance-config.mjs';
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
  if(lights){
    lights.hemisphere.intensity=options.hemisphere;lights.ambient.intensity=options.ambient;
    lights.key.intensity=options.keyIntensity;lights.fill.intensity=options.fillIntensity;
    lights.key.position.fromArray(options.keyDirection);lights.fill.position.fromArray(options.fillDirection);
  }
  // Tour actors deliberately use transparent clear alpha. Preserve that alpha
  // while changing RGB; their compositor paints saved backgrounds separately.
  viewer.renderer?.setClearColor(options.background,viewer.renderer.getClearAlpha?.()??1);
  for(const mesh of [viewer.surface,viewer.edgeCylinders,viewer.vertexSpheres]){
    const material=mesh?.material;if(!material?.isMeshPhongMaterial)continue;
    material.specular.set(options.specular);material.shininess=view?.appearance===undefined&&mesh!==viewer.surface?24:options.shininess;
  }
  // Phong diffuse color multiplies existing pervertex RGB. Never replace its
  // attribute, alpha, opacity/depth policy, flatShading or computed smooth normals.
  viewer.surface?.material.color.set(options.tint);
  if(view?.appearance!==undefined){viewer.lines?.material.color.set(options.edgeColor);viewer.edgeCylinders?.material.color.set(options.edgeColor);}
  viewer.points?.material.color.set(options.vertexColor);viewer.vertexSpheres?.material.color.set(options.vertexColor);
  return options;
}
export function compositeAppearanceBackground(context,width,height,layers){
  context.globalAlpha=1;context.fillStyle='#15191f';context.fillRect(0,0,width,height);
  for(const item of layers){
    context.globalAlpha=item.layer.transitionPose.opacity;
    context.fillStyle=appearanceBackground(item.actor.state.view);context.fillRect(0,0,width,height);
  }
  context.globalAlpha=1;
}
