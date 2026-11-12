const test = require('node:test'),
  assert = require('node:assert/strict'),
  { applyWorkspaceMenu } = require('../desktop/workspace-menu.cjs');
test('native model/history items follow explicit bounded availability and preserve unrelated items', () => {
  const items = new Map(
    ['save', 'export', 'image', 'print', 'reset', 'undo', 'redo'].map((id) => ['workspace-' + id, { enabled: true }])
  );
  items.set('other', { enabled: true });
  const menu = { getMenuItemById: (id) => items.get(id) };
  applyWorkspaceMenu(menu, { hasModel: false, canUndo: true, canRedo: true });
  assert.ok([...items].filter(([id]) => id !== 'other').every(([, item]) => !item.enabled));
  assert.equal(items.get('other').enabled, true);
  applyWorkspaceMenu(menu, { hasModel: true, canUndo: false, canRedo: true });
  assert.equal(items.get('workspace-save').enabled, true);
  assert.equal(items.get('workspace-undo').enabled, false);
  assert.equal(items.get('workspace-redo').enabled, true);
});
test('malformed renderer state is refused before changing menu items; hidden mode needs no menu', () => {
  const menu = {
    getMenuItemById: () => {
      throw Error('Menu accessed for invalid input');
    },
  };
  for (const value of [
    null,
    [],
    {},
    true,
    { hasModel: 1, canUndo: false, canRedo: false },
    { hasModel: true, canUndo: false, canRedo: false, extra: true },
  ])
    assert.throws(() => applyWorkspaceMenu(menu, value), /boolean workspace availability/);
  const state = applyWorkspaceMenu(null, { hasModel: true, canUndo: true, canRedo: false });
  assert.equal(state['workspace-undo'], true);
  assert.equal(state['workspace-redo'], false);
});
