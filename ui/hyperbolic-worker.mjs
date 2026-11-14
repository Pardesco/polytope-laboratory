import {
  finiteVector,
  frameDiagnostics,
  lorentzInner,
  transform,
  geodesicPoint,
  hyperbolicSegmentCount,
} from './hyperbolic-math.mjs';

export const HYPERBOLIC_LIMITS = Object.freeze({
  pageBytes: 4 * 1024 * 1024,
  cacheBytes: 64 * 1024 * 1024,
  pageInstances: 256,
  instances: 4096,
  edges: 50000,
  segments: 200000,
});
const fail = (message) => {
  throw new RangeError(`Invalid hyperbolic patch: ${message}`);
};
const idValid = (id) =>
  (typeof id === 'string' && id.length > 0 && id.length <= 256) || (Number.isSafeInteger(id) && id >= 0);
const hashValid = (s) => typeof s === 'string' && s.length > 0 && s.length <= 256;
const boundedArray = (a, max) => Array.isArray(a) && a.length <= max;
const indexValid = (i, count) => Number.isInteger(i) && i >= 0 && i < count;
export const abortProjection = () =>
  Object.assign(new Error('Hyperbolic page preparation cancelled.'), { name: 'AbortError' });

export class HyperbolicSampleCache {
  constructor(maxBytes = HYPERBOLIC_LIMITS.cacheBytes) {
    this.maxBytes = maxBytes;
    this.bytes = 0;
    this.entries = new Map();
  }
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.samples;
  }
  set(key, samples) {
    const bytes = key.length * 2 + samples.byteLength + 256;
    if (bytes > this.maxBytes) return;
    if (this.entries.has(key)) {
      this.bytes -= this.entries.get(key).bytes;
      this.entries.delete(key);
    }
    while (this.bytes + bytes > this.maxBytes) {
      const key = this.entries.keys().next().value;
      this.bytes -= this.entries.get(key).bytes;
      this.entries.delete(key);
    }
    this.entries.set(key, { samples, bytes });
    this.bytes += bytes;
  }
}

