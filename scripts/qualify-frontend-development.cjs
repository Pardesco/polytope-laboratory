// Execute the declared frontend suite with complete before/after input hashes.
const fs = require('node:fs/promises'),
  path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto'),
  { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const hash = (data) => createHash('sha256').update(data).digest('hex');
async function files(folder) {
  const result = [];
  for (const item of await fs.readdir(folder, { withFileTypes: true })) {
    if (item.name === '__pycache__') continue;
    const file = path.join(folder, item.name);
    if (item.isDirectory()) result.push(...(await files(file)));
    else if (item.isFile()) result.push(file);
  }
  return result;
}
async function snapshot() {
  const inputs = [
    ...(await files(path.join(root, 'ui'))),
    ...(await files(path.join(root, 'desktop'))),
    ...(await files(path.join(root, 'engine'))).filter(
      (file) => file.endsWith('.py') || file.startsWith(path.join(root, 'engine', 'catalog_data') + path.sep)
    ),
    ...(await files(path.join(root, 'scripts'))),
    ...(await files(path.join(root, 'tests'))).filter(
      (file) => /\.(?:mjs|cjs|js|py)$/.test(file) || file.startsWith(path.join(root, 'tests', 'fixtures') + path.sep)
    ),
    ...(await fs.readdir(path.join(root, 'development')))
      .filter((name) => /\.(?:mjs|cjs|js|py)$/.test(name))
      .map((name) => path.join(root, 'development', name)),
    ...['package.json', 'package-lock.json', 'requirements.txt', 'vite.config.mjs'].map((name) =>
      path.join(root, name)
    ),
  ];
  const result = {};
  for (const file of [...new Set(inputs)].sort())
    result[path.relative(root, file).split(path.sep).join('/')] = hash(await fs.readFile(file));
  return result;
}
async function coverage(commands) {
  // These five suites exercise unmounted development-only camera prototypes.
  // Shipped-code tests are mandatory; new omissions must fail qualification.
  const developmentOnly = [
    'tests/stereographic-homogeneous-arc-tessellation.test.mjs',
    'tests/stereographic-homogeneous-camera.test.mjs',
    'tests/stereographic-homogeneous-endpoint-bound.test.mjs',
    'tests/stereographic-interval-camera-jet-arc.test.mjs',
    'tests/stereographic-interval-camera-jet.test.mjs',
  ];
  const discovered = (await fs.readdir(path.join(root, 'tests')))
    .filter((name) => /\.test\.(?:mjs|cjs|js)$/.test(name))
    .map((name) => 'tests/' + name)
    .sort();
  const declared = commands.flatMap((args) =>
    args.filter((arg) => arg.startsWith('tests/') && /\.test\.(?:mjs|cjs|js)$/.test(arg))
  );
  assert.equal(new Set(declared).size, declared.length, 'Do not run a declared test file twice');
  for (const name of developmentOnly)
    assert.ok(discovered.includes(name), 'Stale development-only test exclusion: ' + name);
  assert.deepEqual(
    [...declared].sort(),
    discovered.filter((name) => !developmentOnly.includes(name)),
    'test:features must include every shipped-code suite'
  );
  return { discovered: discovered.length, declared: declared.length, developmentOnly };
}
async function main() {
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const commands = metadata.scripts['test:features'].split(' && ').map((command) => {
    const args = command.split(/\s+/);
    if (args.shift() !== 'node' || args.some((arg) => !/^[-\w./]+$/.test(arg)))
      throw Error('Frontend qualification requires explicit node/file arguments.');
    return args;
  });
  const testCoverage = await coverage(commands),
    before = await snapshot(),
    startedUtc = new Date().toISOString(),
    runs = [];
  const folder = path.join(root, 'artifacts');
  await fs.mkdir(folder, { recursive: true });
  const logPath = path.join(folder, 'frontend-source-tests-' + metadata.version + '.log');
  const log = await fs.open(logPath, 'wx');
  let exitCode = 0;
  try {
    for (const args of commands) {
      const child = spawn(process.execPath, args, {
        cwd: root,
        windowsHide: true,
        env: { ...process.env, POLYTOPE_TEST_ROOT: root },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const chunks = [];
      for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => chunks.push(chunk));
      const code = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) => resolve(signal ? null : code));
      });
      const output = Buffer.concat(chunks);
      await log.write(output);
      process.stdout.write(output);
      const summary = Object.fromEntries(
        [...output.toString('utf8').matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\r?$/gm)].map(
          (match) => [match[1], Number(match[2])]
        )
      );
      runs.push({ args, exitCode: code, ...(Object.keys(summary).length ? { testSummary: summary } : {}) });
      if (code !== 0) {
        exitCode = code ?? 1;
        break;
      }
    }
  } finally {
    await log.close();
  }
  const after = await snapshot(),
    changedPaths = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((file) => before[file] !== after[file])
      .sort();
  const proof = {
    version: metadata.version,
    startedUtc,
    finishedUtc: new Date().toISOString(),
    passed: exitCode === 0 && !changedPaths.length,
    exitCode,
    sourceUnchanged: !changedPaths.length,
    changedPaths,
    sourceHashes: before,
    runs,
    logPath,
    testCoverage,
    node: process.version,
    testRoot: root,
    scope:
      'Every shipped-code frontend suite plus the two face-fill scripts; five named unmounted development-only suites excluded. UI, desktop, native engine/catalog, scripts, test helpers/fixtures, top-level development reference sources and package/build configuration bound before and after; source fixtures pinned to this workspace',
    qualificationScriptSha256: hash(await fs.readFile(__filename)),
  };
  const destination = path.join(folder, 'frontend-source-tests-' + metadata.version + '.json');
  await fs.writeFile(destination, JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
  console.log('Frontend source-qualified evidence: ' + destination);
  if (!proof.passed) process.exitCode = exitCode || 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
