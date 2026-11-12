// SPDX-License-Identifier: GPL-3.0-only
import * as THREE from 'three';
export function bumpAsset(value) {
  if (value === null) return null;
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.getOwnPropertySymbols(value).length
  )
    throw Error('Bump requires an embedded PNG record.');
  const d = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(d).length !== 4 || !['mime', 'width', 'height', 'base64'].every((k) => d[k] && 'value' in d[k]))
    throw Error('Unsupported bump asset fields.');
  const { mime, width, height, base64 } = value;
  if (
    mime !== 'image/png' ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 2 ||
    width > 512 ||
    height < 2 ||
    height > 512 ||
    typeof base64 !== 'string' ||
    base64.length < 16 ||
    base64.length > 4 * Math.ceil((4 * 1024 * 1024) / 3) ||
    !base64.startsWith('iVBORw0KGgo')
  )
    throw Error('Bump PNG must be grayscale, 2 to 512 pixels per side and at most 4 MiB.');
  return value;
}
export const imageBumpSupported = (viewer) =>
  viewer.model?.dimension === 3 && viewer.model?.embeddingDimension === 3 && !viewer.net && !viewer.cellNet;
export function loadImageBump(asset, onLoad, onError) {
  bumpAsset(asset);
  return new THREE.TextureLoader().load('data:image/png;base64,' + asset.base64, onLoad, undefined, onError);
}
export const imageBumpDeclaration = `
uniform sampler2D effectsBumpImage;
uniform vec2 effectsBumpTexel;
vec3 effectsImageGradient(vec3 p) {
  vec2 uv=p.xy*effectsBumpFrequency;
  vec2 dx=vec2(effectsBumpTexel.x,0.0),dy=vec2(0.0,effectsBumpTexel.y);
  float x=(texture2D(effectsBumpImage,uv+dx).r-texture2D(effectsBumpImage,uv-dx).r)/(2.0*effectsBumpTexel.x);
  float y=(texture2D(effectsBumpImage,uv+dy).r-texture2D(effectsBumpImage,uv-dy).r)/(2.0*effectsBumpTexel.y);
  return effectsBumpFrequency*vec3(x,y,0.0);
}
`;
