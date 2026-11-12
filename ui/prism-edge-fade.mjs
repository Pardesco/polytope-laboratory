// SPDX-License-Identifier: GPL-3.0-only
import { Sphere } from 'three';
export function edgeDepthFade(object, strength = 1) {
  const material = object.material;
  let uniforms = material.userData.prismDepthFade;
  if (!uniforms) {
    uniforms = { prismDepthNear: { value: 0 }, prismDepthFar: { value: 1 }, prismDepthStrength: { value: strength } };
    material.userData.prismDepthFade = uniforms;
    const original = material.onBeforeCompile;
    material.onBeforeCompile = function (shader, renderer) {
      original.call(this, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader =
        'varying float vPrismDepth;\n' +
        shader.vertexShader.replace(
          '#include <logdepthbuf_vertex>',
          'vPrismDepth = -mvPosition.z;\n#include <logdepthbuf_vertex>'
        );
      shader.fragmentShader =
        'varying float vPrismDepth;\nuniform float prismDepthNear;\nuniform float prismDepthFar;\nuniform float prismDepthStrength;\n' +
        shader.fragmentShader.replace(
          '#include <premultiplied_alpha_fragment>',
          'gl_FragColor.a *= mix(1.0, mix(1.0, 0.12, smoothstep(prismDepthNear, prismDepthFar, vPrismDepth)), prismDepthStrength);\n#include <premultiplied_alpha_fragment>'
        );
    };
    material.customProgramCacheKey = () => 'prism-edge-depth-v1';
    material.needsUpdate = true;
  }
  uniforms.prismDepthStrength.value = strength;
  if (!object.userData.prismDepthRender) {
    const original = object.onBeforeRender,
      sphere = new Sphere();
    object.userData.prismDepthRender = true;
    object.onBeforeRender = function (renderer, scene, camera, ...args) {
      original.call(this, renderer, scene, camera, ...args);
      const bounds = this.geometry.boundingSphere;
      if (!bounds) return;
      sphere.copy(bounds).applyMatrix4(this.matrixWorld);
      sphere.center.applyMatrix4(camera.matrixWorldInverse);
      const uniforms = this.material.userData.prismDepthFade,
        radius = Math.max(sphere.radius, 0.001),
        depth = -sphere.center.z;
      uniforms.prismDepthNear.value = depth - radius;
      uniforms.prismDepthFar.value = depth + radius;
    };
  }
  return uniforms;
}
