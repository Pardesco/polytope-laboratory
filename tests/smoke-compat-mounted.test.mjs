import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const { reveal } = createRequire(import.meta.url)('../scripts/smoke-helpers.cjs');

test(
  'hidden-smoke contracts retain branding restraint, validation ownership, exact badges and moved controls',
  { timeout: 120000 },
  async (t) => {
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
        window.holdOps = new Set();
        window.held = [];
        window.releaseHeld = (op) => {
          window.holdOps.delete(op);
          const held = window.held.filter((job) => job.op === op);
          window.held = window.held.filter((job) => job.op !== op);
          for (const job of held) job.resolve();
        };
        window.polytope = {
          engine: async (request) => {
            const result = await window.nativeEngine(request);
            if (window.holdOps.has(request.op))
              await new Promise((resolve) => window.held.push({ op: request.op, resolve }));
            return result;
          },
          cancel: async () => {},
          setDirty: async () => {},
          setWorkspaceAvailability: async () => {},
          onAction() {},
          libraries: async () => ({ libraries: [], errors: [] }),
          recoveryInfo: async () => null,
          startupInfo: async () => ({ hidden: true }),
          autosave: async () => {},
          recentFiles: async () => [],
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      const ready = () =>
        page.waitForFunction(() => document.getElementById('cancel').hidden && document.querySelector('#evidence pre'));
      const euler = () =>
        page
          .locator('#evidence pre')
          .textContent()
          .then((text) => JSON.parse(text).validation.eulerCharacteristic);
      const held = (op) => page.waitForFunction((op) => window.held.some((job) => job.op === op), op);
      const release = (op) => page.evaluate((op) => window.releaseHeld(op), op);
      const arm = (ops) =>
        page.evaluate((ops) => {
          window.holdOps = new Set(ops);
        }, ops);
      await ready();
      await page.locator('#toggle-inspector').click();
      await page.locator('[data-panel="evidence"]').click();
      if ((await page.locator('#auto-rotate').getAttribute('aria-pressed')) === 'true')
        await page.locator('#auto-rotate').click();
      await page.locator('#library-show-all').click();
      await t.test('header keeps its accessible icon without any rendered product name', async () => {
        assert.doesNotMatch(await page.locator('.command-bar').innerText(), /Polytope\s+Laboratory/i);
        assert.equal(await page.locator('.chrome-brand').textContent(), '');
        assert.equal(await page.locator('.chrome-brand').getAttribute('aria-label'), 'Polytope Laboratory');
        assert.equal(await page.locator('.chrome-brand').getAttribute('title'), 'Polytope Laboratory');
      });
      await t.test(
        'full native validation JSON remains collapsed under evidence and revalidation keeps one receipt',
        async () => {
          await page.locator('#expert-tools').evaluate((n) => n.click());
          assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
          await page.locator('[data-key="cube"]').click();
          await ready();
          assert.equal(await euler(), 2);
          assert.equal(await page.locator('#evidence pre').count(), 1);
          assert.equal(await page.locator('#evidence pre').isVisible(), false);
          await reveal(page, '#validation-details > summary');
          await page.locator('#validation-details > summary').click();
          assert.equal(await page.locator('#evidence pre').isVisible(), true);
          await page.locator('#validate').click();
          await ready();
          assert.equal(await page.locator('#evidence pre').count(), 1);
          assert.equal(await page.locator('#evidence pre').isVisible(), true);
          assert.equal(await euler(), 2);
          await page.locator('#validation-details > summary').click();
        }
      );
      await t.test(
        'native rational hull and dual show RATIONAL immediately; returning to float collapses metadata',
        async () => {
          await reveal(page, '#rational-points');
          await page.locator('#rational-points').fill('0,0,0\n1/3,0,0\n0,1/2,0\n0,0,1');
          await page.locator('#rational-hull').click();
          await page.waitForFunction(
            () => document.getElementById('model-name').textContent === 'Rational convex hull'
          );
          assert.equal(await page.locator('#numeric-badge').innerText(), 'RATIONAL');
          assert.equal(await page.locator('#numeric-badge').isVisible(), true);
          assert.equal(await page.locator('#precision-details').evaluate((n) => n.open), false);
          await ready();
          const receipt = await page.locator('#evidence pre').textContent().then(JSON.parse);
          assert.equal(receipt.numeric.mode, 'rational-exact');
          assert.equal(receipt.numeric.certified, true);
          assert.ok(receipt.certificate);
          await page.locator('#rational-dual').click();
          await page.waitForFunction(
            () => document.getElementById('model-name').textContent === 'Exact dual of Rational convex hull'
          );
          assert.equal(await page.locator('#numeric-badge').innerText(), 'RATIONAL');
          await ready();
          await page.locator('[data-key="cube"]').click();
          await ready();
          assert.equal(await page.locator('#numeric-badge').isVisible(), false);
          assert.equal(await page.locator('#numeric-badge').count(), 1);
          assert.match(await page.locator('#validation-summary').innerText(), /double-precision floating point/);
          await page.locator('#precision-details > summary').click();
          assert.equal(await page.locator('#numeric-badge').isVisible(), true);
          assert.equal(await page.locator('#dimension-badge').isVisible(), true);
          await page.locator('#precision-details > summary').click();
        }
      );
      await t.test(
        'pending reports clear old JSON and late Cube validation cannot replace Tesseract evidence',
        async () => {
          await arm(['validate', 'analyze']);
          await page.locator('#validate').click();
          await held('validate');
          await page.locator('[data-key="tesseract"]').click();
          await held('analyze');
          assert.equal(await page.locator('#evidence pre').count(), 0);
          await release('analyze');
          await page.waitForFunction(() => {
            const pre = document.querySelector('#evidence pre');
            return pre && JSON.parse(pre.textContent).validation.eulerCharacteristic === 0;
          });
          await release('validate');
          await ready();
          assert.equal(await euler(), 0);
          assert.equal(await page.locator('#evidence pre').count(), 1);
          await arm(['analyze', 'validate']);
          await page.locator('[data-key="cube"]').click();
          await held('analyze');
          await page.locator('#validate').click();
          await held('validate');
          await release('analyze');
          await page.waitForFunction(() => document.getElementById('analysis').textContent.includes('Volume'));
          assert.equal(await page.locator('#evidence pre').count(), 0);
          assert.match(await page.locator('#evidence').textContent(), /Checking current model/);
          await release('validate');
          await ready();
          assert.equal(await euler(), 2);
        }
      );
      await t.test('renamed task controls and docked Appearance preserve smoke IDs and command access', async () => {
        for (const id of [
          'plane-0',
          'plane-2',
          'metadata-author',
          'metadata-title',
          'open-dual-morph-settings',
          'construct-back-gallery-dual',
          'construct-card-gallery-dual',
          'construct-card-gallery-generator',
        ])
          assert.equal(await page.locator('#' + id).count(), 1, id);
        assert.equal(await page.locator('#presentation-settings > summary').innerText(), 'Presentation settings');
        assert.equal(await page.locator('#search').getAttribute('placeholder'), 'Search shapes');
        await page.locator('#command-search').click();
        await page.locator('#command-query').fill('Star truncation');
        assert.ok(await page.locator('#command-results [role="option"]').count());
        await page.locator('#command-close').click();
        await page.locator('[data-panel="construct"]').click();
        assert.equal(
          await page.locator('#construct-card-incidence-truncation-settings strong').innerText(),
          'Star truncation'
        );
        await page.locator('[data-panel="net"]').click();
        assert.match(await page.locator('#nets-other-types > summary').innerText(), /^Other net types \(\d+\)/);
        const before = await page.locator('#views').boundingBox();
        await page.locator('#surface-settings > summary').click();
        assert.equal(await page.locator('#surface-settings .settings-body').isVisible(), true);
        assert.ok((await page.locator('#views').boundingBox()).width < before.width);
        await page.locator('#surface-settings > summary').click();
        assert.equal(await page.locator('#surface-settings .settings-body').isVisible(), false);
        await page.locator('#export').click();
        assert.match(await page.locator('#export-goal-geometry').innerText(), /Export model data/);
        await page.locator('#close-export').click();
      });
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
