const fields = { vertex: 'vertices', edge: 'edges', face: 'faces', cell: 'cells' };
export function hiddenElements(model, value) {
  const empty = () => Object.fromEntries(Object.values(fields).map((k) => [k, []]));
  if (!value || value.sourceFingerprint !== model.fingerprint) return empty();
  if (value.version !== 1 || !value.hidden) throw Error('Unsupported element visibility settings.');
  const result = empty();
  for (const field of Object.values(fields)) {
    const ids = value.hidden[field] ?? [];
    if (!Array.isArray(ids) || ids.some((i) => !Number.isInteger(i) || i < 0 || i >= (model[field]?.length ?? 0)))
      throw Error('Hidden element is outside the source model.');
    result[field] = ids;
  }
  return result;
}
export function setElementsHidden(model, view, kind, ids, hide = true) {
  const field = fields[kind];
  if (!field) throw Error('Choose a source element kind.');
  const hidden = hiddenElements(model, view.elementVisibility),
    set = new Set(hidden[field]);
  if (!Array.isArray(ids) || ids.some((i) => !Number.isInteger(i) || i < 0 || i >= (model[field]?.length ?? 0)))
    throw Error('Choose existing source elements.');
  for (const id of ids)
    if (hide) set.add(id);
    else set.delete(id);
  hidden[field] = [...set].sort((a, b) => a - b);
  view.elementVisibility = { version: 1, sourceFingerprint: model.fingerprint, hidden };
}
export function setComponentHidden(model, view, component, hide) {
  if (!component?.maps) throw Error('Component source maps are unavailable.');
  for (const [kind, field] of Object.entries(fields))
    setElementsHidden(model, view, kind, component.maps[field] ?? [], hide);
}
export function selectionElements(selection) {
  return selection?.ids ?? selection?.indices ?? (Number.isInteger(selection?.index) ? [selection.index] : []);
}
