import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileCatalogQuery } from '../ui/catalog-query.mjs';
import { relatedEntries, LibraryPropertyControls, RelatedLibraryControls } from '../ui/library-navigation.mjs';
import { UniformFamilyControls } from '../ui/uniform-family-controls.mjs';
import { numericControlFixture, deferred } from './numeric-control-fixture.mjs';
const data = JSON.parse(
  await readFile(new URL('../engine/catalog_data/convex_uniform4.json', import.meta.url), 'utf8')
);
const crosswalk = JSON.parse(
  await readFile(new URL('../engine/catalog_data/uniform_crosswalk.json', import.meta.url), 'utf8')
);

test('every Bowers and published U/C/W alias resolves without numeric prefix collisions', () => {
  const entries = [
    ...data.entries,
    ...crosswalk.entries.map((r) => ({ key: 'antiprism-u' + r.u, aliases: ['U' + r.u, 'C' + r.c, 'W' + r.w] })),
  ];
  for (const row of data.entries)
    assert.ok(entries.filter(compileCatalogQuery(row.bowers)).some((e) => e.key === row.key));
  for (const row of crosswalk.entries)
    for (const [letter, n] of [
      ['U', row.u],
      ['C', row.c],
      ['W', row.w],
    ]) {
      const found = entries.filter(compileCatalogQuery(letter + n));
      assert.deepEqual(
        found.map((e) => e.key),
        ['antiprism-u' + row.u]
      );
      assert.deepEqual(entries.filter(compileCatalogQuery(letter + '0' + n)), found);
    }
  assert.deepEqual(
    entries.filter(compileCatalogQuery('O1')).map((e) => e.key),
    ['simplex4']
  );
});

test('property/count filters combine with text, symbols and unknown metadata honestly', () => {
  const entries = [
    {
      key: 'a',
      name: 'Source one',
      counts: [20, 30, 12, 0],
      symmetryGroup: 'Ih',
      convex: true,
      uniform: true,
      regular: true,
      vertexTransitive: true,
      chiral: false,
    },
    { key: 'b', counts: [60, 150, 92, 0], symmetryGroup: 'I', uniform: true, convex: true, chiral: true },
    {
      key: 'c',
      counts: [120, 720, 1200, 600],
      symmetryGroup: '[5,3,3]',
      symmetryGroups: ['[3,3,5]'],
      convex: false,
      uniform: true,
    },
    { key: 'unknown', family: 'uniform convex (unverified directory)' },
  ];
  const cases = [
    ['faces:12 v<100 symmetry:Ih uniform:true vt:true chiral:false', ['a']],
    ['convex:true', ['a', 'b']],
    ['shape:star symmetry:[3,3,5]', ['c']],
    ['chiral:unknown', ['c', 'unknown']],
    ['regular:false', []],
    ['uniform:true', ['a', 'b', 'c']],
    ['uniform:unknown', ['unknown']],
    ['"source one" e>=30', ['a']],
    ['symmetry:Ih chiral:true', []],
  ];
  for (const [query, expected] of cases)
    assert.deepEqual(
      entries.filter(compileCatalogQuery(query)).map((e) => e.key),
      expected,
      query
    );
  const matches = compileCatalogQuery('uniform:true');
  entries[3].uniform = true;
  assert.equal(matches(entries[3]), true);
});

test('related links resolve explicit keys, cell types and vertex figures while skipping absent/unsupported entries', () => {
  const entries = [
    {
      key: 'a',
      name: 'A',
      dualKey: 'b',
      rectifiedKey: 'r',
      truncatedKey: 't',
      cellTypes: [{ key: 'cube', count: 8 }],
      vertexFigureKey: 'tetrahedron',
    },
    { key: 'b', name: 'B' },
    { key: 'r', name: 'R' },
    { key: 't', catalogStatus: 'unsupported' },
    { key: 'cube', name: 'Cube' },
    { key: 'tetrahedron', name: 'Tetrahedron' },
  ];
  const links = relatedEntries({ metadata: { key: 'a' } }, entries);
  assert.deepEqual(
    links.map((l) => [l.relation, l.entry.key, l.count]),
    [
      ['Dual', 'b', undefined],
      ['Rectified', 'r', undefined],
      ['Cell type', 'cube', 8],
      ['Vertex figure type', 'tetrahedron', undefined],
    ]
  );
  assert.deepEqual(relatedEntries({ metadata: { dualKey: 'absent' } }, entries), []);
  assert.deepEqual(relatedEntries({ metadata: { cellTypes: 7, cellType: 5, vertexFigureType: 8 } }, entries), []);
  assert.deepEqual(relatedEntries(null, entries), []);
});

