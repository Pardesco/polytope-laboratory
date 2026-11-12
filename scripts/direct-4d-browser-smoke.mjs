// Browser/native-engine qualification; never launches Electron or native dialogs.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

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
const check = (value, message) => {
  assert.ok(value, message);
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }),
    page = await context.newPage(),
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
      onAction: (callback) => (window.menuAction = callback),
      libraries: async () => ({ libraries: [], errors: [] }),
      recoveryInfo: async () => null,
      autosave: async () => {},
      discoveryMenu: async () => {},
      confirmProjectOpen: async () => true,
      save: async (project) => {
        window.savedProject = project;
        return { path: 'direct-4d.polyproj' };
      },
    };
  });
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.waitForFunction(() => document.getElementById('model-name')?.textContent === 'Tesseract');
  const angles = () => page.locator('#planes input').evaluateAll((nodes) => nodes.map((n) => Number(n.value)));
  const saved = async () => {
    await page.evaluate(() => {
      window.savedProject = null;
      window.menuAction('save');
    });
    await page.waitForFunction(() => !!window.savedProject);
    return page.evaluate(() => {
      const p = window.savedProject,
        d = p.documents[p.active];
      return d.states[d.cursor];
    });
  };
  const canvas = page.locator('#base-canvas canvas');
  await page.locator('#direct-4d-gizmo').waitFor();
  check(await page.locator('#direct-4d-hint').isVisible(), 'first-session hint');
  const bounds = await canvas.boundingBox(),
    gizmo = await page.locator('#direct-4d-gizmo').boundingBox();
  check(gizmo.x >= bounds.x && gizmo.x + gizmo.width <= bounds.x + bounds.width, 'gizmo fits 1280 viewport');
  check(gizmo.width < 180, 'compact gizmo');
  await mkdir('build', { recursive: true });
  await page.screenshot({ path: 'build/direct-4d-1280.png' });
  const start = await angles(),
    x = bounds.x + bounds.width * 0.4,
    y = bounds.y + bounds.height * 0.45;
  await page.keyboard.down('Shift');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 70, y - 25, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForFunction(
    (before) =>
      [...document.querySelectorAll('#planes input')].some((n, i) => Math.abs(Number(n.value) - before[i]) > 1),
    start
  );
  check(
    (await angles()).some((v, i) => Math.abs(v - start[i]) > 1),
    'Shift-drag changes shared sliders'
  );
  const afterDrag = await angles();
  await page.waitForTimeout(100);
  check(
    (await angles()).some((v, i) => Math.abs(v - afterDrag[i]) > 0.01),
    'drag has inertia'
  );
  await page.waitForTimeout(1000);
  const stable = await angles();
  await page.waitForTimeout(100);
  assert.deepEqual(await angles(), stable);
  checks++;
  const beforeWheel = await angles();
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 80);
  await page.keyboard.up('Shift');
  await page.waitForFunction(
    (before) =>
      [...document.querySelectorAll('#planes input')].some((n, i) => Math.abs(Number(n.value) - before[i]) > 0.1),
    beforeWheel
  );
  check(
    (await angles()).some((v, i) => Math.abs(v - beforeWheel[i]) > 0.1),
    'Shift-wheel changes angles'
  );
  const turned = await saved();
  check(
    turned.view.angles.some((v, i) => Math.abs(v - start[i]) > 1),
    'project saves shared rotation'
  );
  const beforeOrbit = await angles();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 55, y + 20, { steps: 8 });
  await page.mouse.up();
  assert.deepEqual(await angles(), beforeOrbit);
  checks++;
  const orbited = await saved();
  check(
    JSON.stringify(orbited.view.camera) !== JSON.stringify(turned.view.camera),
    'plain drag still orbits the 3D observer'
  );
  await page.locator('#direct-4d-xw').focus();
  const beforeKey = await angles();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    (before) =>
      [...document.querySelectorAll('#planes input')].some((n, i) => Math.abs(Number(n.value) - before[i]) > 0.1),
    beforeKey
  );
  check(
    (await angles()).some((v, i) => Math.abs(v - beforeKey[i]) > 0.1),
    'keyboard pad turns'
  );
  await page.locator('#direct-4d-straighten').click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#planes input')].every((n, i) => Number(n.value) === [0, 0, 24, 0, 18, 0][i])
  );
  assert.deepEqual(await angles(), [0, 0, 24, 0, 18, 0]);
  checks++;
  await page.locator('#rotation-settings').evaluate((n) => (n.open = true));
  await page.locator('#direct-4d-visible').uncheck();
  check(!(await page.locator('#direct-4d-gizmo').isVisible()), 'Rotation drawer hides gizmo');
  await page.locator('#direct-4d-visible').check();
  check(await page.locator('#direct-4d-gizmo').isVisible(), 'Rotation drawer restores gizmo');
  await page.locator('#rotation-settings').evaluate((n) => (n.open = false));
  await page.locator('#direct-4d-dismiss-hint').click();
  check(!(await page.locator('#direct-4d-hint').isVisible()), 'hint dismisses');
  check(
    (await page.evaluate(() => localStorage.getItem('polytope.direct4d.hint-dismissed'))) === '1',
    'dismissal persists'
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.screenshot({ path: 'build/direct-4d-1600.png' });
  const cube = await compute({ op: 'generate', params: { kind: 'regular', key: 'cube' } });
  check(turned.model.dimension === 4, 'test starts on a 4D model');
  // Opening a native-validated 3D document exercises the same saved-view path.
  await page.evaluate((cube) => {
    const project = {
      format: 'polytope-laboratory',
      version: 1,
      active: 0,
      documents: [
        {
          id: 'cube',
          name: 'Cube',
          cursor: 0,
          states: [
            {
              model: cube,
              notes: '',
              view: {
                angles: [0, 0, 0, 0, 0, 0],
                projection: 'orthographic',
                derivedMode: 'dual',
                sectionNormal: [0, 0, 1],
                sectionOffset: 0,
                faces: true,
                edges: true,
                vertices: false,
              },
            },
          ],
        },
      ],
    };
    window.polytope.open = async () => ({ project, path: 'cube.polyproj' });
    window.menuAction('open');
  }, cube);
  await page.waitForFunction(() => document.getElementById('model-name')?.textContent.toLowerCase() === 'cube');
  check(!(await page.locator('#direct-4d-gizmo').isVisible()), '3D hides gizmo');
  check(!(await page.locator('#direct-4d-hint').isVisible()), '3D hides hint');
  const before3D = await angles();
  await page.keyboard.down('Shift');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y + 20, { steps: 3 });
  await page.mouse.up();
  await page.mouse.wheel(0, 40);
  await page.keyboard.up('Shift');
  assert.deepEqual(await angles(), before3D);
  checks++;
  assert.deepEqual(errors, []);
  checks++;
  console.log(
    `PASS (${checks} checks): mounted 4D gestures, inertia, plain orbit, shared sliders/save, pads, Straighten, visibility, hint, 3D guard and 1280/1600 screenshots.`
  );
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  engine.kill();
  lines.close();
}
