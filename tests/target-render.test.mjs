import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { fakeRenderer } from './helpers/fake-renderer.mjs';
import { targetRenderSize, targetCamera, createTargetSurface } from '../ui/target-render.mjs';
import {
  mediaDimensions,
  mediaExportOptions,
  createViewerMediaSurface,
  readMediaControls,
  mediaControls,
} from '../ui/media-export-options.mjs';
import { captureViewerPNG, pngCaptureOptions } from '../ui/png-capture-options.mjs';
import { AnimatedTourRenderer } from '../ui/animated-tour-renderer.mjs';
import { holdExportPreview } from '../ui/export-preview.mjs';

const cloud = Array.from({ length: 8 }, (_, i) => [i & 1 ? 2 : -2, i & 2 ? 1 : -1, i & 4 ? 0.5 : -0.5]);
function cameraViewer(projection = 'orthographic') {
  const camera =
    projection === 'orthographic'
      ? new THREE.OrthographicCamera(-2, 2, 1, -1, 0.01, 100)
      : new THREE.PerspectiveCamera(38, 2, 0.01, 100);
  camera.position.set(3, 2, 5);
  camera.lookAt(0, 0, 0);
  camera.zoom = 1.3;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return { camera, controls: { target: new THREE.Vector3() }, observationCloud: () => cloud };
}
for (const projection of ['orthographic', 'perspective'])
  test(`${projection} fits all corners into arbitrary target aspects and declared per-side margin`, () => {
    for (const aspect of [9 / 16, 1, 16 / 9, 4, 0.25])
      for (const margin of [0, 0.05, 0.1, 0.2]) {
        const viewer = cameraViewer(projection),
          before = viewer.camera.toJSON(),
          camera = targetCamera(viewer, 1000 * aspect, 1000, { margin });
        for (const point of cloud) {
          const p = new THREE.Vector3(...point).project(camera);
          assert.ok(Math.abs(p.x) <= 1 - 2 * margin + 1e-10, `horizontal ${aspect} / ${margin}`);
          assert.ok(Math.abs(p.y) <= 1 - 2 * margin + 1e-10, `vertical ${aspect} / ${margin}`);
          assert.ok(p.z >= -1 && p.z <= 1);
        }
        assert.deepEqual(viewer.camera.toJSON(), before);
        assert.equal(camera.zoom, 1);
      }
  });
test('Match viewport retains pose, zoom and vertical field while changing only aspect', () => {
  for (const projection of ['orthographic', 'perspective']) {
    const viewer = cameraViewer(projection),
      source = viewer.camera,
      camera = targetCamera(viewer, 1080, 1920, { framing: 'viewport' });
    assert.deepEqual(camera.position.toArray(), source.position.toArray());
    assert.deepEqual(camera.quaternion.toArray(), source.quaternion.toArray());
    assert.equal(camera.zoom, 1.3);
    if (camera.isOrthographicCamera) {
      assert.equal(camera.top, source.top);
      assert.equal(camera.right - camera.left, ((source.top - source.bottom) * 1080) / 1920);
    } else {
      assert.equal(camera.fov, source.fov);
      assert.equal(camera.aspect, 1080 / 1920);
    }
  }
});
test('bounded targets keep exact dimensions, gracefully drop ×2 and refuse an impossible ×1', () => {
  assert.deepEqual(targetRenderSize(1080, 1920, { supersample: 2, maxTextureSize: 4096 }), {
    width: 2160,
    height: 3840,
    scale: 2,
    diagnostic: null,
  });
  for (const options of [{ maxTextureSize: 2048 }, { maxTextureSize: 8192, maxPixels: 3000000 }]) {
    const p = targetRenderSize(1080, 1920, { supersample: 2, ...options });
    assert.equal(p.scale, 1);
    assert.equal(p.width, 1080);
    assert.equal(p.height, 1920);
    assert.match(p.diagnostic, /dimensions are unchanged/);
  }
  for (const args of [
    [4097, 1, { maxTextureSize: 4096 }],
    [8192, 8192],
    [-1, 5],
    [1.2, 1],
    [1, 1, { supersample: 4 }],
  ])
    assert.throws(() => targetRenderSize(...args));
});
test('all media and PNG presets produce their exact final dimensions independently of supersampling', () => {
  for (const format of ['png', 'mp4', 'webm', 'gif'])
    for (const [size, expected] of [
      ['square', [1080, 1080]],
      ['vertical', [1080, 1920]],
      ['landscape', [1920, 1080]],
      ['uhd', [3840, 2160]],
    ]) {
      assert.deepEqual(Object.values(mediaDimensions(999, 701, { format, size, supersample: 2 })), expected);
      let captured,
        disposed = 0;
      const viewer = {
        renderer: { domElement: { width: 999, height: 701 } },
        createExportSurface: (o) => {
          captured = o;
          return {
            copy() {},
            dispose() {
              disposed++;
            },
            canvas: { toDataURL: () => 'png' },
          };
        },
      };
      assert.equal(captureViewerPNG(viewer, { size, supersample: 2 }), 'png');
      assert.deepEqual([captured.width, captured.height], expected);
      assert.equal(captured.supersample, 2);
      assert.equal(disposed, 1);
    }
});
test('mounted export fields default to Fit model and validate margin / supersampling', () => {
  const o = readMediaControls();
  assert.equal(o.framing, 'fit');
  assert.equal(o.margin, 0.1);
  assert.equal(o.supersample, 1);
  const markup = mediaControls('animation');
  for (const id of ['framing', 'margin', 'supersample']) assert.match(markup, new RegExp(`animation-${id}`));
  assert.match(markup, /Fit model/);
  assert.match(markup, /Match viewport/);
  for (const value of [{ margin: -0.1 }, { margin: 0.5 }, { margin: NaN }, { supersample: 4 }]) {
    assert.throws(() => mediaExportOptions(value));
    assert.throws(() => pngCaptureOptions(value));
  }
});

