import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { createHyperbolicProfileBridge } from './helpers/hyperbolic-native-profile.mjs';

test(
  'hyperbolic UX: all presets, patch controls, diagnostics, domain notes and responsive layout',
  { timeout: 180000 },
  async (t) => {
    const bridge = createHyperbolicProfileBridge();
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
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' }),
        errors = [];
      page.on('pageerror', (error) => {
        errors.push(error.message);
        t.diagnostic(error.stack);
      });
      page.on('console', (message) => {
        if (message.type() === 'error') t.diagnostic(message.text());
      });
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.exposeFunction('nativeEngine', (r) => bridge.compute(r));
      await page.exposeFunction('nativeCancel', (id) => bridge.cancel(id));
      await page.addInitScript(() => {
        localStorage.setItem('polytope-welcome-v1', 'dismissed');
        window.requests = [];
        window.polytope = {
          engine: async (r, id) => {
            window.requests.push({ op: r.op, params: r.params });
            return window.nativeEngine({ ...r, id });
          },
          cancel: async (id) => window.nativeCancel(id),
          setDirty: async () => {},
          setWorkspaceAvailability: async () => {},
          onAction() {},
          libraries: async () => ({ libraries: [], errors: [] }),
          recoveryInfo: async () => null,
          startupInfo: async () => ({ hidden: false }),
          autosave: async () => {},
          recentFiles: async () => ({ files: [] }),
          discoveryMenu: async () => {},
          save: async (project) => {
            window.savedUxProject = await window.nativeEngine({ op: 'validate-project', params: { project } });
            return { path: 'hyperbolic-ux.polyproj' };
          },
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      await page
        .waitForFunction(() => document.getElementById('model-name')?.textContent === 'Tesseract', null, {
          timeout: 15000,
        })
        .catch(async (error) => {
          t.diagnostic(await page.locator('#status').textContent());
          throw error;
        });
      await page.locator('#hyperbolic-library summary').click();
      for (const key of ['534', '435', '535', '353', 'small-cover']) {
        await page.locator('#hyperbolic-open-' + key).click();
        await page.waitForFunction((key) => {
          const host = document.getElementById('hyperbolic-canvas');
          return host?.dataset.ready === 'true' && JSON.parse(host.dataset.openingTiming ?? '{}').key === key;
        }, key);
        await page.waitForFunction(() =>
          document.getElementById('hyperbolic-coverage')?.textContent.includes('Complete observer ball')
        );
        assert.match(await page.locator('#view-diagnostic').textContent(), /Cells have equal hyperbolic size/);
        if (key === 'small-cover')
          assert.match(await page.locator('#view-diagnostic').textContent(), /eight cells.*one closed space/);
        assert.ok(await page.locator('#hyperbolic-home').isVisible());
        const initialCells = Number(await page.locator('#hyperbolic-canvas').getAttribute('data-prepared-cells'));
        assert.ok(initialCells > 1);
        const highlight = await page.evaluate(
          () => document.querySelector('#hyperbolic-canvas')?.dataset.highlightedCell !== undefined
        );
        assert.ok(highlight);
        await page.locator('#hyperbolic-patch-controls summary').click();
        for (const id of ['hyperbolic-radius', 'hyperbolic-layers', 'hyperbolic-pause'])
          assert.ok(await page.locator('#' + id).isVisible());
        await page.locator('#hyperbolic-radius').fill('1/2');
        await page.locator('#hyperbolic-patch-apply').click();
        await page
          .waitForFunction(
            () => document.getElementById('hyperbolic-coverage')?.textContent.includes('Complete observer ball R=0.5'),
            null,
            { timeout: 10000 }
          )
          .catch(async (error) => {
            t.diagnostic(
              JSON.stringify(
                await page.evaluate(() => ({
                  status: document.getElementById('status').textContent,
                  caption: document.getElementById('view-diagnostic').textContent,
                  requests: window.requests.slice(-6),
                  toasts: [...document.querySelectorAll('.toast-details pre')].map((n) => n.textContent),
                }))
              )
            );
            throw error;
          });
        await page.waitForFunction(
          (initial) => Number(document.getElementById('hyperbolic-canvas').dataset.preparedCells) < initial,
          initialCells
        );
        await page.locator('#hyperbolic-patch-mode').selectOption('complete-depth');
        await page.locator('#hyperbolic-layers').fill('1+0');
        await page.locator('#hyperbolic-patch-apply').click();
        await page.waitForFunction(() =>
          document.getElementById('hyperbolic-coverage')?.textContent.includes('Complete adjacency layers 0, 1')
        );
        await page.locator('#hyperbolic-pause').check();
        assert.match(await page.locator('#view-diagnostic').textContent(), /Finite patch; generation paused/);
        assert.ok(await page.locator('#hyperbolic-explore').isDisabled());
        const before = await page.evaluate(() => window.requests.filter((r) => r.op === 'hyperbolic-patch').length);
        await page.locator('#hyperbolic-radius').fill('1');
        await page.locator('#hyperbolic-patch-mode').selectOption('radius');
        await page.locator('#hyperbolic-patch-apply').click();
        assert.equal(
          await page.evaluate(() => window.requests.filter((r) => r.op === 'hyperbolic-patch').length),
          before
        );
        await page.locator('#hyperbolic-pause').uncheck();
        await page.waitForFunction(() =>
          document.getElementById('hyperbolic-coverage')?.textContent.includes('Complete observer ball R=1')
        );
        await page.locator('#hyperbolic-patch-controls summary').click();
        if ((await page.locator('#toggle-inspector').getAttribute('aria-pressed')) !== 'true')
          await page.locator('#toggle-inspector').click();
        await page.locator('[data-panel="info"]').click();
        if ((await page.locator('#hyperbolic-diagnostics').getAttribute('open')) === null)
          await page.locator('#hyperbolic-diagnostics summary').click();
        const diagnostics = await page.locator('#hyperbolic-diagnostics').textContent();
        assert.match(diagnostics, /float64 approximation/);
        assert.match(diagnostics, /abs .*rel .*scale .*gate .*PASS/);
        assert.match(diagnostics, /Cells missing within R0/);
        await page.locator('#hyperbolic-copy-receipt').click();
        const copied = await page.evaluate(async () => JSON.parse(await navigator.clipboard.readText()));
        assert.equal(copied.coverage.complete, true);
        assert.equal(copied.coverage.radius, 1);
        assert.equal(await page.locator('#hyperbolic-diagnostics pre').count(), 0);
        if (key === 'small-cover') {
          assert.match(diagnostics, /20, 60, 48, 8/);
          assert.match(diagnostics, /coarse published/);
          assert.match(diagnostics, /Engine cellular and triangulation/);
        }
        for (const size of [
          { width: 1600, height: 1000 },
          { width: 1280, height: 800 },
        ]) {
          await page.setViewportSize(size);
          const layout = await page.evaluate(() => {
            const rect = (id) => {
              const r = document.getElementById(id).getBoundingClientRect();
              return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
            };
            return {
              controls: rect('hyperbolic-controls'),
              home: rect('hyperbolic-home'),
              canvas: rect('hyperbolic-canvas'),
              caption: rect('view-diagnostic'),
              scroll: document.documentElement.scrollWidth,
              viewport: innerWidth,
            };
          });
          assert.ok(layout.controls.bottom <= layout.canvas.top + 1, JSON.stringify(layout));
          assert.ok(layout.home.left >= 0 && layout.home.right <= size.width, JSON.stringify(layout));
          assert.ok(layout.canvas.height > 200 && layout.canvas.width > 300, JSON.stringify(layout));
          assert.ok(layout.scroll <= layout.viewport, JSON.stringify(layout));
          await mkdir('artifacts/hyperbolic-ux', { recursive: true });
          await page.screenshot({ path: `artifacts/hyperbolic-ux/${key}-${size.width}.png` });
          await page.locator('#hyperbolic-patch-controls summary').click();
          const patch = await page.locator('.hyperbolic-patch-fields').boundingBox();
          assert.ok(
            patch.x >= 0 && patch.x + patch.width <= size.width && patch.y + patch.height <= size.height,
            JSON.stringify(patch)
          );
          await page.screenshot({ path: `artifacts/hyperbolic-ux/${key}-patch-${size.width}.png` });
          await page.locator('#hyperbolic-patch-controls summary').click();
        }
        for (const expert of [true, false]) {
          const toggle = page.locator('#expert-tools');
          if ((await toggle.getAttribute('aria-pressed')) !== String(expert)) {
            await page.locator('#app-options summary').click();
            await toggle.click();
            await page.locator('#app-options summary').click();
          }
          for (const panel of ['construct', 'net', 'evidence']) {
            await page.locator(`[data-panel="${panel}"]`).click();
            assert.ok(
              await page
                .locator(
                  `#${panel === 'construct' ? 'construct-panel' : panel === 'net' ? 'net-panel' : 'evidence-panel'} [data-hyperbolic-domain-note]`
                )
                .first()
                .isVisible()
            );
          }
        }
        if ((await page.locator('#toggle-inspector').getAttribute('aria-pressed')) !== 'true')
          await page.locator('#toggle-inspector').click();
        await page.locator('[data-panel="info"]').click();
        await page.locator('#hyperbolic-explore').click();
        assert.match(
          await page.locator('#hyperbolic-navigation-help').textContent(),
          /Exploring in Klein.*WASD.*arrows.*drag.*Escape/
        );
        await page.keyboard.press('Escape');
        await page.locator('#hyperbolic-home').click();
        assert.doesNotMatch(await page.locator('#status').textContent(), /error|failed|could not finish|undefined/i);
      }
      await page.locator('#save').click();
      await page.waitForFunction(() => window.savedUxProject?.documents.length === 6);
      const saved = await page.evaluate(() => window.savedUxProject);
      assert.equal(saved.version, 2);
      for (const doc of saved.documents.slice(1))
        assert.deepEqual(doc.states.at(-1).view.hyperbolicPatch, {
          radius: 1,
          depth: 1,
          mode: 'radius',
          paused: false,
        });
      assert.deepEqual(errors, []);
      assert.equal(bridge.errors, '');
    } finally {
      await browser?.close();
      await server.close();
      bridge.dispose();
    }
  }
);
