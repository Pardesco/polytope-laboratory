// Real renderer + JSON-lines engine; no Electron or native dialogs.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { reveal } = createRequire(import.meta.url)('./smoke-helpers.cjs');
const engine = spawn('python', ['engine/server.py'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }),
  pending = new Map();
let next = 0,
  checks = 0;
const lines = createInterface({ input: engine.stdout });
lines.on('line', (line) => {
  const result = JSON.parse(line),
    job = pending.get(result.id);
  if (!job) return;
  pending.delete(result.id);
  result.ok ? job.resolve(result.result) : job.reject(Error(result.error));
});
engine.stderr.on('data', (data) => process.stderr.write(data));
const compute = (request) =>
  new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    engine.stdin.write(JSON.stringify({ ...request, id }) + '\n');
  });
const check = (value, expected) => {
  assert.deepEqual(value, expected);
  checks++;
};
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } }),
    errors = [];
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.exposeFunction('nativeEngine', compute);
  await page.addInitScript(() => {
    window.polytope = {
      startupInfo: async () => ({ hidden: true }),
      engine: (request) => window.nativeEngine(request),
      cancel: async () => {},
      setDirty: async () => {},
      setWorkspaceAvailability: async () => {},
      onAction: (callback) => {
        window.menuAction = callback;
      },
      libraries: async () => ({ libraries: [], errors: [] }),
      recoveryInfo: async () => null,
      autosave: async () => {},
      discoveryMenu: async () => {},
      save: async (project) => {
        window.savedProject = project;
        return { path: 'overview.polyproj' };
      },
      open: async () => ({ project: window.savedProject, path: 'overview.polyproj' }),
    };
  });
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.waitForFunction(() =>
    document.querySelector('#analysis-overview-facts')?.textContent.includes('Symmetry order 384')
  );
  await page.locator('#toggle-inspector').click();
  await page.locator('[data-panel="info"]').click();
  check(await page.locator('#analysis-overview-name').innerText(), 'Tesseract');
  check(await page.locator('#analysis-overview-cells').innerText(), '8');
  check((await page.locator('#analysis-overview-facts').innerText()).includes('Every cell is a cube.'), true);
  check((await page.locator('#analysis-overview-facts').innerText()).includes('3 cubes meet at every edge.'), true);
  check((await page.locator('#analysis-overview-facts').innerText()).includes('Its dual is the 16-cell.'), true);
  check(await page.locator('#analysis-measurements').evaluate((n) => n.open), false);
  check(await page.locator('#analysis-overview').evaluate((n) => n.parentElement.firstElementChild === n), true);
  check(
    await page
      .locator('#analysis-details-heading')
      .evaluate((n) =>
        Boolean(
          n.compareDocumentPosition(document.getElementById('analysis-measurements')) & Node.DOCUMENT_POSITION_FOLLOWING
        )
      ),
    true
  );
  check(
    await page
      .locator('#analysis-type-evidence')
      .evaluate((n) =>
        Boolean(
          document.getElementById('analysis-details-heading').compareDocumentPosition(n) &
            Node.DOCUMENT_POSITION_FOLLOWING
        )
      ),
    true
  );
  check(await page.locator('#element-type-face-0').count(), 1);
  await reveal(page, '#element-type-face-0');
  await page.locator('#element-type-face-0').click();
  check((await page.locator('#selection-summary').innerText()).includes('face type'), true);
  await page.locator('#element-types-face').evaluate((n) => (n.open = false));
  await page.locator('#inspector-region').evaluate((n) => (n.scrollTop = 0));
  await mkdir('build', { recursive: true });
  await page.screenshot({ path: 'build/analysis-overview-1280.png' });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.screenshot({ path: 'build/analysis-overview-1600.png' });
  check(await page.locator('#analysis-overview').evaluate((n) => n.scrollWidth <= n.clientWidth), true);
  await page.locator('[data-panel="construct"]').click();
  await reveal(page, '#truncate');
  await page.locator('#truncate').click();
  await page.waitForFunction(() =>
    document.querySelector('#analysis-overview-description')?.textContent.includes('Edge-cut truncation')
  );
  check(await page.locator('#analysis-overview-family').innerText(), 'Constructed model');
  check((await page.locator('#analysis-overview-description').innerText()).includes('from Tesseract'), true);
  check((await page.locator('#analysis-overview-facts').innerText()).includes('Its dual is the 16-cell.'), false);
  await page.locator('#undo').click();
  await page.waitForFunction(() => document.querySelector('#analysis-overview-name')?.textContent === 'Tesseract');
  check((await page.locator('#analysis-overview-description').innerText()).includes('eight cubic cells'), true);
  await page.locator('#redo').click();
  await page.waitForFunction(
    () => document.querySelector('#analysis-overview-family')?.textContent === 'Constructed model'
  );
  check((await page.locator('#analysis-overview-description').innerText()).includes('Edge-cut truncation'), true);
  await page.locator('#save').click();
  await page.waitForFunction(() => !!window.savedProject);
  await page.locator('#open').click();
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('Opened'));
  check((await page.locator('#analysis-overview-description').innerText()).includes('Edge-cut truncation'), true);
  check(errors, []);
  console.log(
    `PASS (${checks} assertions): real native overview, 1280/1600 layout, type selection/reveal, construction, undo/redo and saved-project reopen.`
  );
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  engine.kill();
  lines.close();
}
