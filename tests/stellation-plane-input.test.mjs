import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { StellationControls } from '../ui/stellation.js';
import { editPlaneInput } from '../ui/stellation-plane-input.mjs';
import { subgroupGeneratorIds } from '../ui/stellation-diagram-controls.mjs';
const { reveal } = createRequire(import.meta.url)('../scripts/smoke-helpers.cjs');

test('subgroup generator IDs are bounded literal IDs, with explicit identity', () => {
  assert.deepEqual(subgroupGeneratorIds('8, 12'), [8, 12]);
  assert.deepEqual(subgroupGeneratorIds('identity'), []);
  for (const text of ['', '8,8', '-1', '8.5', '2^3', '8,', Array.from({ length: 33 }, (_, i) => i).join(',')])
    assert.throws(() => subgroupGeneratorIds(text), /literal/);
});

function numericFixture() {
  const model = {
      id: 'source',
      dimension: 3,
      embeddingDimension: 3,
      vertices: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      edges: [],
      faces: [],
      cells: [],
    },
    state = { model, notes: 'keep', view: { stellation: { boxScale: 3, planeIds: null, selectedRegions: [] } } },
    doc = { id: 'doc', states: [state], cursor: 0 },
    project = { documents: [doc] },
    nodes = new Map(),
    calls = [];
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, { value: '', checked: false });
    return nodes.get(id);
  };
  node('stellation-arbitrary-planes').value = '1,0,0,0';
  node('stellation-bounds-min').value = '-2,-2,-2';
  node('stellation-bounds-max').value = '2,2,2';
  node('stellation-region-limit').value = '2048';
  const context = {
    getState: () => state,
    getModel: () => model,
    getDocument: () => doc,
    getProject: () => project,
    isExporting: () => false,
    evaluateMany: async (values) => values.map(Number),
  };
  const c = Object.assign(Object.create(StellationControls.prototype), context, {
    context,
    $: node,
    searchSequence: 0,
    markDirty: () => calls.push('dirty'),
    refresh: () => calls.push('refresh'),
    renderSearch: () => {},
  });
  return { c, state, calls, node };
}
test('plane expressions refuse invalid normals, extents and row counts without changing saved parameters', async () => {
  for (const [id, value] of [
    ['stellation-arbitrary-planes', '0,0,0,1'],
    ['stellation-arbitrary-planes', Array(33).fill('1,0,0,0').join('\n')],
    ['stellation-bounds-max', '-3,2,2'],
    ['stellation-region-limit', '0'],
  ]) {
    const f = numericFixture(),
      before = structuredClone(f.state);
    f.node(id).value = value;
    await assert.rejects(editPlaneInput(f.c));
    assert.deepEqual(f.state, before);
    assert.deepEqual(f.calls, []);
  }
});
test('pending plane expressions reject source edits, input edits and cancellation atomically', async () => {
  for (const change of ['source', 'input', 'cancel']) {
    const f = numericFixture();
    let release;
    f.c.context.evaluateMany = () => new Promise((resolve) => (release = resolve));
    const pending = editPlaneInput(f.c),
      before = structuredClone(f.state.view);
    await new Promise((resolve) => setImmediate(resolve));
    if (change === 'source') f.state.notes = 'changed';
    else if (change === 'input') f.node('stellation-bounds-min').value = '-4,-4,-4';
    else f.c.cancelNumeric();
    release([1, 0, 0, 0, -2, -2, -2, 2, 2, 2, 2048]);
    await assert.rejects(pending);
    assert.deepEqual(f.state.view, before);
    assert.deepEqual(f.calls, []);
  }
});
test('bounded plane edit remains available with a populated saved selection history', async () => {
  const f = numericFixture();
  f.state.view.stellation.cellSelectionHistory = {
    steps: Array.from({ length: 32 }, () => ({ before: Array(100).fill(0), after: [] })),
  };
  await editPlaneInput(f.c);
  assert.deepEqual(f.state.view.stellation.arbitraryPlanes, [[1, 0, 0, 0]]);
  assert.deepEqual(f.calls, ['dirty', 'refresh']);
});

