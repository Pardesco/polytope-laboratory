import { publishBoundedExport } from './bounded-export.mjs';

export const RECEIPT_BYTES = 2 * 1024 * 1024;
export const emptyReceiptBundle = () => ({ format: 'polytope-corpus-receipts', schemaVersion: 2, receipts: [] });
export function parseReceiptText(raw) {
  if (new TextEncoder().encode(raw).length > RECEIPT_BYTES) throw Error('Receipt JSON exceeds 2 MiB.');
  return raw.trim() ? JSON.parse(raw) : emptyReceiptBundle();
}

export class CorpusReceiptControls {
  constructor({ document, root, run, guard = (fn) => fn, getSelection }) {
    Object.assign(this, { run, getSelection });
    this.sequence = 0;
    const make = (tag, id, text) => {
      const node = document.createElement(tag);
      if (id) node.id = id;
      if (text) node.textContent = text;
      return node;
    };
    this.make = make;
    this.root = make('details', 'corpus-receipts');
    this.root.append(make('summary', null, 'Corpus receipts — evidence and review gates'));
    this.root.append(
      make(
        'p',
        null,
        'Version 2 retains evidence separately from the source inventory. Accepted evidence requires independent human review before baseline qualification. Imported files cannot register reviewers.'
      )
    );
    this.prepare = make('button', 'corpus-receipt-prepare', 'Prepare selected evidence');
    this.prepare.className = 'wide';
    this.input = make('textarea', 'corpus-receipt-json');
    this.input.rows = 8;
    this.input.maxLength = RECEIPT_BYTES;
    this.input.setAttribute('aria-label', 'Version 2 corpus receipt bundle JSON');
    this.input.spellcheck = false;
    const label = make('label', null, 'Import evidence JSON');
    label.htmlFor = 'corpus-receipt-file';
    this.file = make('input', 'corpus-receipt-file');
    this.file.type = 'file';
    this.file.accept = '.json,application/json';
    this.check = make('button', 'corpus-receipt-check', 'Check receipt gates');
    this.check.className = 'wide';
    this.save = make('button', 'corpus-receipt-save', 'Save evidence JSON');
    this.save.className = 'wide';
    this.status = make('output', 'corpus-receipt-status');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.result = make('div', 'corpus-receipt-results');
    this.root.append(this.prepare, label, this.file, this.input, this.check, this.save, this.status, this.result);
    root.append(this.root);
    this.prepare.onclick = guard(() => this.prepareSelected());
    this.check.onclick = guard(() => this.evaluate());
    this.save.onclick = guard(() => this.export());
    this.file.onchange = guard(() => this.importFile());
    this.input.oninput = () => this.cancel();
    this.sync();
  }
  sync() {
    const selected = this.getSelection(),
      busy = Boolean(this.controller);
    this.prepare.disabled = busy || !selected?.identity || !selected?.realization || !selected.available;
    this.check.disabled = busy;
    this.save.disabled = busy || !this.input.value?.trim() || !this.api;
    this.root.setAttribute('aria-busy', String(busy));
  }
  cancel() {
    this.sequence++;
    this.controller?.abort();
    this.controller = null;
    this.result.replaceChildren();
    this.status.textContent = 'Receipt results need a current check.';
    this.sync();
  }
  async request(params, label, publish) {
    this.cancel();
    const sequence = this.sequence,
      controller = new AbortController();
    this.controller = controller;
    this.sync();
    this.status.textContent = label + '…';
    try {
      const data = await this.run('corpus-receipts', params, null, label, { signal: controller.signal });
      if (this.sequence !== sequence || controller.signal.aborted) return;
      publish(data);
    } catch (error) {
      if (this.sequence !== sequence || controller.signal.aborted) return;
      this.status.textContent = 'Receipt check failed: ' + error.message;
      throw error;
    } finally {
      if (this.sequence === sequence) {
        this.controller = null;
        this.sync();
      }
    }
  }
  prepareSelected() {
    const selected = this.getSelection();
    if (!selected?.available) return;
    return this.request(
      { action: 'prepare', identity: selected.identity, realization: selected.realization },
      'Prepare numerical evidence',
      (data) => {
        this.input.value = JSON.stringify(data.bundle, null, 2);
        this.status.textContent =
          'Prepared numerical evidence with separate coordinate and topology hashes. Classification, chirality, license and baseline review remain pending.';
      }
    );
  }
  evaluate() {
    let bundle;
    try {
      bundle = parseReceiptText(this.input.value ?? '');
    } catch (error) {
      this.cancel();
      this.status.textContent = 'Invalid receipt JSON: ' + error.message;
      throw error;
    }
    return this.request({ bundle }, 'Check corpus receipt gates', (data) => {
      const counts = { accepted: 0, rejected: 0, stale: 0 };
      for (const row of data.receipts) counts[row.status]++;
      this.status.textContent = `${counts.accepted} accepted evidence; ${counts.rejected} rejected; ${counts.stale} stale. ${data.trustedReviewers} trusted reviewers. Acceptance is not human approval.`;
      for (const group of data.groups)
        this.result.append(
          this.make(
            'p',
            null,
            `${group.label}: ${group.qualifiedIdentities} / ${group.required ?? 'unknown total'} qualified baseline identities (v2).`
          )
        );
      for (const blocker of data.blockers) this.result.append(this.make('p', null, blocker));
      for (const row of data.receipts) {
        const details = this.make('details');
        details.append(
          this.make('summary', null, `${row.id}: ${row.status}; baseline ${row.qualified ? 'qualified' : 'pending'}`)
        );
        for (const blocker of row.blockers) details.append(this.make('p', null, blocker));
        const pre = this.make('pre');
        pre.textContent = JSON.stringify(row, null, 2);
        details.append(pre);
        this.result.append(details);
      }
      this.result.append(this.make('p', null, data.scope));
    });
  }
  async importFile() {
    this.cancel();
    const sequence = this.sequence,
      file = this.file.files?.[0];
    if (!file) return;
    try {
      if (file.size > RECEIPT_BYTES) throw Error('Receipt JSON exceeds 2 MiB.');
      const raw = await file.text();
      if (sequence !== this.sequence) return;
      parseReceiptText(raw);
      this.input.value = raw;
      this.status.textContent =
        'Evidence imported for this session. Check receipt gates to evaluate current pins and review.';
      this.sync();
    } catch (error) {
      if (sequence !== this.sequence) return;
      this.status.textContent = 'Receipt import failed: ' + error.message;
      throw error;
    } finally {
      if (sequence === this.sequence) this.file.value = '';
    }
  }
  async export() {
    if (!this.api) return;
    const raw = this.input.value;
    parseReceiptText(raw);
    this.cancel();
    const sequence = this.sequence,
      controller = new AbortController();
    this.controller = controller;
    this.sync();
    const verifyPublication = () => {
      if (sequence !== this.sequence || this.input.value !== raw)
        throw Error('Receipt evidence changed during export.');
    };
    try {
      const result = await publishBoundedExport(this.api, 'json', raw, {
        signal: controller.signal,
        verifyPublication,
        defaultName: 'Corpus evidence v2',
      });
      if (sequence === this.sequence)
        this.status.textContent = result
          ? 'Evidence JSON saved; review approvals are maintained separately.'
          : 'Evidence export canceled.';
      return result;
    } catch (error) {
      if (sequence !== this.sequence || controller.signal.aborted) return;
      this.status.textContent = 'Receipt export failed: ' + error.message;
      throw error;
    } finally {
      if (sequence === this.sequence) {
        this.controller = null;
        this.sync();
      }
    }
  }
}
