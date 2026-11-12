import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationControls } from '../ui/animation-controls.mjs';
import { createSequence, withSequenceTracks } from '../ui/animation.mjs';
import { transferObservationControls } from '../ui/observation-controls.mjs';
function fixture() {
  const controls = () => ({ enabled: true, enableDamping: true, update() {} }),
    viewer = () => ({ controls: controls(), setDisplay() {}, draw() {}, image: () => 'data:image/png;base64,AA==' });
  const base = viewer(),
    derived = viewer(),
    state = {
      model: { id: 'source', dimension: 3 },
      notes: 'retain',
      view: { angles: Array(6).fill(0), sectionOffset: 0, derivedMode: 'section' },
    };
  state.view.animation = createSequence(state.view, 0.25, 8);
  const writes = [],
    aborted = [],
    context = {
      getState: () => state,
      viewer: base,
      sectionViewer: derived,
      netViewer: derived,
      setStatus() {},
      refreshSection: async () => {
        const previous = derived.controls;
        derived.controls = { ...previous };
        transferObservationControls(previous, derived.controls);
      },
      api: {
        animationBegin: async () => ({ id: 'capture' }),
        animationWrite: async (_, index) => writes.push(index),
        animationFinish: async () => ({ path: 'capture.frames' }),
        animationAbort: async (id) => aborted.push(id),
      },
    };
  const control = Object.assign(Object.create(AnimationControls.prototype), {
    context,
    time: 0,
    generation: 0,
    exporting: false,
    nodes: { target: { value: 'section' }, progress: {} },
    configure: async () => {},
    pause() {
      this.generation++;
    },
    update() {},
    sequence: () => state.view.animation,
    apply: async () => {
      assert.equal(base.controls.enabled, false);
      assert.equal(derived.controls.enabled, false);
      await context.refreshSection();
    },
    prepareCapture: async () => {},
  });
  return { control, context, base, derived, state, writes, aborted };
}

test('completed frame export restores the replacement camera without changing the source', async () => {
  const f = fixture(),
    before = structuredClone(f.state),
    old = f.derived.controls;
  await f.control.export('png');
  assert.deepEqual(f.writes, [0, 1, 2]);
  assert.notStrictEqual(f.derived.controls, old);
  assert.deepEqual(f.state, before);
  assert.equal(f.base.controls.enabled, true);
  assert.equal(f.derived.controls.enabled, true);
  assert.equal(f.derived.controls.enableDamping, true);
  assert.equal(f.control.exporting, false);
});

test('observation is frozen throughout a held export dialog and restored on cancellation or dialog failure', async () => {
  for (const fail of [false, true]) {
    const f = fixture();
    let resolve, reject;
    f.context.api.animationBegin = () =>
      new Promise((a, b) => {
        resolve = a;
        reject = b;
      });
    const pending = f.control.export('png');
    await Promise.resolve();
    assert.equal(f.control.exporting, true);
    assert.equal(f.base.controls.enabled, false);
    assert.equal(f.derived.controls.enabled, false);
    assert.equal(f.base.controls.enableDamping, false);
    if (fail) {
      reject(Error('Native dialog failed'));
      await assert.rejects(pending, /Native dialog failed/);
    } else {
      resolve(null);
      await pending;
    }
    assert.equal(f.base.controls.enabled, true);
    assert.equal(f.derived.controls.enabled, true);
    assert.equal(f.base.controls.enableDamping, true);
    assert.equal(f.control.exporting, false);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.aborted, []);
  }
});

test('native track preparation cannot run before the export camera lock is acquired', async () => {
  const f = fixture();
  let prepared = 0;
  f.state.view.animation = withSequenceTracks(
    f.state.view.animation,
    { explosion: { direction: 'radial' } },
    { explosionAmount: 0 }
  );
  f.control.trackSessions = {
    prepare: async () => {
      assert.equal(f.base.controls.enabled, false);
      assert.equal(f.derived.controls.enabled, false);
      prepared++;
      return { restore: async () => {}, destroy() {} };
    },
  };
  f.context.api.animationBegin = async () => null;
  await f.control.export('png');
  assert.equal(prepared, 1);
  assert.equal(f.base.controls.enabled, true);
  assert.equal(f.derived.controls.enabled, true);
});

test('native export failure aborts its session and restores observation after control rebinding', async () => {
  const f = fixture();
  f.context.api.animationWrite = async () => {
    throw Error('Native frame write failed');
  };
  await assert.rejects(f.control.export('png'), /Native frame write failed/);
  assert.deepEqual(f.aborted, ['capture']);
  assert.equal(f.derived.controls.enabled, true);
  assert.equal(f.base.controls.enabled, true);
  assert.equal(f.control.exporting, false);
});

test('restoration errors cannot leave observation or export busy state held', async () => {
  const f = fixture();
  f.base.setDisplay = () => {
    throw Error('Presentation restoration failed');
  };
  await assert.rejects(f.control.export('png'), /Presentation restoration failed/);
  assert.equal(f.base.controls.enabled, true);
  assert.equal(f.derived.controls.enabled, true);
  assert.equal(f.control.exporting, false);
  assert.equal(f.control.exportView, null);
});

test('an export-state callback failure cannot leave the workspace marked as exporting', async () => {
  const f = fixture(),
    states = [];
  f.context.onExportStateChange = () => {
    states.push(f.control.exporting);
    if (f.control.exporting) throw Error('Failed to lock an input');
  };
  await assert.rejects(f.control.export('png'), /Failed to lock an input/);
  assert.deepEqual(states, [true, false]);
  assert.equal(f.control.exporting, false);
  assert.equal(f.control.exportView, null);
  assert.equal(f.base.controls.enabled, true);
});

test('a control restoration failure still releases the export busy state and notifies the UI', async () => {
  const f = fixture(),
    states = [];
  let enabled = true;
  Object.defineProperty(f.base.controls, 'enabled', {
    get: () => enabled,
    set: (value) => {
      if (value && f.control.exporting) throw Error('Camera restoration failed');
      enabled = value;
    },
  });
  f.context.onExportStateChange = () => states.push(f.control.exporting);
  await assert.rejects(f.control.export('png'), /Camera restoration failed/);
  assert.deepEqual(states, [true, false]);
  assert.equal(f.control.exporting, false);
  assert.equal(f.control.exportView, null);
  assert.equal(f.derived.controls.enabled, true);
});
