import { matchSource } from './helpers/source-match.mjs';
import { readAppSource, readDesktopSource } from './helpers/app-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { UniformCompoundControls, ROTATIONAL_UC } from '../ui/uniform-compound-controls.mjs';
import { catalogMatches } from '../ui/catalog-query.mjs';
import { HistoryControls } from '../ui/history-controls.mjs';
import { numericControlFixture, deferred } from './numeric-control-fixture.mjs';

function fixture(uc = '20') {
  const f = numericControlFixture(UniformCompoundControls.prototype, {
    'uc-number': uc,
    'uc-angle': '3+3',
    'uc-n': '2+3',
    'uc-d': '1',
    'uc-k': '2',
    'uc-angle-row': '',
    'uc-polygon-options': '',
    'uc-create': '',
    'uc-apply': '',
  });
  f.state.model.metadata.ucNumber = Number(uc);
  f.control.source = f.state.model;
  return f;
}

test('all published rotational indices are exposed and fixed entries omit angle', async () => {
  assert.deepEqual([...ROTATIONAL_UC], [1, 2, 7, 10, 11, 13, 20, 22, 24, 26, 28]);
  const fixed = fixture('30');
  await fixed.control.apply();
  assert.deepEqual(fixed.calls, [['uniform-compound', { uc: 30 }]]);
  const rotational = fixture('1');
  await rotational.control.apply();
  assert.deepEqual(rotational.calls, [['uniform-compound', { uc: 1, angleDegrees: 6 }]]);
});

test('polygon and angle expressions create a guarded native construction', async () => {
  const f = fixture();
  await f.control.apply();
  assert.deepEqual(f.calls, [['uniform-compound', { uc: 20, angleDegrees: 6, n: 5, d: 1, k: 2 }]]);
  assert.equal(typeof f.options[0].verifyPublication, 'function');
  assert.ok(f.options[0].signal instanceof AbortSignal);
  assert.equal(f.control.busy, false);
});

test('Apply parameters uses the replayable model operation and requires matching UC', async () => {
  const f = fixture();
  await f.control.apply(true);
  assert.deepEqual(f.calls, [
    ['uniform-compound', { uc: 20, angleDegrees: 6, n: 5, d: 1, k: 2 }, 'Set UC20 parameters'],
  ]);
  f.nodes['uc-number'].value = '21';
  await assert.rejects(f.control.apply(true), /Open the selected/);
});

test('numeric domains reject fractional indices, angles and resource bounds before publication', async () => {
  for (const [field, value] of [
    ['uc-number', '1.5'],
    ['uc-number', '76'],
    ['uc-angle', '361'],
    ['uc-n', '2'],
    ['uc-n', '3/2'],
    ['uc-k', '13'],
  ]) {
    const f = fixture();
    f.nodes[field].value = value;
    await assert.rejects(f.control.apply());
    assert.equal(f.calls.length, 0);
  }
});

test('changed fields, model, document, project, export and cancellation fence pending numeric work', async () => {
  for (const change of [
    (f) => (f.nodes['uc-n'].value = '7'),
    (f) => (f.state.model.vertices[0][0] = 2),
    (f) => f.document.states.push(structuredClone(f.state)) && f.document.cursor++,
    (f) => f.setProject({ ...f.project }),
    (f) => f.setExport(true),
    (f) => f.control.cancel(),
  ]) {
    const f = fixture(),
      hold = deferred();
    f.context.evaluateMany = () => hold.promise;
    const work = f.control.apply();
    change(f);
    hold.resolve([20, 6, 5, 1, 2]);
    await assert.rejects(work);
    assert.equal(f.calls.length, 0);
    assert.equal(f.control.busy, false);
  }
});

test('late native completion must recheck publication ownership', async () => {
  const f = fixture(),
    hold = deferred();
  let options;
  f.context.generate = async (kind, params, o) => {
    options = o;
    await hold.promise;
    o.verifyPublication();
    f.calls.push(params);
  };
  const work = f.control.apply();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(options);
  f.setExport(true);
  hold.resolve();
  await assert.rejects(work, /export/);
  assert.equal(f.calls.length, 0);
});

test('source navigation restores saved parameters and collapses inapplicable controls', () => {
  const f = fixture();
  f.control.source = null;
  f.state.model.metadata.uniformCompound = { parameters: { n: 7, d: 2, k: 3, angleDegrees: 31 } };
  f.control.sync();
  assert.equal(f.nodes['uc-n'].value, '7');
  assert.equal(f.nodes['uc-angle'].value, '31');
  f.nodes['uc-number'].value = '30';
  f.control.sync();
  assert.equal(f.nodes['uc-angle-row'].hidden, true);
  assert.equal(f.nodes['uc-polygon-options'].hidden, true);
  assert.equal(f.nodes['uc-apply'].disabled, true);
  f.setExport(true);
  f.control.sync();
  assert.equal(f.nodes['uc-create'].disabled, true);
});

