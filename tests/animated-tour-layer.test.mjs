import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnimatedTourLayerFactory } from '../ui/animated-tour-layer.mjs';
function fixture({ run } = {}) {
  const nodes = [],
    calls = [],
    make = () => {
      const n = {
        style: {},
        dataset: {},
        append(...children) {
          this.children = children;
        },
        remove() {
          this.removed = true;
        },
      };
      nodes.push(n);
      return n;
    };
  class FakeViewer {
    constructor(container) {
      this.container = container;
      this.calls = [];
      this.observer = { disconnect: () => this.calls.push('disconnect') };
      this.controls = { dispose: () => this.calls.push('controls') };
      this.renderer = {
        dispose: () => this.calls.push('renderer'),
        forceContextLoss: () => this.calls.push('context'),
      };
    }
    async prepareCapture() {
      return { ready: true };
    }
    async setElementContent(descriptor) {
      this.elementContentLayer = descriptor ? { descriptor } : null;
      return { ready: true };
    }
    clear() {
      this.calls.push('clear');
    }
    resize() {
      this.calls.push(['resize', this.container.style.width]);
    }
    setModel(m) {
      this.model = m;
      this.calls.push(['model', m]);
    }
    setNet(n) {
      this.calls.push(['net', n]);
    }
    setCellNet(n, s) {
      this.calls.push(['cell-net', n, s]);
    }
    setFold(n) {
      this.calls.push(['fold', n]);
    }
    setDisplay(v) {
      this.calls.push(['view', v]);
    }
    restoreCamera(c) {
      this.calls.push(['camera', c]);
    }
    fit() {
      this.calls.push('fit');
    }
    draw() {
      this.calls.push('draw');
    }
  }
  let current = true,
    state = {
      model: { id: 'cube', dimension: 3, fingerprint: 'abc' },
      view: {
        derivedMode: 'section',
        viewportLayout: 'split',
        sectionNormal: [0, 0, 1],
        sectionOffset: 0.25,
        surfaceOpacity: 0.6,
      },
    };
  FakeViewer.prototype.setSectionModel = function (model, source, options) {
    this.model = model;
    this.calls.push(['section', model, source, options]);
  };
  const host = make(),
    factory = createAnimatedTourLayerFactory({
      host,
      ViewerClass: FakeViewer,
      createElement: make,
      run: async (...args) => {
        calls.push(args);
        return run ? run(...args) : { model: { id: 'slice' } };
      },
    });
  const layer = factory({ slot: 0, getState: () => state, width: 800, height: 600, isCurrent: () => current });
  return { layer, nodes, calls, state, setState: (s) => (state = s), setCurrent: (v) => (current = v) };
}
test('independent half-width panes preserve section parameters and saved camera', async () => {
  const f = fixture();
  f.state.view.derivedCamera = { position: [1, 2, 3] };
  f.layer.prepareLayout(f.state.view);
  await f.layer.refreshDerived();
  assert.notEqual(f.layer.viewer, f.layer.netViewer);
  assert.equal(f.nodes[2].style.width, '400px');
  assert.equal(f.nodes[3].style.width, '400px');
  assert.deepEqual(f.calls[0].slice(0, 3), [
    'section',
    { normal: [0, 0, 1], offset: 0.25, fill_rule: 'nonzero' },
    f.state.model,
  ]);
  assert.deepEqual(
    f.layer.netViewer.calls.find((c) => c[0] === 'camera'),
    ['camera', f.state.view.derivedCamera]
  );
  f.layer.prepareLayout({ viewportLayout: 'single' });
  assert.equal(f.nodes[2].style.width, '800px');
});
test('native results for a replaced preview state are discarded before viewer mutation', async () => {
  const f = fixture();
  f.setCurrent(false);
  await assert.rejects(f.layer.refreshDerived(), { name: 'AbortError' });
  assert.equal(f.calls.length, 0);
  f.setCurrent(true);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(f.layer.refreshDerived({ signal: controller.signal }), { name: 'AbortError' });
});
test('retained net layout and placements are cloned without native regeneration', async () => {
  const f = fixture();
  f.state.view.derivedMode = 'net';
  f.state.view.net = { root: 0, length: 25, tabs: true, fraction: 0.4 };
  f.state.netLayout = {
    sourceFingerprint: 'abc',
    root: 0,
    referenceEdgeLengthMm: 25,
    tabs: true,
    placements: [{ literal: 1 }],
  };
  const before = structuredClone(f.state);
  await f.layer.refreshDerived();
  assert.deepEqual(f.state, before);
  assert.equal(f.calls.length, 0);
  const rendered = f.layer.netViewer.calls.find((c) => c[0] === 'net')[1];
  assert.deepEqual(rendered, f.state.netLayout);
  assert.notEqual(rendered, f.state.netLayout);
  assert.deepEqual(
    f.layer.netViewer.calls.find((c) => c[0] === 'fold'),
    ['fold', 0.4]
  );
});
test('unsupported SVG layouts are diagnosed before substituting another derived display', async () => {
  const f = fixture();
  f.state.view.derivedMode = 'net';
  f.state.view.net = { display: 'pages' };
  await assert.rejects(f.layer.refreshDerived(), /SVG tour adapter/);
  assert.equal(f.calls.length, 0);
});
test('closing releases both observers, controls, geometry, GPU contexts and host exactly once', async () => {
  const f = fixture();
  f.layer.dispose();
  f.layer.dispose();
  for (const v of [f.layer.viewer, f.layer.netViewer])
    assert.deepEqual(v.calls, ['clear', 'disconnect', 'controls', 'renderer', 'context']);
  assert.equal(f.nodes[1].removed, true);
  await assert.rejects(f.layer.refreshDerived(), { name: 'AbortError' });
});

