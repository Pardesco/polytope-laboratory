# Hyperbolic documents and integration ? Round 11 E

## Wired slice

The Library's **Hyperbolic space** collection (`hyperbolic-library`) opens the four regular `1000` honeycombs and **Dodecahedral small cover ? Closed space with eight cells**. Buttons are `hyperbolic-open-534`, `-435`, `-535`, `-353`, and `-small-cover`. Each opens a separate document through guarded `commitOperation`/native recipe history. The first history state is a one-cell source; Undo returns to it, and Redo restores the creation. Source edits can reuse `hyperbolic-create`; Euclidean constructions on this kind receive a domain explanation.

The main viewport uses `HyperbolicViewer` in a separate host (`hyperbolic-canvas`) beside the retained Euclidean host. This avoids sharing WebGL contexts on one canvas. Hyperbolic viewers, workers and listeners are disposed when changing documents. Euclidean rendering, intrinsic analysis, sections, nets, 4D controls and geometry export are bypassed. Hidden Euclidean controls recover their previous visibility on return.

Minimal controls are `hyperbolic-model` (**Poincar? ball / Klein model**), `hyperbolic-home` (**Return to center**) and `hyperbolic-explore` (**Explore inside**). WASD/arrows/Escape guidance remains visible. Analysis is `hyperbolic-analysis`; measured receipts are under collapsed `hyperbolic-diagnostics`, registered in the help map. PNG captures wait for prepared buffers and save the current viewport. Custom PNG sizing/framing is not exposed for this kind.

The four allowlisted operations route through `engine/hyperbolic_document.py` and `hyperbolic_protocol.handle`, with the pinned manifold handler backed by `validate_source`, `fundamental_domain`, `analyze`, `develop_patch`, and `cross_face`. Patch/analyze/validate and the pure atomic new-document initializer reuse warm workers; other recipe/file isolation is unchanged. Manifold analysis shares the protocol's bounded LRU, keyed by the complete literal domain; saved receipts grant no trust. Packaging includes `engine/hyperbolic_data`. Quotient normals/reflections/metric checks now use the shared metric module; its inverse wrapper uses imported `J`. Face numbering is unchanged.

## Documents and exploration

- Mixed projects serialize as schema v2; polytope-only snapshots retain schema v1 and unchanged serialization content. v1 loading remains supported. Old builds' version guard refuses v2; this build refuses hyperbolic documents disguised as v1. Documents are homogeneous by kind.
- Kind dispatch precedes Euclidean validation, fingerprints, history snapshot validation, replay, rendering and native capability checks. Hyperbolic fingerprints identify the recipe/pinned domain, independently of disposable exploration geometry. Integral float spellings are normalized for Python/JavaScript round trips, including pinned-domain matrices.
- Saved states retain the recipe, pinned manifold domain, a bounded anchor page without `nextCursor`, observer view/address and a recomputed analysis receipt. Reopening validates retained templates, word matrices, pairings and neighbor correspondences before regeneration. Saved coverage receipts are explicitly untrusted.
- Exploration updates the view and dirty revision at gesture end; it adds no per-frame history. Epoch/source/anchor/revision bindings and source ownership fence page publication. Switching documents cancels pending generation. Neighbor updates replace prior rows by `(cell,face)` and retain the full correspondence.
- Initial honeycomb budgets are 32 instances / 48 candidates per page. The small cover uses a nonresumable 16-instance page. Honeycomb continuation fetches at most 128 pages per burst, subject to native and renderer caps. Only the first page is retained in the document; renderer pages/cursors remain disposable. Geometry preparation and cursor replay may refuse resource/numerical limits rather than publishing an invalid replacement.

## Rebase adapter

`rebaseHyperbolic(run, model, request)` calls the existing `hyperbolic-patch` operation with `{source,epoch,anchor,rebase:observerMatrix,budget}`. No extra operation is introduced. Response adds `anchor` to the standard page and remains one ordinary JSON-lines result.

Honeycomb anchors contain `{word,wordChunks?,localFrame,observerMatrix}`. Address chunks contain at most 256 face generators; total addresses are limited to 16,000 generators and 64 KiB. Relative instance words keep the native 256-generator bound. `localFrame` maps the oriented anchor into the current canonical cell chart. The frame's handedness must match address parity. Native radius sampling uses the corresponding canonical observer position. Cursors additionally bind the complete normalized anchor.

Manifold anchors contain `{quotientState,localPose}` (returned pages also label their observer-centered frame). Rebasing walks violated face planes and applies `cross_face` before developing new lifts. It preserves the quotient label and local chart handedness. It does not build an authoritative global floating-point position.

