import { readAppSource } from './helpers/app-source.mjs';
import { matchSource } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CanvasOverlays, canvasOverlays, canvasSafeInsets, readExplore } from '../ui/canvas-overlays.mjs';
import { Tips } from '../ui/tips.mjs';
import { ViewportControls } from '../ui/viewport-controls.mjs';
import { readFileSync } from 'node:fs';

const storage = () => {
  const values = new Map();
  return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
};
class Node {
  constructor(doc) {
    this.ownerDocument = doc;
    this.children = [];
    this.hidden = false;
    this.attributes = {};
    this.events = {};
    this.classList = { toggle() {}, remove() {} };
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node.parentElement) node.parentElement.children = node.parentElement.children.filter((n) => n !== node);
      node.parentElement = this;
      this.children.push(node);
    }
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((node) => node !== this);
    this.parentElement = null;
  }
  after(node) {
    this.parentElement.append(node);
  }
  setAttribute(k, v) {
    this.attributes[k] = v;
  }
  addEventListener(type, fn) {
    (this.events[type] ??= []).push(fn);
  }
  contains(node) {
    return this === node || this.children.some((n) => n.contains(node));
  }
  all() {
    return this.children.flatMap((n) => [n, ...n.all()]);
  }
  querySelector() {
    return this.children[0] ?? null;
  }
  click() {
    this.onclick?.();
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
}
function fixture({ dimension = 4, local = storage() } = {}) {
  const doc = { createElement: () => new Node(doc) },
    host = new Node(doc);
  doc.getElementById = (id) => host.all().find((node) => node.id === id);
  doc.defaultView = { localStorage: local };
  const timers = new Map();
  let next = 0,
    state = { model: { dimension }, view: {} },
    exporting = false;
  const overlays = new CanvasOverlays({
      document: doc,
      host,
      storage: local,
      schedule: (fn, ms) => {
        timers.set(++next, { fn, ms });
        return next;
      },
      cancel: (id) => timers.delete(id),
    }),
    calls = [];
  overlays.configure({
    getState: () => state,
    getModel: () => state.model,
    canEdit: () => !exporting,
    guard: (fn) => fn,
    turn: () => calls.push('turn'),
    build: () => calls.push('build'),
    reveal: (node) => calls.push(node?.id),
    stop: () => calls.push('stop'),
  });
  const hint = (id) => {
    const n = new Node(doc);
    n.id = id;
    host.append(n);
    return n;
  };
  return {
    doc,
    host,
    overlays,
    local,
    timers,
    calls,
    hint,
    get state() {
      return state;
    },
    replace: () => {
      state = { ...state };
    },
    export: () => {
      exporting = true;
    },
    tick: () => {
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      assert.equal(timer.ms, 8000);
      timer.fn();
    },
  };
}

test('tips, gestures and exploration queue in one slot; priority never displays two hints', () => {
  const f = fixture(),
    tip = f.hint('tip'),
    gesture = f.hint('gesture');
  f.overlays.enqueue('tip', tip);
  f.overlays.enqueue('direct4d', gesture, { priority: 5 });
  f.overlays.freshOpen(f.state.model);
  assert.equal(tip.hidden, true);
  assert.equal(gesture.hidden, true);
  assert.equal(f.overlays.active.key, 'explore');
  assert.equal(f.timers.size, 1);
  f.tick();
  assert.equal(f.overlays.active.key, 'direct4d');
  assert.equal(gesture.hidden, false);
  assert.equal(tip.hidden, true);
  f.tick();
  assert.equal(f.overlays.active.key, 'tip');
  assert.equal(gesture.hidden, true);
  assert.equal(tip.hidden, false);
  f.tick();
  assert.equal(f.overlays.slot.hidden, true);
  assert.equal(f.timers.size, 0);
});

test('first canvas interaction consumes queued hints; interactions inside the hint slot preserve its actions', () => {
  const f = fixture(),
    node = f.hint('tip');
  let reason;
  f.overlays.enqueue('tip', node, { onDismiss: (r) => (reason = r) });
  f.host.events.pointerdown[0]({ type: 'pointerdown', target: node });
  assert.equal(node.hidden, false);
  f.host.events.pointerdown[0]({ type: 'pointerdown', target: f.host });
  assert.equal(node.hidden, true);
  assert.equal(reason, 'interaction');
  assert.equal(f.overlays.slot.hidden, true);
  assert.equal(f.timers.size, 0);
});

test('a queued hint requests a safe-area refit, and keyboard focus holds its dismissal timer', () => {
  const f = fixture(),
    hint = f.hint('tip');
  let refits = 0;
  f.overlays.configure({ refitOverlay: () => refits++ });
  f.overlays.enqueue('tip', hint);
  assert.equal(refits, 1);
  hint.focus();
  f.tick();
  assert.equal(hint.hidden, false);
  assert.equal(f.timers.size, 1);
  f.doc.activeElement = f.host;
  f.tick();
  assert.equal(hint.hidden, true);
});

test('hidden mode suppresses the entire queue and leaves tip preferences untouched', () => {
  const f = fixture(),
    counts = f.hint('counts-strip');
  // Tips uses the same per-host owner as the gesture controls.
  const shared = canvasOverlays(f.doc, f.host);
  shared.enable(false);
  shared.enqueue('direct4d', f.hint('gesture'));
  const denied = {
    getItem() {
      assert.fail('hidden tips read preferences');
    },
    setItem() {
      assert.fail('hidden tips write preferences');
    },
  };
  const tips = new Tips({ document: f.doc, storage: denied, session: denied });
  assert.equal(tips.overlays, shared);
  tips.start({ hidden: true });
  assert.equal(shared.slot.hidden, true);
  assert.equal(tips.root.hidden, true);
  assert.equal(counts.parentElement, f.host);
  shared.dismissAll('cleanup');
});

