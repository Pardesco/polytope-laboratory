// SPDX-License-Identifier: GPL-3.0-only
import * as THREE from 'three';
import { effectsOptions } from './effects-config.mjs';
import { loadImageBump, imageBumpSupported } from './material-bump.mjs';
const abort = () => Object.assign(Error('Bump source or configuration changed.'), { name: 'AbortError' });
const signature = (options) =>
  JSON.stringify([options.bump, options.bumpStrength, options.bumpFrequency, options.bumpAsset]);
function source(viewer) {
  const text = JSON.stringify(viewer.model);
  if (
    typeof text !== 'string' ||
    text.length > 16 * 1024 * 1024 ||
    new TextEncoder().encode(text).length > 16 * 1024 * 1024
  )
    throw Error('Bump source snapshot exceeds 16 MiB.');
  return text;
}
export function disposeImageBump(viewer) {
  viewer.materialBumpOwner?.dispose();
  viewer.materialBumpOwner = null;
  viewer.appearanceBumpDiagnostic = null;
}
export function applyImageBump(viewer, options, { loadBump = loadImageBump, refresh = () => {} } = {}) {
  const active = options.bump === 'image' && imageBumpSupported(viewer);
  let owner = viewer.materialBumpOwner;
  if (owner && (!active || owner.model !== viewer.model || owner.signature !== signature(options) || owner.disposed)) {
    disposeImageBump(viewer);
    owner = null;
  }
  if (!active) {
    viewer.appearanceBumpDiagnostic =
      options.bump === 'image'
        ? 'Imported bump sampling is available only on 3D source surfaces; retained asset is inactive in this view.'
        : null;
    return null;
  }
  if (!owner) {
    let resolve, reject;
    owner = {
      model: viewer.model,
      source: source(viewer),
      signature: signature(options),
      state: 'pending',
      texture: null,
      disposed: false,
      textureDisposed: false,
    };
    owner.ready = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    owner.ready.catch(() => {});
    const disposeTexture = () => {
      if (owner.texture && !owner.textureDisposed) {
        owner.textureDisposed = true;
        owner.texture.dispose();
      }
    };
    const fail = (error) => {
      if (owner.state !== 'pending') return;
      clearTimeout(owner.timer);
      owner.state = 'failed';
      owner.error = error;
      disposeTexture();
      reject(error);
      viewer.appearanceBumpDiagnostic = error.message;
      viewer.onDisplay?.(viewer.lastDisplayStatus ?? {});
    };
    owner.dispose = () => {
      if (owner.disposed) return;
      owner.disposed = true;
      clearTimeout(owner.timer);
      if (owner.state === 'pending') {
        owner.state = 'disposed';
        reject(abort());
      }
      disposeTexture();
    };
    viewer.materialBumpOwner = owner;
    owner.timer = setTimeout(() => fail(Error('Bump PNG decoding timed out after 10 seconds.')), 10000);
    try {
      owner.texture = loadBump(
        options.bumpAsset,
        (texture) =>
          queueMicrotask(() => {
            if (owner.disposed || owner.state !== 'pending') return;
            try {
              if (
                viewer.materialBumpOwner !== owner ||
                viewer.model !== owner.model ||
                source(viewer) !== owner.source ||
                signature(effectsOptions(viewer.view?.materialEffects)) !== owner.signature
              )
                throw abort();
              if (texture !== owner.texture) throw Error('Bump texture ownership changed.');
              if (
                (texture.image?.naturalWidth ?? texture.image?.width) !== options.bumpAsset.width ||
                (texture.image?.naturalHeight ?? texture.image?.height) !== options.bumpAsset.height
              )
                throw Error('Bump PNG decoded dimensions do not match its saved asset.');
              texture.colorSpace = THREE.NoColorSpace;
              texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
              texture.magFilter = texture.minFilter = THREE.NearestFilter;
              texture.generateMipmaps = false;
              texture.flipY = true;
              texture.needsUpdate = true;
              clearTimeout(owner.timer);
              owner.state = 'ready';
              resolve(texture);
              refresh();
              viewer.draw?.();
              viewer.onDisplay?.(viewer.lastDisplayStatus ?? {});
            } catch (error) {
              fail(error);
            }
          }),
        () => queueMicrotask(() => fail(Error('Bump PNG could not be decoded.')))
      );
    } catch (error) {
      fail(error);
    }
  }
  viewer.appearanceBumpDiagnostic = owner.state === 'ready' ? null : (owner.error?.message ?? 'Loading bump PNG…');
  return owner.state === 'ready' ? owner.texture : null;
}
export async function prepareImageBump(viewer, { signal, isCurrent = () => true } = {}) {
  const options = effectsOptions(viewer.view?.materialEffects);
  if (options.bump !== 'image') return { bump: options.bump };
  if (!imageBumpSupported(viewer))
    return { bump: 'none', requestedBump: 'image', bumpDiagnostic: viewer.appearanceBumpDiagnostic };
  const owner = viewer.materialBumpOwner;
  if (!owner) throw Error('Requested bump PNG has no owned surface.');
  const before = source(viewer);
  if (owner.source !== before) throw abort();
  await new Promise((resolve, reject) => {
    const stop = () => {
        cleanup();
        reject(abort());
      },
      cleanup = () => signal?.removeEventListener('abort', stop);
    if (signal?.aborted) return stop();
    signal?.addEventListener('abort', stop, { once: true });
    owner.ready.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
  if (
    signal?.aborted ||
    !isCurrent() ||
    viewer.materialBumpOwner !== owner ||
    viewer.model !== owner.model ||
    source(viewer) !== before ||
    signature(effectsOptions(viewer.view?.materialEffects)) !== owner.signature ||
    owner.disposed ||
    owner.state !== 'ready'
  )
    throw abort();
  return {
    bump: 'image',
    bumpMapping: 'display-object-xy',
    bumpSamples: 'linear-red-8bit',
    bumpDimensions: [options.bumpAsset.width, options.bumpAsset.height],
  };
}
