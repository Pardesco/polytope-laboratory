import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { tourStopLabel, tourDurationLabel, tourTransitionLabel, moveTourSelection } from '../ui/tour-strip.mjs';

test('stop labels retain mathematical names and distinguish repeated shapes by position', () => {
  const stop = { state: { model: { name: 'Tesseract {4,3,3}' } } };
  assert.equal(tourStopLabel(stop, 0), '1: Tesseract {4,3,3}');
  assert.equal(tourStopLabel(stop, 2), '3: Tesseract {4,3,3}');
  assert.equal(tourStopLabel({}, 0), '1: Model');
  assert.equal(
    tourStopLabel({ state: { model: { name: '<script>literal</script>' } } }, 1),
    '2: <script>literal</script>'
  );
});

test('duration and transition labels preserve short durations and legacy instant stops', () => {
  assert.equal(tourDurationLabel(0.0001), '0.0001 s');
  assert.equal(tourDurationLabel(3600), '3600 s');
  assert.equal(tourTransitionLabel('instant'), 'Instant');
  assert.equal(tourTransitionLabel({ method: 'morph-to-dual' }), 'Morph to dual');
  assert.equal(tourTransitionLabel({ method: 'shrink-grow' }), 'Shrink grow');
});

test('selection movement clamps at both ends and leaves empty tours unselected', () => {
  assert.equal(moveTourSelection(0, -1, 3), 0);
  assert.equal(moveTourSelection(2, 1, 3), 2);
  assert.equal(moveTourSelection(1, -1, 3), 0);
  assert.equal(moveTourSelection(1, 1, 3), 2);
  assert.equal(moveTourSelection(0, 1, 1), 0);
  assert.equal(moveTourSelection(0, 1, 0), -1);
  assert.equal(moveTourSelection(undefined, 1, 3), 1);
});

