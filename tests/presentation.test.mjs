import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import {
  buildPresentationPlaylist,
  PresentationPlayback,
  presentationCaption,
  presentationCaptionAt,
} from '../ui/presentation.mjs';
import { PresentationRenderer, drawPresentationCaption } from '../ui/presentation-renderer.mjs';
import { holdPresentationLayout } from '../ui/presentation-layout.mjs';
import { AnimatedTourExporter } from '../ui/animated-tour-export.mjs';
import { prepareAnimatedTourTimeline, evaluateAnimatedTour } from '../ui/animated-tour-timeline.mjs';
import { evaluateNormalized } from '../ui/animation.mjs';
import { compileCatalogQuery } from '../ui/catalog-query.mjs';
const { validateExportOptions } = createRequire(import.meta.url)('../desktop/animation-export.cjs');
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => (resolve = yes));
  return { promise, resolve };
};
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
function state(name = 'Cube', dimension = 3) {
  const vertices = [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ].map((v) => (dimension === 4 ? [...v, 1] : v));
  return {
    model: {
      id: name,
      fingerprint: name.repeat(12),
      name,
      dimension,
      embeddingDimension: dimension,
      interpretation: 'convex-polytope',
      vertices,
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [4, 5],
        [5, 6],
        [6, 7],
        [7, 4],
        [0, 4],
        [1, 5],
        [2, 6],
        [3, 7],
      ],
      faces: [
        [0, 3, 2, 1],
        [4, 5, 6, 7],
        [0, 1, 5, 4],
        [1, 2, 6, 5],
        [2, 3, 7, 6],
        [3, 0, 4, 7],
      ],
      cells: [],
      metadata: { symmetryGroup: 'Oh' },
    },
    view: {
      angles: [3, 5, 0, 0, 0, 0],
      sectionOffset: 0,
      rotationSpeed: 4,
      rotationPlane: dimension === 4 ? 2 : 1,
      viewportLayout: 'split',
      appearance: { style: 'paper' },
    },
    notes: 'A cube\nKeep the remaining notes',
    label: 'Source',
    operationNode: 'source-operation',
  };
}
function bank() {
  return {
    version: 1,
    cursor: 1,
    events: ['A', 'B', 'C'].map((name, i) => ({
      id: name,
      state: state(name),
      duration: i + 1,
      transition: 'instant',
    })),
  };
}
test('current model uses detached current style, a continuous full spin and no source/history mutation', async () => {
  for (const dimension of [3, 4]) {
    const source = state('Source', dimension),
      before = structuredClone(source),
      p = await buildPresentationPlaylist({ state: source });
    assert.deepEqual(source, before);
    assert.notEqual(p.tour.events[0].state, source);
    assert.equal(p.tour.events[0].state.view.viewportLayout, 'single');
    assert.equal(p.tour.events[0].state.view.appearance.style, 'paper');
    assert.equal(p.tour.events[0].state.operationNode, 'source-operation');
    const seq = p.tour.events[0].state.view.animation,
      index = dimension === 4 ? 2 : 1;
    assert.equal(seq.duration, 90);
    assert.equal(seq.loop, true);
    near(evaluateNormalized(seq, 45).angles[index], before.view.angles[index] + 180);
    near(evaluateNormalized(seq, 90).angles[index] - evaluateNormalized(seq, 0).angles[index], 360);
  }
});
test('current view starts its own spin while saved tour durations, animations and split panes are retained', async () => {
  const original = bank();
  original.events[0].state.view.animation = {
    version: 1,
    duration: 2,
    fps: 24,
    loop: false,
    keyframes: [
      { time: 0, angles: Array(6).fill(0), sectionOffset: 0 },
      { time: 2, angles: [30, 0, 0, 0, 0, 0], sectionOffset: 0 },
    ],
  };
  const before = structuredClone(original),
    p = await buildPresentationPlaylist({ source: 'tour', tour: original, duration: 40 });
  assert.deepEqual(
    p.tour.events.map((e) => e.duration),
    [1, 2, 3]
  );
  assert.deepEqual(p.tour.events[0].state.view.animation, before.events[0].state.view.animation);
  assert.equal(p.tour.events[0].state.view.viewportLayout, 'split');
  assert.deepEqual(original, before);
  const current = await buildPresentationPlaylist({ state: original.events[0].state });
  assert.equal(current.tour.events[0].state.view.animation.loop, true);
});
test('gallery loads offline in listed order, uses supplied preset views and caption descriptions', async () => {
  const entries = JSON.parse(await readFile(new URL('../ui/welcome-gallery.json', import.meta.url))),
    reads = [];
  const p = await buildPresentationPlaylist({
    source: 'gallery',
    entries,
    duration: 7,
    read: async (entry) => {
      reads.push(entry.key);
      return state(entry.name, entry.dimension).model;
    },
    viewForModel: (m) => ({ ...state().view, angles: [0, 0, m.dimension === 4 ? 28 : 0, 0, 0, 0] }),
  });
  assert.deepEqual(
    reads,
    entries.map((e) => e.key)
  );
  assert.equal(p.tour.events.length, 12);
  assert.deepEqual(
    p.captions.map((c) => c.description),
    entries.map((e) => e.caption)
  );
  assert.equal(p.tour.events[0].duration, 7);
  assert.equal(p.tour.events[0].state.view.angles[2], 28);
});
test('library playlist follows the full captured family/search result even beyond the catalog window', async () => {
  const entries = Array.from({ length: 305 }, (_, i) => ({
    key: String(i),
    name: i > 299 ? 'Last cube ' + i : 'Other ' + i,
    family: i % 2 ? 'Solids' : 'Other',
    dimension: 3,
  }));
  const query = compileCatalogQuery('"last cube"'),
    filtered = entries.filter((e) => e.family === 'Solids' && query(e)),
    before = structuredClone(filtered),
    reads = [];
  const p = await buildPresentationPlaylist({
    source: 'library',
    entries: filtered,
    read: async (entry) => {
      reads.push(entry.key);
      return state(entry.name).model;
    },
  });
  assert.deepEqual(reads, ['301', '303']);
  assert.equal(p.tour.events.length, 2);
  assert.deepEqual(filtered, before);
});
test('ordinary models cross-fade at fixed positions and eligible native dual endpoints plan the existing verified morph', async () => {
  const original = bank(),
    p = await buildPresentationPlaylist({ source: 'tour', tour: original, transitionDuration: 1 });
  const timeline = prepareAnimatedTourTimeline(p.tour),
    frame = evaluateAnimatedTour(timeline, 1.5);
  assert.deepEqual(
    frame.layers.map((l) => l.transitionPose.translation),
    [
      [0, 0, 0],
      [0, 0, 0],
    ]
  );
  assert.deepEqual(
    frame.layers.map((l) => l.transitionPose.opacity),
    [0.5, 0.5]
  );
  original.events[1].state.model.provenance = {
    operation: 'dual',
    sourceFingerprint: original.events[0].state.model.fingerprint,
    parameters: { radius: 1 },
  };
  const dual = await buildPresentationPlaylist({ source: 'tour', tour: original });
  assert.equal(dual.tour.events[0].transition.method, 'morph-to-dual');
  const morph = evaluateAnimatedTour(prepareAnimatedTourTimeline(dual.tour), 1.4);
  assert.equal(morph.layers.length, 1);
  assert.equal(morph.layers[0].dualTarget.id, 'B');
});
test('saved animated transitions remain available and generalized pairs retain cross-fades', async () => {
  const original = bank();
  original.version = 2;
  original.events.forEach((e) => (e.transition = { method: 'orbit', duration: 0.3 }));
  original.events[0].state.model.interpretation = 'generalized-complex';
  const p = await buildPresentationPlaylist({ source: 'tour', tour: original });
  assert.equal(p.tour.events[0].transition.method, 'orbit');
  original.version = 1;
  original.events.forEach((e) => (e.transition = 'instant'));
  original.events[1].state.model.provenance = {
    operation: 'dual',
    sourceFingerprint: original.events[0].state.model.fingerprint,
  };
  const faded = await buildPresentationPlaylist({ source: 'tour', tour: original });
  assert.equal(faded.tour.events[0].transition.method, 'sideways');
});
test('empty, rejected, oversized and invalid sources refuse before catalog reads', async () => {
  let reads = 0;
  const read = async () => {
    reads++;
    return state().model;
  };
  for (const entries of [
    [],
    Array.from({ length: 101 }, () => ({ key: 'x' })),
    [{ supported: false }],
    [{ auditStatus: 'rejected' }],
  ])
    await assert.rejects(
      buildPresentationPlaylist({ source: 'library', entries, read }),
      /No models|100 slides|unsupported or rejected/
    );
  await assert.rejects(buildPresentationPlaylist({ source: 'unknown' }), /source/);
  await assert.rejects(buildPresentationPlaylist({}), /Choose a model/);
  await assert.rejects(
    buildPresentationPlaylist({ source: 'tour', tour: { version: 1, cursor: 0, events: [] } }),
    /Add an event/
  );
  for (const duration of [0, -1, 301, NaN])
    await assert.rejects(buildPresentationPlaylist({ state: state(), duration }), /Slides require/);
  assert.equal(reads, 0);
});
test('cancelled or stale gallery preparation cannot publish a playlist or begin another read', async () => {
  for (const cancel of [true, false]) {
    const gate = deferred(),
      controller = new AbortController();
    let reads = 0,
      current = true;
    const task = buildPresentationPlaylist({
      source: 'gallery',
      entries: [{ key: 'a' }, { key: 'b' }],
      signal: controller.signal,
      check: () => {
        if (!current) throw Error('source changed');
      },
      read: async () => {
        reads++;
        await gate.promise;
        return state().model;
      },
    });
    if (cancel) controller.abort();
    else current = false;
    gate.resolve();
    await assert.rejects(task, cancel ? /cancelled/ : /source changed/);
    assert.equal(reads, 1);
  }
});
test('captions use actual incidence, first nonempty description line and declared symmetry without guessing a group', () => {
  const source = state(),
    caption = presentationCaption(source, '\n A caption\nMore');
  assert.equal(caption.title, 'Cube');
  assert.equal(caption.description, 'A caption');
  assert.match(caption.facts, /3D.*V 8.*E 12.*F 6.*Symmetry: Oh/);
  assert.doesNotMatch(caption.facts, /C 0/);
  delete source.model.metadata.symmetryGroup;
  assert.doesNotMatch(presentationCaption(source).facts, /Symmetry/);
  assert.equal(presentationCaption(source).description, 'A cube');
  source.model.dimension = 4;
  assert.match(presentationCaption(source).facts, /C 0/);
});
test('captions fade by absolute slide time and disappear over model transitions', async () => {
  const p = await buildPresentationPlaylist({ source: 'tour', tour: bank() }),
    t = prepareAnimatedTourTimeline(p.tour);
  assert.equal(presentationCaptionAt(t, 0, p.captions).opacity, 0);
  assert.equal(presentationCaptionAt(t, 0.5, p.captions).opacity, 1);
  assert.equal(presentationCaptionAt(t, 1.4, p.captions).opacity, 0);
  assert.equal(presentationCaptionAt(t, 1.8, p.captions).caption.title, 'B');
  near(presentationCaptionAt(t, 2.1, p.captions).opacity, 0.5);
});
test('playback uses a monotonic absolute clock through pause, resume, slow frames and navigation', async () => {
  const p = await buildPresentationPlaylist({ source: 'tour', tour: bank(), transitionDuration: 1 });
  let now = 1000;
  const clock = new PresentationPlayback(p.tour, { loop: false, now: () => now });
  clock.play();
  now = 2250;
  near(clock.sample().time, 1.25);
  clock.pause();
  now = 90000;
  near(clock.sample().time, 1.25);
  clock.play();
  now += 500;
  near(clock.sample().time, 1.75);
  clock.step(1);
  assert.equal(clock.sample().index, 1);
  assert.equal(clock.sample().localTime, 0);
  clock.step(-1);
  assert.equal(clock.sample().index, 0);
  now += 90000;
  assert.equal(clock.sample().ended, true);
  assert.equal(clock.playing, false);
  clock.play();
  assert.equal(clock.sample().time, 0);
});
test('looping slide navigation wraps; finite navigation clamps and does not silently unpause', async () => {
  const p = await buildPresentationPlaylist({ source: 'tour', tour: bank() });
  for (const loop of [true, false]) {
    const clock = new PresentationPlayback(p.tour, { loop, now: () => 0 });
    clock.step(-1);
    assert.equal(clock.sample().index, loop ? 2 : 0);
    clock.step(20);
    assert.equal(clock.sample().index, loop ? 1 : 2);
    assert.equal(clock.playing, false);
    assert.throws(() => clock.step(0.5), /integer/);
  }
});
function node(aria = null, inert = false) {
  const attrs = new Map(aria === null ? [] : [['aria-hidden', aria]]);
  return {
    inert,
    getAttribute: (k) => attrs.get(k) ?? null,
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k),
  };
}
test('layout hold restores classes, inline dimensions/priorities, focus and exact inert/ARIA values once', () => {
  const classes = new Set(['library-hidden', 'inspector-collapsed']),
    styles = new Map([['width', ['88%', 'important']]]),
    a = node(),
    b = node('false', true),
    overlay = { hidden: true };
  let focused = 0;
  const body = {
    children: [a, b, overlay],
    getBoundingClientRect: () => ({ width: 1400, height: 900 }),
    classList: {
      contains: (k) => classes.has(k),
      add: (k) => classes.add(k),
      toggle: (k, v) => (v ? classes.add(k) : classes.delete(k)),
    },
    style: {
      getPropertyValue: (k) => styles.get(k)?.[0] ?? '',
      getPropertyPriority: (k) => styles.get(k)?.[1] ?? '',
      setProperty: (k, v, p = '') => styles.set(k, [v, p]),
      removeProperty: (k) => styles.delete(k),
    },
  };
  const doc = {
    body,
    activeElement: {
      isConnected: true,
      focus: (options) => {
        assert.equal(options.preventScroll, true);
        focused++;
      },
    },
  };
  const restore = holdPresentationLayout(doc, overlay);
  assert.equal(overlay.hidden, false);
  assert.equal(a.inert, true);
  assert.equal(a.getAttribute('aria-hidden'), 'true');
  assert.deepEqual(styles.get('height'), ['900px', '']);
  restore();
  restore();
  assert.equal(overlay.hidden, true);
  assert.deepEqual([...classes], ['library-hidden', 'inspector-collapsed']);
  assert.equal(a.inert, false);
  assert.equal(a.getAttribute('aria-hidden'), null);
  assert.equal(b.inert, true);
  assert.equal(b.getAttribute('aria-hidden'), 'false');
  assert.deepEqual(styles.get('width'), ['88%', 'important']);
  assert.equal(styles.has('height'), false);
  assert.equal(focused, 1);
});
function canvas() {
  const log = [],
    ctx = {
      save() {},
      restore() {},
      createLinearGradient: () => ({ addColorStop() {} }),
      fillRect() {},
      measureText: (t) => ({ width: t.length * 10 }),
      fillText: (text, x, y) => log.push({ text, x, y }),
    };
  return { width: 1280, height: 720, log, getContext: () => ctx, toDataURL: () => JSON.stringify(log) };
}
test('layout hold keeps responsive toolbar and dock heights, then restores their inline styles', () => {
  const make = (height, initial = []) => {
    const values = new Map(initial);
    return {
      getBoundingClientRect: () => ({ height }),
      hasAttribute: () => initial.length > 0,
      removeAttribute() {
        this.removed = true;
      },
      style: {
        get length() {
          return values.size;
        },
        getPropertyValue: (k) => values.get(k)?.[0] ?? '',
        getPropertyPriority: (k) => values.get(k)?.[1] ?? '',
        setProperty: (k, v, p = '') => values.set(k, [v, p]),
        removeProperty: (k) => values.delete(k),
      },
    };
  };
  const toolbar = make(48, [['flex', ['0 1 auto', 'important']]]),
    dock = make(42.296875),
    body = make(800);
  body.children = [];
  body.setAttribute = () => {};
  body.getBoundingClientRect = () => ({ width: 1280, height: 800 });
  body.classList = { contains: () => false, add() {}, toggle() {} };
  const restore = holdPresentationLayout({ body, querySelectorAll: () => [toolbar, dock] }, { hidden: true });
  assert.equal(toolbar.style.getPropertyValue('flex'), '0 0 48px');
  assert.equal(dock.style.getPropertyValue('flex'), '0 0 42.296875px');
  restore();
  restore();
  assert.equal(toolbar.style.getPropertyValue('flex'), '0 1 auto');
  assert.equal(toolbar.style.getPropertyPriority('flex'), 'important');
  assert.equal(dock.style.getPropertyValue('flex'), '');
  assert.equal(dock.removed, true);
});
test('caption painting writes three bounded lines at output resolution and restores canvas state', () => {
  const c = canvas();
  drawPresentationCaption(c, {
    caption: { title: 'A'.repeat(400), description: 'Description', facts: '3D · V 8' },
    opacity: 1,
  });
  assert.equal(c.log.length, 3);
  assert.ok(c.log[0].text.endsWith('…'));
  assert.ok(c.log.every((l) => l.x >= 0 && l.y < c.height));
  const hidden = canvas();
  drawPresentationCaption(hidden, { caption: presentationCaption(state()), opacity: 0 });
  assert.equal(hidden.log.length, 0);
});
async function renderFixture() {
  const playlist = await buildPresentationPlaylist({ source: 'tour', tour: bank(), transitionDuration: 0.5 }),
    timeline = prepareAnimatedTourTimeline(playlist.tour),
    preview = canvas(),
    captures = [],
    applied = [];
  let publication;
  function base(output, exported = false) {
    return {
      timeline,
      canvas: output,
      published: null,
      ownerCurrent: () => true,
      current: (p) => p === publication,
      async apply(time) {
        applied.push([exported, time]);
        publication = { complete: true, time };
        this.published = publication;
        return publication;
      },
      cancel() {},
      async close() {
        captures.push('closed');
      },
      createExportRenderer: (options) => {
        assert.equal(options.size, 'vertical');
        const target = canvas();
        target.width = 1080;
        target.height = 1920;
        captures.push(target);
        return base(target, true);
      },
    };
  }
  const original = base(preview);
  let captions = true;
  const renderer = new PresentationRenderer(original, playlist.captions, { visible: () => captions });
  return { renderer, original, preview, captures, applied, hide: () => (captions = false) };
}
test('presentation wrapper decorates prepared frames only and carries captions to separate target-sized renders', async () => {
  const f = await renderFixture();
  await f.renderer.apply(0.5);
  assert.equal(f.preview.log.length, 3);
  f.hide();
  await f.renderer.apply(0.6);
  assert.equal(f.preview.log.length, 3);
  const target = f.renderer.createExportRenderer({ size: 'vertical' });
  await target.apply(0.5);
  assert.equal(target.canvas.width, 1080);
  assert.equal(target.canvas.log.length, 0);
  await target.close();
  assert.equal(f.captures.at(-1), 'closed');
  assert.throws(() => f.renderer.image({ time: 0 }), /stale/);
});
test('recording uses deterministic exact schedules and native staging with a fake video encoder, leaving preview untouched', async () => {
  for (const format of ['webm', 'mp4']) {
    const f = await renderFixture(),
      frames = [],
      writes = [],
      events = [];
    const api = {
      animationBegin: async (options) => {
        validateExportOptions(options);
        events.push(options);
        return { id: 'presentation' };
      },
      animationWrite: async (id, i, data) => writes.push([id, i, data]),
      animationFinish: async () => ({ path: 'recorded.' + format }),
      animationAbort: async () => events.push('abort'),
    };
    const exporter = new AnimatedTourExporter({
      renderer: f.renderer,
      api,
      recordVideo: async (options) => {
        assert.equal(options.canvas.width, 1080);
        assert.equal(options.canvas.height, 1920);
        for (let i = 0; i < options.frameCount; i++) {
          await Promise.resolve();
          await options.renderFrame(i);
          frames.push(options.frameTimes[i]);
          await options.writeChunk(i, new Uint8Array([i]));
        }
      },
    });
    await exporter.export(format, { fps: 2, size: 'vertical' });
    assert.equal(events[0].duration, 7);
    assert.deepEqual(
      frames,
      Array.from({ length: 15 }, (_, i) => i / 2)
    );
    assert.equal(writes.length, 15);
    assert.equal(events.includes('abort'), false);
    assert.equal(f.original.published, null);
    assert.equal(f.preview.log.length, 0);
    assert.ok(f.captures[0].log.length > 0);
    assert.equal(exporter.exporting, false);
  }
});
test('cancelled recording discards staging before source/layout ownership is released', async () => {
  const f = await renderFixture(),
    gate = deferred(),
    events = [];
  let started;
  const ready = new Promise((yes) => (started = yes)),
    api = {
      animationBegin: async () => ({ id: 'x' }),
      animationWrite: async () => events.push('write'),
      animationFinish: async () => events.push('finish'),
      animationAbort: async () => events.push('abort'),
    };
  const exporter = new AnimatedTourExporter({
      renderer: f.renderer,
      api,
      recordVideo: async (options) => {
        started();
        await gate.promise;
        options.check();
      },
    }),
    task = exporter.export('webm', { size: 'vertical' });
  await ready;
  exporter.cancel();
  gate.resolve();
  await assert.rejects(task, /cancel/);
  assert.deepEqual(events, ['abort']);
  assert.equal(exporter.exporting, false);
});
