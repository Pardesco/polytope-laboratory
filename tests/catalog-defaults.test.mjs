import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogBrowseEntries, isDiscoveryCandidate } from '../ui/catalog-defaults.mjs';
import { compileCatalogQuery } from '../ui/catalog-query.mjs';
import { collectionSummaries } from '../ui/library-collections.mjs';
import { CatalogLoading } from '../ui/catalog-loading.mjs';

const entries = JSON.parse(
  readFileSync(new URL('../engine/catalog_data/miratope_expanded/manifest.json', import.meta.url), 'utf8')
).entries;
const candidates = entries.filter(isDiscoveryCandidate),
  candidate = candidates.find((row) => row.counts[0] === 5);
const published = {
  key: 'tesseract',
  name: 'Tesseract',
  dimension: 4,
  family: 'Regular convex',
  counts: [16, 32, 24, 8],
};

test('default browse hides all 908 discovery candidates while retaining other unverified source labels', () => {
  assert.equal(candidates.length, 908);
  const visible = catalogBrowseEntries([published, ...entries]);
  assert.equal(visible.length, entries.length + 1 - 908);
  assert.ok(visible.includes(published));
  assert.equal(visible.some(isDiscoveryCandidate), false);
  assert.ok(
    visible.some((row) => row.classificationVerified === false && row.family === 'convex uniform (Miratope source)')
  );
});

test('explicit discovery filter restores the original records, order, keys and IDs without mutation', () => {
  const before = JSON.stringify(entries),
    visible = catalogBrowseEntries(entries, { includeDiscoveryCandidates: true });
  assert.deepEqual(visible, entries);
  assert.equal(visible[0], entries[0]);
  assert.ok(visible.includes(candidate));
  assert.equal(JSON.stringify(entries), before);
});

test('default search excludes candidates by name, key, alias and dimension; the explicit filter includes them', () => {
  for (const query of [candidate.name, candidate.key, '"Unclassified discovery candidate"', 'dim:4 v:5']) {
    const matches = compileCatalogQuery(query);
    assert.equal(catalogBrowseEntries(entries).filter(matches).some(isDiscoveryCandidate), false, query);
    assert.ok(
      catalogBrowseEntries(entries, { includeDiscoveryCandidates: true }).filter(matches).includes(candidate),
      query
    );
  }
  assert.deepEqual(
    catalogBrowseEntries([published, candidate])
      .filter(compileCatalogQuery('tesseract'))
      .map((row) => row.key),
    ['tesseract']
  );
});

test('default collection counts and representative picks exclude candidates, including Show all inputs', () => {
  const all = [published, ...entries],
    normal = collectionSummaries(all),
    opted = collectionSummaries(all, { includeDiscoveryCandidates: true });
  assert.equal(
    normal.some((row) => row.id === 'discovery4'),
    false
  );
  assert.equal(
    normal.some((row) => isDiscoveryCandidate(row.entry)),
    false
  );
  for (const collection of normal)
    assert.equal(collection.count, catalogBrowseEntries(all).filter(collection.matches).length);
  const discovery = opted.find((row) => row.id === 'discovery4');
  assert.equal(discovery.count, 908);
  assert.match(discovery.label, /unverified/);
  assert.match(discovery.hint, /Computer-found.*not checked against published lists/);
});

test('classification uses supplied discovery labels rather than guessed names or all unverified entries', () => {
  assert.equal(isDiscoveryCandidate({ name: 'discovery candidate', dimension: 4 }), false);
  assert.equal(
    isDiscoveryCandidate({ classificationVerified: false, family: 'convex uniform (Miratope source)' }),
    false
  );
  assert.equal(isDiscoveryCandidate({ sourceClassification: 'Unclassified discovery candidate' }), true);
  assert.equal(isDiscoveryCandidate(null), false);
});

test('curated featured picks contain no discovery keys and random selection from default browse cannot pick one', () => {
  const gallery = JSON.parse(readFileSync(new URL('../ui/welcome-gallery.json', import.meta.url), 'utf8'));
  const hiddenKeys = new Set(candidates.map((row) => row.key));
  assert.ok(gallery.length);
  assert.equal(
    gallery.some((row) => hiddenKeys.has(row.key)),
    false
  );
  assert.ok(catalogBrowseEntries([published, ...entries]).every((row) => !hiddenKeys.has(row.key)));
});

test('direct catalog opens bypass browse visibility and retain the candidate reference', async () => {
  const project = { documents: [] },
    model = { metadata: { key: candidate.key, family: candidate.family, classificationVerified: false } },
    reads = [],
    published = [];
  const loader = new CatalogLoading({
    getProject: () => project,
    getState: () => null,
    isExporting: () => false,
    read: async (entry) => {
      reads.push(entry.key);
      return model;
    },
    publish: (value) => published.push(value),
  });
  assert.deepEqual(catalogBrowseEntries([candidate]), []);
  assert.equal(await loader.open(candidate), model);
  assert.deepEqual(reads, [candidate.key]);
  assert.deepEqual(published, [model]);
  assert.ok(isDiscoveryCandidate(published[0].metadata));
});
