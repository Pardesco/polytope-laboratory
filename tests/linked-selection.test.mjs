import { readAppSource } from './helpers/app-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { navigationDisplayHarness } from './helpers/navigation-display.mjs';
import { derivedLinks, linkedSelection, sourceSelection } from '../ui/linked-selection.mjs';
const fixtures = JSON.parse(
  execFileSync(
    'python',
    [
      '-c',
      `import json
from engine.generators import regular
from engine.operations import dual,section,vertex_figure
a=regular('cube');b=regular('octahedron');t=regular('tesseract')
print(json.dumps({'duals':[[m,dual(m)] for m in (a,b,t)],'cube':a,'section':section(a),'figure':vertex_figure(a,0),'tesseract':t,'section4':section(t)}))`,
    ],
    { encoding: 'utf8' }
  )
);
for (const [source, target] of fixtures.duals)
  test(`${source.name} polar selections propagate both ways for every dimension`, () => {
    const links = derivedLinks(source, { model: target }, 'dual');
    assert.ok(links);
    for (const [kind, rows] of Object.entries(links))
      for (const [id, row] of rows.entries()) {
        assert.ok(row);
        const back = sourceSelection(links, kind, id);
        assert.deepEqual(back, { kind: row.kind, ids: [row.id] });
        assert.deepEqual(linkedSelection(links, { kind: back.kind, ids: back.ids }), { kind, indices: [id] });
      }
    assert.equal(derivedLinks({ ...source, fingerprint: 'different' }, { model: target }, 'dual'), null);
  });
test('section links source faces to cut edges, source edges to cut vertices and reverses them', () => {
  const links = derivedLinks(fixtures.cube, fixtures.section, 'section');
  for (const [id, row] of links.edge.entries()) {
    assert.equal(row.kind, 'face');
    assert.ok(linkedSelection(links, { kind: 'face', index: row.id }).indices.includes(id));
    assert.equal(sourceSelection(links, 'edge', id).kind, 'face');
  }
  for (const row of links.vertex) assert.equal(row.kind, 'edge');
});
test('4D section faces link to the source cells cut by the plane', () => {
  const links = derivedLinks(fixtures.tesseract, fixtures.section4, 'section');
  assert.ok(links.face.length > 0);
  for (const [id, row] of links.face.entries()) {
    assert.equal(row.kind, 'cell');
    assert.ok(linkedSelection(links, { kind: 'cell', index: row.id }).indices.includes(id));
  }
});
test('vertex figure highlights its incident source edges and its generating vertex', () => {
  const links = derivedLinks(fixtures.cube, fixtures.figure, 'vertex-figure', 0),
    selection = linkedSelection(links, { kind: 'vertex', index: 0 });
  assert.deepEqual(selection, { kind: 'vertex', indices: fixtures.figure.model.vertices.map((_, i) => i) });
  for (const [i, row] of links.vertex.entries()) {
    assert.ok(fixtures.cube.edges[row.id].includes(0));
    assert.deepEqual(linkedSelection(links, { kind: 'edge', index: row.id }), { kind: 'vertex', indices: [i] });
  }
  assert.equal(linkedSelection(links, { kind: 'vertex', index: 7 }), null);
});
test('actual app selection and display handlers synchronize split highlights and pick mode', async () => {
  const app = readAppSource(),
    [source, target] = fixtures.duals[0],
    state = {
      model: source,
      view: {
        derivedMode: 'dual',
        angles: Array(6).fill(0),
        projection: 'orthographic',
        sectionNormal: [0, 0, 1],
        sectionOffset: 0,
        entitySelection: { kind: 'face', index: 0 },
      },
      notes: '',
    },
    h = navigationDisplayHarness(app, state);
  try {
    Object.assign(h.scope, { derivedResult: { model: target }, derivedLinks, linkedSelection, sourceSelection });
    const calls = [];
    h.scope.derived = {
      model: target,
      view: {},
      setDisplay(v) {
        this.view = v;
      },
      selectEntities(kind, indices) {
        calls.push({ kind, indices });
      },
    };
    h.scope.renderWorkspace();
    await h.settle();
    const expected = linkedSelection(derivedLinks(source, { model: target }, 'dual'), state.view.entitySelection);
    assert.deepEqual(calls.at(-1), expected);
    state.view.pickKind = 'face';
    h.scope.displayBase();
    assert.equal(h.scope.derived.view.pickKind, 'face');
    h.get('selection-kind').value = 'vertex';
    h.get('selection-id').value = '2';
    h.scope.selectEntity();
    assert.equal(calls.at(-1).kind, 'face');
    assert.equal(calls.at(-1).indices.length, 1);
  } finally {
    h.close();
  }
});
