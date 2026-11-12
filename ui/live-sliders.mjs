import { NumericEntry } from './numeric-entry.mjs';
import { captureNativeSource, verifyNativeSource } from './native-source-binding.mjs';

const abort = () => Object.assign(Error('Live preview canceled.'), { name: 'AbortError' });
export function snapValue(value, stops, min, max) {
  const v = Math.max(min, Math.min(max, Number(value))),
    near = stops.find((stop) => Math.abs(v - stop.value) <= (max - min) * 0.012);
  return near?.value ?? v;
}
export const releaseOnly = (model) =>
  model?.vertices?.length > 160 ||
  (model?.dimension === 4 && (model?.vertices?.length > 32 || model?.cells?.length > 32));

export class LivePreviewSession {
  constructor(context) {
    this.context = context;
    this.sequence = 0;
    this.active = null;
  }
  begin(key) {
    if (this.active?.key === key) {
      verifyNativeSource(this.context, this.active.owner);
      return this.active;
    }
    this.cancel();
    const owner = captureNativeSource(this.context);
    this.context.stop?.();
    return (this.active = { key, owner, source: JSON.parse(owner.modelSignature) });
  }
  verify(job, token = this.sequence) {
    if (this.active !== job || token !== this.sequence || job.controller?.signal.aborted) throw abort();
    verifyNativeSource(this.context, job.owner);
    job.check?.();
  }
  supersede() {
    clearTimeout(this.timer);
    this.sequence++;
    this.active?.controller?.abort();
    this.active?.entry?.cancel();
  }
  queue(key, build, { release = false } = {}) {
    const job = this.begin(key);
    if (job.committing) return;
    this.supersede();
    job.controller = null;
    job.check = null;
    job.ready = null;
    job.applyWhenReady = false;
    const token = this.sequence,
      slow = releaseOnly(job.source);
    this.context.status(key, slow && !release ? 'Release to preview this larger model.' : 'Updating preview…');
    if (slow && !release) return;
    this.timer = setTimeout(
      () =>
        this.evaluate(job, build, token).catch((error) => {
          if (this.active === job && token === this.sequence && error.name !== 'AbortError') {
            job.ready = null;
            this.context.clear?.();
            this.context.status(key, error.message);
          }
        }),
      release ? 0 : 65
    );
  }
  async evaluate(job, build, token) {
    this.verify(job, token);
    const controller = new AbortController();
    job.controller = controller;
    const spec = build(),
      signature = JSON.stringify(spec.raw);
    job.check = () => {
      if (JSON.stringify(build().raw) !== signature) throw Error('Construction settings changed; preview again.');
    };
    const entry = new NumericEntry({ ...this.context, getTarget: () => build().raw });
    job.entry = entry;
    await entry.run(
      spec.fields,
      async (values, verify, { signal }) => {
        const check = () => {
          verify();
          this.verify(job, token);
        };
        check();
        const params = spec.params(values);
        const result = await this.context.run(
          'live-construction-preview',
          { operation: spec.op, parameters: params },
          job.source,
          'Explore ' + spec.label,
          { signal }
        );
        check();
        if (!result?.model?.vertices?.length) throw Error('Preview returned no geometry.');
        this.context.show(result.model);
        check();
        job.ready = { op: spec.op, params, label: spec.label };
        this.context.status(job.key, `${result.name} · numerical preview · Apply to keep`);
        this.context.ready?.(job.key);
      },
      { signal: controller.signal }
    );
    if (job.applyWhenReady) {
      job.applyWhenReady = false;
      await this.apply();
    }
  }
  requestApply() {
    if (this.active?.ready) return this.apply();
    if (this.active) this.active.applyWhenReady = true;
  }
  async apply() {
    const job = this.active;
    if (!job?.ready || job.committing) return;
    this.verify(job);
    job.committing = true;
    this.context.status(job.key, 'Applying…');
    const { op, params, label } = job.ready;
    let applied = false;
    try {
      const result = await this.context.commit(op, params, label, {
        signal: job.controller.signal,
        verifyPublication: () => this.verify(job),
      });
      applied = true;
      return result;
    } finally {
      if (this.active === job) this.cancel();
      if (applied) this.context.status(job.key, 'Applied to history. Undo returns to the original.');
    }
  }
  cancel() {
    const job = this.active;
    this.supersede();
    this.active = null;
    this.context.clear?.();
    if (job) this.context.status(job.key, 'Preview closed. Original model retained.');
  }
  sync() {
    if (!this.active || this.active.committing) return;
    try {
      this.verify(this.active);
    } catch {
      this.cancel();
    }
  }
}

