import { sourceRange, sourceFunction, matchAllSource } from './source-match.mjs';
// CPU harness for the actual app navigation/display functions. Native reports,
// unrelated panels and DOM layout are controlled; Viewer/content remain real.
import * as THREE from 'three';
import { Viewer } from '../../ui/viewer.js';
import { ElementContentControls } from '../../ui/element-content-controls.mjs';
import { pointRadius } from '../../ui/geometry-bounds.mjs';
import { syncPrecisionContext } from '../../ui/precision-evidence.mjs';
import { fakeRenderer } from './fake-renderer.mjs';

const node = () => ({
  value: '',
  textContent: '',
  dataset: {},
  parentElement: {},
  options: [],
  append() {},
  replaceChildren() {},
});
const canvas = () => ({
  width: 0,
  height: 0,
  getContext: () => ({
    clearRect() {},
    drawImage() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    measureText: (t) => ({ width: t.length * 7 }),
    fillText() {},
  }),
});

export function navigationDisplayHarness(source, initialState, { descriptor = null, describe, workerFactory } = {}) {
  const code = [
    'displayBase',
    'displayDiagnostic',
    'renderWorkspace',
    'selectEntity',
    'selectEntityType',
    'syncDerivedSelection',
    'selectionSummary',
    'describeSelection',
  ]
    .map((name) => sourceFunction(source, name))
    .join('\n');
  const nodes = new Map(),
    get = (id) => {
      if (!nodes.has(id)) nodes.set(id, node());
      return nodes.get(id);
    };
  get('selection-kind').options = ['vertex', 'edge', 'face', 'cell'].map((value) => ({ value }));
  const counts = { displays: 0, describes: 0, dirty: 0, syncs: [], pending: [], errors: [] };
  const v = Object.create(Viewer.prototype);
  v.group = new THREE.Group();
  v.orthographicCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 1000);
  v.perspectiveCamera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
  v.orthographicHalfHeight = 2;
  v.cameraProjection =
    initialState.view.stereoMode && initialState.view.stereoMode !== 'none'
      ? 'perspective'
      : initialState.view.cameraProjection || 'orthographic';
  v.camera = v.cameraProjection === 'perspective' ? v.perspectiveCamera : v.orthographicCamera;
  v.camera.position.set(0, 0, 6);
  v.camera.lookAt(0, 0, 0);
  v.camera.updateMatrixWorld();
  v.controls = { target: new THREE.Vector3(), update() {} };
  v.bindControls = () => {};
  v.renderer = fakeRenderer();
  v.stereographicWorkerFactory = workerFactory || (() => null);
  v.stereographicWorkerClock = { now: () => 0, setTimer: () => 1, clearTimer() {} };
  v.setDisplay = function (...args) {
    counts.displays++;
    return Viewer.prototype.setDisplay.apply(this, args);
  };
  const scope = {
    project: { active: 0, documents: [{ id: 'navigation-document', cursor: 0, states: [initialState] }] },
    base: v,
    derived: { model: null },
    pointRadius,
    syncPrecisionContext,
    document: { getElementById: (id) => (id === 'precision-details' ? null : get(id)) },
    $: get,
    format: String,
    PLANES: [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3],
    ],
    regular4dButton: node(),
    safeIndex: (text, count) => {
      const index = Number(text);
      if (!Number.isInteger(index) || index < 0 || index >= count) throw Error('Invalid entity index');
      return index;
    },
    el: (_tag, text) => ({ ...node(), textContent: text }),
    markDirty: () => counts.dirty++,
    welcome: { close() {} },
    coxeterBuilder: null,
    renderTabs() {},
    renderHistory() {},
    syncCatalogSelection() {},
    refreshAnalysis() {},
    refreshDerived() {},
    error: (e) => counts.errors.push(e),
  };
  scope.doc = () => scope.project.documents[scope.project.active];
  scope.state = () => scope.doc().states[scope.doc().cursor];
  scope.model = () => scope.state().model;
  const controlNames = new Set([...matchAllSource(code, /\b(\w+)(?:\?\.|\.)sync\(\)/g)].map((match) => match[1]));
  for (const name of [
    'workspaceAvailability',
    'reports',
    'derivedWork',
    'dualMorph',
    'automaticFaceting',
    'facetingDiagram',
    'reinforcement',
    'coincidentAssembly',
    'densityInfo',
    'projectionFit',
    'animationRenderer',
    'intrinsicReports',
    ...controlNames,
  ]) {
    scope[name] = {
      sync: () => counts.syncs.push({ name, selection: get('selection-kind').value, index: get('selection-id').value }),
      invalidate() {},
      cancel() {},
      stop() {},
      reset() {},
      clearTracks() {},
      restoreSaved: async () => {},
      restoreSavedExplosion: async () => {},
    };
  }
  scope.coxeterBuilder.close = () => {};
  scope.viewportControls.canEdit = () => true;
  const context = {
    getState: scope.state,
    getDocument: scope.doc,
    getProject: () => scope.project,
    viewer: v,
    isExporting: () => false,
    describe: async (model, params, options) => {
      counts.describes++;
      options.verifyPublication();
      return describe ? describe(model, params, options) : structuredClone(descriptor);
    },
    render: async (viewer, value, { sourceSnapshot, signal, verifyPublication } = {}) => {
      verifyPublication?.();
      const result = await viewer.setElementContent(value, {
        sourceModel: sourceSnapshot,
        signal,
        makeCanvas: canvas,
        decodeImage: async () => ({ width: 2, height: 2, close() {} }),
        isCurrent: () => {
          try {
            verifyPublication?.();
            return true;
          } catch {
            return false;
          }
        },
      });
      verifyPublication?.();
      return result;
    },
  };
  const content = Object.assign(Object.create(ElementContentControls.prototype), {
    context,
    jobs: new Map(),
    sync() {},
    node: (key) => get('element-content-' + key),
  });
  const display = content.display.bind(content);
  content.display = (...args) => {
    const result = display(...args);
    counts.pending.push(result.pending);
    return result;
  };
  scope.elementContent = content;
  // Keep app-created plain records in the same realm as the real content
  // validators. A VM's foreign object prototypes would correctly be refused.
  Object.assign(
    scope,
    new Function(
      'scope',
      `const ctx=scope;with(scope){${code}\nreturn {renderWorkspace,selectEntity,displayBase,displayDiagnostic,selectEntityType,syncDerivedSelection,selectionSummary,describeSelection};}`
    )(scope)
  );
  return {
    scope,
    v,
    content,
    counts,
    get,
    async settle() {
      await Promise.allSettled(counts.pending);
      await Promise.resolve();
    },
    close() {
      content.invalidate();
      v.clear();
    },
  };
}

export function displayBuffers(viewer) {
  const buffers = {};
  for (const field of ['edgeGeometry', 'pointGeometry', 'surfaceGeometry', 'highlightGeometry']) {
    buffers[field] = Object.fromEntries(
      Object.entries(viewer[field].attributes).map(([name, attribute]) => [
        name,
        { itemSize: attribute.itemSize, array: Array.from(attribute.array) },
      ])
    );
  }
  return JSON.parse(
    JSON.stringify({
      buffers,
      selected: viewer.selected,
      projected: viewer.projected,
      visibility: viewer.visibility,
      sourceTriangles: viewer.sourceTriangles,
      renderTriangles: viewer.renderTriangles,
      center: viewer.center,
      radius: viewer.radius,
    })
  );
}
