import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
const { autoReveal } = createRequire(import.meta.url)('../scripts/smoke-helpers.cjs');

test(
  'Library expert reveal opens a generated dual, rechecks both tranches and reopens source-owned evidence',
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
            return { path: 'classification.polyproj' };
          },
          open: async () => ({ project: structuredClone(window.saved), path: 'classification.polyproj' }),
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
      await page.locator('#library-classification > summary').click();
      await page.waitForFunction(() =>
        document.getElementById('classification-summary').textContent.includes('64 recorded numerical passes')
      );
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), true);
      for (const id of [
        'classification-tranche',
        'classification-identity',
        'classification-open-source',
        'classification-verify',
      ]) {
        assert.equal(await page.locator('#' + id).isVisible(), true, id);
        assert.equal(await page.locator('#' + id).evaluate((n) => !!n.closest('[data-expert]')), true);
      }
      await page.locator('#classification-identity').selectOption('dual3:U74');
      await page.locator('#classification-verify').click();
      await page.waitForFunction(() =>
        document.getElementById('classification-status').textContent.includes('Current check: numerical-pass')
      );
      await page.locator('#classification-open-dual').click();
      await page.waitForFunction(() => document.getElementById('model-name').textContent.includes('(U74) (generated)'));
      await ready();
      const save = async () => {
        const before = await page.evaluate(() => window.saveCount);
        await page.locator('#save').click();
        await page.waitForFunction((n) => window.saveCount > n, before);
        return page.evaluate(() => window.saved);
      };
      const active = (p) => p.documents[p.active].states[p.documents[p.active].cursor];
      const saved = await save(),
        model = active(saved).model;
      assert.equal(model.metadata.generatedIdentity.id, 'dual3:U74');
      assert.equal(model.metadata.generatedIdentity.suppliedSource, false);
      assert.equal(model.provenance.convexified, false);
      await page.locator('#open').click();
      await ready();
      assert.deepEqual(active(await save()).model, model);
      if (!(await page.locator('#library-classification').evaluate((n) => n.open)))
        await page.locator('#library-classification > summary').click();
      await page.locator('#classification-tranche').selectOption('4d');
      await page.waitForFunction(() =>
        document.getElementById('classification-summary').textContent.includes('6 recorded numerical passes')
      );
      await page.locator('#classification-identity').selectOption('regiment:koho-cross4');
      await page.locator('#classification-verify').click();
      await page.waitForFunction(() =>
        document.getElementById('classification-status').textContent.includes('Current check: numerical-pass')
      );
      const evidence = await page.locator('#classification-verification').textContent();
      assert.match(evidence, /"sameEdgeArrangement": true/);
      assert.match(evidence, /"sameCellArrangement": false/);
      assert.equal(await page.locator('#classification-open-related').isEnabled(), true);
      await page.locator('#classification-open-source').click();
      await page.waitForFunction(() => document.getElementById('model-name').textContent.includes('(Koho)'));
      await ready();
      const koho = active(await save()).model;
      assert.deepEqual(
        ['vertices', 'edges', 'faces', 'cells'].map((k) => koho[k].length),
        [8, 24, 28, 12]
      );
      await page.locator('#classification-identity').selectOption('fissary:affic');
      assert.equal(await page.locator('#classification-open-source').isDisabled(), true);
      assert.equal(await page.locator('#classification-verify').isDisabled(), true);
      assert.match(await page.locator('#classification-detail').textContent(), /No pinned loadable named geometry/);
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
