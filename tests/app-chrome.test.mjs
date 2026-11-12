import { matchSource } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AppChrome, EXPERT_TOOLS_KEY, readExpertTools } from '../ui/app-chrome.mjs';
import { icon, ICON_NAMES } from '../ui/icons.mjs';
import vm from 'node:vm';
import { revealCommand } from '../ui/command-index.mjs';
import { createRequire } from 'node:module';
const { reveal, openDisclosure } = createRequire(import.meta.url)('../scripts/smoke-helpers.cjs');

class Node {
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attrs = {};
    this.events = {};
    this.className = '';
    this._text = '';
    this._open = false;
    this.classList = {
      contains: (c) => this.className.split(' ').includes(c),
      add: (c) => {
        if (!this.classList.contains(c)) this.className += ' ' + c;
      },
      remove: (c) => {
        this.className = this.className
          .split(' ')
          .filter((n) => n !== c)
          .join(' ');
      },
      toggle: (c, v) => {
        v = v ?? !this.classList.contains(c);
        this.classList[v ? 'add' : 'remove'](c);
        return v;
      },
    };
  }
  append(...nodes) {
    for (const node of nodes) {
      node.remove();
      node.parentElement = this;
      this.children.push(node);
    }
  }
  prepend(...nodes) {
    this.append(...nodes);
    this.children = [...nodes, ...this.children.filter((n) => !nodes.includes(n))];
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((n) => n !== this);
    this.parentElement = null;
  }
  get textContent() {
    return this._text + this.children.map((n) => n.textContent).join('');
  }
  set textContent(v) {
    this._text = v;
    this.children = [];
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }
  getAttribute(k) {
    return this.attrs[k] ?? null;
  }
  hasAttribute(k) {
    return k in this.attrs;
  }
  get options() {
    return this.children;
  }
  get isConnected() {
    return !!this.parentElement;
  }
  get open() {
    return this._open;
  }
  set open(v) {
    if (this._open === !!v) return;
    this._open = !!v;
    if (v && this.attrs.name)
      for (const other of this.ownerDocument.body.all())
        if (other !== this && other.attrs.name === this.attrs.name) other.open = false;
    this.dispatchEvent({ type: 'toggle' });
  }
  all() {
    return this.children.flatMap((n) => [n, ...n.all()]);
  }
  matches(selector) {
    if (selector.includes(':not(:disabled)') && this.disabled) return false;
    selector = selector.replace(':not(:disabled)', '');
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('[')) return this.hasAttribute(selector.slice(1, -1));
    return this.tagName === selector.toUpperCase();
  }
  querySelectorAll(selector) {
    return [
      ...new Set(
        selector.split(',').flatMap((part) => {
          part = part.trim();
          if (part.startsWith(':scope > ')) return this.children.filter((n) => n.matches(part.slice(9)));
          const pieces = part.split(' ');
          return this.all().filter(
            (n) => n.matches(pieces.at(-1)) && (pieces.length === 1 || n.parentElement?.closest(pieces[0]))
          );
        })
      ),
    ];
  }
  querySelector(s) {
    return this.querySelectorAll(s)[0] ?? null;
  }
  closest(s) {
    return this.matches(s) ? this : (this.parentElement?.closest(s) ?? null);
  }
  contains(n) {
    return n === this || this.all().includes(n);
  }
  cloneNode() {
    const n = new Node(this.ownerDocument, this.tagName);
    n.id = this.id;
    n.className = this.className;
    n._text = this._text;
    for (const child of this.children) n.append(child.cloneNode());
    return n;
  }
  addEventListener(type, fn) {
    (this.events[type] ??= []).push(fn);
  }
  dispatchEvent(event) {
    if (!event.target) Object.defineProperty(event, 'target', { value: this });
    for (const fn of this.events[event.type] ?? []) fn(event);
    if (event.bubbles) this.parentElement?.dispatchEvent(event);
    return true;
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
  click() {
    if (this.tagName === 'SUMMARY') this.parentElement.open = !this.parentElement.open;
    this.onclick?.({ preventDefault() {}, stopPropagation() {} });
  }
}
function fixture() {
  const doc = new Node(null, 'document');
  doc.ownerDocument = doc;
  doc.createElement = (tag) => new Node(doc, tag);
  doc.body = doc.createElement('body');
  doc.append(doc.body);
  doc.activeElement = doc.body;
  doc.createElementNS = (_, tag) => doc.createElement(tag);
  doc.getElementById = (id) => doc.body.all().find((n) => n.id === id);
  const create = (tag, id, parent, cls = '', label = '') => {
    const n = doc.createElement(tag);
    n.id = id;
    n.className = cls;
    n.textContent = label;
    parent.append(n);
    return n;
  };
  const header = create('header', '', doc.body, 'command-bar'),
    nav = create('nav', '', header),
    actions = create('div', '', header, 'workspace-actions');
  for (const id of ['new', 'open', 'save', 'undo', 'redo', 'export', 'help']) create('button', id, nav);
  const clicks = [];
  for (const id of ['new', 'open', 'save', 'undo', 'redo', 'export', 'help'])
    doc.getElementById(id).onclick = () => clicks.push(id);
  const search = create('button', 'command-search', nav);
  search.onclick = () => clicks.push('command-search');
  for (const id of ['fullscreen', 'presentation', 'toggle-library', 'toggle-inspector']) create('button', id, actions);
  const workspace = create('section', '', doc.body, 'workspace'),
    toolbar = create('div', '', workspace, 'view-toolbar');
  const first = create('div', '', toolbar, 'toolbar-group'),
    layoutLabel = create('label', '', first),
    layout = create('select', 'viewport-layout', layoutLabel);
  const projection = create('select', 'projection', first);
  for (const value of ['orthographic', 'perspective', 'stereographic']) {
    const option = create('option', '', projection, '', '4D ' + value);
    option.value = value;
  }
  create('select', 'render-style', create('div', '', toolbar, 'toolbar-group'));
  const buttons = create('div', '', toolbar, 'toolbar-group view-actions');
  for (const id of ['auto-rotate', 'fit-view', 'reset', 'image']) create('button', id, buttons);
  for (const id of ['camera-projection', 'stereo-mode', 'view-orientation', 'pick-kind']) create('select', id, toolbar);
  const png = create('details', 'png-settings', toolbar);
  create('summary', '', png, '', 'PNG options');
  create('div', '', png, 'settings-body');
  const shelf = create('div', '', workspace, 'workspace-shelf');
  for (const [id, label] of [
    ['surface-settings', 'Appearance'],
    ['rotation-settings', 'Rotation'],
    ['animation-settings', 'Animation'],
    ['dual-morph-settings', 'Dual morph'],
    ['memories-settings', 'Memories'],
    ['tour-settings', 'Tours'],
    ['history-settings', 'History'],
    ['stereo-settings', 'Stereo settings'],
    ['presentation-settings', 'Presentation'],
  ]) {
    const drawer = create('details', id, shelf, 'workspace-disclosure');
    create('summary', '', drawer, '', label);
    const body = create('div', id + '-controls', drawer, 'settings-body');
    create('button', id + '-apply', body);
  }
  create('button', 'open-multiple-views', shelf, '', 'Multiple views');
  const storage = new Map(),
    help = [];
  let fullscreen;
  const old = globalThis.MutationObserver;
  globalThis.MutationObserver = class {
    observe() {}
  };
  let chrome;
  try {
    chrome = new AppChrome({
      document: doc,
      storage: { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v) },
      guide: { show: (id) => help.push(id) },
      api: { onFullscreenChanged: (fn) => (fullscreen = fn) },
    });
  } finally {
    globalThis.MutationObserver = old;
  }
  return {
    doc,
    chrome,
    storage,
    help,
    toolbar,
    layout,
    create,
    clicks,
    search,
    fullscreen: (value) => fullscreen(value),
    node: (id) => doc.getElementById(id),
  };
}

