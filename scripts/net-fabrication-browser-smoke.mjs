// Built renderer and real JSON-lines engine; no Electron or native dialogs.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const engine = spawn('python', ['-B', 'engine/server.py'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }),
  pending = new Map();
let next = 0,
  checks = 0;
const lines = createInterface({ input: engine.stdout });
lines.on('line', (line) => {
  const reply = JSON.parse(line),
    job = pending.get(reply.id);
  if (!job) return;
  pending.delete(reply.id);
  reply.ok ? job.resolve(reply.result) : job.reject(Error(reply.error));
});
engine.stderr.on('data', (data) => process.stderr.write(data));
const compute = (request) =>
  new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    engine.stdin.write(JSON.stringify({ ...request, id }) + '\n');
  });
const check = (actual, expected) => {
  assert.deepEqual(actual, expected);
  checks++;
};
const hidden = process.argv.includes('--hidden');
let server, browser;
try {
  const root = fileURLToPath(new URL('../dist', import.meta.url));
  server = createServer(async (request, response) => {
    try {
      const name = new URL(request.url, 'http://localhost').pathname,
        file = path.resolve(root, '.' + decodeURIComponent(name === '/' ? '/index.html' : name));
      if (!file.startsWith(root + path.sep)) throw Error('Invalid asset.');
      response.setHeader(
        'Content-Type',
        { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[path.extname(file)] ||
          'application/octet-stream'
      );
      response.end(await readFile(file));
    } catch {
      response.statusCode = 404;
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }),
    errors = [];
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.exposeFunction('nativeEngine', compute);
  await page.addInitScript((hidden) => {
    localStorage.setItem('polytope-welcome-v1', 'dismissed');
    window.polytope = {
      startupInfo: async () => ({ hidden }),
      engine: (request) => window.nativeEngine(request),
      cancel: async () => {},
      setDirty: async () => {},
      setWorkspaceAvailability: async () => {},
      onAction: () => {},
      libraries: async () => ({ libraries: [], errors: [] }),
      recoveryInfo: async () => null,
      autosave: async () => {},
      beginTextExport: async (options) => {
        window.exportOptions = options;
        return { id: 'fabrication-output' };
      },
      writeTextExport: async (id, data) => {
        window.exportedData = data;
        return { path: 'cut-list.csv' };
      },
      abortTextExport: async () => {},
    };
  }, hidden);
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.waitForFunction(
    () => document.getElementById('model-name')?.textContent === 'Tesseract' && document.getElementById('cancel').hidden
  );
  await page.locator('#toggle-inspector').click();
  await page.locator('[data-panel="net"]').click();
  check(await page.locator('#fabrication-measure-csv').isDisabled(), true);
  await page.locator('#search').fill('cube');
  await page.locator('#catalog [data-key="cube"]').click();
  await page.waitForFunction(
    () => document.getElementById('model-name').textContent === 'Cube' && document.getElementById('cancel').hidden
  );
  check(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), hidden);
  if (hidden) {
    await page.locator('#view-options > summary').click();
    await page.locator('#viewport-layout').selectOption('split');
    await page.locator('#view-options > summary').click();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  await page.locator('#net-length').fill('25.4');
  await page.locator('#net-length').press('Tab');
  await page.locator('#net-rebuild').click();
  await page.waitForFunction(
    () => !document.getElementById('net-pack').disabled && document.getElementById('cancel').hidden
  );
  check(await page.locator('#fabrication-measure-csv').isVisible(), true);
  check(await page.locator('#fabrication-measure-csv').evaluate((n) => n.closest('[data-expert]') === null), true);
  await page.locator('#fabrication-measure-csv').click();
  await page.waitForFunction(() => typeof window.exportedData === 'string' && document.getElementById('cancel').hidden);
  const csv = await page.evaluate(() => window.exportedData),
    rows = csv
      .trim()
      .split(/\r?\n/)
      .map((row) => row.split(',')),
    column = rows[0].indexOf('length_mm'),
    edges = rows.slice(1).filter((row) => row[0] === 'edge');
  check(edges.length, 12);
  check(
    edges.every((row) => Math.abs(Number(row[column]) - 25.4) < 1e-10),
    true
  );
  check(await page.evaluate(() => window.exportOptions.format), 'csv');
  await page.locator('#fabrication-presets > summary').click();
  check(await page.locator('#fabrication-custom').evaluate((n) => n.open), false);
  for (const [key, label] of [
    ['hinges', '12 hinge strips'],
    ['braces', '6 braces'],
    ['rosettes', '8 rosettes'],
  ]) {
    await page.locator('#fabrication-preset').selectOption(key);
    await page.locator('#fabrication-parts-preview').click();
    await page.waitForFunction(
      () =>
        !document.getElementById('fabrication-preview').hidden &&
        document.getElementById('cancel').hidden &&
        !document.getElementById('fabrication-parts-preview').disabled
    );
    check(
      await page
        .locator('#fabrication-status')
        .innerText()
        .then((text) => text.includes(label) && text.includes('residual')),
      true
    );
    check(
      await page.locator('#fabrication-page-image').evaluate(async (img) => {
        await img.decode();
        return img.naturalWidth > 0;
      }),
      true
    );
    check(
      await page
        .locator('#fabrication-page-status')
        .innerText()
        .then((text) => text.includes('210 × 297 mm')),
      true
    );
    check(
      await page
        .locator('#fabrication-page-image')
        .evaluate((img) => decodeURIComponent(img.src.split(',')[1]).includes('width="210mm" height="297mm"')),
      true
    );
    await page.locator('#fabrication-page-next').click();
    check(
      await page
        .locator('#fabrication-page-status')
        .innerText()
        .then((text) => text.startsWith('Sheet 2 of')),
      true
    );
    check(
      await page.locator('#fabrication-page-image').evaluate(async (img) => {
        await img.decode();
        return img.naturalWidth > 0;
      }),
      true
    );
  }
  check(await page.locator('#net-reinforcement-settings').isVisible(), hidden);
  check(await page.locator('#coincident-edge-assembly').isVisible(), hidden);
  check(await page.locator('#inspector-region').evaluate((n) => n.scrollWidth <= n.clientWidth + 1), true);
  check(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), hidden);
  await mkdir('build', { recursive: true });
  await page.screenshot({ path: `build/r5-net-fabrication-preview${hidden ? '-hidden' : ''}.png` });
  await page.locator('#net-paper-settings > summary').click();
  await page.locator('#net-paper').selectOption('letter');
  await page.locator('#net-pack').click();
  await page.waitForFunction(
    () => document.getElementById('cancel').hidden && !document.getElementById('net-packed-pdf').disabled
  );
  check(await page.locator('#fabrication-preview').evaluate((n) => n.hidden), true);
  check(errors, []);
  console.log(
    `PASS (${checks} assertions): ${hidden ? 'hidden-mode' : 'expert-off'} cube selection, face net, physical CSV, three native presets, decoded paged previews and invalidation. No Electron launched.`
  );
} catch (error) {
  console.error(error);
  if (browser)
    for (const context of browser.contexts())
      for (const page of context.pages()) console.error(await page.locator('body').innerText());
  throw error;
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  engine.kill();
  lines.close();
}
