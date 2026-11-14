import { readAppSource } from './helpers/app-source.mjs';
import { matchSource } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  Direct4D,
  screenDrag,
  rotationMatrix,
  matrixAngles,
  turn4D,
  dampMotion,
  hintSession,
} from '../ui/direct-4d.mjs';
import { ViewportControls } from '../ui/viewport-controls.mjs';
import { rotate } from '../ui/projection.js';
import { holdObservationControls } from '../ui/observation-controls.mjs';

const close = (a, b, tolerance = 1e-10) => {
  assert.equal(a.length, b.length);
  a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < tolerance, `${i}: ${x} != ${b[i]}`));
};
const matrixClose = (a, b) => close(a.flat(), b.flat());
const identity = [0, 0, 0, 0, 0, 0];

test('front-facing drag maps right/up into XW/YW, and camera orbit/roll maps screen axes', () => {
  close(screenDrag(20, 10), [7, -3.5, 0]);
  close(screenDrag(20, 10, [0, 0, -1], [0, 1, 0]), [0, -3.5, -7]);
  close(screenDrag(20, 10, [0, 1, 0], [-1, 0, 0]), [3.5, 7, 0]);
  for (const mode of ['orthographic', 'perspective']) {
    const camera = mode === 'orthographic' ? new THREE.OrthographicCamera() : new THREE.PerspectiveCamera();
    camera.position.set(4, 3, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const m = camera.matrixWorld.elements,
      right = [m[0], m[1], m[2]],
      up = [m[4], m[5], m[6]],
      delta = screenDrag(10, 0, right, up);
    close(
      delta,
      right.map((x) => x * 3.5)
    );
    assert.ok(Math.abs(delta.reduce((s, x, i) => s + x * up[i], 0)) < 1e-12);
  }
});

test('coordinate-plane turns use the renderer sign/order and preserve source inputs', () => {
  for (const [axis, plane] of [
    [0, 2],
    [1, 4],
    [2, 5],
  ]) {
    const delta = [0, 0, 0];
    delta[axis] = 17;
    const expected = [...identity];
    expected[plane] = 17;
    matrixClose(rotationMatrix(turn4D(identity, delta)), rotationMatrix(expected));
  }
  const angles = [13, -28, 41, 75, -92, 111],
    before = [...angles],
    delta = [7, -11, 3];
  turn4D(angles, delta);
  assert.deepEqual(angles, before);
  assert.deepEqual(delta, [7, -11, 3]);
});

test('matrix decomposition round-trips mixed and singular six-plane orientations', () => {
  const values = [
    identity,
    [0, 0, 90, 0, 0, 0],
    [0, 90, 0, 0, 0, 0],
    [0, 0, 0, 0, 90, 0],
    [180, -90, 90, -180, 90, 180],
    [13, -28, 41, 75, -92, 111],
  ];
  for (let i = 0; i < 120; i++)
    values.push(Array.from({ length: 6 }, (_, j) => (((i + 3) * (j + 17) * 71.319) % 360) - 180));
  for (const angles of values) {
    const m = rotationMatrix(angles);
    matrixClose(rotationMatrix(matrixAngles(m)), m);
  }
});

test('camera-relative composition matches an independent arbitrary-plane rotation on 4D points', () => {
  const angles = [13, -28, 41, 75, -92, 111],
    delta = screenDrag(18, -12, [0.8, 0, -0.6], [0.36, 0.8, 0.48]),
    length = Math.hypot(...delta),
    n = delta.map((x) => x / length),
    a = (length * Math.PI) / 180;
  const result = turn4D(angles, delta);
  for (const point of [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
    [0.2, -0.5, 0.7, 0.3],
  ]) {
    const p = rotate(point, angles),
      along = n.reduce((s, x, i) => s + x * p[i], 0);
    const expected = [
      ...n.map((x, i) => p[i] + x * ((Math.cos(a) - 1) * along - Math.sin(a) * p[3])),
      Math.sin(a) * along + Math.cos(a) * p[3],
    ];
    close(rotate(point, result), expected);
    assert.ok(Math.abs(Math.hypot(...point) - Math.hypot(...rotate(point, result))) < 1e-12);
  }
  const restored = turn4D(
    result,
    delta.map((x) => -x)
  );
  matrixClose(rotationMatrix(restored), rotationMatrix(angles));
});

test('inertia integrates exponential damping independently of frame rate and stops below threshold', () => {
  const a = dampMotion([90, -30, 10], 0.1),
    b = dampMotion([90, -30, 10], 0.05),
    c = dampMotion(b.velocity, 0.05);
  close(a.velocity, c.velocity);
  close(
    a.delta,
    b.delta.map((x, i) => x + c.delta[i])
  );
  assert.ok(Math.hypot(...a.velocity) < Math.hypot(90, -30, 10));
  close(dampMotion([1, 2, 3], 0).delta, [0, 0, 0]);
  close(dampMotion([1, 2, 3], 10).delta, dampMotion([1, 2, 3], 0.1).delta);
});

class Node {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.listeners = new Map();
    this.attributes = {};
    this.style = { setProperty: (k, v) => (this.style[k] = v) };
    this.hidden = false;
    this.textContent = '';
    this.clientHeight = 500;
  }
  append(...children) {
    for (const node of children) {
      if (typeof node === 'object') node.parentElement = this;
      this.children.push(node);
    }
  }
  prepend(node) {
    node.parentElement = this;
    this.children.unshift(node);
  }
  setAttribute(k, v) {
    this.attributes[k] = v;
  }
  addEventListener(k, fn) {
    if (!this.listeners.has(k)) this.listeners.set(k, []);
    this.listeners.get(k).push(fn);
  }
  emit(type, fields = {}) {
    const e = {
      type,
      pointerId: 1,
      button: 0,
      clientX: 0,
      clientY: 0,
      timeStamp: 0,
      detail: 1,
      preventDefault() {
        this.prevented = true;
      },
      stopImmediatePropagation() {
        this.stopped = true;
      },
      ...fields,
    };
    for (const fn of this.listeners.get(type) || []) {
      fn(e);
      if (e.stopped) break;
    }
    return e;
  }
  setPointerCapture(pointer) {
    this.capture = pointer;
  }
  hasPointerCapture(pointer) {
    return this.capture === pointer;
  }
  releasePointerCapture() {
    this.capture = null;
    this.emit('lostpointercapture');
  }
}
function storage() {
  const values = new Map();
  return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
}
function fixture(t, { dimension = 4, sharedStorage = storage() } = {}) {
  const previous = globalThis.document,
    settings = new Node(),
    document = new Node();
  document.createElement = (tag) => new Node(tag);
  document.getElementById = () => settings;
  globalThis.document = document;
  t.after(() => {
    globalThis.document = previous;
  });
  const container = new Node(),
    host = new Node();
  host.append(container);
  const canvas = new Node('canvas');
  container.append(canvas);
  const model = { dimension, vertices: [[1, 0, 0, 0]] },
    state = { model, notes: 'retained', view: { angles: [...identity] } };
  let current = state,
    exporting = false;
  const calls = [],
    base = {
      container,
      renderer: { domElement: canvas },
      controls: { enabled: true, enableDamping: true, update() {} },
      camera: new THREE.OrthographicCamera(),
    };
  base.camera.position.set(0, 0, 5);
  base.camera.lookAt(0, 0, 0);
  const context = {
    base,
    storage: sharedStorage,
    getState: () => current,
    getModel: () => current?.model,
    isExporting: () => exporting,
    stopTrack: () => calls.push('pause'),
    cancelProjectionFit: () => calls.push('cancel-fit'),
    displayPose: () => calls.push('pose'),
    syncPose: () => calls.push('sync'),
    markPoseDirty: () => calls.push('dirty'),
  };
  const owner = Object.assign(Object.create(ViewportControls.prototype), { context, syncPlaying() {}, playing: false });
  const direct = new Direct4D(context, owner);
  owner.direct4D = direct;
  direct.sync();
  return {
    direct,
    owner,
    base,
    canvas,
    host,
    settings,
    document,
    state,
    calls,
    context,
    export: () => (exporting = true),
    replace: () => {
      current = structuredClone(state);
    },
    empty: () => (current = null),
  };
}

