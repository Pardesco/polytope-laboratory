import { readAppSource } from './helpers/app-source.mjs';
import { isHyperbolic } from '../ui/hyperbolic-document.mjs';
import { matchSource, sourceRange, sourceFunction, sourceAssignment } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DerivedViewControls, DerivedWork, derivedInputKey, derivedEntityIndex } from '../ui/derived-view-controls.mjs';
import { GeometryExportSession } from '../ui/geometry-export-session.mjs';
import { MemoryControls } from '../ui/memory-controls.mjs';
import { densitySectionParameters, densitySectionDisplay } from '../ui/density-section-controls.mjs';

const app = readAppSource();
const sources = JSON.parse(
  await readFile(new URL('./fixtures/element-content-native-cases.json', import.meta.url), 'utf8')
);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture() {
  const native = [],
    content = [],
    nodes = new Map(),
    calls = { memory: [], promote: [], exportPrepare: 0, exportRefresh: 0 };
  const get = (id) => {
    if (!nodes.has(id))
      nodes.set(id, { value: '', textContent: '', dataset: {}, disabled: false, replaceChildren() {} });
    return nodes.get(id);
  };
  const state = {
    model: structuredClone(sources.fourD.source),
    notes: 'Keep notes',
    view: {
      angles: [0, 0, 0, 0, 0, 0],
      derivedMode: 'cell-section',
      sectionNormal: [0, 0, 0, 1],
      sectionOffset: 0,
      coordinateUnit: 'model',
    },
  };
  const project = { active: 0, documents: [{ id: 'derived-source', cursor: 0, states: [state] }] };
  const scope = {
    isHyperbolic,
    project,
    imageCapture: null,
    derivedSequence: 0,
    derivedModel: null,
    derivedResult: null,
    net: null,
    derivedWork: new DerivedWork(),
    nativeJobs: { pending: new Map() },
    derivedInputKey,
    derivedEntityIndex,
    $: get,
    format: String,
    el: (_tag, text) => ({ textContent: text }),
    densitySectionParameters,
    densitySectionDisplay,
    densitySectionControls: {
      sync() {},
      showFailure() {
        scope.densityLegend = null;
      },
      show(result) {
        scope.densityLegend = result?.densityLegend ?? null;
      },
    },
    state: () => project.documents[project.active].states[project.documents[project.active].cursor],
    derived: {
      model: null,
      setSectionModel(model) {
        this.model = model;
      },
      setModel(model) {
        this.model = model;
      },
      restoreCamera() {},
      setDisplay() {},
      clear() {
        this.model = null;
      },
    },
    rememberSectionSource() {},
    hasEmptySectionSource: () => false,
    viewportControls: { sync() {} },
    elementContent: {
      refresh: (_viewer, options) => {
        const work = deferred();
        content.push({ ...work, options });
        return work.promise;
      },
    },
    ordinaryCellSections: {
      evaluate: (params, options) => {
        const work = deferred();
        native.push({ ...work, params, options });
        return work.promise;
      },
    },
    netEditor: {},
    cellNetEditor: {},
    stellation: {},
  };
  scope.model = () => scope.state().model;
  scope.run = (op, params, model, label, options) => {
    const work = deferred();
    native.push({ ...work, op, params, model, label, options });
    return work.promise;
  };
  scope.densitySections = {
    evaluate: (options) =>
      scope.run('section', densitySectionParameters(scope.state().view), scope.model(), 'Filled section', options),
  };
  const code =
    [
      'availableDerivedModel',
      'derivedStateSnapshot',
      'promoteDerivedView',
      'syncCancelAvailability',
      'cancelDerivedPresentation',
      'derivedAvailabilityChanged',
    ]
      .map((name) => sourceFunction(app, name))
      .join('\n') + sourceRange(app, 'refreshDerived', 'selectEntity');
  Object.assign(
    scope,
    new Function(
      'scope',
      `const ctx=scope;with(scope){${code}\nreturn {availableDerivedModel,refreshDerived,derivedAvailabilityChanged,syncCancelAvailability,cancelDerivedPresentation};}`
    )(scope)
  );
  scope.derivedControls = new DerivedViewControls({
    getState: scope.state,
    getInput: get,
    getDerived: () => scope.derivedModel,
    guard: (fn) => fn,
    isExporting: () => false,
    markDirty() {},
    invalidate() {},
    promote: () => calls.promote.push(scope.derivedModel),
  });
  scope.derivedControls.restoreInputs();
  scope.derivedControls.sync();
  scope.derivedControls.context.onAvailabilityChange = () => scope.derivedAvailabilityChanged?.();
  scope.derivedControls.context.onActivityChange = () => scope.syncCancelAvailability();
  scope.derivedControls.context.refreshDerived = () => scope.refreshDerived();
  const memory = Object.assign(Object.create(MemoryControls.prototype), {
    busy: false,
    nodes: { slot: { value: '1' }, source: { value: 'derived' } },
    sync: () => calls.memory.push(scope.availableDerivedModel()),
  });
  memory.context = {
    getProject: () => project,
    getState: scope.state,
    isExporting: () => false,
    getSource: () => ({ documentId: 'derived-source' }),
    getDerivedState: () =>
      scope.availableDerivedModel()
        ? { model: scope.derivedModel, view: { angles: [0, 0, 0, 0, 0, 0] }, notes: 'Derived memory' }
        : null,
    markDirty() {},
    setStatus() {},
  };
  scope.memories = memory;
  const session = new GeometryExportSession({
    getProject: () => project,
    getDocument: () => project.documents[project.active],
    getState: scope.state,
    isExporting: () => false,
    getGeometry: () => (scope.exportControls.source.value === 'base' ? scope.model() : scope.availableDerivedModel()),
    getSelection: () => ({ source: scope.exportControls.source.value, format: 'json', unit: 'model' }),
    describe: async () => ({ formats: [{ format: 'json', available: true }] }),
    prepare: async () => {
      calls.exportPrepare++;
      return { text: 'current derived bytes', report: { losses: [], sourceUnit: 'model', targetUnit: 'model' } };
    },
  });
  scope.exportControls = {
    dialog: { open: true },
    source: { value: 'derived', options: [{}, {}] },
    preview: get('export-preview'),
    session,
    sync() {},
    refresh: async () => {
      calls.exportRefresh++;
      try {
        return await session.prepare();
      } catch (error) {
        get('export-preview').textContent = error.message;
        return null;
      }
    },
  };
  const result = (name = 'Current', surface = false) => ({
    status: 'full-dimensional',
    model: { ...structuredClone(sources.net.source), name, ...(surface ? { interpretation: 'surface-section' } : {}) },
  });
  return { scope, state, project, native, content, get, calls, result, session, memory };
}

