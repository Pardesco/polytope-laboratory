const abort = () => Object.assign(Error('Net printing canceled.'), { name: 'AbortError' });
/** One private prepared document; only an explicit commit opens the print dialog. */
function createNetPrinting({ prepare, print, expiryMs = 300000 } = {}) {
  if (
    typeof prepare !== 'function' ||
    typeof print !== 'function' ||
    !Number.isFinite(expiryMs) ||
    expiryMs <= 0 ||
    expiryMs > 300000
  )
    throw TypeError('Invalid net printing provider.');
  let active = null,
    closed = false;
  const idValue = (id) => {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw TypeError('Invalid net print ID.');
  };
  const destroy = (record) => {
    if (record.window && !record.window.isDestroyed()) record.window.destroy();
  };
  const retire = (record) => {
    record.canceled = true;
    clearTimeout(record.timer);
    if (active === record) active = null;
    destroy(record);
  };
  const check = (record) => {
    if (closed || record.canceled || active !== record) throw abort();
  };
  return {
    async begin(id, params) {
      idValue(id);
      if (closed) throw abort();
      if (active) throw Error('Finish or cancel the current net print first.');
      if (
        !params ||
        typeof params.packed !== 'boolean' ||
        Object.keys(params).length !== 2 ||
        !Object.hasOwn(params, 'content')
      )
        throw TypeError('Invalid net print request.');
      const record = { id, window: null, canceled: false, state: 'preparing' };
      active = record;
      record.timer = setTimeout(() => retire(record), expiryMs);
      record.timer.unref?.();
      try {
        const window = await prepare(params, (window) => {
          check(record);
          record.window = window;
        });
        if (record.window !== window) throw Error('Print provider replaced its prepared window.');
        check(record);
        if (window.isDestroyed()) throw abort();
        record.state = 'ready';
        return { id };
      } catch (error) {
        retire(record);
        throw error;
      }
    },
    async commit(id) {
      idValue(id);
      const record = active;
      if (!record || record.id !== id) throw abort();
      check(record);
      if (record.state !== 'ready') throw Error('Wait for the prepared net before printing.');
      record.state = 'printing';
      clearTimeout(record.timer);
      try {
        if (record.window.isDestroyed()) throw abort();
        return await print(record.window);
      } finally {
        retire(record);
      }
    },
    cancel(id) {
      idValue(id);
      if (active?.id !== id) return false;
      retire(active);
      return true;
    },
    dispose() {
      closed = true;
      if (active) retire(active);
    },
  };
}
module.exports = { createNetPrinting };
