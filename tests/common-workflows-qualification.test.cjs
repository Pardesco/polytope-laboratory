const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
const { execFileSync } = require('node:child_process');
const E = require('../scripts/common-workflows-evidence.cjs');
const { CASES, LEGACY_IDS, FROZEN } = require('../scripts/common-workflows-qualification.cjs');
const model = {
  dimension: 3,
  embeddingDimension: 3,
  interpretation: 'convex-polytope',
  vertices: [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  edges: [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3],
  ],
  faces: [
    [0, 2, 1],
    [0, 1, 3],
    [0, 3, 2],
    [1, 2, 3],
  ],
  cells: [],
};
const pin = [
  '--candidate',
  path.resolve('candidate', 'Polytope Laboratory.exe'),
  '--exe-sha256',
  'a'.repeat(64),
  '--archive-sha256',
  'b'.repeat(64),
];

test('qualification requires explicit unpacked candidate pins and valid matrix arguments', () => {
  assert.throws(() => E.parseArgs([]), /candidate/);
  assert.throws(() => E.parseArgs(pin.slice(0, -2)), /archive-sha256/);
  assert.throws(() => E.parseArgs([...pin, '--scales', '1,1']), /distinct/);
  assert.throws(() => E.parseArgs([...pin, '--scales', '1,3']), /distinct/);
  assert.throws(() => E.parseArgs([...pin, '--mode', 'unfocused-visible']), /Mode/);
  assert.throws(() => E.parseArgs([...pin, '--candidate']), /Missing value/);
  assert.throws(() => E.parseArgs([...pin, '--force']), /Unknown/);
  assert.deepEqual(
    E.runs(E.parseArgs([...pin, '--mode', 'both'])).map((r) => [r.mode, r.scale]),
    [
      ['visible', 1],
      ['visible', 1.5],
      ['visible', 2],
      ['hidden', 1],
      ['hidden', 1.5],
      ['hidden', 2],
    ]
  );
  assert.deepEqual(
    E.runs(E.parseArgs(pin)).map((r) => r.mode),
    ['hidden', 'hidden', 'hidden']
  );
});

test('plan is executable without candidate or Electron and covers the requested feature matrix', async () => {
  const plan = JSON.parse(
    execFileSync(process.execPath, ['scripts/common-workflows-qualification.cjs', '--plan', '--mode', 'both'], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      windowsHide: true,
    })
  );
  assert.equal(plan.runs.length, 6);
  assert.deepEqual(plan.cases, CASES);
  assert.equal(new Set(CASES.map((c) => c.id)).size, CASES.length);
  const { EXPORT_GOALS } = await import('../ui/export-goals.mjs');
  for (const goal of EXPORT_GOALS)
    assert.ok(
      CASES.some((c) => c.key === 'export-' + goal.id),
      goal.title
    );
  for (const key of [
    'dual',
    'truncate',
    'live-slider',
    'measure',
    'surface-section',
    'filled-section',
    'density-section',
    'net',
    'goursat',
    'waterman4',
    'via-snub',
    'faceting',
    'stellation-planes',
    'memory-add',
    'memory-blend',
    'dxf-boundary',
    'png-environment',
    'legacy-ids',
    'dialogs',
  ])
    assert.ok(
      CASES.some((c) => c.key === key),
      key
    );
  assert.equal(new Set(LEGACY_IDS).size, LEGACY_IDS.length);
  assert.ok(FROZEN.includes('ui') && FROZEN.includes('desktop') && FROZEN.includes('engine'));
});

test('frozen manifests detect edits, additions and deletions and output receipts bind actual bytes', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'common-qualification-'));
  try {
    await fs.mkdir(path.join(folder, 'ui'));
    const file = path.join(folder, 'ui', 'app.js');
    await fs.writeFile(file, 'first');
    const before = await E.manifest(folder, ['ui']);
    E.assertFrozen(before, await E.manifest(folder, ['ui']));
    const proof = await E.artifact(file);
    assert.equal(proof.bytes, 5);
    assert.equal(proof.sha256, E.hash('first'));
    await fs.writeFile(file, 'other');
    assert.throws(() => E.assertFrozen(before, { 'ui/app.js': E.hash('other') }), /changed/);
    assert.throws(() => E.assertFrozen(before, {}), /changed/);
    assert.throws(() => E.assertFrozen(before, { ...before, 'ui/extra.js': E.hash('new') }), /changed/);
    await fs.writeFile(file, '');
    await assert.rejects(E.artifact(file), /Empty/);
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});

test('history comparison retains literal order, dimension and interpretation but permits a replay ID', () => {
  E.sameGeometry({ ...model, id: 'replayed' }, model);
  for (const changed of [
    { ...model, dimension: 4 },
    { ...model, interpretation: 'generalized-complex' },
    { ...model, faces: model.faces.map((f) => [...f].reverse()) },
    { ...model, vertices: model.vertices.map((p) => p.map((x) => x * 2)) },
  ])
    assert.throws(() => E.sameGeometry(changed, model));
  assert.equal(E.active({ active: 0, documents: [{ cursor: 1, states: [{}, { model }] }] }).model, model);
});

