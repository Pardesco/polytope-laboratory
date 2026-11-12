const { openDisclosure } = require('./smoke-helpers.cjs');
// Measure completed pose publications separately from browser animation cadence.
// Use --visible for a normal desktop window; otherwise use isolated hidden mode.
const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'),
  visible = process.argv.includes('--visible');
async function main() {
  const folder = await fs.mkdtemp(path.join(root, 'artifacts', 'morph-playback-'));
  const expected = process.argv.find((a) => a.startsWith('--version='))?.slice('--version='.length);
  assert.ok(
    !expected || process.env.POLYTOPE_TEST_EXECUTABLE,
    'Historical version overrides require an actual packaged executable'
  );
  const runtime = await require('./hidden-runtime.cjs').hiddenRuntime(process.env.POLYTOPE_TEST_EXECUTABLE, expected);
  const profile = path.join(folder, 'profile');
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, 'linked-libraries.json'), JSON.stringify({ version: 1, paths: [] }));
  const env = { ...process.env, POLYTOPE_TEST_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.POLYTOPE_TEST_MODE;
  if (runtime.packaged) env.POLYTOPE_PYTHON = path.join(folder, 'unavailable-development-python.exe');
  if (!visible) env.POLYTOPE_TEST_MODE = 'hidden-no-focus';
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
    page = await app.firstWindow();
    require('./smoke-helpers.cjs').autoReveal(page);
    page.setDefaultTimeout(30000);
    page.on('pageerror', (e) => errors.push(e.message));
    // Prevent the unsaved-changes dialog from blocking automated teardown.
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1 });
    });
    await page.waitForFunction(
      () =>
        document.getElementById('model-name')?.textContent === 'Tesseract' && document.getElementById('cancel').hidden
    );
    const windows = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => ({ visible: w.isVisible(), size: w.getContentSize() }))
    );
    assert.equal(windows[0].visible, visible);
    await page.locator('[data-key="truncated-tetrahedron"]').click();
    await page.waitForFunction(
      () =>
        document.getElementById('model-name').textContent === 'Truncated tetrahedron' &&
        document.getElementById('cancel').hidden
    );
    await page.locator('#toggle-inspector').click();
    await page.locator('[data-panel="construct"]').click();
    await openDisclosure(page, 'dual-morph-settings');
    await page.locator('#dual-morph-method').selectOption('sizing');
    await page.locator('#dual-morph-duration').fill('4');
    await page.locator('#dual-morph-apply').click();
    await page.waitForFunction(() => !document.getElementById('dual-morph-play').disabled);
    const save = async (label) => {
      const file = path.join(folder, label + '.polyproj');
      await app.evaluate(({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
      }, file);
      await page.locator('#save').click();
      await page.waitForFunction((file) => document.getElementById('status').textContent === 'Saved ' + file, file);
      const project = JSON.parse(await fs.readFile(file, 'utf8')),
        document = project.documents[project.active];
      return document.states[document.cursor];
    };
    const before = await save('before-playback');
    await page.screenshot({ path: path.join(folder, 'prepared.png') });
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');
    await page.evaluate(() => {
      const run = (window.playbackMeasurement = { started: performance.now(), poses: [], raf: [], longTasks: [] });
      const tick = (time) => {
        run.raf.push(time);
        run.rafHandle = requestAnimationFrame(tick);
      };
      run.rafHandle = requestAnimationFrame(tick);
      let previous = '';
      run.observer = new MutationObserver(() => {
        const text = document.getElementById('dual-morph-result').textContent;
        if (text !== previous) {
          previous = text;
          run.poses.push({ time: performance.now(), text });
        }
      });
      run.observer.observe(document.getElementById('dual-morph-result'), {
        childList: true,
        subtree: true,
        characterData: true,
      });
      run.longObserver = new PerformanceObserver((list) =>
        run.longTasks.push(...list.getEntries().map((e) => ({ start: e.startTime, duration: e.duration })))
      );
      run.longObserver.observe({ type: 'longtask', buffered: false });
    });
    await page.locator('#dual-morph-play').click();
    await page.waitForFunction(
      () =>
        document.getElementById('dual-morph-pause').disabled &&
        document.getElementById('dual-morph-result').textContent.includes('1.000')
    );
    const samples = await page.evaluate(() => {
      const run = window.playbackMeasurement;
      cancelAnimationFrame(run.rafHandle);
      run.observer.disconnect();
      run.longObserver.disconnect();
      return {
        started: run.started,
        ended: performance.now(),
        poses: run.poses,
        raf: run.raf,
        longTasks: run.longTasks,
        visibility: document.visibilityState,
      };
    });
    const { profile: cpu } = await cdp.send('Profiler.stop');
    await fs.writeFile(path.join(folder, 'playback.cpuprofile'), JSON.stringify(cpu));
    const after = await save('after-playback');
    assert.deepEqual(after.model, before.model);
    assert.equal(after.notes, before.notes);
    const { dualMorph: beforeMorph, ...beforeView } = before.view,
      { dualMorph: afterMorph, ...afterView } = after.view;
    assert.deepEqual(afterView, beforeView);
    assert.equal(afterMorph.ratio, 1);
    assert.deepEqual({ ...afterMorph, ratio: beforeMorph.ratio }, beforeMorph);
    await page.screenshot({ path: path.join(folder, 'endpoint.png') });
    const intervals = (values) => values.slice(1).map((value, i) => value - values[i]);
    const stats = (values) => {
      const sorted = values.toSorted((a, b) => a - b);
      return {
        count: values.length,
        mean: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length),
        median: sorted[Math.floor(sorted.length * 0.5)] ?? null,
        p95: sorted[Math.floor(sorted.length * 0.95)] ?? null,
      };
    };
    const nodes = new Map(cpu.nodes.map((node) => [node.id, node]));
    const shaderSamples = (cpu.samples ?? []).filter((id) =>
      ['getProgramInfoLog', 'getShaderInfoLog', 'shaderSource'].includes(nodes.get(id)?.callFrame.functionName)
    ).length;
    const result = {
      passed: true,
      version: runtime.version,
      runtime,
      packaged: runtime.packaged,
      developmentPythonDisabled: runtime.packaged,
      visible,
      windows,
      sourceAndObserverPreserved: true,
      hardware: {
        platform: os.platform(),
        release: os.release(),
        cpu: os.cpus()[0]?.model,
        logicalCpus: os.cpus().length,
        memoryGiB: os.totalmem() / 2 ** 30,
      },
      gpu: await app.evaluate(({ app }) => app.getGPUFeatureStatus()),
      workload: {
        model: 'Truncated tetrahedron',
        method: 'sizing',
        duration: 4,
        radius: await page.locator('#dual-morph-radius').inputValue(),
      },
      measurements: {
        elapsedMs: samples.ended - samples.started,
        publishedPoses: samples.poses.length,
        poseIntervalMs: stats(intervals(samples.poses.map((p) => p.time))),
        animationIntervalMs: stats(intervals(samples.raf)),
        longTasks: samples.longTasks.length,
        shaderSamples,
        cpuSamples: cpu.samples?.length ?? 0,
      },
      samples,
      errors,
    };
    assert.ok(samples.poses.length > 2);
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(folder, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ folder, ...result, samples: undefined }, null, 2));
  } catch (error) {
    await page?.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {});
    await fs.writeFile(path.join(folder, 'failure.json'), JSON.stringify({ error: error.stack, errors }, null, 2));
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
