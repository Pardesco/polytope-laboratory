export const TYPE_PALETTE = Object.freeze([
  '#66c2a5',
  '#fc8d62',
  '#8da0cb',
  '#e78ac3',
  '#a6d854',
  '#ffd92f',
  '#e5c494',
  '#b3b3b3',
]);
const cache = new Map();
let revision = 0;
export const elementTypesRevision = () => revision;
export function elementTypesKey(model) {
  return JSON.stringify(model);
}
export function rememberElementTypes(model, result) {
  const key = elementTypesKey(model);
  if (key.length > 2 * 1024 * 1024) return;
  const maps = {};
  if (result.available)
    for (const [kind, types] of Object.entries(result.types)) {
      const count = model[{ vertex: 'vertices', edge: 'edges', face: 'faces', cell: 'cells' }[kind]].length;
      const ids = Array(count).fill(-1);
      for (const type of types) for (const id of type.ids) ids[id] = type.typeId;
      maps[kind] = ids;
    }
  cache.delete(key);
  cache.set(key, { ...result, maps });
  while (cache.size > 4) cache.delete(cache.keys().next().value);
  revision++;
}
export function getElementTypes(model) {
  return cache.get(elementTypesKey(model));
}
export function elementTypeColor(types, mode, face, cell, palette = TYPE_PALETTE) {
  const id = types?.available
    ? types.maps[mode === 'face-type' ? 'face' : 'cell']?.[mode === 'face-type' ? face : cell]
    : undefined;
  return Number.isInteger(id) && id >= 0 ? palette[id % palette.length] : null;
}
