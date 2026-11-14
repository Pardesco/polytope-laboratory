export const COXETER_FAMILIES = {
  A3: { label: 'Tetrahedral', branches: [3, 3] },
  B3: { label: 'Octahedral', branches: [4, 3] },
  H3: { label: 'Icosahedral', branches: [5, 3] },
  A4: { label: '5-cell', branches: [3, 3, 3] },
  B4: { label: 'Hypercube', branches: [4, 3, 3] },
  D4: { label: '16-cell', branches: [3, 3, 3] },
  F4: { label: '24-cell', branches: [3, 4, 3] },
  H4: { label: '600-cell', branches: [5, 3, 3] },
};
export function diagramState(family = 'B3', rings) {
  if (!Object.hasOwn(COXETER_FAMILIES, family)) throw Error('Choose a supported symmetry family.');
  const rank = COXETER_FAMILIES[family].branches.length + 1,
    mask = rings ?? [1, ...Array(rank - 1).fill(0)];
  if (mask.length !== rank || mask.some((r) => r !== 0 && r !== 1))
    throw Error('Choose one binary value per diagram node.');
  return { family, rings: [...mask], snub: false, hand: 'A' };
}
export function toggleRing(value, index) {
  if (!Number.isInteger(index) || index < 0 || index >= value.rings.length) throw Error('Choose a diagram node.');
  const rings = value.rings.map((r, i) => (i === index ? 1 - r : r));
  return { ...value, rings, snub: value.snub && rings.every(Boolean) };
}
export function diagramGeometry(family) {
  const f = COXETER_FAMILIES[family];
  if (!f) throw Error('Choose a supported symmetry family.');
  return family === 'D4'
    ? {
        points: [
          [40, 70],
          [130, 70],
          [220, 26],
          [220, 114],
        ],
        edges: [
          [0, 1, 3],
          [1, 2, 3],
          [1, 3, 3],
        ],
      }
    : {
        points: Array.from({ length: f.branches.length + 1 }, (_, i) => [30 + (i * 240) / f.branches.length, 70]),
        edges: f.branches.map((m, i) => [i, i + 1, m]),
      };
}
export function diagramMarkup(value, { mini = false, focus = 0 } = {}) {
  const { points, edges } = diagramGeometry(value.family),
    line = edges
      .map(([a, b, m]) => {
        const [x, y] = points[a],
          [u, v] = points[b];
        return (
          `<line x1="${x}" y1="${y}" x2="${u}" y2="${v}"/>` +
          (m > 3 ? `<text x="${(x + u) / 2}" y="${(y + v) / 2 - 12}">${m}</text>` : '')
        );
      })
      .join('');
  const nodes = points
    .map(
      ([x, y], i) =>
        `<g ${mini ? '' : `id="coxeter-builder-node-${i}" role="button" tabindex="${i === focus ? 0 : -1}" aria-label="Node ${i + 1}, ${value.rings[i] ? 'ringed' : 'not ringed'}${value.snub ? ', snub' : ''}" aria-pressed="${!!value.rings[i]}" data-node="${i}"`} transform="translate(${x},${y})" class="coxeter-node${value.rings[i] ? ' ringed' : ''}${value.snub ? ' snub' : ''}"><rect class="node-hit" x="-24" y="-24" width="48" height="48" rx="4"/>${value.rings[i] ? '<circle class="node-ring" r="17"/>' : ''}<circle class="node-core" r="7"/>${mini ? '' : '<rect class="node-focus" x="-24" y="-24" width="48" height="48" rx="4"/>'}</g>`
    )
    .join('');
  return `<svg viewBox="0 0 300 140" ${mini ? 'aria-hidden="true"' : 'aria-label="Coxeter–Dynkin diagram. Select nodes to change the shape." role="group"'}>${line}${nodes}</svg>`;
}
export function moveDiagramFocus(index, key, count) {
  const delta = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[key];
  return delta === undefined ? index : (index + delta + count) % count;
}

