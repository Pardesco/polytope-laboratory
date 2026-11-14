import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import * as THREE from 'three';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { IDENTITY, boost, transform, lorentzInner, multiply, lorentzInverse } from '../ui/hyperbolic-math.mjs';
import { HyperbolicNavigation, HyperbolicViewer } from '../ui/hyperbolic-viewer.mjs';
import {
  HYPERBOLIC_LIMITS,
  validatePatchPage,
  prepareHyperbolicPatch,
  runHyperbolicJob,
  installHyperbolicWorker,
  HyperbolicSampleCache,
  vertexWelder,
} from '../ui/hyperbolic-worker.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/hyperbolic/three-cubes.json', import.meta.url)));
const views = JSON.parse(fs.readFileSync(new URL('./fixtures/hyperbolic/views.json', import.meta.url)));
const copy = () => structuredClone(fixture);
const job = (page = copy(), requestId = 1) => ({
  type: 'prepare',
  requestId,
  revision: 7,
  epoch: page.epoch,
  sourceHash: page.sourceHash,
  anchorHash: page.anchorHash,
  pages: [page],
  options: { model: 'poincare' },
});

test('fixture has valid hyperboloid templates, ordered face incidence and shared geometric edges', () => {
  const before = JSON.stringify(fixture);
  const receipt = validatePatchPage(fixture);
  assert.ok(receipt.coordinateResidual < 1e-12);
  assert.ok(receipt.transformResidual < 1e-12);
  const t = fixture.templates.cube;
  t.faces.forEach((face, i) =>
    face.forEach((v) => assert.ok(Math.abs(lorentzInner(t.vertices[v], t.facePlanes[i])) < 1e-12))
  );
  for (const view of views) {
    const result = prepareHyperbolicPatch(fixture, {
      model: view.hyperbolicModel,
    });
    assert.ok(result.positions instanceof Float32Array);
    assert.ok(result.segmentOwners instanceof Uint32Array);
    assert.ok(result.positions.every(Number.isFinite));
    assert.equal(result.quality.uniqueEdges, 28);
    assert.equal(
      result.owners.reduce((n, o) => n + o.aliases.length, 0),
      8
    );
    assert.ok(result.samples64 instanceof Float64Array);
    assert.ok(result.quality.sampleResidual < 1e-8);
    assert.equal(result.indices.length, result.segmentOwners.length * 2);
    assert.equal(result.quality.capped, false);
    if (view.hyperbolicModel === 'klein') assert.equal(result.quality.segments, 28);
  }
  assert.equal(JSON.stringify(fixture), before);
});
test('rounding buckets never weld geometrically different endpoints', () => {
  const page = copy();
  page.instances = [page.instances[0], { ...page.instances[0], id: 'offset', matrix: boost([1, 0, 0], 5e-8) }];
  assert.equal(prepareHyperbolicPatch(page, { model: 'klein' }).quality.uniqueEdges, 24);
});

test('all developed {5,3,5} depth-four face links weld at the linear scale-aware gate', () => {
  const pairs = JSON.parse(
    execFileSync(
      'python',
      [
        '-c',
        `
import json,numpy as np
from engine.hyperbolic_orbit import Development
d=Development([5,3,5],depth=4,mode='complete-depth')
while d.page({'candidatesPerPage':50000})['checkpoint']: pass
points=[(m@d.vertices.T).T for m in d.matrices]
pairs=[]
for (i,f),row in d.links.items():
 for v in d.template['faces'][f]:
  pairs.append([points[i][v].tolist(),points[row['toCell']][row['vertexPermutation'][v]].tolist()])
print(json.dumps(pairs))
`,
      ],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }
    ).toString()
  );
  const weld = vertexWelder();
  for (const [a, b] of pairs) assert.equal(weld(a), weld(b));
  assert.ok(pairs.length > 20000);
});
test('improper reflected cell charts are supported while observer matrices must be proper', () => {
  const page = copy();
  page.instances = [page.instances[0]];
  page.instances[0].matrix[5] = -1;
  assert.doesNotThrow(() => prepareHyperbolicPatch(page));
  assert.throws(() => prepareHyperbolicPatch(page, { observerMatrix: page.instances[0].matrix }), /pose or screen/);
});
test('display caps report their reason and stay within the requested and absolute budgets', () => {
  const edgeLimited = prepareHyperbolicPatch(fixture, { maxEdges: 4 });
  assert.equal(edgeLimited.quality.uniqueEdges, 4);
  assert.ok(edgeLimited.quality.reasons.includes('edge-cap'));
  const segmentLimited = prepareHyperbolicPatch(fixture, { maxSegments: 2 });
  assert.ok(segmentLimited.quality.segments <= 2);
  assert.equal(segmentLimited.quality.capped, true);
  assert.throws(() => prepareHyperbolicPatch(fixture, { maxEdges: HYPERBOLIC_LIMITS.edges + 1 }), /budget/);
  assert.throws(() => prepareHyperbolicPatch(fixture, { maxSegments: HYPERBOLIC_LIMITS.segments + 1 }), /budget/);
});

