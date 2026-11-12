import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/material-environment.json', import.meta.url)));
test(
  '3D imported environment UI, native project reopen and PNG pixels agree with Expert off',
  { timeout: 180000 },
  async () => {
    const engine = spawn('python', ['-B', '-u', 'engine/server.py'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      }),
      pending = new Map();
    let next = 0,
      stderr = '';
    engine.stderr.on('data', (data) => (stderr += data));
    engine.on('error', (error) => {
      for (const job of pending.values()) job.reject(error);
    });
    const lines = createInterface({ input: engine.stdout });
    lines.on('line', (line) => {
      const value = JSON.parse(line),
        job = pending.get(value.id);
      pending.delete(value.id);
      value.ok ? job?.resolve(value.result) : job?.reject(Error(value.error));
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
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' }),
        errors = [];
      page.setDefaultTimeout(25000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript(() => {
        window.captures = [];
        window.saveCount = 0;
        window.openCount = 0;
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
          save: async (project) => {
            window.saved = await window.nativeEngine({ op: 'validate-project', params: { project } });
            window.saveCount++;
            return { path: 'environment.polyproj' };
          },
          open: async () => {
            window.openCount++;
            return { project: structuredClone(window.saved), path: 'environment.polyproj' };
          },
          confirmProjectOpen: async () => true,
          beginImageExport: async (id) => ({ id }),
          writeImageExport: async (_id, image) => {
            window.captures.push(image);
            return { path: 'environment.png' };
          },
          abortImageExport: async () => {},
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      const ready = () =>
        page.waitForFunction(() => document.getElementById('cancel').hidden && document.querySelector('#evidence pre'));
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
      await ready();
      await page.locator('#welcome-close').click();
      if (await page.locator('body').evaluate((n) => n.classList.contains('inspector-hidden')))
        await page.locator('#toggle-inspector').click();
      const appearance = async () => {
        if (!(await page.locator('#surface-settings').evaluate((n) => n.open)))
          await page.locator('#surface-settings > summary').click();
        if (!(await page.locator('#material-effects-settings').evaluate((n) => n.open)))
          await page.locator('#material-effects-settings > summary').click();
      };
      await appearance();
      assert.equal(await page.locator('#effects-image-import').isDisabled(), true);
      await page.locator('#surface-settings > summary').click();
      await page.locator('[data-key="cube"]').click();
      await ready();
      await appearance();
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      assert.equal(await page.locator('#effects-image-import').evaluate((n) => !!n.closest('[data-expert]')), false);
      await page.locator('#appearance-effects-options > summary').click();
      await page.locator('#effects-reflectivity').fill('1');
      await page.locator('#effects-apply').click();
      await page.waitForFunction(() => !document.getElementById('effects-apply').disabled);
      await page.locator('#effects-image-file').setInputFiles({
        name: 'test-panorama.png',
        mimeType: 'image/png',
        buffer: Buffer.from(fixture.pngBase64, 'base64'),
      });
      await page.locator('#effects-image-import').click();
      await page.waitForFunction(() => document.getElementById('effects-image-status').textContent.includes('32'));
      assert.equal(await page.locator('#effects-reflection').inputValue(), 'image');
      const save = async () => {
        const count = await page.evaluate(() => window.saveCount);
        await page.locator('#save').click();
        await page.waitForFunction((n) => window.saveCount > n, count);
        return page.evaluate(() => window.saved);
      };
      const current = (project) => {
        const d = project.documents[project.active];
        return d.states[d.cursor];
      };
      const capture = async () => {
        const n = await page.evaluate(() => window.captures.length);
        await page.locator('#image').click();
        await page.waitForFunction((n) => window.captures.length > n, n);
        await page.waitForFunction(() => !document.getElementById('image').disabled);
        return page.evaluate(() => window.captures.at(-1));
      };
      const pixels = async (png) =>
        page.evaluate(async (png) => {
          const image = new Image();
          image.src = png;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const c = canvas.getContext('2d');
          c.drawImage(image, 0, 0);
          const data = c.getImageData(0, 0, canvas.width, canvas.height).data;
          return {
            width: canvas.width,
            height: canvas.height,
            hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data))).join(','),
          };
        }, png);
      const output = [];
      for (const mode of ['reflection', 'refraction']) {
        await appearance();
        await page.selectOption('#effects-environmentMode', mode);
        await page.locator('#effects-apply').click();
        await page.waitForFunction(() => !document.getElementById('effects-apply').disabled);
        await page.locator('#surface-settings > summary').click();
        const saved = await save(),
          before = await pixels(await capture());
        assert.equal(current(saved).view.materialEffects.environmentMode, mode);
        assert.equal(current(saved).view.materialEffects.environmentAsset.width, 32);
        await page.locator('#open').click();
        await ready();
        await page.waitForFunction(() => document.getElementById('effects-reflection').value === 'image');
        const after = await pixels(await capture());
        assert.deepEqual(after, before, mode + ' exported pixels match reopened project');
        const reopened = await save();
        assert.deepEqual(current(reopened).view.materialEffects, current(saved).view.materialEffects);
        assert.deepEqual(current(reopened).model, current(saved).model);
        output.push(before);
      }
      assert.notEqual(output[0].hash, output[1].hash, 'reflection and refraction produce distinct pixels');
      const pngOptions = async (scale, transparent) => {
        await page.locator('#view-options > summary').click();
        if (!(await page.locator('#png-settings').evaluate((n) => n.open)))
          await page.locator('#png-settings > summary').click();
        await page.locator('#png-scale').selectOption(scale);
        await page.locator('#png-transparent').setChecked(transparent);
        await page.locator('#view-options > summary').click();
      };
      await pngOptions('2', true);
      const transparent = await capture(),
        transparentPixels = await pixels(transparent);
      assert.equal(transparentPixels.width, output[1].width * 2);
      assert.equal(transparentPixels.height, output[1].height * 2);
      assert.equal(
        await page.evaluate(async (png) => {
          const image = new Image();
          image.src = png;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const c = canvas.getContext('2d');
          c.drawImage(image, 0, 0);
          return c.getImageData(0, 0, 1, 1).data[3];
        }, transparent),
        0
      );
      await pngOptions('1', false);
      await appearance();
      await page.locator('#effects-image-remove').click();
      assert.equal(await page.locator('#effects-reflection').inputValue(), 'none');
      await page.locator('#surface-settings > summary').click();
      assert.notEqual(
        (await pixels(await capture())).hash,
        output[1].hash,
        'removing the environment changes output pixels'
      );
      assert.equal(current(await save()).view.materialEffects.environmentAsset, null);
      assert.deepEqual(errors, []);
      assert.equal(stderr, '');
    } finally {
      await browser?.close();
      await server.close();
      lines.close();
      engine.kill();
      for (const job of pending.values()) job.reject(Error('Test complete.'));
    }
  }
);
