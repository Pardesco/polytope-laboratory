import { sourceNodes } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fakeRenderer } from './helpers/fake-renderer.mjs';
import { applyViewerAppearance } from '../ui/viewer-appearance.mjs';

test('shared fake renderer implements direct Viewer and appearance renderer methods', async () => {
  const sources = await Promise.all(
    ['viewer.js', 'viewer-appearance.mjs'].map((name) => readFile(new URL('../ui/' + name, import.meta.url), 'utf8'))
  );
  const methods = new Set(
    sources.flatMap((source) =>
      sourceNodes(source, (n) => {
        const member = n.type === 'CallExpression' && n.callee,
          owner = member?.object;
        return (
          member?.type === 'MemberExpression' &&
          !member.computed &&
          owner?.type === 'MemberExpression' &&
          !owner.computed &&
          owner.property.name === 'renderer' &&
          (owner.object.type === 'ThisExpression' || owner.object.name === 'viewer')
        );
      }).map((n) => n.callee.property.name)
    )
  );
  assert.ok(methods.size > 0, 'Extraction must find the Viewer renderer calls');
  const renderer = fakeRenderer();
  for (const method of methods)
    assert.equal(typeof renderer[method], 'function', `Shared fake renderer lacks ${method}()`);
});

test('appearance updates through the shared renderer preserve transparent tour alpha', () => {
  const renderer = fakeRenderer({ clearAlpha: 0 });
  applyViewerAppearance({ renderer }, {});
  assert.equal(renderer.getClearAlpha(), 0);
  renderer.setClearColor(0, 1);
  applyViewerAppearance({ renderer }, {});
  assert.equal(renderer.getClearAlpha(), 1);
});