export function builderPreviewRect(canvas, panel, gap = 16) {
  const width = Math.max(0, canvas.width),
    height = Math.max(0, canvas.height),
    full = { left: 0, top: 0, width, height };
  if (
    !panel ||
    panel.right <= canvas.left ||
    panel.left >= canvas.right ||
    panel.bottom <= canvas.top ||
    panel.top >= canvas.bottom
  )
    return full;
  const left = Math.max(0, panel.left - canvas.left - gap),
    right = Math.min(width, panel.right - canvas.left + gap),
    top = Math.max(0, panel.top - canvas.top - gap),
    bottom = Math.min(height, panel.bottom - canvas.top + gap);
  return [
    { left: 0, top: 0, width: left, height },
    { left: right, top: 0, width: width - right, height },
    { left: 0, top: 0, width, height: top },
    { left: 0, top: bottom, width, height: height - bottom },
  ].sort((a, b) => b.width * b.height - a.width * a.height)[0];
}

const previewFrames = new WeakMap();

export function replacementCamera(preview, fitted, previewHeight, height) {
  if (!(previewHeight > 0 && height > 0)) return fitted;
  const ratio = height / previewHeight,
    distance = (camera) => Math.hypot(...camera.position.map((x, i) => x - camera.target[i])),
    fittedDistance = distance(fitted),
    scale = Math.max(1, (distance(preview) * ratio) / (preview.zoom * fittedDistance));
  return {
    ...fitted,
    position: fitted.position.map((x, i) => fitted.target[i] + (x - fitted.target[i]) * scale),
    orthographicHalfHeight: Math.max(
      fitted.orthographicHalfHeight,
      (preview.orthographicHalfHeight * ratio) / preview.zoom
    ),
  };
}

export class CoxeterPreviewFrame {
  constructor(host, getPanel, getViewer) {
    this.host = host;
    this.getPanel = getPanel;
    this.getViewer = getViewer;
    previewFrames.set(getPanel(), this);
    this.surface = host.ownerDocument.createElement('div');
    this.surface.id = 'coxeter-builder-preview-canvas';
    host.prepend(this.surface);
    this.observer = new ResizeObserver(() => this.sync());
    this.observer.observe(host);
    this.observer.observe(getPanel());
  }
  sync() {
    if (this.host.hidden) return;
    const panel = this.getPanel(),
      rect = builderPreviewRect(this.host.getBoundingClientRect(), panel.open ? panel.getBoundingClientRect() : null),
      key = JSON.stringify(rect);
    if (key === this.key) return;
    this.key = key;
    for (const name of ['left', 'top', 'width', 'height']) this.surface.style[name] = rect[name] + 'px';
    const viewer = this.getViewer();
    viewer?.resize();
    if (viewer?.model) viewer.fit();
  }
  reset() {
    this.key = null;
    for (const name of ['left', 'top', 'width', 'height']) this.surface.style[name] = '';
  }
  captureReplacement() {
    const viewer = this.getViewer();
    if (!viewer?.model || this.host.hidden) return;
    return (this.replacement = {
      model: viewer.model,
      view: structuredClone(viewer.view),
      camera: viewer.cameraState(),
      height: this.surface.getBoundingClientRect().height,
    });
  }
  refitReplacement(viewer, view, display) {
    const snapshot = this.replacement;
    if (!snapshot || viewer.model?.name !== snapshot.model.name || viewer.model.dimension !== snapshot.model.dimension)
      return;
    this.replacement = null;
    for (const key of ['angles', 'projection', 'stereoMode', 'perspectiveDistance4D', 'perspectiveNear4D'])
      if (snapshot.view[key] !== undefined) view[key] = structuredClone(snapshot.view[key]);
    view.cameraProjection = snapshot.camera.projection;
    display();
    viewer.resize();
    viewer.restoreCamera(snapshot.camera);
    const fitted = viewer.fit();
    viewer.restoreCamera(
      replacementCamera(snapshot.camera, fitted, snapshot.height, viewer.container.getBoundingClientRect().height)
    );
    view.camera = viewer.cameraState();
    const doc = this.host.ownerDocument;
    view.angles.forEach((angle, i) => {
      const input = doc.getElementById('plane-' + i),
        output = doc.getElementById('plane-output-' + i);
      if (input) input.value = angle;
      if (output) output.textContent = Number(angle.toFixed(4)) + '°';
    });
    const projection = doc.getElementById('projection');
    if (projection) projection.value = view.projection;
    snapshot.appearanceChanged = [
      'appearance',
      'materialEffects',
      'surfaceColors',
      'surfaceOpacity',
      'faces',
      'edges',
      'vertices',
    ].some((key) => JSON.stringify(view[key]) !== JSON.stringify(snapshot.view[key]));
  }
}

