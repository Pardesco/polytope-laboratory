const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { createServer } = require('node:http');
const { readFile, mkdir } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'),
  artifacts = path.join(root, 'artifacts/appearance-sheet'),
  dist = path.join(root, 'dist');
async function main() {
  await mkdir(artifacts, { recursive: true });
  const server = createServer(async (request, response) => {
    try {
      const name = decodeURIComponent(request.url.split('?')[0]),
        file = path.resolve(dist, '.' + (name === '/' ? '/index.html' : name));
      if (!file.startsWith(dist + path.sep)) {
        response.writeHead(403).end();
        return;
      }
      const content = await readFile(file),
        type =
          { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(file)] ??
          'application/octet-stream';
      response.writeHead(200, { 'Content-Type': type });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const engine = spawn('python', ['-B', 'engine/server.py'], { cwd: root, stdio: ['pipe', 'pipe', 'inherit'] });
  const pending = new Map();
  createInterface({ input: engine.stdout }).on('line', (line) => {
    const value = JSON.parse(line),
      job = pending.get(value.id);
    pending.delete(value.id);
    if (value.ok) job?.resolve(value.result);
    else job?.reject(Error(value.error));
  });
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.exposeFunction(
      '__engine',
      (request, id) =>
        new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
          engine.stdin.write(JSON.stringify({ ...request, id }) + '\n');
        })
    );
    await page.addInitScript(() => {
      window.polytope = new Proxy(
        {
          engine: (request, id) => window.__engine(request, id),
          startupInfo: async () => ({ hidden: true, fullscreen: false }),
          libraries: async () => ({ libraries: [], errors: [] }),
          save: async (project) => {
            window.__saved = await window.__engine(
              { op: 'validate-project', params: { project } },
              crypto.randomUUID()
            );
            return { path: 'appearance-review.polytope' };
          },
          open: async () => ({ project: window.__saved, path: 'appearance-review.polytope' }),
          confirmProjectOpen: async () => true,
          recentFiles: async () => ({ files: [] }),
          recoveryInfo: async () => null,
          takeOpenRequest: async () => null,
        },
        { get: (target, key) => target[key] ?? (key.startsWith('on') ? () => () => {} : async () => null) }
      );
    });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
    await page.locator('#auto-rotate').click();
    await page.locator('#expert-tools').evaluate((n) => n.click());
    await page.locator('#toggle-inspector').click();
    await page.locator('#fit-view').click();
    await page.screenshot({ path: path.join(artifacts, 'before-open.png') });
    const full = await page.locator('#base-canvas').boundingBox();
    await page.locator('#surface-settings > summary').click();
    await page.waitForFunction(
      () => document.querySelector('.appearance-sheet-slot').getBoundingClientRect().width > 200
    );
    const canvas = await page.locator('#base-canvas').boundingBox(),
      sheet = await page.locator('.appearance-sheet').boundingBox();
    assert.ok(canvas.width < full.width - 200);
    assert.ok(canvas.x + canvas.width <= sheet.x);
    assert.ok(Math.abs(canvas.y - sheet.y) < 3);
    assert.ok(Math.abs(canvas.height - sheet.height) < 3);
    assert.equal(await page.locator('#vertex-radius').isVisible(), false);
    assert.equal(await page.locator('#face-fill-rule').isVisible(), false);
    assert.equal(await page.locator('#vertex-radius-slider').isVisible(), true);
    await page.screenshot({ path: path.join(artifacts, 'after-open.png') });
    await page.locator('#base-canvas').click({ position: { x: 40, y: 40 } });
    assert.equal(await page.locator('#surface-settings').evaluate((n) => n.open), true);
    await page.locator('#vertex-radius-slider').fill('650');
    assert.equal(
      await page.locator('#vertex-radius').inputValue(),
      await page.locator('#vertex-radius-output').textContent()
    );
    await page.locator('#edge-radius-slider').fill('700');
    assert.equal(
      await page.locator('#edge-radius').inputValue(),
      await page.locator('#edge-radius-output').textContent()
    );
    await page.locator('#surface-opacity').fill('0.65');
    assert.equal(await page.locator('#surface-opacity-output').textContent(), '65%');
    await page.locator('#edges-visible').uncheck();
    assert.equal(await page.locator('#edges-visible').isChecked(), false);
    await page.locator('#style-reset').click();
    assert.equal(await page.locator('#edges-visible').isChecked(), true);
    assert.equal(await page.locator('#vertex-radius-output').textContent(), '0.012');
    await page.locator('#surface-settings .chrome-drawer-close').click();
    await page.waitForFunction(
      (w) => document.getElementById('base-canvas').getBoundingClientRect().width >= w - 1,
      full.width
    );
    await page.locator('#surface-settings > summary').click();
    await page.locator('#vertex-radius-slider').focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#surface-settings').evaluate((n) => n.open), false);
    assert.equal(
      await page.evaluate(() => document.activeElement === document.querySelector('#surface-settings > summary')),
      true
    );
    await page.locator('#surface-settings > summary').click();
    await page.locator('#rotation-settings > summary').click();
    assert.equal(await page.locator('#surface-settings').evaluate((n) => n.open), false);
    await page.keyboard.press('Escape');
    await page.locator('#expert-tools').evaluate((n) => n.click());
    await page.locator('#surface-settings > summary').click();
    await page.locator('#appearance-expert-settings > summary').click();
    assert.equal(await page.locator('#vertex-radius').isVisible(), true);
    assert.equal(await page.locator('#face-fill-rule').isVisible(), true);
    await page.locator('#vertex-radius').fill('1/50');
    await page.locator('#vertex-radius').press('Tab');
    await page.waitForFunction(() => document.getElementById('vertex-radius-output').textContent === '0.02');
    assert.equal(await page.locator('#vertex-radius-slider').isDisabled(), false);
    await page.locator('#edge-radius').fill('1/100');
    await page.locator('#edge-radius').press('Tab');
    await page.waitForFunction(() => document.getElementById('edge-radius-output').textContent === '0.01');
    assert.equal(await page.locator('#edge-radius-slider').isDisabled(), false);
    await page.locator('#save').click();
    await page.waitForFunction(() => Boolean(window.__saved));
    const saved = await page.evaluate(() => window.__saved);
    assert.equal(saved.documents[0].states[0].view.vertexRadius, 0.02);
    assert.equal(saved.documents[0].states[0].view.edgeRadius, 0.01);
    await page.locator('#style-reset').click();
    await page.locator('#open').click();
    await page.waitForFunction(() => document.getElementById('vertex-radius-output').textContent === '0.02');
    assert.equal(await page.locator('#edge-radius-output').textContent(), '0.01');
    await page.screenshot({ path: path.join(artifacts, 'expert-open.png') });
    await page.setViewportSize({ width: 1280, height: 800 });
    const smaller = await page.locator('#base-canvas').boundingBox(),
      smallSheet = await page.locator('.appearance-sheet').boundingBox();
    assert.ok(smaller.x + smaller.width <= smallSheet.x + 1);
    await page.screenshot({ path: path.join(artifacts, 'narrow-open.png') });
    await page.evaluate(() => {
      const input = document.getElementById('viewport-layout');
      input.value = 'split';
      input.dispatchEvent(new Event('change'));
    });
    await page.waitForFunction(() => document.querySelector('#views .derived').getBoundingClientRect().width > 0);
    const split = await page.locator('#views').boundingBox(),
      splitSheet = await page.locator('.appearance-sheet').boundingBox();
    assert.ok(split.x + split.width <= splitSheet.x);
    await page.screenshot({ path: path.join(artifacts, 'split-open.png') });
    await page.locator('#surface-settings .chrome-drawer-close').click();
    await page.locator('[data-key="cube"]').click();
    await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Cube');
    await page.locator('#surface-settings > summary').click();
    assert.equal(await page.locator('#cell-shrink').isDisabled(), true);
    assert.equal(await page.locator('#vertex-radius-slider').isEnabled(), true);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', assertions: 29, full, canvas, sheet, smaller, errors }));
  } finally {
    await browser?.close();
    engine.kill();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
