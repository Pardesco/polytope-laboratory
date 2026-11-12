import test from 'node:test';
import assert from 'node:assert/strict';
import { WatermanControls } from '../ui/waterman-controls.mjs';
import { numericControlFixture, deferred, flush } from './numeric-control-fixture.mjs';

const fixture = () => {
  const f = numericControlFixture(WatermanControls.prototype, {
    'waterman-mode': 'exact-sphere',
    'waterman-lattice': 'BCC',
    'waterman-origin': 'custom',
    'waterman-sequence': 'occupied-shell',
    'waterman-increment': 'unused expression',
    'waterman-root': '5',
    'waterman-radius-squared': '0',
    'waterman-x': '0',
    'waterman-y': '0',
    'waterman-z': '0',
    'waterman-sequence-status': '',
    'waterman-next': '',
    'waterman-previous': '',
    'generate-waterman': '',
    'waterman-root-row': '',
    'waterman-radius-row': '',
    'waterman-x-row': '',
    'waterman-y-row': '',
    'waterman-z-row': '',
  });
  for (const [id, node] of Object.entries(f.nodes)) node.id = id;
  f.result.metadata = {
    watermanSequence: {
      radiusSquared: '3',
      shellCoordinates: Array(8).fill([1, 1, 1]),
      hullResiduals: { maximumOutsideSupportResidual: 0, maximumFacetPlanarityResidual: 1e-16 },
    },
  };
  return f;
};

test('occupied-shell sequence uses one rational NumericEntry batch and retained versioned parameters', async () => {
  const f = fixture();
  await f.control.generate(1);
  assert.deepEqual(f.expressionCalls[0].parts, ['0', '0', '0', '0']);
  assert.equal(f.expressionCalls[0].mode, 'rational');
  assert.deepEqual(f.calls, [
    [
      'waterman-shell',
      {
        radius_squared: '0',
        center: ['0', '0', '0'],
        lattice: 'BCC',
        direction: 1,
        convention: 'waterman-occupied-shell-v1',
      },
    ],
  ]);
  assert.equal(f.nodes['waterman-radius-squared'].value, '3');
  assert.equal(f.options[0].expressionInputs.sequence, 'occupied-shell');
  assert.match(f.nodes['waterman-sequence-status'].textContent, /8 boundary sites.*Numerical support residual/);
  assert.equal(f.nodes['waterman-increment'].disabled, true);
});

test('previous shell preserves rational expressions and changes radius only on successful publication', async () => {
  const f = fixture();
  f.nodes['waterman-radius-squared'].value = '2+3';
  f.nodes['waterman-x'].value = '1/2';
  await f.control.generate(-1);
  assert.equal(f.calls[0][1].direction, -1);
  assert.equal(f.calls[0][1].radius_squared, '5');
  assert.deepEqual(f.calls[0][1].center, ['1/2', '0', '0']);
  const g = fixture();
  g.context.generate = async () => {
    throw Error('Previous shell cannot form a full 3D hull');
  };
  await assert.rejects(g.control.generate(-1), /full 3D/);
  assert.equal(g.nodes['waterman-radius-squared'].value, '0');
  assert.equal(g.control.busy, false);
  assert.equal(g.nodes['waterman-next'].disabled, false);
});

test('ordinary generate stays a ball at the supplied threshold and root navigation keeps its convention', async () => {
  const f = fixture();
  f.nodes['waterman-radius-squared'].value = '3';
  await f.control.generate();
  assert.deepEqual(f.calls[0], ['waterman-lattice', { radius_squared: '3', center: ['0', '0', '0'], lattice: 'BCC' }]);
  f.nodes['waterman-mode'].value = 'author-root';
  f.context.evaluateMany = async (parts) => {
    assert.deepEqual(parts, ['(5)+(1)']);
    return ['6'];
  };
  await f.control.generate(1);
  assert.deepEqual(f.calls[1], ['waterman-root', { root: 6 }]);
  assert.equal(f.nodes['waterman-sequence'].disabled, true);
});

test('invalid mode, negative anchors and too-long exact rational results refuse without generation', async () => {
  for (const change of [
    (f) => (f.nodes['waterman-sequence'].value = 'stella'),
    (f) => (f.nodes['waterman-radius-squared'].value = '-1'),
    (f) => (f.context.evaluateMany = async () => ['1'.repeat(257), '0', '0', '0']),
  ]) {
    const f = fixture();
    change(f);
    await assert.rejects(f.control.generate(1));
    assert.equal(f.calls.length, 0);
  }
});

test('sequence, origin, source and export changes revoke pending publication', async () => {
  for (const change of [
    (f) => (f.nodes['waterman-sequence'].value = 'increment'),
    (f) => (f.nodes['waterman-x'].value = '1'),
    (f) => (f.state.notes = 'Changed'),
    (f) => f.setExport(true),
  ]) {
    const f = fixture(),
      hold = deferred();
    f.context.generate = async (kind, params, options) => {
      await hold.promise;
      options.verifyPublication();
      return f.result;
    };
    const run = f.control.generate(1);
    await flush();
    change(f);
    hold.resolve();
    await assert.rejects(run);
    assert.equal(f.nodes['waterman-radius-squared'].value, '0');
    assert.equal(f.nodes['waterman-sequence-status'].textContent, undefined);
  }
});

test('cancellation and busy/export bypass guards release the sequence for retry', async () => {
  const f = fixture(),
    hold = deferred();
  f.context.evaluateMany = () => hold.promise;
  const run = f.control.generate(1);
  await assert.rejects(f.control.generate(-1), /current Waterman/);
  f.control.cancel();
  await assert.rejects(run, { name: 'AbortError' });
  assert.equal(f.control.busy, false);
  f.setExport(true);
  await assert.rejects(f.control.generate(1), /export/);
  const g = fixture();
  g.control.fourD = { busy: true, sync() {} };
  await assert.rejects(g.control.generate(1), /current Waterman/);
});

test('new sequence disabled writers are idempotent and unused increment is disabled', () => {
  const f = fixture();
  f.control.sync();
  let changes = 0;
  for (const id of ['waterman-sequence', 'waterman-increment']) {
    const node = f.nodes[id];
    let value = node.disabled;
    Object.defineProperty(node, 'disabled', {
      get: () => value,
      set: (next) => {
        changes++;
        value = next;
      },
    });
  }
  f.control.sync();
  f.control.sync();
  assert.equal(changes, 0);
  f.nodes['waterman-sequence'].value = 'increment';
  f.control.sync();
  assert.equal(changes, 1);
  assert.equal(f.nodes['waterman-increment'].disabled, false);
});
