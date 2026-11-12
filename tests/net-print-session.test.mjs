import { readAppSource, readDesktopSource } from './helpers/app-source.mjs';
import {
  indexOfSource,
  matchSource,
  sourceFunction,
  sourceAssignment,
  sourceStatement,
  sourceNodes,
} from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { NetExportSession } from '../ui/net-export-session.mjs';
import { numericControlFixture, deferred, flush } from './numeric-control-fixture.mjs';
const { createNetPrinting } = createRequire(import.meta.url)('../desktop/net-printing.cjs');
const main = readDesktopSource(),
  preload = await readFile(new URL('../desktop/preload.cjs', import.meta.url), 'utf8'),
  app = readAppSource();
const single = sourceFunction(main, 'printDocument');
const packed = sourceFunction(main, 'packedPrintDocument');
// Window-closure disposal must be registered after the main window exists.
const closeCode = "  window.on('closed',()=>netPrinting.dispose());\n";
const closed = indexOfSource(main, closeCode),
  created = indexOfSource(main, '  window=createAppWindow(');
assert.ok(created >= 0 && closed > created, 'net printing closure is registered after the main window is created');
const handlersCode =
  main.slice(
    sourceNodes(
      main,
      (n) =>
        n.type === 'ExpressionStatement' &&
        n.expression.type === 'AssignmentExpression' &&
        n.expression.left.type === 'MemberExpression' &&
        n.expression.left.object.name === 'ctx' &&
        n.expression.left.property.name === 'netPrinting'
    )[0].start,
    sourceNodes(
      main,
      (n) =>
        n.type === 'ExpressionStatement' &&
        n.expression.callee?.name === 'handle' &&
        n.expression.arguments[0]?.value === 'save-packed-net-pdf'
    )[0].start
  ) + closeCode;
function fixture() {
  const f = numericControlFixture(Object.prototype, {}),
    windows = [],
    handlers = new Map();
  let closed,
    bridge,
    gate = null,
    loadError = null,
    printing = null;
  f.state.model.fingerprint = 'print-source';
  f.state.view.net = { root: 0, length: 25, tabs: true, display: 'layout', page: 0 };
  f.state.netLayout = {
    sourceId: f.state.model.id,
    sourceFingerprint: 'print-source',
    root: 0,
    referenceEdgeLengthMm: 25,
    tabs: true,
    printSource: { metadata: structuredClone(f.state.model.metadata) },
    svg: '<svg width="100mm" height="80mm"></svg>',
  };
  f.state.netPages = {
    pages: [
      { svg: '<svg width="210mm" height="297mm">one</svg>' },
      { svg: '<svg width="210mm" height="297mm">two</svg>' },
    ],
  };
  const scope = {
    createNetPrinting,
    handle: (name, fn) => handlers.set(name, fn),
    window: { on: (_name, fn) => (closed = fn) },
    netPrinting: null,
    createAppWindow: (options) => {
      const w = {
        options,
        destroyed: false,
        prints: 0,
        isDestroyed() {
          return this.destroyed;
        },
        destroy() {
          this.destroyed = true;
          this.callback?.(false, 'cancelled');
        },
        async loadURL(url) {
          this.url = url;
          if (gate) await gate.promise;
          if (loadError) throw loadError;
        },
        webContents: {
          print: (options, callback) => {
            w.prints++;
            w.printOptions = options;
            w.callback = callback;
            if (printing) printing(w, callback);
            else callback(true);
          },
        },
      };
      windows.push(w);
      return w;
    },
  };
  new Function('scope', `const ctx=scope;with(scope){${single}${packed}${handlersCode}}`)(scope);
  runInNewContext(preload, {
    require: (name) => {
      assert.equal(name, 'electron');
      return {
        contextBridge: { exposeInMainWorld: (_name, value) => (bridge = value) },
        ipcRenderer: { invoke: async (name, ...args) => handlers.get(name)(...args) },
      };
    },
  });
  f.context.api = bridge;
  const session = new NetExportSession(f.context),
    editor = {
      exports: session,
      cancelDrag() {
        this.canceledDrag = true;
      },
    };
  const appScope = {
    netEditor: editor,
    state: f.context.getState,
    animation: { exporting: false },
    tourExporting: false,
  };
  const printNet = new Function(
    'scope',
    `const ctx=scope;with(scope){${sourceFunction(app, 'printNet')}return printNet;}`
  )(appScope);
  return {
    ...f,
    windows,
    session,
    editor,
    printNet,
    appScope,
    manager: scope.netPrinting,
    close: () => closed(),
    setGate: (value) => (gate = value),
    setLoadError: (value) => (loadError = value),
    setPrinting: (value) => (printing = value),
  };
}

