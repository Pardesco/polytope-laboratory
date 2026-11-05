# October 25 continuation: one saved-selection display

Follows [memory/tour publication](MEMORY_TOUR_PUBLICATION_2026-10-25.md).
Development remains 0.27.21; published/qualified 0.27.20 is preserved. The active
goal prioritizes important existing workflows and defers noncritical broad release
qualification.

## Implemented

`renderWorkspace` now restores the saved entity selection after creating the
Viewer buffers but before its first full display. `selectEntity` has an optional
display flag used only by that restoration path. The full display prepares
geometry, highlights, picking ownership and element content together in the
requested saved pose. Previously navigation displayed the model, restored the
selection and displayed the complete model again.

This removes one full base-display invocation for a valid saved selection.
Construction controls see the restored selection during the full display.
Missing/invalid saved selections remain empty and no navigation dirty event is
introduced. Interactive selection and callbacks from other tools keep the default
full display, export guard, content verification and saved-selection mutation.
No pose-only shortcut, geometry cache or weakened source certificate is added.

## Measured scope

Preserved source: `artifacts/selection-display-baseline-42usta93/app.js`, SHA-256
`8737af6b6b09815c5b9fe522e395cf4959bb8aa5e33f51082007f979247245c0`.

`scripts/profile-navigation-display.mjs` runs the actual before/after app navigation
and display functions with real Viewer and ElementContentControls. Layout, unrelated
panels and native reports use controlled CPU harness implementations. The source
is Grand hexacosichoron: 120 vertices, 720 edges, 1,200 faces and 600 cells.
A valid face-text document/descriptor is prepared by native annotation functions
outside timing. The annotated timing includes renderer source ownership and text
geometry, excluding native description/startup, actual font/image decoding and GPU
work. Both selected and unselected controls are measured with/without annotations.
Nine alternating samples per mode follow two warm-up pairs.

Final comparison: `artifacts/navigation-display-profile-OcTGR2/result.json`.

| CPU navigation case | Before median (IQR), ms | After median (IQR), ms |
| --- | ---: | ---: |
| No annotations, no selection | 7.317 (1.555) | 6.941 (0.198) |
| No annotations, saved face selection | 7.005 (1.086) | 6.213 (1.401) |
| Face text, no selection | 349.173 (20.635) | 351.071 (17.443) |
| Face text, saved face selection | 362.793 (8.467) | 338.682 (6.256) |

The annotated saved-selection case saves about 24 ms (7%) in this source-level
workload. Unannotated differences are noisy; no general loading/FPS improvement is
proven. Selected navigation goes from two full display calls to one, with matching
hashes over geometry attributes, projected points, source/render triangles,
visibility, normalization and highlight data. The text mesh remains present and
all content publications complete. Samples, input/baseline/source hashes and the
native-prepared annotation inputs are retained. Initial unannotated-only comparison
`artifacts/navigation-display-profile-8uxKFv` also showed no clear timing benefit;
it is preserved and is superseded by the explicitly broader comparison above.

These are Node 24.22.1 CPU measurements on an Intel Core i7-14700K/Windows
10.0.26200, not Electron/visible/packaged navigation timings.

## Focused checks

`artifacts/navigation-display-checks-20261025-132422/result.json` passes:

- **171 Node tests**, ten relevant suites, zero failures/skips.
- The **169-module production build**, with the existing large-chunk warning.
- Selected before/after source/test input hashes are unchanged.

The 23 new navigation cases exercise actual app functions with real Viewer/content
controllers. They compare complete geometry/highlight buffers and annotation mesh
positions for 3D/4D vertex/edge/face/cell selection, orthographic/4D perspective,
missing/invalid selections, interactive content edits/export guards, late annotation
completion during navigation, actual source picking at a projected screen point,
and asynchronous packed stereographic publication. The harness uses the same
JavaScript realm as the imported plain-data validators; an initial VM fixture was
correctly refused for its foreign object prototypes and was corrected without
changing production validation. Native descriptor providers in these tests are
controlled fixtures; the profile separately prepares a native-valid document.

`tests/navigation-display.test.mjs` is included in `npm run test:features` for final
regression preparation. The entire feature suite was not run in this pass. Related
checks cover pose/content ownership, picking, Viewer geometry/worker display,
cell visibility, project workflows, memory/tour publication and renderer contracts.
No real Electron launch was performed. Native source is unchanged in this pass.

## Continue

The annotated profile still spends roughly 350 ms in renderer preparation, far
more than its unannotated geometry work. Profile source capture/verification and
annotation preparation next. Preserve complete literal input checks, resource
bounds, mutation detection and asynchronous ownership; do not replace them with
IDs/fingerprints or an unproven cache. The broader goal remains active. Refresh
final review/source inputs and rebuild the native engine for earlier changes
before broad packaged/visible/fresh-user qualification.
