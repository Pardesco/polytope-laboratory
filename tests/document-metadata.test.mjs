import test from 'node:test';
import assert from 'node:assert/strict';
import { metadataFromFields } from '../ui/document-metadata.mjs';
import { ProjectMetadataControls } from '../ui/project-metadata-controls.mjs';
test('metadata editor produces a bounded JSON round trip while preserving unrecognized imported fields', () => {
  const prior = { future: { citation: 7 } },
    fields = {
      title: '24-cell',
      author: 'Ada',
      description: 'Study\nNotes',
      reference: 'https://example.test/#source\nA book',
      tags: 'regular, 4D, regular',
      license: 'CC BY 4.0',
      source: 'Local archive',
    };
  const result = metadataFromFields(prior, fields, '{"page":12}');
  assert.deepEqual(JSON.parse(JSON.stringify({ view: { documentMetadata: result } })).view.documentMetadata, result);
  assert.deepEqual(result.tags, ['regular', '4D']);
  assert.deepEqual(result.future, { citation: 7 });
  assert.deepEqual(result.custom, { page: 12 });
  assert.deepEqual(prior, { future: { citation: 7 } });
});
test('metadata editor refuses invalid objects, nonfinite numbers, oversized fields and tags', () => {
  for (const input of ['[]', 'null', '{', '{"number":1e309}'])
    assert.throws(() => metadataFromFields({}, {}, input), /JSON|object/);
  assert.throws(() => metadataFromFields({}, { title: 'a'.repeat(513) }), /text limit/);
  assert.throws(() => metadataFromFields({}, { tags: 'a'.repeat(129) }), /128 tags/);
  assert.throws(() => metadataFromFields({}, {}, JSON.stringify({ large: 'a'.repeat(65536) })), /64 KiB/);
});
test('saving metadata marks the existing state dirty without changing geometry or adding a history step', () => {
  const state = { model: { name: 'Cube' }, view: {} },
    model = state.model,
    calls = [],
    nodes = Object.fromEntries(
      ['title', 'author', 'description', 'reference', 'license', 'source', 'tags', 'custom', 'status'].map((key) => [
        key,
        { value: key === 'custom' ? '{}' : key === 'title' ? 'Study' : '' },
      ])
    );
  const controls = Object.create(ProjectMetadataControls.prototype);
  Object.assign(controls, {
    owner: state,
    node: (key) => nodes[key],
    sync() {},
    context: {
      getState: () => state,
      isExporting: () => false,
      markDirty: () => calls.push('dirty'),
      refresh: () => calls.push('refresh'),
    },
  });
  controls.save();
  assert.equal(state.model, model);
  assert.equal(state.view.documentMetadata.title, 'Study');
  assert.deepEqual(calls, ['dirty', 'refresh']);
  controls.save();
  assert.equal(calls.length, 2);
  controls.context.isExporting = () => true;
  assert.throws(() => controls.save(), /export/);
  controls.context.isExporting = () => false;
  controls.owner = {};
  assert.throws(() => controls.save(), /document changed/);
});