test('OFF and JSON output checks reject changed coordinates and ordered incidence', () => {
  const off = Buffer.from('OFF\n4 4 6\n0 0 0\n1 0 0\n0 1 0\n0 0 1\n3 0 2 1\n3 0 1 3\n3 0 3 2\n3 1 2 3\n');
  assert.equal(E.inspectOutput('off', off, model).counts[0], 4);
  assert.throws(() => E.inspectOutput('off', Buffer.from(off.toString().replace('1 0 0', '2 0 0')), model));
  assert.throws(() => E.inspectOutput('off', Buffer.from(off.toString().replace('3 0 2 1', '3 0 1 2')), model));
  assert.equal(E.inspectOutput('json', Buffer.from(JSON.stringify(model)), model).faces, 4);
  assert.throws(() => E.inspectOutput('json', Buffer.from(JSON.stringify({ ...model, faces: [] })), model));
});

test('binary export checks reject malformed lengths and empty geometry', () => {
  const stl = Buffer.alloc(134);
  stl.writeUInt32LE(1, 80);
  assert.equal(E.inspectOutput('stl', stl).triangles, 1);
  assert.throws(() => E.inspectOutput('stl', stl.subarray(0, 133)));
  assert.throws(() => E.inspectOutput('stl', Buffer.alloc(84)));
  const json = Buffer.from(JSON.stringify({ meshes: [{}], accessors: [{ count: 3 }] }).padEnd(64, ' '));
  const glb = Buffer.alloc(20 + json.length);
  glb.write('glTF');
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(json.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  json.copy(glb, 20);
  assert.equal(E.inspectOutput('glb', glb).meshes, 1);
  assert.throws(() => E.inspectOutput('glb', glb.subarray(0, glb.length - 1)));
  const fixture = require('./fixtures/material-environment.json');
  assert.deepEqual(E.inspectOutput('png', Buffer.from(fixture.pngBase64, 'base64')), {
    format: 'png',
    width: 32,
    height: 16,
  });
  assert.throws(() => E.inspectOutput('png', Buffer.alloc(24)));
  assert.throws(() => E.inspectOutput('unsupported', Buffer.from('data')));
});

test('SVG, DXF and WebM checks require their advertised structure', () => {
  assert.equal(E.inspectOutput('svg', Buffer.from('<svg><path d="M0 0L1 1"/></svg>')).format, 'svg');
  assert.throws(() => E.inspectOutput('svg', Buffer.from('<svg></svg>')));
  const dxf = Buffer.from('0\nSECTION\n' + model.faces.map(() => '0\n3DFACE\n').join('') + '0\nENDSEC\n0\nEOF\n');
  assert.equal(E.inspectOutput('dxf', dxf, model).faces, 4);
  assert.throws(() => E.inspectOutput('dxf', dxf, { faces: [] }));
  const webm = Buffer.alloc(1001);
  webm.writeUInt32BE(0x1a45dfa3);
  assert.match(E.inspectOutput('webm', webm).container, /R7-MEDIA/);
  assert.throws(() => E.inspectOutput('webm', Buffer.alloc(1001)));
});

test(
  'strict reveal opens ordinary ancestors, preserves IDs and refuses Expert controls without enabling them',
  { timeout: 30000 },
  async () => {
    const { chromium } = require('playwright'),
      browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(
        '<body><details id="outer"><summary>Outer</summary><details id="inner" data-construct-tool><summary>Inner</summary><button id="common">Common</button></details></details><details data-expert><summary>Expert</summary><button id="rare">Rare</button></details><button id="hidden" hidden>Hidden</button></body>'
      );
      await page.evaluate(() => {
        window.commonQualification = { expertViolations: [] };
        window.openConstructTool = () => (window.constructOpened = true);
        window.original = document.getElementById('common');
        window.reveals = 0;
        document.addEventListener('app-chrome-reveal', () => window.reveals++);
      });
      await E.strictReveal(page, '#common');
      assert.deepEqual(
        await page.evaluate(() => ({
          outer: document.getElementById('outer').open,
          inner: document.getElementById('inner').open,
          same: window.original === document.getElementById('common'),
          opened: window.constructOpened,
        })),
        { outer: true, inner: true, same: true, opened: true }
      );
      const count = await page.evaluate(() => window.reveals);
      await assert.rejects(E.strictReveal(page, '#rare'), /Expert control/);
      assert.equal(await page.evaluate(() => window.reveals), count);
      await E.expertOff(page);
      await assert.rejects(E.strictReveal(page, '#hidden'), /remains hidden/);
      await assert.rejects(E.strictReveal(page, '#missing'), /unique target/);
      await page.evaluate(() => document.body.append(document.getElementById('common').cloneNode(true)));
      await assert.rejects(E.strictReveal(page, '#common'), /unique target/);
      await page.evaluate(() => document.querySelectorAll('#common')[1].remove());
      await page.evaluate(() => document.body.classList.add('expert-mode'));
      await assert.rejects(E.strictReveal(page, '#common'), /stay OFF/);
      await page.evaluate(() => {
        document.body.classList.remove('expert-mode');
        window.commonQualification.expertViolations.push({ kind: 'transient' });
      });
      await assert.rejects(E.expertOff(page), /transiently/);
    } finally {
      await browser.close();
    }
  }
);
