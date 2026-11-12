// Isolated ownership-comparison cost, not renderer time or app FPS. The image
// case is an opaque synthetic base64 string; no PNG decoder runs in this test.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { ElementContentControls } from '../ui/element-content-controls.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const baselineFile = process.argv[2];
assert.ok(baselineFile, 'Pass the controls module extracted from the sealed 0.27.20 source archive.');
const baselineSource = await readFile(baselineFile, 'utf8');
const baseline = await import(
  'data:text/javascript;base64,' +
    Buffer.from(
      baselineSource.replace(
        /from '(\.\/[^']+)'/g,
        (_, relative) => 'from ' + JSON.stringify(pathToFileURL(path.join(root, 'ui', relative)).href)
      )
    ).toString('base64')
);
const fixture = JSON.parse(await readFile(path.join(root, 'tests/fixtures/element-content-native-cases.json'), 'utf8'));
const projectFile = process.argv[3],
  savedProject = projectFile ? JSON.parse(await readFile(projectFile, 'utf8')) : null;
const savedDocument = savedProject?.documents[savedProject.active],
  savedState = savedDocument?.states[savedDocument.cursor];
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const folder = await mkdtemp(path.join(root, 'artifacts', 'element-owner-benchmark-'));
const rows = [],
  iterations = 100,
  passes = 7;
const hash = (text) => createHash('sha256').update(text).digest('hex');
for (const workload of ['absent', 'emptied', 'annotated', 'synthetic-image-4MiB']) {
  const annotations =
    workload === 'absent'
      ? null
      : structuredClone(savedState?.view.elementAnnotations ?? fixture.net.net.elementAnnotations);
  if (workload === 'emptied') {
    annotations.entries = [];
    annotations.assets = {};
  }
  if (workload === 'synthetic-image-4MiB')
    annotations.assets.synthetic = { mime: 'image/png', base64: 'A'.repeat(4 * 1024 * 1024) };
  const state = {
    model: savedState?.model ?? fixture.net.source,
    notes: savedState?.notes ?? 'Preserve notes',
    view: {
      ...savedState?.view,
      angles: [0, 0, 0, 0, 0, 0],
      faces: true,
      projection: 'orthographic',
      elementAnnotations: annotations,
    },
  };
  const document = { id: 'benchmark', cursor: 0, states: [state] },
    project = { active: 0, documents: [document] },
    viewer = { model: state.model };
  const context = { getState: () => state, getDocument: () => document, getProject: () => project };
  const controls = [baseline.ElementContentControls, ElementContentControls].map((Type) =>
    Object.assign(Object.create(Type.prototype), { context })
  );
  const owners = controls.map((c) => c.displayOwner(viewer)),
    before = JSON.stringify(state),
    samples = [[], []];
  for (const c of controls)
    for (let i = 0; i < 20; i++) assert.equal(c.matchesDisplayOwner(viewer, c.displayOwner(viewer)), true);
  for (let pass = 0; pass < passes; pass++)
    for (const index of pass % 2 ? [1, 0] : [0, 1]) {
      const c = controls[index],
        owner = owners[index],
        started = performance.now();
      for (let i = 0; i < iterations; i++) {
        state.view.angles[2] = i;
        assert.equal(c.matchesDisplayOwner(viewer, owner), true);
      }
      samples[index].push((performance.now() - started) / iterations);
    }
  state.view.angles = [0, 0, 0, 0, 0, 0];
  assert.equal(JSON.stringify(state), before);
  if (annotations) {
    annotations.entries.push({ kind: 'face', index: 0, text: { markup: 'Edited' } });
    for (let i = 0; i < 2; i++) assert.equal(controls[i].matchesDisplayOwner(viewer, owners[i]), false);
  }
  const summary = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      samplesMsPerCheck: values,
      medianMsPerCheck: sorted[3],
      iqrMsPerCheck: (sorted[4] + sorted[5] - sorted[1] - sorted[2]) / 2,
    };
  };
  rows.push({
    workload,
    literalStateSha256: hash(before),
    baseline: summary(samples[0]),
    candidate: summary(samples[1]),
  });
}
const result = {
  passed: true,
  baselineVersion: '0.27.20',
  candidateVersion: pkg.version,
  baselineModuleSha256: hash(baselineSource),
  candidateModuleSha256: hash(await readFile(path.join(root, 'ui/element-content-controls.mjs'), 'utf8')),
  snapshotModuleSha256: hash(await readFile(path.join(root, 'ui/element-content-display-owner.mjs'), 'utf8')),
  projectFile: projectFile ?? null,
  projectSha256: projectFile ? hash(await readFile(projectFile, 'utf8')) : null,
  model: savedState?.model.name ?? fixture.net.source.name,
  iterations,
  passes,
  rows,
  hardware: { cpu: os.cpus()[0]?.model, node: process.version, platform: os.platform() },
  scope:
    'Node-only comparison of literal display ownership; seven alternating-order passes. Synthetic image payload, no PNG decoding, GUI, renderer, GPU, native engine, full-refresh cost or FPS measurement.',
};
await writeFile(path.join(folder, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ folder, ...result }, null, 2));
