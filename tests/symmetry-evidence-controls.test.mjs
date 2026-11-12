import { readAppSource } from './helpers/app-source.mjs';
import { matchSource, doesNotMatchSource } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SymmetryEvidenceControls,
  appendSymmetryReceiptLink,
  evidenceSummary,
} from '../ui/symmetry-evidence-controls.mjs';
import { REUSABLE_OPERATIONS } from '../desktop/engine-pool.cjs';

class Node {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.value = '';
    this.attributes = {};
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  before(node) {
    this.beforeNode = node;
  }
  setAttribute(key, value) {
    this.attributes[key] = value;
  }
}
const data = () => ({
  receipts: [
    { id: 'cube', key: 'cube', variant: 'source', status: 'passed', source: { fingerprint: 'cube' } },
    { id: 'limit', key: 'cube', variant: 'source', status: 'limited', reason: 'frame-limit' },
  ],
  binding: { fixturesCurrent: true, implementation: { 'symmetry.py': 'current' } },
  environment: { python: '3' },
  reportSha256: 'digest',
});
function fixture(run = async () => data()) {
  let state = { model: { vertices: [] } };
  const calls = [],
    opened = [],
    before = new Node('div');
  const control = new SymmetryEvidenceControls({
    document: { createElement: (tag) => new Node(tag) },
    before,
    run: async (...args) => {
      calls.push(args);
      return run(...args);
    },
    getState: () => state,
    open: (entry) => opened.push(entry),
  });
  return {
    control,
    before,
    calls,
    opened,
    getState: () => state,
    setState: (s) => {
      state = s;
    },
  };
}
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

test('ordinary library evidence is mounted collapsed, lazy and read only', async () => {
  const f = fixture();
  assert.equal(f.before.beforeNode.id, 'library-symmetry-evidence');
  assert.equal(f.control.root.attributes['data-expert'], undefined);
  assert.equal(f.calls.length, 0);
  f.control.root.open = true;
  await f.control.root.ontoggle();
  assert.equal(f.calls[0][0], 'symmetry-qualification');
  assert.equal(f.calls[0][2], null);
  assert.match(f.control.summary.textContent, /1 passed; 1 resource-limited; 0 failed/);
  assert.match(f.control.status.textContent, /Recorded numerical completeness/);
  assert.match(f.control.detail.textContent, /"reportSha256": "digest"/);
  f.control.source.onclick();
  assert.deepEqual(f.opened, [{ key: 'cube', name: 'cube' }]);
});

test('limited results and changed fixture/code bindings are explicit', async () => {
  const d = data();
  d.binding.fixturesCurrent = false;
  const f = fixture(async () => d);
  await f.control.load();
  assert.match(f.control.status.textContent, /Fixture definitions changed/);
  f.control.choice.value = 'limit';
  f.control.choice.onchange();
  assert.match(f.control.status.textContent, /Resource-limited; completeness unresolved/);
  d.binding.fixturesCurrent = true;
  d.binding.implementation['symmetry.py'] = 'changed';
  f.control.render();
  assert.match(f.control.status.textContent, /Implementation changed/);
  assert.match(evidenceSummary({ ...d, receipts: [{ status: 'failed' }] }), /0 passed; 0 resource-limited; 1 failed/);
});

test('current-model matching sends captured source, remains transient and clears after navigation', async () => {
  const f = fixture(async (_op, params) => (params.scenario ? { ...data(), sourceMatch: true } : data()));
  await f.control.load();
  const source = f.getState().model;
  await f.control.compare();
  assert.equal(f.calls[1][2], source);
  assert.deepEqual(f.calls[1][1], { scenario: 'cube' });
  assert.match(f.control.status.textContent, /Current coordinates and complete ordered incidence match/);
  f.setState({ model: { vertices: [] } });
  f.control.sync();
  assert.doesNotMatch(f.control.status.textContent, /Current coordinates/);
});

test('changed or unknown geometry cannot inherit a catalog completeness label', async () => {
  const f = fixture(async (_op, params) => (params.scenario ? { ...data(), sourceMatch: false } : data()));
  await f.control.load();
  await f.control.compare();
  assert.match(f.control.status.textContent, /does not match a passed receipt/);
});

test('late comparison and selection responses are discarded', async () => {
  const hold = deferred(),
    f = fixture(async (_op, params) => (params.scenario ? hold.promise : data()));
  await f.control.load();
  const pending = f.control.compare();
  f.control.choice.value = 'limit';
  f.control.choice.onchange();
  assert.equal(f.calls[1][4].signal.aborted, true);
  hold.resolve({ ...data(), sourceMatch: true });
  await pending;
  assert.match(f.control.status.textContent, /Resource-limited/);
  const hold2 = deferred();
  f.control.run = () => hold2.promise;
  const second = f.control.compare();
  f.setState({ model: {} });
  hold2.resolve({ ...data(), sourceMatch: true });
  await second;
  assert.match(f.control.status.textContent, /current model changed/);
});

test('failed evidence reads restore controls for retry', async () => {
  let fail = true;
  const f = fixture(async () => {
    if (fail) throw Error('missing receipt');
    return data();
  });
  await assert.rejects(f.control.load(), /missing receipt/);
  assert.match(f.control.status.textContent, /unavailable/);
  assert.equal(f.control.refresh.disabled, false);
  fail = false;
  await f.control.load();
  assert.equal(f.control.match.disabled, false);
});

