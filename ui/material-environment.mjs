// SPDX-License-Identifier: GPL-3.0-only
import * as THREE from 'three';
export function environmentAsset(value) {
  if (value === null) return null;
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.getOwnPropertySymbols(value).length
  )
    throw Error('Environment requires an embedded PNG record.');
  const d = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(d).length !== 4 || !['mime', 'width', 'height', 'base64'].every((k) => d[k] && 'value' in d[k]))
    throw Error('Unsupported environment asset fields.');
  const { mime, width, height, base64 } = value;
  if (
    mime !== 'image/png' ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    height < 2 ||
    height > 512 ||
    width !== height * 2 ||
    typeof base64 !== 'string' ||
    base64.length < 16 ||
    base64.length > 4 * Math.ceil((4 * 1024 * 1024) / 3) ||
    !base64.startsWith('iVBORw0KGgo')
  )
    throw Error('Environment PNG must be 2:1 equirectangular, at most 1024 by 512 and 4 MiB.');
  return value;
}
export function loadImageEnvironment(asset, onLoad, onError) {
  environmentAsset(asset);
  return new THREE.TextureLoader().load('data:image/png;base64,' + asset.base64, onLoad, undefined, onError);
}
export const imageEnvironmentSupported = (viewer) =>
  viewer.model?.dimension === 3 && viewer.model?.embeddingDimension === 3 && !viewer.net && !viewer.cellNet;