export function templateEntries(templates) {
  if (!templates || typeof templates !== 'object' || Object.keys(templates).length > 16) fail('template count.');
  return Array.isArray(templates)
    ? templates.map((t, i) => [String(t?.type ?? t?.id ?? i), t])
    : Object.entries(templates);
}
export function validatePatchPage(page) {
  if (
    !page ||
    !hashValid(page.sourceHash) ||
    !hashValid(page.anchorHash) ||
    !Number.isSafeInteger(page.epoch) ||
    page.epoch < 0
  )
    fail('source, anchor or epoch binding.');
  if (!boundedArray(page.instances, HYPERBOLIC_LIMITS.pageInstances)) fail('page exceeds 256 instances.');
  const templates = new Map(templateEntries(page.templates));
  let coordinateResidual = 0,
    transformResidual = 0;
  for (const [key, t] of templates) {
    if (
      key.length > 256 ||
      !t ||
      !boundedArray(t.vertices, 256) ||
      !t.vertices.length ||
      !boundedArray(t.edges, 512) ||
      !boundedArray(t.faces, 256) ||
      !boundedArray(t.facePlanes, 256) ||
      t.faces.length !== t.facePlanes.length
    )
      fail('template limits or face planes.');
    for (const v of t.vertices) {
      if (!finiteVector(v, 4) || v[0] < 1) fail('nonfinite or nonfuture vertex.');
      if (v[0] > 1e4 || Math.abs(lorentzInner(v, v) + 1) > 1e-12 * Math.max(1, v[0]) ** 2)
        fail('template exceeds the scale-aware hyperboloid gate.');
      coordinateResidual = Math.max(coordinateResidual, Math.abs(lorentzInner(v, v) + 1));
    }
    for (const e of t.edges)
      if (!boundedArray(e, 2) || e.length !== 2 || e[0] === e[1] || !e.every((i) => indexValid(i, t.vertices.length)))
        fail('edge indices.');
    for (const f of t.faces)
      if (
        !boundedArray(f, 128) ||
        f.length < 3 ||
        new Set(f).size !== f.length ||
        !f.every((i) => indexValid(i, t.vertices.length))
      )
        fail('face indices.');
    for (const n of t.facePlanes)
      if (!finiteVector(n, 4) || !Number.isFinite(lorentzInner(n, n)) || Math.abs(lorentzInner(n, n) - 1) > 1e-8)
        fail('face normal.');
  }
  const ids = new Set();
  for (const cell of page.instances) {
    if (
      !cell ||
      !idValid(cell.id) ||
      ids.has(cell.id) ||
      !templates.has(String(cell.type)) ||
      !boundedArray(cell.word, 256) ||
      !cell.word.every((i) => Number.isInteger(i) && i >= 0 && i <= 255)
    )
      fail('instance identity, type or word.');
    ids.add(cell.id);
    const scale = Math.max(1, ...cell.matrix.map(Math.abs));
    if (scale > 1e4) fail('coordinate scale exceeds 10000.');
    const check = frameDiagnostics(cell.matrix, 1e-12 * scale ** 2);
    transformResidual = Math.max(transformResidual, check.metricResidual);
    // Reflected cell charts can be improper; only observers must be proper.
    if (
      !check.future ||
      !Number.isFinite(check.metricResidual) ||
      !Number.isFinite(check.determinant) ||
      check.metricResidual > 1e-12 * scale ** 2
    )
      fail('instance is not a future Lorentz isometry.');
    if (
      cell.quotientState != null &&
      (!Number.isInteger(cell.quotientState) || cell.quotientState < 0 || cell.quotientState > 7)
    )
      fail('quotient state.');
  }
  if (!Number.isFinite(coordinateResidual) || coordinateResidual > 1e-8)
    fail('template hyperboloid residual exceeds 1e-8.');
  if (
    !boundedArray(page.neighbors, 16384) ||
    !page.coverage ||
    typeof page.coverage !== 'object' ||
    !page.residuals ||
    typeof page.residuals !== 'object'
  )
    fail('coverage, residuals or neighbor rows.');
  const bytes = new TextEncoder().encode(JSON.stringify(page)).byteLength;
  if (bytes > HYPERBOLIC_LIMITS.pageBytes) fail('page exceeds 4 MiB.');
  return { bytes, coordinateResidual, transformResidual };
}

function limit(value, maximum) {
  if (!Number.isInteger(value) || value < 1 || value > maximum)
    throw new RangeError('Invalid hyperbolic display budget.');
  return value;
}

// Neighboring buckets only find candidates; all four coordinates are compared.
export function vertexWelder() {
  const buckets = new Map(),
    vertices = [],
    tolerance = 1e-10;
  return (v) => {
    const cell = v.slice(1).map((x) => Math.floor(x / v[0] / tolerance));
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          const row = buckets.get(`${cell[0] + x},${cell[1] + y},${cell[2] + z}`);
          if (row)
            for (const id of row)
              if (v.every((a, i) => Math.abs(a - vertices[id][i]) <= 1e-12 * Math.max(1, v[0], vertices[id][0])))
                return id;
        }
    const id = vertices.length,
      key = cell.join(',');
    vertices.push(v);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(id);
    return id;
  };
}