test('header moves existing Help and search controls without replacing their handlers or identities', () => {
  const f = fixture(),
    header = f.doc.querySelector('.command-bar'),
    actions = f.doc.querySelector('.workspace-actions');
  assert.equal(f.node('command-search'), f.search);
  assert.equal(f.search.parentElement, header);
  assert.equal(f.node('help').parentElement, actions);
  assert.equal(actions.children[0], f.node('help'));
  assert.equal(f.node('help').textContent, 'Help');
  assert.match(f.search.textContent, /Find a shape or tool\.\.\.Ctrl\+K/);
  assert.equal(f.search.getAttribute('aria-controls'), 'command-palette');
  assert.equal(f.search.getAttribute('aria-haspopup'), 'dialog');
  for (const id of ['new', 'open', 'save', 'undo', 'redo', 'export', 'help', 'command-search']) f.node(id).click();
  assert.deepEqual(f.clicks, ['new', 'open', 'save', 'undo', 'redo', 'export', 'help', 'command-search']);
  for (const id of ['undo', 'redo']) {
    assert.ok(f.node(id).classList.contains('chrome-icon-button'));
    assert.ok(f.node(id).getAttribute('aria-label'));
    assert.ok(f.node(id).getAttribute('aria-keyshortcuts'));
  }
});

