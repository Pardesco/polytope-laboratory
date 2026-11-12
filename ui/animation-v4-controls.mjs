import { withSequenceTracks, normalizeSequence } from './animation.mjs';
import { captureAnimationV4View, cameraOrbitFromView } from './animation-v4-view.mjs';

export const V4_TRACK_LABELS = {
  camera: 'Camera orbit',
  projection: '4D perspective eye',
  opacity: 'Face opacity',
  sectionNormal: 'Section normal',
};

export async function addAnimationV4Track(controls, kind) {
  return controls.numericAction(
    [],
    () => ({}),
    async (values, check) => {
      const state = controls.context.getState(),
        view = captureAnimationV4View(state.view, controls.context.viewer, state.model.dimension),
        signature = JSON.stringify(state.view),
        cameraSignature = JSON.stringify(view.camera);
      let old = controls.configuredSequence(values);
      if (!state.view.animation)
        old = { ...old, keyframes: old.keyframes.map((frame) => ({ ...frame, angles: [...old.keyframes[0].angles] })) };
      let candidate = withSequenceTracks(old, { ...old.tracks, [kind]: {} }, view);
      if (kind === 'camera') {
        const start = cameraOrbitFromView(view);
        candidate.keyframes = candidate.keyframes.map((frame) => ({
          ...frame,
          camera: { ...start, azimuth: start.azimuth + (360 * frame.time) / candidate.duration },
        }));
        candidate = normalizeSequence(candidate);
      }
      controls.context.stopLegacy?.();
      await controls.trackSessions.prepare(candidate, { preflight: true });
      check();
      if (
        JSON.stringify(state.view) !== signature ||
        JSON.stringify(controls.context.viewer?.cameraState?.() ?? state.view.camera) !== cameraSignature
      )
        throw Error('The current view changed while adding the animation track. Repeat the action.');
      controls.time = 0;
      controls.save(candidate);
      controls.context.setStatus?.(
        `${V4_TRACK_LABELS[kind]} track saved. ${kind === 'camera' ? 'Camera azimuth turns 360° from the current view.' : 'Change the view and add a keyframe to animate this property.'}`
      );
    }
  );
}

export function mountAnimationV4Controls(controls, wrap) {
  const disclosure = document.createElement('details');
  disclosure.id = 'animation-v4-options';
  disclosure.innerHTML = `<summary>Camera and display tracks</summary><p class="muted">Add a track, change the view, then add a keyframe. Section normals need a 4D model; eye distance needs Perspective projection.</p>${Object.entries(
    V4_TRACK_LABELS
  )
    .map(
      ([key, label]) =>
        `<button id="animation-add-${key}" class="wide">${label}: ${key === 'camera' ? 'orbit the current view' : 'capture the current value'}</button>`
    )
    .join('')}`;
  controls.container.append(disclosure);
  for (const key of Object.keys(V4_TRACK_LABELS))
    disclosure.querySelector(`#animation-add-${key}`).onclick = wrap(() => controls.addTrack(key));
}

export function updateAnimationV4Controls(controls, state) {
  const disabled = Boolean(controls.editing || controls.exporting || controls.externalExporting());
  for (const key of Object.keys(V4_TRACK_LABELS)) {
    const button = controls.container.querySelector?.(`#animation-add-${key}`);
    if (!button) continue;
    const reason =
      key === 'sectionNormal' && state.model.dimension !== 4
        ? 'Section normal animation requires an intrinsic 4D model.'
        : key === 'projection' &&
            ((state.model.embeddingDimension ?? state.model.dimension) !== 4 || state.view.projection !== 'perspective')
          ? 'Eye animation requires a 4D model in Perspective projection.'
          : '';
    button.disabled = disabled || Boolean(reason);
    button.title = reason;
  }
}