Both adapters produce replacement geometry in the new observer-centered frame and return `observerMatrix = identity`. **B = Cold maps the new oriented anchor frame into the old frame**, so `Cnew = B^-1 Cold = identity`. Validation precedes the viewer's atomic replacement. Honeycomb address exhaustion or 256 crossings in one request produces an explicit navigation limit.

All coordinates remain float64 approximations. Observer/finite-domain absolute gates remain unchanged; developed geometry uses the approved squared-scale relative gate `1e-12`. Local-frame transport adds measured `anchorCoordinates{,Relative,Scale}` and `anchorTransformMetric{,Relative,Scale}` fields.

A 1.1-unit x-axis rebase with the integration honeycomb budget measured:

| Source | Published cells | Max coordinate abs | Coordinate relative | Transform relative |
| --- | ---: | ---: | ---: | ---: |
| {5,3,4} | 22 | 1.748e-12 | 5.030e-15 | 2.927e-15 |
| {4,3,5} | 32 | 5.685e-14 | 1.748e-15 | 4.853e-16 |
| {5,3,5} | 13 | 1.365e-12 | 7.539e-15 | 1.063e-15 |
| {3,5,3} | 27 | 3.525e-12 | 7.011e-15 | 4.467e-15 |

These are measured samples, not interval bounds or exact coordinates.

## F handoff and limits

F owns the full `hyperbolic-controls.mjs` UX: radius/layers NumericEntry controls (`hyperbolic-radius`, `hyperbolic-layers`), pause/resume (`hyperbolic-pause`), novice explanations, picking presentation, diagnostic formatting, independent verification fixtures, and desktop/performance qualification. There is no uniform/ringed builder in this round.

The live controller is `appContext.hyperbolicDocument`. Entry points are `open(entry)`, `regenerate(state)`, `renderAnalysis()`, `screenshot()`, and `viewer`. `controller.controller.abort()` pauses native generation; regenerating restarts from the retained anchor. `controller.nextCursor`, `neighbors`, `latestCoverage`, and `quality` are disposable. Viewer methods remain `setProjection`, `setLOD`, `enterExplore`, `home`, and explicit `capturePointer`. Preserve the existing `onViewChange`/`onRebase`/`onRebased` adapters when adding controls. Add custom generation parameters to `regenerate`/`continuePages` together so cursor budget bindings remain identical.

The small cover still uses the phase-1 bounded nonresumable developer; its `visible` flags are receipts, while the viewer currently draws all returned instances. A custom radius UI must account for that. Large-radius/GPU precision, extreme zoom, dense real-honeycomb navigation and long-session GPU resource behavior still need qualification. The inherited viewer retains its conservative display validation; no display threshold was relaxed here. Screenshots pause further generation and capture the coherent current patch.

## Verification

The mounted test runs the complete app renderer in headless Chromium/SwiftShader with ordinary startup (`startupInfo.hidden=false`), real Python JSON-lines computation, and stubbed desktop file dialogs. Its optional desktop-pool profiling mode uses `hidden=true`. It opens all five entries, switches projection, moves through two native rebases into a nonzero quotient state, captures a PNG, saves/reopens a mixed project, exercises Undo/Redo, rejects a held opening after tab navigation, and checks Euclidean-tab isolation.

Initial integration measurements, before the follow-up below. Hardware: Windows x64, Intel Core i7-14700K; browser viewport 1280?800. One Python process services the test, unlike the desktop's three-worker pool. Click-to-first prepared patch measurements vary with startup/native queue and machine contention. A complete run measured **506 / 379 / 719 / 960 / 1680 ms**, respectively `{5,3,4}`, `{4,3,5}`, `{5,3,5}`, `{3,5,3}`, small cover. Other cold first-preset runs measured **5878 and 8527 ms**, exceeding the 3-second target. These headless-renderer measurements do not qualify packaged Electron latency or 1080p real-honeycomb frame rate.

`npm run test:hidden` was not launched: the worker brief explicitly forbids Electron launches in this sandbox. Hidden-runtime/qualification unit tests pass as part of the affected Node suite; the lead must run the actual hidden desktop smoke.

Verification: the full hyperbolic plus affected Python run passed **386 tests**; the final document/manifold/history/project/library-focused run passed **273 tests** after adding the address-chunking case. The final document suite, including native mixed-project file save/load/regeneration, passed **21 tests**. The five hyperbolic Node files passed **37 tests**; affected allowlist/pool/history/project/library/help/content/hidden-runtime suites passed **214 tests**. A final mounted/history/project/help/allowlist rerun passed **112 tests**. Vite build, focused Ruff checks and Prettier checks pass. All five hyperbolic Node files are registered in `test:features`. The existing unknown-schema test now uses schema 3 because schema 2 is approved; no tests were deleted.

