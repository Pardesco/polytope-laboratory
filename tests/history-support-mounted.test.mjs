import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

test('mounted History opens a legacy fixture, checks support, replays, branches and reports snapshot fallback without Expert mode', async () => {
  const engine = spawn('python', ['engine/server.py'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }),
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
  const server = await createServer({
    configFile: false,
    root: 'ui',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port: 0 },
  });
  let browser;
  try {
    const fixture = (
      await compute({ op: 'load', params: { path: path.resolve('tests/fixtures/history/polygon-prism-0.1.polyproj') } })
    ).project;
    await server.listen();
    browser = await chromium.launch({
      headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }),
      errors = [];
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.exposeFunction('nativeEngine', compute);
    await page.addInitScript((project) => {
      window.historyFixture = project;
      window.polytope = {
        engine: (request) => window.nativeEngine(request),
        cancel: async () => {},
        setDirty: async () => {},
        setWorkspaceAvailability: async () => {},
        onAction: (callback) => (window.menuAction = callback),
        libraries: async () => ({ libraries: [], errors: [] }),
        recoveryInfo: async () => null,
        startupInfo: async () => ({ hidden: false }),
        autosave: async () => {},
        recentFiles: async () => ({ files: [] }),
        confirmProjectOpen: async () => true,
        open: async () => ({
          project: await window.nativeEngine({
            op: 'validate-project',
            params: { project: structuredClone(window.historyFixture) },
          }),
          path: 'legacy.polyproj',
        }),
        save: async (project) => {
          window.historySaved = await window.nativeEngine({ op: 'validate-project', params: { project } });
          return { path: 'reviewed.polyproj' };
        },
      };
    }, fixture);
    await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
    await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
    await page.evaluate(() => {
      for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
      window.menuAction('open');
    });
    await page.waitForFunction(() => document.querySelectorAll('#history-list button').length === 2);
    assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
    const openHistory = async () => {
      if (!(await page.locator('#history-settings').evaluate((n) => n.open)))
        await page.locator('#history-settings>summary').click();
    };
    await openHistory();
    await page.locator('#history-check-support').click();
    await page.waitForFunction(() =>
      document.getElementById('history-support-status').textContent.includes('Retained algorithm version available')
    );
    assert.equal(await page.locator('#history-replay').isEnabled(), true);
    await page.locator('#history-replay').click();
    await page
      .waitForFunction(() => document.querySelectorAll('#document-tabs button').length === 2)
      .catch(async (error) => {
        throw Error(
          error.message +
            ' ' +
            JSON.stringify(
              await page.evaluate(() => ({
                status: document.getElementById('status').textContent,
                details: [...document.querySelectorAll('.toast-details pre')].map((n) => n.textContent),
                tabs: document.querySelectorAll('#document-tabs button').length,
              }))
            )
        );
      });
    await openHistory();
    await page.locator('#history-branch').click();
    await page.locator('#history-parameters').fill('{"height":4}');
    await page.locator('#history-parameters-apply').click();
    await page.waitForFunction(
      () =>
        !document.getElementById('history-parameters-dialog').open &&
        document.querySelectorAll('#document-tabs button').length === 3
    );
    await page.locator('#undo').click();
    await page.waitForFunction(
      () => document.querySelector('#history-list button.active') === document.querySelector('#history-list button')
    );
    await page.locator('#redo').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#history-list button.active') ===
        document.querySelector('#history-list button:last-child')
    );
    await page.evaluate(() => window.menuAction('save'));
    await page.waitForFunction(() => window.historySaved?.documents.length === 3);
    const branch = await page.evaluate(() => window.historySaved.documents[window.historySaved.active]);
    assert.equal(branch.operationHistory.nodes.at(-1).algorithmVersion, '0.1.0');
    assert.deepEqual(
      [...new Set(branch.states.at(-1).model.vertices.map((p) => p[2]))].sort((a, b) => a - b),
      [-2, 2]
    );
    assert.deepEqual(branch.operationHistory.nodes.slice(0, 2), fixture.documents[0].operationHistory.nodes);
    await page.evaluate(() => {
      window.historyFixture.documents[0].operationHistory.nodes[1].algorithmVersion = 'future-kernel';
      window.menuAction('open');
    });
    await page.waitForFunction(() => document.querySelectorAll('#document-tabs button').length === 1);
    await openHistory();
    await page.locator('#history-check-support').click();
    await page.waitForFunction(() =>
      document
        .getElementById('history-support-status')
        .textContent.includes('unsupported algorithm version future-kernel')
    );
    assert.equal(await page.locator('#history-replay').isEnabled(), false);
    assert.equal(await page.locator('#history-branch').isEnabled(), false);
    await page.locator('#history-list button').first().click();
    await page.locator('#history-check-support').click();
    await page.waitForFunction(() =>
      document.getElementById('history-support-status').textContent.includes('Recorded versions are available')
    );
    assert.equal(await page.locator('#history-replay').isEnabled(), true);
    assert.deepEqual(errors, []);
    assert.equal(stderr, '');
  } finally {
    await browser?.close();
    await server.close();
    lines.close();
    engine.kill();
    for (const job of pending.values()) job.reject(Error('Test complete.'));
  }
});
