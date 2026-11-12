// SPDX-License-Identifier: GPL-3.0-only
import * as THREE from 'three';
export function studioFace(face, size = 32) {
  if (!Number.isInteger(face) || face < 0 || face > 5 || !Number.isInteger(size) || size < 4 || size > 128)
    throw Error('Studio faces require a cube side 0..5 and size 4..128.');
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size,
        v = (y + 0.5) / size;
      const softbox = Math.exp(-((u - 0.32) ** 2 / 0.018 + (v - 0.28) ** 2 / 0.12));
      const strip = Math.exp(-((u - 0.82) ** 2 / 0.004 + (v - 0.45) ** 2 / 0.3));
      const sky = face === 2 ? 0.7 : face === 3 ? 0.05 : 0.15 + 0.16 * (1 - v);
      const light = Math.min(1, sky + 0.7 * softbox + 0.45 * strip),
        i = (y * size + x) * 4;
      data[i] = Math.round(255 * light);
      data[i + 1] = Math.round(255 * Math.min(1, light * 1.03));
      data[i + 2] = Math.round(255 * Math.min(1, light * 1.1));
      data[i + 3] = 255;
    }
  return data;
}
export function loadProceduralStudio(_urls, onLoad) {
  const images = Array.from({ length: 6 }, (_, face) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d'),
      pixels = context.createImageData(32, 32);
    pixels.data.set(studioFace(face));
    context.putImageData(pixels, 0, 0);
    return canvas;
  });
  const texture = new THREE.CubeTexture(images);
  texture.needsUpdate = true;
  queueMicrotask(() => onLoad(texture));
  return texture;
}