## Follow-up after lead fix 95506d0

The caught status error came from animation pause/update invoking `TimelinePanel.sync()`: the Fold net preset read `model.faces.length`. Timeline synchronization and motion capability checks now branch on the hyperbolic kind before Euclidean incidence access. The new mounted assertion checks the status after each preset opens and after its view/layout interactions.

The control row was a flex sibling of `#views` inside `.appearance-stage`, causing the horizontal split. It now lives in `.view-toolbar`; AppChrome explicitly retains `hyperbolic-controls` instead of moving it into hidden View options. At 1600x1000 and 1280x800, the mounted test checks canvas width >=90% of the entire `.workspace`, visible controls, and controls ending above the canvas. Reviewed screenshots are in `artifacts/hyperbolic-integration/after-{534,small-cover}-{1600,1280}.png`.

`CanvasOverlays.showNext/sync/freshOpen` suppress Euclidean hints by current document kind, including queued/timer-driven hints. `Direct4D.sync` cancels motion and hides the gizmo/hint without reading missing angles. Old source-picking/hover overlays are also concealed. Returning to Euclidean documents restores normal behavior and hint preferences.

### First-paint changes

- Opening now performs **one** `recipe-run` request with `{document:null,operation:"hyperbolic-create",parameters:...}`. The engine creates the one-cell source and records the normal construction/history in that request. Existing validation, Undo/Redo, replay, source-navigation/export fences and saved schema remain in use.
- The pool permits warm reuse for exactly this pure initializer. Source edits and unrelated recipes/file operations keep their existing isolation. No native cache affinity or essential handles are introduced.
- `onFirstGeometry` fires after a WebGL render with the first prepared page. Retained-geometry revalidation/regeneration waits for that first render. There is no whole-patch prerequisite.
- Regeneration keeps the same source/anchor/epoch, validates incoming pages, checks existing cell words/types, drops already-retained IDs, and appends new instances. It does not clear the first buffer or restart its epoch. Every appended page is prepared/rendered before fetching the next, preventing worker-preparation starvation. The mounted test verifies that patch requests start after first geometry and that the cubic honeycomb grows beyond its initial page.

### Timing evidence

The lead's **pre-fix real hidden Electron** click-to-visible measurements were 1900 / 1100 / 2300 / 7500 / 1400 ms for the four presets and small cover. Electron was not launched by this worker, per the sandbox restriction.

The table below is the **post-fix headless app renderer** using the actual desktop `EnginePool` (maximum three Python workers, the same single-thread BLAS environment), real JSON-lines transport and Chromium/SwiftShader on Windows x64 / i7-14700K. It includes both cold and reused workers. File dialogs are stubbed; these numbers do not certify packaged Electron behavior. The first geometry column measures the opening click handler through WebGL render submission; the driver column also includes Playwright click/poll overhead. Each first page contains <=256 instances.

| Preset | Handler to geometry ms | Driver click to geometry ms | First cells | Renderer native-call wall ms | Python dispatch incl. history ms | Worker CPU / preparation wall ms | Render CPU ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| {5,3,4} | 461.9 | 527 | 32 | 385.0 | 306.2 | 13.9 / 46.9 | 0.3 |
| {4,3,5} | 723.4 | 799 | 32 | 664.5 | 236.1 | 8.8 / 30.9 | 0.2 |
| {5,3,5} | 843.5 | 918 | 28 | 765.8 | 297.4 | 29.8 / 53.5 | 1.0 |
| {3,5,3} | 427.6 | 578 | 29 | 345.7 | 217.6 | 27.1 / 55.9 | 0.5 |
| Small cover | 821.4 | 1013 | 16 | 737.0 | 462.7 | 14.8 / 53.3 | 0.2 |

| Preset | Cold startup ms | Request parse ms | Response bytes | Python JSON encode ms | Pool receive/JSON/bookkeeping ms | Renderer history publication ms | Viewport mount ms | Pre-paint autosaves / snapshot ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| {5,3,4} | 0 (reused) | 0.067 | 135240 | 1.44 | 0.93 | 0.4 | 20.4 | 0 / 0 |
| {4,3,5} | 370.8 | 0.037 | 86394 | 0.89 | 0.45 | 1.5 | 14.3 | 0 / 0 |
| {5,3,5} | 377.8 | 0.041 | 123018 | 1.20 | 0.60 | 0.7 | 14.9 | 0 / 0 |
| {3,5,3} | 0 (reused) | 0.047 | 169098 | 1.61 | 0.84 | 0.8 | 14.8 | 0 / 0 |
| Small cover | 0 (reused) | 0.047 | 420573 | 5.64 | 6.50 | 0.9 | 12.7 | 0 / 0 |

