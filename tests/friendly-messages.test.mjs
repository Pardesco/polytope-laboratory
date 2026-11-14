import test from 'node:test';
import assert from 'node:assert/strict';
import {
  friendlyJob,
  friendlyStatus,
  friendlyError,
  Toasts,
  FriendlyMessages,
  AUDITED_CONTROLS,
  disabledReason,
  updateDisabledHints,
} from '../ui/friendly-messages.mjs';
import { NativeJobs } from '../ui/native-jobs.mjs';
import { createStatus } from '../ui/status.mjs';

class Node {
  constructor(tagName, doc) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.hidden = false;
    this.title = '';
    this.className = '';
    this.textContent = '';
    this.disabled = false;
    this.classList = { contains: (name) => this.className.split(' ').includes(name) };
  }
  append(...nodes) {
    for (const node of nodes) {
      node.remove();
      node.parentElement = this;
      this.children.push(node);
    }
  }
  before(node) {
    const parent = this.parentElement;
    node.remove();
    node.parentElement = parent;
    parent.children.splice(parent.children.indexOf(this), 0, node);
  }
  remove() {
    if (this.parentElement) {
      const children = this.parentElement.children;
      children.splice(children.indexOf(this), 1);
      this.parentElement = null;
    }
  }
  contains(node) {
    return !!find(this, (item) => item === node);
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  removeAttribute(name) {
    delete this.attributes[name];
  }
  matches() {
    return this.disabled || (this.parentElement?.tagName === 'FIELDSET' && this.parentElement.disabled);
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
}
function dom() {
  const doc = {
    createElement: (tag) => new Node(tag, doc),
    getElementById: (id) => find(doc.body, (node) => node.id === id),
    querySelectorAll: () => [],
    listeners: {},
    addEventListener: (name, callback) => (doc.listeners[name] = callback),
  };
  doc.body = doc.createElement('body');
  return doc;
}
function find(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}
function element(doc, id, tag = 'div') {
  const node = doc.createElement(tag);
  node.id = id;
  doc.body.append(node);
  return node;
}
function mounted(t, { modelHeading = false } = {}) {
  const original = globalThis.MutationObserver,
    observers = [];
  globalThis.MutationObserver = class {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {}
    disconnect() {}
  };
  t.after(() => {
    globalThis.MutationObserver = original;
  });
  const doc = dom();
  for (const id of ['status', 'toast', 'cancel']) element(doc, id);
  if (modelHeading) element(doc, 'model-name');
  const messages = new FriendlyMessages(doc);
  return { doc, messages, observers };
}

test('common engine labels use plain language and library counts come from the reply', () => {
  assert.equal(friendlyJob('Analyze incidence'), 'Analyzing shape…');
  assert.equal(friendlyJob('Load local catalog', { phase: 'complete', result: Array(1594) }), 'Loaded 1,594 models');
  assert.equal(friendlyJob('section'), 'Slicing shape…');
  assert.equal(friendlyJob('Compute source edge cut'), 'Cutting corners…');
  assert.equal(friendlyJob('unrecognized-specialist-op'), 'Working on shape…');
  assert.equal(friendlyJob('unrecognized-specialist-op', { phase: 'complete' }), 'Shape results ready');
});

test('timings appear only above two seconds or with Expert tools enabled', () => {
  assert.equal(friendlyJob('Analyze incidence', { phase: 'complete', elapsed: 410 }), 'Shape analysis ready');
  assert.equal(friendlyJob('Analyze incidence', { phase: 'complete', elapsed: 2000 }), 'Shape analysis ready');
  assert.equal(friendlyJob('Analyze incidence', { phase: 'complete', elapsed: 2180 }), 'Shape analysis ready · 2.18 s');
  assert.equal(
    friendlyJob('Analyze incidence', { phase: 'complete', elapsed: 410, expert: true }),
    'Shape analysis ready · 0.41 s'
  );
  assert.equal(friendlyStatus('Analyze incidence completed in 0.41 s'), 'Shape analysis ready');
  assert.equal(friendlyStatus('Saved C:/my work.polyproj'), 'Saved C:/my work.polyproj');
});

const refusals = [
  ['Faceting prototype requires intrinsic 3D source coordinates.', 'only works on 3D'],
  ['Cell facing requires an intrinsic 4D source.', 'only works on 4D'],
  ['Extrusion requires a 2D/3D convex base and positive finite height.', '2D or 3D'],
  ['Add Dual requires full-dimensional 3D or 4D geometry.', '3D or 4D'],
  ['Sections currently reduce 3D to 2D or 4D to 3D.', '3D or 4D'],
  ['This operation supports convex polytopes only.', 'convex shape'],
  ['Job exceeded the two-minute resource limit. Source geometry remains available.', 'needed too long'],
  ['Engine exited before completing: native exit 1', 'engine stopped'],
  ['Geometry engine could not start: ENOENT', 'engine stopped'],
  ['Invalid engine response: wrong ID.', 'engine stopped'],
  ['Geometry engine workers are busy.', 'Other tools'],
  ['JSON import exceeds the 64-level nesting limit.', 'too large or complex'],
  ['Import exceeds the 1,000,000 total incidence-reference limit per model.', 'too large or complex'],
  ['Imported rational literals are limited to 256 characters and exponent magnitude 1,024.', 'too large or complex'],
  ['Import requires 1–100,000 vertices.', 'too large or complex'],
  ['Expected an OFF or 4OFF marker on the first non-comment line.', 'valid OFF file'],
  ['Malformed OFF numeric or incidence record: invalid int', 'valid OFF file'],
  [
    'Every vertex must have exactly 4 finite coordinates. Color attributes are not supported.',
    'exactly 4 finite numbers',
  ],
  ['Declared edge count 5 differs from boundary-derived count 12.', 'edge count does not match'],
  ['OFF/JSON coordinates must be finite numbers within ±1e+150.', 'supported numeric range'],
  ['File import requires valid UTF-8 text; invalid byte sequence found.', 'UTF-8 text'],
  ['Unsupported project format/version. Original file remains unchanged.', 'could not be read'],
  ['Triangulated solid export currently supports convex 3D boundaries only.', 'export needs a convex 3D'],
  ['OBJ export requires an intrinsic 2D/3D model.', 'format cannot save'],
  ['Export failed: destination disappeared', 'could not be saved'],
  ['ENOSPC: no space left on device', 'enough disk space'],
  ['EACCES: permission denied', 'cannot be accessed'],
  ['Cell placements require a finite nonzero quaternion and finite 3D translation.', 'Check the entered values'],
  ['Source geometry changed before publication.', 'settings changed'],
  ['A specialist refusal with <script> markup', 'Open Details'],
];
for (const [detail, expected] of refusals)
  test('friendly refusal: ' + detail, () => {
    const result = friendlyError(Error(detail));
    assert.ok(result.message.includes(expected), result.message);
    assert.equal(result.detail, detail);
  });

test('OFF line diagnostics and transport wrappers keep every original character in Details', () => {
  const detail =
    "Error invoking remote method 'open-file': Error: Invalid OFF file: line 12 has 3 numbers, expected 4.";
  const result = friendlyError(Error(detail));
  assert.match(result.message, /line 12 has 3 numbers, expected 4/);
  assert.equal(result.detail, detail);
  assert.equal(friendlyError('plain string').detail, 'plain string');
  assert.doesNotMatch(friendlyError(Error('Every vertex must have exactly 3 finite coordinates.')).message, /line \d/);
});

test('success dismisses in 3.6 seconds while errors remain until closed', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const doc = dom(),
    host = element(doc, 'toast'),
    toasts = new Toasts(host);
  const success = toasts.show('Saved model'),
    error = toasts.show('Could not save', { error: true, detail: 'original' });
  assert.equal(success.node.getAttribute('role'), 'status');
  assert.equal(error.node.getAttribute('role'), 'alert');
  assert.equal(host.getAttribute('role'), null);
  t.mock.timers.tick(3599);
  assert.equal(toasts.items.length, 2);
  t.mock.timers.tick(1);
  assert.equal(toasts.items.length, 1);
  t.mock.timers.tick(60000);
  assert.equal(toasts.items.length, 1);
  error.node.children[1].onclick();
  assert.equal(host.hidden, true);
});

