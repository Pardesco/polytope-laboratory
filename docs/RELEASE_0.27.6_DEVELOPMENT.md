# 0.27.6: safer section controls and faster repeated cuts

Local development preview, October 22, 2026. Feature expansion remains paused.
Public production remains 0.26.0; prior qualified local previews are preserved.

## Changes

Derived controls now share validation and animation/tour ownership. Clearing a
cell/face/vertex index no longer silently selects zero. Blank, fractional,
negative and out-of-range IDs are refused before saved state changes, and the
field restores the last applied index. Labels identify the selected entity kind
and show the available source range. Switching entity kinds chooses an index
within the new range when that source has available entities.

Animation export disables derived mode, plane inputs, event stepping, entity
selection and promotion. Direct or queued events also refuse changes before
mutation. A delayed slider refresh is canceled when a source, project, selected
mode or export owner changes. The visible plane/mode fields synchronize after
export. The real 0.27.5 baseline left all eight tested controls enabled and let
queued events change saved plane/mode/entity state:
`artifacts/section-workflow-L72he4/result.json`.

Plane evaluation reads its normal and depth together; the hidden entity field
does not participate. The normal is normalized before interpreting depth.
Next vertex moves through intrinsic source levels and wraps to the first.
The slider moves the last evaluated plane. View rotation does not move this cut.
A slider depth, entity or mode change immediately makes the older derived result
unavailable for promotion/export. Results returning from an older plane, entity or fill rule
cannot replace the current result. Camera motion remains independent.

Section jobs now reuse the existing bounded native pool, alongside the already
pooled net/dual jobs. Pool size, job/output bounds, idle expiry, cancellation and
timeouts are unchanged. Mathematical section implementations and reserved
importer/geometry files are unchanged. The built-in guide explains the behavior;
the superseded static help copy was removed. Derived mode labels use consistent
capitalization.

## Measured repeated section latency

Five end-to-end native IPC calls per source, normal `[.2,.3,.4,1]`, depth `.1`,
nonzero fill. Hardware: Intel Core i7-14700K, 28 logical CPUs, about 63.7 GiB RAM,
Windows 10.0.26200. Before worker reuse:
`artifacts/section-workflow-E61Lel/result.json`; development after:
`artifacts/section-workflow-1jbxex/result.json`.

| Source | Before reuse, ms | Development after, ms | Packaged after, ms |
| --- | ---: | ---: | ---: |
| Tesseract: 16 vertices, 8 cells | 368.6-386.0 | 5.7-6.2 | 6.0-6.4 |
| 120-cell: 600 vertices, 120 cells | 496.0-529.2 | 111.8-114.2 | 113.6-116.1 |

Each repeated call checks literal geometry against its reference. The tesseract
cut has 10 vertices, 15 edges and 7 faces; the 120-cell cut has 102 vertices,
153 edges and 53 faces. Receipts include the pool-source hash and hardware.
These are workload measurements, not FPS or universal speedups. First process
startup still imports the engine, and large-model geometry remains costly.
The 200 ms slider debounce remains an additional deliberate scheduling delay.
Packaged measurement: `artifacts/section-workflow-jGH9ca/result.json`, with
development Python unavailable. This receipt also verifies keyboard evaluation
and controls at 1200 by 760 and 1500 by 950 pixels.

## Verification

- Production UI build: 159 modules.
- 141 focused Node tests pass: derived input validation, ownership, delayed
  updates, expression entry, native worker reuse, animation/tour export,
  ordinary-cell source content, project loading and existing net/export guards.
  Final report: `artifacts/section-focused-0.27.6-qualified.tap`.
- 26 native tests and three subtests pass for generalized sections, complete
  ordinary-cell sections, source content and persistent worker protocol.
  The worker check compares 16 mixed jobs, including empty/tangent cuts, two
  section domains and refusal followed by recovery. Fresh convex-model UUIDs
  are validated independently; every other result field is compared unchanged.
- The actual development workflow passes:
  `artifacts/section-workflow-1jbxex/result.json`. It checks invalid IDs, intrinsic
  planes, zero-normal refusal, vertex events, held animation dialogs, queued
  events, exact PNG timestamps, an oblique section-depth animation, Save/Open,
  empty sections and source-preserving 3D ordinary-cell promotion.
- The packaged workflow passes the same section checks, keyboard input and
  offline guide search: `artifacts/section-workflow-jGH9ca/result.json`.
- Packaged net reset/separation, Undo/Redo/Open, SVG/PDF and animation export
  regression: `artifacts/net-workflow-3encdK/result.json`.
- Packaged geometry export and derived 3D section regression:
  `artifacts/export-workflow-fVizIi/result.json`.
- Actual portable launch passes with development Python unavailable. All 1,716
  extracted runtime resources match the tested package; native cube/dual/morph
  results pass: `artifacts/portable-launch-1MOMrr/result.json`.
- Tests and build do not establish full feature parity or replace observation
  of fresh users attempting core tasks.

## Remaining core work

Profile remaining large-model section cost, rendering/reconstruction and
serialization before choosing another optimization. Review model loading and
core construction feedback. Broader display/selection controls still need
ownership review; this change covers the derived controls listed above. Fresh
user observation remains unperformed. Staged feature additions remain deferred.
Review uncommitted numeric drafts and promotion availability while manual plane
expressions are being evaluated; the old applied plane remains valid until the
expression publisher accepts its new values. Do not describe that interval as
an already-applied slider update.

## Local package

Portable: `release/preview-0.27.6/Polytope Laboratory 0.27.6 preview.exe`,
143,235,239 bytes, SHA256
`cb74b126e945d71f204609ab25799eb45182e3cbc10c9346ec4935d53e5b5dd6`.
Corresponding source: `release/Polytope Laboratory 0.27.6 source.zip`.
Package/current verification is `release/preview-0.27.6/verification.json`;
source archive verification is `artifacts/source-pair-0.27.6.json`.
1,868 runtime/build inputs were frozen before packaging. Earlier qualified
previews are unchanged; nothing from this continuation was published online.
