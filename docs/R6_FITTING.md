# Disjoint convex component fitting (R6-FITTING)

This tranche extends condition fitting, CON-09, to intrinsic XYZ 3D
`generalized-complex` sources consisting of **2–8 strictly disjoint convex
boundary components**, with at most 64 vertices total. It preserves literal
vertex/edge/ordered-face IDs and the interpretation. Each component's vertex
centroid stays fixed. There is no hull replacement or solid-union classification.
Spring relaxation (CON-14) and its PCG64 initialization remain unchanged.

Chosen R5 scenarios: `con-09-generalized-domain` (bounded source extension),
`con-09-selected-combined` (selected-face oracle and incompatible combined
objectives), and `con-09-invalid-adoption` (residual success cannot override
invalid geometry). This is a synthetic, independently defined source tranche,
not a claim of complete generalized fitting or executed Stella equivalence.

## Click-through

Open `examples/fitting-separated-tetrahedra.off`. In Inspector **Construct →
Make it regular → Fit faces**, click **Make faces regular**
(`make-faces-regular`) for the common solve/adopt path. Expert mode is unnecessary.

For review, open **Fitting options** (`fitting-options`), choose **Regular faces**
(`fitting-mode`), then **Solve preview** (`preview-fitting`). The source-domain
note is `fitting-source-domain`. `fitting-result` shows before/after maximum/RMS
residuals, component count, separation margin and numerical scope. Click
**Adopt fitted model** (`adopt-fitting`); Undo/Redo and saved-project replay use
the existing `geometry-fit` recipe and source/history publication guards.

Open `examples/fitting-incompatible-pyramids.off`, choose **Regular faces**, and
check **Equal face areas** (`fitting-equal-areas`). This cannot satisfy both:
regular triangular and square faces share an edge length, while their areas are
respectively √3/4 and 1 times its square. The solver may stop successfully while
the residual remains nonzero. Adoption stays disabled until **Accept a valid
candidate with unresolved targets** (`accept-fitting-near-miss`) is checked.
It records `adoption: valid-near-miss`, without establishing a mathematical or
catalog near-miss classification. Both examples are self-authored primitive
coordinates, CC0-1.0; the richer JSON fixture retains face RGBA and mm units.

## Definitions and gates

Existing conditions remain: local regular polygon side/angle/chord ratios;
best-fit face planarity; global equal edge lengths; global equal bivector areas
(ordinary polygon areas on qualified output). Selected face IDs restrict the
regular-face objective; planarity and global edge/area conditions remain global.
Fix scale preserves the overall source mean edge length while retaining each
component centroid. Explicit length/area targets require Fix scale off and one
corresponding objective. No new optimizer random initialization is introduced.

Before solving, every component must pass native convex-cycle, closed-edge,
Euler/rank and complete supporting-facet checks. After solving, the same checks
run again, together with source-relative face orientation and distinct-vertex
checks. A bounded linear program finds a separating plane for every component
pair; its witness is directly remeasured against all pair vertices. Normalized
gap must exceed 1e-7 source mean edges. Touching, crossing, nested or unresolved
components are refused. Component maps, unit normal witnesses and measured gaps
are retained under `evidence.generalizedComponents`.

`conditionResidualsSatisfied` records numerical condition/planarity tolerance
independently of `geometricValidity.passed`. Invalid candidates return only an
unpublishable preview, even when residuals vanish. Valid unresolved candidates
require explicit adoption; optimizer termination alone never enables adoption.
Every result states that uniformity and near-miss classification are unestablished.
Residuals and qualification use the realized source-unit coordinates after
float64 reconstruction, including any translation/scale roundoff. Generalized
fits use a stronger planarity penalty (100); convex fits retain their penalty (10).

All predicates and solver results are approximate float64. There is no exactness,
global feasibility, optimizer reproducibility across backend versions, connected
nonconvex boundary, star-face, touching/overlapping compound, generalized 4D or
general collision-check claim. Generalized **Keep symmetry** is explicitly
unsupported. Existing convex 3D/4D numerical paths and versions remain unchanged.
The existing 400-evaluation/12,000-residual-call and face/incidence bounds remain.

## Verification

`tests/test_condition_components.py` independently checks regular tetrahedron
pair distances, centroids, scale, separating witnesses, seeded source repeatability,
selected-face scope, incompatible pyramid conditions, incidence/colors/units,
collapse/flip/intersection/nesting/touch refusal, 8/9-component bounds, OFF import,
and success/failure preview/adopt/save/reopen/replay. Failure is a retained valid
residual candidate, not a global infeasibility certificate from the optimizer.
Large-translation fixtures independently remeasure residuals on emitted coordinates.

`tests/fitting-components.test.mjs` includes a headless Chromium run of the actual
mounted app with real native JSON-lines dispatch: both named cases, Expert off,
explicit unresolved adoption, Undo/Redo, validated save/reopen and replay.
It runs via `test:features`. No Electron process is launched.

Commands: focused pytest for component/condition/geometric fitting and spring
core/workflow; Node component/fitting/report/spring, history/project and allowlist
suites; `npx.cmd vite build --configLoader native`. Desktop/competitor execution
remains for the lead; this package does not promote the parity ledger.

Results: **195 distinct Python tests** passed across focused runs (42 fitting,
153 spring); **143 Node tests** passed (3 new, including the mounted native app,
plus 140 existing). Vite built successfully with existing chunk-size/dynamic-import
warnings. Three additional tetrahedron/cube/tesseract probes compared complete
convex fitting packets with the checked-out baseline implementation and matched
exactly. `git diff --check` passed. No Electron launch or commit was made.
