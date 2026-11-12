import { htmlElement } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { RATIONAL_EXAMPLE_POINTS } from '../ui/precision-example.mjs';

const oracle = JSON.parse(readFileSync(new URL('./fixtures/rational_exact_chain.json', import.meta.url), 'utf8'));

test('mounted example supplies the independently specified rational box input', () => {
  assert.deepEqual(RATIONAL_EXAMPLE_POINTS, oracle.points);
});

test('native property reports expose exact scope, rounding residuals and transform loss in the mounted inspector', async () => {
  const program = `import json,sys,copy
from engine import server
from engine.operations import transform
o=json.load(sys.stdin)
box=server.dispatch({'op':'rational-hull','params':{'points':o['points']}})
dual=server.dispatch({'op':'rational-dual','model':box,'params':o['dual']})
section=server.dispatch({'op':'exact-surface-section','model':dual,'params':o['section']})
changed=transform(section,scale=2)
forged=copy.deepcopy(box);forged['certificate']['exhausted']=False
models=[box,dual,section,changed,forged]
print(json.dumps([{'model':m,'validation':server.dispatch({'op':'validate','model':m})} for m in models]))`;
  const records = JSON.parse(
    execFileSync('python', ['-B', '-c', program], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      input: JSON.stringify(oracle),
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60000,
    })
  );
  for (const record of records.slice(0, 3)) assert.equal(record.validation.precision.certificateStatus, 'revalidated');
  assert.equal(records[3].validation.precision.certificateStatus, 'absent');
  assert.equal(records[4].validation.precision.certificateStatus, 'unresolved');
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
    const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
    const html = readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8'),
      evidence = htmlElement(html, 'evidence-panel').replace(' hidden', '');
    await page.route('**/precision-chain', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body:
          '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><style>body{display:block;padding:16px}.inspector-panel{max-width:600px;padding:16px}</style>' +
          evidence,
      })
    );
    await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/precision-chain');
    await page.evaluate(async (records) => {
      const { organizeAdvanced } = await import('/nets-flow.mjs'),
        { renderPrecisionValidation, organizePrecisionEvidence } = await import('/precision-evidence.mjs');
      window.originalIds = [...document.querySelectorAll('[id]')].map((n) => [n.id, n]);
      organizeAdvanced(document);
      organizePrecisionEvidence(document);
      organizePrecisionEvidence(document);
      window.records = records;
      window.paint = (i) =>
        renderPrecisionValidation(document, records[i].model, records[i].validation, { open: true });
      window.paint(0);
    }, records);
    assert.equal(await page.locator('#precision-load-example').count(), 1);
    assert.equal(await page.locator('#precision-property-report').isVisible(), true);
    assert.match(
      await page.locator('#precision-property-report').textContent(),
      /complete convex facet support set relative to supplied rational input: exact/
    );
    assert.match(await page.locator('#precision-property-report').textContent(), /measurements: approximate/);
    assert.equal(await page.locator('#numeric-badge').textContent(), 'RATIONAL');
    await page.evaluate(() => window.paint(2));
    assert.equal(await page.locator('#numeric-badge').textContent(), 'RATIONAL CONSTRUCTION');
    assert.match(await page.locator('#precision-property-report').textContent(), /no filled-solid interior/);
    assert.match(
      await page.locator('#precision-property-report').textContent(),
      /Maximum display plane equation residual: 1\/54043195528445952/
    );
    await page.evaluate(() => window.paint(3));
    assert.match(
      await page.locator('#precision-property-report').textContent(),
      /exact signs and equalities of geometry predicates: unresolved/
    );
    assert.match(await page.locator('#precision-property-report').textContent(), /Ordinary float64 transform/);
    assert.match(await page.locator('#precision-property-report').textContent(), /Fallback unavailable/);
    assert.doesNotMatch(await page.locator('#validation-summary').textContent(), /scoped exact certificate/);
    await page.evaluate(() => window.paint(4));
    assert.match(await page.locator('#validation-summary').textContent(), /Exact evidence is unresolved/);
    assert.equal(await page.locator('#numeric-badge').textContent(), 'EXACT · UNRESOLVED');
    assert.match(await page.locator('#precision-property-report').textContent(), /property assertions/);
    assert.equal(await page.locator('#precision-property-report').count(), 1);
    assert.equal(
      await page.evaluate(() => window.originalIds.every(([id, node]) => document.getElementById(id) === node)),
      true
    );
    await page.evaluate(() => {
      document.body.classList.add('expert-mode');
      document.getElementById('advanced-exact-arithmetic').open = true;
    });
    await page.locator('#precision-load-example').click();
    assert.equal(
      await page.locator('#rational-points').inputValue(),
      oracle.points.map((row) => row.join(', ')).join('\n')
    );
    assert.equal(await page.locator('#rational-hull').count(), 1);
    assert.equal(await page.locator('#rational-dual').count(), 1);
  } finally {
    await browser?.close();
    await server.close();
  }
});
