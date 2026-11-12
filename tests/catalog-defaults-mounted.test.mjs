import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { isDiscoveryCandidate } from '../ui/catalog-defaults.mjs';

test(
  'mounted library hides discovery candidates by default and keeps direct/project opening available',
  { timeout: 120000 },
  async (t) => {
    const engine = spawn('python', ['-u', 'engine/server.py'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }),
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
      const entries = await compute({ op: 'catalog' }),
        candidate = entries.find((row) => isDiscoveryCandidate(row) && row.counts[0] === 5),
        defaultCount = entries.filter((row) => !isDiscoveryCandidate(row)).length;
      assert.ok(candidate);
      await server.listen();
      browser = await chromium.launch({
        headless: true,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      });
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
        errors = [];
      page.setDefaultTimeout(30000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript(() => {
        window.polytope = {
          engine: (request) => window.nativeEngine(request),
          cancel: async () => {},
          setDirty: async () => {},
          setWorkspaceAvailability: async () => {},
          onAction: (callback) => (window.menuAction = callback),
          libraries: async () => ({ libraries: [], errors: [] }),
          recoveryInfo: async () => null,
          startupInfo: async () => ({ hidden: true }),
          autosave: async () => {},
          recentFiles: async () => ({ files: [] }),
          confirmProjectOpen: async () => true,
          open: async () => window.nextOpen,
          save: async (project) => {
            window.savedProject = structuredClone(project);
            return { path: 'discovery.polyproj' };
          },
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      const ready = () =>
        page.waitForFunction(() => document.getElementById('cancel').hidden && document.querySelector('#evidence pre'));
      await ready();
      if ((await page.locator('#auto-rotate').getAttribute('aria-pressed')) === 'true')
        await page.locator('#auto-rotate').click();
      const count = () => page.locator('#library-count').textContent().then(Number);
      await t.test('default browse, collection cards, family options and counts omit candidates', async () => {
        assert.equal(await page.locator('#library-discovery-candidates').isChecked(), false);
        assert.equal(await count(), defaultCount);
        assert.equal(await page.locator('#library-collection-discovery4').count(), 0);
        assert.equal(await page.locator('#library-family option[value="4D discovery candidates"]').count(), 0);
        assert.equal(await page.locator('#catalog-classification-badge').isVisible(), false);
        assert.match(
          await page.locator('#library-discovery-filter').innerText(),
          /Discovery candidates \(unverified\).*Computer-found shapes, not checked against published lists/s
        );
        await page.locator('#library-show-all').click();
        assert.equal(await count(), defaultCount);
      });
      await t.test('search requires explicit opt-in and opted-in rows carry an unverified badge', async () => {
        await page.locator('#search').fill(candidate.key);
        assert.equal(await count(), 0);
        await page.locator('#library-discovery-candidates').check();
        assert.equal(await count(), 1);
        const row = page.locator('[data-key="' + candidate.key + '"]');
        assert.equal(await row.count(), 1);
        assert.equal(await row.locator('.badge').textContent(), 'Unverified');
        await row.click();
        await ready();
        assert.equal(await page.locator('#model-name').innerText(), candidate.name);
        assert.equal(await page.locator('#catalog-classification-badge').isVisible(), true);
        await page.locator('#library-discovery-candidates').uncheck();
        assert.equal(await count(), 0);
        assert.equal(await page.locator('#catalog-classification-badge').isVisible(), true);
      });
      await t.test(
        'opt-in collection counts include candidates and Collections resets to the safe default',
        async () => {
          await page.locator('#library-home').click();
          assert.equal(await count(), defaultCount);
          await page.locator('#library-discovery-candidates').check();
          assert.equal(await count(), entries.length);
          assert.equal(await page.locator('#library-collection-discovery4').count(), 1);
          await page.locator('#library-collection-discovery4').click();
          assert.equal(await count(), 908);
          await page.locator('#library-home').click();
          assert.equal(await count(), defaultCount);
          assert.equal(await page.locator('#library-discovery-candidates').isChecked(), false);
        }
      );
      await t.test(
        'direct native reference opens with default filtering and a visible classification badge',
        async () => {
          await page.locator('#search').fill('cube');
          await page.locator('[data-key="cube"]').click();
          await ready();
          assert.equal(await page.locator('#catalog-classification-badge').isVisible(), false);
          await page.evaluate(async (entry) => {
            window.nextOpen = {
              model: await window.nativeEngine({ op: 'generate', params: { kind: 'regular', key: entry.key } }),
              path: 'candidate.json',
            };
          }, candidate);
          await page.locator('#open').click();
          await ready();
          assert.equal(await page.locator('#model-name').innerText(), candidate.name);
          assert.equal(await page.locator('#catalog-classification-badge').isVisible(), true);
          assert.equal(await page.locator('#library-discovery-candidates').isChecked(), false);
        }
      );
      await t.test(
        'saved project restores its candidate identity and badge while browsing stays filtered',
        async () => {
          await page.locator('#save').click();
          await page.waitForFunction(() => Boolean(window.savedProject));
          const saved = await page.evaluate(() => {
            const p = window.savedProject;
            return p.documents[p.active].states.at(-1).model;
          });
          assert.equal(saved.metadata.key, candidate.key);
          assert.equal(saved.metadata.classificationVerified, false);
          await page.locator('[data-key="cube"]').click();
          await ready();
          assert.equal(await page.locator('#catalog-classification-badge').isVisible(), false);
          await page.evaluate(() => {
            window.nextOpen = { project: structuredClone(window.savedProject), path: 'discovery.polyproj' };
          });
          await page.locator('#open').click();
          await ready();
          assert.equal(await page.locator('#model-name').innerText(), candidate.name);
          assert.equal(await page.locator('#catalog-classification-badge').isVisible(), true);
          await page.locator('#search').fill(candidate.key);
          assert.equal(await count(), 0);
        }
      );
      assert.deepEqual(errors, [], stderr);
    } finally {
      await browser?.close();
      await server.close();
      lines.close();
      engine.kill();
    }
  }
);
