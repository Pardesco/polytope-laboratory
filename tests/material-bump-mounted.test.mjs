import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/material-bump.json', import.meta.url)));

test(
  'portable bump native UI, independent lit-plane oracle, reopen and exported pixels',
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
        errors = [],
        shaderErrors = [];
      page.setDefaultTimeout(25000);
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error' && /Shader|VALIDATE_STATUS|WebGLProgram/.test(message.text()))
          shaderErrors.push(message.text());
      });
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript(() => {
        window.captures = [];
        window.saveCount = 0;
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
            return { path: 'bump.polyproj' };
          },
          open: async () => ({ project: structuredClone(window.saved), path: 'bump.polyproj' }),
          confirmProjectOpen: async () => true,
          beginImageExport: async (id) => ({ id }),
          writeImageExport: async (_id, image) => {
            window.captures.push(image);
            return { path: 'bump.png' };
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
      assert.equal(await page.locator('#effects-bump-image-import').isDisabled(), true);
      await page.locator('#surface-settings > summary').click();
      await page.locator('[data-key="cube"]').click();
      await ready();
      await appearance();
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      assert.equal(
        await page.locator('#effects-bump-image-import').evaluate((n) => !!n.closest('[data-expert]')),
        false
      );
      await page.locator('#appearance-effects-options > summary').click();
      await page.locator('#effects-bumpFrequency').fill('2/1');
      await page.locator('#effects-bumpStrength').fill('0.1');
      await page.locator('#effects-apply').click();
      await page.waitForFunction(() => !document.getElementById('effects-apply').disabled);
      await page
        .locator('#effects-bump-image-file')
        .setInputFiles({ name: 'height.png', mimeType: 'image/png', buffer: Buffer.from(fixture.pngBase64, 'base64') });
      await page.locator('#effects-bump-image-import').click();
      await page.waitForFunction(() => document.getElementById('effects-bump-image-status').textContent.includes('16'));
      assert.equal(await page.locator('#effects-bump').inputValue(), 'image');
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
      await page.locator('#surface-settings > summary').click();
      const saved = await save(),
        before = await pixels(await capture()),
        savedState = current(saved);
      assert.equal(savedState.view.materialEffects.bump, 'image');
      assert.equal(savedState.view.materialEffects.bumpFrequency, 2);
      assert.equal(savedState.view.materialEffects.bumpAsset.base64, fixture.pngBase64);
      await page.locator('#open').click();
      await ready();
      await page.waitForFunction(() => document.getElementById('effects-bump').value === 'image');
      assert.deepEqual(await pixels(await capture()), before, 'reopened bump exports identical decoded pixels');
      const reopened = await save();
      assert.deepEqual(current(reopened).view.materialEffects, savedState.view.materialEffects);
      assert.deepEqual(current(reopened).model, savedState.model);
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
        scaled = await pixels(transparent);
      assert.equal(scaled.width, before.width * 2);
      assert.equal(scaled.height, before.height * 2);
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
      await page.locator('#effects-bump-image-remove').click();
      assert.equal(await page.locator('#effects-bump').inputValue(), 'none');
      await page.locator('#surface-settings > summary').click();
      assert.notEqual((await pixels(await capture())).hash, before.hash, 'removal changes lit output pixels');
      assert.equal(current(await save()).view.materialEffects.bumpAsset, null);
      // Independent numerical oracle: a white plane lit along (+X,+Z), linear output.
      // Interior ramp samples give gradient (192/255,-64/255,0).
      const oracle = await page.evaluate(
        async ({ asset, threeURL }) => {
          const THREE = await import(threeURL),
            { applyMaterialEffects, prepareMaterialEffects, disposeMaterialEffects } = await import(
              '/viewer-material-effects.mjs'
            );
          const renderer = new THREE.WebGLRenderer({ antialias: false });
          renderer.setSize(64, 64);
          renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
          const target = new THREE.WebGLRenderTarget(64, 64),
            scene = new THREE.Scene(),
            camera = new THREE.OrthographicCamera(0.1, 0.7, 0.7, 0.1, 0.1, 10);
          camera.position.z = 2;
          const geometry = new THREE.PlaneGeometry(0.6, 0.6).translate(0.4, 0.4, 0),
            material = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x000000 });
          scene.add(new THREE.Mesh(geometry, material));
          const light = new THREE.DirectionalLight(0xffffff, Math.PI);
          light.position.set(1, 0, 1);
          scene.add(light);
          const view = {
            model: { dimension: 3, embeddingDimension: 3, faces: [] },
            view: { materialEffects: { bump: 'image', bumpAsset: asset, bumpFrequency: 4, bumpStrength: 0.1 } },
            surface: { material },
          };
          try {
            applyMaterialEffects(view, view.view);
            await prepareMaterialEffects(view);
            renderer.setRenderTarget(target);
            renderer.render(scene, camera);
            const pixels = new Uint8Array(4);
            renderer.readRenderTargetPixels(target, 32, 32, 1, 1, pixels);
            return Array.from(pixels);
          } finally {
            disposeMaterialEffects(view);
            target.dispose();
            material.dispose();
            geometry.dispose();
            renderer.dispose();
          }
        },
        {
          asset: savedState.view.materialEffects.bumpAsset,
          threeURL:
            '/@fs/' +
            fileURLToPath(new URL('../node_modules/three/build/three.module.js', import.meta.url)).replaceAll(
              '\\',
              '/'
            ),
        }
      );
      const x = (0.1 * 4 * 192) / 255,
        y = (0.1 * 4 * 64) / 255,
        expected = (255 * (1 - x)) / Math.sqrt(2 * (1 + x * x + y * y));
      for (const channel of oracle.slice(0, 3))
        assert.ok(
          Math.abs(channel - expected) <= 2,
          `lit plane ${channel} agrees with independent normal/light oracle ${expected}`
        );
      assert.equal(oracle[3], 255);
      assert.deepEqual(errors, []);
      assert.deepEqual(shaderErrors, []);
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