const convex = (m) => [3, 4].includes(m?.dimension) && m.interpretation === 'convex-polytope';
export const LIVE_SLIDERS = [
  {
    id: 'truncation',
    label: 'Cut corners',
    op: 'truncate',
    parameter: 'amount',
    min: 0,
    max: 0.5,
    stops: [
      [0, 'Original'],
      [1 / 3, 'Truncated'],
      [0.5, 'Rectified'],
    ],
    eligible: convex,
  },
  {
    id: 'expansion-ratio',
    label: 'Expand',
    op: 'expand-runcinate',
    parameter: 'ratio',
    min: 0,
    max: 1,
    stops: [
      [0, 'Original'],
      [0.5, 'Expanded'],
      [1, 'Dual'],
    ],
    eligible: convex,
    extra: ['expansion-radius', 'expansion-center', 'expansion-colors'],
  },
  {
    id: 'incidence-cut-amount',
    label: 'Cut source corners',
    op: 'incidence-truncate',
    parameter: 'amount',
    min: 0,
    max: 0.95,
    stops: [
      [0, 'Original'],
      [1 / 3, 'Truncated'],
      [0.5, 'Rectified'],
    ],
    expert: true,
    eligible: (m) =>
      [3, 4].includes(m?.dimension) && ['convex-polytope', 'generalized-complex'].includes(m?.interpretation),
    extra: ['incidence-cut-preset', 'incidence-cut-colors'],
  },
  {
    id: 'incidence-dual-radius',
    label: 'Size the added dual',
    op: 'add-dual',
    parameter: 'radius',
    min: 0.05,
    max: 3,
    stops: [[1, 'Radius 1']],
    eligible: convex,
    extra: ['incidence-dual-center', 'add-dual-sizing'],
  },
  {
    id: 'conway-height',
    label: 'Raise face pyramids (kis)',
    op: 'conway',
    parameter: 'height',
    min: 0.01,
    max: 2,
    stops: [[0.5, 'Height ½']],
    eligible: (m) => m?.dimension === 3 && m.interpretation === 'convex-polytope',
  },
  {
    id: 'model-scale',
    label: 'Scale',
    op: 'transform',
    parameter: 'scale',
    min: 0.1,
    max: 3,
    stops: [
      [1, 'Original size'],
      [2, 'Double'],
    ],
    eligible: (m) => Boolean(m),
  },
];

