import { readAppSource } from './helpers/app-source.mjs';
import { matchSource } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileCatalogQuery } from '../ui/catalog-query.mjs';
import { appendStarCellInventory } from '../ui/star-uniform4-types.mjs';
import { ElementTypeControls } from '../ui/element-type-controls.mjs';

const data = JSON.parse(await readFile(new URL('../engine/catalog_data/star_uniform4.json', import.meta.url), 'utf8'));
class Node {
  constructor(tag, text = '') {
    this.tagName = tag;
    this.textContent = text;
    this.children = [];
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  get firstElementChild() {
    return this.children[0];
  }
}
const make = (tag, text) => new Node(tag, text);

test('every native star is discoverable by acronym, rational ring symbol, counts and properties', () => {
  assert.ok(data.entries.length >= 40);
  for (const row of data.entries) {
    for (const query of [
      row.bowers,
      row.symbol,
      `dim:4 shape:star uniform:true vt:true chiral:false v:${row.counts[0]} c:${row.counts[3]}`,
    ])
      assert.ok(
        data.entries.filter(compileCatalogQuery(query)).some((e) => e.key === row.key),
        query
      );
    assert.equal(row.family, 'Star uniform polychora (Wythoffian)');
  }
  for (const family of ['B4', 'F4', 'H4'])
    assert.ok(data.entries.filter(compileCatalogQuery('symmetry:' + family)).length);
});

test('named cell inventory shows polygon winding and selects exact source cell ids', () => {
  const root = make('section', ''),
    selected = [];
  const inventory = [
    {
      name: 'small stellated dodecahedron',
      bowers: 'sissid',
      count: 120,
      counts: [12, 30, 12],
      facePolygons: { '5/2': 12 },
      ids: [0, 2, 4],
    },
  ];
  appendStarCellInventory(root, inventory, { make, select: (...args) => selected.push(args) });
  const group = root.children[0];
  assert.equal(group.id, 'star-uniform4-cell-types');
  const button = group.children.find((n) => n.tagName === 'button');
  assert.equal(button.id, 'star-uniform4-cell-type-0');
  assert.match(button.textContent, /120 × small stellated dodecahedron \(sissid\)/);
  assert.ok(group.children.some((n) => n.textContent.includes('12 {5/2}')));
  button.onclick();
  assert.deepEqual(selected, [[[0, 2, 4], 'small stellated dodecahedron']]);
  assert.match(group.children.at(-1).textContent, /does not assert a full symmetry search/);
  const absent = make('section', '');
  appendStarCellInventory(absent, null, { make });
  assert.equal(absent.children.length, 0);
});

test('construction evidence keeps numerical residuals and references in a collapsed disclosure', () => {
  const root = make('section', '');
  appendStarCellInventory(
    root,
    [{ name: 'icosahedron', bowers: 'ike', count: 120, counts: [12, 30, 20], facePolygons: { 3: 20 }, ids: [0] }],
    {
      make,
      select() {},
      evidence: {
        verification: { edgeRelativeSpread: 1e-14, maxFaceRadialRelativeSpread: 2e-14, maxFaceAngularResidual: 3e-14 },
        orbitClosureResidual: 4e-15,
        referenceUrls: ['https://bendwavy.org/klitzing/incmats/fix.htm'],
      },
    }
  );
  const details = root.children[0].children.find((n) => n.id === 'star-uniform4-evidence');
  assert.equal(details.tagName, 'details');
  assert.notEqual(details.open, true);
  assert.match(details.children[1].textContent, /Float64, approximate/);
  assert.match(details.children[1].textContent, /3.00e-14 rad/);
  assert.match(details.children.at(-1).textContent, /incmats\/fix.htm/);
});

test('real Element types panel mounts inventory above unavailable symmetry and fences stale selection', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: (tag) => new Node(tag) };
  try {
    const model = {
      vertices: [[0, 0, 0, 0]],
      edges: [],
      faces: [],
      cells: [[0]],
      metadata: { key: 'star-uniform4-sishi' },
    };
    let source = { model, view: {} },
      selected = [];
    const controls = Object.create(ElementTypeControls.prototype);
    Object.assign(controls, {
      panel: new Node('section'),
      context: { getState: () => source, guard: (fn) => fn, select: (...args) => selected.push(args) },
    });
    const result = {
      available: false,
      status: 'Unavailable: element-type resource limits exceeded.',
      nativeCellInventory: [
        {
          name: 'great icosahedron',
          bowers: 'gike',
          count: 120,
          counts: [12, 30, 20],
          facePolygons: { 3: 20 },
          ids: [0],
        },
      ],
    };
    controls.render(model, result);
    const inventory = controls.panel.children.find((n) => n.id === 'star-uniform4-cell-types');
    assert.ok(inventory);
    const button = inventory.children.find((n) => n.tagName === 'button');
    button.onclick();
    assert.deepEqual(selected, [['cell', [0], 'great icosahedron']]);
    source = { model, view: {} };
    assert.throws(() => button.onclick(), /source changed/);
    controls.render(model, result);
    const current = controls.panel.children
      .find((n) => n.id === 'star-uniform4-cell-types')
      .children.find((n) => n.tagName === 'button');
    model.cells.push([1]);
    assert.throws(() => current.onclick(), /source changed/);
  } finally {
    globalThis.document = previous;
  }
});

test('native family uses ordinary guarded library loading and warm-worker operations', async () => {
  const app = readAppSource();
  matchSource(app, /api\.engine\(\{op:'generate',params:\{kind:'regular',key:entry\.key\}/);
  matchSource(app, /publish:\(m,entry,\{activate\}\)=>(?:ctx\.)?addDocument\(m,/);
  const { REUSABLE_OPERATIONS } = await import('../desktop/engine-pool.cjs');
  assert.ok(REUSABLE_OPERATIONS.has('generate') && REUSABLE_OPERATIONS.has('element-types'));
});
