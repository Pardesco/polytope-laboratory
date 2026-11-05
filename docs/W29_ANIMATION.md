# W29: 4D morphs, colors and offline animation export

The existing **Dual morph** disclosure (`dual-morph-settings`) now enables
**sizing** and **truncation** in Method (`dual-morph-method`) for finite intrinsic
convex 4D sources. Apply, Play, ratio/scrub and the existing animation ratio
track/export workflow work unchanged. Generalized 4D retains expansion only;
convex 4D also retains expansion and tilting quads. The remaining morph methods
are still 3D-only; via-snub is unavailable.
Infinite/hemi reciprocals remain unsupported; singular or exterior centers fail.

## Definitions and verification

The reciprocal is built from literal cell planes and reversed complete boundary
incidence. All primal and reciprocal facets must support the coordinates with
the chosen center strictly inside. Polarity residuals are returned. Tests cover
both directions of tesseract/16-cell, 120-cell/600-cell, and the self-dual 24-cell.
Endpoints return the literal source and prepared reciprocal, retaining topology.

Sizing uses two separate boundary layers, scaled about the reciprocation center
by `1-t` and `t`. It asserts no filled compound/union volume. Vanished layers are
omitted exactly at 0 and 1. Cells reference the correctly offset face indices.

4D truncation intersects the primal and scaled reciprocal supporting halfspaces.
For `t <= .5`, primal scale stays 1 while reciprocal enclosure decreases affinely
to 1. Then reciprocal scale stays 1 while primal scale increases affinely to its
enclosure. Scales are monotone, although containment can create stationary
intervals. Unlike the existing 3D plane-triple implementation, this explicitly
uses SciPy HalfspaceIntersection and Qhull convex incidence reconstruction.
Every returned interior pose validates supporting halfspaces, active-plane vertex
rank, face/cell incidence and Euler relations. Active-plane sets and a topology
signature expose the current topology; all transition ratios are not enumerated.
Near-transition tolerance ambiguity is refused, rather than snapped to a different
topology. Bounds: 2,048 combined planes, 20,000 vertices, 32,000 elements per rank.
Everything is approximate float64, not an exact or Stella trajectory certificate.

**Interpolate face colors** (`dual-morph-colors`) saves optional boolean
`view.dualMorph.interpolateColors` and works through native preparation, playback,
animation tracks and project reopen. It linearly blends normalized straight RGBA,
including alpha. Per-element fields use equal-weight incident face colors at
declared primal/reciprocal owners. Missing reciprocal face colors derive from the
corresponding primal entity's incident face colors. Ownerless elements use global
face means; one missing field retains the available field. Endpoint colors remain
literal, so palette/rank changes can snap there. Interior indexed palettes are
refused; explicit byte/float RGB/RGBA are supported. Default colors are untouched
when disabled. The interpolation is not a color-space/perceptual or benchmark
palette guarantee. 4D truncation without interpolation retains normal default
interior styling rather than claiming a source-face bijection.

## Tours

Choose **morph to dual** in Tours > Outgoing transition (`tour-transition`), then
**Apply transition** (`tour-transition-apply`). Add the source snapshot, construct
its native Dual, and add that snapshot as the next event. Native verification
reconstructs the reciprocal and compares coordinates, every edge, ordered face
cycle and complete cell incidence, allowing reordered entity indices. Saved
projects/tours repeat this verification. Lookalike counts or forged provenance
alone do not qualify. Final outgoing transitions refer to event zero when looping.

The transition is one opaque sizing-morph layer, evaluated at eased absolute
transition time. It holds the outgoing event's terminal orientation and section
depth; the incoming saved view begins at the next hold. Target-view/style changes
can therefore snap at that boundary. Native endpoint verification runs before
Apply publishes and before a renderer installs the morph. Source snapshots/history
are unchanged. Morph transitions cannot be combination components. Existing source
mask, shrink, explosion, fold, changing-section and annotation-sheet guards apply.

Fold plus explosive tour transitions remains explicitly refused: base-model face
explosion displaces independent source faces, while the folded net owns different
rigid hinge instances, tabs, labels and content. Its renderer has no per-face
explosion adapter. Removing the guard would explode only one comparison pane.
A qualified folded-net displacement/content adapter is follow-up work.

## Offline WebM

Animation **Export WebM video** (`animation-webm`) and Tours **WebM** (`tour-webm`)
already used the explicit-frame VP8 pipeline at this baseline. W29 audits and
retains that implementation, updates stale real-time claims, adds visible offline
help, and adds deterministic slow-scene/cancellation regression tests. Each exact
source time awaits rendering/fine capture, owns an immutable VideoFrame with a
microsecond timestamp, drains the codec, and awaits ordered native writes. No
playback clock schedules frames. Both endpoints are included, with one terminal
frame-period hold. The final fractional interval retains its exact timestamp.
PNG export is unchanged. Existing progress/cancel controls remain mounted.

Limits remain 300 seconds, FPS 1–60, 18,001 frames and 512 MiB. WebCodecs VP8 must
be available. Encoder/device compression bytes and GPU pixel identity are not
guaranteed. Date-based failure timeouts do not determine frame timestamps.

## Tests

`tests/test_animation_4d.py` covers endpoints, independent reciprocal coordinates,
interior incidence, monotone parameters, numerical ambiguity, RGBA values,
persistence, binding tampering and native tour target rejection.
`tests/animation-w29.test.mjs` covers eligibility, tour planning, actual Three
Viewer/native morph integration, and fake-canvas/codec WebM frame counts,
timestamps, slow-render invariance and cancellation. It is in `test:features`.
Existing morph, animation, tour, recorder and engine-pool tests are also run.
No Electron launch, real GPU capture or browser-codec decode was attempted in this
sandbox; the lead must qualify those in the desktop app.

Verification in this worktree: **205 Python tests + 22 subtests**, **284 Node
tests** (180 animation/tour/export/session checks and 104 broader renderer/morph
regressions), and `npx.cmd vite build --configLoader native` passed. The build
retains its existing large-chunk warning. `git diff --check` passed.

New files: `engine/dual_morph_4d.py`, `engine/dual_morph_colors.py`,
`engine/dual_morph_tour.py`, `ui/dual-tour-transition.mjs`,
`tests/test_animation_4d.py`, `tests/animation-w29.test.mjs`, and this document.
Changed files:

- Engine: `dual_morph.py`, `dual_morph_cache.py`, `server.py`, `tours.py`.
- Desktop: `engine-pool.cjs`, `main.cjs` (one allowlist addition each).
- UI: `app.js`, `dual-morph-controls.mjs`, `dual-morph-session.mjs`,
  `animated-tour-renderer.mjs`, `animated-tour-timeline.mjs`,
  `animation-controls.mjs`, `tour-controls.mjs`, `transitions.mjs`,
  `video-recorder.mjs`, `vp8-webm.mjs`.
- Tests: `dual-morph-session.test.mjs`, `test_dual_morph_integration.py`,
  `test_tours.py`; `package.json` adds the new Node test to `test:features`.
- Docs: `ANIMATION.md`, `ANIMATED_TOUR_RENDERING.md`,
  `DUAL_MORPH_ANIMATION_EXPORT.md`.