export class LiveSliders {
  constructor(context, { document: doc = document } = {}) {
    this.context = context;
    this.rows = new Map();
    this.doc = doc;
    this.session = new LivePreviewSession({
      ...context,
      status: (key, text) => {
        const row = this.rows.get(key);
        if (row) {
          row.output.textContent = text;
          row.apply.disabled = true;
        }
      },
      ready: (key) => {
        this.rows.get(key).apply.disabled = false;
      },
    });
    for (const spec of LIVE_SLIDERS) this.mount(spec);
    doc.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.session.active) {
        event.preventDefault();
        this.session.cancel();
      }
    });
  }
  mount(spec) {
    const input = this.doc.getElementById(spec.id);
    if (!input) return;
    const root = this.doc.createElement('span');
    root.className = 'live-slider';
    root.id = 'live-' + spec.id;
    if (spec.expert) root.setAttribute('data-expert', '');
    root.innerHTML = `<span class="live-slider-title">Explore · ${spec.label}</span><input id="${root.id}-range" type="range" min="${spec.min}" max="${spec.max}" step="${(spec.max - spec.min) / 600}" aria-label="${spec.label} preview"><span class="live-slider-stops"></span><span class="live-slider-actions"><button type="button" id="${root.id}-apply" disabled>Apply</button><button type="button" id="${root.id}-cancel">Cancel</button></span><output id="${root.id}-status" aria-live="polite">Drag to explore. Enter applies; Esc restores.</output>`;
    input.closest('label').classList.add('live-slider-field');
    input.after(root);
    const range = root.querySelector('input'),
      output = root.querySelector('output'),
      apply = root.querySelector('#' + root.id + '-apply');
    const row = { spec, input, root, range, output, apply };
    this.rows.set(spec.id, row);
    const update = (release) => {
      if (!spec.eligible(this.context.getState()?.model)) return;
      if (spec.id === 'incidence-cut-amount') this.doc.getElementById('incidence-cut-preset').value = 'manual';
      if (spec.id === 'incidence-dual-radius') this.doc.getElementById('add-dual-sizing').value = 'reciprocal';
      this.session.queue(spec.id, () => this.build(spec), { release });
    };
    const drag = (release) => {
      input.value = String(snapValue(range.value, this.stops(spec), spec.min, this.maximum(spec)));
      range.value = input.value;
      update(release);
    };
    range.oninput = contextGuard(this.context, () => drag(false));
    range.onchange = contextGuard(this.context, () => drag(true));
    input.addEventListener('input', () => {
      if (this.session.active?.key === spec.id) {
        this.session.supersede();
        this.session.active.ready = null;
        apply.disabled = true;
      }
    });
    input.addEventListener(
      'change',
      contextGuard(this.context, () => update(true))
    );
    for (const id of spec.extra ?? [])
      this.doc.getElementById(id)?.addEventListener(
        'change',
        contextGuard(this.context, () => {
          if (this.session.active?.key === spec.id) update(true);
        })
      );
    root.onkeydown = contextGuard(this.context, (event) => {
      if (event.key === 'Enter' && event.target?.tagName !== 'BUTTON') {
        event.preventDefault();
        event.stopPropagation();
        return this.session.requestApply();
      }
    });
    input.addEventListener(
      'keydown',
      contextGuard(this.context, (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          if (!this.session.active?.ready) update(true);
          return this.session.requestApply();
        }
      })
    );
    apply.onclick = contextGuard(this.context, () => this.session.apply());
    root.querySelector('#' + root.id + '-cancel').onclick = () => this.session.cancel();
    const initial = Number(input.value);
    range.value =
      Number.isFinite(initial) && input.value.trim()
        ? Math.max(spec.min, Math.min(spec.max, initial))
        : (spec.stops[1]?.[0] ?? spec.stops[0][0]);
    this.ticks(row);
    this.sync();
  }
  maximum(spec) {
    return spec.id === 'incidence-cut-amount' && this.context.getState()?.model.dimension === 4 ? 0.5 : spec.max;
  }
  stops(spec) {
    return spec.stops.map(([value, label]) => ({ value, label })).filter((s) => s.value <= this.maximum(spec));
  }
  ticks(row) {
    const ticks = row.root.querySelector('.live-slider-stops');
    ticks.replaceChildren();
    for (const [index, stop] of this.stops(row.spec).entries()) {
      const button = this.doc.createElement('button');
      button.type = 'button';
      button.id = row.root.id + '-stop-' + index;
      button.textContent = stop.label;
      button.title = `${stop.label}: ${stop.value}`;
      button.onclick = contextGuard(this.context, () => {
        row.range.value = stop.value;
        row.range.onchange();
      });
      ticks.append(button);
    }
  }
  build(spec) {
    const read = (id) => this.doc.getElementById(id).value,
      raw = Object.fromEntries([spec.id, ...(spec.extra ?? [])].map((id) => [id, read(id)]));
    const fields = {
      value: {
        text: raw[spec.id],
        min: spec.id === 'model-scale' ? -1e100 : spec.min,
        max: spec.id === 'model-scale' ? 1e100 : this.maximum(spec),
        nonzero: spec.id === 'model-scale',
      },
    };
    // Typed entry retains the full native domain; the slider is a useful window.
    if (spec.id === 'incidence-cut-amount')
      fields.value.max = this.context.getState().model.dimension === 4 ? 0.5 : 1024;
    if (['conway-height', 'incidence-dual-radius'].includes(spec.id)) {
      fields.value.min = 0;
      fields.value.exclusiveMin = true;
      fields.value.max = spec.id === 'conway-height' ? 1e6 : 1e100;
    }
    if (spec.id === 'expansion-ratio') fields.radius = { text: read('expansion-radius'), min: 0, exclusiveMin: true };
    const centerId =
      spec.id === 'expansion-ratio'
        ? 'expansion-center'
        : spec.id === 'incidence-dual-radius'
          ? 'incidence-dual-center'
          : null;
    if (centerId && read(centerId).trim())
      fields.center = { text: read(centerId), kind: 'vector', length: this.context.getState().model.dimension };
    return {
      raw,
      fields,
      op: spec.op,
      label: spec.label,
      params: (values) => {
        const row = this.rows.get(spec.id);
        row.range.value = Math.max(spec.min, Math.min(this.maximum(spec), values.value));
        const params = { [spec.parameter]: values.value };
        if (spec.op === 'expand-runcinate')
          Object.assign(params, {
            radius: values.radius,
            center: values.center ?? null,
            color_policy: raw['expansion-colors'],
          });
        if (spec.op === 'add-dual') Object.assign(params, { sizing: 'reciprocal', center: values.center ?? null });
        if (spec.op === 'incidence-truncate')
          Object.assign(params, { preset: 'manual', cap_colors: raw['incidence-cut-colors'] });
        if (spec.op === 'conway') params.notation = 'k';
        return params;
      },
    };
  }
  sync() {
    this.session.sync();
    for (const row of this.rows.values()) {
      const enabled = row.spec.eligible(this.context.getState()?.model) && !this.context.isExporting?.();
      row.range.disabled = !enabled;
      row.range.max = this.maximum(row.spec);
      for (const button of row.root.querySelectorAll('.live-slider-stops button')) button.disabled = !enabled;
      if (!this.session.active || this.session.active.key !== row.spec.id) row.apply.disabled = true;
    }
  }
  cancel() {
    this.session.cancel();
  }
}
const contextGuard = (context, fn) => (context.guard ? context.guard(fn) : fn);
