import { appendGeneratedTranches } from './goursat-wythoff-controls.mjs';
import { appendSymmetryReceiptLink } from './symmetry-evidence-controls.mjs';
import { CorpusReceiptControls } from './corpus-receipt-controls.mjs';
export function coverageLabel(group) {
  const denominator = group.required === null ? 'unknown total' : group.required.toLocaleString();
  return `${group.label}: ${group.qualifiedIdentities.toLocaleString()} / ${denominator} qualified; ${group.mappedIdentities.toLocaleString()} named source matches`;
}

export class CorpusReconciliationControls {
  constructor({ document, before, run, guard = (fn) => fn, open }) {
    Object.assign(this, { document, run, open });
    this.sequence = 0;
    this.loaded = false;
    this.guard = guard;
    const make = (tag, id, text) => {
      const node = document.createElement(tag);
      if (id) node.id = id;
      if (text) node.textContent = text;
      return node;
    };
    this.make = make;
    this.root = make('details', 'library-corpus');
    this.root.append(make('summary', null, 'Corpus coverage'));
    this.root.append(
      make('p', null, 'Named identities and source evidence. Geometry checks use numerical tolerances.')
    );
    this.refresh = make('button', 'corpus-refresh', 'Review coverage');
    this.refresh.className = 'wide';
    this.status = make('output', 'corpus-status');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.summary = make('div', 'corpus-summary');
    this.group = make('select', 'corpus-group');
    this.group.setAttribute('aria-label', 'Corpus family');
    this.identity = make('select', 'corpus-identity');
    this.identity.setAttribute('aria-label', 'Named corpus identity');
    this.realization = make('select', 'corpus-realization');
    this.realization.setAttribute('aria-label', 'Source realization');
    this.detail = make('div', 'corpus-detail');
    this.audit = make('button', 'corpus-verify', 'Check numerical geometry');
    this.audit.className = 'wide';
    this.audit.disabled = true;
    this.openButton = make('button', 'corpus-open', 'Open source model');
    this.openButton.className = 'wide';
    this.openButton.disabled = true;
    this.root.append(
      this.refresh,
      this.status,
      this.summary,
      this.group,
      this.identity,
      this.realization,
      this.detail,
      this.openButton,
      this.audit
    );
    before.before(this.root);
    this.refresh.onclick = guard(() => this.load());
    this.group.onchange = guard(() => this.load());
    this.identity.onchange = () => {
      this.cancel();
      this.renderIdentity();
    };
    this.realization.onchange = () => {
      this.cancel();
      this.renderIdentity(false);
    };
    this.audit.onclick = guard(() => this.verify());
    this.openButton.onclick = guard(() => {
      const row = this.selectedRealization();
      if (row?.catalogKey) return open({ key: row.catalogKey, name: row.name });
    });
    this.root.ontoggle = guard(() => {
      if (this.root.open && !this.loaded && !this.controller) return this.load();
    });
    this.receipts = new CorpusReceiptControls({
      document,
      root: this.root,
      run,
      guard,
      getSelection: () => ({
        identity: this.selectedIdentity()?.id,
        realization: this.selectedRealization()?.id,
        available: Boolean(
          !this.controller &&
            this.selectedRealization()?.catalogKey &&
            this.selectedRealization()?.status === 'mapped-unverified'
        ),
      }),
    });
  }
  cancel() {
    this.sequence++;
    this.controller?.abort();
    this.controller = null;
    this.busy(false);
    this.receipts?.cancel();
  }
  busy(value) {
    const row = this.selectedRealization(),
      unavailable = !row?.catalogKey || row.status !== 'mapped-unverified';
    this.refresh.disabled = value;
    this.audit.disabled = value || unavailable;
    this.openButton.disabled = value || unavailable;
    this.root.setAttribute('aria-busy', String(value));
    this.receipts?.sync();
  }
  selectedIdentity() {
    return this.data?.identities?.find((row) => row.id === this.identity.value);
  }
  selectedRealization() {
    return this.selectedIdentity()?.realizations.find((row) => row.id === this.realization.value);
  }
  options(select, rows, value) {
    select.replaceChildren();
    for (const [id, label] of rows) {
      const node = this.make('option', null, label);
      node.value = id;
      select.append(node);
    }
    select.value = rows.some((row) => row[0] === value) ? value : (rows[0]?.[0] ?? '');
    select.disabled = !rows.length;
  }
  async request(params, label, publish) {
    this.cancel();
    const sequence = this.sequence,
      controller = new AbortController();
    this.controller = controller;
    this.busy(true);
    this.status.textContent = label + '…';
    try {
      const result = await this.run('corpus-reconciliation', params, null, label, { signal: controller.signal });
      if (sequence !== this.sequence || controller.signal.aborted) return;
      publish(result);
    } catch (error) {
      if (sequence !== this.sequence || controller.signal.aborted) return;
      this.status.textContent = 'Corpus review failed: ' + error.message;
      throw error;
    } finally {
      if (sequence === this.sequence) {
        this.controller = null;
        this.busy(false);
      }
    }
  }
  load() {
    const group = this.group.value || 'regular4',
      identity = this.identity.value;
    return this.request({ group }, 'Review corpus coverage', (data) => {
      this.data = data;
      this.loaded = true;
      this.options(
        this.group,
        data.groups.map((g) => [g.id, g.label]),
        group
      );
      this.options(
        this.identity,
        data.identities.map((r) => [r.id, r.name]),
        identity
      );
      this.summary.replaceChildren();
      for (const row of data.groups) this.summary.append(this.make('p', null, coverageLabel(row)));
      appendGeneratedTranches(this, data);
      const inventories = this.make('details'),
        heading = this.make('summary', null, 'Source inventory and blockers');
      inventories.append(heading);
      for (const source of data.sources)
        inventories.append(
          this.make(
            'p',
            null,
            `${source.id}: ${source.actualCount.toLocaleString()} records${source.supplementalCount ? ' + ' + source.supplementalCount + ' supplemental' : ''} (${source.status}); license ${source.license.status}.`
          )
        );
      for (const source of data.externalInventories)
        inventories.append(
          this.make(
            'p',
            null,
            `${source.id}: ${source.entryCount.toLocaleString()} inventoried files (${source.status}); license ${source.licenseStatus}. File totals are not coverage.`
          )
        );
      for (const blocker of data.blockers) inventories.append(this.make('p', null, blocker));
      this.summary.append(inventories);
      this.renderIdentity();
      if (!data.identities.length) {
        this.detail.replaceChildren();
        for (const candidate of data.candidateGroups ?? []) {
          const block = this.make('details');
          block.append(
            this.make(
              'summary',
              null,
              `${candidate.id}: ${candidate.records.length.toLocaleString()} unmatched source realizations`
            ),
            this.make('p', null, candidate.basis)
          );
          const list = this.make('div');
          list.className = 'corpus-candidates';
          for (const row of candidate.records)
            list.append(
              this.make(
                'p',
                null,
                `${row.name} — ${row.key} (${row.status}; source ${row.sourceStatus ?? 'unverified'}; ${row.identityStatus})`
              )
            );
          block.append(list);
          this.detail.append(block);
        }
        this.status.textContent =
          'Baseline names are unresolved. Candidate records do not count as qualified identities.';
      }
    });
  }
  renderIdentity(reset = true) {
    const row = this.selectedIdentity();
    if (reset)
      this.options(
        this.realization,
        (row?.realizations ?? []).map((r) => [r.id, r.name + ' — ' + r.source]),
        this.realization.value
      );
    const realization = this.selectedRealization();
    this.detail.replaceChildren();
    this.receipts?.cancel();
    this.openButton.disabled = !realization?.catalogKey || realization.status !== 'mapped-unverified';
    this.audit.disabled = this.openButton.disabled || Boolean(this.controller);
    if (!row) {
      this.status.textContent = 'No named baseline identities supplied for this family.';
      return;
    }
    this.detail.append(
      this.make('p', null, row.name + ' — ' + row.status),
      this.make('p', null, row.identityEvidence.basis)
    );
    if (row.dualOf) this.detail.append(this.make('p', null, 'Dual relationship: ' + row.dualOf));
    if (realization) {
      this.detail.append(
        this.make('p', null, `Realization: ${realization.id}`),
        this.make('p', null, `Coordinates: ${realization.coordinateSet.id}. ${realization.coordinateSet.comparison}`),
        this.make('p', null, `Topology: ${realization.topology.id}. ${realization.topology.comparison}`),
        this.make(
          'p',
          null,
          `Classification: ${realization.classification.label ?? 'unresolved'} (${realization.classification.status}). License: ${realization.license.status}.`
        )
      );
      const evidence = this.make('details');
      evidence.append(this.make('summary', null, 'Retained evidence'));
      const pre = this.make('pre');
      pre.textContent = JSON.stringify(realization, null, 2);
      evidence.append(pre);
      this.detail.append(evidence);
    }
    for (const blocker of row.blockers) this.detail.append(this.make('p', null, blocker));
    appendSymmetryReceiptLink(this, realization);
    this.status.textContent = realization
      ? 'Source match retained; release qualification pending.'
      : 'No mapped source. A general dual operation does not satisfy this identity obligation.';
  }
  verify() {
    const identity = this.selectedIdentity(),
      realization = this.selectedRealization();
    if (!identity || !realization?.catalogKey || realization.status !== 'mapped-unverified') return;
    return this.request(
      { identity: identity.id, realization: realization.id, verify: true },
      'Check corpus geometry',
      (data) => {
        this.renderIdentity(false);
        const audit = data.audit;
        this.status.textContent = `Numerical audit: ${audit.status}. Identity qualification remains pending.`;
        const pre = this.make('pre', 'corpus-audit');
        pre.textContent = JSON.stringify(audit, null, 2);
        this.detail.append(pre);
      }
    );
  }
}
