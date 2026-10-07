// SPDX-License-Identifier: GPL-3.0-only
// Surface-gradient formulation: Mikkelsen JCGT 9(3), 2020, equations (5)-(6).
// Height is defined on the current normalized display-object coordinates, not
// triangle-local UVs. Geometry/source normals and colors are never replaced.
const states=new WeakMap();
const declaration=`
varying vec3 vEffectsObjectPosition;
uniform mat3 normalMatrix;
uniform mat4 modelViewMatrix;
uniform float effectsBumpKind;
uniform float effectsBumpFrequency;
uniform float effectsBumpStrength;
vec3 effectsHeightGradient(vec3 p) {
  float k=6.283185307179586*effectsBumpFrequency;
  vec3 s=sin(k*p),c=cos(k*p);
  if(effectsBumpKind<1.5)return k*vec3(c.x*s.y*s.z,s.x*c.y*s.z,s.x*s.y*c.z);
  return -k*s/3.0;
}
`;
const perturb=`
if(effectsBumpKind>0.5&&effectsBumpStrength>0.0) {
  // Recover the object-space normal with transpose(modelViewMatrix), then
  // transform its perturbed normal back. This keeps bump strength in object
  // units under tour shrink/rotation, including nonuniform object transforms.
  vec3 effectsObjectNormal=normalize(vec3(dot(modelViewMatrix[0].xyz,normal),
    dot(modelViewMatrix[1].xyz,normal),dot(modelViewMatrix[2].xyz,normal)));
  vec3 effectsGradient=effectsHeightGradient(vEffectsObjectPosition);
  vec3 effectsSurfaceGradient=effectsGradient-effectsObjectNormal*dot(effectsObjectNormal,effectsGradient);
  float effectsSide=1.0;
  #ifdef DOUBLE_SIDED
    effectsSide=faceDirection;
  #endif
  normal=normalize(normalMatrix*normalize(effectsObjectNormal-effectsSide*effectsBumpStrength*effectsSurfaceGradient));
}
`;
function replaceOne(text,before,after){
  if(text.split(before).length!==2)throw Error('Phong shader does not expose the required procedural bump anchor.');
  return text.replace(before,after);
}
export function configureProceduralBump(material,options){
  if(!material?.isMeshPhongMaterial)return;
  let state=states.get(material);
  const enabled=options.bump!=='none'&&options.bumpStrength>0;
  if(!enabled){
    if(state){material.onBeforeCompile=state.previous;material.customProgramCacheKey=state.previousKey;material.needsUpdate=true;states.delete(material);}
    return;
  }
  if(material.bumpMap||material.normalMap)throw Error('Procedural bump cannot replace an existing normal or bump map.');
  if(!state){
    state={previous:material.onBeforeCompile,previousKey:material.customProgramCacheKey,
      uniforms:{effectsBumpKind:{value:0},effectsBumpFrequency:{value:12},effectsBumpStrength:{value:0}}};
    material.onBeforeCompile=(shader,renderer)=>{
      state.previous.call(material,shader,renderer);
      shader.vertexShader=replaceOne(shader.vertexShader,'#include <common>', '#include <common>\nvarying vec3 vEffectsObjectPosition;');
      shader.vertexShader=replaceOne(shader.vertexShader,'#include <displacementmap_vertex>', '#include <displacementmap_vertex>\nvEffectsObjectPosition=transformed;');
      shader.fragmentShader=replaceOne(shader.fragmentShader,'#include <common>', '#include <common>\n'+declaration);
      shader.fragmentShader=replaceOne(shader.fragmentShader,'#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n'+perturb);
      Object.assign(shader.uniforms,state.uniforms);
    };
    material.customProgramCacheKey=()=>`display-object-gradient-v1:${state.previousKey.call(material)}`;
    material.needsUpdate=true;states.set(material,state);
  }
  state.uniforms.effectsBumpKind.value=options.bump==='waves'?1:2;
  state.uniforms.effectsBumpFrequency.value=options.bumpFrequency;
  state.uniforms.effectsBumpStrength.value=options.bumpStrength;
}
