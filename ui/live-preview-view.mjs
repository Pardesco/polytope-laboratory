// Keep the source coordinate frame: renormalizing each result hides scaling.
export function presentLivePreview(viewer, source, model, view, { first = false } = {}) {
  viewer.setModel(model, {
    normalization: { center: [...source.center], radius: source.radius },
    reuseMaterials: true,
    deferDisplay: true,
  });
  const display = {
    ...view,
    hiddenCells: [],
    isolatedCell: null,
    cellShrink: 1,
    explosionAmount: 0,
    cellFacing: 'all',
  };
  for (const key of [
    'dualMorph',
    'elementAnnotations',
    'entitySelection',
    'elementVisibility',
    'orientationFrame',
    'cellFacingCache',
    'net',
    'cellNet',
  ])
    delete display[key];
  viewer.setDisplay(display);
  if (first) viewer.restoreCamera(source.cameraState());
}