function fixture(failure) {
  const viewer = cameraViewer(),
    scene = new THREE.Scene(),
    group = new THREE.Group();
  scene.add(group);
  viewer.scene = scene;
  viewer.view = {};
  scene.background = new THREE.Color('#56789a');
  const positions = new THREE.Float32BufferAttribute([-2, 0, 0, 2, 0, 0], 3),
    geometry = new THREE.BufferGeometry().setAttribute('position', positions);
  const ordinary = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0xabcdef, opacity: 0.4, transparent: true })
  );
  group.add(ordinary);
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false }));
  group.add(points);
  const wide = new LineSegments2(
    new LineSegmentsGeometry().setPositions(positions.array),
    new LineMaterial({ linewidth: 4 })
  );
  wide.material.resolution.set(100, 50);
  group.add(wide);
  let target = { name: 'prior' },
    alpha = 0.7,
    viewport = new THREE.Vector4(3, 4, 100, 50),
    scissor = new THREE.Vector4(5, 6, 70, 30),
    scissorTest = true;
  const before = {
      target,
      background: scene.background,
      viewport: viewport.toArray(),
      scissor: scissor.toArray(),
      camera: viewer.camera.toJSON(),
    },
    renders = [],
    canvases = [],
    targets = [];
  const renderer = Object.assign(fakeRenderer({ width: 100, height: 50 }), {
    capabilities: { maxTextureSize: 4096, maxSamples: 4 },
    domElement: { width: 200, height: 100 },
    getSize: (v) => v.set(100, 50),
    getPixelRatio: () => 2,
    getRenderTarget: () => target,
    setRenderTarget: (t) => (target = t),
    getActiveCubeFace: () => 2,
    getActiveMipmapLevel: () => 1,
    getViewport: (v) => v.copy(viewport),
    setViewport: (...args) => {
      viewport = args[0]?.isVector4 ? args[0].clone() : new THREE.Vector4(...args);
    },
    getScissor: (v) => v.copy(scissor),
    setScissor: (v) => scissor.copy(v),
    getScissorTest: () => scissorTest,
    setScissorTest: (b) => (scissorTest = b),
    getClearAlpha: () => alpha,
    setClearAlpha: (a) => (alpha = a),
    clear() {},
    setSize() {
      assert.fail('Visible canvas resized');
    },
    setPixelRatio() {
      assert.fail('Visible pixel ratio changed');
    },
    render(s, c) {
      const lines = [];
      s.traverseVisible((o) => {
        if (o.isLineSegments2) {
          o.onBeforeRender(renderer);
          lines.push({ width: o.material.linewidth, color: o.material.color.getHex(), opacity: o.material.opacity });
        }
      });
      renders.push({
        camera: c,
        pointSize: points.material.size,
        wide: wide.material.linewidth,
        resolution: wide.material.resolution.toArray(),
        background: s.background,
        alpha,
        ordinary: ordinary.visible,
        lines,
      });
      if (failure === 'render') throw Error('Render failed');
    },
    readRenderTargetPixels(t, x, y, w, h, data) {
      if (failure === 'read') throw Error('Readback failed');
      data.fill(12, 0, w * 4);
      data.fill(99, (h - 1) * w * 4);
      for (let i = 3; i < data.length; i += 4) data[i] = 255;
    },
  });
  viewer.renderer = renderer;
  const dependencies = {
    createTarget: (w, h) => {
      const t = {
        width: w,
        height: h,
        texture: {},
        dispose() {
          this.disposed = true;
        },
      };
      targets.push(t);
      return t;
    },
    createCanvas: () => {
      const canvas = {
          width: 0,
          height: 0,
          toDataURL() {
            if (failure === 'encode') throw Error('Encode failed');
            return 'png';
          },
        },
        ctx = {
          createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: (image) => (canvas.image = image),
          clearRect() {},
          drawImage: (source) => {
            canvas.source = source;
          },
        };
      canvas.getContext = () => ctx;
      canvases.push(canvas);
      return canvas;
    },
  };
  const verify = () => {
    assert.equal(renderer.getRenderTarget(), before.target);
    assert.deepEqual(viewport.toArray(), before.viewport);
    assert.deepEqual(scissor.toArray(), before.scissor);
    assert.equal(scissorTest, true);
    assert.equal(alpha, 0.7);
    assert.equal(scene.background, before.background);
    assert.deepEqual(viewer.camera.toJSON(), before.camera);
    assert.equal(points.material.size, 3);
    assert.equal(wide.material.linewidth, 4);
    assert.deepEqual(wide.material.resolution.toArray(), [100, 50]);
    assert.equal(ordinary.visible, true);
    assert.equal(group.children.length, 3);
    assert.deepEqual([renderer.domElement.width, renderer.domElement.height], [200, 100]);
  };
  return { viewer, renderer, dependencies, renders, targets, canvases, verify, ordinary, geometry };
}
test('target capture renders fresh scene pixels with scaled points / both line types, vertical flip and complete restoration', () => {
  const f = fixture(),
    surface = createTargetSurface(
      f.viewer,
      { width: 200, height: 100, supersample: 2, transparent: true },
      f.dependencies
    );
  surface.copy();
  f.verify();
  const frame = f.renders[0];
  assert.notEqual(frame.camera, f.viewer.camera);
  assert.equal(frame.pointSize, 6);
  assert.equal(frame.wide, 16);
  assert.deepEqual(frame.resolution, [400, 200]);
  assert.equal(frame.background, null);
  assert.equal(frame.alpha, 0);
  assert.equal(frame.ordinary, false);
  assert.ok(frame.lines.some((l) => l.width === 4 && l.color === 0xabcdef && l.opacity === 0.4));
  assert.equal(f.canvases[1].image.data[0], 99);
  assert.equal(f.canvases[1].image.data.at(-400 * 4), 12);
  assert.deepEqual([surface.canvas.width, surface.canvas.height], [200, 100]);
  assert.equal(f.targets[0].texture.colorSpace, THREE.SRGBColorSpace);
  surface.copy();
  f.verify();
  surface.dispose();
  surface.dispose();
  assert.equal(f.targets[0].disposed, true);
  assert.throws(() => surface.copy(), /closed/);
});
for (const failure of ['render', 'read', 'encode'])
  test(`${failure} failures restore viewer state and release owned targets`, () => {
    const f = fixture(failure);
    let surface;
    f.viewer.createExportSurface = (options) =>
      (surface = createTargetSurface(f.viewer, { ...options, width: 200, height: 100 }, f.dependencies));
    assert.throws(() => captureViewerPNG(f.viewer, { transparent: true }), /failed/);
    f.verify();
    assert.equal(f.targets[0].disposed, true);
  });