test('static preparation enforces the actual 50,000-edge and 200,000-segment caps', () => {
  const pages = [];
  for (let page = 0; page < 12; page++) {
    const p = copy();
    p.templates.cube.vertices = p.templates.cube.vertices.map((v) => {
      const k = v.slice(1).map((x) => (2 * x) / v[0]),
        t = 1 / Math.sqrt(1 - k.reduce((s, x) => s + x * x, 0));
      return [t, ...k.map((x) => x * t)];
    });
    p.templates.cube.facePlanes = p.templates.cube.facePlanes.map((v) =>
      [0.3, ...v.slice(1).map((x) => Math.sign(x))].map((x) => x / Math.sqrt(1 - 0.3 * 0.3))
    );
    p.templates.cube.edges = Array.from({ length: 8 }, (_, i) =>
      Array.from({ length: 7 - i }, (_, j) => [i, i + j + 1])
    ).flat();
    p.instances = [];
    for (let k = 0; k < 256; k++) {
      const i = page * 256 + k,
        y = 1 - (2 * (i + 0.5)) / 3072,
        r = Math.sqrt(1 - y * y),
        angle = i * 2.399963229728653;
      p.instances.push({
        id: i,
        type: 'cube',
        word: [],
        matrix: boost([r * Math.cos(angle), y, r * Math.sin(angle)], 1 + i / 3072),
      });
    }
    pages.push(p);
  }
  // Extra chords are a renderer stress graph, not honeycomb incidence evidence.
  const edges = prepareHyperbolicPatch(pages, { model: 'klein' });
  assert.equal(edges.quality.uniqueEdges, 50000);
  assert.ok(edges.quality.reasons.includes('edge-cap'));
  const segments = prepareHyperbolicPatch(pages, { lod: 'fine' });
  assert.ok(segments.quality.segments <= 200000);
  assert.ok(segments.quality.segments >= 199936);
  assert.ok(segments.quality.reasons.includes('segment-cap'));
});
test('invalid and oversized pages fail before publication without relaxing residual gates', () => {
  const corrupt = [
    (p) => (p.instances[0].matrix[0] = NaN),
    (p) => (p.instances[0].matrix[0] = 1.01),
    (p) => (p.instances[0].matrix = Array(16).fill(1e308)),
    (p) => (p.templates.cube.vertices[0] = [1e308, 1e308, 1e308, 1e308]),
    (p) => (p.templates.cube.vertices[0][0] += 0.0001),
    (p) => (p.templates.cube.edges[0][1] = 999),
    (p) => (p.templates.cube.faces[0] = [0, 0, 1]),
    (p) => (p.instances[1].id = p.instances[0].id),
    (p) => (p.instances[0].quotientState = 8),
    (p) => (p.instances[0].word = Array(257).fill(0)),
    (p) => (p.instances = Array(257).fill(p.instances[0])),
    (p) => (p.coverage.padding = 'x'.repeat(4 * 1024 * 1024)),
  ];
  for (const mutate of corrupt) {
    const p = copy();
    mutate(p);
    assert.throws(() => validatePatchPage(p), /Invalid hyperbolic patch/);
  }
  const other = copy();
  other.epoch++;
  assert.throws(() => prepareHyperbolicPatch([fixture, other]), /mixed source/);
  assert.throws(() => prepareHyperbolicPatch([fixture, fixture]), /duplicate instance/);
  assert.throws(() => prepareHyperbolicPatch(Array(4097).fill(fixture)), /page count/);
});
test('cancellable worker jobs retain source/anchor/epoch/revision and transfer compact buffers', async () => {
  const request = job(),
    result = await runHyperbolicJob(request, { yieldTask: async () => {} });
  for (const key of ['requestId', 'epoch', 'revision', 'sourceHash', 'anchorHash'])
    assert.equal(result[key], request[key]);
  assert.equal(result.positions.buffer.byteLength, result.positions.byteLength);
  let checks = 0;
  await assert.rejects(runHyperbolicJob(request, { isCancelled: () => ++checks > 2, yieldTask: async () => {} }), {
    name: 'AbortError',
  });
  await assert.rejects(runHyperbolicJob({ ...request, anchorHash: 'wrong' }), /binding/);
});
test('real worker handler cancels running work and drops stale epochs', async () => {
  let listener;
  const output = [];
  const uninstall = installHyperbolicWorker({
    addEventListener: (_, fn) => (listener = fn),
    removeEventListener: () => (listener = null),
    postMessage: (message, transfer) => output.push({ message, transfer }),
  });
  const pending = listener({ data: job() });
  await listener({ data: { type: 'cancel' } });
  await pending;
  assert.equal(output.length, 0);
  const old = listener({ data: job() });
  const newer = copy();
  newer.epoch = 2;
  await Promise.all([old, listener({ data: job(newer, 2) })]);
  assert.equal(output.length, 1);
  assert.equal(output[0].message.epoch, 2);
  assert.equal(output[0].transfer.length, 4);
  uninstall();
  assert.equal(listener, null);
});