test('mounted stop strip keeps selection, edits, disclosures and the Timeline mount working', async (t) => {
  const server = await createServer({
    configFile: false,
    root: 'ui',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port: 0 },
    plugins: [
      {
        name: 'tour-strip-fixture',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url !== '/tour-strip-fixture') return next();
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(
              `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body><div class="workspace-settings workspace-shelf" style="position:fixed;bottom:16px;width:620px"><details id="history-settings"></details></div></body></html>`
            );
          });
        },
      },
    ],
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } }),
      errors = [];
    page.setDefaultTimeout(5000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/tour-strip-fixture');
    await page.evaluate(async () => {
      const { TourControls } = await import('/tour-controls.mjs'),
        { createTour } = await import('/tour.mjs');
      const source = {
        model: {
          id: 'source',
          name: 'Tetrahedron',
          dimension: 3,
          embeddingDimension: 3,
          vertices: [
            [0, 0, 0],
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ],
          edges: [
            [0, 1],
            [0, 2],
            [0, 3],
            [1, 2],
            [1, 3],
            [2, 3],
          ],
          faces: [
            [0, 2, 1],
            [0, 1, 3],
            [0, 3, 2],
            [1, 2, 3],
          ],
          cells: [],
        },
        view: { angles: [0, 0, 0, 0, 0, 0] },
        notes: 'Keep notes',
      };
      const doc = { id: 'doc', cursor: 0, states: [source] },
        project = { active: 0, documents: [doc], tour: createTour() };
      const h = (window.h = { project, source, dirty: 0, status: [], exporting: false, exportCalls: [], saved: null });
      const context = {
        getProject: () => project,
        getDocument: () => doc,
        getState: () => doc.states[doc.cursor],
        evaluateMany: async (parts) => parts.map(Number),
        markDirty: () => h.dirty++,
        setStatus: (message) => h.status.push(message),
        isExporting: () => h.exporting,
        showEvent: async (snapshot, _label, options) => {
          options.verifyPublication();
          if (!options.signal.aborted && options.isCurrent()) doc.states[doc.cursor] = snapshot;
        },
        importTour: async () => h.saved,
        exportTour: async (tour) => (h.saved = tour),
        createRenderer: () => {
          throw Error('Preview renderer not needed in this v1 DOM fixture.');
        },
      };
      h.controls = new TourControls(context);
      h.controls.details.open = true;
      h.controls.export = async (format) => h.exportCalls.push(format);
    });
    const stops = page.locator('.tour-stop-card'),
      settled = () => page.waitForFunction(() => !h.controls.busy && !h.controls.showing);
    await t.test('empty tour leads with Add and hides editor and playback', async () => {
      assert.equal(await page.locator('#tour-empty').isVisible(), true);
      assert.equal(await page.locator('#tour-add').innerText(), 'Add current view as stop');
      assert.equal(await page.locator('#tour-editor').isVisible(), false);
      assert.equal(await page.locator('#tour-playback').isVisible(), false);
      assert.equal(await page.locator('#tour-export-settings').evaluate((n) => n.open), false);
      assert.equal(await page.locator('#tour-more').evaluate((n) => n.open), false);
      assert.equal(await page.locator('#tour-save').isVisible(), false);
    });
    await t.test('Add produces safe horizontal cards and transition chips', async () => {
      await page.locator('#tour-add').click();
      await settled();
      await page.evaluate(() => {
        h.project.documents[0].states[0].model.name = '<img src=x onerror=alert(1)> Cube';
      });
      await page.locator('#tour-add').click();
      await settled();
      await page.locator('#tour-add').click();
      await settled();
      assert.equal(await stops.count(), 3);
      assert.equal(await page.locator('.tour-transition-chip').count(), 2);
      assert.equal(await stops.nth(1).locator('strong').innerText(), '2: <img src=x onerror=alert(1)> Cube');
      assert.equal(await stops.locator('img').count(), 0);
      assert.equal(await stops.nth(2).getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('#tour-editor').isVisible(), true);
      assert.equal(await page.locator('#tour-empty').isVisible(), false);
      assert.equal(await page.locator('#tour-transition-parameters').evaluate((n) => n.open), false);
      const cards = await stops.evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().toJSON()));
      assert.ok(cards[1].x > cards[0].x);
      assert.equal(cards[0].y, cards[1].y);
      await mkdir('build', { recursive: true });
      await page.screenshot({ path: 'build/tour-strip-dock.png' });
    });
    await t.test('unchanged strip sync retains cards and emits no attribute mutations', async () => {
      assert.equal(
        await page.evaluate(async () => {
          const nodes = [...h.controls.nodes.strip.children],
            changes = [],
            observer = new MutationObserver((records) => changes.push(...records));
          observer.observe(h.controls.nodes.controls, {
            attributes: true,
            subtree: true,
            attributeFilter: ['hidden', 'tabindex', 'aria-selected', 'disabled'],
          });
          for (let i = 0; i < 10; i++) h.controls.syncStrip(h.project.tour.events, h.project.tour.cursor, false);
          await Promise.resolve();
          observer.disconnect();
          return !changes.length && nodes.every((node, i) => node === h.controls.nodes.strip.children[i]);
        }),
        true
      );
    });
    await t.test('click and Left / Right select, preview, rove focus and clamp', async () => {
      await stops.nth(0).click();
      await settled();
      assert.equal(await page.locator('#tour-event').inputValue(), '0');
      await stops.nth(0).focus();
      await page.keyboard.press('ArrowRight');
      await settled();
      assert.equal(await page.locator('#tour-event').inputValue(), '1');
      assert.equal(await stops.nth(1).evaluate((n) => n === document.activeElement), true);
      assert.deepEqual(await stops.evaluateAll((nodes) => nodes.map((n) => n.tabIndex)), [-1, 0, -1]);
      await page.keyboard.press('End');
      await settled();
      assert.equal(await page.locator('#tour-event').inputValue(), '2');
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#tour-event').inputValue(), '2');
      await page.keyboard.press('ArrowLeft');
      await settled();
      assert.equal(await page.locator('#tour-event').inputValue(), '1');
      await page.keyboard.press('Home');
      await settled();
      assert.equal(await page.locator('#tour-event').inputValue(), '0');
      await page.locator('#tour-event').selectOption('2');
      await settled();
      assert.equal(await stops.nth(2).getAttribute('aria-selected'), 'true');
    });
    await t.test('duration, replacement and reorder update the same saved stops', async () => {
      const original = await page.evaluate(() => h.project.tour.events[2].id);
      await page.locator('#tour-duration').fill('0.125');
      await page.locator('#tour-duration').press('Tab');
      await settled();
      assert.equal(await stops.nth(2).locator('span').innerText(), '0.125 s');
      await page.locator('#tour-up').click();
      await settled();
      assert.equal(await page.evaluate(() => h.project.tour.events[1].id), original);
      await page.locator('#tour-down').click();
      await settled();
      assert.equal(await page.evaluate(() => h.project.tour.events[2].id), original);
      await page.locator('#tour-replace').click();
      await settled();
      assert.equal(await page.evaluate(() => h.project.tour.events[2].id), original);
      assert.equal(await page.locator('#tour-down').isDisabled(), true);
      assert.ok((await page.evaluate(() => h.dirty)) > 0);
    });
    await t.test('More retains save and merge and export settings retain every legacy media handler', async () => {
      await page.locator('#tour-more > summary').click();
      await page.locator('#tour-save').click();
      await settled();
      assert.equal(await page.evaluate(() => h.saved.events.length), 3);
      await page.locator('#tour-merge').click();
      await settled();
      assert.equal(await stops.count(), 6);
      await page.locator('#tour-export-settings > summary').click();
      assert.equal(await page.locator('#tour-fps').isVisible(), true);
      await page.locator('#tour-format').selectOption('gif');
      await page.locator('#tour-export').click();
      await page.locator('#tour-png').click();
      await page.locator('#tour-webm').click();
      assert.deepEqual(await page.evaluate(() => h.exportCalls), ['gif', 'png', 'webm']);
      for (const id of [
        'format',
        'size',
        'framing',
        'margin',
        'supersample',
        'bitrate',
        'palette',
        'dither',
        'loop-count',
        'export',
        'fps',
        'png',
        'webm',
        'close-preview',
        'cancel-export',
      ])
        assert.equal(await page.locator('#tour-export-settings #tour-' + id).count(), 1, id);
    });
    await t.test('moving the live container to Timeline keeps transition guards and cards working', async () => {
      await page.evaluate(() => {
        const panel = document.createElement('section');
        panel.id = 'timeline-tour';
        document.body.append(panel);
        panel.append(h.controls.nodes.controls);
        h.controls.details.open = false;
        h.exporting = true;
        h.controls.sync();
      });
      assert.equal(await page.locator('#tour-transition-apply').isDisabled(), true);
      assert.equal(await stops.nth(2).isDisabled(), true);
      await page.evaluate(() => {
        h.exporting = false;
        h.controls.sync();
      });
      await stops.nth(0).click();
      await settled();
      await page.locator('#tour-transition').selectOption('sideways');
      await page.locator('#tour-transition-apply').click();
      await settled();
      assert.equal(await page.evaluate(() => h.project.tour.version), 2);
      assert.equal(await page.locator('.tour-transition-chip').first().innerText(), 'Sideways');
      assert.equal(await page.locator('#tour-controls').evaluate((n) => getComputedStyle(n).position), 'static');
      assert.equal(await page.locator('#tour-transition-parameters').evaluate((n) => n.open), false);
      await page.locator('#tour-export-settings > summary').click();
      await page.locator('#tour-more > summary').click();
      await page.screenshot({ path: 'build/tour-strip-timeline.png' });
    });
    await t.test('deleting the last stop restores the empty state', async () => {
      while (await stops.count()) {
        await page.locator('#tour-delete').click();
        await settled();
      }
      assert.equal(await page.locator('#tour-empty').isVisible(), true);
      assert.equal(await page.locator('#tour-editor').isVisible(), false);
      assert.equal(await page.locator('#tour-add').isEnabled(), true);
      assert.equal(await page.locator('#tour-event option').count(), 0);
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => h.status), []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
