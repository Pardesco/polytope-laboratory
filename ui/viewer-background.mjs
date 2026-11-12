// SPDX-License-Identifier: GPL-3.0-only
import * as THREE from 'three';
import { radialBackground } from './prism-background.mjs';
export function applyBackground(viewer, options) {
  const renderer = viewer.renderer;
  if (!renderer) return;
  const previous = viewer.appearanceBackgroundMode;
  let alpha = renderer.getClearAlpha?.() ?? 1;
  if (previous === 'transparent') alpha = viewer.appearanceBackgroundAlpha ?? 1;
  if (options.backgroundMode === 'transparent') {
    viewer.appearanceBackgroundAlpha = alpha;
    alpha = 0;
  }
  if (viewer.appearanceOverlay) alpha = 0;
  renderer.setClearColor(options.background, alpha);
  viewer.appearanceBackgroundMode = options.backgroundMode;
  if (!viewer.scene) return;
  const key =
    ['gradient', 'radial'].includes(options.backgroundMode) && alpha !== 0
      ? options.backgroundMode + options.background + options.backgroundBottom
      : null;
  if (viewer.appearanceGradientKey !== key) {
    viewer.appearanceGradient?.dispose();
    viewer.appearanceGradient = null;
    viewer.appearanceGradientKey = key;
    if (key && options.backgroundMode === 'radial') viewer.appearanceGradient = radialBackground(options);
    else if (key) {
      const top = new THREE.Color(options.background),
        bottom = new THREE.Color(options.backgroundBottom),
        data = new Uint8Array(256 * 4);
      for (let y = 0; y < 256; y++)
        for (let c = 0; c < 3; c++)
          data[y * 4 + c] = Math.round(
            255 * (bottom[['r', 'g', 'b'][c]] * (1 - y / 255) + (top[['r', 'g', 'b'][c]] * y) / 255)
          );
      for (let y = 0; y < 256; y++) data[y * 4 + 3] = 255;
      const texture = new THREE.DataTexture(data, 1, 256);
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      viewer.appearanceGradient = texture;
    }
  }
  viewer.scene.background = viewer.appearanceGradient ?? null;
}
