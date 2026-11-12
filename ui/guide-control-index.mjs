// Reveal existing controls without executing a construction, file action or export.
export const GUIDE_CONTROLS = {
  construction: [
    ['make-dual', 'Polar dual — swap facets and vertices'],
    ['truncation', 'Truncation — choose an edge-cut fraction'],
  ],
  faceting: [
    ['faceting-criterion', 'Faceting criterion — choose tidy-dual or another filter'],
    ['faceting-candidates', 'Candidate pool — inspect the bounded search'],
  ],
  projects: [
    ['history-replay', 'Replay — verify recorded constructions'],
    ['history-branch', 'Parameters — branch a supported operation'],
  ],
  'unsupported-domains': [
    ['generator', 'Generators — choose another source'],
    ['validate', 'Incidence validation — inspect the supplied boundary'],
  ],
  animation: [
    ['animation-duration', 'Timeline — set duration'],
    ['dual-morph-method', 'Dual morph — choose a method'],
  ],
  'animation-4d': [
    ['dual-morph-method', 'Dual morph — choose a method'],
    ['animation-morph', 'Timeline — add a morph ratio sweep'],
  ],
  'media-export': [
    ['animation-format', 'Animation export — choose a format'],
    ['tour-format', 'Tour export — choose a format'],
  ],
  images: [['png-settings', 'PNG options — size, framing and transparency']],
};
