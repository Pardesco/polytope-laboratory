import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiViewControls, multiViewSettings, multiViewGrid } from '../ui/multi-view-controls.mjs';
class Node {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.hidden = false;
    this.events = {};
    this.value = '';
  }
  set innerHTML(html) {
    for (const m of html.matchAll(/<(div|select|button|output)[^>]*id="([^"]+)"/g)) {
      const n = new Node(m[1]);
      n.id = m[2];
      this.children.push(n);
    }
  }
  append(...nodes) {
    for (const n of nodes) n.parent = this;
    this.children.push(...nodes);
  }
  replaceChildren(...n) {
    this.children = [];
    this.append(...n);
  }
  remove() {
    this.removed = true;
    if (this.parent) this.parent.children = this.parent.children.filter((n) => n !== this);
  }
  querySelector(s) {
    return this.all().find((n) => n.id === s.slice(1));
  }
  querySelectorAll(s) {
    return this.all().filter((n) => s.split(',').includes(n.tag));
  }
  all() {
    return this.children.flatMap((n) => [n, ...n.all()]);
  }
  setAttribute() {}
  addEventListener(k, f) {
    this.events[k] = f;
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
    this.events.close?.();
  }
  getBoundingClientRect() {
    return { width: 200, height: 180 };
  }
}
function fixture(annotations = false) {
  const events = [],
    created = [],
    saved = [],
    source = {
      id: 'source',
      dimension: 3,
      embeddingDimension: 3,
      vertices: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      edges: [[0, 1]],
      faces: [[0, 1, 2]],
      cells: [],
      metadata: { literal: { rgba: [0.2, 0.4, 0.6, 0.8] } },
    },
    state = {
      model: source,
      view: {
        coordinateUnit: 'mm',
        viewportLayout: 'split',
        camera: { original: true },
        ...(annotations ? { elementAnnotations: { entries: [{ kind: 'vertex', index: 0 }] } } : {}),
      },
      notes: 'original',
    };
  let project = {},
    frame = 0;
  const host = new Node('body');
  globalThis.document = { body: host, querySelector: () => host };
  class Viewer {
    constructor(container, onPick) {
      this.container = container;
      this.onPick = onPick;
      this.controls = { enabled: true, enableDamping: true, dispose: () => events.push('controls') };
      this.observer = { disconnect: () => events.push('observer') };
      this.renderer = {
        domElement: { width: 200, height: 180 },
        dispose: () => events.push('renderer'),
        forceContextLoss: () => events.push('context'),
      };
      this.camera = {
        position: [1, 1, 1],
        target: [0, 0, 0],
        up: [0, 1, 0],
        zoom: 1,
        projection: 'orthographic',
        orthographicHalfHeight: 1,
      };
      created.push(this);
    }
    setModel(m) {
      assert.ok(Object.isFrozen(m));
      this.model = m;
    }
    setDisplay(v) {
      this.view = v;
    }
    resize() {}
    cameraState() {
      return structuredClone(this.camera);
    }
    restoreCamera(c) {
      this.camera = structuredClone(c);
    }
    snap(axis) {
      this.camera.position = { x: [3, 0, 0], y: [0, 3, 0], z: [0, 0, 3], isometric: [3, 3, 3] }[axis];
    }
    fit() {}
    setCameraProjection(p) {
      this.camera.projection = p;
    }
    draw() {}
    clear() {
      events.push('clear');
    }
    async setElementContent() {
      this.annotated = true;
    }
    async prepareCapture() {
      events.push('capture');
      if (annotations) assert.ok(this.annotated);
      return { complete: true };
    }
  }
  const draw = [],
    canvas = {
      getContext: () => ({
        fillRect() {},
        drawImage(...a) {
          draw.push(a);
        },
      }),
      toDataURL: () => {
        events.push('image');
        return 'data:image/png;base64,grid';
      },
    },
    context = {
      Viewer,
      createElement: (tag) => new Node(tag),
      getState: () => state,
      getSource: () => state.model,
      getProject: () => project,
      host,
      mount: (n) => host.append(n),
      requestFrame: () => ++frame,
      cancelFrame() {},
      markDirty() {},
      saveImage: async (data) => {
        saved.push(data);
        return { path: 'grid.png' };
      },
      makeCanvas: () => canvas,
      describeContent: async () => {
        events.push('describe');
        return { entries: [{}] };
      },
      onSelect: (...args) => events.push(['pick', ...args]),
    },
    controls = new MultiViewControls(context);
  return { controls, context, state, source, events, created, saved, canvas, draw, setProject: (p) => (project = p) };
}
test('one-to-six source views save independent cameras, pick source IDs, maximize, export all panes and release resources', async () => {
  const f = fixture(true),
    before = structuredClone(f.state.view);
  await f.controls.open();
  await f.controls.setCount(6);
  assert.equal(f.controls.session.views.length, 6);
  assert.equal(f.events.filter((e) => e === 'describe').length, 1);
  const records = f.controls.session.views;
  records[2].viewer.camera.position = [7, 8, 9];
  records[2].viewer.onCamera();
  assert.deepEqual(f.state.view.multiViews.cameras[2].position, [7, 8, 9]);
  assert.equal(f.state.view.viewportLayout, before.viewportLayout);
  assert.deepEqual(f.state.view.camera, before.camera);
  records[1].viewer.onPick(0, 1, 'face');
  assert.ok(f.events.some((e) => Array.isArray(e) && e[0] === 'pick' && e[1] === 0 && e[3] === 'face'));
  f.controls.maximize(2);
  assert.equal(records.filter((r) => !r.tile.hidden).length, 1);
  await f.controls.export();
  assert.equal(f.draw.length, 6);
  assert.equal(f.canvas.width, 600);
  assert.equal(f.canvas.height, 360);
  assert.equal(f.saved.length, 1);
  assert.equal(f.controls.session.maximized, 2);
  assert.ok(f.events.indexOf('image') > f.events.lastIndexOf('capture'));
  const cameras = structuredClone(f.state.view.multiViews.cameras);
  f.controls.close();
  assert.equal(f.events.filter((e) => e === 'context').length, 10);
  await f.controls.open();
  assert.deepEqual(f.controls.session.views[2].viewer.cameraState(), cameras[2]);
  f.controls.close();
});
test('source/workspace changes close the frozen grid and a held capture cannot save late output', async () => {
  const f = fixture();
  await f.controls.open();
  let release, entered;
  const enteredPromise = new Promise((r) => (entered = r));
  f.controls.session.views[0].viewer.prepareCapture = () => {
    entered();
    return new Promise((r) => (release = r));
  };
  const pending = f.controls.export();
  await enteredPromise;
  f.source.metadata.literal.rgba[3] = 0.25;
  f.controls.sync();
  assert.equal(f.controls.session, null);
  release();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(f.saved.length, 0);
  await f.controls.open();
  f.setProject({ changed: true });
  f.controls.sync();
  assert.equal(f.controls.session, null);
  f.controls.destroy();
});
test('grid save forwards live ownership and close cancellation to destination review', async () => {
  const f = fixture();
  await f.controls.open();
  let review;
  f.context.saveImage = async (image, name, options) => {
    review = options;
    assert.equal(name, 'Multiple views.png');
    options.verify();
    f.created[0].camera.zoom = 2;
    assert.throws(options.verify, { name: 'AbortError' });
    return null;
  };
  await assert.rejects(f.controls.export(), { name: 'AbortError' });
  assert.equal(f.controls.busy, false);
  assert.equal(f.created[0].controls.enabled, true);
  f.controls.close();
  assert.equal(review.signal.aborted, true);
});
test('invalid saved settings and enabled source morph refuse explicitly', async () => {
  assert.deepEqual(multiViewGrid(6), { columns: 3, rows: 2 });
  assert.throws(() => multiViewSettings({ version: 1, count: 7, cameras: [] }));
  const f = fixture();
  f.state.view.dualMorph = { enabled: true };
  await assert.rejects(f.controls.open(), /enabled dual morph/);
  assert.equal(f.created.length, 0);
});
test('independent 4D projections/orientations and maximized slot survive grid close, project JSON and reopen', async () => {
  const f = fixture();
  f.source.dimension = f.source.embeddingDimension = 4;
  f.source.vertices = f.source.vertices.map((p) => [...p, 0]);
  f.state.view.angles = [1, 2, 3, 4, 5, 6];
  f.state.view.projection = 'perspective';
  await f.controls.open();
  await f.controls.setCount(6);
  const record = f.controls.session.views[4];
  assert.equal(record.sourceProjection.hidden, false);
  record.sourceProjection.value = 'stereographic';
  record.sourceProjection.onchange();
  record.pose.value = 'XW';
  record.pose.onchange();
  assert.equal(record.view.projection, 'stereographic');
  assert.deepEqual(record.view.angles, [1, 2, 93, 4, 5, 6]);
  assert.equal(f.controls.session.views[0].view.projection, 'perspective');
  assert.deepEqual(f.state.view.angles, [1, 2, 3, 4, 5, 6]);
  f.controls.maximize(4);
  assert.equal(f.state.view.multiViews.maximized, 4);
  const saved = JSON.parse(JSON.stringify(f.state.view.multiViews));
  f.controls.close();
  f.state.view.multiViews = saved;
  await f.controls.open();
  assert.equal(f.controls.session.maximized, 4);
  assert.equal(f.controls.session.views.filter((r) => !r.tile.hidden).length, 1);
  assert.equal(f.controls.session.views[4].view.projection, 'stereographic');
  assert.deepEqual(f.controls.session.views[4].view.angles, [1, 2, 93, 4, 5, 6]);
  f.controls.maximize(4);
  assert.equal(f.state.view.multiViews.maximized, null);
  for (const count of [1, 2, 4, 6]) {
    await f.controls.setCount(count);
    assert.equal(f.controls.session.views.length, count);
    assert.equal(f.controls.session.maximized, null);
    assert.deepEqual(multiViewGrid(count), {
      columns: count === 1 ? 1 : count === 6 ? 3 : 2,
      rows: count <= 2 ? 1 : 2,
    });
  }
  f.controls.destroy();
});
test('layout validation rejects malformed saved presentations and maximized slots', () => {
  for (const extra of [
    { maximized: 4 },
    { maximized: -1 },
    { maximized: 1.5 },
    { presentations: [{ projection: 'unknown', angles: Array(6).fill(0) }] },
    { presentations: [{ projection: 'perspective', angles: [0, 0, 0, 0, 0, NaN] }] },
    { presentations: Array(7).fill(null) },
  ])
    assert.throws(() => multiViewSettings({ version: 1, count: 4, cameras: [], ...extra }), /invalid/);
  assert.equal(multiViewSettings({ version: 1, count: 2, cameras: [] }).maximized, null);
});
