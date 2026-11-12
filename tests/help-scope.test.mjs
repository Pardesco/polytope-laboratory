import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GUIDE_TOPICS, guideContext, searchGuide } from '../ui/user-guide.mjs';
import { GUIDE_CONTROLS } from '../ui/guide-control-index.mjs';
import { FEATURE_ACTION_INDEX, guideCommandKeywords } from '../ui/guide-action-index.mjs';
import { buildCommandIndex, rankCommands } from '../ui/command-index.mjs';

const topic = (id) => GUIDE_TOPICS.find((t) => t.id === id),
  copy = (id) => {
    const t = topic(id);
    return [...t.paragraphs, ...(t.steps ?? []), t.tips ?? ''].join(' ');
  };
test('tidy-dual help describes its implemented bounded primal/polar test and unknown verdicts', async () => {
  const html = await readFile(new URL('../ui/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /tidy-dual remains unavailable/i);
  assert.match(html, /Tidy-dual checks the faceting and its finite incidence polar/);
  assert.match(copy('faceting'), /4–12/);
  assert.match(copy('faceting'), /numerical qualification/);
  assert.ok(searchGuide('unknown reciprocal').some((t) => t.id === 'unsupported-domains'));
});
test('replay and migration explanations distinguish retained snapshots from supported replay and file schemas', () => {
  const text = copy('projects');
  for (const phrase of [
    'Replay verifies',
    'independent document',
    'snapshot-only',
    'algorithm version',
    'numeric policy',
    'format version 1',
    'rejected',
    'no general automatic migration',
  ])
    assert.ok(text.includes(phrase), phrase);
  for (const id of ['history-replay', 'history-branch', 'history-parameters-apply', 'recover'])
    assert.equal(guideContext({ id }), 'projects', id);
});
test('media help distinguishes math sample times from container timing and encoder availability', () => {
  const text = copy('media-export');
  for (const phrase of [
    'manifest',
    'microseconds',
    'frame-index/FPS',
    'centiseconds',
    '256',
    'H.264/VP8',
    'without a real-time fallback',
    'opaque',
    'transparent PNG',
    'shipped qualification',
  ])
    assert.ok(text.includes(phrase), phrase);
  assert.match(topic('images').where, /View options → PNG options/);
  assert.match(topic('animation').where, /docked Timeline/);
  for (const id of ['animation-format', 'tour-format', 'animation-export', 'tour-supersample'])
    assert.equal(guideContext({ id }), 'media-export', id);
});
test('targeted action-index queries find live control records rather than passing on a Guide-topic match', () => {
  const entries = FEATURE_ACTION_INDEX.filter((item) => item.control);
  assert.equal(entries.length, 3);
  const index = buildCommandIndex({
    controls: entries.map((item) => ({
      id: item.control,
      label: item.control,
      keywords: guideCommandKeywords(item.control),
    })),
  });
  for (const item of entries)
    assert.ok(
      rankCommands(index, item.query).some((row) => row.id === item.control),
      item.query
    );
});
test('guide destinations are unique within each existing topic and no final route uses removed organizer names', () => {
  for (const [id, controls] of Object.entries(GUIDE_CONTROLS)) {
    assert.ok(topic(id), id);
    assert.equal(new Set(controls.map(([target]) => target)).size, controls.length);
    for (const [target, label] of controls) {
      assert.match(target, /^[a-z0-9-]+$/);
      assert.ok(label.includes('—'), label);
    }
  }
  for (const t of GUIDE_TOPICS)
    assert.doesNotMatch(
      t.where,
      /Bottom toolbar|Fit & refine|Facet & stellate|Advanced constructions|Construct → Modify|Create → Create a model/,
      t.id
    );
});

test('Round 6 help names current plane, lattice and paper-part controls with their limits', () => {
  for (const phrase of [
    'Arbitrary planes and observation bounds',
    'nx, ny, nz, offset',
    'negative side has sign +1',
    'observation box only',
    'Custom generator subgroup',
    'Build generator subgroup',
  ])
    assert.ok(copy('stellation-diagrams').includes(phrase), phrase);
  for (const phrase of [
    'Z⁴ or D₄',
    'Origin and squared-radius sequence',
    'Previous radius / Next radius',
    'hulls remain numerical',
    'repeated hulls',
    'numbered-root convention',
  ])
    assert.ok(copy('generator-options').includes(phrase), phrase);
  for (const phrase of [
    'Measurements and reinforcement',
    'Other measurement formats',
    'Flat faces DXF',
    'Reinforcement preset',
    'Custom families and dimensions (mm)',
    'Preview end-relieved strips',
    'Strip cut list CSV',
    'edge length minus twice the end setback',
    'without thickness, kerf or strength compensation',
    'Print at 100%',
  ])
    assert.ok(copy('paper-assembly').includes(phrase), phrase);
});

test('Round 7 evidence topics distinguish current numerical checks, finite domains and qualification', () => {
  for (const phrase of [
    'Recheck numerical classification',
    'Changed provider metadata',
    'generated reciprocal is not a supplied source',
    'not exact certificates',
  ])
    assert.ok(copy('classification-evidence').includes(phrase), phrase);
  for (const phrase of [
    'Expert off',
    'resource-limited',
    'complete ordered-incidence hashes',
    'Changed fixture definitions',
    'not an exact algebraic certificate',
  ])
    assert.ok(copy('symmetry-evidence').includes(phrase), phrase);
  for (const phrase of [
    '79',
    '63',
    'Construction evidence and next queue',
    'Float64',
    'Crossing faces retain literal cycles',
    'release qualification',
  ])
    assert.ok(copy('wythoff-generation').includes(phrase), phrase);
  for (const phrase of [
    'Candidate domain',
    'Tuta scaliform',
    'several match',
    'maximum normalized residuals',
    'no-match result excludes only the searched finite domain',
    'Undo restores',
  ])
    assert.ok(copy('vertex-figure-completion').includes(phrase), phrase);
  for (const query of [
    'Schwarz triangle',
    'Tuta completion',
    'recorded symmetry',
    'specialized relationships',
    'corpus blockers',
  ])
    assert.ok(searchGuide(query).length, query);
});
