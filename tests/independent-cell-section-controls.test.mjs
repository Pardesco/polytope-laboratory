import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { Viewer } from '../ui/viewer.js';
import {
  DensitySectionControls,
  DensitySectionWorkflow,
  densitySectionParameters,
  densitySectionDisplay,
} from '../ui/density-section-controls.mjs';
import { createAnimatedTourLayerFactory } from '../ui/animated-tour-layer.mjs';
import { defaultDocumentView } from '../ui/default-look.mjs';
const { EnginePool } = createRequire(import.meta.url)('../desktop/engine-pool.cjs');
const native = JSON.parse(
  execFileSync(
    'python',
    [
      '-B',
      '-c',
      "import json,runpy; h=runpy.run_path('tests/test_independent_cell_sections.py'); print(json.dumps(h['native_fixture']()))",
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024 }
  )
);
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture() {
  const f = structuredClone(native),
    state = f.state,
    doc = f.document;
  doc.states[0] = state;
  const project = { active: 0, documents: [doc] },
    published = [],
    calls = [];
  const context = {
    getState: () => state,
    getDocument: () => doc,
    getProject: () => project,
    isExporting: () => false,
    run: async (op, params, model, label, options) => {
      calls.push({ op, params, model, label, options });
      return structuredClone(op === 'section' ? f.preview : f.history);
    },
    publishHistory: (result) => published.push(result),
  };
  return { ...f, context, published, calls };
}

test('independent native sheets render through the production Viewer and retain source-owned promotion', async () => {
  const f = fixture(),
    flow = new DensitySectionWorkflow(f.context),
    before = structuredClone(f.document),
    result = await flow.evaluate();
  assert.deepEqual(f.calls[0].params, f.params);
  assert.equal(result.status, 'independent-cell-section');
  const v = Object.create(Viewer.prototype);
  v.group = new THREE.Group();
  v.draw = () => {};
  v.stereographicWorkerFactory = () => null;
  v.perspectiveCamera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
  v.orthographicCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 1000);
  v.cameraProjection = 'orthographic';
  v.camera = v.orthographicCamera;
  v.controls = { target: new THREE.Vector3(), update() {} };
  v.bindControls = () => {};
  try {
    v.setModel(result.model);
    v.setDisplay({
      angles: Array(6).fill(0),
      projection: 'orthographic',
      faces: true,
      edges: true,
      vertices: false,
      ...densitySectionDisplay(result.model),
    });
    assert.equal(v.fillDiagnostics.length, 0);
    assert.ok(v.surfaceGeometry.attributes.position.count > 0);
    assert.equal(v.visibility.edges.filter(Boolean).length, result.model.metadata.densitySection.boundaryEdges.length);
    const history = await flow.promote(result);
    assert.deepEqual(history.states[1].model, result.model);
    assert.deepEqual(f.document, before);
    assert.equal(f.published.length, 1);
    assert.equal(f.calls[1].op, 'recipe-run');
    assert.deepEqual(f.calls[1].params.parameters, f.params);
  } finally {
    v.clear();
  }
});

test('orientation, fill, source edits, held replies and canceled work cannot promote an old cell section', async () => {
  for (const change of [
    (f) => (f.state.view.densitySection.cellOrientation = 'coherent'),
    (f) => (f.state.view.densitySection.rule = 'nonzero'),
    (f) => (f.state.notes = 'edited'),
    (f) => (f.state.model.metadata.coordinateUnits = 'mm'),
  ]) {
    const f = fixture(),
      flow = new DensitySectionWorkflow(f.context),
      result = await flow.evaluate();
    change(f);
    await assert.rejects(() => flow.promote(result), /changed|again/);
    assert.equal(f.published.length, 0);
  }
  const f = fixture();
  let release;
  f.context.run = () => new Promise((resolve) => (release = resolve));
  const flow = new DensitySectionWorkflow(f.context),
    pending = flow.evaluate();
  await tick();
  flow.cancelActive();
  release(f.preview);
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(f.published.length, 0);
});

function fakeDocument() {
  const doc = {
    nodes: {},
    getElementById(id) {
      return this.nodes[id];
    },
    createElement(tag) {
      const node = {
        tagName: tag.toUpperCase(),
        ownerDocument: this,
        style: {},
        children: [],
        value: '',
        disabled: false,
        hidden: false,
        append(...children) {
          this.children.push(...children);
        },
        after() {},
        replaceChildren(...children) {
          this.children = children;
        },
        setAttribute(k, v) {
          this[k] = v;
        },
        querySelector(id) {
          return this.nodes?.[id.slice(1)];
        },
        querySelectorAll() {
          return Object.values(this.nodes ?? {});
        },
      };
      Object.defineProperty(node, 'innerHTML', {
        set(html) {
          this.nodes = {};
          for (const m of html.matchAll(/<(input|select|button)[^>]*id="([^"]+)"[^>]*>/g)) {
            const n = doc.createElement(m[1]);
            n.id = m[2];
            n.value = /value="([^"]*)"/.exec(m[0])?.[1] ?? '';
            this.nodes[n.id] = n;
          }
        },
      });
      return node;
    },
  };
  for (const id of ['derived-mode', 'analysis', 'derived-status']) doc.nodes[id] = doc.createElement('div');
  return doc;
}

