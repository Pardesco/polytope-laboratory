import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AnimationControls } from '../ui/animation-controls.mjs';
import { AnimatedTourExporter } from '../ui/animated-tour-export.mjs';
import { createSequence } from '../ui/animation.mjs';
import { prepareAnimatedTourTimeline } from '../ui/animated-tour-timeline.mjs';
const require = createRequire(import.meta.url),
  { createAnimationExportManager } = require('../desktop/animation-export.cjs');
function mediaEnvironment(t) {
  const saved = ['document', 'VideoEncoder', 'VideoFrame'].map((k) => [
      k,
      Object.getOwnPropertyDescriptor(globalThis, k),
    ]),
    frames = [],
    surfaces = [];
  const makeCanvas = () => {
    const c = { width: 8, height: 6, pose: 0 };
    c.toDataURL = () => `png:${c.pose}`;
    c.getContext = () => ({
      fillRect() {},
      drawImage: (source) => {
        c.pose = source.pose;
      },
      getImageData: () => ({
        data: Uint8ClampedArray.from({ length: c.width * c.height * 4 }, (_, i) =>
          i % 4 === 3 ? 255 : Math.round(c.pose) % 256
        ),
      }),
    });
    return c;
  };
  globalThis.document = {
    createElement: (name) => {
      assert.equal(name, 'canvas');
      const c = makeCanvas();
      surfaces.push(c);
      return c;
    },
  };
  globalThis.VideoFrame = class {
    constructor(canvas, options) {
      this.pose = canvas.pose;
      Object.assign(this, options);
      frames.push(this);
    }
    close() {
      this.closed = true;
    }
  };
  globalThis.VideoEncoder = class {
    static async isConfigSupported(config) {
      return { supported: config.codec.startsWith('avc1.') };
    }
    constructor(callbacks) {
      this.callbacks = callbacks;
    }
    configure(config) {
      this.codec = config.codec;
    }
    encode(frame) {
      this.frame = frame;
    }
    async flush() {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (this.closed) return;
      const data = Uint8Array.of(0, 0, 0, 2, 0x65, Math.round(this.frame.pose));
      this.callbacks.output(
        { timestamp: this.frame.timestamp, type: 'key', byteLength: data.length, copyTo: (b) => b.set(data) },
        {
          decoderConfig: {
            codec: this.codec,
            description: Uint8Array.of(1, 66, 0, 40, 255, 225, 0, 1, 103, 1, 0, 1, 104),
          },
        }
      );
    }
    close() {
      this.closed = true;
    }
  };
  t.after(() => {
    for (const [key, d] of saved)
      if (d) Object.defineProperty(globalThis, key, d);
      else delete globalThis[key];
  });
  return { makeCanvas, frames, surfaces };
}
async function nativeFixture(t, format) {
  const directory = await mkdtemp(path.join(tmpdir(), 'polytope-media-controls-')),
    destination = path.join(directory, 'output.' + format),
    manager = createAnimationExportManager(),
    calls = [];
  await writeFile(destination, 'old');
  t.after(async () => {
    await manager.abortAll();
    await rm(directory, { recursive: true, force: true });
  });
  const api = {
    animationBegin: async (o) => {
      calls.push(['begin', o]);
      return manager.begin(o, destination);
    },
    animationWrite: async (...args) => {
      calls.push(['write', args[1]]);
      return manager.write(...args);
    },
    animationFinish: async (id) => {
      calls.push(['finish']);
      return manager.finish(id);
    },
    animationAbort: async (id) => {
      calls.push(['abort']);
      return manager.abort(id);
    },
  };
  return { directory, destination, calls, api };
}
function animationFixture(environment, native, format) {
  const state = {
    model: { name: 'Cube', dimension: 3 },
    view: { angles: Array(6).fill(0), sectionOffset: 0, derivedMode: 'none' },
    notes: 'retained',
  };
  state.view.animation = createSequence(state.view, 0.13, 24);
  state.view.animation.keyframes[1].angles[0] = 90;
  const canvas = environment.makeCanvas(),
    prepared = [],
    viewer = {
      renderer: { domElement: canvas },
      controls: { enabled: true, enableDamping: true, update() {} },
      setDisplay() {},
      draw() {
        canvas.pose = state.view.angles[0];
      },
      prepareCapture: async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        prepared.push(state.view.angles[0]);
        return { complete: true };
      },
    },
    nodes = { target: { value: 'base' }, progress: {}, size: { value: 'viewport' }, format: { value: format } };
  const context = {
    getState: () => state,
    getModel: () => state.model,
    viewer,
    api: native.api,
    display() {},
    syncPose() {},
    setStatus() {},
  };
  const controls = Object.assign(Object.create(AnimationControls.prototype), {
    context,
    nodes,
    time: 0.07,
    generation: 0,
    playing: false,
    exporting: false,
    trackSessions: { interrupt() {} },
    configure: async () => {},
    update() {},
  });
  return { controls, state, viewer, prepared };
}
for (const format of ['gif', 'mp4']) {
  test(`Animation ${format} exports exact endpoints through actual native atomic staging and restores source`, async (t) => {
    const e = mediaEnvironment(t),
      n = await nativeFixture(t, format),
      f = animationFixture(e, n, format),
      before = structuredClone(f.state);
    await f.controls.export(format);
    assert.deepEqual(f.prepared, [0, 90 / 0.13 / 24, ((90 / 0.13) * 2) / 24, ((90 / 0.13) * 3) / 24, 90]);
    assert.deepEqual(f.state, before);
    assert.equal(f.controls.time, 0.07);
    assert.equal(f.viewer.controls.enabled, true);
    assert.equal(f.controls.exporting, false);
    assert.equal(n.calls.filter((c) => c[0] === 'finish').length, 1);
    assert.equal(n.calls.filter((c) => c[0] === 'abort').length, 0);
    assert.equal(n.calls.filter((c) => c[0] === 'write').length, 7);
    const bytes = await readFile(n.destination);
    assert.equal(
      format === 'gif' ? bytes.toString('ascii', 0, 6) : bytes.toString('ascii', 4, 8),
      format === 'gif' ? 'GIF89a' : 'ftyp'
    );
    assert.deepEqual(await readdir(n.directory), ['output.' + format]);
    if (format === 'mp4') {
      assert.deepEqual(
        e.frames.map((v) => v.timestamp),
        [0, 41667, 83333, 125000, 166667]
      );
      assert.equal(e.frames.at(-1).pose, 90);
      assert.ok(e.frames.every((v) => v.closed));
    }
  });
  test(`Animation ${format} cancellation during write drains then removes staging without replacing destination`, async (t) => {
    const e = mediaEnvironment(t),
      n = await nativeFixture(t, format),
      f = animationFixture(e, n, format),
      before = structuredClone(f.state),
      write = n.api.animationWrite;
    n.api.animationWrite = async (...args) => {
      await write(...args);
      if (args[1] === 1) f.controls.cancel();
    };
    await f.controls.export(format);
    assert.deepEqual(f.state, before);
    assert.equal(await readFile(n.destination, 'utf8'), 'old');
    assert.equal(n.calls.filter((c) => c[0] === 'abort').length, 1);
    assert.equal(n.calls.filter((c) => c[0] === 'finish').length, 0);
    assert.deepEqual(await readdir(n.directory), ['output.' + format]);
    assert.equal(f.controls.exporting, false);
    assert.equal(f.viewer.controls.enabled, true);
  });
  test(`Tour ${format} export uses fine current poses and cancellation owns native staging`, async (t) => {
    for (const cancel of [false, true]) {
      const e = mediaEnvironment(t),
        n = await nativeFixture(t, format),
        canvas = e.makeCanvas(),
        times = [];
      let publication = null;
      const timeline = prepareAnimatedTourTimeline({
        version: 2,
        cursor: 0,
        events: [
          {
            id: 'a',
            duration: 0.13,
            transition: { method: 'instant' },
            state: {
              model: {
                name: 'Cube',
                dimension: 3,
                vertices: [
                  [0, 0, 0],
                  [1, 0, 0],
                  [0, 1, 0],
                ],
                edges: [
                  [0, 1],
                  [1, 2],
                  [0, 2],
                ],
                faces: [[0, 1, 2]],
                cells: [],
              },
              view: { angles: Array(6).fill(0), sectionOffset: 0 },
            },
          },
        ],
      });
      const renderer = {
        timeline,
        canvas,
        published: null,
        ownerCurrent: () => true,
        cancel() {},
        async apply(time) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          times.push(time);
          canvas.pose = time * 100;
          publication = { time, complete: true };
          return publication;
        },
        current: (p) => p === publication,
      };
      const exporter = new AnimatedTourExporter({
        renderer,
        api: n.api,
        onProgress: (p) => {
          if (cancel && p.progress === 1) exporter.cancel();
        },
      });
      if (cancel) {
        await assert.rejects(exporter.export(format, { fps: 24 }), /cancelled/);
        assert.equal(await readFile(n.destination, 'utf8'), 'old');
        assert.equal(n.calls.filter((c) => c[0] === 'abort').length, 1);
      } else {
        await exporter.export(format, { fps: 24 });
        assert.deepEqual(times, [0, 1 / 24, 2 / 24, 3 / 24, 0.13]);
        assert.equal(n.calls.filter((c) => c[0] === 'finish').length, 1);
        assert.equal(n.calls.filter((c) => c[0] === 'write').length, 7);
      }
      assert.equal(exporter.exporting, false);
      assert.deepEqual(await readdir(n.directory), ['output.' + format]);
    }
  });
}
