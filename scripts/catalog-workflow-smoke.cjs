// Hold real native results in isolated IPC to audit catalog publication.
const { _electron: electron } = require('playwright'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { menuless } = require('./smoke-helpers.cjs');
const root = path.resolve(__dirname, '..'),
  baseline = process.argv.includes('--baseline');
async function main() {
  const folder = await fs.mkdtemp(path.join(root, 'artifacts', 'catalog-workflow-')),
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
    checks = [],
    findings = {};
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
    const settled = () => page.waitForFunction(() => document.getElementById('cancel').hidden);
    await page.waitForFunction(
      () =>
        document.getElementById('model-name')?.textContent === 'Tesseract' && document.getElementById('cancel').hidden
    );
    await page.evaluate(() => {
      window.catalogStatuses = [];
      new MutationObserver(() => window.catalogStatuses.push(document.getElementById('status').textContent)).observe(
        document.getElementById('status'),
        { childList: true, subtree: true, characterData: true }
      );
    });
    const save = async (name) => {
      const file = path.join(folder, name + '.polyproj');
      await app.evaluate(({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
      }, file);
      await page.locator('#save').click();
      await page.waitForFunction((file) => document.getElementById('status').textContent === 'Saved ' + file, file);
      return { file, project: JSON.parse(await fs.readFile(file, 'utf8')) };
    };
    const initial = await save('original');
    const openOriginal = async ({ wait = true } = {}) => {
      await page.evaluate(() => (window.catalogStatuses = []));
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      }, initial.file);
      await page.locator('#open').click();
      await page.waitForFunction((file) => window.catalogStatuses.includes('Opened ' + file), initial.file);
      if (wait) await settled();
    };
    await app.evaluate(({ ipcMain }) => {
      const original = ipcMain._invokeHandlers.get('engine'),
        cancel = ipcMain._invokeHandlers.get('cancel'),
        library = ipcMain._invokeHandlers.get('library-model');
      if (typeof original !== 'function' || typeof cancel !== 'function' || typeof library !== 'function')
        throw Error('Native handlers required.');
      const h = (globalThis.catalogHarness = {
        original,
        cancel,
        library,
        picker: ipcMain._invokeHandlers.get('library'),
        keys: [],
        linked: [],
        pending: [],
        cancelled: [],
        requests: [],
      });
      ipcMain.removeHandler('engine');
      ipcMain.handle('engine', async (event, request, id) => {
        const hold = request.op === 'generate' && h.keys.includes(request.params.key);
        if (request.op === 'generate') h.requests.push({ key: request.params.key, id });
        const result = await original(event, request, id);
        if (hold) await new Promise((resolve) => h.pending.push({ id, key: request.params.key, release: resolve }));
        return result;
      });
      ipcMain.removeHandler('library-model');
      ipcMain.handle('library-model', async (event, file, id) => {
        const hold = h.linked.includes(file);
        const result = await library(event, file, id);
        if (hold) await new Promise((resolve) => h.pending.push({ id, key: file, release: resolve }));
        return result;
      });
      ipcMain.removeHandler('cancel');
      ipcMain.handle('cancel', (event, id) => {
        h.cancelled.push(id);
        return cancel(event, id);
      });
    });
    const arm = (keys, linked = []) =>
      app.evaluate(
        (_e, { keys, linked }) => {
          const h = globalThis.catalogHarness;
          h.keys = keys;
          h.linked = linked;
          h.pending = [];
          h.cancelled = [];
          h.requests = [];
        },
        { keys, linked }
      );
    const held = (count) =>
      app.evaluate(async (_e, count) => {
        const end = Date.now() + 10000;
        while (globalThis.catalogHarness.pending.length < count) {
          if (Date.now() > end) throw Error('Native hold did not arrive');
          await new Promise((r) => setTimeout(r, 10));
        }
      }, count);
    const release = () =>
      app.evaluate(() => {
        const h = globalThis.catalogHarness;
        h.keys = [];
        h.linked = [];
        for (const p of h.pending) p.release();
      });
    const click = (key) => page.locator(`[data-key="${key}"]`).click();

    await arm(['cube']);
    await click('cube');
    await held(1);
    findings.loadingMarked = (await page.locator('[data-key="cube"]').getAttribute('aria-busy')) === 'true';
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
        assert.equal(await page.locator('#catalog-loading-status').isVisible(), true);
        await page.screenshot({ path: path.join(folder, `opening-${size.width}.png`) });
      }
    await openOriginal({ wait: false });
    await release();
    await settled();
    const replaced = await save('after-project-replacement');
    findings.lateProjectPublication = replaced.project.documents.length !== initial.project.documents.length;
    checks.push('a held native catalog result cannot add a document to a replacement project');

    await openOriginal();
    await arm(['cube']);
    await click('cube');
    await held(1);
    await page.locator('#cancel').click();
    await release();
    await settled();
    const canceled = await save('after-cancel');
    findings.lateCanceledPublication = canceled.project.documents.length !== initial.project.documents.length;
    checks.push('Cancel refuses a completed native result whose IPC reply arrives later');

    await openOriginal();
    await arm(['cube']);
    await click('cube');
    await held(1);
    await click('octahedron');
    await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Octahedron');
    await release();
    await settled();
    findings.earlierSelectionStoleFocus = (await page.locator('#model-name').textContent()) !== 'Octahedron';
    const multiple = await save('multiple-selections');
    assert.equal(multiple.project.documents.length, initial.project.documents.length + 2);
    checks.push('distinct catalog selections each open a document; late earlier selections preserve the latest focus');

    // Hidden-no-focus mode installs no application menu, so the File menu label check only runs with a native menu.
    const hiddenMenu = await menuless(app);
    if (hiddenMenu) console.log('[hidden-no-focus] no application menu: skipping the File menu label assertion.');
    findings.fileMenuLabels = hiddenMenu
      ? null
      : await app.evaluate(({ Menu }) =>
          Menu.getApplicationMenu()
            .items.find((item) => item.label === 'File')
            .submenu.items.map((item) => item.label)
        );
    findings.historyCloseLabel = await page.locator('#history-parameters-close').textContent();
    if (!baseline) {
      assert.equal(findings.loadingMarked, true);
      for (const key of ['lateProjectPublication', 'lateCanceledPublication', 'earlierSelectionStoleFocus'])
        assert.equal(findings[key], false, key);
      if (!hiddenMenu) assert.ok(findings.fileMenuLabels.includes('Open\u2026'));
      assert.equal(findings.historyCloseLabel, '\u00d7');
      await openOriginal();
      await arm(['cube']);
      await click('cube');
      await held(1);
      await page.locator('[data-key="cube"]').evaluate((button) => {
        button.onclick();
      });
      findings.duplicateNativeJobs = await app.evaluate(
        () => globalThis.catalogHarness.requests.filter((r) => r.key === 'cube').length
      );
      assert.equal(findings.duplicateNativeJobs, 1);
      await page.locator('#search').fill('Tesseract');
      assert.equal(await page.locator('#catalog-loading-status').isVisible(), true);
      await page.locator('#document-tabs button').first().click();
      await release();
      await settled();
      assert.equal(await page.locator('#model-name').textContent(), 'Tesseract');
      await page.locator('#search').fill('');
      checks.push(
        'duplicate clicks coalesce; loading feedback survives filtering and explicit tab navigation keeps focus'
      );

      await openOriginal();
      await arm(['cube']);
      await click('cube');
      await held(1);
      await page.locator('#new').click();
      await page.waitForFunction(() => document.querySelectorAll('#document-tabs button').length === 2);
      const newDocument = await save('new-document-before-late-cube');
      await release();
      await settled();
      const newDone = await save('new-document-after-late-cube');
      assert.equal(
        newDone.project.documents[newDone.project.active].id,
        newDocument.project.documents[newDocument.project.active].id
      );
      assert.equal(newDone.project.documents.length, 3);
      checks.push('New uses the same model-loading ownership and keeps focus ahead of an older catalog result');

      await openOriginal();
      if ((await page.locator('#toggle-inspector').getAttribute('aria-pressed')) !== 'true')
        await page.locator('#toggle-inspector').click();
      await page.locator('[data-panel="construct"]').click();
      await page.locator('#make-dual').click();
      await settled();
      const historyName = await page.locator('#model-name').textContent(),
        historyBefore = await save('history-before-load');
      await arm(['cube']);
      await click('cube');
      await held(1);
      await page.locator('#undo').click();
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
      await page.locator('#redo').click();
      await page.waitForFunction((name) => document.getElementById('model-name').textContent === name, historyName);
      await release();
      await settled();
      const historyAfter = await save('history-after-load');
      assert.equal(await page.locator('#model-name').textContent(), historyName);
      assert.equal(
        historyAfter.project.documents[historyAfter.project.active].id,
        historyBefore.project.documents[historyBefore.project.active].id
      );
      checks.push(
        'Undo then Redo explicitly keeps focus even when the final history state equals the originally captured one'
      );

      await openOriginal();
      await page.locator('#animation-settings > summary').click();
      await page.locator('#animation-target').selectOption('base');
      for (const [id, value] of [
        ['animation-duration', '.25'],
        ['animation-fps', '8'],
      ]) {
        await page.locator('#' + id).fill(value);
        await page.locator('#' + id).blur();
        await page.waitForFunction(() => !document.getElementById('animation-rotation').disabled);
      }
      await page.locator('#animation-rotation').click();
      await page.waitForFunction(() => !document.getElementById('animation-rotation').disabled);
      await arm(['cube']);
      await click('cube');
      await held(1);
      await app.evaluate(({ dialog }) => {
        dialog.showSaveDialog = () => new Promise((resolve) => (globalThis.catalogAnimationDialog = resolve));
      });
      if (!(await page.locator('#animation-settings').evaluate((node) => node.open)))
        await page.locator('#animation-settings > summary').click();
      await page.locator('#animation-png').click();
      await page.waitForFunction(() => document.getElementById('animation-png').disabled);
      assert.equal(await page.locator('[data-key="cube"]').isDisabled(), true);
      assert.equal(await page.locator('#new').isDisabled(), true);
      await app.evaluate(() => globalThis.catalogAnimationDialog({ canceled: true }));
      await page.waitForFunction(() => !document.getElementById('animation-png').disabled);
      await release();
      await settled();
      const exported = await save('after-export-cancel');
      assert.equal(exported.project.documents.length, initial.project.documents.length);
      checks.push(
        'animation export cancels pending catalog work and disables new opens; its late reply remains refused after export cancellation'
      );

      const linkedRoot = path.join(folder, 'linked');
      await fs.mkdir(linkedRoot);
      const linkedFile = path.join(linkedRoot, 'Catalog linked cube.off');
      await fs.writeFile(
        linkedFile,
        'OFF\n8 6 12\n-1 -1 -1\n1 -1 -1\n1 1 -1\n-1 1 -1\n-1 -1 1\n1 -1 1\n1 1 1\n-1 1 1\n4 0 3 2 1\n4 4 5 6 7\n4 0 1 5 4\n4 1 2 6 5\n4 2 3 7 6\n4 3 0 4 7\n'
      );
      await fs.writeFile(path.join(linkedRoot, 'Catalog unsupported 5D.off'), '5OFF\n6 15 20 15 6\n');
      await fs.writeFile(path.join(linkedRoot, 'Catalog malformed.off'), 'not an OFF header\n');
      await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
      }, linkedRoot);
      await page.locator('#link-library').click();
      await page.locator('#search').fill('Catalog');
      const linkedButton = () => page.locator('#catalog button').filter({ hasText: 'Catalog linked cube' });
      await linkedButton().waitFor();
      assert.equal(await page.locator('#catalog button:disabled').count(), 2);
      await openOriginal();
      await arm([], [linkedFile]);
      await linkedButton().click();
      await held(1);
      await page.locator('#cancel').click();
      await release();
      await settled();
      const linkedCanceled = await save('linked-cancel');
      assert.equal(linkedCanceled.project.documents.length, initial.project.documents.length);
      assert.equal(await page.locator('#catalog button:disabled').count(), 2);
      findings.unsupportedEntriesStayDisabled = true;
      await arm([], [linkedFile]);
      await linkedButton().click();
      await held(1);
      await openOriginal({ wait: false });
      await release();
      await settled();
      const linkedReplaced = await save('linked-project-change');
      assert.equal(linkedReplaced.project.documents.length, initial.project.documents.length);
      await linkedButton().click();
      await settled();
      const linkedSuccess = await save('linked-retry'),
        linkedState = linkedSuccess.project.documents[linkedSuccess.project.active].states[0];
      assert.equal(linkedState.model.vertices.length, 8);
      assert.equal(linkedState.model.metadata.linkedRelativePath, 'Catalog linked cube.off');
      checks.push(
        'real linked OFF loads refuse late replies after Cancel and project replacement; retry retains native geometry and catalog source metadata'
      );
      checks.push(
        'unsupported and malformed catalog entries stay disabled across pending-state updates, Cancel and filtering'
      );

      await app.evaluate((_e, file) => {
        const fs = process.getBuiltinModule('fs/promises'),
          h = globalThis.catalogHarness;
        h.realpath = fs.realpath;
        h.preflightSeen = false;
        fs.realpath = async function (p, ...args) {
          if (String(p) === file && !h.preflightSeen) {
            h.preflightSeen = true;
            await new Promise((resolve) => (h.preflightRelease = resolve));
          }
          return h.realpath.call(fs, p, ...args);
        };
      }, linkedFile);
      const preflightId = 'catalog-preflight-cancel';
      await page.evaluate(
        ({ file, id }) => {
          window.catalogPreflight = window.polytope.libraryModel(file, id).then(
            () => ({ ok: true }),
            (error) => ({ ok: false, error: error.message })
          );
        },
        { file: linkedFile, id: preflightId }
      );
      await app.evaluate(async () => {
        const end = Date.now() + 10000;
        while (!globalThis.catalogHarness.preflightSeen) {
          if (Date.now() > end) throw Error('Preflight hold did not arrive');
          await new Promise((r) => setTimeout(r, 10));
        }
      });
      const collision = await page.evaluate(
        ({ file, id }) =>
          window.polytope.libraryModel(file, id).then(
            () => null,
            (error) => error.message
          ),
        { file: linkedFile, id: preflightId }
      );
      assert.match(collision, /Duplicate job ID/);
      const engineCollision = await page.evaluate(
        (id) =>
          window.polytope.engine({ op: 'generate', params: { kind: 'regular', key: 'cube' } }, id).then(
            () => null,
            (error) => error.message
          ),
        preflightId
      );
      assert.match(engineCollision, /Duplicate job ID/);
      assert.equal(await page.evaluate((id) => window.polytope.cancel(id), preflightId), true);
      await app.evaluate(() => globalThis.catalogHarness.preflightRelease());
      const preflight = await page.evaluate(() => window.catalogPreflight);
      assert.equal(preflight.ok, false);
      assert.match(preflight.error, /loading cancelled/);
      await app.evaluate(() => {
        const h = globalThis.catalogHarness;
        process.getBuiltinModule('fs/promises').realpath = h.realpath;
        h.realpath = null;
      });
      const reused = await page.evaluate(({ file, id }) => window.polytope.libraryModel(file, id), {
        file: linkedFile,
        id: preflightId,
      });
      assert.equal(reused.model.vertices.length, 8);
      const malformed = await page.evaluate(
        (file) =>
          window.polytope.libraryModel(file, {}).then(
            () => null,
            (error) => error.message
          ),
        linkedFile
      );
      assert.match(malformed, /bounded library load ID/);
      checks.push(
        'native linked preflight reserves its ID, honors Cancel before engine submission, releases the ID and retries successfully'
      );
      // Only the displayed audit marker is synthetic. Authorization, native
      // importer calls, geometry and on-disk OFF bytes are real and unchanged.
      const beforeForce = await save('before-explicit-importer');
      await app.evaluate(({ ipcMain }, file) => {
        const h = globalThis.catalogHarness;
        ipcMain.removeHandler('library');
        ipcMain.handle('library', async (event, ...args) => {
          const result = await h.picker(event, ...args);
          for (const entry of result.entries)
            if (entry.key === file) {
              entry.auditStatus = 'rejected';
              entry.auditErrors = ['Qualification audit marker'];
            }
          return result;
        });
      }, linkedFile);
      await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
      }, linkedRoot);
      await page.locator('#link-library').click();
      await page.waitForFunction(() => document.querySelector('#catalog .audit-rejected'));
      await linkedButton().click();
      await page.waitForFunction(() => document.getElementById('library-dialog').open);
      await arm([], [linkedFile]);
      await page.locator('#library-open-anyway').click();
      await held(1);
      assert.equal(await page.locator('#library-dialog').evaluate((dialog) => dialog.open), false);
      await page.locator('#cancel').click();
      await release();
      await settled();
      const forceCanceled = await save('explicit-importer-cancel');
      assert.equal(forceCanceled.project.documents.length, beforeForce.project.documents.length);
      await linkedButton().click();
      await page.locator('#library-open-anyway').click();
      await settled();
      const forced = await save('explicit-importer-retry');
      assert.equal(forced.project.documents.length, beforeForce.project.documents.length + 1);
      assert.equal(
        await fs.readFile(linkedFile, 'utf8'),
        'OFF\n8 6 12\n-1 -1 -1\n1 -1 -1\n1 1 -1\n-1 1 -1\n-1 -1 1\n1 -1 1\n1 1 1\n-1 1 1\n4 0 3 2 1\n4 4 5 6 7\n4 0 1 5 4\n4 1 2 6 5\n4 2 3 7 6\n4 3 0 4 7\n'
      );
      checks.push(
        'explicit Try current importer shares cancellation/retry ownership under a synthetic audit marker; native geometry and source bytes remain real'
      );
      findings.packedRangeError = await page.evaluate(() =>
        window.polytope.renderPackedNetPdf(['<svg width="10mm" height="10mm"></svg>']).then(
          () => null,
          (error) => error.message
        )
      );
      assert.match(findings.packedRangeError, /20\u20132,000 mm/);
    }
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(folder, 'catalog.png') });
    const result = {
      passed: true,
      baseline,
      purpose: baseline ? 'catalog behavior baseline, not release qualification' : 'catalog workflow qualification',
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
        const h = globalThis.catalogHarness;
        if (!h) return;
        for (const p of h.pending) p.release();
        h.preflightRelease?.();
        if (h.realpath) process.getBuiltinModule('fs/promises').realpath = h.realpath;
        ipcMain.removeHandler('engine');
        ipcMain.handle('engine', h.original);
        ipcMain.removeHandler('library-model');
        ipcMain.handle('library-model', h.library);
        ipcMain.removeHandler('library');
        ipcMain.handle('library', h.picker);
        ipcMain.removeHandler('cancel');
        ipcMain.handle('cancel', h.cancel);
        delete globalThis.catalogHarness;
      })
      .catch(() => {});
    await app?.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