test('notifications cap at three, copy original details, and never interpret error HTML', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const doc = dom(),
    host = element(doc, 'toast'),
    copied = [],
    toasts = new Toasts(host, { copy: async (text) => copied.push(text) });
  const first = toasts.show('first', { error: true });
  toasts.show('second', { error: true });
  toasts.show('third', { error: true });
  const detail = '<img src=x onerror=alert(1)>\nNative failure',
    last = toasts.show('fourth', { error: true, detail });
  assert.equal(toasts.items.length, 3);
  assert.equal(first.node.parentElement, null);
  const details = last.node.children[2];
  assert.equal(details.tagName, 'DETAILS');
  assert.equal(details.children[0].textContent, 'Details');
  assert.equal(details.children[1].textContent, detail);
  assert.equal(details.children[1].children.length, 0);
  await details.children[2].onclick();
  assert.deepEqual(copied, [detail]);
  assert.equal(details.children[2].textContent, 'Copied');
});

test('clipboard failure leaves selectable details available', async () => {
  const doc = dom(),
    host = element(doc, 'toast'),
    toasts = new Toasts(host, {
      copy: async () => {
        throw Error('denied');
      },
    }),
    item = toasts.show('failure', { error: true, detail: 'keep me' });
  const details = item.node.children[2];
  await details.children[2].onclick();
  assert.equal(doc.activeElement, details.children[1]);
  assert.equal(details.children[1].textContent, 'keep me');
});

