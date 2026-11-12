import test from 'node:test';
import assert from 'node:assert/strict';
import { DualMorphSession } from '../ui/dual-morph-session.mjs';
import { saveAnimationHistory } from '../ui/animation-history.mjs';
import { createSequence } from '../ui/animation.mjs';

const settings = {
  version: 1,
  enabled: true,
  method: 'expansion',
  center: null,
  radius: 1,
  ratio: 0,
  duration: 1,
  loop: false,
};
const fields = [
  'sourceModelId',
  'sourceFingerprint',
  'sourceAttributesSha256',
  'sourceContextSha256',
  'descriptorSha256',
];
async function fixture(configure = true) {
  const model = {
    id: 'tetrahedron',
    fingerprint: 'a'.repeat(64),
    dimension: 3,
    embeddingDimension: 3,
    interpretation: 'convex-polytope',
    vertices: [
      [1, 1, 1],
      [1, -1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
    ],
    edges: [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3],
    ],
    faces: [
      [0, 1, 2],
      [0, 3, 1],
      [0, 2, 3],
      [1, 3, 2],
    ],
    cells: [],
    metadata: { coordinateUnits: 'mm', literal: { asset: 'offline' } },
  };
  const state = {
      model,
      notes: 'literal notes',
      label: 'Source',
      view: { angles: [0, 0, 0, 0, 0, 0], sectionOffset: 0, coordinateUnit: 'mm' },
    },
    doc = { id: 'document', states: [state], cursor: 0 },
    project = { active: 0, documents: [doc] };
  let exporting = false,
    renders = 0;
  const context = {
    getState: () => doc.states[doc.cursor],
    getDocument: () => doc,
    getProject: () => project,
    isExporting: () => exporting,
    prepare: async (m, s, c) => ({
      settings: structuredClone(s),
      sourceModelId: m.id,
      sourceFingerprint: m.fingerprint,
      sourceAttributesSha256: JSON.stringify(m),
      sourceContextSha256: JSON.stringify(c),
      descriptorSha256: 'literal descriptor',
    }),
    evaluate: async (m, p, t) => ({
      ratio: t,
      method: p.settings.method,
      model: structuredClone(m),
      certified: false,
      settings: { ...p.settings, ratio: t },
      binding: Object.fromEntries(fields.map((k) => [k, p[k]])),
    }),
    render: async () => {
      renders++;
    },
    clear() {},
  };
  const session = new DualMorphSession(context);
  if (configure) await session.configure(settings);
  return {
    session,
    state,
    doc,
    project,
    context,
    sequence: createSequence(state.view, 2, 2),
    renders: () => renders,
    setExport: (value) => {
      exporting = value;
    },
  };
}

test('only the exact owned animation-history append keeps the prepared model and native owner valid', async () => {
  const f = await fixture(),
    before = structuredClone(f.state),
    prepared = f.session.prepared,
    owner = f.session.owner;
  assert.equal(
    f.session.commitAnimationHistory(() => saveAnimationHistory(f.doc, f.state, f.sequence)),
    true
  );
  assert.notStrictEqual(f.session.owner, owner);
  assert.strictEqual(f.session.prepared, prepared);
  assert.deepEqual(f.doc.states[0], before);
  assert.strictEqual(f.doc.states[1], f.state);
  f.session.checked();
  await f.session.seek(0.5);
  assert.equal(f.state.view.dualMorph.ratio, 0.5);
  f.doc.cursor = 0;
  assert.throws(() => f.session.seek(0.25), /changed/);
});

test('an unchanged sequence remains a no-op and an unprepared morph does not interfere with animation history', async () => {
  const f = await fixture();
  f.session.commitAnimationHistory(() => saveAnimationHistory(f.doc, f.state, f.sequence));
  const states = f.doc.states,
    owner = f.session.owner;
  assert.equal(
    f.session.commitAnimationHistory(() => saveAnimationHistory(f.doc, f.state, f.sequence)),
    false
  );
  assert.strictEqual(f.doc.states, states);
  assert.strictEqual(f.session.owner, owner);
  const g = await fixture(false);
  assert.equal(
    g.session.commitAnimationHistory(() => saveAnimationHistory(g.doc, g.state, g.sequence)),
    true
  );
  assert.equal(g.doc.cursor, 1);
});

