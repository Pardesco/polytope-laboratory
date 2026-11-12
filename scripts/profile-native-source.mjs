// Isolate renderer-side source ownership cost. Does not measure IPC or FPS.
import { captureNativeSource, verifyNativeSource } from '../ui/native-source-binding.mjs';
import { execFileSync } from 'node:child_process';
import { Session } from 'node:inspector';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const model = JSON.parse(
  execFileSync(
    'python',
    ['-B', '-c', "import json;from engine.generators import regular;print(json.dumps(regular('cell120')))"],
    { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 30000 }
  )
);
const state = {
    model,
    notes: 'Ownership profiling source',
    view: { coordinateUnit: 'mm', sectionNormal: [0.2, 0.3, 0.4, 1], sectionOffset: 0.1, angles: [0, 0, 0, 0, 0, 0] },
  },
  document = { id: 'ownership-profile', cursor: 0, states: [state] },
  project = { active: 0, documents: [document] },
  context = { getState: () => state, getDocument: () => document, getProject: () => project, isExporting: () => false };
const before = JSON.stringify(project),
  owner = captureNativeSource(context),
  folder = await mkdtemp(path.join(root, 'artifacts', 'native-source-profile-'));
for (let i = 0; i < 5; i++) {
  captureNativeSource(context);
  verifyNativeSource(context, owner);
}
const samples = { captureMs: [], verifyMs: [] },
  session = new Session();
session.connect();
const post = (name, params = {}) =>
  new Promise((resolve, reject) =>
    session.post(name, params, (error, result) => (error ? reject(error) : resolve(result)))
  );
await post('Profiler.enable');
await post('Profiler.start');
try {
  for (let i = 0; i < 20; i++) {
    let start = performance.now();
    captureNativeSource(context);
    samples.captureMs.push(performance.now() - start);
    start = performance.now();
    verifyNativeSource(context, owner);
    samples.verifyMs.push(performance.now() - start);
  }
} finally {
  const { profile } = await post('Profiler.stop');
  session.disconnect();
  await writeFile(path.join(folder, 'ownership.cpuprofile'), JSON.stringify(profile));
}
assert.equal(JSON.stringify(project), before);
state.model.metadata.ownershipProbe = 'changed without updating the fingerprint';
assert.throws(() => verifyNativeSource(context, owner), /changed/);
delete state.model.metadata.ownershipProbe;
verifyNativeSource(context, owner);
assert.equal(JSON.stringify(project), before);
const summaries = Object.fromEntries(
  Object.entries(samples).map(([key, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return [key, { min: sorted[0], median: (sorted[9] + sorted[10]) / 2, max: sorted.at(-1) }];
  })
);
const sourceHashes = {};
for (const name of ['ui/native-source-binding.mjs', 'ui/model-memories.mjs', 'ui/memory-source-signature.mjs']) {
  try {
    sourceHashes[name] = createHash('sha256')
      .update(await readFile(path.join(root, name)))
      .digest('hex');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const result = {
  passed: true,
  purpose: 'isolated Node source-ownership CPU workload; excludes IPC, UI, GPU and FPS',
  version: JSON.parse(await readFile(path.join(root, 'package.json'))).version,
  model: '120-cell',
  vertices: model.vertices.length,
  modelJsonBytes: Buffer.byteLength(JSON.stringify(model)),
  repetitions: 20,
  samples,
  summaries,
  sourceHashes,
  mutationRefused: true,
  sourceUnchanged: true,
  hardware: {
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    memoryGiB: os.totalmem() / 2 ** 30,
    platform: os.platform(),
    release: os.release(),
  },
};
await writeFile(path.join(folder, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ folder, ...result }, null, 2));