test('mounted drag coalesces input into frame pose updates, releases controls and keeps tumbling until stopped', (t) => {
  const f = fixture(t),
    before = structuredClone(f.state);
  f.direct.begin(f.canvas.emit('test'), f.canvas);
  assert.equal(f.base.controls.enabled, false);
  assert.equal(f.base.pickDragged, true);
  assert.equal(f.base.down, null);
  f.direct.move(f.canvas.emit('test', { clientX: 10, timeStamp: 16 }));
  f.direct.move(f.canvas.emit('test', { clientX: 20, timeStamp: 32 }));
  assert.deepEqual(f.state, before);
  assert.equal(f.calls.filter((x) => x === 'pose').length, 0);
  assert.equal(f.owner.tick(0.016), true);
  assert.equal(f.calls.filter((x) => x === 'pose').length, 1);
  assert.ok(f.state.view.angles[2] > 6.99);
  f.direct.finish(f.canvas.emit('pointerup', { timeStamp: 40 }));
  assert.equal(f.owner.drag, null);
  assert.equal(f.base.controls.enabled, true);
  const angle = f.state.view.angles[2];
  f.owner.tick(0.016);
  assert.ok(f.state.view.angles[2] > angle);
  for (let i = 0; i < 200; i++) f.owner.tick(0.016);
  assert.equal(f.direct.active, true, 'released while moving: keeps tumbling');
  const mid = f.state.view.angles[2];
  f.owner.tick(0.016);
  assert.ok(f.state.view.angles[2] !== mid, 'tumble does not decay');
  f.direct.cancel();
  assert.equal(f.direct.active, false);
  assert.equal(f.owner.tick(0.016), false);
  assert.equal(
    f.calls.filter((x) => x === 'dirty').length,
    1,
    'previews invalidate once; the app clock records each frame'
  );
  before.view.angles = [...f.state.view.angles];
  assert.deepEqual(f.state, before);
});