test('common Winding cells choice and NumericEntry settings preserve the independent orientation policy', async () => {
  const f = fixture(),
    document = fakeDocument();
  let dirty = 0,
    refresh = 0;
  const controls = new DensitySectionControls({
    ...f.context,
    document,
    guard: (fn) => fn,
    markDirty: () => dirty++,
    refreshDerived: async () => refresh++,
    evaluateMany: async (parts) => parts.map((p) => (p === '1 + 1' ? 2 : Number(p))),
  });
  assert.equal(controls.select.value, 'winding-cells');
  assert.match(controls.interpretation.textContent, /each closed 4D source cell/);
  controls.node('section-density-rule').value = 'threshold';
  controls.node('section-density-threshold').value = '1 + 1';
  await controls.apply();
  assert.equal(densitySectionParameters(f.state.view).cell_orientation, 'independent');
  assert.equal(f.state.view.densitySection.threshold, 2);
  controls.select.value = 'density';
  controls.setMode();
  assert.equal(densitySectionParameters(f.state.view).cell_orientation, undefined);
  controls.select.value = 'winding-cells';
  controls.setMode();
  assert.equal(densitySectionParameters(f.state.view).cell_orientation, 'independent');
  assert.equal(dirty, 3);
  assert.equal(refresh, 3);
  assert.notEqual(controls.panel.open, true);
  controls.context.isExporting = () => true;
  await assert.rejects(() => controls.apply(), /export/);
  controls.context.isExporting = () => false;
  f.state.model.dimension = 3;
  assert.throws(() => controls.setMode(), /requires a 4D source/);
});

test('saved independent cell sections reuse tour routing and reject settings changed during a held native reply', async () => {
  const f = fixture(),
    calls = [];
  let held = false,
    release;
  class MockViewer {
    constructor() {
      this.renderer = { dispose() {}, forceContextLoss() {} };
    }
    resize() {}
    setModel(m) {
      this.model = m;
    }
    setSectionModel(m) {
      this.model = m;
    }
    setDisplay(v) {
      this.view = v;
    }
    draw() {}
    fit() {}
    clear() {}
    async prepareCapture() {
      return {};
    }
  }
  const factory = createAnimatedTourLayerFactory({
    host: { append() {} },
    ViewerClass: MockViewer,
    createElement: () => ({ dataset: {}, style: {}, append() {}, remove() {} }),
    run: async (op, params) => {
      calls.push({ op, params });
      return held ? new Promise((resolve) => (release = resolve)) : structuredClone(f.preview);
    },
  });
  const layer = factory({ slot: 0, getState: () => f.state, width: 400, height: 300 });
  try {
    await layer.refreshDerived();
    assert.deepEqual(calls[0], { op: 'section', params: f.params });
    assert.equal(layer.netViewer.view.fillRule, 'nonzero');
    held = true;
    const pending = layer.refreshDerived();
    await tick();
    f.state.view.densitySection.cellOrientation = 'coherent';
    release(f.preview);
    await assert.rejects(pending, /cancelled/);
  } finally {
    layer.dispose();
  }
});

