import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const { reveal } = createRequire(import.meta.url)('../scripts/smoke-helpers.cjs');

test(
  'v4 controls create all tracks without Expert mode and record the actual current view',
  { timeout: 90000 },
  async () => {
    const engine = spawn('python', ['-u', 'engine/server.py'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }),
      pending = new Map();
    let next = 0,
      stderr = '';
    engine.stderr.on('data', (data) => (stderr += data));
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
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' }),
        errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript(() => {
        localStorage.setItem('polytope-welcome-v1', 'dismissed');
        window.savedProjects = [];
        window.polytope = {
          engine: (r) => window.nativeEngine(r),
          cancel: async () => {},
          setDirty: async () => {},
          setWorkspaceAvailability: async () => {},
          onAction() {},
          libraries: async () => ({ libraries: [], errors: [] }),
          recoveryInfo: async () => null,
          startupInfo: async () => ({ hidden: false }),
          autosave: async () => {},
          recentFiles: async () => ({ files: [] }),
          discoveryMenu: async () => {},
          save: async (p) => {
            window.savedProjects.push(structuredClone(p));
            return { path: 'v4.polyproj' };
          },
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      await page.waitForFunction(
        () =>
          document.getElementById('model-name')?.textContent === 'Tesseract' && document.getElementById('cancel').hidden
      );
      assert.deepEqual(await page.locator('.toast-details').allTextContents(), [], 'startup errors');
      await page.evaluate(async () => {
        const { FriendlyMessages } = await import('/friendly-messages.mjs'),
          error = FriendlyMessages.prototype.error;
        window.actionErrors = [];
        FriendlyMessages.prototype.error = function (e) {
          window.actionErrors.push(e.stack ?? e.message);
          return error.call(this, e);
        };
      });
      const ready = () =>
        page.waitForFunction(
          () => !document.getElementById('animation-add-camera').disabled && document.getElementById('cancel').hidden
        );
      const save = async () => {
        const count = await page.evaluate(() => window.savedProjects.length);
        await page.locator('#save').click();
        await page.waitForFunction((n) => window.savedProjects.length > n, count);
        return page.evaluate(() => {
          const p = window.savedProjects.at(-1),
            d = p.documents[p.active];
          return d.states[d.cursor];
        });
      };
      await reveal(page, '#animation-add-camera');
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      await page.locator('#animation-add-camera').click();
      await ready();
      let state = await save(),
        s = state.view.animation;
      assert.equal(s.version, 4);
      assert.equal(s.keyframes[1].camera.azimuth - s.keyframes[0].camera.azimuth, 360);
      assert.deepEqual(s.keyframes[0].angles, s.keyframes[1].angles);
      for (const key of ['projection', 'opacity', 'sectionNormal']) {
        await reveal(page, `#animation-add-${key}`);
        await page.locator(`#animation-add-${key}`).click();
        await ready();
      }
      state = await save();
      assert.deepEqual(Object.keys(state.view.animation.tracks), ['camera', 'projection', 'opacity', 'sectionNormal']);
      await reveal(page, '#timeline-exact-time');
      await page.locator('#timeline-exact-time').fill('4');
      await page.locator('#timeline-exact-time').press('Tab');
      await page.waitForFunction(() => Number(document.getElementById('animation-time').value) === 4);
      await ready();
      await reveal(page, '#viewport-layout');
      await page.locator('#viewport-layout').selectOption('split');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await reveal(page, '#section-normal');
      await page.locator('#section-normal').fill('0, 0, 1, 1');
      await page.locator('#apply-section').click();
      await ready();
      await reveal(page, '#animation-keyframe');
      await page.locator('#animation-keyframe').click();
      await ready();
      state = await save();
      const frame = state.view.animation.keyframes.find((f) => f.time === 4);
      assert.ok(frame);
      assert.ok(Math.abs(frame.sectionNormal[2] - Math.SQRT1_2) < 1e-12);
      assert.ok(Math.abs(frame.sectionNormal[3] - Math.SQRT1_2) < 1e-12);
      assert.equal(typeof frame.camera.azimuth, 'number');
      assert.deepEqual(await page.evaluate(() => window.actionErrors), []);
      await reveal(page, '#animation-add-camera');
      await page.locator('#animation-v4-options').scrollIntoViewIfNeeded();
      await mkdir('artifacts/animation-v4', { recursive: true });
      await page.screenshot({ path: 'artifacts/animation-v4/controls.png' });
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
