import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  FabricationControls,
  FabricationSession,
  FABRICATION_PRESETS,
  checkedFabricationPages,
} from '../ui/net-fabrication-controls.mjs';
import { sourceContext, deferred, tick } from './construction-controls-fixture.mjs';
function native(request) {
  const run = spawnSync('python', ['-B', '-m', 'engine.server'], {
    windowsHide: true,
    encoding: 'utf8',
    input: JSON.stringify(request) + '\n',
  });
  assert.equal(run.status, 0, run.stderr);
  const reply = JSON.parse(run.stdout);
  if (!reply.ok) throw Error(reply.error);
  return reply.result;
}
const cube = native({ op: 'generate', params: { kind: 'regular', key: 'cube' } });
class Element {
  constructor() {
    this.nodes = {};
  }
  set innerHTML(html) {
    for (const m of html.matchAll(/id="([^"]+)"([^>]*)/g))
      this.nodes[m[1]] = {
        value: m[2].match(/value="([^"]*)"/)?.[1] ?? '',
        checked: m[2].includes('checked'),
        disabled: false,
        textContent: '',
        removeAttribute(key) {
          delete this[key];
        },
      };
  }
  querySelector(selector) {
    return this.nodes[selector.slice(1)];
  }
  querySelectorAll() {
    return Object.values(this.nodes);
  }
}
function fixture() {
  const owner = sourceContext(3);
  Object.assign(owner.getState().model, structuredClone(cube));
  let net = { edge_length_mm: 25, tabs: true },
    paper = { width_mm: 215.9, height_mm: 279.4, margin_mm: 10 };
  const exports = [],
    previews = [],
    requests = [];
  const context = {
    ...owner,
    evaluateMany: async (entries) => entries.map((e) => (e === 'sqrt(16)' ? 4 : Number(e))),
    getNetParameters: () => net,
    getPaperParameters: () => paper,
    read: async (op, params, model, options) => {
      options.verifyPublication();
      requests.push({ op, params });
      return native({ op, params, model });
    },
    export: async (format, text, options) => {
      options.verifyPublication();
      exports.push({ format, text });
      return true;
    },
    exportPdf: async (pages, options) => {
      options.verifyPublication();
      exports.push({ format: 'pdf', pages });
      return true;
    },
    previewPages: async (result, options) => {
      options.verifyPublication();
      previews.push(result);
    },
    guard: (fn) => fn,
  };
  return {
    owner,
    context,
    exports,
    previews,
    requests,
    session: new FabricationSession(context),
    form: { ...FABRICATION_PRESETS.hinges, includeNet: true },
    changeNet: () => (net = { ...net, edge_length_mm: 35 }),
    changePaper: () => (paper = { ...paper, width_mm: 210 }),
  };
}
function mount(f) {
  globalThis.document = { createElement: () => new Element() };
  return new FabricationControls({ ...f.context, mount: { after: () => {} } });
}

test('empty startup does not read net parameters before a source exists', () => {
  const f = fixture();
  f.context.getState = () => undefined;
  f.context.getNetParameters = () => {
    throw Error('No source yet.');
  };
  const controls = mount(f);
  assert.equal(controls.node('measure-csv').disabled, true);
  assert.match(controls.node('scale').textContent, /Choose a 3D/);
});

for (const key of Object.keys(FABRICATION_PRESETS))
  test(`${key} preset previews native physical pages without exporting or editing source/history`, async () => {
    const f = fixture(),
      before = structuredClone(f.owner.getState()),
      result = await f.session.execute('parts-preview', { ...FABRICATION_PRESETS[key], includeNet: true });
    assert.equal(result.units, 'mm');
    assert.equal(result.contentScale, 1);
    assert.equal(result.referenceEdgeLengthMm, 25);
    assert.ok(result.maxEdgeFlatteningResidualMm < 1e-8);
    assert.equal(result.braces.length, key === 'braces' ? 6 : 0);
    assert.equal(result.hinges.length, key === 'hinges' ? 12 : 0);
    assert.equal(result.hubs.length, key === 'rosettes' ? 8 : 0);
    assert.equal(result.pages[0].kind, 'net');
    for (const page of result.pages) assert.match(page.svg, /width="215.9mm" height="279.4mm"/);
    assert.equal(f.previews.length, 1);
    assert.deepEqual(f.exports, []);
    assert.deepEqual(f.owner.getState(), before);
  });

test('cut list physical mm is independent of coordinate units and observer zoom', async () => {
  const f = fixture();
  f.owner.getState().view.coordinateUnit = 'in';
  f.owner.getState().view.camera.zoom = 7;
  const result = await f.session.execute('measure-csv', f.form),
    rows = f.exports[0].text
      .trim()
      .split(/\r?\n/)
      .map((row) => row.split(','));
  const column = rows[0].indexOf('length_mm'),
    edges = rows.slice(1).filter((row) => row[0] === 'edge');
  assert.equal(edges.length, 12);
  for (const row of edges) assert.ok(Math.abs(Number(row[column]) - 25) < 1e-10);
  assert.equal(result.angleUnit, 'degrees');
  assert.equal(result.faces.length, 6);
});