test('mounted notices preserve the legacy error-only #toast contract', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { doc, messages } = mounted(t);
  messages.publish('Saved model.polyproj');
  assert.equal(doc.getElementById('toast').hidden, true);
  assert.equal(doc.getElementById('success-toasts').hidden, false);
  const message = messages.error(Error('Faceting prototype requires intrinsic 3D source coordinates.'));
  messages.publish(message);
  assert.equal(doc.getElementById('toast').hidden, false);
  assert.match(doc.getElementById('status').textContent, /only works on 3D/);
  assert.equal(doc.getElementById('friendly-notifications').children.length, 2);
  t.mock.timers.tick(3600);
  assert.equal(doc.getElementById('success-toasts').hidden, true);
  assert.equal(doc.getElementById('toast').hidden, false);
});

test('job indicator waits 700 ms and clears immediately on cancellation or completion', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const { doc, messages } = mounted(t),
    jobs = new Map([['job', { start: 0 }]]),
    progress = doc.getElementById('job-progress');
  messages.syncJobs(jobs);
  assert.equal(progress.hidden, true);
  now = 699;
  t.mock.timers.tick(699);
  assert.equal(progress.hidden, true);
  now = 700;
  t.mock.timers.tick(1);
  assert.equal(progress.hidden, false);
  assert.equal(progress.getAttribute('role'), 'progressbar');
  assert.equal(progress.getAttribute('aria-valuenow'), null);
  assert.equal(doc.getElementById('status').getAttribute('aria-busy'), 'true');
  jobs.clear();
  messages.syncJobs(jobs);
  assert.equal(progress.hidden, true);
  assert.equal(doc.getElementById('status').getAttribute('aria-busy'), 'false');
  jobs.set('quick', { start: now });
  messages.syncJobs(jobs);
  jobs.clear();
  messages.syncJobs(jobs);
  now = 5000;
  t.mock.timers.tick(5000);
  assert.equal(progress.hidden, true);
});

test('error Details stay usable above a modal and return to the workspace on close', (t) => {
  const { doc, messages } = mounted(t),
    dialog = element(doc, 'export-dialog', 'dialog');
  doc.querySelectorAll = () => [dialog];
  messages.error(Error('Export failed: destination disappeared'));
  assert.equal(messages.stack.parentElement, dialog);
  doc.listeners.close({ target: dialog });
  assert.equal(messages.stack.parentElement, doc.body);
  assert.equal(doc.getElementById('toast').hidden, false);
});

test('Expert tools class is read for timing and legacy status re-renders when toggled', (t) => {
  const { doc, messages, observers } = mounted(t);
  assert.equal(messages.job('Analyze incidence', { phase: 'complete', elapsed: 410 }), 'Shape analysis ready');
  messages.publish('Analyze incidence completed in 0.41 s');
  doc.body.className = 'expert-mode';
  observers[0].callback();
  assert.match(doc.getElementById('status').textContent, /0\.41 s/);
  assert.match(messages.job('Analyze incidence', { phase: 'complete', elapsed: 410 }), /0\.41 s/);
  doc.body.className = '';
  const text = messages.job('Load local catalog', { phase: 'complete', elapsed: 350, result: Array(1594) });
  messages.publish(text);
  messages.completed({ label: 'Load local catalog', elapsed: 350, result: Array(1594) });
  assert.equal(doc.getElementById('status').textContent, 'Loaded 1,594 models');
  doc.body.className = 'expert-mode';
  observers[0].callback();
  assert.equal(doc.getElementById('status').textContent, 'Loaded 1,594 models · 0.35 s');
  assert.match(doc.getElementById('status').title, /Load local catalog/);
  doc.body.className = '';
  observers[0].callback();
  assert.equal(doc.getElementById('status').textContent, 'Loaded 1,594 models');
});

