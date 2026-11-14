import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  IDENTITY,
  assertObserver,
  advanceObserver,
  boost,
  rotation,
  multiply,
  lorentzInverse,
  lorentzGramSchmidt,
  observerDisplacement,
  HYPERBOLIC_LOD,
  transform,
  projectPoint,
  screenPoint,
  pointSegmentDistance,
  clipBallSegment,
} from './hyperbolic-math.mjs';
import { HYPERBOLIC_LIMITS, validatePatchPage, runHyperbolicJob } from './hyperbolic-worker.mjs';

export class HyperbolicNavigation {
  constructor(matrix = IDENTITY) {
    this.steps = 0;
    this.setObserver(matrix);
  }
  setObserver(matrix) {
    assertObserver(matrix);
    this.matrix = lorentzGramSchmidt(matrix);
  }
  compose(delta) {
    const result = advanceObserver(this.matrix, delta, ++this.steps);
    this.matrix = result.matrix;
    this.diagnostics = result;
    return result;
  }
  move(direction, distance) {
    return this.compose(boost(direction, distance));
  }
  look(yaw, pitch) {
    return this.compose(multiply(rotation([0, 1, 0], yaw), rotation([1, 0, 0], pitch)));
  }
  get displacement() {
    return observerDisplacement(this.matrix);
  }
  home() {
    this.steps = 0;
    this.setObserver(IDENTITY);
  }
}
export function createHyperbolicWorker() {
  return typeof Worker === 'undefined'
    ? null
    : new Worker(new URL('./hyperbolic-worker.mjs', import.meta.url), { type: 'module' });
}
const palette = [0x67d5f7, 0xffb86b, 0xc4a0ff, 0x78dfaa, 0xff91ac, 0xf3de78, 0x92aaff, 0xcebda7];
const rowMajor = (matrix) => matrix.clone().transpose().toArray();
const sameBinding = (a, b) =>
  a &&
  b &&
  a.epoch === b.epoch &&
  a.sourceHash === b.sourceHash &&
  a.anchorHash === b.anchorHash &&
  a.revision === b.revision;

export const HYPERBOLIC_PROJECTION_GLSL = `
vec3 projectHyperbolic(vec4 hyperboloid) {
  vec4 X = observerInverse * hyperboloid;
  return X.yzw / (X.x + (ballModel == 0 ? 1.0 : 0.0));
}`;
export const HYPERBOLIC_VERTEX_SHADER = `
attribute vec4 hyperboloid;
uniform mat4 observerInverse;
uniform int ballModel;
varying vec3 edgeColor;
varying float distanceFade;
${HYPERBOLIC_PROJECTION_GLSL}
void main() {
  vec3 ball = projectHyperbolic(hyperboloid);
  float t = max(1.0, (observerInverse * hyperboloid).x);
  float distance = log(t + sqrt(max(0.0, t * t - 1.0)));
  distanceFade = exp(-0.22 * distance);
  edgeColor = color;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(ball, 1.0);
}`;
export const HYPERBOLIC_FRAGMENT_SHADER = `
varying vec3 edgeColor;
varying float distanceFade;
void main() {
  gl_FragColor = vec4(edgeColor * distanceFade, 1.0);
  #include <colorspace_fragment>
}`;

