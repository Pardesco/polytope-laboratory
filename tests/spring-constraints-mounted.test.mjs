import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const { reveal } = createRequire(import.meta.url)('../scripts/smoke-helpers.cjs');
const cases = JSON.parse(readFileSync(new URL('./fixtures/r8_spring_constraints.json', import.meta.url), 'utf8'));

test(
  'Expert-off spring constraints use native preview/adopt/undo/reopen/replay, and preserve conflict/invalid gates',
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
            { id: 'spring-fixture', cursor: 0, states: [{ model: cases.tetra, view: {}, notes: 'R8 spring note' }] },
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
      await page.addInitScript(() => {
        window.requests = [];
        window.saveCount = 0;
        window.previews = [];
        window.polytope = {
          engine: async (request) => {
            window.requests.push(structuredClone(request));
            const result = await window.nativeEngine(request);
            if (request.op === 'spring-relaxation-preview') window.previews.push(structuredClone(result));
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
          save: async (project) => {
            window.saved = await window.nativeEngine({ op: 'validate-project', params: { project } });
            window.saveCount++;
            return { path: 'r8-spring.polyproj' };
          },
          open: async () => structuredClone(window.openPayload),
          confirmProjectOpen: async () => true,
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      const ready = () =>
        page.waitForFunction(
          () =>
            document.getElementById('cancel').hidden &&
            document.querySelector('#evidence pre') &&
            document.getElementById('cancel-spring').hidden
        );
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
      await ready();
      await page.locator('#welcome-close').click();
      if (await page.locator('body').evaluate((n) => n.classList.contains('inspector-hidden')))
        await page.locator('#toggle-inspector').click();
      const current = (project) => {
        const d = project.documents[project.active];
        return d.states[d.cursor];
      };
      const save = async () => {
        const count = await page.evaluate(() => window.saveCount);
        await page.locator('#save').click();
        await page.waitForFunction((n) => window.saveCount > n, count);
        return page.evaluate(() => window.saved);
      };
      const show = async () => {
        await page.locator('[data-panel="construct"]').click();
        const card = page.locator('#construct-card-spring-settings');
        assert.equal(await card.isDisabled(), false);
        if (await card.isVisible()) await card.click();
        await reveal(page, '#spring-add-pair');
      };
      const openSource = async () => {
        await page.evaluate((project) => (window.openPayload = { project, path: 'r8-spring.polyproj' }), seed);
        await page.locator('#open').click();
        await ready();
        await page
          .waitForFunction(() => document.getElementById('model-name').textContent === 'R8 spring tetrahedron')
          .catch(async (error) => {
            const diagnostic = await page.evaluate(() => ({
              name: document.getElementById('model-name').textContent,
              status: document.getElementById('status').textContent,
              toast: document.getElementById('toast').textContent,
              requests: window.requests.slice(-3),
            }));
            throw Error(error.message + ' ' + JSON.stringify(diagnostic));
          });
        await show();
      };
      const add = async (length, weight) => {
        await page.locator('#spring-pair-a').fill('2');
        await page.locator('#spring-pair-b').fill('3');
        await page.locator('#spring-pair-length').fill(length);
        await page.locator('#spring-pair-weight').fill(weight);
        await page.locator('#spring-add-pair').click();
        await ready();
      };
      const solve = async () => {
        const count = await page.evaluate(() => window.previews.length);
        await page.locator('#preview-spring').click();
        await page.waitForFunction((n) => window.previews.length > n, count);
        await ready();
        return page.evaluate(() => window.previews.at(-1));
      };
      await openSource();
      for (const id of ['spring-add-pair', 'spring-add-pins', 'spring-pair-length', 'spring-pin-ids']) {
        assert.equal(await page.locator('#' + id).count(), 1);
        assert.equal(await page.locator('#' + id).isVisible(), true);
        assert.equal(await page.locator('#' + id).evaluate((n) => !!n.closest('[data-expert]')), false);
      }
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      await t.test(
        'expression pair plus source-position pin is read-only until adoption and survives history',
        async () => {
          await add('sqrt(1)', '3');
          await page.locator('#spring-pin-ids').fill('0');
          await page.locator('#spring-add-pins').click();
          const before = await save(),
            preview = await solve();
          assert.match(await page.locator('#spring-result').innerText(), /Targets satisfied/);
          assert.deepEqual(current(await save()), current(before));
          assert.equal(preview.adoption.publishable, true);
          const expected = {
            extra_springs: [{ vertices: [2, 3], length: 1, weight: 3 }],
            pins: [{ vertex: 0, position: [1, 1, 1] }],
          };
          assert.deepEqual(await page.locator('#spring-constraints').evaluate((n) => JSON.parse(n.value)), expected);
          assert.match(await page.locator('#spring-constraint-list').innerText(), /vertices 2, 3; target 1; weight 3/);
          await page.locator('#adopt-spring').click();
          await ready();
          const built = await save(),
            m = current(built).model;
          assert.deepEqual(m.vertices[0], [1, 1, 1]);
          assert.deepEqual(m.faces, cases.tetra.faces);
          assert.deepEqual(m.metadata.offColors, cases.tetra.metadata.offColors);
          for (const [a, b] of m.edges)
            assert.ok(Math.abs(Math.hypot(...m.vertices[a].map((x, i) => x - m.vertices[b][i])) - 1) < 1e-8);
          const node = built.documents[built.active].operationHistory.nodes.at(-1);
          assert.equal(node.op, 'spring-relaxation');
          assert.deepEqual(node.params.solver.extra_springs, expected.extra_springs);
          assert.deepEqual(node.params.solver.pins, expected.pins);
          await page.locator('#undo').click();
          await ready();
          assert.deepEqual(current(await save()).model, current(before).model);
          await page.locator('#redo').click();
          await ready();
          assert.deepEqual(current(await save()).model, m);
          await page.evaluate(() => (window.openPayload = { project: window.saved, path: 'r8-spring.polyproj' }));
          await page.locator('#open').click();
          await ready();
          assert.deepEqual(current(await save()).model, m);
          const count = (await save()).documents.length;
          await reveal(page, '#history-replay');
          await page.locator('#history-replay').click();
          await ready();
          const replayed = await save();
          assert.equal(replayed.documents.length, count + 1);
          assert.deepEqual(current(replayed).model, m);
        }
      );
      await t.test('conflicting duplicate spring remains valid and requires explicit residual acceptance', async () => {
        await openSource();
        await page.locator('#spring-remove-pair').click();
        await page.locator('#spring-clear-pins').click();
        await add('5/3', '3');
        const preview = await solve();
        assert.equal(preview.adoption.requiresExplicitNearMiss, true);
        assert.equal(await page.locator('#adopt-spring').isDisabled(), true);
        assert.match(await page.locator('#spring-result').innerText(), /Targets unresolved/);
        const r = preview.result;
        assert.equal(r.evidence.geometricValidity.passed, true);
        assert.ok(Math.abs(r.evidence.residuals.weightedSpringEnergy - 1 / 6) < 2e-6);
        await page.locator('#spring-accept-near-miss').check();
        await page.locator('#adopt-spring').click();
        await ready();
        const saved = await save(),
          m = current(saved).model;
        assert.equal(m.metadata.springOperation.adoption, 'valid-near-miss');
        assert.equal(m.metadata.springOperation.requestedConstraintsSatisfied, false);
        const replay = await compute({ op: 'recipe-replay', params: { document: saved.documents[saved.active] } });
        assert.deepEqual(current({ documents: [replay], active: 0 }).model, m);
      });
      await t.test(
        'all source-position pins expose unsatisfied targets, and collapsed pins cannot be accepted',
        async () => {
          await openSource();
          await page.locator('#spring-remove-pair').click();
          await page.locator('#spring-pin-ids').fill('0,1,2,3');
          await page.locator('#spring-add-pins').click();
          const fixed = await solve();
          assert.equal(fixed.adoption.publishable, true);
          assert.equal(fixed.adoption.constraintsSatisfied, false);
          assert.deepEqual(fixed.result.model.vertices, cases.tetra.vertices);
          await reveal(page, '#spring-constraints');
          await page
            .locator('#spring-constraints')
            .fill(JSON.stringify({ pins: cases.tetra.vertices.map((_, vertex) => ({ vertex, position: [0, 0, 0] })) }));
          await page.locator('#spring-constraints').dispatchEvent('change');
          const before = await save(),
            invalid = await solve();
          assert.equal(invalid.result.model, null);
          assert.equal(invalid.adoption.publishable, false);
          assert.match(await page.locator('#spring-result').innerText(), /Invalid realization/);
          assert.equal(await page.locator('#adopt-spring').isDisabled(), true);
          assert.equal(await page.locator('#spring-accept-near-miss').isDisabled(), true);
          assert.deepEqual(current(await save()), current(before));
        }
      );
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
