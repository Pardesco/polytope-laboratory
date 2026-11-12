import { normalizeTour, createTour, addTourEvent } from './tour.mjs';
import { prepareAnimatedTourTimeline, evaluateAnimatedTour } from './animated-tour-timeline.mjs';
import { normalizeSequence } from './animation.mjs';
import { morphEligible } from './dual-morph-session.mjs';

const axes = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];
const abort = () => Object.assign(Error('Presentation preparation cancelled.'), { name: 'AbortError' });
const line = (value) =>
  typeof value === 'string'
    ? value
        .split(/\r?\n/)
        .find((s) => s.trim())
        ?.trim()
        .slice(0, 240) || ''
    : '';

export function presentationCaption(state, description = '') {
  const m = state.model,
    meta = m.metadata ?? {},
    group = m.symmetry ?? meta.symmetry ?? meta.symmetryGroup;
  const symmetry = typeof group === 'string' ? group : (group?.symbol ?? group?.name);
  const facts = [
    `${m.dimension}D`,
    ...['vertices', 'edges', 'faces', ...(m.dimension === 4 ? ['cells'] : [])].map(
      (key, i) => `${['V', 'E', 'F', 'C'][i]} ${(m[key] ?? []).length}`
    ),
  ];
  if (symmetry) facts.push('Symmetry: ' + line(symmetry));
  return Object.freeze({
    title: line(m.name) || 'Untitled model',
    description:
      line(description) ||
      line(meta.description) ||
      line(state.notes) ||
      line(meta.family) ||
      'Source geometry in a rotating view',
    facts: facts.join('  ·  '),
  });
}
function spin(state, { preserveAnimation = false, single = true } = {}) {
  const result = structuredClone(state),
    view = result.view,
    dimension = result.model.embeddingDimension ?? result.model.dimension;
  if (single) view.viewportLayout = 'single';
  if (preserveAnimation && view.animation) return result;
  // A complete revolution loops without an orientation discontinuity.
  const speed =
    Number.isFinite(view.rotationSpeed) && Math.abs(view.rotationSpeed) >= 1.2
      ? Math.max(-60, Math.min(60, view.rotationSpeed))
      : 4;
  const index =
    Number.isInteger(view.rotationPlane) && axes[view.rotationPlane]?.[1] < dimension
      ? view.rotationPlane
      : dimension === 4
        ? 2
        : dimension === 3
          ? 1
          : 0;
  const angles = [...(view.angles ?? Array(6).fill(0))],
    end = [...angles],
    duration = 360 / Math.abs(speed);
  end[index] += Math.sign(speed) * 360;
  view.animation = normalizeSequence({
    version: 1,
    duration,
    fps: 24,
    loop: true,
    keyframes: [
      { time: 0, angles, sectionOffset: view.sectionOffset ?? 0 },
      { time: duration, angles: end, sectionOffset: view.sectionOffset ?? 0 },
    ],
  });
  return result;
}
function nativeDual(source, target) {
  const p = target.model.provenance;
  return (
    source.model.interpretation === 'convex-polytope' &&
    morphEligible(source.model, 'sizing') &&
    ['dual', 'incidence-dual'].includes(p?.operation) &&
    p.sourceFingerprint === source.model.fingerprint &&
    !source.view.dualMorph?.enabled &&
    !source.view.animation?.tracks?.fold &&
    !source.view.animation?.tracks?.explosion
  );
}
export async function buildPresentationPlaylist({
  source = 'current',
  state,
  tour,
  entries = [],
  read,
  viewForModel = (m) => ({ angles: Array(6).fill(0), sectionOffset: 0 }),
  duration = 8,
  transitionDuration = 0.8,
  signal,
  check = () => {},
} = {}) {
  if (!['current', 'tour', 'gallery', 'library'].includes(source)) throw Error('Choose a presentation source.');
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 300 ||
    !Number.isFinite(transitionDuration) ||
    transitionDuration <= 0 ||
    transitionDuration > 10
  )
    throw Error('Slides require 0–300 seconds and transitions 0–10 seconds, both greater than zero.');
  const verify = () => {
    if (signal?.aborted) throw abort();
    check();
  };
  verify();
  let events,
    descriptions = [];
  if (source === 'tour') {
    const bank = normalizeTour(tour);
    events = bank.events.map((event) => ({
      ...event,
      state: spin(event.state, { preserveAnimation: true, single: false }),
    }));
  } else if (source === 'current') {
    if (!state?.model) throw Error('Choose a model before presenting it.');
    events = [{ id: 'presentation-0', state: spin(state), duration }];
  } else {
    if (!Array.isArray(entries) || !entries.length) throw Error('No models match this presentation source.');
    if (entries.length > 100)
      throw Error('Presentations allow at most 100 slides. Narrow the library search or family.');
    if (entries.some((entry) => entry.supported === false || entry.auditStatus === 'rejected'))
      throw Error('The playlist includes unsupported or rejected library entries. Filter them out before presenting.');
    if (typeof read !== 'function') throw Error('Native catalog loading is unavailable.');
    let bank = createTour();
    for (const [index, entry] of entries.entries()) {
      verify();
      const model = await read(entry, { signal });
      verify();
      bank = addTourEvent(
        bank,
        spin({ model, view: viewForModel(model, entry), notes: '' }),
        duration,
        'presentation-' + index
      );
      descriptions.push(entry.caption ?? '');
    }
    events = bank.events;
  }
  if (!events.length) throw Error('Add an event to the current tour before presenting it.');
  const captions = events.map((event, i) => presentationCaption(event.state, descriptions[i]));
  events = events.map((event, i) => {
    const next = events[(i + 1) % events.length],
      saved = event.transition;
    const transition =
      events.length === 1
        ? { method: 'instant' }
        : nativeDual(event.state, next.state)
          ? { method: 'morph-to-dual', duration: transitionDuration }
          : saved && saved !== 'instant' && saved.method !== 'instant'
            ? saved
            : { method: 'sideways', distance: 0, duration: transitionDuration };
    return { ...event, transition };
  });
  verify();
  const playlist = normalizeTour({ version: 2, cursor: 0, events });
  // Preflight loop endpoints as well as the finite export path.
  prepareAnimatedTourTimeline(playlist, { loop: events.length > 1 });
  return Object.freeze({ tour: playlist, captions: Object.freeze(captions), source });
}

