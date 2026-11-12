# Scoped rational workflow

This workflow certifies named properties relative to supplied rational literals.
Display coordinates and all ordinary measurements remain binary64 approximations.
It does not provide a universal exact geometry kernel.

## Reproduce in the app

1. Enable Expert mode. Open **Advanced → Exact arithmetic**
   (`advanced-exact-arithmetic`). Click **Load rational box example**
   (`precision-load-example`), then **Enumerate exact supporting facets**
   (`rational-hull`). The coordinates are in `rational-points`.
2. The result has 8 vertices, 12 edges and 6 faces. Its box is
   `[-1/2,1/2] × [-1/3,1/3] × [-1/4,1/4]`. The 11 supplied points include an
   interior point, a nonextreme face point and a duplicate corner. The certificate
   records all 165 candidate triples and the six complete facet supports.
3. Click **Construct exact rational dual** (`rational-dual`). The default center
   is the mean of the extreme vertices (here zero); radius is one. Expect the
   six vertices `(±2,0,0)`, `(0,±3,0)`, `(0,0,±4)` and eight triangular faces.
4. Open **Construct → Rational section** (`construct-card-exact-section-settings`,
   pane `exact-section-settings`). Set `exact-section-normal` to `0,0,1`,
   `exact-section-offset` to `1/3`, and winding `exact-section-fill` to Nonzero.
   Click **Compute section** (`preview-exact-section`), then **Adopt surface
   section** (`adopt-exact-section`). Expect four segments joining
   `(±11/6,0,1/3)` to `(0,±11/4,1/3)`. This is a source-surface intersection,
   without an inferred filled interior.
5. Save a `.polyproj`, reopen, and inspect the retained states with Undo/Redo.
   The existing history Replay action recomputes the dual and section. The
   initial rational hull is a retained source snapshot whose certificate is
   independently rebuilt during project validation.
6. In **Advanced → Checks, calculation method and source** (`validation-details`),
   read **Property guarantees** (`precision-property-report`). This report is
   readable with Expert mode off. **Check model again** (`validate`) refreshes it.
   The section badge reads `RATIONAL CONSTRUCTION`; measurements remain approximate.

Native recipe parameters additionally support an explicitly supplied rational
dual center and positive rational radius. The existing UI dual action uses the
defaults; no new center/radius form is introduced here.

## What each guarantee means

| Evidence | Certified property | Exclusions |
| --- | --- | --- |
| `certificate` on a rational hull or dual output | Complete convex facet support set relative to recorded `sourceCoordinates`; exhaustive Fraction predicates and extreme-point agreement with the display candidate | Intended radicals, exact measures, arbitrary generalized geometry |
| Dual operation record | Fraction formula `c + r² a / (-(a·c+b))` applied to revalidated source support planes; strictly interior center | Output hull certificate alone does not establish a primal/dual relationship; the history source, parameters and replay establish that construction |
| `metadata.exactSurfaceSection` | Rational source-face intersection points, segments and coplanar ordered winding faces; exact equality and winding decisions | Filled-solid sections, generalized volume, approximate coordinate intentions, display tessellation |
| `validation.precision` from native Analyze/Validate | Independently revalidated property status, input interpretation, arithmetic/version/tolerance, residuals and unresolved scope | It never upgrades structural numerical checks or measurements to exact |

Exact equality residuals are zero. `maxDisplayCoordinateRoundingError` is the
maximum absolute difference between each rational coordinate and its binary64
adapter, reported as a rational number in source coordinate units.
`maxDisplayPlaneEquationResidual` is `max |n·displayPoint-b|` for the unnormalized
declared section equation. These are exact discrepancies of the float adapter,
not exact length/area/volume measurements. The example plane discrepancy is
`1/54043195528445952`; it is deliberately nonzero.

Ordinary affine transforms (including scale 1, integer scales, translations and
reflections) remove the active rational tables/certificate, exact surface-section
receipt and inherited exact-predicate/construction labels. Literal source
reflection also removes them. A `numeric.guaranteeLoss` explanation remains;
earlier source states retain their evidence. View rotations only change display
state. A fresh rational certification is an explicit new operation.

## Persistence and compatibility

