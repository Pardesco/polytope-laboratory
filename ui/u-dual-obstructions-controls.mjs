export class UDualObstructionsControls {
  constructor({ document, before, run, guard = (fn) => fn, open }) {
    Object.assign(this, { run, open });
    this.sequence = 0;
    this.make = (tag, id, text) => {
      const n = document.createElement(tag);
      if (id) n.id = id;
      if (text) n.textContent = text;
      return n;
    };
    const make = this.make;
    this.root = make('details', 'library-u-dual-obstructions');
    this.root.append(make('summary', null, 'Singular U-duals'));
    this.root.append(
      make(
        'p',
        null,
        'Why these 13 named U-duals cannot open as ordinary finite reciprocal models at the source center. Review face-plane witnesses without changing the model.'
      )
    );
    this.refresh = make('button', 'u-dual-refresh', 'Review dual obstructions');
    this.refresh.className = 'wide';
    this.summary = make('p', 'u-dual-summary');
    const label = make('label', null, 'Named U-dual');
    label.setAttribute('for', 'u-dual-identity');
    this.select = make('select', 'u-dual-identity');
    this.select.setAttribute('aria-label', 'Named U-dual');
    this.status = make('output', 'u-dual-status');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.detail = make('div', 'u-dual-detail');
    this.source = make('button', 'u-dual-open-source', 'Open source polyhedron');
    this.source.className = 'wide';
    this.verify = make('button', 'u-dual-verify', 'Recheck plane witnesses');
    this.verify.className = 'wide';
    this.root.append(
      this.refresh,
      this.summary,
      label,
      this.select,
      this.status,
      this.detail,
      this.source,
      this.verify
    );
    before.before(this.root);
    this.refresh.onclick = guard(() => this.load());
    this.select.onchange = () => {
      this.cancel();
      this.render();
    };
    this.verify.onclick = guard(() => this.recheck());
    this.source.onclick = guard(() => {
      const row = this.selected();
      if (this.available() && row?.sourceKey && row.status !== 'unresolved')
        return open({ key: row.sourceKey, name: row.sourceName });
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
    return Boolean(this.data?.sourcePinsCurrent && !this.controller);
  }
  sync() {
    const row = this.selected();
    this.source.disabled = !this.available() || !row?.sourceKey || row.status === 'unresolved';
    this.verify.disabled = !this.available() || !row;
    this.select.disabled = Boolean(this.controller) && !this.data;
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
      const data = await this.run('u-dual-obstructions', params, null, label, { signal: controller.signal });
      if (sequence !== this.sequence || controller.signal.aborted) return;
      publish(data);
    } catch (error) {
      if (sequence !== this.sequence || controller.signal.aborted) return;
      this.status.textContent = 'Dual diagnostics failed: ' + error.message;
      throw error;
    } finally {
      if (sequence === this.sequence) {
        this.controller = null;
        this.sync();
      }
    }
  }
  load() {
    const selected = this.select.value;
    return this.request({}, 'Review named U-dual obstructions', (data) => {
      this.data = data;
      this.select.replaceChildren();
      for (const row of data.entries) {
        const o = this.make('option', null, row.name);
        o.value = row.id;
        this.select.append(o);
      }
      this.select.value = data.entries.some((r) => r.id === selected) ? selected : (data.entries[0]?.id ?? '');
      this.summary.textContent = `${data.entries.length} named source reports; ${data.finiteModelsAdded} finite models added. Select a dual to inspect its limits.`;
      this.render();
    });
  }
  evidence(id, label, value) {
    const details = this.make('details');
    details.append(this.make('summary', null, label));
    const pre = this.make('pre', id);
    pre.textContent = JSON.stringify(value, null, 2);
    details.append(pre);
    this.detail.append(details);
  }
  render() {
    const row = this.selected();
    this.detail.replaceChildren();
    if (!row) {
      this.status.textContent = 'Choose a named U-dual.';
      this.sync();
      return;
    }
    const receipt = row.receipt,
      t = receipt.topology;
    this.detail.append(this.make('p', null, receipt.reason));
    this.detail.append(
      this.make(
        'p',
        null,
        `Center-plane faces: ${receipt.centerPlaneFaceIds.join(', ') || 'none'}. Coincident plane groups: ${receipt.coincidentPlaneGroups.length}. Face IDs start at 0.`
      )
    );
    this.detail.append(
      this.make(
        'p',
        null,
        `Source V/E/F: ${t.vertices}/${t.edges}/${t.faces}; Euler characteristic ${t.eulerCharacteristic}; ${t.orientable ? 'orientable, genus ' + t.genus : 'nonorientable (orientable genus unassigned)'}. Geometric crossings do not merge identities.`
      )
    );
    this.detail.append(
      this.make(
        'p',
        null,
        'Reciprocation uses the source vertex mean and radius 1. Ideal vertices and coincident planes retain separate identities; no filled infinite faces or solid measures are assigned.'
      )
    );
    this.evidence('u-dual-receipt', 'Recorded face IDs, topology and numerical residuals', {
      id: row.id,
      aliases: row.aliases,
      sourceKey: row.sourceKey,
      sourcePins: this.data.sourcePinsCurrent,
      receipt,
      expected: row.expected,
      license: row.license,
    });
    this.status.textContent = this.data.sourcePinsCurrent
      ? 'Recorded evidence is unchecked for this session. Recheck to inspect every source plane and dual cycle.'
      : 'Source pins changed or are missing. Rebuild and review the provider before rechecking or opening a source.';
    this.sync();
  }
  recheck() {
    const row = this.selected();
    if (!this.available() || !row) return;
    return this.request({ id: row.id, verify: true }, 'Recheck named dual plane witnesses', (data) => {
      Object.assign(row, data.entry);
      this.render();
      this.evidence('u-dual-verification', 'Current numerical plane witnesses', {
        verification: data.verification,
        witnesses: data.witnesses,
      });
      this.status.textContent = `Current check: ${data.verification.status}. ${data.verification.reason} Numerical evidence only; no finite model or release qualification is inferred.`;
    });
  }
}
