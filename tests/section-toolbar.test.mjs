import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SectionToolbar,
  sliceAxisNormal,
  sliceBounds,
  defaultSlice,
  sliceEvaluationLabel,
} from '../ui/section-toolbar.mjs';
import { DerivedViewControls, DerivedWork } from '../ui/derived-view-controls.mjs';
import { buildCommandIndex, rankCommands } from '../ui/command-index.mjs';
import { numericControlFixture, deferred, flush } from './numeric-control-fixture.mjs';

function fixture() {
  const f = numericControlFixture(Object.prototype, {}),
    nodes = new Map(),
    work = new DerivedWork(),
    calls = [];
  Object.assign(f.state.view, { derivedMode: 'section', sectionNormal: [0, 0, 1], sectionOffset: 0 });
  const getInput = (id) => {
    if (!nodes.has(id)) nodes.set(id, { value: '', disabled: false });
    return nodes.get(id);
  };
  const context = {
    ...f.context,
    getInput,
    sliceDebounceMs: 90,
    getDerived: () => null,
    markDirty() {},
    invalidate: () => work.cancel(),
    refreshDerived: () => {
      const job = work.begin(),
        hold = deferred();
      calls.push({ job, hold, offset: f.state.view.sectionOffset });
      return hold.promise.finally(() => work.finish(job));
    },
  };
  const controls = new DerivedViewControls(context);
  controls.sync();
  return { ...f, context, controls, work, calls, getInput };
}

test('axis presets use intrinsic X/Y/Z/W normals and refuse unavailable dimensions', () => {
  for (const dimension of [3, 4])
    for (const [index, axis] of ['X', 'Y', 'Z', 'W'].slice(0, dimension).entries())
      assert.deepEqual(
        sliceAxisNormal(dimension, axis),
        Array.from({ length: dimension }, (_, i) => Number(i === index))
      );
  for (const [dimension, axis] of [
    [3, 'W'],
    [2, 'X'],
    [4, 'custom'],
  ])
    assert.throws(() => sliceAxisNormal(dimension, axis), /available/);
});
test('central defaults use the last intrinsic axis including translated sources', () => {
  for (const dimension of [3, 4]) {
    const model = { dimension, vertices: [Array(dimension).fill(2), Array(dimension).fill(6)] };
    const plane = defaultSlice(model);
    assert.deepEqual(plane.normal, sliceAxisNormal(dimension, dimension === 4 ? 'W' : 'Z'));
    assert.equal(plane.offset, 4);
    assert.deepEqual(sliceBounds(model, plane.normal), { min: 2, max: 6, center: 4, step: 0.008 });
  }
});
test('direct entry opens split section view, resets old fill settings and evaluates without changing source geometry', async () => {
  const f = fixture(),
    source = structuredClone(f.state.model),
    c = f.controls;
  Object.assign(f.state.view, { derivedMode: 'cell-section', densitySection: { enabled: true }, sectionAlignment: {} });
  let next;
  f.context.applyPlane = (value) => {
    next = value;
  };
  const toolbar = Object.assign(Object.create(SectionToolbar.prototype), {
    context: { controls: c },
    advanced: { open: true },
  });
  await toolbar.open();
  assert.equal(f.state.view.viewportLayout, 'split');
  assert.equal(f.state.view.derivedMode, 'section');
  assert.equal(f.state.view.sectionOffset, 0.5);
  assert.deepEqual(f.state.view.sectionNormal, [0, 0, 1]);
  assert.equal(f.state.view.densitySection.enabled, false);
  assert.equal(f.state.view.sectionAlignment, undefined);
  assert.equal(next, false);
  assert.equal(toolbar.advanced.open, false);
  assert.deepEqual(f.state.model, source);
});
test('slice, section and cross-section commands find the direct entry', () => {
  const index = buildCommandIndex({
    controls: [{ id: 'control:open-cross-section', label: 'Cross-section', path: 'Construct' }],
  });
  for (const query of ['slice', 'section', 'cross-section'])
    assert.equal(rankCommands(index, query)[0].id, 'control:open-cross-section');
});
test('slider debounces rapid inputs and cancels active native work before starting the newest slice', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  const first = f.controls.queueOffset('.2');
  t.mock.timers.tick(40);
  const second = f.controls.queueOffset('.3');
  await first;
  t.mock.timers.tick(89);
  assert.equal(f.calls.length, 0);
  t.mock.timers.tick(1);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].offset, 0.3);
  const third = f.controls.queueOffset('.5');
  assert.equal(f.calls[0].job.signal.aborted, true);
  assert.equal(f.getInput('section-depth').value, '0.5');
  t.mock.timers.tick(90);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].offset, 0.5);
  f.calls[0].hold.resolve();
  await second;
  assert.equal(f.work.active, f.calls[1].job);
  f.calls[1].hold.resolve();
  await third;
  assert.equal(f.controls.live, null);
});
test('queued sliders cannot evaluate after Cancel, document replacement or export ownership', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const reason of ['cancel', 'document', 'export']) {
    const f = fixture(),
      pending = f.controls.queueOffset('.4');
    if (reason === 'cancel') f.controls.cancelEvaluation();
    if (reason === 'document') f.setProject({ ...f.project });
    if (reason === 'export') {
      f.setExport(true);
      f.controls.onExportStateChange();
    }
    t.mock.timers.tick(500);
    await pending;
    await flush();
    assert.equal(f.calls.length, 0, reason);
    assert.equal(f.state.view.sectionOffset, 0);
  }
});

