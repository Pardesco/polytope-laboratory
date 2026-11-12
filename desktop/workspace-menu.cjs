const keys = ['hasModel', 'canUndo', 'canRedo'];
const modelIds = ['workspace-save', 'workspace-export', 'workspace-image', 'workspace-print', 'workspace-reset'];
function applyWorkspaceMenu(menu, value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    keys.some((key) => typeof value[key] !== 'boolean')
  )
    throw Error('Use boolean workspace availability.');
  const enabled = {
    ...Object.fromEntries(modelIds.map((id) => [id, value.hasModel])),
    'workspace-undo': value.hasModel && value.canUndo,
    'workspace-redo': value.hasModel && value.canRedo,
  };
  if (menu)
    for (const [id, available] of Object.entries(enabled)) {
      const item = menu.getMenuItemById(id);
      if (item) item.enabled = available;
    }
  return enabled;
}
module.exports = { applyWorkspaceMenu };
