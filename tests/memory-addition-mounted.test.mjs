import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'vite';
import { chromium } from 'playwright';

test(
  'expert-off Store, scaled Add/Blend, Undo/Redo, replay, Swap and reopen use mounted native workflows',
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
    let browser;
    try {
      await server.listen();
      browser = await chromium.launch({
        headless: true,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      });
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' }),
        errors = [];
      page.setDefaultTimeout(25000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript(() => {
        window.saveCount = 0;
        window.requests = [];
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
            return { path: 'memory.polyproj' };
          },
          open: async () => ({ project: structuredClone(window.saved), path: 'memory.polyproj' }),
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
      if (await page.locator('#library-show-all').count()) await page.locator('#library-show-all').click();
      await page.locator('[data-key="cube"]').click();
      await ready();
      const save = async () => {
        const before = await page.evaluate(() => window.saveCount);
        await page.locator('#save').click();
        await page.waitForFunction((n) => window.saveCount > n, before);
        return page.evaluate(() => window.saved);
      };
      const active = (p) => p.documents[p.active],
        current = (p) => active(p).states[active(p).cursor];
      const memoryPanel = async () => {
        if (await page.locator('#memories-settings').evaluate((n) => n.open)) return;
        if (!(await page.locator('#dock-more').evaluate((n) => n.open)))
          await page.locator('#dock-more > summary').click();
        await page.locator('#open-memories-settings').click();
      };
      await memoryPanel();
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      for (const id of ['memory-slot', 'memory-source', 'memory-scale', 'memory-add', 'memory-blend']) {
        assert.equal(await page.locator('#' + id).isVisible(), true, id);
        assert.equal(await page.locator('#' + id).evaluate((n) => !!n.closest('[data-expert]')), false);
      }
      assert.equal(await page.locator('#memory-blend-options').evaluate((n) => n.open), false);
      await page.locator('#memory-store').click();
      await page.waitForFunction(() =>
        document.getElementById('memory-slot').selectedOptions[0].textContent.includes('Cube')
      );
      const stored = (await save()).memories.slots[0];
      await memoryPanel();
      await page.locator('#memory-scale').fill('1/2');
      await page.locator('#memory-add').click();
      await page.waitForFunction(() =>
        document.getElementById('memory-addition-result').textContent.includes('Added at relative scale 0.5')
      );
      await ready();
      const added = await save(),
        addedModel = current(added).model;
      assert.equal(active(added).states.length, 2);
      assert.equal(addedModel.vertices.length, 16);
      assert.deepEqual(
        addedModel.vertices.slice(8),
        stored.state.model.vertices.map((p) => p.map((x) => x / 2))
      );
      assert.deepEqual(added.memories.slots[0], stored);
      assert.equal(addedModel.metadata.memoryAddition.relativeScale, 0.5);
      const ids = addedModel.components.map((c) => c.id);
      assert.equal(new Set(ids).size, 2);
      await page.locator('#undo').click();
      await ready();
      assert.deepEqual(current(await save()).model, stored.state.model);
      await page.locator('#redo').click();
      await ready();
      assert.deepEqual(current(await save()).model, addedModel);
      if (!(await page.locator('#history-settings').evaluate((n) => n.open)))
        await page.locator('#history-settings > summary').click();
      await page.locator('#history-replay').click();
      await ready();
      const replayed = current(await save()).model;
      assert.deepEqual(replayed.vertices, addedModel.vertices);
      assert.deepEqual(
        replayed.components.map((c) => c.id),
        ids
      );
      await page.locator('[data-key="cube"]').click();
      await ready();
      await memoryPanel();
      await page.locator('#memory-blend').click();
      await page.waitForFunction(() =>
        document.getElementById('memory-addition-result').textContent.includes('Merged at relative scale 0.5')
      );
      await ready();
      const blended = await save(),
        blendedModel = current(blended).model;
      assert.equal(active(blended).states.length, 3);
      assert.equal(blendedModel.faces.length, 6);
      assert.equal(blendedModel.components, undefined);
      assert.ok(blendedModel.metadata.compoundMerge.visibleSurface.maxWindingResidual < 1e-7);
      assert.deepEqual(blended.memories.slots[0], stored);
      await memoryPanel();
      await page.locator('#memory-swap').click();
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Cube');
      await ready();
      const swapped = await save();
      assert.deepEqual(current(swapped).model, stored.state.model);
      assert.deepEqual(swapped.memories.slots[0].state.model, blendedModel);
      await page.locator('#open').click();
      await ready();
      const reopened = await save();
      assert.deepEqual(reopened.memories, swapped.memories);
      assert.deepEqual(current(reopened).model, stored.state.model);
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
