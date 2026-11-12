import test from 'node:test';
import assert from 'node:assert/strict';
import { assemblyParts, assemblySheets, numberNetSvg, pieceColor } from '../ui/net-assembly.mjs';
import { NetAssemblyControls } from '../ui/net-assembly-controls.mjs';
import { NetExportSession } from '../ui/net-export-session.mjs';
import { NetEditor } from '../ui/net-editor.js';
import { numericControlFixture, deferred, flush } from './numeric-control-fixture.mjs';

const thumbnail = 'data:image/png;base64,iVBORw0KGgo=';
const net = {
  referenceEdgeLengthMm: 25,
  components: [
    { root: 3, faces: [3] },
    { root: 0, faces: [0, 1, 2] },
  ],
  faces: [{}, {}, {}, {}],
  printSource: {
    metadata: {
      offColors: {
        faces: [{ encoding: 'byte', values: [255, 0, 0] }, null, null, { encoding: 'unit', values: [0, 0, 1] }],
      },
    },
  },
};
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm"><text data-piece-number="1" fill="#243942">P1</text></svg>';

test('parts list keeps contiguous stable piece IDs, literal face IDs and source colors', () => {
  const parts = assemblyParts(net);
  assert.deepEqual(
    parts.map((p) => [p.number, p.root, p.faces]),
    [
      [1, 0, [0, 1, 2]],
      [2, 3, [3]],
    ]
  );
  assert.deepEqual(parts[0].colors, ['#ff0000', 'Uncolored']);
  assert.equal(pieceColor(parts[1]), '#0000ff');
  const pages = { pages: [{ parts: [{ component: 3, pieceNumber: 6, faceIds: [3] }] }] };
  assert.equal(assemblyParts(net, pages)[0].number, 6);
  assert.match(numberNetSvg(svg, parts, 'source'), /fill="#ff0000"/);
  assert.match(numberNetSvg(svg, parts, 'piece'), /fill="#176b79"/);
  assert.throws(() => pieceColor(parts[0], 'invalid'), /Choose/);
});

test('assembly SVG contains a captured thumbnail, parts, fold styles, matching convention, safe text and pagination', () => {
  const sheets = assemblySheets(net, { thumbnail, title: 'A <model> & "color"' });
  assert.equal(sheets.length, 1);
  const sheet = sheets[0];
  assert.match(sheet, /^<svg.*width="210mm" height="297mm"/);
  assert.match(sheet, /data-assembly-sheet="true"/);
  assert.match(sheet, /data-finished-model="true"/);
  assert.ok(sheet.includes(`href="${thumbnail}"`));
  assert.match(sheet, /data-assembly-part="P1"/);
  assert.match(sheet, /F0, F1, F2/);
  assert.match(sheet, /fill="#ff0000"/);
  assert.match(sheet, /stroke-dasharray="1.5 1"/);
  assert.match(sheet, /stroke-dasharray="3 .8 .5 .8"/);
  assert.match(sheet, /Score first/);
  assert.match(sheet, /identical E labels/);
  assert.match(sheet, /A &lt;model&gt; &amp; &quot;color&quot;/);
  const many = {
    ...net,
    components: Array.from({ length: 80 }, (_, root) => ({ root, faces: [root] })),
    faces: Array(80).fill({}),
  };
  const all = assemblySheets(many, { thumbnail });
  assert.ok(all.length > 1);
  assert.equal(all.join('').match(/data-assembly-part=/g).length, 80);
  assert.throws(() => assemblySheets(net, { thumbnail: 'https://invalid/image.png' }), /captured PNG/);
});

function fixture() {
  const f = numericControlFixture(Object.prototype, {}),
    calls = [];
  f.state.model.fingerprint = 'source-fingerprint';
  f.state.view.net = { root: 0, length: 25, tabs: true, display: 'layout' };
  f.state.view.netAssembly = { include: true, color: 'piece' };
  f.state.netLayout = {
    ...structuredClone(net),
    sourceId: f.state.model.id,
    sourceFingerprint: f.state.model.fingerprint,
    root: 0,
    tabs: true,
    svg,
    printSource: { metadata: structuredClone(f.state.model.metadata) },
  };
  f.state.netPages = {
    pages: [
      {
        svg,
        parts: [
          { component: 0, pieceNumber: 1, faceIds: [0, 1, 2] },
          { component: 3, pieceNumber: 2, faceIds: [3] },
        ],
      },
    ],
  };
  const viewer = {
    model: f.state.model,
    view: {},
    controls: { enabled: true, enableDamping: true, update() {} },
    cameraState: () => ({ zoom: 1 }),
    prepareCapture: async (options) => {
      assert.equal(options.isCurrent(), true);
      calls.push(['prepare']);
    },
    image: () => {
      calls.push(['image']);
      return thumbnail;
    },
  };
  f.context.assemblyViewer = viewer;
  f.context.api = {
    beginTextExport: async () => {
      calls.push(['begin']);
      return { id: 'export' };
    },
    abortTextExport: async (id) => calls.push(['abort', id]),
    renderPackedNetPdf: async (pages) => {
      calls.push(['pdf', pages]);
      return new Uint8Array([1]);
    },
    writeTextExport: async (id, data) => {
      calls.push(['write', data]);
      return { path: 'chosen' };
    },
  };
  return { ...f, calls, viewer, session: new NetExportSession(f.context) };
}