export class HyperbolicViewer {
  constructor(canvas, options = {}) {
    if (typeof options === 'function') options = { onPick: options };
    this.options = options;
    this.container = canvas;
    this.disposed = false;
    this.pages = [];
    this.cacheBytes = 0;
    this.navigation = new HyperbolicNavigation();
    this.mode = 'overview';
    this.projectionModel = 'poincare';
    this.lod = 'normal';
    this.poseDirty = true;
    this.preparationDirty = false;
    this.stats = { drawFrames: 0, poseUpdates: 0, preparations: 0 };
    this.keys = new Set();
    this.listeners = [];
    this.generation = 0;
    this.nextRequest = 0;
    this.poseVersion = 0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.002, 20);
    this.camera.position.set(2, 1.3, 3);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas.tagName === 'CANVAS' ? canvas : undefined,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.canvas = this.renderer.domElement;
    this.ownsCanvas = this.canvas !== canvas;
    if (this.ownsCanvas) canvas.append(this.canvas);
    this.previousTabIndex = this.canvas.getAttribute('tabindex');
    this.canvas.tabIndex = 0;
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x15191f, 1);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = false;
    this.controls.minDistance = 1.15;
    this.controls.maxDistance = 8;
    this.listen(this.controls, 'change', () => this.invalidate());
    this.listen(this.controls, 'end', () => this.gestureEnd());
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('hyperboloid', new THREE.BufferAttribute(new Float32Array(0), 4));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
    this.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(0), 1));
    this.material = new THREE.ShaderMaterial({
      vertexColors: true,
      uniforms: { observerInverse: { value: new THREE.Matrix4() }, ballModel: { value: 0 } },
      vertexShader: HYPERBOLIC_VERTEX_SHADER,
      fragmentShader: HYPERBOLIC_FRAGMENT_SHADER,
    });
    this.lines = new THREE.LineSegments(this.geometry, this.material);
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);
    this.boundary = new THREE.Group();
    this.scene.add(this.boundary);
    const boundaryMaterial = new THREE.LineBasicMaterial({ color: 0x657285, transparent: true, opacity: 0.4 });
    for (let axis = 0; axis < 3; axis++) {
      const points = Array.from({ length: 128 }, (_, i) => {
        const angle = (i * Math.PI * 2) / 128,
          p = [0, 0, 0];
        p[(axis + 1) % 3] = Math.cos(angle);
        p[(axis + 2) % 3] = Math.sin(angle);
        return new THREE.Vector3(...p);
      });
      this.boundary.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), boundaryMaterial));
    }
    this.worker = options.workerFactory ? options.workerFactory() : createHyperbolicWorker();
    if (this.worker) {
      this.listen(this.worker, 'message', ({ data }) => this.receive(data));
      this.listen(this.worker, 'error', (event) => {
        event.preventDefault();
        this.cancelProjection();
        this.worker?.terminate();
        this.worker = null;
        this.diagnostic('Page preparation worker unavailable; using cooperative main-thread preparation.');
        this.invalidateGeometry();
      });
    }
    this.listen(this.canvas, 'keydown', (e) => this.keyDown(e));
    this.listen(this.canvas, 'keyup', (e) => {
      if (this.keys.delete(e.code)) {
        e.preventDefault();
        if (!this.keys.size) this.gestureEnd();
      }
    });
    this.listen(this.canvas, 'blur', () => {
      this.keys.clear();
      this.releasePointer();
      this.gestureEnd();
    });
    this.listen(this.canvas, 'lostpointercapture', () => {
      this.pointerId = null;
      this.gestureEnd();
    });
    this.listen(this.canvas, 'pointerdown', (e) => {
      this.canvas.focus({ preventScroll: true });
      this.down = [e.clientX, e.clientY];
    });
    this.listen(this.canvas, 'pointermove', (e) => {
      if (this.mode === 'explore' && this.pointerId === e.pointerId) {
        this.navigation.look(-e.movementX * 0.002, -e.movementY * 0.002);
        this.invalidate();
        this.changed = true;
      }
    });
    this.listen(this.canvas, 'pointerup', (e) => {
      if (this.pointerId === e.pointerId) {
        this.releasePointer();
        this.gestureEnd();
      } else if (this.down && Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) < 5) {
        const rect = this.canvas.getBoundingClientRect();
        this.pickAt(e.clientX - rect.left, e.clientY - rect.top);
      }
      this.down = null;
    });
    this.listen(this.canvas, 'pointercancel', () => {
      this.down = null;
      this.releasePointer();
      this.gestureEnd();
    });
    this.resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.resize());
    this.resizeObserver?.observe(canvas);
    this.resize();
    this.frame = (now) => {
      if (this.disposed) return;
      const dt = this.lastTime == null ? 0 : Math.min(0.1, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.tick(dt);
      this.render();
      this.animation = requestAnimationFrame(this.frame);
    };
    if (options.animate !== false) this.animation = requestAnimationFrame(this.frame);
  }
  listen(target, event, handler) {
    target.addEventListener(event, handler);
    this.listeners.push(() => target.removeEventListener(event, handler));
  }
  diagnostic(message) {
    this.lastDiagnostic = message;
    this.options.onDiagnostic?.(message);
  }
  invalidate() {
    this.poseVersion++;
    this.poseDirty = true;
  }
  invalidateGeometry() {
    this.preparationDirty = true;
    this.invalidate();
  }
  cancelProjection() {
    this.generation++;
    this.activeJob = null;
    this.queuedJob = null;
    this.worker?.postMessage({ type: 'cancel' });
  }
  beginEpoch({ epoch, sourceHash, anchorHash, revision = 0 }) {
    this.cancelProjection();
    this.rebaseController?.abort();
    this.rebasePending = false;
    this.binding = { epoch, sourceHash, anchorHash, revision };
    this.pages = [];
    this.cacheBytes = 0;
    this.published = null;
    this.geometry.setDrawRange(0, 0);
    this.invalidateGeometry();
  }
  setPatch(page, { append = false, revision = this.binding?.revision ?? 0 } = {}) {
    const receipt = validatePatchPage(page),
      incoming = { epoch: page.epoch, sourceHash: page.sourceHash, anchorHash: page.anchorHash, revision };
    if (this.binding && !sameBinding(this.binding, incoming)) return false;
    const pages = append ? [...this.pages, page] : [page],
      bytes = (append ? this.cacheBytes : 0) + receipt.bytes;
    if (
      bytes > HYPERBOLIC_LIMITS.cacheBytes ||
      pages.reduce((n, p) => n + p.instances.length, 0) > HYPERBOLIC_LIMITS.instances
    )
      throw new RangeError('Hyperbolic renderer cache limit: 64 MiB / 4096 cells.');
    const ids = new Set();
    for (const p of pages)
      for (const cell of p.instances) {
        if (ids.has(cell.id)) throw new RangeError('Duplicate hyperbolic cell identity.');
        ids.add(cell.id);
      }
    this.binding = incoming;
    this.pages = pages;
    this.cacheBytes = bytes;
    this.cancelProjection();
    this.invalidateGeometry();
    return true;
  }
  setModel(model, { view = {}, revision = 0 } = {}) {
    if (model?.kind !== 'hyperbolic-space')
      throw new RangeError('HyperbolicViewer requires a hyperbolic-space document.');
    const patch = model.anchorPatch;
    validatePatchPage(patch);
    this.beginEpoch({ ...patch, revision });
    this.model = model;
    this.anchor = view.anchor ?? null;
    this.setView(view);
    this.setPatch(patch, { revision });
  }
  setProjection(model) {
    if (!['poincare', 'klein'].includes(model)) throw new RangeError('Use the Poincaré ball or Klein model.');
    if (model !== this.projectionModel) {
      this.projectionModel = model;
      this.cancelProjection();
      this.published = null;
      this.geometry.setDrawRange(0, 0);
      this.invalidateGeometry();
    }
  }
  setLOD(lod) {
    if (!Object.hasOwn(HYPERBOLIC_LOD, lod)) throw new RangeError('Use coarse, normal or fine hyperbolic LOD.');
    if (this.lod !== lod) {
      this.lod = lod;
      this.cancelProjection();
      this.invalidateGeometry();
    }
  }
  setView(view = {}) {
    this.setProjection(view.hyperbolicModel ?? 'poincare');
    this.setLOD(view.hyperbolicLod ?? 'normal');
    if (view.observerMatrix) this.navigation.setObserver(view.observerMatrix);
    this.anchor = view.anchor ?? this.anchor;
    if (view.mode === 'explore') this.enterExplore();
    else this.exitExplore();
    if (view.overview && this.mode === 'overview') {
      if (
        Array.isArray(view.overview.position) &&
        view.overview.position.length === 3 &&
        view.overview.position.every(Number.isFinite)
      )
        this.camera.position.fromArray(view.overview.position);
      if (
        Array.isArray(view.overview.target) &&
        view.overview.target.length === 3 &&
        view.overview.target.every(Number.isFinite)
      )
        this.controls.target.fromArray(view.overview.target);
      this.controls.update();
    }
    this.invalidate();
  }
  getView() {
    return {
      hyperbolicModel: this.projectionModel,
      hyperbolicLod: this.lod,
      mode: this.mode,
      observerMatrix: [...this.navigation.matrix],
      anchor: this.anchor ?? null,
      overview:
        this.mode === 'explore' && this.overview
          ? this.overview
          : { position: this.camera.position.toArray(), target: this.controls.target.toArray() },
    };
  }
  enterExplore({ pointerEvent } = {}) {
    if (this.mode !== 'explore') {
      this.overview = { position: this.camera.position.toArray(), target: this.controls.target.toArray() };
    }
    this.mode = 'explore';
    this.controls.enabled = false;
    this.boundary.visible = false;
    this.camera.position.set(0, 0, 0);
    this.camera.quaternion.identity();
    this.camera.updateMatrixWorld();
    if (pointerEvent) this.capturePointer(pointerEvent);
    this.invalidateGeometry();
  }
  exitExplore() {
    this.releasePointer();
    this.keys.clear();
    this.mode = 'overview';
    this.controls.enabled = true;
    this.boundary.visible = true;
    if (this.overview) {
      this.camera.position.fromArray(this.overview.position);
      this.controls.target.fromArray(this.overview.target);
    }
    this.controls.update();
    this.invalidateGeometry();
  }
  capturePointer(event) {
    if (this.mode !== 'explore' || !Number.isInteger(event?.pointerId)) return false;
    event.preventDefault?.();
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      return false;
    }
    this.pointerId = event.pointerId;
    this.canvas.focus({ preventScroll: true });
    return true;
  }
  releasePointer() {
    if (this.pointerId != null && this.canvas.hasPointerCapture(this.pointerId))
      this.canvas.releasePointerCapture(this.pointerId);
    this.pointerId = null;
  }
  async home() {
    this.rebaseController?.abort();
    this.rebasePending = false;
    if (!this.options.onRebase && !this.anchor) {
      this.navigation.home();
      this.exitExplore();
      return true;
    }
    return this.requestRebase({ home: true });
  }
  keyDown(event) {
    if (event.code === 'Escape') {
      event.preventDefault();
      this.exitExplore();
      this.changed = true;
      this.gestureEnd();
      return;
    }
    if (
      this.mode !== 'explore' ||
      !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)
    )
      return;
    event.preventDefault();
    this.keys.add(event.code);
  }
  tick(dt) {
    if (this.mode !== 'explore' || !dt || !this.keys.size) return;
    if (this.navigation.displacement >= 0.7) {
      void this.requestRebase();
      if (!this.options.onRebase) return;
    }
    const axis = [
      Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')),
      0,
      Number(this.keys.has('KeyS')) - Number(this.keys.has('KeyW')),
    ];
    const yaw = Number(this.keys.has('ArrowLeft')) - Number(this.keys.has('ArrowRight'));
    const pitch = Number(this.keys.has('ArrowUp')) - Number(this.keys.has('ArrowDown'));
    if (Math.hypot(...axis)) this.navigation.move(axis, dt * 0.4);
    if (yaw || pitch) this.navigation.look(yaw * dt * 0.8, pitch * dt * 0.8);
    this.changed = true;
    this.invalidate();
    if (this.navigation.displacement >= 0.7) void this.requestRebase();
  }
  async requestRebase({ home = false } = {}) {
    if (this.rebasePending || this.disposed) return false;
    if (!this.options.onRebase) {
      this.keys.clear();
      this.diagnostic('Navigation paused at one hyperbolic unit: a nearby engine anchor is required.');
      this.gestureEnd();
      return false;
    }
    const binding = { ...this.binding },
      requestedObserver = [...this.navigation.matrix],
      controller = new AbortController();
    this.rebaseController = controller;
    this.rebasePending = true;
    try {
      const result = await this.options.onRebase({
        ...binding,
        observerMatrix: requestedObserver,
        home,
        anchor: this.anchor ?? null,
        signal: controller.signal,
      });
      if (this.disposed || controller.signal.aborted || !sameBinding(binding, this.binding)) return false;
      const pages = result.pages ?? [result.patch];
      if (!pages.length || pages.length > 4096) throw new RangeError('Rebase requires bounded replacement pages.');
      if (!result.observerMatrix) assertObserver(result.anchorTransform);
      const anchorTransform =
        result.anchorTransform ?? multiply(requestedObserver, lorentzInverse(result.observerMatrix));
      assertObserver(anchorTransform);
      let bytes = 0,
        cells = 0;
      const ids = new Set();
      for (const page of pages) {
        bytes += validatePatchPage(page).bytes;
        cells += page.instances.length;
        if (
          page.epoch !== pages[0].epoch ||
          page.sourceHash !== binding.sourceHash ||
          page.anchorHash !== pages[0].anchorHash
        )
          throw new RangeError('Rebase page binding mismatch.');
        for (const cell of page.instances) {
          if (ids.has(cell.id)) throw new RangeError('Duplicate rebase cell.');
          ids.add(cell.id);
        }
      }
      if (bytes > HYPERBOLIC_LIMITS.cacheBytes || cells > HYPERBOLIC_LIMITS.instances)
        throw new RangeError('Rebase cache limit exceeded.');
      if (result.anchor == null) throw new RangeError('Rebase must retain the engine-supplied anchor/address.');
      if (new TextEncoder().encode(JSON.stringify(result.anchor)).byteLength > 64 * 1024)
        throw new RangeError('Navigation address exceeds 64 KiB.');
      this.cancelProjection();
      const replacementBinding = {
        epoch: pages[0].epoch,
        sourceHash: binding.sourceHash,
        anchorHash: pages[0].anchorHash,
        revision: binding.revision,
      };
      const displayOptions = () => ({
        model: !home && this.mode === 'explore' ? 'klein' : this.projectionModel,
        lod: this.lod ?? 'normal',
      });
      let prepared, preparedOptions;
      do {
        preparedOptions = displayOptions();
        prepared = await runHyperbolicJob(
          { type: 'prepare', requestId: ++this.nextRequest, ...replacementBinding, pages, options: preparedOptions },
          { isCancelled: () => this.disposed || controller.signal.aborted || !sameBinding(binding, this.binding) }
        );
      } while (JSON.stringify(preparedOptions) !== JSON.stringify(displayOptions()));
      if (controller.signal.aborted || this.disposed || !sameBinding(binding, this.binding)) return false;
      const nextObserver = home ? IDENTITY : multiply(lorentzInverse(anchorTransform), this.navigation.matrix);
      assertObserver(nextObserver);
      this.cancelProjection();
      this.binding = replacementBinding;
      this.pages = pages;
      this.cacheBytes = bytes;
      this.navigation.setObserver(nextObserver);
      this.anchor = result.anchor;
      this.publishPrepared(prepared);
      this.preparationDirty = false;
      if (home) {
        this.navigation.home();
        this.exitExplore();
        this.camera.position.set(2, 1.3, 3);
        this.controls.target.set(0, 0, 0);
        this.overview = null;
        this.controls.update();
        this.preparationDirty = false;
      }
      this.changed = true;
      this.invalidate();
      this.options.onRebased?.(this.getView(), { pages: this.pages, binding: { ...this.binding } });
      return true;
    } catch (error) {
      if (!controller.signal.aborted && !this.disposed) {
        this.keys.clear();
        this.diagnostic(`Navigation paused: ${error.message}`);
      }
      return false;
    } finally {
      if (this.rebaseController === controller) {
        this.rebasePending = false;
        this.rebaseController = null;
        this.gestureEnd();
      }
    }
  }
  gestureEnd() {
    if (this.changed) {
      this.changed = false;
      this.options.onViewChange?.(this.getView());
    } else if (this.mode === 'overview') this.options.onViewChange?.(this.getView());
  }
  resize(width = this.container.clientWidth || 1, height = this.container.clientHeight || 1) {
    if (this.disposed) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
    this.invalidate();
  }
  projectionJob() {
    return {
      type: 'prepare',
      requestId: ++this.nextRequest,
      ...this.binding,
      pages: this.pages,
      options: { model: this.mode === 'explore' ? 'klein' : this.projectionModel, lod: this.lod },
      generation: this.generation,
    };
  }
  updateObserverUniform() {
    const inverse = this.mode === 'explore' ? lorentzInverse(this.navigation.matrix) : IDENTITY;
    this.material.uniforms.observerInverse.value.fromArray(new Float32Array(inverse)).transpose();
    this.material.uniforms.ballModel.value = this.mode !== 'explore' && this.projectionModel === 'poincare' ? 0 : 1;
    this.poseDirty = false;
    if (this.published) this.stats.poseUpdates++;
  }
  startProjection(job) {
    this.activeJob = job;
    if (this.worker) this.worker.postMessage(job);
    else {
      const generation = this.generation;
      runHyperbolicJob(job, { isCancelled: () => this.disposed || generation !== this.generation })
        .then((result) => this.receive(result))
        .catch((error) => {
          if (error.name !== 'AbortError') this.receive({ ...job, type: 'error', error: error.message });
        });
    }
  }
  receive(result) {
    const job = this.activeJob;
    if (
      this.disposed ||
      !job ||
      result.requestId !== job.requestId ||
      !sameBinding(result, this.binding) ||
      job.generation !== this.generation
    )
      return false;
    this.activeJob = null;
    if (result.type === 'error') this.diagnostic(result.error);
    else if (result.type === 'prepared') this.publishPrepared(result);
    const queued = this.queuedJob;
    this.queuedJob = null;
    if (queued && queued.generation === this.generation) this.startProjection(queued);
    return true;
  }
  publishPrepared(result) {
    this.geometry.dispose();
    this.geometry.setAttribute('hyperboloid', new THREE.BufferAttribute(result.positions, 4));
    this.geometry.setIndex(new THREE.BufferAttribute(result.indices, 1));
    this.geometry.boundingSphere = null;
    this.geometry.boundingBox = null;
    const colors = new Float32Array((result.positions.length / 4) * 3),
      tints = palette.map((c) => new THREE.Color(c));
    for (let i = 0; i < result.segmentOwners.length; i++) {
      const owner = result.owners[result.segmentOwners[i]],
        color = tints[owner.quotientState ?? 0];
      for (const vertex of [result.indices[i * 2], result.indices[i * 2 + 1]])
        colors.set([color.r, color.g, color.b], vertex * 3);
    }
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geometry.setDrawRange(0, result.indices.length);
    this.published = result;
    this.stats.preparations++;
    this.invalidate();
    result.quality.prepTimeMs = result.prepTimeMs;
    this.options.onQuality?.(result.quality);
  }
  render() {
    if (this.disposed) return;
    if (this.controls.enabled) this.controls.update();
    if (this.preparationDirty && this.pages.length) {
      this.preparationDirty = false;
      const job = this.projectionJob();
      if (this.activeJob) this.queuedJob = job;
      else this.startProjection(job);
    }
    if (this.poseDirty) this.updateObserverUniform();
    const firstGeometry = this.published && !this.firstGeometryRendered;
    const startedAt = firstGeometry ? performance.now() : 0;
    this.renderer.render(this.scene, this.camera);
    this.stats.drawFrames++;
    if (firstGeometry) {
      this.firstGeometryRendered = true;
      this.options.onFirstGeometry?.({
        renderMs: performance.now() - startedAt,
        quality: this.published.quality,
        instances: this.pages.reduce((n, page) => n + page.instances.length, 0),
      });
    }
  }
  draw() {
    this.render();
  }
  pickAt(x, y) {
    if (!this.published) return null;
    const { samples64, indices, segmentOwners, owners } = this.published;
    const inverse = this.mode === 'explore' ? lorentzInverse(this.navigation.matrix) : IDENTITY;
    this.camera.updateMatrixWorld();
    const screenMatrix = rowMajor(
      new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)
    );
    const points = [];
    for (let i = 0; i < samples64.length; i += 4)
      points.push(
        projectPoint(
          transform(inverse, samples64.subarray(i, i + 4)),
          this.mode === 'explore' ? 'klein' : this.projectionModel
        )
      );
    const screen = { screenMatrix, width: this.width, height: this.height };
    let closest = this.options.pickRadiusPx ?? 6,
      owner = null;
    for (let i = 0; i < indices.length; i += 2) {
      const clipped = clipBallSegment(points[indices[i]], points[indices[i + 1]], screenMatrix);
      if (!clipped) continue;
      const a = screenPoint(clipped[0], screen),
        b = screenPoint(clipped[1], screen);
      if (!a || !b) continue;
      const distance = pointSegmentDistance([x, y], a, b);
      if (distance <= closest) {
        closest = distance;
        owner = owners[segmentOwners[i / 2]];
      }
    }
    if (!owner) return null;
    const identity = { instanceId: owner.instanceId, edge: owner.edge };
    this.options.onPick?.(identity);
    return identity;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animation);
    this.rebaseController?.abort();
    this.releasePointer();
    this.keys.clear();
    this.cancelProjection();
    this.worker?.terminate();
    this.resizeObserver?.disconnect();
    this.listeners.splice(0).forEach((remove) => remove());
    this.controls.dispose();
    this.geometry.dispose();
    this.material.dispose();
    for (const line of this.boundary.children) line.geometry.dispose();
    this.boundary.children[0]?.material.dispose();
    this.renderer.dispose();
    if (this.ownsCanvas) this.canvas.remove();
    else if (this.previousTabIndex == null) this.canvas.removeAttribute('tabindex');
    else this.canvas.setAttribute('tabindex', this.previousTabIndex);
    this.pages = [];
    this.cacheBytes = 0;
    this.published = null;
    this.model = null;
  }
}
