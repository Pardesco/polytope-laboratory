import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
const { autoReveal } = createRequire(import.meta.url)('../scripts/smoke-helpers.cjs');

test(
  'expert reveal reaches named dual diagnostics, rechecks U75 and retains source history and project evidence',
  { timeout: 180000 },
  async () => {
    const engine = spawn('python', ['-B', '-u', 'engine/server.py'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      }),
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
      const r = JSON.parse(line),
        job = pending.get(r.id);
      if (!job) return;
      pending.delete(r.id);
      r.ok ? job.resolve(r.result) : job.reject(Error(r.error));
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
      autoReveal(page);
      page.on('pageerror', (e) => errors.push(e.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript(() => {
        window.saveCount = 0;
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
          save: async (project) => {
            window.saved = await window.nativeEngine({ op: 'validate-project', params: { project } });
            window.saveCount++;
            return { path: 'u75.polyproj' };
          },
          open: async () => ({ project: structuredClone(window.saved), path: 'u75.polyproj' }),
          confirmProjectOpen: async () => true,
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      const ready = () =>
        page.waitForFunction(() => document.getElementById('cancel').hidden && document.querySelector('#evidence pre'));
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
      await ready();
      await page.locator('#welcome-close').click();
      if (await page.locator('body').evaluate((n) => n.classList.contains('library-hidden')))
        await page.locator('#toggle-library').click();
      await page.locator('#library-u-dual-obstructions > summary').click();
      await page.waitForFunction(() =>
        document.getElementById('u-dual-summary').textContent.includes('13 named source reports')
      );
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), true);
      for (const id of ['u-dual-identity', 'u-dual-open-source', 'u-dual-verify']) {
        assert.equal(await page.locator('#' + id).isVisible(), true, id);
        assert.equal(await page.locator('#' + id).evaluate((n) => !!n.closest('[data-expert]')), true);
      }
      await page.locator('#u-dual-identity').selectOption('dual3:U75');
      await page.locator('#u-dual-open-source').click();
      await page.waitForFunction(() =>
        document.getElementById('model-name').textContent.includes('great dirhombicosidodecahedron')
      );
      await ready();
      const save = async () => {
        const before = await page.evaluate(() => window.saveCount);
        await page.locator('#save').click();
        await page.waitForFunction((n) => window.saveCount > n, before);
        return page.evaluate(() => window.saved);
      };
      const active = (p) => p.documents[p.active];
      const before = active(await save());
      await page.locator('#u-dual-verify').click();
      await page.waitForFunction(() =>
        document.getElementById('u-dual-status').textContent.includes('Current check: obstruction-confirmed')
      );
      const evidence = JSON.parse(await page.locator('#u-dual-verification').textContent());
      assert.equal(evidence.verification.centerPlaneFaceIds.length, 60);
      assert.equal(evidence.verification.coincidentPlaneGroups.length, 62);
      assert.equal(evidence.witnesses.planes.length, 124);
      assert.equal(evidence.witnesses.geometryModel, false);
      assert.deepEqual(active(await save()).states, before.states);
      await page.locator('#open').click();
      await ready();
      assert.deepEqual(active(await save()).states, before.states);
      await page.locator('#u-dual-identity').selectOption('dual3:U70');
      await page.locator('#u-dual-verify').click();
      await page.waitForFunction(() =>
        document.getElementById('u-dual-status').textContent.includes('Current check: obstruction-confirmed')
      );
      const star = JSON.parse(await page.locator('#u-dual-verification').textContent());
      assert.deepEqual(star.verification.winding.polygons, [
        [5, 2, 12],
        [10, 3, 6],
      ]);
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