test('a slow or paused release does not tumble', (t) => {
  const f = fixture(t);
  f.direct.begin(f.canvas.emit('test'), f.canvas);
  f.direct.move(f.canvas.emit('test', { clientX: 10, timeStamp: 16 }));
  f.owner.tick(0.016);
  f.direct.finish(f.canvas.emit('pointerup', { timeStamp: 400 }));
  for (let i = 0; i < 50; i++) f.owner.tick(0.016);
  assert.equal(f.direct.active, false);
});

test('3D models ignore shift gestures and hide the gizmo, hint and Rotation option', (t) => {
  const f = fixture(t, { dimension: 3 }),
    before = structuredClone(f.state),
    event = f.canvas.emit('test', { shiftKey: true, deltaY: 80 });
  f.direct.begin(event, f.canvas);
  f.direct.wheel(event);
  f.direct.reset();
  assert.equal(f.direct.tick(0.1), false);
  assert.deepEqual(f.state, before);
  assert.ok(!event.prevented);
  assert.equal(f.direct.gizmo.hidden, true);
  assert.equal(f.direct.hint.hidden, true);
  assert.equal(f.direct.visibilityLabel.hidden, true);
});

test('Shift-wheel turns ZW with normalized bounded units; ordinary wheel remains available to zoom', (t) => {
  const f = fixture(t);
  const wheel = (fields) => f.canvas.emit('wheel', { deltaY: 1, ...fields });
  assert.ok(!wheel({ shiftKey: false }).prevented);
  assert.equal(f.direct.active, false);
  assert.equal(wheel({ shiftKey: true, deltaMode: 1 }).prevented, true);
  f.direct.tick(0.016);
  assert.ok(Math.abs(f.state.view.angles[5] - 1.92) < 1e-10);
  f.state.view.angles.fill(0);
  wheel({ shiftKey: true, deltaMode: 2 });
  f.direct.tick(0.016);
  assert.ok(Math.abs(f.state.view.angles[5] - 14.4) < 1e-10);
  assert.deepEqual(f.direct.velocity, [0, 0, 0]);
});

