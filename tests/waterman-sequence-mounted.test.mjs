import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const { reveal } = createRequire(import.meta.url)('../scripts/smoke-helpers.cjs');

test(
  'occupied-shell UI: Expert-off sequence, boundary refusal, native reopen and undo/replay',
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
      page.setDefaultTimeout(20000);
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
            return { path: 'shell.polytope' };
          },
          open: async () => ({ project: structuredClone(window.saved), path: 'shell.polytope' }),
          confirmProjectOpen: async () => true,
        };
      });
      const address = 'http://127.0.0.1:' + server.httpServer.address().port;
      await page.goto(address, { timeout: 60000 });
      const ready = () =>
        page.waitForFunction(() => document.getElementById('cancel').hidden && document.querySelector('#evidence pre'));
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
      await ready();
      await page.locator('#welcome-close').click();
      if (await page.locator('body').evaluate((n) => n.classList.contains('inspector-hidden')))
        await page.locator('#toggle-inspector').click();
      await page.locator('[data-panel="construct"]').click();
      await page.locator('#construct-card-waterman-settings').click();
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      assert.equal(await page.locator('#waterman-sequence-settings').evaluate((n) => n.open), false);
      await page.locator('#waterman-sequence-settings > summary').click();
      for (const id of ['waterman-sequence', 'waterman-radius-squared', 'waterman-next', 'waterman-previous']) {
        assert.equal(await page.locator('#' + id).isVisible(), true);
        assert.equal(await page.locator('#' + id).evaluate((n) => !!n.closest('[data-expert]')), false);
      }
      await page.selectOption('#waterman-lattice', 'BCC');
      await page.selectOption('#waterman-sequence', 'occupied-shell');
      assert.equal(await page.locator('#waterman-increment').isDisabled(), true);
      await page.locator('#waterman-radius-squared').fill('0');
      await page.locator('#waterman-next').click();
      await page.waitForFunction(() => document.getElementById('waterman-radius-squared').value === '3');
      await ready();
      const save = async () => {
        const before = await page.evaluate(() => window.saveCount);
        await page.locator('#save').click();
        await page.waitForFunction((count) => window.saveCount > count, before);
        return page.evaluate(() => window.saved);
      };
      const current = (project) => {
        const doc = project.documents[project.active];
        return doc.states[doc.cursor];
      };
      let project = await save(),
        model = current(project).model;
      assert.deepEqual(
        ['vertices', 'edges', 'faces', 'cells'].map((k) => model[k].length),
        [8, 12, 6, 0]
      );
      assert.match(
        await page.locator('#waterman-sequence-status').innerText(),
        /r\^2 = 3; 8 boundary sites.*Numerical support residual/
      );
      assert.equal(model.provenance.generator.parameters.convention, 'waterman-occupied-shell-v1');
      await page.locator('#waterman-next').click();
      await page.waitForFunction(() => document.getElementById('waterman-radius-squared').value === '4');
      await ready();
      model = current(await save()).model;
      assert.deepEqual(
        ['vertices', 'edges', 'faces', 'cells'].map((k) => model[k].length),
        [14, 24, 12, 0]
      );
      await page.locator('#waterman-previous').click();
      await page.waitForFunction(() => document.getElementById('waterman-radius-squared').value === '3');
      await ready();
      model = current(await save()).model;
      const documentCount = (await save()).documents.length;
      await page.locator('#waterman-previous').click();
      await page.waitForFunction(() => document.getElementById('toast').textContent.includes('squared radius 0'));
      await ready();
      project = await save();
      assert.equal(project.documents.length, documentCount);
      assert.deepEqual(current(project).model, model);
      assert.equal(await page.locator('#waterman-radius-squared').inputValue(), '3');
      await page.locator('#open').click();
      await ready();
      assert.deepEqual(current(await save()).model, model);
      await page.locator('#construct-back-waterman-settings').click();
      await page.locator('#construct-card-transform-model-settings').click();
      await page.locator('#model-scale').fill('2');
      await page.locator('#scale').click();
      await ready();
      const scaled = current(await save()).model;
      assert.deepEqual(
        scaled.vertices,
        model.vertices.map((p) => p.map((x) => 2 * x))
      );
      await page.locator('#undo').click();
      await ready();
      assert.deepEqual(current(await save()).model, model);
      await page.locator('#redo').click();
      await ready();
      assert.deepEqual(current(await save()).model, scaled);
      await page.locator('#history-settings > summary').click();
      await page.locator('#history-replay').click();
      await ready();
      const replayed = current(await save()).model;
      assert.notEqual(replayed.id, scaled.id);
      assert.deepEqual({ ...replayed, id: scaled.id }, scaled);
      const hidden = await browser.newPage();
      await hidden.exposeFunction('nativeEngine', compute);
      await hidden.addInitScript(() => {
        window.polytope = {
          engine: (request) => window.nativeEngine(request),
          cancel: async () => {},
          setDirty: async () => {},
          setWorkspaceAvailability: async () => {},
          onAction() {},
          libraries: async () => ({ libraries: [], errors: [] }),
          recoveryInfo: async () => null,
          startupInfo: async () => ({ hidden: true }),
          autosave: async () => {},
          recentFiles: async () => ({ files: [] }),
        };
      });
      await hidden.goto(address);
      await hidden.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
      for (const id of ['waterman-sequence', 'waterman-next', 'waterman-previous']) {
        await reveal(hidden, '#' + id);
        assert.equal(await hidden.locator('#' + id).isVisible(), true);
      }
      await hidden.close();
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
