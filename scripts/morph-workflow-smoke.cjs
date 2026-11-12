const { openDisclosure } = require('./smoke-helpers.cjs');
// Actual desktop input, layout, replay, capture and native-project round trip.
const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'),
  visible = process.argv.includes('--visible');
const active = (project) => {
  const doc = project.documents[project.active];
  return doc.states[doc.cursor];
};
async function main() {
  const folder = await fs.mkdtemp(path.join(root, 'artifacts', 'morph-workflow-')),
    profile = path.join(folder, 'profile');
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, 'linked-libraries.json'), JSON.stringify({ version: 1, paths: [] }));
  const runtime = await require('./hidden-runtime.cjs').hiddenRuntime();
  const env = { ...process.env, POLYTOPE_TEST_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.POLYTOPE_TEST_MODE;
  if (!visible) env.POLYTOPE_TEST_MODE = 'hidden-no-focus';
  if (runtime.packaged) env.POLYTOPE_PYTHON = path.join(folder, 'unavailable-python.exe');
  const errors = [],
    checks = [];
  let app, page;
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
    page.on('pageerror', (error) => errors.push(error.message));
    const ready = () => page.waitForFunction(() => document.getElementById('cancel').hidden);
    const openPanel = () => openDisclosure(page, 'dual-morph-settings');
    const save = async (name) => {
      await ready();
      const file = path.join(folder, name + '.polyproj');
      await app.evaluate(({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
      }, file);
      await page.locator('#save').click();
      await page.waitForFunction((file) => document.getElementById('status').textContent === 'Saved ' + file, file);
      return { file, project: JSON.parse(await fs.readFile(file, 'utf8')) };
    };
    await page.waitForFunction(
      () =>
        document.getElementById('model-name')?.textContent === 'Tesseract' && document.getElementById('cancel').hidden
    );
    assert.equal(await page.locator('#dual-morph-method').inputValue(), 'sizing'); // W29: convex 4D sources default to the first eligible inventory method (sizing), matching 3D.
    await openPanel();
    const layout = async () =>
      page.evaluate(() => {
        const panel = document.getElementById('dual-morph-controls').getBoundingClientRect(),
          canvas = document.getElementById('base-canvas').getBoundingClientRect();
        const shelf = document.querySelector('.workspace-shelf').getBoundingClientRect();
        return {
          panel: { left: panel.left, top: panel.top, right: panel.right, bottom: panel.bottom },
          shelfHeight: shelf.height,
          shelfTop: shelf.top,
          canvasHeight: canvas.height,
          width: innerWidth,
          height: innerHeight,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
    for (const size of [
      { width: 1200, height: 760 },
      { width: 1500, height: 950 },
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height),
        size
      );
      const bounds = await layout();
      assert.equal(bounds.overflow, false);
      assert.ok(bounds.panel.top >= 0 && bounds.panel.bottom <= bounds.shelfTop);
      assert.ok(bounds.panel.left >= 0 && bounds.panel.right <= bounds.width);
      assert.ok(bounds.shelfHeight < 60);
      assert.ok(bounds.canvasHeight > 400);
    }
    await page.locator('#dual-morph-controls .chrome-drawer-close').focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#dual-morph-settings').evaluate((n) => n.open), false);
    await page.keyboard.press('Enter');
    await page.locator('#open-dual-morph-settings').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#dual-morph-settings').evaluate((n) => n.open), true);
    await page.locator('#rotation-settings > summary').click();
    assert.equal(await page.locator('#dual-morph-settings').evaluate((n) => n.open), false);
    checks.push('eligible 4D default, bounded morph panel at two sizes, keyboard open/Escape and sibling disclosure');

    await page.locator('[data-key="truncated-tetrahedron"]').click();
    await page.waitForFunction(
      () =>
        document.getElementById('model-name').textContent === 'Truncated tetrahedron' &&
        document.getElementById('cancel').hidden
    );
    assert.equal(await page.locator('#dual-morph-method').inputValue(), 'sizing');
    assert.equal(await page.locator('#dual-morph-radius').inputValue(), '');
    const before = active((await save('source')).project);
    await openPanel();
    await page.locator('#dual-morph-duration').fill('2');
    await page.locator('#dual-morph-apply').click();
    await page.waitForFunction(() => !document.getElementById('dual-morph-play').disabled);
    const radius = Number(await page.locator('#dual-morph-radius').inputValue());
    assert.ok(radius > 0 && radius < 1);
    await page.locator('#dual-morph-play').click();
    await page.waitForFunction(
      () =>
        document.getElementById('dual-morph-result').textContent.includes('1.000') &&
        document.getElementById('dual-morph-play').textContent === 'Replay'
    );
    await page.locator('#dual-morph-play').click();
    await page.waitForFunction(() => !document.getElementById('dual-morph-pause').disabled);
    // A real input event takes ownership from the playback clock.
    await page.locator('#dual-morph-scrub').fill('0.375');
    await page.waitForFunction(
      () =>
        document.getElementById('dual-morph-pause').disabled &&
        document.getElementById('dual-morph-result').textContent.includes('0.375')
    );
    await page.locator('#dual-morph-scrub').fill('0.625');
    await page.waitForFunction(() => document.getElementById('dual-morph-result').textContent.includes('0.625'));
    assert.equal(await page.locator('#toast').isVisible(), false);
    checks.push('automatic size, endpoint Replay and scrubbing take over playback without cancellation alerts');
    const saved = await save('pose'),
      pose = active(saved.project);
    assert.deepEqual(pose.model, before.model);
    assert.equal(pose.view.dualMorph.ratio, 0.625);
    assert.equal(pose.view.dualMorph.radius, radius);
    const png = path.join(folder, 'pose.png');
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, png);
    await page.locator('#image').click();
    await page.waitForFunction((file) => document.getElementById('status').textContent === 'Saved ' + file, png);
    const bytes = await fs.readFile(png);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok(bytes.length > 1000);
    await page.locator('[data-key="cube"]').click();
    await ready();
    assert.equal(await page.locator('#dual-morph-radius').inputValue(), '');
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, saved.file);
    await page.locator('#open').click();
    await page.waitForFunction(
      () =>
        document.getElementById('model-name').textContent === 'Truncated tetrahedron' &&
        !document.getElementById('dual-morph-reset').disabled
    );
    const restored = active((await save('restored')).project);
    assert.deepEqual(restored.model, before.model);
    assert.deepEqual(restored.view.dualMorph, pose.view.dualMorph);
    await openPanel();
    await page.locator('#dual-morph-reset').click();
    const reset = active((await save('reset')).project);
    assert.equal(reset.view.dualMorph.enabled, false);
    assert.deepEqual(reset.model, before.model);
    checks.push(
      'PNG capture, new-model automatic size, native Save/Open and Reset preserve source geometry and exact saved pose'
    );
    await page.screenshot({ path: path.join(folder, 'workspace.png') });
    assert.deepEqual(errors, []);
    await fs.writeFile(
      path.join(folder, 'result.json'),
      JSON.stringify(
        {
          passed: true,
          version: await app.evaluate(({ app }) => app.getVersion()),
          packaged: runtime.packaged,
          visible,
          checks,
          errors,
        },
        null,
        2
      )
    );
    console.log(JSON.stringify({ folder, passed: true, checks }, null, 2));
  } catch (error) {
    await page?.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {});
    await fs.writeFile(
      path.join(folder, 'failure.json'),
      JSON.stringify({ error: error.stack, checks, errors }, null, 2)
    );
    console.error('Artifacts:', folder);
    throw error;
  } finally {
    await app?.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
