/** Saved, deterministic animation tracks. Angles are degrees and interpolate
 * directly (0 -> 360 is a complete turn, rather than a shortest-path shortcut). */
import './animation-track-lanes-v4.mjs';
import { cameraOrbitFromView } from './animation-v4-view.mjs';
export const ANIMATION_LIMITS = Object.freeze({
  duration: 300,
  fps: 60,
  keyframes: 256,
  frames: 18001,
  explosionAmount: 10,
});
const V4_TRACKS = ['camera', 'projection', 'opacity', 'sectionNormal'];

function plain(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}
function fields(value, allowed, label) {
  if (!plain(value) || Object.getOwnPropertySymbols(value).length) throw new Error(`${label} requires a plain record.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).some((key) => !allowed.includes(key) || !('value' in descriptors[key])))
    throw new Error(`${label} has unsupported fields or accessors.`);
  return Object.fromEntries(Object.entries(descriptors).map(([key, item]) => [key, item.value]));
}
function ordinaryArray(value, label) {
  if (
    !Array.isArray(value) ||
    Object.getOwnPropertySymbols(value).length ||
    Object.getOwnPropertyNames(value).some(
      (key) =>
        key !== 'length' &&
        (!Number.isInteger(Number(key)) ||
          String(Number(key)) !== key ||
          Number(key) < 0 ||
          Number(key) >= value.length)
    )
  )
    throw new Error(`${label} requires an ordinary array.`);
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor)) throw new Error(`${label} cannot contain holes or accessors.`);
    return descriptor.value;
  });
}
function normalizeTracks(value, { morph = false, v4 = false } = {}) {
  const tracks = fields(
      value,
      ['explosion', 'fold', ...(morph ? ['morphRatio'] : []), ...(v4 ? V4_TRACKS : [])],
      'Animation tracks'
    ),
    result = {};
  if (tracks.explosion !== undefined) {
    const options = fields(tracks.explosion, ['direction'], 'Explosion track');
    if (!['normal', 'radial'].includes(options.direction))
      throw new Error('Explosion track direction must be normal or radial.');
    result.explosion = { direction: options.direction };
  }
  if (tracks.fold !== undefined) {
    const options = fields(tracks.fold, ['kind'], 'Fold track');
    if (options.kind !== 'face-net')
      throw new Error(
        'Only rigid 3D face-net folding tracks are supported; partial 4D cell-net folding is unavailable.'
      );
    result.fold = { kind: 'face-net' };
  }
  if (tracks.morphRatio !== undefined) {
    const options = fields(tracks.morphRatio, ['kind', 'version'], 'Morph ratio track');
    if (options.kind !== 'dual-morph' || options.version !== 1)
      throw Error('Morph ratio track requires version1 dual-morph kind.');
    result.morphRatio = { kind: 'dual-morph', version: 1 };
  }
  for (const key of V4_TRACKS) if (tracks[key] !== undefined) result[key] = fields(tracks[key], [], `${key} track`);
  if (!Object.keys(result).length) throw new Error('Version 2 animations require at least one supported track.');
  return result;
}
function trackValue(value, name) {
  finite(value, name === 'explosionAmount' ? 'Explosion amount' : 'Fold fraction');
  const max = name === 'explosionAmount' ? ANIMATION_LIMITS.explosionAmount : 1;
  if (value < 0 || value > max) throw new Error(`${name} must be in [0,${max}].`);
  return value;
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}

export function normalizeSequence(value) {
  value = fields(value, ['version', 'duration', 'fps', 'loop', 'keyframes', 'tracks'], 'Animation sequence');
  if (value.version !== 1 && value.version !== 2 && value.version !== 3 && value.version !== 4)
    throw new Error('Unsupported animation sequence version.');
  const tracks =
    value.version >= 2 ? normalizeTracks(value.tracks, { morph: value.version >= 3, v4: value.version === 4 }) : null;
  if (value.version === 4 && !V4_TRACKS.some((key) => tracks[key]))
    throw Error('Version 4 animations require a camera, projection, opacity or sectionNormal track.');
  if (value.version === 1 && value.tracks !== undefined)
    throw new Error('Additional animation tracks require version 2.');
  const duration = finite(value.duration, 'Animation duration'),
    fps = finite(value.fps, 'Animation frame rate');
  if (duration <= 0 || duration > ANIMATION_LIMITS.duration)
    throw new Error('Animation duration must be greater than zero and at most 300 seconds.');
  if (!Number.isInteger(fps) || fps < 1 || fps > ANIMATION_LIMITS.fps)
    throw new Error('Animation frame rate must be an integer from 1 to 60.');
  if (
    !Array.isArray(value.keyframes) ||
    value.keyframes.length < 2 ||
    value.keyframes.length > ANIMATION_LIMITS.keyframes
  )
    throw new Error('Animation requires 2 to 256 keyframes.');
  const names = [
    'time',
    'angles',
    'sectionOffset',
    ...(tracks?.explosion ? ['explosionAmount'] : []),
    ...(tracks?.fold ? ['foldFraction'] : []),
    ...(tracks?.morphRatio ? ['morphRatio'] : []),
    ...V4_TRACKS.filter((key) => tracks?.[key]),
  ];
  const inputFrames = ordinaryArray(value.keyframes, 'Animation keyframes');
  const keyframes = inputFrames.map((input, index) => {
    const frame = fields(input, names, 'Animation keyframe');
    const time = finite(frame.time, 'Keyframe time');
    if (time < 0 || time > duration || (index && time <= inputFrames[index - 1].time))
      throw new Error('Keyframe times must increase strictly within the animation duration.');
    if (!Array.isArray(frame.angles) || frame.angles.length !== 6)
      throw new Error('Every keyframe requires six rotation angles.');
    const angles = ordinaryArray(frame.angles, 'Rotation angles').map((angle) => finite(angle, 'Rotation angle'));
    if (angles.some((angle) => Math.abs(angle) > 1e6)) throw new Error('Rotation angles exceed the supported range.');
    return {
      time,
      angles,
      sectionOffset: finite(frame.sectionOffset, 'Section depth'),
      ...(tracks?.explosion ? { explosionAmount: trackValue(frame.explosionAmount, 'explosionAmount') } : {}),
      ...(tracks?.fold ? { foldFraction: trackValue(frame.foldFraction, 'foldFraction') } : {}),
      ...(tracks?.morphRatio ? { morphRatio: trackValue(frame.morphRatio, 'morphRatio') } : {}),
      ...normalizeV4Frame(frame, tracks),
    };
  });
  if (keyframes[0].time !== 0 || keyframes.at(-1).time !== duration)
    throw new Error('Animation keyframes must include time zero and the exact duration.');
  if (value.loop !== undefined && typeof value.loop !== 'boolean') throw new Error('Animation loop must be a boolean.');
  if (tracks?.sectionNormal)
    for (let i = 1; i < keyframes.length; i++)
      if (normalDot(keyframes[i - 1].sectionNormal, keyframes[i].sectionNormal) <= -1 + 1e-10)
        throw Error(
          'Consecutive section normals are antipodal or too nearly antipodal. Add an intermediate normal to choose the section rotation.'
        );
  return { version: value.version, duration, fps, loop: value.loop === true, ...(tracks ? { tracks } : {}), keyframes };
}

export function evaluateSequence(value, time) {
  const sequence = normalizeSequence(value);
  return evaluateNormalized(sequence, finite(time, 'Animation time'));
}

export function evaluateNormalized(sequence, time) {
  time = Math.max(0, Math.min(sequence.duration, finite(time, 'Animation time')));
  const frames = sequence.keyframes;
  if (time === 0) return copyFrame(frames[0]);
  if (time === sequence.duration) return copyFrame(frames.at(-1));
  let high = frames.findIndex((frame) => frame.time >= time),
    a = frames[high - 1],
    b = frames[high];
  const fraction = (time - a.time) / (b.time - a.time);
  const frame = {
    time,
    angles: a.angles.map((angle, index) => angle + (b.angles[index] - angle) * fraction),
    sectionOffset:
      a.sectionOffset === b.sectionOffset
        ? a.sectionOffset
        : (1 - fraction) * a.sectionOffset + fraction * b.sectionOffset,
  };
  for (const name of ['explosionAmount', 'foldFraction', 'morphRatio'])
    if (Object.hasOwn(a, name))
      frame[name] = a[name] == b[name] ? a[name] : (1 - fraction) * a[name] + fraction * b[name];
  if (a.camera)
    frame.camera = Object.fromEntries(
      ['azimuth', 'elevation', 'distance'].map((key) => [
        key,
        a.camera[key] === b.camera[key] ? a.camera[key] : (1 - fraction) * a.camera[key] + fraction * b.camera[key],
      ])
    );
  for (const key of ['projection', 'opacity'])
    if (Object.hasOwn(a, key)) frame[key] = a[key] === b[key] ? a[key] : (1 - fraction) * a[key] + fraction * b[key];
  if (a.sectionNormal) frame.sectionNormal = slerpNormal(a.sectionNormal, b.sectionNormal, fraction);
  return frame;
}

/** Exact frame samples include both endpoints, even for fractional durations. */
export function sequenceFrameTimes(value) {
  const sequence = normalizeSequence(value),
    times = [];
  const count = Math.ceil(sequence.duration * sequence.fps);
  for (let index = 0; index <= count; index++) times.push(Math.min(index / sequence.fps, sequence.duration));
  return times;
}

function bounded(value, min, max, label, { exclusiveMin = false } = {}) {
  finite(value, label);
  if (value < min || (exclusiveMin && value === min) || value > max)
    throw Error(`${label} must be ${exclusiveMin ? 'greater than' : 'at least'} ${min} and at most ${max}.`);
  return value;
}
function normalizeNormal(value) {
  if (!Array.isArray(value) || value.length !== 4) throw Error('Section normal track requires a unit 4-vector.');
  const normal = ordinaryArray(value, 'Section normal').map((x) => finite(x, 'Section normal component')),
    length = Math.hypot(...normal);
  if (!Number.isFinite(length) || length === 0) throw Error('Section normal track requires a finite nonzero 4-vector.');
  return Math.abs(length - 1) <= 1e-12 ? normal : normal.map((x) => x / length);
}
const normalDot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
function slerpNormal(a, b, t) {
  if (a.every((x, i) => x === b[i])) return [...a];
  const dot = Math.max(-1, Math.min(1, normalDot(a, b))),
    angle = Math.acos(dot),
    sin = Math.sin(angle);
  const v =
    dot > 1 - 1e-10
      ? a.map((x, i) => (1 - t) * x + t * b[i])
      : a.map((x, i) => (Math.sin((1 - t) * angle) * x + Math.sin(t * angle) * b[i]) / sin);
  const length = Math.hypot(...v);
  return v.map((x) => x / length);
}
function normalizeV4Frame(frame, tracks) {
  const result = {};
  if (tracks?.camera) {
    const camera = fields(frame.camera, ['azimuth', 'elevation', 'distance'], 'Camera orbit');
    result.camera = {
      azimuth: bounded(camera.azimuth, -1e6, 1e6, 'Camera azimuth'),
      elevation: bounded(camera.elevation, -90, 90, 'Camera elevation'),
      distance: bounded(camera.distance, 0, 1e6, 'Camera distance', { exclusiveMin: true }),
    };
  }
  if (tracks?.projection)
    result.projection = bounded(frame.projection, 0, 100, '4D perspective eye distance', { exclusiveMin: true });
  if (tracks?.opacity) result.opacity = bounded(frame.opacity, 0, 1, 'Face opacity');
  if (tracks?.sectionNormal) result.sectionNormal = normalizeNormal(frame.sectionNormal);
  return result;
}
function copyFrame(frame) {
  return {
    ...frame,
    angles: [...frame.angles],
    ...(frame.camera ? { camera: { ...frame.camera } } : {}),
    ...(frame.sectionNormal ? { sectionNormal: [...frame.sectionNormal] } : {}),
  };
}
function captureV4(tracks, view, fallback = {}) {
  const camera = tracks?.camera
    ? view.camera
      ? cameraOrbitFromView(view)
      : (fallback.camera ?? cameraOrbitFromView(view))
    : null;
  if (camera && fallback.camera) camera.azimuth += 360 * Math.round((fallback.camera.azimuth - camera.azimuth) / 360);
  return {
    ...(camera ? { camera } : {}),
    ...(tracks?.projection ? { projection: view.perspectiveDistance4D ?? fallback.projection ?? 3 } : {}),
    ...(tracks?.opacity ? { opacity: view.surfaceOpacity ?? fallback.opacity ?? 0.22 } : {}),
    ...(tracks?.sectionNormal ? { sectionNormal: view.sectionNormal ?? fallback.sectionNormal ?? [0, 0, 0, 1] } : {}),
  };
}

export function createSequence(view = {}, duration = 8, fps = 24, { tracks } = {}) {
  const angles = Array.from({ length: 6 }, (_, index) => Number(view.angles?.[index] || 0));
  const sectionOffset = Number(view.sectionOffset || 0),
    end = [...angles];
  end[0] += 360;
  const sequence = normalizeSequence({
    version: 1,
    duration,
    fps,
    loop: false,
    keyframes: [
      { time: 0, angles, sectionOffset },
      { time: duration, angles: end, sectionOffset },
    ],
  });
  return tracks ? withSequenceTracks(sequence, tracks, view) : sequence;
}

/** Explicit migration retains v1 angles/depth. Empty tracks explicitly remove
 * presentation tracks and downgrade to v1; source geometry is never modified. */
export function withSequenceTracks(value, options, defaults = {}) {
  const sequence = normalizeSequence(value),
    supplied = fields(options, ['explosion', 'fold', 'morphRatio', ...V4_TRACKS], 'Animation tracks');
  const tracks = Object.keys(supplied).length ? normalizeTracks(supplied, { morph: true, v4: true }) : null;
  const keyframes = sequence.keyframes.map((frame) => ({
    time: frame.time,
    angles: [...frame.angles],
    sectionOffset: frame.sectionOffset,
    ...(tracks?.explosion ? { explosionAmount: frame.explosionAmount ?? defaults.explosionAmount ?? 0 } : {}),
    ...(tracks?.fold ? { foldFraction: frame.foldFraction ?? defaults.foldFraction ?? 0 } : {}),
    ...(tracks?.morphRatio ? { morphRatio: frame.morphRatio ?? defaults.dualMorph?.ratio ?? 0 } : {}),
    ...Object.fromEntries(
      V4_TRACKS.filter((key) => tracks?.[key]).map((key) => [
        key,
        frame[key] ?? captureV4({ [key]: {} }, defaults)[key],
      ])
    ),
  }));
  return normalizeSequence({
    version: V4_TRACKS.some((key) => tracks?.[key]) ? 4 : tracks?.morphRatio ? 3 : tracks ? 2 : 1,
    duration: sequence.duration,
    fps: sequence.fps,
    loop: sequence.loop,
    ...(tracks ? { tracks } : {}),
    keyframes,
  });
}

export function setSequenceKeyframe(value, time, view) {
  const sequence = normalizeSequence(value);
  finite(time, 'Keyframe time');
  if (time < 0 || time > sequence.duration) throw new Error('Keyframe time is outside the sequence.');
  const old = evaluateNormalized(sequence, time);
  const frame = {
    time,
    angles: [...view.angles],
    sectionOffset: view.sectionOffset,
    ...(sequence.tracks?.explosion ? { explosionAmount: view.explosionAmount ?? old.explosionAmount } : {}),
    ...(sequence.tracks?.fold ? { foldFraction: view.foldFraction ?? old.foldFraction } : {}),
    ...(sequence.tracks?.morphRatio ? { morphRatio: view.dualMorph?.ratio ?? old.morphRatio } : {}),
    ...captureV4(sequence.tracks, view, old),
  };
  const index = sequence.keyframes.findIndex((candidate) => Math.abs(candidate.time - time) < 1e-8);
  if (index >= 0) sequence.keyframes[index] = frame;
  else sequence.keyframes.push(frame);
  sequence.keyframes.sort((a, b) => a.time - b.time);
  return normalizeSequence(sequence);
}

export function resizeSequence(value, duration) {
  const sequence = normalizeSequence(value);
  finite(duration, 'Animation duration');
  const scale = duration / sequence.duration;
  return normalizeSequence({
    ...sequence,
    duration,
    keyframes: sequence.keyframes.map((frame, index) => ({
      ...frame,
      time: index === sequence.keyframes.length - 1 ? duration : frame.time * scale,
    })),
  });
}

export function moveSequenceKeyframe(value, index, time, { snap = true } = {}) {
  const sequence = normalizeSequence(value),
    frames = sequence.keyframes;
  if (!Number.isInteger(index) || index < 0 || index >= frames.length) throw Error('Select a keyframe first.');
  if (typeof time !== 'number' || !Number.isFinite(time)) throw Error('Keyframe time must be finite.');
  if (index === 0 || index === frames.length - 1) {
    if (time !== frames[index].time) throw Error('The first and last keyframes stay at zero and duration.');
    return sequence;
  }
  const next = snap ? Math.round(time * sequence.fps) / sequence.fps : time;
  if (next <= frames[index - 1].time || next >= frames[index + 1].time)
    throw Error('A keyframe cannot cross or coincide with its neighbours.');
  frames[index].time = next;
  return normalizeSequence(sequence);
}

export function deleteSequenceKeyframe(value, index) {
  const sequence = normalizeSequence(value),
    frames = sequence.keyframes;
  if (!Number.isInteger(index) || index < 0 || index >= frames.length) throw Error('Select a keyframe first.');
  if (frames.length <= 2) throw Error('Keep at least two keyframes. Add a keyframe before deleting one.');
  frames.splice(index, 1);
  frames[0].time = 0;
  frames.at(-1).time = sequence.duration;
  return normalizeSequence(sequence);
}