test('promotion, derived memories and geometry export stay unavailable until section content completes', async () => {
  const f = fixture(),
    pending = f.scope.refreshDerived();
  f.native[0].resolve(f.result());
  await flush();
  assert.equal(f.content.length, 1);
  assert.equal(f.scope.availableDerivedModel(), null);
  assert.equal(f.scope.exportControls.source.options[1].disabled, true);
  assert.match(f.get('export-preview').textContent, /Wait for the derived/);
  assert.throws(() => f.scope.derivedControls.promote(), /current derived/);
  await assert.rejects(f.memory.store(1), /derived model is unavailable/);
  await assert.rejects(f.session.prepare(), /available geometry/);
  assert.equal(f.calls.exportPrepare, 0);
  f.content[0].resolve({ ready: true });
  await pending;
  assert.equal(f.scope.availableDerivedModel().name, 'Current');
  assert.equal(f.get('promote').disabled, false);
  await flush();
  assert.equal(f.calls.exportPrepare, 1);
  assert.equal(f.session.prepared.owner.model.name, 'Current');
  assert.equal(f.scope.exportControls.source.options[1].disabled, false);
});

test('failed annotation preparation cannot leave an invisible result available for promotion or export', async () => {
  const f = fixture(),
    pending = f.scope.refreshDerived();
  f.native[0].resolve(f.result());
  await flush();
  f.content[0].reject(Error('PNG ownership failed'));
  await pending;
  assert.equal(f.scope.derived.model, null);
  assert.equal(f.scope.availableDerivedModel(), null);
  assert.equal(f.get('promote').disabled, true);
  assert.match(f.get('derived-status').textContent, /PNG ownership/);
  assert.equal(f.scope.exportControls.source.options[1].disabled, true);
  assert.match(f.get('export-preview').textContent, /No current derived/);
});