test('page preparation reuses float64 edge samples on append and bounds its disposable cache', async () => {
  const sampleCache = new HyperbolicSampleCache(),
    request = job();
  const first = await runHyperbolicJob(request, { sampleCache, yieldTask: async () => {} });
  const appended = copy();
  appended.instances = [{ ...appended.instances[0], id: 'far', matrix: boost([0, 1, 0], 1) }];
  const second = await runHyperbolicJob(
    { ...request, requestId: 2, pages: [request.pages[0], appended] },
    { sampleCache, yieldTask: async () => {} }
  );
  assert.equal(first.quality.sampledEdges, 28);
  assert.equal(second.quality.samplingCacheHits, 28);
  assert.equal(second.quality.sampledEdges, 12);
  assert.ok(sampleCache.bytes <= HYPERBOLIC_LIMITS.cacheBytes);
  const tiny = new HyperbolicSampleCache(400);
  tiny.set('first', new Float64Array(8));
  tiny.set('second', new Float64Array(8));
  assert.equal(tiny.get('first'), null);
  assert.ok(tiny.get('second'));
  assert.ok(tiny.bytes <= 400);
});
test('navigation composes local movement and look; inverse observer recentering preserves geometry', () => {
  const nav = new HyperbolicNavigation();
  nav.move([0, 0, -1], 0.4);
  nav.look(0.2, -0.1);
  assert.ok(nav.displacement > 0.39 && nav.displacement < 0.41);
  const point = fixture.templates.cube.vertices[0],
    camera = transform(lorentzInverse(nav.matrix), point);
  assert.ok(Math.abs(lorentzInner(camera, camera) + 1) < 1e-12);
  const anchorTransform = boost([0, 0, -1], 0.3),
    recentered = multiply(lorentzInverse(anchorTransform), nav.matrix);
  const reanchored = transform(lorentzInverse(anchorTransform), point);
  const again = transform(lorentzInverse(recentered), reanchored);
  again.forEach((x, i) => assert.ok(Math.abs(x - camera[i]) < 1e-12));
  nav.home();
  assert.deepEqual(nav.matrix, IDENTITY);
});

