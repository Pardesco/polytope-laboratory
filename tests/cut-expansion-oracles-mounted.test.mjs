import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const { reveal } = createRequire(import.meta.url)('../scripts/smoke-helpers.cjs');
// Raw snapshot hashes distinguish Python float / JS integer JSON spellings.
const replayAttributes = (value) =>
  JSON.parse(JSON.stringify(value, (key, item) => (key === 'sourceSnapshotSha256' ? undefined : item)));

test(
  'literal cut/expansion controls: Expert off, native preview, adopt, undo/redo, reopen and replay',
  { timeout: 180000 },
  async (t) => {
    const engine = spawn('python', ['-B', '-u', 'engine/server.py'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      }),
      pending = new Map();
    let next = 0,
      stderr = '',
      browser;
    engine.stderr.on('data', (data) => (stderr += data));
    engine.on('error', (error) => {
      for (const job of pending.values()) job.reject(error);
      pending.clear();
    });
    const lines = createInterface({ input: engine.stdout });
    lines.on('line', (line) => {
      const packet = JSON.parse(line),
        job = pending.get(packet.id);
      if (!job) return;
      pending.delete(packet.id);
      packet.ok ? job.resolve(packet.result) : job.reject(Error(packet.error));
    });
    const compute = (request) =>
      new Promise((resolve, reject) => {
        const id = ++next;
        pending.set(id, { resolve, reject });
        engine.stdin.write(JSON.stringify({ ...request, id }) + '\n');
      });
    const sources = JSON.parse(
      await readFile(new URL('./fixtures/cut-expansion-oracles.json', import.meta.url), 'utf8')
    ).sources;
    const server = await createServer({
      configFile: false,
      root: 'ui',
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { host: '127.0.0.1', port: 0 },
    });
    try {
      await server.listen();
      browser = await chromium.launch({
        headless: true,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      });
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' }),
        errors = [];
      page.setDefaultTimeout(15000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript(() => {
        window.saveCount = 0;
        window.requests = [];
        window.polytope = {
          engine: (request) => {
            window.requests.push(structuredClone(request));
            return window.nativeEngine(request);
          },
          cancel: async () => {},
          setDirty: async () => {},
          setWorkspaceAvailability: async () => {},
          onAction: (callback) => (window.menuAction = callback),
          libraries: async () => ({ libraries: [], errors: [] }),
          recoveryInfo: async () => null,
          startupInfo: async () => ({ hidden: false }),
          autosave: async () => {},
          recentFiles: async () => ({ files: [] }),
          confirmProjectOpen: async () => true,
          open: async () => ({
            project: structuredClone(window.openFixture ?? window.saved),
            path: 'cut-oracle.polyproj',
          }),
          save: async (project) => {
            window.saved = await window.nativeEngine({ op: 'validate-project', params: { project } });
            window.saveCount++;
            return { path: 'cut-oracle.polyproj' };
          },
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      await page.waitForFunction(() => document.getElementById('model-name').textContent === 'Tesseract');
      await page.evaluate(() => {
        for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
      });
      const ready = () =>
        page.waitForFunction(() => document.getElementById('cancel').hidden && document.querySelector('#evidence pre'));
      const save = async () => {
        await ready();
        const before = await page.evaluate(() => window.saveCount);
        await page.evaluate(() => window.menuAction('save'));
        await page.waitForFunction((n) => window.saveCount > n, before);
        return page.evaluate(() => window.saved);
      };
      const current = (p) => {
        const doc = p.documents[p.active];
        return doc.states[doc.cursor];
      };
      const common = async (selector) => {
        assert.equal(await page.locator(selector).evaluate((n) => !!n.closest('[data-expert]')), false);
        await reveal(page, selector);
        assert.equal(await page.locator(selector).isVisible(), true);
        assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      };
      for (const [key, op, expected] of [
        ['tesseract', 'zero', [16, 32, 24, 8]],
        ['cube', 'quasi', [24, 36, 14, 0]],
        ['cube', 'expansion', [24, 48, 26, 0]],
        ['tesseract', 'expansion', [64, 192, 208, 80]],
      ]) {
        await t.test(key + ' ' + op, async () => {
          const model = structuredClone(sources[key]),
            kind = model.dimension === 4 ? 'cells' : 'faces';
          model.metadata.offColors = {
            [kind]: model[kind].map(() => ({ encoding: 'byte', values: [10, 40, 90, 127] })),
          };
          const project = await compute({
            op: 'validate-project',
            params: {
              project: {
                format: 'polytope-laboratory',
                version: 1,
                active: 0,
                documents: [
                  {
                    id: 'literal-doc',
                    cursor: 0,
                    states: [{ model, view: { coordinateUnit: 'mm' }, notes: 'Literal oracle notes' }],
                  },
                ],
              },
            },
          });
          await page.evaluate((p) => {
            window.openFixture = p;
            window.menuAction('open');
          }, project);
          await ready();
          await page.waitForFunction((name) => document.getElementById('model-name').textContent === name, model.name);
          if (op === 'expansion') {
            await common('#make-expansion');
            await page.locator('#expansion-ratio').fill('1/2');
            await page.locator('#expansion-radius').fill('sqrt(2)');
            await page
              .locator('#expansion-center')
              .fill(model.dimension === 4 ? '1/8, -1/4, 1/16, 3/16' : '1/8, -1/4, 1/16');
            await page.locator('#make-expansion').click();
          } else {
            await common('#preview-incidence-cut');
            await page.locator('#incidence-cut-preset').selectOption(op === 'zero' ? 'manual' : 'quasi');
            if (op === 'zero') await page.locator('#incidence-cut-amount').fill('1 - 1');
            else await page.locator('#incidence-cut-reference').fill('2');
            await page.locator('#preview-incidence-cut').click();
            await page.waitForFunction(() => !document.getElementById('adopt-incidence-cut').disabled);
            assert.match(
              await page.locator('#incidence-cut-result').textContent(),
              new RegExp(expected[0] + ' vertices')
            );
            await page.locator('#adopt-incidence-cut').click();
          }
          await page.waitForFunction(
            () => !document.getElementById('undo').disabled && document.getElementById('cancel').hidden
          );
          const built = await save(),
            doc = built.documents[built.active],
            state = current(built),
            node = doc.operationHistory.nodes.at(-1);
          assert.equal(doc.cursor, 1);
          assert.deepEqual(
            ['vertices', 'edges', 'faces', 'cells'].map((k) => state.model[k].length),
            expected
          );
          assert.equal(state.notes, 'Literal oracle notes');
          assert.equal(state.view.coordinateUnit, 'mm');
          assert.equal(node.op, op === 'expansion' ? 'expand-runcinate' : 'incidence-truncate');
          if (op === 'zero') {
            assert.equal(node.params.amount, 0);
            assert.equal(node.params.preset, 'manual');
            for (const k of ['vertices', 'edges', 'faces', 'cells']) assert.deepEqual(state.model[k], model[k]);
          } else if (op === 'quasi') {
            assert.equal(node.params.preset, 'quasi');
            assert.equal(node.params.reference_face, 2);
            assert.equal(state.model.interpretation, 'generalized-complex');
          } else {
            assert.equal(node.params.ratio, 0.5);
            assert.deepEqual(
              node.params.center,
              model.dimension === 4 ? [0.125, -0.25, 0.0625, 0.1875] : [0.125, -0.25, 0.0625]
            );
          }
          await page.evaluate(() => window.menuAction('undo'));
          await ready();
          assert.equal((await save()).documents[0].cursor, 0);
          await page.evaluate(() => window.menuAction('redo'));
          await ready();
          assert.equal((await save()).documents[0].cursor, 1);
          await page.evaluate(() => {
            window.openFixture = null;
            window.menuAction('open');
          });
          await ready();
          const reopened = await save();
          assert.deepEqual(current(reopened).model, state.model);
          await common('#history-replay');
          await page.locator('#history-replay').click();
          await page.waitForFunction(() => document.querySelectorAll('#document-tabs button').length === 2);
          await ready();
          const replayed = current(await save());
          assert.equal(replayed.model.fingerprint, state.model.fingerprint);
          assert.deepEqual(replayAttributes(replayed.model.metadata), replayAttributes(state.model.metadata));
          assert.equal(replayed.notes, state.notes);
          assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
        });
      }
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
