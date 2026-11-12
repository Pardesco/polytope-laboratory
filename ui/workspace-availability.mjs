const modelActions = new Set(['save', 'undo', 'redo', 'reset', 'image', 'export', 'print']);
export const EMPTY_WORKSPACE_GUIDANCE = 'Choose a model from the Library, use New, or Open a project first.';
/** Parent fieldsets gate empty workspaces without overwriting tool limits. */
export class WorkspaceAvailability {
  constructor(context) {
    this.context = context;
    this.last = null;
  }
  sync() {
    const c = this.context,
      source = c.getState(),
      document = c.getDocument(),
      hasModel = !!source?.model;
    for (const group of c.getGroups()) group.disabled = !hasModel;
    c.getHint().hidden = hasModel;
    const value = {
        hasModel,
        canUndo: hasModel && document.cursor > 0,
        canRedo: hasModel && document.cursor < document.states.length - 1,
      },
      signature = JSON.stringify(value);
    if (signature !== this.last) {
      this.last = signature;
      c.publish(value);
    }
    return value;
  }
  run(action, invoke) {
    if (modelActions.has(action) && !this.context.getState()?.model) {
      this.context.notify(EMPTY_WORKSPACE_GUIDANCE);
      return null;
    }
    return invoke();
  }
}
