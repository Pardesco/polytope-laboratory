import { readAppSource, readDesktopSource } from './helpers/app-source.mjs';
import { matchSource, sourceStatement, sourceAssignment } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, readFile as readBytes, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import os from 'node:os';
import { ImageCaptureSession, saveReviewedImage } from '../ui/image-capture-session.mjs';
import { numericControlFixture, deferred, flush } from './numeric-control-fixture.mjs';
const { createImageExport, decodeImage } = createRequire(import.meta.url)('../desktop/image-export.cjs');
const app = readAppSource(),
  main = readDesktopSource(),
  preload = await readFile(new URL('../desktop/preload.cjs', import.meta.url), 'utf8');
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
test('specialist reviewed saves preserve existing bytes when ownership changes in the chooser', async (t) => {
  const f = await fixture(t),
    gate = deferred();
  let current = true,
    entered = false;
  f.setChoose(() => {
    entered = true;
    return gate.promise;
  });
  const pending = saveReviewedImage(f.bridge, png, 'Grid.png', {
    verify: () => {
      if (!current) throw Error('stale specialist');
    },
  });
  await flush();
  assert.ok(entered);
  current = false;
  gate.resolve(f.file);
  await assert.rejects(pending, /stale specialist/);
  assert.equal(await readBytes(f.file, 'utf8'), 'Prior complete image');
  assert.deepEqual(await readdir(f.root), ['capture.png']);
  const result = await saveReviewedImage(f.bridge, png, 'Grid.png', { verify() {} });
  assert.equal(result.path, f.file);
  assert.deepEqual(await readBytes(f.file), decodeImage(png));
});
test('specialist close cancels a held chooser promptly and a late choice cannot publish', async (t) => {
  const f = await fixture(t),
    gate = deferred(),
    controller = new AbortController();
  f.setChoose(() => gate.promise);
  const pending = saveReviewedImage(f.bridge, png, 'Reciprocal.png', { signal: controller.signal, verify() {} });
  await flush();
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  gate.resolve(f.file);
  await flush();
  assert.equal(await readBytes(f.file, 'utf8'), 'Prior complete image');
});
async function fixture(t) {
  const f = numericControlFixture(Object.prototype, {}),
    root = await mkdtemp(path.join(os.tmpdir(), 'polytope-image-capture-')),
    file = path.join(root, 'capture.png');
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^polytope-image-capture-/);
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(file, 'Prior complete image');
  let choose = async () => file,
    prepare = async () => {},
    camera = { zoom: 1 },
    bridge;
  const calls = [],
    handlers = new Map();
  const exporter = createImageExport({
    selectPath: async (params) => {
      calls.push('dialog');
      return choose(params);
    },
  });
  const handlerCode = ['save-image', 'image-export-begin', 'image-export-write', 'image-export-abort']
    .map((op) =>
      sourceStatement(
        main,
        (n) =>
          n.type === 'ExpressionStatement' &&
          n.expression.callee?.name === 'handle' &&
          n.expression.arguments[0]?.value === op
      )
    )
    .join('\n');
  new Function('scope', `const ctx=scope;with(scope){${handlerCode}}`)({
    imageExports: exporter,
    handle: (name, fn) => handlers.set(name, fn),
  });
  runInNewContext(preload, {
    require: (name) => {
      assert.equal(name, 'electron');
      return {
        contextBridge: { exposeInMainWorld: (_name, value) => (bridge = value) },
        ipcRenderer: { invoke: async (name, ...args) => handlers.get(name)(...args) },
      };
    },
  });
  const controls = { enabled: true, enableDamping: true, update: () => calls.push('settle-camera') },
    viewer = { controls };
  const context = {
    ...f.context,
    api: bridge,
    viewer,
    getDisplay: () => ({ camera, width: 100, height: 80 }),
    stop: () => calls.push('stop'),
    prepare: async (options) => {
      calls.push('prepare');
      assert.equal(viewer.controls.enabled, false);
      assert.equal(viewer.controls.enableDamping, false);
      await prepare(options);
    },
    image: () => {
      calls.push('image');
      return png;
    },
    onSaved: (result) => calls.push(['saved', result.path]),
    onState: () => calls.push('state'),
  };
  return {
    ...f,
    root,
    file,
    calls,
    context,
    viewer,
    controls,
    bridge,
    exporter,
    session: new ImageCaptureSession(context),
    setChoose: (fn) => (choose = fn),
    setPrepare: (fn) => (prepare = fn),
    setCamera: (value) => (camera = value),
  };
}

test('reviewed capture settles and holds observation, then publishes exact PNG through real preload/main handlers', async (t) => {
  const f = await fixture(t),
    before = structuredClone(f.state),
    result = await f.session.run();
  assert.equal(result.path, f.file);
  assert.equal(result.format, 'png');
  assert.deepEqual(await readBytes(f.file), decodeImage(png));
  assert.deepEqual(await readdir(f.root), ['capture.png']);
  assert.deepEqual(f.state, before);
  assert.deepEqual(f.calls.slice(0, 5), ['state', 'stop', 'settle-camera', 'prepare', 'image']);
  assert.equal(f.controls.enabled, true);
  assert.equal(f.controls.enableDamping, true);
  assert.equal(f.session.busy, false);
});

