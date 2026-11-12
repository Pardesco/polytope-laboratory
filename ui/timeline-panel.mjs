import { AnimationLanes, rulerTicks, timelineTime } from './animation-lanes.mjs';
import { moveSequenceKeyframe, deleteSequenceKeyframe, normalizeSequence } from './animation.mjs';
import { TRACK_LANES } from './animation-track-registry.mjs';
import { NumericEntry } from './numeric-entry.mjs';

const make = (doc, tag, id, text) => {
  const node = doc.createElement(tag);
  if (id) node.id = id;
  if (text) node.textContent = text;
  return node;
};
const field = (node) => node.closest('label') || node;
const write = (node, key, value) => {
  if (node[key] !== value) node[key] = value;
};
const attribute = (node, key, value) => {
  if (node.getAttribute(key) !== value) node.setAttribute(key, value);
};
export function motionPresetReason(key, state, { capabilities = {}, blocked = false } = {}) {
  if (!state) return 'Open a model first.';
  if (blocked) return 'Finish the current animation action first.';
  const model = state.model,
    dimension = model.embeddingDimension || model.dimension,
    morph = state.view.dualMorph?.enabled === true;
  if (key === 'fold' && (model.dimension !== 3 || dimension !== 3)) return 'Fold net needs an intrinsic 3D shape.';
  if (key === 'fold' && model.faces.length > 250) return 'Fold net supports at most 250 source faces.';
  if (
    key === 'explosion' &&
    (![3, 4].includes(model.dimension) || model.interpretation !== 'convex-polytope' || dimension !== model.dimension)
  )
    return 'Explode needs a full-dimensional convex 3D or 4D shape.';
  if (['fold', 'explosion', 'section'].includes(key) && morph) return 'Close Dual morph before using this motion.';
  if (key === 'section' && model.dimension < 3) return 'Section sweep needs a 3D or 4D shape.';
  if (key === 'morph' && !morph) return 'Configure Dual morph in its shelf first.';
  const capability = key === 'morph' ? 'morphRatio' : key;
  if (['fold', 'explosion', 'morph'].includes(key) && capabilities[capability] !== true)
    return 'This motion needs a renderer adapter that is unavailable.';
  return '';
}
export class TimelinePanel {
  constructor(context) {
    this.context = context;
    this.animation = context.animation;
    this.tours = context.tours;
    this.doc = context.document ?? document;
    this.mode = 'keyframes';
    const doc = this.doc,
      a = this.animation.nodes,
      t = this.tours.nodes;
    this.panel = make(doc, 'section', 'timeline-panel');
    this.panel.className = 'timeline-panel';
    this.panel.hidden = true;
    this.panel.tabIndex = -1;
    this.panel.setAttribute('aria-label', 'Timeline');
    this.panel.innerHTML = `<div id="timeline-resize" role="separator" tabindex="0" aria-label="Timeline height" aria-orientation="horizontal" aria-valuemin="180" aria-valuemax="520" aria-valuenow="260"></div>
      <div class="timeline-transport"><strong>Timeline</strong><div class="timeline-modes" role="group" aria-label="Timeline mode"><button id="timeline-keyframes-mode">Keyframes</button><button id="timeline-tour-mode">Tour</button></div><div id="timeline-keyframes-transport"></div><div id="timeline-tour-transport" hidden></div><output id="timeline-readout"></output><label>Time <input id="timeline-exact-time" type="text" maxlength="512" value="0" aria-label="Exact timeline time in seconds"></label><div id="timeline-timing"></div><button id="timeline-export-video">Export video</button><button id="timeline-close" aria-label="Close timeline">×</button></div>
      <div class="timeline-content"><section id="timeline-keyframes"><aside id="timeline-motions" aria-label="Motion presets"><strong>Add motion</strong><div id="timeline-turn-options"></div></aside><div class="timeline-editor"><div id="timeline-ruler" role="group" aria-label="Seconds ruler"></div><div id="timeline-lanes"></div><div id="timeline-record-row"></div><p class="muted">Captures rotation, section depth and every animated track. Drag diamonds to retime; Shift disables frame snapping.</p><details id="timeline-numeric" data-expert><summary>Numeric keyframes</summary><div id="timeline-keyframe-table"></div></details></div></section><section id="timeline-tour" hidden></section><details id="timeline-export-settings"><summary>Export settings</summary><div id="timeline-animation-export"></div><div id="timeline-tour-export" hidden></div></details></div>`;
    this.node = (id) => doc.getElementById(id);
    doc.querySelector('.workspace-shelf').before(this.panel);
    this.node('timeline-keyframes').append(this.animation.container);
    this.node('timeline-tour').append(t.controls);
    this.animation.container.classList.add('timeline-legacy');
    const move = (host, nodes) => this.node(host).append(...nodes);
    move('timeline-keyframes-transport', [a.start, a.play, a.end, field(a.loop)]);
    const tourStart = make(doc, 'button', 'timeline-tour-start', 'Go to start'),
      tourEnd = make(doc, 'button', 'timeline-tour-end', 'Go to end');
    move('timeline-tour-transport', [tourStart, t.play, tourEnd, field(t.loop)]);
    tourStart.onclick = this.action(() => this.tours.seek(0));
    tourEnd.onclick = this.action(() => this.tours.seek(this.tours.total()));
    move('timeline-timing', [field(a.duration), field(a.fps)]);
    // Keep the original controls and their handlers, including hidden-smoke IDs.
    field(a.duration).firstChild.textContent = 'Duration ';
    field(a.fps).firstChild.textContent = 'FPS ';
    move('timeline-turn-options', [field(a.plane), field(a.turns)]);
    a.rotation.textContent = 'Turn in 4D';
    a.section.textContent = 'Section sweep';
    a.explosion.textContent = 'Explode';
    a.fold.textContent = 'Fold net (3D)';
    a.morph.textContent = 'Dual morph';
    this.recipes = [
      ['rotation', 'Spin the shape through a coordinate plane'],
      ['section', 'Slide a hyperplane through the shape'],
      ['explosion', 'Separate faces or cells'],
      ['fold', 'Fold a rigid 3D face net'],
      ['morph', 'Interpolate the configured shape and dual'],
    ].map(([key, hint]) => {
      const row = make(doc, 'div'),
        reason = make(doc, 'small');
      row.className = 'timeline-recipe';
      row.append(a[key], reason);
      this.node('timeline-motions').append(row);
      a[key].onclick = this.action(async () => {
        const old = this.context.getState()?.view.animation,
          count = old?.keyframes.length;
        if (key === 'rotation' || key === 'section') await this.animation[key]();
        else await this.animation.addTrack(key === 'morph' ? 'morphRatio' : key);
        this.context.setStatus(
          count
            ? `Replaced the ${count}-keyframe animation. Undo restores it. Press Play to preview.`
            : 'Motion added. Press Play to preview.'
        );
      });
      return { key, reason, hint };
    });
    move('timeline-record-row', [a.keyframe]);
    const remove = make(doc, 'button', 'timeline-delete-keyframe', 'Delete keyframe');
    this.node('timeline-record-row').append(remove);
    remove.onclick = this.action(() => this.remove(this.lanes.selected));
    move('timeline-animation-export', [
      field(a.target),
      a.fit,
      field(a.format),
      field(a.size),
      a.framing.closest('details'),
      a.export,
      a.png,
      a.webm,
      a.cancel,
      a.progress,
    ]);
    field(a.target).setAttribute('data-expert', '');
    a.fit.setAttribute('data-expert', '');
    move('timeline-tour-export', [
      field(t.format),
      field(t.size),
      t.framing.closest('details'),
      t.export,
      t.png,
      t.webm,
      t['cancel-export'],
    ]);
    // The tour editor retains stop duration; transport FPS is shared visually.
    this.tourFps = field(t.fps);
    this.node('timeline-tour-transport').append(this.tourFps);
    move('timeline-keyframes-transport', [a.position]);
    move('timeline-tour-transport', [t.position]);
    this.hiddenScrubs = make(doc, 'details', 'timeline-legacy-scrub');
    this.hiddenScrubs.setAttribute('data-expert', '');
    this.hiddenScrubs.append(make(doc, 'summary', null, 'Pose and capture options'), field(a.time));
    const tourScrub = make(doc, 'details', 'timeline-tour-pose');
    tourScrub.setAttribute('data-expert', '');
    tourScrub.append(make(doc, 'summary', null, 'Tour time slider'), t.scrub);
    this.node('timeline-tour').append(tourScrub);
    this.node('timeline-tour-transport').append(t['close-preview']);
    for (const node of [...this.animation.container.children])
      if (node !== a['track-options'] && !node.id && !node.querySelector('[id]')) node.remove();
    this.hiddenScrubs.append(a['track-options']);
    this.node('timeline-keyframes').append(this.hiddenScrubs);
    this.node('timeline-numeric').before(this.animation.container);
    this.node('timeline-export-settings').append(
      this.node('timeline-animation-export'),
      this.node('timeline-tour-export')
    );
    this.lanes = new AnimationLanes(this.node('timeline-lanes'), {
      sequence: () => this.animation.sequence(),
      source: () => this.context.getState(),
      pause: () => this.animation.pause(),
      select: (index) => this.action(() => this.animation.scrub(this.animation.sequence().keyframes[index].time))(),
      move: (...args) => this.action(() => this.move(...args))(),
      remove: (index) => this.action(() => this.remove(index))(),
    });
    this.node('timeline-keyframes-mode').onclick = () => this.open('keyframes');
    this.node('timeline-tour-mode').onclick = () => this.open('tour');
    this.node('timeline-close').onclick = () => this.close();
    this.node('timeline-export-video').onclick = this.action(() => context.exportVideo(this.mode));
    this.node('timeline-exact-time').onchange = this.action(() => this.exactTime());
    this.node('timeline-ruler').onclick = this.action((event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      return this.scrub(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * this.duration());
    });
    this.panel.addEventListener('keydown', (event) => {
      if (
        event.code !== 'Space' ||
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.target.closest('input,textarea,select,[contenteditable]')
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      (this.mode === 'tour' ? t.play : a.play).click();
    });
    for (const [id, mode] of [
      ['animation-settings', 'keyframes'],
      ['tour-settings', 'tour'],
    ]) {
      const details = this.node(id);
      details.classList.add('timeline-shelf-tab');
      details.addEventListener('toggle', () => {
        if (details.open) this.activate(mode);
        else if (!this.node('animation-settings').open && !this.node('tour-settings').open) this.panel.hidden = true;
      });
    }
    this.visibilityObserver = new MutationObserver(() => this.sync());
    for (const id of ['animation-settings', 'tour-settings'])
      this.visibilityObserver.observe(this.node(id), { attributes: true, attributeFilter: ['open'] });
    doc.addEventListener('app-chrome-reveal', (event) => {
      if (this.panel.contains(event.target))
        this.open(
          event.target.id.startsWith('tour-') || event.target.closest('#timeline-tour,#timeline-tour-export')
            ? 'tour'
            : 'keyframes'
        );
    });
    const hook = (control, key) => {
      const original = control[key];
      control[key] = (...args) => {
        const result = original.apply(control, args);
        this.sync();
        return result;
      };
    };
    for (const name of ['update', 'pause']) hook(this.animation, name);
    for (const name of ['sync', 'position', 'pause']) hook(this.tours, name);
    for (const type of ['input', 'change'])
      doc.addEventListener(
        type,
        (event) => {
          if (!event.target.closest('.timeline-transport')) {
            if (this.animation.playing) this.animation.pause();
            if (this.tours.playing) this.tours.pause();
          }
        },
        true
      );
    this.node('views').addEventListener(
      'pointerdown',
      () => {
        if (this.animation.playing) this.animation.pause();
        if (this.tours.playing) this.tours.pause();
      },
      true
    );
    const spin = make(doc, 'button', 'timeline-record-spin', 'Record this spin');
    doc.getElementById('rotation-controls').append(spin);
    spin.onclick = this.action(async () => {
      a.plane.value = String(
        context.getState().view.rotationPlane ?? (context.getState().model.dimension === 4 ? 2 : 1)
      );
      this.open('keyframes');
      await this.animation.rotation();
      context.setStatus('Recorded this spin. Undo restores the previous animation.');
      this.animation.play();
    });
    this.resize();
    this.sync();
  }
  action(fn) {
    return this.context.guard(fn);
  }
  duration() {
    return this.mode === 'tour' ? this.tours.total() : this.animation.sequence().duration;
  }
  scrub(time) {
    return this.mode === 'tour' ? this.tours.seek(time) : this.animation.scrub(time);
  }
  open(mode) {
    const details = this.node(mode === 'tour' ? 'tour-settings' : 'animation-settings');
    details.open = true;
    this.activate(mode);
  }
  activate(mode) {
    if (mode !== this.mode) {
      if (mode === 'tour')
        this.keyframeOwner = {
          ...this.context.getKeyframeOwner?.(),
          time: this.animation.time,
          selected: this.lanes.selected,
          lane: this.lanes.lane,
        };
      this.animation.pause();
      this.tours.pause();
      this.mode = mode;
      if (mode === 'keyframes' && this.keyframeOwner && this.context.restoreKeyframeOwner?.(this.keyframeOwner)) {
        this.animation.time = Math.min(this.keyframeOwner.time, this.animation.sequence().duration);
        this.lanes.selected = this.keyframeOwner.selected;
        this.lanes.lane = this.keyframeOwner.lane;
        this.source = this.context.getState();
        this.animation.update();
      }
    }
    this.panel.hidden = false;
    this.sync();
  }
  close() {
    this.node('animation-settings').open = false;
    this.node('tour-settings').open = false;
    this.panel.hidden = true;
  }
  editable() {
    this.animation.assertNoExternalExport();
    if (this.animation.exporting || this.animation.editing) throw Error('Finish the current animation action first.');
    this.animation.pause();
  }
  move(index, time, { snap = true, source, sequence } = {}) {
    this.editable();
    if (
      (source && source !== this.context.getState()) ||
      (sequence && JSON.stringify(sequence) !== JSON.stringify(this.animation.sequence()))
    )
      throw Error('Animation changed during the drag. Repeat it.');
    const value = moveSequenceKeyframe(this.animation.sequence(), index, time, { snap });
    this.animation.save(value);
    this.animation.time = value.keyframes[index].time;
    this.sync();
    return this.animation.scrub(this.animation.time);
  }
  remove(index) {
    this.editable();
    const sequence = this.animation.sequence();
    if (sequence.keyframes.length <= 2) {
      this.context.setStatus('Keep at least two keyframes. Add a keyframe before deleting one.');
      return;
    }
    const value = deleteSequenceKeyframe(sequence, index);
    this.lanes.selected = Math.min(index, value.keyframes.length - 1);
    this.animation.save(value);
    this.context.setStatus('Deleted keyframe. Undo restores it.');
    this.sync();
    return this.animation.scrub(value.keyframes[this.lanes.selected].time);
  }
  async exactTime() {
    const input = this.node('timeline-exact-time'),
      text = input.value;
    this.timeEditing = true;
    this.animation.pause();
    this.tours.pause();
    const mode = this.mode,
      duration = this.duration(),
      source = this.context.getState();
    this.numeric?.destroy();
    const entry = (this.numeric = new NumericEntry({
      ...this.animation.context,
      getTarget: () => [this.mode, input.value, this.duration(), this.context.getState()?.view.animation],
      isExporting: () => this.animation.exporting || this.animation.externalExporting(),
    }));
    try {
      return await entry.run({ time: { text, min: 0, max: duration } }, (values, verify) => {
        verify();
        if (source !== this.context.getState() || mode !== this.mode)
          throw Error('Timeline changed. Repeat the time entry.');
        return this.scrub(values.time);
      });
    } finally {
      if (this.numeric === entry) {
        this.timeEditing = false;
        this.sync();
      }
    }
  }
  resize() {
    const grip = this.node('timeline-resize'),
      apply = (height) => {
        height = Math.round(
          Math.max(180, Math.min(520, height, this.node('views').closest('.workspace').clientHeight - 200))
        );
        this.panel.style.height = `${height}px`;
        grip.setAttribute('aria-valuenow', String(height));
      };
    grip.onpointerdown = (event) => {
      if (event.button !== 0) return;
      this.resizing = { y: event.clientY, height: this.panel.clientHeight };
      grip.setPointerCapture(event.pointerId);
    };
    grip.onpointermove = (event) => {
      if (this.resizing) apply(this.resizing.height + this.resizing.y - event.clientY);
    };
    grip.onpointerup = grip.onpointercancel = () => {
      this.resizing = null;
    };
    grip.onkeydown = (event) => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      apply(this.panel.clientHeight + (event.key === 'ArrowUp' ? 16 : -16));
    };
  }
  sync() {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const source = this.context.getState();
      if (!source) {
        write(this.panel, 'hidden', true);
        return;
      }
      write(this.panel, 'hidden', !this.node('animation-settings').open && !this.node('tour-settings').open);
      const tour = this.mode === 'tour',
        a = this.animation.nodes,
        t = this.tours.nodes,
        sequence = this.animation.sequence(),
        time = tour ? this.tours.time : this.animation.time,
        duration = tour ? this.tours.total() : sequence.duration;
      if (this.panel.dataset.mode !== this.mode) this.panel.dataset.mode = this.mode;
      for (const [id, hidden] of [
        ['timeline-keyframes', tour],
        ['timeline-keyframes-transport', tour],
        ['timeline-tour', !tour],
        ['timeline-tour-transport', !tour],
        ['timeline-timing', tour],
        ['timeline-animation-export', tour],
        ['timeline-tour-export', !tour],
      ])
        write(this.node(id), 'hidden', hidden);
      for (const [id, selected] of [
        ['timeline-keyframes-mode', !tour],
        ['timeline-tour-mode', tour],
      ])
        attribute(this.node(id), 'aria-pressed', String(selected));
      write(this.node('timeline-readout'), 'textContent', `${timelineTime(time)} / ${timelineTime(duration)}`);
      if (!this.timeEditing && this.doc.activeElement !== this.node('timeline-exact-time'))
        write(this.node('timeline-exact-time'), 'value', String(time));
      const blocked =
        this.animation.editing ||
        this.animation.exporting ||
        this.animation.externalExporting() ||
        this.tours.numericEditing;
      for (const id of ['timeline-exact-time', 'timeline-delete-keyframe', 'timeline-export-video'])
        write(this.node(id), 'disabled', Boolean(blocked));
      for (const id of ['timeline-tour-start', 'timeline-tour-end'])
        write(this.node(id), 'disabled', Boolean(blocked || !this.tours.observedTour?.events.length));
      if (source !== this.source) {
        this.source = source;
        this.lanes.selected = 0;
        const plane = String(
          source.view.rotationPlane ?? ((source.model.embeddingDimension || source.model.dimension) === 4 ? 2 : 1)
        );
        a.plane.value = [...a.plane.options].some((option) => option.value === plane && !option.disabled) ? plane : '0';
      }
      this.lanes.render(sequence);
      this.node('timeline-lanes').style.setProperty(
        '--playhead',
        `${(this.animation.time / sequence.duration) * 100}%`
      );
      const ruler = this.node('timeline-ruler'),
        signature = String(duration);
      if (ruler.dataset.duration !== signature) {
        ruler.dataset.duration = signature;
        ruler.replaceChildren(
          ...rulerTicks(duration).map((value) => {
            const node = make(this.doc, 'span', null, `${Math.round(value * 100) / 100}s`);
            node.style.left = `${(value / duration) * 100}%`;
            return node;
          })
        );
      }
      const selected = sequence.keyframes.findIndex((frame) => Math.abs(frame.time - this.animation.time) < 1e-8);
      write(
        a.keyframe,
        'textContent',
        selected >= 0 ? 'Update selected keyframe' : `Add keyframe at ${this.animation.time.toFixed(2)} s`
      );
      if (selected >= 0 && selected !== this.lanes.selected) {
        this.lanes.selected = selected;
        this.lanes.render(sequence);
      }
      const dimension = source.model.embeddingDimension || source.model.dimension;
      const capabilities =
        typeof this.animation.context.capabilities === 'function'
          ? this.animation.context.capabilities()
          : this.animation.context.capabilities;
      for (const recipe of this.recipes) {
        const why = motionPresetReason(recipe.key, source, { capabilities, blocked });
        write(recipe.reason, 'textContent', why || recipe.hint);
        write(a[recipe.key], 'title', why || recipe.hint);
        write(a[recipe.key], 'disabled', Boolean(why));
      }
      write(a.rotation, 'textContent', dimension === 4 ? 'Turn in 4D' : 'Turn in 3D');
      this.syncCamera();
      this.table(sequence);
    } catch (error) {
      this.context.setStatus(error.message);
    } finally {
      this.syncing = false;
    }
  }
  syncCamera() {
    const lane = TRACK_LANES.find((lane) => lane.key === 'camera');
    if (!lane) {
      if (this.cameraRow) write(this.cameraRow, 'hidden', true);
      return;
    }
    if (!this.camera) {
      this.cameraRow = make(this.doc, 'div');
      this.cameraRow.className = 'timeline-recipe';
      this.camera = make(this.doc, 'button', 'timeline-camera-orbit', 'Camera orbit');
      this.cameraHint = make(this.doc, 'small');
      this.cameraRow.append(this.camera, this.cameraHint);
      this.node('timeline-motions').append(this.cameraRow);
      this.camera.onclick = this.action(async () => {
        const count = this.context.getState()?.view.animation?.keyframes.length;
        await this.animation.addTrack('camera');
        this.context.setStatus(
          count
            ? `Replaced the ${count}-keyframe animation. Undo restores it. Press Play to preview.`
            : 'Motion added. Press Play to preview.'
        );
      });
    }
    const reason =
      this.animation.exporting || this.animation.editing || this.animation.externalExporting()
        ? 'Finish the current animation action first.'
        : lane.available?.(this.context.getState().model) === false
          ? 'Camera orbit is unavailable for this model.'
          : '';
    write(this.cameraRow, 'hidden', false);
    write(this.camera, 'disabled', Boolean(reason));
    write(this.camera, 'title', reason || 'Orbit the observer around the shape');
    write(this.cameraHint, 'textContent', reason || 'Orbit the observer around the shape');
  }
  table(sequence) {
    const signature = JSON.stringify(sequence);
    if (signature === this.tableSignature) return;
    this.tableSignature = signature;
    const host = this.node('timeline-keyframe-table'),
      table = make(this.doc, 'table'),
      head = make(this.doc, 'tr');
    const lanes = TRACK_LANES.filter((lane) => Object.hasOwn(sequence.keyframes[0], lane.key));
    for (const text of ['Time (s)', ...lanes.map((lane) => lane.label)]) head.append(make(this.doc, 'th', null, text));
    table.append(head);
    sequence.keyframes.forEach((frame, index) => {
      const row = make(this.doc, 'tr');
      for (const key of ['time', ...lanes.map((lane) => lane.key)]) {
        const cell = make(this.doc, 'td'),
          input = make(this.doc, 'input'),
          object = typeof frame[key] === 'object' && !Array.isArray(frame[key]),
          parts = object ? Object.values(frame[key]) : frame[key];
        input.type = 'text';
        input.maxLength = 512;
        input.value = Array.isArray(parts) ? parts.join(', ') : String(parts);
        input.setAttribute('aria-label', `Keyframe ${index + 1} ${key}`);
        input.disabled = key === 'time' && (index === 0 || index === sequence.keyframes.length - 1);
        if (object) input.title = Object.keys(frame[key]).join(', ');
        input.onchange = this.action(async () => {
          this.editable();
          const text = input.value,
            source = this.context.getState();
          const numeric = new NumericEntry({
            ...this.animation.context,
            getTarget: () => [input.value, source.view.animation],
          });
          try {
            await numeric.run(
              { value: { text, ...(Array.isArray(parts) ? { kind: 'vector', length: parts.length } : {}) } },
              (values, verify) => {
                verify();
                if (JSON.stringify(sequence) !== JSON.stringify(this.animation.sequence()))
                  throw Error('Animation changed. Repeat the keyframe edit.');
                const value = object
                  ? Object.fromEntries(Object.keys(frame[key]).map((name, i) => [name, values.value[i]]))
                  : Array.isArray(values.value)
                    ? [...values.value]
                    : values.value;
                const result =
                  key === 'time'
                    ? moveSequenceKeyframe(sequence, index, value, { snap: false })
                    : normalizeSequence({
                        ...sequence,
                        keyframes: sequence.keyframes.map((item, i) =>
                          i === index ? { ...item, [key]: value } : item
                        ),
                      });
                this.animation.save(result);
              }
            );
          } finally {
            numeric.destroy();
            this.tableSignature = null;
            this.sync();
          }
        });
        cell.append(input);
        row.append(cell);
      }
      table.append(row);
    });
    host.replaceChildren(table);
  }
}
