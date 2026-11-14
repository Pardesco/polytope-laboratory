import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const { EnginePool } = createRequire(import.meta.url)('../desktop/engine-pool.cjs');

test(
  'expert-off cross-section card, axis presets, live position, command entry and promotion work with native sections',
  { timeout: 120000 },
  async () => {
    const pool = new EnginePool({
      spawnWorker: () =>
        spawn('python', ['-B', 'engine/server.py'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }),
    });
    const calls = [],
      errors = [];
    let next = 0;
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
      const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, reducedMotion: 'reduce' });
      page.on('pageerror', (e) => errors.push(e.message));
      await page.exposeFunction('nativeEngine', (request, id) => {
        calls.push(request);
        return pool.run(request, id || 'slice-test-' + ++next);
      });
      await page.exposeFunction('nativeCancel', (id) => pool.cancel(id));
      await page.addInitScript(() => {
        localStorage.setItem('polytope-welcome-v1', 'dismissed');
        localStorage.setItem('polytope.expert-tools.v1', 'false');
        window.polytope = {
          engine: (r, id) => window.nativeEngine(r, id),
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
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
      await page.locator('#toggle-inspector').click();
      await page.locator('[data-panel="construct"]').click();
      await page.evaluate(async () => {
        const { Viewer } = await import('/viewer.js'),
          fit = Viewer.prototype.fit;
        window.sectionFits = [];
        Viewer.prototype.fit = function (...args) {
          window.sectionFits.push(this.container.id);
          return fit.apply(this, args);
        };
      });
      await page.locator('#open-cross-section').click();
      const ready = () =>
        page.waitForFunction(
          () =>
            document.getElementById('slice-feedback').textContent.startsWith('Section updated · ') &&
            !document.getElementById('promote').disabled
        );
      await ready();
      assert.equal(await page.locator('#slice-feedback').innerText(), 'Section updated · W axis at 0');
      const framing = await page.evaluate(() => {
        const canvas = document.getElementById('base-canvas').getBoundingClientRect(),
          dock = document.getElementById('direct-4d-gizmo').getBoundingClientRect();
        return { canvasBottom: canvas.bottom, dockTop: dock.top, fits: window.sectionFits };
      });
      assert.ok(framing.canvasBottom <= framing.dockTop, JSON.stringify(framing));
      assert.ok(
        framing.fits.includes('base-canvas') && framing.fits.includes('derived-canvas'),
        JSON.stringify(framing)
      );
      await page.locator('#viewport-layout').evaluate((node) => {
        node.value = 'single';
        node.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForFunction(() => document.getElementById('views').dataset.layout === 'single');
      const previousFits = await page.evaluate(() => window.sectionFits.length);
      await page.locator('#viewport-layout').evaluate((node) => {
        node.value = 'split';
        node.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForFunction((count) => window.sectionFits.length >= count + 2, previousFits);
      assert.equal(await page.locator('#section-pane-title').innerText(), 'Cross-section · 3D');
      assert.equal(await page.locator('.viewport.primary .view-label span').innerText(), 'Original · Tesseract');
      assert.equal(await page.locator('.viewport.primary .view-label span').isVisible(), true);
      assert.equal(await page.inputValue('#slice-direction'), 'W');
      assert.equal(await page.locator('#advanced-slice-settings').evaluate((n) => n.open), false);
      assert.equal(await page.locator('#section-normal').isVisible(), false);
      assert.match(
        await page.locator('#slice-instructions').innerText(),
        /Rotating either displayed shape does not change/
      );
      assert.equal(await page.locator('#promote').innerText(), 'Open section in new tab');
      await mkdir('artifacts/sections-ux', { recursive: true });
      await page.screenshot({ path: 'artifacts/sections-ux/cross-section-4d.png' });
      const start = calls.length;
      await page.locator('#section-offset').evaluate((node) => {
        for (const value of ['.1', '.2', '.3']) {
          node.value = value;
          node.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      assert.equal(await page.locator('#slice-feedback').innerText(), 'Updating…');
      await ready();
      assert.equal(calls.slice(start).filter((r) => r.op === 'section').length, 1);
      assert.ok(Math.abs(calls.filter((r) => r.op === 'section').at(-1).params.offset - 0.3) < 0.01);
      await page.selectOption('#slice-direction', 'X');
      await ready();
      assert.deepEqual(calls.filter((r) => r.op === 'section').at(-1).params.normal, [1, 0, 0, 0]);
      await page.selectOption('#slice-direction', 'custom');
      assert.equal(await page.locator('#section-normal').isVisible(), true);
      await page.locator('#section-normal').fill('0, 0, 0, 1');
      await page.locator('#section-depth').fill('1/4');
      await page.locator('#apply-section').click();
      await ready();
      assert.equal(calls.filter((r) => r.op === 'section').at(-1).params.offset, 0.25);
      assert.equal(await page.locator('#slice-feedback').innerText(), 'Section updated · W axis at 0.25');
      await page.locator('#apply-section').click();
      await ready();
      await page.keyboard.press('Control+k');
      await page.locator('#command-query').fill('slice');
      await page.locator('#command-results [role="option"]').filter({ hasText: 'Cross-section' }).first().click();
      await ready();
      assert.equal(await page.inputValue('#slice-direction'), 'W');
      assert.equal(await page.inputValue('#section-depth'), '0');
      const tabs = await page.locator('#document-tabs button').count();
      await page.locator('#promote').click();
      await page.waitForFunction(() => document.getElementById('model-name').textContent !== 'Tesseract');
      assert.equal(await page.locator('#document-tabs button').count(), tabs + 1);
      await page.locator('#open-cross-section').click();
      await ready();
      assert.equal(await page.locator('#section-pane-title').innerText(), 'Cross-section · 2D');
      assert.deepEqual(
        await page.locator('#slice-direction option').evaluateAll((nodes) => nodes.map((n) => n.value)),
        ['X', 'Y', 'Z', 'custom']
      );
      assert.equal(await page.inputValue('#slice-direction'), 'Z');
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await server.close();
      pool.dispose();
    }
  }
);
