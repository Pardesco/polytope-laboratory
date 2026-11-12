export class ClassificationQualificationControls {
  constructor({ document, before, run, guard = (fn) => fn, open }) {
    Object.assign(this, { run, open });
    this.sequence = 0;
    this.make = (tag, id, text) => {
      const node = document.createElement(tag);
      if (id) node.id = id;
      if (text) node.textContent = text;
      return node;
    };
    const make = this.make;
    this.root = make('details', 'library-classification');
    this.root.append(make('summary', null, 'Specialized relationships'));
    this.root.append(
      make(
        'p',
        null,
        'Duals, near misses, Stewart toroids and 4D classifications. Review recorded numerical evidence or recheck the current source.'
      )
    );
    this.tranche = make('select', 'classification-tranche');
    this.tranche.setAttribute('aria-label', 'Classification tranche');
    for (const [value, label] of [
      ['3d', '3D duals and specialized polyhedra'],
      ['4d', '4D scaliforms, compounds and regiments'],
    ]) {
      const o = make('option', null, label);
      o.value = value;
      this.tranche.append(o);
    }
    this.tranche.value = '3d';
    this.refresh = make('button', 'classification-refresh', 'Review relationships');
    this.refresh.className = 'wide';
    this.summary = make('p', 'classification-summary');
    this.select = make('select', 'classification-identity');
    this.select.setAttribute('aria-label', 'Named specialized relationship');
    this.status = make('output', 'classification-status');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.detail = make('div', 'classification-detail');
    this.verify = make('button', 'classification-verify', 'Recheck numerical classification');
    this.verify.className = 'wide';
    this.source = make('button', 'classification-open-source', 'Open source model');
    this.source.className = 'wide';
    this.generated = make('button', 'classification-open-dual', 'Open generated dual');
    this.generated.className = 'wide';
    this.related = make('button', 'classification-open-related', 'Open related model');
    this.related.className = 'wide';
    this.root.append(
      this.tranche,
      this.refresh,
      this.summary,
      this.select,
      this.status,
      this.detail,
      this.source,
      this.generated,
      this.related,
      this.verify
    );
    before.before(this.root);
    this.refresh.onclick = guard(() => this.load());
    this.tranche.onchange = guard(() => this.load());
    this.select.onchange = () => {
      this.cancel();
      this.render();
    };
    this.verify.onclick = guard(() => this.recheck());
    this.source.onclick = guard(() => {
      const row = this.selected();
      if (this.available() && row?.sourceKey) return open({ key: row.sourceKey, name: row.name });
    });
    this.generated.onclick = guard(() => {
      const row = this.selected();
      if (
        this.available() &&
        row?.generatedKey &&
        row.receipt.status === 'numerical-pass' &&
        row.status !== 'unresolved'
      )
        return open({ key: row.generatedKey, name: row.name + ' (generated)' });
    });
    this.related.onclick = guard(() => {
      const row = this.selected();
      if (this.available() && row?.otherKey) return open({ key: row.otherKey, name: row.otherName ?? row.otherKey });
    });
    this.root.ontoggle = guard(() => {
      if (this.root.open && !this.data && !this.controller) return this.load();
    });
    this.sync();
  }
  selected() {
    return this.data?.entries.find((r) => r.id === this.select.value);
  }
  available() {
    return Boolean(this.data?.sourcePinsCurrent && !this.controller && this.data.tranche === this.tranche.value);
  }
  sync() {
    const row = this.selected(),
      available = this.available();
    this.source.disabled = !available || !row?.sourceKey;
    this.generated.disabled =
      !available || !row?.generatedKey || row.receipt.status !== 'numerical-pass' || row.status === 'unresolved';
    this.generated.hidden = !row?.generatedKey;
    this.related.disabled = !available || !row?.otherKey;
    this.related.hidden = !row?.otherKey;
    this.verify.disabled = !available || !row?.sourceKey;
    this.root.setAttribute('aria-busy', String(Boolean(this.controller)));
  }
  cancel() {
    this.sequence++;
    this.controller?.abort();
    this.controller = null;
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
      const data = await this.run('classification-qualification', params, null, label, { signal: controller.signal });
      if (sequence !== this.sequence || controller.signal.aborted) return;
      publish(data);
    } catch (error) {
      if (sequence !== this.sequence || controller.signal.aborted) return;
      this.status.textContent = 'Classification review failed: ' + error.message;
      throw error;
    } finally {
      if (sequence === this.sequence) {
        this.controller = null;
        this.sync();
      }
    }
  }
  load() {
    const tranche = this.tranche.value,
      selected = this.select.value;
    return this.request({ tranche }, 'Review specialized relationships', (data) => {
      this.data = data;
      this.select.replaceChildren();
      for (const row of data.entries) {
        const o = this.make('option', null, `${row.name} — ${row.recordedStatus}`);
        o.value = row.id;
        this.select.append(o);
      }
      this.select.value = data.entries.some((r) => r.id === selected) ? selected : (data.entries[0]?.id ?? '');
      this.summary.textContent = `${data.label}: ${data.entries.filter((r) => r.recordedStatus === 'numerical-pass').length} recorded numerical passes; ${data.entries.filter((r) => r.recordedStatus !== 'numerical-pass').length} unresolved or missing sources. Release qualification remains pending.`;
      this.render();
    });
  }
  render() {
    const row = this.selected();
    this.detail.replaceChildren();
    if (!row) {
      this.status.textContent = 'No named relationship selected.';
      this.sync();
      return;
    }
    this.detail.append(this.make('p', null, row.identityBasis));
    if (row.kind === 'dual')
      this.detail.append(
        this.make(
          'p',
          null,
          'Generated reciprocal identity at the source vertex mean, radius 1. Ordered incidence is retained. A generated model is not a supplied source.'
        )
      );
    if (row.otherKey)
      this.detail.append(
        this.make(
          'p',
          null,
          `${row.otherName} uses relative scale ${row.comparisonScaleDefinition} for this comparison. Open related model keeps its original catalog scale.`
        )
      );
    if (row.sourceHypotheses)
      this.detail.append(this.make('p', null, 'Retained source hypotheses: ' + JSON.stringify(row.sourceHypotheses)));
    if (row.receipt.reason) this.detail.append(this.make('p', null, row.receipt.reason));
    for (const line of this.data.unresolved) this.detail.append(this.make('p', null, line));
    const details = this.make('details');
    details.append(this.make('summary', null, 'Source pins, residuals and classification evidence'));
    const pre = this.make('pre', 'classification-receipt');
    pre.textContent = JSON.stringify(
      { references: row.references, receipt: row.receipt, scope: this.data.scope },
      null,
      2
    );
    details.append(pre);
    this.detail.append(details);
    this.status.textContent = this.data.sourcePinsCurrent
      ? `${row.recordedStatus}; recorded evidence needs a current recheck. Numerical results are not exact certificates.`
      : 'Provider metadata changed; regenerate the qualification tranche before opening or rechecking.';
    this.sync();
  }
  recheck() {
    const row = this.selected();
    if (!this.available() || !row?.sourceKey) return;
    return this.request(
      { tranche: this.tranche.value, id: row.id, verify: true },
      'Recheck specialized classification',
      (data) => {
        Object.assign(row, data.entry);
        this.render();
        const pre = this.make('pre', 'classification-verification');
        pre.textContent = JSON.stringify(data.verification, null, 2);
        this.detail.append(pre);
        this.status.textContent = `Current check: ${data.verification.status}. ${data.verification.reason ?? 'Separate coordinate/incidence hashes and named relationship checks match. No release qualification is inferred.'}`;
      }
    );
  }
}
