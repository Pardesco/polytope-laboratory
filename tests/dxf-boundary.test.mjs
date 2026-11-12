import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { GeometryExportSession } from '../ui/geometry-export-session.mjs';
import { numericControlFixture, deferred, flush } from './numeric-control-fixture.mjs';
const { createGeometryExport } = createRequire(import.meta.url)('../desktop/geometry-export.cjs');
const native = (request) =>
  JSON.parse(
    execFileSync(
      'python',
      ['-c', 'import json,sys;from engine.server import dispatch;print(json.dumps(dispatch(json.load(sys.stdin))))'],
      { input: JSON.stringify(request), encoding: 'utf8' }
    )
  );
const models = JSON.parse(
  execFileSync(
    'python',
    [
      '-c',
      "import json;from engine.generators import regular;from engine.operations import section;from engine.formats import load_file;print(json.dumps([regular('cube'),section(regular('tesseract'))['model'],load_file('tests/fixtures/dxf-boundary/attributed-mm.dxf')['model']]))",
    ],
    { encoding: 'utf8' }
  )
);

test('mounted DXF profile reviews base/derived units, RGB loss and publishes the reviewed payload', async () => {
  const server = await createServer({
    configFile: false,
    root: 'ui',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port: 0 },
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.route('**/dxf-mount', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' })
    );
    await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/dxf-mount');
    await page.exposeFunction('native', native);
    await page.evaluate(async ([model, derived, imported]) => {
      const { ExportControls } = await import('/export-controls.mjs');
      const { ExportGoals } = await import('/export-goals.mjs');
      document.body.innerHTML =
        '<dialog id="export-dialog"><h2>Export</h2><select id="export-format"><option value="off">OFF</option><option value="json">JSON</option><option value="dxf">DXF</option></select><p id="export-domain"></p><button id="confirm-export">Export</button></dialog>';
      model.metadata.offColors = {
        faces: model.faces.map(() => ({ encoding: 'unit', values: [0.123, 0.456, 0.789, 0.4] })),
      };
      const state = { model, view: { coordinateUnit: 'mm' }, notes: '' },
        doc = { id: 'dxf', cursor: 0, states: [state] },
        project = { active: 0, documents: [doc] };
      window.saved = [];
      window.setImported = () => {
        state.model = imported;
      };
      const context = {
        getState: () => state,
        getDocument: () => doc,
        getProject: () => project,
        getDerived: () => derived,
        getViewer: () => null,
        getNet: () => null,
        isExporting: () => false,
        guard: (fn) => fn,
        setStatus: () => {},
        evaluateMany: async (p) => p.map(Number),
        describe: (m) => window.native({ op: 'export-options', model: m }),
        prepare: (m, p) => window.native({ op: 'prepare-export', model: m, params: p }),
        api: {
          beginGeometryExport: async () => ({ id: 'ticket' }),
          writeGeometryExport: async (id, data) => {
            window.saved.push(data);
            return { path: 'selected.dxf' };
          },
          abortGeometryExport: async () => {},
        },
      };
      window.control = new ExportControls(context);
      window.control.goals = new ExportGoals(window.control, { storage: null });
      document.querySelector('#confirm-export').onclick = () => window.control.confirm();
      await window.control.open();
    }, models);
    assert.equal(await page.locator('#dxf-export-settings').isVisible(), false);
    await page.click('#export-all-formats > summary');
    await page.selectOption('#export-format', 'dxf');
    await page.waitForFunction(() => window.control.session.prepared?.owner.selection.format === 'dxf');
    assert.equal(await page.locator('#dxf-export-settings').isVisible(), true);
    await page.selectOption('#dxf-export-profile', 'boundary');
    await page.selectOption('#export-units', 'in');
    await page.waitForFunction(
      () =>
        window.control.session.prepared?.owner.selection.dxf?.profile === 'boundary' &&
        window.control.session.prepared?.owner.selection.unit === 'in'
    );
    assert.match(await page.textContent('#dxf-export-summary'), /6 faces.*6 colored faces/);
    assert.match(await page.textContent('#export-preview'), /alpha.*omitted/);
    assert.match(await page.textContent('#export-preview'), /nearest byte/);
    const reviewed = await page.evaluate(() => window.control.session.prepared.result.text);
    await page.click('#confirm-export');
    assert.equal(await page.evaluate(() => window.saved[0]), reviewed);
    assert.equal(reviewed.match(/\n3DFACE\n/g).length, 6);
    await page.evaluate(() => window.control.open());
    await page.click('#export-all-formats > summary');
    await page.selectOption('#export-source', 'derived');
    await page.selectOption('#export-format', 'dxf');
    await page.waitForFunction(
      () =>
        window.control.session.prepared?.owner.selection.source === 'derived' &&
        window.control.session.prepared?.result.report.dxf?.faceCount === 6
    );
    assert.match(await page.textContent('#dxf-export-summary'), /6 faces/);
    await page.evaluate(() => {
      window.control.close();
      window.setImported();
      return window.control.open();
    });
    await page.click('#export-all-formats > summary');
    await page.selectOption('#export-format', 'dxf');
    await page.waitForFunction(() => window.control.session.prepared?.result.report.dxf?.pointCount === 1);
    assert.equal(await page.inputValue('#export-units'), 'mm');
    assert.match(
      await page.textContent('#dxf-export-summary'),
      /1 faces.*1 loose lines.*1 isolated points.*3 part layers/
    );
    assert.match(await page.textContent('#export-preview'), /hidden-edge/);
    assert.equal(await page.evaluate(() => document.body.classList.contains('expert-mode')), false);
  } finally {
    await browser?.close();
    await server.close();
  }
});

