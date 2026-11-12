export const EXPORT_GOALS_KEY = 'polytope.export-goals.v1';
export const EXPORT_GOALS = [
  {
    id: 'print',
    title: '3D print it',
    hint: 'Struts, panels or a solid · STL / 3MF',
    icon: 'M5 8V3h14v5M5 17H3V8h18v9h-2M6 14h12v7H6z',
    kind: 'printable',
    defaults: { 'printable-mode': 'strut', 'printable-size': '100', 'export-format': 'stl' },
    fields: ['printable-mode', 'printable-size', 'export-format'],
  },
  {
    id: 'paper',
    title: 'Make a paper model',
    hint: 'Unfold, arrange and print in Nets',
    icon: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zm6-2v16m6-14v16',
  },
  {
    id: 'picture',
    title: 'Save a picture',
    hint: 'PNG · choose a size or transparent background',
    icon: 'M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M15 7h2',
    defaults: { 'png-size': 'landscape', 'png-transparent': false, 'png-scale': '1' },
    fields: ['png-size', 'png-transparent'],
  },
  {
    id: 'video',
    title: 'Make a video or GIF',
    hint: 'Animation or tour · Reels, square or landscape',
    icon: 'M3 5h12v14H3zm12 5 6-4v12l-6-4',
    defaults: {
      'animation-format': 'webm',
      'animation-size': 'landscape',
      'tour-format': 'webm',
      'tour-size': 'landscape',
    },
    fields: ['animation-format', 'animation-size', 'tour-format', 'tour-size'],
  },
  {
    id: 'software',
    title: 'Use in other 3D software',
    hint: 'Blender, CAD or web · GLB / OBJ / X3D / DXF',
    icon: 'm12 2 9 5v10l-9 5-9-5V7zm0 10 9-5m-9 5L3 7m9 5v10',
    kind: 'displayed',
    defaults: { 'export-format': 'glb', 'interchange-size': '0.1' },
    fields: ['export-format', 'interchange-size'],
  },
  {
    id: 'geometry',
    title: 'Export model data',
    hint: 'Coordinates and connections. OFF / JSON, full double precision',
    icon: 'm8 4-6 8 6 8m8-16 6 8-6 8m-3-18-2 20',
    kind: 'intrinsic',
    defaults: { 'export-format': 'off' },
    fields: ['export-format'],
  },
];
const GEOMETRY = new Set(['print', 'software', 'geometry']);
const CONTROL_IDS = [
  'export-source',
  'export-units',
  'export-format',
  'printable-mode',
  'printable-size',
  'printable-strut',
  'printable-node',
  'printable-thickness',
  'printable-segments',
  'printable-ascii',
  'printable-fill',
  'printable-hollow',
  'printable-wall',
  'interchange-size',
  'png-size',
  'png-transparent',
  'png-scale',
  'png-framing',
  'png-margin',
  'png-supersample',
  ...['animation', 'tour'].flatMap((p) =>
    ['format', 'size', 'framing', 'margin', 'supersample', 'bitrate', 'palette', 'dither', 'loop-count'].map(
      (k) => p + '-' + k
    )
  ),
];
export function readExportGoals(storage) {
  try {
    const v = JSON.parse(storage?.getItem(EXPORT_GOALS_KEY) || 'null');
    if (
      v &&
      EXPORT_GOALS.some((g) => g.id === v.lastGoal) &&
      v.options &&
      typeof v.options === 'object' &&
      !Array.isArray(v.options)
    )
      return v;
  } catch {}
  return { lastGoal: null, options: {} };
}
const make = (doc, tag, id, text) => {
  const n = doc.createElement(tag);
  if (id) n.id = id;
  if (text) n.textContent = text;
  return n;
};
const field = (node) => node?.closest('label') ?? node;
export function solidPrintReason(model, viewer) {
  if (model?.dimension !== 3) return 'Solid print needs a closed 3D surface — try Struts.';
  if (viewer?.explosionDisplay || viewer?.morphFrame || viewer?.net || viewer?.cellNet)
    return 'Solid print needs the complete 3D surface. Turn off exploded or preview views, or try Struts.';
  const edges = new Map();
  for (const f of model.faces ?? [])
    for (let i = 0; i < f.length; i++) {
      const a = f[i],
        b = f[(i + 1) % f.length],
        key = a < b ? a + ',' + b : b + ',' + a;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  return !edges.size || [...edges.values()].some((n) => n !== 2)
    ? 'Solid print needs a closed 3D surface — try Struts.'
    : '';
}
export class ExportGoals {
  constructor(control, context = {}) {
    this.control = control;
    this.context = context;
    this.doc = context.document ?? document;
    this.dialog = control.dialog;
    this.borrowed = [];
    this.aliases = [];
    this.mediaSource = 'animation';
    try {
      this.storage = context.storage === undefined ? this.doc.defaultView?.localStorage : context.storage;
    } catch {
      this.storage = null;
    }
    this.saved = readExportGoals(this.storage);
    this.mount();
    this.dialog.addEventListener('close', () => {
      if (!this.dialog.open) {
        this.remember();
        this.restore();
      }
    });
    for (const type of ['input', 'change'])
      this.dialog.addEventListener(type, (event) => {
        if (
          event.target.id === 'export-kind' &&
          EXPORT_GOALS.find((g) => g.id === this.goal)?.kind !== event.target.value
        ) {
          this.allFormats({ focus: false });
          return;
        }
        if (this.applying || !CONTROL_IDS.includes(event.target.id)) return;
        this.remember();
        this.sync();
      });
    this.dialog.addEventListener('app-chrome-reveal', (event) => {
      if (this.legacy.contains(event.target)) this.allFormats({ focus: false });
    });
  }
  node(id) {
    return this.doc.getElementById(id);
  }
  action(fn) {
    return this.context.guard ? this.context.guard(fn) : fn;
  }
  mount() {
    const doc = this.doc,
      heading = this.dialog.querySelector('.dialog-heading') ?? this.dialog.querySelector('h2');
    this.dialog.classList.add('export-goals');
    this.dialog.setAttribute('aria-label', 'Export by goal');
    this.node('close-export')?.setAttribute('aria-label', 'Close export');
    this.chooser = make(doc, 'section', 'export-goals-chooser');
    this.chooser.setAttribute('aria-label', 'Choose an export goal');
    this.chooser.append(make(doc, 'p', null, 'What would you like to make?'));
    const cards = make(doc, 'div', 'export-goal-cards');
    this.cards = new Map();
    for (const goal of EXPORT_GOALS) {
      const card = make(doc, 'button', 'export-goal-' + goal.id);
      card.type = 'button';
      card.className = 'export-goal-card';
      const icon = make(doc, 'span');
      icon.className = 'export-goal-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path d="${goal.icon}"/></svg>`;
      const text = make(doc, 'span'),
        title = make(doc, 'strong', null, goal.title),
        hint = make(doc, 'small', null, goal.hint),
        reason = make(doc, 'small', 'export-goal-' + goal.id + '-reason');
      reason.className = 'export-goal-reason';
      card.setAttribute('aria-describedby', reason.id);
      text.append(title, hint, reason);
      card.append(icon, text);
      card.onclick = this.action(() => this.choose(goal.id));
      cards.append(card);
      this.cards.set(goal.id, { card, reason });
    }
    this.chooser.append(cards);
    this.form = make(doc, 'section', 'export-goal-form');
    this.form.hidden = true;
    const back = make(doc, 'button', 'export-goal-back', '← Export goals');
    back.type = 'button';
    back.className = 'export-goal-link';
    back.onclick = () => this.home();
    this.title = make(doc, 'h3', 'export-goal-title');
    this.description = make(doc, 'p', 'export-goal-description');
    this.description.className = 'muted';
    this.fields = make(doc, 'div', 'export-goal-fields');
    this.fields.className = 'export-goal-fields';
    this.message = make(doc, 'p', 'export-goal-message');
    this.message.setAttribute('role', 'status');
    this.setup = make(doc, 'button', 'export-goal-setup', 'Set up animation…');
    this.setup.type = 'button';
    this.setup.className = 'export-goal-link';
    this.setup.onclick = this.action(() => {
      const id = this.mediaSource === 'tour' ? 'tour-add' : 'animation-rotation';
      this.remember();
      this.restore();
      this.control.close();
      this.context.reveal?.(this.node(id));
    });
    this.form.append(back, this.title, this.description, this.fields, this.message, this.setup);
    this.legacy = make(doc, 'details', 'export-all-formats');
    this.legacySummary = make(doc, 'summary', null, 'All formats');
    this.legacy.append(this.legacySummary);
    this.original = make(doc, 'div', 'export-original-controls');
    for (const n of [...this.dialog.children]) if (n !== heading) this.original.append(n);
    this.legacy.append(this.original);
    this.media = make(doc, 'details', 'export-media-more');
    this.media.append(make(doc, 'summary', null, 'More options'));
    this.media.hidden = true;
    this.footer = make(doc, 'div', 'export-goal-footer');
    this.primary = make(doc, 'button', 'export-goal-action');
    this.primary.type = 'button';
    this.primary.className = 'wide accent';
    this.primary.onclick = this.action(() => this.perform());
    this.dialog.append(this.chooser, this.form, this.legacy, this.media, this.footer);
    this.legacy.addEventListener('toggle', () => {
      if (this.legacy.open && !this.goal) this.allFormats({ focus: false });
    });
  }
  collectLegacyActions() {
    for (const id of ['export-net', 'export-net-pdf', 'confirm-export']) {
      const node = this.node(id);
      if (node?.parentElement === this.dialog) this.original.append(node);
    }
  }
  open() {
    this.restore();
    this.collectLegacyActions();
    this.goal = null;
    this.control.printable.node('kind').value = 'intrinsic';
    this.control.format.value = 'off';
    this.home({ focus: false });
  }
  home({ focus = true } = {}) {
    if (this.control.session.saving) return;
    this.remember();
    this.restore();
    this.goal = null;
    this.aliases = [];
    this.chooser.hidden = false;
    this.form.hidden = true;
    this.media.hidden = true;
    this.legacy.hidden = false;
    this.legacy.open = false;
    this.legacySummary.textContent = 'All formats';
    this.original.append(this.control.preview, this.control.button);
    this.footer.replaceChildren();
    this.dialog.querySelector('h2').textContent = 'Export';
    this.sync();
    if (focus) (this.cards.get(this.saved.lastGoal)?.card ?? this.cards.get('print').card).focus();
  }
  allFormats({ focus = true } = {}) {
    if (this.control.session.saving) return;
    this.remember();
    this.restore();
    this.goal = 'all';
    this.aliases = [];
    this.chooser.hidden = true;
    this.form.hidden = false;
    this.fields.replaceChildren();
    this.title.textContent = 'All formats';
    this.description.textContent = 'Choose any export type, source, format and units.';
    this.message.textContent = '';
    this.setup.hidden = true;
    this.media.hidden = true;
    this.legacy.hidden = false;
    this.legacySummary.textContent = 'Formats and settings';
    this.legacy.open = true;
    this.footer.replaceChildren(this.control.preview, this.control.button);
    this.sync();
    if (focus) this.control.printable.node('kind').focus();
    if (this.dialog.open && !this.control.session.prepared && !this.control.session.preparing)
      return this.control.refresh();
  }
  set(id, value) {
    const n = this.node(id);
    if (!n) return;
    if (n.type === 'checkbox') {
      if (typeof value === 'boolean') n.checked = value;
    } else if (
      typeof value === 'string' &&
      value.length <= 512 &&
      (!n.options || [...n.options].some((o) => o.value === value && (id !== 'export-source' || !o.disabled)))
    )
      n.value = value;
  }
  choose(id) {
    const goal = EXPORT_GOALS.find((g) => g.id === id);
    if (!goal || this.control.session.saving || this.cards.get(id).card.disabled) return;
    this.remember();
    this.restore();
    this.goal = id;
    this.aliases = [];
    this.applying = true;
    this.original.append(this.control.preview, this.control.button);
    if (goal.kind) this.control.printable.node('kind').value = goal.kind;
    const values = this.saved.options[id];
    for (const [key, value] of Object.entries(goal.defaults ?? {})) this.set(key, value);
    if (values && typeof values === 'object')
      for (const key of CONTROL_IDS) if (Object.hasOwn(values, key)) this.set(key, values[key]);
    if (id === 'video') this.mediaSource = values?.mediaSource === 'tour' ? 'tour' : 'animation';
    this.applying = false;
    this.chooser.hidden = true;
    this.form.hidden = false;
    this.title.textContent = goal.title;
    this.description.textContent = goal.hint;
    this.setup.hidden = id !== 'video';
    this.legacy.hidden = !GEOMETRY.has(id);
    this.legacy.open = false;
    this.legacySummary.textContent = 'More options';
    this.media.hidden = !['picture', 'video'].includes(id);
    this.media.open = false;
    this.renderFields();
    this.footer.replaceChildren(...(GEOMETRY.has(id) ? [this.control.preview, this.control.button] : [this.primary]));
    this.remember();
    this.sync();
    (this.fields.querySelector('input,select') ?? this.primary).focus();
    if (GEOMETRY.has(id)) return this.control.refresh();
    this.control.session.cancel();
  }
  proxy(id, label, options) {
    const source = this.node(id);
    if (!source) return;
    const row = make(this.doc, 'label', null, label),
      n = make(this.doc, source.tagName === 'SELECT' ? 'select' : 'input', 'export-focus-' + id);
    if (source.tagName !== 'SELECT') n.type = source.type === 'checkbox' ? 'checkbox' : 'text';
    if (source.options)
      for (const option of options ?? [...source.options].map((o) => [o.value, o.textContent])) {
        const o = make(this.doc, 'option', null, option[1]);
        o.value = option[0];
        n.append(o);
      }
    if (n.type === 'text') n.maxLength = 512;
    row.append(n);
    this.fields.append(row);
    this.aliases.push({ source, n });
    const type = source.tagName === 'SELECT' || source.type === 'checkbox' ? 'change' : 'input';
    n.addEventListener(type, () => {
      if (n.type === 'checkbox') source.checked = n.checked;
      else source.value = n.value;
      source.dispatchEvent(new this.doc.defaultView.Event(type, { bubbles: true }));
      this.remember();
      this.sync();
    });
  }
  borrow(node) {
    if (!node || this.borrowed.some((b) => b.node === node)) return;
    const marker = this.doc.createComment('export goal options');
    node.before(marker);
    this.borrowed.push({ node, marker });
    this.media.append(node);
  }
  restore() {
    for (const { node, marker } of this.borrowed) {
      marker.replaceWith(node);
    }
    this.borrowed = [];
  }
  renderFields() {
    this.fields.replaceChildren();
    this.aliases = [];
    this.restore();
    if (this.goal === 'print') {
      this.proxy('printable-mode', 'Build it as', [
        ['strut', 'Struts · rods and joints'],
        ['panels', 'Panels · thickened faces'],
        ['solid', 'Solid · closed outer surface'],
      ]);
      this.proxy('printable-size', 'Longest dimension (mm)');
      this.proxy('export-format', 'File format', [
        ['stl', 'STL · widely supported'],
        ['3mf', '3MF · keeps colors for solids'],
      ]);
    } else if (this.goal === 'software') {
      this.proxy('export-format', 'Use it in', [
        ['glb', 'GLB · Blender and web · colors in one file'],
        ['obj', 'OBJ + MTL · 3D editors · keep both files'],
        ['x3d', 'X3D · web and scene interchange'],
        ['dxf', 'DXF · CAD · edge lines only'],
      ]);
      this.proxy('interchange-size', 'Longest dimension (meters)');
    } else if (this.goal === 'geometry') {
      this.proxy('export-format', 'File format', [
        ['off', 'OFF / 4OFF · source coordinates and connections'],
        ['json', 'JSON · model data, metadata and notes'],
      ]);
      this.description.textContent =
        'Coordinates and connections. OFF / JSON, full double precision. Numerical coordinates stay numerical. Without unit conversion, JSON also retains any supplied rational coordinates and scoped certificate; OFF stores numerical coordinates.';
    } else if (this.goal === 'picture') {
      this.proxy('png-size', 'Picture size');
      this.proxy('png-transparent', 'Transparent background');
      this.borrow(this.node('png-settings'));
    } else if (this.goal === 'video') {
      const row = make(this.doc, 'label', null, 'What to animate'),
        select = make(this.doc, 'select', 'export-video-source');
      for (const [value, title] of [
        ['animation', 'Current animation'],
        ['tour', 'Current tour'],
      ]) {
        const option = make(this.doc, 'option', null, title);
        option.value = value;
        select.append(option);
      }
      select.value = this.mediaSource;
      row.append(select);
      this.fields.append(row);
      select.onchange = () => {
        this.remember();
        this.mediaSource = select.value;
        this.renderFields();
        this.remember();
        this.sync();
      };
      const p = this.mediaSource;
      this.proxy(p + '-format', 'File format');
      this.proxy(p + '-size', 'Video size');
      for (const key of ['format', 'size']) this.borrow(field(this.node(p + '-' + key)));
      this.borrow(this.node(p + '-framing')?.closest('details'));
      this.setup.textContent = p === 'tour' ? 'Set up tour…' : 'Set up animation…';
    }
  }
  remember() {
    const goal = EXPORT_GOALS.find((g) => g.id === this.goal);
    if (!goal) return;
    const old = this.saved.options[goal.id] ?? {},
      options = {};
    const ids = GEOMETRY.has(goal.id)
      ? CONTROL_IDS.filter((id) => !id.startsWith('png-') && !id.startsWith('animation-') && !id.startsWith('tour-'))
      : goal.id === 'picture'
        ? CONTROL_IDS.filter((id) => id.startsWith('png-'))
        : CONTROL_IDS.filter((id) => id.startsWith('animation-') || id.startsWith('tour-'));
    for (const id of ids) {
      const n = this.node(id);
      if (n) options[id] = n.type === 'checkbox' ? n.checked : n.value;
    }
    this.saved = {
      lastGoal: goal.id,
      options: {
        ...this.saved.options,
        [goal.id]: { ...old, ...options, ...(goal.id === 'video' ? { mediaSource: this.mediaSource } : {}) },
      },
    };
    try {
      this.storage?.setItem(EXPORT_GOALS_KEY, JSON.stringify(this.saved));
    } catch {}
  }
  sync() {
    const c = this.control,
      busy = Boolean(c.session.saving),
      model = c.selected(),
      solidReason = solidPrintReason(model, c.context.getViewer?.(c.source.value));
    for (const [id, { card, reason }] of this.cards) {
      const why = !model ? 'Open a model first.' : busy ? 'Finish the current export first.' : '';
      card.disabled = Boolean(why);
      reason.textContent = why || (this.saved.lastGoal === id ? 'Last used · settings remembered' : '');
      card.dataset.lastUsed = String(this.saved.lastGoal === id);
    }
    const solid = this.node('printable-mode')?.options;
    for (const option of solid ?? [])
      if (option.value === 'solid') {
        option.disabled = Boolean(solidReason);
        option.title = solidReason;
      }
    for (const { source, n } of this.aliases) {
      if (n.options && !Array.from(n.options).some((o) => o.value === source.value)) {
        const original = [...source.options].find((o) => o.value === source.value);
        if (original) {
          const option = make(this.doc, 'option', null, original.textContent);
          option.value = source.value;
          n.append(option);
        }
      }
      if (n.type === 'checkbox') n.checked = source.checked;
      else n.value = source.value;
      n.disabled = busy || source.disabled;
      for (const option of n.options ?? []) {
        const original = [...source.options].find((o) => o.value === option.value);
        option.disabled = Boolean(original?.disabled);
        option.title = original?.title ?? '';
      }
    }
    this.node('export-goal-back').disabled = busy;
    this.legacySummary.setAttribute('aria-disabled', String(busy));
    if (this.goal === 'print')
      this.message.textContent =
        solidReason ||
        'The native preview checks the mesh and reports size residuals. Inspect supports and connectivity in your slicer.';
    else if (this.goal === 'picture')
      this.message.textContent = 'Captures the main view at the chosen size. PNG supports a transparent background.';
    else if (this.goal === 'video')
      this.message.textContent =
        this.mediaSource === 'tour'
          ? 'Exports saved tour events. Add an event in Tours if the tour is empty.'
          : 'Exports the current sequence. Use Set up animation to add a full rotation or record poses.';
    else this.message.textContent = '';
    if (this.goal && GEOMETRY.has(this.goal) && !c.button.disabled)
      c.button.textContent = 'Export ' + c.format.value.toUpperCase() + '…';
    this.primary.textContent =
      this.goal === 'picture'
        ? 'Save PNG…'
        : this.goal === 'paper'
          ? 'Continue to Nets →'
          : 'Export ' + (this.node(this.mediaSource + '-format')?.value ?? 'video').toUpperCase() + '…';
    this.primary.disabled =
      busy ||
      (this.goal === 'picture'
        ? Boolean(this.node('image')?.disabled)
        : this.goal === 'video'
          ? Boolean(this.node(this.mediaSource + '-export')?.disabled)
          : false);
    if (this.goal === 'paper') {
      this.description.textContent = 'Start at Nets step 1 to choose how to unfold your model.';
      this.message.textContent =
        model?.dimension === 4
          ? 'A 4D cell net is a 3D arrangement. Extract a 3D cell to make a printable paper net.'
          : 'Choose a net type, arrange the pieces, then print or export a PDF / SVG.';
    }
  }
  perform() {
    if (this.primary.disabled) return;
    const goal = this.goal;
    this.remember();
    this.restore();
    this.control.close();
    if (goal === 'picture') return this.context.picture?.();
    if (goal === 'paper') return this.context.reveal?.(this.node('net-rebuild'));
    if (goal === 'video') {
      const button = this.node(this.mediaSource + '-export');
      this.context.reveal?.(button);
      button?.click();
    }
  }
}
