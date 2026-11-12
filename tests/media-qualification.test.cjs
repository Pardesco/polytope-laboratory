const test = require('node:test'),
  assert = require('node:assert/strict'),
  { spawnSync } = require('node:child_process'),
  path = require('node:path');
const { scenarioProject, CASES, selfTest } = require('../scripts/media-qualification.cjs');
const { fixture } = require('../scripts/animated-tours-smoke.cjs');
const active = (p) => {
  const d = p.documents[p.active];
  return d.states[d.cursor];
};
const root = path.resolve(__dirname, '..');
function native(requests) {
  const r = spawnSync(process.env.POLYTOPE_PYTHON || 'python', ['-B', '-m', 'engine.server'], {
    cwd: root,
    windowsHide: true,
    input: requests.map((r, id) => JSON.stringify({ ...r, id })).join('\n') + '\n',
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  assert.equal(r.status, 0, r.stderr);
  const results = r.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(results.length, requests.length);
  for (const result of results) assert.equal(result.ok, true, result.error);
  return results.map((r) => r.result);
}
test('qualification self-test covers ten cases without importing Electron', async () => {
  await selfTest();
  assert.equal(CASES.length, 10);
  assert.deepEqual(
    CASES.filter((c) => c[0].endsWith('-v4')).map((c) => c[0]),
    ['camera-v4', 'projection-v4', 'opacity-v4', 'sectionNormal-v4']
  );
  assert.ok(!Object.keys(require.cache).some((k) => /[\\/]electron[\\/]index\.js$/.test(k)));
});
test('all deterministic case projects pass the real native save/reopen validator', { timeout: 90000 }, async () => {
  const [cube, tesseract] = native(
      ['cube', 'tesseract'].map((key) => ({ op: 'generate', params: { kind: 'regular', key } }))
    ),
    projects = [];
  for (const [name, seed] of CASES) {
    if (name === 'tour') {
      projects.push(fixture());
      continue;
    }
    const input = fixture();
    delete input.tour;
    const state = active(input),
      is3 = ['cube', 'fold', 'morph'].includes(seed);
    state.model = structuredClone(is3 ? cube : tesseract);
    state.view.sectionNormal = is3 ? [0, 0, 1] : [0, 0, 0, 1];
    state.view.dualMorph = {
      version: 1,
      enabled: seed === 'morph',
      method: 'via-snub',
      center: null,
      radius: Math.sqrt(3),
      ratio: 0,
      duration: 0.26,
      loop: false,
    };
    projects.push(scenarioProject(input, name));
  }
  const before = structuredClone(projects),
    results = native(projects.map((project) => ({ op: 'validate-project', params: { project } })));
  const { normalizeSequence, sequenceFrameTimes, evaluateSequence } = await import('../ui/animation.mjs');
  results.forEach((project, i) => {
    const name = CASES[i][0],
      input = projects[i];
    assert.deepEqual(active(project).model.vertices, active(input).model.vertices);
    if (name === 'tour') {
      assert.equal(project.tour.events.length, 2);
      return;
    }
    const sequence = active(project).view.animation;
    assert.deepEqual(sequence, normalizeSequence(active(input).view.animation));
    assert.deepEqual(sequenceFrameTimes(sequence), [0, 0.125, 0.25, 0.26]);
    assert.deepEqual(evaluateSequence(sequence, 0), sequence.keyframes[0]);
    assert.deepEqual(evaluateSequence(sequence, 0.26), sequence.keyframes[1]);
  });
  assert.deepEqual(projects, before);
});
test('section fixture avoids identical parallel cube slices and uses a unit oblique normal', () => {
  const p = scenarioProject(fixture(), 'section4'),
    s = active(p);
  assert.ok(Math.abs(Math.hypot(...s.view.sectionNormal) - 1) < 1e-12);
  assert.ok(s.view.sectionNormal.every((v) => v > 0));
  assert.notEqual(
    Math.abs(s.view.animation.keyframes[0].sectionOffset),
    Math.abs(s.view.animation.keyframes[1].sectionOffset)
  );
});
