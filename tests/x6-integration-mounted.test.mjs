import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { NetEditor } from '../ui/net-editor.js';
import { numericControlFixture, deferred } from './numeric-control-fixture.mjs';

test('first face-net resize precedes ownership capture and later observer changes still refuse publication', async () => {
  for (const change of [false, true]) {
    const f = numericControlFixture(NetEditor.prototype, {}),
      pending = deferred();
    let prepared = 0;
    f.state.model.fingerprint = 'source-fingerprint';
    f.context.prepareLayout = () => {
      prepared++;
      f.state.view.camera = { zoom: 1 };
    };
    Object.assign(f.control, {
      getState: f.context.getState,
      getModel: () => f.state.model,
      sequence: 0,
      markDirty: () => {},
      run: () => pending.promise,
    });
    const net = {
      sourceFingerprint: f.state.model.fingerprint,
      root: 0,
      referenceEdgeLengthMm: 25,
      tabs: true,
      hinges: [],
      placements: [],
    };
    const work = f.control.evaluate(f.state.model, f.state);
    assert.equal(prepared, 1);
    if (change) f.state.view.camera.zoom = 2;
    pending.resolve(net);
    if (change) {
      await assert.rejects(work, /changed/);
      assert.equal(f.state.netLayout, undefined);
    } else {
      assert.equal(await work, net);
      assert.equal(f.state.netLayout, net);
      assert.equal(f.state.netHistory.states.length, 1);
    }
  }
});

