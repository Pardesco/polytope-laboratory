import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const { reveal } = createRequire(import.meta.url)('../scripts/smoke-helpers.cjs');

test(
  'ordinary startup reaches common inspection, construction and appearance paths with Expert off',
  { timeout: 180000 },
  async (t) => {
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
            return { path: 'common-workflows.polytope' };
          },
          open: async () => ({ project: structuredClone(window.saved), path: 'common-workflows.polytope' }),
          confirmProjectOpen: async () => true,
        };
      });
      const address = 'http://127.0.0.1:' + server.httpServer.address().port;
      await page.goto(address);
      const ready = () =>
        page.waitForFunction(() => document.getElementById('cancel').hidden && document.querySelector('#evidence pre'));
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
      await ready();
      await page.locator('#welcome-close').click();
      if (await page.locator('body').evaluate((n) => n.classList.contains('inspector-hidden')))
        await page.locator('#toggle-inspector').click();
      const expertOff = async () =>
        assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      const visible = async (ids) => {
        for (const id of ids) {
          assert.equal(await page.locator('#' + id).count(), 1, id + ' retains one ID');
          assert.equal(await page.locator('#' + id).isVisible(), true, id + ' visible through mounted ancestors');
          assert.equal(
            await page.locator('#' + id).evaluate((n) => !!n.closest('[data-expert]')),
            false,
            id + ' is common'
          );
        }
      };
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
      const openAppearance = async () => {
        if (!(await page.locator('#surface-settings').evaluate((n) => n.open)))
          await page.locator('#surface-settings > summary').click();
      };
      const closeAppearance = async () => {
        if (await page.locator('#surface-settings').evaluate((n) => n.open))
          await page.locator('#surface-settings > summary').click();
      };
      const choose = async (key) => {
        await closeAppearance();
        if (await page.locator('#library-show-all').count()) await page.locator('#library-show-all').click();
        await page.locator('[data-key="' + key + '"]').click();
        await ready();
      };
      const replay = async (expected) => {
        const before = (await save()).documents.length;
        await page.locator('#history-settings > summary').click();
        await page.locator('#history-replay').click();
        await ready();
        const project = await save();
        assert.equal(project.documents.length, before + 1);
        assert.deepEqual(current(project).model, expected);
        await page.locator('#history-settings > summary').click();
      };
      await expertOff();

      await t.test(
        'Select opens the common picker and source cell Hide/Isolate/Front/Back retain topology',
        async () => {
          await visible(['pick-source']);
          await page.locator('#pick-source').click();
          await visible(['pick-kind']);
          assert.equal(await page.evaluate(() => document.activeElement.id), 'pick-kind');
          await page.selectOption('#pick-kind', 'cell');
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('#selection-kind').inputValue(), 'cell');
          await openAppearance();
          await page.locator('#appearance-cell-settings > summary').click();
          await visible(['visible-cell-id', 'hide-cell', 'isolate-cell', 'show-all-cells', 'cell-facing']);
          const source = current(await save()).model;
          await page.locator('#visible-cell-id').fill('1');
          await page.locator('#hide-cell').click();
          assert.equal(await page.locator('#cell-visibility-summary').innerText(), '7 / 8 visible');
          let snapshot = current(await save());
          assert.deepEqual(snapshot.view.hiddenCells, [1]);
          assert.deepEqual(snapshot.model, source);
          await page.locator('#show-all-cells').click();
          await page.locator('#visible-cell-id').fill('2');
          await page.locator('#isolate-cell').click();
          assert.equal(await page.locator('#cell-visibility-summary').innerText(), '1 / 8 visible');
          snapshot = current(await save());
          assert.equal(snapshot.view.isolatedCell, 2);
          assert.deepEqual(snapshot.model, source);
          await page.locator('#show-all-cells').click();
          for (const mode of ['hide-front', 'hide-back', 'front', 'back', 'all']) {
            await page.selectOption('#cell-facing', mode);
            await page.waitForFunction(() => !document.getElementById('cell-facing').disabled);
            snapshot = current(await save());
            assert.equal(snapshot.view.cellFacing, mode);
            assert.deepEqual(snapshot.model, source);
          }
          assert.equal(await page.locator('#cell-facing-result').isVisible(), false);
          await expertOff();
        }
      );

      await t.test(
        'Convex core is a common 4D/3D card and commits through undo, redo and validated save/reopen',
        async () => {
          await closeAppearance();
          await page.locator('[data-panel="construct"]').click();
          for (const [dimension, key] of [
            [4, 'tesseract'],
            [3, 'cube'],
          ]) {
            if (dimension === 3) await choose(key);
            await page.locator('[data-panel="construct"]').click();
            const back = page.locator('#construct-back-convex-core-settings');
            if (await back.isVisible()) await back.click();
            await visible(['construct-card-convex-core-settings']);
            await page.locator('#construct-card-convex-core-settings').click();
            await visible(['core-x', 'core-y', 'core-z', 'core-color-policy', 'make-convex-core']);
            assert.equal(await page.locator('#core-w').isVisible(), dimension === 4);
            const source = current(await save()).model;
            await page.locator('#make-convex-core').click();
            await page.waitForFunction(() => /convex core/i.test(document.getElementById('model-name').textContent));
            await ready();
            const built = current(await save()).model;
            assert.equal(built.dimension, dimension);
            assert.equal(built.vertices.length, source.vertices.length);
            await page.locator('#undo').click();
            await ready();
            assert.deepEqual(current(await save()).model, source);
            await page.locator('#redo').click();
            await ready();
            assert.deepEqual(current(await save()).model, built);
            await page.locator('#open').click();
            await ready();
            assert.deepEqual(current(await save()).model, built);
            await replay(built);
            await expertOff();
          }
          const ops = await page.evaluate(() =>
            window.requests.filter((r) => r.op === 'recipe-run').map((r) => r.params.operation)
          );
          assert.ok(ops.includes('convex-core-4d'));
          assert.ok(ops.includes('convex-core'));
        }
      );

      await t.test(
        'source-direction Zonohedron is common and its original controls commit undoable source-edge construction',
        async () => {
          await choose('cube');
          await page.locator('[data-panel="construct"]').click();
          const back = page.locator('#construct-back-convex-core-settings');
          if (await back.isVisible()) await back.click();
          await visible(['construct-card-source-zonohedron-settings']);
          await page.locator('#construct-card-source-zonohedron-settings').click();
          await visible(['zonohedron-feature', 'zonohedron-ids', 'zonohedron-length', 'make-source-zonohedron']);
          await page.selectOption('#zonohedron-feature', 'edges');
          await page.locator('#zonohedron-ids').fill('0,1,2');
          const source = current(await save()).model;
          await page.locator('#make-source-zonohedron').click();
          await page.waitForFunction(() => /zonohedron/i.test(document.getElementById('model-name').textContent));
          await ready();
          const built = current(await save()).model;
          assert.notEqual(built.id, source.id);
          assert.equal(built.dimension, 3);
          const request = await page.evaluate(() =>
            window.requests.find((r) => r.op === 'recipe-run' && r.params.operation === 'source-zonohedron')
          );
          assert.deepEqual(request.params.parameters.selections, [{ kind: 'edges', ids: [0, 1, 2] }]);
          await page.locator('#undo').click();
          await ready();
          assert.deepEqual(current(await save()).model, source);
          await page.locator('#redo').click();
          await ready();
          assert.deepEqual(current(await save()).model, built);
          await replay(built);
          await expertOff();
        }
      );

      await t.test(
        'common presentation and bump/environment choices persist, with advanced fields collapsed',
        async () => {
          await openAppearance();
          await visible(['vertex-style', 'edge-style', 'vertex-radius-slider', 'edge-radius-slider']);
          await page.selectOption('#vertex-style', 'sphere');
          await page.selectOption('#edge-style', 'cylinder');
          await page.locator('#material-effects-settings > summary').click();
          await visible([
            'effects-bump',
            'effects-reflection',
            'effects-environmentMode',
            'effects-apply',
            'effects-reset',
          ]);
          assert.equal(await page.locator('#appearance-effects-options').evaluate((n) => n.open), false);
          assert.equal(await page.locator('#effects-bumpStrength').isVisible(), false);
          await page.selectOption('#effects-bump', 'waves');
          await page.selectOption('#effects-reflection', 'studio');
          await page.selectOption('#effects-environmentMode', 'refraction');
          await page.locator('#effects-apply').click();
          await page.waitForFunction(() =>
            document.getElementById('effects-status').textContent.includes('Applied material effects')
          );
          let snapshot = current(await save());
          assert.equal(snapshot.view.vertexStyle, 'sphere');
          assert.equal(snapshot.view.edgeStyle, 'cylinder');
          assert.equal(snapshot.view.materialEffects.bump, 'waves');
          assert.equal(snapshot.view.materialEffects.environmentMode, 'refraction');
          assert.match(
            await page.locator('#material-effects-settings p').innerText(),
            /does not trace rays through the object/
          );
          await page.locator('#open').click();
          await ready();
          snapshot = current(await save());
          assert.equal(snapshot.view.materialEffects.bump, 'waves');
          assert.equal(await page.locator('#vertex-radius').isVisible(), false);
          assert.equal(await page.locator('#face-fill-rule').isVisible(), false);
          assert.equal(
            await page.locator('#construct-card-exact-section-settings').evaluate((n) => !!n.closest('[data-expert]')),
            true
          );
          for (const id of ['advanced-exact-arithmetic', 'advanced-symmetry-checks']) {
            assert.equal(await page.locator('#' + id).evaluate((n) => n.open), false);
            assert.equal(await page.locator('#' + id).getAttribute('data-expert'), '');
          }
          await expertOff();
          await page.setViewportSize({ width: 1280, height: 800 });
          await page.locator('#pick-source').click();
          await visible(['pick-kind']);
          await page.keyboard.press('Escape');
          await expertOff();
        }
      );

      await t.test('hidden startup and smoke reveal keep unchanged basic and expert IDs reachable', async () => {
        const hidden = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
        await hidden.exposeFunction('nativeEngine', compute);
        await hidden.addInitScript(() => {
          localStorage.setItem('polytope.expert-tools.v1', 'false');
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
        assert.equal(await hidden.locator('body').evaluate((n) => n.classList.contains('expert-mode')), true);
        for (const id of [
          'cell-facing',
          'hide-cell',
          'vertex-radius',
          'face-fill-rule',
          'effects-bump',
          'make-convex-core',
          'make-source-zonohedron',
          'pick-kind',
        ]) {
          assert.equal(await hidden.locator('#' + id).count(), 1, id);
          await reveal(hidden, '#' + id);
          assert.equal(await hidden.locator('#' + id).isVisible(), true, id);
        }
        await hidden.close();
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
