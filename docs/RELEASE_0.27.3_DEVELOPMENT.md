# 0.27.3: clearer net tasks and reliable print exports

Local development preview, October 22, 2026. Public production remains 0.26.0.
Feature expansion remains paused; earlier qualified releases are preserved.

## Changes

Face-net and whole-cell-net controls now follow the task. Generation, summary,
view and history remain easy to reach; paper/export, placement, tabs, folding,
selection and numerical checks live in named disclosure groups. Existing IDs,
keyboard operation and editing behavior remain available. Summary text reports
pieces, scale and overlaps without putting numerical diagnostics first. Paper
export repeats reported overlap warnings beside its controls.

Unavailable layout operations stay disabled until a current net exists. Root,
face, cell and vertex IDs require literal nonnegative integers in range. Invalid
input is refused before changing the source or history. Fold/shrink values also
receive domain and export-state checks.

SVG and PDF net exports now use source-bound, one-shot save tickets and atomic
publication. Source, units, layout, annotations or relevant print settings
changing during a native save dialog cancel the prepared result and preserve
the selected existing file. PDF preparation is checked again before publication.
Packed PDF includes every page; packed SVG exports the selected page. Camera
motion and folding-preview motion do not invalidate unchanged print geometry.
PDF metadata now uses the readable title `Polytope Laboratory - Net`.

Repeated face-net, net-edit, folding, paper-packing and whole-cell-net jobs reuse
the existing bounded native worker pool. Process limits, expiry, framing,
cancellation and timeouts remain enforced. No reserved importer files changed.

## Measured performance

Five repeated end-to-end native IPC calls per operation, using a cube face net
and tesseract cell net on an Intel Core i7-14700K / 28 logical CPUs / about
63.7 GiB RAM, Windows 10.0.26200. The after column is the packaged 0.27.3 app
with development Python unavailable. Values are observed milliseconds.

| Operation | Before 0.27.2 | Packaged 0.27.3 |
| --- | ---: | ---: |
| Face net | 373.1-379.3 | 3.9-4.1 |
| Face edit | 374.3-388.5 | 10.2-10.6 |
| Paper pack | 366.4-377.2 | 4.3-4.5 |
| Cell net | 369.8-377.4 | 4.2-4.3 |
| Cell edit | 379.9-387.8 | 11.7-12.1 |

These measurements cover small repeated jobs, not FPS or a universal speedup.
First worker startup still imports the engine; dense geometry can remain costly.
Baseline: `artifacts/net-workflow-j2NwrM/result.json`. Packaged after:
`artifacts/net-workflow-ImmkWp/result.json`.

## Verification and artifacts

- Production UI build passes: 158 modules.
- 62 focused Node tests pass, covering net presentation, exports, expressions,
  tabs, printing, cell editing, worker reuse and hidden-window protections:
  `artifacts/net-focused-0.27.3.tap`.
- 49 native tests pass, including repeated mixed net jobs in one persistent
  worker, ordinary and generalized nets, editing, tabs, printing and cell nets.
- Actual packaged workflow passes: generation, cuts, placement, Undo/Redo,
  fold playback, cell shrink, keyboard disclosures, two window sizes, paper
  packing, SVG/PDF, held-dialog source changes, native Save/Open and history.
  Evidence: `artifacts/net-workflow-ImmkWp/result.json`.
- Packaged geometry export regression passes, including real OBJ/DXF/STL/VRML/
  JSON and a derived section: `artifacts/export-workflow-tJuOQs/result.json`.
- Actual portable launch passes with development Python unavailable. Its
  extracted resources match the tested package:
  `artifacts/portable-launch-WZcwkE/result.json`.
- The packaged PDF was rendered and visually inspected. Independent PDF checks
  find one page, readable title and all six cube face labels. A4 dimensions are
  209.889 by 297.011 mm, within 0.3 mm of requested size due to Chromium rounding.
  Evidence: `artifacts/net-workflow-ImmkWp/paper-pages.qa.json` and
  `paper-render.png` in the same directory. The edited test net reports tab
  overlaps; this is export QA, not a collision-free fabrication certificate.

Portable: `release/preview-0.27.3/Polytope Laboratory 0.27.3 preview.exe`,
143,231,926 bytes, SHA256
`45d3b50fe2cc57947002221c8f4bcc055812afcc4dcf7f9f888c91a915724c78`.
Corresponding source: `release/Polytope Laboratory 0.27.3 source.zip`.
`release/preview-0.27.3/verification.json` checks packaged/current bytes and
1,867 frozen runtime/build inputs. Source-pair verification is recorded in
`artifacts/source-pair-0.27.3.json`. Nothing was published online.

## Remaining core work

Investigate explicit Generate/reset and Start with separate faces/cells after
history exists: the saved-layout restoration path may override the requested
new arrangement. Verify and fix without losing Undo/Redo or native Open restore.
Audit animation-export busy-state notifications and remaining direct net view/
selection handlers. Continue section-task organization and dense-model profiling.
Fresh-user observation remains unperformed; automated checks do not replace it.
