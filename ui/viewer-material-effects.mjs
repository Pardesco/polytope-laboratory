// SPDX-License-Identifier: GPL-3.0-only
import * as THREE from 'three';
import { loadImageEnvironment, imageEnvironmentSupported } from './material-environment.mjs';
import { loadProceduralStudio } from './procedural-environment.mjs';
import { effectsOptions } from './effects-config.mjs';
import { configureProceduralBump } from './procedural-bump.mjs';
import { applyImageBump, prepareImageBump, disposeImageBump } from './viewer-material-bump.mjs';
const abort = () => Object.assign(Error('Material effect source or configuration changed.'), { name: 'AbortError' });
const encoder = new TextEncoder();
const signature = (view) => JSON.stringify(effectsOptions(view?.materialEffects));
const environmentSignature = (options) =>
  JSON.stringify([options.reflection, options.reflection === 'image' ? options.environmentAsset : null]);
function modelSignature(viewer) {
  const text = JSON.stringify(viewer.model);
  if (typeof text !== 'string' || text.length > 16 * 1024 * 1024 || encoder.encode(text).byteLength > 16 * 1024 * 1024)
    throw Error('Material environment source snapshot exceeds 16 MiB.');
  return text;
}
const defaultLoader = loadProceduralStudio;
export const REFLECTION_FACE_LIMIT = 12000;
export const reflectionLimited = (viewer) => (viewer.model?.faces?.length ?? 0) > REFLECTION_FACE_LIMIT;
function vertexEnvironment(viewer, texture) {
  const material = viewer.vertexSpheres?.material;
  if (!material) return;
  const map = viewer.view?.appearance?.vertexMetal ? texture : null;
  if (material.envMap !== map) {
    material.envMap = map;
    material.combine = THREE.MixOperation;
    material.needsUpdate = true;
  }
  material.reflectivity = 0.85;
}