test('shared icons use decorative SVG nodes and reject unsupported names', () => {
  const f = fixture();
  for (const name of ICON_NAMES) {
    const svg = icon(name, { document: f.doc });
    assert.equal(svg.tagName, 'SVG');
    assert.equal(svg.getAttribute('aria-hidden'), 'true');
    assert.equal(svg.getAttribute('focusable'), 'false');
    assert.equal(svg.getAttribute('stroke'), 'currentColor');
    assert.equal(svg.getAttribute('width'), '18');
    assert.ok(svg.children.length);
  }
  assert.equal(icon('polytope', { document: f.doc, size: 24 }).getAttribute('width'), '24');
  for (const name of ['unknown', '__proto__', 'constructor'])
    assert.throws(() => icon(name, { document: f.doc }), /Unknown icon/);
});

test('Presentation retains its settings drawer and labels it separately from the launcher', () => {
  const f = fixture();
  assert.equal(f.node('presentation').textContent, 'Presentation');
  assert.equal(f.node('presentation-settings').querySelector('summary').textContent, 'Presentation settings');
  assert.ok(f.node('presentation-settings-apply').closest('#presentation-settings'));
});

test('expert defaults are off, saved preferences survive, and hidden test startup overrides a saved off', () => {
  assert.equal(readExpertTools(null), false);
  assert.equal(
    readExpertTools({
      getItem: () => {
        throw Error();
      },
    }),
    false
  );
  assert.equal(readExpertTools({ getItem: () => 'true' }), true);
  assert.equal(readExpertTools({ getItem: () => 'false' }, { hidden: true }), true);
  const f = fixture();
  assert.equal(f.chrome.expert, false);
  f.node('expert-tools').click();
  assert.equal(f.storage.get(EXPERT_TOOLS_KEY), 'true');
  f.node('expert-tools').click();
  f.chrome.startup({ hidden: true });
  assert.equal(f.chrome.expert, true);
  assert.equal(f.storage.get(EXPERT_TOOLS_KEY), 'false');
});
test('toolbar keeps original control identity and callbacks, using plain projection and snapshot labels', () => {
  const f = fixture(),
    projection = f.node('projection');
  let edits = 0;
  f.layout.onchange = () => edits++;
  assert.equal(f.layout.closest('#view-options'), f.node('view-options'));
  f.layout.onchange();
  assert.equal(edits, 1);
  for (const id of ['camera-projection', 'stereo-mode', 'view-orientation', 'pick-kind', 'png-settings', 'reset'])
    assert.ok(f.node(id).closest('#view-options'), id);
  for (const id of ['projection', 'render-style', 'auto-rotate', 'fit-view', 'image'])
    assert.ok(!f.node(id).closest('#view-options'), id);
  assert.deepEqual(
    projection.options.map((n) => n.textContent),
    ['Orthographic', 'Perspective', 'Stereographic']
  );
  assert.equal(f.node('image').textContent, 'Snapshot (PNG)');
  assert.equal(f.node('image').title, 'Snapshot (PNG)');
  assert.equal(f.node('image').getAttribute('aria-label'), 'Snapshot (PNG)');
  assert.ok(f.node('image').querySelector('svg'));
  assert.equal(f.node('view-options-button').title, 'View options');
  assert.equal(f.node('view-options-button').getAttribute('aria-label'), 'View options');
});
test('drawer overflow retains native disclosures and controls; opening a drawer closes its siblings', () => {
  const f = fixture();
  f.node('surface-settings').open = true;
  f.node('animation-settings').open = true;
  assert.equal(f.node('surface-settings').open, false);
  assert.equal(f.node('animation-settings').open, true);
  f.node('dock-more').open = true;
  f.node('open-memories-settings').click();
  assert.equal(f.node('dock-more').open, false);
  assert.equal(f.node('memories-settings').open, true);
  assert.equal(f.node('animation-settings').open, false);
  assert.equal(f.node('open-multiple-views').closest('#dock-more'), f.node('dock-more'));
  f.node('memories-settings').querySelector('.chrome-drawer-close').click();
  assert.equal(f.doc.activeElement, f.node('dock-more-button'));
});
test('each drawer has one labeled help and close header, with existing content preserved', () => {
  const f = fixture();
  for (const drawer of f.chrome.drawers) {
    assert.equal(drawer.querySelectorAll('.chrome-drawer-header').length, 1);
    assert.ok(f.node(drawer.id + '-apply'));
  }
  f.node('animation-settings').querySelector('.chrome-drawer-help').click();
  assert.deepEqual(f.help, ['animation-4d']);
});
test('escape returns focus to the active drawer tab and hides expert drawers when expert mode is off', () => {
  const f = fixture();
  f.node('surface-settings').open = true;
  f.doc.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} });
  assert.equal(f.node('surface-settings').open, false);
  assert.equal(f.doc.activeElement, f.node('surface-settings').querySelector('summary'));
  f.chrome.setExpert(true);
  f.node('stereo-settings').open = true;
  f.node('stereo-settings-apply').focus();
  f.chrome.setExpert(false);
  assert.equal(f.node('stereo-settings').open, false);
  assert.equal(f.doc.activeElement, f.node('expert-tools'));
});

