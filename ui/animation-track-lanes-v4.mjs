import { registerTrackLane } from './animation-track-registry.mjs';
const number = (x) => (Math.round(x * 1000) / 1000).toString();
for (const lane of [
  {
    key: 'camera',
    label: 'Camera orbit',
    subtitle: 'Observer azimuth, elevation (degrees) and distance',
    fields: ['azimuth', 'elevation', 'distance'],
    format: (value) => `${number(value.azimuth)}°, ${number(value.elevation)}°, distance ${number(value.distance)}`,
    equal: (a, b) => ['azimuth', 'elevation', 'distance'].every((key) => a[key] === b[key]),
  },
  {
    key: 'projection',
    label: '4D perspective eye',
    subtitle: 'Depth: distance of the fourth-dimensional eye',
    format: (value) => number(value),
    available: (model) => (model?.embeddingDimension ?? model?.dimension) === 4,
  },
  {
    key: 'opacity',
    label: 'Face opacity',
    subtitle: 'Surface transparency, 0 clear to 1 opaque',
    format: (value) => number(value),
  },
  {
    key: 'sectionNormal',
    label: 'Section normal',
    subtitle: 'Unit 4-vector: turn the slicing hyperplane',
    format: (value) => value.map(number).join(', '),
    available: (model) => model?.dimension === 4,
  },
])
  registerTrackLane(lane);
