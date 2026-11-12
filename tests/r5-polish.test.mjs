import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { builderPreviewRect, CoxeterPreviewFrame } from '../ui/coxeter-builder.mjs';
import { buildCommandIndex, rankCommands } from '../ui/command-index.mjs';
import { bindings } from '../ui/shortcut-bindings.mjs';

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
test('builder framing selects an unobscured rectangle in canvas coordinates', () => {
  const canvas = rect(100, 100, 1000, 700);
  assert.deepEqual(builderPreviewRect(canvas, rect(800, 80, 424, 650)), { left: 0, top: 0, width: 684, height: 700 });
  assert.deepEqual(builderPreviewRect(canvas, rect(0, 80, 424, 650)), { left: 340, top: 0, width: 660, height: 700 });
  assert.deepEqual(builderPreviewRect(canvas, rect(100, 100, 1000, 200)), {
    left: 0,
    top: 216,
    width: 1000,
    height: 484,
  });
  for (const panel of [null, rect(1100, 100, 424, 700), rect(0, 0, 100, 100)])
    assert.deepEqual(builderPreviewRect(canvas, panel), { left: 0, top: 0, width: 1000, height: 700 });
});

test('preview resize is idempotent, refits changed bounds and resets only its own surface', () => {
  const previous = globalThis.ResizeObserver,
    observed = [],
    calls = [];
  globalThis.ResizeObserver = class {
    constructor(fn) {
      this.notify = fn;
    }
    observe(node) {
      observed.push(node);
    }
  };
  try {
    let bounds = rect(0, 0, 1000, 700);
    const surface = { style: {} },
      panel = { open: true, getBoundingClientRect: () => rect(700, 0, 300, 650) },
      host = {
        hidden: false,
        ownerDocument: { createElement: () => surface },
        prepend: (n) => assert.equal(n, surface),
        getBoundingClientRect: () => bounds,
      };
    const viewer = { model: {}, resize: () => calls.push('resize'), fit: () => calls.push('fit') },
      frame = new CoxeterPreviewFrame(
        host,
        () => panel,
        () => viewer
      );
    assert.deepEqual(observed, [host, panel]);
    frame.sync();
    assert.equal(surface.style.width, '684px');
    assert.deepEqual(calls, ['resize', 'fit']);
    frame.sync();
    assert.equal(calls.length, 2);
    bounds = rect(0, 0, 1200, 800);
    frame.observer.notify();
    assert.equal(calls.length, 4);
    host.hidden = true;
    frame.reset();
    assert.equal(surface.style.width, '');
    frame.sync();
    assert.equal(calls.length, 4);
    host.hidden = false;
    panel.open = false;
    frame.sync();
    assert.equal(surface.style.width, '1200px');
  } finally {
    globalThis.ResizeObserver = previous;
  }
});

test('Learn 4D uses the existing Help command registration and beginner search terms', () => {
  const index = buildCommandIndex({
    actions: [{ id: 'action:learn4d', label: bindings.learn4d.label, path: [bindings.learn4d.scope] }],
  });
  for (const query of ['Learn 4D', 'four dimensions', 'fourth dimension', 'beginner tutorial', 'lessons'])
    assert.equal(rankCommands(index, query)[0]?.id, 'action:learn4d');
  assert.equal(index[0].path, 'Help');
});