test('all stereo modes explicitly refuse before allocation and Match viewport needs no geometry scan', () => {
  const f = fixture();
  for (const stereoMode of ['anaglyph', 'parallel', 'cross-eyed']) {
    f.viewer.view.stereoMode = stereoMode;
    assert.throws(() => createTargetSurface(f.viewer, { width: 100, height: 100 }, f.dependencies), /Stereo: None/);
  }
  assert.equal(f.targets.length, 0);
  f.verify();
  f.viewer.view.stereoMode = 'none';
  f.viewer.observationCloud = () => assert.fail('Match viewport refitted geometry');
  const surface = createTargetSurface(f.viewer, { width: 100, height: 100, framing: 'viewport' }, f.dependencies);
  surface.copy();
  surface.dispose();
  f.verify();
});
test('animation media routes to target capture even at viewport size rather than copying the screen', () => {
  const f = fixture();
  let options;
  f.viewer.createExportSurface = (o) => {
    options = o;
    return createTargetSurface(f.viewer, o, f.dependencies);
  };
  const surface = createViewerMediaSurface(f.viewer, { format: 'png', supersample: 2 });
  surface.copy();
  surface.dispose();
  assert.deepEqual([options.width, options.height], [200, 100]);
  f.verify();
});
test('transparent GPU pixels are unpremultiplied before passing to ImageData', () => {
  const f = fixture();
  f.renderer.readRenderTargetPixels = (t, x, y, w, h, data) => {
    for (let i = 0; i < data.length; i += 4) data.set([12, 24, 48, 128], i);
  };
  const surface = createTargetSurface(f.viewer, { width: 2, height: 2, transparent: true }, f.dependencies);
  surface.copy();
  assert.deepEqual([...f.canvases[1].image.data.slice(0, 4)], [24, 48, 96, 128]);
  surface.dispose();
  f.verify();
});
test('viewport resize refuses publication before rendering and leaves the new viewport dimensions alone', () => {
  const f = fixture(),
    surface = createTargetSurface(f.viewer, { width: 100, height: 100 }, f.dependencies);
  f.renderer.domElement.width = 300;
  assert.throws(() => surface.copy(), /dimensions changed/);
  assert.equal(f.renders.length, 0);
  assert.equal(f.renderer.domElement.width, 300);
  surface.dispose();
});
test('tour export creates a detached exact-size renderer and refuses saved stereo events', () => {
  const original = Object.create(AnimatedTourRenderer.prototype);
  let nextCanvas;
  Object.assign(original, {
    canvas: { width: 999, height: 701 },
    timeline: { tour: { events: [{ state: { view: { stereoMode: 'parallel' } } }] } },
    createCanvas: () => (nextCanvas = {}),
  });
  assert.throws(() => original.createExportRenderer({ size: 'vertical' }), /Stereo: None/);
  assert.equal(nextCanvas, undefined);
});

test('export preview freezes visible pixels once and releases its overlay idempotently', () => {
  const created = [],
    appended = [],
    copied = [];
  let removed = 0;
  const doc = {
    body: { append: (node) => appended.push(node) },
    createElement: (tag) => {
      const el = {
        tag,
        style: {},
        append(...children) {
          this.children = children;
        },
        remove() {
          removed++;
        },
        getContext: () => ({ drawImage: (source) => copied.push(source) }),
      };
      created.push(el);
      return el;
    },
  };
  const source = {
      isConnected: true,
      ownerDocument: doc,
      width: 200,
      height: 100,
      getBoundingClientRect: () => ({ left: 3, top: 4, width: 100, height: 50 }),
    },
    viewer = { renderer: { domElement: source } };
  const preview = holdExportPreview([viewer, viewer]);
  assert.equal(appended.length, 1);
  assert.deepEqual(copied, [source]);
  assert.deepEqual([created[1].width, created[1].height], [200, 100]);
  assert.equal(created[0].style.pointerEvents, 'none');
  assert.equal(created[2].textContent, 'Rendering export…');
  preview.release();
  preview.release();
  assert.equal(removed, 1);
});