test(
  'expert-off mounted app evaluates winding cells, applies an expression, promotes and reopens the native history',
  { timeout: 120000 },
  async () => {
    const pool = new EnginePool({
      spawnWorker: () =>
        spawn('python', ['-B', 'engine/server.py'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }),
    });
    const queue = [],
      calls = [];
    let next = 0,
      active = 0,
      closed = false;
    const pump = () => {
      while (!closed && active < 3 && queue.length) {
        const job = queue.shift();
        active++;
        pool
          .run(job.request, job.id)
          .then(job.resolve, job.reject)
          .finally(() => {
            active--;
            pump();
          });
      }
    };
    const compute = (request) =>
      new Promise((resolve, reject) => {
        calls.push(request);
        queue.push({ request, id: request.id ?? 'winding-test-' + ++next, resolve, reject });
        pump();
      });
    const server = await createServer({
      configFile: false,
      root: 'ui',
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { host: '127.0.0.1', port: 0 },
    });
    let browser;
    try {
      await server.listen();
      browser = await chromium.launch({
        headless: true,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      });
      const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, reducedMotion: 'reduce' }),
        errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.exposeFunction('nativeCancel', (id) => pool.cancel(id));
      await page.addInitScript(() => {
        localStorage.setItem('polytope-welcome-v1', 'dismissed');
        localStorage.setItem('polytope.expert-tools.v1', 'false');
        window.polytope = {
          engine: (r, id) => window.nativeEngine({ ...r, id }),
          cancel: (id) => window.nativeCancel(id),
          setDirty: async () => {},
          setWorkspaceAvailability: async () => {},
          onAction() {},
          libraries: async () => ({ libraries: [], errors: [] }),
          recoveryInfo: async () => null,
          startupInfo: async () => ({ hidden: false }),
          autosave: async () => {},
          recentFiles: async () => ({ files: [] }),
          discoveryMenu: async () => {},
          open: async () => structuredClone(window.openResult),
          confirmProjectOpen: async () => true,
          save: async (project) => {
            window.saved = await window.nativeEngine({ op: 'validate-project', params: { project } });
            return { path: 'winding-cells.polyproj' };
          },
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      await page.waitForFunction(() => document.getElementById('model-name')?.textContent === 'Tesseract');
      await page.locator('#toggle-inspector').click();
      const project = {
        format: 'polytope-laboratory',
        version: 1,
        active: 0,
        documents: [
          {
            id: 'star-source',
            cursor: 0,
            states: [
              {
                model: native.state.model,
                view: {
                  ...defaultDocumentView(4),
                  derivedMode: 'face',
                  sectionNormal: [0, 0, 1, 0],
                  sectionOffset: 0.137,
                },
                notes: native.state.notes,
              },
            ],
          },
        ],
      };
      await page.evaluate((project) => (window.openResult = { project, path: 'literal-star-cells.polyproj' }), project);
      await page.locator('#open').click();
      await page.waitForFunction(
        (name) => document.getElementById('model-name').textContent === name,
        native.state.model.name
      );
      await page.locator('#view-options-button').click();
      await page.selectOption('#viewport-layout', 'split');
      await page.keyboard.press('Escape');
      await page.selectOption('#derived-mode', 'section');
      await page.locator('#section-normal').fill('0, 0, 1, 0');
      await page.locator('#section-depth').fill('0.137');
      await page.locator('#apply-section').click();
      await page.waitForFunction(() =>
        document.getElementById('derived-status').textContent.startsWith('Surface intersection')
      );
      await page.selectOption('#section-density-mode', 'winding-cells');
      await page.waitForFunction(
        () =>
          !document.getElementById('promote').disabled &&
          document.getElementById('section-density-legend').textContent.includes('cell 0')
      );
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      assert.equal(await page.locator('#section-density-mode').evaluate((n) => !!n.closest('[data-expert]')), false);
      assert.match(await page.locator('#section-density-interpretation').innerText(), /no global 4D interior/);
      await page.locator('#density-section-settings summary').click();
      await page.selectOption('#section-density-rule', 'threshold');
      await page.locator('#section-density-threshold').fill('1 + 1');
      await page.locator('#apply-density-section').click();
      await page.waitForFunction(
        () =>
          !document.getElementById('promote').disabled &&
          document.getElementById('section-density-threshold').value === '2'
      );
      assert.equal(await page.inputValue('#section-density-mode'), 'winding-cells');
      assert.ok(
        calls.some(
          (r) => r.op === 'section' && r.params.cell_orientation === 'independent' && r.params.density_threshold === 2
        )
      );
      await page.locator('#promote').click();
      await page.waitForFunction(() =>
        document.getElementById('model-name').textContent.startsWith('Independent winding cell section')
      );
      await page.locator('#save').click();
      await page.waitForFunction(() => !!window.saved);
      const saved = await page.evaluate(() => window.saved),
        adopted = saved.documents[saved.active],
        model = adopted.states[adopted.cursor].model;
      assert.equal(adopted.operationHistory.nodes.at(-1).params.cell_orientation, 'independent');
      assert.equal(model.numeric.certified, false);
      assert.equal(adopted.states[adopted.cursor].notes, native.state.notes);
      assert.equal(model.metadata.independentCellSection.globalInteriorAsserted, false);
      await page.locator('#undo').click();
      await page.waitForFunction(
        (name) => document.getElementById('model-name').textContent === name,
        native.state.model.name
      );
      await page.locator('#redo').click();
      await page.waitForFunction((name) => document.getElementById('model-name').textContent === name, model.name);
      await page.evaluate(() => {
        window.openResult = { project: window.saved, path: 'winding-cells.polyproj' };
        window.saved = null;
      });
      await page.locator('#open').click();
      await page.waitForFunction((name) => document.getElementById('model-name').textContent === name, model.name);
      await page.locator('#save').click();
      await page.waitForFunction(() => !!window.saved);
      assert.deepEqual(
        await page.evaluate(() => {
          const p = window.saved,
            d = p.documents[p.active];
          return d.states[d.cursor].model;
        }),
        model
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await server.close();
      closed = true;
      for (const job of queue.splice(0)) job.reject(Error('Cell-section test closed.'));
      pool.dispose();
    }
  }
);