test(
  'integration: refused sections keep controls clickable and document switches restore the open Timeline',
  { timeout: 120000 },
  async (t) => {
    const engine = spawn('python', ['-u', 'engine/server.py'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }),
      pending = new Map();
    let next = 0,
      stderr = '',
      browser;
    engine.stderr.on('data', (data) => (stderr += data));
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
    try {
      await server.listen();
      browser = await chromium.launch({
        headless: true,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      });
      const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }),
        errors = [];
      page.setDefaultTimeout(20000);
      page.on('pageerror', (e) => errors.push(e.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript(() => {
        import('/timeline-panel.mjs').then(({ TimelinePanel }) => {
          const sync = TimelinePanel.prototype.sync;
          TimelinePanel.prototype.sync = function (...args) {
            window.testTimeline = this;
            return sync.apply(this, args);
          };
        });
      });
      await page.addInitScript(() => {
        import('/friendly-messages.mjs').then(({ FriendlyMessages }) => {
          const error = FriendlyMessages.prototype.error;
          FriendlyMessages.prototype.error = function (...args) {
            window.testMessages = this;
            return error.apply(this, args);
          };
        });
      });
      await page.addInitScript(() => {
        localStorage.setItem('polytope-welcome-v1', 'dismissed');
        localStorage.setItem('polytope.expert-tools.v1', 'false');
        window.exportAborts = [];
        window.exportFinishes = 0;
        window.polytope = {
          engine: (request) => window.nativeEngine(request),
          cancel: async () => {},
          setDirty: async () => {},
          setWorkspaceAvailability: async () => {},
          onAction() {},
          libraries: async () => ({ libraries: [], errors: [] }),
          recoveryInfo: async () => null,
          startupInfo: async () => ({ hidden: false }),
          autosave: async () => {},
          recentFiles: async () => ({ files: [] }),
          discoveryMenu: async () => {},
          animationBegin: async () => ({ id: 'held-export' }),
          animationWrite: async () => {
            window.exportWriting = true;
            await new Promise((resolve) => (window.releaseExportWrite = resolve));
          },
          animationAbort: async (id) => window.exportAborts.push(id),
          animationFinish: async () => {
            window.exportFinishes++;
            return { path: 'unexpected.frames' };
          },
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      await page.waitForFunction(
        () =>
          document.getElementById('model-name')?.textContent === 'Tesseract' && document.getElementById('cancel').hidden
      );
      assert.deepEqual(await page.locator('#toast pre').allTextContents(), []);
      await page.locator('#toggle-inspector').click();
      await t.test('zero normal refusal and expanded error details never overlap section controls', async () => {
        await page.locator('#view-options-button').click();
        await page.selectOption('#viewport-layout', 'split');
        await page.locator('#advanced-slice-settings').evaluate((node) => (node.open = true));
        await page.keyboard.press('Escape');
        await page.selectOption('#derived-mode', 'section');
        const canvasSize = await page.locator('#base-canvas').evaluate((n) => [n.clientWidth, n.clientHeight]);
        await page.locator('#section-normal').fill('0, 0, 0, 0');
        await page.locator('#apply-section').click();
        await page.locator('#toast .friendly-toast').last().waitFor({ state: 'visible' });
        assert.equal(
          await page
            .locator('#friendly-notifications')
            .evaluate((n) => n.parentElement.matches('#views .viewport.primary')),
          true
        );
        await page.locator('#toast summary').click();
        assert.equal(await page.locator('#toast details').evaluate((n) => n.open), true);
        assert.deepEqual(
          await page.locator('#base-canvas').evaluate((n) => [n.clientWidth, n.clientHeight]),
          canvasSize,
          'notices preserve capture dimensions'
        );
        assert.equal(
          await page.locator('#toast .friendly-toast p').evaluate((n) => {
            const r = n.getBoundingClientRect();
            return document.elementFromPoint(r.x + 4, r.y + 4)?.tagName;
          }),
          'CANVAS',
          'notice text passes pointer events to the model'
        );
        for (const width of [1500, 1100]) {
          await page.setViewportSize({ width, height: 1000 });
          for (const id of ['section-events', 'apply-section', 'section-density-mode']) {
            await page.locator('#' + id).scrollIntoViewIfNeeded();
            assert.equal(
              await page.locator('#' + id).evaluate((n) => {
                const r = n.getBoundingClientRect();
                return n.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
              }),
              true,
              id + ' remains clickable at ' + width
            );
          }
          const bounds = await page.evaluate(() => {
            const a = document.getElementById('friendly-notifications').getBoundingClientRect(),
              b = document.getElementById('section-events').getBoundingClientRect();
            return { overlap: a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom };
          });
          assert.equal(bounds.overlap, false);
        }
        await page.locator('#section-normal').fill('0, 0, 0, 1');
        await page.locator('#section-events').click();
        await page.waitForFunction(() => Number(document.getElementById('section-depth').value) !== 0);
        await page.locator('#toast .toast-close').click();
        await page.setViewportSize({ width: 1500, height: 1000 });
        await page.locator('#help').click();
        await page.locator('#help-dialog').waitFor({ state: 'visible' });
        await page.evaluate(() => window.testMessages.error(Error('Modal refusal retains original details.')));
        assert.equal(await page.locator('#friendly-notifications').evaluate((n) => n.parentElement.id), 'help-dialog');
        await page.locator('#toast summary').click();
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !!document.getElementById('friendly-notifications').closest('.workspace'));
        await page.locator('#section-events').click();
        await page.locator('#toast .toast-close').click();
      });
      const openAnimation = async () => {
        if (!(await page.locator('#animation-settings').evaluate((n) => n.open)))
          await page.locator('#animation-settings > summary').click();
        assert.equal(await page.locator('#timeline-panel').isVisible(), true);
      };
      await t.test('switch during PNG write cancels export and preserves open Animation visibility', async () => {
        await page.locator('[data-key="cube"]').click();
        await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Cube');
        await page.locator('#document-tabs button').first().click();
        await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
        await openAnimation();
        await page.locator('#animation-rotation').click();
        await page.evaluate(() => {
          document.getElementById('timeline-export-settings').open = true;
        });
        await page.locator('#animation-png').click();
        await page.waitForFunction(() => window.exportWriting);
        assert.equal(await page.locator('[data-key="cube"]').isDisabled(), true);
        await page.locator('#document-tabs button').last().click();
        await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Cube');
        await page.evaluate(() => window.releaseExportWrite());
        await page.waitForFunction(() => !document.getElementById('animation-png').disabled);
        await openAnimation();
        assert.equal(await page.locator('#timeline-panel').isVisible(), true);
        assert.deepEqual(await page.evaluate(() => window.exportAborts), ['held-export']);
        assert.equal(await page.evaluate(() => window.exportFinishes), 0);
        await page.locator('#animation-rotation').click();
        await page.keyboard.press('Control+z');
        assert.equal(await page.locator('#timeline-panel').isVisible(), true);
        await page.keyboard.press('Control+Shift+z');
        assert.equal(await page.locator('#timeline-panel').isVisible(), true);
        await page.locator('#timeline-tour-mode').click();
        await page.locator('#document-tabs button').first().click();
        if (!(await page.locator('#tour-settings').evaluate((n) => n.open)))
          await page.locator('#tour-settings > summary').click();
        assert.equal(await page.locator('#tour-settings').evaluate((n) => n.open), true);
        assert.equal(await page.locator('#timeline-panel').isVisible(), true);
        const restored = await page.evaluate(async () => {
          const timeline = window.testTimeline,
            getState = timeline.context.getState;
          try {
            timeline.context.getState = () => null;
            timeline.sync();
            if (!timeline.panel.hidden) throw Error('Empty workspace should hide Timeline.');
          } finally {
            timeline.context.getState = getState;
          }
          timeline.sync();
          let writes = 0;
          const observer = new MutationObserver((records) => (writes += records.length));
          observer.observe(timeline.panel, { attributes: true, attributeFilter: ['hidden'] });
          for (let i = 0; i < 3; i++) timeline.sync();
          await Promise.resolve();
          observer.disconnect();
          return { hidden: timeline.panel.hidden, writes };
        });
        assert.deepEqual(restored, { hidden: false, writes: 0 });
        await page.locator('#timeline-close').click();
        await page.locator('#timeline-panel').waitFor({ state: 'hidden' });
        await page.locator('#document-tabs button').last().click();
        assert.equal(await page.locator('#timeline-panel').isVisible(), false);
      });
      assert.deepEqual(errors, []);
      assert.equal(stderr, '');
    } finally {
      await browser?.close();
      await server.close();
      lines.close();
      engine.kill();
    }
  }
);