test('Escape belongs to an open Guide dialog or presentation while underlying drawers and menus stay open', () => {
  const f = fixture(),
    drawer = f.node('presentation-settings'),
    menu = f.node('view-options');
  const query = f.doc.querySelector.bind(f.doc);
  let dialogOpen = true;
  f.doc.querySelector = (selector) => (selector === 'dialog[open]' ? (dialogOpen ? {} : null) : query(selector));
  drawer.open = true;
  menu.open = true;
  let prevented = 0;
  const escape = () =>
    f.doc.dispatchEvent({
      type: 'keydown',
      key: 'Escape',
      preventDefault() {
        prevented++;
      },
    });
  escape();
  assert.equal(drawer.open, true);
  assert.equal(menu.open, true);
  assert.equal(prevented, 0);
  dialogOpen = false;
  const presentation = f.create('section', 'presentation-showcase', f.doc.body);
  presentation.hidden = false;
  escape();
  assert.equal(drawer.open, true);
  assert.equal(menu.open, true);
  assert.equal(prevented, 0);
  presentation.hidden = true;
  escape();
  assert.equal(drawer.open, false);
  assert.equal(menu.open, false);
  assert.equal(prevented, 2);
});
test('popover keyboard entry, escape, outside clicks and focus departure preserve expanded state', () => {
  const f = fixture(),
    root = f.node('view-options'),
    trigger = f.node('view-options-button');
  const control = f.node('reset');
  let prevented = 0;
  trigger.dispatchEvent({
    type: 'keydown',
    key: 'ArrowDown',
    preventDefault() {
      prevented++;
    },
  });
  assert.equal(root.open, true);
  assert.ok(root.contains(f.doc.activeElement));
  f.doc.dispatchEvent({
    type: 'keydown',
    key: 'Escape',
    preventDefault() {
      prevented++;
    },
  });
  assert.equal(root.open, false);
  assert.equal(f.doc.activeElement, trigger);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(prevented, 2);
  root.open = true;
  f.doc.dispatchEvent({ type: 'pointerdown', target: f.doc.body });
  assert.equal(root.open, false);
  root.open = true;
  root.dispatchEvent({ type: 'focusout', relatedTarget: control });
  assert.equal(root.open, true);
  root.dispatchEvent({ type: 'focusout', relatedTarget: f.doc.body });
  assert.equal(root.open, false);
});
test('command reveal enables expert controls and opens View options before focusing the unchanged target', () => {
  const f = fixture(),
    target = f.node('stereo-mode');
  revealCommand(target);
  assert.equal(f.chrome.expert, true);
  assert.equal(f.node('view-options').open, true);
  assert.equal(f.doc.activeElement, target);
});