for (const change of ['profile', 'source', 'cancel', 'chooser-cancel'])
  test('DXF ' + change + ' during destination review leaves the previous file intact', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dxf-boundary-'));
    t.after(async () => {
      assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
      assert.match(path.basename(root), /^dxf-boundary-/);
      await fs.rm(root, { recursive: true, force: true });
    });
    const file = path.join(root, 'chosen.dxf');
    await fs.writeFile(file, 'previous complete DXF');
    const gate = deferred(),
      exporter = createGeometryExport({ selectPath: () => gate.promise }),
      f = numericControlFixture(Object.prototype, {});
    f.state.model = structuredClone(models[0]);
    const before = JSON.stringify(f.state),
      selection = { format: 'dxf', unit: 'in', source: 'base', dxf: { profile: 'boundary' } };
    Object.assign(f.context, {
      getGeometry: () => f.state.model,
      getSelection: () => selection,
      describe: (m) => native({ op: 'export-options', model: m }),
      prepare: (m, p) => native({ op: 'prepare-export', model: m, params: p }),
      api: {
        beginGeometryExport: (p) => exporter.begin(p),
        writeGeometryExport: (id, data) => exporter.write(id, data),
        abortGeometryExport: async (id) => exporter.abort(id),
      },
    });
    const session = new GeometryExportSession(f.context);
    await session.prepare();
    assert.equal(session.prepared.result.report.dxf.faceCount, 6);
    const pending = session.confirm();
    await flush();
    if (change === 'profile') selection.dxf.profile = 'wire';
    if (change === 'source') f.state.model = structuredClone(models[1]);
    if (change === 'cancel') session.cancel();
    gate.resolve(change === 'chooser-cancel' ? null : file);
    if (change === 'chooser-cancel') assert.equal(await pending, null);
    else await assert.rejects(pending, /changed|canceled/);
    assert.equal(await fs.readFile(file, 'utf8'), 'previous complete DXF');
    assert.deepEqual(await fs.readdir(root), ['chosen.dxf']);
    if (change !== 'source') assert.equal(JSON.stringify(f.state), before);
  });

test('DXF reviewed boundary uses native atomic publication and reopens with declared units and face colors', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dxf-boundary-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^dxf-boundary-/);
    await fs.rm(root, { recursive: true, force: true });
  });
  const file = path.join(root, 'chosen.dxf'),
    exporter = createGeometryExport({ selectPath: async () => file });
  const result = native({
    op: 'prepare-export',
    model: models[2],
    params: { format: 'dxf', source_unit: 'mm', target_unit: 'in', dxf_profile: 'boundary', include_text: true },
  });
  await fs.writeFile(file, 'prior');
  const ticket = await exporter.begin({ format: 'dxf', defaultName: 'Boundary.dxf' });
  await exporter.write(ticket.id, result.text);
  assert.equal(await fs.readFile(file, 'utf8'), result.text);
  const loaded = native({ op: 'load', params: { path: file } }).model;
  assert.equal(loaded.metadata.coordinateUnits, 'in');
  assert.deepEqual(loaded.metadata.offColors.faces[0].values, [32, 64, 96]);
  assert.equal(loaded.faces.length, 1);
  assert.equal(loaded.edges.length, 5);
  assert.equal(loaded.vertices.length, 7);
});

test('DXF cancellation during fsync removes the temporary and preserves the previous complete file', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dxf-boundary-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^dxf-boundary-/);
    await fs.rm(root, { recursive: true, force: true });
  });
  const file = path.join(root, 'chosen.dxf');
  await fs.writeFile(file, 'previous complete DXF');
  const ready = deferred(),
    gate = deferred(),
    io = {
      ...fs,
      open: async (...args) => {
        const handle = await fs.open(...args),
          sync = handle.sync.bind(handle);
        handle.sync = async () => {
          ready.resolve();
          await gate.promise;
          await sync();
        };
        return handle;
      },
    };
  const exporter = createGeometryExport({ selectPath: async () => file, io });
  const text = native({
    op: 'prepare-export',
    model: models[0],
    params: { format: 'dxf', dxf_profile: 'boundary', include_text: true },
  }).text;
  const ticket = await exporter.begin({ format: 'dxf', defaultName: 'Boundary.dxf' }),
    pending = exporter.write(ticket.id, text);
  await ready.promise;
  exporter.abort(ticket.id);
  gate.resolve();
  await assert.rejects(pending, /unavailable|canceled/);
  assert.equal(await fs.readFile(file, 'utf8'), 'previous complete DXF');
  assert.deepEqual(await fs.readdir(root), ['chosen.dxf']);
});
