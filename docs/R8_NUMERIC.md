# Bounded rational support fallback

Closes local scenario **`con-03-rational-raised-corner`**, a new narrow subcase
of existing **`con-03-rational-hull`** (CON-03, spec §12). Regression scenario
**`con-03-rational-adapter-blockers`** retains explicit representation refusals.
This does not close general hull/core exactness or competitor qualification.
Round 7 generation, classification and exact-section work is reused unchanged.

## Click through

Enable Expert mode, then open **Advanced → Exact arithmetic**
(`advanced-exact-arithmetic`). Click **Load rational raised-corner cube**
(`precision-load-filter-example`), then **Enumerate exact supporting facets**
(`rational-hull`). The existing `rational-points` expression editor and
NumericEntry/native expression batch path are retained. The hull opens as a
new document, following the existing rational-hull source-snapshot convention.

Expect **8 vertices, 13 edges, 7 faces**. The cube corners are ±1, except
`(1,1,1)` becomes `(1,1,1000000001/1000000000)`. The default floating candidate
merges its two almost coplanar top triangles, producing six facets; the prior
rational operation refused its incidence mismatch.

**Check model again** (`validate`) and expand **Checks, calculation method and
source** (`validation-details`). **Property guarantees**
(`precision-property-report`) shows the revalidated scope, bounded fallback and
rounding residuals, also with Expert mode off. Existing IDs and handlers remain.

## Definitions and proof boundary

The fixture's seven explicit halfspaces are five axis supports and
`z ≤ 1 + (x+1)/2000000000`, `z ≤ 1 + (y+1)/2000000000`.
Independent test elimination intersects all 35 support triples, keeps feasible
points, and obtains exactly the eight supplied corners. The literal oracle
records every support, its incident vertices and all 13 edges. The top triangles
meet on edge 1–7. Integrating their height over the square gives volume
`8 + 4/(3*1000000000)`; the app's volume is still a binary64 measurement.

When a floating candidate fails or disagrees with exact supports, the fallback
is restricted to **at most 12 supplied intrinsic XYZ3D points**. It exhausts all
rational support triples, identifies extreme vertices by incident-normal rank,
and constructs polygon cycles from exact facet intersections. Independently,
it converts each display double to its exact binary rational value and exhausts
its supports again. Complete source support incidence and extreme identities
must agree. No jitter, snapping, coordinate replacement or tolerance changes
are used. All existing rank, face, manifold, Euler and support checks must pass.

For the example both searches test 56 triples and obtain seven facets. The
certificate's `displayAdapter` records the bounded algorithm and agreement.
Revalidation reconstructs the entire certificate, exact support table and model
identity. Saved evidence cannot authorize a changed support table or adapter.
The measurement hook applies only to this marked, fully revalidated path; it
recomputes numerical boundary area and oriented tetrahedral volume from source
incidence, ignoring cached measures. General convex validation is unchanged.

The displayed maximum coordinate rounding error is
`45487/549755813888000000000`. The maximum incident support equation residual
is `45487/549755814162877906944`, using the stored unnormalized rational support
equations. Both discrepancies are computed exactly from binary64 values; neither
is a claim of exact measurement. Rational predicate equality residuals are zero.

## Persistence, limits and tests

Project reopen recomputes evidence and measures. Existing source snapshot and
exact surface-section history/replay paths retain the certificate. Tests save
and reopen all Undo/Redo cursor positions, replay a rational `z=1/3` surface
section and ordinary transforms, and retain units/notes. Ordinary transforms of
the derived section explicitly lose exact guarantees. A direct ordinary
transform of the seven-face source, including scale 1, currently refuses: its
floating candidate merges facets and cannot preserve source incidence. This
now reports a clear domain error instead of a missing facet lookup exception,
retaining the certified source unchanged. A broader transform/display
representation is a follow-up.

Rank loss at the unchanged display tolerance, distinct rational vertices rounded
to one double, changed support signs/equalities, tiny unresolvable face rank,
more than 12 fallback points and non-XYZ fallback dimensions still refuse with
a representation/domain reason and no certificate. Existing normal rational
hulls retain their 32-point 2D/3D/4D domain. Arbitrary floating hulls, exact
measurements, algebraic/interval arithmetic and general convex cores remain
outside this addition. The initial hull is a validated source snapshot, not a
new replay operation; subsequent operations use the established history path.

Fixtures: `tests/fixtures/rational_raised_corner.json`,
`tests/test_rational_filter.py`, `tests/rational-filter.test.mjs` (registered in
`test:features`). The mounted test drives the new example through the existing
NumericEntry hull action and real JSON-lines engine, then inspects native
precision evidence with Expert mode off. No Electron launch is required.

Verification: new native suite **19 passed**; focused Node selection **146
passed**; Vite production build and whitespace checks passed. The broader final
Python selection had **210 passed, 3 failed**: existing seeded import-fuzz child
processes exceeded their unchanged nine-second wall-clock budget (OFF/DXF/JSON).
An isolated repeat with single BLAS/OMP threads also exceeded that budget for
three formats (OFF/4OFF/DXF); JSON and project cases passed. The earlier broader
selection, before adding the two direct-transform refusal tests, passed all
211 cases. No fuzz thresholds or validation assertions were changed. Desktop
Electron execution and a fresh uncongested fuzz run remain lead checks.
