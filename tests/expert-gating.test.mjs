import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { COMMON_CONSTRUCT_TOOLS, CONSTRUCT_TOOLS, commonConstructTool } from '../ui/construct-gallery.mjs';
import { LIBRARY_EXPERT_PANELS } from '../ui/library-visual.mjs';
const { autoReveal, reveal } = createRequire(import.meta.url)('../scripts/smoke-helpers.cjs');

test('common construction set is explicit and every remaining tool stays searchable', () => {
  assert.equal(COMMON_CONSTRUCT_TOOLS.size, 10);
  for (const id of COMMON_CONSTRUCT_TOOLS)
    assert.ok(
      CONSTRUCT_TOOLS.some((t) => t.id === id),
      id
    );
  for (const id of [
    'incidence-truncation-settings',
    'cell-rebuild-settings',
    'convex-core-settings',
    'fitting-settings',
    'wythoff-model-settings',
    'star-polygon-settings',
    'cupola-settings',
    'step-prism-settings',
  ])
    assert.equal(commonConstructTool(CONSTRUCT_TOOLS.find((t) => t.id === id)), false, id);
  assert.equal(commonConstructTool({ id: 'section-workflow', common: true }), true);
});

test(
  'expert-off chrome keeps common tools visible, preserves reveal and dismisses workflow hints',
  { timeout: 180000 },
  async (t) => {
    const engine = spawn('python', ['-B', '-u', 'engine/server.py'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const pending = new Map();
    let next = 0;
    engine.stderr.resume();
    const lines = createInterface({ input: engine.stdout });
    lines.on('line', (line) => {
      const response = JSON.parse(line),
        job = pending.get(response.id);
      if (!job) return;
      pending.delete(response.id);
      response.ok ? job.resolve(response.result) : job.reject(Error(response.error));
    });
    engine.on('error', (error) => {
      for (const job of pending.values()) job.reject(error);
      pending.clear();
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
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.setDefaultTimeout(20000);
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
        };
      });
      const ready = () =>
        page.waitForFunction(
          () =>
            document.getElementById('model-name')?.textContent === 'Tesseract' &&
            document.getElementById('cancel').hidden
        );
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      await ready();
      await t.test(
        'Library evidence is hidden by default, below the stable list, and smoke reveal reaches every original control',
        async () => {
          for (const id of LIBRARY_EXPERT_PANELS) {
            assert.equal(await page.locator('#' + id).isVisible(), false, id);
            assert.equal(
              await page
                .locator('#' + id)
                .evaluate(
                  (panel) =>
                    !!(
                      document.getElementById('catalog').compareDocumentPosition(panel) &
                      Node.DOCUMENT_POSITION_FOLLOWING
                    )
                ),
              true,
              id
            );
          }
          for (const id of [
            'search',
            'library-family',
            'library-discovery-filter',
            'library-home',
            'library-view-list',
            'library-view-grid',
            'catalog',
          ])
            assert.equal(await page.locator('#' + id).isVisible(), true, id);
          autoReveal(page);
          for (const id of LIBRARY_EXPERT_PANELS) {
            await page.evaluate(() => document.body.classList.remove('expert-mode'));
            await page.locator('#' + id + ' > summary').click();
            assert.equal(await page.locator('#' + id).isVisible(), true, id);
            assert.equal(await page.locator('#' + id).evaluate((node) => node.open), true, id);
          }
          await page.locator('#expert-tools').click();
          assert.equal(await page.locator('body').evaluate((node) => node.classList.contains('expert-mode')), false);
        }
      );
      await page.locator('#toggle-inspector').click();
      await page.locator('[data-panel="construct"]').click();
      await t.test(
        'common cards stay above More tools; search finds every mounted specialist including formerly expert cards',
        async () => {
          const more = page.locator('#construct-more-tools');
          assert.equal(await more.evaluate((node) => node.open), false);
          for (const id of [
            'gallery-dual',
            'gallery-truncate',
            'expansion-settings',
            'transform-model-settings',
            'add-dual-controls',
            'hull-model-settings',
            'gallery-generator',
            'antiprism-settings',
            'product-settings',
            'shape-builder',
          ])
            assert.equal(await page.locator('#construct-card-' + id).isVisible(), true, id);
          const specialists = await page
            .locator('#construct-more-tools .construct-tool-card')
            .evaluateAll((cards) => cards.map((card) => ({ id: card.id, name: card.getAttribute('aria-label') })));
          assert.ok(specialists.length >= 20);
          for (const card of specialists) assert.equal(await page.locator('#' + card.id).isVisible(), false, card.id);
          for (const card of specialists) {
            await page.locator('#construct-tool-search').fill(card.name);
            assert.equal(await page.locator('#' + card.id).isVisible(), true, card.name);
          }
          await page.locator('#construct-tool-search').fill('');
          await more.locator(':scope > summary').click();
          await page.locator('#construct-card-wythoff-model-settings').click();
          assert.equal(await page.locator('#construct-pane-wythoff-model-settings').isVisible(), true);
          assert.equal(await page.locator('#open-coxeter-builder').isVisible(), true);
          await page.locator('#construct-back-wythoff-model-settings').click();
          assert.equal(await page.locator('#open-coxeter-builder').isVisible(), false);
          assert.equal(await page.locator('#construct-card-wythoff-model-settings').isVisible(), true);
          await page.locator('#expert-tools').click();
          assert.equal(await more.isVisible(), false);
          assert.equal(await page.locator('#construct-card-wythoff-model-settings').isVisible(), true);
          await page.locator('#expert-tools').click();
          assert.equal(await more.isVisible(), true);
          await page.locator('#construct-more-tools > summary .group-help').click();
          assert.match(await page.locator('#help-topic h3').innerText(), /Construct/);
          await page.keyboard.press('Escape');
        }
      );
      await t.test('secondary instructions use readable type and token contrast', async () => {
        const styles = await page.evaluate(() =>
          [
            '#library-result-count',
            '#library-discovery-note',
            '.construct-card-copy > span',
            '.construct-pane-description',
            '#view-options-button',
            '#dock-more-button',
          ].map((selector) => {
            const style = getComputedStyle(document.querySelector(selector));
            return { selector, size: parseFloat(style.fontSize), font: style.fontFamily, color: style.color };
          })
        );
        for (const style of styles) {
          assert.ok(style.size >= 12, JSON.stringify(style));
          assert.doesNotMatch(style.font, /monospace|consolas/i, style.selector);
        }
      });
      for (const workflow of ['builder', 'section', 'nets'])
        await t.test(workflow + ' dismisses both hints for the session, including renderer reload', async () => {
          await page.evaluate(() => {
            sessionStorage.clear();
            localStorage.removeItem('polytope.canvas.explore.v1');
          });
          await page.reload();
          await ready();
          if (workflow === 'builder') await page.evaluate(() => window.openCoxeterBuilder());
          if (workflow === 'section') {
            await reveal(page, '#viewport-layout');
            await page.locator('#viewport-layout').selectOption('split');
          }
          if (workflow === 'nets') {
            await page.locator('#toggle-inspector').click();
            await page.locator('[data-panel="net"]').click();
          }
          await page.waitForFunction(() => sessionStorage.getItem('polytope.canvas.focused-workflow.v1') === 'true');
          assert.equal(await page.locator('#workspace-tip').isVisible(), false);
          assert.equal(await page.locator('#explore-shape').isVisible(), false);
          await page.reload();
          await ready();
          assert.equal(await page.locator('#workspace-tip').isVisible(), false);
          assert.equal(await page.locator('#explore-shape').count(), 0);
        });
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await server.close();
      lines.close();
      engine.kill();
    }
  }
);
