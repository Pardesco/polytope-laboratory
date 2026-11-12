const { readAppSource, readDesktopSource } = require('./helpers/app-source.cjs');
const { matchSource } = require('./helpers/source-match.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
const { createPresentationWindow } = require('../desktop/presentation-window.cjs');
function fixture(initial = {}) {
  const state = { fullscreen: false, menu: true, autoHide: false, zoom: 1.25, ...initial },
    calls = [];
  const window = {
    isFullScreen: () => state.fullscreen,
    isMenuBarVisible: () => state.menu,
    isMenuBarAutoHide: () => state.autoHide,
    setFullScreen: (value) => {
      calls.push(['fullscreen', value]);
      state.fullscreen = value;
    },
    setMenuBarVisibility: (v) => (state.menu = v),
    setAutoHideMenuBar: (v) => (state.autoHide = v),
    webContents: { getZoomFactor: () => state.zoom, setZoomFactor: (v) => (state.zoom = v) },
  };
  return { state, calls, window };
}
test('presentation restores the exact native fullscreen, menu, auto-hide and zoom state, including already fullscreen windows', () => {
  for (const fullscreen of [false, true])
    for (const autoHide of [false, true]) {
      const f = fixture({ fullscreen, autoHide }),
        before = { ...f.state },
        set = createPresentationWindow({ getWindow: () => f.window });
      assert.equal(set(true), true);
      assert.equal(f.state.fullscreen, true);
      assert.equal(f.state.menu, false);
      set(true);
      f.state.zoom = 2;
      assert.equal(set(false), false);
      assert.deepEqual(f.state, before);
      set(false);
      assert.deepEqual(f.state, before);
    }
});
test('hidden qualification never touches the native window and malformed renderer commands refuse', () => {
  const set = createPresentationWindow({
    getWindow: () => {
      throw Error('Hidden window accessed');
    },
    hidden: () => true,
  });
  assert.equal(set(true), false);
  assert.equal(set(false), false);
  for (const value of [undefined, null, {}, 'true', 1]) assert.throws(() => set(value), /boolean/);
});
test('fullscreen entry failure restores the native state and does not retain a phantom owner', () => {
  const f = fixture(),
    before = { ...f.state },
    set = createPresentationWindow({ getWindow: () => f.window }),
    original = f.window.setFullScreen;
  let fail = true;
  f.window.setFullScreen = (value) => {
    if (fail) {
      fail = false;
      throw Error('Native refused');
    }
    original(value);
  };
  assert.throws(() => set(true), /Native refused/);
  assert.deepEqual(f.state, before);
  set(true);
  set(false);
  assert.deepEqual(f.state, before);
});
test('real preload exposes only the bounded presentation boolean IPC and F5 is indexed for View/menu/palette', async () => {
  let api;
  const calls = [];
  vm.runInNewContext(fs.readFileSync(require.resolve('../desktop/preload.cjs'), 'utf8'), {
    require: () => ({
      contextBridge: { exposeInMainWorld: (_name, v) => (api = v) },
      ipcRenderer: { invoke: (...args) => calls.push(args) },
    }),
  });
  await api.presentationWindow(true);
  await api.presentationWindow(false);
  assert.deepEqual(calls, [
    ['presentation-window', true],
    ['presentation-window', false],
  ]);
  const bindings = require('../desktop/command-bindings.json');
  assert.equal(bindings.presentation.scope, 'View');
  assert.deepEqual(bindings.presentation.keys, ['F5']);
  const main = readDesktopSource(),
    app = readAppSource();
  matchSource(main, /label:'Presentation',accelerator:commandBindings.presentation.keys\[0\]/);
  matchSource(app, /presentation:\(\)=>showcase.enter\(\)/);
});
