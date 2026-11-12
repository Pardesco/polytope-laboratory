import test from 'node:test';
import assert from 'node:assert/strict';
import { Waterman4Controls } from '../ui/waterman4-controls.mjs';
import { WatermanControls } from '../ui/waterman-controls.mjs';
import { numericControlFixture, deferred, flush } from './numeric-control-fixture.mjs';

function fixture() {
  const f = numericControlFixture(Waterman4Controls.prototype, {
    'waterman4-lattice': 'D4',
    'waterman4-radius': '2',
    'waterman4-center': '0, 0, 0, 0',
    'waterman4-increment': '1',
    'generate-waterman4': '',
    'waterman4-previous': '',
    'waterman4-next': '',
    'waterman4-status': '',
  });
  f.result.vertices = Array(24);
  f.result.metadata = {
    waterman4: {
      selectedPointCount: 25,
      hullResiduals: { maximumOutsideSupportResidual: 0, maximumFacetPlanarityResidual: 1e-16 },
    },
  };
  return f;
}

test('4D rational vector and squared radius reach generation with explicit lattice and expression evidence', async () => {
  const f = fixture();
  f.nodes['waterman4-radius'].value = '1+1';
  f.nodes['waterman4-center'].value = '1/2, 1/2, 1/2, 1/2';
  const before = structuredClone(f.project);
  assert.equal(await f.control.generate(), f.result);
  assert.deepEqual(f.calls, [
    ['waterman-4d', { radius_squared: '2', center: ['1/2', '1/2', '1/2', '1/2'], lattice: 'D4' }],
  ]);
  assert.equal(f.expressionCalls[0].mode, 'rational');
  assert.equal(f.options[0].expressionInputs.radius, '1+1');
  assert.equal(f.options[0].signal.aborted, false);
  assert.deepEqual(f.project, before);
  assert.match(f.nodes['waterman4-status'].textContent, /25 sites → 24 hull vertices.*1.00e-16/);
});

test('previous/next use exact r² increment expressions and update only after successful publication', async () => {
  for (const direction of [-1, 1]) {
    const f = fixture();
    f.context.evaluateMany = async (parts, { mode }) => {
      assert.equal(mode, 'rational');
      assert.deepEqual(parts, [`(2)+(${direction})*(1)`, '0', '0', '0', '0', '1']);
      return [String(2 + direction), '0', '0', '0', '0', '1'];
    };
    await f.control.generate(direction);
    assert.equal(f.nodes['waterman4-radius'].value, String(2 + direction));
    assert.equal(f.calls[0][1].radius_squared, String(2 + direction));
  }
  const f = fixture();
  f.context.evaluateMany = async () => ['3', '0', '0', '0', '0', '1'];
  f.context.generate = async () => {
    throw Error('Selected-point resource limit');
  };
  await assert.rejects(f.control.generate(1), /resource/);
  assert.equal(f.nodes['waterman4-radius'].value, '2');
  assert.equal(f.control.busy, false);
});

test('invalid exact values, lattice, vector dimensions, radius and increment fail without generation', async () => {
  for (const [field, value] of [
    ['lattice', 'FCC'],
    ['center', '0, 0, 0'],
    ['center', '0, 0, 0, 1001'],
    ['radius', '0'],
    ['radius', '65'],
    ['radius', '-1'],
    ['radius', String(2n ** 256n)],
    ['radius', '1/' + String(2n ** 256n)],
  ]) {
    const f = fixture();
    f.nodes['waterman4-' + field].value = value;
    await assert.rejects(f.control.generate());
    assert.equal(f.calls.length, 0);
  }
  for (const value of ['0', '-1', 'bad']) {
    const f = fixture();
    f.context.evaluateMany = async () => ['3', '0', '0', '0', '0', value];
    await assert.rejects(f.control.generate(1));
    assert.equal(f.calls.length, 0);
  }
  for (const value of [2, '2/4', '1/1', 'NaN', '-0']) {
    const f = fixture();
    f.context.evaluateMany = async () => [value, '0', '0', '0', '0'];
    await assert.rejects(f.control.generate());
    assert.equal(f.calls.length, 0);
  }
});

