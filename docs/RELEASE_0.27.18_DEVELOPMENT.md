# 0.27.18: camera controls recover after framing and export

Local development preview, October 22, 2026. Feature expansion remains paused.
Public production remains 0.26.0; nothing was published online. Previous local
portable/source pairs remain preserved.

Fit export frames could leave both viewports unable to rotate. A completed or
canceled section PNG export could leave the derived viewport disabled. Cleanup
restored only the original OrbitControls object, but fitting and camera
restoration had replaced it with another object carrying the temporary disabled
settings. The actual bundled 0.27.17 baseline reproduces all four frozen cases
using pointer drags and native project Save:
`artifacts/capture-controls-FnElC3/result.json` (`baseline: true`).

Temporary observation ownership now follows the viewer's own initialized control
replacements. Releasing the final owner restores the original enabled/damping
settings. Nested holders and an originally disabled viewer retain their intended
state. Cleanup cannot alter independently installed controls or a newer owner.
Animation export and framing also release observation and busy state if pose or
camera restoration throws, allowing subsequent actions to proceed.

Exact source/view/camera/request publication guards remain enforced. Saved
geometry, animation tracks, notes and frame times are unchanged. The 0.27.17
frozen-camera drawing and saved-section material reuse remain in effect. No
native algorithms, mathematical domains or numerical claims changed.

## Development verification

- Production build: 167 UI modules.
- 133 focused checks: `artifacts/capture-control-regression-0.27.18.tap`.
  Coverage includes control replacement and owner ordering, independent controls,
  partial acquisition failures, native write/presentation restoration errors,
  framing camera failures, exact capture guards, native section geometry,
  saved tours, exports, stereo and multiview behavior.
- Real development desktop: `artifacts/capture-controls-D10J5K/result.json`.
  Each scenario uses a fresh profile, establishes actual pointer rotation, then
  checks rotation again after fitting, completed section PNG export, or Cancel
  while holding an already completed native frame-write reply. Both viewports
  rotate afterward. Source geometry, notes, plane, pose and saved animation are
  preserved; PNG export has three exact times `[0, .125, .25]`. Cancellation
  leaves no installed output or native staging directory.
- The harness checks the actual saved duration and FPS before capture and keeps
  disclosure panels clear of the pointer workload. Exploratory harness failures
  remain preserved separately and are not qualification evidence.
## Actual bundled desktop and portable verification

The actual bundled desktop passes with development Python unavailable:

- Pointer recovery after fitting, completed PNG export and held-write Cancel:
  `artifacts/capture-controls-B5vckT/result.json`. Both viewports rotate afterward
  in every case. Source/notes/pose/plane/animation preservation and native output
  checks pass. The fitted-and-rotated workspace screenshot was visually inspected.
- Section/entity/depth/held export/retry:
  `artifacts/section-workflow-YfZRuO/result.json`.
- Face/cell nets, cuts, history, PDF and held animation export/retry:
  `artifacts/net-workflow-Iy3Wpb/result.json`.
- Saved tours: `artifacts/animated-tours-packaged-9MuUAV/result.json`.
  Nine checks include native Save/Open, independent preview layers, exact PNG
  samples, seven decoded VP8/WebM frames with matching source times and poses,
  cancellation and actual project replacement.
- Saved 120-cell section sweep: `artifacts/tour-section-profile-FvvmsF/result.json`.
  Initial/current frames publish, pixels change, native Save preserves source and
  tour, preview disposal passes, and the five warmed cuts still create/link/delete
  zero GPU programs. This is not an FPS or isolated GPU timing claim.
- Core construction/history/Save/Open: `artifacts/core-experience-mXgowz/result.json`.
- Morph playback/scrubbing/PNG/Save/Open: `artifacts/morph-workflow-Z88KnC/result.json`.
- Geometry/derived export: `artifacts/export-workflow-RZDqtX/result.json`.
- Intrinsic measurement/identity feedback: `artifacts/intrinsic-feedback-3mpEip/result.json`.
- All 16 registered regular 4D sources and native identity receipts:
  `artifacts/regular4d-catalog-smoke-2haZ55/result.json`. The independent reference
  remains `artifacts/regular4d-proof-0.27.16.json`; its catalog and native validator
  hashes still match and are checked before launch. No reference guard changed.
- Hidden desktop canary: `artifacts/hidden-desktop-canary-wAaDLm/result.json`.

Actual portable wrapper launch: `artifacts/portable-launch-eOxNEA/result.json`.
Its 1,716 extracted resources match the tested unpacked application. Current
package verification binds 1,878 frozen runtime inputs and protected importer
hashes: `release/preview-0.27.18/verification.json`. All 1,667 engine inputs match
0.27.17: `artifacts/engine-unchanged-0.27.18.json`.

Portable: `release/preview-0.27.18/Polytope Laboratory 0.27.18 preview.exe`.
Bytes: 143,238,845. SHA-256:
`bb88306ed9d62cd7a3174ed82f32c1c095e7673dcc5d6d5b8ca6c2534a91b541`.
Matching source: `release/Polytope Laboratory 0.27.18 source.zip`.
Source-pair receipt: `artifacts/source-pair-0.27.18.json`.

The build completes with the existing Vite large-bundle and optional freetype
hook warnings. No exhaustive regression, general FPS/latency improvement or
fresh-user observation claim is made.

## Next core work

Continue measured renderer/model-loading work and review visible controls and
feedback across common tasks. Fresh-user observation remains open; staged feature
expansion stays deferred.
