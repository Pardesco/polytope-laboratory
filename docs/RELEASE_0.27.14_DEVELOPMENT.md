# 0.27.14: current geometry reports and recoverable Library loading

Local development preview, October 22, 2026. Feature expansion remains paused.
Public production remains 0.26.0; nothing was published online. Earlier local
portable/source pairs remain preserved.

Analysis and incidence validation show a loading message while checking the
selected source. Old fields are cleared immediately when another model opens.
Reports capture the project, selected document/state and complete literal model;
late results cannot overwrite a different source or a newer check. Model IDs and
fingerprints alone are insufficient. Intrinsic reports remain valid through
view rotation, notes and coordinate-unit display edits. In-place source changes
discard the report and offer a useful check-again message.

Automatic analysis and manual validation share ownership of the validation
output. A newer manual check retains that output while automatic analysis can
still finish its separate information fields. The existing disclosure preference
is retained; repeated checks produce one report block.

Canceled or failed startup catalog discovery offers Load Library or Retry Library
in the left panel. Retrying restores catalog choices without opening an automatic
model or replacing the current project. Duplicate discovery requests coalesce;
canceled late metadata or failures cannot clear a retry or publish old choices.
The Library does not suggest changing filters before its catalog has loaded.
The offline guide explains the report and retry behavior.

## Reproduced baseline

Real packaged 0.27.13, with completed native responses held in an isolated IPC
harness, left Cube analysis/validation visible while Tesseract was loading.
After the Tesseract report completed, a late Cube validation replaced it (Euler
2 instead of 0). Cancel during startup discovery left zero catalog rows and no
retry action. Receipt: `artifacts/report-startup-r0o8Xv/result.json`. This is a
behavior baseline, not a release qualification.

## Development verification

- Production UI build: 164 modules.
- 261 focused checks: `artifacts/report-startup-controls-0.27.14.tap`.
  New coverage includes source/report channels, model mutations with unchanged
  IDs/fingerprints, observer independence, explicit navigation, discovery
  coalescing, prompt Cancel, late success/failure, retry and malformed metadata.
  Existing history, numeric, cancellation, export and native policies pass.
- Visible report/startup workflow: `artifacts/report-startup-SYMU41/result.json`.
  Real native reports cover cross-model replies, honest pending fields, report
  ordering and fresh validation. Discovery cancellation/retry and a single
  simulated transport failure followed by real native retry pass; the injected
  transport refusal tests UI recovery, not engine catalog mathematics.
- Retry state was checked at 1200 by 760 and 1500 by 950 without horizontal
  overflow. The smaller canceled view and pending report were visually inspected.
  A misleading empty-search message found in that review was removed afterward
  and is covered by the final workflow assertion.
- Visible core development workflow: `artifacts/core-experience-keysJV/result.json`.

## Packaged verification

The actual 0.27.14 app passes these checks with development Python unavailable:

- Report ordering, stale-source refusal, discovery Cancel/failure/retry and exact
  saved-project preservation during metadata reload:
  `artifacts/report-startup-o9QOf7/result.json`.
- Construction cancellation, certification ownership and startup Open/Recover:
  `artifacts/publication-workflow-acRr2S/result.json`.
- Catalog/linked opens, focus, pending feedback and export locks:
  `artifacts/catalog-workflow-NmvpHR/result.json`.
- Hidden-window/focus/native-dialog canary:
  `artifacts/hidden-desktop-canary-nHVdIN/result.json`.
- Inspector disclosures, single report block, constructions/history/Save/Open
  and visible one-second morph playback:
  `artifacts/core-experience-RaLh5v/result.json`.
- Geometry formats/units and delayed-save/close ownership:
  `artifacts/export-workflow-knyIh1/result.json`.
- Face/cell nets, history, SVG/PDF and exact-frame animation:
  `artifacts/net-workflow-qmQTWh/result.json`.
- Sections, promotion and animation ownership:
  `artifacts/section-workflow-gdCb0Q/result.json`.
- Morph controls, replay, capture and saved poses:
  `artifacts/morph-workflow-Rrts5K/result.json`.
- Legacy linked-library persistence/authorization (11 checks):
  `artifacts/linked-compat-d9eda63ddb564565ade51c0e997c55c2/linked-packaged-smoke.json`.

The final packaged retry screenshot at 1200 by 760 was visually inspected; the
misleading empty-filter message is absent. The injected catalog transport failure
is explicitly a recovery fixture; subsequent catalog data and geometry are real.
All 1,667 native engine files match 0.27.13:
`artifacts/engine-unchanged-0.27.14.json`.

The actual self-extracting portable passes with development Python unavailable:
`artifacts/portable-launch-j3RiBx/result.json`. All 1,716 extracted resource files
match the tested app and bundled cube/dual/intermediate-morph operations pass.
Package/current verification matches 1,874 frozen runtime/build inputs:
`release/preview-0.27.14/verification.json`. Corresponding source is archived and
verified against those inputs and every current archive file. No complete
regression or general performance improvement is claimed.

## Local package

Portable: `release/preview-0.27.14/Polytope Laboratory 0.27.14 preview.exe`,
143,236,921 bytes, SHA256
`dc0ea4bea597cbcad8b219a4fed56a6e82b071f36968e4070f3f4eaab00bfb2a`.
Matching source: `release/Polytope Laboratory 0.27.14 source.zip`.
Source-pair receipt: `artifacts/source-pair-0.27.14.json`.
Earlier qualified pairs and unqualified intermediate binaries remain preserved.

## Next core work

Audit empty-workspace control availability after Cancel or canceled Open, plus
remaining read-only measurement/regular-identity feedback after source changes.
Reproduce before changing behavior. Saved-tour actor sections still recreate
materials; fresh-user observation and broader core UX/performance work remain.
