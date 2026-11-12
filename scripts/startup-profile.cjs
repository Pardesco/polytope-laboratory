// Run after building, outside the sandbox. Both samples stay hidden/unfocused.
const fs = require('node:fs/promises'),
  path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
function timingRows(launched, main, renderer) {
  const marks = [
    ...main,
    ...renderer.marks.map((row) => ({
      name: row.name.replace(/^polytope:/, ''),
      epochMs: renderer.timeOrigin + row.startTime,
    })),
  ].sort((a, b) => a.epochMs - b.epochMs);
  let previous = launched;
  return marks.map((row) => {
    const result = {
      stage: row.name,
      'from launch (ms)': Math.round(row.epochMs - launched),
      'since previous (ms)': Math.round(row.epochMs - previous),
    };
    previous = row.epochMs;
    return result;
  });
}
async function main() {
  const { _electron: electron } = require('playwright');
  const { hiddenRuntime } = require('./hidden-runtime.cjs');
  const { startHiddenWindowWatch } = require('./windows-hidden-window-watch.cjs');
  const runtime = await hiddenRuntime();
  await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
  const folder = await fs.mkdtemp(path.join(root, 'artifacts', 'startup-profile-'));
  const profile = path.join(folder, 'profile');
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, 'linked-libraries.json'), JSON.stringify({ version: 1, paths: [] }));
  const watch = await startHiddenWindowWatch({
    executablePath: runtime.executablePath,
    evidencePath: path.join(folder, 'native-watch.json'),
  });
  const result = { runtime, folder, samples: [] };
  let app, error;
  try {
    for (const sample of ['cold index', 'cached index']) {
      const env = {
        ...process.env,
        POLYTOPE_TEST_MODE: 'hidden-no-focus',
        POLYTOPE_TEST_USER_DATA: profile,
        POLYTOPE_STARTUP_PROFILE: '1',
      };
      delete env.ELECTRON_RUN_AS_NODE;
      if (runtime.packaged) env.POLYTOPE_PYTHON = path.join(folder, 'unavailable-development-python.exe');
      const launched = Date.now();
      app = await electron.launch({
        executablePath: runtime.executablePath,
        args: runtime.packaged ? [] : [root],
        cwd: root,
        env,
        timeout: 30000,
      });
      const page = await app.firstWindow();
      (require('./smoke-helpers.cjs').autoReveal(page), (pageErrors = []));
      page.on('pageerror', (e) => pageErrors.push(e.message));
      await page.waitForFunction(
        () =>
          performance.getEntriesByName('polytope:analysis-done').length &&
          performance.getEntriesByName('polytope:first-model-rendered').length &&
          document.getElementById('cancel').hidden,
        {},
        { timeout: 120000 }
      );
      const qualification = await app.evaluate(({ app }) => app.polytopeQualification);
      assert.equal(qualification?.mode, 'hidden-no-focus');
      assert.equal(qualification.profile, profile);
      const mainMarks = await app.evaluate(({ app }) => app.polytopeStartupProfile.marks);
      const renderer = await page.evaluate(() => ({
        timeOrigin: performance.timeOrigin,
        marks: performance
          .getEntriesByType('mark')
          .filter((row) => row.name.startsWith('polytope:'))
          .map((row) => ({ name: row.name, startTime: row.startTime })),
      }));
      const windows = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((w) => ({
          visible: w.isVisible(),
          focused: w.isFocused(),
          focusable: w.isFocusable(),
        }))
      );
      assert.deepEqual(windows, [{ visible: false, focused: false, focusable: false }]);
      assert.deepEqual(pageErrors, []);
      const mark = (name) => renderer.marks.find((row) => row.name === 'polytope:' + name)?.startTime;
      for (const name of [
        'renderer-script-parsed',
        'catalog-loaded',
        'first-model-rendered',
        'analysis-started',
        'analysis-done',
      ])
        assert.ok(Number.isFinite(mark(name)), name + ' missing');
      assert.ok(
        mainMarks.some((row) => row.name === 'engine-ready'),
        'Engine readiness marker missing'
      );
      assert.ok(
        mark('first-model-rendered') <= mark('analysis-started'),
        'First canvas draw must precede secondary analysis'
      );
      const table = timingRows(launched, mainMarks, renderer);
      result.samples.push({ sample, launched, mainMarks, renderer, windows, pageErrors, table });
      console.log('\n' + sample);
      console.table(table);
      await page.screenshot({ path: path.join(folder, sample.replaceAll(' ', '-') + '.png') });
      await app.close();
      app = null;
    }
  } catch (e) {
    error = e;
    result.error = e.stack;
  } finally {
    if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    result.nativeWatch = await watch.stop();
    if (result.nativeWatch.violations !== 0 || result.nativeWatch.eventHooksArmed !== true)
      error = error || Error('Hidden window qualification failed.');
    result.passed = !error;
    await fs.writeFile(path.join(folder, 'result.json'), JSON.stringify(result, null, 2));
    console.log('Startup evidence: ' + folder);
  }
  if (error) throw error;
}
module.exports = { timingRows };
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
