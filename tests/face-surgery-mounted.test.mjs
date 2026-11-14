import test from 'node:test';
import { revealConstructCard } from './helpers/construct-tools.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { storeMemory } from '../ui/model-memories.mjs';
import { surgeryResultSignature } from '../ui/face-surgery-preview.mjs';

test(
  'Expert-off face surgery previews and adopts colored generated/memory pieces through undo, reopen and replay',
  { timeout: 180000 },
  async (t) => {
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/r6_face_surgery.json', import.meta.url), 'utf8'));
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
    const memories = storeMemory(
      undefined,
      1,
      { model: fixture.pyramid, view: { coordinateUnit: 'mm' }, notes: 'Colored memory piece' },
      { documentId: 'pyramid-source', modelId: fixture.pyramid.id }
    );
    const seed = await compute({
      op: 'validate-project',
      params: {
        project: {
          format: 'polytope-laboratory',
          version: 1,
          active: 0,
          memories,
          documents: [
            {
              id: 'r6-mounted-source',
              cursor: 0,
              states: [{ model: fixture.cube, view: { coordinateUnit: 'mm' }, notes: 'Colored source notes' }],
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
      page.setDefaultTimeout(20000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript((seed) => {
        window.seed = seed;
        window.requests = [];
        window.previews = [];
        window.saveCount = 0;
        window.polytope = {
          engine: async (request) => {
            window.requests.push(structuredClone(request));
            const result = await window.nativeEngine(request);
            if (request.op === 'face-surgery-preview') window.previews.push(structuredClone(result));
            if (window.tamperSurgery && request.op === 'recipe-run' && request.params.operation === 'face-surgery')
              result.states[result.cursor].model.metadata.offColors.faces[0] = {
                encoding: 'byte',
                values: [1, 2, 3, 4],
              };
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
          open: async () => ({ project: structuredClone(window.saved ?? window.seed), path: 'r6-surgery.polytope' }),
          confirmProjectOpen: async () => true,
          save: async (project) => {
            window.saved = await window.nativeEngine({ op: 'validate-project', params: { project } });
            window.saveCount++;
            return { path: 'r6-surgery.polytope' };
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
      const save = async () => {
        const count = await page.evaluate(() => window.saveCount);
        await page.locator('#save').click();
        await page.waitForFunction((n) => window.saveCount > n, count);
        return page.evaluate(() => window.saved);
      };
      const current = (project) => {
        const d = project.documents[project.active];
        return d.states[d.cursor];
      };
      const show = async () => {
        await page.locator('[data-panel="construct"]').click();
        await revealConstructCard(page, 'construct-card-face-surgery-settings');
        const card = page.locator('#construct-card-face-surgery-settings');
        if (await card.isVisible()) await card.click();
        if (!(await page.locator('#face-surgery-settings').evaluate((n) => n.open)))
          await page.locator('#face-surgery-settings > summary').click();
      };
      for (const [piece, mode, color] of [
        ['pyramid', 'augment', 'base'],
        ['memory:1', 'excavate', 'piece'],
        ['memory:1', 'augment', 'none'],
      ]) {
        await t.test(`${piece} ${mode} with ${color} side colors`, async () => {
          await page.evaluate(() => {
            window.saved = undefined;
          });
          await page.locator('#open').click();
          await ready();
          await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Colored unit cube');
          await page.locator('#pick-source').click();
          await page.selectOption('#pick-kind', 'face');
          await page.keyboard.press('Escape');
          await show();
          assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
          for (const id of [
            'surgery-target-filter',
            'surgery-side-colors',
            'preview-face-surgery',
            'adopt-face-surgery',
          ]) {
            assert.equal(await page.locator('#' + id).count(), 1);
            assert.equal(await page.locator('#' + id).isVisible(), true);
            assert.equal(await page.locator('#' + id).evaluate((n) => !!n.closest('[data-expert]')), false);
          }
          await page.selectOption('#surgery-piece', piece);
          await page.locator('#surgery-all').check();
          await page.selectOption('#surgery-target-filter', 'same-color');
          await page.selectOption('#surgery-side-colors', color);
          if (mode === 'excavate') await page.locator('#surgery-excavate').check();
          else await page.locator('#surgery-excavate').uncheck();
          await page.locator('#surgery-height').fill('1/4');
          const before = await save();
          await page.locator('#preview-face-surgery').click();
          await page.waitForFunction(() => !document.getElementById('adopt-face-surgery').disabled);
          assert.match(
            await page.locator('#surgery-preview-result').innerText(),
            /Target face IDs: 0, 1.*residual.*Float64 approximate/
          );
          const preview = await page.evaluate(() => window.previews.at(-1));
          assert.equal(preview.model.faces.length, 12);
          const afterPreview = await save();
          assert.deepEqual(current(afterPreview), current(before));
          assert.deepEqual(afterPreview.memories, before.memories);
          await page.locator('#adopt-face-surgery').click();
          await page.waitForFunction(() => document.getElementById('model-name').textContent !== 'Colored unit cube');
          await ready();
          const builtProject = await save(),
            built = current(builtProject);
          assert.equal(surgeryResultSignature(built.model), surgeryResultSignature(preview.model));
          assert.equal(built.notes, 'Colored source notes');
          assert.deepEqual(builtProject.memories, before.memories);
          await page.locator('#undo').click();
          await ready();
          assert.deepEqual(current(await save()).model, current(before).model);
          await page.locator('#redo').click();
          await ready();
          assert.equal(surgeryResultSignature(current(await save()).model), surgeryResultSignature(built.model));
          await page.locator('#open').click();
          await ready();
          assert.equal(surgeryResultSignature(current(await save()).model), surgeryResultSignature(built.model));
          const replay = page.locator('#history-replay');
          await replay.evaluate((node) => {
            for (let p = node.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
          });
          await replay.click();
          await ready();
          const replayed = await save();
          assert.equal(replayed.documents.length, builtProject.documents.length + 1);
          assert.equal(surgeryResultSignature(current(replayed).model), surgeryResultSignature(built.model));
          assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
        });
      }
      await t.test(
        'the mounted publication gate refuses an altered native color result without changing history',
        async () => {
          await page.evaluate(() => {
            window.saved = undefined;
          });
          await page.locator('#open').click();
          await ready();
          await page.locator('#pick-source').click();
          await page.selectOption('#pick-kind', 'face');
          await page.keyboard.press('Escape');
          await show();
          await page.locator('#preview-face-surgery').click();
          await page.waitForFunction(() => !document.getElementById('adopt-face-surgery').disabled);
          const before = await save();
          await page.evaluate(() => {
            window.tamperSurgery = true;
          });
          await page.locator('#adopt-face-surgery').click();
          await page.waitForFunction(() =>
            document.getElementById('surgery-preview-result').textContent.includes('Native result disagreed')
          );
          assert.equal(await page.locator('#adopt-face-surgery').isDisabled(), true);
          const after = await save();
          assert.deepEqual(after.documents, before.documents);
          assert.deepEqual(after.memories, before.memories);
          assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
        }
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
