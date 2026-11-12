// Short qualification of the actual self-extracting portable, without Python.
const { chromium } = require('playwright'),
  { spawn } = require('node:child_process');
const fs = require('node:fs/promises'),
  { createReadStream } = require('node:fs');
const path = require('node:path'),
  net = require('node:net'),
  assert = require('node:assert/strict');
const { createHash } = require('node:crypto'),
  { fileURLToPath } = require('node:url');
const root = path.resolve(__dirname, '..'),
  version = require('../package.json').version;
async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function snapshot(directory) {
  const hashes = { 'resources/app.asar': await digest(path.join(directory, 'resources', 'app.asar')) };
  async function visit(relative) {
    for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) hashes[file.split(path.sep).join('/')] = await digest(path.join(directory, file));
      else throw Error('Unexpected portable resource type: ' + file);
    }
  }
  await visit('resources/engine');
  return hashes;
}
async function main() {
  const folder = await fs.mkdtemp(path.join(root, 'artifacts', 'portable-launch-')),
    profile = path.join(folder, 'profile');
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, 'linked-libraries.json'), JSON.stringify({ version: 1, paths: [] }));
  const directory = path.join(root, 'release', 'preview-' + version),
    executable =
      process.env.POLYTOPE_TEST_EXECUTABLE || path.join(directory, `Polytope Laboratory ${version} preview.exe`);
  const candidate = process.env.POLYTOPE_TEST_CANDIDATE_ROOT || path.join(directory, 'win-unpacked'),
    hash = await digest(executable);
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const env = {
    ...process.env,
    POLYTOPE_TEST_USER_DATA: profile,
    POLYTOPE_PYTHON: path.join(folder, 'unavailable-python.exe'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.POLYTOPE_TEST_MODE;
  const launcher = spawn(executable, [`--remote-debugging-port=${port}`], {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let launchError,
    output = '',
    browser,
    page;
  const errors = [];
  launcher.on('error', (error) => (launchError = error));
  for (const stream of [launcher.stdout, launcher.stderr])
    stream.on('data', (chunk) => {
      output = (output + chunk).slice(-8000);
    });
  try {
    const deadline = Date.now() + 60000;
    let connected = false;
    while (Date.now() < deadline) {
      if (launchError) throw launchError;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) {
          connected = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!connected) throw Error('Portable debugging endpoint did not start: ' + output);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    page = browser.contexts()[0].pages()[0] ?? (await browser.contexts()[0].waitForEvent('page'));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.waitForFunction(
      () =>
        document.getElementById('model-name')?.textContent === 'Tesseract' && document.getElementById('cancel').hidden,
      null,
      { timeout: 30000 }
    );
    const archive = path.dirname(path.dirname(fileURLToPath(page.url())));
    assert.equal(path.basename(archive), 'app.asar');
    const extracted = path.dirname(path.dirname(archive)),
      before = await snapshot(extracted);
    assert.deepEqual(before, await snapshot(candidate));
    assert.equal(
      JSON.parse(require('@electron/asar').extractFile(archive, 'package.json').toString()).version,
      version
    );
    const geometry = await page.evaluate(async () => {
      const run = (op, model = null, params = {}) => window.polytope.engine({ op, model, params }, crypto.randomUUID());
      const cube = await run('generate', null, { kind: 'regular', key: 'cube' }),
        dual = await run('dual', cube);
      const source = await run('generate', null, { kind: 'regular', key: 'truncated-tetrahedron' }),
        sourceContext = { notes: '', unit: 'model' };
      const settings = {
        version: 1,
        enabled: true,
        method: 'sizing',
        center: null,
        radius: 0.3994636211547385,
        ratio: 0,
        duration: 2,
        loop: false,
      };
      const prepared = await run('prepare-dual-morph', source, { settings, sourceContext }),
        frame = await run('evaluate-dual-morph', source, { prepared, ratio: 0.5, sourceContext });
      return {
        cubeVertices: cube.vertices.length,
        dualVertices: dual.vertices.length,
        morphRatio: frame.ratio,
        morphVertices: frame.model.vertices.length,
      };
    });
    assert.deepEqual(geometry, { cubeVertices: 8, dualVertices: 6, morphRatio: 0.5, morphVertices: 20 });
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(folder, 'portable.png') });
    assert.equal(await digest(executable), hash);
    assert.deepEqual(await snapshot(extracted), before);
    const result = {
      passed: true,
      version,
      executable,
      sha256: hash,
      bytes: (await fs.stat(executable)).size,
      developmentPythonUnavailable: true,
      developmentPythonDisabled: true,
      extractedRuntimeMatchesCandidate: true,
      verifiedResourceFiles: Object.keys(before).length,
      geometry,
      errors,
    };
    await fs.writeFile(path.join(folder, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ folder, ...result }, null, 2));
  } catch (error) {
    await fs.writeFile(
      path.join(folder, 'failure.json'),
      JSON.stringify({ error: error.stack, errors, output }, null, 2)
    );
    console.error('Artifacts:', folder);
    throw error;
  } finally {
    await page?.evaluate(() => window.close()).catch(() => {});
    await browser?.close().catch(() => {});
    await new Promise((resolve) => {
      if (launcher.exitCode !== null || launcher.signalCode !== null) return resolve();
      const timer = setTimeout(() => {
        launcher.kill();
        resolve();
      }, 10000);
      launcher.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