test('workflow switches clear transient completions while retaining errors and save notices', (t) => {
  const { doc, messages } = mounted(t),
    workflow = { closest: () => ({}) };
  messages.publish('Corner cut ready');
  doc.listeners.click({ target: workflow });
  assert.equal(doc.getElementById('status').textContent, 'Ready');
  assert.equal(doc.getElementById('status').title, 'Ready');
  messages.completed({ label: 'Truncate', elapsed: 500 });
  doc.listeners.change({ target: { id: 'derived-mode' } });
  assert.equal(messages.completion, null);
  assert.equal(doc.getElementById('status').textContent, 'Ready');
  for (const text of ['Saved work.polyproj', 'The geometry engine stopped. Try the action again.']) {
    messages.publish(text);
    doc.listeners.click({ target: workflow });
    assert.equal(doc.getElementById('status').textContent, text);
  }
});

test('loading a model clears the previous workflow completion', (t) => {
  const { doc, messages, observers } = mounted(t, { modelHeading: true });
  messages.publish('Shape ready');
  doc.getElementById('model-name').textContent = 'Replacement model';
  observers.at(-1).callback();
  assert.equal(doc.getElementById('status').textContent, 'Ready');
  doc.listeners['polytope:workflow-status']({ detail: 'Shape replaced · document appearance settings applied.' });
  assert.equal(doc.getElementById('status').textContent, 'Shape replaced · document appearance settings applied.');
  messages.clearTransient();
  assert.equal(doc.getElementById('status').textContent, 'Ready');
});

test('friendly native completions retain deferred silence and cannot overwrite a newer error', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0,
    resolve;
  const shown = [],
    status = createStatus((text) => shown.push(text));
  const jobs = new NativeJobs({
    id: () => 'job',
    now: () => now,
    start: (label) => status.defer(friendlyJob(label)),
    format: friendlyJob,
    complete: (owner, text) => status.settle(owner) && status.complete(owner, text),
    settle: (owner) => status.settle(owner),
    cancel: () => {},
  });
  await jobs.run(() => 42, 'Analyze incidence');
  t.mock.timers.tick(1000);
  assert.equal(shown.length, 0);
  const work = jobs.run(() => new Promise((done) => (resolve = done)), 'Analyze incidence');
  await Promise.resolve();
  now = 500;
  t.mock.timers.tick(500);
  assert.equal(shown.at(-1), 'Analyzing shape…');
  status.set('A newer error');
  resolve(42);
  await work;
  assert.equal(shown.at(-1), 'A newer error');
});

test('audited controls explain dimension, history, empty workspace, and export restrictions', () => {
  assert.ok(AUDITED_CONTROLS.length >= 30);
  assert.match(disabledReason('undo', { canUndo: false }), /no earlier/);
  assert.match(disabledReason('redo', { canRedo: false }), /no undone/);
  assert.match(disabledReason('projection', { dimension: 3 }), /4D shape/);
  assert.match(disabledReason('promote', {}), /Compute a current/);
  assert.match(disabledReason('hide-cell', { cells: 0 }), /no 3D cells/);
  assert.match(disabledReason('save', { saving: true }), /finish saving/);
  assert.match(disabledReason('make-dual', { hasModel: false }), /Choose a model/);
  assert.match(disabledReason('make-dual', { exporting: true }), /cancel the export/);
  const doc = dom();
  for (const id of AUDITED_CONTROLS) element(doc, id, 'button').disabled = true;
  updateDisabledHints(doc, { hasModel: false });
  for (const id of AUDITED_CONTROLS) {
    const node = doc.getElementById(id);
    assert.match(node.title, /Choose a model/);
    assert.equal(node.getAttribute('aria-description'), node.title);
  }
});

test('hints restore original tooltips and preserve W52 tool-specific reasons', () => {
  const doc = dom(),
    node = element(doc, 'projection', 'select');
  node.disabled = true;
  node.title = 'Projection choices';
  const owned = updateDisabledHints(doc, { dimension: 3 });
  assert.match(node.title, /4D shape/);
  node.disabled = false;
  updateDisabledHints(doc, { dimension: 4 }, owned);
  assert.equal(node.title, 'Projection choices');
  assert.equal(node.dataset.disabledReason, undefined);
  assert.equal(node.getAttribute('aria-description'), null);
  node.disabled = true;
  node.dataset.disabledReason = 'Specific tool reason';
  node.title = 'Specific tool reason';
  updateDisabledHints(doc, {}, owned);
  assert.equal(node.title, 'Specific tool reason');
  const fieldset = element(doc, 'fieldset', 'fieldset'),
    undo = element(doc, 'undo', 'button');
  fieldset.disabled = true;
  fieldset.append(undo);
  updateDisabledHints(doc, { hasModel: false }, owned);
  assert.match(undo.title, /Choose a model/);
});
