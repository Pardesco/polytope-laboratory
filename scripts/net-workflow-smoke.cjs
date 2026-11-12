// Core net workflow and identical native-IPC workloads before/after worker reuse.
const { _electron: electron } = require('playwright'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict');
const { reveal: revealControl } = require('./smoke-helpers.cjs');
const root = path.resolve(__dirname, '..'),
  visible = process.argv.includes('--visible'),
  baseline = process.argv.includes('--baseline'),
  historyReset = process.argv.includes('--history-reset'),
  exportBusy = process.argv.includes('--export-busy'),
  dialogPdf = process.argv.includes('--dialog-pdf');
const active = (project) => {
  const document = project.documents[project.active];
  return document.states[document.cursor];
};
async function main() {
  const folder = await fs.mkdtemp(path.join(root, 'artifacts', 'net-workflow-')),
    profile = path.join(folder, 'profile');
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, 'linked-libraries.json'), JSON.stringify({ version: 1, paths: [] }));
  const runtime = await require('./hidden-runtime.cjs').hiddenRuntime(),
    env = { ...process.env, POLYTOPE_TEST_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.POLYTOPE_TEST_MODE;
  if (!visible) env.POLYTOPE_TEST_MODE = 'hidden-no-focus';
  if (runtime.packaged) env.POLYTOPE_PYTHON = path.join(folder, 'unavailable-python.exe');
  let app, page;
  const errors = [],
    checks = [];
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
    await app.evaluate(({ ipcMain }) => {
      const original = ipcMain._invokeHandlers.get('text-export-write');
      if (typeof original !== 'function') throw Error('Text export handler required.');
      const h = (globalThis.netWriteHarness = { original, writes: [] });
      ipcMain.removeHandler('text-export-write');
      ipcMain.handle('text-export-write', (event, id, ...args) => {
        h.writes.push(id);
        return original(event, id, ...args);
      });
    });
    page = await app.firstWindow();
    require('./smoke-helpers.cjs').autoReveal(page);
    page.setDefaultTimeout(30000);
    page.on('pageerror', (error) => errors.push(error.message));
    const save = async (name) => {
      const file = path.join(folder, name + '.polyproj');
      await app.evaluate(({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
      }, file);
      await page.locator('#save').click();
      await page.waitForFunction((file) => document.getElementById('status').textContent === 'Saved ' + file, file);
      return { file, project: JSON.parse(await fs.readFile(file, 'utf8')) };
    };
    const reveal = async (id) => {
      await require('./smoke-helpers.cjs').reveal(page, '#' + id);
      const root = page.locator('#' + id);
      if (!(await root.evaluate((node) => node.open))) await root.locator(':scope > summary').click();
    };
    const settled = () => page.waitForFunction(() => document.getElementById('cancel').hidden);
    const busyControls = async (cell) => {
      const prefix = cell ? 'cell-net' : 'net',
        key = cell ? 'cellNet' : 'net';
      await reveal('animation-settings');
      await page.locator('#animation-target').selectOption('base');
      for (const [id, value] of [
        ['animation-duration', '0.25'],
        ['animation-fps', '8'],
      ]) {
        await page.locator('#' + id).fill(value);
        await page.locator('#' + id).blur();
        await page.waitForFunction(() => !document.getElementById('animation-rotation').disabled);
      }
      await page.locator('#animation-rotation').click();
      await page.waitForFunction(() => !document.getElementById('animation-rotation').disabled);
      const before = active((await save(prefix + '-before-animation')).project);
      assert.equal(before.view.animation.duration, 0.25);
      assert.equal(before.view.animation.fps, 8);
      await app.evaluate(({ dialog }) => {
        dialog.showSaveDialog = () =>
          new Promise((resolve) => {
            globalThis.resolveAnimationDialog = resolve;
          });
      });
      await reveal('animation-settings');
      await page.locator('#animation-png').click();
      await page.waitForFunction(() => document.getElementById('animation-png').disabled);
      const ids = cell
        ? [
            'cell-net-build',
            'cell-net-separate',
            'cell-net-root',
            'cell-net-component',
            'cell-net-shrink',
            'cell-net-match',
          ]
        : [
            'net-rebuild',
            'net-separate',
            'net-display',
            'net-action',
            'net-component',
            'net-fold',
            'net-play',
            'net-page-prev',
            'net-page-next',
          ];
      for (const id of ids)
        assert.equal(await page.locator('#' + id).isDisabled(), true, id + ' must be disabled during animation export');
      if (!cell) {
        await page.locator('#net-edge').dispatchEvent('input');
        for (const id of ['net-tab-default-apply', 'net-tab-edge-apply'])
          assert.equal(
            await page.locator('#' + id).isDisabled(),
            true,
            id + ' must stay disabled after a tab-edge refresh'
          );
      }
      // Programmatic DOM events also go through mutation guards; disabled widgets
      // alone cannot protect a source if a queued event reaches its handler.
      await page.locator('#' + prefix + '-component').evaluate((node) => {
        node.value = [...node.options].find((o) => o.value !== node.value).value;
        node.dispatchEvent(new Event('change', { bubbles: true }));
      });
      if (!cell) {
        await page.locator('#net-display').evaluate((node) => {
          node.value = 'fold';
          node.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page
          .locator('#net-preview svg [data-net-face]')
          .first()
          .dispatchEvent('pointerdown', { pointerId: 5, clientX: 1, clientY: 1 });
      }
      await app.evaluate(() => {
        if (typeof globalThis.resolveAnimationDialog !== 'function')
          throw Error('Held animation destination was not reached');
        globalThis.resolveAnimationDialog({ canceled: true });
        delete globalThis.resolveAnimationDialog;
      });
      await page.waitForFunction(() => !document.getElementById('animation-png').disabled);
      assert.equal(await page.locator('#' + prefix + (cell ? '-build' : '-rebuild')).isDisabled(), false);
      const after = active((await save(prefix + '-after-animation')).project);
      assert.deepEqual(after.view[key], before.view[key]);
      assert.deepEqual(after[key + 'History'], before[key + 'History']);
      assert.deepEqual(after[key + 'Layout'], before[key + 'Layout']);
      assert.equal(await page.locator('#' + prefix + '-component').inputValue(), String(before.view[key].component));
      if (!cell) assert.equal(await page.locator('#net-display').inputValue(), before.view.net.display);
      const frames = path.join(folder, prefix + '-after-cancel.frames');
      await app.evaluate(({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
      }, frames);
      await reveal('animation-settings');
      await page.locator('#animation-png').click();
      await page.waitForFunction(
        (file) =>
          document.getElementById('animation-progress').textContent === 'Exported ' + file &&
          !document.getElementById('animation-png').disabled,
        frames
      );
      assert.equal((await fs.readdir(frames)).filter((name) => name.endsWith('.png')).length, 3);
      assert.deepEqual(
        JSON.parse(await fs.readFile(path.join(frames, 'sequence.json'), 'utf8')).frameTimes,
        [0, 0.125, 0.25]
      );
      const completed = active((await save(prefix + '-after-animation-success')).project);
      assert.deepEqual(completed.view[key], before.view[key]);
      assert.deepEqual(completed[key + 'History'], before[key + 'History']);
      checks.push(
        prefix +
          ' controls and queued view/selection events preserve layout/history during held animation export; cancel restores availability'
      );
      checks.push(
        prefix +
          ' animation export retries successfully with three exact PNG timestamps and restores the saved net view/history'
      );
      if (await page.locator('#animation-settings').evaluate((node) => node.open))
        await page.locator('#animation-settings > summary').click();
    };
    const resetHistory = async (kind, before, count) => {
      const cell = kind === 'cell',
        prefix = cell ? 'cell-net' : 'net',
        key = cell ? 'cellNetLayout' : 'netLayout',
        bank = cell ? 'cellNetHistory' : 'netHistory',
        connections = cell ? 'connections' : 'hinges';
      await reveal(cell ? 'cell-net-generation-settings' : 'net-generation-settings');
      await page.locator('#' + prefix + '-separate').click();
      await settled();
      const separated = await save(kind + '-separated'),
        separate = active(separated.project);
      assert.equal(separate[key].components.length, count, 'Separate must replace the saved forest');
      assert.deepEqual(separate[key][connections], []);
      assert.deepEqual(separate.model, before.model);
      assert.equal(separate[bank].cursor, before[bank].cursor + 1);
      await page.locator('#' + prefix + '-undo').click();
      await settled();
      assert.deepEqual(active((await save(kind + '-separate-undo')).project)[key].placements, before[key].placements);
      await page.locator('#' + prefix + '-redo').click();
      await settled();
      assert.deepEqual(active((await save(kind + '-separate-redo')).project)[key][connections], []);
      await page.locator('#' + prefix + (cell ? '-build' : '-rebuild')).click();
      await settled();
      const reset = active((await save(kind + '-reset')).project);
      assert.equal(reset[key].components.length, 1, 'Reset must generate the default connected net');
      assert.equal(reset[key][connections].length, count - 1);
      await page.locator('#' + prefix + '-undo').click();
      await settled();
      assert.deepEqual(active((await save(kind + '-reset-undo')).project)[key][connections], []);
      await page.locator('#' + prefix + '-redo').click();
      await settled();
      assert.deepEqual(active((await save(kind + '-reset-redo')).project)[key][connections], reset[key][connections]);
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      }, separated.file);
      await page.locator('#open').click();
      await page.waitForFunction(
        (file) => document.getElementById('status').textContent === 'Opened ' + file,
        separated.file
      );
      await settled();
      const reopened = active((await save(kind + '-separate-reopened')).project);
      assert.deepEqual(reopened[bank], separate[bank]);
      assert.deepEqual(reopened[key][connections], []);
      // Return to the original edited state so later workflow assertions still exercise it.
      await page.locator('#' + prefix + '-undo').click();
      await settled();
      assert.deepEqual(
        active((await save(kind + '-original-restored')).project)[key].placements,
        before[key].placements
      );
      checks.push(
        kind + ' explicit separation/reset, Undo/Redo and native Open restore the requested forest and preserve source'
      );
    };
    const output = async (id, name, extension) => {
      const file = path.join(folder, name + '.' + extension);
      await app.evaluate(({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
      }, file);
      await page.locator('#' + id).click();
      await page.waitForFunction(
        (file) =>
          document.getElementById('status').textContent.startsWith('Exported ') &&
          document.getElementById('status').textContent.includes(file),
        file
      );
      return { file, bytes: await fs.readFile(file) };
    };
    await page.waitForFunction(
      () =>
        document.getElementById('model-name')?.textContent === 'Tesseract' && document.getElementById('cancel').hidden
    );
    await page.locator('#toggle-inspector').click();
    await page.locator('[data-panel="net"]').click();
    if (!baseline) {
      assert.equal(await page.locator('#cell-net-toggle').isDisabled(), true);
      assert.equal(await page.locator('#cell-net-edit-settings').evaluate((node) => node.open), false);
    }
    await page.screenshot({ path: path.join(folder, 'cell-controls.png') });
    await page.locator('#cell-net-build').click();
    await page.waitForFunction(
      () =>
        document.getElementById('cell-net-summary').textContent.includes('8 complete cells') &&
        document.getElementById('cancel').hidden
    );
    await page.screenshot({ path: path.join(folder, 'cell-net.png') });
    checks.push('actual whole-cell net generation for the tesseract');
    if (!baseline) {
      assert.equal(await page.locator('#cell-net-checks').isVisible(), false);
      assert.match(await page.locator('#cell-net-summary').textContent(), /intersections not checked/);
      const original = active((await save('cell-original')).project);
      await page.locator('#cell-net-shrink').fill('0.8');
      await page.waitForFunction(() => document.getElementById('cell-net-shrink-value').textContent === '80%');
      await reveal('cell-net-edit-settings');
      await page.locator('#cell-net-face').fill(String(original.cellNetLayout.connections[0]));
      await page.locator('#cell-net-toggle').click();
      await page.waitForFunction(
        () =>
          document.getElementById('cell-net-summary').textContent.includes('2 connected pieces') &&
          document.getElementById('cancel').hidden
      );
      const cut = active((await save('cell-cut')).project);
      await page.locator('#cell-net-component').selectOption(String(cut.cellNetLayout.components[1].root));
      await page.locator('#cell-net-translation').fill('1+1, -1, 0');
      await page.locator('#cell-net-angles').fill('0, 0, 0');
      await page.locator('#cell-net-move').click();
      await settled();
      const moved = active((await save('cell-moved')).project);
      assert.notDeepEqual(moved.cellNetLayout.placements, cut.cellNetLayout.placements);
      assert.deepEqual(moved.model, original.model);
      await page.locator('#cell-net-undo').click();
      await settled();
      assert.deepEqual(
        active((await save('cell-undo')).project).cellNetLayout.placements,
        cut.cellNetLayout.placements
      );
      await page.locator('#cell-net-redo').click();
      await settled();
      assert.deepEqual(
        active((await save('cell-redo')).project).cellNetLayout.placements,
        moved.cellNetLayout.placements
      );
      await reveal('cell-net-generation-settings');
      await page.locator('#cell-net-root').fill('');
      await page.locator('#cell-net-build').click();
      const invalid = active((await save('cell-invalid-root')).project);
      assert.equal(invalid.view.cellNet.root, moved.view.cellNet.root);
      assert.deepEqual(invalid.cellNetHistory, moved.cellNetHistory);
      await page.locator('#cell-net-root').fill('0');
      checks.push(
        'grouped cell-net connections, expression placement, Undo/Redo and blank-root refusal preserve source and history'
      );
      if (historyReset) await resetHistory('cell', moved, 8);
      if (exportBusy) await busyControls(true);
    }
    await page.locator('[data-key="cube"]').click();
    await page.waitForFunction(
      () => document.getElementById('model-name').textContent === 'Cube' && document.getElementById('cancel').hidden
    );
    if (!baseline) {
      assert.equal(await page.locator('#net-pack').isDisabled(), true);
      assert.equal(await page.locator('#net-export-svg').isDisabled(), true);
      assert.equal(await page.locator('#net-fold-settings').evaluate((node) => node.open), false);
    }
    await page.locator('#net-rebuild').click();
    await page.waitForFunction(
      () =>
        document.getElementById('net-summary').textContent.includes('6 faces') &&
        document.getElementById('net-preview').querySelector('svg') &&
        document.getElementById('cancel').hidden
    );
    await page.screenshot({ path: path.join(folder, 'face-net.png') });
    const source = active((await save('cube-net')).project);
    assert.equal(source.model.vertices.length, 8);
    assert.equal(source.netLayout.faces.length, 6);
    checks.push('actual cube face-net generation and native project save');
    if (!baseline) {
      assert.equal(await page.locator('#net-fold-evidence').isVisible(), false);
      assert.match(await page.locator('#net-summary').textContent(), /No face or tab overlaps/);
      await page.locator('#net-paper-settings > summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#net-paper-settings').evaluate((node) => node.open), true);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#net-paper-settings').evaluate((node) => node.open), false);
      for (const size of [
        { width: 1200, height: 760 },
        { width: 1500, height: 950 },
      ]) {
        await app.evaluate(
          ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height),
          size
        );
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.equal(await page.locator('#net-rebuild').isVisible(), true);
      }
      await reveal('net-layout-settings');
      await page.locator('#net-edge').fill(String(source.netLayout.hinges[0]));
      await page.locator('#net-toggle-edge').click();
      await page.waitForFunction(
        () =>
          document.getElementById('net-summary').textContent.includes('2 connected pieces') &&
          document.getElementById('cancel').hidden
      );
      const cut = active((await save('face-cut')).project);
      await page.locator('#net-component').selectOption(String(cut.netLayout.components[1].root));
      await page.locator('#net-action').selectOption('tabs');
      assert.equal(active((await save('face-tab-selection')).project).view.net.action, 'tabs');
      await page.locator('#net-action').selectOption('move');
      await page.locator('#net-move-x').fill('1+1');
      await page.locator('#net-move-y').fill('-1');
      await page.locator('#net-angle').fill('0');
      await page.locator('#net-move').click();
      await settled();
      const moved = active((await save('face-moved')).project);
      assert.notDeepEqual(moved.netLayout.placements, cut.netLayout.placements);
      await page.locator('#net-undo').click();
      await settled();
      assert.deepEqual(active((await save('face-undo')).project).netLayout.placements, cut.netLayout.placements);
      await page.locator('#net-redo').click();
      await settled();
      assert.deepEqual(active((await save('face-redo')).project).netLayout.placements, moved.netLayout.placements);
      if (historyReset) await resetHistory('face', moved, 6);
      await reveal('net-fold-settings');
      await page.locator('#net-fold').fill('0.5');
      await page.waitForFunction(() => document.getElementById('net-fold-value').textContent === '50%');
      assert.equal(await page.locator('#derived-canvas').isVisible(), true);
      await page.locator('#net-play').click();
      await page.waitForFunction(() => document.getElementById('net-fold-value').textContent !== '50%');
      await page.locator('#net-play').click();
      await page.locator('#net-display').selectOption('layout');
      await settled();
      await reveal('net-tab-settings');
      await page.locator('#net-tab-width').fill('4+1');
      await page.locator('#net-tab-default-apply').click();
      await settled();
      const tabbed = active((await save('face-tabbed')).project);
      assert.equal(tabbed.netLayout.tabOptions.widthMm, 5);
      assert.deepEqual(tabbed.model, source.model);
      await reveal('net-paper-settings');
      await page.locator('#net-paper').selectOption('a4');
      await page.locator('#net-pack').click();
      await page.waitForFunction(
        () =>
          document.getElementById('net-paper-status').textContent.includes('Page 1 of 1') &&
          document.getElementById('cancel').hidden
      );
      const packed = await save('packed-net'),
        packedState = active(packed.project);
      assert.equal(packedState.netPages.referenceEdgeLengthMm, 25);
      const svg = await output('net-packed-svg', 'paper-page', 'svg'),
        pdf = await output('net-packed-pdf', 'paper-pages', 'pdf');
      assert.match(svg.bytes.toString('utf8'), /width="210mm"/);
      assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-');
      const flat = await output('net-export-svg', 'flat-net', 'svg');
      assert.match(flat.bytes.toString('utf8'), /<svg/);
      const prior = path.join(folder, 'prior-net.svg');
      await fs.writeFile(prior, 'prior complete net file');
      await app.evaluate(({ dialog }) => {
        dialog.showSaveDialog = () =>
          new Promise((resolve) => {
            globalThis.resolveNetDialog = resolve;
          });
      });
      await page.locator('#net-export-svg').click();
      await page.locator('#model-unit').evaluate((select) => {
        select.value = 'mm';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await app.evaluate((_, file) => {
        globalThis.resolveNetDialog({ canceled: false, filePath: file });
        delete globalThis.resolveNetDialog;
      }, prior);
      await page.waitForFunction(() => document.getElementById('toast').textContent.includes('units'));
      assert.equal(await fs.readFile(prior, 'utf8'), 'prior complete net file');
      await page.locator('#model-unit').evaluate((select) => {
        select.value = 'model';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await output('net-export-svg', 'after-refused-net', 'svg');
      if (dialogPdf) {
        const priorPdf = path.join(folder, 'prior-dialog-net.pdf');
        await fs.writeFile(priorPdf, 'prior complete PDF');
        await page.locator('#export').click();
        await revealControl(page, '#export-net-pdf');
        await page.waitForFunction(() => !document.getElementById('confirm-export').disabled);
        await page.locator('#toast').evaluate((node) => {
          node.textContent = '';
        });
        await app.evaluate(({ dialog }) => {
          dialog.showSaveDialog = () =>
            new Promise((resolve) => {
              globalThis.resolveDialogPdf = resolve;
            });
        });
        await page.locator('#export-net-pdf').click();
        await page.locator('#model-unit').evaluate((select) => {
          select.value = 'mm';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await app.evaluate((_, file) => {
          if (typeof globalThis.resolveDialogPdf !== 'function')
            throw Error('Net PDF destination dialog was not reached');
          globalThis.resolveDialogPdf({ canceled: false, filePath: file });
          delete globalThis.resolveDialogPdf;
        }, priorPdf);
        await page.waitForFunction(
          (file) =>
            document.getElementById('toast').textContent.includes('units') ||
            document.getElementById('status').textContent.includes(file),
          priorPdf
        );
        assert.equal(
          (await fs.readFile(priorPdf)).equals(Buffer.from('prior complete PDF')),
          true,
          'General Export net PDF must reject source changes during its destination dialog'
        );
        await page.locator('#model-unit').evaluate((select) => {
          select.value = 'model';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        if (await page.locator('#export-dialog').evaluate((n) => n.open)) await page.locator('#close-export').click();
        const canceledPdf = path.join(folder, 'canceled-dialog-net.pdf');
        await fs.writeFile(canceledPdf, 'prior complete PDF');
        await page.locator('#export').click();
        await revealControl(page, '#export-net-pdf');
        await page.waitForFunction(() => !document.getElementById('confirm-export').disabled);
        await page.locator('#toast').evaluate((n) => {
          n.textContent = '';
        });
        await app.evaluate(() => (globalThis.netWriteHarness.writes = []));
        await page.locator('#export-dialog').evaluate((dialog) => {
          window.netCloseBlock = (event) => event.stopImmediatePropagation();
          dialog.addEventListener('close', window.netCloseBlock, true);
        });
        await app.evaluate(({ dialog }) => {
          dialog.showSaveDialog = () =>
            new Promise((resolve) => {
              globalThis.resolveDialogPdf = resolve;
            });
        });
        await page.locator('#export-net-pdf').click();
        await page.locator('#export-dialog').evaluate((n) => n.close());
        await app.evaluate((_, file) => {
          if (typeof globalThis.resolveDialogPdf !== 'function') throw Error('Held PDF dialog was not reached');
          globalThis.resolveDialogPdf({ canceled: false, filePath: file });
          delete globalThis.resolveDialogPdf;
        }, canceledPdf);
        await page.waitForFunction(() => !document.getElementById('net-export-svg').disabled);
        assert.equal(await app.evaluate(() => globalThis.netWriteHarness.writes.length), 0);
        await page.locator('#export-dialog').evaluate((dialog) => {
          dialog.removeEventListener('close', window.netCloseBlock, true);
          delete window.netCloseBlock;
        });
        assert.equal(
          (await fs.readFile(canceledPdf)).equals(Buffer.from('prior complete PDF')),
          true,
          'Closing General Export must cancel its pending net PDF'
        );
        await page.locator('#export').click();
        await revealControl(page, '#export-net-pdf');
        await page.waitForFunction(() => !document.getElementById('confirm-export').disabled);
        await page.locator('#export-dialog').evaluate((dialog) => dialog.dispatchEvent(new Event('close')));
        assert.equal(await page.locator('#confirm-export').isEnabled(), true);
        const pdf = await output('export-net-pdf', 'dialog-net-retry', 'pdf');
        assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-');
        checks.push(
          'General Export net PDF preserves prior files after source-unit changes or closing the export dialog, then retries successfully'
        );
      }
      checks.push('a changed source unit during the native net save dialog cannot replace the selected prior file');
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      }, packed.file);
      await page.locator('#open').click();
      await page.waitForFunction(
        (file) => document.getElementById('status').textContent === 'Opened ' + file,
        packed.file
      );
      await page.waitForFunction(
        () =>
          document.getElementById('net-paper-status').textContent.includes('Page 1 of 1') &&
          document.getElementById('cancel').hidden
      );
      const reopened = active((await save('reopened-net')).project);
      assert.deepEqual(reopened.model, source.model);
      assert.deepEqual(reopened.netHistory, packedState.netHistory);
      assert.deepEqual(reopened.view.netPrint, packedState.view.netPrint);
      checks.push(
        'grouped face cuts/placement, Undo/Redo, fold playback, glue width, A4 packing, SVG/PDF and Save/Open preserve source and print settings'
      );
      if (exportBusy) await busyControls(false);
      await page.screenshot({ path: path.join(folder, 'paper-export.png') });
    }
    const benchmark = await page.evaluate(async () => {
      const run = (op, model, params = {}) => window.polytope.engine({ op, model, params }, crypto.randomUUID());
      const cube = await run('generate', null, { kind: 'regular', key: 'cube' }),
        tesseract = await run('generate', null, { kind: 'regular', key: 'tesseract' });
      const net = await run('net', cube, { root: 0, edge_length_mm: 25, tabs: true }),
        cellNet = await run('cell-net', tesseract, { root: 0 });
      const samples = { faceNet: [], faceEdit: [], paperPack: [], cellNet: [], cellEdit: [] };
      for (let i = 0; i < 5; i++) {
        let start = performance.now(),
          value = await run('net', cube, { root: 0, edge_length_mm: 25, tabs: true });
        samples.faceNet.push(performance.now() - start);
        if (value.faces.length !== 6) throw Error('Face net changed');
        start = performance.now();
        value = await run('net-edit', cube, { net, action: 'toggle-edge', edge: net.hinges[0] });
        samples.faceEdit.push(performance.now() - start);
        if (value.components.length !== 2) throw Error('Face edit changed');
        start = performance.now();
        value = await run('net-pack', cube, { net, paper: 'a4', margin_mm: 10, gap_mm: 5 });
        samples.paperPack.push(performance.now() - start);
        if (value.pageCount !== 1) throw Error('Paper pack changed');
        start = performance.now();
        value = await run('cell-net', tesseract, { root: 0 });
        samples.cellNet.push(performance.now() - start);
        if (value.cells.length !== 8) throw Error('Cell net changed');
        start = performance.now();
        value = await run('cell-net-edit', tesseract, {
          net: cellNet,
          action: 'toggle-face',
          face: cellNet.connections[0],
        });
        samples.cellEdit.push(performance.now() - start);
        if (value.components.length !== 2) throw Error('Cell edit changed');
      }
      return {
        samples,
        workload: {
          faceSource: 'Cube',
          cellSource: 'Tesseract',
          root: 0,
          edgeLengthMm: 25,
          tabs: true,
          paper: 'a4',
          marginMm: 10,
          gapMm: 5,
          repetitions: 5,
        },
      };
    });
    const result = {
      passed: true,
      version: await app.evaluate(({ app }) => app.getVersion()),
      packaged: runtime.packaged,
      visible,
      baseline,
      checks,
      benchmark,
      hardware: {
        cpu: os.cpus()[0]?.model,
        logicalCpus: os.cpus().length,
        memoryGiB: os.totalmem() / 2 ** 30,
        platform: os.platform(),
        release: os.release(),
      },
      errors,
    };
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(folder, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ folder, passed: true, baseline, checks, benchmark }, null, 2));
  } catch (error) {
    await page?.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {});
    await fs.writeFile(
      path.join(folder, 'failure.json'),
      JSON.stringify({ error: error.stack, checks, errors }, null, 2)
    );
    console.error('Artifacts:', folder);
    throw error;
  } finally {
    await app
      ?.evaluate(({ ipcMain }) => {
        const h = globalThis.netWriteHarness;
        if (h) {
          ipcMain.removeHandler('text-export-write');
          ipcMain.handle('text-export-write', h.original);
          delete globalThis.netWriteHarness;
        }
      })
      .catch(() => {});
    await app?.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
