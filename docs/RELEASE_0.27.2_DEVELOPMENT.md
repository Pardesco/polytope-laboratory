# 0.27.2: review geometry exports before saving

Local development preview, October 21, 2026. This continues the core-experience
work; staged feature additions remain deferred.

## Changes a person can observe

The export dialog follows the task: choose **Model** or **Derived result**, a
file format and output units, review what will be retained or omitted, then
choose the file. Preparation runs before file selection. The export button
stays disabled until the selected geometry and options have a prepared result.
Changing an option supersedes its older preparation.

- Intrinsic 4D models offer OFF/4OFF and JSON. Other formats explain that a 3D
  section or cell is needed. A previously selected incompatible format changes
  to an available format with a visible explanation.
- STL and POV-Ray remain limited to convex 3D boundaries. Their preview explains
  triangulation and loss of the original polygon boundaries. DXF explains that
  it exports edges. Source-color, project-metadata and notes losses are shown
  before the file dialog.
- Physical conversion requires declared source units. The dialog explains where
  to declare them and disables incompatible unit choices. Physical VRML output
  uses meters and suggests a `.wrl` filename.
- OFF is refused for loose edges outside face boundaries or coordinates whose
  embedding dimension does not match its header. The previous serializer could
  emit an unreadable edge-count header or incompatible coordinate rows for
  those inputs. JSON retains such geometry; eligible DXF retains loose edges.
  OBJ/VRML warn when loose edges would be omitted.
- Net SVG/PDF buttons are disabled when no face net is available.
- Closing the export dialog cancels its pending result. Reopening starts a new
  review. A selected existing destination is preserved when the source, units,
  metadata or export options change while the native save dialog is pending.
  A second submission cannot start a competing write.

Geometry exports still use intrinsic source coordinates. Display rotation,
camera zoom and the current display-only morph do not change those coordinates.
Use PNG to capture the displayed pose, and a native project to retain views,
annotations and construction history.

## Implementation and limits

Native `export-options` describes the existing exporters' supported domains;
`prepare-export` validates and optionally serializes the detached output. The
ordinary native export route also enforces the format restrictions. The reserved
importer/geometry files were not edited.

The renderer binds preparation and publication to the project, document, history
state, literal source attributes, selected derived geometry, source units,
notes, metadata, format and target units. Observer motion remains independent.
It rechecks this binding after native preparation and after destination selection.

Geometry uses a one-shot, user-selected destination ticket and the existing
bounded atomic writer. Complete UTF-8 data is fsynced to an owned sibling file
before rename. The original native writer already used atomic replacement;
this change adds the renderer's source recheck after file selection. Geometry
has a 128 MiB output bound; existing supporting-data/PDF exports keep their
32 MiB bound and original accepted formats. Existing IPC resource bounds also
apply. The source remains available after cancellation or failure.

Export availability is not a structural certificate. Preparation still validates
the supplied geometry; selected formats retain their existing mathematical
domains and numeric limits. No display projection is silently substituted for
4D geometry. Large exports still incur serialization and snapshot costs.

## Verification

- The 155-module production UI build passes.
- 35 native tests pass: export domains, JSON/OFF round trips, units, metadata,
  source preservation and early refusal without touching an existing file.
- 92 focused Node tests pass: source-bound export lifecycle, one-shot geometry
  tickets, failed writes, cancellation, Unicode, separate byte/format limits,
  pooled engine workers, hidden-window policy, project loading and storage.
  The final report is `artifacts/export-focused-0.27.2.tap`.
- Actual development workflow:
  `artifacts/export-workflow-IcJ05t/result.json`.
- Packaged export workflow with development Python unavailable:
  `artifacts/export-workflow-bUvh4C/result.json`.
- Packaged morph/PNG/native Save/Open regression workflow:
  `artifacts/morph-workflow-9bMGWn/result.json`.

The actual export check reads OBJ, DXF, STL, VRML and JSON output, independently
checks expected coordinates/counts/units, verifies loss notices and disabled
choices, and exports a 3D section from a 4D source. Held save dialogs verify
cancellation and changed source units without replacing a selected prior file.

The expanded check initially found 14 old hidden-window harness failures because
the mock did not recognize the pooled engine import. The harness now exercises
the real worker protocol and both export managers, preserving all activation,
dialog and trusted-frame assertions. Initial evidence remains in
`artifacts/export-focused-0.27.2-before-harness-update.tap`.

Runtime/build inputs were frozen before packaging in
`artifacts/preview-build-source-0.27.2.json` (1,864 files). The actual portable
launch passes with development Python unavailable, and its archive plus all
bundled engine resources match the tested unpacked app (1,716 files):
`artifacts/portable-launch-pHhOGy/result.json`.

The local portable is `release/preview-0.27.2/Polytope Laboratory 0.27.2 preview.exe`
(143,231,638 bytes), SHA-256:
`1aab0a24eb97ea3359884e6ee209c8182af0dc2680502f94e0c3d475da38abf4`.
`release/preview-0.27.2/verification.json` verifies current desktop/UI bytes,
frozen runtime inputs, protected importer hashes and version-matched receipts.
Use `node scripts/verify-local-preview.cjs <receipt paths>` to verify a new
version before preserving its first receipt; existing receipts are never replaced.

Matching source is `release/Polytope Laboratory 0.27.2 source.zip`. The complete
archive and frozen runtime inputs are checked by `scripts/verify-preview-source-pair.py`;
the result is retained in `artifacts/source-pair-0.27.2.json`. Previous releases
are preserved. No full regression, public publication or feature-parity
completion is claimed.
