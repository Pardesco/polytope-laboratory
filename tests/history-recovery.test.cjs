const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { createProjectStorage } = require('../desktop/project-storage.cjs');
const { createWorkspaceReads } = require('../desktop/workspace-reads.cjs');

function engine(t) {
  const proc = spawn('python', ['engine/server.py'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }),
    pending = new Map();
  let next = 0,
    stderr = '';
  proc.stderr.on('data', (data) => (stderr += data));
  proc.on('error', (error) => {
    for (const job of pending.values()) job.reject(error);
    pending.clear();
  });
  const lines = createInterface({ input: proc.stdout });
  lines.on('line', (line) => {
    const response = JSON.parse(line),
      job = pending.get(response.id);
    if (!job) return;
    pending.delete(response.id);
    response.ok ? job.resolve(response.result) : job.reject(Error(response.error));
  });
  proc.on('exit', () => {
    for (const job of pending.values()) job.reject(Error('Native exit: ' + stderr));
    pending.clear();
  });
  t.after(() => {
    lines.close();
    proc.kill();
  });
  return (request) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      pending.set(id, { resolve, reject });
      proc.stdin.write(JSON.stringify({ ...request, id }) + '\n');
    });
}

test('native legacy backup and autosave recovery preserve pinned versions and replay both branches', async (t) => {
  const compute = engine(t),
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'polytope-history-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const loaded = await compute({
      op: 'load',
      params: { path: path.resolve('tests/fixtures/history/polygon-prism-0.1.polyproj') },
    }),
    project = loaded.project;
  const original = structuredClone(project),
    doc = project.documents[0],
    file = path.join(root, 'project.polyproj'),
    recovery = path.join(root, 'recovery.polyproj');
  const storage = createProjectStorage({
    writeProject: (destination, value) => compute({ op: 'save', params: { path: destination, project: value } }),
  });
  await storage.publish(file, project);
  const branch = await compute({ op: 'recipe-branch', params: { document: doc, parameters: { height: 4 } } });
  project.documents = [branch];
  await storage.publish(file, project);
  await storage.publish(recovery, original);
  await storage.publish(recovery, project);
  const backup = (await compute({ op: 'load', params: { path: file + '.bak' } })).project;
  assert.deepEqual(backup.documents[0].operationHistory, original.documents[0].operationHistory);
  const reads = createWorkspaceReads({
    chooseFile: async () => ({ canceled: true }),
    read: (source) => compute({ op: 'load', params: { path: source } }),
    recoveryPath: () => recovery,
    recoveryBackupPath: () => recovery + '.bak',
  });
  const recovered = (await reads.recover('legacy-recovery')).project;
  assert.deepEqual(recovered.documents[0].operationHistory, branch.operationHistory);
  for (const target of ['legacy-prism', branch.states[branch.cursor].operationNode]) {
    const replay = await compute({ op: 'recipe-replay', params: { document: recovered.documents[0], target } });
    assert.equal(replay.states[0].model.interpretation, 'generalized-complex');
    assert.deepEqual(
      [...new Set(replay.states[0].model.vertices.map((p) => p[2]))].sort((a, b) => a - b),
      target === 'legacy-prism' ? [-1, 1] : [-2, 2]
    );
  }
  const before = await fs.readFile(file),
    beforeBackup = await fs.readFile(file + '.bak');
  const unsupported = { ...project, version: 3 };
  await assert.rejects(() => storage.publish(file, unsupported), /Unsupported project format\/version/);
  assert.deepEqual(await fs.readFile(file), before);
  assert.deepEqual(await fs.readFile(file + '.bak'), beforeBackup);
  await fs.writeFile(recovery, '{"incomplete":');
  const fallback = await reads.recover('previous-recovery');
  assert.match(fallback.recoveryWarning, /Recovered the previous snapshot/);
  assert.deepEqual(fallback.project.documents[0].operationHistory, original.documents[0].operationHistory);
  const replay = await compute({ op: 'recipe-replay', params: { document: fallback.project.documents[0] } });
  assert.equal(replay.states[0].model.vertices.length, 8);
  assert.deepEqual((await fs.readdir(root)).sort(), [
    'project.polyproj',
    'project.polyproj.bak',
    'recovery.polyproj',
    'recovery.polyproj.bak',
  ]);
});
