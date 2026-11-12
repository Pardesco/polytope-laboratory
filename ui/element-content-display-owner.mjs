// Detached literal snapshots for pose ownership. Strings are immutable, so keep
// their values without copying/encoding embedded PNG bytes on each angle update.
const unsupported = Symbol('unsupported display value');
const snapshotKeys = new WeakMap();
const record = (value) =>
  Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
const primitive = (value) =>
  value === null ||
  value === undefined ||
  typeof value === 'string' ||
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isFinite(value));

export function snapshotDisplayValue(value) {
  const ancestors = new Set();
  function capture(current) {
    if (primitive(current)) return current;
    if (typeof current !== 'object' || !record(current) || ancestors.has(current)) return unsupported;
    ancestors.add(current);
    const result = Array.isArray(current) ? new Array(current.length) : Object.create(null);
    const keys = Object.keys(current);
    for (const key of keys) {
      const property = Object.getOwnPropertyDescriptor(current, key);
      if (!property || !Object.hasOwn(property, 'value')) {
        ancestors.delete(current);
        return unsupported;
      }
      const child = capture(property.value);
      if (child === unsupported) {
        ancestors.delete(current);
        return unsupported;
      }
      Object.defineProperty(result, key, { value: child, enumerable: true, writable: true, configurable: true });
    }
    snapshotKeys.set(result, keys);
    ancestors.delete(current);
    return result;
  }
  return capture(value);
}

export function matchesDisplayValue(current, snapshot) {
  if (snapshot === unsupported) return false;
  if (current === snapshot) return true;
  if (snapshot === null || typeof snapshot !== 'object') return false;
  if (
    current === null ||
    typeof current !== 'object' ||
    !record(current) ||
    Array.isArray(current) !== Array.isArray(snapshot)
  )
    return false;
  if (Array.isArray(current) && current.length !== snapshot.length) return false;
  const keys = Object.keys(current),
    expected = snapshotKeys.get(snapshot);
  if (keys.length !== expected.length) return false;
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    if (key !== expected[index] || !matchesDisplayValue(current[key], snapshot[key])) return false;
  }
  return true;
}