for (const field of ['geometry', 'notes', 'pose', 'camera', 'source', 'project', 'export'])
  test(`a held PNG chooser cannot publish after ${field} changes`, async (t) => {
    const f = await fixture(t),
      gate = deferred();
    f.setChoose(() => gate.promise);
    const pending = f.session.run();
    await flush();
    if (field === 'geometry') f.state.model.vertices[0][0] = 8;
    if (field === 'notes') f.state.notes = 'new';
    if (field === 'pose') f.state.view.angles[0] = 50;
    if (field === 'camera') f.setCamera({ zoom: 5 });
    if (field === 'source') f.document.states[0] = { ...f.state };
    if (field === 'project') f.setProject({ ...f.project });
    if (field === 'export') f.setExport(true);
    gate.resolve(f.file);
    await assert.rejects(pending, /changed|export/i);
    assert.equal(await readBytes(f.file, 'utf8'), 'Prior complete image');
    assert.equal(f.controls.enabled, true);
    assert.equal(f.session.busy, false);
  });

test('global cancellation during an ignored image decoder settles promptly and prevents late dialog/write', async (t) => {
  const f = await fixture(t),
    gate = deferred();
  let signal;
  f.setPrepare((options) => {
    signal = options.signal;
    return gate.promise;
  });
  const pending = f.session.run();
  await flush();
  f.session.cancel();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(signal.aborted, true);
  assert.equal(f.session.busy, false);
  assert.equal(f.controls.enabled, true);
  gate.resolve();
  await flush();
  assert.equal(f.calls.includes('dialog'), false);
  assert.equal(await readBytes(f.file, 'utf8'), 'Prior complete image');
  f.setPrepare(async () => {});
  assert.equal((await f.session.run()).path, f.file);
});

test('a document revision sync cancels an owned chooser before a late file selection can replace an image', async (t) => {
  const f = await fixture(t),
    gate = deferred();
  f.setChoose(() => gate.promise);
  const pending = f.session.run();
  await flush();
  f.state.notes = 'Changed notes';
  f.session.sync();
  await assert.rejects(pending, { name: 'AbortError' });
  gate.resolve(f.file);
  await flush();
  assert.equal(await readBytes(f.file, 'utf8'), 'Prior complete image');
  assert.equal(f.session.busy, false);
});

test('duplicate capture commands and active animation export refuse before preparing another image', async (t) => {
  const f = await fixture(t),
    gate = deferred();
  f.setPrepare(() => gate.promise);
  const pending = f.session.run();
  await flush();
  await assert.rejects(f.session.run(), /current image capture/);
  assert.equal(f.calls.filter((c) => c === 'prepare').length, 1);
  f.session.cancel();
  await assert.rejects(pending, { name: 'AbortError' });
  gate.resolve();
  f.setExport(true);
  const before = f.calls.length;
  await assert.rejects(f.session.run(), /animation export/);
  assert.equal(f.calls.length, before);
});

test('failed capture and canceled chooser restore already-disabled observation and preserve the prior image', async (t) => {
  const f = await fixture(t);
  f.controls.enabled = false;
  f.controls.enableDamping = false;
  f.setPrepare(async () => {
    throw Error('Texture failed');
  });
  await assert.rejects(f.session.run(), /Texture failed/);
  assert.equal(f.controls.enabled, false);
  assert.equal(f.controls.enableDamping, false);
  f.setPrepare(async () => {});
  f.setChoose(async () => ({ canceled: true }));
  assert.equal(await f.session.run(), null);
  assert.equal(await readBytes(f.file, 'utf8'), 'Prior complete image');
});

test('legacy saveImage callers share atomic output and retain the exact PNG bytes', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.bridge.saveImage(png)).path, f.file);
  assert.deepEqual(await readBytes(f.file), decodeImage(png));
});

test('actual app capture stops competing playback, forwards morph/content cancellation, and wires global activity', async () => {
  const calls = [],
    source = { view: { dualMorph: { enabled: true } } };
  let context;
  const scope = {
    ImageCaptureSession: class {
      constructor(c) {
        context = c;
        this.busy = false;
      }
    },
    imageCapture: null,
    project: {},
    doc() {},
    state: () => source,
    animation: { exporting: false, pause: () => calls.push('animation') },
    tourExporting: false,
    viewportControls: { stop: () => calls.push('viewport') },
    tours: { pause: () => calls.push('tour') },
    dualMorph: {
      pause: () => calls.push('morph'),
      prepareCapture: async (options) => calls.push(['morph-prepare', options]),
    },
    base: {
      cameraState: () => ({ zoom: 1 }),
      renderer: { domElement: { width: 100, height: 80 } },
      prepareCapture: async (options) => calls.push(['base-prepare', options]),
      image: () => png,
    },
    api: {},
    setStatus() {},
    $: () => ({}),
    syncCancelAvailability: () => calls.push('availability'),
  };
  const code = sourceAssignment(app, 'ctx.imageCapture');
  new Function('scope', `const ctx=scope;with(scope){${code}}`)(scope);
  context.stop();
  assert.deepEqual(calls, ['viewport', 'animation', 'tour', 'morph']);
  const options = { signal: new AbortController().signal, isCurrent: () => true };
  await context.prepare(options);
  assert.strictEqual(calls[4][1], options);
  assert.strictEqual(calls[5][1], options);
  matchSource(app, /image:\(\)=>imageCapture.run\(\)/);
  matchSource(app, /imageCapture\?\.cancel\(\)/);
  context.onState();
  assert.equal(calls.at(-1), 'availability');
});
