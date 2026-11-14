import { canvasSafeInsets } from './canvas-overlays.mjs';

export const SLICE_AXES = ['X', 'Y', 'Z', 'W'];
export function sliceAxisNormal(dimension, axis) {
  const index = SLICE_AXES.indexOf(axis);
  if (![3, 4].includes(dimension) || index < 0 || index >= dimension)
    throw Error('Choose a slice axis available in this dimension.');
  return Array.from({ length: dimension }, (_, i) => Number(i === index));
}
export function sliceBounds(model, normal) {
  const length = Math.hypot(...normal);
  if (!length || normal.length !== model.dimension) throw Error('Choose a nonzero intrinsic slice direction.');
  let min = Infinity,
    max = -Infinity;
  for (const point of model.vertices) {
    const depth = point.reduce((sum, x, i) => sum + (x * normal[i]) / length, 0);
    min = Math.min(min, depth);
    max = Math.max(max, depth);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max)
    throw Error('This source has no extent along the slice direction.');
  return { min, max, center: min / 2 + max / 2, step: (max - min) / 500 };
}
export function defaultSlice(model) {
  const normal = sliceAxisNormal(model.dimension, SLICE_AXES[model.dimension - 1]);
  return { normal, offset: sliceBounds(model, normal).center };
}
export function sliceEvaluationLabel(normal, offset) {
  const length = Math.hypot(...normal),
    unit = normal.map((x) => x / length),
    index = unit.findIndex((x, i) => Math.abs(x - 1) < 1e-10 && unit.every((v, k) => k === i || Math.abs(v) < 1e-10)),
    format = (x) => String(Number(x.toPrecision(6)));
  return (
    (index >= 0 ? SLICE_AXES[index] + ' axis' : 'Normal [' + unit.map(format).join(', ') + ']') +
    ' at ' +
    format(offset)
  );
}
export class SectionToolbar {
  constructor(context) {
    this.context = context;
    const doc = context.document ?? document;
    this.doc = doc;
    this.node = (id) => doc.getElementById(id);
    this.controls = this.node('section-normal').closest('.section-controls');
    this.controls.id = 'section-toolbar';
    const create = (tag, id, text) => {
      const node = doc.createElement(tag);
      if (id) node.id = id;
      if (text) node.textContent = text;
      return node;
    };
    const card = create('section', 'cross-section-card');
    card.className = 'inspector-card';
    const open = create('button', 'open-cross-section', 'Cross-section');
    open.className = 'wide';
    open.title = 'Cross-section · slice · section';
    card.append(open, create('p', '', 'Slice the shape to see inside'));
    this.card = card;
    this.node('construct-panel').prepend(card);
    open.onclick = context.guard(() => this.open());
    this.primaryTitle = doc.querySelector('.viewport.primary .view-label span');
    this.derivedLabel = this.node('derived-mode').parentElement;
    this.title = create('span', 'section-pane-title');
    this.derivedLabel.prepend(this.title);
    this.advanced = create('details', 'advanced-slice-settings');
    this.advanced.className = 'workspace-disclosure';
    this.advanced.append(create('summary', '', 'Advanced slice settings'));
    this.normalLabel = this.node('section-normal').closest('label');
    this.advanced.append(this.node('derived-mode'), this.normalLabel);
    const interpretation = this.node('section-density-interpretation');
    this.advanced.append(
      this.node('section-density-mode').closest('label'),
      interpretation,
      this.node('derived-input-note')
    );
    const position = this.node('section-offset').closest('label');
    position.firstChild.textContent = 'Slice position ';
    this.node('section-depth').setAttribute('aria-label', 'Slice position expression');
    this.node('section-offset').setAttribute('aria-label', 'Slice position');
    const direction = create('label', 'slice-direction-label', 'Slice direction: ');
    const select = create('select', 'slice-direction');
    select.setAttribute('aria-label', 'Slice direction');
    direction.append(select);
    this.direction = select;
    select.onchange = context.guard(() => this.setDirection(select.value));
    this.description = create(
      'p',
      'slice-instructions',
      'Move the slice through the shape. Rotating either displayed shape does not change the slice.'
    );
    this.feedback = create('output', 'slice-feedback');
    this.feedback.setAttribute('role', 'status');
    this.feedback.setAttribute('aria-live', 'polite');
    this.node('apply-section').textContent = 'Update section';
    this.node('section-events').textContent = 'Next vertex level';
    this.wrap = create('small', 'slice-wrap-note', 'After the last vertex level, returns to the first.');
    this.controls.prepend(this.description, position, direction);
    this.node('section-events').after(this.wrap);
    this.controls.append(this.feedback, this.advanced);
    for (const id of ['section-offset', 'section-depth', 'section-normal'])
      this.node(id).addEventListener('input', () =>
        this.status(id === 'section-offset' ? 'Updating…' : 'Changes pending · choose Update section.')
      );
    this.node('section-depth').addEventListener(
      'keydown',
      context.guard((event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          return context.controls.apply(false);
        }
      })
    );
    this.sync();
    const views = this.node('views'),
      Observer = doc.defaultView?.MutationObserver;
    if (views && Observer) {
      this.layoutObserver = new Observer(() => this.sync());
      this.layoutObserver.observe(views, { attributes: true, attributeFilter: ['data-layout'] });
    }
  }
  async open() {
    const c = this.context,
      s = c.controls.editable(),
      plane = defaultSlice(s.model);
    c.stop?.();
    this.custom = false;
    this.advanced.open = false;
    c.controls.cancel();
    s.view.viewportLayout = 'split';
    s.view.derivedMode = 'section';
    s.view.sectionNormal = plane.normal;
    s.view.sectionOffset = plane.offset;
    if (s.view.densitySection) s.view.densitySection.enabled = false;
    delete s.view.sectionAlignment;
    c.controls.restoreInputs();
    c.controls.changed();
    return c.controls.apply(false);
  }
  setDirection(axis) {
    const c = this.context,
      s = c.controls.editable();
    if (axis === 'custom') {
      this.custom = true;
      this.advanced.open = true;
      this.normalLabel.hidden = false;
      this.node('section-normal').focus();
      return;
    }
    const normal = sliceAxisNormal(s.model.dimension, axis);
    const bounds = sliceBounds(s.model, normal);
    c.controls.cancel();
    this.custom = false;
    s.view.sectionNormal = normal;
    s.view.sectionOffset = Math.max(bounds.min, Math.min(bounds.max, s.view.sectionOffset));
    delete s.view.sectionAlignment;
    c.controls.restoreInputs();
    c.controls.changed();
    return c.controls.apply(false);
  }
  status(text) {
    this.feedback.textContent = text === 'Updating section…' ? 'Updating…' : text;
  }
  complete(result) {
    const plane = result?.normal ? result : result?.model?.metadata?.sectionEmbedding,
      controls = this.context.controls;
    if (!plane || controls.timer || (controls.live && controls.live.offset !== plane.offset)) {
      this.status('Updating…');
      return;
    }
    this.status(
      'Section updated · ' +
        sliceEvaluationLabel(plane.normal, plane.offset) +
        (result.status === 'empty' ? ' · empty intersection.' : '')
    );
    if (this.fitResult && this.derived?.model) {
      this.derived.resize();
      this.context.getState().view.derivedCamera = this.derived.fit();
      this.fitResult = false;
    }
  }
  refitLayout(base = this.base, derived = this.derived) {
    if (base && base !== this.base) {
      const insets = base.getFitInsets;
      base.getFitInsets = () => {
        const previous = insets?.() ?? {},
          canvas = base.container?.getBoundingClientRect(),
          gizmo = this.doc.getElementById?.('direct-4d-gizmo'),
          widget = gizmo && !gizmo.hidden ? gizmo.getBoundingClientRect() : null;
        return canvas && widget && widget.top >= canvas.bottom
          ? canvasSafeInsets(canvas.width, canvas.height, { bottom: (previous.bottom ?? 0) * canvas.height })
          : previous;
      };
    }
    this.base = base;
    this.derived = derived;
    const s = this.context.getState?.(),
      active = s?.view.viewportLayout === 'split' && ['section', 'cell-section'].includes(s.view.derivedMode);
    // Refit only when a document the user is looking at switches INTO split sections. A document first seen
    // already active (reopened project, restored autosave, tab switch) keeps its saved cameras, and new history
    // states of an already-active document (commits, undo/redo) never refit.
    this.activeByDocument ??= new WeakMap();
    const key = this.context.getDocument?.() ?? s,
      previous = key ? this.activeByDocument.get(key) : undefined;
    if (key) this.activeByDocument.set(key, Boolean(active));
    if (!active) {
      this.framedState = null;
      this.fitResult = false;
      return;
    }
    if (previous !== false) return;
    if (!base || this.framedState === s) return;
    this.framedState = s;
    this.fitResult = true;
    (this.doc.defaultView?.requestAnimationFrame ?? ((fn) => setTimeout(fn, 0)))(() => {
      if (
        this.context.getState() !== s ||
        this.framedState !== s ||
        s.view.viewportLayout !== 'split' ||
        !['section', 'cell-section'].includes(s.view.derivedMode)
      )
        return;
      base.resize();
      s.view.camera = base.fit();
      derived?.resize();
      if (derived?.model) s.view.derivedCamera = derived.fit();
    });
  }
  sync() {
    const c = this.context,
      s = c.getState(),
      m = s?.model;
    const section = ['section', 'cell-section'].includes(s?.view.derivedMode);
    const active = section && s?.view.viewportLayout === 'split';
    this.controls.classList.toggle('slice-active', active);
    this.title.hidden = !active;
    this.title.textContent = `Cross-section · ${(m?.dimension ?? 4) - 1}D`;
    this.primaryTitle.textContent = active ? 'Original · ' + m.name : 'Model';
    this.primaryTitle.parentElement.classList.toggle('slice-original-title', active);
    if (section) this.node('promote').textContent = 'Open section in new tab';
    else if (this.node('promote').textContent === 'Open section in new tab')
      this.node('promote').textContent = 'Promote';
    const blocked = !m || ![3, 4].includes(m.dimension) || c.isExporting?.() || Boolean(c.controls.pending);
    this.card.hidden = ![3, 4].includes(m?.dimension);
    this.node('open-cross-section').disabled = Boolean(blocked);
    for (const node of [this.description, this.feedback, this.wrap, this.advanced, this.direction.parentElement])
      node.hidden = !section;
    if (!section && this.node('derived-mode').parentElement === this.advanced)
      this.derivedLabel.prepend(this.node('derived-mode'));
    if (section && this.node('derived-mode').parentElement !== this.advanced)
      this.advanced.querySelector('summary').after(this.node('derived-mode'));
    const note = this.node('derived-input-note'),
      noteParent = section ? this.advanced : this.controls;
    if (note.parentElement !== noteParent) noteParent.append(note);
    this.refitLayout();
    if (!m || !section) return;
    if (this.source !== m) {
      this.source = m;
      this.custom = false;
      this.status('Move the slice to explore.');
      this.direction.replaceChildren();
      for (const axis of [...SLICE_AXES.slice(0, m.dimension), 'custom']) {
        const option = this.doc.createElement('option');
        option.value = axis;
        option.textContent = axis === 'custom' ? 'Custom…' : axis + ' axis';
        this.direction.append(option);
      }
    }
    const normal = s.view.sectionNormal,
      length = Math.hypot(...normal);
    const axis = SLICE_AXES.slice(0, m.dimension).find((_, i) =>
      normal.every((x, k) => Math.abs(x / length - Number(k === i)) < 1e-10)
    );
    this.direction.value = this.custom || !axis ? 'custom' : axis;
    this.direction.disabled = Boolean(blocked);
    this.normalLabel.hidden = false;
    try {
      const bounds = sliceBounds(m, normal),
        slider = this.node('section-offset');
      slider.min = String(bounds.min);
      slider.max = String(bounds.max);
      slider.step = String(bounds.step);
      slider.value = String(c.controls.live?.offset ?? s.view.sectionOffset);
    } catch {
      this.node('section-offset').disabled = true;
    }
  }
}
