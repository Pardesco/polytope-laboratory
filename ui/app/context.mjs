export function createAppContext(read, write) {
  return Object.defineProperties(
    {},
    Object.fromEntries(Object.entries(read).map(([name, get]) => [name, { enumerable: true, get, set: write[name] }]))
  );
}
