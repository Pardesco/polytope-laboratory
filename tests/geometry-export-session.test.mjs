import test from 'node:test';
import assert from 'node:assert/strict';
import { GeometryExportSession } from '../ui/geometry-export-session.mjs';
import { numericControlFixture, deferred, flush } from './numeric-control-fixture.mjs';
function fixture() {
  const f = numericControlFixture(Object.prototype, {}),
    selection = { source: 'base', format: 'obj', unit: 'in' },
    calls = [];
  f.context.getGeometry = () => f.context.getState().model;
  f.context.getSelection = () => selection;
  f.context.describe = async () => ({
    formats: ['off', 'json', 'obj', 'stl', 'dxf', 'vrml', 'pov'].map((format) => ({ format, available: true })),
  });
  f.context.prepare = async (model, params) => {
    calls.push(['prepare', params]);
    return {
      model,
      text: 'literal complete exported geometry',
      report: { sourceUnit: params.source_unit, targetUnit: params.target_unit, losses: ['Boundary colors omitted.'] },
    };
  };
  f.context.api = {
    beginGeometryExport: async (params) => {
      calls.push(['begin', params]);
      return { id: 'ticket' };
    },
    writeGeometryExport: async (id, text) => {
      calls.push(['write', id, text]);
      return { path: 'selected.obj' };
    },
    abortGeometryExport: async (id) => {
      calls.push(['abort', id]);
    },
  };
  return { ...f, selection, calls, session: new GeometryExportSession(f.context) };
}
test('review prepares detached intrinsic data, literal units and metadata before the first save dialog', async () => {
  const f = fixture(),
    source = structuredClone(f.state.model);
  f.state.view.documentMetadata = { author: 'Literal author' };
  const result = await f.session.prepare();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][1].include_text, true);
  assert.equal(f.calls[0][1].source_unit, 'mm');
  assert.equal(f.calls[0][1].target_unit, 'in');
  assert.equal(f.calls[0][1].notes, 'Keep source notes');
  assert.deepEqual(f.calls[0][1].document_metadata, { author: 'Literal author' });
  assert.notStrictEqual(result.model, f.state.model);
  assert.deepEqual(await f.session.confirm(), { path: 'selected.obj' });
  assert.deepEqual(
    f.calls.map((c) => c[0]),
    ['prepare', 'begin', 'write']
  );
  assert.equal(f.calls[1][1].defaultName, 'Literal tetrahedron.obj');
  assert.equal(f.calls[2][2], result.text);
  assert.deepEqual(f.state.model, source);
});
test('save is unavailable until review is complete, and native domain refusals never open a file dialog', async () => {
  const f = fixture();
  await assert.rejects(f.session.confirm(), /preview/);
  f.context.describe = async () => ({
    formats: [{ format: 'obj', available: false, reason: 'Intrinsic 4D cannot be OBJ.' }],
  });
  await assert.rejects(f.session.prepare(), /4D/);
  assert.deepEqual(f.calls, []);
});