class Node {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.value = '';
    this.attributes = {};
    this.dataset = {};
  }
  append(...children) {
    this.children.push(...children);
    if (this.tagName === 'select' && !this.value) this.value = children[0]?.value ?? '';
  }
  replaceChildren(...children) {
    this.children = [];
    this.value = '';
    this.append(...children);
  }
  after(node) {
    this.afterNode = node;
  }
  setAttribute(key, value) {
    this.attributes[key] = value;
  }
}
const documentFixture = () => ({
  nodes: { search: new Node('input') },
  createElement: (tag) => new Node(tag),
  getElementById(id) {
    return this.nodes[id];
  },
});

test('mounted geometry filters retain symmetry selection and searchable syntax tooltip', () => {
  const document = documentFixture(),
    after = new Node('select');
  let changed = 0;
  const controls = new LibraryPropertyControls({ document, after, change: () => changed++ });
  assert.equal(after.afterNode.id, 'library-properties');
  assert.match(document.nodes.search.title, /faces:12 v<100/);
  controls.update([{ symmetryGroup: 'Ih' }, { symmetryGroup: '[3,4,3]' }]);
  const symmetry = controls.selects.get('symmetry');
  symmetry.value = 'Ih';
  symmetry.onchange();
  assert.equal(changed, 1);
  controls.update([{ symmetryGroup: 'Oh' }, { symmetryGroup: 'Ih' }]);
  assert.equal(symmetry.value, 'Ih');
  assert.equal(controls.matches({ symmetryGroup: 'Oh' }), false);
  assert.equal(controls.matches({ symmetryGroup: 'Ih' }), true);
  controls.selects.get('uniform').value = 'true';
  assert.equal(controls.matches({ symmetryGroup: 'Ih' }), false);
  assert.equal(controls.matches({ symmetryGroup: 'Ih', uniform: true }), true);
});

test('mounted Related buttons open catalog entries and follow export and model changes', () => {
  const document = documentFixture(),
    after = new Node('div'),
    entries = [
      { key: 'a', dualKey: 'b' },
      { key: 'b', name: 'B' },
    ];
  let model = { metadata: { key: 'a' } },
    exporting = false;
  const opened = [];
  const controls = new RelatedLibraryControls({
    document,
    after,
    getModel: () => model,
    getEntries: () => entries,
    open: (e) => opened.push(e.key),
    guard: (fn) => fn,
    isExporting: () => exporting,
  });
  controls.sync();
  const button = controls.root.children.find((n) => n.tagName === 'button');
  assert.equal(button.dataset.relatedKey, 'b');
  button.onclick();
  assert.deepEqual(opened, ['b']);
  exporting = true;
  controls.sync();
  assert.equal(controls.root.children.find((n) => n.tagName === 'button').disabled, true);
  model = null;
  controls.sync();
  assert.equal(controls.root.children.filter((n) => n.tagName === 'button').length, 0);
});

const fixture = () =>
  numericControlFixture(UniformFamilyControls.prototype, {
    'uniform-family': 'duoprism',
    'uniform-family-n': '2+3',
    'uniform-family-m': '3',
    'generate-uniform-family': '',
  });
test('uniform family NumericEntry evaluates counts atomically and generates a guarded document', async () => {
  const f = fixture();
  await f.control.generate();
  assert.deepEqual(f.calls, [['uniform-family', { family: 'duoprism', n: 5, m: 3 }]]);
  assert.deepEqual(f.expressionCalls[0].parts, ['2+3', '3']);
  assert.equal(typeof f.options[0].verifyPublication, 'function');
  for (const value of ['2', '3/2', '201']) {
    const f = fixture();
    f.nodes['uniform-family-n'].value = value;
    await assert.rejects(f.control.generate());
    assert.equal(f.calls.length, 0);
  }
  const large = fixture();
  large.nodes['uniform-family-n'].value = '200';
  large.nodes['uniform-family-m'].value = '200';
  await assert.rejects(large.control.generate(), /4,000/);
});

test('uniform family cancellation and edited inputs prevent late publication', async () => {
  for (const change of [
    (f) => f.control.cancel(),
    (f) => (f.nodes['uniform-family-n'].value = '7'),
    (f) => f.setExport(true),
  ]) {
    const f = fixture(),
      hold = deferred();
    f.context.evaluateMany = () => hold.promise;
    const promise = f.control.generate();
    change(f);
    hold.resolve([5, 3]);
    await assert.rejects(promise);
    assert.equal(f.calls.length, 0);
    assert.equal(f.control.busy, false);
  }
});

test('property queries cover 3,500 entries without building unused text or caching mutable labels', () => {
  let visits = 0;
  const entries = Array.from({ length: 3500 }, (_, i) => ({
    counts: [i, 0, 0, 0],
    uniform: true,
    get name() {
      visits++;
      return 'model';
    },
  }));
  assert.equal(entries.filter(compileCatalogQuery('uniform:true v<100')).length, 100);
  assert.equal(visits, 0);
});
