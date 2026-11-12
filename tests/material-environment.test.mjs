import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { effectsOptions } from '../ui/effects-config.mjs';
import {
  applyMaterialEffects,
  prepareMaterialEffects,
  disposeMaterialEffects,
} from '../ui/viewer-material-effects.mjs';
import { MaterialEffectsControls } from '../ui/material-effects-controls.mjs';
import { MaterialEnvironmentControls } from '../ui/material-environment-controls.mjs';
import { numericControlFixture, deferred, flush } from './numeric-control-fixture.mjs';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/material-environment.json', import.meta.url)));
const asset = () => ({ mime: 'image/png', width: 32, height: 16, base64: fixture.pngBase64 });
const settings = () => effectsOptions({ reflection: 'image', environmentAsset: asset() });
function viewer() {
  return {
    model: { dimension: 3, embeddingDimension: 3, faces: [] },
    view: { materialEffects: settings() },
    surface: { material: new THREE.MeshPhongMaterial() },
  };
}
function load(view) {
  const texture = new THREE.Texture({ width: 32, height: 16 });
  let done,
    failed,
    disposed = 0;
  texture.addEventListener('dispose', () => disposed++);
  applyMaterialEffects(view, view.view, {
    loadImage: (value, yes, no) => {
      assert.deepEqual(value, asset());
      done = yes;
      failed = no;
      return texture;
    },
  });
  return {
    texture,
    done: () => done(texture),
    fail: () => failed(),
    get disposed() {
      return disposed;
    },
  };
}
test('portable effects validate embedded records and refuse absent/non-panorama assets', () => {
  assert.deepEqual(effectsOptions(settings()), settings());
  for (const a of [
    null,
    { ...asset(), width: 31 },
    { ...asset(), height: 513, width: 1026 },
    { ...asset(), url: 'http://example.com' },
    { ...asset(), base64: 'garbage' },
  ])
    assert.throws(() => effectsOptions({ reflection: 'image', environmentAsset: a }));
});
test('capture waits for image decode and selects reflection/refraction mappings on the owned texture', async () => {
  const view = viewer(),
    loaded = load(view);
  let ready = false;
  const pending = prepareMaterialEffects(view).then((result) => {
    ready = true;
    return result;
  });
  await flush();
  assert.equal(ready, false);
  loaded.done();
  assert.equal((await pending).reflection, 'image');
  assert.equal(view.surface.material.envMap, loaded.texture);
  assert.equal(loaded.texture.colorSpace, THREE.SRGBColorSpace);
  assert.equal(loaded.texture.mapping, THREE.EquirectangularReflectionMapping);
  view.view.materialEffects.environmentMode = 'refraction';
  view.view.materialEffects.refractiveIndex = 2;
  const result = await prepareMaterialEffects(view);
  assert.equal(result.refractionRatio, 0.5);
  assert.equal(loaded.texture.mapping, THREE.EquirectangularRefractionMapping);
  disposeMaterialEffects(view);
  assert.equal(loaded.disposed, 1);
  assert.equal(view.surface.material.envMap, null);
});
test('failed/mismatched decoding refuses capture and frees its texture', async () => {
  for (const badSize of [false, true]) {
    const view = viewer(),
      loaded = load(view);
    if (badSize) {
      loaded.texture.image.width = 20;
      loaded.done();
    } else loaded.fail();
    await assert.rejects(prepareMaterialEffects(view), badSize ? /dimensions/ : /decoded/);
    assert.equal(loaded.disposed, 1);
    disposeMaterialEffects(view);
    assert.equal(loaded.disposed, 1);
  }
});
test('cancel and late decode cannot publish old environments', async () => {
  const view = viewer(),
    loaded = load(view),
    controller = new AbortController();
  const pending = prepareMaterialEffects(view, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  disposeMaterialEffects(view);
  loaded.done();
  assert.equal(loaded.disposed, 1);
  assert.equal(view.surface.material.envMap, null);
});
test('replacement asset invalidates a ready texture and source changes invalidate pending capture', async () => {
  const view = viewer(),
    loaded = load(view);
  loaded.done();
  await prepareMaterialEffects(view);
  view.view.materialEffects.environmentAsset = { ...asset(), base64: asset().base64 + 'AAAA' };
  let replacement;
  const texture = new THREE.Texture({ width: 32, height: 16 });
  applyMaterialEffects(view, view.view, {
    loadImage: (_a, yes) => {
      replacement = yes;
      return texture;
    },
  });
  assert.equal(loaded.disposed, 1);
  const capture = prepareMaterialEffects(view);
  view.model = { ...view.model };
  replacement(texture);
  await assert.rejects(capture, { name: 'AbortError' });
  disposeMaterialEffects(view);
});
test('4D and net views retain portable settings while reporting their inactive sampling', async () => {
  for (const patch of [{ model: { dimension: 4, embeddingDimension: 4, faces: [] } }, { net: {} }, { cellNet: {} }]) {
    const view = Object.assign(viewer(), patch),
      before = structuredClone(view.view);
    const receipt = await prepareMaterialEffects(view);
    assert.equal(receipt.reflection, 'none');
    assert.equal(receipt.requestedReflection, 'image');
    assert.match(receipt.diagnostic, /only on 3D/);
    assert.deepEqual(view.view, before);
    assert.equal(view.surface.material.envMap, null);
  }
});
test('numeric edits keep a large embedded asset outside NumericEntry target bounds', async () => {
  const values = Object.fromEntries(
    [
      'bump',
      'reflection',
      'bumpStrength',
      'bumpFrequency',
      'reflectivity',
      'environmentMode',
      'refractiveIndex',
      'apply',
      'reset',
      'cancel',
      'status',
    ].map((k) => ['effects-' + k, String(settings()[k] ?? '')])
  );
  const f = numericControlFixture(MaterialEffectsControls.prototype, values);
  f.state.view.materialEffects = settings();
  f.state.view.materialEffects.environmentAsset.base64 += 'A'.repeat(80000);
  let dirty = 0;
  f.control.context = {
    ...f.context,
    display() {},
    markDirty() {
      dirty++;
    },
  };
  const previous = globalThis.document;
  globalThis.document = { activeElement: null };
  try {
    await f.control.apply();
    assert.equal(dirty, 1);
    assert.equal(f.state.view.materialEffects.environmentAsset.base64.length, asset().base64.length + 80000);
  } finally {
    globalThis.document = previous;
  }
});
test('native environment import cannot publish after cancellation or settings changes', async () => {
  for (const cancel of [false, true]) {
    const f = numericControlFixture(MaterialEnvironmentControls.prototype, {
        'effects-image-file': '',
        'effects-image-status': '',
      }),
      gate = deferred();
    f.nodes['effects-image-file'].files = [
      {
        size: Uint8Array.from(atob(fixture.pngBase64), (c) => c.charCodeAt(0)).length,
        arrayBuffer: async () => Uint8Array.from(atob(fixture.pngBase64), (c) => c.charCodeAt(0)).buffer,
      },
    ];
    f.control.context = {
      ...f.context,
      run: () => gate.promise,
      display() {
        throw Error('Must not publish');
      },
      markDirty() {
        throw Error('Must not dirty');
      },
    };
    f.control.parent = { requireEditable() {}, sync() {}, node: () => ({}) };
    const pending = f.control.import();
    await flush();
    if (cancel) f.control.parent.entry.cancel();
    else f.state.view.materialEffects = effectsOptions({ reflection: 'studio' });
    gate.resolve(asset());
    await assert.rejects(pending, cancel ? { name: 'AbortError' } : /changed/);
  }
});
