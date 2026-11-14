import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHyperbolicProfileBridge } from './helpers/hyperbolic-native-profile.mjs';

test(
  'mounted hyperbolic library, navigation, mixed projects, history and Euclidean isolation',
  { timeout: 180000 },
  async (t) => {
    const profileMode = process.env.POLYTOPE_HYPERBOLIC_POOL_PROFILE === '1';
    const profileBridge = profileMode ? createHyperbolicProfileBridge() : null;
    const measurements = [];
    const engine = profileMode
        ? null
        : spawn('python', ['engine/server.py'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }),
      pending = new Map();
    let next = 0,
      stderr = '';
    engine?.stderr.on('data', (d) => (stderr += d));
    if (engine)
      createInterface({ input: engine.stdout }).on('line', (line) => {
        const r = JSON.parse(line),
          p = pending.get(r.id);
        if (!p) return;
        pending.delete(r.id);
        r.ok ? p.resolve(r.result) : p.reject(Error(r.error));
      });
    const compute = profileBridge
      ? (request) => profileBridge.compute(request)
      : (request) =>
          new Promise((resolve, reject) => {
            const id = request.id ?? ++next;
            pending.set(id, {
              resolve: (value) => {
                resolve(value);
              },
              reject,
            });
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
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }),
        errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (message) => {
        if (message.type() === 'error') t.diagnostic(message.text());
      });
      await page.exposeFunction('nativeEngine', compute);
      await page.exposeFunction('nativeCancel', (id) => profileBridge?.cancel(id));
      await page.addInitScript(
        ({ hidden }) => {
          localStorage.setItem('polytope-welcome-v1', 'dismissed');
          window.engineEvents = [];
          window.polytope = {
            engine: async (r, id) => {
              const source = r.params?.source ?? r.params?.parameters?.source;
              window.engineEvents.push({
                op: r.op,
                key: source?.pqr?.join('') ?? (source?.type === 'manifold' ? 'small-cover' : null),
                ready: document.getElementById('hyperbolic-canvas')?.dataset.ready === 'true',
              });
              const result = await window.nativeEngine({ ...r, id });
              if (r.op === 'hyperbolic-patch' && r.params.rebase) {
                window.hyperbolicRebases = (window.hyperbolicRebases || 0) + 1;
                window.lastHyperbolicRebase = result;
              }
              return result;
            },
            cancel: async (id) => window.nativeCancel(id),
            setDirty: async () => {},
            setWorkspaceAvailability: async () => {},
            onAction() {},
            libraries: async () => ({ libraries: [], errors: [] }),
            recoveryInfo: async () => null,
            startupInfo: async () => ({ hidden }),
            autosave: async () => {},
            recentFiles: async () => ({ files: [] }),
            discoveryMenu: async () => {},
            save: async (p) => {
              window.savedProject = await window.nativeEngine({ op: 'validate-project', params: { project: p } });
              return { path: 'mixed.polyproj' };
            },
            open: async () => ({ project: structuredClone(window.savedProject), path: 'mixed.polyproj' }),
            confirmProjectOpen: async () => true,
            beginImageExport: async (id) => ({ id }),
            writeImageExport: async (id, image) => {
              window.savedImage = image;
              return { path: 'Hyperbolic.png' };
            },
            abortImageExport: async () => {},
          };
        },
        { hidden: profileMode }
      );
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      await page.waitForFunction(() => document.getElementById('model-name')?.textContent === 'Tesseract');
      await page.locator('#hyperbolic-library summary').click();
      const names = [
        'Order-4 dodecahedral honeycomb {5,3,4}',
        'Order-5 cubic honeycomb {4,3,5}',
        'Order-5 dodecahedral honeycomb {5,3,5}',
        'Order-3 icosahedral honeycomb {3,5,3}',
        'Dodecahedral small cover',
      ];
      for (const [index, key] of ['534', '435', '535', '353', 'small-cover'].entries()) {
        const start = Date.now();
        await page.locator('#hyperbolic-open-' + key).click();
        await page
          .waitForFunction((name) => document.getElementById('model-name')?.textContent === name, names[index], {
            timeout: 60000,
          })
          .catch(async (e) => {
            t.diagnostic(
              JSON.stringify(
                await page.evaluate(() => ({
                  name: document.getElementById('model-name').textContent,
                  status: document.getElementById('status')?.textContent,
                  details: [...document.querySelectorAll('.toast-details pre')].map((n) => n.textContent),
                }))
              )
            );
            t.diagnostic(JSON.stringify(errors));
            throw e;
          });
        await page.waitForFunction(() => document.getElementById('hyperbolic-canvas').dataset.ready === 'true');
        t.diagnostic(key + ' first mounted patch: ' + (Date.now() - start) + ' ms');
        const measurement = await page.evaluate(() =>
          JSON.parse(document.getElementById('hyperbolic-canvas').dataset.openingTiming)
        );
        measurements.push({ ...measurement, clickWallMs: Date.now() - start });
        assert.equal(measurement.requests.length, 1);
        assert.equal(measurement.requests[0].op, 'recipe-run');
        assert.ok(measurement.firstInstances > 0 && measurement.firstInstances <= 256);
        assert.ok(measurement.workerPrepMs >= 0 && measurement.renderMs >= 0);
        const premature = await page.evaluate(
          (key) =>
            window.engineEvents.filter((event) => event.key === key && event.op === 'hyperbolic-patch' && !event.ready),
          key
        );
        assert.deepEqual(premature, []);
        if (key === '435')
          await page.waitForFunction(
            (initial) => Number(document.getElementById('hyperbolic-canvas').dataset.preparedCells) >= initial,
            measurement.firstInstances
          );
        const status = await page.locator('#status').textContent();
        const details = await page.locator('.toast-details pre').allTextContents();
        assert.doesNotMatch(
          status,
          /cannot read|undefined|error|could not finish|failed/i,
          JSON.stringify({ status, details })
        );
        await page.locator('#hyperbolic-model').selectOption('klein');
        await page.locator('#hyperbolic-explore').click();
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('Escape');
        await page.locator('#hyperbolic-home').click();
        assert.equal(await page.locator('#base-canvas').isVisible(), false);
        for (const viewport of [
          { width: 1600, height: 1000 },
          { width: 1280, height: 800 },
        ]) {
          await page.setViewportSize(viewport);
          await page.waitForFunction(() => {
            const canvas = document.querySelector('#hyperbolic-canvas canvas'),
              host = document.getElementById('hyperbolic-canvas');
            return canvas && Math.abs(canvas.clientWidth - host.clientWidth) < 2;
          });
          const layout = await page.evaluate(() => {
            const rect = (selector) => {
              const r = document.querySelector(selector).getBoundingClientRect();
              return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
            };
            return {
              canvas: rect('#hyperbolic-canvas canvas'),
              viewport: rect('.workspace'),
              controls: rect('#hyperbolic-controls'),
              visible: document.getElementById('hyperbolic-controls').checkVisibility(),
              hints: [...document.querySelectorAll('#canvas-hint-slot,#direct-4d-gizmo,#direct-4d-hint,#explore-shape')]
                .filter((n) => n.checkVisibility())
                .map((n) => n.id),
            };
          });
          assert.ok(layout.canvas.width >= layout.viewport.width * 0.9, JSON.stringify({ viewport, layout }));
          assert.ok(layout.controls.height > 0 && layout.visible, JSON.stringify(layout));
          assert.ok(layout.controls.bottom <= layout.canvas.top + 1, JSON.stringify(layout));
          assert.deepEqual(layout.hints, []);
          if (!profileMode && ['534', 'small-cover'].includes(key)) {
            await mkdir('artifacts/hyperbolic-integration', { recursive: true });
            await page.screenshot({ path: `artifacts/hyperbolic-integration/after-${key}-${viewport.width}.png` });
          }
        }
        assert.doesNotMatch(
          await page.locator('#status').textContent(),
          /cannot read|undefined|error|could not finish|failed/i
        );
      }
      await page.locator('#hyperbolic-explore').click();
      await page.keyboard.down('KeyW');
      await page
        .waitForFunction(() => window.hyperbolicRebases >= 2, null, { timeout: 30000 })
        .catch(async (error) => {
          t.diagnostic(
            await page.evaluate(() =>
              JSON.stringify({
                status: document.getElementById('status').textContent,
                diagnostic: document.getElementById('view-diagnostic').textContent,
                events: window.engineEvents.slice(-10),
                rebase: window.lastHyperbolicRebase,
              })
            )
          );
          throw error;
        });
      await page.keyboard.up('KeyW');
      assert.ok(await page.evaluate(() => window.lastHyperbolicRebase.anchor.quotientState !== 0));
      await page.locator('#image').click();
      await page.waitForFunction(() => window.savedImage?.startsWith('data:image/png;base64,'));
      await page.locator('#save').click();
      await page.waitForFunction(() => window.savedProject?.documents.length === 6);
      const saved = await page.evaluate(() => window.savedProject);
      assert.equal(saved.version, 2);
      assert.equal(saved.documents[0].states[0].model.kind, undefined);
      for (const d of saved.documents.slice(1))
        for (const s of d.states) {
          assert.equal(s.model.kind, 'hyperbolic-space');
          assert.equal(s.model.anchorPatch.nextCursor, undefined);
        }
      await page.locator('#undo').click();
      await page.locator('#redo').click();
      await page.locator('#document-tabs > button').first().click();
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
      assert.equal(await page.locator('#hyperbolic-controls').isVisible(), false);
      assert.equal(await page.locator('#base-canvas').isVisible(), true);
      await page.locator('#open').click();
      await page.waitForFunction(
        () => document.getElementById('model-name').textContent === 'Dodecahedral small cover'
      );
      await page.locator('#save').click();
      await page.waitForFunction(() => document.getElementById('save').disabled === false);
      await page.locator('#document-tabs > button').first().click();
      assert.equal(await page.locator('#base-canvas').isVisible(), true);
      await page.locator('#document-tabs > button').last().click();
      await page.evaluate(() => {
        const original = window.polytope.engine;
        window.polytope.engine = (request) => {
          if (
            request.op !== 'recipe-run' ||
            request.params.operation !== 'hyperbolic-create' ||
            request.params.document !== null
          )
            return original(request);
          window.polytope.engine = original;
          return new Promise((resolve) => {
            window.releaseHyperbolicOpen = () => resolve(original(request));
          });
        };
      });
      await page.locator('#hyperbolic-open-534').click();
      await page.waitForFunction(() => window.releaseHyperbolicOpen);
      await page.locator('#document-tabs > button').first().click();
      await page.evaluate(() => window.releaseHyperbolicOpen());
      await page.waitForFunction(() => !document.getElementById('hyperbolic-open-534').disabled);
      assert.equal(await page.locator('#document-tabs > button').count(), 6);
      assert.equal(await page.locator('#hyperbolic-controls').isVisible(), false);
      assert.deepEqual(errors, []);
      assert.equal(stderr, '');
      if (profileMode) {
        assert.equal(profileBridge.errors, '');
        await mkdir('artifacts/hyperbolic-integration', { recursive: true });
        const output = {
          viewport: '1280x800 / 1600x1000',
          processes: 'desktop EnginePool, three cold/reusable Python workers; no Electron',
          measurements,
          native: profileBridge.records,
        };
        await writeFile('artifacts/hyperbolic-integration/profile.json', JSON.stringify(output, null, 2));
        for (const measurement of measurements) t.diagnostic('profile ' + JSON.stringify(measurement));
      }
    } finally {
      await browser?.close();
      await server.close();
      engine?.kill();
      profileBridge?.dispose();
    }
  }
);