test('saved section frames scope reusable materials to their actual source and domain; other derived modes replace normally', async () => {
  const f = fixture();
  await f.layer.refreshDerived();
  assert.deepEqual(
    f.layer.netViewer.calls.find((c) => c[0] === 'section'),
    ['section', { id: 'slice' }, f.state.model, { mode: 'section' }]
  );
  f.layer.netViewer.calls = [];
  f.state.view.derivedMode = 'cell-section';
  await f.layer.refreshDerived();
  assert.equal(f.layer.netViewer.calls.find((c) => c[0] === 'section')[3].mode, 'cell-section');
  f.layer.netViewer.calls = [];
  f.state.view.derivedMode = 'dual';
  await f.layer.refreshDerived();
  assert.ok(f.layer.netViewer.calls.some((c) => c[0] === 'model'));
  assert.ok(!f.layer.netViewer.calls.some((c) => c[0] === 'section'));
  f.layer.dispose();
});

test('a late native cut cannot mutate section materials or publish geometry for a replaced actor', async () => {
  let release;
  const f = fixture({ run: () => new Promise((resolve) => (release = resolve)) }),
    pending = f.layer.refreshDerived();
  f.setState({ ...f.state, model: { ...f.state.model, id: 'replacement' } });
  release({ model: { id: 'old-cut' } });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.ok(!f.layer.netViewer.calls.some((c) => ['model', 'section'].includes(c[0])));
  f.layer.dispose();
});

test('an empty saved section clears its owned presentation instead of retaining the preceding cut', async () => {
  const f = fixture({ run: async () => ({ model: null, status: 'empty' }) });
  await f.layer.refreshDerived();
  assert.deepEqual(
    f.layer.netViewer.calls.find((c) => c[0] === 'section'),
    ['section', null, f.state.model, { mode: 'section' }]
  );
  assert.equal(f.layer.netViewer.model, null);
  assert.ok(!f.layer.netViewer.calls.some((c) => c[0] === 'view'));
  f.layer.dispose();
});
