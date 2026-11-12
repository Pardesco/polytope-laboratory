import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

for (const [key, nv, nf] of [
  ['dodecahedron', 20, 12],
  ['icosahedron', 12, 20],
])
  test(`mounted H3 ${key}: Expert off, reopen, ratio sweep and real VP8 video`, { timeout: 120000 }, async () => {
    const engine = spawn('python', ['-B', '-u', 'engine/server.py'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      }),
      pending = new Map();
    let next = 0,
      stderr = '',
      browser;
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
      }),
      directory = await mkdtemp(path.join(tmpdir(), 'h3-video-'));
    try {
      await server.listen();
      browser = await chromium.launch({
        headless: true,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      });
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' }),
        errors = [];
      page.setDefaultTimeout(15000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript(() => {
        window.snubRequests = [];
        window.savedCount = 0;
        window.videoChunks = [];
        window.videoFinished = 0;
        window.polytope = {
          engine: (request) => {
            window.snubRequests.push(structuredClone(request));
            return window.nativeEngine(request);
          },
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
            window.savedCount++;
            return { path: 'h3.polyproj' };
          },
          open: async () => ({ project: structuredClone(window.saved), path: 'h3.polyproj' }),
          confirmProjectOpen: async () => true,
          animationBegin: async (options) => {
            window.videoOptions = options;
            window.videoChunks = [];
            return { id: 'h3-video' };
          },
          animationWrite: async (id, index, data) => {
            window.videoChunks[index] = Array.from(new Uint8Array(data));
          },
          animationFinish: async () => {
            window.videoFinished++;
            return { path: 'h3.webm' };
          },
          animationAbort: async () => {
            window.videoAborted = true;
          },
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      const ready = () =>
        page.waitForFunction(() => document.getElementById('cancel').hidden && document.querySelector('#evidence pre'));
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
      await ready();
      await page.locator('#welcome-close').click();
      await page.locator('#library-show-all').click();
      await page.locator(`[data-key="${key}"]`).click();
      await ready();
      const open = async () => {
        if (!(await page.locator('#dual-morph-settings').evaluate((n) => n.open))) {
          await page.locator('#dock-more-button').click();
          await page.locator('#open-dual-morph-settings').click();
        }
      };
      await open();
      assert.equal(
        await page.locator('#dual-morph-method option[value="via-snub"]').evaluate((n) => n.disabled),
        false
      );
      await page.locator('#dual-morph-method').selectOption('via-snub');
      assert.match(await page.locator('#dual-morph-snub-help').textContent(), /Dodecahedron \/ Icosahedron.*0.5/);
      await page.locator('#dual-morph-ratio').fill('1/2');
      await page.locator('#dual-morph-apply').click();
      await page.waitForFunction(
        () =>
          document.getElementById('dual-morph-result').textContent.includes('0.500') &&
          document.getElementById('dual-morph-result').textContent.includes('strict gap')
      );
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      await page.locator('#dual-morph-settings .chrome-drawer-close').click();
      await page.locator('#save').click();
      await page.waitForFunction(() => window.savedCount === 1);
      const state = await page.evaluate(() => {
        const d = window.saved.documents[window.saved.active];
        return d.states[d.cursor];
      });
      assert.equal(state.model.vertices.length, nv);
      assert.equal(state.model.faces.length, nf);
      assert.equal(state.view.dualMorph.method, 'via-snub');
      assert.equal(state.view.dualMorph.ratio, 0.5);
      await page.locator('#open').click();
      await ready();
      await open();
      await page.waitForFunction(
        () =>
          document.getElementById('dual-morph-result').textContent.includes('0.500') &&
          document.getElementById('dual-morph-result').textContent.includes('strict gap')
      );
      await page.locator('#dual-morph-scrub').fill('1');
      await page.locator('#dual-morph-scrub').dispatchEvent('input');
      await page.waitForFunction(() => document.getElementById('dual-morph-result').textContent.includes('1.000'));
      assert.equal(await page.locator('#dual-morph-play').textContent(), 'Replay');
      await page.locator('#dual-morph-scrub').fill('0');
      await page.locator('#dual-morph-scrub').dispatchEvent('input');
      await page.waitForFunction(() => document.getElementById('dual-morph-result').textContent.includes('0.000'));
      await page.locator('#dual-morph-settings .chrome-drawer-close').click();
      await page
        .locator('#animation-morph')
        .evaluate((n) => n.dispatchEvent(new CustomEvent('app-chrome-reveal', { bubbles: true })));
      await page.evaluate(() => {
        document.getElementById('animation-duration').value = '1';
        const fps = document.getElementById('animation-fps');
        fps.value = '2';
        fps.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForFunction(
        () =>
          !document.getElementById('animation-fps').disabled && document.getElementById('animation-fps').value === '2'
      );
      await page.locator('#animation-morph').click();
      await ready();
      await page.locator('#timeline-export-settings').evaluate((n) => (n.open = true));
      await page.locator('#animation-size').selectOption('w480');
      await page.locator('#animation-webm').click();
      await page.waitForFunction(() => window.videoFinished === 1, undefined, { timeout: 60000 });
      const chunks = await page.evaluate(() => window.videoChunks),
        options = await page.evaluate(() => window.videoOptions),
        bytes = Buffer.concat(chunks.map((c) => Buffer.from(c))),
        video = path.join(directory, 'h3.webm');
      await writeFile(video, bytes);
      assert.equal(options.frameCount, 3);
      assert.equal(options.fps, 2);
      assert.equal(options.format, 'webm');
      const probe = JSON.parse(
        execFileSync(
          'ffprobe',
          ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-show_frames', '-of', 'json', video],
          { encoding: 'utf8', windowsHide: true }
        )
      );
      assert.equal(probe.streams[0].codec_name, 'vp8');
      assert.equal(probe.streams[0].width, 480);
      assert.equal(probe.frames.length, 3);
      assert.deepEqual(
        probe.frames.map((f) => Number(f.best_effort_timestamp_time)),
        [0, 0.5, 1]
      );
      const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', video, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
          windowsHide: true,
          maxBuffer: 16 * 1024 * 1024,
        }),
        size = 480 * probe.streams[0].height * 3;
      assert.equal(raw.length, size * 3);
      assert.notDeepEqual(raw.subarray(0, size), raw.subarray(size, size * 2));
      assert.notDeepEqual(raw.subarray(size, size * 2), raw.subarray(size * 2));
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      assert.deepEqual(errors, []);
      assert.equal(stderr, '');
    } finally {
      await browser?.close();
      await server.close();
      lines.close();
      engine.kill();
      for (const job of pending.values()) job.reject(Error('Test complete.'));
      await rm(directory, { recursive: true, force: true });
    }
  });
