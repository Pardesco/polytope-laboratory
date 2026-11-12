import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceAvailability, EMPTY_WORKSPACE_GUIDANCE } from '../ui/workspace-availability.mjs';
function fixture() {
  let source, document;
  const child = { disabled: true },
    groups = [{ disabled: true, child }, { disabled: true }],
    hint = { hidden: false },
    published = [],
    messages = [];
  const availability = new WorkspaceAvailability({
    getState: () => source,
    getDocument: () => document,
    getGroups: () => groups,
    getHint: () => hint,
    publish: (v) => published.push(v),
    notify: (s) => messages.push(s),
  });
  return {
    availability,
    groups,
    child,
    hint,
    published,
    messages,
    open: () => {
      source = { model: { id: 'cube' } };
      document = { cursor: 0, states: [source] };
      return document;
    },
    clear: () => {
      source = undefined;
      document = undefined;
    },
  };
}
test('empty workspace gates parent groups and publishes bounded menu state once', () => {
  const f = fixture();
  assert.deepEqual(f.availability.sync(), { hasModel: false, canUndo: false, canRedo: false });
  f.availability.sync();
  assert.equal(f.published.length, 1);
  assert.equal(f.hint.hidden, false);
  assert.ok(f.groups.every((g) => g.disabled));
});
test('opening a model restores group availability without overwriting disabled child capabilities', () => {
  const f = fixture();
  f.availability.sync();
  const document = f.open();
  f.availability.sync();
  assert.ok(f.groups.every((g) => !g.disabled));
  assert.equal(f.child.disabled, true);
  assert.equal(f.hint.hidden, true);
  document.states.push({ model: { id: 'dual' } });
  document.cursor = 1;
  assert.deepEqual(f.availability.sync(), { hasModel: true, canUndo: true, canRedo: false });
  document.cursor = 0;
  assert.deepEqual(f.availability.sync(), { hasModel: true, canUndo: false, canRedo: true });
  f.clear();
  f.availability.sync();
  assert.equal(f.child.disabled, true);
  assert.ok(f.groups.every((g) => g.disabled));
});
test('model menu/direct actions refuse empty state before invoking work or dialogs; global actions remain usable', () => {
  const f = fixture(),
    calls = [];
  for (const action of ['save', 'undo', 'redo', 'reset', 'image', 'export', 'print'])
    assert.equal(
      f.availability.run(action, () => calls.push(action)),
      null
    );
  assert.deepEqual(calls, []);
  assert.ok(f.messages.every((s) => s === EMPTY_WORKSPACE_GUIDANCE));
  for (const action of ['new', 'open', 'recover', 'help', 'fullscreen'])
    f.availability.run(action, () => calls.push(action));
  assert.deepEqual(calls, ['new', 'open', 'recover', 'help', 'fullscreen']);
  f.open();
  assert.equal(
    f.availability.run('save', () => 42),
    42
  );
});
