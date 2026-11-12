import test from 'node:test';
import assert from 'node:assert/strict';
import { NetEditor } from '../ui/net-editor.js';
import { CellNetEditor } from '../ui/cell-net-editor.js';
import { numericControlFixture } from './numeric-control-fixture.mjs';

function fixture(cell = false) {
  const f = numericControlFixture(Object.prototype, {}),
    nodes = new Map();
  f.state.model.fingerprint = 'source-fp';
  f.state.view.net = { root: 0, length: 25, tabs: true, page: 1, component: 0, display: 'pages' };
  f.state.view.cellNet = { root: 0, shrink: 1, component: 0 };
  f.state.model.cells = [[0, 1, 2, 3]];
  f.state.netLayout = {
    sourceFingerprint: 'source-fp',
    root: 0,
    referenceEdgeLengthMm: 25,
    tabs: true,
    printSource: { metadata: structuredClone(f.state.model.metadata) },
    components: [{ root: 0 }],
  };
  f.state.cellNetLayout = { sourceFingerprint: 'source-fp', components: [{ root: 0 }] };
  f.state.netPages = { pageCount: 3 };
  f.state.netHistory = { cursor: 1, states: [{}, {}] };
  f.state.cellNetHistory = { cursor: 1, states: [{}, {}] };
  const calls = [],
    editor = Object.assign(Object.create(cell ? CellNetEditor.prototype : NetEditor.prototype), {
      context: f.context,
      guard: (fn) => fn,
      getState: () => f.state,
      getModel: () => f.state.model,
      $: (id) => {
        if (!nodes.has(id)) nodes.set(id, {});
        return nodes.get(id);
      },
      markDirty: () => calls.push('dirty'),
      activate: () => calls.push('activate'),
      refresh: () => calls.push('refresh'),
      highlight: () => calls.push('highlight'),
      viewer: { setFold: () => calls.push('fold') },
    });
  return { ...f, editor, calls, nodes };
}
test('export notifications disable net controls and stop pending drag/fold without altering saved view', () => {
  const f = fixture(),
    before = structuredClone(f.state),
    removed = [];
  f.editor.playing = true;
  f.editor.drag = { group: { removeAttribute: (name) => removed.push(name) } };
  f.editor.updateActions();
  assert.equal(f.nodes.get('net-display').disabled, false);
  assert.equal(f.nodes.get('net-page-next').disabled, false);
  f.setExport(true);
  f.editor.onExportStateChange();
  assert.equal(f.editor.playing, false);
  assert.equal(f.editor.drag, null);
  assert.deepEqual(removed, ['transform']);
  for (const id of [
    'net-display',
    'net-action',
    'net-component',
    'net-rebuild',
    'net-separate',
    'net-root',
    'net-length',
    'net-tabs',
    'net-play',
    'net-fold',
    'net-page-prev',
    'net-page-next',
    'net-export-svg',
  ])
    assert.equal(f.nodes.get(id).disabled, true, id);
  f.editor.tick(1);
  assert.deepEqual(f.state, before);
  assert.deepEqual(f.calls, []);
  f.setExport(false);
  f.editor.onExportStateChange();
  assert.equal(f.nodes.get('net-display').disabled, false);
  assert.equal(f.nodes.get('net-page-prev').disabled, false);
});
test('direct display/action/component/page handlers refuse export-time changes before mutation', () => {
  const f = fixture();
  f.setExport(true);
  const before = structuredClone(f.state);
  for (const action of [
    () => f.editor.setDisplay('fold'),
    () => f.editor.setAction('edge'),
    () => f.editor.selectComponent(0),
    () => f.editor.changePage(1),
    () => f.editor.fold(0.5),
    () => f.editor.toggleFold(),
  ])
    assert.throws(action, /export/);
  assert.deepEqual(f.state, before);
  assert.deepEqual(f.calls, []);
  f.setExport(false);
  for (const action of [
    () => f.editor.setDisplay('unknown'),
    () => f.editor.setAction('unknown'),
    () => f.editor.selectComponent(99),
    () => f.editor.changePage(NaN),
  ])
    assert.throws(action);
  assert.deepEqual(f.state, before);
  f.editor.setAction('tabs');
  assert.equal(f.state.view.net.action, 'tabs');
});
test('disabled cell selection/component handlers preserve selection and layout during export', () => {
  const f = fixture(true);
  f.setExport(true);
  const before = structuredClone(f.state);
  f.editor.updateActions();
  for (const id of [
    'cell-net-build',
    'cell-net-separate',
    'cell-net-root',
    'cell-net-match',
    'cell-net-component',
    'cell-net-shrink',
  ])
    assert.equal(f.nodes.get(id).disabled, true, id);
  for (const action of [
    () => f.editor.select('face', 0),
    () => f.editor.select('vertex', 0),
    () => f.editor.selectComponent(0),
    () => f.editor.shrink(0.8),
  ])
    assert.throws(action, /export/);
  assert.deepEqual(f.state, before);
  assert.deepEqual(f.calls, []);
  f.setExport(false);
  f.editor.updateActions();
  assert.equal(f.nodes.get('cell-net-match').disabled, false);
});
test('SVG pointer start is ignored during animation export before selection or drag state changes', () => {
  const f = fixture(),
    svg = {};
  f.setExport(true);
  f.editor.attach(svg);
  const before = structuredClone(f.state);
  svg.onpointerdown({
    target: {
      closest() {
        throw Error('Must not inspect a selection');
      },
    },
  });
  assert.equal(f.editor.drag, undefined);
  assert.deepEqual(f.state, before);
});