test('actual app, preload and main print the reviewed calibrated layout only after preparation', async () => {
  const f = fixture(),
    gate = deferred();
  f.setGate(gate);
  const pending = f.printNet();
  await flush();
  assert.equal(f.windows.length, 1);
  assert.equal(f.windows[0].prints, 0);
  assert.equal(f.session.busy, true);
  assert.equal(f.editor.canceledDrag, true);
  gate.resolve();
  assert.equal(await pending, true);
  const w = f.windows[0];
  assert.equal(w.prints, 1);
  assert.deepEqual(w.printOptions, { printBackground: true, scaleFactor: 100 });
  const html = decodeURIComponent(w.url.split(',').slice(1).join(','));
  assert.match(html, /@page \{size:120mm 100mm;margin:10mm\}/);
  assert.ok(html.includes(f.state.netLayout.svg));
  assert.equal(w.destroyed, true);
  assert.equal(f.session.busy, false);
  matchSource(app, /print:printNet/);
});

test('packed printing retains every reviewed page and physical paper dimensions', async () => {
  const f = fixture();
  f.state.view.net.display = 'pages';
  assert.equal(await f.printNet(), true);
  const html = decodeURIComponent(f.windows[0].url.split(',').slice(1).join(','));
  assert.match(html, /@page\{size:210mm 297mm;margin:0\}/);
  for (const page of f.state.netPages.pages) assert.ok(html.includes(page.svg));
  assert.equal(f.windows[0].destroyed, true);
});

for (const change of ['geometry', 'layout', 'scale', 'notes', 'content', 'paper', 'project', 'export'])
  test(`held print preparation refuses ${change} changes before opening the print dialog`, async () => {
    const f = fixture(),
      gate = deferred();
    f.setGate(gate);
    const pending = f.printNet();
    await flush();
    if (change === 'geometry') f.state.model.vertices[0][0] = 9;
    if (change === 'layout') f.state.netLayout.svg = '<svg>changed</svg>';
    if (change === 'scale') f.state.view.net.length = 99;
    if (change === 'notes') f.state.notes = 'new notes';
    if (change === 'content') f.state.view.elementAnnotations = { entries: [] };
    if (change === 'paper') f.state.view.netPrint = { paper: 'letter' };
    if (change === 'project') f.setProject({ ...f.project });
    if (change === 'export') f.setExport(true);
    gate.resolve();
    await assert.rejects(pending, /changed|export/i);
    assert.equal(f.windows[0].prints, 0);
    assert.equal(f.windows[0].destroyed, true);
    assert.equal(f.session.busy, false);
  });

test('cancel during loading settles promptly, destroys the window and fences a late completion across retry', async () => {
  const f = fixture(),
    gate = deferred();
  f.setGate(gate);
  const pending = f.printNet();
  await flush();
  f.session.cancel();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(f.windows[0].destroyed, true);
  assert.equal(f.session.busy, false);
  f.setGate(null);
  assert.equal(await f.printNet(), true);
  gate.resolve();
  await flush();
  assert.equal(f.windows[0].prints, 0);
  assert.equal(f.windows[1].prints, 1);
});

test('duplicate renderer and native print commands cannot create a second dialog or window', async () => {
  const f = fixture(),
    gate = deferred();
  f.setGate(gate);
  const pending = f.printNet();
  await flush();
  await assert.rejects(f.printNet(), /current net export/);
  await assert.rejects(
    f.manager.begin('other', { packed: false, content: f.state.netLayout.svg }),
    /current net print/
  );
  assert.equal(f.windows.length, 1);
  gate.resolve();
  await pending;
});

