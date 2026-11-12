import { NumericEntry } from './numeric-entry.mjs';
import { StereoControls } from './stereo-controls.mjs';
import { holdObservationControls } from './observation-controls.mjs';
import { Direct4D } from './direct-4d.mjs';
import { canvasOverlays } from './canvas-overlays.mjs';
const AXES = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3],
  ],
  PLANES = ['XY', 'XZ', 'XW', 'YZ', 'YW', 'ZW'];
const $ = (id) => document.getElementById(id);
const DISPLAY_FIELDS = {
  projection: 'projection',
  'faces-visible': 'faces',
  'vertices-visible': 'vertices',
  'face-fill-rule': 'fillRule',
  'surface-colors': 'surfaceColors',
  'surface-opacity': 'surfaceOpacity',
};

export class ViewportControls {
  constructor(context) {
    this.context = context;
    this.playing = false;
    this.source = null;
    this.drag = null;
    const toolbar = document.querySelector('.view-toolbar');
    const projection = $('projection');
    this.projectionLabel = document.createElement('label');
    this.projectionLabel.id = 'projection-label';
    this.projectionLabel.htmlFor = 'projection';
    this.projectionLabel.textContent = '4D projection';
    projection.before(this.projectionLabel);
    projection.setAttribute('aria-label', '4D projection to 3D');
    projection.title = '4D projection: maps the fourth dimension into the 3D scene';
    const select = (id, label, options) => {
      let node = $(id);
      if (node) return node;
      node = document.createElement('select');
      node.id = id;
      node.setAttribute('aria-label', label);
      node.title = label;
      for (const [value, text] of options) node.add(new Option(text, value));
      toolbar.append(node);
      return node;
    };
    this.camera = select('camera-projection', '3D camera projection', [
      ['orthographic', 'Camera: parallel'],
      ['perspective', 'Camera: perspective'],
    ]);
    this.stereo = select('stereo-mode', 'Stereoscopic display', [
      ['none', 'Stereo: off'],
      ['anaglyph', 'Red/cyan glasses'],
      ['parallel', 'Parallel stereo'],
      ['cross-eyed', 'Cross-eyed stereo'],
    ]);
    this.stereoControls = new StereoControls(context, document.querySelector('.workspace-shelf'));
    this.stereo.onchange = () => {
      if (!this.canEdit()) return this.sync();
      const view = this.view();
      view.stereoMode = this.stereo.value;
      if (view.stereoMode !== 'none') view.cameraProjection = 'perspective';
      this.context.display();
      this.persistCamera();
      this.sync();
    };
    this.orientation = select('view-orientation', 'View direction', [
      ['free', 'View: free'],
      ['isometric', 'Isometric'],
      ['x', 'Along X'],
      ['y', 'Along Y'],
      ['z', 'Along Z'],
    ]);
    const settings = $('rotation-controls');
    const row = document.createElement('div');
    row.className = 'spin-controls';
    this.plane = document.createElement('select');
    this.plane.id = 'auto-rotation-plane';
    this.plane.setAttribute('aria-label', 'Auto rotation plane');
    PLANES.forEach((label, i) => this.plane.add(new Option(label, String(i))));
    this.speed = document.createElement('input');
    this.speed.id = 'auto-rotation-speed';
    this.speed.type = 'text';
    this.speed.maxLength = 512;
    this.speed.setAttribute('aria-label', 'Rotation speed in degrees per second');
    const label = document.createElement('label');
    label.textContent = 'Spin ';
    label.append(this.plane);
    const speedLabel = document.createElement('label');
    speedLabel.textContent = '°/s ';
    speedLabel.append(this.speed);
    row.append(label, speedLabel);
    settings.prepend(row);
    const gestureLabel = document.createElement('label');
    gestureLabel.className = 'four-dimensional-drag';
    gestureLabel.setAttribute('data-expert', '');
    this.gesture = document.createElement('input');
    this.gesture.type = 'checkbox';
    this.gesture.id = 'four-dimensional-drag';
    gestureLabel.append(this.gesture, ' Drag in 4D');
    row.append(gestureLabel);
    this.gestureLabel = gestureLabel;
    this.camera.onchange = () => {
      if (!this.canEdit()) return this.sync();
      this.context.cancelProjectionFit?.();
      const view = this.view();
      view.cameraProjection = this.camera.value;
      if (view.cameraProjection === 'orthographic') view.stereoMode = 'none';
      this.context.display();
      this.persistCamera();
      this.sync();
    };
    this.orientation.onchange = () => {
      if (!this.canEdit()) return this.sync();
      this.context.cancelProjectionFit?.();
      if (this.orientation.value === 'free') return;
      this.context.base.snap(this.orientation.value);
      this.persistCamera();
    };
    $('fit-view').onclick = () => {
      if (!this.canEdit()) return;
      this.context.cancelProjectionFit?.();
      this.context.base.fit();
      this.persistCamera();
    };
    $('viewport-layout').onchange = () => {
      if (!this.canEdit()) return this.sync();
      this.view().viewportLayout = $('viewport-layout').value;
      this.sync();
      this.context.markDirty();
    };
    $('render-style').onchange = () => this.setPresentation($('render-style').value);
    $('auto-rotate').onclick = () => this.toggle();
    $('animate').onclick = () => this.toggle();
    $('animate').hidden = true;
    this.plane.onchange = () => {
      if (this.canEdit()) {
        this.view().rotationPlane = Number(this.plane.value);
        this.context.markDirty();
      }
    };
    this.speed.onchange = context.guard(() => this.editSpeed());
    this.gesture.onchange = () => {
      if (this.canEdit()) {
        this.view().drag4D = this.gesture.checked;
        this.context.markDirty();
      }
    };
    for (const [id, cls] of [
      ['toggle-library', 'library-hidden'],
      ['toggle-inspector', 'inspector-hidden'],
    ]) {
      $(id).onclick = () => {
        document.body.classList.toggle(cls);
        this.syncSidebars();
      };
    }
    // Native groups close sibling panels synchronously, including keyboard and
    // programmatic opens. Nested details retain their independent state.
    const panels = '.workspace-shelf > details';
    document.querySelectorAll(panels).forEach((item) => item.setAttribute('name', 'viewport-tools'));
    const closePanels = (keepAppearance = false) =>
      document.querySelectorAll(panels).forEach((item) => {
        if (!keepAppearance || item.id !== 'surface-settings') item.open = false;
      });
    const overlayOpen = () =>
      !!document.querySelector('dialog[open]') || document.getElementById('presentation-showcase')?.hidden === false;
    document.addEventListener('pointerdown', (event) => {
      if (!overlayOpen() && !event.target.closest('.workspace-shelf,.timeline-panel')) closePanels(true);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !overlayOpen()) closePanels();
    });
    const canvas = this.context.base.renderer.domElement;
    for (const event of ['pointerdown', 'wheel'])
      canvas.addEventListener(
        event,
        () => {
          if (this.startupRotation) this.stop();
        },
        true
      );
    canvas.addEventListener(
      'pointerdown',
      (event) => {
        if (this.drag) {
          event.stopImmediatePropagation();
          event.preventDefault();
          return;
        }
        const source = this.context.getState();
        if (
          event.button !== 0 ||
          !this.canEdit() ||
          this.context.getModel()?.dimension !== 4 ||
          !(event.shiftKey || this.view().drag4D)
        )
          return;
        if (this.direct4D) return this.direct4D.begin(event, canvas);
        this.context.cancelProjectionFit?.();
        this.stop();
        this.context.stopTrack();
        event.stopImmediatePropagation();
        event.preventDefault();
        this.drag = {
          source,
          x: event.clientX,
          y: event.clientY,
          angles: [...source.view.angles],
          observation: holdObservationControls([this.context.base]),
          canvas,
          pointer: event.pointerId,
        };
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch (error) {
          this.endDrag();
          throw error;
        }
      },
      true
    );
    canvas.addEventListener(
      'pointermove',
      (event) => {
        if (!this.drag || event.pointerId !== this.drag.pointer) return;
        event.stopImmediatePropagation();
        event.preventDefault();
        if (this.context.getState() !== this.drag.source || !this.canEdit()) {
          this.endDrag();
          return;
        }
        if (this.direct4D) return this.direct4D.move(event);
        const wrap = (value) => ((((value + 180) % 360) + 360) % 360) - 180,
          view = this.view();
        view.angles[2] = wrap(this.drag.angles[2] + (event.clientX - this.drag.x) * 0.35);
        view.angles[4] = wrap(this.drag.angles[4] - (event.clientY - this.drag.y) * 0.35);
        (this.context.displayPose || this.context.display)();
        this.context.syncPose();
        (this.context.markPoseDirty || this.context.markDirty)?.();
      },
      true
    );
    const end = (event) => {
      if (this.drag) {
        if (this.direct4D) return this.direct4D.finish(event);
        event.stopImmediatePropagation();
        this.endDrag();
        this.context.markDirty();
      }
    };
    canvas.addEventListener('pointerup', end, true);
    canvas.addEventListener('pointercancel', end, true);
    canvas.addEventListener('lostpointercapture', () => {
      if (this.drag) this.direct4D?.cancel();
      this.endDrag();
    });
    this.direct4D = new Direct4D(context, this);
    this.overlays = canvasOverlays(document, context.base.container.parentElement);
    this.overlays?.configure({
      ...context,
      canEdit: () => this.canEdit(),
      stop: () => {
        this.stop();
        context.stopTrack?.();
      },
      turn: () => this.direct4D.demoTurn(),
      build: () => globalThis.openCoxeterBuilder?.(),
    });
    this.overlays?.configure({
      refitOverlay: () => {
        const base = context.base;
        if (this.canEdit() && base.fitCameraSignature && base.fitCameraSignature === JSON.stringify(base.cameraState()))
          this.frameModel();
      },
    });
    context.base.getFitInsets = () => this.overlays?.safeInsets() || {};
    context.base.getFitPadding = () => 1.1;
    context.base.onAutoFit = (camera) => {
      if (this.canEdit()) {
        this.view().camera = camera;
        (context.markPoseDirty || context.markDirty)();
      }
    };
    toolbar.addEventListener('input', (event) => {
      if (event.target.id === 'perspective-strength' && this.canEdit()) this.frameModel();
    });
    this.syncSidebars();
  }
  async editSpeed() {
    if (!this.canEdit()) throw Error('Finish export before editing rotation speed.');
    if (this.numericEntry?.busy) throw Error('Finish or cancel the current speed edit first.');
    const entry = new NumericEntry({
      ...this.context,
      getTarget: () => ({ text: this.speed.value, speed: this.view()?.rotationSpeed ?? 12 }),
    });
    this.numericEntry = entry;
    try {
      return await entry.run({ speed: { text: this.speed.value, min: -180, max: 180 } }, ({ speed }, verify) => {
        verify();
        this.view().rotationSpeed = speed;
        this.speed.value = String(speed);
        this.context.markDirty();
      });
    } finally {
      if (this.numericEntry === entry) this.numericEntry = null;
    }
  }
  cancelNumeric() {
    this.numericEntry?.cancel();
    this.stereoControls?.cancel();
  }
  displayNode(id) {
    return this.context.getInput ? this.context.getInput(id) : $(id);
  }
  restoreDisplayInputs() {
    const view = this.view();
    if (!view) return;
    const defaults = {
      projection: 'orthographic',
      faces: true,
      vertices: false,
      fillRule: 'nonzero',
      surfaceColors: 'source',
      surfaceOpacity: 0.28,
    };
    for (const [id, field] of Object.entries(DISPLAY_FIELDS)) {
      const node = this.displayNode(id);
      if (!node) continue;
      if (field === 'faces' || field === 'vertices') node.checked = view[field] ?? defaults[field];
      else node.value = String(view[field] ?? defaults[field]);
    }
  }
  requireDisplayEdit() {
    if (!this.view()) throw Error('Choose a model before changing the view.');
    if (!this.canEdit()) {
      this.restoreDisplayInputs();
      throw Error('Finish animation export before changing the view.');
    }
    return this.view();
  }
  setDisplayOption(id, raw) {
    const view = this.requireDisplayEdit(),
      field = Object.hasOwn(DISPLAY_FIELDS, id) ? DISPLAY_FIELDS[id] : null;
    let value = raw;
    try {
      if (!field) throw Error('Choose an available view setting.');
      if (field === 'projection') {
        const dimension = this.context.getModel()?.embeddingDimension || this.context.getModel()?.dimension;
        if (dimension !== 4 || !['orthographic', 'perspective', 'stereographic'].includes(value))
          throw Error('Choose an available 4D projection.');
      } else if (field === 'faces' || field === 'vertices') {
        if (typeof value !== 'boolean') throw Error('Choose whether this geometry is visible.');
      } else if (field === 'fillRule' && !['nonzero', 'even-odd'].includes(value))
        throw Error('Choose a supported face fill rule.');
      else if (field === 'surfaceColors' && !['source', 'face', 'cell', 'face-type', 'cell-type'].includes(value))
        throw Error('Choose a supported surface color mode.');
      else if (field === 'surfaceOpacity') {
        value = typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
        if (!Number.isFinite(value) || value < 0.02 || value > 1) throw Error('Choose an opacity between 0.02 and 1.');
      }
    } catch (error) {
      this.restoreDisplayInputs();
      throw error;
    }
    if (field === 'projection') this.context.cancelProjectionFit?.();
    view[field] = value;
    view.presentation = view.faces === false ? 'wireframe' : (view.surfaceOpacity ?? 1) < 1 ? 'translucent' : 'solid';
    this.context.display();
    this.restoreDisplayInputs();
    this.sync();
    this.context.markDirty();
    if (field === 'fillRule') return this.context.refreshDerived();
    if (field === 'projection') {
      if (this.playing) {
        if (value === 'stereographic') this.stop();
        else this.frameModel();
      }
      this.context.requestProjectionFit?.();
    }
  }
  setCellVisibility(action, text) {
    const view = this.requireDisplayEdit(),
      count = this.context.getModel()?.cells?.length ?? 0;
    if (!['isolate', 'hide', 'all'].includes(action) || !count) throw Error('Choose a model with source cells.');
    let index;
    if (action !== 'all') {
      const literal = typeof text === 'string' ? text.trim() : '';
      index = Number(literal);
      if (!/^\d+$/.test(literal) || !Number.isSafeInteger(index) || index >= count)
        throw Error(`Choose a literal source cell index from 0 to ${count - 1}.`);
    }
    if (action === 'isolate') {
      view.isolatedCell = index;
      view.hiddenCells = [];
    } else if (action === 'hide') view.hiddenCells = [...new Set([...(view.hiddenCells || []), index])];
    else {
      view.hiddenCells = [];
      view.isolatedCell = null;
    }
    this.context.display();
    this.context.markDirty();
  }
  restoreSelectionInputs() {
    const selection = this.view()?.entitySelection;
    const kind = this.displayNode('selection-kind'),
      index = this.displayNode('selection-id');
    if (kind) kind.value = selection?.kind ?? 'vertex';
    if (index) index.value = String(selection?.index ?? 0);
  }
  resetView() {
    const view = this.requireDisplayEdit();
    this.context.cancelProjectionFit?.();
    this.context.base.reset();
    this.context.derived.reset();
    view.camera = this.context.base.cameraState();
    view.derivedCamera = this.context.derived.cameraState();
    this.context.markDirty();
  }
  setAngle(index, text) {
    if (!this.view()) throw Error('Choose a model before changing rotation.');
    if (!this.canEdit()) {
      this.context.syncPose?.();
      throw Error('Finish animation export before changing rotation.');
    }
    const value = typeof text === 'string' && text.trim() ? Number(text) : NaN;
    const dimension = this.context.getModel()?.embeddingDimension || this.context.getModel()?.dimension || 3;
    if (
      !Number.isInteger(index) ||
      !AXES[index] ||
      AXES[index][1] >= dimension ||
      !Number.isFinite(value) ||
      value < -180 ||
      value > 180
    ) {
      this.context.syncPose?.();
      throw Error('Choose an available rotation plane and an angle between -180 and 180 degrees.');
    }
    this.context.cancelProjectionFit?.();
    this.stop();
    this.context.stopTrack?.();
    this.view().angles[index] = value;
    (this.context.displayPose || this.context.display)();
    this.context.syncPose?.();
    (this.context.markPoseDirty || this.context.markDirty)();
  }
  view() {
    return this.context.getState()?.view;
  }
  canEdit() {
    return !!this.view() && !this.context.isExporting();
  }
  set4DGizmoVisible(visible) {
    this.direct4D?.setVisible(visible);
  }
  endDrag() {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    try {
      drag.observation?.release();
    } finally {
      if (drag.canvas?.hasPointerCapture?.(drag.pointer)) drag.canvas.releasePointerCapture(drag.pointer);
    }
  }
  persistCamera() {
    this.view().camera = this.context.base.cameraState();
    this.context.markDirty();
  }
  frameModel() {
    if (!this.context.base?.fit || !this.canEdit()) return;
    this.context.base.fit();
    this.view().camera = this.context.base.cameraState();
  }
  opened(model) {
    if (this.context.getModel() !== model) return;
    this.overlays?.freshOpen(model);
    this.context.base.resize();
    this.frameModel();
  }
  syncSidebars() {
    for (const [id, cls] of [
      ['toggle-library', 'library-hidden'],
      ['toggle-inspector', 'inspector-hidden'],
    ])
      $(id).setAttribute('aria-pressed', String(!document.body.classList.contains(cls)));
  }
  sync() {
    this.stereoControls?.sync();
    const source = this.context.getState();
    this.direct4D?.sync();
    this.overlays?.sync();
    if (!source) return;
    if (this.context.isExporting()) this.endDrag();
    if (source !== this.source) {
      this.stop();
      this.endDrag();
      this.source = source;
      this.orientation.value = 'free';
    }
    const view = source.view,
      d = this.context.getModel()?.embeddingDimension || this.context.getModel()?.dimension || 3;
    const layout = view.viewportLayout || 'single';
    document.body.dataset.viewportLayout = layout;
    $('views').dataset.layout = layout;
    $('viewport-layout').value = layout;
    this.camera.value = view.cameraProjection || 'orthographic';
    $('render-style').value =
      view.presentation || (!view.faces ? 'wireframe' : view.surfaceOpacity > 0.6 ? 'solid' : 'translucent');
    this.stereo.value = view.stereoMode || 'none';
    this.stereo.disabled = this.context.isExporting();
    for (const option of this.plane.options) option.disabled = AXES[Number(option.value)][1] >= d;
    this.plane.value = String(view.rotationPlane ?? (d === 4 ? 2 : 1));
    if (!this.numericEntry?.busy && document.activeElement !== this.speed) this.speed.value = view.rotationSpeed ?? 12;
    this.gesture.checked = !!view.drag4D;
    this.gestureLabel.hidden = d !== 4;
    $('rotation-settings').hidden = d < 3;
    $('projection').hidden = d !== 4;
    if (this.projectionLabel) this.projectionLabel.hidden = d !== 4;
    $('auto-rotate').disabled = d < 3 || this.context.isExporting();
    for (const id of Object.keys(DISPLAY_FIELDS)) {
      const node = this.displayNode(id);
      if (node) node.disabled = this.context.isExporting() || (id === 'projection' && d !== 4);
    }
    for (const id of ['visible-cell-id', 'isolate-cell', 'hide-cell', 'show-all-cells']) {
      const node = this.displayNode(id);
      if (node) node.disabled = this.context.isExporting() || !this.context.getModel()?.cells?.length;
    }
    for (const id of ['selection-kind', 'selection-id', 'select-entity']) {
      const node = this.displayNode(id);
      if (node) node.disabled = this.context.isExporting();
    }
    PLANES.forEach((_, i) => {
      const input = $('plane-' + i);
      if (input) input.disabled = AXES[i][1] >= d || this.context.isExporting();
    });
    for (const node of [
      this.camera,
      this.orientation,
      $('fit-view'),
      $('render-style'),
      $('viewport-layout'),
      this.plane,
      this.speed,
      this.gesture,
    ])
      node.disabled = this.context.isExporting();
    this.context.base.renderer.domElement.title =
      d === 4
        ? 'Drag to orbit. Shift-drag to turn in 4D (release while moving to tumble; Esc or a still Shift-click stops). Shift-scroll to turn in ZW. Scroll to zoom.'
        : 'Drag to orbit. Scroll to zoom.';
    const mode = view.derivedMode,
      controls = document.querySelector('.section-controls');
    const sectionMode = ['section', 'cell-section'].includes(mode);
    controls.hidden =
      layout !== 'split' || !['section', 'cell-section', 'vertex-figure', 'cell', 'face'].includes(mode);
    for (const label of controls.querySelectorAll('label')) {
      const field = label.querySelector('input');
      label.hidden = sectionMode ? field?.id === 'entity-id' : field?.id !== 'entity-id';
    }
    $('apply-section').hidden = !sectionMode;
    $('section-events').hidden = !sectionMode;
    this.context.syncDerivedControls?.();
    this.syncPlaying();
  }
  syncPlaying() {
    $('auto-rotate').textContent = this.playing ? 'Pause rotation' : 'Rotate';
    $('auto-rotate').setAttribute('aria-pressed', String(this.playing));
  }
  startStartupRotation() {
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    this.frameModel();
    this.startupRotation = !reduced;
    this.playing = !reduced;
    this.syncPlaying();
  }
  stop() {
    this.direct4D?.cancel();
    this.startupRotation = false;
    this.playing = false;
    this.syncPlaying();
  }
  toggle() {
    if (!this.canEdit()) return;
    this.direct4D?.cancel();
    this.context.cancelProjectionFit?.();
    this.context.stopTrack();
    this.startupRotation = false;
    this.playing = !this.playing;
    this.context.markDirty();
    this.syncPlaying();
  }
  setPresentation(presentation) {
    if (!this.canEdit()) return this.sync();
    const view = this.view();
    view.presentation = presentation;
    view.faces = presentation !== 'wireframe';
    view.edges = true;
    view.vertices = false;
    view.surfaceOpacity = presentation === 'solid' ? 1 : 0.22;
    view.edgeOpacity = presentation === 'solid' ? 0.62 : 0.78;
    $('faces-visible').checked = view.faces;
    $('vertices-visible').checked = view.vertices;
    $('surface-opacity').value = view.surfaceOpacity;
    this.context.display();
    this.context.refreshDerived();
    this.context.markDirty();
  }
  tick(dt) {
    if (this.direct4D?.tick(dt)) return true;
    if (!this.playing) return false;
    if (!this.canEdit()) {
      this.stop();
      return false;
    }
    const view = this.view(),
      index = view.rotationPlane ?? (this.context.getModel()?.dimension === 4 ? 2 : 1),
      speed = view.rotationSpeed ?? 12;
    view.angles[index] = ((((view.angles[index] + speed * dt + 180) % 360) + 360) % 360) - 180;
    (this.context.displayPose || this.context.display)();
    this.context.syncPose();
    return true;
  }
}