export class PresentationPlayback {
  constructor(tour, { loop = true, now = () => performance.now() } = {}) {
    this.timeline = prepareAnimatedTourTimeline(tour, { loop });
    this.now = now;
    this.time = 0;
    this.playing = false;
    this.captions = true;
  }
  sample(at = this.now()) {
    const sample = evaluateAnimatedTour(this.timeline, this.time + (this.playing ? (at - this.origin) / 1000 : 0));
    if (sample.ended && this.playing) {
      this.time = sample.time;
      this.playing = false;
    }
    return sample;
  }
  play() {
    if (this.playing) return;
    if (this.sample().ended) this.time = 0;
    this.origin = this.now();
    this.playing = true;
  }
  pause() {
    this.time = this.sample().time;
    this.playing = false;
    return this.time;
  }
  toggle() {
    this.playing ? this.pause() : this.play();
  }
  step(delta) {
    if (!Number.isInteger(delta)) throw Error('Slide navigation requires an integer step.');
    const count = this.timeline.tour.events.length;
    if (!count) return this.sample();
    const i = this.sample().index + delta,
      index = this.timeline.loop ? ((i % count) + count) % count : Math.max(0, Math.min(count - 1, i));
    this.time = this.timeline.eventStarts[index];
    this.origin = this.now();
    return this.sample();
  }
}

export function presentationCaptionAt(timeline, time, captions) {
  const sample = evaluateAnimatedTour(timeline, time),
    event = timeline.tour.events[sample.index];
  if (!event) return { caption: null, opacity: 0 };
  const fade = Math.min(0.6, event.duration / 3),
    opacity =
      sample.phase === 'hold'
        ? Math.max(0, Math.min(1, sample.localTime / fade, (event.duration - sample.localTime) / fade))
        : 0;
  return { caption: captions[sample.index], opacity };
}
