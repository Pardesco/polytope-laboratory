export async function reviewProjectOpen(result, dirty, confirm) {
  if (result?.project && dirty && !(await confirm())) return null;
  return result;
}
export class DesktopFiles {
  constructor({ api, open, isOpening, notify, onError, host, document: dom = globalThis.document }) {
    Object.assign(this, { api, open, isOpening, notify, onError, dom });
    this.ready = false;
    this.pending = null;
    this.refreshSequence = 0;
    if (host) {
      this.section = dom.createElement('section');
      this.section.id = 'welcome-recent-section';
      const title = dom.createElement('h2');
      title.textContent = 'Open Recent';
      this.list = dom.createElement('div');
      this.list.id = 'welcome-recent';
      this.list.className = 'welcome-links';
      this.message = dom.createElement('p');
      this.message.id = 'welcome-recent-status';
      this.message.setAttribute('role', 'status');
      this.section.append(title, this.list, this.message);
      host.after(this.section);
    }
    api.onOpenAvailable?.(() => {
      if (this.ready) this.pump();
    });
    api.onRecentFilesChanged?.(() => this.refresh());
  }
  async refresh() {
    const sequence = ++this.refreshSequence;
    try {
      const result = await this.api.recentFiles?.();
      if (!result) return;
      if (result.message) {
        this.notice = result.message;
        this.notify(result.message);
      }
      if (sequence !== this.refreshSequence) {
        if (this.message && this.notice) this.message.textContent = this.notice;
        return;
      }
      if (!this.list) return;
      this.list.replaceChildren();
      for (const [index, file] of result.files.entries()) {
        const button = this.dom.createElement('button');
        button.id = 'welcome-recent-' + index;
        button.textContent = file.label;
        button.title = file.path;
        button.onclick = () =>
          this.api.requestRecent(file.id).catch((error) => {
            this.onError(error);
            this.refresh();
          });
        this.list.append(button);
      }
      this.message.textContent =
        this.notice ||
        (!result.files.length ? 'No recent files yet. Open a project or geometry file from File → Open.' : '');
    } catch (error) {
      this.onError(error);
    }
  }
  async start() {
    this.ready = true;
    await this.refresh();
    return this.pump();
  }
  pump() {
    if (this.pending) return this.pending;
    this.pending = this.drain()
      .catch((error) => this.onError(error))
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
  async drain() {
    while (this.ready) {
      while (this.isOpening()) await new Promise((resolve) => setTimeout(resolve, 100));
      const token = await this.api.takeOpenRequest?.();
      if (!token) return;
      try {
        while (this.isOpening()) await new Promise((resolve) => setTimeout(resolve, 100));
        await this.open(token);
      } catch (error) {
        this.onError(error);
      } finally {
        await this.api.discardOpenRequest?.(token);
      }
    }
  }
}
