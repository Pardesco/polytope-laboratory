import { sequenceLanes } from './animation-track-registry.mjs';

export function laneRows(sequence) {
  return sequenceLanes(sequence).map((lane) => ({
    ...lane,
    frames: lane.varies
      ? sequence.keyframes.map((frame, index) => ({
          index,
          time: frame.time,
          position: frame.time / sequence.duration,
          value: lane.format?.(frame[lane.key]) ?? JSON.stringify(frame[lane.key]),
        }))
      : [],
  }));
}
export function rulerTicks(duration) {
  const step = Math.max(1, Math.ceil(duration / 20));
  const ticks = [];
  for (let time = 0; time < duration; time += step) ticks.push(time);
  ticks.push(duration);
  return ticks;
}
export function timelineTime(time) {
  time = Math.round(time * 100) / 100;
  const minutes = Math.floor(time / 60);
  return `${String(minutes).padStart(2, '0')}:${(time - minutes * 60).toFixed(2).padStart(5, '0')}`;
}
export function stepKeyframeSelection(sequence, { index, lane }, key) {
  const lanes = laneRows(sequence)
      .filter((row) => row.varies)
      .map((row) => row.key),
    current = Math.max(0, lanes.indexOf(lane));
  if (key === 'ArrowUp' || key === 'ArrowDown')
    return { index, lane: lanes[Math.max(0, Math.min(lanes.length - 1, current + (key === 'ArrowDown' ? 1 : -1)))] };
  return {
    lane,
    index:
      key === 'Home'
        ? 0
        : key === 'End'
          ? sequence.keyframes.length - 1
          : Math.max(
              0,
              Math.min(sequence.keyframes.length - 1, index + (key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0))
            ),
  };
}

export class AnimationLanes {
  constructor(host, context) {
    this.host = host;
    this.context = context;
    this.selected = 0;
    this.lane = 'angles';
    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', 'Animated keyframe lanes; arrows select keyframes, Delete removes');
  }
  render(sequence) {
    this.sequence = sequence;
    this.selected = Math.min(this.selected, sequence.keyframes.length - 1);
    const signature = JSON.stringify([sequence, this.selected, this.lane]);
    if (signature === this.signature) return;
    this.signature = signature;
    const doc = this.host.ownerDocument,
      focused = doc.activeElement?.closest?.('[data-keyframe]'),
      restore = focused && this.host.contains(focused);
    this.host.replaceChildren();
    for (const lane of laneRows(sequence)) {
      const row = doc.createElement('div');
      row.className = 'timeline-lane' + (lane.varies ? '' : ' constant');
      row.dataset.lane = lane.key;
      const label = doc.createElement('span');
      label.className = 'timeline-lane-label';
      label.textContent = lane.label;
      label.title = lane.subtitle;
      row.append(label);
      const track = doc.createElement('div');
      track.className = 'timeline-lane-track';
      row.append(track);
      if (!lane.varies) {
        track.textContent = 'Constant';
        this.host.append(row);
        continue;
      }
      for (const frame of lane.frames) {
        const node = doc.createElement('button');
        node.type = 'button';
        node.className = 'timeline-diamond';
        node.dataset.keyframe = String(frame.index);
        node.dataset.lane = lane.key;
        node.style.left = `${frame.position * 100}%`;
        node.tabIndex = this.selected === frame.index && this.lane === lane.key ? 0 : -1;
        node.setAttribute('aria-pressed', String(this.selected === frame.index));
        node.title = `${lane.label}: ${frame.time.toFixed(3)} s; ${frame.value}`;
        node.setAttribute('aria-label', node.title);
        node.textContent = '◆';
        node.onclick = () => {
          if (this.dragged) {
            this.dragged = false;
            return;
          }
          this.select(frame.index, lane.key);
        };
        node.onkeydown = (event) => {
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next = stepKeyframeSelection(sequence, { index: frame.index, lane: lane.key }, event.key);
            this.select(next.index, next.lane, true);
          }
          if (['Delete', 'Backspace'].includes(event.key)) {
            event.preventDefault();
            this.context.remove(frame.index);
          }
        };
        node.onpointerdown = (event) => {
          if (event.button !== 0) return;
          this.context.pause();
          const rect = track.getBoundingClientRect();
          this.drag = {
            pointer: event.pointerId,
            index: frame.index,
            x: event.clientX,
            rect,
            time: frame.time,
            source: this.context.source?.(),
            sequence,
          };
          this.dragged = false;
          node.setPointerCapture(event.pointerId);
        };
        node.onpointermove = (event) => {
          if (this.drag?.pointer !== event.pointerId) return;
          if (Math.abs(event.clientX - this.drag.x) < 4 && !this.dragged) return;
          this.dragged = true;
          this.drag.time = Math.max(
            0,
            Math.min(
              sequence.duration,
              ((event.clientX - this.drag.rect.left) / this.drag.rect.width) * sequence.duration
            )
          );
          this.drag.free = event.shiftKey;
          node.style.left = `${(this.drag.time / sequence.duration) * 100}%`;
          node.title = `${this.drag.time.toFixed(3)} s`;
        };
        node.onpointerup = (event) => {
          const drag = this.drag;
          if (drag?.pointer !== event.pointerId) return;
          this.drag = null;
          if (this.dragged)
            this.context.move(drag.index, drag.time, {
              snap: !drag.free,
              source: drag.source,
              sequence: drag.sequence,
            });
          this.signature = null;
          this.render(this.context.sequence());
        };
        node.onpointercancel = () => {
          this.drag = null;
          this.dragged = false;
          this.signature = null;
          this.render(this.context.sequence());
        };
        track.append(node);
      }
      this.host.append(row);
    }
    if (!this.host.querySelector('[tabindex="0"]')) {
      const first = this.host.querySelector('.timeline-diamond');
      if (first) first.tabIndex = 0;
    }
    if (restore) this.focus();
  }
  focus() {
    this.host
      .querySelector(`[data-lane="${this.lane}"] [data-keyframe="${this.selected}"]`)
      ?.focus({ preventScroll: true });
  }
  select(index, lane = this.lane, focus = false) {
    this.selected = index;
    this.lane = lane;
    this.context.select(index);
    this.render(this.context.sequence());
    if (focus) this.focus();
  }
}
