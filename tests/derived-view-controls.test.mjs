import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DerivedViewControls,
  DerivedWork,
  derivedEntityDomain,
  derivedEntityIndex,
  derivedInputKey,
} from '../ui/derived-view-controls.mjs';
import { numericControlFixture, deferred } from './numeric-control-fixture.mjs';
function fixture(mode = 'section') {
  const f = numericControlFixture(Object.prototype, {});
  Object.assign(f.state.view, { derivedMode: mode, sectionNormal: [0, 0, 1], sectionOffset: 0, entity: 1 });
  let derived = { id: 'current-derived' };
  const calls = [],
    nodes = new Map(),
    getInput = (id) => {
      if (!nodes.has(id)) nodes.set(id, { value: '', disabled: false });
      return nodes.get(id);
    };
  const context = {
    ...f.context,
    getInput,
    getDerived: () => derived,
    markDirty: () => calls.push('dirty'),
    invalidate: () => {
      derived = null;
      calls.push('invalidate');
    },
    refreshDerived: () => calls.push('refresh'),
    syncViewport: () => calls.push('viewport'),
    applyPlane: (next) => calls.push(['plane', next]),
    promote: () => calls.push('promote'),
  };
  const controls = new DerivedViewControls(context);
  controls.restoreInputs();
  controls.sync();
  return { ...f, context, controls, calls, nodes, getInput };
}

test('new derived work cancels the previous job without canceling its export owner', () => {
  const work = new DerivedWork(),
    parent = new AbortController(),
    first = work.begin(parent.signal),
    second = work.begin();
  assert.equal(first.signal.aborted, true);
  assert.equal(parent.signal.aborted, false);
  work.finish(first);
  assert.equal(work.active, second);
  assert.equal(second.signal.aborted, false);
  work.cancel();
  assert.equal(second.signal.aborted, true);
  assert.equal(work.active, null);
});

