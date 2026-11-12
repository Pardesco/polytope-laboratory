import { readAppSource, readDesktopSource } from './helpers/app-source.mjs';
import { matchSource } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { FabricationSession, FabricationControls } from '../ui/net-fabrication-controls.mjs';
import { sourceContext, deferred, tick } from './construction-controls-fixture.mjs';
function native(request) {
  const run = spawnSync('python', ['-B', '-m', 'engine.server'], {
    windowsHide: true,
    encoding: 'utf8',
    input: JSON.stringify(request) + '\n',
  });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.ok, true, result.error);
  return result.result;
}
const cube = native({ op: 'generate', params: { kind: 'regular', key: 'cube' } });
function fixture() {
  const owner = sourceContext(3);
  Object.assign(owner.getState().model, structuredClone(cube));
  let net = { edge_length_mm: 20, tabs: false },
    paper = { width_mm: 210, height_mm: 297, margin_mm: 10 };
  const writes = [];
  const form = { braces: true, hinges: true, hubs: true, margin: '1+1', width: '10', radius: '12', includeNet: true };
  const context = {
    ...owner,
    evaluateMany: async (entries) => entries.map((e) => (e === '1+1' ? 2 : Number(e))),
    getNetParameters: () => net,
    getPaperParameters: () => paper,
    read: async (op, params, model, options) => {
      options.verifyPublication();
      return native({ op, params, model });
    },
    export: async (format, text, options) => {
      options.verifyPublication();
      writes.push({ format, text });
      return { path: 'output.' + format };
    },
    exportPdf: async (pages, options) => {
      options.verifyPublication();
      writes.push({ format: 'pdf', pages });
      return { path: 'output.pdf' };
    },
    guard: (fn) => fn,
  };
  return {
    owner,
    context,
    form,
    writes,
    session: new FabricationSession(context),
    changeNet: () => (net = { ...net, edge_length_mm: 30 }),
    changePaper: () => (paper = { ...paper, margin_mm: 11 }),
  };
}

test('all five export actions use real native parts, measurements and physical paper pages', async () => {
  const f = fixture(),
    before = structuredClone(f.owner.getState());
  for (const action of ['parts-svg', 'parts-pdf', 'measure-csv', 'measure-pdf', 'measure-dxf']) {
    const result = await f.session.execute(action, f.form);
    if (action.startsWith('parts-')) {
      assert.equal(result.braces.length, 6);
      assert.equal(result.hinges.length, 12);
      assert.equal(result.hubs.length, 8);
      assert.equal(result.braces[0].marginMm, 2);
      assert.equal(result.pages[0].kind, 'net');
    } else {
      assert.equal(result.edges.length, 12);
      assert.equal(result.faces.length, 6);
    }
  }
  assert.match(f.writes[0].text, /width="210mm"/);
  assert.ok(f.writes[1].pages.length > 1);
  assert.match(f.writes[2].text, /length_mm/);
  assert.match(f.writes[3].pages[0], /Builder measurements/);
  assert.match(f.writes[4].text, /\$INSUNITS\n70\n4\n/);
  assert.deepEqual(f.owner.getState(), before);
  assert.equal(f.session.busy, false);
});

for (const action of ['parts-pdf', 'measure-dxf'])
  for (const mutation of ['net', 'paper', 'source', 'form', 'cancel'])
    test(`held ${action} refuses changed ${mutation}`, async () => {
      const f = fixture(),
        held = deferred();
      f.context.read = async () => held.promise;
      const job = f.session.execute(action, f.form);
      await tick();
      if (mutation === 'net') f.changeNet();
      else if (mutation === 'paper') f.changePaper();
      else if (mutation === 'source') f.owner.getState().notes = 'edited';
      else if (mutation === 'form') f.form.hubs = false;
      else f.session.cancel();
      const rejected = assert.rejects(job, /changed|cancel/i);
      held.resolve({ pages: [{ svg: '<svg/>' }], dxf: 'data' });
      await rejected;
      assert.deepEqual(f.writes, []);
      assert.equal(f.session.busy, false);
    });

test('live mounted fields are fenced independently of detached request form', async () => {
  const f = fixture(),
    held = deferred();
  let live = 'before';
  f.context.formSignature = () => live;
  f.context.read = async () => held.promise;
  const job = f.session.execute('measure-csv', f.form);
  await tick();
  live = 'changed';
  const rejected = assert.rejects(job, /fields.*changed/);
  held.resolve({ csv: 'data' });
  await rejected;
  assert.deepEqual(f.writes, []);
});

test('publication rechecks paper after a held destination callback; dismissed dialog cancels', async () => {
  const f = fixture(),
    held = deferred();
  let reached = false;
  f.context.read = async () => ({ pages: [{ svg: '<svg/>' }] });
  f.context.exportPdf = async (pages, options) => {
    reached = true;
    await held.promise;
    options.verifyPublication();
    f.writes.push(pages);
  };
  const job = f.session.execute('parts-pdf', f.form);
  while (!reached) await tick();
  f.changePaper();
  const rejected = assert.rejects(job, /changed/);
  held.resolve();
  await rejected;
  assert.deepEqual(f.writes, []);
  f.context.read = async () => ({ csv: 'csv' });
  f.context.export = async () => null;
  await assert.rejects(f.session.execute('measure-csv', f.form), { name: 'AbortError' });
});

test('mounted controls expose all families and measurement actions in Paper and export', async () => {
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
        };
    }
    querySelector(selector) {
      return this.nodes[selector.slice(1)];
    }
    querySelectorAll() {
      return Object.values(this.nodes);
    }
  }
  globalThis.document = { createElement: () => new Element() };
  const f = fixture();
  let mounted;
  f.context.read = async () => ({ csv: 'csv', edges: Array(12), faces: Array(6) });
  const controls = new FabricationControls({ ...f.context, mount: { after: (panel) => (mounted = panel) } });
  assert.equal(mounted.id, 'net-fabrication-settings');
  assert.equal(controls.form().includeNet, true);
  assert.equal(controls.form().braces, false);
  assert.equal(controls.form().hinges, true);
  await controls.node('measure-csv').onclick();
  assert.equal(f.writes[0].format, 'csv');
  assert.match(controls.node('status').textContent, /12 edges and 6 faces/);
  const layout = readFileSync(new URL('../ui/net-inspector-layout.mjs', import.meta.url), 'utf8');
  matchSource(layout, /node\('net-fabrication-settings'\)/);
  const app = readAppSource();
  matchSource(app, /(?:ctx\.)?reinforcement.fabrication=new FabricationControls\((?:ctx\.)?reinforcement.context\)/);
});

test('new read-only operations reuse native workers and DXF is allowed by bounded export', () => {
  const pool = readFileSync(new URL('../desktop/engine-pool.cjs', import.meta.url), 'utf8');
  matchSource(pool, /'net-reinforcement-parts','net-measurement-export'/);
  const main = readDesktopSource();
  matchSource(main, /formats:\['csv','json','svg','pdf','dxf'\]/);
});
