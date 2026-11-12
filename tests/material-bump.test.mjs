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
import { MaterialBumpControls } from '../ui/material-bump-controls.mjs';
import { MaterialEffectsControls } from '../ui/material-effects-controls.mjs';
import { numericControlFixture, deferred, flush } from './numeric-control-fixture.mjs';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/material-bump.json', import.meta.url)));
const asset = () => ({ mime: 'image/png', width: 16, height: 8, base64: fixture.pngBase64 });
const settings = () => effectsOptions({ bump: 'image', bumpAsset: asset(), bumpFrequency: 1, bumpStrength: 0.1 });
const viewer = () => ({
  model: { dimension: 3, embeddingDimension: 3, faces: [] },
  view: { materialEffects: settings() },
  surface: { material: new THREE.MeshPhongMaterial() },
});
function load(view) {
  const texture = new THREE.Texture({ width: 16, height: 8 });
  let done,
    failed,
    disposed = 0;
  texture.addEventListener('dispose', () => disposed++);
  applyMaterialEffects(view, view.view, {
    loadBump: (value, yes, no) => {
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
test('saved bump records require bounded portable assets', () => {
  assert.deepEqual(effectsOptions(settings()), settings());
  assert.throws(() => effectsOptions({ bump: 'image' }), /Import/);
  for (const a of [
    { ...asset(), width: 1 },
    { ...asset(), height: 513 },
    { ...asset(), url: 'file:///map.png' },
    { ...asset(), base64: 'invalid' },
  ])
    assert.throws(() => effectsOptions({ bump: 'image', bumpAsset: a }));
});
test('capture waits for owned linear repeat/nearest texture and binds height gradient uniforms', async () => {
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
  const receipt = await pending;
  assert.equal(receipt.bump, 'image');
  assert.equal(receipt.bumpMapping, 'display-object-xy');
  assert.deepEqual(receipt.bumpDimensions, [16, 8]);
  const texture = loaded.texture;
  assert.equal(texture.colorSpace, THREE.NoColorSpace);
  assert.equal(texture.wrapS, THREE.RepeatWrapping);
  assert.equal(texture.wrapT, THREE.RepeatWrapping);
  assert.equal(texture.flipY, true);
  assert.equal(texture.premultiplyAlpha, false);
  assert.equal(texture.generateMipmaps, false);
  assert.equal(texture.minFilter, THREE.NearestFilter);
  const material = view.surface.material,
    shader = {
      vertexShader: THREE.ShaderLib.phong.vertexShader,
      fragmentShader: THREE.ShaderLib.phong.fragmentShader,
      uniforms: {},
    };
  material.onBeforeCompile(shader, {});
  assert.equal(shader.uniforms.effectsBumpImage.value, texture);
  assert.equal(shader.uniforms.effectsBumpKind.value, 3);
  assert.deepEqual(shader.uniforms.effectsBumpTexel.value, [1 / 16, 1 / 8]);
  assert.match(shader.fragmentShader, /uv=p.xy\*effectsBumpFrequency/);
  assert.match(shader.fragmentShader, /effectsObjectNormal-effectsSide\*effectsBumpStrength\*effectsSurfaceGradient/);
  disposeMaterialEffects(view);
  assert.equal(loaded.disposed, 1);
});
test('decode failure and dimensions mismatch refuse output and dispose once', async () => {
  for (const badSize of [false, true]) {
    const view = viewer(),
      loaded = load(view);
    if (badSize) {
      loaded.texture.image.width = 4;
      loaded.done();
    } else loaded.fail();
    await assert.rejects(prepareMaterialEffects(view), badSize ? /dimensions/ : /decoded/);
    assert.equal(loaded.disposed, 1);
    disposeMaterialEffects(view);
    assert.equal(loaded.disposed, 1);
  }
});
test('bump and environment ownership both complete before the shared capture', async () => {
  const view = viewer();
  view.view.materialEffects.reflection = 'studio';
  let bumpDone,
    cubeDone,
    complete = false;
  const bump = new THREE.Texture({ width: 16, height: 8 }),
    cube = new THREE.CubeTexture(Array.from({ length: 6 }, () => ({ width: 32, height: 32 })));
  applyMaterialEffects(view, view.view, {
    loadBump: (_asset, yes) => {
      bumpDone = yes;
      return bump;
    },
    loadCube: (_urls, yes) => {
      cubeDone = yes;
      return cube;
    },
  });
  const capture = prepareMaterialEffects(view).then((result) => {
    complete = true;
    return result;
  });
  bumpDone(bump);
  await flush();
  assert.equal(complete, false);
  cubeDone(cube);
  const receipt = await capture;
  assert.equal(receipt.bump, 'image');
  assert.equal(receipt.reflection, 'studio');
  disposeMaterialEffects(view);
});
test('canceled, replaced, mutated and no-longer-current sources cannot publish a bump capture', async () => {
  for (const change of ['cancel', 'replace', 'mutate', 'settings', 'current']) {
    const view = viewer(),
      loaded = load(view),
      controller = new AbortController();
    let current = true;
    const pending = prepareMaterialEffects(view, { signal: controller.signal, isCurrent: () => current });
    if (change === 'cancel') controller.abort();
    if (change === 'replace') view.model = { ...view.model };
    if (change === 'mutate') view.model.faces.push([0, 1, 2]);
    if (change === 'settings') view.view.materialEffects.bumpFrequency = 2;
    if (change === 'current') current = false;
    loaded.done();
    await assert.rejects(pending, { name: 'AbortError' });
    disposeMaterialEffects(view);
    assert.equal(loaded.disposed, 1);
  }
});
test('replacement/removal dispose textures and late callbacks cannot revive old assets', async () => {
  const view = viewer(),
    loaded = load(view);
  loaded.done();
  await prepareMaterialEffects(view);
  view.view.materialEffects.bumpAsset = { ...asset(), base64: asset().base64 + 'AAAA' };
  let replacement;
  const texture = new THREE.Texture({ width: 16, height: 8 });
  let disposed = 0;
  texture.addEventListener('dispose', () => disposed++);
  applyMaterialEffects(view, view.view, {
    loadBump: (_a, yes) => {
      replacement = yes;
      return texture;
    },
  });
  assert.equal(loaded.disposed, 1);
  view.view.materialEffects = effectsOptions();
  applyMaterialEffects(view, view.view);
  replacement(texture);
  await flush();
  assert.equal(disposed, 1);
  assert.equal(view.materialBumpOwner, null);
  disposeMaterialEffects(view);
  assert.equal(disposed, 1);
});
test('a source mutated in place after texture readiness cannot be captured', async () => {
  const view = viewer(),
    loaded = load(view);
  loaded.done();
  await prepareMaterialEffects(view);
  view.model.faces.push([0, 1, 2]);
  await assert.rejects(prepareMaterialEffects(view), { name: 'AbortError' });
  disposeMaterialEffects(view);
});
test('4D and net views retain assets with explicit inactive capture receipt', async () => {
  for (const patch of [{ model: { dimension: 4, embeddingDimension: 4, faces: [] } }, { net: {} }, { cellNet: {} }]) {
    const view = Object.assign(viewer(), patch),
      before = structuredClone(view.view),
      receipt = await prepareMaterialEffects(view);
    assert.equal(receipt.bump, 'none');
    assert.equal(receipt.requestedBump, 'image');
    assert.match(receipt.bumpDiagnostic, /only on 3D/);
    assert.deepEqual(view.view, before);
    assert.equal(view.materialBumpOwner, undefined);
  }
});
function controlFixture() {
  const f = numericControlFixture(MaterialBumpControls.prototype, {
    'effects-bump-image-file': '',
    'effects-bump-image-status': '',
  });
  const bytes = Uint8Array.from(atob(fixture.pngBase64), (c) => c.charCodeAt(0));
  f.nodes['effects-bump-image-file'].files = [{ size: bytes.length, arrayBuffer: async () => bytes.buffer }];
  f.control.parent = { requireEditable() {}, sync() {}, node: () => ({}) };
  return f;
}
test('native import preserves other effects and publishes only its source-owned view', async () => {
  const f = controlFixture();
  let dirty = 0,
    display = 0;
  f.state.view.materialEffects = effectsOptions({ reflection: 'studio', reflectivity: 0.8 });
  const before = structuredClone(f.state.model);
  f.control.context = {
    ...f.context,
    run: async (op, params, source, _label, { signal }) => {
      assert.equal(op, 'material-bump');
      assert.equal(params.pngBase64, fixture.pngBase64);
      assert.deepEqual(source, before);
      assert.equal(signal.aborted, false);
      return asset();
    },
    display() {
      display++;
    },
    markDirty() {
      dirty++;
    },
  };
  await f.control.import();
  assert.equal(dirty, 1);
  assert.equal(display, 1);
  assert.equal(f.state.view.materialEffects.bump, 'image');
  assert.equal(f.state.view.materialEffects.reflection, 'studio');
  assert.deepEqual(f.state.model, before);
  f.control.remove();
  assert.equal(f.state.view.materialEffects.bump, 'none');
  assert.equal(f.state.view.materialEffects.bumpAsset, null);
  assert.equal(dirty, 2);
});
test('import cancels/refuses publication after source, file, settings or export ownership changes', async () => {
  for (const change of ['cancel', 'file', 'settings', 'source', 'export']) {
    const f = controlFixture(),
      gate = deferred();
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
    const pending = f.control.import();
    await flush();
    if (change === 'cancel') f.control.parent.entry.cancel();
    if (change === 'file') f.nodes['effects-bump-image-file'].files = [{}];
    if (change === 'settings') f.state.view.materialEffects = effectsOptions({ bump: 'waves' });
    if (change === 'source') f.state.model = { ...f.state.model };
    if (change === 'export') f.setExport(true);
    gate.resolve(asset());
    await assert.rejects(pending);
    assert.notEqual(f.state.view.materialEffects?.bump, 'image');
  }
});
test('numeric expression edits preserve both portable assets outside target signature bounds', async () => {
  const opts = settings();
  opts.bumpAsset.base64 += 'A'.repeat(80000);
  opts.environmentAsset = { ...asset(), base64: asset().base64 + 'A'.repeat(80000) };
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
    ].map((k) => ['effects-' + k, String(opts[k] ?? '')])
  );
  values['effects-bumpFrequency'] = '2+3';
  const f = numericControlFixture(MaterialEffectsControls.prototype, values);
  f.state.view.materialEffects = opts;
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
    assert.equal(f.state.view.materialEffects.bumpFrequency, 5);
    assert.equal(f.state.view.materialEffects.bumpAsset.base64.length, opts.bumpAsset.base64.length);
    assert.deepEqual(f.state.view.materialEffects.environmentAsset, opts.environmentAsset);
  } finally {
    globalThis.document = previous;
  }
});
