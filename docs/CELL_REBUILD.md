# Coplanar 4D cell reconstruction

Closes the bounded local case of **`con-10-4d-cell-rebuild` (CON-10)**:
two convex 3-cells in a common 3D hyperplane, sharing exactly one complete
literal face, can become one convex cell. This is a new explicit operation;
the existing face blender still refuses distinct cell ownership.

## UI

Construct → Modify → **Coplanar cells** card
(`#construct-card-cell-rebuild-settings`), **Coplanar cells · join a split
4D cell** disclosure (`#cell-rebuild-settings`). Available with Expert off.

Enter two literal cell IDs in `#cell-rebuild-ids`. Choose **Preview cell join**
(`#cell-rebuild-preview`), inspect `#cell-rebuild-result` and the **Element,
color and content owners** disclosure (`#cell-rebuild-owners`), then **Adopt
cell join** (`#cell-rebuild-adopt`). Advanced color choice is collapsed:
`#cell-rebuild-color` defaults to equal stored colors; first-source explicitly
chooses the lower source cell ID, independent of input order.
`#cell-rebuild-cancel` cancels preparation/adoption before publication.

Preview computes native geometry without changing the document. Adoption
recomputes through `commitOperation`/`recipe-run` and compares complete geometry,
metadata, colors, numeric policy and provenance before publication. Source
attributes, annotations, document metadata, notes, units, document/history and
inputs are fenced through awaits.
Undo/Redo, saved projects and graph replay retain the operation and its receipt.
Stale net/morph/animation presentation caches are cleared on adoption.

## Fixed input and independent expectation

`tests/fixtures/r8_cell_rebuild.json` is a literal unit tesseract boundary,
with its `w=0` cubical cell divided along `x=y` into two triangular prisms.
The two incident `xy` square faces have explicit diagonal subdivisions. It
contains 16 vertices, 34 edges, 27 faces and 9 cells. Join cells **6, 8**:

- Remove only shared face **26**; map cells 6 and 8 to cell 6.
- Keep all vertices, edges, exterior ordered face cycles and face colors.
- Produce **16/34/26/8** vertices/edges/faces/cells. Other cells keep their
  boundary references except for the explicit face-index map.
- Each prism has analytic intrinsic volume **1/2**; the joined cube has
  volume **1**. These are 3D cell contents in source coordinate units cubed.
- Subsequent existing coplanar face blends of the two diagonal pairs recover
  the literal original tesseract's **16/32/24/8** incidence. This is independently
  compared against the fixture's unsplit face and cell sets, not another hull.

`metadata.cellRebuild` records forward maps for all four element ranks,
output-to-source face/cell owners, cell color owners, removed IDs, source and
joined contents, planarity/support/content residuals and numeric tolerance.
Faces keep their literal stored RGB/RGBA, including alpha. Equal-color means
equal stored records, not perceptual or byte/unit equivalence.

Unchanged, uniquely corresponding vertices, edges, faces and cells retain
text/texture annotations through the existing content ownership policy. Both
joined cells change identity: their annotations and the deleted seam's annotations
are retained as source-bound detached content, with source notes/units. They are
not silently assigned to a new cell or discarded. Undo restores them.

## Definitions and limits

Native operations: `rebuild-coplanar-cells` and read-only
`rebuild-coplanar-cells-preview` (warm-worker eligible). Parameters are
`cell_ids: [a,b]` and optional `color_policy: require-equal | first-source`.

Requires a validated, closed, orientable, intrinsic 4D ordinary cell boundary,
at most 256 vertices, 128 faces and 32 cells, plus existing ordinary-cell shell
bounds. Selected cells must be convex, coplanar, and share one literal complete
face with no third owner. A supporting-halfspace check, closed shell checks,
and independently computed convex-hull content check qualify the supplied
exterior cycles. The hull is used only as a volume check; it never supplies
replacement faces or coordinates. Output shell links are independently rechecked.

Float64 approximate predicates use relative tolerance `1e-8`; this is not an
exact Boolean or algebraic certificate. The unit fixture's measured content
residual is about `2.22e-16`, and its hyperplane residual is zero. Rotated/scaled
fixtures verify intrinsic content and cubic scaling.

Refuses noncoplanar joins, nonconvex unions, nonconvex selected cells, incomplete
or malformed boundaries, unshared/coordinate-only seams, unsupported options,
color conflicts under the default policy, and resource excess. No welding,
averaging, coordinate snapping, global 4D filled-volume claim, exterior face
auto-blending, arbitrary multi-cell reconstruction, holes, or star-cell union.
Unrelated source metadata is not copied onto changed geometry; retained history
still owns the complete source. General baseline semantics and Stella 6.0
comparison remain unverified; this does not close every CON-10 domain.

## Verification

- `python -B -m pytest tests/test_cell_rebuild.py -q -p no:cacheprovider`
  covers the literal incidence/color/content oracle, cross-cell face blending,
  refusals, rigid/scaled embeddings, detached content, JSON-lines dispatch,
  Undo/Redo snapshots, save/reopen and native graph replay.
- `node --test tests/cell-rebuild-controls.test.mjs tests/cell-rebuild-mounted.test.mjs`
  covers UI ownership/cancellation, stale publication and tampered-result
  refusal, plus actual mounted Expert-off native preview/adopt/Undo/Redo/
  save/reopen/replay in Chromium/SwiftShader. It does not launch Electron.
- New Node suites are registered in `test:features`. Regressions include face
  blending, element content, history, allowlist/pool, gallery and renderer contracts.
- `npx.cmd vite build --configLoader native` verifies renderer bundling.

Session results: **24 feature Python tests passed**; the focused Python
regression run passed **126 tests plus 22 subtests**. Node regression passed
**136 tests**; the final feature-only recheck passed **10 tests**. The final
Vite build passed (377 modules; existing mixed-import/chunk-size warnings).
`git diff --check` passed. No Electron or competitor run was performed.

For lead click-through, open `tests/fixtures/r8_cell_rebuild.polytope`, then
join cells **6, 8** using the controls above. The ready-open project is checked
against the pinned JSON oracle. No catalog claim or release/platform receipt
is inferred from this local test input.
