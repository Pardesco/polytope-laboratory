/** Independent model opens belong to one project; the newest selection owns
 * focus until the user navigates. Cancel resolves promptly, even with late IPC. */
export const CATALOG_LOADING_LIMITS = Object.freeze({ pending: 8, documents: 100 });
const aborted = Symbol('aborted catalog load');
export class CatalogLoading {
  constructor(context) {
    this.context = context;
    this.pending = new Map();
    this.sequence = 0;
    this.navigation = 0;
  }
  navigationChanged() {
    this.navigation++;
  }
  cancel() {
    const jobs = [...this.pending.values()];
    this.pending.clear();
    for (const job of jobs) job.controller.abort();
    this.context.onChange?.();
  }
  sync() {
    if (
      this.context.isExporting() ||
      [...this.pending.values()].some((job) => job.project !== this.context.getProject())
    )
      this.cancel();
    else this.context.onChange?.();
  }
  open(entry) {
    const c = this.context;
    if ([...this.pending.values()].some((job) => job.project !== c.getProject())) this.cancel();
    if (c.isExporting()) return Promise.reject(Error('Finish or cancel animation export before opening a model.'));
    if (!entry || typeof entry.key !== 'string' || !entry.key || entry.key.length > 4096)
      return Promise.reject(Error('Choose a catalog model.'));
    const key = (entry.external ? 'linked:' : 'catalog:') + entry.key;
    if (this.pending.has(key)) return this.pending.get(key).promise;
    if (this.pending.size >= CATALOG_LOADING_LIMITS.pending)
      return Promise.reject(Error('Finish or cancel the current model loads before opening more.'));
    const project = c.getProject();
    if (project.documents.length + this.pending.size >= CATALOG_LOADING_LIMITS.documents)
      return Promise.reject(Error('A project can contain at most 100 documents.'));
    const job = {
      key,
      entry: { key: entry.key, name: String(entry.name || entry.key), external: entry.external === true },
      project,
      focusState: c.getState(),
      navigation: this.navigation,
      sequence: ++this.sequence,
      controller: new AbortController(),
    };
    const current = () =>
      this.pending.get(key) === job && !job.controller.signal.aborted && c.getProject() === project && !c.isExporting();
    this.pending.set(key, job);
    job.promise = Promise.resolve().then(async () => {
      let cancel;
      try {
        if (!current()) return null;
        const canceled = new Promise((resolve) => {
          cancel = () => resolve(aborted);
          job.controller.signal.addEventListener('abort', cancel, { once: true });
        });
        const model = await Promise.race([c.read(job.entry, { signal: job.controller.signal }), canceled]);
        if (model === aborted || !current()) return null;
        if (!model) throw Error('The catalog returned no model.');
        if (project.documents.length >= CATALOG_LOADING_LIMITS.documents)
          throw Error('A project can contain at most 100 documents.');
        c.publish(model, job.entry, {
          activate:
            project.documents.length === 0 ||
            (job.sequence === this.sequence &&
              job.navigation === this.navigation &&
              (job.focusState === undefined || c.getState() === job.focusState)),
        });
        return model;
      } catch (error) {
        if (!current() || error.name === 'AbortError') return null;
        throw error;
      } finally {
        job.controller.signal.removeEventListener('abort', cancel);
        if (this.pending.get(key) === job) this.pending.delete(key);
        c.onChange?.();
      }
    });
    c.onChange?.();
    return job.promise;
  }
}