test('a late older section cannot replace the status or model of a newer completed view', async () => {
  const f = fixture(),
    first = f.scope.refreshDerived();
  f.native[0].resolve(f.result('Old surface', true));
  await flush();
  f.state.view.sectionOffset = 0.25;
  const second = f.scope.refreshDerived();
  f.native[1].resolve(f.result('New solid'));
  await flush();
  f.content[1].resolve({ ready: true });
  await second;
  const status = f.get('derived-status').textContent;
  assert.equal(f.content[0].options.signal.aborted, true);
  f.content[0].resolve({ ready: true });
  await first;
  assert.equal(f.scope.availableDerivedModel().name, 'New solid');
  assert.equal(f.get('derived-status').textContent, status);
});

test('an older completion cannot unlock a newer request still preparing content', async () => {
  const f = fixture(),
    first = f.scope.refreshDerived();
  f.native[0].resolve(f.result('Old', true));
  await flush();
  f.state.view.sectionOffset = 0.25;
  const second = f.scope.refreshDerived();
  f.native[1].resolve(f.result('New'));
  await flush();
  const status = f.get('derived-status').textContent;
  f.content[0].resolve({ ready: true });
  await first;
  assert.equal(f.scope.availableDerivedModel(), null);
  assert.equal(f.get('promote').disabled, true);
  assert.equal(f.get('derived-status').textContent, status);
  assert.equal(f.scope.exportControls.source.options[1].disabled, true);
  f.content[1].resolve({ ready: true });
  await second;
  assert.equal(f.scope.availableDerivedModel().name, 'New');
});

test('an older failure cannot clear or relabel a newer completed result', async () => {
  const f = fixture(),
    first = f.scope.refreshDerived();
  f.native[0].resolve(f.result('Old'));
  await flush();
  f.state.view.sectionOffset = 0.25;
  const second = f.scope.refreshDerived();
  f.native[1].resolve(f.result('New'));
  await flush();
  f.content[1].resolve({ ready: true });
  await second;
  const status = f.get('derived-status').textContent;
  f.content[0].reject(Error('Late old failure'));
  await first;
  assert.equal(f.scope.availableDerivedModel().name, 'New');
  assert.equal(f.get('derived-status').textContent, status);
});

test('changing the applied plane during content preparation discards the result even without a new request', async () => {
  const f = fixture(),
    pending = f.scope.refreshDerived();
  f.native[0].resolve(f.result());
  await flush();
  f.state.view.sectionOffset = 0.5;
  f.content[0].resolve({ ready: true });
  await pending;
  assert.equal(f.scope.availableDerivedModel(), null);
  assert.equal(f.get('promote').disabled, true);
  assert.equal(f.session.prepared, null);
});

test('export-owned callers receive stale/canceled preparation errors without publishing a result', async () => {
  const f = fixture(),
    controller = new AbortController(),
    pending = f.scope.refreshDerived({ throwOnError: true, signal: controller.signal });
  f.native[0].resolve(f.result());
  await flush();
  controller.abort();
  f.content[0].resolve({ ready: true });
  await assert.rejects(pending, /source changed/);
  assert.equal(f.scope.availableDerivedModel(), null);
  assert.equal(f.get('promote').disabled, true);
});

test('a native failure and failed presentation can be retried without leaving stale actions', async () => {
  const f = fixture(),
    first = f.scope.refreshDerived();
  f.native[0].reject(Error('Invalid section'));
  await first;
  assert.equal(f.scope.availableDerivedModel(), null);
  assert.equal(f.get('promote').disabled, true);
  const retry = f.scope.refreshDerived();
  f.native[1].resolve(f.result('Retry'));
  await flush();
  f.content[0].resolve({ ready: true });
  await retry;
  assert.equal(f.scope.availableDerivedModel().name, 'Retry');
  assert.equal(f.get('promote').disabled, false);
});

test('a completed result loses its reviewed export as soon as reevaluation begins', async () => {
  const f = fixture(),
    first = f.scope.refreshDerived();
  f.native[0].resolve(f.result('First'));
  await flush();
  f.content[0].resolve({ ready: true });
  await first;
  await flush();
  assert.ok(f.session.prepared);
  const second = f.scope.refreshDerived();
  assert.equal(f.session.prepared, null);
  assert.equal(f.scope.availableDerivedModel(), null);
  await assert.rejects(f.session.confirm(), /preview/);
  f.native[1].resolve(f.result('Second'));
  await flush();
  f.content[1].resolve({ ready: true });
  await second;
  await flush();
  assert.equal(f.session.prepared.owner.model.name, 'Second');
});