for (const [label, change] of [
  ['source replacement', (f) => f.replace()],
  [
    'external angle edit',
    (f) => {
      f.state.view.angles[2] = 50;
    },
  ],
  ['cancellation', (f) => f.direct.cancel()],
  ['export', (f) => f.export()],
])
  test(`${label} stops pending motion without publishing`, (t) => {
    const f = fixture(t);
    f.direct.keyTurn(0, 10);
    change(f);
    const before = structuredClone(f.context.getState()),
      poses = f.calls.filter((x) => x === 'pose').length;
    assert.equal(f.direct.tick(0.016), false);
    assert.equal(f.calls.filter((x) => x === 'pose').length, poses);
    assert.deepEqual(f.context.getState(), before);
    assert.equal(f.direct.active, false);
  });

test('export interrupts captured gestures, respects nested observer holds, and restores UI availability', (t) => {
  const f = fixture(t);
  f.direct.begin(f.canvas.emit('test'), f.canvas);
  assert.equal(f.base.controls.enabled, false);
  const nested = holdObservationControls([f.base]);
  f.export();
  f.direct.move(f.canvas.emit('test', { clientX: 20, timeStamp: 16 }));
  f.direct.sync();
  assert.equal(f.owner.drag, null);
  assert.equal(f.base.controls.enabled, false);
  assert.equal(f.direct.active, false);
  nested.release();
  assert.equal(f.base.controls.enabled, true);
  assert.ok(f.direct.pads.every((p) => p.disabled));
  assert.equal(f.direct.straighten.disabled, true);
  assert.equal(f.direct.checkbox.disabled, true);
  assert.deepEqual(f.state.view.angles, identity);
});

test('gizmo pads are labeled, pointer/keyboard operable, and Straighten reaches the app defaults', (t) => {
  const f = fixture(t),
    pad = f.direct.pads[1];
  assert.equal(pad.id, 'direct-4d-yw');
  assert.match(pad.attributes['aria-label'], /YW.*degrees/);
  pad.emit('pointerdown');
  pad.emit('pointermove', { clientX: 20, timeStamp: 16 });
  pad.emit('pointerup', { timeStamp: 200 });
  f.direct.tick(0.016);
  assert.ok(Math.abs(f.state.view.angles[4] - 7) < 1e-10);
  pad.emit('keydown', { key: 'ArrowLeft' });
  f.direct.tick(0.016);
  assert.ok(Math.abs(f.state.view.angles[4] - 5) < 1e-10);
  pad.emit('click', { detail: 0 });
  f.direct.tick(0.016);
  assert.ok(Math.abs(f.state.view.angles[4] - 10) < 1e-10);
  const before = [...f.state.view.angles];
  f.direct.straighten.emit('click');
  f.direct.tick(0.1);
  assert.notDeepEqual(f.state.view.angles, before);
  assert.notDeepEqual(f.state.view.angles, [0, 0, 24, 0, 18, 0]);
  for (let i = 0; i < 5; i++) f.direct.tick(0.1);
  assert.deepEqual(f.state.view.angles, [0, 0, 24, 0, 18, 0]);
  assert.equal(f.direct.active, false);
});

test('held drags do not coast after a pause; pointer loss/visibility change cancels pending work', (t) => {
  const f = fixture(t),
    pad = f.direct.pads[0];
  pad.emit('pointerdown');
  pad.emit('pointermove', { clientX: 20, timeStamp: 16 });
  f.direct.tick(0.016);
  pad.emit('pointerup', { timeStamp: 400 });
  assert.equal(f.direct.active, false);
  pad.emit('pointerdown');
  pad.emit('pointermove', { clientX: 40, timeStamp: 16 });
  pad.emit('lostpointercapture');
  assert.equal(f.owner.drag, null);
  assert.equal(f.direct.active, false);
  f.direct.keyTurn(0, 10);
  f.document.hidden = true;
  f.document.emit('visibilitychange');
  assert.equal(f.direct.active, false);
  f.direct.keyTurn(0, 10);
  f.document.emit('keydown', { key: 'Escape' });
  assert.equal(f.direct.active, false);
});