function bareViewer() {
  const viewer = Object.create(HyperbolicViewer.prototype);
  Object.assign(viewer, {
    options: {},
    pages: [],
    navigation: new HyperbolicNavigation(),
    generation: 0,
    nextRequest: 0,
    stats: { preparations: 0 },
    poseVersion: 0,
    cacheBytes: 0,
    geometry: new THREE.BufferGeometry(),
    keys: new Set(),
    mode: 'explore',
    projectionModel: 'poincare',
  });
  viewer.beginEpoch({ ...fixture, revision: 7 });
  viewer.setPatch(copy(), { revision: 7 });
  return viewer;
}
test('viewer rejects stale document revisions and epochs and bounds its disposable cache', () => {
  const viewer = bareViewer(),
    oldPages = viewer.pages;
  assert.equal(viewer.setPatch(copy(), { revision: 8 }), false);
  const newer = copy();
  newer.epoch++;
  assert.equal(viewer.setPatch(newer, { revision: 7 }), false);
  assert.equal(viewer.pages, oldPages);
  assert.throws(() => viewer.setPatch(copy(), { append: true, revision: 7 }), /Duplicate/);
  viewer.cacheBytes = HYPERBOLIC_LIMITS.cacheBytes;
  assert.throws(() => viewer.setPatch(copy(), { append: true, revision: 7 }), /cache limit/);
  assert.equal(viewer.receive({ type: 'projected', requestId: 999, ...viewer.binding }), false);
  assert.throws(() => viewer.setModel({ dimension: 4 }), /hyperbolic-space/);
});
test('rebase callback supplies words and replacement geometry atomically, preserving local pose/address', async () => {
  const viewer = bareViewer();
  viewer.navigation.move([1, 0, 0], 1.01);
  const before = [...viewer.navigation.matrix],
    anchorTransform = boost([1, 0, 0], 0.9),
    next = copy();
  next.epoch = 2;
  next.anchorHash = 'fixture-next';
  for (const cell of next.instances) cell.matrix = multiply(lorentzInverse(anchorTransform), cell.matrix);
  let request;
  viewer.options.onRebase = async (value) => {
    request = value;
    return { patch: next, anchorTransform, anchor: { word: [0], quotientState: 3 } };
  };
  assert.equal(await viewer.requestRebase(), true);
  assert.deepEqual(request.observerMatrix, before);
  assert.equal(request.epoch, 1);
  assert.ok(viewer.navigation.displacement < 0.12);
  assert.deepEqual(viewer.anchor, { word: [0], quotientState: 3 });
  assert.equal(viewer.binding.anchorHash, 'fixture-next');
  assert.equal(viewer.pages[0].epoch, 2);
});
test('failed or superseded rebase retains the previous coherent frame and pages', async () => {
  const viewer = bareViewer();
  viewer.navigation.move([1, 0, 0], 1.01);
  const pages = viewer.pages,
    matrix = [...viewer.navigation.matrix];
  viewer.options.onRebase = async () => ({ patch: copy(), observerMatrix: [...IDENTITY] });
  assert.equal(await viewer.requestRebase(), false);
  assert.equal(viewer.pages, pages);
  assert.deepEqual(viewer.navigation.matrix, matrix);
  let resolve;
  viewer.options.onRebase = () => new Promise((r) => (resolve = r));
  const pending = viewer.requestRebase();
  viewer.beginEpoch({ ...fixture, epoch: 2, revision: 8 });
  resolve({ patch: copy(), observerMatrix: IDENTITY, anchor: { word: [] } });
  assert.equal(await pending, false);
  assert.equal(viewer.binding.epoch, 2);
});

test('rebase prepares without a blank frame and atomically transports movement made while pending', async () => {
  const viewer = bareViewer();
  viewer.publishPrepared(prepareHyperbolicPatch(copy(), { model: 'klein' }));
  viewer.navigation.move([1, 0, 0], 0.72);
  const oldBuffer = viewer.geometry.attributes.hyperboloid.array;
  const oldPages = viewer.pages,
    anchorTransform = [...viewer.navigation.matrix];
  let resolve,
    blanks = 0,
    coherent = false;
  const drawRange = viewer.geometry.setDrawRange.bind(viewer.geometry);
  viewer.geometry.setDrawRange = (start, count) => {
    if (!count) blanks++;
    return drawRange(start, count);
  };
  viewer.options.onRebase = () =>
    new Promise((r) => {
      resolve = r;
    });
  const pending = viewer.requestRebase();
  viewer.keys.add('KeyW');
  viewer.tick(0.1);
  viewer.navigation.look(0.08, -0.03);
  const live = [...viewer.navigation.matrix];
  assert.equal(viewer.geometry.attributes.hyperboloid.array, oldBuffer);
  assert.equal(viewer.pages, oldPages);
  assert.ok(viewer.geometry.drawRange.count > 0);
  const next = copy();
  next.epoch++;
  next.anchorHash = 'atomic-replacement';
  next.instances.forEach((cell) => {
    cell.matrix = multiply(lorentzInverse(anchorTransform), cell.matrix);
  });
  const expected = multiply(lorentzInverse(anchorTransform), live);
  viewer.options.onQuality = () => {
    assert.equal(viewer.binding.anchorHash, next.anchorHash);
    assert.equal(viewer.published.quality.model, 'poincare');
    expected.forEach((x, i) => assert.ok(Math.abs(x - viewer.navigation.matrix[i]) < 1e-12));
    coherent = true;
  };
  resolve({ patch: next, anchor: { word: [0] }, anchorTransform });
  setTimeout(() => {
    viewer.mode = 'overview';
  }, 0);
  assert.equal(viewer.geometry.attributes.hyperboloid.array, oldBuffer);
  assert.equal(await pending, true);
  assert.equal(blanks, 0);
  assert.equal(coherent, true);
  assert.notEqual(viewer.geometry.attributes.hyperboloid.array, oldBuffer);
});

