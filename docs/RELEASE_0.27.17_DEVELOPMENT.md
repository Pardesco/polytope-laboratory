# 0.27.17: reliable saved-tour sections and retained GPU programs

Local development preview, October 22, 2026. Feature expansion remains paused.
Public production remains 0.26.0; nothing was published online. The qualified
0.27.16 portable/source pair and earlier artifacts remain preserved.

Saved-tour section previews now keep disabled observation controls still while
drawing. OrbitControls could round a fitted camera after the exact capture
snapshot, causing the final publication guard to reject its own frame as stale.
The actual bundled 0.27.16 120-cell example produced a blank preview or retained
an earlier pose after the native section completed. A debugger captured
`AbortError: Tour layer publication is stale` at composition:
`artifacts/tour-section-profile-9meggI/failure.json`. This is a reproduced failure,
not a passing release receipt. Earlier exploratory harness failures are retained;
one initial fixture incorrectly declared additional tracks on a v1 animation and
was corrected before using the workload.

The fix respects explicit observation disabling during capture, export and tour
composition; enabling observation resumes normal control updates. Programmatic
camera restoration and fitting still initialize their controls. Full source,
view, camera, matrix, project and request ownership checks remain exact. No
tolerance was added to a publication guard.

Tour actors also use the existing source/domain-scoped section material lifetime
for surface and ordinary-cell cuts. Each native result still rebuilds geometry,
topology, colors, picking, content and effects ownership. Empty cuts release the
presentation. Other derived modes retain their normal replacement behavior.
Native algorithms and all 1,667 engine inputs are unchanged from 0.27.16.

## Measured workload and development checks

The actual UI opens a native-validated saved 120-cell tour (600 vertices, 720
faces, 120 cells), with split model/section view, oblique normal `[.2,.3,.4,1]`,
depth sweep `-.3` to `.3`, orthographic camera and five warmed cuts at absolute
times `.25, .375, .5, .75, .875`. It checks actual composed-frame publication and
changing pixels, exact native Save preservation of documents/tour, and preview
disposal. The final screenshot was visually inspected.

With only the frozen-camera fix, the development baseline made 20 actual WebGL
program creations, links and deletions across those five cuts:
`artifacts/tour-section-profile-06EWhG/result.json`. The final development version
made zero of those calls: `artifacts/tour-section-profile-Qt7VEV/result.json`.
Both bind explicit runtime source hashes. The baseline is an intermediate
development observation, not the older packaged release or qualification.
Hardware: Intel Core i7-14700K, 28 logical CPUs, approximately 63.7 GiB RAM,
Windows 10.0.26200. These are program-lifetime observations, not FPS, isolated GPU
timings or a general latency improvement claim.

- Production build: 166 UI modules.
- 122 focused renderer/animation/capture checks pass:
  `artifacts/tour-section-controls-0.27.17.tap`.
- Coverage includes frozen/resumed/stereo camera drawing, late actor source
  replacement, section domain/empty results, actual native changing 120-cell and
  tesseract cuts compared with fresh viewer buffers/materials/picking, capture
  ownership, transitions, exports and multiview behavior.

## Actual bundled desktop and portable checks

All of the following pass in isolated fresh profiles with development Python
unavailable:

- Saved 120-cell section sweep: `artifacts/tour-section-profile-HD6XkK/result.json`.
  The initial frame and all five warmed poses publish, output pixels change,
  program creation/link/deletion counters remain zero in both private contexts,
  native Save retains source/tour exactly, and closing releases the preview.
- Saved tours: `artifacts/animated-tours-packaged-E0Kex0/result.json`.
  Nine checks include independent live layers, deterministic composition,
  Save/Open, seven exact PNG timestamps, seven decoded VP8/WebM frames with
  matching source times/poses, cancellation and actual project replacement.
- Sections/depth/animation: `artifacts/section-workflow-NIZ7nu/result.json`.
- Core construction/history/Save/Open: `artifacts/core-experience-Vxm1Ay/result.json`.
- Face/cell nets, cuts, history, PDF, held export and retry:
  `artifacts/net-workflow-M8KXdk/result.json`.
- Measurement/identity feedback: `artifacts/intrinsic-feedback-uR0mF8/result.json`.
- All 16 registered regular 4D sources and native identity receipts:
  `artifacts/regular4d-catalog-smoke-FAFdKT/result.json`. The independent reference
  is `artifacts/regular4d-proof-0.27.16.json`; its catalog and validator source
  hashes still match and are checked before launch. No reference guard changed.
- Morph UI/playback/scrubbing/Save/Open: `artifacts/morph-workflow-bDS4mk/result.json`.
- Geometry/derived export: `artifacts/export-workflow-mEjfCZ/result.json`.
- Hidden desktop canary: `artifacts/hidden-desktop-canary-rTRa6x/result.json`.

The older saved-tour harness reloaded an active renderer to install its canvas
probe. Its first attempt stopped on a stale Open warning, although the PNG export
had completed: `artifacts/animated-tours-packaged-kQ0Q03/failure.json`. The probe
now installs on the existing page and waits for startup completion. No runtime
bytes or export assertions changed for this harness correction; the subsequent
fresh-profile nine-check run passes. Exploratory failures remain preserved.

Actual portable wrapper launch: `artifacts/portable-launch-f6pqI5/result.json`.
All 1,716 extracted resources match the tested unpacked app. Current package
verification binds 1,877 frozen runtime inputs and protected importer hashes:
`release/preview-0.27.17/verification.json`. All engine inputs match 0.27.16:
`artifacts/engine-unchanged-0.27.17.json`.

Portable: `release/preview-0.27.17/Polytope Laboratory 0.27.17 preview.exe`.
Bytes: 143,236,741. SHA-256:
`30576f202e743e79fde0f9b2bf4bd61966acc89a0f51b135520dfb2ec766485b`.
Matching source: `release/Polytope Laboratory 0.27.17 source.zip`.
Source-pair receipt: `artifacts/source-pair-0.27.17.json`.

Vite reports its existing large-bundle warning and PyInstaller reports an
optional freetype hook warning. Packaging logs completion; PowerShell represented
redirected native stderr as a NativeCommandError. The completed binary is
separately verified through actual wrapper launch and resource comparison.
No exhaustive regression, general FPS/latency or fresh-user observation claim is
made.

## Next core work

Continue profiling common renderer and model-loading tasks and reviewing visible
feedback and controls. Fresh-user observation remains open. Staged feature
expansion stays deferred.
