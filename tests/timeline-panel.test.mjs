import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSequence,
  setSequenceKeyframe,
  moveSequenceKeyframe,
  deleteSequenceKeyframe,
  withSequenceTracks,
} from '../ui/animation.mjs';
import { laneRows, rulerTicks, timelineTime, stepKeyframeSelection } from '../ui/animation-lanes.mjs';
import { saveAnimationHistory } from '../ui/animation-history.mjs';
import { motionPresetReason } from '../ui/timeline-panel.mjs';

const view = { angles: [0, 0, 0, 0, 0, 0], sectionOffset: 0 };
const base = () => createSequence(view, 8, 24);
const middle = () => setSequenceKeyframe(base(), 4, { ...view, angles: [180, 0, 0, 0, 0, 0] });
test('presets disclose unsupported domains and recover after a busy action', () => {
  const source = { model: { dimension: 4, interpretation: 'convex-polytope', faces: [] }, view: {} },
    capabilities = { fold: true, explosion: true, morphRatio: true };
  assert.match(motionPresetReason('fold', source, { capabilities }), /intrinsic 3D/);
  assert.equal(motionPresetReason('explosion', source, { capabilities }), '');
  assert.match(motionPresetReason('rotation', source, { blocked: true }), /Finish/);
  assert.equal(motionPresetReason('rotation', source), '');
  source.model.interpretation = 'generalized-complex';
  assert.match(motionPresetReason('explosion', source, { capabilities }), /convex/);
  assert.match(motionPresetReason('morph', source, { capabilities }), /Configure/);
  source.model.dimension = 3;
  assert.equal(motionPresetReason('fold', source, { capabilities }), '');
  source.view.dualMorph = { enabled: true };
  assert.match(motionPresetReason('section', source, { capabilities }), /Close Dual morph/);
});
test('varying lanes expose one diamond per shared keyframe; constants stay muted', () => {
  const lanes = laneRows(base());
  assert.deepEqual(
    lanes.map((lane) => [lane.key, lane.varies, lane.frames.length]),
    [
      ['angles', true, 2],
      ['sectionOffset', false, 0],
    ]
  );
  assert.deepEqual(
    lanes[0].frames.map((frame) => [frame.index, frame.time, frame.position]),
    [
      [0, 0, 0],
      [1, 8, 1],
    ]
  );
  assert.match(lanes[0].frames[1].value, /360/);
  assert.equal(laneRows(middle())[0].frames.length, 3);
});
test('frame retiming is immutable and snaps to the saved frame rate', () => {
  const input = middle(),
    before = structuredClone(input),
    moved = moveSequenceKeyframe(input, 1, 3.17);
  assert.equal(moved.keyframes[1].time, 76 / 24);
  assert.deepEqual(moved.keyframes[1].angles, input.keyframes[1].angles);
  assert.deepEqual(input, before);
  assert.equal(moveSequenceKeyframe(input, 1, 3.17, { snap: false }).keyframes[1].time, 3.17);
});
test('roving selection reaches every varying lane and clamps keyframe boundaries', () => {
  const sequence = middle();
  sequence.keyframes.at(-1).sectionOffset = 1;
  assert.deepEqual(stepKeyframeSelection(sequence, { index: 1, lane: 'angles' }, 'ArrowDown'), {
    index: 1,
    lane: 'sectionOffset',
  });
  assert.deepEqual(stepKeyframeSelection(sequence, { index: 1, lane: 'sectionOffset' }, 'ArrowUp'), {
    index: 1,
    lane: 'angles',
  });
  assert.equal(stepKeyframeSelection(sequence, { index: 0, lane: 'angles' }, 'ArrowLeft').index, 0);
  assert.equal(stepKeyframeSelection(sequence, { index: 2, lane: 'angles' }, 'ArrowRight').index, 2);
  assert.equal(stepKeyframeSelection(sequence, { index: 1, lane: 'angles' }, 'Home').index, 0);
  assert.equal(stepKeyframeSelection(sequence, { index: 1, lane: 'angles' }, 'End').index, 2);
});
test('retiming refuses crossing, coincident frames, invalid indices and nonfinite times', () => {
  const input = setSequenceKeyframe(middle(), 6, view);
  for (const time of [0, -1, 6, 7, Infinity, NaN]) assert.throws(() => moveSequenceKeyframe(input, 1, time));
  for (const index of [-1, 0.5, 4]) assert.throws(() => moveSequenceKeyframe(input, index, 2));
  assert.throws(() => moveSequenceKeyframe(input, 1, 0.001), /neighbours/);
});
test('first and last times remain anchored', () => {
  assert.throws(() => moveSequenceKeyframe(middle(), 0, 1), /first and last/);
  assert.throws(() => moveSequenceKeyframe(middle(), 2, 7), /first and last/);
  assert.equal(moveSequenceKeyframe(middle(), 2, 8).keyframes.at(-1).time, 8);
});
test('deletion refuses fewer than two and preserves the full time domain', () => {
  for (const index of [0, 1]) assert.throws(() => deleteSequenceKeyframe(base(), index), /at least two/);
  const input = middle(),
    before = structuredClone(input);
  for (const index of [0, 1, 2]) {
    const result = deleteSequenceKeyframe(input, index);
    assert.equal(result.keyframes.length, 2);
    assert.equal(result.keyframes[0].time, 0);
    assert.equal(result.keyframes.at(-1).time, 8);
  }
  assert.deepEqual(input, before);
  assert.throws(() => deleteSequenceKeyframe(input, 9), /Select/);
});
test('lane edits preserve presentation track values and options', () => {
  const input = withSequenceTracks(
    middle(),
    { explosion: { direction: 'radial' }, fold: { kind: 'face-net' } },
    { explosionAmount: 2, foldFraction: 0.4 }
  );
  const result = deleteSequenceKeyframe(moveSequenceKeyframe(input, 1, 3), 1);
  assert.deepEqual(result.tracks, input.tracks);
  assert.equal(result.keyframes[1].explosionAmount, 2);
  assert.equal(result.keyframes[0].foldFraction, 0.4);
});
test('ruler bounds ticks for long sequences and includes fractional duration exactly', () => {
  assert.deepEqual(rulerTicks(2.4), [0, 1, 2, 2.4]);
  assert.equal(rulerTicks(300).length, 21);
  assert.equal(timelineTime(62.4), '01:02.40');
  assert.equal(timelineTime(59.999), '01:00.00');
});
test('animation snapshots use document Undo/Redo, branch history, and keep live source ownership', () => {
  const source = { model: { dimension: 4 }, view: { ...view }, notes: 'retained', operationNode: 'source' },
    document = { states: [source], cursor: 0 };
  assert.equal(saveAnimationHistory(document, source, base()), true);
  assert.equal(document.cursor, 1);
  assert.strictEqual(document.states[1], source);
  assert.equal(document.states[0].view.animation, undefined);
  saveAnimationHistory(document, source, middle());
  assert.equal(document.cursor, 2);
  assert.equal(document.states[1].view.animation.keyframes.length, 2);
  assert.equal(document.states[2].view.animation.keyframes.length, 3);
  document.cursor--;
  const undo = document.states[document.cursor];
  assert.equal(undo.view.animation.keyframes.length, 2);
  document.cursor++;
  assert.equal(document.states[document.cursor].view.animation.keyframes.length, 3);
  document.cursor = 1;
  saveAnimationHistory(document, undo, moveSequenceKeyframe(middle(), 1, 3));
  assert.equal(document.states.length, 3);
  assert.equal(document.states[2].view.animation.keyframes[1].time, 3);
  assert.equal(document.states[2].notes, 'retained');
  assert.equal(document.states[2].operationNode, 'source');
  assert.equal(saveAnimationHistory(document, undo, document.states[2].view.animation), false);
  assert.throws(() => saveAnimationHistory(document, source, base()), /history changed/);
});
test('snapshot history retains the native 200-state project limit', () => {
  const source = { model: {}, view: { ...view } },
    document = { states: [source], cursor: 0 };
  for (let i = 0; i < 205; i++) saveAnimationHistory(document, source, createSequence(view, 1 + i / 100, 24));
  assert.equal(document.states.length, 200);
  assert.equal(document.cursor, 199);
});

test('hyperbolic documents refuse timeline presets before Euclidean incidence reads', () => {
  const source = { model: { kind: 'hyperbolic-space', dimension: 3, coordinateDimension: 4 }, view: {} };
  for (const key of ['rotation', 'section', 'fold', 'explosion', 'morph', 'camera'])
    assert.match(motionPresetReason(key, source), /Euclidean/);
});