test('early rebase keeps movement active while replacement preparation is pending', async () => {
  const viewer = bareViewer();
  viewer.navigation.move([1, 0, 0], 0.69);
  viewer.keys.add('KeyD');
  let resolve,
    calls = 0;
  viewer.options.onRebase = () => {
    calls++;
    return new Promise((r) => (resolve = r));
  };
  viewer.tick(0.1);
  const matrix = [...viewer.navigation.matrix];
  assert.equal(calls, 1);
  assert.equal(viewer.rebasePending, true);
  viewer.tick(0.1);
  assert.notDeepEqual(viewer.navigation.matrix, matrix);
  resolve({ patch: copy(), observerMatrix: IDENTITY, anchor: { word: [0] } });
  while (viewer.rebasePending) await new Promise((r) => setTimeout(r, 0));
  assert.equal(viewer.rebasePending, false);
  assert.ok(viewer.navigation.displacement > 0.03);
});

test('missing rebase callback pauses navigation with a domain explanation', () => {
  const viewer = bareViewer();
  viewer.navigation.move([1, 0, 0], 1.01);
  viewer.keys.add('KeyW');
  const matrix = [...viewer.navigation.matrix];
  viewer.tick(0.1);
  assert.deepEqual(viewer.navigation.matrix, matrix);
  assert.equal(viewer.keys.size, 0);
  assert.match(viewer.lastDiagnostic, /nearby engine anchor is required/);
});