test('invalid or stale print input and export guards refuse before creating any window', async () => {
  for (const mode of ['stale', 'missing', 'pages', 'animation', 'tour']) {
    const f = fixture();
    if (mode === 'stale') f.state.view.net.length = 51;
    if (mode === 'missing') f.state.netLayout = null;
    if (mode === 'pages') {
      f.state.view.net.display = 'pages';
      f.state.netPages = null;
    }
    if (mode === 'animation') f.appScope.animation.exporting = true;
    if (mode === 'tour') f.appScope.tourExporting = true;
    await assert.rejects(
      Promise.resolve().then(() => f.printNet()),
      /current|Pack|export/i
    );
    assert.equal(f.windows.length, 0);
  }
});

for (const packed of [false, true])
  test(`${packed ? 'packed' : 'single'} hidden print window is cleaned after a load failure and can retry`, async () => {
    const f = fixture();
    f.state.view.net.display = packed ? 'pages' : 'layout';
    f.setLoadError(Error('Page load failed'));
    await assert.rejects(f.printNet(), /load failed/);
    assert.equal(f.windows[0].destroyed, true);
    assert.equal(f.windows[0].prints, 0);
    f.setLoadError(null);
    assert.equal(await f.printNet(), true);
  });

test('native print cancellation is quiet; printer failure still cleans the window and releases the lock', async () => {
  const f = fixture();
  f.setPrinting((_w, done) => done(false, 'cancelled'));
  assert.equal(await f.printNet(), false);
  assert.equal(f.windows[0].destroyed, true);
  f.setPrinting((_w, done) => done(false, 'Printer unavailable'));
  await assert.rejects(f.printNet(), /Printer unavailable/);
  assert.equal(f.windows[1].destroyed, true);
  assert.equal(f.session.busy, false);
});

test('main-window closure cancels private preparation before native printing', async () => {
  const f = fixture(),
    gate = deferred();
  f.setGate(gate);
  const pending = f.printNet();
  await flush();
  f.close();
  gate.resolve();
  await assert.rejects(pending, /canceled/);
  assert.equal(f.windows[0].prints, 0);
  assert.equal(f.windows[0].destroyed, true);
});

test('prepared print expires without opening a native dialog', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = {
    destroyed: false,
    isDestroyed() {
      return this.destroyed;
    },
    destroy() {
      this.destroyed = true;
    },
  };
  const manager = createNetPrinting({
    expiryMs: 20,
    prepare: async (_params, track) => {
      track(w);
      return w;
    },
    print: () => {
      throw Error('Must not print');
    },
  });
  await manager.begin('expires', { packed: false, content: 'svg' });
  t.mock.timers.tick(20);
  assert.equal(w.destroyed, true);
  await assert.rejects(manager.commit('expires'), /canceled/);
});

test('duplicate native commits cannot open another dialog while the first print callback is pending', async () => {
  const f = fixture(),
    gate = deferred(),
    begin = f.context.api.beginNetPrint;
  let ticket;
  f.context.api.beginNetPrint = (id, params) => {
    ticket = id;
    return begin(id, params);
  };
  f.setPrinting((_w, done) => gate.promise.then(() => done(true)));
  const pending = f.printNet();
  await flush();
  await assert.rejects(f.manager.commit(ticket), /Wait/);
  assert.equal(f.windows[0].prints, 1);
  gate.resolve();
  await pending;
});

test('cancel while the print callback is pending releases both locks and closes the private window', async () => {
  const f = fixture();
  f.setPrinting(() => {});
  const pending = f.printNet();
  await flush();
  assert.equal(f.windows[0].prints, 1);
  f.session.cancel();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(f.windows[0].destroyed, true);
  assert.equal(f.session.busy, false);
  f.setPrinting(null);
  assert.equal(await f.printNet(), true);
});

test('a prepared print alone exposes global Cancel even without any native geometry job', () => {
  const node = {},
    scope = {
      $: () => node,
      imageCapture: null,
      nativeJobs: { pending: new Map() },
      derivedControls: {},
      derivedWork: { active: false },
      netEditor: { exports: { busy: true } },
    };
  const code = sourceFunction(app, 'syncCancelAvailability');
  const sync = new Function('scope', `const ctx=scope;with(scope){${code};return syncCancelAvailability;}`)(scope);
  sync();
  assert.equal(node.hidden, false);
  scope.netEditor.exports.busy = false;
  sync();
  assert.equal(node.hidden, true);
});