export function createMaterialEffectOwner(viewer, { loadCube = defaultLoader, loadImage = loadImageEnvironment } = {}) {
  const options = effectsOptions(viewer.view?.materialEffects),
    image = options.reflection === 'image';
  const owner = {
    model: viewer.model,
    sourceSignature: modelSignature(viewer),
    configSignature: signature(viewer.view),
    environmentSignature: environmentSignature(options),
    texture: null,
    state: 'pending',
    disposed: false,
    textureDisposed: false,
    error: null,
  };
  let resolve, reject;
  owner.ready = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  owner.ready.catch(() => {});
  const disposeTexture = () => {
    if (owner.texture && !owner.textureDisposed) {
      owner.texture.dispose();
      owner.textureDisposed = true;
    }
  };
  const fail = (error) => {
    if (owner.state !== 'pending') return;
    clearTimeout(owner.timer);
    owner.state = 'failed';
    owner.error = error;
    disposeTexture();
    reject(error);
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
  owner.timer = setTimeout(() => fail(Error('Material environment decoding timed out after 10 seconds.')), 10000);
  try {
    const loaded = (texture) => {
      if (owner.disposed || owner.state !== 'pending') {
        disposeTexture();
        return;
      }
      try {
        if (
          viewer.materialEffectsOwner !== owner ||
          viewer.model !== owner.model ||
          modelSignature(viewer) !== owner.sourceSignature ||
          signature(viewer.view) !== owner.configSignature
        )
          throw abort();
        if (texture !== owner.texture) throw Error('Environment texture ownership changed.');
        if (image) {
          if (
            (texture.image?.naturalWidth ?? texture.image?.width) !== options.environmentAsset.width ||
            (texture.image?.naturalHeight ?? texture.image?.height) !== options.environmentAsset.height
          )
            throw Error('Environment PNG decoded dimensions do not match its saved asset.');
        } else if (
          texture.images?.length !== 6 ||
          texture.images.some(
            (image) => (image.naturalWidth ?? image.width) !== 32 || (image.naturalHeight ?? image.height) !== 32
          )
        )
          throw Error('Built-in studio cube must decode six 32 by 32 images.');
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.mapping = image ? THREE.EquirectangularReflectionMapping : THREE.CubeReflectionMapping;
        clearTimeout(owner.timer);
        owner.state = 'ready';
        resolve(texture);
        applyMaterialEffects(viewer, viewer.view);
        viewer.draw?.();
        viewer.onDisplay?.(viewer.lastDisplayStatus ?? {});
      } catch (error) {
        fail(error);
        viewer.appearanceEffectsDiagnostic = error.message;
        viewer.onDisplay?.(viewer.lastDisplayStatus ?? {});
      }
    };
    const failed = () => fail(Error('Material environment could not be decoded.'));
    owner.texture = image ? loadImage(options.environmentAsset, loaded, failed) : loadCube([], loaded, failed);
  } catch (error) {
    fail(error);
  }
  return owner;
}

export function disposeMaterialEffects(viewer) {
  disposeImageBump(viewer);
  vertexEnvironment(viewer, null);
  const owner = viewer.materialEffectsOwner,
    material = viewer.surface?.material;
  if (owner) {
    if (material?.envMap === owner.texture) {
      material.envMap = null;
      material.combine = THREE.MultiplyOperation;
      material.needsUpdate = true;
    }
    owner.dispose();
    viewer.materialEffectsOwner = null;
  }
  if (material) configureProceduralBump(material, { bump: 'none', bumpStrength: 0 });
  viewer.appearanceEffectsDiagnostic = null;
}

export function applyMaterialEffects(
  viewer,
  view,
  { loadCube = defaultLoader, loadImage = loadImageEnvironment, loadBump } = {}
) {
  const options = effectsOptions(view?.materialEffects),
    material = viewer.surface?.material;
  if (!material?.isMeshPhongMaterial || !viewer.model) return options;
  const bumpTexture = applyImageBump(viewer, options, {
    loadBump,
    refresh: () => applyMaterialEffects(viewer, viewer.view),
  });
  configureProceduralBump(material, { ...options, bumpTexture });
  let owner = viewer.materialEffectsOwner;
  const unsupportedImage = options.reflection === 'image' && !imageEnvironmentSupported(viewer);
  if (options.reflection === 'none' || reflectionLimited(viewer) || unsupportedImage) {
    vertexEnvironment(viewer, null);
    if (owner) {
      if (material.envMap === owner.texture) {
        material.envMap = null;
        material.combine = THREE.MultiplyOperation;
        material.needsUpdate = true;
      }
      owner.dispose();
      viewer.materialEffectsOwner = null;
    }
    viewer.appearanceEffectsDiagnostic = unsupportedImage
      ? 'Imported environment sampling is available only on 3D source surfaces; retained asset is inactive in this view.'
      : options.reflection !== 'none'
        ? 'Reflections disabled above 12,000 source faces for interactive rendering.'
        : null;
    return options;
  }
  if (
    owner &&
    (owner.model !== viewer.model ||
      owner.disposed ||
      owner.environmentSignature !== environmentSignature(options) ||
      (owner.state === 'pending' && owner.configSignature !== signature(view)))
  ) {
    if (material.envMap === owner.texture) {
      material.envMap = null;
      material.needsUpdate = true;
    }
    owner.dispose();
    viewer.materialEffectsOwner = null;
    owner = null;
  }
  if (!owner) {
    // Viewer sets its saved view before this call; explicit tests may pass an
    // equivalent retained view. No caller can select arbitrary texture URLs.
    if (signature(viewer.view) !== signature(view)) throw abort();
    viewer.materialEffectsOwner = owner = createMaterialEffectOwner(viewer, { loadCube, loadImage });
  }
  if (owner.state === 'ready') {
    vertexEnvironment(viewer, owner.texture);
    const mapping =
      options.reflection === 'image'
        ? options.environmentMode === 'refraction'
          ? THREE.EquirectangularRefractionMapping
          : THREE.EquirectangularReflectionMapping
        : options.environmentMode === 'refraction'
          ? THREE.CubeRefractionMapping
          : THREE.CubeReflectionMapping;
    if (
      material.envMap !== owner.texture ||
      material.combine !== THREE.MixOperation ||
      owner.texture.mapping !== mapping
    ) {
      owner.texture.mapping = mapping;
      material.envMap = owner.texture;
      material.combine = THREE.MixOperation;
      material.needsUpdate = true;
    }
    material.refractionRatio = 1 / options.refractiveIndex;
    material.reflectivity = options.reflectivity;
    viewer.appearanceEffectsDiagnostic = null;
  } else viewer.appearanceEffectsDiagnostic = owner.error?.message ?? 'Loading material environment…';
  return options;
}

function waitFor(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abort());
  return new Promise((resolve, reject) => {
    const stopped = () => {
        cleanup();
        reject(abort());
      },
      cleanup = () => signal.removeEventListener('abort', stopped);
    signal.addEventListener('abort', stopped, { once: true });
    promise.then(
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
}

export async function prepareMaterialEffects(viewer, { signal, isCurrent = () => true } = {}) {
  if (signal?.aborted || !isCurrent()) throw abort();
  const view = viewer.view,
    model = viewer.model,
    settings = signature(view);
  const options = applyMaterialEffects(viewer, view);
  const bump = await prepareImageBump(viewer, { signal, isCurrent });
  if (signal?.aborted || !isCurrent() || viewer.model !== model || signature(viewer.view) !== settings) throw abort();
  if (options.reflection === 'none')
    return {
      complete: true,
      reflection: 'none',
      ...bump,
      environmentMode: options.environmentMode,
      refractionRatio: 1 / options.refractiveIndex,
    };
  if (reflectionLimited(viewer) || (options.reflection === 'image' && !imageEnvironmentSupported(viewer)))
    return {
      complete: true,
      reflection: 'none',
      requestedReflection: options.reflection,
      diagnostic: viewer.appearanceEffectsDiagnostic,
      ...bump,
    };
  const owner = viewer.materialEffectsOwner,
    before = modelSignature(viewer);
  if (!owner) throw Error('Requested material environment has no owned surface.');
  await waitFor(owner.ready, signal);
  if (
    signal?.aborted ||
    !isCurrent() ||
    viewer.model !== model ||
    modelSignature(viewer) !== before ||
    signature(viewer.view) !== settings ||
    viewer.materialEffectsOwner !== owner ||
    owner.disposed ||
    owner.state !== 'ready'
  )
    throw abort();
  applyMaterialEffects(viewer, viewer.view);
  return {
    complete: true,
    reflection: options.reflection,
    ...bump,
    environmentMode: options.environmentMode,
    refractionRatio: 1 / options.refractiveIndex,
  };
}
