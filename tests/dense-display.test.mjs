import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { displayProjector, writeSurfacePositions } from '../ui/dense-display.mjs';
import { projectDisplayPoint } from '../ui/display-frame.mjs';
import { ScreenPickIndex } from '../ui/screen-pick-index.mjs';
import { sourceEntityHits, PICK_LIMIT } from '../ui/entity-picking.mjs';
import { buildSelectionHighlight, updateSelectionLayer } from '../ui/selection-highlight.mjs';
import { referenceHighlight } from './fixtures/dense-highlight-reference.mjs';
import { cpuViewer, seedBenchmarkTypes } from '../scripts/dense-model-benchmark.mjs';

let seed = 20261026;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const source = () =>
  JSON.parse(readFileSync(new URL('./fixtures/element-content-native-cases.json', import.meta.url), 'utf8')).fourD
    .source;

test('prepared projection matches the original literal computation including clipping, frame and dimensions', () => {
  const frame = [
    [0, 0, 0, -1],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [1, 0, 0, 0],
  ];
  for (const matrix of [null, frame])
    for (const mode of ['orthographic', 'perspective', 'stereographic'])
      for (const angles of [[], [0, 0, 0, 0, 0, 0], [13, -39, 26, 87, -14, 21]])
        for (const options of [undefined, { distance: 0.6, near: 0.08 }]) {
          const optimized = displayProjector(matrix, angles, mode, options);
          const points = Array.from({ length: 100 }, () => Array.from({ length: 4 }, () => random() * 2 - 1));
          points.push([0, 0, 0, 0], [0, 0, 0, 1], [1, 0, 0, 0.6], [-0, -0, -0, -0]);
          if (!matrix) points.push([1, 2], [1, 2, 3], [1, 2, 3, 4, 5]);
          for (const p of points) assert.deepEqual(optimized(p), projectDisplayPoint(p, matrix, angles, mode, options));
        }
});

function referenceSurface(target, triangles, o) {
  triangles.forEach((t, i) => {
    if (o.displayGeometry || o.explosionDisplay) {
      target.set(t.points.flat(), i * 9);
      return;
    }
    const projected = t.vertices ? t.vertices.map((v) => o.projected[v]) : t.normalized.map(o.displayPoint);
    const clipped = !o.visibility.faces[t.face] || projected.some((p) => p.clipped);
    target.set(
      clipped
        ? Array(9).fill(0)
        : (o.cellNet && t.vertices
            ? t.vertices.map((v) => o.cellSurfacePoints[v])
            : projected.map((p) => p.point)
          ).flat(),
      i * 9
    );
  });
  return target;
}
test('surface writes equal the original Float32 buffer for source, virtual, clipped, net and exploded triangles', () => {
  const projected = Array.from({ length: 12 }, (_, i) => ({ point: [random(), random(), random()], clipped: i === 3 })),
    points = projected.map((p) => p.point);
  const triangles = [
    { face: 0, vertices: [0, 1, 2] },
    { face: 0, vertices: [0, 3, 2] },
    { face: 1, vertices: [4, 5, 6] },
    {
      face: 0,
      normalized: [
        [1, 2, 3, 0],
        [2, 3, 4, 0.8],
        [3, 4, 5, 0.1],
      ],
    },
  ];
  for (const cellNet of [null, true])
    for (const displayGeometry of [null, true])
      for (const explosionDisplay of [null, true]) {
        const ts = triangles.map((t) => ({ ...t, points: points.slice(0, 3) })),
          o = {
            cellNet,
            displayGeometry,
            explosionDisplay,
            projected,
            cellSurfacePoints: points,
            visibility: { faces: [true, false] },
            displayPoint: (p) => projectDisplayPoint(p, null, [], 'perspective', { distance: 0.6, near: 0.08 }),
          };
        const expected = referenceSurface(new Float32Array(ts.length * 9), ts, o),
          actual = new Float32Array(ts.length * 9);
        writeSurfacePositions(actual, ts, o);
        assert.deepEqual(actual, expected);
      }
});