function corpus(run = async () => data()) {
  let selected = { id: 'native:cube', catalogKey: 'cube' };
  const c = {
    detail: new Node('div'),
    status: new Node('output'),
    sequence: 0,
    guard: (fn) => fn,
    make: (tag, id, text) => Object.assign(new Node(tag), { id, textContent: text }),
    cancel() {
      this.sequence++;
      this.controller?.abort();
      this.controller = null;
    },
    busy() {},
    run,
    selectedRealization: () => selected,
  };
  return {
    c,
    setSelected: (value) => {
      selected = value;
    },
  };
}
test('corpus source links expose hashes without promoting identity qualification', async () => {
  const { c } = corpus();
  appendSymmetryReceiptLink(c, c.selectedRealization());
  assert.equal(c.detail.children[0].id, 'corpus-symmetry-evidence');
  await c.detail.children[0].onclick();
  assert.equal(c.detail.children[1].id, 'corpus-symmetry-receipt');
  assert.match(c.status.textContent, /identity qualification remains pending/);
  const absent = corpus();
  appendSymmetryReceiptLink(absent.c, { catalogKey: 'uncovered' });
  assert.equal(absent.c.detail.children.length, 0);
});

test('corpus links discard responses after source navigation, including away and back', async () => {
  const hold = deferred(),
    { c, setSelected } = corpus(() => hold.promise);
  appendSymmetryReceiptLink(c, c.selectedRealization());
  const pending = c.detail.children[0].onclick();
  c.cancel();
  setSelected({ id: 'native:cube', catalogKey: 'cube' });
  hold.resolve(data());
  await pending;
  assert.equal(c.detail.children.length, 1);
});

test('report op is reusable, registered in features, mounted and does not write document state', () => {
  assert.ok(REUSABLE_OPERATIONS.has('symmetry-qualification'));
  const app = readAppSource();
  matchSource(app, /new SymmetryEvidenceControls/);
  matchSource(app, /symmetryEvidence.sync\(\)/);
  const source = readFileSync(new URL('../ui/symmetry-evidence-controls.mjs', import.meta.url), 'utf8');
  doesNotMatchSource(source, /commitOperation|markDirty|MutationObserver/);
  assert.ok(
    JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts['test:features'].includes(
      'tests/symmetry-evidence-controls.test.mjs'
    )
  );
});

test(
  'mounted app reads native evidence, matches source hashes and links corpus receipts with Expert off',
  { timeout: 90000 },
  async () => {
    const [{ spawn }, { createInterface }, { createServer }, { chromium }] = await Promise.all([
      import('node:child_process'),
      import('node:readline'),
      import('vite'),
      import('playwright'),
    ]);
    const engine = spawn('python', ['-B', '-u', 'engine/server.py'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      }),
      pending = new Map();
    let next = 0;
    const lines = createInterface({ input: engine.stdout });
    lines.on('line', (line) => {
      const result = JSON.parse(line),
        job = pending.get(result.id);
      if (!job) return;
      pending.delete(result.id);
      result.ok ? job.resolve(result.result) : job.reject(Error(result.error));
    });
    engine.on('error', (error) => {
      for (const job of pending.values()) job.reject(error);
      pending.clear();
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
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }),
        errors = [];
      page.setDefaultTimeout(20000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.exposeFunction('nativeEngine', compute);
      await page.addInitScript(() => {
        localStorage.setItem('polytope-welcome-v1', 'dismissed');
        window.requests = [];
        window.polytope = {
          engine: (r) => {
            window.requests.push(structuredClone(r));
            return window.nativeEngine(r);
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
        };
      });
      await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
      await page.waitForFunction(
        () =>
          document.getElementById('model-name')?.textContent === 'Tesseract' && document.getElementById('cancel').hidden
      );
      assert.equal(
        await page.evaluate(() => window.requests.filter((r) => r.op === 'symmetry-qualification').length),
        0
      );
      await page.locator('#library-symmetry-evidence > summary').click();
      await page.waitForFunction(() =>
        document
          .getElementById('symmetry-evidence-summary')
          .textContent.includes('65 passed; 2 resource-limited; 0 failed')
      );
      assert.equal(await page.locator('body').evaluate((n) => n.classList.contains('expert-mode')), false);
      assert.equal(await page.locator('#symmetry-evidence-match').evaluate((n) => !!n.closest('[data-expert]')), false);
      await page.selectOption('#symmetry-evidence-scenario', 'r7-symmetry-tesseract');
      await page.locator('#symmetry-evidence-match').click();
      await page.waitForFunction(() =>
        document.getElementById('symmetry-evidence-status').textContent.startsWith('Current coordinates')
      );
      await page.selectOption('#symmetry-evidence-scenario', 'r7-symmetry-tesseract-extra-open-cell');
      await page.locator('#symmetry-evidence-match').click();
      await page.waitForFunction(() =>
        document.getElementById('symmetry-evidence-status').textContent.includes('does not match a passed receipt')
      );
      await page.selectOption('#symmetry-evidence-scenario', 'r7-symmetry-cube');
      await page.locator('#symmetry-evidence-open').click();
      await page.waitForFunction(
        () => document.getElementById('model-name').textContent === 'Cube' && document.getElementById('cancel').hidden
      );
      await page.locator('#symmetry-evidence-match').click();
      await page.waitForFunction(() =>
        document.getElementById('symmetry-evidence-status').textContent.startsWith('Current coordinates')
      );
      await page.locator('#library-corpus > summary').click();
      await page.waitForSelector('#corpus-symmetry-evidence');
      await page.locator('#corpus-symmetry-evidence').click();
      await page.waitForSelector('#corpus-symmetry-receipt');
      assert.match(await page.locator('#corpus-symmetry-receipt').textContent(), /coordinateSha256/);
      assert.match(await page.locator('#corpus-status').textContent(), /identity qualification remains pending/);
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await server.close();
      lines.close();
      engine.kill();
    }
  }
);
