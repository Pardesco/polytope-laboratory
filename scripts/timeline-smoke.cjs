/** Hidden Electron qualification; run after build beneath the native HWND watcher. */
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
async function main() {
  const runtime = await require('./layer-join-smoke.cjs').guardRuntime();
  const { _electron: electron } = require('playwright'),
    artifacts = path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS || path.join(root, 'artifacts'));
  await fs.mkdir(artifacts, { recursive: true });
  const output = await fs.mkdtemp(path.join(artifacts, 'timeline-smoke-')),
    profile = path.join(output, 'profile');
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, 'linked-libraries.json'), JSON.stringify({ version: 1, paths: [] }));
  const env = { ...process.env, POLYTOPE_TEST_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  if (runtime.packaged) env.POLYTOPE_PYTHON = path.join(output, 'unavailable-development-python.exe');
  const app = await electron.launch({
    executablePath: runtime.packaged || require('electron'),
    args: runtime.packaged ? [] : [root],
    cwd: root,
    env,
    timeout: 30000,
  });
  const checks = [],
    errors = [];
  try {
    const page = await app.firstWindow();
    require('./smoke-helpers.cjs').autoReveal(page);
    page.setDefaultTimeout(30000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.waitForFunction(
      () =>
        document.getElementById('model-name')?.textContent === 'Tesseract' && document.getElementById('cancel').hidden
    );
    // Hidden startup exposes experts for old smokes; explicitly exercise the common UI here.
    await page.evaluate(() => document.body.classList.remove('expert-mode'));
    await page.locator('#animation-settings>summary').click();
    await page.locator('#timeline-panel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#animation-rotation').isVisible(), true);
    await page.locator('#animation-rotation').click();
    await page.waitForFunction(() => document.querySelectorAll('.timeline-diamond').length === 2);
    await page.locator('#animation-play').click();
    await page.waitForFunction(() => document.getElementById('animation-play').textContent === 'Pause');
    assert.equal(await page.locator('#auto-rotate').getAttribute('aria-pressed'), 'false');
    checks.push('common Turn in 4D creates two diamonds and owns motion');
    await page.locator('#animation-play').click();
    assert.equal(await page.locator('#animation-play').textContent(), 'Play');
    await page.locator('#timeline-panel').focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.getElementById('animation-play').textContent === 'Pause');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.getElementById('animation-play').textContent === 'Play');
    checks.push('Play/Pause and focused Space transport');
    await page.locator('#timeline-delete-keyframe').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('at least two'));
    assert.equal(await page.locator('.timeline-diamond').count(), 2);
    checks.push('two-keyframe deletion refusal');
    await page.locator('#timeline-exact-time').fill('4');
    await page.locator('#timeline-exact-time').press('Tab');
    await page.waitForFunction(() => Number(document.getElementById('animation-time').value) === 4);
    await page.locator('#animation-keyframe').click();
    await page.waitForFunction(() => document.querySelectorAll('.timeline-diamond').length === 3);
    checks.push('mid-time pose capture creates a third diamond');
    await page.locator('#timeline-export-video').click();
    await page.locator('#export-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#export-video-source').inputValue(), 'animation');
    checks.push('Export video opens global animation goal');
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('[data-kind="error"]').count(), 0);
    await page.screenshot({ path: path.join(output, 'timeline.png') });
    await fs.writeFile(
      path.join(output, 'result.json'),
      JSON.stringify({ passed: true, packaged: Boolean(runtime.packaged), checks, pageErrors: errors }, null, 2)
    );
    console.log(`Timeline PASS ${checks.length} checks. Artifacts: ${output}`);
  } finally {
    await app.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
