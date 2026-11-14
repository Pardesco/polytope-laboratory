import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { netOverlapTargets, highlightNetOverlaps, paperPageCaption } from '../ui/net-presentation.mjs';

test('overlap highlights include both tab edges and their owner faces and clear without changing geometry', () => {
  const net = {
      overlapPairs: [[2, 3]],
      tabOverlapPairs: [
        { edge: 7, otherTabEdge: 8 },
        { edge: 9, face: 5 },
      ],
      tabRecords: [
        { edge: 7, face: 0 },
        { edge: 8, face: 1 },
        { edge: 9, face: 4 },
      ],
    },
    before = structuredClone(net),
    targets = netOverlapTargets(net);
  assert.deepEqual([...targets.faces].sort(), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual([...targets.tabs], [7, 8, 9]);
  const nodes = [{ netFace: '0' }, { netFace: '6' }, { netTab: '8' }, { netTab: '10' }].map((dataset) => ({
    dataset,
    classList: {
      toggle(_name, enabled) {
        this.enabled = enabled;
      },
    },
  }));
  highlightNetOverlaps({ querySelectorAll: () => nodes }, net, true);
  assert.deepEqual(
    nodes.map((n) => n.classList.enabled),
    [true, false, true, false]
  );
  highlightNetOverlaps({ querySelectorAll: () => nodes }, net, false);
  assert.ok(nodes.every((n) => n.classList.enabled === false));
  assert.deepEqual(net, before);
});

test('paper captions describe the rendered face appearance independently of a mixed color batch label', () => {
  const packed = { pageCount: 2, referenceEdgeLengthMm: 25, colorPrinting: { effectiveMode: 'mixed' } },
    page = {
      widthMm: 210,
      heightMm: 297,
      paperColorLabel: 'Mixed source colors',
      svg: '<g data-net-face="0"><polygon fill="none"/></g>',
    };
  assert.match(paperPageCaption(packed, page, 1), /Page 2 of 2.*25 mm.*100%.*Outline faces/);
  assert.doesNotMatch(paperPageCaption(packed, page, 1), /Mixed source colors/);
  assert.match(
    paperPageCaption(
      packed,
      { ...page, svg: '<ns0:g data-net-face="0"><ns0:polygon fill="rgb(255,0,0)"/></ns0:g>' },
      0
    ),
    /Filled face colors/
  );
  assert.match(
    paperPageCaption(packed, { ...page, svg: '<g data-net-face="0"><polygon fill="red" fill-opacity="0"/></g>' }, 0),
    /Outline faces/
  );
});

test(
  'mounted Nets workflow advances, keeps navigation pinned, highlights overlaps, and reserves paper caption space',
  { timeout: 120000 },
  async () => {
    const engine = spawn('python', ['-B', '-u', 'engine/server.py'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      }),
      pending = new Map();
    let next = 0,
      stderr = '';
    engine.stderr.on('data', (data) => (stderr += data));
    const lines = createInterface({ input: engine.stdout });
    lines.on('line', (line) => {
      const result = JSON.parse(line),
        job = pending.get(result.id);
      if (!job) return;
      pending.delete(result.id);
      result.ok ? job.resolve(result.result) : job.reject(Error(result.error));
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
      await server.listen();
      browser = await chromium.launch({
        headless: true,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      });
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }),
        errors = [];
      page.setDefaultTimeout(20000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript(() => {
        localStorage.setItem('polytope-welcome-v1', 'dismissed');
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
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      await page.waitForFunction(() => document.getElementById('model-name')?.textContent === 'Tesseract');
      await page.locator('#toggle-inspector').click();
      await page.locator('#search').fill('Dodecahedron');
      await page.locator('[data-key="dodecahedron"]').click();
      await page.waitForFunction(() => document.getElementById('model-name')?.textContent === 'Dodecahedron');
      await page.locator('.inspector-tabs [data-panel="net"]').click();
      await page.evaluate(async () => {
        const { Viewer } = await import('/viewer.js'),
          fit = Viewer.prototype.fit;
        window.sourceFits = [];
        Viewer.prototype.fit = function (...args) {
          if (this.container.id === 'base-canvas') window.sourceFits.push(this.container.getBoundingClientRect().width);
          return fit.apply(this, args);
        };
      });
      await page.locator('#net-rebuild').click();
      await page.waitForFunction(() => document.getElementById('nets-go-2').getAttribute('aria-current') === 'step');
      assert.match(await page.locator('#nets-result-summary').innerText(), /12 faces.*\n.*\nNo face or tab overlaps/);
      assert.equal(
        await page.locator('#nets-result-summary').evaluate((n) => n.parentElement.classList.contains('derived')),
        true
      );
      assert.equal(await page.locator('#net-summary').isVisible(), false);
      assert.equal(await page.locator('#derived-status').isVisible(), false);
      assert.ok((await page.evaluate(() => window.sourceFits)).some((width) => width < 800));
      assert.doesNotMatch(await page.locator('#nets-type-faces-reason').innerText(), /native engine/);
      assert.equal(await page.locator('#promote').isVisible(), false);
      assert.equal(await page.locator('#net-rearrange').isDisabled(), true);
      assert.match(await page.locator('#nets-rearrange-reason').innerText(), /Cut a hinge/);
      assert.equal(await page.locator('#net-pack').innerText(), 'Preview on paper');
      const reveal = async (id) =>
        page.locator('#' + id).evaluate((node) => {
          for (let p = node.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
        });
      await page.locator('#nets-go-3').click();
      await page.locator('#net-length').fill('25/2');
      await page.locator('#net-pack').click();
      await page.waitForFunction(() => document.getElementById('net-paper-status').textContent.includes('Page 1 of'));
      assert.equal(await page.locator('#nets-go-3').getAttribute('aria-current'), 'step');
      assert.equal(await page.locator('#nets-result-summary').isVisible(), false);
      assert.equal(await page.locator('#derived-status').isVisible(), true);
      assert.match(await page.locator('#derived-status').innerText(), /Outline faces/);
      assert.match(await page.locator('#derived-status').innerText(), /E0 = 12.5 mm/);
      await mkdir('artifacts/nets-ux', { recursive: true });
      for (const [width, height] of [
        [1280, 800],
        [1600, 1000],
      ]) {
        await page.setViewportSize({ width, height });
        const bounds = await page.evaluate(() => {
          const sheet = document.getElementById('net-preview').getBoundingClientRect(),
            caption = document.getElementById('derived-status').getBoundingClientRect(),
            stepper = document.getElementById('nets-stepper').getBoundingClientRect(),
            inspector = document.getElementById('inspector-region').getBoundingClientRect();
          return {
            sheetBottom: sheet.bottom,
            sheetHeight: sheet.height,
            captionTop: caption.top,
            captionBottom: caption.bottom,
            stepperTop: stepper.top,
            inspectorTop: inspector.top,
            inspectorBottom: inspector.bottom,
            scroll: document.querySelector('.inspector').scrollWidth,
            client: document.querySelector('.inspector').clientWidth,
          };
        });
        assert.ok(bounds.sheetBottom <= bounds.captionTop && bounds.sheetHeight > 100, JSON.stringify(bounds));
        assert.ok(bounds.captionBottom <= height, JSON.stringify(bounds));
        assert.ok(
          bounds.stepperTop >= bounds.inspectorTop && bounds.stepperTop < bounds.inspectorBottom,
          JSON.stringify(bounds)
        );
        assert.ok(bounds.scroll <= bounds.client, JSON.stringify(bounds));
        await page.screenshot({ path: `artifacts/nets-ux/paper-${width}.png` });
      }
      await reveal('net-tab-default');
      await page.locator('#net-tab-default').selectOption('double');
      await page.locator('#net-tab-width').fill('8');
      await page.locator('#net-tab-default-apply').click();
      await page.locator('#nets-overlap-tools').waitFor({ state: 'visible' });
      assert.match(await page.locator('#nets-overlap-status').innerText(), /[1-9]\d* glue-tab overlaps/);
      await page.locator('#nets-show-overlaps').click();
      await page.waitForFunction(() => document.querySelectorAll('#net-preview .net-overlap-mark').length > 0);
      assert.equal(await page.locator('#net-display').inputValue(), 'layout');
      await page.locator('#nets-adjust-overlaps').click();
      assert.equal(await page.locator('#net-layout-settings').evaluate((n) => n.open), true);
      assert.equal(await page.locator('#nets-go-2').getAttribute('aria-current'), 'step');
      await page.screenshot({ path: 'artifacts/nets-ux/overlaps.png' });
      await page.locator('#nets-show-overlaps').click();
      assert.equal(await page.locator('#net-preview .net-overlap-mark').count(), 0);
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
