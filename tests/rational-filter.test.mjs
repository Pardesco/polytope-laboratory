import { htmlElement } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { RATIONAL_FILTER_POINTS } from '../ui/rational-filter-example.mjs';

const oracle = JSON.parse(readFileSync(new URL('./fixtures/rational_raised_corner.json', import.meta.url), 'utf8'));
function native(request) {
  const child = spawnSync('python', ['-B', '-u', 'engine/server.py'], {
    input: JSON.stringify(request) + '\n',
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    timeout: 30000,
    env: { ...process.env, PYTHONUTF8: '1', OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
  });
  assert.equal(child.status, 0, child.stderr);
  const packet = JSON.parse(child.stdout.trim());
  if (!packet.ok) throw Error(packet.error);
  return packet.result;
}

test('con-03-rational-raised-corner example matches the literal independent oracle', () => {
  assert.deepEqual(RATIONAL_FILTER_POINTS, oracle.points);
});

test('mounted existing NumericEntry hull action constructs and explains the bounded native fallback', async () => {
  const server = await createServer({
    configFile: false,
    root: 'ui',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port: 0 },
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1000, height: 1100 } });
    const html = readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8'),
      evidence = htmlElement(html, 'evidence-panel').replace(' hidden', '');
    await page.route('**/rational-filter', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body:
          '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><style>body{display:block;padding:16px}.inspector-panel{max-width:600px;padding:16px}</style>' +
          evidence,
      })
    );
    const calls = [];
    await page.exposeFunction('native', (request) => {
      calls.push(request);
      return native(request);
    });
    await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/rational-filter');
    await page.evaluate(async () => {
      const { organizeAdvanced } = await import('/nets-flow.mjs'),
        { organizePrecisionEvidence, renderPrecisionValidation } = await import('/precision-evidence.mjs');
      const { WorkspaceNumericControls } = await import('/workspace-numeric-controls.mjs');
      window.originalIds = [...document.querySelectorAll('[id]')].map((n) => [n.id, n]);
      organizeAdvanced(document);
      organizePrecisionEvidence(document);
      organizePrecisionEvidence(document);
      const doc = {
          id: 'initial',
          cursor: 0,
          states: [
            {
              model: { id: 'initial', dimension: 3, vertices: [[0, 0, 0]], edges: [], faces: [], cells: [] },
              view: {},
            },
          ],
        },
        project = { active: 0, documents: [doc] };
      const context = {
        getState: () => project.documents[project.active].states[0],
        getDocument: () => project.documents[project.active],
        getProject: () => project,
        isExporting: () => false,
        getInput: (id) => document.getElementById(id),
        evaluateMany: async (expressions, { mode }) =>
          (await window.native({ op: 'expression-batch', params: { expressions: [...expressions], mode } })).values,
        run: (op, params, model) => window.native({ op, params, model }),
        addDocument: (model) => {
          project.documents.push({ id: model.id, cursor: 0, states: [{ model, view: {} }] });
          project.active = project.documents.length - 1;
          window.result = model;
        },
      };
      const controls = new WorkspaceNumericControls(context);
      document.getElementById('rational-hull').onclick = () => {
        window.pending = controls
          .hull(true)
          .then(async (model) => {
            const validation = await window.native({ op: 'validate', model });
            renderPrecisionValidation(document, model, validation, { open: true });
            window.done = true;
          })
          .catch((error) => {
            window.failure = error.message;
            window.done = true;
          });
      };
      document.body.classList.add('expert-mode');
      document.getElementById('advanced-exact-arithmetic').open = true;
    });
    assert.equal(await page.locator('#precision-load-filter-example').count(), 1);
    await page.locator('#precision-load-filter-example').click();
    assert.equal(
      await page.locator('#rational-points').inputValue(),
      oracle.points.map((row) => row.join(', ')).join('\n')
    );
    await page.locator('#rational-hull').click();
    await page.waitForFunction(() => window.done);
    assert.equal(await page.evaluate(() => window.failure), undefined);
    assert.deepEqual(
      await page.evaluate(() => ['vertices', 'edges', 'faces', 'cells'].map((k) => window.result[k].length)),
      oracle.counts
    );
    assert.deepEqual(
      calls.map((r) => r.op),
      ['expression-batch', 'rational-hull', 'validate']
    );
    assert.equal(calls[0].params.mode, 'rational');
    assert.deepEqual(calls[1].params.points, oracle.points);
    await page.evaluate(() => document.body.classList.remove('expert-mode'));
    assert.equal(await page.locator('#precision-property-report').isVisible(), true);
    const report = await page.locator('#precision-property-report').textContent();
    assert.match(report, /Property guarantees — revalidated/);
    assert.match(report, /Bounded rational fallback: Bounded XYZ/);
    assert.match(report, /General floating hulls are not certified/);
    assert.match(report, /measurements: approximate/);
    assert.ok(report.includes(oracle.coordinateRoundingError));
    assert.ok(report.includes(oracle.supportEquationRoundingResidual));
    assert.equal(await page.locator('#numeric-badge').textContent(), 'RATIONAL');
    assert.equal(
      await page.evaluate(() => window.originalIds.every(([id, node]) => document.getElementById(id) === node)),
      true
    );
  } finally {
    await browser?.close();
    await server.close();
  }
});
