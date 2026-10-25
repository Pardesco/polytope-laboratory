# 0.27.13: canceled constructions and startup Open

Local development preview, October 22, 2026. Feature expansion remains paused.
Public production remains 0.26.0; nothing was published online. Earlier qualified
portable/source pairs and unqualified intermediate binaries remain preserved.

Cancel now releases pending computation feedback immediately and discards late
native replies, including geometry that finished computing before cancellation.
Native cancellation is still requested, but a successful cancellation request
is no longer needed to prevent a canceled reply from changing the workspace.
Fresh jobs keep their own progress and status. Late failures are consumed and
cannot report success, remove fresh busy state or publish canceled geometry.
Library opens share this reply owner while retaining their existing project,
duplicate-request and navigation rules. Ordinary native failures retain their
diagnostics; intentional cancellation does not show an error toast.

Certify current captures the complete source before submitting its supplied
decimal coordinates. Before publication, the project, selected document/history,
source attributes, notes and units must still match that capture. Observer motion stays independent.
The 100-document cap is checked before computation and before publication. The
mathematical algorithm and its rational-coordinate interpretation are unchanged.

Open and Recover requested before startup catalog discovery finishes take
priority over the automatic Tesseract. A late default model cannot dirty the
workspace and cause the selected project to be refused. If no model is opened,
the workspace says Choose a model; New or a Library selection can start it.
The offline guide describes cancellation, certification ownership and startup.

## Reproduced baseline

The real packaged 0.27.12 app, with actual completed native replies held in an
isolated IPC harness, published a canceled dual and canceled certificate. A
certificate also entered a replacement project. Holding startup catalog discovery
while Open waited caused the default model to publish and the chosen project to
be refused. Busy feedback persisted until the canceled held reply arrived.

Receipt: `artifacts/publication-workflow-0vY4AB/result.json`. This is a behavior
baseline, not a release qualification. The earlier harness attempt waited for
intentionally held work during project replacement and timed out; the completed
baseline instead waits for native Open publication before releasing that work.

## Verification

- Production UI build: 162 modules.
- 251 focused checks: `artifacts/publication-controls-0.27.13.tap`.
  Native reply cancellation covers late resolution/rejection, signal isolation,
  cancellation before submission, transport refusal, cleanup and independent
  status. Certification covers source/project/selection/notes/units/export
  ownership, observer motion and capacity. Existing history, numeric, catalog,
  export, section and engine policies also pass.
- Visible development publication workflow:
  `artifacts/publication-workflow-rnSSlx/result.json`. Canceled replies are refused
  with immediate busy cleanup; successful fresh dual and exact-certification
  retries preserve source data and all earlier documents. Native history adds
  its source-node link; the test verifies that linked snapshot explicitly.
- Visible development catalog/linked/importer/export workflow:
  `artifacts/catalog-workflow-vhzQjg/result.json`.

The actual packaged app passes with development Python unavailable:

- Canceled replies, source history, exact certification retry, replacement
  project refusal and startup Open/Recover:
  `artifacts/publication-workflow-cO6Gr8/result.json`.
- Catalog/linked loading and cancellation:
  `artifacts/catalog-workflow-e6aXq1/result.json`.
- Legacy linked-library compatibility (11 checks):
  `artifacts/linked-compat-79cc2fe2178b4677bab9d8a53e21a231/linked-packaged-smoke.json`.
- Hidden window/focus/native-dialog canary:
  `artifacts/hidden-desktop-canary-S5Jhdu/result.json`.
- Core construction/history/Save/Open and visible one-second morph playback:
  `artifacts/core-experience-53FzXs/result.json`.
- Geometry formats and held-destination/delayed-close cancellation:
  `artifacts/export-workflow-DtFgw5/result.json`.
- Nets/history/packing/SVG/PDF and exact-frame animation:
  `artifacts/net-workflow-7dJTum/result.json`.
- Sections, promotion and animation ownership:
  `artifacts/section-workflow-RqCGHp/result.json`.
- Morph controls, replay, capture and saved poses:
  `artifacts/morph-workflow-a9eGpl/result.json`.

All 1,667 native engine files match 0.27.12:
`artifacts/engine-unchanged-0.27.13.json`. The actual self-extracting portable
passes with development Python unavailable:
`artifacts/portable-launch-1xYzsy/result.json`. All 1,716 extracted resource files
match the tested app; bundled cube/dual/intermediate morph operations pass.
Package/current verification matches 1,872 frozen runtime/build inputs:
`release/preview-0.27.13/verification.json`. Corresponding source is archived and
verified against those inputs and all current archive files. No exhaustive
regression or general performance improvement is claimed.

## Local package

Portable: `release/preview-0.27.13/Polytope Laboratory 0.27.13 preview.exe`,
143,237,301 bytes, SHA256
`952ddd524905fdd078929186b4ac6ba070f5048cb17c1e0975864bd4497dec1f`.
Matching source: `release/Polytope Laboratory 0.27.13 source.zip`.
Source-pair receipt: `artifacts/source-pair-0.27.13.json`.
Previous qualified pairs and unqualified intermediate binaries remain intact.

## Next core work

Audit startup Cancel/catalog discovery and late read-only reports, especially
Validate incidence after changing the active source. Reproduce before editing.
Saved-tour actor sections still recreate materials. Fresh-user observation and
broader core UX/performance review remain open; feature expansion stays paused.
