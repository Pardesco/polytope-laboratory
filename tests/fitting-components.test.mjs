import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { eligibleFittingSource, FITTING_DOMAIN_COPY } from '../ui/fitting-domain.mjs';
import { fittingResultText } from '../ui/fitting-report.mjs';
const { reveal } = createRequire(import.meta.url)('../scripts/smoke-helpers.cjs');
const cases = JSON.parse(readFileSync(new URL('./fixtures/condition-component-cases.json', import.meta.url), 'utf8'));

test('bounded generalized eligibility admits disjoint components and refuses connected/4D sources', () => {
  assert.equal(eligibleFittingSource(cases.tetrahedra), true);
  assert.equal(eligibleFittingSource(cases.pyramids), true);
  assert.equal(eligibleFittingSource({ ...cases.tetrahedra, edges: [...cases.tetrahedra.edges, [0, 4]] }), false);
  assert.equal(eligibleFittingSource({ ...cases.tetrahedra, dimension: 4, embeddingDimension: 4 }), false);
  assert.equal(eligibleFittingSource({ ...cases.tetrahedra, vertices: Array(65).fill([0, 0, 0]) }), false);
  assert.equal(eligibleFittingSource({ ...cases.tetrahedra, edges: [[0, 99]] }), false);
  assert.match(FITTING_DOMAIN_COPY, /2–8 disjoint convex/);
});

test('generalized report names separation, selected IDs and limited numerical scope', () => {
  const text = fittingResultText({
    status: 'constraints-satisfied',
    model: {},
    evidence: {
      converged: true,
      requestedConstraintsSatisfied: true,
      residuals: { maximum: 0, rms: 0, maximumPlanarity: 0 },
      solverTermination: { success: true, evaluations: 4 },
      parameters: { face_ids: [0, 4] },
      generalizedComponents: {
        maps: [{}, {}],
        qualification: { separations: [{ gapMeanEdgeUnits: 2 }, { gapMeanEdgeUnits: 3 }] },
      },
    },
  });
  assert.match(text, /2 components; vertex centroids preserved/);
  assert.match(text, /2.000e\+0 × source mean edge/);
  assert.match(text, /source faces 0, 4; edge\/area objectives remain global/);
  assert.match(text, /uniformity and near-miss classification are not established/);
});

test(
  'mounted common Fit faces preview/adopt/undo/save/reopen/replay keeps native generalized gates',
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
            return { path: 'fitting-components.polyproj' };
          },
          open: async () => structuredClone(window.openPayload),
          confirmProjectOpen: async () => true,
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      const ready = () =>
        page.waitForFunction(() => document.getElementById('cancel').hidden && document.querySelector('#evidence pre'));
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
      await ready();
      await page.locator('#welcome-close').click();
      if (await page.locator('body').evaluate((n) => n.classList.contains('inspector-hidden')))
        await page.locator('#toggle-inspector').click();
      const current = (project) => {
        const doc = project.documents[project.active];
        return doc.states[doc.cursor];
      };
      const save = async () => {
        const count = await page.evaluate(() => window.saveCount);
        await page.locator('#save').click();
        await page.waitForFunction((n) => window.saveCount > n, count);
        return page.evaluate(() => window.saved);
      };
      for (const [key, unresolved] of [
        ['tetrahedra', false],
        ['pyramids', true],
      ]) {
        const model = structuredClone(cases[key]);
        for (let start = 0; start < model.vertices.length; start += model.vertices.length / 2) {
          const part = model.vertices.slice(start, start + model.vertices.length / 2),
            center = [0, 1, 2].map((k) => part.reduce((s, p) => s + p[k], 0) / part.length);
          for (const p of part) for (let k = 0; k < 3; k++) p[k] = center[k] + (p[k] - center[k]) * [1.1, 0.9, 1.03][k];
        }
        const normalized = await compute({
          op: 'validate-project',
          params: {
            project: {
              format: 'polytope-laboratory',
              version: 1,
              active: 0,
              documents: [{ id: 'source', cursor: 0, states: [{ model, view: {}, notes: '' }] }],
            },
          },
        });
        const source = normalized.documents[0].states[0].model;
        await page.evaluate((model) => (window.openPayload = { model, path: model.name + '.off' }), source);
        await page.locator('#open').click();
        await ready();
        await page.waitForFunction((name) => document.getElementById('model-name').textContent === name, source.name);
        await page.locator('[data-panel="construct"]').click();
        await reveal(page, '#preview-fitting');
        assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
        assert.equal(await page.locator('#preview-fitting').evaluate((n) => !!n.closest('[data-expert]')), false);
        assert.equal(await page.locator('#fitting-source-domain').isVisible(), true);
        await page.selectOption('#fitting-mode', 'regular-faces');
        await page.locator('#fitting-equal-areas').setChecked(unresolved);
        await page.locator('#preview-fitting').click();
        await page.waitForFunction(
          () =>
            document.getElementById('cancel-fitting').hidden &&
            document.getElementById('fitting-result').textContent.includes('components;')
        );
        const text = await page.locator('#fitting-result').innerText();
        assert.match(text, /uniformity and near-miss classification are not established/);
        if (unresolved) {
          assert.match(text, /Not converged.*tolerance not met/);
          assert.equal(await page.locator('#adopt-fitting').isDisabled(), true);
          await page.locator('#accept-fitting-near-miss').check();
        } else assert.match(text, /Converged.*tolerance met/);
        await page.locator('#adopt-fitting').click();
        await page.waitForFunction(() => document.getElementById('cancel-fitting').hidden);
        await ready();
        const project = await save(),
          fitted = current(project).model,
          e = fitted.metadata.geometryFitting;
        assert.equal(e.adoption, unresolved ? 'valid-near-miss' : 'constraints-satisfied');
        assert.equal(e.geometricValidity.passed, true);
        assert.equal(e.requestedConstraintsSatisfied, !unresolved);
        assert.deepEqual(fitted.faces, source.faces);
        assert.deepEqual(fitted.edges, source.edges);
        await page.locator('#undo').click();
        await ready();
        assert.deepEqual(current(await save()).model, source);
        await page.locator('#redo').click();
        await ready();
        assert.deepEqual(current(await save()).model, fitted);
        await page.evaluate(
          () => (window.openPayload = { project: window.saved, path: 'fitting-components.polyproj' })
        );
        await page.locator('#open').click();
        await ready();
        assert.deepEqual(current(await save()).model, fitted);
        const count = (await save()).documents.length;
        await reveal(page, '#history-replay');
        await page.locator('#history-replay').click();
        await ready();
        const replayed = await save();
        assert.equal(replayed.documents.length, count + 1);
        assert.deepEqual(current(replayed).model, fitted);
        assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      }
      assert.deepEqual(errors, []);
      assert.equal(stderr, '');
    } finally {
      await browser?.close();
      await server.close();
      lines.close();
      engine.kill();
    }
  }
);
