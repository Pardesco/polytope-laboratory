# 0.27.12: reliable model opening and canceled exports

Local development preview, October 22, 2026. Feature expansion remains paused.
Public production remains 0.26.0. Nothing was published online.

Library opens show pending progress, coalesce repeated clicks, preserve explicit
tab/history navigation and discard canceled or replaced-project replies. Distinct
selections still open separate documents. Linked OFF loading supports cancellation
before engine submission and retains authorized-root/real-path checks. Unsupported
entries stay disabled. Native menu, History close and packed-page range labels
are readable. See the catalog details in the preserved 0.27.11 notes.

Closing General Export now immediately invalidates its review. Escape, Close and
programmatic closure reject a late destination choice before writing geometry or
net SVG/PDF. Reopening creates a fresh review; old replies and queued close events
cannot close that review, erase its feedback or change its destination. Source,
units, layout and bounded atomic-writer checks remain enforced. The offline guide
describes these behaviors. All native engine files are unchanged.

## Reproduced failures and candidate history

The real packaged 0.27.9 catalog baseline reproduced publication after Cancel,
replacement-project contamination and stolen focus:
`artifacts/catalog-workflow-XZ3BGa/result.json`. It is a behavior baseline, not a
qualification receipt.

0.27.10 is unqualified because pending-state synchronization enabled unsupported
rows. The preserved binary replay and corrected three-entry test scope are in
`artifacts/candidate-review-0.27.10-followup.json`.

0.27.11 is unqualified because an asynchronous dialog close let a held save reply
overwrite the old OBJ: `artifacts/export-workflow-87NjIW/failure.json` and
`artifacts/candidate-review-0.27.11.json`. Both intermediate binaries and their
UNQUALIFIED markers are preserved unchanged. 0.27.9 was the last qualified
portable/source pair before this correction completed packaging and verification.

## Development verification

- Production UI build: 161 modules.
- 242 focused checks pass: `artifacts/loading-export-0.27.12-qualified.tap`.
- Visible geometry export workflow: `artifacts/export-workflow-5TgEMF/result.json`.
  It blocks close-event delivery, holds native save replies and tracks actual
  native ticket termination. Escape, Close and direct closure explicitly abort
  tickets, make zero native writes and preserve old files after fresh retries.
  Actual OBJ/DXF/STL/VRML/JSON output, units/topology and derived 3D sections pass.
- Visible net workflow: `artifacts/net-workflow-rOQvqj/result.json`. The held
  General Export PDF choice makes zero native writes after parent closure; the
  old file survives and a fresh PDF succeeds. Net history, packing, fold/glue,
  save/open and exact-frame animation export checks also pass.

## Packaged verification

The packaged app uses its bundled native engine with development Python
unavailable. These actual 0.27.12 workflows pass:

- Catalog loading, navigation, linked preflight and held replies:
  `artifacts/catalog-workflow-wrG5QR/result.json`.
- Legacy linked-library compatibility (11 checks):
  `artifacts/linked-compat-e7b2485ff0244c1d8dd8ad8e304809d6/linked-packaged-smoke.json`.
- Hidden window/focus canary: `artifacts/hidden-desktop-canary-53Glcd/result.json`.
- Visible construction/history/Save/Open and one-second morph playback:
  `artifacts/core-experience-v79rln/result.json`.
- Hidden functional construction/history/Save/Open and four-second playback:
  `artifacts/core-experience-XyGCnm/result.json`.
- Geometry formats and delayed-close/held-save ownership:
  `artifacts/export-workflow-gqIgo6/result.json`.
- Nets/history/packing/SVG/PDF and exact-frame animation ownership:
  `artifacts/net-workflow-LadI6Y/result.json`.
- Sections, promotion and animation ownership:
  `artifacts/section-workflow-Ljw8uc/result.json`.
- Morph controls, replay, capture and Save/Open:
  `artifacts/morph-workflow-euWXD0/result.json`.

Pending-load screenshots at 1200 by 760 and 1500 by 950 have no horizontal
document overflow; the smaller packaged view was visually inspected. The
catalog importer-override test uses a synthetic audit marker over a real
authorized OFF file; it tests routing/cancellation, not the audit classifier.

All 1,667 frozen engine files match 0.27.9:
`artifacts/engine-unchanged-0.27.12.json`. Historical binaries and unqualified
markers remain intact: `artifacts/historical-binaries-preserved-0.27.12.json`.
The verifier refuses baseline-only receipts:
`artifacts/verifier-baseline-refusal-0.27.12.json` (gate test, not app qualification).

The actual self-extracting portable passes with development Python unavailable:
`artifacts/portable-launch-F8QKg5/result.json`. Cube, dual and intermediate morph
operations use the bundled engine. All 1,716 extracted resource files match the
tested unpacked app. Current package verification matches 1,871 frozen runtime/
build inputs: `release/preview-0.27.12/verification.json`. Corresponding source is
archived and checked against those inputs and every current archive file.

No complete regression, full application completion or general FPS/latency claim is made.
Hidden functional playback uses four seconds because Windows may throttle
occluded windows; visible playback retains one second and both retain the
moving-pose assertion.

## Local package

Portable: `release/preview-0.27.12/Polytope Laboratory 0.27.12 preview.exe`,
143,236,792 bytes, SHA256
`652f119148aea3e0c4ed4a94aa9c6aad39c94823524f780917795695f2566593`.
Corresponding source: `release/Polytope Laboratory 0.27.12 source.zip`.
Source-pair receipt: `artifacts/source-pair-0.27.12.json`.
All previous qualified pairs and unqualified intermediate binaries are preserved.

## Next work

Audit direct asynchronous addDocument routes such as Certify current, global
Cancel with an already-completed construction reply held in transit, and Open
before the initial model is ready. Reproduce before changing ownership rules.
Saved-tour section material reuse and fresh-user observation remain outstanding.
