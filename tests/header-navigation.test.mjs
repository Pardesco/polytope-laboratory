import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

test(
  'mounted header stays on one line and keeps palette, Help, panel toggles, fullscreen and settings working',
  { timeout: 120000 },
  async () => {
    const engine = spawn('python', ['engine/server.py'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }),
      pending = new Map();
    let next = 0,
      stderr = '';
    engine.stderr.on('data', (data) => (stderr += data));
    engine.on('error', (error) => {
      for (const job of pending.values()) job.reject(error);
      pending.clear();
    });
    const lines = createInterface({ input: engine.stdout });
    lines.on('line', (line) => {
      const result = JSON.parse(line),
        job = pending.get(result.id);
      if (!job) return;
      pending.delete(result.id);
      result.ok ? job.resolve(result.result) : job.reject(Error(result.error));
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
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
        errors = [];
      page.setDefaultTimeout(20000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript(() => {
        window.nativeFullscreen = false;
        window.polytope = {
          engine: (r) => window.nativeEngine(r),
          cancel: async () => {},
          setDirty: async () => {},
          setWorkspaceAvailability: async () => {},
          onAction: (fn) => (window.menuAction = fn),
          libraries: async () => ({ libraries: [], errors: [] }),
          recoveryInfo: async () => null,
          startupInfo: async () => ({ hidden: true }),
          autosave: async () => {},
          recentFiles: async () => [],
          onFullscreenChanged: (fn) => (window.fullscreenChanged = fn),
          fullscreen: async () => {
            window.nativeFullscreen = !window.nativeFullscreen;
            window.fullscreenChanged(window.nativeFullscreen);
          },
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      await page.waitForFunction(
        () =>
          document.getElementById('model-name')?.textContent === 'Tesseract' &&
          !document.getElementById('presentation').disabled
      );
      if ((await page.locator('#auto-rotate').getAttribute('aria-pressed')) === 'true')
        await page.locator('#auto-rotate').click();
      assert.equal(await page.locator('#welcome-panel').isVisible(), false);
      assert.equal(await page.getByRole('img', { name: 'Polytope Laboratory', exact: true }).count(), 1);
      assert.equal(await page.locator('.chrome-brand-name').count(), 0);
      assert.doesNotMatch(await page.locator('.command-bar').innerText(), /Polytope\s+Laboratory/i);
      assert.equal(await page.locator('.chrome-brand').getAttribute('title'), 'Polytope Laboratory');
      assert.equal(await page.locator('#help').innerText(), 'Help');
      assert.equal(await page.locator('#presentation-settings > summary').innerText(), 'Presentation settings');
      await mkdir('artifacts/header-navigation', { recursive: true });
      for (const width of [1600, 1500, 1440, 1360, 1280, 1024]) {
        await page.setViewportSize({ width, height: 1000 });
        const metrics = await page.locator('.command-bar').evaluate((header) => {
          const rect = header.getBoundingClientRect();
          return {
            width: header.clientWidth,
            scroll: header.scrollWidth,
            controls: [...header.querySelectorAll('button,summary')]
              .filter((node) => node.checkVisibility() && node.getBoundingClientRect().width > 0)
              .map((node) => {
                const r = node.getBoundingClientRect();
                return {
                  id: node.id,
                  left: r.left,
                  right: r.right,
                  top: r.top,
                  bottom: r.bottom,
                  height: r.height,
                  center: r.top + r.height / 2,
                  visible: r.left >= rect.left && r.right <= rect.right,
                };
              }),
          };
        });
        assert.ok(metrics.scroll <= metrics.width + 1, JSON.stringify({ width, metrics }));
        for (const control of metrics.controls) {
          assert.ok(control.visible, JSON.stringify({ width, control }));
          assert.ok(control.height >= 32, control.id);
        }
        assert.ok(
          Math.max(...metrics.controls.map((n) => n.center)) - Math.min(...metrics.controls.map((n) => n.center)) < 1,
          JSON.stringify({ width, metrics })
        );
        if (width === 1600 || width === 1280) {
          await page.screenshot({ path: `artifacts/header-navigation/after-${width}.png` });
          await page.locator('#toggle-inspector').click();
          await page.screenshot({ path: `artifacts/header-navigation/after-${width}-inspector.png` });
          await page.locator('#toggle-inspector').click();
        }
      }
      await page.setViewportSize({ width: 1280, height: 900 });
      assert.equal(await page.locator('.chrome-brand-name').count(), 0);
      assert.doesNotMatch(await page.locator('.command-bar').innerText(), /Polytope\s+Laboratory/i);
      assert.equal(
        await page.locator('#fullscreen .chrome-button-label').evaluate((node) => getComputedStyle(node).clipPath),
        'inset(50%)'
      );
      await page.locator('#command-search').click();
      await page.waitForFunction(() => document.getElementById('command-palette').open);
      await page.locator('#command-query').fill('tesseract');
      assert.ok(await page.locator('#command-results [role=option]').count());
      await page.locator('#command-query').fill('');
      await page.keyboard.press('Escape');
      await page.waitForFunction(
        () =>
          !document.getElementById('command-palette').open &&
          document.activeElement === document.getElementById('command-search')
      );
      await page.keyboard.press('Control+k');
      assert.equal(await page.locator('#command-palette').evaluate((node) => node.open), true);
      await page.keyboard.press('Escape');
      await page.locator('#help').click();
      assert.equal(await page.locator('#help-dialog').evaluate((node) => node.open), true);
      await page.keyboard.press('Escape');
      for (const [id, cls] of [
        ['toggle-library', 'library-hidden'],
        ['toggle-inspector', 'inspector-hidden'],
      ]) {
        const before = await page.locator('#' + id).getAttribute('aria-pressed');
        await page.locator('#' + id).click();
        assert.equal(await page.locator('#' + id).getAttribute('aria-pressed'), String(before !== 'true'));
        assert.equal(
          await page.locator('body').evaluate((node, cls) => node.classList.contains(cls), cls),
          before === 'true'
        );
        await page.locator('#' + id).click();
      }
      await page.locator('#fullscreen').click();
      assert.equal(await page.locator('#fullscreen').getAttribute('aria-pressed'), 'true');
      await page.locator('#fullscreen').click();
      assert.equal(await page.locator('#fullscreen').getAttribute('aria-pressed'), 'false');
      await page.locator('#presentation-settings > summary').click();
      assert.equal(await page.locator('#presentation-source').isVisible(), true);
      assert.equal(await page.locator('#presentation-start').isVisible(), true);
      await page.keyboard.press('Escape');
      await page.locator('#app-options-button').focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#expert-tools').evaluate((node) => node === document.activeElement), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#app-options-button').evaluate((node) => node === document.activeElement), true);
      assert.equal(
        await page.locator('#app-options-button').evaluate((node) => getComputedStyle(node).outlineWidth),
        '2px'
      );
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
