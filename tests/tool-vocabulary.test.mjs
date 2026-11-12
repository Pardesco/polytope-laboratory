import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSTRUCT_TOOLS,
  constructToolDescription,
  constructToolGroup,
  matchesConstructTool,
} from '../ui/construct-gallery.mjs';
import { TOOL_ICONS, toolIconFamily } from '../ui/tool-icons.mjs';
import { buildCommandIndex, rankCommands } from '../ui/command-index.mjs';
import { netTypeGroups, otherNetReason } from '../ui/nets-flow.mjs';

test('mathematical tool names lead, and dual descriptions follow source dimension', () => {
  for (const [id, name] of [
    ['gallery-dual', 'Dual'],
    ['gallery-truncate', 'Truncate / Rectify'],
    ['incidence-truncation-settings', 'Star truncation'],
    ['stellation-plane-settings', 'Stellate'],
    ['face-surgery-settings', 'Augment / Excavate'],
  ])
    assert.equal(CONSTRUCT_TOOLS.find((t) => t.id === id).name, name);
  const dual = CONSTRUCT_TOOLS.find((t) => t.id === 'gallery-dual');
  assert.match(constructToolDescription(dual, { dimension: 4 }), /cells and vertices/);
  assert.match(constructToolDescription(dual, { dimension: 3 }), /faces and corners/);
  assert.match(constructToolDescription(dual, { dimension: 2 }), /edges and corners/);
  for (const query of ['Schläfli', 'schlafli', 'snub', 'symmetry'])
    assert.ok(
      matchesConstructTool(
        CONSTRUCT_TOOLS.find((t) => t.id === 'shape-builder'),
        query
      ),
      query
    );
});

test('construct relevance distinguishes dimension from live action restrictions', () => {
  const conway = CONSTRUCT_TOOLS.find((t) => t.id === 'face-conway-settings');
  assert.deepEqual(constructToolGroup(conway, { dimension: 4 }), { key: 'dimension-3', label: 'Needs a 3D model' });
  assert.equal(constructToolGroup(conway, { dimension: 3 }, { disabled: false }), null);
  assert.equal(
    constructToolGroup(
      conway,
      { dimension: 3 },
      { disabled: true, dataset: { disabledReason: 'Finish export first.' } }
    ).label,
    'Finish export first'
  );
  assert.equal(constructToolGroup(conway, null).label, 'Open a model first');
});

test('tool families have fourteen distinct 24px line drawings', () => {
  assert.equal(Object.keys(TOOL_ICONS).length, 14);
  assert.equal(new Set(Object.values(TOOL_ICONS)).size, 14);
  const icons = Object.fromEntries(CONSTRUCT_TOOLS.map((t) => [t.id, toolIconFamily(t)]));
  for (const [id, family] of [
    ['gallery-dual', 'dual'],
    ['gallery-truncate', 'truncate'],
    ['stellation-plane-settings', 'stellate'],
    ['automatic-faceting-settings', 'facet'],
    ['augmentation-settings', 'augment'],
    ['wythoff-model-settings', 'coxeter'],
  ])
    assert.equal(icons[id], family);
  for (const family of Object.values(icons)) assert.ok(TOOL_ICONS[family]);
});

test('palette indexes both vocabularies for original buttons and gallery entry points', () => {
  const commands = [
    ['make-dual', 'Dual'],
    ['truncate', 'Truncate / Rectify'],
    ['stellation-evaluate', 'Evaluate planes'],
    ['faceting-diagram-build', 'Build diagram'],
    ['net-rebuild', 'Generate face net'],
    ['cell-net-build', 'Generate cell net'],
    ['open-coxeter-builder', 'Build from symmetry'],
    ['symmetry', 'Find symmetry'],
  ];
  const index = buildCommandIndex({
    controls: commands.map(([id, label]) => ({ id: 'control:' + id, label, path: ['Construct'] })),
  });
  for (const [query, id] of [
    ['dual', 'make-dual'],
    ['polar', 'make-dual'],
    ['swap', 'make-dual'],
    ['swap faces and corners', 'make-dual'],
    ['truncate', 'truncate'],
    ['cut corners', 'truncate'],
    ['rectify', 'truncate'],
    ['stellate', 'stellation-evaluate'],
    ['facet', 'faceting-diagram-build'],
    ['net', 'net-rebuild'],
    ['unfold', 'net-rebuild'],
    ['coxeter', 'open-coxeter-builder'],
    ['wythoff', 'open-coxeter-builder'],
    ['schlafli', 'open-coxeter-builder'],
    ['schläfli', 'open-coxeter-builder'],
    ['snub', 'open-coxeter-builder'],
    ['symmetry', 'symmetry'],
  ]) {
    const results = rankCommands(index, query);
    assert.ok(
      results.some((t) => t.id === 'control:' + id),
      query
    );
    assert.ok(
      results.slice(0, 2).some((t) => t.id === 'control:' + id),
      query + ' ranks near the top'
    );
  }
  const card = buildCommandIndex({ controls: [{ id: 'control:construct-card-gallery-dual', label: 'Dual' }] });
  assert.equal(rankCommands(card, 'swap corners')[0].id, card[0].id);
  const catalog = buildCommandIndex({ library: [{ id: 'library:snub-cube', label: 'Open: Snub cube' }] });
  assert.equal(rankCommands(catalog, 'wythoff').length, 0);
});

test('net relevance leads with usable types for 4D, 3D and generalized sources', () => {
  assert.deepEqual(netTypeGroups({ dimension: 4 }, { faces: 'Needs 3D', cells: '', surface: 'Needs 3D' }), {
    available: ['cells'],
    unavailable: ['faces', 'surface'],
  });
  assert.deepEqual(netTypeGroups({ dimension: 3 }, { faces: '', cells: 'Needs 4D', surface: 'Convex' }), {
    available: ['faces'],
    unavailable: ['surface', 'cells'],
  });
  assert.deepEqual(
    netTypeGroups({ dimension: 3 }, { faces: 'Crossing faces', cells: 'Needs 4D', surface: '' }).available,
    ['surface']
  );
  assert.deepEqual(netTypeGroups(null).available, []);
  assert.equal(otherNetReason({ dimension: 4 }, ['faces', 'surface'], {}), 'Needs a 3D model');
});