test('derived work follows parent cancellation and detaches completed requests', () => {
  const work = new DerivedWork(),
    parent = new AbortController(),
    first = work.begin(parent.signal);
  work.finish(first);
  parent.abort();
  assert.equal(first.signal.aborted, false);
  const second = work.begin(parent.signal);
  assert.equal(second.signal.aborted, true);
  const freshParent = new AbortController(),
    third = work.begin(freshParent.signal);
  freshParent.abort();
  assert.equal(third.signal.aborted, true);
  work.finish(third);
  assert.equal(work.active, null);
});
test('entity domains match the selected intrinsic view and literal IDs reject coercion', () => {
  const f = fixture();
  assert.deepEqual(derivedEntityDomain(f.state.model, 'cell'), { kind: 'face', count: 4 });
  f.state.model.dimension = 4;
  f.state.model.cells = [[0, 1, 2, 3]];
  assert.deepEqual(derivedEntityDomain(f.state.model, 'cell'), { kind: 'cell', count: 1 });
  assert.deepEqual(derivedEntityDomain(f.state.model, 'face'), { kind: 'face', count: 4 });
  assert.deepEqual(derivedEntityDomain(f.state.model, 'vertex-figure'), { kind: 'vertex', count: 4 });
  assert.equal(derivedEntityDomain(f.state.model, 'section'), null);
  assert.equal(derivedEntityIndex(' 1 ', 4), 1);
  for (const v of ['', ' ', '1/2', '1e0', '0x1', '-1', '1.5', '4', '9007199254740993'])
    assert.throws(() => derivedEntityIndex(v, 4), /literal/);
  assert.throws(() => derivedEntityIndex('0', 0), /no available/);
});
test('invalid entity edits restore the displayed applied index and leave source/view/derived result intact', () => {
  const f = fixture('cell'),
    before = structuredClone(f.state);
  for (const value of ['', '1/2', '99', '-1']) {
    f.getInput('entity-id').value = value;
    assert.throws(() => f.controls.setEntity(value));
    assert.equal(f.getInput('entity-id').value, '1');
    assert.deepEqual(f.state, before);
    assert.deepEqual(f.calls, []);
    assert.equal(f.getInput('promote').disabled, false);
  }
  f.controls.setEntity('2');
  assert.equal(f.state.view.entity, 2);
  assert.equal(f.getInput('promote').disabled, true);
  assert.deepEqual(f.calls, ['invalidate', 'dirty', 'viewport', 'refresh']);
});
test('mode changes choose a valid shared entity index and retain every existing derived mode', () => {
  const f = fixture('vertex-figure');
  f.state.view.entity = 3;
  f.state.model.dimension = 4;
  f.state.model.cells = [[0, 1, 2, 3]];
  f.controls.setMode('cell');
  assert.equal(f.state.view.entity, 0);
  assert.equal(f.getInput('derived-entity-label').textContent, 'Cell index');
  assert.equal(f.getInput('entity-id').max, '0');
  assert.match(f.getInput('derived-input-note').textContent, /0 to 0/);
  for (const mode of [
    'section',
    'cell-section',
    'dual',
    'incidence-dual',
    'vertex-figure',
    'cell',
    'face',
    'net',
    'cell-net',
    'stellation',
    'section-evidence',
  ]) {
    f.controls.setMode(mode);
    assert.equal(f.state.view.derivedMode, mode);
  }
  const before = structuredClone(f.state);
  assert.throws(() => f.controls.setMode('unsupported'));
  assert.deepEqual(f.state, before);
});
test('animation ownership locks every derived control and refuses queued events before any mutation', () => {
  const f = fixture(),
    before = structuredClone(f.state);
  f.setExport(true);
  f.controls.onExportStateChange();
  for (const id of [
    'derived-mode',
    'section-normal',
    'section-depth',
    'section-offset',
    'apply-section',
    'section-events',
    'entity-id',
    'promote',
  ])
    assert.equal(f.getInput(id).disabled, true, id);
  for (const action of [
    () => f.controls.setMode('cell'),
    () => f.controls.setEntity('2'),
    () => f.controls.setOffset('.25'),
    () => f.controls.apply(false),
    () => f.controls.apply(true),
    () => f.controls.promote(),
  ])
    assert.throws(action, /export/);
  assert.deepEqual(f.state, before);
  assert.deepEqual(f.calls, []);
  f.setExport(false);
  f.controls.onExportStateChange();
  assert.equal(f.getInput('derived-mode').disabled, false);
  assert.equal(f.getInput('promote').disabled, false);
});
test('section request identity tracks relevant intrinsic parameters and ignores camera motion', () => {
  const f = fixture(),
    key = derivedInputKey(f.state.view);
  f.state.view.angles[2] = 30;
  f.state.view.camera = { zoom: 3 };
  assert.equal(derivedInputKey(f.state.view), key);
  for (const mutate of [
    (v) => (v.sectionOffset = 0.25),
    (v) => (v.sectionNormal = [1, 0, 0]),
    (v) => (v.fillRule = 'even-odd'),
    (v) => (v.derivedMode = 'cell-section'),
  ]) {
    const v = structuredClone(f.state.view);
    mutate(v);
    assert.notEqual(derivedInputKey(v), key);
  }
  f.state.view.derivedMode = 'cell';
  const cell = derivedInputKey(f.state.view);
  f.state.view.entity++;
  assert.notEqual(derivedInputKey(f.state.view), cell);
});
test('manual evaluation locks promotion/selection through its await and restores availability on success or failure', async () => {
  for (const fail of [false, true]) {
    const f = fixture(),
      hold = deferred(),
      before = structuredClone(f.state),
      changes = [];
    f.context.applyPlane = () => hold.promise;
    f.context.onAvailabilityChange = () => changes.push(Boolean(f.controls.pending));
    f.getInput('section-normal').value = '0, 0, sqrt(4)';
    const pending = f.controls.apply(false);
    for (const id of [
      'derived-mode',
      'section-normal',
      'section-depth',
      'section-offset',
      'apply-section',
      'section-events',
      'entity-id',
      'promote',
    ])
      assert.equal(f.getInput(id).disabled, true, id);
    for (const action of [
      () => f.controls.promote(),
      () => f.controls.setMode('cell'),
      () => f.controls.setEntity('2'),
      () => f.controls.setOffset('.5'),
      () => f.controls.apply(true),
    ])
      assert.throws(action, /plane evaluation/);
    assert.equal(f.getInput('section-normal').value, '0, 0, sqrt(4)');
    assert.deepEqual(f.state, before);
    if (fail) {
      hold.reject(Error('Native expression refusal'));
      await assert.rejects(pending, /refusal/);
    } else {
      hold.resolve();
      await pending;
    }
    assert.equal(f.controls.pending, null);
    assert.equal(f.getInput('promote').disabled, false);
    assert.deepEqual(changes, [true, false]);
    assert.equal(f.getInput('section-normal').value, '0, 0, sqrt(4)');
    assert.deepEqual(f.state, before);
  }
});
test('animation export preserves unapplied plane expressions only for their original applied source/plane/units', () => {
  const f = fixture();
  f.getInput('section-normal').value = '0, 0, sqrt(4)';
  f.getInput('section-depth').value = '1/2';
  f.setExport(true);
  f.controls.onExportStateChange();
  f.getInput('section-depth').value = 'queued changed draft';
  f.controls.onExportStateChange();
  f.state.view = structuredClone(f.state.view);
  f.setExport(false);
  f.controls.onExportStateChange();
  assert.equal(f.getInput('section-normal').value, '0, 0, sqrt(4)');
  assert.equal(f.getInput('section-depth').value, '1/2');
  assert.equal(f.state.view.sectionOffset, 0);
  f.setExport(true);
  f.controls.onExportStateChange();
  f.state.view.sectionOffset = 0.25;
  f.setExport(false);
  f.controls.onExportStateChange();
  assert.equal(f.getInput('section-depth').value, '0.25');
  f.getInput('section-depth').value = '1/3';
  f.setExport(true);
  f.controls.onExportStateChange();
  f.state.view.coordinateUnit = 'cm';
  f.setExport(false);
  f.controls.onExportStateChange();
  assert.equal(f.getInput('section-depth').value, '0.25');
});
test('source changes cancel manual preparation and do not carry its pending state into another document', async () => {
  const f = fixture(),
    hold = deferred();
  let canceled = 0;
  f.context.applyPlane = () => hold.promise;
  f.context.cancelPlane = () => {
    canceled++;
    hold.reject(Error('Canceled plane'));
  };
  const pending = f.controls.apply(false);
  const next = structuredClone(f.state);
  f.setProject({ active: 0, documents: [{ id: 'other', cursor: 0, states: [next] }] });
  f.controls.sync();
  await assert.rejects(pending, /Canceled/);
  assert.equal(canceled, 1);
  assert.equal(f.controls.pending, null);
});
test('live depth evaluates at once, coalesces drags to the newest depth and stops for superseded/source/export work', async () => {
  const f = fixture();
  let holds = [];
  f.context.refreshDerived = () => {
    f.calls.push('refresh');
    const hold = deferred();
    holds.push(hold);
    return hold.promise;
  };
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  const release = async () => {
    const hold = holds.shift();
    hold.resolve();
    await settle();
  };
  f.controls.setOffset('.25');
  assert.equal(f.state.view.sectionOffset, 0.25);
  assert.equal(f.getInput('promote').disabled, true);
  assert.equal(f.getInput('section-depth').value, '0.25');
  assert.throws(() => f.controls.promote(), /current/);
  assert.equal(f.calls.filter((x) => x === 'refresh').length, 1);
  // Drag while the first plane evaluates: depth display follows, state commits only at job boundaries.
  f.controls.setOffset('.3');
  f.controls.setOffset('.5');
  assert.equal(f.state.view.sectionOffset, 0.25);
  assert.equal(f.getInput('section-depth').value, '0.5');
  assert.equal(f.calls.filter((x) => x === 'refresh').length, 1);
  await release();
  assert.equal(f.state.view.sectionOffset, 0.5);
  assert.equal(f.calls.filter((x) => x === 'refresh').length, 2);
  await release();
  assert.equal(f.calls.filter((x) => x === 'refresh').length, 2);
  assert.equal(f.controls.live, null);
  f.calls.length = 0;
  f.controls.setOffset('.6');
  f.controls.setOffset('.65');
  f.setExport(true);
  f.controls.onExportStateChange();
  await release();
  assert.equal(f.calls.filter((x) => x === 'refresh').length, 1);
  assert.equal(f.state.view.sectionOffset, 0.6);
  f.setExport(false);
  f.controls.onExportStateChange();
  f.calls.length = 0;
  f.controls.setOffset('.7');
  f.controls.setOffset('.75');
  f.setProject({ ...f.project });
  await release();
  assert.equal(f.calls.filter((x) => x === 'refresh').length, 1);
  f.calls.length = 0;
  f.controls.setOffset('.8');
  f.controls.setOffset('.85');
  f.controls.setMode('cell');
  await release();
  await release();
  assert.equal(f.calls.filter((x) => x === 'refresh').length, 2);
  assert.equal(f.state.view.sectionOffset, 0.8);
});