test('Select shortcut focuses the existing common picker without enabling expert tools', () => {
  const f = fixture(),
    target = f.node('pick-kind');
  let changes = 0;
  target.onchange = () => changes++;
  assert.equal(target.closest('[data-expert]'), null);
  f.node('pick-source').click();
  assert.equal(f.chrome.expert, false);
  assert.equal(f.node('view-options').open, true);
  assert.equal(f.doc.activeElement, target);
  target.onchange();
  assert.equal(changes, 1);
  revealCommand(target);
  assert.equal(f.chrome.expert, false);
});
test('shared smoke reveal reaches relocated PNG options, overflow drawers and Multiple views', async () => {
  const f = fixture();
  for (const id of ['png-settings', 'stereo-settings-apply', 'open-multiple-views']) {
    const element = f.node(id),
      target = { evaluate: (fn) => fn(element) };
    await reveal({}, target);
    if (id === 'png-settings') assert.equal(f.node('view-options').open, true);
    if (id === 'stereo-settings-apply') assert.equal(f.node('stereo-settings').open, true);
    if (id === 'open-multiple-views') assert.equal(f.node('dock-more').open, true);
  }
});
test('shared smoke disclosure opens overflow entries through More and retains ordinary disclosure clicks', async () => {
  const f = fixture(),
    page = {
      locator: (selector) => {
        const node = f.doc.querySelector(selector);
        return {
          first() {
            return this;
          },
          count: async () => (node ? 1 : 0),
          evaluate: async (fn) => fn(node),
          click: async () => node.click(),
        };
      },
    };
  await openDisclosure(page, 'memories-settings');
  assert.equal(f.node('memories-settings').open, true);
  assert.equal(f.node('dock-more').open, false);
  await openDisclosure(page, 'memories-settings');
  assert.equal(f.node('memories-settings').open, true);
  await openDisclosure(page, 'surface-settings');
  assert.equal(f.node('surface-settings').open, true);
  assert.equal(f.node('memories-settings').open, false);
});
test('full screen pressed state tracks native notification and startup state', () => {
  const f = fixture();
  f.fullscreen(true);
  assert.equal(f.node('fullscreen').getAttribute('aria-pressed'), 'true');
  f.chrome.startup({ hidden: false, fullscreen: false });
  assert.equal(f.node('fullscreen').getAttribute('aria-pressed'), 'false');
});
test('real preload forwards full screen changes and removes only its own listener', async () => {
  const listeners = new Map();
  let api;
  vm.runInNewContext(await readFile(new URL('../desktop/preload.cjs', import.meta.url), 'utf8'), {
    require: () => ({
      contextBridge: { exposeInMainWorld: (_, value) => (api = value) },
      ipcRenderer: {
        on: (name, fn) => listeners.set(name, fn),
        removeListener: (name, fn) => {
          assert.equal(listeners.get(name), fn);
          listeners.delete(name);
        },
      },
    }),
  });
  const states = [],
    stop = api.onFullscreenChanged((value) => states.push(value));
  listeners.get('fullscreen-changed')({}, true);
  listeners.get('fullscreen-changed')({}, false);
  assert.deepEqual(states, [true, false]);
  stop();
  assert.equal(listeners.size, 0);
});
test('chrome styling preserves expert contract, one-line chrome and bounded scrolling drawers', async () => {
  const css = await readFile(new URL('../ui/app-chrome.css', import.meta.url), 'utf8');
  matchSource(css, /body:not\(\.expert-mode\) \[data-expert\]\s*\{\s*display:none !important/);
  matchSource(css, /workspace-shelf[^}]*flex-wrap:nowrap/);
  matchSource(css, /chrome-menu-panel[^}]*overflow:auto/);
  matchSource(css, /chrome-drawer > \.settings-body[^}]*max-height:min/);
});