test('busy/export gates block both 3D and 4D callbacks before evaluating fields', async () => {
  const f = fixture();
  f.setExport(true);
  f.control.sync();
  assert.ok(Object.values(f.nodes).every((node) => node.disabled));
  await assert.rejects(f.control.generate(), /export/);
  assert.equal(f.expressionCalls.length, 0);
  f.setExport(false);
  f.context.isBusy = () => true;
  await assert.rejects(f.control.generate(), /current Waterman/);
  const parent = Object.assign(Object.create(WatermanControls.prototype), { context: {}, fourD: { busy: true } });
  await assert.rejects(parent.generate(), /current Waterman/);
});

test('cancel interrupts expression and native awaits, releasing controls for retry', async () => {
  for (const phase of ['expression', 'native']) {
    const f = fixture(),
      hold = deferred();
    if (phase === 'expression') f.context.evaluateMany = () => hold.promise;
    else
      f.context.generate = async (kind, params, options) => {
        await hold.promise;
        options.verifyPublication();
        f.calls.push([kind, params]);
        return f.result;
      };
    const pending = f.control.generate();
    await flush();
    assert.equal(f.control.busy, true);
    await assert.rejects(f.control.generate(), /current/);
    f.control.cancel();
    await assert.rejects(pending, { name: 'AbortError' });
    hold.resolve();
    await flush();
    assert.equal(f.calls.length, 0);
    assert.equal(f.control.busy, false);
  }
});

test('changed target fields, source notes/units/geometry and export refuse stale native publication', async () => {
  for (const change of [
    (f) => (f.nodes['waterman4-lattice'].value = 'Z4'),
    (f) => (f.nodes['waterman4-radius'].value = '3'),
    (f) => (f.nodes['waterman4-center'].value = '1,0,0,0'),
    (f) => (f.nodes['waterman4-increment'].value = '2'),
    (f) => (f.state.notes = 'Changed'),
    (f) => (f.state.view.coordinateUnit = 'cm'),
    (f) => (f.state.model.vertices[0][0] = 2),
    (f) => f.setExport(true),
    (f) => (f.document.cursor = 1),
  ]) {
    const f = fixture(),
      hold = deferred();
    f.context.generate = async (kind, params, options) => {
      await hold.promise;
      options.verifyPublication();
      f.calls.push([kind, params]);
      return f.result;
    };
    const pending = f.control.generate();
    await flush();
    change(f);
    hold.resolve();
    await assert.rejects(pending);
    assert.equal(f.calls.length, 0);
  }
});

test('observer camera changes remain independent during generation', async () => {
  const f = fixture(),
    hold = deferred();
  f.context.evaluateMany = () => hold.promise;
  const pending = f.control.generate();
  f.state.view.camera = { zoom: 4 };
  hold.resolve(['2', '0', '0', '0', '0']);
  await pending;
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.state.view.camera, { zoom: 4 });
});

test('mount preserves closed advanced options and wires common actions; sync is idempotent', () => {
  const prior = globalThis.document,
    f = fixture(),
    children = [];
  try {
    globalThis.document = { createElement: () => f.panel };
    const controls = new Waterman4Controls(f.context, { append: (panel) => children.push(panel) });
    assert.equal(children[0], f.panel);
    assert.equal(f.panel.id, 'waterman4-settings');
    assert.match(f.panel.innerHTML, /id="waterman4-sequence-settings"><summary>/);
    assert.doesNotMatch(f.panel.innerHTML, /data-expert| open[ >]/);
    for (const key of ['generate-waterman4', 'waterman4-previous', 'waterman4-next'])
      assert.equal(typeof f.nodes[key].onclick, 'function');
    let writes = 0;
    for (const node of Object.values(f.nodes)) {
      let value = node.disabled;
      Object.defineProperty(node, 'disabled', {
        get: () => value,
        set: (next) => {
          writes++;
          value = next;
        },
      });
    }
    controls.sync();
    assert.equal(writes, 0);
    f.setExport(true);
    controls.sync();
    const once = writes;
    assert.ok(once > 0);
    controls.sync();
    assert.equal(writes, once);
    let canceled = 0;
    const parent = Object.assign(Object.create(WatermanControls.prototype), { fourD: { cancel: () => canceled++ } });
    parent.cancel();
    assert.equal(canceled, 1);
  } finally {
    if (prior === undefined) delete globalThis.document;
    else globalThis.document = prior;
  }
});