Project validation recomputes hull certificate assertions and normalized exact
support planes, and reconstructs exact sections from their recorded source,
equation and winding rule. Edited claims, reference tables, rational coordinates,
canonical source hashes, or measurement/display exactness flags are refused.
The report marks failed exact evidence **unresolved**, even when structural float
checks pass. Reports are recomputed; saved badges are not authoritative.

New section source hashes normalize JSON integer/float spellings (`1.0`/`1`,
signed zero). Existing section receipts without `sourceHashPolicy` remain
readable: their complete literal construction and assertions are recomputed,
while the old spelling-dependent SHA is historical, without hash authority.
Algorithm geometry/version `0.1.0` is retained. `rational-dual` version `0.1.0`
is now registered for replay; numeric history policy remains the existing
float64 document policy, with exact property authority in model certificates.
No project/history migration or policy changes are introduced.

Merge coordination with R5-HISTORY: retain the one-line `rational-dual` replay
registration in `engine/history.py` and the existing invalid-source refusal test
in `tests/test_history.py` (its old unavailable-operation expectation is replaced
by certified-source validation). The only `formats.py` hook delegates existing
per-state exact checks to `precision_report.validate_exact_evidence`; history
graph/version/migration ownership otherwise stays with R5-HISTORY.

## Supported limits and remaining work

- Hulls: 3–32 supplied points, intrinsic 2D/3D/4D, rectangular rational arrays;
  literals at most 256 characters, exponent magnitude 1,024 and 4,096 input bits. Full-dimensional finite
  input and a usable numerical display candidate are required. Exact extreme
  vertices are checked independently using the rank of incident exact supports.
- The float candidate can fail on a mathematically valid thin rational input.
  That path reports **unresolved**, returns no certificate, and has no fallback.
- Sections: intrinsic XYZ3D convex/generalized face sources only; at most
  256 vertices/faces, 1,024 edges, 64 vertices per face, 8,192 incidences,
  4,096 output points, 8,192 output edges, 8 MiB source snapshots and bounded
  8,192-bit section arithmetic. Exactly nonplanar faces and coincident ambiguous
  boundary hits are refused. No tolerance weld is silently substituted.
- Near-planar float models may pass numerical tolerance checks while exact
  equality remains **unresolved**. No certified error interval is implied.
- Separate future work: general filtered predicates with interval bounds,
  high-precision fallback, algebraic values, exact measurements, broader exact
  constructions, and independent specialist qualification. This report covers
  hull/section receipts; other modules' named source proofs retain their own scope.

## Verification

`tests/fixtures/rational_exact_chain.json` contains hand-specified box supports,
polar vertices and section points/edges. `tests/test_exactness_chain.py` checks
them through native dispatch, save/reload (including JavaScript number spellings),
undo cursor persistence, replay, deliberately lost guarantees, rounding residuals,
edited certificates and near-degenerate refusals. `tests/precision-chain.test.mjs`
uses real native reports in the mounted inspector and preserves existing IDs.

```powershell
python -m pytest tests/test_exactness_chain.py tests/test_rational.py tests/test_exact_surface_sections.py tests/test_precision_exports.py tests/test_project_geometry_reuse.py tests/test_analysis_cache.py tests/test_history.py tests/test_recipes.py tests/test_measurements.py tests/test_input_robustness.py tests/test_uniform_snub_variants.py -q -p no:cacheprovider
node --test --test-concurrency 1 tests/precision-chain.test.mjs tests/precision-wording.test.mjs tests/exact-section-controls.test.mjs tests/workspace-numeric-controls.test.mjs tests/history-workflow.test.mjs tests/project-workflow.test.mjs tests/engine-op-allowlist.test.cjs tests/geometry-export.test.cjs tests/engine-pool.test.cjs
npx.cmd vite build --configLoader native
```

The new Node file is included in `test:features`. Electron is not launched in
the worker sandbox; packaged desktop click-through remains a lead check.

Worker result: **194 Python tests passed** (28 new exact-chain cases),
**143 Node tests passed** (2 new cases), and Vite production build passed.
The final precision-report refinements also passed the 48-case exact-chain /
analysis-cache selection. Existing Vite chunk-size/dynamic-import and Node
module-type warnings remain.