test('completion identifies the evaluated plane and keeps queued inputs visibly pending', () => {
  assert.equal(sliceEvaluationLabel([0, 0, 0, 2], 0.25), 'W axis at 0.25');
  assert.equal(sliceEvaluationLabel([-1, 0, 0], -0.5), 'Normal [-1, 0, 0] at -0.5');
  const toolbar = Object.assign(Object.create(SectionToolbar.prototype), {
    feedback: {},
    context: { controls: {} },
  });
  toolbar.complete({ normal: [1, 0, 0], offset: 0.25 });
  assert.equal(toolbar.feedback.textContent, 'Section updated · X axis at 0.25');
  toolbar.context.controls.timer = 1;
  toolbar.complete({ normal: [0, 0, 1], offset: 0.1 });
  assert.equal(toolbar.feedback.textContent, 'Updating…');
  toolbar.context.controls.timer = null;
  toolbar.context.controls.live = { offset: 0.4 };
  toolbar.complete({ normal: [0, 0, 1], offset: 0.1 });
  assert.equal(toolbar.feedback.textContent, 'Updating…');
  toolbar.context.controls.live = null;
  toolbar.complete({ normal: [0, 0, 1], offset: 4, status: 'empty' });
  assert.equal(toolbar.feedback.textContent, 'Section updated · Z axis at 4 · empty intersection.');
});

test('opening split sections refits both panes once, persists cameras and ignores abandoned layouts', () => {
  const s = { view: { viewportLayout: 'single', derivedMode: 'section' } },
    frames = [],
    calls = [],
    viewer = (name) => ({
      model: {},
      resize: () => calls.push(name + ' resize'),
      fit: () => {
        calls.push(name + ' fit');
        return name;
      },
    }),
    base = viewer('source'),
    derived = viewer('result'),
    toolbar = Object.assign(Object.create(SectionToolbar.prototype), {
      context: { getState: () => s, controls: {} },
      doc: { defaultView: { requestAnimationFrame: (fn) => frames.push(fn) } },
      feedback: {},
    });
  toolbar.refitLayout(base, derived);
  assert.equal(frames.length, 0);
  s.view.viewportLayout = 'split';
  toolbar.refitLayout(base, derived);
  frames.shift()();
  assert.deepEqual(calls, ['source resize', 'source fit', 'result resize', 'result fit']);
  assert.equal(s.view.camera, 'source');
  assert.equal(s.view.derivedCamera, 'result');
  toolbar.refitLayout();
  assert.equal(frames.length, 0);
  toolbar.complete({ normal: [0, 0, 1], offset: 0 });
  assert.equal(toolbar.fitResult, false);
  s.view.viewportLayout = 'single';
  toolbar.refitLayout();
  s.view.viewportLayout = 'split';
  toolbar.refitLayout();
  s.view.viewportLayout = 'single';
  const before = calls.length;
  frames.shift()();
  assert.equal(calls.length, before);
});

test('a document restored already in split sections keeps its saved cameras, and later states never refit', () => {
  const documentA = {},
    first = { view: { viewportLayout: 'split', derivedMode: 'section', camera: 'saved' } },
    frames = [],
    calls = [],
    viewer = (name) => ({
      model: {},
      resize: () => calls.push(name + ' resize'),
      fit: () => calls.push(name + ' fit'),
    });
  let current = first;
  const toolbar = Object.assign(Object.create(SectionToolbar.prototype), {
    context: { getState: () => current, getDocument: () => documentA, controls: {} },
    doc: { defaultView: { requestAnimationFrame: (fn) => frames.push(fn) } },
    feedback: {},
  });
  toolbar.refitLayout(viewer('source'), viewer('result'));
  current = { view: { ...first.view } };
  toolbar.refitLayout();
  assert.equal(frames.length, 0);
  assert.deepEqual(calls, []);
  assert.equal(first.view.camera, 'saved');
});