test(
  'mounted builder fits dense H4 clear of its panel; existing Help, search and export goals work without Expert mode',
  { timeout: 240000 },
  async () => {
    const engine = spawn('python', ['-u', 'engine/server.py'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
      }),
      pending = new Map();
    let next = 0,
      stderr = '';
    engine.stderr.on('data', (data) => (stderr += data));
    const lines = createInterface({ input: engine.stdout });
    lines.on('line', (line) => {
      const response = JSON.parse(line),
        job = pending.get(response.id);
      if (!job) return;
      pending.delete(response.id);
      response.ok ? job.resolve(response.result) : job.reject(Error(response.error));
    });
    const compute = (request) =>
      new Promise((resolve, reject) => {
        const id = ++next;
        pending.set(id, { resolve, reject });
        engine.stdin.write(JSON.stringify({ ...request, id }) + '\n');
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
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' }),
        errors = [];
      page.setDefaultTimeout(30000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript(() => {
        localStorage.setItem('polytope-welcome-v1', 'dismissed');
        window.polytope = {
          engine: (r) => window.nativeEngine(r),
          cancel: async () => {},
          setDirty: async () => {},
          setWorkspaceAvailability: async () => {},
          onAction: (fn) => (window.menuAction = fn),
          libraries: async () => ({ libraries: [], errors: [] }),
          recoveryInfo: async () => {
            window.startupReady = true;
            return null;
          },
          startupInfo: async () => ({ hidden: false }),
          autosave: async () => {},
          recentFiles: async () => ({ files: [] }),
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      await page.waitForFunction(
        () =>
          window.startupReady &&
          document.getElementById('model-name')?.textContent === 'Tesseract' &&
          document.querySelector('#element-types .panel-title') &&
          document.getElementById('cancel').hidden
      );
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      await page.evaluate(async () => {
        const { Viewer } = await import('/viewer.js'),
          { CoxeterBuilder } = await import('/coxeter-builder.mjs'),
          fit = Viewer.prototype.fit,
          draw = Viewer.prototype.draw,
          close = CoxeterBuilder.prototype.close;
        CoxeterBuilder.prototype.close = function (...args) {
          if (this.panel.open) window.builderCloseStack = new Error().stack;
          return close.apply(this, args);
        };
        Viewer.prototype.fit = function (...args) {
          const result = fit.apply(this, args);
          if (this.container.id === 'coxeter-builder-preview-canvas') window.builderViewer = this;
          return result;
        };
        Viewer.prototype.draw = function (...args) {
          if (this.container.id === 'base-canvas') window.baseCamera = this.cameraState();
          return draw.apply(this, args);
        };
      });
      await page.waitForFunction(() => window.baseCamera);
      const before = await page.evaluate(() => window.baseCamera);
      await page.evaluate(() => window.openCoxeterBuilder());
      await page
        .waitForFunction(() => !document.getElementById('coxeter-builder-open').disabled)
        .catch(async (error) => {
          throw Error(
            error.message +
              ' ' +
              JSON.stringify(
                await page.evaluate(() => ({
                  status: document.getElementById('coxeter-builder-status').textContent,
                  open: document.getElementById('coxeter-builder').open,
                  toast: document.getElementById('toast')?.textContent,
                  closed: window.builderCloseStack,
                }))
              ) +
              ' ' +
              JSON.stringify(errors)
          );
        });
      await page.locator('#coxeter-builder-family-H4').click();
      for (const i of [1, 2, 3]) await page.locator('#coxeter-builder-node-' + i).click();
      await page.waitForFunction(
        () =>
          !document.getElementById('coxeter-builder-open').disabled &&
          window.builderViewer?.model?.vertices.length === 14400,
        null,
        { timeout: 150000 }
      );
      await mkdir('artifacts/r5-polish', { recursive: true });
      for (const [width, height] of [
        [1600, 1000],
        [1280, 800],
        [1024, 768],
      ]) {
        await page.setViewportSize({ width, height });
        await page.waitForFunction(() => {
          const v = window.builderViewer,
            r = v.renderer.domElement.getBoundingClientRect(),
            p = document.getElementById('coxeter-builder').getBoundingClientRect();
          return (
            Math.abs(v.aspect - r.width / r.height) < 1e-9 &&
            (r.right <= p.left || r.left >= p.right || r.bottom <= p.top || r.top >= p.bottom)
          );
        });
        const metrics = await page.evaluate(() => {
          const v = window.builderViewer,
            r = v.renderer.domElement.getBoundingClientRect(),
            p = document.getElementById('coxeter-builder').getBoundingClientRect();
          v.camera.updateMatrixWorld(true);
          let max = 0;
          for (const point of v.observationCloud()) {
            const q = v.camera.position.clone().fromArray(point).project(v.camera);
            max = Math.max(max, Math.abs(q.x), Math.abs(q.y));
          }
          return {
            width: r.width,
            height: r.height,
            clear: r.right <= p.left || r.left >= p.right || r.bottom <= p.top || r.top >= p.bottom,
            max,
          };
        });
        assert.ok(metrics.clear && metrics.width > 0 && metrics.height > 0, JSON.stringify(metrics));
        assert.ok(metrics.max <= 1.001, JSON.stringify(metrics));
        await page.screenshot({ path: `artifacts/r5-polish/builder-H4-omni-${width}.png` });
      }
      await page.locator('#coxeter-builder-close').click();
      assert.equal(await page.locator('#coxeter-builder-preview').isVisible(), false);
      assert.equal(await page.locator('#coxeter-builder-preview-canvas').getAttribute('style'), '');
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.waitForFunction((expected) => {
        const actual = window.baseCamera;
        return (
          ['position', 'target', 'up'].every((key) =>
            actual[key].every((x, i) => Math.abs(x - expected[key][i]) < 1e-10)
          ) && Math.abs(actual.orthographicHalfHeight - expected.orthographicHalfHeight) < 1e-10
        );
      }, before);
      assert.equal(await page.locator('#model-name').innerText(), 'Tesseract');
      assert.equal(await page.locator('#history-list button').count(), 1);
      await page.evaluate(() => window.menuAction('learn4d'));
      await page.waitForFunction(() => document.getElementById('learn-4d-status').textContent.startsWith('Ready'));
      await page.locator('#learn-4d-close').click();
      await page.keyboard.press('Control+k');
      await page.locator('#command-query').fill('four dimensions tutorial');
      await page.locator('#command-results [role=option]').filter({ hasText: 'Learn 4D' }).first().click();
      await page.waitForFunction(() => document.getElementById('learn-4d-status').textContent.startsWith('Ready'));
      await page.locator('#learn-4d-close').click();
      await page.locator('#export').click();
      assert.equal(await page.locator('#export-goal-cards').isVisible(), true);
      await page.screenshot({ path: 'artifacts/r5-polish/export-goals.png' });
      for (const id of ['export-net', 'export-net-pdf', 'confirm-export']) {
        assert.equal(await page.locator('#' + id).isVisible(), false);
        assert.equal(await page.locator('#' + id).evaluate((n) => n.closest('details').id), 'export-all-formats');
      }
      await page.locator('#export-all-formats > summary').click();
      assert.equal(await page.locator('#export-net').isVisible(), true);
      assert.equal(await page.locator('#export-net-pdf').isVisible(), true);
      assert.equal(await page.locator('#confirm-export').isVisible(), true);
      await page.locator('#close-export').click();
      await page.locator('#export').click();
      assert.equal(await page.locator('#confirm-export').isVisible(), false);
      await page.locator('#close-export').click();
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      assert.deepEqual(errors, []);
      assert.equal(stderr, '');
    } finally {
      await browser?.close();
      await server.close();
      lines.close();
      engine.kill();
      for (const job of pending.values()) job.reject(Error('Test complete.'));
    }
  }
);