test('derived reevaluation preserves a reviewed Model export', async () => {
  const f = fixture();
  f.scope.exportControls.source.value = 'base';
  await f.session.prepare();
  const prepared = f.session.prepared;
  const pending = f.scope.refreshDerived();
  assert.equal(f.session.prepared, prepared);
  f.session.verify(prepared.owner);
  f.native[0].resolve(f.result());
  await flush();
  f.content[0].resolve({ ready: true });
  await pending;
  assert.equal(f.session.prepared, prepared);
  assert.equal(f.calls.exportRefresh, 0);
});

test('manual plane evaluation refreshes derived export once after its parent pending lock ends', async () => {
  const f = fixture();
  f.scope.derivedControls.context.applyPlane = () => f.scope.refreshDerived();
  const pending = f.scope.derivedControls.apply(false);
  f.native[0].resolve(f.result());
  await flush();
  f.content[0].resolve({ ready: true });
  await pending;
  await flush();
  assert.equal(f.scope.derivedControls.pending, null);
  assert.equal(f.calls.exportPrepare, 1);
  assert.equal(f.get('promote').disabled, false);
});

for (const mode of ['section', 'dual', 'incidence-dual', 'vertex-figure', 'cell', 'face'])
  test(`${mode} still publishes its complete result without an annotation wait`, async () => {
    const f = fixture();
    f.state.view.derivedMode = mode;
    const pending = f.scope.refreshDerived(),
      result = f.result(mode);
    f.native[0].resolve(['dual', 'incidence-dual', 'cell', 'face'].includes(mode) ? result.model : result);
    await pending;
    assert.equal(f.scope.availableDerivedModel().name, mode);
    assert.equal(f.get('promote').disabled, false);
    assert.equal(f.content.length, 0);
  });

test('empty section remains explicitly empty and unavailable for promotion/export', async () => {
  const f = fixture(),
    pending = f.scope.refreshDerived();
  f.native[0].resolve({ status: 'empty', model: null });
  await pending;
  assert.equal(f.scope.availableDerivedModel(), null);
  assert.equal(f.get('promote').disabled, true);
  assert.equal(f.get('derived-status').textContent, 'Empty intersection');
});

test('filled density publishes its legend with its owned geometry and rejects an older fill-policy completion', async () => {
  const f = fixture();
  f.state.view.derivedMode = 'section';
  f.state.view.densitySection = { enabled: true, rule: 'nonzero', threshold: 1 };
  const first = f.scope.refreshDerived();
  assert.equal(f.native[0].params.section_domain, 'density');
  f.state.view.densitySection.rule = 'threshold';
  f.state.view.densitySection.threshold = 2;
  const second = f.scope.refreshDerived();
  const fresh = { ...f.result('Density ≥ 2'), densityLegend: [{ density: 2, selected: true }] };
  f.native[1].resolve(fresh);
  await second;
  assert.equal(f.scope.availableDerivedModel().name, 'Density ≥ 2');
  assert.deepEqual(f.scope.densityLegend, fresh.densityLegend);
  f.native[0].resolve({ ...f.result('Old density'), densityLegend: [{ density: 1, selected: true }] });
  await first;
  assert.equal(f.scope.availableDerivedModel().name, 'Density ≥ 2');
  assert.deepEqual(f.scope.densityLegend, fresh.densityLegend);
  assert.equal(f.scope.cancelDerivedPresentation(), false);
  assert.deepEqual(f.scope.densityLegend, fresh.densityLegend);
});

test('late net presentation rejects an export-owned caller after source supersession', async () => {
  const f = fixture(),
    show = deferred();
  f.state.view.derivedMode = 'net';
  f.scope.netEditor.evaluate = async () => ({ faces: [] });
  f.scope.netEditor.show = () => show.promise;
  const first = f.scope.refreshDerived({ throwOnError: true });
  await flush();
  f.state.view.derivedMode = 'cell-section';
  const second = f.scope.refreshDerived();
  f.native[0].resolve(f.result('New'));
  await flush();
  f.content[0].resolve({ ready: true });
  await second;
  const status = f.get('derived-status').textContent;
  show.resolve();
  await assert.rejects(first, /source changed/);
  assert.equal(f.scope.availableDerivedModel().name, 'New');
  assert.equal(f.get('derived-status').textContent, status);
});

