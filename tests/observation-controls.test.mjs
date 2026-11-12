import test from 'node:test';
import assert from 'node:assert/strict';
import { holdObservationControls, transferObservationControls } from '../ui/observation-controls.mjs';
const controls = (enabled = true, enableDamping = true) => ({
  enabled,
  enableDamping,
  updates: 0,
  update() {
    this.updates++;
  },
});
function replace(viewer) {
  const previous = viewer.controls;
  viewer.controls = controls(previous.enabled, previous.enableDamping);
  transferObservationControls(previous, viewer.controls);
  return previous;
}

test('related replacements stay frozen and recover the original settings, including already disabled observation', () => {
  for (const [enabled, damping] of [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ]) {
    const viewer = { controls: controls(enabled, damping) },
      first = viewer.controls,
      hold = holdObservationControls([viewer, viewer]);
    assert.equal(first.updates, 1);
    assert.equal(first.enabled, false);
    assert.equal(first.enableDamping, false);
    replace(viewer);
    replace(viewer);
    assert.equal(viewer.controls.enabled, false);
    hold.release();
    assert.equal(viewer.controls.enabled, enabled);
    assert.equal(viewer.controls.enableDamping, damping);
    viewer.controls.enabled = !enabled;
    hold.release();
    assert.equal(viewer.controls.enabled, !enabled);
  }
});

test('nested owners can release in either order without moving observation until the final release', () => {
  for (const outerFirst of [true, false]) {
    const viewer = { controls: controls() },
      outer = holdObservationControls([viewer]),
      inner = holdObservationControls([viewer]);
    replace(viewer);
    (outerFirst ? outer : inner).release();
    assert.equal(viewer.controls.enabled, false);
    replace(viewer);
    (outerFirst ? inner : outer).release();
    assert.equal(viewer.controls.enabled, true);
    assert.equal(viewer.controls.enableDamping, true);
  }
});

test('a retired holder cannot alter independent controls or a newer holder', () => {
  const viewer = { controls: controls() },
    old = holdObservationControls([viewer]);
  viewer.controls = controls(false, true);
  const independent = viewer.controls,
    fresh = holdObservationControls([viewer]);
  old.release();
  assert.equal(independent.enabled, false);
  assert.equal(independent.enableDamping, false);
  fresh.release();
  assert.equal(independent.enabled, false);
  assert.equal(independent.enableDamping, true);
});

test('transfer requires the actual current replacement and cannot take another holder from it', () => {
  const a = { controls: controls() },
    b = { controls: controls() },
    holdA = holdObservationControls([a]),
    holdB = holdObservationControls([b]);
  const previous = a.controls;
  assert.equal(transferObservationControls(previous, controls()), false);
  a.controls = b.controls;
  assert.equal(transferObservationControls(previous, a.controls), false);
  holdA.release();
  assert.equal(b.controls.enabled, false);
  holdB.release();
  assert.equal(b.controls.enabled, true);
});

test('partial acquisition failures release previously held viewers', () => {
  const viewer = { controls: controls() },
    broken = {
      controls: {
        ...controls(),
        update() {
          throw Error('control initialization failed');
        },
      },
    };
  assert.throws(() => holdObservationControls([viewer, broken]), /initialization failed/);
  assert.equal(viewer.controls.enabled, true);
  assert.equal(viewer.controls.enableDamping, true);
  const retry = holdObservationControls([viewer]);
  retry.release();
  assert.equal(viewer.controls.enabled, true);
});

test('missing viewers and controls are harmless; shared controls cannot be claimed by two viewers', () => {
  holdObservationControls([null, {}, undefined]).release();
  const first = { controls: controls() },
    second = { controls: first.controls };
  assert.throws(() => holdObservationControls([first, second]), /two viewers/);
  assert.equal(first.controls.enabled, true);
});

test('a throwing first restoration releases every group and both ownership entries', () => {
  const first = { controls: controls() },
    second = { controls: controls() },
    hold = holdObservationControls([first, second]);
  const failure = Error('first enabled restore failed');
  let enabled = false;
  Object.defineProperty(first.controls, 'enabled', {
    configurable: true,
    get: () => enabled,
    set(value) {
      if (value) throw failure;
      enabled = value;
    },
  });
  assert.throws(
    () => hold.release(),
    (error) => error === failure
  );
  assert.equal(second.controls.enabled, true);
  assert.equal(second.controls.enableDamping, true);
  // An independent viewer can claim each old object only after ownership is gone.
  Object.defineProperty(first.controls, 'enabled', { value: false, writable: true, configurable: true });
  for (const original of [first, second]) {
    const independent = { controls: original.controls },
      retry = holdObservationControls([independent]);
    retry.release();
  }
  second.controls.enabled = false;
  hold.release();
  assert.equal(second.controls.enabled, false);
});
