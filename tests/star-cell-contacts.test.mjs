import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { Viewer } from '../ui/viewer.js';
import { DensitySectionWorkflow, densitySectionDisplay } from '../ui/density-section-controls.mjs';
import { defaultDocumentView } from '../ui/default-look.mjs';
const { EnginePool } = createRequire(import.meta.url)('../desktop/engine-pool.cjs');
const fixtures = JSON.parse(
  execFileSync(
    'python',
    [
      '-B',
      '-c',
      "import json,runpy;h=runpy.run_path('tests/test_star_cell_contacts.py');print(json.dumps([h['native_fixture'](r,k) for r,k in [('nonzero',1),('threshold',2),('even-odd',1)]]))",
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024 }
  )
);

test('all contact fill rules render actual selected boundaries and promote identical native history', async () => {
  for (const fixture of fixtures) {
    const f = structuredClone(fixture),
      published = [],
      calls = [],
      project = { active: 0, documents: [f.document] };
    f.document.states[0] = f.state;
    const context = {
      getState: () => f.state,
      getDocument: () => f.document,
      getProject: () => project,
      isExporting: () => false,
      run: async (op, params) => {
        calls.push({ op, params });
        return structuredClone(op === 'section' ? f.preview : f.history);
      },
      publishHistory: (r) => published.push(r),
    };
    const flow = new DensitySectionWorkflow(context),
      result = await flow.evaluate();
    assert.deepEqual(calls[0].params, f.params);
    const v = Object.create(Viewer.prototype);
    v.group = new THREE.Group();
    v.draw = () => {};
    v.stereographicWorkerFactory = () => null;
    v.perspectiveCamera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
    v.orthographicCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 1000);
    v.cameraProjection = 'orthographic';
    v.camera = v.orthographicCamera;
    v.controls = { target: new THREE.Vector3(), update() {} };
    v.bindControls = () => {};
    try {
      v.setModel(result.model);
      v.setDisplay({
        angles: Array(6).fill(0),
        projection: 'orthographic',
        faces: true,
        edges: true,
        vertices: false,
        ...densitySectionDisplay(result.model),
      });
      assert.deepEqual(v.fillDiagnostics, []);
      assert.ok(v.surfaceGeometry.attributes.position.count > 0);
      assert.equal(
        v.visibility.edges.filter(Boolean).length,
        result.model.metadata.densitySection.boundaryEdges.length
      );
      const promoted = await flow.promote(result);
      assert.deepEqual(promoted.states[1].model, result.model);
      assert.equal(published.length, 1);
      assert.deepEqual(calls[1].params.parameters, f.params);
      assert.equal(result.model.metadata.independentCellSection.globalInteriorAsserted, false);
      assert.equal(result.densityDiagnostics.contactEvents.length, 4);
      assert.ok(result.densityDiagnostics.maxPlaneResidual < 1e-12);
    } finally {
      v.clear();
    }
  }
});

