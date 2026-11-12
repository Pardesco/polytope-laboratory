import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryControls } from '../ui/memory-controls.mjs';
import { MemoryNumericWorkflow, prepareMemoryAddition } from '../ui/memory-numeric-workflow.mjs';
import { storeMemory, createMemories, retrieveMemory } from '../ui/model-memories.mjs';
import { sourceContext, deferred, tick } from './construction-controls-fixture.mjs';

function fixture() {
  const owner = sourceContext(),
    stored = structuredClone(owner.getState()),
    calls = [];
  stored.notes = 'Stored notes';
  stored.view.coordinateUnit = 'cm';
  owner.getProject().memories = storeMemory(createMemories(), 1, stored);
  const nodes = {
    slot: { value: '1' },
    source: { value: 'base' },
    scale: { value: 'sqrt(4)' },
    'fill-rule': { value: 'nonzero' },
    'color-policy': { value: 'require-equal' },
    'addition-result': { textContent: '' },
  };
  let evaluate = async () => [2],
    addition = async (current, memory, label, options) => {
      options.verifyPublication();
      calls.push({ current, memory, label, options });
      return current.model;
    };
  const context = {
    ...owner,
    evaluateBatch: (...args) => evaluate(...args),
    getSource: () => ({}),
    markDirty() {},
    setStatus() {},
    addStates: (...args) => addition(...args),
    restoreState: async (state, _label, options) => {
      options?.verifyPublication?.();
      owner.setState(state);
      options?.onPublication?.();
    },
  };
  const controls = Object.assign(Object.create(MemoryControls.prototype), { context, nodes, busy: false, sync() {} });
  controls.numeric = new MemoryNumericWorkflow(context, () => controls.additionFields());
  return {
    ...owner,
    controls,
    nodes,
    calls,
    stored,
    setEvaluate: (fn) => (evaluate = fn),
    setAddition: (fn) => (addition = fn),
  };
}

test('relative-scale Add evaluates expressions once and supplies independent inputs and replay options', async () => {
  const f = fixture(),
    bank = f.getProject().memories,
    original = structuredClone(f.getState());
  await f.controls.add();
  assert.equal(f.calls.length, 1);
  const call = f.calls[0];
  assert.equal(call.options.relativeScale, 2);
  assert.equal(call.options.blend, false);
  assert.ok(call.options.signal instanceof AbortSignal);
  assert.equal(call.label, 'Add memory 1');
  call.current.model.vertices[0][0] = 99;
  call.memory.model.vertices[0][0] = 88;
  assert.deepEqual(f.getState(), original);
  assert.equal(f.getProject().memories, bank);
  assert.deepEqual(retrieveMemory(bank, 1), f.stored);
  assert.match(f.nodes['addition-result'].textContent, /scale 2/);
});

test('Blend retains explicit winding and color policies, including an approximate residual', async () => {
  const f = fixture();
  f.nodes['fill-rule'].value = 'even-odd';
  f.nodes['color-policy'].value = 'first-source';
  f.setAddition(async (current, stored, label, options) => {
    options.verifyPublication();
    f.calls.push(options);
    assert.equal(label, 'Blend memory 1');
    return { metadata: { compoundMerge: { visibleSurface: { maxWindingResidual: 2e-12 } } } };
  });
  await f.controls.add(1, { blend: true });
  assert.equal(f.calls[0].blend, true);
  assert.equal(f.calls[0].fillRule, 'even-odd');
  assert.equal(f.calls[0].colorPolicy, 'first-source');
  assert.match(f.nodes['addition-result'].textContent, /Approximate winding residual: 2.000e-12/);
});

for (const value of [0, -1, 1e-10, 1e10, Infinity])
  test(`invalid relative-scale result ${value} makes no construction`, async () => {
    const f = fixture(),
      bank = f.getProject().memories;
    f.setEvaluate(async () => [value]);
    await assert.rejects(f.controls.add(), /domain|finite/);
    assert.equal(f.calls.length, 0);
    assert.equal(f.getProject().memories, bank);
    assert.equal(f.controls.busy, false);
  });

