/** World-Y spherical orbit, with azimuth measured from +Z toward +X. */
export function cameraOrbitFromView(view = {}) {
  const camera = view.camera ?? { position: [3.2, 2.2, 4.5], target: [0, 0, 0] };
  if (
    camera.position?.length !== 3 ||
    camera.target?.length !== 3 ||
    ![...camera.position, ...camera.target].every(Number.isFinite)
  )
    throw Error('Camera orbit requires finite observer position and target.');
  const [x, y, z] = camera.position.map((v, i) => v - camera.target[i]),
    distance = Math.hypot(x, y, z);
  if (!distance) throw Error('Camera orbit distance must be positive.');
  return {
    azimuth: (Math.atan2(x, z) * 180) / Math.PI,
    elevation: (Math.asin(Math.max(-1, Math.min(1, y / distance))) * 180) / Math.PI,
    distance,
  };
}

export function captureAnimationV4View(view, viewer, dimension = 4) {
  return {
    ...view,
    camera: viewer?.cameraState?.() ?? view.camera,
    surfaceOpacity: view.surfaceOpacity ?? (dimension === 4 ? 0.22 : 0.86),
  };
}

export function applyAnimationV4Frame(view, frame) {
  if (frame.camera) {
    const { azimuth, elevation, distance } = frame.camera,
      a = (azimuth * Math.PI) / 180,
      e = (elevation * Math.PI) / 180;
    const camera = view.camera ?? {},
      target = camera.target ?? [0, 0, 0],
      r = distance * Math.cos(e);
    view.camera = {
      ...camera,
      target: [...target],
      position: [r * Math.sin(a), distance * Math.sin(e), r * Math.cos(a)].map((x, i) => x + target[i]),
      up: [0, 1, 0],
    };
  }
  if (Object.hasOwn(frame, 'projection')) view.perspectiveDistance4D = frame.projection;
  if (Object.hasOwn(frame, 'opacity')) view.surfaceOpacity = frame.opacity;
  if (frame.sectionNormal) {
    if (view.sectionNormal?.some((x, i) => x !== frame.sectionNormal[i]) || view.sectionNormal?.length !== 4)
      delete view.sectionAlignment;
    view.sectionNormal = [...frame.sectionNormal];
  }
  return view;
}

export function requireAnimationV4View(state, sequence) {
  const tracks = sequence.tracks ?? {};
  if (
    tracks.projection &&
    ((state.model.embeddingDimension ?? state.model.dimension) !== 4 || state.view.projection !== 'perspective')
  )
    throw Error('4D perspective eye animation requires a 4D model in Perspective projection.');
  if (
    tracks.projection &&
    sequence.keyframes.some((frame) => frame.projection <= (state.view.perspectiveNear4D ?? 0.08))
  )
    throw Error('Every animated 4D eye distance must exceed the current perspective near depth.');
  if (tracks.sectionNormal && state.model.dimension !== 4)
    throw Error('Section normal animation requires an intrinsic 4D model and unit 4-vectors.');
}

export function syncAnimationV4Inputs(view, doc = globalThis.document) {
  for (const [id, value] of [
    ['section-normal', view.animation?.tracks?.sectionNormal ? view.sectionNormal?.join(', ') : undefined],
    ['surface-opacity', view.animation?.tracks?.opacity ? view.surfaceOpacity : undefined],
  ]) {
    const input = doc?.getElementById?.(id);
    if (input && doc.activeElement !== input && value !== undefined && input.value !== String(value))
      input.value = String(value);
  }
}