for (const mutation of ['net', 'paper', 'source', 'fields', 'cancel'])
  test(`held preview refuses changed ${mutation} before publishing`, async () => {
    const f = fixture(),
      held = deferred();
    f.context.read = async () => held.promise;
    const job = f.session.execute('parts-preview', f.form);
    await tick();
    if (mutation === 'net') f.changeNet();
    else if (mutation === 'paper') f.changePaper();
    else if (mutation === 'source') f.owner.getState().notes = 'edited';
    else if (mutation === 'fields') f.form.hubs = true;
    else f.session.cancel();
    const rejected = assert.rejects(job, /changed|cancel/i);
    held.resolve({});
    await rejected;
    assert.deepEqual(f.previews, []);
    assert.deepEqual(f.exports, []);
  });

test('preview validates native units, scale, E0, residual, page count and paper dimensions', () => {
  const good = {
      units: 'mm',
      contentScale: 1,
      referenceEdgeLengthMm: 25,
      maxEdgeFlatteningResidualMm: 0,
      pages: [{ svg: '<svg width="210mm" height="297mm"></svg>' }],
    },
    net = { edge_length_mm: 25 },
    paper = { width_mm: 210, height_mm: 297 };
  assert.equal(checkedFabricationPages(good, net, paper), good.pages);
  for (const bad of [
    { units: 'in' },
    { contentScale: 0.99 },
    { referenceEdgeLengthMm: 20 },
    { maxEdgeFlatteningResidualMm: NaN },
    { maxEdgeFlatteningResidualMm: -1 },
    { pages: [] },
    { pages: Array(251).fill(good.pages[0]) },
    { pages: [{ svg: '<svg width="209mm" height="297mm"/>' }] },
    { pages: [{ svg: '<svg width="210" height="297"/>' }] },
    { pages: [{}] },
  ])
    assert.throws(() => checkedFabricationPages({ ...good, ...bad }, net, paper));
});

test('mounted presets, paged preview, and exports use original sessions and keep custom options collapsed', async () => {
  const f = fixture(),
    controls = mount(f),
    before = structuredClone(f.owner.getState());
  assert.equal(controls.node('preset').value, 'hinges');
  assert.equal(controls.form().braces, false);
  assert.equal(controls.node('margin').disabled, true);
  const result = await controls.node('parts-preview').onclick();
  assert.equal(controls.node('preview').hidden, false);
  assert.equal(controls.node('page-prev').disabled, true);
  assert.match(controls.node('page-status').textContent, /215.9 × 279.4 mm/);
  assert.match(controls.node('status').textContent, /residual:/);
  assert.equal(decodeURIComponent(controls.node('page-image').src.split(',')[1]), result.pages[0].svg);
  controls.node('page-next').onclick();
  assert.equal(controls.page, 1);
  assert.equal(controls.node('page-prev').disabled, false);
  await controls.node('parts-pdf').onclick();
  assert.deepEqual(
    f.exports.at(-1).pages,
    result.pages.map((p) => p.svg)
  );
  controls.node('preset').value = 'braces';
  controls.node('preset').onchange();
  assert.equal(controls.node('custom').open, false);
  assert.equal(controls.node('preview').hidden, true);
  assert.equal(controls.form().braces, true);
  controls.node('preset').value = 'custom';
  controls.node('preset').onchange();
  assert.equal(controls.node('custom').open, true);
  controls.node('margin').value = 'sqrt(16)';
  controls.node('margin').oninput();
  const braces = await controls.node('parts-preview').onclick();
  assert.equal(braces.braces[0].marginMm, 4);
  assert.deepEqual(f.owner.getState(), before);
});

for (const mutation of ['net', 'paper', 'source', 'fields', 'cancel'])
  test(`mounted preview clears on ${mutation}`, async () => {
    const f = fixture(),
      controls = mount(f);
    await controls.node('parts-preview').onclick();
    if (mutation === 'net') f.changeNet();
    else if (mutation === 'paper') f.changePaper();
    else if (mutation === 'source') f.owner.getState().notes = 'edited';
    else if (mutation === 'fields') controls.node('width').value = '11';
    else controls.cancel();
    controls.sync();
    assert.equal(controls.node('preview').hidden, true);
    assert.equal(controls.pages, null);
    assert.equal(controls.node('page-image').src, undefined);
  });

test('disabled unused custom dimensions do not block the selected family', async () => {
  const f = fixture(),
    form = { ...f.form, margin: 'unused', radius: 'unused' };
  const result = await f.session.execute('parts-preview', form);
  assert.equal(result.hinges.length, 12);
});

test('collapsed inset, unsupported source and oversized intact net refuse without publication', async () => {
  const f = fixture();
  await assert.rejects(
    f.session.execute('parts-preview', { ...FABRICATION_PRESETS.braces, margin: '20', includeNet: false }),
    /collaps|inset/i
  );
  f.owner.getState().model = native({ op: 'generate', params: { kind: 'regular', key: 'tesseract' } });
  await assert.rejects(f.session.execute('parts-preview', f.form), /3D/);
  assert.deepEqual(f.previews, []);
  f.owner.getState().model = structuredClone(cube);
  f.context.getPaperParameters = () => ({ width_mm: 60, height_mm: 60, margin_mm: 10 });
  await assert.rejects(f.session.execute('parts-preview', f.form), /fit|paper|large/i);
  assert.deepEqual(f.previews, []);
});