for (const change of [
  (f) => (f.nodes.scale.value = '3'),
  (f) => (f.nodes.source.value = 'derived'),
  (f) => (f.nodes.slot.value = '2'),
  (f) => (f.nodes['fill-rule'].value = 'even-odd'),
  (f) => (f.nodes['color-policy'].value = 'first-source'),
  (f) => (f.getState().notes = 'changed'),
  (f) => (f.getState().view.coordinateUnit = 'ft'),
  (f) => (f.getState().view.documentMetadata = { title: 'late' }),
  (f) => (f.getState().view.elementAnnotations = { entries: [] }),
  (f) => f.swapProject(),
  (f) => f.swapDocument(),
  (f) => f.setExport(true),
  (f) => f.controls.numeric.cancel(),
  (f) => (f.getProject().memories = storeMemory(createMemories(), 1, f.stored)),
]) {
  test('pending numeric memory action rejects changed owners, content, options, export or cancellation', async () => {
    const f = fixture(),
      held = deferred();
    f.setEvaluate(() => held.promise);
    const pending = f.controls.add();
    await tick();
    change(f);
    held.resolve([2]);
    await assert.rejects(pending, /changed|cancel|export|owner|source/i);
    assert.equal(f.calls.length, 0);
    assert.equal(f.controls.busy, false);
  });
}

test('native Blend failure leaves source, memory and documents untouched and retry succeeds', async () => {
  const f = fixture(),
    before = structuredClone(f.getProject()),
    original = structuredClone(f.getState());
  f.setAddition(async () => {
    throw Error('Merge requires a single connected outer shell.');
  });
  await assert.rejects(f.controls.add(1, { blend: true }), /single connected/);
  assert.deepEqual(f.getProject(), before);
  assert.deepEqual(f.getState(), original);
  f.setAddition(async (current, _stored, _label, options) => {
    options.verifyPublication();
    return current.model;
  });
  await f.controls.add(1, { blend: true });
  assert.equal(f.controls.busy, false);
});

test('preparation chains compound and merge recipes atomically with original stored units and geometry', async () => {
  const f = fixture(),
    current = structuredClone(f.getState()),
    stored = structuredClone(f.stored),
    before = structuredClone([current, stored]),
    requests = [];
  current.operationNode = 'old-foreign-node';
  const run = async (op, params, _model, _label, options) => {
    requests.push({ op, params, options });
    return {
      ...params.document,
      cursor: params.document.cursor + 1,
      states: [...params.document.states, structuredClone(current)],
    };
  };
  const doc = await prepareMemoryAddition(run, current, stored, 'Blend memory 1', {
    relativeScale: 0.25,
    blend: true,
    fillRule: 'even-odd',
    colorPolicy: 'first-source',
  });
  assert.equal(doc.states.length, 3);
  assert.equal(doc.cursor, 2);
  assert.equal(doc.states[0].operationNode, undefined);
  assert.deepEqual(
    requests.map((r) => [r.op, r.params.operation]),
    [
      ['recipe-run', 'compound-add'],
      ['recipe-run', 'merge-compound'],
    ]
  );
  assert.deepEqual(requests[0].params.parameters, {
    other: stored.model,
    relative_scale: 0.25,
    source_unit: 'cm',
    target_unit: 'mm',
  });
  assert.deepEqual(requests[1].params.parameters, { fill_rule: 'even-odd', color_policy: 'first-source' });
  assert.deepEqual(stored, before[1]);
  delete current.operationNode;
  assert.deepEqual(current, before[0]);
});

test('preparation refuses unsupported Blend dimensions before any native job', async () => {
  const f = fixture();
  f.stored.model.dimension = 4;
  await assert.rejects(
    prepareMemoryAddition(
      () => {
        throw Error('must not run');
      },
      f.getState(),
      f.stored,
      'Blend',
      { blend: true }
    ),
    /intrinsic 3D/
  );
});

test('late cancellation between Add and Merge discards preparation without starting merge', async () => {
  const f = fixture(),
    held = deferred(),
    controller = new AbortController();
  let calls = 0;
  const run = () => {
    calls++;
    return held.promise;
  };
  const pending = prepareMemoryAddition(run, f.getState(), f.stored, 'Blend', {
    blend: true,
    signal: controller.signal,
  });
  controller.abort();
  held.resolve({});
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('selected Derived snapshot supplies the base for scaled addition without editing its source', async () => {
  const f = fixture(),
    derived = structuredClone(f.getState());
  derived.notes = 'Derived notes';
  derived.model.name = 'Derived';
  f.controls.context.getDerivedState = () => derived;
  f.nodes.source.value = 'derived';
  await f.controls.add();
  assert.equal(f.calls[0].current.model.name, 'Derived');
  assert.equal(f.calls[0].current.notes, 'Derived notes');
  f.calls[0].current.model.vertices[0][0] = 99;
  assert.equal(derived.model.vertices[0][0], 0);
});
