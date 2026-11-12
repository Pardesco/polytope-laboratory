import test from 'node:test';
import assert from 'node:assert/strict';
import { createSequence, withSequenceTracks } from '../ui/animation.mjs';
import { sequenceLanes, registerTrackLane, TRACK_LANES } from '../ui/animation-track-registry.mjs';

test('lanes follow the fields a sequence carries and whether they vary', () => {
  const base = createSequence({ angles: [0, 0, 0, 0, 0, 0], sectionOffset: 0 }, 4, 24);
  assert.deepEqual(
    sequenceLanes(base).map((lane) => [lane.key, lane.varies]),
    [
      ['angles', true],
      ['sectionOffset', false],
    ]
  );
  const exploded = withSequenceTracks(base, { explosion: { direction: 'normal' } });
  assert.ok(sequenceLanes(exploded).some((lane) => lane.key === 'explosionAmount' && !lane.varies));
});

test('registering a lane replaces by key', () => {
  const count = TRACK_LANES.length;
  registerTrackLane({ key: 'zzTest', label: 'Test' });
  registerTrackLane({ key: 'zzTest', label: 'Test 2' });
  assert.equal(TRACK_LANES.length, count + 1);
  assert.equal(TRACK_LANES.at(-1).label, 'Test 2');
  TRACK_LANES.pop();
});
