import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createAppContext } from '../ui/app/context.mjs';
import { sourceNodes, sourceFunction } from './helpers/source-match.mjs';
import { rendererFiles, desktopFiles } from './helpers/app-source.mjs';

test('renderer factories compose before viewers and panels without reading uninitialized context', async () => {
  const context = new Proxy({}, { get: (_target, name) => assert.fail('Premature context read: ' + String(name)) });
  for (const [file, name] of [
    ['startup', 'createStartup'],
    ['history-wiring', 'createHistoryWiring'],
    ['panels', 'createPanels'],
    ['catalog-view', 'createCatalogView'],
    ['export', 'createExport'],
    ['workspace-render', 'createWorkspaceRender'],
  ]) {
    const source = await readFile(new URL('../ui/app/' + file + '.mjs', import.meta.url), 'utf8');
    const factory = new Function('return (' + sourceFunction(source, name) + ');')();
    assert.ok(Object.keys(factory(context)).length);
  }
});

test('shared context preserves live project and dirty ownership across an asynchronous boundary', async () => {
  let project = { id: 'first' },
    dirty = false;
  const context = createAppContext(
    { project: () => project, dirty: () => dirty },
    { dirty: (value) => (dirty = value) }
  );
  const pending = Promise.resolve().then(() => context.project);
  project = { id: 'replacement' };
  assert.equal(await pending, project);
  context.dirty = true;
  assert.equal(dirty, true);
  assert.throws(() => {
    context.project = {};
  }, TypeError);
});

test('renderer dependency order precedes acyclic factory imports', async () => {
  const entry = await readFile(new URL('../ui/app.js', import.meta.url), 'utf8');
  let factories = false;
  for (const node of sourceNodes(entry, (node) => node.type === 'ImportDeclaration')) {
    if (node.source.value.startsWith('./app/')) factories = true;
    else assert.equal(factories, false, 'Original dependencies must precede factory imports.');
  }
  for (const file of rendererFiles.filter((file) => file !== 'ui/app.js')) {
    const source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
    for (const node of sourceNodes(source, (node) => node.type === 'ImportDeclaration')) {
      const resolved = new URL(node.source.value, new URL('../' + file, import.meta.url));
      assert.notEqual(resolved.href, new URL('../ui/app.js', import.meta.url).href);
      assert.ok(!rendererFiles.some((other) => resolved.href === new URL('../' + other, import.meta.url).href));
    }
  }
});

test('source archive roots and desktop packaging include the extracted modules', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const matcher = createRequire(import.meta.url)('minimatch');
  const matches = matcher.minimatch ?? matcher;
  for (const file of desktopFiles)
    assert.ok(
      pkg.build.files.some((pattern) => matches(file, pattern)),
      file
    );
  const source = await readFile(new URL('../scripts/package-source.py', import.meta.url), 'utf8');
  assert.match(source, /for directory in \[[^\]]*'ui'[^\]]*'desktop'/);
  assert.ok(source.includes(".rglob('*')"));
  for (const file of [...rendererFiles, ...desktopFiles])
    assert.ok((await readFile(new URL('../' + file, import.meta.url))).length, file);
});
