import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ViewerStereo, stereoSettings } from '../ui/viewer-stereo.mjs';
import { StereoAnaglyph } from '../ui/stereo-anaglyph.mjs';
import { captureViewerPNG } from '../ui/png-capture-options.mjs';
function fixture() {
  const cameras = [],
    renderer = {
      autoClear: true,
      getSize: (v) => v.set(800, 400),
      getPixelRatio: () => 1,
      setViewport() {},
      setScissorTest() {},
      setScissor() {},
      clear() {},
      render: (_, c) => cameras.push(c),
    };
  const camera = new THREE.PerspectiveCamera(38, 2, 0.01, 1000);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return { cameras, renderer, camera, stereo: new ViewerStereo(renderer) };
}
test('cross-eye render is the exact parallel eye swap, with consistent selection cameras', () => {
  const f = fixture(),
    scene = new THREE.Scene(),
    view = { stereoEyeSeparation: 0.12, stereoConvergence: 4 };
  f.stereo.render(scene, f.camera, 'parallel', view);
  const [left, right] = f.cameras;
  f.cameras.length = 0;
  f.stereo.render(scene, f.camera, 'cross-eyed', view);
  assert.deepEqual(f.cameras, [right, left]);
  assert.equal(f.stereo.pick(f.camera, 'cross-eyed', 100, 800, view).camera, right);
  assert.equal(f.stereo.pick(f.camera, 'cross-eyed', 600, 800, view).camera, left);
  assert.equal(right.matrixWorld.elements[12] - left.matrixWorld.elements[12], 0.12);
  for (const eye of [left, right]) {
    const p = new THREE.Vector3(0.3, 0.2, -1),
      projected = p.clone().project(eye).unproject(eye);
    assert.ok(projected.distanceTo(p) < 1e-10, 'eye projection inverse must match for ray picking');
  }
});
test('convergence plane has zero disparity, separation zero flattens depth, and observer focus remains intact', () => {
  const f = fixture(),
    focus = f.camera.focus;
  const [left, right] = f.stereo.eyes(f.camera, { stereoEyeSeparation: 0.2, stereoConvergence: 3 });
  const p = new THREE.Vector3(0.1, 0.2, 2);
  assert.ok(Math.abs(p.clone().project(left).x - p.clone().project(right).x) < 1e-12);
  const near = new THREE.Vector3(0, 0, 4);
  assert.ok(Math.abs(near.clone().project(left).x - near.clone().project(right).x) > 1e-3);
  f.stereo.eyes(f.camera, { stereoEyeSeparation: 0, stereoConvergence: 3 });
  assert.equal(near.clone().project(left).x, near.clone().project(right).x);
  assert.equal(f.camera.focus, focus);
});
test('anaglyph eyes use full viewport aspect and share pair eye separation/convergence', () => {
  const f = fixture(),
    view = { stereoEyeSeparation: 0.1, stereoConvergence: 4 };
  let args;
  f.stereo.anaglyph = {
    render: (_, eyes, w, h) => {
      args = { eyes, w, h };
    },
  };
  f.stereo.render(new THREE.Scene(), f.camera, 'anaglyph', view);
  assert.equal(args.w, 800);
  assert.equal(args.h, 400);
  assert.equal(f.stereo.camera.aspect, 1);
  assert.equal(f.stereo.camera.eyeSep, 0.1);
  const point = new THREE.Vector3(0, 0, 1);
  assert.ok(Math.abs(point.clone().project(args.eyes[0]).x - point.clone().project(args.eyes[1]).x) < 1e-12);
});
test('stereo defaults are bounded when legacy or invalid view settings are supplied', () => {
  assert.deepEqual(stereoSettings(), { eyeSeparation: 0.064, convergence: 5 });
  assert.deepEqual(stereoSettings({ stereoEyeSeparation: 2, stereoConvergence: 0 }), stereoSettings());
});
test('anaglyph compositor renders each physical eye at display resolution and restores targets on failure', () => {
  const calls = [],
    original = {},
    eyes = [new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera()];
  let target = original,
    fail = false;
  const renderer = {
    getRenderTarget: () => target,
    getPixelRatio: () => 2,
    setRenderTarget: (t) => (target = t),
    clear() {},
    render: (_, camera) => {
      calls.push([target, camera]);
      if (fail) throw Error('draw failed');
    },
  };
  const effect = new StereoAnaglyph(renderer);
  try {
    effect.render(new THREE.Scene(), eyes, 400, 300);
    assert.equal(effect.left.width, 800);
    assert.equal(effect.right.height, 600);
    assert.deepEqual(calls.slice(0, 2), [
      [effect.left, eyes[0]],
      [effect.right, eyes[1]],
    ]);
    assert.equal(calls[2][0], original);
    assert.equal(target, original);
    fail = true;
    assert.throws(() => effect.render(new THREE.Scene(), eyes, 400, 300), /draw failed/);
    assert.equal(target, original);
  } finally {
    effect.dispose();
  }
});
for (const mode of ['parallel', 'cross-eyed'])
  test(`scaled transparent PNG retains ${mode} settings and restores the renderer`, () => {
    const view = { stereoMode: mode, stereoEyeSeparation: 0.2, stereoConvergence: 3 },
      calls = [],
      background = {},
      scene = { background };
    let ratio = 1,
      alpha = 1;
    const renderer = {
      capabilities: { maxTextureSize: 8192 },
      getSize: (v) => v.set(400, 300),
      getPixelRatio: () => ratio,
      getClearAlpha: () => alpha,
      getClearColor: (v) => v.set('#123456'),
      setPixelRatio: (value) => (ratio = value),
      setSize() {},
      setClearColor: (_, value) => (alpha = value),
      domElement: { toDataURL: () => 'png' },
    };
    const viewer = {
      view,
      scene,
      renderer,
      camera: {},
      stereoRenderer: { render: (s, c, m, v) => calls.push({ m, v, ratio, alpha, background: s.background }) },
    };
    assert.equal(captureViewerPNG(viewer, { transparent: true, scale: 2 }), 'png');
    assert.deepEqual(
      calls.map((c) => [c.m, c.v, c.ratio, c.alpha]),
      [
        [mode, view, 2, 0],
        [mode, view, 1, 1],
      ]
    );
    assert.equal(calls[0].background, null);
    assert.equal(calls[1].background, background);
  });