test(
  'mounted arbitrary planes and reflection subgroup survive selection undo, project reopen and base promotion',
  { timeout: 150000 },
  async (t) => {
    const engine = spawn('python', ['-B', '-u', 'engine/server.py'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      }),
      pending = new Map();
    let next = 0,
      stderr = '';
    engine.stderr.on('data', (data) => (stderr += data));
    engine.on('error', (error) => {
      for (const job of pending.values()) job.reject(error);
      pending.clear();
    });
    const lines = createInterface({ input: engine.stdout });
    lines.on('line', (line) => {
      const response = JSON.parse(line),
        job = pending.get(response.id);
      if (!job) return;
      pending.delete(response.id);
      response.ok ? job.resolve(response.result) : job.reject(Error(response.error));
    });
    const compute = (request) =>
      new Promise((resolve, reject) => {
        const id = ++next;
        pending.set(id, { resolve, reject });
        engine.stdin.write(JSON.stringify({ ...request, id }) + '\n');
      });
    const server = await createServer({
      configFile: false,
      root: 'ui',
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { host: '127.0.0.1', port: 0 },
    });
    let browser;
    try {
      await server.listen();
      browser = await chromium.launch({
        headless: true,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      });
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' }),
        errors = [];
      page.setDefaultTimeout(20000);
      page.on('pageerror', (e) => errors.push(e.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript(() => {
        window.requests = [];
        window.saveCount = 0;
        window.polytope = {
          engine: (request) => {
            window.requests.push(structuredClone(request));
            return window.nativeEngine(request);
          },
          cancel: async () => {},
          setDirty: async () => {},
          setWorkspaceAvailability: async () => {},
          onAction() {},
          libraries: async () => ({ libraries: [], errors: [] }),
          recoveryInfo: async () => null,
          startupInfo: async () => ({ hidden: false }),
          autosave: async () => {},
          recentFiles: async () => ({ files: [] }),
          save: async (project) => {
            window.saved = await window.nativeEngine({ op: 'validate-project', params: { project } });
            window.saveCount++;
            return { path: 'stellation-test.polytope' };
          },
          open: async () => ({ project: structuredClone(window.saved), path: 'stellation-test.polytope' }),
          confirmProjectOpen: async () => true,
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
      await page.locator('#welcome-close').click();
      if (await page.locator('body').evaluate((n) => n.classList.contains('inspector-hidden')))
        await page.locator('#toggle-inspector').click();
      const ready = () => page.waitForFunction(() => document.getElementById('cancel').hidden);
      const save = async () => {
        const before = await page.evaluate(() => window.saveCount);
        await page.locator('#save').click();
        await page.waitForFunction((n) => window.saveCount > n, before);
        return page.evaluate(() => window.saved);
      };
      const current = (p) => {
        const d = p.documents[p.active];
        return d.states[d.cursor];
      };
      const click = async (id) => {
        await reveal(page, '#' + id);
        await page.locator('#' + id).click();
      };
      await ready();
      await click('library-show-all');
      await reveal(page, '[data-key="octahedron"]');
      await page.locator('[data-key="octahedron"]').click();
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Octahedron');
      await ready();

      await t.test('custom facial replication toggles the independent reflection pair', async () => {
        await click('stellation-evaluate');
        await page.waitForFunction(() =>
          document.getElementById('stellation-summary').textContent.includes('59 observed')
        );
        await ready();
        await click('stellation-cell-evaluate');
        await page.waitForFunction(() => document.querySelector('#stellation-face-diagram svg'));
        await page.selectOption('#stellation-face-symmetry', 'proper');
        await page.selectOption('#stellation-face-symmetry', 'subgroup');
        assert.equal(await page.locator('#stellation-face-symmetry').inputValue(), 'proper');
        await reveal(page, '#stellation-face-generators');
        await page.locator('#stellation-face-generators').fill('8');
        await click('stellation-face-subgroup');
        await page.waitForFunction(() =>
          document.getElementById('stellation-face-status').textContent.includes('Custom subgroup order 2')
        );
        await page.selectOption('#stellation-face-side', 'above');
        await page.locator('#stellation-face-diagram polygon[data-target="19"]').click();
        await ready();
        let saved = await save();
        assert.deepEqual(current(saved).view.stellation.selectedRegions, [19, 51, 58]);
        assert.deepEqual(current(saved).view.stellation.diagramGeneratorIds, [8]);
        await click('stellation-cell-undo');
        assert.deepEqual(current(await save()).view.stellation.selectedRegions, [58]);
        await click('stellation-cell-redo');
        saved = await save();
        await click('open');
        await ready();
        assert.deepEqual(current(await save()).view.stellation.selectedRegions, [19, 51, 58]);
        await click('stellation-cell-evaluate');
        await page.waitForFunction(() =>
          document.getElementById('stellation-face-status').textContent.includes('Custom subgroup order 2')
        );
      });

      await t.test(
        'arbitrary plane expressions and explicit bounds round-trip and promote with undo/redo',
        async () => {
          await reveal(page, '#stellation-arbitrary-planes');
          const text = 'sqrt(4),0,0,-2\n-1,0,0,-1\n0,1,0,-1\n0,-1,0,-1\n0,0,1,-1\n0,0,-1,-1';
          await page.locator('#stellation-arbitrary-planes').fill(text);
          await page.locator('#stellation-bounds-min').fill('-3,-3,-3');
          await page.locator('#stellation-bounds-max').fill('3,3,3');
          await page.locator('#stellation-region-limit').fill('2^11');
          await click('stellation-evaluate-arbitrary');
          await page.waitForFunction(() =>
            document.getElementById('stellation-summary').textContent.includes('Arbitrary planes · 27 observed')
          );
          await ready();
          let saved = await save(),
            state = current(saved);
          assert.equal(state.view.stellation.arbitraryPlaneText, text);
          assert.deepEqual(state.view.stellation.arbitraryPlanes[0], [2, 0, 0, -2]);
          assert.deepEqual(state.view.stellation.arbitraryBounds, [
            [-3, -3, -3],
            [3, 3, 3],
          ]);
          assert.equal(state.view.stellation.maxRegions, 2048);
          assert.equal(state.arrangement.unrestrictedEnumerationComplete, false);
          await click('open');
          await ready();
          assert.equal(await page.locator('#stellation-arbitrary-planes').inputValue(), text);
          assert.equal(await page.locator('#stellation-seed').isDisabled(), true);
          await click('stellation-cell-evaluate');
          await page.waitForFunction(() => document.querySelector('#stellation-face-diagram svg'));
          await click('stellation-face-base');
          await page.waitForFunction(() =>
            document.getElementById('model-name').textContent.startsWith('Stellation region union')
          );
          await ready();
          saved = await save();
          const union = current(saved).model;
          assert.ok(Math.abs(union.measure.content - 8) < 1e-8);
          const request = await page.evaluate(() =>
            window.requests.findLast((r) => r.op === 'recipe-run' && r.params.operation === 'stellation-make-base')
          );
          assert.deepEqual(request.params.parameters.planes[0], [2, 0, 0, -2]);
          await click('undo');
          await ready();
          assert.equal(current(await save()).view.stellation.arbitraryPlaneText, text);
          await click('redo');
          await ready();
          assert.deepEqual(current(await save()).model, union);
        }
      );
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      assert.deepEqual(errors, []);
      assert.equal(stderr, '');
    } finally {
      await browser?.close();
      await server.close();
      lines.close();
      engine.kill();
      for (const job of pending.values()) job.reject(Error('Test complete.'));
    }
  }
);
