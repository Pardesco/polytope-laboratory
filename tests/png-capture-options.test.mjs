import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { pngCaptureOptions, captureViewerPNG } from '../ui/png-capture-options.mjs';
import { ImageCaptureSession } from '../ui/image-capture-session.mjs';
import { numericControlFixture, deferred, flush } from './numeric-control-fixture.mjs';
test('PNG option builder accepts precisely native, double and quadruple resolution', () => {
  assert.deepEqual(pngCaptureOptions(), { transparent: false, scale: 1 });
  for (const scale of [1, 2, 4])
    assert.deepEqual(pngCaptureOptions({ transparent: true, scale }), { transparent: true, scale });
  for (const scale of [0, 3, 8, '2', NaN]) assert.throws(() => pngCaptureOptions({ scale }));
  assert.throws(() => pngCaptureOptions({ transparent: 'true' }));
});
function fixture({ fail = false, scaleLimit = 8192 } = {}) {
  let ratio = 2,
    alpha = 1,
    size = new THREE.Vector2(300, 200),
    color = new THREE.Color('#123456');
  const renders = [];
  const background = {},
    scene = { background },
    renderer = {
      capabilities: { maxTextureSize: scaleLimit },
      getSize: (v) => v.copy(size),
      getPixelRatio: () => ratio,
      getClearAlpha: () => alpha,
      getClearColor: (v) => v.copy(color),
      setPixelRatio: (r) => (ratio = r),
      setSize: (w, h) => size.set(w, h),
      setClearColor: (c, a) => {
        color.set(c);
        alpha = a;
      },
      render: () => renders.push({ ratio, alpha, background: scene.background }),
      domElement: {
        toDataURL: () => {
          if (fail) throw Error('Encode failed');
          return 'data:image/png;base64,pixels';
        },
      },
    };
  return { renderer, scene, view: {}, camera: {}, draw: () => renderer.render(), renders, background };
}
for (const scale of [2, 4])
  test(`transparent scale ${scale} renders alpha and high resolution then restores renderer`, () => {
    const viewer = fixture();
    assert.match(captureViewerPNG(viewer, { transparent: true, scale }), /^data:image/);
    assert.equal(viewer.renders[0].ratio, 2 * scale);
    assert.equal(viewer.renders[0].alpha, 0);
    assert.equal(viewer.renders[0].background, null);
    assert.deepEqual(viewer.renders[1], { ratio: 2, alpha: 1, background: viewer.background });
    assert.equal(viewer.renderer.getPixelRatio(), 2);
  });
test('encoding failures restore the current scene, size, alpha and pixel ratio', () => {
  const viewer = fixture({ fail: true });
  assert.throws(() => captureViewerPNG(viewer, { transparent: true, scale: 2 }), /Encode/);
  assert.equal(viewer.renderer.getPixelRatio(), 2);
  assert.equal(viewer.renderer.getClearAlpha(), 1);
  assert.equal(viewer.scene.background, viewer.background);
  assert.deepEqual(viewer.renderer.getSize(new THREE.Vector2()).toArray(), [300, 200]);
});
test('oversize and unsupported anaglyph captures fail before modifying the renderer', () => {
  const viewer = fixture({ scaleLimit: 1024 });
  assert.throws(() => captureViewerPNG(viewer, { scale: 4 }), /limit/);
  assert.equal(viewer.renders.length, 0);
  viewer.view.stereoMode = 'anaglyph';
  assert.throws(() => captureViewerPNG(viewer, { transparent: true }), /anaglyph/);
  assert.equal(viewer.renderer.getPixelRatio(), 2);
});
test('owned PNG session freezes export options before asynchronous preparation', async () => {
  const f = numericControlFixture(Object.prototype, {}),
    gate = deferred();
  let options = { transparent: true, scale: 4 },
    captured;
  const session = new ImageCaptureSession({
    ...f.context,
    getOptions: () => options,
    stop() {},
    prepare: () => gate.promise,
    image: (value) => {
      captured = value;
      return 'png';
    },
    viewer: { controls: { enabled: true, update() {} } },
    api: {
      beginImageExport: async (id) => ({ id }),
      abortImageExport: async () => {},
      writeImageExport: async () => ({ path: 'saved.png' }),
    },
  });
  const pending = session.run();
  await flush();
  options = { transparent: false, scale: 1 };
  gate.resolve();
  await pending;
  assert.deepEqual(captured, { transparent: true, scale: 4 });
  assert.equal(session.busy, false);
});
