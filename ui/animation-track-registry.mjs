/** Lane registry for the timeline. Sequences store every animated field on every
 * keyframe; a lane is shown for each registered field that the sequence carries.
 * `varies` tells the timeline whether a field actually changes over the sequence. */
const same = (a, b) => (Array.isArray(a) ? a.every((value, index) => value === b[index]) : a === b);

export const TRACK_LANES = [
  {
    key: 'angles',
    label: 'Rotation',
    subtitle: 'Six coordinate-plane angles (degrees)',
    format: (value) => value.map((angle) => Math.round(angle * 10) / 10).join(', '),
  },
  {
    key: 'sectionOffset',
    label: 'Section',
    subtitle: 'Hyperplane depth along the section normal',
    format: (value) => value.toFixed(3),
  },
  {
    key: 'explosionAmount',
    label: 'Explosion',
    subtitle: 'Element separation, 0 to 10',
    format: (value) => value.toFixed(3),
  },
  {
    key: 'foldFraction',
    label: 'Fold',
    subtitle: 'Face net folded fraction, 0 flat to 1 folded',
    format: (value) => value.toFixed(3),
  },
  {
    key: 'morphRatio',
    label: 'Dual morph',
    subtitle: 'Shape to dual ratio, 0 to 1',
    format: (value) => value.toFixed(3),
  },
];

export function registerTrackLane(lane) {
  if (!lane?.key || !lane.label) throw new Error('Track lane requires key and label.');
  const index = TRACK_LANES.findIndex((item) => item.key === lane.key);
  if (index >= 0) TRACK_LANES[index] = lane;
  else TRACK_LANES.push(lane);
}

export function sequenceLanes(sequence) {
  const frames = sequence?.keyframes || [];
  return TRACK_LANES.filter((lane) => frames.length && Object.hasOwn(frames[0], lane.key)).map((lane) => ({
    ...lane,
    varies: frames.some((frame) => !(lane.equal ?? same)(frame[lane.key], frames[0][lane.key])),
  }));
}
