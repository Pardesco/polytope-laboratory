import fixtures from '../engine/catalog_data/symmetry_qualification/fixtures.json' with { type: 'json' };

const keys = new Set(fixtures.scenarios.filter((r) => !r.variant).map((r) => r.key));
export function evidenceSummary(data) {
  const rows = data.receipts,
    passed = rows.filter((r) => r.status === 'passed').length,
    limited = rows.filter((r) => r.status === 'limited').length;
  return `${passed} passed; ${limited} resource-limited; ${rows.length - passed - limited} failed. Recorded float64 evidence; no exact algebraic certificate.`;
}

export class SymmetryEvidenceControls {
  constructor({ document, before, run, guard = (fn) => fn, getState, open }) {
    Object.assign(this, { document, run, getState, open });
    this.sequence = 0;
    const make = (tag, id, text) => {
      const node = document.createElement(tag);
      if (id) node.id = id;
      if (text) node.textContent = text;
      return node;
    };
    this.make = make;
    this.root = make('details', 'library-symmetry-evidence');
    this.root.append(make('summary', null, 'Symmetry — release evidence'));
    this.refresh = make('button', 'symmetry-evidence-refresh', 'Review symmetry evidence');
    this.refresh.className = 'wide';
    this.summary = make('p', 'symmetry-evidence-summary');
    this.choice = make('select', 'symmetry-evidence-scenario');
    this.choice.setAttribute('aria-label', 'Symmetry qualification scenario');
    this.status = make('output', 'symmetry-evidence-status');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.match = make('button', 'symmetry-evidence-match', 'Compare current model');
    this.match.className = 'wide';
    this.match.disabled = true;
    this.source = make('button', 'symmetry-evidence-open', 'Open catalog source');
    this.source.className = 'wide';
    this.source.disabled = true;
    const details = make('details');
    details.append(make('summary', null, 'Source hashes, residuals and limits'));
    this.detail = make('pre', 'symmetry-evidence-receipt');
    this.detail.className = 'code-box';
    details.append(this.detail);
    this.root.append(this.refresh, this.summary, this.choice, this.status, this.source, this.match, details);
    before.before(this.root);
    this.refresh.onclick = guard(() => this.load());
    this.choice.onchange = () => {
      this.cancel();
      this.render();
    };
    this.match.onclick = guard(() => this.compare());
    this.source.onclick = guard(() => {
      const row = this.selected();
      if (row) return open({ key: row.key, name: row.key });
    });
    this.root.ontoggle = guard(() => {
      if (this.root.open && !this.data && !this.controller) return this.load();
    });
  }
  cancel() {
    this.sequence++;
    this.controller?.abort();
    this.controller = null;
    this.refresh.disabled = false;
    this.match.disabled = !this.selected();
  }
  selected() {
    return this.data?.receipts.find((r) => r.id === this.choice.value);
  }
  sync() {
    if (this.matchedSource && this.getState()?.model !== this.matchedSource) {
      this.matchedSource = null;
      this.render();
    }
  }
  async query(params, source, publish) {
    this.cancel();
    const sequence = this.sequence,
      controller = new AbortController(),
      state = this.getState();
    this.controller = controller;
    this.refresh.disabled = true;
    this.match.disabled = true;
    this.status.textContent = 'Reading recorded symmetry evidence…';
    try {
      const data = await this.run('symmetry-qualification', params, source, 'Review symmetry evidence', {
        signal: controller.signal,
      });
      if (sequence !== this.sequence || controller.signal.aborted) return;
      if (source && (this.getState() !== state || state.model !== source)) {
        this.status.textContent = 'The current model changed. Compare again.';
        return;
      }
      publish(data);
    } catch (error) {
      if (sequence !== this.sequence || controller.signal.aborted) return;
      this.status.textContent = 'Symmetry evidence unavailable: ' + error.message;
      throw error;
    } finally {
      if (sequence === this.sequence) {
        this.controller = null;
        this.refresh.disabled = false;
        this.match.disabled = !this.selected();
      }
    }
  }
  load() {
    return this.query({}, null, (data) => {
      this.data = data;
      const previous = this.choice.value;
      this.choice.replaceChildren();
      for (const row of data.receipts) {
        const option = this.make('option', null, `${row.key.replaceAll('-', ' ')} · ${row.variant} · ${row.status}`);
        option.value = row.id;
        this.choice.append(option);
      }
      this.choice.value = data.receipts.some((r) => r.id === previous) ? previous : (data.receipts[0]?.id ?? '');
      this.summary.textContent = evidenceSummary(data);
      this.render();
    });
  }
  render() {
    this.matchedSource = null;
    const row = this.selected();
    this.source.disabled = !row;
    this.match.disabled = !row;
    if (!row) {
      this.status.textContent = 'No recorded scenario is available.';
      this.detail.textContent = '';
      return;
    }
    const changed = Object.values(this.data.binding.implementation).includes('changed');
    this.status.textContent = `${row.status === 'passed' ? 'Recorded numerical completeness' : row.status === 'limited' ? 'Resource-limited; completeness unresolved' : 'Qualification failed'} for this fixture. ${!this.data.binding.fixturesCurrent ? 'Fixture definitions changed; reproduce the report.' : changed ? 'Implementation changed; reproduce for the current version.' : 'Compare current model to check its geometry hashes.'}`;
    this.detail.textContent = JSON.stringify(
      {
        receipt: row,
        binding: this.data.binding,
        reportSha256: this.data.reportSha256,
        environment: this.data.environment,
      },
      null,
      2
    );
  }
  compare() {
    const row = this.selected(),
      source = this.getState()?.model;
    if (!row || !source) return;
    return this.query({ scenario: row.id }, source, (data) => {
      this.render();
      this.matchedSource = source;
      this.status.textContent = data.sourceMatch
        ? 'Current coordinates and complete ordered incidence match this recorded numerical receipt.'
        : 'Current model does not match a passed receipt. Run Verify intrinsic symmetry for this source.';
    });
  }
}

export function appendSymmetryReceiptLink(control, realization) {
  if (!keys.has(realization?.catalogKey)) return;
  const button = control.make('button', 'corpus-symmetry-evidence', 'Review source symmetry evidence');
  button.className = 'wide';
  let output;
  control.detail.append(button);
  button.onclick = control.guard(async () => {
    control.cancel();
    const sequence = control.sequence,
      id = realization.id,
      controller = new AbortController();
    control.controller = controller;
    control.busy(true);
    try {
      const data = await control.run(
        'symmetry-qualification',
        { key: realization.catalogKey },
        null,
        'Review source symmetry evidence',
        { signal: controller.signal }
      );
      if (sequence !== control.sequence || controller.signal.aborted || control.selectedRealization()?.id !== id)
        return;
      if (!output) {
        output = control.make('pre', 'corpus-symmetry-receipt');
        control.detail.append(output);
      }
      output.textContent = JSON.stringify(data, null, 2);
      control.status.textContent =
        evidenceSummary(data) +
        ' Catalog identity qualification remains pending; compare the current model in Symmetry — release evidence.';
    } catch (error) {
      if (sequence !== control.sequence || controller.signal.aborted) return;
      control.status.textContent = 'Symmetry evidence unavailable: ' + error.message;
      throw error;
    } finally {
      if (sequence === control.sequence) {
        control.controller = null;
        control.busy(false);
      }
    }
  });
}