test('hint appears in the first three 4D sessions and tolerates unavailable storage', () => {
  const s = storage();
  assert.deepEqual(
    Array.from({ length: 5 }, () => hintSession(s)),
    [true, true, true, false, false]
  );
  s.setItem('polytope.direct4d.hint-dismissed', '1');
  assert.equal(hintSession(s), false);
  assert.equal(
    hintSession({
      getItem() {
        throw Error('blocked');
      },
    }),
    true
  );
});

test('hint dismissal and public gizmo visibility setter persist locally and hide on empty workspace', (t) => {
  const s = storage(),
    f = fixture(t, { sharedStorage: s });
  assert.equal(f.direct.hint.hidden, false);
  const closeButton = f.direct.hint.children[1];
  assert.equal(closeButton.attributes['aria-label'], 'Dismiss 4D gesture hint');
  closeButton.emit('click');
  assert.equal(f.direct.hint.hidden, true);
  assert.equal(hintSession(s), false);
  f.owner.set4DGizmoVisible(false);
  assert.equal(f.direct.gizmo.hidden, true);
  assert.equal(s.getItem('polytope.direct4d.gizmo'), '0');
  f.owner.set4DGizmoVisible(true);
  assert.equal(f.direct.gizmo.hidden, false);
  f.empty();
  f.direct.sync();
  assert.equal(f.direct.gizmo.hidden, true);
  assert.equal(f.direct.hint.hidden, true);
});

test('mounted viewport gesture dispatch retains picking threshold path and uses the direct frame clock', () => {
  const source = readFileSync(new URL('../ui/viewport-controls.mjs', import.meta.url), 'utf8'),
    app = readAppSource();
  matchSource(source, /if\(this.direct4D\)return this.direct4D.begin\(event,canvas\)/);
  matchSource(source, /if\(this.direct4D\)return this.direct4D.move\(event\)/);
  matchSource(source, /if\(this.direct4D\?\.tick\(dt\)\)return true/);
  matchSource(app, /import '\.\/direct-4d.css'/);
  matchSource(app, /viewportControls.direct4D\?\.active/);
  const viewer = readFileSync(new URL('../ui/viewer.js', import.meta.url), 'utf8');
  matchSource(viewer, /this.pickDragged\|\|Math.hypot/);
});

test('opening demo turns briefly, restores its pose, and yields immediately to Shift-wheel or source replacement', (t) => {
  const f = fixture(t),
    before = [...f.state.view.angles];
  f.direct.demoTurn();
  assert.equal(f.direct.active, true);
  f.direct.tick(0.1);
  assert.notDeepEqual(f.state.view.angles, before);
  for (let i = 0; i < 16; i++) f.direct.tick(0.1);
  assert.deepEqual(f.state.view.angles, before);
  assert.equal(f.direct.active, false);
  f.direct.demoTurn();
  f.direct.tick(0.1);
  f.direct.wheel(f.canvas.emit('test', { shiftKey: true, deltaY: 20 }));
  assert.equal(f.direct.demo, null);
  f.direct.cancel();
  f.direct.demoTurn();
  f.replace();
  assert.equal(f.direct.tick(0.1), false);
  assert.equal(f.direct.active, false);
});

test('hyperbolic documents hide and cancel 4D controls without reading Euclidean angles', () => {
  const control = Object.create(Direct4D.prototype),
    flags = [];
  Object.assign(control, {
    context: { getModel: () => ({ kind: 'hyperbolic-space', dimension: 3 }) },
    owner: {
      view() {
        throw Error('Euclidean angle read');
      },
    },
    cancel: () => flags.push('cancel'),
    gizmo: {},
    hint: {},
    visibilityLabel: {},
    overlays: { eligible: (id, value) => flags.push([id, value]) },
  });
  control.sync();
  assert.deepEqual(flags, ['cancel', ['direct4d', false]]);
  assert.equal(control.gizmo.hidden, true);
  assert.equal(control.hint.hidden, true);
  assert.equal(control.visibilityLabel.hidden, true);
});