export function* prepareHyperbolicSteps(input, options = {}, isCancelled = () => false, sampleCache = null) {
  if (Object.keys(options).some((k) => !['model', 'lod', 'maxEdges', 'maxSegments'].includes(k)))
    throw new RangeError('Page preparation does not accept pose or screen options.');
  const pages = Array.isArray(input) ? input : [input];
  if (!pages.length || pages.length > 4096) fail('page count.');
  const maxEdges = limit(options.maxEdges ?? HYPERBOLIC_LIMITS.edges, HYPERBOLIC_LIMITS.edges);
  const maxSegments = limit(options.maxSegments ?? HYPERBOLIC_LIMITS.segments, HYPERBOLIC_LIMITS.segments);
  const model = options.model ?? 'poincare',
    lod = options.lod ?? 'normal';
  hyperbolicSegmentCount(0, { model, lod });
  let bytes = 0,
    count = 0;
  const instances = new Set(),
    templates = new Map();
  for (const page of pages) {
    if (isCancelled()) throw abortProjection();
    const receipt = validatePatchPage(page);
    bytes += receipt.bytes;
    count += page.instances.length;
    if (bytes > HYPERBOLIC_LIMITS.cacheBytes || count > HYPERBOLIC_LIMITS.instances)
      fail('renderer cache exceeds 64 MiB or 4096 cells.');
    if (
      page.sourceHash !== pages[0].sourceHash ||
      page.anchorHash !== pages[0].anchorHash ||
      page.epoch !== pages[0].epoch
    )
      fail('mixed source/anchor/epoch.');
    for (const [key, t] of templateEntries(page.templates)) {
      if (templates.has(key) && JSON.stringify(templates.get(key)) !== JSON.stringify(t))
        fail('template changed between pages.');
      templates.set(key, t);
    }
    for (const cell of page.instances) {
      if (instances.has(cell.id)) fail('duplicate instance across pages.');
      instances.add(cell.id);
    }
    yield;
  }
  const samples = [],
    indices = [],
    segmentOwners = [],
    owners = [],
    edgeMap = new Map(),
    weld = vertexWelder();
  const reasons = new Set();
  let examined = 0,
    developedResidual = 0,
    sampleResidual = 0,
    maxAnchorRadius = 0,
    sampledEdges = 0,
    samplingCacheHits = 0;
  outer: for (const page of pages)
    for (const cell of page.instances) {
      if (isCancelled()) throw abortProjection();
      const t = templates.get(String(cell.type)),
        vertices = t.vertices.map((v) => transform(cell.matrix, v));
      for (const v of vertices) {
        developedResidual = Math.max(developedResidual, Math.abs(lorentzInner(v, v) + 1));
        maxAnchorRadius = Math.max(maxAnchorRadius, Math.acosh(Math.max(1, v[0])));
      }
      if (
        vertices.some(
          (v) =>
            v[0] > 1e4 || !v.every(Number.isFinite) || Math.abs(lorentzInner(v, v) + 1) > 1e-12 * Math.max(1, v[0]) ** 2
        )
      )
        fail('developed hyperboloid residual exceeds 1e-8.');
      const ids = vertices.map(weld);
      for (let edge = 0; edge < t.edges.length; edge++) {
        if (++examined % 2048 === 0) {
          yield;
          if (isCancelled()) throw abortProjection();
        }
        const [i, j] = t.edges[edge],
          key = ids[i] < ids[j] ? `${ids[i]}:${ids[j]}` : `${ids[j]}:${ids[i]}`;
        const identity = { instanceId: cell.id, edge };
        if (edgeMap.has(key)) {
          owners[edgeMap.get(key)].aliases.push(identity);
          continue;
        }
        if (owners.length >= maxEdges) {
          reasons.add('edge-cap');
          break outer;
        }
        const length = Math.acosh(Math.max(1, -lorentzInner(vertices[i], vertices[j])));
        const sampling = hyperbolicSegmentCount(length, { model, lod });
        if (sampling.capped) reasons.add('sample-count-cap');
        // Publish whole edges. A partial last edge would misrepresent incidence.
        if (segmentOwners.length + sampling.segments > maxSegments) {
          reasons.add('segment-cap');
          break outer;
        }
        const owner = owners.length,
          first = samples.length / 4;
        owners.push({ ...identity, quotientState: cell.quotientState ?? null, aliases: [] });
        edgeMap.set(key, owner);
        const sampleKey = sampleCache ? JSON.stringify([sampling.segments, ...vertices[i], ...vertices[j]]) : null;
        let edgeSamples = sampleCache?.get(sampleKey);
        if (edgeSamples) samplingCacheHits++;
        else {
          edgeSamples = new Float64Array((sampling.segments + 1) * 4);
          for (let k = 0; k <= sampling.segments; k++)
            edgeSamples.set(geodesicPoint(vertices[i], vertices[j], k / sampling.segments), k * 4);
          sampledEdges++;
        }
        for (let k = 0; k <= sampling.segments; k++) {
          const v = edgeSamples.subarray(k * 4, k * 4 + 4);
          sampleResidual = Math.max(sampleResidual, Math.abs(lorentzInner(v, v) + 1));
          if (
            !finiteVector(v, 4) ||
            v[0] <= 0 ||
            !Number.isFinite(sampleResidual) ||
            v[0] > 1e4 ||
            Math.abs(lorentzInner(v, v) + 1) > 1e-12 * Math.max(1, v[0]) ** 2
          )
            fail('sample hyperboloid residual exceeds 1e-8.');
          samples.push(...v);
          if (k) {
            indices.push(first + k - 1, first + k);
            segmentOwners.push(owner);
          }
        }
        if (sampleCache) sampleCache.set(sampleKey, edgeSamples);
      }
    }
  const samples64 = new Float64Array(samples);
  return {
    positions: new Float32Array(samples64),
    samples64,
    indices: new Uint32Array(indices),
    segmentOwners: new Uint32Array(segmentOwners),
    owners,
    quality: {
      capped: reasons.size > 0,
      reasons: [...reasons],
      uniqueEdges: owners.length,
      segments: segmentOwners.length,
      developedResidual,
      sampleResidual,
      maxAnchorRadius,
      sampledEdges,
      samplingCacheHits,
      model,
      lod,
      sampling: 'fixed hyperbolic length / LOD; no screen-space error guarantee',
      rendering: 'GPU hyperboloid wireframe',
      tubeRadius: 'rho*(1-|p|^2)/2 is a rendering approximation',
    },
    sourceHash: pages[0].sourceHash,
    anchorHash: pages[0].anchorHash,
    epoch: pages[0].epoch,
  };
}
export function prepareHyperbolicPatch(pages, options = {}) {
  const steps = prepareHyperbolicSteps(pages, options);
  let step;
  do {
    step = steps.next();
  } while (!step.done);
  return step.value;
}
// Retained export names for callers of the original preparation module.
export const projectHyperbolicSteps = prepareHyperbolicSteps;
export const projectHyperbolicPatch = prepareHyperbolicPatch;
export async function runHyperbolicJob(
  message,
  {
    isCancelled = () => false,
    sampleCache = null,
    yieldTask = () =>
      globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0)),
  } = {}
) {
  if (message.type !== 'prepare' || !Number.isSafeInteger(message.requestId) || message.requestId < 0)
    fail('worker request.');
  const first = Array.isArray(message.pages) ? message.pages[0] : message.pages;
  if (
    !first ||
    first.epoch !== message.epoch ||
    first.sourceHash !== message.sourceHash ||
    first.anchorHash !== message.anchorHash
  )
    fail('worker binding.');
  const started = performance.now();
  const steps = prepareHyperbolicSteps(message.pages, message.options, isCancelled, sampleCache);
  while (true) {
    if (isCancelled()) throw abortProjection();
    const step = steps.next();
    if (step.done)
      return {
        type: 'prepared',
        requestId: message.requestId,
        revision: message.revision,
        prepTimeMs: performance.now() - started,
        ...step.value,
      };
    await yieldTask();
  }
}
export function installHyperbolicWorker(scope) {
  let generation = 0,
    cacheKey = null,
    sampleCache = null;
  const listener = async ({ data }) => {
    const token = ++generation;
    if (data.type === 'cancel') return;
    try {
      const key = JSON.stringify([
        data.sourceHash,
        data.anchorHash,
        data.epoch,
        data.options?.model,
        data.options?.lod,
      ]);
      if (key !== cacheKey) {
        cacheKey = key;
        sampleCache = new HyperbolicSampleCache();
      }
      const result = await runHyperbolicJob(data, { isCancelled: () => token !== generation, sampleCache });
      if (token === generation)
        scope.postMessage(result, [
          result.positions.buffer,
          result.samples64.buffer,
          result.indices.buffer,
          result.segmentOwners.buffer,
        ]);
    } catch (error) {
      if (token === generation && error.name !== 'AbortError')
        scope.postMessage({
          type: 'error',
          requestId: data.requestId,
          epoch: data.epoch,
          sourceHash: data.sourceHash,
          anchorHash: data.anchorHash,
          revision: data.revision,
          error: error.message,
        });
    }
  };
  scope.addEventListener('message', listener);
  return () => {
    generation++;
    scope.removeEventListener('message', listener);
  };
}
if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope)
  installHyperbolicWorker(globalThis);
