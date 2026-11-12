import { doesNotMatchSource } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ViewportControls } from '../ui/viewport-controls.mjs';
import { GUIDE_TOPICS } from '../ui/user-guide.mjs';
import { SymmetryOrientationControls } from '../ui/symmetry-orientation-controls.mjs';

const theme = await readFile(new URL('../ui/theme.css', import.meta.url), 'utf8');
const tokens = Object.fromEntries(
  [...theme.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)].map(([, key, value]) => [key, value.trim()])
);
const luminance = (hex) =>
  hex
    .slice(1)
    .match(/../g)
    .map((value) => parseInt(value, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test('shared type, target and spacing tokens match the approved UI scale without color overrides', async () => {
  for (const [name, value] of Object.entries({
    'font-body': '14px',
    'font-secondary': '12px',
    'font-title': '18px',
    'control-height': '36px',
    'utility-size': '32px',
    'space-1': '8px',
    'space-2': '16px',
    'space-3': '24px',
    'space-4': '32px',
    'panel-padding': 'var(--space-2)',
  }))
    assert.equal(tokens['--' + name], value, name);
  const style = await readFile(new URL('../ui/style.css', import.meta.url), 'utf8');
  doesNotMatchSource(style, /--(?:muted|panel2?|text|bg|accent)\s*:/, 'theme.css owns the palette');
});

test('secondary text has WCAG AA contrast on shared surfaces, including selected tabs', () => {
  for (const background of ['--bg', '--panel', '--panel2', '--selection-bg']) {
    const ratio = contrast(tokens['--muted'], tokens[background]);
    assert.ok(ratio >= 4.5, `${background}: ${ratio.toFixed(2)}:1`);
  }
});

test('reduced motion suppresses startup rotation while deliberate Rotate remains available', () => {
  const previous = globalThis.matchMedia;
  const controls = Object.assign(Object.create(ViewportControls.prototype), {
    playing: false,
    startupRotation: false,
    syncPlaying() {},
    canEdit: () => true,
    context: { stopTrack() {}, markDirty() {} },
  });
  try {
    globalThis.matchMedia = (query) => ({ matches: query === '(prefers-reduced-motion: reduce)' });
    controls.startStartupRotation();
    assert.equal(controls.playing, false);
    assert.equal(controls.startupRotation, false);
    controls.toggle();
    assert.equal(controls.playing, true);
    assert.equal(controls.startupRotation, false);
    globalThis.matchMedia = () => ({ matches: false });
    controls.startStartupRotation();
    assert.equal(controls.playing, true);
    assert.equal(controls.startupRotation, true);
  } finally {
    if (previous === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = previous;
  }
});

test('Guide leads with the November UI pass and retains the October release entry', () => {
  const topic = GUIDE_TOPICS[0];
  assert.equal(topic.id, 'whats-new');
  assert.match(topic.title, /November 2026/);
  assert.match(topic.paragraphs[0], /canvas and header/);
  assert.match(topic.paragraphs[0], /tool names/);
  assert.match(topic.paragraphs[0], /appearance sheet/);
  assert.match(topic.paragraphs[1], /October 26, 2026/);
});

test('reduced-motion symmetry orientation reaches its final frame in one render without interpolation', async () => {
  const media = globalThis.matchMedia,
    raf = globalThis.requestAnimationFrame;
  const state = { model: { dimension: 4 }, view: { angles: [0, 0, 0, 0, 0, 0] } },
    matrix = Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => +(i === j)));
  const result = { frame: { matrix }, selected: { label: 'Axis' }, maximumAxisResidual: 0, definition: 'Numerical' },
    nodes = { choice: { value: 'greatest' }, result: {} };
  let frames = 0,
    dirty = 0;
  const viewer = {
    model: state.model,
    cameraState: () => ({ position: [0, 0, 1] }),
    setDisplay: (view) => assert.deepEqual(view.orientationFrame.matrix, matrix),
    draw() {},
  };
  const controls = Object.assign(Object.create(SymmetryOrientationControls.prototype), {
    context: {
      getState: () => state,
      isExporting: () => false,
      stop() {},
      viewer,
      markDirty: () => dirty++,
      display() {},
    },
    node: (key) => nodes[key],
    request: (_choice, action) => action(result, () => {}),
  });
  try {
    globalThis.matchMedia = () => ({ matches: true });
    globalThis.requestAnimationFrame = (callback) => {
      frames++;
      queueMicrotask(() => callback(performance.now() + 16));
    };
    await controls.apply();
    assert.equal(frames, 1);
    assert.equal(dirty, 1);
    assert.deepEqual(state.view.orientationFrame.matrix, matrix);
  } finally {
    if (media === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = media;
    if (raf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = raf;
  }
});
