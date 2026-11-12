import { readAppSource, readDesktopSource } from './helpers/app-source.mjs';
import { matchSource } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { HingeStripSession, HingeStripControls, checkedHingeStrips } from '../ui/hinge-strip-controls.mjs';
import { sourceContext, deferred, tick } from './construction-controls-fixture.mjs';
function native(request) {
  const r = spawnSync('python', ['-B', '-m', 'engine.server'], {
    windowsHide: true,
    encoding: 'utf8',
    input: JSON.stringify(request) + '\n',
  });
  assert.equal(r.status, 0, r.stderr);
  const reply = JSON.parse(r.stdout);
  if (!reply.ok) throw Error(reply.error);
  return reply.result;
}
const cube = native({ op: 'generate', params: { kind: 'regular', key: 'cube' } });
class Element {
  constructor() {
    this.nodes = {};
  }
  set innerHTML(html) {
    this.html = html;
    for (const m of html.matchAll(/id="([^"]+)"([^>]*)/g))
      this.nodes[m[1]] = {
        value: m[2].match(/value="([^"]*)"/)?.[1] ?? '',
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
  let net = { edge_length_mm: 30, tabs: false, hinges: [], placements: [] },
    paper = { width_mm: 210, height_mm: 297, margin_mm: 10 };
  const writes = [],
    previews = [];
  const form = { setback: 'sqrt(4)', width: '8' };
  const context = {
    ...owner,
    getNetParameters: () => net,
    getPaperParameters: () => paper,
    evaluateMany: async (values) => values.map((v) => (v === 'sqrt(4)' ? 2 : Number(v))),
    read: async (op, params, model, options) => {
      options.verifyPublication();
      return native({ op, params, model });
    },
    export: async (format, text, options) => {
      options.verifyPublication();
      writes.push({ format, text });
      return true;
    },
    exportPdf: async (pages, options) => {
      options.verifyPublication();
      writes.push({ format: 'pdf', pages });
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
    form,
    writes,
    previews,
    session: new HingeStripSession(context),
    changeNet: () => (net = { ...net, placements: [{ root: 0, translation: [17, -23], angle: 37 }] }),
    changePaper: () => (paper = { ...paper, width_mm: 215.9 }),
  };
}
function mount(f) {
  globalThis.document = { createElement: () => new Element() };
  return new HingeStripControls({ ...f.context, mount: { after: () => {} } });
}

test('preview and all three exports use native mm strips and keep source/history unchanged', async () => {
  const f = fixture(),
    before = structuredClone(f.owner.getState());
  for (const action of ['preview', 'csv', 'svg', 'pdf']) {
    const r = await f.session.execute(action, f.form);
    assert.equal(r.parts.length, 12);
    assert.equal(r.units, 'mm');
    assert.equal(r.contentScale, 1);
    for (const part of r.parts) {
      assert.equal(part.endSetbackMm, 2);
      assert.ok(Math.abs(part.cutLengthMm - 26) < 1e-10);
      assert.equal(part.widthMm, 8);
      assert.equal(part.netScoreSegments.length, 2);
    }
  }
  assert.equal(f.previews.length, 1);
  assert.match(f.writes[0].text, /cut_length_mm/);
  assert.match(f.writes[1].text, /width="210mm"/);
  assert.deepEqual(
    f.writes[2].pages,
    f.previews[0].pages.map((p) => p.svg)
  );
  assert.deepEqual(f.owner.getState(), before);
  assert.equal(f.session.busy, false);
});

for (const action of ['preview', 'csv', 'pdf'])
  for (const mutation of ['source', 'placement', 'paper', 'fields', 'cancel'])
    test(`held ${action} rejects changed ${mutation} before publication`, async () => {
      const f = fixture(),
        held = deferred();
      f.context.read = async () => held.promise;
      const job = f.session.execute(action, f.form);
      await tick();
      if (mutation === 'source') f.owner.getState().notes = 'edited';
      else if (mutation === 'placement') f.changeNet();
      else if (mutation === 'paper') f.changePaper();
      else if (mutation === 'fields') f.form.width = '12';
      else f.session.cancel();
      const rejected = assert.rejects(job, /changed|cancel/i);
      held.resolve({});
      await rejected;
      assert.deepEqual(f.writes, []);
      assert.deepEqual(f.previews, []);
      assert.equal(f.session.busy, false);
    });

test('live fields and native attributes are fenced independently of detached form', async () => {
  const f = fixture(),
    held = deferred();
  let live = 'before';
  f.context.formSignature = () => live;
  f.context.read = async () => held.promise;
  const job = f.session.execute('csv', f.form);
  await tick();
  live = 'edited';
  const rejected = assert.rejects(job, /changed/);
  held.resolve({});
  await rejected;
  assert.deepEqual(f.writes, []);
});

test('destination callback rechecks source and dismissed dialogs cancel cleanly', async () => {
  const f = fixture(),
    held = deferred();
  let reached = false;
  f.context.exportPdf = async (pages, o) => {
    reached = true;
    await held.promise;
    o.verifyPublication();
    f.writes.push(pages);
    return true;
  };
  const job = f.session.execute('pdf', f.form);
  while (!reached) await tick();
  f.owner.getState().model.metadata.changed = true;
  const rejected = assert.rejects(job, /changed/);
  held.resolve();
  await rejected;
  assert.deepEqual(f.writes, []);
  f.context.export = async () => null;
  await assert.rejects(f.session.execute('csv', f.form), { name: 'AbortError' });
});

test('receipt validation refuses substituted IDs, allowances, scale, page dimensions and residuals', async () => {
  const f = fixture(),
    result = await f.session.execute('preview', f.form),
    check = (r) =>
      checkedHingeStrips(r, cube, f.context.getNetParameters(), f.context.getPaperParameters(), {
        setback: 2,
        width: 8,
      });
  assert.equal(check(result), result);
  for (const field of ['sourceEdgeId', 'matchId', 'sourceVertexIds', 'cutLengthMm', 'widthMm', 'endSetbackMm']) {
    const bad = structuredClone(result);
    bad.parts[0][field] = field === 'sourceVertexIds' ? [9, 8] : field === 'matchId' ? 'E99' : 999;
    assert.throws(() => check(bad));
  }
  for (const edit of [
    { policy: 'other' },
    { contentScale: 0.5 },
    { maxAttachmentResidualMm: 1 },
    { maxAttachmentResidualMm: NaN },
    { parts: [] },
    { csv: 'data' },
    { pages: [{ svg: '<svg width="21mm" height="297mm"/>' }] },
  ])
    assert.throws(() => check({ ...result, ...edit }));
});

test('mounted controls expose collapsed allowance, paged preview and original export sessions', async () => {
  const f = fixture();
  f.context.getPaperParameters = () => ({ width_mm: 140, height_mm: 120, margin_mm: 10 });
  const controls = mount(f);
  assert.equal(controls.panel.id, 'hinge-strip-settings');
  assert.notEqual(controls.panel.open, true);
  assert.doesNotMatch(controls.panel.html, /data-expert/);
  controls.node('setback').value = 'sqrt(4)';
  controls.node('width').value = '8';
  const result = await controls.node('preview').onclick();
  assert.equal(controls.node('pages').hidden, false);
  assert.equal(decodeURIComponent(controls.node('image').src.split(',')[1]), result.pages[0].svg);
  assert.match(controls.node('status').textContent, /12 strips previewed; total cut perimeter/);
  await controls.node('csv').onclick();
  assert.equal(f.writes[0].format, 'csv');
  controls.node('next').onclick();
  assert.equal(controls.page, 1);
  controls.node('prev').onclick();
  assert.equal(controls.page, 0);
  controls.node('setback').value = '3';
  controls.node('setback').oninput();
  assert.equal(controls.pages, null);
  assert.equal(controls.node('image').src, undefined);
});

for (const mutation of ['source', 'placement', 'paper', 'fields', 'cancel'])
  test(`mounted preview clears on changed ${mutation}`, async () => {
    const f = fixture(),
      controls = mount(f);
    await controls.node('preview').onclick();
    if (mutation === 'source') f.owner.getState().notes = 'changed';
    else if (mutation === 'placement') f.changeNet();
    else if (mutation === 'paper') f.changePaper();
    else if (mutation === 'fields') controls.node('width').value = '9';
    else controls.cancel();
    controls.sync();
    assert.equal(controls.node('pages').hidden, true);
    assert.equal(controls.pages, null);
    assert.equal(controls.node('image').src, undefined);
  });

test('empty startup and unsupported sources disable actions without reading a missing net', async () => {
  const f = fixture();
  f.context.getState = () => undefined;
  f.context.getNetParameters = () => {
    throw Error('No source.');
  };
  const controls = mount(f);
  assert.equal(controls.node('preview').disabled, true);
  f.owner.getState().model.interpretation = 'generalized-complex';
  f.context.getState = f.owner.getState;
  controls.sync();
  assert.equal(controls.node('csv').disabled, true);
  await assert.rejects(f.session.execute('csv', f.form), /No source/);
});

test('native unsupported assembly and collapsed allowance publish no output', async () => {
  const f = fixture();
  await assert.rejects(f.session.execute('preview', { ...f.form, setback: '15' }), /collapses/);
  f.owner.getState().model.interpretation = 'generalized-complex';
  await assert.rejects(f.session.execute('csv', f.form), /convex 3D.*assemblies are unsupported/);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.previews, []);
});

test('app mounts in existing common reinforcement group with sync/cancel and warm allowlist registrations', () => {
  const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  matchSource(readAppSource(), /reinforcement\.fabrication\.allowance=new HingeStripControls/);
  matchSource(readAppSource(), /fabrication\.node\('presets'\)\.append\(panel\)/);
  matchSource(read('ui/net-fabrication-controls.mjs'), /this\.allowance\?\.cancel\(\)/);
  matchSource(read('ui/net-fabrication-controls.mjs'), /this\.allowance\?\.sync\(\)/);
  matchSource(readDesktopSource(), /allowed\.add\('net-hinge-strip-allowance'\)/);
  matchSource(read('desktop/engine-pool.cjs'), /REUSABLE_OPERATIONS\.add\('net-hinge-strip-allowance'\)/);
});
