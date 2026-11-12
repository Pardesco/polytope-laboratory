/** Cancellation owns the renderer reply as well as the native process. */
const aborted = () => Object.assign(Error('Computation canceled.'), { name: 'AbortError' });
export class NativeJobs {
  constructor(context) {
    this.context = context;
    this.pending = new Map();
  }
  cancel() {
    for (const job of [...this.pending.values()]) job.cancel();
  }
  async run(invoke, label, { signal, onStatusOwner } = {}) {
    if (signal?.aborted) throw aborted();
    const c = this.context,
      id = c.id(),
      start = c.now(),
      owner = c.start(label),
      job = { label, start, canceled: false };
    // An optional observer can retain this operation's status token without
    // granting an older completion authority over a newer action's message.
    onStatusOwner?.(owner);
    let rejectCancel;
    const canceled = new Promise((_resolve, reject) => {
      rejectCancel = reject;
    });
    const finish = () => {
      c.settle?.(owner);
      signal?.removeEventListener('abort', job.cancel);
      if (this.pending.get(id) === job) {
        this.pending.delete(id);
        c.change?.();
      }
    };
    job.cancel = () => {
      if (job.canceled) return;
      job.canceled = true;
      finish();
      try {
        Promise.resolve(c.cancel(id)).catch(() => {});
      } catch {}
      rejectCancel(aborted());
    };
    this.pending.set(id, job);
    signal?.addEventListener('abort', job.cancel, { once: true });
    c.change?.();
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => {
          if (job.canceled) throw aborted();
          return invoke(id);
        }),
        canceled,
      ]);
      if (job.canceled) throw aborted();
      const elapsed = c.now() - start;
      c.complete(
        owner,
        c.format
          ? c.format(label, { phase: 'complete', elapsed, result })
          : `${label} completed in ${(elapsed / 1000).toFixed(2)} s`,
        { label, elapsed, result }
      );
      return result;
    } catch (error) {
      if (job.canceled) throw aborted();
      throw error;
    } finally {
      finish();
    }
  }
}