export class CoxeterBuilder {
  constructor(context) {
    this.context = context;
    this.document = context.document ?? document;
    this.value = diagramState();
    this.sequence = 0;
    this.focus = 0;
    const panel = this.document.createElement('dialog');
    this.panel = panel;
    panel.id = 'coxeter-builder';
    panel.setAttribute('aria-labelledby', 'coxeter-builder-title');
    panel.innerHTML =
      '<header><div><p class="coxeter-eyebrow">BUILD FROM SYMMETRY</p><h2 id="coxeter-builder-title">Shape builder</h2></div><button id="coxeter-builder-close" aria-label="Close shape builder">Close</button></header><div class="coxeter-choices"><div id="coxeter-builder-families" aria-label="Symmetry families"></div><div class="coxeter-ring-settings"><p>Turn rings on or off to change the shape.</p><div class="coxeter-ring-actions"><button id="coxeter-builder-reset" type="button">Reset rings</button><button id="coxeter-builder-help" type="button" aria-label="What are rings?" aria-expanded="false" aria-controls="coxeter-builder-ring-help">?</button></div><p id="coxeter-builder-ring-help" hidden>A ring marks an active mirror in the Wythoff construction: the starting vertex lies away from that mirror. An unringed mirror contains the starting vertex. Equal distances to active mirrors give these convex uniform shapes. Ring at least one node.</p><div id="coxeter-builder-diagram"></div><p class="coxeter-hint">Arrows move focus · Space toggles a ring · <span id="coxeter-builder-enter">Enter: Replace current model</span></p><div id="coxeter-builder-twist"><label><input id="coxeter-builder-snub" type="checkbox"> Snub · twist the shape</label><button id="coxeter-builder-hand" type="button">Mirror twist</button></div><details id="coxeter-builder-method" data-expert><summary>How this shape is built</summary><p>Rings choose mirrors for a finite reflection orbit (Wythoff construction). Equal ring weights produce these convex uniform shapes. Coordinates use approximate float64 arithmetic.</p><output id="coxeter-builder-residual"></output></details></div></div><footer class="coxeter-result"><p class="coxeter-eyebrow">YOUR SHAPE · UNSAVED PREVIEW</p><h3 id="coxeter-builder-name"></h3><p id="coxeter-builder-counts"></p><output id="coxeter-builder-status" role="status" aria-live="polite"></output><button id="coxeter-builder-open" class="accent wide">Replace current model</button><p id="coxeter-builder-destination" class="coxeter-hint">Adds a history step. Undo returns to your previous shape.</p></footer>';
    this.document.body.append(panel);
    this.nodes = Object.fromEntries(
      [
        'families',
        'diagram',
        'name',
        'counts',
        'status',
        'twist',
        'snub',
        'hand',
        'open',
        'residual',
        'close',
        'reset',
        'help',
        'ring-help',
        'destination',
        'enter',
      ].map((id) => [id, panel.querySelector('#coxeter-builder-' + id)])
    );
    for (const dimension of [3, 4]) {
      const group = this.document.createElement('div');
      group.className = 'coxeter-family-group';
      group.dataset.dimension = String(dimension);
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', dimension + 'D symmetry');
      const heading = this.document.createElement('strong');
      heading.textContent = dimension + 'D shapes';
      group.append(heading);
      for (const [family, f] of Object.entries(COXETER_FAMILIES).filter(([key]) => key.endsWith(String(dimension)))) {
        const button = this.document.createElement('button');
        button.type = 'button';
        button.id = 'coxeter-builder-family-' + family;
        button.dataset.family = family;
        button.setAttribute('aria-pressed', 'false');
        button.innerHTML =
          `<b>${f.label}</b><span>${family}</span>` + diagramMarkup(diagramState(family), { mini: true });
        button.onclick = () => {
          if (this.committing) return;
          this.value = diagramState(family);
          this.focus = 0;
          this.changed();
        };
        group.append(button);
      }
      this.nodes.families.append(group);
    }
    this.nodes.close.onclick = () => this.close();
    this.nodes.reset.onclick = () => {
      if (this.committing) return;
      this.value = diagramState(this.value.family);
      this.focus = 0;
      this.changed();
    };
    this.nodes.help.onclick = () => {
      const help = this.nodes['ring-help'];
      help.hidden = !help.hidden;
      this.nodes.help.setAttribute('aria-expanded', String(!help.hidden));
    };
    panel.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.close();
    });
    this.nodes.open.onclick = context.guard(() => this.openAsModel());
    this.nodes.diagram.addEventListener('click', (event) => {
      const node = event.target.closest('[data-node]');
      if (node) this.toggle(Number(node.dataset.node));
    });
    this.nodes.diagram.addEventListener('keydown', (event) => {
      const node = event.target.closest('[data-node]');
      if (!node) return;
      const i = Number(node.dataset.node);
      if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        this.focus = moveDiagramFocus(i, event.key, this.value.rings.length);
        this.renderDiagram(true);
      } else if (event.key === ' ') {
        event.preventDefault();
        this.toggle(i);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        context.guard(() => this.openAsModel())();
      }
    });
    this.nodes.snub.onchange = () => {
      if (this.committing) return;
      this.value = {
        ...this.value,
        snub: this.nodes.snub.checked,
        rings: this.nodes.snub.checked ? [1, 1, 1] : this.value.rings,
      };
      this.changed();
    };
    this.nodes.hand.onclick = () => {
      if (this.committing) return;
      this.value = { ...this.value, hand: this.value.hand === 'A' ? 'B' : 'A' };
      this.changed();
    };
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });
  }
  show() {
    if (this.context.isExporting()) throw Error('Finish export before opening the shape builder.');
    if (!this.panel.open) {
      this.previousFocus = this.document.activeElement;
      this.context.stop?.();
      this.source = this.context.getState();
      this.sourceModel = this.source?.model;
      this.nodes.open.textContent = this.source ? 'Replace current model' : 'Open in new tab';
      this.nodes.enter.textContent = 'Enter: ' + this.nodes.open.textContent;
      this.nodes.destination.textContent = this.source
        ? 'Adds a history step. Undo returns to your previous shape.'
        : 'Opens a new document tab. Save a project to keep it.';
      this.panel.show();
      this.changed();
    }
    this.nodes.diagram.querySelector('[tabindex="0"]')?.focus();
  }
  cancel() {
    clearTimeout(this.timer);
    this.timer = null;
    ++this.sequence;
    this.controller?.abort();
    this.controller = null;
    this.receipt = null;
  }
  clearPreview() {
    this.context.clearPreview();
    const heading = this.document.getElementById?.('model-name');
    if (this.documentHeading != null && heading?.textContent === 'Symmetry preview')
      heading.textContent = this.documentHeading;
    this.documentHeading = null;
  }
  close() {
    this.cancel();
    this.source = null;
    this.sourceModel = null;
    this.clearPreview();
    if (this.panel.open) {
      this.panel.close();
      if (this.previousFocus?.isConnected) this.previousFocus.focus();
    }
  }
  sync() {
    if (
      this.panel.open &&
      (this.context.isExporting() ||
        (!this.committing && (this.context.getState() !== this.source || this.source?.model !== this.sourceModel)))
    )
      this.close();
  }
  toggle(index) {
    if (this.committing) return;
    const next = toggleRing(this.value, index);
    this.value = next;
    this.focus = index;
    this.changed(true);
  }
  renderDiagram(focus = false) {
    this.nodes.diagram.innerHTML = diagramMarkup(this.value, { focus: this.focus });
    if (focus) this.nodes.diagram.querySelector('[tabindex="0"]')?.focus();
  }
  changed(focus = false) {
    this.cancel();
    this.clearPreview();
    this.renderDiagram(focus);
    this.nodes.open.disabled = true;
    for (const button of this.nodes.families.querySelectorAll('[data-family]'))
      button.setAttribute('aria-pressed', String(button.dataset.family === this.value.family));
    this.nodes.twist.hidden = !['B3', 'H3'].includes(this.value.family);
    this.nodes.snub.checked = this.value.snub;
    this.nodes.hand.hidden = !this.value.snub;
    this.nodes.name.textContent = this.value.family + ' · ' + this.value.rings.map((r) => (r ? '●' : '○')).join(' ');
    this.nodes.counts.textContent = '';
    this.nodes.residual.textContent = '';
    if (!this.value.rings.some(Boolean)) {
      this.nodes.name.textContent = 'No rings selected';
      this.nodes.status.textContent =
        'Ring at least one node to preview a shape. With no active mirrors, the starting vertex stays at the center.';
      return;
    }
    this.nodes.status.textContent = 'Building your preview…';
    this.timer = setTimeout(() => {
      this.timer = null;
      this.preview();
    }, this.context.debounce ?? 180);
  }
  async preview() {
    const token = this.sequence,
      params = structuredClone(this.value),
      controller = new AbortController();
    this.controller = controller;
    const current = () =>
      this.panel.open && this.sequence === token && !controller.signal.aborted && !this.context.isExporting();
    try {
      const result = await this.context.run('coxeter-build', params, null, 'Shape preview', {
        signal: controller.signal,
      });
      if (!current()) return;
      await this.context.preview(result, { isCurrent: current });
      if (!current()) return;
      const heading = this.document.getElementById?.('model-name');
      if (heading) {
        this.documentHeading ??= heading.textContent;
        heading.textContent = 'Symmetry preview';
      }
      this.receipt = { result, params, token };
      this.nodes.name.textContent = result.name;
      this.nodes.counts.textContent = ['vertices', 'edges', 'faces', ...(result.dimension === 4 ? ['cells'] : [])]
        .map((k) => result[k].length.toLocaleString() + ' ' + k)
        .join(' · ');
      this.nodes.status.textContent = 'Drag the preview to explore. Your document is unchanged.';
      const residual = result.metadata?.shapeBuilder?.edgeRelativeSpread;
      this.nodes.residual.textContent =
        'Relative edge-length spread: ' +
        Number(residual).toExponential(2) +
        '. ' +
        (result.provenance?.orbitClosureResidual !== undefined
          ? 'Unit-sphere reflection closure residual: ' + result.provenance.orbitClosureResidual.toExponential(2) + '. '
          : '') +
        'Float64 approximation; no exact certificate.';
      this.nodes.open.disabled = false;
    } catch (error) {
      if (current()) {
        this.nodes.status.textContent = error.message;
        this.clearPreview();
      }
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }
  async openAsModel() {
    if (this.committing || !this.receipt || this.receipt.token !== this.sequence) return;
    const receipt = this.receipt,
      controller = new AbortController();
    this.controller = controller;
    this.committing = true;
    this.nodes.open.disabled = true;
    const controls = [
      ...this.nodes.families.querySelectorAll('[data-family]'),
      this.nodes.snub,
      this.nodes.hand,
      this.nodes.reset,
    ];
    for (const node of controls) node.disabled = true;
    const owner = this.context.getState(),
      verifyPublication = () => {
        if (controller.signal.aborted || this.receipt !== receipt || this.context.getState() !== owner)
          throw Error('Shape selection or document changed. Open the builder again.');
      };
    const frame = previewFrames.get(this.panel),
      snapshot = frame?.captureReplacement();
    this.nodes.status.textContent = 'Opening your shape…';
    try {
      verifyPublication();
      await this.context.commit(receipt.params, receipt.result.name, { signal: controller.signal, verifyPublication });
      this.close();
      if (snapshot?.appearanceChanged)
        this.document.dispatchEvent(
          new CustomEvent('polytope:workflow-status', {
            detail: 'Shape replaced · document appearance settings applied.',
          })
        );
    } catch (error) {
      if (this.panel.open && this.receipt === receipt) this.nodes.status.textContent = error.message;
      throw error;
    } finally {
      if (frame && frame.replacement === snapshot) frame.replacement = null;
      this.committing = false;
      for (const node of controls) node.disabled = false;
      this.nodes.open.disabled = !this.receipt;
    }
  }
}