test('opening the actual geometry export action pauses source-changing playback before review', () => {
  const code = sourceFunction(app, 'openGeometryExport'),
    calls = [];
  const scope = {
    model: () => ({ dimension: 3 }),
    animation: { exporting: false, pause: () => calls.push('animation') },
    tourExporting: false,
    viewportControls: { stop: () => calls.push('rotation') },
    tours: { pause: () => calls.push('tour') },
    dualMorph: { pause: () => calls.push('morph') },
    exportControls: {
      open: () => {
        calls.push('open');
        return 'review';
      },
    },
  };
  const open = new Function('scope', `const ctx=scope;with(scope){${code};return openGeometryExport;}`)(scope);
  assert.equal(open(), 'review');
  assert.deepEqual(calls, ['rotation', 'animation', 'tour', 'morph', 'open']);
  for (const owner of ['animation', 'tour']) {
    calls.length = 0;
    scope.animation.exporting = owner === 'animation';
    scope.tourExporting = owner === 'tour';
    assert.throws(open, /Finish animation export/);
    assert.deepEqual(calls, []);
  }
  matchSource(app, /export:openGeometryExport/);
});

test('opening export during a pending section animation finishes the paused plane under fresh ownership', async () => {
  const f = fixture(),
    scope = f.scope;
  scope.animation = {
    playing: true,
    exporting: false,
    generation: 0,
    pause() {
      this.playing = false;
      this.generation++;
    },
  };
  scope.tourExporting = false;
  scope.viewportControls.stop = () => {};
  scope.tours = { pause() {} };
  scope.dualMorph = { pause() {} };
  scope.error = (error) => assert.fail(error.message);
  const first = scope.refreshDerived({ isCurrent: () => scope.animation.generation === 0 });
  f.native[0].resolve(f.result('Superseded frame'));
  await flush();
  let frozen;
  const refresh = scope.refreshDerived;
  scope.refreshDerived = (...args) => (frozen = refresh(...args));
  scope.exportControls.dialog.open = false;
  scope.exportControls.open = () => {
    scope.exportControls.source.value = 'base';
    scope.exportControls.dialog.open = true;
    return 'review';
  };
  const code = sourceFunction(app, 'openGeometryExport');
  const open = new Function('scope', `const ctx=scope;with(scope){${code};return openGeometryExport;}`)(scope);
  assert.equal(open(), 'review');
  assert.equal(f.native.length, 2);
  assert.equal(f.content[0].options.signal.aborted, true);
  f.native[1].resolve(f.result('Frozen plane'));
  await flush();
  f.content[1].resolve({ ready: true });
  await frozen;
  f.content[0].resolve({ ready: true });
  await first;
  assert.equal(scope.availableDerivedModel().name, 'Frozen plane');
  assert.equal(scope.exportControls.source.options[1].disabled, false);
});

test('Cancel is available during live depth evaluation and stops that request and the drag', async () => {
  const f = fixture();
  f.scope.derivedControls.setOffset('.25');
  assert.equal(f.get('cancel').hidden, false);
  assert.equal(f.native.length, 1);
  f.scope.derivedControls.setOffset('.5');
  assert.equal(f.scope.cancelDerivedPresentation(), true);
  assert.equal(f.native[0].options.signal.aborted, true);
  assert.equal(f.scope.derivedControls.live, null);
  assert.equal(f.get('cancel').hidden, true);
  f.native[0].resolve(f.result());
  await flush();
  assert.equal(f.native.length, 1);
  assert.equal(f.scope.availableDerivedModel(), null);
  assert.match(f.get('derived-status').textContent, /canceled/);
  assert.match(f.get('export-preview').textContent, /No current derived/);
});

