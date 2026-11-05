# October 25 continuation: pose controls and display initialization

Follows [the first core-impact pass](CORE_IMPACT_2026-10-25.md). Development stays
at 0.27.21; 0.27.20 remains the published/qualified baseline. The active goal is
high-impact core performance/reliability work, with noncritical broad testing
deferred until final release preparation.

## Implemented

**Stop construction-panel scans on angle-only display.** The actual app's
`displayBase({poseOnly:true})` path skips its 27 construction/control `.sync()`
calls. Ordinary display, source/settings edits, navigation, busy-state changes
and export transitions retain full synchronization. Angle updates still run the
Viewer, annotation ownership checks, diagnostics and any derived material update.
This does not introduce a new content/geometry cache or grant publication from a
source fingerprint. Tests execute the actual app display function with the real
ElementContentControls and Viewer; edited literal annotations still force a
validated refresh. UI reduction is a call-count result, not measured desktop FPS.

**Avoid the intermediate default display.** `Viewer.setModel` and
`setSectionModel` support internal `deferDisplay`, defaulting to false for
existing callers. Workspace loads, derived views and morph frames use it when
they immediately supply the actual saved/current view. Geometry normalization,
material ownership and fresh buffers are still initialized. The zero-angle
orthographic projection is omitted, and the requested display performs the
surface/projection/buffer work. Existing callers retain eager behavior. Source
identity/material lifetimes, changing topology, source selection, raw colors,
normals and stereographic publication/capture remain checked.

**Make manual rotation edits consistent and cheaper.** All six app angle sliders
delegate to `ViewportControls.setAngle`. It refuses edits during export, checks
available source dimension and finite angle bounds, restores displayed values on
refusal, cancels pending projection fitting and stops competing rotation/track
playback. It records a changed pose through the lightweight dirty/revision path
and invalidates a stale tour preview, without refreshing all construction panels
on each slider event. Slider controls are disabled during export and for absent
dimensions; the method also rejects queued/programmatic events before mutation.

## Measured initialization scope

`scripts/profile-view-initialization.mjs` compares eager initialization followed
by the saved view against deferred initialization followed by the same view.
Both use the current source; this is not a sealed-release comparison. The saved
Grand hexacosichoron source has 120 vertices, 720 edges, 1,200 faces and 600 cells.
Seven alternating-order samples per mode follow one warm-up pair.

- Eager median **7.758 ms**, IQR **0.500 ms**, two display passes.
- Deferred median **7.149 ms**, IQR **1.069 ms**, one display pass.

Every sample has the same SHA-256 over complete edge/point/surface buffer
attributes and the normalization, projected points, source triangles and
visibility records. Samples, selected source hashes, exact input-file hash,
platform/Node/CPU details and buffer hashes are in
`artifacts/view-initialization-cWk9jq/result.json`.

These are CPU-only Viewer computations on an Intel Core i7-14700K, Windows
10.0.26200, Node v24.22.1. No WebGL, Electron IPC, Python worker, annotation
decoding, image/video capture or visible navigation time is measured. The
observed saving is modest; do not claim a general loading/morph FPS speedup.
The first profiler attempt omitted camera setup; its failed receipt is preserved
at `artifacts/view-initialization-oK2mOk/result.json`. The corrected harness uses
actual Three cameras with no GPU renderer. Two initial app-path tests also needed
to await the actual display promise rather than a not-yet-created native job;
the source behavior was not weakened to satisfy those fixture failures.

## Focused verification

`artifacts/pose-workflow-20261025-113419/result.json` records **115 passing tests**
across eight relevant suites, zero failures/skips, plus the successful
**169-module frontend build**. `focused.tap` and `build.log` retain raw output;
the selected runtime/script/test input hashes match before and after execution.
This is focused source validation, not full regression or packaged qualification.
The earlier 127-test receipt describes the previous core-impact source snapshot;
it remains preserved and does not bind the new app/Viewer edits.

No Electron launch, ACL workaround, package, source freeze/seal or online
publication ran. Earlier releases, archives and evidence remain intact. Update
the consolidated review diff and full source receipts against the final runtime
before normal-session package/portable qualification.

## Next high-impact investigation

Audit the remaining low-level view toggles and source-cell visibility buttons.
Several app handlers still mutate the view directly, bypassing the viewport
controller's export gate. Exact export guards can reject a changed pose, but
preventing those edits should avoid interruption of a long-running export.
Preserve current source checks and restore attempted input values on refusal.
Real visible navigation, morph and dense-source timings remain pending; broader
release qualification and fresh-user task observation are still deferred.