Response sizes are UTF-8 JSON bytes without the trailing newline. Stages overlap: native-call wall includes startup, Python dispatch, transport and Node/renderer scheduling; preparation wall includes worker scheduling/transfer and frame boundaries. Do not add every column. Renderer-side measurement JSON passes added 0.8 / 0.7 / 1.0 / 1.6 / 2.0 ms respectively. No autosave ran before first paint in these samples; snapshot/autosave hooks record their costs if they overlap a later opening.

Independent cProfile inspection of the old/generic native recipe path found repeated history snapshot validation and bounded JSON traversal dominating native work; these checks are retained. The integration delays were two sequential native calls/process churn and generation repeatedly canceling initial worker preparation. JSON encode/parse and draw submission were small in the measured run. A cold-pool run before targeted warm reuse still had a 1613 ms first `{5,3,4}` outlier. The recorded current policy meets the **1500 ms headless target** for all five in this run; the lead still needs to verify the target in real hidden Electron and under machine contention.

Reproduce the pool profile (no Electron):

```powershell
$env:POLYTOPE_HYPERBOLIC_POOL_PROFILE = '1'
node --test tests/hyperbolic-mounted.test.mjs
```

This writes `artifacts/hyperbolic-integration/profile.json`. `#hyperbolic-canvas` exposes `data-opening-timing` after first render; `appContext.hyperbolicDocument.openingTimings` holds the per-preset samples. `POLYTOPE_HYPERBOLIC_PROFILE=1` enables native timing/byte receipts on **stderr only**, with ordinary one-response-per-line stdout unchanged. Timings are runtime observations, not saved project/history data. Normal startup is still exercised by the unflagged mounted test so hint suppression is not hidden by test mode.

Follow-up verification: **293 Node tests passed**, including the full hyperbolic math/viewer/mounted suites, timeline/native mounting, overlay/direct-4D/chrome/layout, history/project/native jobs/pool, startup and numeric viewport regressions. **251 pytest cases passed**, including 27 document cases plus protocol/manifold, recipes/history/migrations, display and project validation. Vite build, focused Ruff/Prettier checks and `git diff --check` pass. The separate ordinary-startup mounted run uses one persistent Python server rather than the desktop pool; its small-cover sample was 1710 ms, so these measurements are not a guarantee for every backend configuration or machine load.

Follow-up changed files: `engine/hyperbolic_document.py`, `engine/recipes.py`, `engine/server.py`, `desktop/engine-pool.cjs`, `ui/hyperbolic-document.mjs`, `ui/hyperbolic-document.css`, `ui/hyperbolic-viewer.mjs`, `ui/timeline-panel.mjs`, `ui/direct-4d.mjs`, `ui/canvas-overlays.mjs`, `ui/app-chrome.mjs`, `ui/app.js`, `ui/app/history-wiring.mjs`, `ui/app/startup.mjs`, `tests/test_hyperbolic_document.py`, `tests/hyperbolic-history.test.mjs`, `tests/hyperbolic-protocol.test.mjs`, `tests/hyperbolic-mounted.test.mjs`, `tests/timeline-panel.test.mjs`, `tests/direct-4d.test.mjs`, `tests/canvas-overlays.test.mjs`, `tests/engine-pool.test.cjs`, `tests/startup-performance.test.mjs`, the new profiling helper, and this document.

Follow-up adds `tests/helpers/hyperbolic-native-profile.mjs`; it updates the existing hyperbolic, timeline, direct-4D, canvas-overlay, engine-pool and startup tests. No package F controls, diagnostic formatting, new copy workflow or numerical thresholds were introduced.

## Files

Added: `engine/hyperbolic_document.py`, `ui/hyperbolic-document.mjs`, `ui/hyperbolic-document.css`, `tests/test_hyperbolic_document.py`, `tests/hyperbolic-protocol.test.mjs`, `tests/hyperbolic-history.test.mjs`, `tests/hyperbolic-mounted.test.mjs`, this document.

Modified: `engine/server.py`, `engine/formats.py`, `engine/display_state.py`, `engine/history.py`, `engine/history_migrations.py`, `engine/recipes.py`, `engine/hyperbolic_manifold.py`, `desktop/engine-allowlist.cjs`, `desktop/engine-pool.cjs`, `ui/app.js`, `ui/app/history-wiring.mjs`, `ui/app/workspace-render.mjs`, `ui/app/startup.mjs`, `ui/app/export.mjs`, `ui/element-content-controls.mjs`, `ui/guide-refresh.mjs`, `package.json`, `tests/test_history_migrations.py`.
