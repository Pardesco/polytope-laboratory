import test from 'node:test';
import assert from 'node:assert/strict';
import { ElementContentControls } from '../ui/element-content-controls.mjs';
import { prepareElementContent } from '../ui/element-content-lifecycle.mjs';
import { Viewer } from '../ui/viewer.js';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
function fixture() {
  const state = {
    model: {
      id: 'source',
      dimension: 2,
      embeddingDimension: 2,
      interpretation: 'generalized-complex',
      vertices: [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [0, 2],
      ],
      faces: [[0, 1, 2]],
      cells: [],
    },
    notes: 'retain',
    view: { angles: Array(6).fill(0) },
  };
  const document = { id: 'source-document', cursor: 0, states: [state] },
    project = { active: 0, documents: [document] },
    viewer = Object.create(Viewer.prototype),
    calls = [];
  viewer.model = state.model;
  const context = {
    getState: () => state,
    getDocument: () => document,
    getProject: () => project,
    isExporting: () => false,
    viewer,
    describe: async () => {
      calls.push('describe');
      return { entries: [] };
    },
    render: async (v, descriptor, options) => {
      options.verifyPublication?.();
      calls.push(descriptor);
      if (descriptor) {
        v.elementContentLayer = { descriptor, destroy() {} };
        return { ready: true };
      }
      return v.setElementContent(null, options);
    },
  };
  const control = Object.assign(Object.create(ElementContentControls.prototype), { context, jobs: new Map() });
  return { state, viewer, context, control, calls };
}

test('absent annotation refresh and offscreen preparation do not enumerate or clone source geometry', async () => {
  const f = fixture(),
    model = f.state.model;
  let walks = 0;
  f.state.model = new Proxy(model, {
    ownKeys() {
      walks++;
      throw Error('Source walk must not run for an absent annotation document');
    },
  });
  f.viewer.model = f.state.model;
  f.context.getDocument = () => {
    throw Error('No construction ownership is needed to clear absent content');
  };
  for (let i = 0; i < 4; i++) {
    f.state.view.angles[2] = i * 12;
    await f.control.refresh();
    await prepareElementContent(f.viewer, f.state);
  }
  assert.equal(walks, 0);
  assert.equal(f.viewer.elementContentLayer, null);
  assert.equal(f.control.jobs.size, 0);
  assert.ok(!f.calls.includes('describe'));
});

test('absent content cancels its old preparation and disposes the existing overlay', async () => {
  const f = fixture(),
    old = { controller: new AbortController() };
  let destroyed = 0;
  f.control.jobs.set(f.viewer, old);
  f.viewer.elementContentLayer = {
    destroy() {
      destroyed++;
    },
  };
  await f.control.refresh();
  assert.equal(old.controller.signal.aborted, true);
  assert.equal(f.control.jobs.size, 0);
  assert.equal(destroyed, 1);
  assert.equal(f.viewer.elementContentLayer, null);
});

test('an aborted or retired empty request cannot cancel current work or clear a visible layer', async () => {
  for (const expired of ['signal', 'current']) {
    const f = fixture(),
      old = { controller: new AbortController() },
      layer = {
        destroy() {
          throw Error('Current overlay must survive');
        },
      };
    f.control.jobs.set(f.viewer, old);
    f.viewer.elementContentLayer = layer;
    const controller = new AbortController();
    if (expired === 'signal') controller.abort();
    await assert.rejects(
      f.control.refresh(f.viewer, { signal: controller.signal, isCurrent: () => expired !== 'current' }),
      { name: 'AbortError' }
    );
    assert.equal(old.controller.signal.aborted, false);
    assert.strictEqual(f.viewer.elementContentLayer, layer);
  }
});

test('a held empty clear cannot erase newly requested content', async () => {
  const f = fixture(),
    entered = deferred(),
    gate = deferred(),
    render = f.context.render;
  f.context.render = async (...args) => {
    entered.resolve();
    await gate.promise;
    return render(...args);
  };
  const pending = f.control.refresh(),
    rejected = assert.rejects(pending, { name: 'AbortError' });
  await entered.promise;
  f.state.view.elementAnnotations = {
    version: 1,
    entries: [{ kind: 'face', index: 0, text: { markup: 'New caption' } }],
    assets: {},
  };
  const layer = {
    destroy() {
      throw Error('Fresh caption must survive');
    },
  };
  f.viewer.elementContentLayer = layer;
  gate.resolve();
  await rejected;
  assert.strictEqual(f.viewer.elementContentLayer, layer);
});

test('removing annotations retires late descriptor failures as cancellation', async () => {
  const f = fixture(),
    entered = deferred(),
    gate = deferred();
  f.state.view.elementAnnotations = { version: 1, entries: [], assets: {} };
  f.context.describe = async () => {
    entered.resolve();
    return gate.promise;
  };
  const pending = f.control.refresh(),
    rejected = assert.rejects(pending, { name: 'AbortError' });
  await entered.promise;
  f.state.view.elementAnnotations = null;
  await f.control.refresh();
  gate.reject(Error('Old descriptor failure'));
  await rejected;
  assert.equal(f.viewer.elementContentLayer, null);
});

