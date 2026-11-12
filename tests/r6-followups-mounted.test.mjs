import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'vite';
import { chromium } from 'playwright';

async function withApp({ hidden = false, holdTypes = false }, verify) {
  const engine = spawn('python', ['-u', 'engine/server.py'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
    }),
    pending = new Map();
  let next = 0,
    releaseTypes;
  const typesGate = new Promise((resolve) => (releaseTypes = resolve));
  const lines = createInterface({ input: engine.stdout });
  lines.on('line', (line) => {
    const response = JSON.parse(line),
      job = pending.get(response.id);
    if (!job) return;
    pending.delete(response.id);
    response.ok ? job.resolve(response.result) : job.reject(Error(response.error));
  });
  const compute = async (request) => {
    const result = await new Promise((resolve, reject) => {
      const id = ++next;
      pending.set(id, { resolve, reject });
      engine.stdin.write(JSON.stringify({ ...request, id }) + '\n');
    });
    if (holdTypes && request.op === 'element-types') await typesGate;
    return result;
  };
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }),
      errors = [];
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.exposeFunction('nativeEngine', compute);
    await page.addInitScript((hidden) => {
      localStorage.setItem('polytope-welcome-v1', 'dismissed');
      window.polytope = {
        engine: (r) => window.nativeEngine(r),
        cancel: async () => {},
        setDirty: async () => {},
        setWorkspaceAvailability: async () => {},
        onAction: (fn) => (window.menuAction = fn),
        libraries: async () => ({ libraries: [], errors: [] }),
        recoveryInfo: async () => {
          window.startupReady = true;
          return null;
        },
        startupInfo: async () => ({ hidden }),
        autosave: async () => {},
        recentFiles: async () => ({ files: [] }),
        save: async (project) => {
          window.savedProject = project;
          return { path: 'followups.polyproj' };
        },
      };
    }, hidden);
    await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
    await page.waitForFunction(
      () => window.startupReady && document.getElementById('model-name')?.textContent === 'Tesseract'
    );
    await verify(page, releaseTypes);
    assert.deepEqual(errors, []);
  } finally {
    releaseTypes();
    await browser?.close();
    await server.close();
    engine.kill();
    lines.close();
  }
}

test('startup classification preserves the open builder and its selected diagram', { timeout: 120000 }, () =>
  withApp({ holdTypes: true }, async (page, releaseTypes) => {
    assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
    await page.evaluate(async () => {
      const { CoxeterBuilder } = await import('/coxeter-builder.mjs');
      const changed = CoxeterBuilder.prototype.changed;
      CoxeterBuilder.prototype.changed = function (...args) {
        window.builder = this;
        return changed.apply(this, args);
      };
      window.openCoxeterBuilder();
    });
    await page.locator('#coxeter-builder-family-F4').click();
    await page.locator('#coxeter-builder-node-1').click();
    await page.waitForFunction(() => !document.getElementById('coxeter-builder-open').disabled);
    const before = await page.evaluate(() => ({
      value: structuredClone(window.builder.value),
      sequence: window.builder.sequence,
      name: window.builder.nodes.name.textContent,
      receipt: window.builder.receipt.result.fingerprint,
    }));
    releaseTypes();
    await page.waitForFunction(() => document.querySelector('#element-types .panel-title'));
    assert.equal(await page.locator('#coxeter-builder').evaluate((n) => n.open), true);
    assert.deepEqual(
      await page.evaluate(() => ({
        value: structuredClone(window.builder.value),
        sequence: window.builder.sequence,
        name: window.builder.nodes.name.textContent,
        receipt: window.builder.receipt?.result.fingerprint,
      })),
      before
    );
    await page.locator('#coxeter-builder-close').click();
  })
);

for (const hidden of [false, true])
  test(
    `first whole-cell net owns the split-view transition (${hidden ? 'hidden' : 'normal'})`,
    { timeout: 120000 },
    () =>
      withApp({ hidden }, async (page) => {
        await page.waitForFunction(
          () => document.querySelector('#element-types .panel-title') && document.getElementById('cancel').hidden
        );
        await page.evaluate(async () => {
          const { CellNetEditor } = await import('/cell-net-editor.js'),
            { NetEditor } = await import('/net-editor.js');
          for (const Editor of [CellNetEditor, NetEditor]) {
            const evaluate = Editor.prototype.evaluate;
            Editor.prototype.evaluate = async function (...args) {
              const before = structuredClone(this.getState().view);
              try {
                return await evaluate.apply(this, args);
              } catch (error) {
                window.netFailure = {
                  message: error.message,
                  changes: [...new Set([...Object.keys(before), ...Object.keys(this.getState().view)])]
                    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(this.getState().view[key]))
                    .map((key) => [key, before[key], this.getState().view[key]]),
                };
                throw error;
              }
            };
          }
        });
        await page.locator('#toggle-inspector').click();
        await page.locator('[data-panel="net"]').click();
        assert.equal(await page.locator('#viewport-layout').inputValue(), 'single');
        await page.locator('#cell-net-build').click();
        await page.waitForFunction(
          () =>
            document.getElementById('cell-net-summary').textContent.includes('8 complete cells') || window.netFailure
        );
        assert.equal(await page.evaluate(() => window.netFailure), undefined);
        assert.match(await page.locator('#cell-net-summary').innerText(), /8 complete cells/);
        assert.equal(await page.locator('#viewport-layout').inputValue(), 'split');
        await page.locator('#save').click();
        await page.waitForFunction(() => window.savedProject);
        const saved = await page.evaluate(() => {
          const d = window.savedProject.documents[window.savedProject.active],
            s = d.states[d.cursor];
          return { states: d.states.length, layout: !!s.cellNetLayout, history: s.cellNetHistory?.states.length };
        });
        assert.deepEqual(saved, { states: 1, layout: true, history: 1 });
        await page.locator('#search').fill('cube');
        await page.locator('#catalog [data-key="cube"]').click();
        await page.waitForFunction(
          () => document.getElementById('model-name').textContent === 'Cube' && document.getElementById('cancel').hidden
        );
        await page.locator('#net-rebuild').click();
        await page.waitForFunction(() => !document.getElementById('net-pack').disabled || window.netFailure);
        assert.equal(await page.evaluate(() => window.netFailure), undefined);
        assert.match(await page.locator('#net-summary').innerText(), /6 faces/);
      })
  );