test('Cancel during annotation preparation revokes publication and ignores a late provider', async () => {
  const f = fixture(),
    pending = f.scope.refreshDerived();
  assert.equal(f.get('cancel').hidden, false);
  f.native[0].resolve(f.result());
  await flush();
  assert.equal(f.get('cancel').hidden, false);
  assert.equal(f.scope.cancelDerivedPresentation(), true);
  assert.equal(f.content[0].options.signal.aborted, true);
  assert.equal(f.get('cancel').hidden, true);
  const status = f.get('derived-status').textContent;
  f.content[0].resolve({ ready: true });
  await pending;
  assert.equal(f.scope.availableDerivedModel(), null);
  assert.equal(f.scope.derived.model, null);
  assert.equal(f.get('promote').disabled, true);
  assert.equal(f.get('derived-status').textContent, status);
});

test('Cancel releases a manual plane lock immediately and an older finally cannot clear its replacement', async () => {
  const f = fixture(),
    first = deferred(),
    second = deferred();
  let canceled = 0;
  f.scope.derivedControls.context.applyPlane = () => first.promise;
  f.scope.derivedControls.context.cancelPlane = () => canceled++;
  const old = f.scope.derivedControls.apply(false);
  assert.equal(f.get('cancel').hidden, false);
  f.scope.cancelDerivedPresentation();
  assert.equal(canceled, 1);
  assert.equal(f.scope.derivedControls.pending, null);
  assert.equal(f.get('cancel').hidden, true);
  f.scope.derivedControls.context.applyPlane = () => second.promise;
  const fresh = f.scope.derivedControls.apply(false),
    job = f.scope.derivedControls.pending;
  first.resolve();
  await old;
  assert.equal(f.scope.derivedControls.pending, job);
  assert.equal(f.get('cancel').hidden, false);
  second.resolve();
  await fresh;
  assert.equal(f.get('cancel').hidden, true);
});

test('canceling unrelated work retains an already completed derived model', async () => {
  const f = fixture(),
    pending = f.scope.refreshDerived();
  f.native[0].resolve(f.result());
  await flush();
  f.content[0].resolve({ ready: true });
  await pending;
  await flush();
  const model = f.scope.availableDerivedModel(),
    status = f.get('derived-status').textContent;
  f.scope.nativeJobs.pending.set('other', {});
  f.scope.syncCancelAvailability();
  assert.equal(f.get('cancel').hidden, false);
  assert.equal(f.scope.cancelDerivedPresentation(), false);
  assert.equal(f.scope.availableDerivedModel(), model);
  assert.equal(f.get('derived-status').textContent, status);
  assert.equal(f.get('cancel').hidden, false);
});

test('the actual global Cancel handler cancels derived work and only active cell-section operations', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(),
    calls = [];
  f.scope.derivedControls.setOffset('.25');
  f.scope.nativeJobs.cancel = () => {
    calls.push('native');
    f.scope.nativeJobs.pending.clear();
    f.scope.syncCancelAvailability();
  };
  f.scope.elementContent.invalidate = () => {};
  f.scope.netEditor.exports = { cancel: () => calls.push('net-output') };
  f.scope.netEditor.cancelDrag = () => calls.push('net-drag');
  f.scope.imageCapture = { busy: true, cancel: () => calls.push('image') };
  f.scope.ordinaryCellSections.cancelActive = () => calls.push('cell-active');
  f.scope.ordinaryCellSections.cancel = () => assert.fail('Completed receipts must survive');
  const noop = new Proxy({ sequence: 0 }, { get: (target, key) => (key === 'sequence' ? target.sequence : () => {}) });
  const scope = new Proxy(
    { ...f.scope, guard: (fn) => fn, setStatus: (message) => calls.push(message) },
    {
      has: (_target, key) => key !== 'ctx',
      get: (target, key) => (key === Symbol.unscopables ? undefined : Object.hasOwn(target, key) ? target[key] : noop),
    }
  );
  const code = sourceAssignment(app, "$('cancel').onclick");
  new Function('scope', `const ctx=scope;with(scope){${code}}`)(scope);
  await f.get('cancel').onclick();
  t.mock.timers.tick(250);
  assert.equal(f.native.length, 1);
  assert.equal(f.native[0].options.signal.aborted, true);
  assert.equal(f.scope.derivedControls.live, null);
  assert.ok(calls.includes('native'));
  assert.ok(calls.includes('cell-active'));
  assert.ok(calls.includes('net-output'));
  assert.ok(calls.includes('net-drag'));
  assert.ok(calls.includes('image'));
  assert.ok(calls.includes('Cancelled active computation.'));
});