test('UC20–UC25 representative defaults respect odd/even denominator', () => {
  for (const uc of [20, 21, 22, 23, 24, 25]) {
    const f = fixture(String(uc));
    f.control.defaults();
    assert.equal(f.nodes['uc-d'].value, uc >= 24 ? '2' : '1');
  }
});

test('mount exposes 75 choices, collapsed polygon options and guarded buttons', () => {
  const priorDocument = globalThis.document,
    priorOption = globalThis.Option,
    nodes = {},
    mounted = [];
  const panel = {
    querySelector: (id) =>
      (nodes[id.slice(1)] ??= {
        value: id === '#uc-number' ? '1' : '',
        options: [],
        replaceChildren(...children) {
          this.options = children;
        },
      }),
    querySelectorAll: () => Object.values(nodes),
  };
  globalThis.Option = class {
    constructor(text, value) {
      this.textContent = text;
      this.value = value;
    }
  };
  globalThis.document = {
    createElement: () => panel,
    getElementById: () => ({ append: (node) => mounted.push(node) }),
  };
  try {
    const f = fixture(),
      c = new UniformCompoundControls(f.context);
    assert.equal(mounted[0].id, 'uniform-compound-settings');
    assert.equal(nodes['uc-number'].options.length, 75);
    assert.match(panel.innerHTML, /<details id="uc-polygon-options">/);
    assert.doesNotMatch(panel.innerHTML, /<details[^>]* open/);
    assert.equal(typeof nodes['uc-create'].onclick, 'function');
    assert.equal(typeof nodes['uc-apply'].onclick, 'function');
    c.cancel();
  } finally {
    globalThis.document = priorDocument;
    globalThis.Option = priorOption;
  }
});

test('UC aliases resolve exact numbers without UC1/UC10 collisions and combine with properties', async () => {
  const data = JSON.parse(
    await readFile(new URL('../engine/catalog_data/uniform_compounds.json', import.meta.url), 'utf8')
  );
  const entries = data.entries.map((e) => ({
    key: 'compound-uc' + e.uc,
    name: e.name,
    aliases: ['UC' + e.uc],
    componentCount: e.componentCount,
    chiral: e.group === 'I' || e.group === 'O',
    symmetryGroup: e.group,
  }));
  for (let uc = 1; uc <= 75; uc++)
    for (const alias of ['UC' + uc, 'UC0' + uc])
      assert.deepEqual(
        entries.filter((e) => catalogMatches(e, alias)).map((e) => e.key),
        ['compound-uc' + uc]
      );
  assert.deepEqual(
    entries.filter((e) => catalogMatches(e, 'UC5 components=5 chiral:true symmetry:I')).map((e) => e.key),
    ['compound-uc5']
  );
});

test('controls are mounted in Construct and cancel with existing compound controls', async () => {
  const [app, layout, compound] = await Promise.all(
    ['app.js', 'inspector-layout.mjs', 'compound-controls.mjs'].map((f) =>
      f === 'app.js' ? readAppSource() : readFile(new URL('../ui/' + f, import.meta.url), 'utf8')
    )
  );
  matchSource(
    app,
    /getEntries:\(\)=>(?:ctx\.)?catalog,generate:.*constructDocument\(kind,params,'Uniform compound',options\)/
  );
  matchSource(layout, /GENERATORS.add\('uniform-compound-settings'\)/);
  matchSource(compound, /new UniformCompoundControls\(context\)/);
  matchSource(compound, /this.uniforms\?\.cancel\(\)/);
});

test('native IPC, warm generation and history branching expose the new operation', async () => {
  const [main, pool] = await Promise.all(
    ['main.cjs', 'engine-pool.cjs'].map((f) =>
      f === 'main.cjs' ? readDesktopSource() : readFile(new URL('../desktop/' + f, import.meta.url), 'utf8')
    )
  );
  matchSource(main, /allowed.add\('uniform-compound'\)/);
  matchSource(pool, /REUSABLE_OPERATIONS.add\('uniform-compound'\)/);
  let exporting = false;
  const controls = Object.assign(Object.create(HistoryControls.prototype), {
    context: { isExporting: () => exporting, getDocument: () => ({ operationHistory: {} }) },
    node: () => ({ op: 'uniform-compound' }),
    replay: {},
    branch: {},
    check: {},
    support: {},
  });
  controls.sync();
  assert.equal(controls.branch.disabled, false);
  exporting = true;
  controls.sync();
  assert.equal(controls.branch.disabled, true);
});
