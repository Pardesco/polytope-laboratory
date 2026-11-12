import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const { reveal } = createRequire(import.meta.url)('../scripts/smoke-helpers.cjs');
const fixture = JSON.parse(readFileSync(new URL('./fixtures/stellation-cavity-grid.json', import.meta.url), 'utf8'));

test(
  'Expert-off cavity inspection, preserve/fill adoption, undo/redo, reopen and native replay',
  { timeout: 300000 },
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
      page.setDefaultTimeout(60000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript(() => {
        window.requests = [];
        window.saveCount = 0;
        window.polytope = {
          engine: (request) => {
            window.requests.push(structuredClone(request));
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
            window.saveCount++;
            return { path: 'cavity.polytope' };
          },
          open: async () => ({ project: structuredClone(window.saved), path: 'cavity.polytope' }),
          confirmProjectOpen: async () => true,
        };
      });
      const ready = () => page.waitForFunction(() => document.getElementById('cancel').hidden);
      const click = async (id) => {
        await reveal(page, '#' + id);
        await page.locator('#' + id).click();
      };
      const save = async () => {
        const count = await page.evaluate(() => window.saveCount);
        await page.locator('#save').click();
        await page.waitForFunction((n) => window.saveCount > n, count);
        return page.evaluate(() => window.saved);
      };
      const current = (p) => {
        const d = p.documents[p.active];
        return d.states[d.cursor];
      };
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
      await page.locator('#welcome-close').click();
      await ready();
      if (await page.locator('body').evaluate((n) => n.classList.contains('inspector-hidden')))
        await page.locator('#toggle-inspector').click();
      await click('library-show-all');
      await reveal(page, '[data-key="cube"]');
      await page.locator('[data-key="cube"]').click();
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Cube');
      await ready();
      await reveal(page, '#stellation-arbitrary-planes');
      await page.locator('#stellation-arbitrary-planes').fill(fixture.planes.map((row) => row.join(',')).join('\n'));
      await page.locator('#stellation-bounds-min').fill('-3,-3,-3');
      await page.locator('#stellation-bounds-max').fill('3,3,3');
      await click('stellation-evaluate-arbitrary');
      await page
        .waitForFunction(() => document.getElementById('stellation-summary').textContent.includes('125 observed'))
        .catch(async (error) => {
          throw Error(
            error.message +
              ' ' +
              JSON.stringify(
                await page.evaluate(() => ({
                  summary: document.getElementById('stellation-summary').textContent,
                  status: document.getElementById('status')?.textContent,
                  toast: document.getElementById('toast')?.textContent,
                  requests: window.requests.slice(-8).map((r) => [r.op, r.params?.entries ?? r.params?.planes]),
                }))
              )
          );
        });
      await ready();
      await click('stellation-all-bounded');
      await ready();
      const all = await save(),
        a = current(all).arrangement,
        core = a.regions.find((r) => r.signs.every((s, i) => s === [-1, -1, 1, 1][i % 4])).id;
      await page.locator(`#stellation-regions input[data-region="${core}"]`).uncheck();
      await page.waitForFunction(() =>
        document.getElementById('stellation-summary').textContent.includes('26 selected')
      );
      await ready();
      await click('stellation-cell-evaluate');
      await page.waitForFunction(() => document.querySelector('#stellation-face-diagram svg'));
      await ready();
      await click('stellation-cavity-inspect');
      await page.waitForFunction(() =>
        document.getElementById('stellation-cavity-status').textContent.includes('60 → 54')
      );
      await ready();
      assert.match(
        await page.locator('#stellation-cavity-status').textContent(),
        new RegExp('1 inaccessible cells: R' + core)
      );
      assert.equal(await page.locator('#stellation-cavity-base').evaluate((n) => !!n.closest('[data-expert]')), false);
      const shell = current(await save()).view.stellation.selectedRegions;
      assert.equal(shell.length, 26);
      await click('stellation-face-base');
      await page.waitForFunction(() =>
        document.getElementById('model-name').textContent.startsWith('Stellation region union')
      );
      await ready();
      const preserved = current(await save()).model;
      assert.equal(preserved.faces.length, 60);
      assert.ok(Math.abs(preserved.measure.content - 56) < 1e-9);
      await click('undo');
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Cube');
      await ready();
      assert.deepEqual(current(await save()).view.stellation.selectedRegions, shell);
      await click('stellation-cell-evaluate');
      await page.waitForFunction(() => document.querySelector('#stellation-face-diagram svg'));
      await ready();
      await click('stellation-cavity-base');
      await page.waitForFunction(() =>
        document.getElementById('model-name').textContent.startsWith('Stellation region union')
      );
      await ready();
      let saved = await save();
      const filled = current(saved).model;
      assert.equal(filled.faces.length, 54);
      assert.ok(Math.abs(filled.measure.content - 64) < 1e-9);
      assert.equal(filled.metadata.stellationCavities.policy, 'fill');
      const request = await page.evaluate(() =>
        window.requests.findLast((r) => r.op === 'recipe-run' && r.params.operation === 'stellation-make-base')
      );
      assert.equal(request.params.parameters.cavity_policy, 'fill');
      assert.equal(request.params.parameters.region_signs.length, 26);
      await click('undo');
      await ready();
      assert.deepEqual(current(await save()).view.stellation.selectedRegions, shell);
      await click('redo');
      await ready();
      assert.deepEqual(current(await save()).model, filled);
      await click('open');
      await ready();
      saved = await save();
      assert.deepEqual(current(saved).model, filled);
      const replay = await compute({ op: 'recipe-replay', params: { document: saved.documents[saved.active] } });
      assert.equal(replay.states[0].model.fingerprint, filled.fingerprint);
      assert.equal(replay.states[0].model.metadata.stellationCavities.policy, 'fill');
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
