// Exercise an actual canceled initial model, including native menu dispatch.
const { _electron: electron } = require('playwright'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { menuless, installMenuShadow, menuEnabledById, menuEnabledByLabel, clickMenu } = require('./smoke-helpers.cjs');
const root = path.resolve(__dirname, '..'),
  baseline = process.argv.includes('--baseline'),
  cancelOpen = process.argv.includes('--cancel-open');
async function main() {
  const folder = await fs.mkdtemp(path.join(root, 'artifacts', 'empty-workspace-')),
    profile = path.join(folder, 'profile');
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, 'linked-libraries.json'), JSON.stringify({ version: 1, paths: [] }));
  const runtime = await require('./hidden-runtime.cjs').hiddenRuntime(),
    env = { ...process.env, POLYTOPE_TEST_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  if (process.env.POLYTOPE_TEST_MODE !== 'hidden-no-focus') delete env.POLYTOPE_TEST_MODE;
  if (runtime.packaged) env.POLYTOPE_PYTHON = path.join(folder, 'unavailable-python.exe');
  let app, page;
  const errors = [],
    findings = {},
    checks = [];
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
    page.setDefaultTimeout(20000);
    page.on('pageerror', (e) => errors.push(e.message));
    await app.evaluate(({ dialog, ipcMain }) => {
      dialog.showMessageBox = async () => ({ response: 1 });
      const h = (globalThis.emptyHarness = {
        engine: ipcMain._invokeHandlers.get('engine'),
        hold: false,
        pending: [],
        returned: 0,
        saveDialogs: 0,
      });
      dialog.showSaveDialog = async () => {
        h.saveDialogs++;
        return { canceled: true };
      };
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
      ipcMain.removeHandler('engine');
      ipcMain.handle('engine', async (event, request, id) => {
        const held = h.hold && request.op === 'generate';
        const result = await h.engine(event, request, id);
        if (held) await new Promise((resolve) => h.pending.push(resolve));
        h.returned++;
        return result;
      });
    });
    // Hidden-no-focus mode has no application menu; menu assertions then use the workspace-availability IPC shadow.
    const hiddenMenu = await menuless(app);
    if (hiddenMenu) {
      await installMenuShadow(app);
      console.log(
        '[hidden-no-focus] no application menu: checking menu availability via workspace-availability IPC and dispatching menu-action messages.'
      );
    }
    const ready = () => page.waitForFunction(() => document.getElementById('cancel').hidden);
    await page.waitForFunction(
      () =>
        document.getElementById('model-name').textContent === 'Tesseract' && document.getElementById('cancel').hidden
    );
    await app.evaluate(() => {
      const h = globalThis.emptyHarness;
      h.hold = true;
      h.pending = [];
    });
    await page.reload();
    await app.evaluate(async () => {
      const end = Date.now() + 10000;
      while (!globalThis.emptyHarness.pending.length) {
        if (Date.now() > end) throw Error('Initial model not held');
        await new Promise((r) => setTimeout(r, 10));
      }
    });
    await page.locator(cancelOpen ? '#open' : '#cancel').click();
    await ready();
    await app.evaluate(() => {
      const h = globalThis.emptyHarness;
      h.hold = false;
      for (const resolve of h.pending) resolve();
    });
    await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Choose a model');
    findings.enabledButtons = await page.evaluate(() =>
      Object.fromEntries(
        ['save', 'undo', 'redo', 'export', 'reset', 'image', 'auto-rotate', 'fit-view'].map((id) => [
          id,
          !document.getElementById(id).matches(':disabled'),
        ])
      )
    );
    const menuLabels = [
      'Save project…',
      'Export model…',
      'Save image…',
      'Undo geometry',
      'Redo geometry',
      'Reset camera',
    ];
    findings.menuEnabled = await menuEnabledByLabel(
      app,
      menuLabels,
      baseline ? undefined : Object.fromEntries(menuLabels.map((label) => [label, false]))
    );
    findings.menuSource = hiddenMenu ? 'workspace-availability IPC (hidden-no-focus)' : 'application menu';
    const beforeDialogs = await app.evaluate(() => globalThis.emptyHarness.saveDialogs);
    if (baseline) {
      await page.locator('#reset').click();
      findings.resetMessage = await page.locator('#toast').textContent();
      await page.locator('#image').click();
      findings.imageMessage = await page.locator('#toast').textContent();
      await page.locator('#save').click();
    } else {
      for (const [id, enabled] of Object.entries(findings.enabledButtons)) assert.equal(enabled, false, id);
      for (const [label, enabled] of Object.entries(findings.menuEnabled)) assert.equal(enabled, false, label);
    }
    // Programmatic dispatch also audits renderer guards behind disabled menu
    // items. It never invokes the native dialogs in a corrected empty workspace.
    await page.evaluate(() => {
      window.emptyStatuses = [];
      new MutationObserver(() => window.emptyStatuses.push(document.getElementById('status').textContent)).observe(
        document.getElementById('status'),
        { childList: true, subtree: true, characterData: true }
      );
    });
    await clickMenu(app, ['Reset camera', 'Save image…', 'Save project…', 'Export model…']);
    await page.waitForFunction(() => window.emptyStatuses.length > 0);
    findings.nativeSaveDialogsWhileEmpty =
      (await app.evaluate(() => globalThis.emptyHarness.saveDialogs)) - beforeDialogs;
    findings.rawMissingSourceError = await page
      .locator('#toast')
      .textContent()
      .then((s) => /Cannot read|undefined|null/i.test(s));
    if (await page.locator('#export-dialog').evaluate((d) => d.open)) await page.locator('#close-export').click();
    await page.screenshot({ path: path.join(folder, 'empty.png') });
    checks.push(
      'empty controls and native menu actions are unavailable; direct menu dispatch gives source guidance without native saves or missing-source errors'
    );
    if (!baseline) {
      assert.equal(findings.nativeSaveDialogsWhileEmpty, 0);
      assert.equal(findings.rawMissingSourceError, false);
      assert.ok(
        await page
          .locator('#status')
          .textContent()
          .then((s) => s.includes('Choose a model'))
      );
    }
    if (!baseline)
      for (const size of [
        { width: 1200, height: 760 },
        { width: 1500, height: 950 },
      ]) {
        await app.evaluate(
          ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height),
          size
        );
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(folder, `empty-${size.width}.png`) });
      }
    await page.locator('#help').click();
    assert.equal(await page.locator('#help-dialog').evaluate((d) => d.open), true);
    await page.locator('#close-help').click();
    await page.locator('#new').click();
    await ready();
    assert.equal(await page.locator('#model-name').textContent(), 'Tesseract');
    if (!baseline) {
      assert.equal(await page.locator('#save').isDisabled(), false);
      assert.equal(await page.locator('#undo').isDisabled(), true);
      assert.equal(await page.locator('#redo').isDisabled(), true);
      assert.equal(await page.locator('#reset').isDisabled(), false);
      assert.equal(await page.locator('#image').isDisabled(), false);
    }
    checks.push(
      'Guide and New remain available; opening the first model restores controls while unavailable history remains disabled'
    );
    if (!baseline) {
      assert.equal(await page.locator('#fullscreen').isDisabled(), false);
      await page.locator('[data-key="cube"]').click();
      await ready();
      assert.equal(await page.locator('#projection').isDisabled(), true);
      await page.locator('#toggle-inspector').click();
      await page.locator('[data-panel="construct"]').click();
      await page.locator('#make-dual').click();
      await ready();
      const menuHistory = async (expected) => {
        const value = await menuEnabledById(app, ['workspace-undo', 'workspace-redo'], {
          'workspace-undo': expected.undo,
          'workspace-redo': expected.redo,
        });
        return { undo: value['workspace-undo'], redo: value['workspace-redo'] };
      };
      assert.deepEqual(await menuHistory({ undo: true, redo: false }), { undo: true, redo: false });
      await page.locator('#undo').click();
      await ready();
      assert.deepEqual(await menuHistory({ undo: false, redo: true }), { undo: false, redo: true });
      await page.locator('#redo').click();
      await ready();
      assert.deepEqual(await menuHistory({ undo: true, redo: false }), { undo: true, redo: false });
      checks.push(
        'first-model recovery preserves 3D projection restrictions and native Undo/Redo follows real construction history'
      );
    }
    assert.deepEqual(errors, []);
    const result = {
      passed: true,
      baseline,
      cancelOpen,
      version: await app.evaluate(({ app }) => app.getVersion()),
      packaged: runtime.packaged,
      findings,
      checks,
      errors,
    };
    await fs.writeFile(path.join(folder, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ folder, ...result }, null, 2));
  } catch (error) {
    await page?.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {});
    await fs.writeFile(
      path.join(folder, 'failure.json'),
      JSON.stringify({ error: error.stack, findings, checks, errors }, null, 2)
    );
    console.error('Artifacts:', folder);
    throw error;
  } finally {
    await app
      ?.evaluate(({ ipcMain }) => {
        const h = globalThis.emptyHarness;
        if (h) {
          ipcMain.removeHandler('engine');
          ipcMain.handle('engine', h.engine);
          for (const resolve of h.pending) resolve();
        }
        delete globalThis.emptyHarness;
      })
      .catch(() => {});
    await app?.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