test('highlight arrays exactly equal the frozen reference for sets, repeated triangles, degeneracy, nonfinite data and limits', () => {
  const surfacePositions = [],
    triangles = [],
    edgePositions = [],
    edgeIds = [];
  for (let i = 0; i < 500; i++) {
    const p = Array.from({ length: 9 }, () => Math.round(random() * 10) / 10);
    if (i % 7 === 0) p.splice(3, 3, ...p.slice(0, 3));
    if (i % 13 === 0) p[2] = NaN;
    if (i % 17 === 0) p[5] = Infinity;
    surfacePositions.push(...p);
    triangles.push({ face: i % 11, ...(i % 3 ? { cell: i % 7 } : {}), visible: i % 19 !== 0 });
    edgePositions.push(...p.slice(0, 6));
    edgeIds.push(i % 13);
  }
  const faceOwners = Array.from({ length: 11 }, () => [1, 2, 3]),
    common = {
      surfacePositions: new Float32Array(surfacePositions),
      triangles,
      edgePositions: new Float32Array(edgePositions),
      edgeIds,
      faceOwners,
      activeCells: [1, 2, 3, 5],
    };
  for (const kind of ['vertex', 'edge', 'face', 'cell'])
    for (const indices of [[], [0], [1, 2, 3, 5, 2, 7]])
      for (const limit of [1, 100000])
        assert.deepEqual(
          buildSelectionHighlight({ ...common, kind, indices, limit }),
          referenceHighlight({ ...common, kind, indices, limit })
        );
  const visible = triangles.map(({ visible, ...t }) => t),
    packedDisplay = {
      faceIds: Uint32Array.from(visible.map((t) => t.face)),
      cellIds: Int32Array.from(visible.map((t) => t.cell ?? -1)),
    };
  for (const kind of ['face', 'cell'])
    assert.deepEqual(
      buildSelectionHighlight({ ...common, triangles: visible, packedDisplay, kind, indices: [1, 2, 3] }),
      referenceHighlight({ ...common, triangles: visible, kind, indices: [1, 2, 3] })
    );
});

