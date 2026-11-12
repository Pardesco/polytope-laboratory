import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

test(
  'timeline mounted with the native engine preserves controls, history and mode ownership',
  { timeout: 120000 },
  async (t) => {
    const engine = spawn('python', ['-u', 'engine/server.py'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }),
      pending = new Map();
    let id = 0,
      browser;
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
        pending.set(++id, { resolve, reject });
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
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
        errors = [];
      page.setDefaultTimeout(8000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript(() => {
        window.polytope = {
          engine: (request) => window.nativeEngine(request),
          cancel: async () => {},
          setDirty: async () => {},
          setWorkspaceAvailability: async () => {},
          onAction() {},
          libraries: async () => ({ libraries: [], errors: [] }),
          recoveryInfo: async () => null,
          startupInfo: async () => ({ hidden: true }),
          autosave: async () => {},
          recentFiles: async () => ({ files: [] }),
          save: async (project) => {
            window.timelineSaved = await window.nativeEngine({ op: 'validate-project', params: { project } });
            return { path: 'timeline.polyproj' };
          },
          open: async () => ({ project: structuredClone(window.timelineSaved), path: 'timeline.polyproj' }),
        };
      });
      await page.addInitScript(() => {
        window.timelineFailures = [];
        import('/friendly-messages.mjs').then(({ FriendlyMessages }) => {
          const original = FriendlyMessages.prototype.error;
          FriendlyMessages.prototype.error = function (error) {
            window.timelineFailures.push(error.stack);
            return original.call(this, error);
          };
        });
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      await page.waitForFunction(
        () =>
          document.getElementById('model-name').textContent === 'Tesseract' && document.getElementById('cancel').hidden
      );
      // Dismiss first-run dialogs using their existing button.
      await page.waitForFunction(() => document.body.classList.contains('expert-mode'));
      await page.evaluate(() => {
        document.body.classList.remove('expert-mode');
        for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
      });
      const open = async () => {
        if (!(await page.locator('#animation-settings').evaluate((node) => node.open)))
          await page.locator('#animation-settings>summary').click();
        await page.locator('#timeline-panel').waitFor({ state: 'visible' });
      };
      const pause = async () => {
        if ((await page.locator('#animation-play').textContent()) === 'Pause')
          await page.locator('#animation-play').click();
      };
      const seek = async (value) => {
        await page.locator('#timeline-exact-time').fill(String(value));
        await page.locator('#timeline-exact-time').press('Tab');
        await page.waitForFunction((time) => Number(document.getElementById('animation-time').value) === time, value);
      };
      await open();
      await t.test('common motion is visible without Expert mode and shrinks the model viewport', async () => {
        assert.equal(await page.locator('body').evaluate((node) => node.classList.contains('expert-mode')), false);
        assert.equal(await page.locator('#animation-rotation').isVisible(), true);
        const bounds = await page.evaluate(() => ({
          view: document.getElementById('views').getBoundingClientRect().bottom,
          timeline: document.getElementById('timeline-panel').getBoundingClientRect().top,
        }));
        assert.ok(bounds.view <= bounds.timeline);
        await page.locator('#animation-rotation').click();
        await page.waitForFunction(() => document.querySelectorAll('.timeline-diamond').length === 2);
        assert.equal(await page.locator('#animation-play').textContent(), 'Play');
        await page.locator('#animation-play').click();
        await page.waitForFunction(() => document.getElementById('animation-play').textContent === 'Pause');
        assert.equal(await page.locator('#auto-rotate').getAttribute('aria-pressed'), 'false');
        await pause();
      });
      await t.test('Space transport, exact expression time, two-keyframe refusal and capture', async () => {
        await page.locator('#timeline-panel').focus();
        await page.keyboard.press('Space');
        await page.waitForFunction(() => document.getElementById('animation-play').textContent === 'Pause');
        await page.keyboard.press('Space');
        await page.waitForFunction(() => document.getElementById('animation-play').textContent === 'Play');
        await page.locator('#timeline-delete-keyframe').click();
        await page.waitForFunction(() => document.getElementById('status').textContent.includes('at least two'));
        assert.equal(await page.locator('.timeline-diamond').count(), 2);
        await page.locator('#timeline-exact-time').fill('8/2');
        await page.locator('#timeline-exact-time').press('Tab');
        await page.waitForFunction(() => Number(document.getElementById('animation-time').value) === 4);
        assert.match(await page.locator('#animation-keyframe').textContent(), /Add keyframe/);
        await page.locator('#animation-keyframe').click();
        await page.waitForFunction(() => document.querySelectorAll('.timeline-diamond').length === 3);
        assert.equal(await page.locator('#animation-keyframe').textContent(), 'Update selected keyframe');
      });
      await t.test('keyframe keyboard navigation, numeric edit, Undo and Redo', async () => {
        await page.locator('.timeline-diamond[data-keyframe="1"]').click();
        await page.locator('.timeline-diamond[data-keyframe="1"]').press('ArrowRight');
        await page.waitForFunction(() => Number(document.getElementById('animation-time').value) === 8);
        await page.locator('#undo').click();
        await page.waitForFunction(() => document.querySelectorAll('.timeline-diamond').length === 2);
        await open();
        await page.locator('#redo').click();
        await page.waitForFunction(() => document.querySelectorAll('.timeline-diamond').length === 3);
        await open();
        await page.evaluate(() => document.body.classList.add('expert-mode'));
        await page.locator('#timeline-numeric>summary').click();
        await page.getByLabel('Keyframe 2 time', { exact: true }).fill('3');
        await page.getByLabel('Keyframe 2 time', { exact: true }).press('Tab');
        await page.waitForFunction(() =>
          document.querySelector('.timeline-diamond[data-keyframe="1"]').title.includes('3.000 s')
        );
        await page.locator('#timeline-numeric>summary').click();
        await page.evaluate(() => document.body.classList.remove('expert-mode'));
      });
      await t.test('mode switching retains the keyframe playhead, tour mount and all legacy IDs', async () => {
        await seek(2);
        await page.locator('#timeline-tour-mode').click();
        assert.equal(await page.locator('#timeline-tour>#tour-controls').count(), 1);
        await page.locator('#tour-add').click();
        await page.waitForFunction(() => document.getElementById('tour-event').options.length === 1);
        await page.locator('#timeline-exact-time').fill('1');
        await page.locator('#timeline-exact-time').press('Tab');
        await page.waitForFunction(() => Number(document.getElementById('tour-scrub').value) === 1);
        await page.locator('#timeline-keyframes-mode').click();
        assert.equal(Number(await page.locator('#animation-time').inputValue()), 2);
        await page.locator('#timeline-tour-mode').click();
        assert.equal(Number(await page.locator('#tour-scrub').inputValue()), 1);
        await page.locator('#timeline-keyframes-mode').click();
        for (const id of [
          'animation-duration',
          'animation-fps',
          'animation-time',
          'animation-export',
          'animation-png',
          'animation-webm',
          'tour-fps',
          'tour-play',
          'tour-scrub',
          'tour-export',
          'tour-png',
          'tour-webm',
          'tour-transition-apply',
        ])
          assert.equal(await page.locator('#' + id).count(), 1, id);
      });
      await t.test(
        'ruler scrubbing, pointer retiming, keyboard deletion and resizing work in the mounted UI',
        async () => {
          await page.locator('#timeline-ruler').scrollIntoViewIfNeeded();
          const ruler = await page.locator('#timeline-ruler').boundingBox();
          await page.mouse.click(ruler.x + ruler.width / 4, ruler.y + 8);
          await page.waitForFunction(
            () => Math.abs(Number(document.getElementById('animation-time').value) - 2) < 0.02
          );
          const diamond = await page.locator('.timeline-diamond[data-keyframe="1"]').boundingBox(),
            track = await page.locator('[data-lane="angles"]>.timeline-lane-track').boundingBox();
          await page.mouse.move(diamond.x + diamond.width / 2, diamond.y + diamond.height / 2);
          await page.mouse.down();
          await page.mouse.move(track.x + (track.width * 3.5) / 8, diamond.y + diamond.height / 2, { steps: 8 });
          await page.mouse.up();
          await page.waitForFunction(() =>
            document.querySelector('.timeline-diamond[data-keyframe="1"]').title.includes('3.500 s')
          );
          await page.locator('.timeline-diamond[data-keyframe="1"]').press('Delete');
          await page.waitForFunction(() => document.querySelectorAll('.timeline-diamond').length === 2);
          await page.locator('#undo').click();
          await open();
          assert.equal(await page.locator('.timeline-diamond').count(), 3);
          const height = await page.locator('#timeline-panel').evaluate((node) => node.clientHeight);
          await page.locator('#timeline-resize').press('ArrowUp');
          assert.ok((await page.locator('#timeline-panel').evaluate((node) => node.clientHeight)) > height);
        }
      );
      await t.test('Export video opens the global animation goal with the current mode', async () => {
        await page.locator('#timeline-export-video').click();
        await page.locator('#export-dialog').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#export-video-source').inputValue(), 'animation');
        await page.locator('#close-export').click();
        await page.locator('#timeline-tour-mode').click();
        await page.locator('#timeline-export-video').click();
        await page.waitForFunction(() => document.getElementById('export-video-source')?.value === 'tour');
        await page.locator('#close-export').click();
        await page.locator('#timeline-keyframes-mode').click();
      });
      await t.test('native project validation and reopen retain animation edit snapshots', async () => {
        await page.locator('#save').click();
        await page.waitForFunction(() => window.timelineSaved);
        const saved = await page.evaluate(() => window.timelineSaved.documents[window.timelineSaved.active]);
        assert.ok(saved.states.length >= 4);
        assert.equal(saved.states[saved.cursor].view.animation.keyframes.length, 3);
        await page.locator('#open').click();
        await page.waitForFunction(() => document.getElementById('status').textContent === 'Opened timeline.polyproj');
        await open();
        assert.equal(await page.locator('.timeline-diamond').count(), 3);
        await page.locator('#undo').click();
        await open();
        assert.equal(
          await page.locator('.timeline-diamond').count(),
          saved.states[saved.cursor - 1].view.animation.keyframes.length
        );
        await page.locator('#redo').click();
        await open();
        assert.equal(await page.locator('.timeline-diamond').count(), 3);
      });
      await mkdir('artifacts', { recursive: true });
      await page.screenshot({ path: 'artifacts/timeline-mounted.png' });
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => window.timelineFailures), []);
    } finally {
      await browser?.close();
      await server.close();
      engine.kill();
      lines.close();
    }
  }
);
