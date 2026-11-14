import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const { EnginePool } = createRequire(import.meta.url)('../desktop/engine-pool.cjs');

test('real SVG hit targets toggle by pointer and Space and publish accessible state', { timeout: 60000 }, async () => {
  const server = await createServer({
    configFile: false,
    root: 'ui',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port: 0 },
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/coxeter-builder.mjs');
    await page.evaluate(async () => {
      document.body.innerHTML =
        '<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/coxeter-builder.css">';
      const { CoxeterBuilder } = await import('/coxeter-builder.mjs');
      const source = { model: {} };
      window.previewRequests = [];
      window.builder = new CoxeterBuilder({
        getState: () => source,
        isExporting: () => false,
        guard: (fn) => fn,
        debounce: 0,
        clearPreview() {},
        preview() {},
        run: async (_op, params) => {
          window.previewRequests.push(params);
          return {
            name: params.rings.join(''),
            dimension: params.rings.length,
            vertices: Array(params.rings.filter(Boolean).length * 8),
            edges: [],
            faces: [],
            cells: [],
            metadata: { shapeBuilder: { edgeRelativeSpread: 0 } },
          };
        },
        commit: async () => {},
      });
      window.builder.show();
    });
    const node = page.locator('#coxeter-builder-node-1');
    await node.locator('.node-hit').click({ position: { x: 3, y: 3 } });
    assert.equal(await node.getAttribute('aria-pressed'), 'true');
    await page.waitForFunction(() => document.querySelector('#coxeter-builder-name').textContent === '110');
    await node.press('Space');
    assert.equal(await node.getAttribute('aria-pressed'), 'false');
    await page.waitForFunction(() => document.querySelector('#coxeter-builder-name').textContent === '100');
    assert.equal(await node.getAttribute('aria-label'), 'Node 2, not ringed');
    assert.equal(await page.locator('#coxeter-builder-counts').textContent(), '8 vertices · 0 edges · 0 faces');
    assert.equal(await page.locator('#coxeter-builder-open').textContent(), 'Replace current model');
    assert.equal(await page.locator('.coxeter-result').evaluate((node) => getComputedStyle(node).display), 'block');
    assert.equal(await page.locator('#coxeter-builder-family-B3 b').textContent(), 'Octahedral');
    assert.deepEqual(await page.locator('.coxeter-family-group > strong').allTextContents(), [
      '3D shapes',
      '4D shapes',
    ]);
    await page.locator('#coxeter-builder-help').click();
    assert.equal(await page.locator('#coxeter-builder-help').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#coxeter-builder-ring-help').isVisible(), true);
    await page.locator('#coxeter-builder-help').click();
    const requests = await page.evaluate(() => window.previewRequests.length);
    await page.locator('#coxeter-builder-node-0').click();
    assert.equal(await page.locator('#coxeter-builder-node-0').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#coxeter-builder-name').textContent(), 'No rings selected');
    assert.match(await page.locator('#coxeter-builder-status').textContent(), /Ring at least one/);
    assert.equal(await page.locator('#coxeter-builder-open').isDisabled(), true);
    assert.equal(await page.evaluate(() => window.previewRequests.length), requests);
    await page.locator('#coxeter-builder-reset').click();
    await page.waitForFunction(() => document.querySelector('#coxeter-builder-name').textContent === '100');
    assert.equal(await page.locator('#coxeter-builder-node-0').getAttribute('aria-label'), 'Node 1, ringed');
    for (const size of [
      { width: 1280, height: 800 },
      { width: 1600, height: 1000 },
      { width: 1024, height: 600 },
    ]) {
      await page.setViewportSize(size);
      for (const family of ['A3', 'B3', 'H3', 'A4', 'B4', 'D4', 'F4', 'H4']) {
        await page.locator('#coxeter-builder-family-' + family).click();
        await page.locator('#coxeter-builder-diagram').scrollIntoViewIfNeeded();
        const targets = await page.locator('#coxeter-builder-diagram .node-hit').evaluateAll((nodes) =>
          nodes.map((node) => {
            const r = node.getBoundingClientRect();
            return [r.width, r.height];
          })
        );
        assert.equal(targets.length, Number(family.at(-1)));
        for (const [width, height] of targets)
          assert.ok(width >= 44 && height >= 44, `${family}: ${width} × ${height}`);
      }
      const before = await page.locator('.coxeter-result').boundingBox();
      await page.locator('#coxeter-builder-families').evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      await page.locator('.coxeter-ring-settings').evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      assert.deepEqual(await page.locator('.coxeter-result').boundingBox(), before);
      const action = await page.locator('#coxeter-builder-open').boundingBox();
      assert.ok(action.y >= 0 && action.y + action.height <= size.height);
    }
    await page.locator('#coxeter-builder-node-0').press('Space');
    const focus = await page
      .locator('#coxeter-builder-node-0 .node-focus')
      .evaluate((node) => getComputedStyle(node).stroke);
    assert.notEqual(focus, 'rgba(0, 0, 0, 0)');
    assert.equal(
      await page.locator('#coxeter-builder-node-0').evaluate((node) => getComputedStyle(node).outlineStyle),
      'none'
    );
    assert.equal(await page.locator('#coxeter-builder-node-0 .node-ring').count(), 0);
    await page.evaluate(() => window.builder.close());
  } finally {
    await browser?.close();
    await server.close();
  }
});

test(
  'native replacement keeps preview orientation, pixel scale and saved history pose',
  { timeout: 120000 },
  async () => {
    const pool = new EnginePool({
        spawnWorker: () =>
          spawn('python', ['-B', 'engine/server.py'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }),
      }),
      server = await createServer({
        configFile: false,
        root: 'ui',
        optimizeDeps: { noDiscovery: true, include: [] },
        server: { host: '127.0.0.1', port: 0 },
      });
    let browser,
      id = 0;
    const errors = [];
    try {
      await server.listen();
      browser = await chromium.launch({
        headless: true,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      });
      const page = await browser.newPage({ viewport: { width: 1584, height: 1000 }, reducedMotion: 'reduce' });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.exposeFunction('nativeEngine', (request, job) => pool.run(request, job || 'builder-polish-' + ++id));
      await page.exposeFunction('nativeCancel', (job) => pool.cancel(job));
      await page.addInitScript(() => {
        localStorage.setItem('polytope-welcome-v1', 'dismissed');
        window.polytope = {
          engine: (request, job) => window.nativeEngine(request, job),
          cancel: (job) => window.nativeCancel(job),
          setDirty: async () => {},
          setWorkspaceAvailability: async () => {},
          onAction() {},
          libraries: async () => ({ libraries: [], errors: [] }),
          recoveryInfo: async () => null,
          startupInfo: async () => ({ hidden: false }),
          autosave: async () => {},
          recentFiles: async () => ({ files: [] }),
          discoveryMenu: async () => {},
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
      await page.evaluate(async () => {
        const { Viewer } = await import('/viewer.js'),
          fit = Viewer.prototype.fit;
        window.testViewers = {};
        Viewer.prototype.fit = function (...args) {
          window.testViewers[this.container.id] = this;
          return fit.apply(this, args);
        };
      });
      await page.locator('#library-build-symmetry').click();
      await page.waitForFunction(() => !document.getElementById('coxeter-builder-open').disabled);
      assert.equal(await page.locator('#model-name').innerText(), 'Symmetry preview');
      assert.match(await page.locator('#document-tabs .active').innerText(), /Tesseract/);
      assert.equal(await page.locator('#coxeter-builder-enter').innerText(), 'Enter: Replace current model');
      await page.locator('#coxeter-builder-close').click();
      assert.equal(await page.locator('#model-name').innerText(), 'Tesseract');
      await page.locator('#library-build-symmetry').click();
      await page.locator('#coxeter-builder-family-B3').click();
      await page.locator('#coxeter-builder-node-1').click();
      await page.waitForFunction(
        () =>
          document.getElementById('coxeter-builder-name').textContent === 'Truncated cube' &&
          !document.getElementById('coxeter-builder-open').disabled
      );
      const before = await page.evaluate(async () => {
        window.modelPixels = (viewer) => {
          viewer.camera.updateMatrixWorld();
          const rect = viewer.container.getBoundingClientRect(),
            points = viewer.projected.map((p) =>
              viewer.camera.position.clone().fromArray(p.point).project(viewer.camera)
            );
          return ['x', 'y'].map(
            (axis, i) =>
              ((Math.max(...points.map((p) => p[axis])) - Math.min(...points.map((p) => p[axis]))) *
                [rect.width, rect.height][i]) /
              2
          );
        };
        const viewer = window.testViewers['coxeter-builder-preview-canvas'];
        viewer.controls.enableDamping = false;
        viewer.camera.position.set(3, 1, 5);
        viewer.controls.update();
        viewer.fit();
        window.previewCamera = viewer.cameraState();
        return { camera: viewer.cameraState(), pixels: window.modelPixels(viewer) };
      });
      await page.locator('#coxeter-builder-open').click();
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Truncated cube');
      const after = await page.evaluate(() => {
        const viewer = window.testViewers['base-canvas'];
        return { camera: viewer.cameraState(), pixels: window.modelPixels(viewer) };
      });
      for (let i = 0; i < 2; i++)
        assert.ok(Math.abs(after.pixels[i] / before.pixels[i] - 1) < 0.01, JSON.stringify({ before, after }));
      const direction = (camera) => {
        const d = camera.position.map((x, i) => x - camera.target[i]);
        return d.map((x) => x / Math.hypot(...d));
      };
      direction(before.camera).forEach((x, i) => assert.ok(Math.abs(x - direction(after.camera)[i]) < 1e-10));
      assert.equal(await page.locator('#status').innerText(), 'Shape replaced · document appearance settings applied.');
      await page.locator('#undo').click();
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
      await page.locator('#redo').click();
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Truncated cube');
      const restored = await page.evaluate(() => window.testViewers['base-canvas'].cameraState());
      direction(restored).forEach((x, i) => assert.ok(Math.abs(x - direction(after.camera)[i]) < 1e-10));
      assert.ok(Math.abs(restored.orthographicHalfHeight - after.camera.orthographicHalfHeight) < 1e-10);
      await page.evaluate(() =>
        document.dispatchEvent(new CustomEvent('polytope:workflow-status', { detail: 'Corner cut ready' }))
      );
      await page.locator('#toggle-inspector').click();
      await page.locator('[data-panel="construct"]').click();
      assert.equal(await page.locator('#status').innerText(), 'Ready');
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await server.close();
      pool.dispose();
    }
  }
);