for (const [name, change] of [
  ['notes', (f) => (f.state.notes = 'changed')],
  ['units', (f) => (f.state.view.coordinateUnit = 'cm')],
  ['model attributes', (f) => (f.state.model.metadata.literal.asset = 'changed')],
  ['morph settings', (f) => (f.state.view.dualMorph.radius = 2)],
  ['annotations', (f) => (f.state.view.elementAnnotations = {})],
  ['unrelated view fields', (f) => (f.state.view.angles[0] = 42)],
  ['predecessor snapshot', (f) => (f.doc.states[0].notes = 'forged')],
  ['source identity', (f) => (f.doc.states[f.doc.cursor] = structuredClone(f.state))],
  ['history layout', (f) => f.doc.states.unshift(structuredClone(f.state))],
])
  test(`a history append cannot authorize changed ${name}`, async () => {
    const f = await fixture();
    assert.throws(
      () =>
        f.session.commitAnimationHistory(() => {
          saveAnimationHistory(f.doc, f.state, f.sequence);
          change(f);
          return true;
        }),
      /changed|unexpected|again/i
    );
    assert.equal(f.session.prepared, null);
  });

test('a pre-edit held native frame cannot publish after the authorized cursor change', async () => {
  const f = await fixture(),
    evaluate = f.context.evaluate;
  let release;
  f.context.evaluate = (...args) =>
    new Promise((resolve) => {
      release = async () => resolve(await evaluate(...args));
    });
  const pending = f.session.seek(0.5);
  await new Promise((resolve) => setImmediate(resolve));
  const before = f.renders();
  f.session.commitAnimationHistory(() => saveAnimationHistory(f.doc, f.state, f.sequence));
  await release();
  await assert.rejects(pending, /canceled|cancelled|superseded/i);
  assert.equal(f.renders(), before);
  f.context.evaluate = evaluate;
  await f.session.seek(0.25);
  assert.equal(f.state.view.dualMorph.ratio, 0.25);
});

test('export and unrelated manual cursor moves never receive a history authorization', async () => {
  const f = await fixture();
  let called = false;
  f.setExport(true);
  assert.throws(
    () =>
      f.session.commitAnimationHistory(() => {
        called = true;
      }),
    /export/
  );
  assert.equal(called, false);
  f.setExport(false);
  f.doc.states = [...f.doc.states];
  assert.throws(
    () =>
      f.session.commitAnimationHistory(() => {
        called = true;
      }),
    /changed/
  );
  assert.equal(called, false);
});

test('authorized history branches discard only the old future while preserving the selected source', async () => {
  const f = await fixture(false),
    past = structuredClone(f.state),
    future = structuredClone(f.state);
  f.doc.states = [past, f.state, future];
  f.doc.cursor = 1;
  await f.session.configure(settings);
  f.session.commitAnimationHistory(() => saveAnimationHistory(f.doc, f.state, f.sequence));
  assert.equal(f.doc.cursor, 2);
  assert.strictEqual(f.doc.states[0], past);
  assert.strictEqual(f.doc.states[2], f.state);
  assert.equal(f.doc.states.includes(future), false);
  f.session.checked();
});

test('the verified owner follows the native 200-state truncation rule', async () => {
  const f = await fixture(false);
  f.doc.states = [...Array.from({ length: 199 }, () => structuredClone(f.state)), f.state];
  f.doc.cursor = 199;
  await f.session.configure(settings);
  const firstRetained = f.doc.states[1];
  f.session.commitAnimationHistory(() => saveAnimationHistory(f.doc, f.state, f.sequence));
  assert.equal(f.doc.states.length, 200);
  assert.strictEqual(f.doc.states[0], firstRetained);
  assert.strictEqual(f.doc.states[199], f.state);
  f.session.checked();
});