test('explicit annotation documents, even empty records, retain the full descriptor and source validation path', async () => {
  const f = fixture();
  f.state.view.elementAnnotations = { version: 1, entries: [], assets: {} };
  await f.control.refresh();
  assert.ok(f.calls.includes('describe'));
  f.control.jobs.clear();
  f.state.model.vertices[0][0] = NaN;
  await assert.rejects(f.control.refresh(), /finite|coordinates/);
  f.state.model.vertices[0][0] = 0;
  f.state.view.elementAnnotations = { version: 99, entries: [], assets: {} };
  f.context.describe = async () => {
    throw Error('Native document version refusal');
  };
  await assert.rejects(f.control.refresh(), /Native document version refusal/);
});

test('Viewer rejects stale clearing before touching the current layer', async () => {
  for (const options of [
    { isCurrent: () => false },
    {
      verifyPublication: () => {
        throw Error('New owner');
      },
    },
    { signal: AbortSignal.abort() },
  ]) {
    const f = fixture(),
      layer = {
        destroy() {
          throw Error('Must not destroy a current layer');
        },
      };
    f.viewer.elementContentLayer = layer;
    await assert.rejects(f.viewer.setElementContent(null, options));
    assert.strictEqual(f.viewer.elementContentLayer, layer);
  }
});

test('an empty clear begun without a workspace cannot erase a newly adopted source', async () => {
  const f = fixture(),
    entered = deferred(),
    gate = deferred(),
    render = f.context.render;
  let state = null;
  f.context.getState = () => state;
  f.context.render = async (...args) => {
    entered.resolve();
    await gate.promise;
    return render(...args);
  };
  const pending = f.control.refresh(),
    rejected = assert.rejects(pending, { name: 'AbortError' });
  await entered.promise;
  state = f.state;
  const layer = {
    destroy() {
      throw Error('New workspace must survive');
    },
  };
  f.viewer.elementContentLayer = layer;
  gate.resolve();
  await rejected;
  assert.strictEqual(f.viewer.elementContentLayer, layer);
});

test('clearing absent content cannot cross a viewer model or net replacement', async () => {
  for (const field of ['model', 'net', 'cellNet'])
    for (const independent of [true, false]) {
      const f = fixture(),
        entered = deferred(),
        gate = deferred(),
        set = f.viewer.setElementContent.bind(f.viewer);
      f.viewer.setElementContent = async (...args) => {
        entered.resolve();
        await gate.promise;
        return set(...args);
      };
      const pending = independent ? prepareElementContent(f.viewer, f.state) : f.control.refresh(),
        rejected = assert.rejects(pending, { name: 'AbortError' });
      await entered.promise;
      f.viewer[field] = { newOwner: true };
      const layer = {
        destroy() {
          throw Error('New presentation must survive');
        },
      };
      f.viewer.elementContentLayer = layer;
      gate.resolve();
      await rejected;
      assert.strictEqual(f.viewer.elementContentLayer, layer);
    }
});

test('independent capture clearing remains guarded when content or ownership changes during its await', async () => {
  const f = fixture(),
    entered = deferred(),
    gate = deferred();
  let current = true;
  const set = f.viewer.setElementContent.bind(f.viewer);
  f.viewer.setElementContent = async (...args) => {
    entered.resolve();
    await gate.promise;
    return set(...args);
  };
  const pending = prepareElementContent(f.viewer, f.state, { isCurrent: () => current }),
    rejected = assert.rejects(pending, { name: 'AbortError' });
  await entered.promise;
  current = false;
  const layer = {
    destroy() {
      throw Error('New capture layer must survive');
    },
  };
  f.viewer.elementContentLayer = layer;
  gate.resolve();
  await rejected;
  assert.strictEqual(f.viewer.elementContentLayer, layer);
});

test('independent clearing retires a late native descriptor failure', async () => {
  const f = fixture(),
    entered = deferred(),
    gate = deferred();
  f.state.view.elementAnnotations = {
    version: 1,
    entries: [{ kind: 'face', index: 0, text: { markup: 'Caption' } }],
    assets: {},
  };
  const pending = prepareElementContent(f.viewer, f.state, {
      describe: async () => {
        entered.resolve();
        return gate.promise;
      },
    }),
    rejected = assert.rejects(pending, { name: 'AbortError' });
  await entered.promise;
  f.state.view.elementAnnotations = null;
  await prepareElementContent(f.viewer, f.state);
  gate.reject(Error('Retired native descriptor failed'));
  await rejected;
  assert.equal(f.viewer.elementContentLayer, null);
});