test(
  'expert-off app fills a vertex/edge event, recovers a coplanar refusal, promotes, undoes and reopens',
  { timeout: 120000 },
  async () => {
    const pool = new EnginePool({
      spawnWorker: () =>
        spawn('python', ['-B', 'engine/server.py'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }),
    });
    const queue = [],
      calls = [];
    let next = 0,
      active = 0,
      closed = false;
    const pump = () => {
      while (!closed && active < 3 && queue.length) {
        const job = queue.shift();
        active++;
        pool
          .run(job.request, job.id)
          .then(job.resolve, job.reject)
          .finally(() => {
            active--;
            pump();
          });
      }
    };
    const compute = (request) =>
      new Promise((resolve, reject) => {
        calls.push(request);
        queue.push({ request, id: request.id ?? 'contact-' + ++next, resolve, reject });
        pump();
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
      const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, reducedMotion: 'reduce' }),
        errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.exposeFunction('nativeCancel', (id) => pool.cancel(id));
      await page.addInitScript(() => {
        localStorage.setItem('polytope-welcome-v1', 'dismissed');
        localStorage.setItem('polytope.expert-tools.v1', 'false');
        window.polytope = {
          engine: (r, id) => window.nativeEngine({ ...r, id }),
          cancel: (id) => window.nativeCancel(id),
          setDirty: async () => {},
          setWorkspaceAvailability: async () => {},
          onAction() {},
          libraries: async () => ({ libraries: [], errors: [] }),
          recoveryInfo: async () => null,
          startupInfo: async () => ({ hidden: false }),
          autosave: async () => {},
          recentFiles: async () => ({ files: [] }),
          discoveryMenu: async () => {},
          open: async () => structuredClone(window.openResult),
          confirmProjectOpen: async () => true,
          save: async (project) => {
            window.saved = await window.nativeEngine({ op: 'validate-project', params: { project } });
            return { path: 'contact.polyproj' };
          },
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      await page.waitForFunction(() => document.getElementById('model-name')?.textContent === 'Tesseract');
      await page.locator('#toggle-inspector').click();
      const f = fixtures.at(-1),
        project = {
          format: 'polytope-laboratory',
          version: 1,
          active: 0,
          documents: [
            {
              id: 'contact-source',
              cursor: 0,
              states: [
                {
                  model: f.state.model,
                  view: {
                    ...defaultDocumentView(4),
                    derivedMode: 'face',
                    sectionNormal: f.params.normal,
                    sectionOffset: f.params.offset,
                  },
                  notes: f.state.notes,
                },
              ],
            },
          ],
        };
      await page.evaluate(
        (project) => (window.openResult = { project, path: 'star-contact-source.polyproj' }),
        project
      );
      await page.locator('#open').click();
      await page.waitForFunction(
        (name) => document.getElementById('model-name').textContent === name,
        f.state.model.name
      );
      await page.locator('#view-options-button').click();
      await page.selectOption('#viewport-layout', 'split');
      await page.keyboard.press('Escape');
      await page.selectOption('#derived-mode', 'section');
      await page.waitForFunction(() =>
        document.getElementById('derived-status').textContent.startsWith('Surface intersection')
      );
      await page.selectOption('#section-density-mode', 'winding-cells');
      const waitContact = () =>
        page.waitForFunction(
          () =>
            !document.getElementById('promote').disabled &&
            document
              .getElementById('section-density-legend')
              .textContent.includes('transverse source contacts in 4 cells')
        );
      await waitContact();
      assert.match(await page.locator('#section-density-legend').innerText(), /plane residual .* source units/);
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      assert.equal(await page.locator('#section-density-mode').evaluate((n) => !!n.closest('[data-expert]')), false);
      assert.equal(await page.locator('#density-section-settings').evaluate((n) => n.open), false);
      await page.locator('#density-section-settings summary').click();
      assert.match(await page.locator('#density-section-settings').innerText(), /coplanar faces\/cells refuse fill/);
      for (const fixture of fixtures) {
        await page.selectOption('#section-density-rule', fixture.params.fill_rule);
        await page.locator('#section-density-threshold').fill(fixture.params.density_threshold === 2 ? '1 + 1' : '1');
        await page.locator('#apply-density-section').click();
        await page.waitForFunction(
          (v) => document.getElementById('section-density-threshold').value === v,
          String(fixture.params.density_threshold)
        );
        await waitContact();
        assert.equal(await page.inputValue('#section-density-threshold'), String(fixture.params.density_threshold));
        const sent = () =>
          calls.some(
            (r) =>
              r.op === 'section' &&
              r.params.cell_orientation === 'independent' &&
              r.params.fill_rule === fixture.params.fill_rule &&
              r.params.density_threshold === fixture.params.density_threshold
          );
        for (const until = Date.now() + 30000; !sent() && Date.now() < until; )
          await new Promise((r) => setTimeout(r, 50));
        assert.ok(sent());
      }
      await page.locator('#section-normal').fill('0, 0, 1, 0');
      await page.locator('#section-depth').fill('1');
      await page.locator('#apply-section').click();
      await page.waitForFunction(() => document.getElementById('derived-status').textContent.includes('coplanar'));
      assert.equal(await page.locator('#promote').isDisabled(), true);
      assert.equal(await page.inputValue('#section-density-mode'), 'winding-cells');
      await page.locator('#section-normal').fill('0, 1, 0, 1');
      await page.locator('#section-depth').fill('-1 / sqrt(2)');
      await page.locator('#apply-section').click();
      await waitContact();
      assert.doesNotMatch(await page.locator('#section-density-interpretation').innerText(), /contact; use Surface/);
      await page.locator('#promote').click();
      await page.waitForFunction(() =>
        document.getElementById('model-name').textContent.startsWith('Independent winding cell section')
      );
      await page.locator('#save').click();
      await page.waitForFunction(() => !!window.saved);
      const saved = await page.evaluate(() => window.saved),
        doc = saved.documents[saved.active],
        promoted = doc.states[doc.cursor];
      assert.deepEqual(promoted.model, JSON.parse(JSON.stringify(f.preview.model)));
      assert.equal(promoted.notes, f.state.notes);
      assert.equal(promoted.model.numeric.certified, false);
      assert.deepEqual(doc.operationHistory.nodes.at(-1).params, f.params);
      await page.locator('#undo').click();
      await page.waitForFunction(
        (name) => document.getElementById('model-name').textContent === name,
        f.state.model.name
      );
      await page.locator('#redo').click();
      await page.waitForFunction(
        (name) => document.getElementById('model-name').textContent === name,
        promoted.model.name
      );
      await page.evaluate(() => {
        window.openResult = { project: window.saved, path: 'contact.polyproj' };
        window.saved = null;
      });
      await page.locator('#open').click();
      await page.waitForFunction(
        (name) => document.getElementById('model-name').textContent === name,
        promoted.model.name
      );
      await page.locator('#save').click();
      await page.waitForFunction(() => !!window.saved);
      assert.deepEqual(
        await page.evaluate(() => {
          const p = window.saved,
            d = p.documents[p.active];
          return d.states[d.cursor].model;
        }),
        promoted.model
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await server.close();
      closed = true;
      for (const job of queue.splice(0)) job.reject(Error('Contact test closed.'));
      pool.dispose();
    }
  }
);
