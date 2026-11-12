import test from 'node:test';
import assert from 'node:assert/strict';
import { NetExportSession } from '../ui/net-export-session.mjs';
import { numericControlFixture, deferred, flush } from './numeric-control-fixture.mjs';
function fixture() {
  const f = numericControlFixture(Object.prototype, {});
  f.state.model.fingerprint = 'a'.repeat(64);
  f.state.view.net = { root: 0, length: 25, tabs: true, fraction: 0, page: 0 };
  f.state.view.netPrint = { paper: 'a4', margin_mm: 10 };
  f.state.netLayout = {
    sourceId: f.state.model.id,
    sourceFingerprint: f.state.model.fingerprint,
    root: 0,
    referenceEdgeLengthMm: 25,
    tabs: true,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm"></svg>',
    printSource: { metadata: structuredClone(f.state.model.metadata) },
  };
  f.state.netPages = { pages: [{ svg: '<svg>page one</svg>' }, { svg: '<svg>page two</svg>' }] };
  const calls = [],
    bytes = Uint8Array.from([37, 80, 68, 70, 45, 0, 255]);
  f.context.api = {
    beginTextExport: async (options) => {
      calls.push(['begin', options]);
      return { id: 'ticket' };
    },
    writeTextExport: async (id, data) => {
      calls.push(['write', id, data]);
      return { path: 'chosen.file' };
    },
    abortTextExport: async (id) => calls.push(['abort', id]),
    renderPackedNetPdf: async (pages) => {
      calls.push(['render', pages]);
      return bytes;
    },
  };
  return { ...f, calls, bytes, session: new NetExportSession(f.context) };
}
test('layout SVG and packed PDF publish only their reviewed literal content after destination selection', async () => {
  const f = fixture(),
    source = structuredClone(f.state.model);
  await f.session.run('svg');
  assert.deepEqual(
    f.calls.map((c) => c[0]),
    ['begin', 'write']
  );
  assert.equal(f.calls[1][2], f.state.netLayout.svg);
  f.calls.length = 0;
  await f.session.run('pdf', { packed: true });
  assert.deepEqual(
    f.calls.map((c) => c[0]),
    ['begin', 'render', 'write']
  );
  assert.deepEqual(
    f.calls[1][1],
    f.state.netPages.pages.map((page) => page.svg)
  );
  assert.strictEqual(f.calls[2][2], f.bytes);
  assert.deepEqual(f.state.model, source);
  assert.equal(f.session.busy, false);
});
test('missing or stale layout, missing packed pages and unsupported output fail before opening a dialog', async () => {
  for (const change of [
    (f) => (f.state.netLayout = null),
    (f) => (f.state.view.net.length = 31),
    (f) => (f.state.view.net.tabs = false),
    (f) => (f.state.model.metadata.offColors.faces[0].values[0] = 0.7),
    (f) => (f.state.view.elementAnnotations = { entries: [{ text: 'new' }] }),
  ]) {
    const f = fixture();
    change(f);
    await assert.rejects(f.session.run('svg'), /current/);
    assert.deepEqual(f.calls, []);
  }
  const f = fixture();
  f.state.netPages = null;
  await assert.rejects(f.session.run('pdf', { packed: true }), /Pack/);
  await assert.rejects(f.session.run('obj'), /SVG or PDF/);
  assert.deepEqual(f.calls, []);
});
test('source, layout, print options and content changes during a held save dialog abort its late ticket', async () => {
  for (const change of [
    (f) => (f.state.model.vertices[0][0] = 4),
    (f) => (f.state.view.coordinateUnit = 'in'),
    (f) => (f.state.notes = 'changed'),
    (f) => (f.state.netLayout.svg = '<svg>changed</svg>'),
    (f) => (f.state.view.net.length = 99),
    (f) => (f.state.view.netPrint.margin_mm = 21),
    (f) => (f.state.view.elementAnnotations = { entries: [] }),
    (f) => f.setProject({ ...f.project }),
    (f) => f.session.cancel(),
  ]) {
    const f = fixture(),
      gate = deferred();
    f.context.api.beginTextExport = () => gate.promise;
    const pending = f.session.run('svg');
    await flush();
    change(f);
    gate.resolve({ id: 'late' });
    await assert.rejects(pending, /changed|canceled/);
    assert.deepEqual(f.calls, [['abort', 'late']]);
    assert.equal(f.session.busy, false);
  }
});
test('PDF rendering is fenced after source edits and cancellation, without a stale write', async () => {
  for (const change of [(f) => (f.state.netPages.pages[0].svg = '<svg>new page</svg>'), (f) => f.session.cancel()]) {
    const f = fixture(),
      gate = deferred();
    f.context.api.renderPackedNetPdf = () => gate.promise;
    const pending = f.session.run('pdf', { packed: true });
    await flush();
    change(f);
    gate.resolve(f.bytes);
    await assert.rejects(pending, /changed|canceled/);
    assert.equal(
      f.calls.some((c) => c[0] === 'write'),
      false
    );
    assert.deepEqual(f.calls.at(-1), ['abort', 'ticket']);
  }
});
test('page SVG binds the chosen page; observer and fold-preview motion are independent of paper output', async () => {
  const f = fixture();
  f.state.view.net.page = 1;
  await f.session.run('svg', { packed: true, currentPage: true });
  assert.equal(f.calls[0][1].defaultName, 'Net page 2.svg');
  assert.equal(f.calls[1][2], '<svg>page two</svg>');
  const gate = deferred();
  f.context.api.beginTextExport = () => gate.promise;
  const pending = f.session.run('svg');
  await flush();
  f.state.view.camera = { zoom: 3 };
  f.state.view.net.fraction = 0.7;
  gate.resolve({ id: 'moving-camera' });
  await pending;
  assert.equal(f.calls.at(-1)[0], 'write');
  assert.equal(f.state.view.camera.zoom, 3);
  const other = fixture(),
    held = deferred();
  other.context.api.beginTextExport = () => held.promise;
  const page = other.session.run('svg', { packed: true, currentPage: true });
  await flush();
  other.state.view.net.page = 1;
  held.resolve({ id: 'changed-page' });
  await assert.rejects(page, /changed/);
});
test('duplicate exports refuse and canceled destination selection releases the lock without writing', async () => {
  const f = fixture(),
    gate = deferred();
  f.context.api.beginTextExport = () => gate.promise;
  const pending = f.session.run('svg');
  await flush();
  await assert.rejects(f.session.run('pdf'), /current net export/);
  gate.resolve(null);
  assert.equal(await pending, null);
  assert.deepEqual(f.calls, []);
  assert.equal(f.session.busy, false);
});
test('a changed parent dialog refuses a late ticket and a completed PDF before publication', async () => {
  for (const phase of ['destination', 'render']) {
    const f = fixture(),
      gate = deferred();
    let current = true;
    if (phase === 'destination') f.context.api.beginTextExport = () => gate.promise;
    else f.context.api.renderPackedNetPdf = () => gate.promise;
    const saving = f.session.run('pdf', { isCurrent: () => current });
    await flush();
    current = false;
    gate.resolve(phase === 'destination' ? { id: 'late-parent' } : f.bytes);
    await assert.rejects(saving, { name: 'AbortError' });
    assert.equal(
      f.calls.some((call) => call[0] === 'write'),
      false
    );
    assert.equal(f.calls.at(-1)[0], 'abort');
  }
});
