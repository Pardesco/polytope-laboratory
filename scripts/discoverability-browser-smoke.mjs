// Browser qualification of mounted controls against the real JSON-lines engine.
// Native file dialogs/menu delivery remain the desktop lead's qualification.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';
const engine = spawn('python', ['engine/server.py'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }),
  pending = new Map();
let next = 0;
const lines = createInterface({ input: engine.stdout });
lines.on('line', (line) => {
  const result = JSON.parse(line),
    job = pending.get(result.id);
  if (!job) return;
  pending.delete(result.id);
  if (result.ok) job.resolve(result.result);
  else job.reject(Error(result.error));
});
engine.stderr.on('data', (data) => process.stderr.write(data));
function compute(request) {
  return new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    engine.stdin.write(JSON.stringify({ ...request, id }) + '\n');
  });
}
let server, browser;
try {
  const root = fileURLToPath(new URL('../dist', import.meta.url));
  server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname,
        file = path.resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
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
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }),
    errors = [];
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.exposeFunction('nativeEngine', compute);
  await page.addInitScript(() => localStorage.setItem('polytope-welcome-v1', 'dismissed'));
  await page.addInitScript(() => {
    window.polytope = {
      engine: (request) => window.nativeEngine(request),
      cancel: async () => {},
      setDirty: async () => {},
      setWorkspaceAvailability: async () => {},
      onAction: (callback) => {
        window.menuAction = callback;
      },
      libraries: async () => ({ libraries: [], errors: [] }),
      recoveryInfo: async () => null,
      save: async (project) => {
        window.savedProject = project;
        return { path: 'browser-fixture.polyproj' };
      },
      autosave: async () => {},
      discoveryMenu: async () => {},
    };
  });
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.waitForFunction(() => document.getElementById('model-name')?.textContent === 'Tesseract');
  async function command(query) {
    await page.keyboard.press('Control+k');
    await page.locator('#command-query').fill(query);
    await page.keyboard.press('Enter');
  }
  await command('Model scale');
  await page.waitForFunction(() => document.activeElement.id === 'model-scale');
  assert.equal(await page.locator('#construct-panel').isVisible(), true);
  assert.equal(await page.locator('#transform-model-settings').evaluate((node) => node.open), true);
  assert.equal(await page.locator('body').evaluate((node) => node.classList.contains('inspector-hidden')), false);
  await page.keyboard.press('F1');
  assert.equal(await page.locator('#help-topic h3').innerText(), 'Constructions and source domains');
  await page.evaluate(() => window.menuAction('commands'));
  assert.equal(await page.locator('#command-palette').evaluate((node) => node.open), false);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'model-scale');
  await page.locator('#construct-pane-transform-model-settings .construct-pane-help').click();
  assert.equal(await page.locator('#help-topic h3').innerText(), 'Constructions and source domains');
  await page.keyboard.press('Escape');
  await page.locator('#toggle-inspector').focus();
  await page.keyboard.press('Shift+/');
  assert.equal(await page.locator('#shortcut-sheet').evaluate((node) => node.open), true);
  assert.match(await page.locator('#shortcut-list').innerText(), /Swap with memory slot 1–9/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+p');
  assert.equal(await page.locator('#command-palette').evaluate((node) => node.open), true);
  await page.keyboard.press('Escape');
  await command('Edit model information');
  await page.waitForFunction(() => document.activeElement.id === 'metadata-title');
  for (const [key, value] of Object.entries({
    title: 'Research tesseract',
    author: 'Ada',
    description: 'Two lines\nNotes',
    reference: 'https://example.test/#citation',
    tags: 'regular, 4D',
    license: 'CC BY',
    source: 'Offline research',
  }))
    await page.locator('#metadata-' + key).fill(value);
  await page.locator('#metadata-save').click();
  assert.equal(await page.locator('#model-name').innerText(), 'Research tesseract');
  await page.locator('[data-panel="info"]').click();
  await page.locator('#model-information-summary').evaluate((node) => (node.open = true));
  assert.match(await page.locator('#model-information-summary dl').innerText(), /CC BY/);
  await command('Save project');
  await page.waitForFunction(() => !!window.savedProject);
  const saved = await page.evaluate(() => window.savedProject);
  const validated = await compute({ op: 'validate-project', params: { project: saved } });
  assert.deepEqual(validated.documents[0].states[0].view.documentMetadata.tags, ['regular', '4D']);
  await command('4D projection: Perspective');
  assert.equal(await page.locator('#projection').inputValue(), 'perspective');
  await command('Reflect first coordinate');
  await page.waitForFunction(() => document.querySelectorAll('#history-list button').length === 2);
  assert.equal(await page.locator('#model-name').innerText(), 'Research tesseract');
  await command('Guide: Model information');
  assert.equal(await page.locator('#help-topic h3').innerText(), 'Model information');
  await page.keyboard.press('Escape');
  await command('Open: 24-cell');
  await page.waitForFunction(() => document.getElementById('model-name')?.textContent === '24-cell');
  await page.keyboard.press('Control+k');
  await page.locator('#command-query').fill('Undo geometry');
  assert.equal(await page.locator('#command-results [role="option"]').first().getAttribute('aria-disabled'), 'true');
  assert.match(await page.locator('#command-results').innerText(), /first history step/);
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#command-palette').evaluate((node) => node.open), true);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const group = document.createElement('details');
    group.id = 'future-feature';
    group.innerHTML = '<summary>Future feature</summary><input id="future-field" aria-label="Future field">';
    document.getElementById('construct-panel').append(group);
  });
  await page.waitForFunction(() => !!document.querySelector('#future-feature .group-help'));
  await command('Future field');
  await page.waitForFunction(() => document.activeElement.id === 'future-field');
  assert.equal(await page.locator('#future-feature').evaluate((node) => node.open), true);
  assert.deepEqual(errors, []);
  console.log(
    'PASS (21 assertions): mounted palette, both shortcuts, help/F1, modal guards, focus, dynamic groups, metadata save/analysis, native validation, projection, history construction, full catalog and disabled commands.'
  );
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  engine.kill();
  lines.close();
}
