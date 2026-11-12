import { readAppSource } from './helpers/app-source.mjs';
import { matchSource } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { AnalysisOverview, describeModel, overviewData } from '../ui/analysis-overview.mjs';
import { orderAnalysisGroups } from '../ui/analysis-order.mjs';
import { ElementTypeControls } from '../ui/element-type-controls.mjs';
const { reveal } = createRequire(import.meta.url)('../scripts/smoke-helpers.cjs');

const cube = () => ({
  name: 'Cube',
  dimension: 3,
  interpretation: 'convex-polytope',
  metadata: { key: 'cube', family: 'Platonic', dualKey: 'octahedron' },
  vertices: Array(8).fill([0, 0, 0]),
  edges: Array(12).fill([0, 1]),
  faces: Array(6).fill([0, 1, 2, 3]),
  cells: [],
});
const entries = [
  { key: 'cube', name: 'Cube', family: 'Platonic', dualKey: 'octahedron' },
  { key: 'octahedron', name: 'Octahedron' },
];
class Node {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this._text = '';
    this.open = false;
  }
  set textContent(text) {
    this.children = [];
    this._text = String(text);
  }
  get textContent() {
    return this._text + this.children.map((n) => n.textContent).join(' ');
  }
  setAttribute(key, value) {
    this.attributes[key] = value;
  }
  getAttribute(key) {
    return this.attributes[key];
  }
  append(...nodes) {
    for (const node of nodes) {
      node.remove();
      node.parentElement = this;
      this.children.push(node);
    }
  }
  remove() {
    if (this.parentElement) {
      const list = this.parentElement.children;
      list.splice(list.indexOf(this), 1);
      this.parentElement = null;
    }
  }
  insert(where, nodes) {
    const parent = this.parentElement;
    for (const node of nodes) node.remove();
    const index = parent.children.indexOf(this) + (where === 'after' ? 1 : 0);
    parent.children.splice(index, 0, ...nodes);
    for (const node of nodes) node.parentElement = parent;
  }
  before(...nodes) {
    this.insert('before', nodes);
  }
  after(...nodes) {
    this.insert('after', nodes);
  }
  replaceChildren(...nodes) {
    for (const node of [...this.children]) node.remove();
    this._text = '';
    this.append(...nodes);
  }
  all() {
    return [this, ...this.children.flatMap((n) => n.all())];
  }
  get firstElementChild() {
    return this.children[0];
  }
}
function fixture() {
  const root = new Node();
  root.id = 'info-panel';
  const analysis = new Node();
  analysis.id = 'analysis';
  root.append(analysis);
  const document = {
    createElement: (tag) => new Node(tag),
    getElementById: (id) => root.all().find((n) => n.id === id),
  };
  let state = { model: cube(), view: {}, label: 'Open cube' },
    history = { cursor: 0, states: [state] };
  const control = new AnalysisOverview({
    document,
    getState: () => state,
    getDocument: () => history,
    getEntries: () => entries,
  });
  return {
    root,
    document,
    control,
    get state() {
      return state;
    },
    setState(value, document) {
      state = value;
      history = document ?? { cursor: 0, states: [state] };
    },
  };
}
test('catalog identity supplies curated prose, big counts and only recorded relatives', () => {
  const data = overviewData(cube(), { entries });
  assert.match(data.description, /Six squares/);
  assert.equal(data.family, 'Platonic');
  assert.deepEqual(
    data.counts.map((c) => c.count),
    [8, 12, 6]
  );
  assert.ok(data.facts.includes('Every face has 4 sides.'));
  assert.ok(data.facts.includes('Its dual is the Octahedron.'));
  assert.ok(!data.facts.some((f) => /symmetry/i.test(f)));
  const unlabelled = cube();
  unlabelled.metadata = {};
  assert.ok(!overviewData(unlabelled, { entries }).facts.some((f) => /dual/.test(f)));
});
test('quadrilateral incidence never becomes a claim of squares or cubes', () => {
  const model = cube();
  model.metadata = {};
  model.vertices[0] = [0.2, 0.3, 0.1];
  const data = overviewData(model);
  assert.deepEqual(data.facts, ['Every face has 4 sides.']);
  assert.match(data.description, /convex solid/);
});
test('only complete full numerical symmetry with closure supplies an order', () => {
  const result = { available: true, complete: true, closureVerified: true, orientation: 'all', groupOrder: 48 };
  assert.ok(overviewData(cube(), { types: result }).facts.includes('Detected symmetry order 48 (numerical check).'));
  for (const patch of [
    { available: false },
    { complete: false },
    { closureVerified: false },
    { orientation: 'proper' },
    { groupOrder: NaN },
  ])
    assert.ok(!overviewData(cube(), { types: { ...result, ...patch } }).facts.some((f) => /symmetry/i.test(f)));
});
test('literal 4D cell incidence supports a uniform edge meeting count', () => {
  const model = {
    ...cube(),
    dimension: 4,
    metadata: {},
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [0, 3],
    ],
    faces: [[0, 1, 2, 3]],
    cells: [[0], [0], [0]],
  };
  assert.ok(overviewData(model).facts.includes('3 cells meet at every edge.'));
  model.edges.push([0, 2]);
  assert.ok(!overviewData(model).facts.some((f) => /meet at every edge/.test(f)));
  model.edges.pop();
  model.interpretation = 'generalized-complex';
  assert.ok(!overviewData(model).facts.some((f) => /meet at every edge/.test(f)));
});
test('recorded cell inventory and vertex figure support plain language facts', () => {
  const model = {
    ...cube(),
    dimension: 4,
    metadata: { key: 'tesseract', cellTypes: [{ key: 'cube', count: 8 }], vertexFigureKey: 'tetrahedron' },
    cells: Array(8).fill([]),
  };
  const data = overviewData(model, { entries: [...entries, { key: 'tetrahedron', name: 'Tetrahedron' }] });
  assert.ok(data.facts.includes('Every cell is a cube.'));
  assert.ok(data.facts.includes('Around each vertex: Tetrahedron (vertex figure).'));
  model.metadata.cellTypes[0].count = 7;
  assert.ok(!overviewData(model, { entries }).facts.some((f) => /Every cell/.test(f)));
});
test('constructed models use their history label and omit inherited catalog relatives', () => {
  const data = overviewData(cube(), { entries, construction: { label: 'Cut corners', sourceName: 'Cube' } });
  assert.equal(data.description, 'Made with “Cut corners” from Cube.');
  assert.equal(data.family, 'Constructed model');
  assert.ok(!data.facts.some((f) => /dual/.test(f)));
});
test('unknown models have family, prism, antiprism, surface and generic fallbacks', () => {
  assert.match(describeModel({ ...cube(), metadata: { family: 'Johnson' } }), /regular polygon faces/);
  for (const [kind, word] of [
    ['prism', 'parallel'],
    ['antiprism', 'triangles'],
    ['duoprism', 'Cartesian product'],
    ['antiprism-prism', 'antiprism ends'],
  ])
    assert.match(describeModel({ ...cube(), metadata: { generatorFamily: { kind } } }), new RegExp(word));
  assert.match(describeModel({ ...cube(), metadata: {}, interpretation: 'surface-section' }), /slice/);
  assert.match(describeModel({ ...cube(), metadata: {}, interpretation: 'generalized-complex' }), /may intersect/);
  assert.match(describeModel({ ...cube(), metadata: {}, interpretation: 'unknown' }), /3D model/);
});
test('mounted overview updates after navigation, history and metadata edits; late types cannot publish', () => {
  const f = fixture();
  f.control.sync();
  assert.equal(f.document.getElementById('analysis-overview-vertices').textContent, '8');
  f.control.sync(f.state.model, {
    available: true,
    complete: true,
    closureVerified: true,
    orientation: 'all',
    groupOrder: 48,
  });
  assert.match(f.control.root.textContent, /Detected symmetry order 48/);
  const old = f.state,
    changed = {
      model: { ...cube(), name: 'Truncation of Cube', vertices: Array(24).fill([]) },
      view: {},
      label: 'Cut corners',
    };
  f.setState(changed, { cursor: 1, states: [old, changed] });
  f.control.sync();
  assert.match(f.control.root.textContent, /Made with “Cut corners” from Cube/);
  assert.doesNotMatch(f.control.root.textContent, /Detected symmetry order 48/);
  f.control.sync(old.model, {
    available: true,
    complete: true,
    closureVerified: true,
    orientation: 'all',
    groupOrder: 999,
  });
  assert.doesNotMatch(f.control.root.textContent, /999/);
  changed.view.documentMetadata = { title: 'My shape' };
  f.control.sync();
  assert.equal(f.document.getElementById('analysis-overview-name').textContent, 'My shape');
  f.setState(old);
  f.control.sync();
  assert.match(f.control.root.textContent, /Six squares/);
  assert.doesNotMatch(f.control.root.textContent, /Made with/);
  f.setState(null);
  f.control.sync();
  assert.equal(f.control.root.children.length, 0);
});
test('layout retains every control in reveal-compatible disclosures under a clear Details heading', () => {
  const f = fixture(),
    ids = [
      'element-types',
      'library-related',
      'information-panel',
      'polychoron-relationships',
      'generalized-density-controls',
      'density-section-controls',
      'selection-details',
    ];
  for (const id of ids) {
    const n = new Node(id === 'library-related' ? 'section' : 'details');
    n.id = id;
    f.root.append(n);
  }
  const analysis = f.document.getElementById('analysis'),
    table = f.document.getElementById('information-panel');
  orderAnalysisGroups(f.document);
  orderAnalysisGroups(f.document);
  assert.deepEqual(
    f.root.children.slice(0, 7).map((n) => n.id),
    [
      'analysis-overview',
      'element-types',
      'library-related',
      'analysis-details-heading',
      'analysis-measurements',
      'information-panel',
      'analysis-type-evidence',
    ]
  );
  assert.equal(analysis.parentElement.tagName, 'DETAILS');
  assert.equal(f.document.getElementById('information-panel'), table);
  for (const id of [
    'polychoron-relationships',
    'generalized-density-controls',
    'density-section-controls',
    'analysis-type-evidence',
  ])
    assert.equal(f.document.getElementById(id).getAttribute('data-expert'), '');
});
test('real element type render feeds the overview without a second native job', () => {
  const f = fixture(),
    previous = globalThis.document;
  globalThis.document = f.document;
  try {
    const control = new ElementTypeControls({
      getState: () => f.state,
      guard: (f) => f,
      onTypes: (m, t) => f.control.sync(m, t),
    });
    const type = { typeId: 0, count: 6, ids: [0, 1, 2, 3, 4, 5], description: 'quadrilateral' };
    control.render(f.state.model, {
      available: true,
      complete: true,
      closureVerified: true,
      orientation: 'all',
      groupOrder: 48,
      types: { vertex: [], edge: [], face: [type], cell: [] },
      componentCount: 1,
      transitivity: [],
      maxNormalizedVertexResidual: 1e-15,
      tolerance: 1e-8,
    });
    assert.match(f.control.root.textContent, /Detected symmetry order 48/);
    assert.equal(f.document.getElementById('element-type-face-0').parentElement.parentElement.tagName, 'DETAILS');
    assert.ok(control.panel.all().some((n) => n.getAttribute('data-expert') === ''));
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
test('numerical type evidence stays below Details and clears before the next source query', async () => {
  const f = fixture(),
    previous = globalThis.document;
  globalThis.document = f.document;
  try {
    let finish;
    const control = new ElementTypeControls({
      getState: () => f.state,
      guard: (f) => f,
      run: () => new Promise((resolve) => (finish = resolve)),
      getEvidencePanel: () => f.document.getElementById('analysis-type-evidence'),
    });
    orderAnalysisGroups(f.document);
    const evidence = f.document.getElementById('analysis-type-evidence');
    control.render(f.state.model, {
      available: true,
      complete: true,
      closureVerified: true,
      orientation: 'all',
      groupOrder: 48,
      types: { vertex: [], edge: [], face: [], cell: [] },
      componentCount: 1,
      transitivity: [],
      maxNormalizedVertexResidual: 1e-15,
      tolerance: 1e-8,
    });
    assert.match(evidence.textContent, /Full group order 48/);
    assert.doesNotMatch(control.panel.textContent, /Full group order/);
    const pending = control.refresh();
    assert.equal(evidence.children.length, 0);
    finish({ available: false, status: 'Unavailable: frame limit' });
    await pending;
    assert.equal(evidence.children.length, 0);
    assert.match(control.panel.textContent, /frame limit/);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
test('app mounts overview into analysis refresh and document title edits', () => {
  const app = readAppSource();
  matchSource(app, /new AnalysisOverview/);
  matchSource(app, /async function refreshAnalysis\(\)\{\s+analysisOverview.sync\(\)/);
  matchSource(app, /onTypes:\(model,result\)=>analysisOverview.sync\(model,result\)/);
  matchSource(app, /refresh:\(\)=>\{(?:ctx\.)?analysisOverview.sync\(\);(?:ctx\.)?renderTabs/);
});
test('smoke reveal enables expert presentation and opens only owning disclosures', async () => {
  const previous = globalThis.document,
    classes = new Set(),
    opened = [];
  globalThis.document = { body: { classList: { add: (name) => classes.add(name) } } };
  const group = (name, parent) => ({
    querySelector: () => ({ contains: () => false }),
    parentElement: parent ? { closest: () => parent } : null,
    get open() {
      return false;
    },
    set open(value) {
      if (value) opened.push(name);
    },
  });
  const outer = group('outer'),
    inner = group('inner', outer),
    element = { closest: (selector) => (selector === '[data-expert]' ? {} : inner) };
  const target = { evaluate: (fn) => fn(element) };
  try {
    assert.equal(await reveal(null, target), target);
    assert.deepEqual(opened, ['outer', 'inner']);
    assert.ok(classes.has('expert-mode'));
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