test('Explore actions invoke real targets, save progress and finish after every available action is used', async () => {
  const f = fixture(),
    row = f.hint('element-types-cell'),
    button = new Node(f.doc);
  let selected = 0;
  button.onclick = () => selected++;
  row.append(button);
  f.overlays.freshOpen(f.state.model);
  const root = f.doc.getElementById('explore-shape');
  await f.doc.getElementById('explore-shape-turn').onclick();
  assert.deepEqual(f.calls, ['turn']);
  await f.doc.getElementById('explore-shape-elements').onclick();
  assert.equal(selected, 1);
  assert.equal(row.open, true);
  assert.equal(f.doc.activeElement, button);
  await f.doc.getElementById('explore-shape-build').onclick();
  assert.equal(f.calls.at(-1), 'build');
  assert.equal(root.hidden, true);
  assert.deepEqual(readExplore(f.local).used, ['turn', 'elements', 'build']);
  f.overlays.freshOpen(f.state.model);
  assert.equal(f.overlays.active, null);
});

test('Explore dismissal persists, 3D labels use faces, and ordinary sync never reopens it', () => {
  const local = storage(),
    f = fixture({ dimension: 3, local });
  f.overlays.freshOpen(f.state.model);
  assert.equal(f.doc.getElementById('explore-shape-turn'), undefined);
  assert.equal(f.doc.getElementById('explore-shape-elements').textContent, 'See its faces');
  f.doc.getElementById('explore-shape-dismiss').click();
  assert.equal(readExplore(local).dismissed, true);
  f.overlays.sync();
  assert.equal(f.overlays.slot.hidden, true);
  const reload = fixture({ local });
  reload.overlays.freshOpen(reload.state.model);
  assert.equal(reload.overlays.active, null);
});

test('source navigation and exports refuse opening actions and cannot save stale progress', async () => {
  for (const change of [(f) => f.replace(), (f) => f.export()]) {
    const f = fixture();
    f.overlays.freshOpen(f.state.model);
    const action = f.doc.getElementById('explore-shape-turn');
    change(f);
    await action.onclick();
    f.overlays.sync();
    assert.deepEqual(f.calls, []);
    assert.deepEqual(readExplore(f.local).used, []);
    assert.equal(action.disabled, true);
    assert.equal(f.overlays.slot.hidden, true);
  }
});

test('malformed or unavailable preferences never block exploration', () => {
  assert.deepEqual(readExplore({ getItem: () => '{bad' }), { dismissed: false, used: [] });
  assert.deepEqual(readExplore({ getItem: () => '{"used":["turn","evil"],"dismissed":"true"}' }), {
    dismissed: false,
    used: ['turn'],
  });
  const f = fixture({
    local: {
      getItem() {
        throw Error();
      },
      setItem() {
        throw Error();
      },
    },
  });
  f.overlays.freshOpen(f.state.model);
  assert.doesNotThrow(() => f.doc.getElementById('explore-shape-dismiss').click());
});

test('fresh models replace the opening strip without duplicate ids or reopening on edits', () => {
  const f = fixture();
  f.overlays.freshOpen(f.state.model);
  const old = f.doc.getElementById('explore-shape');
  f.overlays.freshOpen(f.state.model);
  const current = f.doc.getElementById('explore-shape');
  assert.notEqual(current, old);
  assert.equal(f.host.all().filter((node) => node.id === 'explore-shape').length, 1);
  f.overlays.dismiss('explore', 'timeout');
  f.overlays.sync();
  assert.equal(current.hidden, true);
});

test('safe area chooses the larger rectangle beside or below the turn widget', () => {
  const wide = canvasSafeInsets(1400, 700, { bottom: 112, widget: { left: 1230, bottom: 164 } }),
    narrow = canvasSafeInsets(420, 700, { bottom: 112, widget: { left: 250, bottom: 164 } });
  assert.ok(wide.right > wide.left);
  assert.equal(wide.top, 16 / 700);
  assert.ok(narrow.top > 16 / 700);
  assert.equal(narrow.right, 16 / 420);
  assert.deepEqual(canvasSafeInsets(0, 0), {});
});

test('fresh library opens and startup rotation frame once; view-only sync does not refit', () => {
  const f = fixture(),
    calls = [],
    context = {
      getState: () => f.state,
      getModel: () => f.state.model,
      isExporting: () => false,
      base: { resize: () => calls.push('resize'), fit: () => calls.push('fit'), cameraState: () => ({ zoom: 1 }) },
    };
  const viewport = Object.assign(Object.create(ViewportControls.prototype), {
    context,
    overlays: f.overlays,
    syncPlaying() {},
  });
  viewport.opened(f.state.model);
  assert.deepEqual(calls, ['resize', 'fit']);
  assert.deepEqual(f.state.view.camera, { zoom: 1 });
  viewport.startStartupRotation();
  assert.equal(calls.filter((x) => x === 'fit').length, 2);
  assert.equal(viewport.playing, true);
  f.overlays.sync();
  assert.equal(calls.filter((x) => x === 'fit').length, 2);
  const app = readAppSource();
  matchSource(app, /if\(activate&&(?:ctx\.)?catalog\)(?:ctx\.)?viewportControls\?\.opened\(m\)/);
});
