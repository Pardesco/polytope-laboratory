import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'vite';
import { chromium } from 'playwright';

test(
  'mounted via-snub works with Expert off, literal source save/reopen and unsupported-domain UI',
  { timeout: 120000 },
  async () => {
    const engine = spawn('python', ['-B', '-u', 'engine/server.py'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      }),
      pending = new Map();
    let next = 0,
      stderr = '',
      browser;
    engine.stderr.on('data', (data) => (stderr += data));
    engine.on('error', (error) => {
      for (const job of pending.values()) job.reject(error);
      pending.clear();
    });
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
    try {
      await server.listen();
      browser = await chromium.launch({
        headless: true,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      });
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' }),
        errors = [];
      page.setDefaultTimeout(15000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript(() => {
        window.snubRequests = [];
        window.savedCount = 0;
        window.polytope = {
          engine: (request) => {
            window.snubRequests.push(structuredClone(request));
            return window.nativeEngine(request);
          },
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
            window.savedCount++;
            return { path: 'snub.polyproj' };
          },
          open: async () => ({ project: structuredClone(window.saved), path: 'snub.polyproj' }),
          confirmProjectOpen: async () => true,
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      const ready = () =>
        page.waitForFunction(() => document.getElementById('cancel').hidden && document.querySelector('#evidence pre'));
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
      await ready();
      await page.locator('#welcome-close').click();
      const open = async () => {
        if (!(await page.locator('#dual-morph-settings').evaluate((n) => n.open))) {
          await page.locator('#dock-more-button').click();
          await page.locator('#open-dual-morph-settings').click();
        }
      };
      const option = page.locator('#dual-morph-method option[value="via-snub"]');
      await open();
      assert.equal(await option.evaluate((n) => n.disabled), true, await page.locator('#model-name').textContent());
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      await page.locator('#dual-morph-settings .chrome-drawer-close').click();
      await page.locator('#library-show-all').click();
      await page.locator('[data-key="cube"]').click();
      await ready();
      await open();
      assert.equal(await option.evaluate((n) => n.disabled), false);
      assert.equal(await page.locator('#dual-morph-apply').evaluate((n) => !!n.closest('[data-expert]')), false);
      await page.locator('#dual-morph-method').selectOption('via-snub');
      assert.equal(await page.locator('#dual-morph-snub-help').isVisible(), true);
      assert.match(await page.locator('#dual-morph-snub-help').textContent(), /0.456311.*0.001/);
      await page.locator('#dual-morph-ratio').fill('1/2');
      await page.locator('#dual-morph-apply').click();
      await page.waitForFunction(
        () =>
          document.getElementById('dual-morph-result').textContent.includes('via-snub') &&
          document.getElementById('dual-morph-result').textContent.includes('strict gap')
      );
      assert.match(await page.locator('#dual-morph-result').textContent(), /0.500.*approximate.*planarity/);
      await page.locator('#dual-morph-settings .chrome-drawer-close').click();
      await page.locator('#save').click();
      await page.waitForFunction(() => window.savedCount === 1);
      const saved = await page.evaluate(() => window.saved),
        doc = saved.documents[saved.active],
        state = doc.states[doc.cursor];
      assert.equal(state.view.dualMorph.method, 'via-snub');
      assert.equal(state.view.dualMorph.ratio, 0.5);
      assert.equal(state.model.vertices.length, 8);
      assert.equal(state.model.faces.length, 6);
      assert.ok(state.view.dualMorph.radius > 0);
      await page.locator('#open').click();
      await ready();
      await open();
      await page.waitForFunction(
        () =>
          document.getElementById('dual-morph-result').textContent.includes('0.500') &&
          document.getElementById('dual-morph-result').textContent.includes('strict gap')
      );
      await page.locator('#dual-morph-scrub').fill('1');
      await page.locator('#dual-morph-scrub').dispatchEvent('input');
      await page.waitForFunction(() => document.getElementById('dual-morph-result').textContent.includes('1.000'));
      assert.equal(await page.locator('#dual-morph-play').textContent(), 'Replay');
      await page.locator('#dual-morph-reset').click();
      await page.waitForFunction(() => document.getElementById('dual-morph-result').textContent === 'Source geometry');
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      assert.ok(
        await page.evaluate(() =>
          window.snubRequests.some((r) => r.op === 'evaluate-dual-morph' && r.params.ratio === 1)
        )
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
