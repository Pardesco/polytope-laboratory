# Independent winding cell sections (R6-SECTIONS / SEC-05)

The Section mode choice **Winding cells — independent star-cell fill** fills
each explicitly supplied closed orientable source 3-cell separately. This adds
the previously refused star-cell domain to the ordinary-cell and global-density
choices. It does not infer a global 4D interior, weld intersecting cells, replace
star cycles with hulls, or compute a Boolean union of the resulting sheets.

Chosen R5 scenarios: `sec-05-unknown-interior` (its global-interior refusal remains
required) and `sec-05-filled-density` (extended here to independent 4D cell
sheets). `sec-05-surface-winding` remains the explicit surface fallback.
Local qualification cases are `r6-sec05-pentagram-prism-independent` and
`r6-sec05-small-stellated-prism-cells`; these are new evidence tranches, not a
claim that the frozen competitor scenarios or all of SEC-05 are complete.

## UI and a reproducible example

Use the common section toolbar's `#section-density-mode` selector; no Expert
mode is needed. Its new option value is `winding-cells`. The plane controls are
`#section-normal`, `#section-depth`, and `#apply-section`. Analysis → **Filled
section settings** (`#density-section-settings`, collapsed by default) contains
`#section-density-rule`, `#section-density-threshold`, and
`#apply-density-section`. Threshold expressions use NumericEntry. Interpretation
and per-cell density diagnostics appear at `#section-density-interpretation`
and `#section-density-legend`. **Promote** (`#promote`) uses the existing native
history workflow, preserving notes/units, Undo/Redo, project reopen and replay.

For a small example, generate polygon `5/2`, use **Prism from current polygon**
(`make-polygon-prism`) with height 2, then **4D prism from current model**
(`make-polyhedron-prism`) with height 2. Select Section, normal `0,0,1,0`, depth
`0.137`, and Winding cells. Nonzero fills the central pentagon and five tips;
even/odd excludes the density-two pentagon, leaving five disconnected tips;
threshold 2 keeps that pentagon. Each source cell remains a distinct sheet.
The same adapter qualifies side cells of a small stellated dodecahedral prism.

## Definition and provenance

`section` accepts `section_domain: "density"` and
`cell_orientation: "independent"`; the default `"coherent"` preserves the
existing global algorithm. No new IPC operation or worker is necessary. Saved
source views retain `densitySection.cellOrientation: "independent"`, so existing
preview, cancellation, export ownership and saved-tour parameter fences apply.

Every source cell must have affine rank three, planar faces, exactly two faces
at every local edge, one connected orientable boundary chain, and nonzero
resolved algebraic 3-volume. Its coherent face signs are chosen independently
to make that volume positive. The existing bounded supporting-line arrangement
and solid-angle integer winding classifier slice this cell in an intrinsic
frame. Rules select `w != 0`, odd `w`, or signed `w >= k`; orientation is not
borrowed from neighboring cells. An open global 4D chain can therefore qualify
locally without acquiring any global solid meaning.

Each output vertex and face records its source cell. Intrinsic cell coordinates
in **source length units**, the source cell's world origin/basis, original
face/vertex IDs, coherent face signs and algebraic volume permit independent
reconstruction. `metadata.independentCellSection` contains these receipts;
`metadata.elementSourceMaps` covers every output entity. Output patches carry
per-face integer density colors and actual selected boundary loops. Distinct
cells retain distinct vertex/edge IDs even where their coordinates coincide.
Area totals count overlapping sheets separately. Source cell algebraic volume
integrates winding with multiplicity; it is not a filled union volume. The
assembled output intentionally has no global volume claim.

All calculations are approximate float64. Diagnostics report arrangement area
conservation and winding integer residuals, not exact certificates. The source
model is unchanged; the adapter does not call a convex hull.

## Bounded contacts and limits

Isolated supporting vertex/edge contacts are retained as zero-area degenerate
sheets with literal vertex identities. Winding at these contacts is undefined;
they do not assert selected filled area for any rule. R8 adds transverse vertex/edge
events without coplanar source faces; see [contact qualification](R8_STAR_CELL_CONTACTS.md).
A supporting coplanar face or coplanar whole cell still refuses explicitly;
move depth or choose Surface / convex. No offset perturbation or limiting fill
is implicit. Open/nonorientable local shells, disconnected shells within one
cell, zero/unresolved algebraic volume, unowned vertices/faces/edges and unresolved ranks
remain unsupported. These refusals never fall back to a hull or surface result.

Bounds: 2,000 source vertices, 512 source faces, 64 cells, 16,000 total face/cell
incidences, 30,000 output vertices, 8,192 aggregate arrangement regions and
5,000,000 aggregate classification triangle visits. Existing per-cell density
limits also apply (64 lines, 4,096 regions, bounded split/conformity work).
Exceeding any bound refuses the complete result. This does not qualify all
regular/uniform 4D stars or remove global-interior restrictions.

## Verification

`tests/test_independent_cell_sections.py` uses literal product incidence and
analytic regular pentagram identities. With golden ratio phi and unit outer
radius, the center radius is `phi^-2`, center area is
`5/2 * phi^-4 * sin(72 degrees)`, and the signed pentagram area is
`5/2 * sin(144 degrees)`. The difference supplies independent density-one/two
areas; original chord subdivisions supply boundary perimeters. Three depths,
all three rules, closed patch boundaries, disconnected components, and source
algebraic volumes of height-two prisms are checked. Independent metric areas
of emitted patches are integrated across the constant-section prism to check
selected per-cell filled volumes. Small stellated dodecahedral
prism cells are verified even after removing a global cap: global density
correctly refuses that chain while independent cells pass. Other tests cover
coordinate reconstruction, scale/reflection, tangencies, refusal bounds, source
immutability, JSON-lines worker recovery, promotion, Undo/Redo, save/reopen/replay.

`tests/independent-cell-section-controls.test.mjs` exercises the production
Viewer, source ownership and cancellation, NumericEntry policy persistence,
unchanged saved-tour routing/fences, and an Expert-off mounted Vite app using
real Python workers in headless Chromium. The mounted scenario promotes,
undoes/redoes, saves and reopens the same native geometry. Electron is not
launched. Competitor comparison and packaged-desktop qualification remain lead
follow-ups.

Run:

```powershell
python -B -m pytest tests/test_independent_cell_sections.py tests/test_filled_sections.py tests/test_generalized_sections.py tests/test_ordinary_cell_sections.py tests/test_section_choices.py tests/test_section_worker_protocol.py -q -p no:cacheprovider
node --test --test-concurrency 1 tests/independent-cell-section-controls.test.mjs tests/density-section-controls.test.mjs tests/ordinary-cell-section-controls.test.mjs tests/section-choices-mounted.test.mjs tests/derived-view-controls.test.mjs tests/section-viewer.test.mjs tests/engine-op-allowlist.test.cjs tests/engine-pool.test.cjs
npx.cmd vite build --configLoader native
```
