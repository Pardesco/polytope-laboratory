export function startupMark(name, clock = globalThis.performance) {
  const key = 'polytope:' + name;
  if (!clock?.getEntriesByName(key).length) clock?.mark(key);
}

// Two frames permit a paint between model publication and secondary work.
export function afterModelPaint({
  frame = globalThis.requestAnimationFrame,
  timer = globalThis.setTimeout,
  clear = globalThis.clearTimeout,
} = {}) {
  return new Promise((resolve) => {
    let finished = false,
      timeout;
    const done = () => {
      if (finished) return;
      finished = true;
      clear(timeout);
      resolve();
    };
    timeout = timer(done, 100);
    if (frame)
      frame(() => {
        if (!finished) frame(done);
      });
  });
}