test('optional PDF assembly appends to reviewed packed pages; standalone SVG uses bounded export', async () => {
  const f = fixture();
  await f.session.run('pdf', { packed: true });
  const pages = f.calls.find((c) => c[0] === 'pdf')[1];
  assert.equal(pages.length, 2);
  assert.match(pages[0], /P1/);
  assert.match(pages[1], /data-assembly-sheet/);
  assert.equal(f.viewer.controls.enabled, true);
  assert.equal(f.viewer.controls.enableDamping, true);
  assert.equal(f.session.busy, false);
  f.calls.length = 0;
  await f.session.run('svg', { assemblyOnly: true });
  assert.equal(
    f.calls.some((c) => c[0] === 'pdf'),
    false
  );
  assert.match(f.calls.find((c) => c[0] === 'write')[1], /data-assembly-sheet/);
});

test('late camera, source, assembly preference and cancellation changes refuse thumbnail publication', async () => {
  for (const change of [
    (f) => (f.viewer.cameraState = () => ({ zoom: 2 })),
    (f) => (f.state.model.vertices[0][0] = 3),
    (f) => (f.state.view.netAssembly.color = 'black'),
    (f) => f.session.cancel(),
  ]) {
    const f = fixture(),
      gate = deferred();
    f.viewer.prepareCapture = () => gate.promise;
    const job = f.session.run('pdf', { packed: true });
    await flush();
    change(f);
    gate.resolve();
    await assert.rejects(job, /changed|canceled/);
    assert.equal(
      f.calls.some((c) => c[0] === 'begin'),
      false
    );
    assert.equal(f.viewer.controls.enabled, true);
    assert.equal(f.session.busy, false);
  }
});

test('a stale or deformed main-view model cannot be used as the finished assembly thumbnail', async () => {
  const f = fixture();
  f.viewer.model = { ...f.state.model };
  await assert.rejects(f.session.run('pdf', { packed: true }), /finished source model/);
  assert.deepEqual(f.calls, []);
  assert.equal(f.session.busy, false);
});

test('rearrange action mounts, dispatches an ordinary net edit, and print preferences persist', async () => {
  const nodes = {
      'net-rebuild': {
        after(node) {
          nodes[node.id] = node;
        },
      },
    },
    state = { view: { netAssembly: { include: true, color: 'piece' } }, netLayout: {} },
    calls = [];
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      set innerHTML(text) {
        for (const match of text.matchAll(/id="([^"]+)"/g)) nodes[match[1]] = {};
      },
    }),
  };
  try {
    const editor = {
      $: (id) => nodes[id],
      guard: (fn) => fn,
      getState: () => state,
      config: () => ({ display: 'layout' }),
      requireEditable() {},
      edit: (...args) => calls.push(args),
      export: (...args) => calls.push(args),
      markDirty: () => calls.push('dirty'),
      show: () => calls.push('show'),
    };
    const controls = new NetAssemblyControls(editor, {}, { append() {} });
    controls.sync();
    nodes['net-rearrange'].onclick();
    assert.deepEqual(calls[0], ['arrange-pieces', {}]);
    assert.equal(nodes['net-assembly-include'].checked, true);
    assert.equal(nodes['net-piece-color'].value, 'piece');
    nodes['net-piece-color'].value = 'black';
    nodes['net-piece-color'].onchange();
    assert.deepEqual(state.view.netAssembly, { include: true, color: 'black' });
    nodes['net-assembly-svg'].onclick();
    assert.deepEqual(calls.at(-1), ['svg', { assemblyOnly: true, packed: false }]);
  } finally {
    globalThis.document = previous;
  }
});

test('rearrange publishes through the existing net history and clears old packed pages', async () => {
  const f = numericControlFixture(Object.prototype, {});
  f.state.netLayout = { faces: [], components: [] };
  f.state.netPages = { old: true };
  const result = {
    sourceFingerprint: 'source',
    root: 0,
    referenceEdgeLengthMm: 25,
    tabs: true,
    hinges: [0],
    placements: [{ root: 0, angle: 30, translation: [7, 9] }],
  };
  const editor = Object.assign(Object.create(NetEditor.prototype), f.context, {
    context: f.context,
    getModel: () => f.state.model,
    sequence: 0,
    run: async (op, params) => {
      assert.equal(op, 'net-edit');
      assert.equal(params.action, 'arrange-pieces');
      return result;
    },
    activate() {},
    markDirty() {},
    refresh() {},
  });
  await editor.edit('arrange-pieces', {});
  assert.strictEqual(f.state.netLayout, result);
  assert.equal(f.state.netPages, null);
  assert.equal(f.state.netHistory.cursor, 0);
  assert.deepEqual(f.state.netHistory.states[0].placements, result.placements);
});
