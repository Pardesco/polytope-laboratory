import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { inheritanceStateSignature } from '../ui/subdivision-inheritance-controls.mjs';

test(
  'Expert-off subdivision inheritance previews/adopts a labeled RGBA cube at two levels, undo/reopen/replay',
  { timeout: 300000 },
  async (t) => {
    const fixture = JSON.parse(
      readFileSync(new URL('./fixtures/r8_subdivision_inheritance.json', import.meta.url), 'utf8')
    );
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
    let seed = await compute({
      op: 'validate-project',
      params: {
        project: {
          format: 'polytope-laboratory',
          version: 1,
          active: 0,
          documents: [
            {
              id: 'r8-inheritance-document',
              cursor: 0,
              states: [
                {
                  model: fixture.cube,
                  notes: 'Keep source notes.',
                  view: { coordinateUnit: 'mm', fillRule: 'even-odd' },
                },
              ],
            },
          ],
        },
      },
    });
    seed.documents[0] = await compute({
      op: 'recipe-run',
      params: {
        document: seed.documents[0],
        operation: 'element-content',
        parameters: { action: 'text', kind: 'face', index: 0, markup: fixture.markup },
      },
    });
    const server = await createServer({
      configFile: false,
      root: 'ui',
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { host: '127.0.0.1', port: 0, hmr: false },
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
      page.on('pageerror', (error) => errors.push(error.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript((seed) => {
        window.seed = seed;
        window.previews = [];
        window.saveCount = 0;
        window.requests = [];
        window.polytope = {
          engine: async (request) => {
            window.requests.push(structuredClone(request));
            const result = await window.nativeEngine(request);
            if (request.op === 'subdivision-inheritance-preview') window.previews.push(structuredClone(result));
            if (window.tamper && request.op === 'recipe-run' && request.params.operation === 'subdivide-faces')
              result.states[result.cursor].model.metadata.offColors.faces[0].values[3] = 254;
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
          open: async () => ({ project: structuredClone(window.saved ?? window.seed), path: 'inheritance.polyproj' }),
          confirmProjectOpen: async () => true,
          save: async (project) => {
            window.saved = await window.nativeEngine({ op: 'validate-project', params: { project } });
            window.saveCount++;
            return { path: 'inheritance.polyproj' };
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
        const card = page.locator('#construct-card-face-conway-settings');
        if (await card.isVisible()) await card.click();
        if (!(await page.locator('#face-conway-settings').evaluate((n) => n.open)))
          await page.locator('#face-conway-settings > summary').click();
      };
      for (const c of fixture.cases) {
        await t.test(c.key, async () => {
          await page.evaluate(() => {
            window.saved = undefined;
          });
          await page.locator('#open').click();
          await ready();
          await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Inheritance cube');
          await show();
          assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
          for (const id of ['inheritance-kind', 'preview-subdivision-inheritance', 'adopt-subdivision-inheritance']) {
            assert.equal(await page.locator('#' + id).count(), 1);
            assert.equal(await page.locator('#' + id).isVisible(), true);
            assert.equal(await page.locator('#' + id).evaluate((n) => !!n.closest('[data-expert]')), false);
          }
          const kind = c.operation === 'conway' ? 'conway' : c.operation === 'subdivide-edges' ? 'edges' : 'faces';
          await page.selectOption('#inheritance-kind', kind);
          if (kind === 'faces') {
            await page.selectOption('#face-method', c.parameters.method);
            await page.locator('#face-height').fill('1/100');
          }
          if (kind === 'conway') {
            await page.locator('#conway-notation').fill('k');
            const outer = page.locator('#face-conway-settings > .construct-more-options');
            if (!(await outer.evaluate((n) => n.open))) await outer.locator(':scope > summary').click();
            const more = page.locator('#conway-height').locator('xpath=ancestor::details[1]');
            if (!(await more.evaluate((n) => n.open))) await more.locator(':scope > summary').click();
            await page.locator('#conway-height').fill('');
          }
          if (kind === 'edges') {
            // Configure the existing edge fields through their own common panel.
            await page.locator('#construct-back-face-conway-settings').click();
            const card = page.locator('#construct-card-subdivision-settings');
            await card.click();
            if (!(await page.locator('#subdivision-settings').evaluate((n) => n.open)))
              await page.locator('#subdivision-settings > summary').click();
            await page.locator('#edge-divisions').fill(String(c.parameters.divisions));
            await page.locator('#subdivision-edge-ids').fill('');
            await page.locator('#construct-back-subdivision-settings').click();
            await show();
          }
          for (let level = 0; level < 2; level++) {
            const before = await save(),
              previewCount = await page.evaluate(() => window.previews.length);
            await page.locator('#preview-subdivision-inheritance').click();
            await page.waitForFunction((n) => window.previews.length > n, previewCount);
            await page.waitForFunction(() => !document.getElementById('adopt-subdivision-inheritance').disabled);
            const packet = await page.evaluate(() => window.previews.at(-1));
            assert.deepEqual(Object.values(packet.receipt.counts), c.counts[level]);
            assert.match(
              await page.locator('#subdivision-inheritance-status').innerText(),
              /source RGBA.*Float64 approximate/
            );
            const afterPreview = await save();
            assert.deepEqual(afterPreview.documents, before.documents);
            await page.locator('#adopt-subdivision-inheritance').click();
            await page.waitForFunction(() =>
              document.getElementById('subdivision-inheritance-status').textContent.includes('preview again')
            );
            await ready();
            const builtProject = await save(),
              built = current(builtProject);
            assert.equal(inheritanceStateSignature(built), inheritanceStateSignature(packet.state));
            assert.equal(built.view.elementContentDetached[0].document.entries[0].text.markup, fixture.markup);
            assert.equal(built.view.elementContentDetached.length, 1);
            assert.deepEqual(built.view.elementAnnotations.entries, []);
            assert.equal(
              await page.locator('#undo').isEnabled(),
              true,
              await page.evaluate(() =>
                JSON.stringify({
                  toast: document.getElementById('toast').textContent,
                  status: document.getElementById('status').title,
                  history: document.getElementById('history-list').textContent,
                })
              )
            );
            await page.locator('#undo').click();
            await ready();
            assert.equal(inheritanceStateSignature(current(await save())), inheritanceStateSignature(current(before)));
            await page.locator('#redo').click();
            await ready();
            assert.equal(inheritanceStateSignature(current(await save())), inheritanceStateSignature(built));
            await page.locator('#open').click();
            await ready();
            assert.equal(inheritanceStateSignature(current(await save())), inheritanceStateSignature(built));
            await show();
          }
          const built = await save(),
            replay = page.locator('#history-replay');
          await replay.evaluate((node) => {
            for (let p = node.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
          });
          await replay.click();
          await ready();
          const replayed = await save();
          assert.equal(replayed.documents.length, built.documents.length + 1);
          assert.equal(inheritanceStateSignature(current(replayed)), inheritanceStateSignature(current(built)));
        });
      }
      await t.test('altered adoption is refused before history replacement', async () => {
        await page.evaluate(() => {
          window.saved = undefined;
        });
        await page.locator('#open').click();
        await ready();
        await show();
        await page.selectOption('#inheritance-kind', 'faces');
        await page.selectOption('#face-method', 'centroid');
        await page.locator('#preview-subdivision-inheritance').click();
        await page.waitForFunction(() => !document.getElementById('adopt-subdivision-inheritance').disabled);
        const before = await save();
        await page.evaluate(() => {
          window.tamper = true;
        });
        await page.locator('#adopt-subdivision-inheritance').click();
        await page.waitForFunction(() =>
          document.getElementById('subdivision-inheritance-status').textContent.includes('Native result disagreed')
        );
        assert.deepEqual((await save()).documents, before.documents);
        assert.equal(await page.locator('#adopt-subdivision-inheritance').isDisabled(), true);
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