test('highlight GPU attributes survive same-size pose updates and resize/dispose only when required', () => {
  const v = { group: new THREE.Group() },
    first = { lines: [0, 0, 0, 1, 0, 0], fill: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
    second = { lines: [2, 3, 4, 5, 6, 7], fill: [2, 3, 4, 5, 6, 7, 8, 9, 10] };
  updateSelectionLayer(v, first);
  const geometry = v.selectionLines.geometry,
    buffer = geometry.getAttribute('instanceStart').data,
    fill = v.selectionFill.geometry.getAttribute('position');
  let disposed = 0;
  geometry.addEventListener('dispose', () => disposed++);
  updateSelectionLayer(v, second);
  assert.equal(v.selectionLines.geometry, geometry);
  assert.equal(geometry.getAttribute('instanceEnd').data, buffer);
  assert.equal(v.selectionFill.geometry.getAttribute('position'), fill);
  assert.deepEqual([...buffer.array], second.lines);
  assert.deepEqual([...fill.array], second.fill);
  assert.equal(disposed, 0);
  assert.ok(buffer.version > 0);
  const fresh = { group: new THREE.Group() };
  updateSelectionLayer(fresh, second);
  assert.deepEqual(geometry.boundingBox, fresh.selectionLines.geometry.boundingBox);
  assert.deepEqual(geometry.boundingSphere, fresh.selectionLines.geometry.boundingSphere);
  updateSelectionLayer(v, { lines: [...second.lines, ...first.lines], fill: [] });
  assert.equal(disposed, 1);
  assert.notEqual(v.selectionLines.geometry, geometry);
  assert.equal(v.selectionLines.geometry.instanceCount, 2);
  assert.equal(v.selectionFill.visible, false);
  updateSelectionLayer(v, { lines: [], fill: [] });
  assert.equal(v.selectionLines.visible, false);
});

test('bounded grid returns the same exact sorted source hits as exhaustive traversal', () => {
  for (const kind of ['vertex', 'edge']) {
    const primitives = Array.from({ length: 2000 }, (_, i) =>
      kind === 'vertex'
        ? { id: i % 400, point: [random() * 2200 - 100, random() * 1300 - 100] }
        : {
            id: i % 400,
            points: [
              [random() * 2200 - 100, random() * 1300 - 100],
              [random() * 2200 - 100, random() * 1300 - 100],
            ],
          }
    );
    if (kind === 'edge')
      primitives.push({
        id: 9999,
        points: [
          [-1e20, 0],
          [1e20, 0],
        ],
      });
    const field = kind === 'vertex' ? 'vertices' : 'segments';
    for (const maxReferences of [0, 262144]) {
      const grid = new ScreenPickIndex(kind, primitives, { maxReferences });
      for (let i = 0; i < 100; i++) {
        const cursor = [random() * 1920, random() * 1080];
        assert.deepEqual(
          sourceEntityHits(kind, { cursor, [field]: grid.query(...cursor) }),
          sourceEntityHits(kind, { cursor, [field]: primitives })
        );
      }
    }
    const exact =
      kind === 'vertex'
        ? { id: 1, point: [64 + 14, 64] }
        : {
            id: 1,
            points: [
              [64 + 8, 32],
              [64 + 8, 96],
            ],
          };
    assert.deepEqual(
      sourceEntityHits(kind, { cursor: [64, 64], [field]: new ScreenPickIndex(kind, [exact]).query(64, 64) }),
      sourceEntityHits(kind, { cursor: [64, 64], [field]: [exact] })
    );
  }
});

test('viewer hover cache invalidates on camera, viewport, buffer, pose, source, kind and visibility changes', () => {
  const v = cpuViewer(source()),
    view = { projection: 'orthographic', vertices: true, pickKind: 'edge' };
  v.setDisplay(view);
  const check = () => {
    const cached = v.pickAt(960, 540, { hover: true });
    v.screenPickCache = null;
    assert.deepEqual(v.pickAt(960, 540, { hover: true }), cached);
  };
  check();
  const first = v.screenPickCache;
  v.pickAt(962, 541, { hover: true });
  assert.equal(v.screenPickCache, first);
  v.camera.position.x += 1;
  v.camera.lookAt(0, 0, 0);
  check();
  assert.notEqual(v.screenPickCache, first);
  v.renderer.domElement.getBoundingClientRect = () => ({ width: 600, height: 600 });
  check();
  v.edgeGeometry.attributes.position.array.fill(0);
  v.edgeGeometry.attributes.position.needsUpdate = true;
  check();
  v.setDisplay({ ...view, angles: [10, 20, 30] });
  check();
  v.setDisplay({ ...view, pickKind: 'vertex' });
  check();
  v.setDisplay({ ...view, edges: false });
  assert.equal(v.pickAt(960, 540, { hover: true }).picked, null);
  v.setModel(source(), { deferDisplay: true });
  assert.equal(v.screenPickCache, null);
  v.setDisplay(view);
  check();
  // The broad phase must not turn an over-bound display into partial successful picks.
  v.publishedPickState.projected = Array(PICK_LIMIT + 1).fill(v.projected[0]);
  v.publishedPickState.view = { pickKind: 'vertex' };
  v.screenPickCache = null;
  assert.match(v.pickAt(960, 540, { hover: true }).diagnostic, /resource limit/);
  v.clear();
  assert.equal(v.screenPickCache, null);
});

test('ordinary recoloring reuses the writable attribute and matches a fresh viewer in every color mode', () => {
  const model = source();
  seedBenchmarkTypes(model);
  const v = cpuViewer(model),
    fresh = cpuViewer(model),
    view = { projection: 'orthographic', faces: true };
  try {
    v.setDisplay(view);
    const attribute = v.surfaceGeometry.getAttribute('color');
    for (const surfaceColors of ['face-type', 'cell-type', 'face', 'cell', 'source']) {
      v.setDisplay({ ...view, surfaceColors });
      fresh.colorKey = null;
      fresh.setDisplay({ ...view, surfaceColors });
      assert.equal(v.surfaceGeometry.getAttribute('color'), attribute);
      assert.deepEqual(attribute.array, fresh.surfaceGeometry.getAttribute('color').array);
    }
  } finally {
    v.clear();
    fresh.clear();
  }
});
