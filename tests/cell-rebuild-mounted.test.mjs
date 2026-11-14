import test from 'node:test';
import { revealConstructCard } from './helpers/construct-tools.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { cellRebuildSignature } from '../ui/cell-rebuild-controls.mjs';

test(
  'Expert-off coplanar cell preview/adopt, refusal, undo, redo, reopen and replay',
  { timeout: 180000 },
  async (t) => {
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/r8_cell_rebuild.json', import.meta.url), 'utf8'));
    const engine = spawn('python', ['-B', '-u', 'engine/server.py'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const pending = new Map();
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
    const seed = await compute({
      op: 'validate-project',
      params: {
        project: {
          format: 'polytope-laboratory',
          version: 1,
          active: 0,
          documents: [
            {
              id: 'split-cells',
              cursor: 0,
              states: [{ model: fixture.model, view: { coordinateUnit: 'mm' }, notes: 'Cell owner notes' }],
            },
          ],
        },
      },
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
      page.setDefaultNavigationTimeout(60000);
      page.on('pageerror', (e) => errors.push(e.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript((seed) => {
        window.seed = seed;
        window.saveCount = 0;
        window.previews = [];
        window.polytope = {
          engine: async (request) => {
            const result = await window.nativeEngine(request);
            if (request.op === 'rebuild-coplanar-cells-preview') window.previews.push(structuredClone(result));
            if (
              window.tamperCellJoin &&
              request.op === 'recipe-run' &&
              request.params.operation === 'rebuild-coplanar-cells'
            )
              result.states[result.cursor].model.metadata.offColors.cells[6] = null;
            return result;
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
          confirmProjectOpen: async () => true,
          open: async () => ({ project: structuredClone(window.saved ?? window.seed), path: 'r8-cells.polytope' }),
          save: async (project) => {
            window.saved = await window.nativeEngine({ op: 'validate-project', params: { project } });
            window.saveCount++;
            return { path: 'r8-cells.polytope' };
          },
        };
      }, seed);
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      const ready = () =>
        page.waitForFunction(() => document.getElementById('cancel').hidden && document.querySelector('#evidence pre'));
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
      await ready();
      await page.locator('#welcome-close').click();
      if (await page.locator('body').evaluate((n) => n.classList.contains('inspector-hidden')))
        await page.locator('#toggle-inspector').click();
      await page.locator('#open').click();
      await ready();
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Split-cell tesseract');
      const save = async () => {
        const before = await page.evaluate(() => window.saveCount);
        await page.locator('#save').click();
        await page.waitForFunction((n) => window.saveCount > n, before);
        return page.evaluate(() => window.saved);
      };
      const current = (p) => {
        const d = p.documents[p.active];
        return d.states[d.cursor];
      };
      const show = async () => {
        await page.locator('[data-panel="construct"]').click();
        await revealConstructCard(page, 'construct-card-cell-rebuild-settings');
        const card = page.locator('#construct-card-cell-rebuild-settings');
        if (await card.isVisible()) await card.click();
        if (!(await page.locator('#cell-rebuild-settings').evaluate((n) => n.open)))
          await page.locator('#cell-rebuild-settings > summary').click();
      };
      await show();
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      for (const id of ['cell-rebuild-ids', 'cell-rebuild-preview', 'cell-rebuild-adopt']) {
        assert.equal(await page.locator('#' + id).count(), 1);
        assert.equal(await page.locator('#' + id).isVisible(), true);
        assert.equal(await page.locator('#' + id).evaluate((n) => !!n.closest('[data-expert]')), false);
      }
      await page.locator('#cell-rebuild-ids').fill('6, 8');
      const before = await save();
      await page.locator('#cell-rebuild-preview').click();
      await page.waitForFunction(() => !document.getElementById('cell-rebuild-adopt').disabled);
      assert.match(
        await page.locator('#cell-rebuild-result').innerText(),
        /Cells 6, 8.*content.*residual.*Float64 approximate/
      );
      const preview = await page.evaluate(() => window.previews.at(-1));
      assert.deepEqual(current(await save()), current(before));
      assert.equal(preview.construction.joinedCellContent > 0.999999999999, true);
      assert.match(
        await page.locator('#cell-rebuild-owners').textContent(),
        /Cell 6: source cells 6, 8; color source cell 6/
      );
      await page.locator('#cell-rebuild-adopt').click();
      await page.waitForFunction(() => document.getElementById('model-name').textContent.includes('joined cells'));
      await ready();
      const builtProject = await save(),
        built = current(builtProject);
      assert.equal(cellRebuildSignature(built.model), cellRebuildSignature(preview.model));
      assert.equal(built.notes, 'Cell owner notes');
      assert.equal(built.model.cells.length, 8);
      assert.equal(built.model.faces.length, 26);
      await page.locator('#undo').click();
      await ready();
      assert.deepEqual(current(await save()).model, current(before).model);
      await page.locator('#redo').click();
      await ready();
      assert.equal(cellRebuildSignature(current(await save()).model), cellRebuildSignature(built.model));
      await page.locator('#open').click();
      await ready();
      assert.equal(cellRebuildSignature(current(await save()).model), cellRebuildSignature(built.model));
      const replay = page.locator('#history-replay');
      await replay.evaluate((n) => {
        for (let p = n.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
      });
      await replay.click();
      await ready();
      const replayed = await save();
      assert.equal(replayed.documents.length, builtProject.documents.length + 1);
      assert.equal(cellRebuildSignature(current(replayed).model), cellRebuildSignature(built.model));
      await t.test('unsupported and altered native results leave document history untouched', async () => {
        await page.evaluate(() => {
          window.saved = undefined;
        });
        await page.locator('#open').click();
        await ready();
        await show();
        await page.locator('#cell-rebuild-ids').fill('0, 2');
        const before = await save();
        await page.locator('#cell-rebuild-preview').click();
        await page.waitForFunction(() =>
          document.getElementById('cell-rebuild-result').textContent.includes('hyperplane')
        );
        assert.equal(await page.locator('#cell-rebuild-adopt').isDisabled(), true);
        assert.deepEqual((await save()).documents, before.documents);
        await page.locator('#cell-rebuild-ids').fill('6, 8');
        await page.locator('#cell-rebuild-preview').click();
        await page.waitForFunction(() => !document.getElementById('cell-rebuild-adopt').disabled);
        await page.evaluate(() => {
          window.tamperCellJoin = true;
        });
        await page.locator('#cell-rebuild-adopt').click();
        await page.waitForFunction(() =>
          document.getElementById('cell-rebuild-result').textContent.includes('differs from the preview')
        );
        assert.deepEqual((await save()).documents, before.documents);
        assert.equal(await page.locator('#cell-rebuild-adopt').isDisabled(), true);
      });
      assert.deepEqual(errors, []);
      assert.equal(stderr, '');
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
    } finally {
      await browser?.close();
      await server.close();
      lines.close();
      engine.kill();
      for (const job of pending.values()) job.reject(Error('Test complete.'));
    }
  }
);
