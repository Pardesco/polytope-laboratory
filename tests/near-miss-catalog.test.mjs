import { readAppSource } from './helpers/app-source.mjs';
import { sourceRange, indexOfSource, includesSource } from './helpers/source-match.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileCatalogQuery } from '../ui/catalog-query.mjs';
import { LibraryPropertyControls } from '../ui/library-navigation.mjs';
import { nearMissCatalogText, appendNearMissReport } from '../ui/near-miss-report.mjs';

const manifest = JSON.parse(
  await readFile(new URL('../engine/catalog_data/near_miss/manifest.json', import.meta.url), 'utf8')
);
const records = manifest.entries.map((e) => e.record);
const modelFor = (record) => ({
  fingerprint: 'source',
  metadata: {
    ...structuredClone(record),
    nearMissRealization: { ...structuredClone(record.nearMissRealization), resultFingerprint: 'source' },
  },
});

class Node {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.value = '';
    this.attributes = {};
    this.dataset = {};
  }
  append(...children) {
    this.children.push(...children);
    if (this.tagName === 'select' && !this.value) this.value = children[0]?.value ?? '';
  }
  replaceChildren(...children) {
    this.children = [];
    this.value = '';
    this.append(...children);
  }
  after(node) {
    this.afterNode = node;
  }
  setAttribute(key, value) {
    this.attributes[key] = value;
  }
}
const fixture = () => ({
  nodes: { search: new Node('input') },
  createElement: (tag) => new Node(tag),
  getElementById(id) {
    return this.nodes[id];
  },
});

test('all ten real manifest entries resolve by near miss aliases and boolean property filters', () => {
  const entries = [...records, { key: 'unknown', family: 'Johnson' }, { key: 'ordinary', nearMiss: false }];
  for (const query of ['near miss', '"near miss"', 'nearmiss:true', 'near-miss:yes'])
    assert.equal(entries.filter(compileCatalogQuery(query)).length, 10, query);
  assert.deepEqual(
    entries.filter(compileCatalogQuery('nearmiss:false')).map((e) => e.key),
    ['ordinary']
  );
  assert.deepEqual(
    entries.filter(compileCatalogQuery('nearmiss:unknown')).map((e) => e.key),
    ['unknown']
  );
  assert.equal(entries.filter(compileCatalogQuery('nearmiss:true symmetry:Ih v>=80')).length, 4);
});

test('mounted library Near-miss Johnson solid filter uses documented flags', () => {
  const document = fixture(),
    after = new Node('select');
  let changed = 0;
  const controls = new LibraryPropertyControls({ document, after, change: () => changed++ });
  const select = controls.selects.get('nearmiss');
  assert.equal(select.id, 'library-nearmiss');
  select.value = 'true';
  select.onchange();
  assert.equal(changed, 1);
  assert.equal(controls.matches(records[0]), true);
  assert.equal(controls.matches({ family: 'Near-miss Johnson solids' }), false);
  assert.match(document.nodes.search.title, /nearmiss:true/);
});

test('every catalog entry renders honest numeric deviations including the large sources', () => {
  for (const record of records) {
    const text = nearMissCatalogText(modelFor(record));
    assert.match(text, /Approximate near miss: edges within [\d.]+% of the global mean/);
    assert.ok(text.includes(record.symmetryGroup));
    assert.ok(text.includes(record.faceConfiguration));
    assert.match(text, /Faces are not all regular/);
    assert.match(text, /no exact or globally optimal realization/);
  }
  assert.ok(records.some((r) => r.counts[0] === 180));
});

test('source-bound catalog report hides stale, absent, and invalid residual metadata', () => {
  const source = modelFor(records[0]);
  source.fingerprint = 'changed';
  assert.equal(nearMissCatalogText(source), '');
  assert.equal(nearMissCatalogText(null), '');
  assert.equal(nearMissCatalogText({ metadata: {} }), '');
  for (const value of [NaN, Infinity, -1]) {
    const m = modelFor(records[0]);
    m.metadata.nearMissRealization.metrics.maximumPlanarity = value;
    assert.equal(nearMissCatalogText(m), '');
  }
});

test('Analysis report mounts summary and collapsed references with independent published comparison', () => {
  const document = fixture(),
    parent = new Node('div');
  appendNearMissReport(document, parent, modelFor(records.find((r) => r.key === 'near-miss-wedge-4-5')));
  assert.equal(parent.children[0].id, 'near-miss-catalog');
  const details = parent.children[1];
  assert.equal(details.id, 'near-miss-catalog-evidence');
  assert.notEqual(details.open, true);
  assert.match(details.children.map((n) => n.textContent).join(' '), /Independent reference: 0.1919 and 33.635°/);
  assert.match(details.children.map((n) => n.textContent).join(' '), /subsequently allows every face to vary/);
  const absent = new Node('div');
  appendNearMissReport(document, absent, null);
  assert.equal(absent.children.length, 0);
});

test('app mounts near-miss evidence inside its guarded current-source analysis response', async () => {
  const app = readAppSource();
  const analysis = sourceRange(app, 'refreshAnalysis', 'refreshDerived');
  const guard = indexOfSource(analysis, 'if(!analysisCurrent)return'),
    append = indexOfSource(analysis, "appendNearMissReport(document,$('analysis'),m)");
  assert.ok(guard >= 0 && append > guard);
  assert.ok(includesSource(analysis, "appendNearMissReport(document,$('analysis'),m)"));
});
