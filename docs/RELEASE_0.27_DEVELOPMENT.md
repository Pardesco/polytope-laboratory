# 0.27 development: improve the core experience

This is a local development preview. The public GitHub download remains 0.26.0.
Feature expansion is paused; the staged Waterman, vertex-figure and orbit-color
features remain deferred.

## Interface changes

- Construct now starts with dual and truncation. Scale, reflection and extrusion
  are grouped together. Model generators and advanced constructions are opened
  when needed; stellation no longer occupies the top of the tab by default.
- Analysis shows common model information first. Extra measures, selection
  records and entity-orientation controls have their own disclosures.
- Advanced replaces the Evidence tab label. Structural-check results have a
  short explanation; the full calculation method, source and JSON report are
  available in a collapsed details section. Revalidation replaces the existing
  report instead of appending another block of JSON. Other warnings remain visible.
- Switching Inspector tabs returns to the top and exposes the selected state to
  assistive technology. The bundled guide follows the new organization.

## Engine latency

The desktop previously launched and imported Python, NumPy and SciPy for every
job. It now reuses up to three workers for catalog/generation, expressions,
analysis/validation, duals and dual-morph preparation/evaluation. Workers expire
after one minute idle. File operations and other operations remain isolated.
Cancellation, timeout or invalid protocol output retires the affected worker.
Response IDs are checked before publication. The existing bounded desktop queue
and per-job resource limits remain in place.

The six-request desktop IPC benchmark uses the cuboctahedron dual and a 3D
truncated-tetrahedron sizing morph at ratios 0, 0.2, 0.4, 0.6, 0.8 and 1. The
comparison keeps the morph's explicit reciprocal radius at 1, preserving identical
geometry before and after the process-lifetime change.

| Run | Repeated dual requests | Repeated morph evaluations |
| --- | --- | --- |
| Original development process model | 312-323 ms | 304-335 ms |
| Warm development workers, initial quiet run | 5.0-5.3 ms | 4.0-5.2 ms |
| Packaged workers during packaging activity | 12.4-14.6 ms | 8.9-13.8 ms |
| Final packaged workflow check | 12.0-12.7 ms | 9.0-10.9 ms |

These are local end-to-end IPC observations, including serialization and native
evaluation. They are not renderer FPS measurements or universal speed promises.
The first engine request still pays initialization costs. The hidden-window
playback check advances and reconstructs the saved pose, but its roughly
one-second scheduling cadence does not establish visible-window FPS.

Baseline: `artifacts/core-experience-pkAwqK/result.json`.
Initial warm comparison: `artifacts/core-experience-LBJ5A5/result.json`.
Packaged check: `artifacts/core-experience-pmCUrV/result.json`.
Final packaged workflow check: `artifacts/core-experience-jMmYwk/result.json`.

## Dual-morph size defaults

A new morph can leave reciprocal radius empty to match the source and dual
bounding radii around the chosen center. The radius is derived from the native
dual geometry, then the native plan is rebuilt with that numeric value. An
explicit radius remains available. Saved projects retain the resolved radius,
so reopening reproduces the same geometry without selecting a new default.

For the supplied truncated tetrahedron, radius 1 produced source and dual bounds
of approximately 0.552771 and 3.464102. Automatic radius 0.3994636211547385 gives
both endpoints a bound of 0.5527707983925668. This changes the default reciprocal
scale; it does not renormalize every animation frame or alter the original model.
Existing projects keep their saved radius.

## Validation and local package

The build passes with 154 modules. Focused worker, morph-session, native Viewer,
animation-guard, hidden-runtime and project-storage checks pass: 54 Node tests.
Native dual-morph integration passes 11 tests and 22 subtests. The packaged
desktop check runs with development Python unavailable and exercises the
Inspector, two window sizes, actual morph playback, and native Save/Open.
The final packaged check also operates the dual, truncation and scale buttons
and verifies that Undo restores the source after each operation. It reports no
renderer errors.
The protected importer and geometry-file hashes match the previous checkpoint.

The reviewed local portable is
`release/preview-0.27.0-reviewed/Polytope Laboratory 0.27.0 preview.exe`.
Its bundled guide and tab-switching behavior include the final review changes.
The executable is 143,224,660 bytes. Its SHA-256 is
`79249c1296e2caa954789f7b8013575e7fcd291e8a7fc0e346b1388918251837`.
`release/preview-0.27.0-reviewed/verification.json` records the hash and confirms
that the packaged desktop entrypoints and all four built UI files match the
reviewed local files byte for byte.
The earlier `release/preview-0.27.0` package is retained as an intermediate build.
No full regression, complete mathematical coverage or public 0.27 release is
claimed. Continue measuring visible rendering and testing the complete paths
through the remaining common workflows.