test(
  'mounted canvas: both models, worker, keyboard navigation, explicit capture, picking and disposal',
  { timeout: 120000 },
  async (t) => {
    const server = await createServer({
      configFile: false,
      root: 'ui',
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { host: '127.0.0.1', port: 0 },
      plugins: [
        {
          name: 'hyperbolic-test-page',
          configureServer(s) {
            s.middlewares.use('/__hyperbolic-test', (_req, res) => {
              res.setHeader('Content-Type', 'text/html');
              res.end(
                '<!doctype html><style>body{margin:0}canvas{width:960px;height:540px}</style><button id="capture">Look with pointer</button><canvas id="ball"></canvas>'
              );
            });
          },
        },
      ],
    });
    let browser;
    try {
      await server.listen();
      browser = await chromium.launch({
        headless: true,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      });
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }),
        errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__hyperbolic-test`);
      await page.evaluate(async (fixture) => {
        const { HyperbolicViewer } = await import('/hyperbolic-viewer.mjs');
        window.qualities = [];
        window.views = [];
        window.picks = [];
        window.diagnostics = [];
        window.viewer = new HyperbolicViewer(document.getElementById('ball'), {
          onQuality: (q) => qualities.push(q),
          onPick: (p) => picks.push(p),
          onViewChange: (v) => views.push(v),
          onDiagnostic: (d) => diagnostics.push(d),
        });
        viewer.setModel({ kind: 'hyperbolic-space', anchorPatch: fixture }, { revision: 7 });
        document.getElementById('capture').addEventListener('pointerdown', (event) => viewer.capturePointer(event));
      }, fixture);
      await page.waitForFunction(() => viewer.published?.quality.uniqueEdges === 28);
      const gpuPrecision = await page.evaluate(async () => {
        const { HYPERBOLIC_PROJECTION_GLSL } = await import('/hyperbolic-viewer.mjs');
        const { IDENTITY, boost, transform, lorentzInverse, projectPoint, shaderProjectPoint } = await import(
          '/hyperbolic-math.mjs'
        );
        const gl = viewer.renderer.getContext(),
          program = gl.createProgram(),
          shaders = [];
        const sources = [
          `#version 300 es
precision highp float;
in vec4 hyperboloid;
uniform mat4 observerInverse;
uniform int ballModel;
out vec3 projected;
${HYPERBOLIC_PROJECTION_GLSL}
void main(){projected=projectHyperbolic(hyperboloid);gl_Position=vec4(0,0,0,1);}`,
          `#version 300 es
precision highp float;out vec4 outputColor;void main(){outputColor=vec4(1);}`,
        ];
        sources.forEach((source, i) => {
          const shader = gl.createShader(i ? gl.FRAGMENT_SHADER : gl.VERTEX_SHADER);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
          gl.attachShader(program, shader);
          shaders.push(shader);
        });
        gl.transformFeedbackVaryings(program, ['projected'], gl.INTERLEAVED_ATTRIBS);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
        const points = [];
        for (const radius of [0, 0.1, 1, 2, 3, 4, 4.903])
          for (let i = 0; i < 64; i++) {
            const y = 1 - (2 * (i + 0.5)) / 64,
              r = Math.sqrt(1 - y * y),
              a = i * 2.399963229728653;
            points.push(...transform(boost([r * Math.cos(a), y, r * Math.sin(a)], radius), [1, 0, 0, 0]));
          }
        const vao = gl.createVertexArray(),
          input = gl.createBuffer(),
          output = gl.createBuffer(),
          feedback = gl.createTransformFeedback();
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, input);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);
        const location = gl.getAttribLocation(program, 'hyperboloid');
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, 4, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, output);
        gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, (points.length / 4) * 3 * 4, gl.STREAM_READ);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, output);
        gl.useProgram(program);
        let maxBallError = 0,
          maxReferenceDifference = 0;
        for (const inverse of [IDENTITY, lorentzInverse(boost([1, 2, 3], 0.99))])
          for (const model of ['poincare', 'klein']) {
            const columnMajor = Array.from({ length: 16 }, (_, i) => inverse[4 * (i % 4) + (i >> 2)]);
            gl.uniformMatrix4fv(
              gl.getUniformLocation(program, 'observerInverse'),
              false,
              new Float32Array(columnMajor)
            );
            gl.uniform1i(gl.getUniformLocation(program, 'ballModel'), model === 'poincare' ? 0 : 1);
            gl.enable(gl.RASTERIZER_DISCARD);
            gl.beginTransformFeedback(gl.POINTS);
            gl.drawArrays(gl.POINTS, 0, points.length / 4);
            gl.endTransformFeedback();
            gl.disable(gl.RASTERIZER_DISCARD);
            const actual = new Float32Array((points.length / 4) * 3);
            gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, actual);
            for (let i = 0; i < points.length; i += 4) {
              const point = points.slice(i, i + 4),
                expected = projectPoint(transform(inverse, point), model),
                reference = shaderProjectPoint(point, inverse, model),
                gpu = actual.subarray((i / 4) * 3, (i / 4) * 3 + 3);
              maxBallError = Math.max(maxBallError, Math.hypot(...gpu.map((x, k) => x - expected[k])));
              maxReferenceDifference = Math.max(
                maxReferenceDifference,
                Math.hypot(...gpu.map((x, k) => x - reference[k]))
              );
            }
          }
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
        gl.bindVertexArray(null);
        gl.deleteTransformFeedback(feedback);
        gl.deleteVertexArray(vao);
        gl.deleteBuffer(input);
        gl.deleteBuffer(output);
        gl.deleteProgram(program);
        shaders.forEach((s) => gl.deleteShader(s));
        viewer.renderer.resetState();
        return { maxBallError, maxReferenceDifference, probes: (points.length / 4) * 4 };
      });
      assert.ok(gpuPrecision.maxBallError <= 2e-5, JSON.stringify(gpuPrecision));
      assert.ok(gpuPrecision.maxReferenceDifference <= 2e-6, JSON.stringify(gpuPrecision));
      t.diagnostic('Actual GPU transform-feedback projection: ' + JSON.stringify(gpuPrecision));
      assert.equal(await page.evaluate(() => viewer.worker instanceof Worker), true);
      const first = await page.evaluate(() => ({
        segments: viewer.published.quality.segments,
        edges: viewer.published.quality.uniqueEdges,
      }));
      assert.ok(first.segments >= first.edges);
      await page.evaluate(() => viewer.setProjection('klein'));
      await page.waitForFunction(
        () => viewer.published?.quality.segments === 28 && viewer.geometry.drawRange.count > 0
      );
      await page.evaluate(() => {
        window.beforeMoveBuffer = viewer.geometry.attributes.hyperboloid.array;
        window.beforeMovePreparations = viewer.stats.preparations;
      });
      await page.evaluate(() => viewer.enterExplore());
      assert.deepEqual(await page.evaluate(() => viewer.camera.position.toArray()), [0, 0, 0]);
      assert.equal(await page.evaluate(() => viewer.pointerId), null);
      await page.locator('#ball').focus();
      await page.keyboard.down('KeyW');
      await page.waitForFunction(() => viewer.navigation.displacement > 0.025);
      await page.keyboard.up('KeyW');
      const displacement = await page.evaluate(() => viewer.navigation.displacement);
      assert.ok(displacement > 0.025);
      const old = await page.evaluate(() => viewer.navigation.matrix);
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(90);
      await page.keyboard.up('ArrowRight');
      assert.notDeepEqual(await page.evaluate(() => viewer.navigation.matrix), old);
      assert.deepEqual(await page.evaluate(() => viewer.camera.position.toArray()), [0, 0, 0]);
      await page.locator('#capture').hover();
      await page.mouse.down();
      assert.ok(await page.evaluate(() => viewer.pointerId != null));
      await page.mouse.move(200, 100);
      await page.mouse.up();
      assert.equal(await page.evaluate(() => viewer.pointerId), null);
      await page.locator('#ball').focus();
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => viewer.mode), 'overview');
      assert.equal(
        await page.evaluate(
          () => viewer.geometry.drawRange.count > 0 && viewer.stats.preparations >= beforeMovePreparations
        ),
        true
      );
      await page.evaluate(() => viewer.home());
      assert.deepEqual(await page.evaluate(() => viewer.navigation.matrix), IDENTITY);
      await page.waitForFunction(
        () => viewer.published && !viewer.activeJob && !viewer.queuedJob && !viewer.preparationDirty
      );
      // On-demand picking uses the authoritative float64 samples.
      const identity = await page.evaluate(async () => {
        const { projectPoint } = await import('/hyperbolic-math.mjs');
        const { samples64, indices } = viewer.published;
        const a = projectPoint(samples64.subarray(indices[0] * 4, indices[0] * 4 + 4), viewer.projectionModel);
        const b = projectPoint(samples64.subarray(indices[1] * 4, indices[1] * 4 + 4), viewer.projectionModel);
        const p = viewer.camera.position
          .clone()
          .set(...a.map((x, k) => (x + b[k]) / 2))
          .project(viewer.camera);
        return viewer.pickAt(((p.x + 1) * viewer.width) / 2, ((1 - p.y) * viewer.height) / 2);
      });
      assert.ok(
        identity && Object.keys(identity).length === 2,
        JSON.stringify(
          await page.evaluate(() => ({
            positions: viewer.published.positions.length,
            drawRange: viewer.geometry.drawRange,
            camera: viewer.camera.position.toArray(),
            diagnostics,
            active: !!viewer.activeJob,
            dirty: viewer.preparationDirty,
            attributes: viewer.geometry.attributes.hyperboloid.count,
            sphere: viewer.geometry.boundingSphere,
            segments: viewer.published.segmentOwners.length,
          }))
        )
      );
      assert.ok('instanceId' in identity && 'edge' in identity);
      assert.ok(await page.evaluate(() => views.length > 0));
      await page.evaluate(async (fixture) => {
        const { boost } = await import('/hyperbolic-math.mjs');
        const pages = [];
        for (let page = 0; page < 16; page++) {
          const patch = structuredClone(fixture);
          patch.epoch = 2;
          patch.sourceHash = 'synthetic-4096-cubes';
          patch.instances = [];
          for (let k = 0; k < 256; k++) {
            const i = page * 256 + k,
              y = 1 - (2 * (i + 0.5)) / 4096,
              r = Math.sqrt(1 - y * y),
              angle = i * 2.399963229728653;
            patch.instances.push({
              id: i,
              type: 'cube',
              word: [],
              matrix: boost([r * Math.cos(angle), y, r * Math.sin(angle)], 0.5 + (2.5 * (i % 17)) / 16),
            });
          }
          pages.push(patch);
        }
        viewer.home();
        viewer.setProjection('poincare');
        viewer.beginEpoch({ ...pages[0], revision: 8 });
        window.syntheticPages = pages;
        viewer.setPatch(pages[0], { revision: 8 });
        viewer.canvas.style.width = '1920px';
        viewer.canvas.style.height = '1080px';
        viewer.resize(1920, 1080);
        window.syntheticStart = performance.now();
      }, fixture);
      await page.waitForFunction(
        () => viewer.published?.sourceHash === 'synthetic-4096-cubes' && !viewer.activeJob && !viewer.preparationDirty,
        { timeout: 30000 }
      );
      const firstPage = await page.evaluate(() => ({
        firstPageWallMs: performance.now() - syntheticStart,
        firstPagePrepMs: viewer.published.prepTimeMs,
      }));
      await page.evaluate(() => {
        window.fullPatchStart = performance.now();
        for (const patch of syntheticPages.slice(1)) viewer.setPatch(patch, { append: true, revision: 8 });
      });
      await page.waitForFunction(
        () => viewer.published?.quality.uniqueEdges === 49152 && !viewer.activeJob && !viewer.preparationDirty
      );
      const overview = await page.evaluate(() => ({
        fullPatchPrepMs: viewer.published.prepTimeMs,
        fullPatchWallMs: performance.now() - fullPatchStart,
        quality: viewer.published.quality,
      }));
      assert.equal(overview.quality.uniqueEdges, 49152);
      assert.equal(overview.quality.capped, false);
      const benchmark = await page.evaluate(async () => {
        viewer.enterExplore();
        viewer.navigation.home();
        viewer.invalidate();
        await new Promise((resolve) => {
          const wait = () =>
            viewer.published && !viewer.activeJob && !viewer.queuedJob && !viewer.preparationDirty
              ? resolve()
              : requestAnimationFrame(wait);
          requestAnimationFrame(wait);
        });
        const gl = viewer.renderer.getContext(),
          debug = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        cancelAnimationFrame(viewer.animation);
        const buffer = viewer.geometry.attributes.hyperboloid.array,
          preparations = viewer.stats.preparations;
        viewer.render();
        gl.finish();
        const start = performance.now(),
          initialDraws = viewer.stats.drawFrames,
          initialPoses = viewer.stats.poseUpdates,
          times = [];
        let last = start;
        await new Promise((resolve) => {
          const frame = (now) => {
            times.push(now - last);
            last = now;
            viewer.navigation.look(0.002, 0);
            viewer.navigation.move([0, 0, 1], times.length % 2 ? 0.002 : -0.002);
            viewer.invalidate();
            viewer.render();
            gl.finish();
            if (times.length < 120) requestAnimationFrame(frame);
            else resolve();
          };
          requestAnimationFrame(frame);
        });
        const elapsed = performance.now() - start;
        return {
          width: viewer.width,
          height: viewer.height,
          cells: 4096,
          frames: times.length,
          elapsedMs: elapsed,
          drawFps: ((viewer.stats.drawFrames - initialDraws) * 1000) / elapsed,
          poseUpdatesPerSecond: ((viewer.stats.poseUpdates - initialPoses) * 1000) / elapsed,
          sameStaticBuffer: buffer === viewer.geometry.attributes.hyperboloid.array,
          preparationsDuringNavigation: viewer.stats.preparations - preparations,
          renderer,
          pixelRatio: viewer.renderer.getPixelRatio(),
          quality: viewer.published.quality,
        };
      });
      assert.equal(benchmark.drawFps, benchmark.poseUpdatesPerSecond);
      assert.equal(benchmark.sameStaticBuffer, true);
      assert.equal(benchmark.preparationsDuringNavigation, 0);
      await page.evaluate(() => {
        viewer.animation = requestAnimationFrame(viewer.frame);
      });
      t.diagnostic(
        'Synthetic benchmark (headless; not a honeycomb): ' +
          JSON.stringify({ cpu: os.cpus()[0].model, ...firstPage, ...overview, ...benchmark })
      );
      await page.evaluate((fixture) => {
        viewer.setModel({ kind: 'hyperbolic-space', anchorPatch: fixture }, { revision: 9 });
        viewer.worker.dispatchEvent(new Event('error', { cancelable: true }));
      }, fixture);
      await page.waitForFunction(
        () =>
          !viewer.worker &&
          viewer.published?.sourceHash === 'hand-built-three-cubes-v1' &&
          !viewer.activeJob &&
          !viewer.preparationDirty
      );
      assert.equal(await page.evaluate(() => viewer.published.quality.uniqueEdges), 28);
      await page.evaluate(() => {
        viewer.dispose();
        viewer.dispose();
      });
      assert.equal(await page.evaluate(() => viewer.disposed && viewer.pages.length === 0), true);
      assert.deepEqual(errors, []);
      t.diagnostic('Mounted renderer uses real Chromium WebGL and a browser module worker.');
    } finally {
      await browser?.close();
      await server.close();
    }
  }
);
