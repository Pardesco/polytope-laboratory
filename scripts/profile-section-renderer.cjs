// Observe the actual visible 120-cell section task, including renderer CPU work.
const { _electron: electron } = require('playwright'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
async function main() {
  const folder = await fs.mkdtemp(path.join(root, 'artifacts', 'section-render-profile-')),
    profile = path.join(folder, 'profile');
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, 'linked-libraries.json'), JSON.stringify({ version: 1, paths: [] }));
  const runtime = await require('./hidden-runtime.cjs').hiddenRuntime(),
    env = { ...process.env, POLYTOPE_TEST_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.POLYTOPE_TEST_MODE;
  if (runtime.packaged) env.POLYTOPE_PYTHON = path.join(folder, 'unavailable-python.exe');
  let app, page, cdp;
  const errors = [];
  try {
    app = await electron.launch({
      executablePath: runtime.executablePath,
      args: runtime.packaged ? [] : [root],
      cwd: root,
      env,
      timeout: 30000,
    });
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1 });
    });
    page = await app.firstWindow();
    require('./smoke-helpers.cjs').autoReveal(page);
    page.setDefaultTimeout(30000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(
      () =>
        document.getElementById('model-name')?.textContent === 'Tesseract' && document.getElementById('cancel').hidden
    );
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1500, 950));
    const loading = await page.evaluate(() => performance.now());
    await page.locator('[data-key="cell120"]').click();
    await page.waitForFunction(
      () => document.getElementById('model-name').textContent === '120-cell' && document.getElementById('cancel').hidden
    );
    const loaded = await page.evaluate(() => performance.now());
    await page.locator('#viewport-layout').selectOption('split');
    await page.waitForFunction(
      () => !document.getElementById('promote').disabled && document.getElementById('cancel').hidden
    );
    await page.locator('#section-normal').fill('.2, .3, .4, 1');
    await page.locator('#section-depth').fill('.1');
    await page.locator('#apply-section').click();
    await page.waitForFunction(
      () => !document.getElementById('promote').disabled && document.getElementById('cancel').hidden
    );
    await page.evaluate(() => {
      window.sectionProfile = { runs: [], longTasks: [] };
      const p = window.sectionProfile;
      p.shaderCalls = { createProgram: 0, deleteProgram: 0, getProgramInfoLog: 0 };
      // Count actual WebGL calls in the warmed five-cut workload. These are
      // lifetime/compilation observations, not a GPU timer or frame-rate metric.
      for (const type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
        if (!type) continue;
        for (const name of Object.keys(p.shaderCalls)) {
          const original = type.prototype[name];
          type.prototype[name] = function (...args) {
            p.shaderCalls[name]++;
            return original.apply(this, args);
          };
        }
      }
      p.observer = new MutationObserver(() => {
        const text = document.getElementById('derived-status').textContent;
        if (p.active && text.startsWith('Computing ') && p.active.computing == null)
          p.active.computing = performance.now();
        if (p.active && !document.getElementById('promote').disabled && text.includes('vertices')) {
          p.active.completed = performance.now();
          p.active.status = text;
          p.runs.push(p.active);
          p.active = null;
        }
      });
      p.observer.observe(document.getElementById('derived-status'), {
        childList: true,
        subtree: true,
        characterData: true,
      });
      p.observer.observe(document.getElementById('promote'), { attributes: true, attributeFilter: ['disabled'] });
      p.longObserver = new PerformanceObserver((list) =>
        p.longTasks.push(...list.getEntries().map((e) => ({ start: e.startTime, duration: e.duration })))
      );
      p.longObserver.observe({ type: 'longtask', buffered: false });
    });
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');
    for (const depth of [0, 0.05, 0.1, 0.15, 0.2]) {
      await page.locator('#section-depth').fill(String(depth));
      await page.locator('#apply-section').evaluate((button, depth) => {
        window.sectionProfile.active = { depth, started: performance.now() };
        button.click();
      }, depth);
      await page.waitForFunction(() => !window.sectionProfile.active && document.getElementById('cancel').hidden);
    }
    const { profile: cpu } = await cdp.send('Profiler.stop');
    await fs.writeFile(path.join(folder, 'renderer.cpuprofile'), JSON.stringify(cpu));
    const measured = await page.evaluate(() => {
      const p = window.sectionProfile;
      p.observer.disconnect();
      p.longObserver.disconnect();
      return { runs: p.runs, longTasks: p.longTasks, shaderCalls: p.shaderCalls, visibility: document.visibilityState };
    });
    assert.equal(measured.runs.length, 5);
    assert.deepEqual(errors, []);
    const nodes = new Map(cpu.nodes.map((n) => [n.id, n])),
      self = new Map();
    for (let i = 0; i < (cpu.samples ?? []).length; i++) {
      const node = nodes.get(cpu.samples[i]),
        frame = node.callFrame,
        key = JSON.stringify(frame);
      const item = self.get(key) || { ...frame, selfMs: 0, samples: 0 };
      item.selfMs += (cpu.timeDeltas?.[i] ?? 0) / 1000;
      item.samples++;
      self.set(key, item);
    }
    const top = [...self.values()].sort((a, b) => b.selfMs - a.selfMs).slice(0, 25),
      result = {
        passed: true,
        purpose: 'visible UI task and sampled renderer CPU profile; not FPS or isolated GPU time',
        version: await app.evaluate(({ app }) => app.getVersion()),
        packaged: runtime.packaged,
        model: '120-cell',
        loadObservedMs: loaded - loading,
        ...measured,
        topSelfTime: top,
        hardware: {
          cpu: os.cpus()[0]?.model,
          logicalCpus: os.cpus().length,
          memoryGiB: os.totalmem() / 2 ** 30,
          platform: os.platform(),
          release: os.release(),
        },
        errors,
      };
    await page.screenshot({ path: path.join(folder, 'section.png') });
    await fs.writeFile(path.join(folder, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ folder, ...result }, null, 2));
  } catch (error) {
    await page?.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {});
    console.error('Artifacts:', folder);
    throw error;
  } finally {
    await cdp?.detach().catch(() => {});
    await app?.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