test('review sends explicit cleared notes and metadata instead of falling back to imported model hints', async () => {
  for (const metadata of [undefined, {}]) {
    const f = fixture();
    f.state.notes = '';
    f.state.model.metadata.documentNotes = 'Old imported notes';
    f.state.model.metadata.documentMetadata = { title: 'Old imported title' };
    if (metadata === undefined) delete f.state.view.documentMetadata;
    else f.state.view.documentMetadata = metadata;
    const before = structuredClone(f.state);
    await f.session.prepare();
    assert.equal(f.calls[0][1].notes, '');
    assert.deepEqual(f.calls[0][1].document_metadata, {});
    assert.deepEqual(f.state, before);
  }
});
test('source, derived geometry, options, units and metadata changes during preparation reject stale output', async () => {
  for (const change of [
    (f) => (f.state.model.vertices[0][0] = 4),
    (f) => (f.state.model.metadata.offColors.faces[0].values[0] = 0.3),
    (f) => (f.state.view.coordinateUnit = 'cm'),
    (f) => (f.state.notes = 'new'),
    (f) => (f.state.view.documentMetadata = { author: 'changed' }),
    (f) => (f.selection.format = 'json'),
    (f) => (f.selection.unit = 'ft'),
    (f) => (f.selection.source = 'derived'),
    (f) => f.setProject({ ...f.project }),
  ]) {
    const f = fixture(),
      gate = deferred(),
      native = f.context.prepare;
    f.context.prepare = async (...args) => {
      const result = await native(...args);
      await gate.promise;
      return result;
    };
    const pending = f.session.prepare();
    await flush();
    change(f);
    gate.resolve();
    await assert.rejects(pending, /changed/);
    assert.equal(f.session.prepared, null);
    assert.equal(f.session.preparing, false);
  }
  const f = fixture(),
    gate = deferred();
  let derived = structuredClone(f.state.model);
  f.context.getGeometry = () => derived;
  const native = f.context.prepare;
  f.context.prepare = async (...args) => {
    const result = await native(...args);
    await gate.promise;
    return result;
  };
  const pending = f.session.prepare();
  await flush();
  derived = structuredClone(derived);
  gate.resolve();
  await assert.rejects(pending, /changed/);
});
test('held save dialogs recheck the reviewed source and abort late tickets before any write', async () => {
  for (const change of [
    (f) => (f.state.model.vertices[0][0] = 7),
    (f) => (f.state.view.coordinateUnit = 'cm'),
    (f) => (f.selection.unit = 'ft'),
    (f) => (f.state.view.documentMetadata = { title: 'new' }),
    (f) => f.setExport(true),
    (f) => f.session.cancel(),
  ]) {
    const f = fixture(),
      gate = deferred();
    await f.session.prepare();
    f.context.api.beginGeometryExport = async () => gate.promise;
    const pending = f.session.confirm();
    await flush();
    change(f);
    gate.resolve({ id: 'late' });
    await assert.rejects(pending, /changed|canceled|export/i);
    assert.equal(
      f.calls.some((c) => c[0] === 'write'),
      false
    );
    assert.deepEqual(f.calls.at(-1), ['abort', 'late']);
  }
});
test('canceled, superseded and failed preparation never clears a newer reviewed output', async () => {
  const f = fixture(),
    gate = deferred(),
    native = f.context.prepare;
  let calls = 0;
  f.context.prepare = async (...args) => {
    const result = await native(...args);
    if (calls++ === 0) await gate.promise;
    return result;
  };
  const old = f.session.prepare();
  await flush();
  f.selection.format = 'json';
  await f.session.prepare();
  const current = f.session.prepared;
  gate.resolve();
  await assert.rejects(old, { name: 'AbortError' });
  assert.strictEqual(f.session.prepared, current);
  assert.equal(current.owner.selection.format, 'json');
});
test('camera motion is independent; duplicate submits and editing during a pending save are refused', async () => {
  const f = fixture(),
    gate = deferred();
  await f.session.prepare();
  f.state.view.camera = { zoom: 4 };
  f.context.api.beginGeometryExport = async () => gate.promise;
  const saving = f.session.confirm();
  await flush();
  await assert.rejects(f.session.confirm(), /current geometry export/);
  await assert.rejects(f.session.prepare(), /current geometry export/);
  gate.resolve({ id: 'ticket' });
  await saving;
  assert.equal(f.calls.filter((c) => c[0] === 'write').length, 1);
  assert.equal(f.state.view.camera.zoom, 4);
});
test('canceled destination keeps the reviewed preview; VRML uses the wrl extension once', async () => {
  const f = fixture();
  f.selection.format = 'vrml';
  f.selection.unit = 'm';
  await f.session.prepare();
  const prepared = f.session.prepared;
  f.context.api.beginGeometryExport = async (params) => {
    assert.equal(params.defaultName, 'Literal tetrahedron.wrl');
    return null;
  };
  assert.equal(await f.session.confirm(), null);
  assert.strictEqual(f.session.prepared, prepared);
  assert.equal(f.session.saving, false);
  assert.equal(f.calls.length, 1);
});
test('a closed or reopened dialog refuses a late save ticket before a close event cancels the session', async () => {
  for (const mode of ['closed', 'reopened']) {
    const f = fixture(),
      gate = deferred();
    let open = true,
      scope = {};
    f.context.isOpen = () => open;
    f.context.getScope = () => scope;
    await f.session.prepare();
    f.context.api.beginGeometryExport = () => gate.promise;
    const saving = f.session.confirm();
    await flush();
    if (mode === 'closed') open = false;
    else scope = {};
    gate.resolve({ id: 'late-scope' });
    await assert.rejects(saving, { name: 'AbortError' });
    assert.equal(
      f.calls.some((call) => call[0] === 'write'),
      false
    );
    assert.deepEqual(f.calls.at(-1), ['abort', 'late-scope']);
  }
});
