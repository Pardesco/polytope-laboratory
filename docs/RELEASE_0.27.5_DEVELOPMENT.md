# 0.27.5: net reset history and animation export ownership

Local development preview, October 22, 2026. Public production remains 0.26.0;
feature expansion remains paused. This builds on the qualified 0.27.3 net work.

## Changes

Generate/reset now creates a fresh joined face or whole-cell net, even when a
saved edit history already exists. Start with separate faces/cells now creates
one piece per face/cell. Previously the saved reconstruction path silently
restored the old arrangement instead. The actual tesseract reproduction kept
two pieces after requesting eight separate cells.

Both explicit actions append an ordinary net history step. Undo restores the
previous connections and placements; Redo reapplies the new arrangement.
Automatic reconstruction when opening a native project still restores its
saved forest and preserves the redo bank. New requests own their native result;
an older asynchronous result cannot append history or consume the newer request.
The pending request is editor-local; the project format has not changed.

Animation and tour export notifications now reach both net editors. Export
temporarily disables net generation, placement, selection, folding, page and
print controls. Legacy folding and a pending layout drag stop when animation
owns the view. Direct/queued view and selection events refuse changes before
mutating saved state. SVG pointer starts are ignored during capture. Selector
values are restored from the saved view after cancellation or completion.
Tab-edge refresh cannot re-enable its Apply buttons during export. The existing
Select tab edge mouse action remains available.

The built-in guide explains reset/separation history and export ownership.
Protected importer files and native geometry operations are unchanged.

## Verification

- Production UI build passes: 158 modules.
- 131 focused Node tests pass: net history generation, stale requests, saved
  reconstruction, exports, expression entry, tabs, printing, worker reuse,
  animation/tour export and native save protections.
  Report: `artifacts/net-focused-0.27.5.tap`.
- The expanded real-app net workflow checks face/cell separation and reset,
  Undo/Redo, native Open of a separated layout, tab-edge action, ordinary edits,
  SVG/PDF, held-dialog source changes and print settings. Development proof:
  `artifacts/net-workflow-GpoFiX/result.json`; packaged proof with development
  Python unavailable: `artifacts/net-workflow-rA9xbB/result.json`.
- Held animation destination dialogs check disabled controls and queued
  component/view/pointer events. Cancellation returns control to the net editor;
  a subsequent PNG export checks exact timestamps and restored net history/view.
- Packaged geometry-export regression passes for actual OBJ/DXF/STL/VRML/JSON,
  held dialogs and a derived 3D section:
  `artifacts/export-workflow-r97t7D/result.json`.
- Actual portable launch passes with development Python unavailable, checking
  native cube/dual/morph results and all 1,716 extracted runtime resources
  against the tested package: `artifacts/portable-launch-LAzA6e/result.json`.

An intermediate 0.27.4 package remains preserved but unqualified: review caught
that the new action whitelist omitted the existing tab-edge selection mode.
The correction is in 0.27.5. Do not distribute the 0.27.4 candidate as verified.
Its hash and reason are retained in `artifacts/candidate-review-0.27.4.json`.
The earlier 0.27.3 executable and matching source remain the previous qualified
pair. No release from this continuation was published online.

## Remaining core work

Review section task organization, visible status/data and numeric edit focus.
In particular, inspect direct derived-mode, section-depth slider and entity-ID
handlers: unlike net controls, they still need an animation ownership audit.
Validate literal entity IDs before assigning view state. Reproduce these paths
in the app before choosing the correction; code inspection is not GUI evidence.
Profile larger-model reconstruction and serialization using repeatable workloads.
Audit the old static help text against current animation behavior; the dynamic
guide is the maintained user reference. Fresh-user observation remains needed.

## Local package

Portable: `release/preview-0.27.5/Polytope Laboratory 0.27.5 preview.exe`,
143,233,789 bytes, SHA256
`818fa219b5cf13b7ffd0cfb51da355dc5f1559f98517382e332781f696fdb3f3`.
Corresponding source: `release/Polytope Laboratory 0.27.5 source.zip`.
The package verification record is `release/preview-0.27.5/verification.json`;
source archive/hash verification is `artifacts/source-pair-0.27.5.json`.
Runtime/build inputs were frozen before packaging (1,867 files).
